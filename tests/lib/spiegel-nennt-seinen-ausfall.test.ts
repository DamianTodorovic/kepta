// @vitest-environment jsdom
// #31, vierter Griff — der Spiegel der eignen Verbindung nennt, was ihn gestoert hat.
//
// `hydrateAISettings` (src/lib/ai.ts) liest beim Start die gespiegelte Verbindung aus der
// Tuer. Drei Ausgaenge waren bisher ein einziger, stiller Rueckgriff auf die Defaults:
//
//   * die Tuer antwortet nicht (Verbindung abgelehnt)
//   * die Tuer weist ab (kein Vertrag, Zahl beliebig)
//   * der Spiegel ist da, aber nicht zu lesen (kaputter Leib)
//
// Fuer den Menschen ist das eine Aussage ueber seine eigne Verbindung ("nichts gewaehlt"),
// die aus einem Ausfall gebaut ist — dieselbe Klasse wie der Chat-Kopf in #43, die
// Vorschau-Copie in 3.2.133 und die Schluessel-Sonde in 3.2.135. Der Rueckgriff bleibt,
// weil die Flaeche ohne Tuer weiterarbeiten muss; was neu ist, ist der Grund im Protokoll.
//
// FAHREN:  npx vitest run tests/lib/spiegel-nennt-seinen-ausfall.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hydrateAISettings } from "../../src/lib/ai";

const grund = () => vi.mocked(console.warn).mock.calls.map((c) => String(c[0]));
const meldet = (muster: RegExp) =>
  grund().some((z) => muster.test(z));

describe("#31: der Spiegel der Verbindung nennt seinen Ausfall", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("meldet einen unlesbaren Spiegel, statt still auf die Defaults zu fallen", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ai_connection: "{zersetzt" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const s = await hydrateAISettings();
    expect(s.model).toBe("");
    expect(
      meldet(/mirrored AI settings could not be read/i),
      `kein Grund im Protokoll; Protokoll: ${JSON.stringify(grund())}`,
    ).toBe(true);
  });

  it("meldet die abgewiesene Tuer mit ihrer Zahl", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    const s = await hydrateAISettings();
    expect(s.model).toBe("");
    expect(
      meldet(/settings door refused.*HTTP 500/i),
      `keine abgewiesene Tuer im Protokoll; Protokoll: ${JSON.stringify(grund())}`,
    ).toBe(true);
  });

  it("meldet die unerreichbare Tuer auf dem Rueckweg durch die Sitzung", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection refused");
      }),
    );
    const s = await hydrateAISettings();
    expect(s.model).toBe("");
    expect(
      meldet(/could not be restored/i),
      `kein Ausfall im Protokoll; Protokoll: ${JSON.stringify(grund())}`,
    ).toBe(true);
  });

  it("nennt nichts, wenn die Tuer sauber antwortet und kein Spiegel da ist — die Kontrolle", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const s = await hydrateAISettings();
    expect(s.providerId).toBeTruthy();
    expect(grund()).toEqual([]);
  });
});
