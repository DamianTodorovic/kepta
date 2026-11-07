// ---------- SSRF-Schutz für den URL-Clipper ----------
// Bewusst unverändert aus server.ts übernommen (2.12.x): die Prüfkette ist
// gegen DNS-Rebinding und exotische Literal-Schreibweisen gebaut — der Wert
// steckt in den Randfällen, nicht in der Kürze.
import dns from "dns";

// IPv4-Literal in allen Schreibweisen (dotted, hex, oktal, reine Dezimalzahl)
// zur kanonischen dotted-Quad-Form normieren — "2130706433" ist 127.0.0.1.
export function normalizeIpv4(host: string): string | null {
  const parts = host.split(".");
  if (parts.length === 4) {
    const nums = parts.map((p) => {
      if (/^0[xX][0-9a-fA-F]+$/.test(p)) return parseInt(p, 16);
      if (/^0[0-7]+$/.test(p)) return parseInt(p, 8);
      if (/^\d+$/.test(p)) return parseInt(p, 10);
      return NaN;
    });
    if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null;
    return nums.join(".");
  }
  let n: number;
  if (/^0[xX][0-9a-fA-F]+$/.test(host)) n = parseInt(host, 16);
  else if (/^\d+$/.test(host)) n = parseInt(host, 10);
  else return null;
  if (!Number.isFinite(n) || n < 0 || n > 0xffffffff) return null;
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

// IPv6 in 8 16-bit-Gruppen zerlegen (null bei ungültiger Form)
export function ipv6Groups(ip: string): number[] | null {
  const parts = ip.toLowerCase().split("::");
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(":") : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(":") : [];
  const fill = 8 - head.length - tail.length;
  if (fill < 0) return null;
  const groups: number[] = [];
  for (const g of [...head, ...Array<string>(fill).fill("0"), ...tail]) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    groups.push(parseInt(g, 16));
  }
  return groups.length === 8 ? groups : null;
}

/**
 * Die IPv4-Adressen, die eine IPv6-Adresse traegt — vier Uebergangsformen, deren letztes
 * Wort wie ein oeffentliches Adresspaar aussieht und doch 127.0.0.1 treffen kann:
 * IPv4-kompatibel (::7f00:1), NAT64 (64:ff9b::/96 und 64:ff9b:1::/48), 6to4 (2002::/16,
 * die Adresse steckt in den Gruppen 1-2) und Teredo (2001:0::/32, deren Counterpart die
 * letzte Wortgruppe *komplementiert*). Teredo liefert beide Lesarten zurueck, weil die
 * komplementierte die eigentliche Remote-Adresse ist: wer nur die eine prueft, laesst
 * [2001:0::80ff:fffe] durch — dasselbe 127.0.0.1.
 */
export function eingebettetesIpv4(g: number[]): string[] {
  const ausWortern = (hoch: number, tief: number) => `${hoch >>> 8}.${hoch & 255}.${tief >>> 8}.${tief & 255}`;
  const g0 = g[0]!;
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0 || g[5] === 0xffff)) {
    return [ausWortern(g[6]!, g[7]!)]; // ::a.b.c.d und ::ffff:a.b.c.d
  }
  if (g0 === 0x0064 && g[1] === 0xff9b) return [ausWortern(g[6]!, g[7]!)] /* NAT64, beide Praefixe */;
  if (g0 === 0x2002) return [ausWortern(g[1]!, g[2]!)]; // 6to4
  if (g0 === 0x2001 && g[1] === 0x0000) {
    return [ausWortern(g[6]!, g[7]!), ausWortern((~g[6]!) & 0xffff, (~g[7]!) & 0xffff)]; // Teredo
  }
  return [];
}

/** IP-Literal (v4/v6, kanonische Form) gegen Loopback/Privat/Link-Local/CGNAT/Unique-Local/Multicast/Reserved prüfen. */
export function isPrivateIp(ip: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 192 && (b === 168 || b === 0)) return true; // 192.168/16 + 192.0.0.0/24 (NAT64-Mapping)
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true; // link-local / AWS metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 — Benchmark-Netz
    if (a >= 224) return true; // Multicast 224/4 + Reserved 240/4 (inkl. 255.255.255.255)
    return false;
  }
  const g = ipv6Groups(ip);
  if (!g) return false;
  if (g.every((x) => x === 0)) return true; // :: (unspecified)
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1 loopback
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) → auf die gemappte IPv4 prüfen
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return isPrivateIp(`${g[6]! >> 8}.${g[6]! & 255}.${g[7]! >> 8}.${g[7]! & 255}`);
  }
  const h = g[0]!;
  if (h >= 0xfe80 && h <= 0xfebf) return true; // fe80::/10 link-local
  if (h >= 0xfc00 && h <= 0xfdff) return true; // fc00::/7 unique local
  if (h >= 0xff00) return true; // ff00::/8 multicast
  // P157: Uebergangsformen, die eine IPv4-Adresse tragen — die Adresse selbst entscheiden lassen.
  for (const eingebettet of eingebettetesIpv4(g)) {
    if (isPrivateIp(eingebettet)) return true;
  }
  return false;
}

/** Host-String (ohne Klammern) auf private Ziele prüfen — IP-Literale normiert, Namen erst via DNS. */
export function isPrivateHostname(rawHost: string): boolean {
  const host = rawHost.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal") || host === "metadata.google" || host === "metadata.google.internal") return true;
  const v4 = normalizeIpv4(host);
  if (v4) return isPrivateIp(v4);
  if (host.includes(":")) return isPrivateIp(host);
  return false; // echter DNS-Name → assertPublicDnsHost prüft alle aufgelösten IPs
}

export function parseSafeUrl(raw: string): { ok: boolean; reason?: string; url?: URL } {
  try {
    if (raw.length > 2048) return { ok: false, reason: "URL too long" };
    const u = new URL(raw);
    if (!["http:", "https:"].includes(u.protocol)) return { ok: false, reason: "Only http and https are allowed" };
    if (u.username || u.password) return { ok: false, reason: "Credentials in the URL are not allowed" };
    // URL.hostname normiert IPv4/IPv6-Literale bereits (WHATWG); zusätzlich Strings prüfen
    const host = u.hostname.replace(/^\[/, "").replace(/\]$/, "");
    if (isPrivateHostname(host)) return { ok: false, reason: "Private hosts are blocked (SSRF protection)" };
    return { ok: true, url: u };
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }
}

// DNS-Auflösung: ALLE IPs eines Hosts (v4+v6) gegen private Bereiche prüfen —
// schließt exotische Literal-Schreibweisen aus und die erste Auflösung gegen
// Loopback/Intranet. Der Fetch selbst löst DNS ein zweites Mal auf; dieses
// Restfenster ist bei einer localhost-App ohne CORS-Exfiltration klein —
// gegen Rebinding bis zum Ende müsste man die geprüfte IP pinnen.
/**
 * Fehler, die der Aufrufer verursacht hat: blockierter Host, nicht aufloesbarer
 * Name. Eigene Klasse statt Textvergleich im catch — sonst entscheidet der
 * Wortlaut einer Meldung ueber den HTTP-Status, und eine Uebersetzung macht aus
 * einem 400 still ein 500.
 */
export class ClipClientError extends Error {}

export async function assertPublicDnsHost(u: URL): Promise<void> {
  const host = u.hostname.replace(/^\[/, "").replace(/\]$/, "");
  let addrs: { address: string; family: number }[];
  try {
    addrs = await dns.promises.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new ClipClientError("Host could not be resolved (DNS)");
  }
  if (addrs.length === 0) throw new ClipClientError("Host could not be resolved (DNS)");
  for (const a of addrs) {
    if (isPrivateIp(a.address)) throw new ClipClientError("Private hosts are blocked (SSRF protection)");
  }
}

export function isSafeFilename(name: string): boolean {
  if (!name || name.length > 180) return false;
  if (name.includes("..") || name.includes("/") || name.includes("\\") || name.startsWith(".")) return false;
  if (/[<>:"|?*\x00-\x1F]/.test(name)) return false;
  return /^[\w.\- äöüÄÖÜß()[\]]+$/.test(name);
}
