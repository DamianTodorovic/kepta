// Ein Kriterium fuer "lokal"  -  Punkt 103, 25.10.2026.
//
// Bis heute hatte jede Stelle ihre eigne Liste: `src/lib/herkunft.ts:25` liess localhost,
// *.localhost, jedes 127.x.x.x und [::1] durch; `src/lib/richtlinien.ts:136` liess dafuer
// ::1 und .local durch, prueft aber nur die exakte 127.0.0.1. Ein Host, den die eine Stelle
// lokal nennt und die andere fremd, ist ein Riss: 127.0.0.2 war fuer den Host-Waechter
// "dieser Rechner" und fuer die Chat-Richtlinie "Ausland" (gemessen 25.10. 12:50 MESZ).
//
// Zwei Stufen, weil zwei Fragen:
//   istDieserRechner  -  traegt der Name DIESEN Rechner? (Host-Kopf und Origin-Wache)
//   istImHaus         -  bleibt der Name im Haus? (Chat-Ziel; .local ist mDNS im LAN, also
//                      ein anderes Geraet, aber kein Datenweg nach draussen)
// Die Listen stehen nur hier; beide Verbraucher rufen diese Datei.

const IPV4_LOOPBACK = /^127(\.\d{1,3}){3}$/;

/** Host ohne Port, ohne IPv6-Klammern, klein  -  die eine Normalform beider Stufen. */
export function normalisiereHost(host: string): string {
  const h = host.trim().toLowerCase();
  if (h.startsWith("[")) {
    const ende = h.indexOf("]");
    return ende >= 0 ? h.slice(1, ende) : h;
  }
  // Ein IPv6 ohne Klammern traegt mehrere Doppelpunkte; dann ist nichts davon ein Port.
  const erster = h.indexOf(":");
  if (erster >= 0 && h.indexOf(":", erster + 1) >= 0) return h;
  return h.replace(/:\d+$/, "");
}

/** Ist dieser Name DIESER Rechner? localhost, *.localhost, 127.0.0.0/8, ::1. */
export function istDieserRechner(host: string | undefined): boolean {
  if (!host) return true; // kein Host-Kopf: kein Browser (so steht es im Host-Waechter)
  const n = normalisiereHost(host);
  return n === "localhost" || n.endsWith(".localhost") || IPV4_LOOPBACK.test(n) || n === "::1";
}

/** Bleibt dieser Name im Haus? DIESER Rechner oder ein mDNS-Name im LAN (.local). */
export function istImHaus(host: string | undefined): boolean {
  if (!host) return true;
  const n = normalisiereHost(host);
  return istDieserRechner(n) || n.endsWith(".local");
}

/** Chat-Zielhost aus einer URL. Ohne URL true  -  Standard-Ollama laeuft lokal. */
export function istLokaleUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  try {
    return istImHaus(new URL(url).hostname);
  } catch {
    return false;
  }
}
