// @vitest-environment jsdom
/* Punkt 4, Fall A — die Tuer lehnt ab, und ein kaputter Bestand ist kein leerer Anfang.
   NICHT GEFAHREN. Die Leitung faehrt den Fall, bevor sie den Flicken setzt:
     cd ~/kepta-app && npx vitest run tests/lib/store.tuer-500-und-schreibzung.test.ts
   Erwartung VOR dem Flicken: alle fuenf rot — `doRefresh` schluckt in src/lib/store.ts:104,
   `refreshMemories()` lehnt deshalb nie ab, und der Export `ladeFehler` existiert nicht.
   Erwartung NACH dem Flicken: alle fuenf gruen. Fall 3 und Fall 5 sind die Gegenproben:
   eine gesunde leere Antwort darf keine Fehlerzeile erfinden, und eine gelungene
   Schreibaktion darf nicht als Fehlschlag gemalt werden. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Leib = unknown;
type Kopf = Record<string, string>;

const MIGRIERT = "ki_gehirn_memories_migrated_v2";

function knoten(id: string) {
  return { id, userId: "local", title: `Knoten ${id}`, content: id, tags: [], createdAt: 1, updatedAt: 1 };
}

/* Eine Tuer-Antwort, so gebaut wie die Datei sie liest: status, Koepfe, Leib.
   Ohne Leib wirft json() — genau der Weg, an dem die Heilung vorher abbiegt. */
function antwort(status: number, leib: Leib, koepfe: Kopf = {}) {
  const niedrige = Object.fromEntries(Object.entries(koepfe).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => niedrige[String(name).toLowerCase()] ?? null },
    json: async () => {
      if (leib === null) throw new Error("empty body");
      return leib;
    },
  } as unknown as Response;
}

async function speicherLaden() {
  vi.resetModules();
  return import("../../src/lib/store");
}

let warteschlange: Response[] = [];
let gerufene: string[] = [];

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(MIGRIERT, "1"); // die Altbestands-Wanderung soll nicht mitmischen
  warteschlange = [];
  gerufene = [];
  vi.stubGlobal("fetch", vi.fn(async (eingabe: RequestInfo | URL) => {
    const url = String(eingabe);
    gerufene.push(url);
    const naechste = warteschlange.shift();
    if (!naechste) throw new Error(`Sonde hat keine Antwort mehr fuer ${url}`);
    return naechste;
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("P4-19: die Tuer lehnt ab, und der Bestand bleibt", () => {
  it("gibt nach einer 500 die Zahl, den Bestand und die Kappung nicht her und nennt den Grund", async () => {
    warteschlange = [
      antwort(200, { memories: [knoten("a"), knoten("b"), knoten("c")], total: 3, begrenzt: true }, { etag: 'W/"e1"' }),
      antwort(500, { error: "storage unreadable" }, {}),
    ];
    const s = await speicherLaden();
    expect(await s.refreshMemories()).toHaveLength(3);
    expect(s.bestandGroesse()).toBe(3);
    expect(s.seiteIstBegrenzt()).toBe(true);
    expect(s.ladeFehler()).toBeNull();

    await expect(s.refreshMemories()).rejects.toThrow(/HTTP 500/);
    expect(s.getMemoriesSync(), "ein Fehler loescht keinen Bestand").toHaveLength(3);
    expect(s.bestandGroesse(), "ein Fehler tilgt keine Zahl").toBe(3);
    expect(s.seiteIstBegrenzt(), "ein Fehler biegt die Kappung nicht um").toBe(true);
    expect(s.ladeFehler()).toMatch(/HTTP 500/);
  });

  it("lehnt auch ab, wenn die Tuer ohne Leib antwortet, und der Cache bleibt heil", async () => {
    warteschlange = [
      antwort(200, { memories: [knoten("a"), knoten("b")], total: 2 }, { etag: 'W/"e2"' }),
      antwort(503, null, {}),
    ];
    const s = await speicherLaden();
    expect(await s.refreshMemories()).toHaveLength(2);
    await expect(s.refreshMemories()).rejects.toThrow(/HTTP 503/);
    expect(s.getMemoriesSync()).toHaveLength(2);
    expect(s.bestandGroesse()).toBe(2);
    expect(s.ladeFehler()).toMatch(/HTTP 503/);
  });

  it("KONTROLLE 200 mit leerem Bestand: loest, null Knoten, und erfindet keinen Fehler", async () => {
    warteschlange = [antwort(200, { memories: [], total: 0 }, { etag: 'W/"e3"' })];
    const s = await speicherLaden();
    expect(await s.refreshMemories()).toHaveLength(0);
    expect(s.bestandGroesse()).toBe(0);
    expect(s.ladeFehler(), "ein leerer Anfang ist kein Fehler").toBeNull();
  });

  it("eine 304 nach einer Absage tilgt den Grund — die Tuer hat ja geantwortet", async () => {
    warteschlange = [
      antwort(200, { memories: [knoten("a"), knoten("b"), knoten("c")], total: 3 }, { etag: 'W/"e4"' }),
      antwort(500, { error: "storage unreadable" }, {}),
      antwort(304, null, { "x-kepta-total": "3" }),
    ];
    const s = await speicherLaden();
    expect(await s.refreshMemories()).toHaveLength(3);
    await expect(s.refreshMemories()).rejects.toThrow(/HTTP 500/);
    expect(s.ladeFehler()).toMatch(/HTTP 500/);
    expect(await s.refreshMemories()).toHaveLength(3);
    expect(s.bestandGroesse()).toBe(3);
    expect(s.ladeFehler(), "ein Convergenz-Treffer ist keine Absage").toBeNull();
  });

  it("eine gelungene Schreibaktion darf nicht als Fehlschlag gemalt werden", async () => {
    const gespeichert = knoten("neu");
    warteschlange = [
      antwort(200, { memories: [knoten("a"), knoten("b")], total: 2 }, { etag: 'W/"e5"' }),
      antwort(200, { memory: gespeichert }, {}),          // die POST-Zusage der Schreibzung
      antwort(500, { error: "storage unreadable" }, {}),  // die Liste koennte nicht nachgeladen werden
    ];
    const s = await speicherLaden();
    expect(await s.refreshMemories()).toHaveLength(2);
    const ergbnis = await s.saveMemory({ title: "Knoten neu", content: "neu" });
    expect(ergbnis, "gespeichert ist gespeichert — auch wenn die Liste danach schweigt").not.toBeNull();
    expect(ergbnis?.id).toBe("neu");
    expect(s.ladeFehler()).toMatch(/HTTP 500/);
  });
});
