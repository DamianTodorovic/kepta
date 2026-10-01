// KEPTA Lizenz-Worker — die Automatisierung hinter dem Kauf-Knopf.
//
// Was er tut: Paddle meldet einen Kauf (Webhook), der Worker verifiziert die
// Signatur, stellt den Lizenzschlüssel im EXAKTEN v3.1-Format der App aus
// (Ed25519, Base32, 5er-Gruppen — identisch zu src/core/lizenz.ts und dem
// License Studio), speichert die Ausstellung im KV und schickt dem Kunden
// eine fertige Mail. Die App prüft den Schlüssel offline weiter — dieser
// Worker sieht nie eine Datenbank und kennt keine Kundeninhalte.
//
// Deployment (Checkliste: siehe CHECKLISTE.md im selben Ordner):
//   1. `wrangler kv namespace create LIZENZEN`        → id in wrangler.toml
//   2. Secrets: `wrangler secret put LIZENZ_PRIVATE_KEY` (Base64-DER-PKCS8,
//      derselbe Schlüssel, mit dem auch das License Studio signiert — ACHTUNG:
//      einmal verteilt, ist er die wertvollste Datei des Unternehmens)
//   3. Secrets: `wrangler secret put PADDLE_WEBHOOK_SECRET`, `RESEND_API_KEY`
//   4. `wrangler deploy`  → URL in Paddle als Webhook-Endpunkt eintragen
//
// Verifizieren, dass Schlüssel der App passen: der Worker signiert mit dem
// GLEICHEN privaten Schlüssel, dessen öffentliche Seite in lizenz.ts steht.
// Ein Testkauf erzeugt also einen Schlüssel, den die App ohne Änderung akzeptiert.

/** Der schmale Teil des KV-Namespace, den der Worker nutzt — keine Cloudflare-Typen-Abhängigkeit. */
interface KVNamespace {
  get(schluessel: string): Promise<string | null>;
  put(schluessel: string, wert: string): Promise<void>;
}

export interface Env {
  LIZENZ: KVNamespace;
  LIZENZ_PRIVATE_KEY: string; // Base64-DER-PKCS8-Ed25519
  PADDLE_WEBHOOK_SECRET: string;
  RESEND_API_KEY: string;
  /** Optional: andere Absender-Adresse, sonst lizenzen@kepta.pro */
  MAIL_FROM?: string;
}

const PREISE = "12 €/month or 120 €/year";

/** Ed25519 aus einem PKCS8-DER bauen (WebCrypto). */
async function privaterSchluessel(der: string): Promise<CryptoKey> {
  const bytes = Uint8Array.from(atob(der), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", bytes.buffer as ArrayBuffer, { name: "Ed25519" }, false, ["sign"]);
}

function base32(bytes: Uint8Array): string {
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, wert = 0, aus = "";
  for (const b of bytes) {
    wert = (wert << 8) | b; bits += 8;
    while (bits >= 5) { aus += ALPHABET[(wert >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) aus += ALPHABET[(wert << (5 - bits)) & 31];
  return aus;
}

/** 71 Bytes v3.1: 4 Byte Nummer + 1 Byte Stufe + 2 Byte Seats + 64 Byte Signatur — dann Base32 in 5er-Gruppen. */
async function signiereSchluessel(key: CryptoKey, name: string, nummer: number, stufe: number, seats: number): Promise<string> {
  const text = new TextEncoder().encode(`kepta-lizenz-v3.1\n${name.trim().toLowerCase().normalize("NFC")}\n${nummer}\n${stufe === 2 ? "business" : stufe === 3 ? "enterprise" : "pro"}\n${seats}`);
  const sig = new Uint8Array(await crypto.subtle.sign("Ed25519", key, text.buffer as ArrayBuffer));
  const payload = new Uint8Array(4 + 1 + 2 + sig.length);
  new DataView(payload.buffer).setUint32(0, nummer);
  payload[4] = stufe;
  new DataView(payload.buffer).setUint16(5, seats);
  payload.set(sig, 7);
  const b32 = base32(payload);
  return (b32.match(/.{1,5}/g) ?? []).join("-");
}

/** Paddle-Webhook-Signatur: HMAC-SHA256 über „ts:body“ (Paddle-Billing-Standard). */
async function paddleSignaturGueltig(request: Request, body: string, secret: string): Promise<boolean> {
  const kopf = request.headers.get("Paddle-Signature");
  if (!kopf) return false;
  const [tsTeil, sigTeil] = kopf.split(";");
  const ts = tsTeil?.replace("ts=", "") ?? "";
  const erwartete = sigTeil?.replace("h1=", "") ?? "";
  if (!ts || !erwartete) return false;
  // 60-Sekunden-Fenster gegen Replay.
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 60) return false;
  const hmacSchluessel = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const hmac = await crypto.subtle.sign("HMAC", hmacSchluessel, new TextEncoder().encode(`${ts}:${body}`));
  const hex = [...new Uint8Array(hmac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === erwartete;
}

async function versendeMail(env: Env, an: string, name: string, schluessel: string): Promise<void> {
  const text = `Danke für deinen KEPTA-Pro-Kauf, ${name}!

Dein Lizenzschlüssel:

${schluessel}

So aktivierst du KEPTA:
1. KEPTA öffnen (Sidebar unten auf „Upgrade to Pro“ klicken — oder „Activate key“)
2. Namen eintragen: ${name}
3. Schlüssel einfügen — die Prüfung läuft offline, nichts verlässt deinen Rechner.

Download (macOS/Windows/Linux): https://github.com/DamianTodorovic/kepta-pro-releases/releases/latest

Fragen oder Teams/Enterprise (MDM, SSO): einfach auf LinkedIn antworten.
— Damian Todorovic`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM ?? "KEPTA <lizenzen@kepta.pro>", to: an, subject: "Your KEPTA Pro license key", text }),
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") return new Response("KEPTA license endpoint — POST only", { status: 405 });
    const body = await request.text();
    if (!(await paddleSignaturGueltig(request, body, env.PADDLE_WEBHOOK_SECRET))) {
      return new Response("Bad signature", { status: 401 });
    }
    const ereignis = JSON.parse(body) as {
      event_type?: string;
      data?: { customer?: { email?: string }; custom_data?: { name?: string; seats?: number | string }; items?: { price?: { id?: string } }[] };
    };

    // Paddle sendet bei jedem Kauf _und_ jeder Verlängerung — eine Lizenz je Kunde+Stufe (wie das Studio: Dedup).
    if (ereignis.event_type !== "transaction.completed") return Response.json({ ok: true, ignoriert: ereignis.event_type });

    const mail = ereignis.data?.customer?.email ?? "";
    const name = ereignis.data?.custom_data?.name ?? ereignis.data?.customer?.email?.split("@")[0] ?? "KEPTA-Kunde";
    // Paddle vergibt opake Price-IDs — Zuordnung über die EXAKTEN IDs (siehe CHECKLISTE.md),
    // niemals per Teilstring: „business" kommt in keiner ID vor (Bug vom 20.9. behoben).
    const BUSINESS_PREISE = new Set(["pri_01m2vassqjm41yrp4k6brsjcq2"]); // KEPTA Business (per Seat)
    const priceId = ereignis.data?.items?.[0]?.price?.id ?? "";
    const stufe = BUSINESS_PREISE.has(priceId) ? 2 : 1; // Pro (12/120 €) + Fallback; Enterprise läuft persönlich, nicht über den Checkout
    const seats = stufe === 2 ? Math.max(1, Number(ereignis.data?.custom_data?.seats ?? 1)) : 1;

    // Dedup: derselbe Kunde + dieselbe Stufe = derselbe Schlüssel (KV-Schlüssel).
    const kunde = `${mail.toLowerCase()}:${stufe}`;
    const bestehend = await env.LIZENZ.get(`schluessel:${kunde}`);
    let schluessel = bestehend;
    let nummer: number;
    if (schluessel) {
      nummer = Number((await env.LIZENZ.get(`nummer:${kunde}`)) ?? 0);
    } else {
      nummer = Number((await env.LIZENZ.get("naechsteNummer")) ?? 1);
      await env.LIZENZ.put("naechsteNummer", String(nummer + 1));
      const key = await privaterSchluessel(env.LIZENZ_PRIVATE_KEY);
      schluessel = await signiereSchluessel(key, name, nummer, stufe, seats);
      await env.LIZENZ.put(`schluessel:${kunde}`, schluessel);
      await env.LIZENZ.put(`nummer:${kunde}`, String(nummer));
    }
    await versendeMail(env, mail, name, schluessel);
    return Response.json({ ok: true, nummer });
  },
};
