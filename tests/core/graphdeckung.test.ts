// @vitest-environment node
//
// Aufgabe #56, Schnitt 1 bis 3 — die Kern-/Engine-Seite des Graphen.
//
// Ausgangspunkt ist Damians Satz „ich erkenn nix außer 'nem großen Kreis", gemessen
// an seinem echten Bestand (14.702 Notizen, /api/health). Die Tuer liefert dafuer
// 30 Begriffe und 5 Kanten; die Flaeche haelt damit 25 lose Teile und einen Fleck
// aus 6 Knoten. Das ist kein Layout-Fehler: das Kraftfeld legt unverbundene Knoten
// auf einen Kreis. Es fehlt der Inhalt des Netzes.
//
// Fundstelle, an der diese Datei ansetzt: `indexMemory` (src/core/engine.ts:504) ist
// der einzige Punkt, den JEDER Schreibweg passiert — Scan (server/router/scan.ts:336,
// 415, 425, 444), REST (server/router/memories.ts:46, 65, 85), Inbox
// (server/router/inbox.ts:99), Import (server/router/importe.ts:77, 120), Vault
// (src/core/obsidian.ts:168), Sync (src/core/praxissync.ts:208), MCP
// (src/core/mcp.ts:357, 489), ChatGPT-Import (src/core/chatgpt-import.ts:139).
// Der Scan-Zweig ruft danach weder `verknuepfeNotiz` noch `linkEntities`; darum
// standen von 14.702 Notizen genau 32 unter einem Begriff.
//
// Die Begriffe selbst sind nicht erfunden: dieselben Signale, die hier gelesen
// werden, hat der Export des echten Bestands geliefert — 2.511 Notizen mit einer
// Ueberschrift, 694 Begriffe, die in mindestens zwei Notizen stehen.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import request from "supertest";
import { KeptaStore } from "../../src/core/store";
import { indexMemory } from "../../src/core/engine";

process.env.KEPTA_NO_AUTOSTART = "1";
process.env.KEPTA_ENCRYPTION = "off";

let dir = "";
let prevHome: string | undefined;
let store: KeptaStore;
let createApp: typeof import("../../server").createApp;
let app: import("express").Express;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-a1x-deckung-"));
  prevHome = process.env.HOME;
  process.env.HOME = dir;
  process.env.KEPTA_DATA_DIR = dir;
  const { KeptaStore: Store } = await import("../../src/core/store");
  ({ createApp } = await import("../../server"));
  store = new Store(path.join(dir, "t.db")) as unknown as KeptaStore;
  app = createApp(store);
});

afterEach(() => {
  store?.close();
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
  delete process.env.KEPTA_DATA_DIR;
  // Aufgabe #112: 2 312 eigene Ordner unter $TMPDIR an diesem Abend, gemessen 21:27.
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Genau die Folge, die der Rechner-Scan faehrt: anlegen, indexieren, fertig. */
function scanNotiz(titel: string, inhalt: string): string {
  const angelegt = store.createMemory({ title: titel, content: inhalt, tags: ["machine-scan", "md"] });
  indexMemory(store, angelegt.id);
  return angelegt.id;
}

const namen = (g: { entities: { name: string }[] }) => g.entities.map((e) => e.name);

describe("Schnitt 1 — Begriffe aus dem Schreibweg", () => {
  it("eine Ueberschrift wird zum Begriff, auch wenn die Notiz aus dem Scan kommt", () => {
    scanNotiz("Kanzlei Fristen", "# Fristenkontrolle\n\nMontags und donnerstags.");
    expect(namen(store.getGraph())).toContain("fristenkontrolle");
  });

  it("zwei Notizen mit derselben Ueberschrift haengen an einem Begriff — das ist das Netz", () => {
    scanNotiz("Q4 Abschluss", "## Budget\n\nZahlen zum Quartalsende.");
    scanNotiz("Plan 2027", "## Budget\n\nWas im naechsten Jahr gilt.");
    const g = store.getGraph();
    const begriff = g.entities.find((e) => e.name === "budget");
    expect(begriff).toBeDefined();
    const traeger = store.memoryIdsForEntities([begriff!.id]);
    expect(traeger.size).toBe(2);
    // Kein Blatt ohne Kante: der Begriff verbindet die beiden Notiz-Titel.
    expect(g.relations.filter((r) => r.sourceId === begriff!.id || r.targetId === begriff!.id).length).toBeGreaterThanOrEqual(2);
  });

  it("eine Notiz ohne jeden Begriff hinterlaesst nichts — ein Punkt ohne Kante ist kein Netz", () => {
    // Gemessen am 14.000-Notizen-Kunstbestand: jeder Titel als eigener Knoten
    // haelt 14.216 Begriffe fuer einen Bestand, der mit dieser Regel 2.568 hat —
    // lauter Knoten, denen keine Kante folgt.
    // Die Flaeche legt unverbundene Knoten auf einen Kreis — genau der grosse
    // Kreis, den Damian sieht. Ein Blatt ohne Kante gehoert darum nicht ins Netz.
    scanNotiz("Gedanken Notizen", "Heute hat die Kaffeemaschine gestreikt und niemand hat zugehoert.");
    expect(store.graphBestand()).toEqual({ knoten: 0, kanten: 0 });
    expect(namen(store.getGraph())).toEqual([]);
  });

  it("ein Titel mit einem Begriff wird zu einem Knoten, der eine Kante hat", () => {
    scanNotiz("Kanzlei Fristen", "# Fristenkontrolle\n\nMontags und donnerstags.");
    const g = store.getGraph();
    expect(g.relations).toHaveLength(1);
    expect(g.entities).toHaveLength(2); // titel und begriff, ueber die Kante verbunden
  });

  it("die Kantenscheibe liefert nur Kanten zwischen den Begriffen, die sie mitliefert", () => {
    // Zwei unabhaengige Schnitte waren der Fehler: 500 Begriffe nach Traegerzahl,
    // 2 000 Kanten nach Bedeutung — und die Route laesst danach jede Kante fallen,
    // deren Ende nicht mitgeliefert wird (server/router/system.ts:56). Gemessen:
    // 1.593 von 2 000 Kanten auf Damians echtem Bestand, 827 von 2 000 im
    // 14.000-Kunstbestand. Was der Nutzer sieht, ist ein Bruchteil der Zahl, die
    // seine Bilanzzeile nennt.
    //
    // Fixture: 2.000 Einzelblaetter (je ein Begriff, der nur diese eine Notiz
    // nennt) und 40 Notizen, die Budget und Fristen zusammen nennen. Zusammen
    // 2.040 Kanten ueber 4.000 Knoten — beide Scheiben schliessen.
    for (let i = 0; i < 2000; i++) scanNotiz(`blatt ${i}`, `## einmalig ${i}\n\nText.`);
    for (let i = 0; i < 40; i++) scanNotiz(`akte ${i}`, "## Budget\n\n## Fristen\n\nText.");
    expect(store.graphBestand().kanten).toBeGreaterThan(2000);

    const g = store.getGraph();
    expect(g.entities.length).toBe(500);
    const ids = new Set(g.entities.map((e) => e.id));
    const aussen = g.relations.filter((r) => !ids.has(r.sourceId) || !ids.has(r.targetId));
    expect(aussen).toHaveLength(0); // die Scheibe ist in sich geschlossen

    // Die gemeinsamen Begriffe sind die Bedeutungsspitze und bleiben darum drin —
    // auch wenn ihre Notiz-Knoten (ein Titel, eine Traegerin) draussen fallen.
    const budget = g.entities.find((e) => e.name === "budget");
    const fristen = g.entities.find((e) => e.name === "fristen");
    expect(budget).toBeDefined();
    expect(fristen).toBeDefined();
    const amPaar = g.relations.filter(
      (r) => (r.sourceId === budget!.id && r.targetId === fristen!.id) || (r.sourceId === fristen!.id && r.targetId === budget!.id),
    );
    expect(amPaar).toHaveLength(40); // keine der 40 Aussagen ueber dasselbe Paar fehlt
  });

  it("derselbe Begriff per Ueberschrift und per Wiki-Link erhaelt eine Kante, nicht zwei", () => {
    scanNotiz("Mandant Miller", "## Fristen\n\nSiehe auch [[Fristen]].");
    const g = store.getGraph();
    const paare = g.relations.map((r) => [Math.min(r.sourceId, r.targetId), Math.max(r.sourceId, r.targetId)].join(":"));
    expect(paare.length).toBeGreaterThan(0); // ohne Kante waere der Fall leer, nicht bewiesen
    expect(paare.length).toBe(new Set(paare).size);
  });

  it("zweimal indexieren derselben Notiz aendert die Kantenzahl nicht", () => {
    const id = scanNotiz("Vertrag Adler", "## Kuendigung\n\nFrist 3 Monate.");
    const kanten1 = store.getGraph().relations.length;
    scanNotiz("Vertrag Sperling", "## Kuendigung\n\nFrist 6 Monate.");
    expect(store.getGraph().relations.length).toBe(kanten1 + 1); // eine Kante je Notiz, nicht je Paar
    indexMemory(store, id);
    expect(store.getGraph().relations.length).toBe(kanten1 + 1);
  });

  it("zwei Begriffe in derselben Notiz haengen direkt aneinander — daraus entsteht ein Netz", () => {
    // Der Titel einer Notiz ist fuer die Flaeche kein Nachbarn-Knoten: er hat eine
    // einzige Traegerin, faellt also gegen jeden Bedeutungsschnitt durchs Raster,
    // und die Route liefert nur Kanten, deren beide Enden mitgeliefert werden.
    // Ueber den Titel haengen Begriffe darum nie aneinander. Die Notiz selbst ist
    // die Aussage: wer in einem Text Budget und Fristen nennt, hat sie verbunden.
    scanNotiz("Quartalsbericht", "## Budget\n\n## Fristen\n\nText.");
    const g = store.getGraph();
    const budget = g.entities.find((e) => e.name === "budget");
    const fristen = g.entities.find((e) => e.name === "fristen");
    expect(budget).toBeDefined();
    expect(fristen).toBeDefined();
    const direkt = g.relations.some(
      (r) => (r.sourceId === budget!.id && r.targetId === fristen!.id) || (r.sourceId === fristen!.id && r.targetId === budget!.id),
    );
    expect(direkt).toBe(true);
  });

  it("die Paarbildung ist begrenzt: eine Notiz mit vielen Begriffen legt keine Quadratkanten", () => {
    const viele = Array.from({ length: 14 }, (_, i) => `## Sachverhalt ${i + 1}`).join("\n\n");
    scanNotiz("Werkstatt", viele + "\n\nText.");
    const g = store.getGraph();
    // 14 Begriffe: 14 Kanten an den Titel (die Notiz nennt sie alle) + 28 Paare
    // aus den ersten acht. Ohne die Kappe waeren es 14 + 91 = 105 Kanten fuer
    // eine einzige lange Notiz — ein Knotenwerk, das die Scheibe der Flaeche fuellt.
    expect(g.relations).toHaveLength(42);
  });

  it("der REST-Schreibweg liefert denselben Begriff wie der Scan-Weg", async () => {
    await request(app)
      .post("/api/memories")
      .send({ title: "Backup Plan", content: "# Sicherung\n\nTaeglich 3 Uhr.", tags: ["backup"] })
      .expect(200);
    expect(namen(store.getGraph())).toContain("sicherung");
  });
});

describe("Schnitt 2 — was depth tut", () => {
  // Kette: alpha — beta — gamma — delta
  beforeEach(() => {
    const notiz = store.createMemory({ title: "Kette", content: "..." });
    store.addRelation("alpha", "beta", "betreut", notiz.id);
    store.addRelation("beta", "gamma", "betreut", notiz.id);
    store.addRelation("gamma", "delta", "betreut", notiz.id);
  });

  it("mit Startbegriff ist depth ein Horizont: ein Hopf mehr, ein Knoten mehr", () => {
    expect(store.getGraph("alpha", 1).entities).toHaveLength(2);
    expect(store.getGraph("alpha", 2).entities).toHaveLength(3);
    expect(store.getGraph("alpha", 3).entities).toHaveLength(4);
    expect(store.getGraph("alpha", 1).relations).toHaveLength(1);
    expect(store.getGraph("alpha", 3).relations).toHaveLength(3);
  });

  it("ohne Startbegriff tut depth nichts — der Parameter wird im Ganzt-Bestand-Zweig nie gelesen", () => {
    const ohne = store.getGraph();
    for (const tiefe of [1, 2, 3, 4]) {
      expect(store.getGraph(undefined, tiefe).entities).toHaveLength(ohne.entities.length);
      expect(store.getGraph(undefined, tiefe).relations).toHaveLength(ohne.relations.length);
    }
    // Nicht leer: dieselbe Antwort, die die Tuer auf Damians Bestand gibt, ist
    // unter jeder Tiefe bytegleich — gemessen 0/1/2/3/9 auf 5.102 Bytes.
    expect(ohne.entities.length).toBeGreaterThan(0);
  });
});

describe("Schnitt 3 — eine Schluesselnatur", () => {
  beforeEach(() => {
    const notiz = store.createMemory({ title: "Anlage", content: "..." });
    store.linkEntities(notiz.id, ["alpha", "beta"]);
    store.addRelation("alpha", "beta", "betreut", notiz.id);
  });

  it("der Speicher nennt Begriff und Kantenende in derselben Natur: Zahlen", () => {
    const g = store.getGraph();
    const ids = new Set(g.entities.map((e) => e.id));
    expect(g.entities.every((e) => typeof e.id === "number")).toBe(true);
    expect(g.relations.every((r) => ids.has(r.sourceId) && ids.has(r.targetId))).toBe(true);
  });

  it("die Tuer nennt beide Enden zweimal: der Name fuer die Flaeche, die Nummer fuer jeden anderen", async () => {
    const res = await request(app).get("/api/graph?depth=2").expect(200);
    const body = res.body as {
      entities: { id: number; name: string }[];
      relations: Record<string, unknown>[];
    };
    expect(typeof body.entities[0].id).toBe("number");
    expect(typeof body.relations[0].source).toBe("string");
    // #83 (3) hebt den Befund von vorhin auf: die Nummer der Kantenenden ist jetzt
    // mitgeschickt, additiv zum Namen. Der Name bleibt, weil die Flaeche an ihm
    // haengt — ein Rueckweg faellt nicht an.
    expect(typeof body.relations[0].sourceId).toBe("number");
    expect(typeof body.relations[0].targetId).toBe("number");
    const ids = new Set(body.entities.map((e) => e.id));
    expect(ids.has(body.relations[0].sourceId as number), "sourceId zeigt auf keinen gelieferten Knoten").toBe(true);
    expect(ids.has(body.relations[0].targetId as number), "targetId zeigt auf keinen gelieferten Knoten").toBe(true);
  });
});

describe("#83 (4) — eine Kante sagt, WAS sie behauptet", () => {
  it("ein Titel, der einen Begriff nennt, und zwei Begriffe, die zusammen genannt werden, sind nicht dasselbe", () => {
    scanNotiz("Quartalsbericht", "## Budget\n\n## Fristen\n\nText.");
    const g = store.getGraph();
    const namen = new Map(g.entities.map((e) => [e.id, e.name]));
    const wort = (r: { sourceId: number; targetId: number; relation: string }) =>
      [namen.get(r.sourceId), namen.get(r.targetId)].sort().join("|") + " = " + r.relation;
    const titelKante = g.relations.find((r) => namen.get(r.sourceId) === "quartalsbericht" || namen.get(r.targetId) === "quartalsbericht");
    const paarKante = g.relations.find(
      (r) =>
        ((namen.get(r.sourceId) === "budget" && namen.get(r.targetId) === "fristen") ||
          (namen.get(r.sourceId) === "fristen" && namen.get(r.targetId) === "budget")),
    );
    expect(titelKante, `keine Titel-Kante im Schnitt: ${g.relations.map(wort).join(", ")}`).toBeDefined();
    expect(paarKante, `keine Mittraeger-Kante im Schnitt: ${g.relations.map(wort).join(", ")}`).toBeDefined();
    expect(titelKante!.relation, "der Titel, der einen Begriff nennt, ist keine Mitnennung").toBe("mentions");
    expect(paarKante!.relation, "zwei Begriffe in einer Aussage sind keine einfache Erwahnung").toBe("co-mentions");
  });

  it("der Bestand kennt mehr als ein Kantentyp-Wort", () => {
    scanNotiz("Q4 Abschluss", "## Budget\n\n## Fristen\n\nText.");
    scanNotiz("Plan 2027", "## Fristen\n\n## Sicherung\n\nText.");
    const g = store.getGraph();
    const typen = new Set(g.relations.map((r) => r.relation));
    expect([...typen].sort(), `der ganze Schnitt nennt nur: ${[...typen].join(", ")}`).toEqual(["co-mentions", "mentions"]);
  });

  it("zweimal indexieren derselben Notiz schreibt das Label nicht zweimal", () => {
    const id = scanNotiz("Vertrag Adler", "## Kuendigung\n\n## Frist\n\nFrist 3 Monate.");
    const vorher = store.getGraph().relations.filter((r) => r.relation === "co-mentions").length;
    expect(vorher, "ohne Mittraeger-Kante ist der Fall leer").toBeGreaterThan(0);
    indexMemory(store, id);
    indexMemory(store, id);
    const nachher = store.getGraph().relations.filter((r) => r.relation === "co-mentions").length;
    expect(nachher, `${vorher} Mittraeger-Kanten vor dem Neuschreiben, ${nachher} danach`).toBe(vorher);
    // Und die alte Zeile mit dem falschen Wort ist weg, nicht nur doppelt:
    // dieselbe Paar-Ende darf nicht einmal mentions und einmal co-mentions heissen.
    const g = store.getGraph();
    const paare = new Map<string, string[]>();
    for (const r of g.relations) {
      const schluessel = [r.sourceId, r.targetId].sort().join("|");
      paare.set(schluessel, [...(paare.get(schluessel) ?? []), r.relation]);
    }
    const gemischt = [...paare].filter(([, worte]) => new Set(worte).size > 1);
    expect(gemischt.map(([k]) => k), `Paar(e) ${gemischt.map(([k, w]) => k + ":" + w.join("/")).join(", ")} fuehren zwei Worte fuer dieselbe Aussage`).toHaveLength(0);
  });
});
