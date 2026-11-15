// @vitest-environment node
//
// Punkt 124b — die Haufen-Groessenordnung ueber dem **ganzen** Bestand, nicht im Fenster.
//
// Warum diese Datei den Kern nicht nochmal testet: `tests/lib/gemeinschaften.test.ts` (21 Faelle)
// und `tests/lib/gemeinschaften-bild.test.ts` (24 Faelle) decken Louvain schon ab — zwei Clans,
// Staub als eigner Haufen, Wiederholbarkeit, 3 000 Knoten unter zwei Sekunden. Neu ist allein die
// **Kappen-freie Menge** aus dem Bestand und die **Tuer**, die ihre Grundgesamtheit nennt.
//
// Was die Tuer bisher liefert, ist ein Ausschnitt: `GRAPH_FENSTER_KNOTEN = 500`
// (src/core/store.ts:42, Schleife :1366-1393) und 2 000 Kanten — gemeldet gegen 2 756 Begriffe an
// seinem echten Bestand (store.ts:1329). Ein Haufen, der nur im Fenster sichtbar ist, sagt nichts
// ueber die Groesse der Haufen. Die ganze Geschichte steht in der Mappe:
// `feldzug/AUFTRAG-124b-3010.md` und `feldzug/BAU-124B-HAUFEN-3010.md`.
//
// Die Latte, um die es geht, ist die eigne: `REGAL_DECKEL_PROZENT = 10`
// (src/lib/graphHierarchy.ts:680) — ein Fach ueber zehn Prozent ist ein Korb, keine Teilung.
//
// FIXTURE-REGEL, aus dem Schwesternblatt (gemeinschaften.test.ts:137) gelernt: Modularitaet zerlegt
// dichte Bloecke feiner, als ein Mensch zwei Haelften sieht. Die **Zahl** der Haufen ist darum hier
// nirgends exakt behauptet — gefordert wird, was auch eine Zerlegung nicht retten kann: die
// Groessen-Bindung an die Grundgesamtheit, die Obergrenze einer Komponente, und das Ja/Nein der
// Latte. Ein Fall, der die Krankheit nicht ausdruecken kann, ist kein Fall — darum fuellen zwei
// Bestaende dieselbe Sonde: einer, der die Latte **erfuellt**, und einer mit einem Korb, der sie
// **bricht**.
//
// Ein Horcher pro Datei auf 127.0.0.1:8843 und :8844 — nie request(app).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";
import { indexMemory } from "../src/core/engine";
import { createApp } from "../server/app";
import { lauscht, niederlegen } from "./helfer/lauscher";

interface HaufenAntwort {
  ok: boolean;
  grundgesamtheit: {
    notizen: number;
    begriffe: number;
    kanten: number;
    erwaehnungen: number;
    behauptungen: number;
    gerechneteKnoten: number;
    notizenOhneBegriff: number;
  };
  fenster: { begrenzt: boolean; grund: string };
  haufen: {
    anzahl: number;
    anzahlOhneNotiz: number;
    groesstesFach: { notizen: number; prozent: number };
    median: number;
    groessenVerteilung: { notizen: number; haufen: number }[];
    summenKontrolle: { notizen: number; stimmt: boolean };
  };
  deckel: { latteProzent: number; erfuellt: boolean; grund: string };
  zeit: { ms: number; ausCache: boolean };
  hinweis: string;
}

/** Ein Wort, das in keiner Auskunft der Tuer stehen darf, weil es nur in einer Notiz steht. */
const KANARIE = "bananenrepublik-geheim";

function notizen(familien: number, jeFamilie: number, staub: number): { titel: string; inhalt: string }[] {
  const out: { titel: string; inhalt: string }[] = [];
  for (let f = 0; f < familien; f++) {
    for (let j = 0; j < jeFamilie; j++) {
      out.push({
        // Zwei Ueberschriften, die in allen Notizen derselben Familie gleich sind: sie geben
        // die gemeinsame Kante. Der Titel ist je Notiz anders und haengt als eigner Begriff
        // nur an dieser einen Notiz (src/core/store.ts:1237).
        titel: `familie ${f} blatt ${j}`,
        inhalt: `## haufen-${f}-nord\n\n## haufen-${f}-sued\n\nText. ${KANARIE}`,
      });
    }
  }
  for (let s = 0; s < staub; s++) {
    // Kein Titel-Wort, keine Ueberschrift, kein Wiki-Link: `verknuepfeNotiz` laesst eine Notiz
    // ohne Begriffe ohne jede Kante (src/core/store.ts:1236), und genau so haengen an seinem
    // echten Bestand 95 % der Notizen im Netz (1 018 von 21 066 gedeckt, gemeldet 15.10.).
    // Eine Notiz mit einer einzigen Ueberschrift ist uebrigens KEIN Staub: der Titel wird zum
    // Begriff und bekommt eine "mentions"-Kante — das ist die Form, die dieser Fall zuerst
    // verfehlt hat, und warum er rot war.
    out.push({ titel: `staub ${s}`, inhalt: `Text ohne jede Ueberschrift. ${KANARIE}` });
  }
  return out;
}

interface Kapsel {
  urle: string;
  store: KeptaStore;
  namen: string[];
  schliessen: () => Promise<void>;
}

async function kapsel(ordnerName: string, port: number, liste: { titel: string; inhalt: string }[]): Promise<Kapsel> {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), ordnerName));
  const vorherHeim = process.env.HOME;
  const vorherDaten = process.env.KEPTA_DATA_DIR;
  process.env.HOME = wurzel;
  process.env.KEPTA_DATA_DIR = wurzel;
  const store = new KeptaStore(path.join(wurzel, "kepta.db"), defaultExtensions());
  const namen: string[] = [];
  for (const n of liste) {
    const angelegt = store.createMemory({ title: n.titel, content: n.inhalt, tags: ["machine-scan", "md"] });
    indexMemory(store, angelegt.id);
    namen.push(angelegt.id);
  }
  const horcher = await lauscht(createApp(store), port);
  process.env.HOME = vorherHeim;
  process.env.KEPTA_DATA_DIR = vorherDaten;
  return {
    urle: horcher.urle,
    store,
    namen,
    schliessen: async () => {
      await niederlegen(horcher.server);
      store.close();
      fs.rmSync(wurzel, { recursive: true, force: true });
    },
  };
}

async function haufen(urle: string): Promise<{ status: number; leib: HaufenAntwort; text: string }> {
  const res = await fetch(`${urle}/api/graph/haufen`);
  const text = await res.text();
  return { status: res.status, leib: JSON.parse(text) as HaufenAntwort, text };
}

/** Die Summe der Haefung muss die Grundgesamtheit sein — sonst ist die Verteilung ein Ausschnitt. */
const summeDerVerteilung = (antwort: HaufenAntwort): number =>
  antwort.haufen.groessenVerteilung.reduce((s, f) => s + f.notizen * f.haufen, 0);

let eng: Kapsel; // 8 Familien zu 20 Notizen + 200 Staub: ein Bestand, der teilt
let korb: Kapsel; // eine Familie zu 400 Notizen + 40 Staub: ein Bestand mit einem Korb

beforeAll(async () => {
  eng = await kapsel("kepta-haufen-eng-", 8843, notizen(8, 20, 200));
  korb = await kapsel("kepta-haufen-korb-", 8844, notizen(1, 400, 40));
});

afterAll(async () => {
  if (eng) await eng.schliessen();
  if (korb) await korb.schliessen();
});

describe("H-1 — die Haufen-Tuer nennt ihre Grundgesamtheit und ist kein Fenster", () => {
  it("antwortet, und das Feld ist der ganze Bestand: Notizen plus Begriffe = gerechnete Knoten", async () => {
    const { status, leib } = await haufen(eng.urle);
    expect(status).toBe(200);
    expect(leib.ok).toBe(true);
    expect(leib.grundgesamtheit.notizen).toBe(360);
    expect(leib.grundgesamtheit.gerechneteKnoten).toBe(
      leib.grundgesamtheit.notizen + leib.grundgesamtheit.begriffe
    );
    // Der Auszug ueber die Kanten ist gegen den Bestand gerechnet, nicht gegen das Fenster:
    // 8 Familien zu je einer co-mentions-Kante und drei Kanten je Notiz (2 Paare Titel-Begriff
    // plus das Paar der Begriffe) = 480, und jede getragene Notiz hat ihre Erwahnungen.
    expect(leib.grundgesamtheit.kanten).toBe(eng.store.graphBestand().kanten);
    expect(leib.grundgesamtheit.behauptungen).toBe(480);
  });

  it("nennt die Zahl, die kein Haufen erreichen kann: Notizen ohne jede Kante", async () => {
    const { leib } = await haufen(eng.urle);
    expect(leib.grundgesamtheit.notizenOhneBegriff).toBe(200);
  });

  it("sagt ausdruecklich, dass sie nicht begrenzt ist", async () => {
    const { leib } = await haufen(eng.urle);
    expect(leib.fenster.begrenzt).toBe(false);
    expect(leib.fenster.grund.length).toBeGreaterThan(0);
  });

  it("die Verteilung ist verlustfrei: ihre Summe ist die Grundgesamtheit, nicht ein Teil", async () => {
    const { leib } = await haufen(eng.urle);
    expect(summeDerVerteilung(leib)).toBe(leib.grundgesamtheit.notizen);
    expect(leib.haufen.summenKontrolle.stimmt).toBe(true);
    expect(leib.haufen.summenKontrolle.notizen).toBe(leib.grundgesamtheit.notizen);
  });
});

describe("H-2 — dieselbe Sonde: Latte erfuellen und Latte brechen", () => {
  it("an acht Familien zu zwanzig Notizen erfuellt sie die eigne Deckel-Regel", async () => {
    const { leib } = await haufen(eng.urle);
    // Kein Haufen kann mehr Notizen tragen als seine Komponente: 20. Und die 200 Staub-Notizen
    // sind je ein Haufen fuer sich — also mindestens 8 + 200, wenn nichts zusammenhaelt.
    expect(leib.haufen.groesstesFach.notizen).toBeLessThanOrEqual(20);
    expect(leib.haufen.anzahl).toBeGreaterThanOrEqual(208);
    expect(leib.haufen.groessenVerteilung.some((f) => f.notizen === 1 && f.haufen >= 200)).toBe(true);
    expect(leib.deckel.latteProzent).toBe(10);
    expect(leib.haufen.groesstesFach.prozent).toBeLessThanOrEqual(10);
    expect(leib.deckel.erfuellt).toBe(true);
    // Und genau hier liegt der Betrug, den diese Auskunft nicht verkaufen darf: die Latte ist
    // erfuellt, weil 200 von 360 Notizen als Staub einzeln dastehen (Median 1). Die Tuer muss
    // das in ihrem eignen Grund sagen, sonst ist das Ja ein Verkaufsargument.
    expect(leib.haufen.median).toBe(1);
    expect(leib.deckel.grund).toContain("as dust, not as a division");
  });

  it("an einem Bestand mit einem Korb sagt dieselbe Sonde Nein — der Biss-Test", async () => {
    const { leib } = await haufen(korb.urle);
    expect(leib.grundgesamtheit.notizen).toBe(440);
    expect(leib.grundgesamtheit.notizenOhneBegriff).toBe(40);
    // 400 Notizen haengen an denselben zwei Begriffen — und Louvain zerlegt diesen Block, das
    // ist an diesem Lauf gemessen (13:08:59): groesster Haufen 65 Notizen, also 14,77 % gegen
    // eine Latte von 10. Was hier stehen muss, ist das Urteil ueber die Achse, nicht eine
    // Haufengroesse, die der Kern nicht verspricht (gemeinschaften.test.ts:137 lehrt dasselbe).
    expect(leib.haufen.anzahl).toBeGreaterThanOrEqual(2);
    expect(leib.haufen.groesstesFach.prozent).toBeGreaterThan(10);
    expect(leib.deckel.erfuellt).toBe(false);
    expect(leib.deckel.grund).toContain("10");
    expect(summeDerVerteilung(leib)).toBe(440);
  });

  it("die Grundgesamtheit steht in der gesprochenen Zahl, nicht nur in einem Feld", async () => {
    const { leib } = await haufen(korb.urle);
    expect(leib.hinweis).toContain("440");
    expect(leib.hinweis).toContain(String(leib.haufen.groesstesFach.notizen));
  });

  it("eine neue Notiz aendert die Auskunft — der Cache haelt nicht den alten Stand", async () => {
    const vorher = (await haufen(korb.urle)).leib;
    const angelegt = korb.store.createMemory({
      title: "staub nachtrag",
      content: `Text ohne jede Ueberschrift. ${KANARIE}`,
      tags: ["machine-scan", "md"],
    });
    indexMemory(korb.store, angelegt.id);
    const nachher = (await haufen(korb.urle)).leib;
    expect(nachher.grundgesamtheit.notizen).toBe(vorher.grundgesamtheit.notizen + 1);
    expect(nachher.grundgesamtheit.notizenOhneBegriff).toBe(vorher.grundgesamtheit.notizenOhneBegriff + 1);
  });
});

describe("H-3 — die Auskunft traegt Zahlen, keinen Inhalt", () => {
  it("kein Wort aus einer Notiz und keine Kennung verlaesst die Tuer", async () => {
    const { text, leib } = await haufen(eng.urle);
    expect(text).not.toContain(KANARIE);
    // Auch nicht die Begriffsnamen selbst: die Verteilung ist eine Haefung, keine Liste.
    expect(text).not.toContain("haufen-3-nord");
    expect(text).not.toContain("familie 0 blatt 0");
    for (const id of eng.namen.slice(0, 5)) expect(text).not.toContain(id);
    expect(text).not.toMatch(/[0-9a-f]{24,}/);
    // Und die Antwort ist ein Objekt aus Zahlen — kein Feld haelt eine Liste von Kennungen.
    const listen = Object.values(leib).filter((v) => Array.isArray(v)) as unknown[][];
    expect(listen.every((l) => l.every((e) => e === null || typeof e !== "object" || !("mitglieder" in (e as object))))).toBe(true);
  });

  it("die Antwort nennt eine Zeit, und ob sie gerechnet oder geholt wurde", async () => {
    const erste = await haufen(eng.urle);
    const zweite = await haufen(eng.urle);
    expect(erste.leib.zeit.ms).toBeGreaterThanOrEqual(0);
    expect(zweite.leib.zeit.ausCache).toBe(true);
  });
});
