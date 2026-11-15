// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  bestandGroesse,
  seiteIstBegrenzt,
  getMemoriesSync,
  refreshMemories,
  mehrAnholen,
  seitenFehler,
} from "../../src/lib/store";

// Brief `BRIEF-SEITE-100-20-10.md`, Auftrag 1 (Punkt 6, 20.10. 15:22): die Blätter-Fläche holt eine
// einzige Seite — 100 von 21 066 — und fragt nie wieder nach, und `seiteIstBegrenzt()` aus
// `src/lib/store.ts:61` hat in keiner Fläche einen Verbraucher. Diese Fälle verlangen den Nachlade-
// griff und halten ihn an die Kappen der Tür: `SEITE_MAX` = 200 (`server/helfer/api-form.ts:79`),
// keine erfundene Zahl, und niemals `alle=1` (Verbot 1 des Briefs — der schwere Pfad, vor dem die
// Route in ihrem eignen Hinweis warnt, `server/router/memories.ts:375`).

const NOTIZ = 21066;

function notiz(i: number) {
  return {
    id: `n-${i}`,
    userId: "local",
    title: `Note ${i}`,
    content: `body ${i}`,
    tags: [] as string[],
    createdAt: 1700000000000 + i,
    updatedAt: 1700000000000 + i,
  };
}

function seite(offset: number, groesse: number, begrenzt: boolean) {
  const zaehlen = Array.from({ length: groesse }, (_, k) => notiz(offset + k));
  return new Response(JSON.stringify({
    count: zaehlen.length,
    total: NOTIZ,
    limit: groesse,
    offset,
    begrenzt,
    hinweis: begrenzt
      ? `This page holds ${groesse} of ${NOTIZ} notes; ${NOTIZ - offset - groesse} more follow at offset ${offset + groesse}`
      : `the whole list fits in this page`,
    memories: zaehlen,
  }), {
    status: 200,
    headers: {
      "x-kepta-count": String(zaehlen.length),
      "x-kepta-total": String(NOTIZ),
      "x-kepta-limit": String(groesse),
      "x-kepta-offset": String(offset),
      "x-kepta-begrenzt": begrenzt ? "1" : "0",
    },
  });
}

/** Ruft Seite 1 (Tuer-Default 100, begrenzt) und legt die gesehen URLs ab. */
function tuerMitSeite1(aufrufe: string[]) {
  vi.stubGlobal("fetch", vi.fn(async (eingabe: unknown) => {
    const url = String(typeof eingabe === "string" ? eingabe : (eingabe as { url?: string }).url);
    aufrufe.push(url);
    return seite(0, 100, true);
  }));
}

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Die Liste darf nicht bei hundert enden", () => {
  it("holt Seite zwei und hat danach mehr als hundert im Speicher", async () => {
    // Das ist der Kern des Briefs: vor dem Griff waren es 100 von 21 066, und die Fläche nannte es
    // „All … shown". ROT, solange es keinen Nachlade-Weg gibt — und rot bleibt er auch, wenn der
    // Griff zwar existiert, aber die Antwort verwirft.
    const aufrufe: string[] = [];
    tuerMitSeite1(aufrufe);
    await refreshMemories();
    expect(getMemoriesSync().length).toBe(100);
    expect(seiteIstBegrenzt()).toBe(true);

    vi.stubGlobal("fetch", vi.fn(async (eingabe: unknown) => {
      const url = String(typeof eingabe === "string" ? eingabe : (eingabe as { url?: string }).url);
      aufrufe.push(url);
      return seite(100, 200, true);
    }));
    const neu = await mehrAnholen();
    expect(neu).toBe(200);
    expect(getMemoriesSync().length).toBe(300);
    expect(getMemoriesSync().length).toBeGreaterThan(100);
  });

  it("fragt mit der Kappe der Tür: limit=200 und offset=100", async () => {
    // `SEITE_MAX` ist 200 und die Tür klemmt jede Zahl selbst dorthin (`memories.ts:274`). Eine
    // eigne Kappe (100, 250, 1000) wäre ein Vertrag, den niemand hält.
    const aufrufe: string[] = [];
    tuerMitSeite1(aufrufe);
    await refreshMemories();
    vi.stubGlobal("fetch", vi.fn(async (eingabe: unknown) => {
      const url = String(typeof eingabe === "string" ? eingabe : (eingabe as { url?: string }).url);
      aufrufe.push(url);
      return seite(100, 200, true);
    }));
    await mehrAnholen();
    const nachlade = aufrufe[aufrufe.length - 1];
    expect(nachlade).toContain("/api/memories");
    expect(nachlade).toContain("limit=200");
    expect(nachlade).toContain("offset=100");
  });

  it("hängt an statt zu ersetzen — Seite eins bleibt liegen", async () => {
    // Ein Refresh ersetzt den Cache; ein Nachladen darf die ersten hundert nicht wegnehmen, sonst
    // springt die Fläche beim Scrollen an den Anfang.
    const aufrufe: string[] = [];
    tuerMitSeite1(aufrufe);
    await refreshMemories();
    const erste = getMemoriesSync().map((m) => m.id);
    vi.stubGlobal("fetch", vi.fn(async (eingabe: unknown) => {
      const url = String(typeof eingabe === "string" ? eingabe : (eingabe as { url?: string }).url);
      aufrufe.push(url);
      return seite(100, 200, true);
    }));
    await mehrAnholen();
    const jetzt = getMemoriesSync().map((m) => m.id);
    expect(jetzt.slice(0, 100)).toEqual(erste);
    expect(jetzt[100]).toBe("n-100");
  });

  it("nie auf dem schweren Pfad: kein alle=1 in keinem einzigen Abruf", async () => {
    // Verbot 1 des Briefs. Der Fall überlebt einen Rückfall auf `?alle=1`, weil er jede URL sieht.
    const aufrufe: string[] = [];
    tuerMitSeite1(aufrufe);
    await refreshMemories();
    vi.stubGlobal("fetch", vi.fn(async (eingabe: unknown) => {
      const url = String(typeof eingabe === "string" ? eingabe : (eingabe as { url?: string }).url);
      aufrufe.push(url);
      return seite(100, 200, false);
    }));
    await mehrAnholen();
    expect(aufrufe.length).toBeGreaterThan(1);
    expect(aufrufe.some((u) => u.includes("alle=1"))).toBe(false);
  });

  it("legt nach, wenn die Tür keine Kappe mehr meldet, und fragt dann nicht weiter", async () => {
    // `begrenzt` ist der einzige Grund für einen zweiten Abruf. Meldet die Tür die letzte Seite,
    // darf kein Polling laufen — und der Zähler, den Auftrag 3 an die Fläche bindet, muss auf false
    // fallen, damit die Fußzeile „All … entries shown" wieder wahr sein darf.
    const aufrufe: string[] = [];
    tuerMitSeite1(aufrufe);
    await refreshMemories();
    vi.stubGlobal("fetch", vi.fn(async (eingabe: unknown) => {
      const url = String(typeof eingabe === "string" ? eingabe : (eingabe as { url?: string }).url);
      aufrufe.push(url);
      return seite(100, 200, false);
    }));
    await mehrAnholen();
    expect(seiteIstBegrenzt()).toBe(false);
    const vorHer = aufrufe.length;
    const neu = await mehrAnholen();
    expect(neu).toBe(0);
    expect(aufrufe.length).toBe(vorHer);
    expect(bestandGroesse()).toBe(NOTIZ);
  });

  it("zwei Griffe, ein Abruf — der Nachladeweg dedupt sich selbst", async () => {
    // Der Scroll-Beobachter feuert mehrfach (Vorlauf 400 px, jede Rahmen-Änderung). Ohne Dedup
    // stünde die Tür unter Parallelabrufen derselben Seite.
    const aufrufe: string[] = [];
    tuerMitSeite1(aufrufe);
    await refreshMemories();
    vi.stubGlobal("fetch", vi.fn(async (eingabe: unknown) => {
      const url = String(typeof eingabe === "string" ? eingabe : (eingabe as { url?: string }).url);
      aufrufe.push(url);
      return seite(100, 200, true);
    }));
    const vorDerSeite1 = aufrufe.length;
    const beide = await Promise.all([mehrAnholen(), mehrAnholen()]);
    expect(aufrufe.length - vorDerSeite1).toBe(1);
    expect(beide[0]).toBe(beide[1]);
    expect(getMemoriesSync().length).toBe(300);
  });

  it("eine Seite, die nichts bringt, ist eine Sackgasse — kein Wiederholen", async () => {
    // Die Tür meldet `begrenzt: true`, schickt aber leere Knoten. Wer das wiederholt, pollt die
    // Leitung; wer es verschluckt, baut genau den stillen Fang, den der Brief als Zweitbefund nennt.
    const aufrufe: string[] = [];
    tuerMitSeite1(aufrufe);
    await refreshMemories();
    vi.stubGlobal("fetch", vi.fn(async (eingabe: unknown) => {
      const url = String(typeof eingabe === "string" ? eingabe : (eingabe as { url?: string }).url);
      aufrufe.push(url);
      return new Response(JSON.stringify({ count: 0, total: NOTIZ, limit: 200, offset: 100, begrenzt: true, memories: [] }), {
        status: 200,
        headers: { "x-kepta-total": String(NOTIZ), "x-kepta-begrenzt": "1" },
      });
    }));
    const neu = await mehrAnholen();
    expect(neu).toBe(0);
    expect(seitenFehler()).toContain("the page stops here");
    const nachDerSackgasse = aufrufe.length;
    await expect(mehrAnholen()).resolves.toBe(0);
    expect(aufrufe.length).toBe(nachDerSackgasse);
    expect(getMemoriesSync().length).toBe(100);
  });

  it("ein Ausfall der Tür wirft den Grund und lässt den Bestand heil", async () => {
    // Zweiter Satz des Briefs, auf den Hauptbestand übertragen: eine kaputte Antwort ist kein
    // leerer Anfang. Cache bleibt, die Seite bleibt begrenzt gemeldet, der Fall wird weitergereicht.
    const aufrufe: string[] = [];
    tuerMitSeite1(aufrufe);
    await refreshMemories();
    vi.stubGlobal("fetch", vi.fn(async (eingabe: unknown) => {
      const url = String(typeof eingabe === "string" ? eingabe : (eingabe as { url?: string }).url);
      aufrufe.push(url);
      return new Response(JSON.stringify({ error: "boom" }), { status: 500 });
    }));
    await expect(mehrAnholen()).rejects.toThrow(/500/);
    expect(getMemoriesSync().length).toBe(100);
    expect(seiteIstBegrenzt()).toBe(true);
  });
});
