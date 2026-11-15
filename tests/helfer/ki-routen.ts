// Ein Doppel der Einstellungs-Route für die KI-Schluessel-Tests: Bestand,
// Maske wie seit F3 im Kern, und der Verschluss aus dem Schluesselbund.
// Der echte Server steht in tests/lib/ki-schluessel-neustart.test.ts.
import { vi } from "vitest";

/** Dasselbe Muster wie der Kern seit F3 (server.ts:74). */
export const GEHEIM_MUSTER = /(?:api[_-]?key|access[_-]?key|secret|token|passwort|password|passphrase|schluessel|key)$/i;
export const GEHEIM_NAMEN = new Set(["ai_settings"]);
export const DB_SCHLUESSEL = "0f2a4c6e8a0fb1d3".repeat(4); // 64 Hex

/**
 * Jede Zeile eine eigene Installation: der Verschluss wird pro Sitzung geholt
 * und behalten, also muss der Modulzustand zwischen den Faellen fallen.
 */
export async function kiSitzung() {
  vi.resetModules();
  return await import("../../src/lib/ai");
}

export interface KiRouten {
  readonly bestand: Record<string, string>;
  readonly gesendet: Record<string, string | null>[];
  readonly anfrage: (url: string, init?: RequestInit) => Promise<Response>;
}

/**
 * `maskiert=true` ist der Kern seit F3, `false` der gemessene Stand der App
 * (server/router/settings.ts liefert den rohen Bestand). `dbSchluessel=null`
 * ist eine Installation ohne Verschluesselung — dann gibt es keinen Verschluss.
 */
export function kiRouten(maskiert = true, dbSchluessel: string | null = DB_SCHLUESSEL): KiRouten {
  const bestand: Record<string, string> = {};
  const gesendet: Record<string, string | null>[] = [];
  const anzeigen = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(bestand)) {
      const geheim = GEHEIM_NAMEN.has(k) || GEHEIM_MUSTER.test(k);
      if (!maskiert || !geheim) out[k] = v;
      else out[k] = v.length >= 8 ? { gesetzt: true, ende: v.slice(-4) } : { gesetzt: true };
    }
    return out;
  };
  const anfrage = async (url: string, init?: RequestInit): Promise<Response> => {
    if (url === "/api/settings" && (init?.method ?? "GET") === "PUT") {
      const leib = JSON.parse(String(init!.body)) as Record<string, string | null>;
      gesendet.push(leib);
      for (const [k, v] of Object.entries(leib)) {
        if (v === null) delete bestand[k];
        else bestand[k] = v;
      }
      return new Response(JSON.stringify({ ok: true, keys: Object.keys(leib).length }), { status: 200 });
    }
    if (url === "/api/settings") return new Response(JSON.stringify(anzeigen()), { status: 200 });
    if (url === "/api/recovery-key") {
      if (!dbSchluessel) {
        return new Response(JSON.stringify({ error: "The knowledge base is not encrypted — there is no recovery key." }), { status: 404 });
      }
      return new Response(JSON.stringify({ key: dbSchluessel, storedIn: "macOS Keychain" }), { status: 200 });
    }
    if (url === "/api/models") return new Response(JSON.stringify({ models: ["claude-sonnet-4-20250514"] }), { status: 200 });
    return new Response(JSON.stringify({ ok: true, count: 1, uptime: 1 }), { status: 200 });
  };
  return { bestand, gesendet, anfrage };
}
