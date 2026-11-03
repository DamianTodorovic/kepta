// @vitest-environment jsdom
// #31, dritter Griff — die Sonde nach einem alten Klartext-Schluessel.
//
// `altFund` (src/lib/ai.ts) fragt die eigne Tuer nach aelteren Ablagen. Antwortet die Tuer
// nicht, stand bisher ein Wortloses `catch { /* offline: kein Fund */ }` — und die Flaeche
// meldete "kein alter Fund", als haette sie nachgesehen. Das ist dieselbe Klasse wie der
// Chat-Kopf in #43: aus einem Ausfall wird eine Aussage ueber den Bestand.
//
// Was dieser Fall verlangt, ist die kleinste ehrliche Stufe: die Auskunft an den Menschen
// bleibt, wie sie ist (null), aber der Ausfall wird genannt. Eine eigne Flaeche dafuer ist
// ein eigner Schnitt mit eigner Breitenpruefung.
//
// FAHREN:  npx vitest run tests/lib/schluessel-sonde-nennt-ihren-ausfall.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { kiSchluesselStatus } from "../../src/lib/ai";

const grund = () => vi.mocked(console.warn).mock.calls.map((c) => String(c[0]));

describe("#31: die Sonde nach einem alten Schluessel nennt ihren Ausfall", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("sagt, dass die Tuer nicht geantwortet hat, statt schlicht 'kein Fund' zu sein", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("connection refused"); }));
    const s = await kiSchluesselStatus();
    expect(s.altFund).toBeNull();
    expect(
      grund().some((z) => /legacy key check did not answer/i.test(z)),
      `kein Ausfall im Protokoll; Protokoll: ${JSON.stringify(grund())}`,
    ).toBe(true);
  });

  it("meldet dasselbe, wenn die Tuer eine Antwort ohne Vertrag schickt", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Proxy</html>", { status: 200, headers: { "content-type": "text/html" } })));
    const s = await kiSchluesselStatus();
    expect(s.altFund).toBeNull();
    expect(
      grund().some((z) => /legacy key check did not answer/i.test(z)),
      `kein Ausfall im Protokoll; Protokoll: ${JSON.stringify(grund())}`,
    ).toBe(true);
  });

  it("nennt nichts, wenn die Tuer sauber antwortet und nichts da ist — die Kontrolseite", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } })));
    const s = await kiSchluesselStatus();
    expect(s.altFund).toBeNull();
    expect(grund()).toEqual([]);
  });
});
