// @vitest-environment jsdom
// Punkt 4 (Fehler-Feger #31, 4.11. 23:40) — die Herkunfts-Kante fehlt an zwei Stellen, die
// den Grund weiterreichen, statt ihn zu halten.
//
//   src/lib/store.ts:150  letzterSeitenfehler = err.message   -> Dashboard.tsx:115/117 malt ihn
//   src/lib/store.ts:216  letzterLadefehler  = err.message     -> Dashboard.tsx:692 waedt ihn in
//                                                                 `new ApiFehler(grund)` und gibt
//                                                                 ihm damit die Passier-Erlaubnis
//
// Die Waden ist nicht die Meldung, sondern die Erlaubnis: `absage()` (src/lib/absage.ts, seit
// 3.2.130) laesst nur einen `ApiFehler` auf die Flaeche, weil dessen Satz unsre eigne Unterschrift
// traegt. Wer einen beliebigen Ausnahmewortlaut in einen `ApiFehler` wickelt, dreht die Kante um —
// ein Browser-Wortlaut ("Failed to fetch"), ein V8-Text ("Unexpected token < in JSON at position 0")
// und ein Bibliotheks-Dialog mit Pfad stehen dann wieder im Fenster. Genau das war P48/#47.
//
// NEUN Faelle, alle NICHT gefahren vor dem Flicken. Die Leitung faehrt sie:
//   cd ~/kepta-app && npx vitest run tests/lib/store-herkunft.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MIGRIERT = "ki_gehirn_memories_migrated_v2";

function knoten(id: string) {
  return { id, userId: "local", title: `Knoten ${id}`, content: id, tags: [], createdAt: 1, updatedAt: 1 };
}

function antwort(status: number, leib: unknown, koepfe: Record<string, string> = {}) {
  const niedrige = Object.fromEntries(Object.entries(koepfe).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => niedrige[String(name).toLowerCase()] ?? null },
    json: async () => {
      if (leib === null) throw new SyntaxError("Unexpected token < in JSON at position 0");
      return leib;
    },
  } as unknown as Response;
}

async function speicherLaden() {
  vi.resetModules();
  return import("../../src/lib/store");
}

let warteschlange: Array<() => Response | never> = [];
let schrei: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(MIGRIERT, "1");
  warteschlange = [];
  schrei = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async () => {
    const naechste = warteschlange.shift();
    if (!naechste) throw new Error("Sonde hat keine Antwort mehr");
    return naechste();
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Still steht still: der Abbruch kommt vom Browser, sein Wortlaut gehoert ins Protokoll. */
function abbruch() {
  return () => { throw new TypeError("Failed to fetch"); };
}

describe("#59 Herkunfts-Kante im Speicher: die Flaeche sieht nur eigne Saetze", () => {
  it("laesst den Wortlaut des Browsers nicht in die Listen-Absage (src/lib/store.ts:216)", async () => {
    warteschlange = [
      () => antwort(200, { memories: [knoten("a")], total: 1 }, { etag: 'W/"h1"' }),
      abbruch(),
    ];
    const s = await speicherLaden();
    await s.refreshMemories();
    await s.refreshMemories().catch(() => undefined);
    expect(s.ladeFehler() ?? "", "ein Fremder ohne unsre Unterschrift wird nicht zur Auskunft").not.toMatch(/Failed to fetch/i);
    expect(schrei.mock.calls.flat().some((x: unknown) => x instanceof TypeError),
      "aber der Grund geht nicht verloren — er steht im Protokoll").toBe(true);
  });

  it("KONTROLLE: die Zahl der eignen Tuer bleibt der Grund (src/lib/store.ts:184)", async () => {
    warteschlange = [
      () => antwort(200, { memories: [knoten("a")], total: 1 }, { etag: 'W/"h2"' }),
      () => antwort(500, { error: "storage unreadable" }, {}),
    ];
    const s = await speicherLaden();
    await s.refreshMemories();
    await s.refreshMemories().catch(() => undefined);
    expect(s.ladeFehler(), "500 ist eine Antwort der eignen Tuer und muss nennen, was sie ist").toMatch(/HTTP 500/);
  });

  it("laesst den JSON-Wortlaut der Laufzeit nicht in die Listen-Absage", async () => {
    warteschlange = [
      () => antwort(200, { memories: [knoten("a")], total: 1 }, { etag: 'W/"h3"' }),
      () => antwort(200, null, {}),   // gesund im Status, unlesbar im Leib: V8 wirft die SyntaxError
    ];
    const s = await speicherLaden();
    await s.refreshMemories();
    await s.refreshMemories().catch(() => undefined);
    expect(s.ladeFehler() ?? "", "ein V8-Text ist keine Auskunft ueber unsre Tuer").not.toMatch(/Unexpected token/);
  });

  it("laesst den Wortlaut des Browsers nicht in die Seiten-Absage (src/lib/store.ts:150)", async () => {
    warteschlange = [
      () => antwort(200, { memories: [knoten("a")], total: 9, begrenzt: true }, { "x-kepta-total": "9", "x-kepta-begrenzt": "1", etag: 'W/"h4"' }),
      abbruch(),
    ];
    const s = await speicherLaden();
    await s.refreshMemories();
    await s.mehrAnholen().catch(() => undefined);
    expect(s.seitenFehler() ?? "", "derselbe Fremde, die zweite Zeile").not.toMatch(/Failed to fetch/i);
  });

  it("KONTROLLE: der Widerspruch einer Seite behaelt seinen eignen Satz", async () => {
    warteschlange = [
      () => antwort(200, { memories: [knoten("a")], total: 9, begrenzt: true }, { "x-kepta-total": "9", "x-kepta-begrenzt": "1", etag: 'W/"h5"' }),
      () => antwort(200, { memories: [], total: 9, begrenzt: true }, {}),  // bringt nichts Neues, meldet aber mehr
    ];
    const s = await speicherLaden();
    await s.refreshMemories();
    await s.mehrAnholen().catch(() => undefined);
    expect(s.seitenFehler(), "diesen Satz schreibt der Speicher selbst — er darf stehen").toMatch(/the page stops here/);
  });
});

describe("#59 Herkunfts-Kante an den Behauptungen (src/lib/store.ts:359 und :382)", () => {
  it("nennt keinen Pfad, wenn die Tuer eine Antwort ohne unsre Unterschrift bringt", async () => {
    warteschlange = [() => antwort(500, { error: "/Users/a/.kepta/kepta.db" }, {})];
    const s = await speicherLaden();
    const { grund } = await s.holeBehauptungen("eins");
    expect(grund ?? "", "die Formpruefung der api.ts gilt auch hier").not.toMatch(/\/Users\//);
    expect(grund ?? "", "und die Zahl tritt an ihre Stelle").toMatch(/500/);
  });

  it("KONTROLLE: ein Satz der Tuer bleibt ihr Satz", async () => {
    warteschlange = [() => antwort(429, { error: "Write limit reached" }, {})];
    const s = await speicherLaden();
    const { grund } = await s.holeBehauptungen("eins");
    expect(grund, "eine kurze einzeilige Auskunft der Tuer ist kein Grund zur Zensur").toMatch(/Write limit reached/);
  });

  it("sagt das Lesen der Behauptungen ab, ohne das Wort des Browsers", async () => {
    warteschlange = [abbruch()];
    const s = await speicherLaden();
    const { grund } = await s.holeBehauptungen("eins");
    expect(grund ?? "", "Stille ist eine Auskunft, ihr Wortlaut ist es nicht").not.toMatch(/Failed to fetch/i);
    expect(grund ?? "", "und die Absage bleibt hoerbar").toMatch(/claim/i);
  });
});
