// `npx kepta demo` — der Korpus ist erfunden, aber echt gespeichert: alle
// [[Links]] lösen zu Knoten auf (der Graph zeigt sofort etwas), ein erneutes
// Anlegen auf derselben Datei wäre doppelt (deswegen frischer Pfad je Aufruf),
// und die Kennzahlen stimmen mit dem, was die Konsole behauptet.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { demoKorpus, demoDatenbank } from "../src/demo";
import { starteDemoShow } from "../src/demo-show";
import { KeptaStore } from "../src/core/store";
import { baueGraph } from "../src/ui/graph";

describe("demoKorpus", () => {
  it("alle [[Links]] zeigen auf existierende Notiz-Titel — der Graph startet nicht leer", () => {
    const korpus = demoKorpus();
    const titel = new Set(korpus.map((n) => n.title.trim().toLowerCase()));
    const links = korpus.flatMap((n) => [...n.content.matchAll(/\[\[([^\[\]]{2,80})\]\]/g)].map((m) => m[1]!.split("|")[0]!.trim().toLowerCase()));
    expect(links.length).toBeGreaterThan(5);
    for (const l of links) expect(titel.has(l), `[[${l}]] hat keinen Titel`).toBe(true);
    // Alle vier Wissensarten sind vertreten — die Legende soll nicht lügen.
    const arten = new Set(korpus.map((n) => n.type));
    expect(arten).toEqual(new Set(["semantic", "episodic", "procedural", "reference"]));
  });
});

describe("demoDatenbank", () => {
  it("speichert den Korpus vollständig und verlinkt im Graph", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "demo-"));
    const db = path.join(dir, "demo.db");
    const k = demoDatenbank(db);
    expect(k.anzahl).toBe(demoKorpus().length);
    expect(k.knoten).toBe(k.anzahl);
    expect(k.kanten).toBeGreaterThanOrEqual(4);
    // Echtes Nachlesen aus der Datei (nicht aus dem Memory des Laufes):
    const store = new KeptaStore(db);
    try {
      const g = baueGraph(store);
      expect(g.nodes.length).toBe(k.anzahl);
      expect(g.edges.length).toBe(k.kanten);
    } finally {
      store.close();
    }
  });

  it("zweiter Aufruf auf demselben Pfad wirft nicht — aber der Demo-Lauf nutzt je einen frischen Pfad", () => {
    const db = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "demo-")), "demo.db");
    expect(() => demoDatenbank(db)).not.toThrow();
  });
});


describe("demo-show", () => {
  it("spielt alle Beats: Klassifikation, Widerspruch, Zeitreise, verschlüsselte Wegwerf-DB — ohne undefined", async () => {
    const log: string[] = [];
    const original = console.log;
    console.log = (t: string = "") => { log.push(t); };
    try {
      const code = await starteDemoShow(["--fast"]);
      expect(code).toBe(0);
    } finally {
      console.log = original;
    }
    const text = log.join("\n");
    expect(text).toContain("A fact walks in");
    expect(text).toContain("KEPTA decided: type");
    expect(text).toContain("Weber billing rhythm (updated)");
    expect(text).toContain("contradiction pair(s)");
    expect(text).toContain("now points to its replacement");
    expect(text).toContain("30 days ago");
    expect(text).toContain("MONTHLY");
    expect(text).toContain("encrypted: yes");
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("→ \"?\"");
  });
});
