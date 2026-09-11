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
  /**
   * Zaehlt die Testfaelle statisch — inklusive der Tabellen von it.each.
   *
   * Die erste Fassung zaehlte nur die AUFRUFE. Sobald viel mit it.each
   * gearbeitet wird (die Scan-Regeln pruefen jeden Eintrag ihrer Listen), lag
   * die Laufzeitzahl um mehr als die Haelfte darueber, und der Waechter schlug
   * grundlos an. Eine Tabelle mit sichtbaren Eintraegen wird jetzt gezaehlt;
   * kommt sie aus einer Variablen, bleibt es bei eins — dann untertreibt die
   * Schaetzung, was fuer die Untergrenze die sichere Richtung ist.
   */
  function statischeTestanzahl(): number {
    let summe = 0;

    /** Elemente eines Array-Literals ab der oeffnenden Klammer, sonst null. */
    const tabellenLaenge = (quelle: string, ab: number): number | null => {
      if (quelle[ab] !== "[") return null;
      let tiefe = 0;
      let elemente = 1;
      let inText: string | null = null;
      for (let i = ab; i < quelle.length; i++) {
        const c = quelle[i];
        const davor = quelle[i - 1];
        if (inText) { if (c === inText && davor !== "\\") inText = null; continue; }
        if (c === '"' || c === "'" || c === "`") { inText = c; continue; }
        if (c === "[" || c === "(" || c === "{") tiefe++;
        else if (c === "]" || c === ")" || c === "}") {
          tiefe--;
          if (tiefe === 0) {
            const inhalt = quelle.slice(ab + 1, i).trim();
            return inhalt === "" ? 0 : elemente;
          }
        } else if (c === "," && tiefe === 1) elemente++;
      }
      return null;
    };

    const zaehleDatei = (quelle: string): number => {
      let n = 0;
      const re = /^[ \t]*(?:it|test)(\.each)?\s*\(/gm;
      let m: RegExpExecArray | null;
      while ((m = re.exec(quelle)) !== null) {
        if (!m[1]) { n += 1; continue; }
        const nachKlammer = re.lastIndex;
        const laenge = tabellenLaenge(quelle, nachKlammer);
        n += laenge && laenge > 0 ? laenge : 1;
      }
      return n;
    };

    const lauf = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) lauf(p);
        else if (e.name.endsWith(".test.ts") || e.name.endsWith(".test.tsx")) {
          summe += zaehleDatei(fs.readFileSync(p, "utf-8"));
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
      // Die statische Zaehlung ist eine UNTERGRENZE: ein einziges it.each
      // erzeugt zur Laufzeit so viele Faelle, wie seine Tabelle Zeilen hat.
      // Seit die Scan-Regeln gegen jeden Eintrag ihrer Listen geprueft werden
      // (jede geheime Endung, jeder gesperrte Ordner, jedes lesbare Format),
      // liegt die Laufzeitzahl rund ein Drittel ueber der statischen — mit 25 %
      // Spielraum schlug der Waechter grundlos an.
      //
      // Die tragende Aussage bleibt dieselbe und faengt genau den Fehler, der
      // hier zweimal passiert ist: die Doku darf nie WENIGER behaupten, als
      // statisch dasteht. Die Obergrenze ist nur eine Plausibilitaetsschranke
      // gegen frei erfundene Zahlen.
      expect(zahl, `${datei}: behauptet ${zahl}, statisch gezaehlt ${echt} — die Doku hinkt nach`).toBeGreaterThanOrEqual(echt);
      expect(zahl, `${datei}: behauptet ${zahl}, statisch nur ${echt} — zu hoch gegriffen`).toBeLessThanOrEqual(Math.round(echt * 1.45));
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

// Nachtrag 6.9.2026: dieselbe Drift traf die Routenzahl. Beide READMEs sprachen
// von "23 Routen", tatsaechlich waren es 33 — die Zahl war schon vor dem
// Rechner-Scan zehn Routen alt. Auch sie bekommt jetzt einen Waechter.
describe("Dokumentation: die Routenzahl driftet nicht weg", () => {
  function echteRouten(): number {
    const quelle = lies("server.ts");
    const pfade = new Set<string>();
    const re = /app\.(get|post|put|delete|patch)\(\s*["'`]([^"'`]+)["'`]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(quelle)) !== null) {
      if (m[2] !== "*") pfade.add(m[2]);
    }
    return pfade.size;
  }

  it.each(dateien)("%s nennt die tatsaechliche Zahl der HTTP-Routen", (datei) => {
    const genannt = [...lies(datei).matchAll(/(\d+)\s+(?:routes|Routen)/g)].map((x) => Number(x[1]));
    expect(genannt.length, `${datei} nennt gar keine Routenzahl mehr`).toBeGreaterThan(0);
    const echt = echteRouten();
    for (const zahl of genannt) {
      expect(zahl, `${datei}: behauptet ${zahl} Routen, es sind ${echt}`).toBe(echt);
    }
  });
});

// Nachtrag 6.9.2026: die Waechter deckten Fliesstext ab, nicht die ABZEICHEN.
// Dort standen weiterhin "458 tests" und "coverage 92 %" — beide seit Monaten
// falsch. Und in der Anwendung selbst behauptete die Statusanzeige "92 % Hit@1",
// also genau die Zahl, die aus den READMEs schon entfernt worden war.
describe("Abzeichen und Anwendungstexte behaupten nichts Falsches", () => {
  it.each(dateien)("%s: das Test-Abzeichen nennt die tatsaechliche Zahl", (datei) => {
    const treffer = [...lies(datei).matchAll(/tests-(\d+)%20passing/g)].map((m) => Number(m[1]));
    expect(treffer.length, `${datei} hat kein Test-Abzeichen mehr`).toBeGreaterThan(0);
    const behauptet = [...lies(datei).matchAll(/\*\*(\d+)\s+(?:tests|Tests)\*\*/g)].map((m) => Number(m[1]));
    for (const t of treffer) {
      expect(behauptet, `${datei}: Abzeichen sagt ${t}, Fliesstext sagt ${behauptet.join("/")}`).toContain(t);
    }
  });

  it("keine Datei behauptet mehr 92 % Hit@1", () => {
    // Die Zahl stammte aus einem 25-Anfragen-Korpus, den es nicht mehr gibt.
    const zuPruefen = ["README.md", "README.de.md"];
    for (const datei of zuPruefen) {
      const inhalt = lies(datei);
      const stellen = [...inhalt.matchAll(/.{0,60}92\s*%.{0,40}/g)].map((m) => m[0]);
      for (const stelle of stellen) {
        expect(/hit@?1/i.test(stelle), `${datei} behauptet noch: ${stelle.trim()}`).toBe(false);
      }
    }
  });

  it("CHANGELOG.md hat einen Abschnitt fuer die Version aus package.json", () => {
    // Nachtrag 10.9.2026: 2.10.0 ging ohne Abschnitt hinaus. Die Release-Seite
    // baut ihren Text aus genau diesem Abschnitt — ohne ihn nannte sie keine
    // einzige Aenderung, nur die Installationsanleitung.
    const version = (JSON.parse(lies("package.json")) as { version: string }).version;
    expect(lies("CHANGELOG.md"), `CHANGELOG.md hat keinen Abschnitt "## [${version}]"`).toContain(`## [${version}]`);
  });

});

// Nachtrag 10.9.2026: "Gesamt-Coverage ~91 %" stand in den READMEs, gemessen
// waren 89,0 % der Zeilen — die Zahl war schlicht zu hoch. Seitdem nennen die
// READMEs die Schwellen, die die CI wirklich erzwingt, statt einer
// Momentaufnahme. Dieser Waechter haelt sie an vitest.config.ts fest.
describe("Dokumentation: die genannten Coverage-Schwellen sind die echten", () => {
  const zeilenVon = (z: string) => Number(/\*\*(\d+) %\*\* (?:of lines|der Zeilen)/.exec(z)?.[1]);
  const funktionenVon = (z: string) => Number(/\*\*(\d+) %\*\* (?:of functions|der Funktionen)/.exec(z)?.[1]);

  it.each(dateien)("%s: Abzeichen und Tabelle entsprechen vitest.config.ts", async (datei) => {
    const config = (await import("../vitest.config")).default as unknown as {
      test: { coverage: { thresholds: Record<string, number | Record<string, number>> } };
    };
    const schwellen = config.test.coverage.thresholds;
    const text = lies(datei);
    const abzeichen = /coverage%20gate-%E2%89%A5%20(\d+)%25/.exec(text);
    expect(abzeichen, `${datei} hat kein Abzeichen fuer die Coverage-Schwelle`).toBeTruthy();
    expect(Number(abzeichen![1])).toBe(schwellen.lines);

    const zeilen = text.split("\n");
    const zeileFuer = (anfang: RegExp): string => {
      const z = zeilen.find((l) => anfang.test(l));
      expect(z, `${datei}: keine Tabellenzeile fuer ${anfang}`).toBeTruthy();
      return z ?? "";
    };
    expect(zeilenVon(zeileFuer(/^\| (everything together|alles zusammen) \|/))).toBe(schwellen.lines);
    // Headless-Core: es gibt nur die Global- und die Core-Zeile — GUI-Bereiche
    // leben im kepta-enterprise-Repository und werden dort bewacht.
    for (const bereich of ["src/core"]) {
      const z = zeileFuer(new RegExp("^\\| `" + bereich + "`"));
      const soll = schwellen[`${bereich}/**`] as Record<string, number>;
      expect(zeilenVon(z), `${datei}: ${bereich} — Zeilen`).toBe(soll.lines);
      if (/of functions|der Funktionen/.test(z)) {
        expect(funktionenVon(z), `${datei}: ${bereich} — Funktionen`).toBe(soll.functions);
      }
    }
  });
});
