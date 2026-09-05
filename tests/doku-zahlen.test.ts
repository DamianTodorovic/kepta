import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CORPUS, QUERIES } from "../scripts/eval-corpus";

// Der Korpus wuchs von 30 auf 58 Notizen, die READMEs behaupteten weiter 92 %
// Hit@1 auf 25 Anfragen. Die Zahl war nicht erfunden — sie war nur von gestern.
// Genau so entsteht die Sorte Falschaussage, die einem in einem Kommentarfeld
// um die Ohren fliegt: niemand luegt, die Doku hinkt nur nach.
const wurzel = process.cwd();
const lies = (p: string) => fs.readFileSync(path.join(wurzel, p), "utf-8");
const dateien = ["README.md", "README.de.md"];

// Nachtrag: der Waechter deckte nur die Korpuszahlen ab. Waehrenddessen
// behaupteten beide READMEs "333 Tests" (es waren 463) und "20 kB" (es sind
// 74). Dieselbe Sorte Drift, nur an anderer Stelle — also hier mit abgedeckt.
describe("Dokumentation: Testanzahl und Paketgroesse driften nicht weg", () => {
  // Statisch gezaehlte it/test-Aufrufe liegen leicht unter der Laufzeitzahl,
  // weil it.each mehrere Faelle erzeugt. Deshalb Toleranz statt Gleichheit.
  function statischeTestanzahl(): number {
    let summe = 0;
    const lauf = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) lauf(p);
        else if (e.name.endsWith(".test.ts")) {
          summe += (fs.readFileSync(p, "utf-8").match(/^\s*(?:it|test)(?:\.\w+)?\(/gm) ?? []).length;
        }
      }
    };
    lauf(path.join(wurzel, "tests"));
    return summe;
  }

  it.each(dateien)("%s nennt eine Testanzahl, die zur Wirklichkeit passt", (datei) => {
    const genannt = [...lies(datei).matchAll(/\*\*(\d+)\s+(?:tests|Tests)\*\*/g)].map((m) => Number(m[1]));
    expect(genannt.length, `${datei} nennt gar keine Testanzahl mehr`).toBeGreaterThan(0);
    const echt = statischeTestanzahl();
    for (const zahl of genannt) {
      // 15 % Spielraum: die Doku darf nachhinken, aber nicht um ein Drittel.
      expect(Math.abs(zahl - echt) / echt, `${datei}: behauptet ${zahl}, gezaehlt ${echt}`).toBeLessThan(0.15);
    }
  });

  it.each(dateien)("%s nennt keine Paketgroesse, die um mehr als die Haelfte danebenliegt", (datei) => {
    const gebaut = path.join(wurzel, "npm", "bin", "kepta.js");
    if (!fs.existsSync(gebaut)) return; // ohne Build nichts zu vergleichen
    const echtKb = fs.statSync(gebaut).size / 1024;
    for (const kb of [...lies(datei).matchAll(/(\d+)\s*kB/g)].map((m) => Number(m[1]))) {
      expect(
        Math.abs(kb - echtKb) / echtKb,
        `${datei}: behauptet ${kb} kB, echt ${Math.round(echtKb)} kB`
      ).toBeLessThan(0.5);
    }
  });
});

describe("Dokumentation: Korpusgroessen stimmen mit dem Korpus ueberein", () => {
  it.each(dateien)("%s nennt die richtige Zahl an Notizen und Anfragen", (datei) => {
    const t = lies(datei);
    // Nur pruefen, wo ueberhaupt ueber den Eval-Korpus gesprochen wird.
    const zeilen = t.split("\n").filter((z) => /npm run eval|Eval auf|Eval on a/.test(z));
    expect(zeilen.length).toBeGreaterThan(0);
    const mitGroessen = zeilen.filter((z) => /\d+[- ](note|Notizen)/.test(z));
    for (const z of mitGroessen) {
      const notizen = Number(z.match(/(\d+)[- ](?:note|Notizen)/)?.[1]);
      const anfragen = Number(z.match(/(\d+)[- ](?:quer|Anfragen)/)?.[1]);
      expect(notizen).toBe(CORPUS.length);
      expect(anfragen).toBe(QUERIES.length);
    }
  });

  it.each(dateien)("%s behauptet keine Hit@1-Zahl aus einem alten Korpus mehr", (datei) => {
    // 92 % stammte vom 25-Anfragen-Korpus. Steht die Zahl noch irgendwo neben
    // Hit@1, ist die Doku hinter der Messung zurueckgeblieben.
    expect(lies(datei)).not.toMatch(/Hit@1[^.\n]*\b92\s*%/);
  });
});

describe("Der Korpus selbst", () => {
  it("hat zu jeder Anfrage eine Kategorie und nur gueltige Ziel-IDs", () => {
    const ids = new Set(CORPUS.map((m) => m.id));
    for (const q of QUERIES) {
      expect(q.kategorie).toBeTruthy();
      expect(q.relevant.length).toBeGreaterThan(0);
      for (const r of q.relevant) expect(ids.has(r)).toBe(true);
    }
  });

  it("deckt alle fuenf Anfragekategorien ab", () => {
    const vorhanden = new Set(QUERIES.map((q) => q.kategorie));
    for (const k of ["lexikalisch", "umschreibung", "graph", "temporal", "ablenkung"]) {
      expect(vorhanden.has(k as never)).toBe(true);
    }
  });
});
