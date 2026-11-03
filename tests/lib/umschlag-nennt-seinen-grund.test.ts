// @vitest-environment jsdom
/* #31, fuenfter Griff — ein Umschlag, der nicht aufgeht, sagt, warum er nicht aufgeht.

   `oeffne` (src/lib/ai.ts:316-334) macht den Schluessel auf, den die Einstellungs-Tuer
   versiegelt zurueckgibt. Vier Ausgaende sind dasselbe Wort: die leere Zeichenkette. Drei
   davon sind kein "nichts gespeichert", sondern ein Ausfall, und die Flaeche baut daraus
   "keine Verbindung" ueber jemanden, der eine hat - dieselbe Klasse wie der Chat-Kopf in
   #43, die Schluessel-Sonde in 3.2.135 und der Rueckweg der Verbindung in 3.2.136.

     * der Wert traegt keine Umschlag-Kennung  -> fremder oder verstuemmelter Inhalt
     * diese Installation hat keinen Verschluss  -> anderer Datenbankschluessel
     * der Verschluss passt nicht                -> die Probe selbst (AES-GCM wirft)

   Der vierte Ausgang ist ehrlich und bleibt still: nichts gespeichert.
   Was neu ist, ist die Zeile im Protokoll. Das Verhalten (leer zurueck, App laeuft mit den
   Defaults) bleibt unveraendert, und es gibt genau einen Leser von `oeffne` in der ganzen
   Datei: Zeile 592 in `hydrateAISettings`. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hydrateAISettings } from "../../src/lib/ai";

const GRUND = /stored key could not be opened/i;
const grund = () => vi.mocked(console.warn).mock.calls.map((c) => String(c[0]));
const meldet = () => grund().some((z) => GRUND.test(z));

/** Der Datenbankschluessel, den die Tuer bei /api/recovery-key ausweist. */
const SCHLUESSEL_HEX = "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0";

function bytesZuBase64(ba: Uint8Array): string {
  let s = "";
  for (const b of ba) s += String.fromCharCode(b);
  return btoa(s);
}

/**
 * Ein echter Umschlag, aber mit einem *andren* Schluessel versiegelt als der, den die
 * Sitzung nachher bekommt: die Probe trifft genau den Ausfall, den ein Umzug des
 * Datenbankschluessels erzeugt - Format in Ordnung, Inhalt nicht aufzubekommen.
 */
async function fremderUmschlag(): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new Uint8Array(32), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dicht = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode("sk-anders")));
  const paket = new Uint8Array(iv.length + dicht.length);
  paket.set(iv, 0);
  paket.set(dicht, iv.length);
  return "v1." + bytesZuBase64(paket);
}

function spiegelMitSchluessel(wert: string) {
  const leib = { ai_connection: JSON.stringify({ v: 1, providerId: "openai", model: "gpt-4o-mini", schluessel: wert }) };
  vi.stubGlobal("fetch", vi.fn(async (eingabe: RequestInfo | URL) => {
    const pfad = String(eingabe);
    if (pfad.includes("/api/recovery-key")) {
      return new Response(JSON.stringify({ key: SCHLUESSEL_HEX, storedIn: "macOS Keychain" }), { status: 200 });
    }
    return new Response(JSON.stringify(leib), { status: 200, headers: { "content-type": "application/json" } });
  }));
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("#31: der Umschlag nennt, warum er nicht aufgeht", () => {
  it("meldet den Ausfall, wenn der Inhalt nicht aufzubekommen ist", async () => {
    spiegelMitSchluessel(await fremderUmschlag());
    const s = await hydrateAISettings();
    expect(s.apiKey, "ein fremder Umschlag bleibt zu").toBe("");
    expect(meldet(), `kein Grund im Protokoll; Protokoll: ${JSON.stringify(grund())}`).toBe(true);
  });

  it("meldet denselben Ausfall, wenn der Wert keine Umschlag-Kennung traegt", async () => {
    spiegelMitSchluessel(bytesZuBase64(new Uint8Array(40)));
    const s = await hydrateAISettings();
    expect(s.apiKey).toBe("");
    expect(meldet(), `kein Grund im Protokoll; Protokoll: ${JSON.stringify(grund())}`).toBe(true);
  });

  it("nennt nichts, wenn gar nichts gespeichert ist — die erste Kontrolle", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
    const s = await hydrateAISettings();
    expect(s.apiKey).toBe("");
    expect(grund()).toEqual([]);
  });

  it("nennt nichts, wenn der Wert der lokale Marker ist — die zweite Kontrolle", async () => {
    spiegelMitSchluessel("local");
    const s = await hydrateAISettings();
    expect(s.apiKey, "local ist kein Umschlag, sondern die Antwort selbst").toBe("local");
    expect(grund()).toEqual([]);
  });
});
