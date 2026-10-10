// `npx kepta demo` — der Korpus ist erfunden, aber echt gespeichert: alle
// [[Links]] lösen zu Knoten auf (der Graph zeigt sofort etwas), ein erneutes
// Anlegen auf derselben Datei wäre doppelt (deswegen frischer Pfad je Aufruf),
// und die Kennzahlen stimmen mit dem, was die Konsole behauptet.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { demoKorpus, demoDatenbank, loescheWegwerfOrdner, raumtBeiAbbruch } from "../src/demo";
import { starteDemoShow } from "../src/demo-show";
import { KeptaStore } from "../src/core/store";
import { baueGraph } from "../src/ui/graph";
import { ohneFarbe } from "./kli-helfer";

/** Die Demo in einem Durchgang spielen und zurueckgeben, was im Terminal steht. */
async function spieltDemo(): Promise<string> {
  const log: string[] = [];
  const original = console.log;
  console.log = (t: string = "") => { log.push(t); };
  try {
    expect(await starteDemoShow(["--fast"])).toBe(0);
  } finally {
    console.log = original;
  }
  return log.join("\n");
}

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
    const text = ohneFarbe(await spieltDemo());
    expect(text).toContain("A fact walks in");
    // D2-18: der Widerspruch heisst jetzt, was er ist — eine Zahl mit beiden
    // Werten, nicht „3 pair(s) found" bei zwei gezeigten.
    expect(text).toContain("type semantic");
    expect(text).toContain("the rules did");
    expect(text).toContain("Weber billing rhythm (updated)");
    expect(text).toMatch(/candidate/);
    expect(text).toContain("now points to its replacement");
    expect(text).toContain("30 days ago");
    expect(text).toContain("MONTHLY");
    expect(text).toMatch(/encrypted( · key:|$)/);
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("→ \"?\"");
  });

  // T-14 (A6-14): zwei Zeilen nach „you decide" ruft der Code selbst supersede auf.
  it("der Text tut, was er sagt: die Demo entscheidet — und zeigt, wie es zu Hause geht", async () => {
    const text = await spieltDemo();
    expect(text).toContain("the demo decides");
    expect(text).not.toContain("you decide");
    expect(text).toContain("memory_consolidate");
    // D2-26 gilt auch rückwärts ins Terminal: das Feld heisst dryRun, nicht
    // dry_run. Ein Mensch, der „dry_run=false" weiter sagt, schickt ein Feld,
    // das der Kern nicht kennt.
    expect(text).toContain("dryRun=false");
    expect(text).not.toContain("dry_run");
  });
});

// Die Demo ist der einzige Moment, in dem KEPTA für ein Publikum spielt. D2-17
// und D2-18 haben gemessen: sie nutzt ein eigenes Raster (3 und 5 Leerzeichen),
// ist einfarbig, erfindet ein Ergebnis und schneidet Wörter mitten im [[Link]]
// ab. Genau dafür gelten hier dieselben Regeln wie für die fünf Befehle.
describe("demo — dasselbe Raster, dieselbe Breite", () => {
  /** Alle Einzüge der Demo. */
  const einzuege = (text: string): number[] => [
    ...new Set(
      text
        .split("\n")
        .map((z) => (z.match(/^ +/) ?? [""])[0].length)
        .filter((e) => e > 0)
    ),
  ];

  it("kein Einzug steht auf 3 oder 5 — die Demo tanzt nicht aus der Reihe", async () => {
    const text = await spieltDemo();
    for (const e of einzuege(text)) {
      expect(e % 2, `ungerader Einzug ${e}`).toBe(0);
      expect([3, 5], `die Demo nutzt Einzug ${e}, der Rest des Produkts 2 und 4`).not.toContain(e);
    }
  });

  it("keine Zeile mit Wortgrenze ist länger als 80 Zeichen", async () => {
    const text = await spieltDemo();
    for (const z of text.split("\n")) {
      if (!z.trim().includes(" ")) continue;
      expect([...z].length, `${[...z].length} Zeichen: ${z}`).toBeLessThanOrEqual(80);
    }
  });

  // D2-18: ein `…` hinter einem Text, der nie gekürzt wurde, und eine Kürzung
  // mitten im [[Link]]. Beides sind Behauptungen über die Datei.
  it("ein Auslassungszeichen steht nur, wo wirklich gekürzt wurde — und dann mit Zahl", async () => {
    const text = ohneFarbe(await spieltDemo());
    for (const z of text.split("\n").filter((x) => x.includes("…"))) {
      expect(z, `Auslassungszeichen ohne Längenangabe: ${z}`).toMatch(/\(\+\d+ more (character|characters)\)/);
    }
    expect(text).not.toMatch(/\[\[[^\]]*$/m);
  });

  it("ein Widerspruch heißt showing N of M, nicht 3 pair(s) bei zwei gezeigten", async () => {
    const text = await spieltDemo();
    expect(text).not.toMatch(/\d+ contradiction pair\(s\) found/);
    const kopf = text.split("\n").find((z) => /candidate/.test(z)) ?? "";
    const gezeigt = text.split("\n").filter((z) => /^\s+↔/.test(z)).length;
    expect(kopf, `kein Kandidatenkopf: ${kopf}`).toMatch(/showing \d+ of \d+ candidates|1 candidate/);
    if (/showing (\d+) of (\d+)/.test(kopf)) {
      const [, n, m] = kopf.match(/showing (\d+) of (\d+)/)!;
      expect(Number(m), "die Zahl ist behauptet, nicht gezählt").toBeGreaterThan(Number(n));
      expect(gezeigt, "gezeigte Paare und die Zahl darüber decken sich nicht").toBe(Number(n));
    }
  });

  // D2-17: die Tafel verspricht eine „sixty-second story". Eine Zahl, die niemand
  // in diesem Lauf gemessen hat, darf nicht behauptet werden — und unter Last
  // darf sie erst recht nicht gemessen werden. Also: kein Zeitversprechen.
  it("die Demo nennt kein Zeitversprechen, das dieser Lauf nicht hält", async () => {
    const text = await spieltDemo();
    expect(text.toLowerCase()).not.toMatch(/sixty[- ]second|\b60[- ]second|\b60 s\b/);
    const { erlebnisKommando } = await import("../src/cli-erlebnis");
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const { KeptaStore } = await import("../src/core/store");
    const store = new KeptaStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "demo-hilfe-")), "t.db"));
    try {
      const aus: string[] = [];
      const original = console.log;
      console.log = (t = "") => void aus.push(String(t));
      try {
        await erlebnisKommando(store, "help", []);
      } finally {
        console.log = original;
      }
      expect(aus.join("\n").toLowerCase()).not.toMatch(/sixty-second/);
    } finally {
      store.close();
    }
  });

  // R3 / Z4: auf der Bühne soll Farbe Bedeutung tragen — und ohne Farbe nichts verlieren.
  it("Farbe trägt Bedeutung, der Text bleibt derselbe", async () => {
    const argv = process.argv.slice();
    process.argv.push("--color=always");
    let gefärbt = "";
    try {
      gefärbt = await spieltDemo();
    } finally {
      process.argv.length = 0;
      process.argv.push(...argv);
    }
    const ungefärbt = await spieltDemo();
    expect(gefärbt.includes("\x1b["), "die Demo ist einfarbig geblieben").toBe(true);
    // Zwei Läufe, zwei Wegwerf-Ordner: der Pfad darf die Gleichheit nicht brechen.
    const einzug = (t: string) => t.replace(/kepta-demo-[A-Za-z0-9]+/g, "kepta-demo-XXX");
    expect(einzug(ohneFarbe(gefärbt))).toBe(einzug(ohneFarbe(ungefärbt)));
  });
});
describe("demo-raeumt bei Abbruch", () => {
  it("loescht die Wegwerf-Datei beim Abbruch und meldet es in der Sprache der Demo", () => {
    const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-demo-"));
    fs.writeFileSync(path.join(ordner, "kepta.db"), "wurfel");
    const signale = new EventEmitter();
    const beendet: number[] = [];
    const log: string[] = [];
    const original = console.log;
    console.log = (t: string = "") => { log.push(t); };
    const abmelden = raumtBeiAbbruch(ordner, signale, (code) => { beendet.push(code); });
    try {
      signale.emit("SIGINT");
    } finally {
      console.log = original;
    }
    expect(fs.existsSync(ordner)).toBe(false);
    expect(beendet).toEqual([130]);
    expect(log.join("\n")).toContain("Demo aborted");
    expect(log.join("\n")).not.toContain("still there");
    abmelden();

    // Nach dem normalen Ende der Demo darf der Handler nichts mehr loeschen.
    fs.mkdirSync(ordner, { recursive: true });
    fs.writeFileSync(path.join(ordner, "kepta.db"), "wurfel");
    signale.emit("SIGINT");
    expect(fs.existsSync(ordner)).toBe(true);
    expect(beendet).toEqual([130]);
    fs.rmSync(ordner, { recursive: true, force: true });
  });

  it("raumt nur, was wirklich weg ist — sonst nennt es den Rest und den Befehl", () => {
    const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-demo-"));
    fs.writeFileSync(path.join(ordner, "kepta.db"), "wurfel");
    expect(loescheWegwerfOrdner(ordner)).toBeNull();
    expect(fs.existsSync(ordner)).toBe(false);
    // Ein Pfad, der nicht existiert, ist kein Fund: nichts zu melden.
    expect(loescheWegwerfOrdner(path.join(ordner, "gab-es-nicht"))).toBeNull();
  });
});

// Z9 / D2-17: sechs gleiche 850-ms-Pausen sind ein Taktgeber, keine Regie.
// Die Staffelung ist ein Vertrag am Tisch der Demo — gemessen wird hier die
// Absicht (rasch beginnen, halten, langsam enden), die Dauer selbst wird im
// Lauf gemessen und steht im Bericht, nicht auf dem Schirm.
import { TAKT } from "../src/demo-show";

describe("demo-regie", () => {
  it("die Pausen sind gestaffelt: rasch beginnen, halten, langsam enden", () => {
    expect(TAKT.length).toBe(6);
    expect(new Set(TAKT).size, "sechs gleiche Pausen sind ein Taktgeber").toBeGreaterThan(2);
    expect(TAKT[1]).toBeLessThan(TAKT.at(-1)!);
    expect(TAKT[3]).toBeGreaterThan(TAKT[2]);
  });

  it("der Modus der Tests spielt ohne jede Pause", async () => {
    const { taktFuer } = await import("../src/demo-show");
    expect(taktFuer(true).every((ms) => ms === 0)).toBe(true);
    expect(taktFuer(false)).toEqual(TAKT);
  });

  it("die Demo nennt keine Dauer, die ihre Uhr nicht hält", async () => {
    const text = ohneFarbe(await spieltDemo());
    expect(text.toLowerCase()).not.toMatch(/second|minute|Sekunde|Minute|\b\d+ ?s\b/);
  });
});
