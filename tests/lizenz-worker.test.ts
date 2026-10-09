// @vitest-environment node
//
// Der Lizenz-Worker (tools/lizenz-worker) ist die Automatisierung hinter einem
// Kauf: Paddle meldet, der Worker stellt im v3.1-Format der App aus und schickt
// eine Mail. Geprüft wird hier, was wirklich zählt: der ausgestellte Schlüssel
// besteht dieselbe offline-Prüfung wie einer aus dem License Studio, ein Preis
// ohne Stufe stellt nichts aus, und die Mail beschreibt das KEPTA von heute —
// ohne die tote Einzelstufe und ohne eine Aktivierung, die es seit 3.1.5 nicht
// mehr gibt.
import { describe, it, expect, vi, afterEach } from "vitest";
import crypto from "node:crypto";
import worker, { type Env } from "../tools/lizenz-worker/worker";
import { pruefeSchluessel } from "../src/core/lizenz";

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const PRIVAT = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
const OEFFENTLICH = publicKey.export({ type: "spki", format: "der" }).toString("base64");
const GEHEIM = "webhook-secret";
const BUSINESS_PREIS = "pri_01m2vassqjm41yrp4k6brsjcq2";

function umgebung() {
  const daten = new Map<string, string>();
  const env = {
    LIZENZ: {
      async get(schluessel: string) { return daten.get(schluessel) ?? null; },
      async put(schluessel: string, wert: string) { daten.set(schluessel, wert); },
    },
    LIZENZ_PRIVATE_KEY: PRIVAT,
    PADDLE_WEBHOOK_SECRET: GEHEIM,
    RESEND_API_KEY: "re_test",
  } as unknown as Env;
  return { env, daten };
}

function anfrage(kauf: object, secret = GEHEIM) {
  const text = JSON.stringify(kauf);
  const ts = Math.floor(Date.now() / 1000);
  const h1 = crypto.createHmac("sha256", secret).update(`${ts}:${text}`).digest("hex");
  return new Request("https://kepta-licenzen.workers.dev/", {
    method: "POST",
    body: text,
    headers: { "Paddle-Signature": `ts=${ts};h1=${h1}`, "Content-Type": "application/json" },
  });
}

const kauf = (priceId: string, extra: object = {}) => ({
  event_type: "transaction.completed",
  data: {
    customer: { email: "kanzlei@mandel.de" },
    custom_data: { name: "Sarah Mandel", ...extra },
    items: [{ price: { id: priceId } }],
  },
});

describe("der Lizenz-Worker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ein Team-Kauf stellt einen Schlüssel aus, den die App-Prüfung annimmt, und schreibt die Mail", async () => {
    const gesendet: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      gesendet.push(JSON.parse(init.body));
      return new Response("{}", { status: 200 });
    }));
    const { env, daten } = umgebung();

    const res = await worker.fetch(anfrage(kauf(BUSINESS_PREIS, { seats: 3 })), env);
    expect(res.status, await res.text()).toBe(200);

    const schluessel = [...daten.entries()].filter(([k]) => k.startsWith("schluessel:"));
    expect(schluessel).toHaveLength(1);
    const [kunde, key] = schluessel[0];
    expect(kunde).toBe("schluessel:kanzlei@mandel.de:2");
    expect(pruefeSchluessel("Sarah Mandel", key, OEFFENTLICH, new Set())).toEqual({
      gueltig: true, nummer: 1, gesperrt: false, edition: "business", seats: 3,
    });

    expect(gesendet).toHaveLength(1);
    const mail = gesendet[0] as { subject: string; text: string };
    expect(mail.subject).toBe("Your KEPTA Enterprise license key");
    expect(mail.text).toContain(key);
    expect(mail.text).toContain("KEPTA Enterprise");
    expect(mail.text).not.toMatch(/Pro\b/);
    expect(mail.text).not.toMatch(/aktivier|activate|upgrade/i);
    expect(mail.text).toMatch(/unbegrenzt|no activation/i);
  });

  it("ein Preis ohne Stufe stellt nichts aus — kein Schlüssel, keine Mail", async () => {
    const gesendet: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async () => {
      gesendet.push("versucht");
      return new Response("{}", { status: 200 });
    }));
    const { env, daten } = umgebung();

    const res = await worker.fetch(anfrage(kauf("pri_unbekannt")), env);
    expect(res.status).toBe(200);
    expect((await res.json() as { ignoriert?: string }).ignoriert).toBeTruthy();
    expect([...daten.keys()].filter((k) => k.startsWith("schluessel:"))).toEqual([]);
    expect(gesendet).toEqual([]);
  });

  it("ohne passende Paddle-Signatur passiert nichts", async () => {
    const { env, daten } = umgebung();
    const res = await worker.fetch(anfrage(kauf(BUSINESS_PREIS), "das-ist-nicht-das-geheimnis"), env);
    expect(res.status).toBe(401);
    expect(daten.size).toBe(0);
  });
});
