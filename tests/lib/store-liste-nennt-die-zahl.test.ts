// @vitest-environment jsdom
/* #49, erster Griff — die Liste wirft einen Fehler, der ihren eignen Grund traegt.

   Gemessen 3.11. 21:31 MEZ im echten Fenster (scripts/listen-absage-im-fenster.mjs, 390x844,
   der Vor-Diener wirft nur `/api/memories` ab): die Absage **erscheint** — "The server did not
   answer" mit Knopf, 336x192 px, kein Ueberlauf. Damit ist P49 §8 ("die Absage erschien nicht")
   an diesem Stand widerlegt. Was sie nicht zeigt, ist die Zahl: der Leib der Absage trug den
   Satz ein zweites Mal ("Your notes did not load. Nothing was changed."), von der Tuer war kein
   Grund uebrig. Der Grund liegt in zwei Stellen:
     1. src/lib/store.ts wirft bei 400 und darueber einen kahlen `new Error(...)` — kein
        `ApiFehler`, und der Absage-Helfer (src/lib/absage.ts) haelt seinen Satz nur an einem
        `ApiFehler` fur tragbar;
     2. src/components/Dashboard.tsx:458 faengt genau diesen Wurf und setzt die Zeile auf
        `absage(SATZ, e)` — ohne Grund, weil (1) keinen traegt.
   Der zweite Fall ist die Gegenprobe: eine gesunde Antwort darf keine Absage erfinden. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Leib = unknown;
type Kopf = Record<string, string>;

const MIGRIERT = "ki_gehirn_memories_migrated_v2";

function knoten(id: string) {
  return { id, userId: "local", title: `Knoten ${id}`, content: id, tags: [], createdAt: 1, updatedAt: 1 };
}

function antwort(status: number, leib: Leib, koepfe: Kopf = {}) {
  const niedrig = Object.fromEntries(Object.entries(koepfe).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => niedrig[String(name).toLowerCase()] ?? null },
    json: async () => {
      if (leib === null) throw new Error("empty body");
      return leib;
    },
  } as unknown as Response;
}

/* Beide Module aus derselben Generation: `vi.resetModules()` macht jede Klasse neu, und
   ein ApiFehler aus einer andren Generation ist dem Store seiner eigner — dieselbe
   Verwechslung, die ein instanceof hier als Fehlschlag melden wuerde. */
async function speicherLaden() {
  vi.resetModules();
  const speicher = await import("../../src/lib/store");
  const kappe = await import("../../src/lib/api");
  return { ...speicher, ApiFehler: kappe.ApiFehler };
}

let warteschlange: Response[] = [];

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(MIGRIERT, "1");
  warteschlange = [];
  vi.stubGlobal("fetch", vi.fn(async () => {
    const naechste = warteschlange.shift();
    if (!naechste) throw new Error("Sonde hat keine Antwort mehr");
    return naechste;
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* Was die Flaeche lesen kann: ein Fehler mit eigner Zahl und eignem Satz. */
type Tragbar = { name: string; status: number; satz: string };

describe("#49: die Listen-Tuer wirft ihren Grund in einem tragbaren Fehler", () => {
  it("lehnt mit ApiFehler ab, dessen Satz die Zahl der Tuer nennt", async () => {
    warteschlange = [
      antwort(200, { memories: [knoten("a")], total: 1 }, { etag: 'W/"g1"' }),
      antwort(500, { error: "storage unreadable" }, {}),
    ];
    const s = await speicherLaden();
    await s.refreshMemories();
    const fehler = await s.refreshMemories().catch((e: unknown) => e);
    expect(fehler, "ein kahler Error traegt der Flaeche keinen Grund").toBeInstanceOf(s.ApiFehler);
    expect((fehler as Tragbar).status).toBe(500);
    expect((fehler as Tragbar).satz).toMatch(/HTTP 500/);
    expect(s.ladeFehler(), "der Grund im Speicher ist derselbe Satz, den die Flaeche zeigt").toBe((fehler as Tragbar).satz);
  });

  it("behalt den Grund auch, wenn die Tuer ohne Leib antwortet", async () => {
    warteschlange = [
      antwort(200, { memories: [knoten("a")], total: 1 }, { etag: 'W/"g2"' }),
      antwort(503, null, {}),
    ];
    const s = await speicherLaden();
    await s.refreshMemories();
    const fehler = await s.refreshMemories().catch((e: unknown) => e);
    expect(fehler).toBeInstanceOf(s.ApiFehler);
    expect((fehler as Tragbar).satz, "503 hat keinen Leib, also bleibt nur die Zahl").toMatch(/HTTP 503/);
  });

  it("KONTROLLE: eine gesunde Antwort wirft nicht und erfindet keinen Grund", async () => {
    warteschlange = [antwort(200, { memories: [knoten("a"), knoten("b")], total: 2 }, { etag: 'W/"g3"' })];
    const s = await speicherLaden();
    await expect(s.refreshMemories()).resolves.toHaveLength(2);
    expect(s.ladeFehler()).toBeNull();
  });
});
