import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CORPUS, QUERIES } from "../scripts/eval-corpus";

// Der Korpus wuchs von 30 auf 58 Notizen, die READMEs behaupteten weiter 92 %
// Hit@1 auf 25 Anfragen. Die Zahl war nicht erfunden — sie war nur von gestern.
// Genau so entsteht die Sorte Falschaussage, die einem in einem Kommentarfeld
// um die Ohren fliegt: niemand luegt, die Doku hinkt nur nach.
const wurzel = process.cwd();
const lies = (p: string) => {
  const aufgeloest = path.resolve(wurzel, p);
  if (!aufgeloest.startsWith(wurzel + path.sep)) throw new Error(`Unexpected file: ${p}`);
  return fs.readFileSync(aufgeloest, "utf-8");
};
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

  it("README.md zeigt die Version aus package.json als Badge", () => {
    // Nachtrag 22.9.2026: das Badge zeigte 2.13.4, die Pakete waren bei 2.13.11 —
    // dieselbe Sorte Drift wie die Testzahlen, nur ohne Waechter.
    const version = (JSON.parse(lies("package.json")) as { version: string }).version;
    expect(lies("README.md"), `README.md-Badge zeigt nicht ${version}`).toContain(`badge/version-${version}-blue`);
  });

  it("die READMEs nennen die Coverage-Schwellen aus vitest.config.ts", async () => {
    // Der Kommentar am Ende dieser Datei versprach seit 10.9. einen Waechter fuer
    // die Schwellen — geschrieben wurde er nie, und "coverage 92 %" stand
    // monatelang in den READMEs. Jetzt wirklich: verglichen wird mit dem
    // importierten Config-Objekt, nicht mit einer zweiten Regex-Paraphrase davon.
    const cfg = (await import("../vitest.config")).default as {
      test?: {
        coverage?: {
          thresholds?: {
            lines?: number;
            functions?: number;
            branches?: number;
            statements?: number;
            "src/core/**"?: { lines?: number; functions?: number; branches?: number; statements?: number };
          };
        };
      };
    };
    const schw = cfg.test?.coverage?.thresholds;
    if (!schw) throw new Error("vitest.config.ts hat keine Coverage-Schwellen mehr — Waechter anpassen");
    const kern = schw["src/core/**"];
    if (!kern) throw new Error("vitest.config.ts hat keine src/core-Schwellen mehr — Waechter anpassen");
    const arten = ["lines", "functions", "branches", "statements"] as const;
    const mass = [
      ...arten.map((k) => ({ bereich: "alles zusammen", k, wert: Number(schw[k]) })),
      ...arten.map((k) => ({ bereich: "src/core", k, wert: Number(kern[k]) })),
    ];
    // Eine fehlende Spalte würde als NaN laufen und dann eine RegExp nach "NaN %"
    // erzeugen — die Meldung fuehrt in die Irre, weil sie dem README die Schuld gibt.
    for (const m of mass) {
      expect(Number.isFinite(m.wert), `vitest.config.ts liefert fuer ${m.bereich}/${m.k} keine Zahl`).toBe(true);
    }
    for (const datei of dateien) {
      const inhalt = lies(datei);
      for (const m of mass) {
        expect(
          new RegExp(`${m.wert}\\s*%`).test(inhalt),
          `${datei} nennt die Schwelle ${m.wert} % (${m.bereich}, ${m.k}) nicht mehr`
        ).toBe(true);
      }
      // Und der Scope: diese Zahlen gelten nur fuer den gemessenen Teil des Repos.
      expect(inhalt, `${datei} erklaert nicht, was ueberhaupt gemessen wird`).toMatch(/src\/core\/\*\*[^|]*server\.ts/);
    }
  });

  it("jede Cache-Sekunde in den READMEs liegt als Record in tools/latenz/ergebnisse", () => {
    // "warmer Such-Cache 0,74 s" stand in beiden READMEs und in keinem JSON —
    // damit verletzte die Seite genau die Regel, die tools/latenz/README.md
    // selbst aufstellt. Der Waechter gilt nicht rueckwirkend fuer CHANGELOG
    // (Geschichte), aber fuer alles, was neu behauptet wird.
    const ordner = path.join(wurzel, "tools", "latenz", "ergebnisse");
    const belegteSekunden = new Set<string>();
    for (const datei of fs.readdirSync(ordner).filter((f) => f.endsWith(".json"))) {
      const record = JSON.parse(lies(path.join("tools", "latenz", "ergebnisse", datei))) as {
        suche?: { warmupErsteAbfrageMs?: unknown };
      };
      const w = record.suche?.warmupErsteAbfrageMs;
      if (typeof w === "number") belegteSekunden.add((w / 1000).toFixed(2));
    }
    const cacheZeile = /cache|ingest|einspeisen/i;
    for (const datei of dateien) {
      for (const zeile of lies(datei).split("\n")) {
        if (!cacheZeile.test(zeile)) continue;
        for (const sekunde of zeile.matchAll(/(\d+(?:[.,]\d+)?)\s?s\b/g)) {
          const wert = Number(sekunde[1].replace(",", "."));
          const gemeldet = Number.isFinite(wert) ? wert.toFixed(2) : "";
          expect(
            belegteSekunden.has(gemeldet),
            `${datei} behauptet ${sekunde[0]} am Such-Cache, ohne dass ein Record in tools/latenz/ergebnisse diese Warmup-Zahl haelt`
          ).toBe(true);
        }
      }
    }
  });

});

// Nachtrag 2.10.2026: die Wurzel-READMEs sind nicht die einzige Doku, die eine
// Zahl in die Welt setzt. tools/longmemeval/README.md behauptete "9 Tests in
// tests/longmemeval.test.ts" — die Datei existierte nie, und dieser Waechter sah
// sie nicht, weil er nur README.md/README.de.md kannte. Also: auch die
// Werkzeug-Dokus werden jetzt gelesen, und die lauteste Zahl des Repos
// (61,5 %) haengt an ihrem Record statt an einem Absatz, den niemand mehr liest.

describe("Dokumentation: Werkzeug-Dokus verweisen nur auf echte Tests", () => {
  const werkzeugDokus = (): string[] =>
    fs
      .readdirSync(path.join(wurzel, "tools"), { withFileTypes: true })
      .filter((eintrag) => eintrag.isDirectory())
      .map((eintrag) => path.join("tools", eintrag.name, "README.md"))
      .filter((pfad) => fs.existsSync(path.join(wurzel, pfad)));

  /** Statische it()/test()-Aufrufe — fuer eine einzelne Datei ohne it.each exakt. */
  function zaehleTests(dateiPfad: string): number {
    const quelle = lies(dateiPfad);
    return [...quelle.matchAll(/^\s*(?:it|test)(?:\.\w+)?\(/gm)].length;
  }

  it("es gibt ueberhaupt Werkzeug-Dokus, sonst prueft das hier nichts", () => {
    expect(werkzeugDokus().length).toBeGreaterThan(0);
  });

  it.each(werkzeugDokus())("%s: jedes genannte Testfile existiert, jede Zahl stimmt", (datei) => {
    for (const treffer of lies(datei).matchAll(/(?:(\d+)\s+)?Tests? in \[?`?(tests\/[\w./-]+\.test\.ts)`?\]?/g)) {
      const pfad = treffer[2];
      const zahl = treffer[1] ? Number(treffer[1]) : null;
      expect(fs.existsSync(path.join(wurzel, pfad)), `${datei} verweist auf ${pfad} — die Datei gibt es nicht`).toBe(true);
      if (zahl !== null) {
        expect(zaehleTests(pfad), `${datei} behauptet ${zahl} Tests in ${pfad}, dort stehen ${zaehleTests(pfad)}`).toBe(zahl);
      }
    }
  });

  it("die Werkzeuge haben testbare Dateien, die der Waechter oben wirklich sieht", () => {
    // Ohne diesen Anker lief der obige Durchlauf still ins Leere, sobald jemand
    // das Verweisformat in einer Doku aendert — und die Phantomdatei waere wieder
    // unerwaehnt. tools/latenz nennt suchcache, tools/longmemeval die Harness.
    const genannt = werkzeugDokus().flatMap((datei) =>
      [...lies(datei).matchAll(/(tests\/[\w./-]+\.test\.ts)/g)].map((m) => m[1])
    );
    expect(new Set(genannt).size).toBeGreaterThanOrEqual(2);
    for (const pfad of genannt) {
      expect(fs.existsSync(path.join(wurzel, pfad)), `${pfad} wird in einer Werkzeug-Doku genannt und fehlt`).toBe(true);
    }
  });
});

describe("Dokumentation: der LongMemEval-Wert haengt an seinem Record", () => {
  type Spur = { datei: string; genauigkeit: number; verbatim: number; fragen: number };

  /**
   * Der beste Lauf ueber den VOLLEN Split — die Zahl, die in den READMEs stehen
   * muss. Der groesste Fragenwert entscheidet, nicht eine eingetippte 500: die
   * 10-Fragen-Pilotserie liegt mit 65 % ueber dem 500er-Besten und waere ohne
   * diese Beschraenkung die Referenz.
   */
  function besterRecord(): Spur {
    const ordner = path.join(wurzel, "tools", "longmemeval", "ergebnisse");
    const laeufe: Spur[] = [];
    for (const name of fs.readdirSync(ordner).filter((f) => f.endsWith(".json"))) {
      const { bericht } = JSON.parse(lies(path.join("tools", "longmemeval", "ergebnisse", name))) as {
        bericht?: { genauigkeit_gesamt?: unknown; verbatim_quote?: unknown; fragen?: unknown };
      };
      const genauigkeit = Number(bericht?.["genauigkeit_gesamt"]);
      const fragen = Number(bericht?.["fragen"]);
      if (!Number.isFinite(genauigkeit) || !Number.isFinite(fragen) || fragen <= 0) continue;
      const verbatim = Number(bericht?.["verbatim_quote"]);
      laeufe.push({ datei: name, genauigkeit, fragen, verbatim: Number.isFinite(verbatim) ? verbatim : 0 });
    }
    expect(laeufe.length, "kein Record in tools/longmemeval/ergebnisse — woher nimmt die Doku dann 61,5 %?").toBeGreaterThan(0);
    const voll = Math.max(...laeufe.map((lauf) => lauf.fragen));
    return laeufe.filter((lauf) => lauf.fragen === voll).sort((a, b) => b.genauigkeit - a.genauigkeit)[0];
  }

  /** 0.615 -> ["61.5", "61,5"] — beide Schreibweisen sind in den READMEs erlaubt. */
  const schreibweisen = (wert: number): string[] => {
    const punkt = (wert * 100).toFixed(1);
    return [punkt, punkt.replace(".", ",")];
  };

  const prozentFester = (form: string): RegExp => new RegExp(`${form.replace(".", "\\.")}\\s*%`);

  it.each(dateien)("%s nennt den Bestwert und die Verbatim-Quote aus dem Record", (datei) => {
    const record = besterRecord();
    const inhalt = lies(datei);
    const forms = schreibweisen(record.genauigkeit);
    expect(
      forms.some((form) => prozentFester(form).test(inhalt)),
      `${datei} nennt keinen der Bestwerte ${forms.join(" / ")} % — Referenz ist der volle Lauf ${record.datei}`
    ).toBe(true);
    const quote = schreibweisen(record.verbatim);
    expect(
      quote.some((form) => prozentFester(form).test(inhalt)),
      `${datei} behaelt ${quote.join(" / ")} % Wörtlich-Treffer vor, der Record (${record.datei}) sagt etwas anderes`
    ).toBe(true);
  });

  it.each(dateien)("%s rahmt die Zahl, statt sie gegen Zep zu setzen", (datei) => {
    // Der Reiz an "96 % von Zep" war, dass er zwei verschiedene Metriken
    // gleichklingen liess. Die READMEs nennen Zep weiterhin — aber nur noch mit
    // dem Unterschied dabei, und mit dem In-Sample-Einwand.
    const inhalt = lies(datei);
    expect(inhalt, `${datei} sagt nicht, was die 61,5 % messen`).toMatch(/context sufficiency|Kontext-Suffizienz/i);
    expect(inhalt, `${datei} verschweigt, dass kein Generator-LLM antwortet`).toMatch(/no generator LLM|kein Generator-LLM/i);
    expect(inhalt, `${datei} verschweigt das In-Sample-Tuning`).toMatch(/in-sample/i);
    for (const zeile of inhalt.split("\n")) {
      if (!zeile.includes("63.8") && !zeile.includes("63,8")) continue;
      expect(
        zeile,
        "Zeile nennt Zeps 63,8 %, ohne den Metrikunterschied dazu — ein Vergleich ohne Rahmen ist die Behauptung von WP 4"
      ).toMatch(/not the same metric|nicht dieselbe Metrik/);
    }
  });

  it("tools/longmemeval/README.md steht der Holdout-Einwand", () => {
    const inhalt = lies(path.join("tools", "longmemeval", "README.md"));
    expect(inhalt, "Die Eval-Doku erwaehnt nicht, dass jeder Hebel auf dem Testset gewaehlt wurde").toMatch(/Kein Holdout/i);
    expect(inhalt, "Die Eval-Doku erwaehnt den umgekehrten Abstention-Fall nicht").toMatch(/abstention/i);
    expect(inhalt, "Der Runner hat --offset, die Doku nicht").toMatch(/`--offset/);
  });
});

// Nachtrag 2.10.2026: in einer CHANGELOG-Zeile stand ein Befehl, dessen letztes
// "a" ein kyrillisches war — für das Auge identisch, beim Kopieren ein
// Kommando, das nicht existiert. Nach dem dritten Artefakt dieser Sorte (zuvor
// CJK in einem Kommentar) ist die Frage nicht "kann das passieren", sondern
// "wer schaut nachts drauf". Markdown-Dokus sind der Text, den Nutzer
// kopieren — also diese Dateien, ohne Ausnahmen.
describe("Dokumentation: keine Fremdalphabet-Artefakte", () => {
  // Umlaute und ß sind lateinisch und erlaubt; Kyrillisch, Han und Kana waren in
  // diesem Repo bisher immer ein Tipp-Artefakt.
  const artefakt = /\p{Script=Cyrillic}|\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u;
  const dokumente = [
    "README.md",
    "README.de.md",
    "CHANGELOG.md",
    "SECURITY.md",
    "LICENSE",
    "tools/longmemeval/README.md",
    "tools/latenz/README.md",
  ];

  it("die Doku-Liste ist nicht leer gelaufen", () => {
    for (const datei of dokumente) expect(fs.existsSync(path.join(wurzel, datei)), `${datei} fehlt`).toBe(true);
  });

  it.each(dokumente)("%s enthaelt keine Zeichen aus einem Fremdalphabet", (datei) => {
    const funde = lies(datei)
      .split("\n")
      .flatMap((zeile, i) => {
        const treffer = zeile.match(artefakt);
        return treffer ? [`${i + 1}: ${treffer[0]}`] : [];
      });
    expect(
      funde.length === 0,
      `${datei} hat Zeilen mit fremdem Alphabet (${funde.join(", ")}) — kopierbarer Text darf kein Zeichen enthalten, das nicht zum Alphabet gehört`
    ).toBe(true);
  });
});

// Nachtrag 3.10.2026: der Faktenaudit auf der oeffentlichen Seite fand zwei
// Saetze, die genau die Regel brachen, die das Repo sonst selbst aufstellt.
// "Encrypted at rest the whole time" stand UEBER den Latenz-Records, deren
// eigenes Feld konfiguration.verschluesselung sagt "aus (…Klartext)". Und
// "every question, every answer … is committed" — die committeten Zeilen haben
// die Schluessel question_id, typ, faehigkeit, urteil, treffer, trefferIndex,
// verbatim, judge_aufrufe. Kein Frage-Text, kein Antwort-Text. Beide Saetze
// waren nicht erfunden, sie waren nur zu breit. Deshalb jetzt: Waechter, die
// den Anspruch an das Feld in den Records haengen.
describe("Dokumentation: Messbedingungen und Committens stehen so im Text, wie die Records sie haben", () => {
  const latenzOrdner = path.join(wurzel, "tools", "latenz", "ergebnisse");
  const latenzRecords = (): string[] =>
    fs.readdirSync(latenzOrdner).filter((f) => f.endsWith(".json")).map((f) => path.join("tools", "latenz", "ergebnisse", f));

  const verschluesselungAus = latenzRecords().filter((pfad) => {
    const record = JSON.parse(lies(pfad)) as { konfiguration?: { verschluesselung?: unknown } };
    return String(record.konfiguration?.verschluesselung ?? "").toLowerCase().startsWith("aus");
  });

  it("die Latenz-Records messen weiterhin unverschluesselt — sonst ist der Waechter unterfluessig", () => {
    // Schliesst die Luecke in die andere Richtung: dreht jemand die Verschluesselung
    // in den Records an, muss die Doku das zeigen duerfen, ohne dass hier still
    // eine Behauptung "wieder stimmt".
    expect(latenzRecords().length).toBeGreaterThan(0);
    expect(verschluesselungAus.length).toBe(latenzRecords().length);
  });

  it.each(dateien)("%s verschweigt nicht, dass die Latenzlaeufe ohne Verschlüsselung gemessen wurden", (datei) => {
    const inhalt = lies(datei);
    const abschnitt = inhalt.split(/^###\s+/m).find((block) => /^Latenz|^Latency/m.test(block)) ?? "";
    expect(abschnitt.length, `${datei} hat keinen Latenz-Abschnitt mehr`).toBeGreaterThan(0);
    expect(
      abschnitt,
      `${datei}: die Records sagen konfiguration.verschluesselung = "aus", der Text behauptet verschluesselte Laeufe`
    ).not.toMatch(/encrypted at rest the whole time|durchgehend verschlüsselt\.|verschlüsselt gemessen|encrypted the whole time/i);
    expect(
      abschnitt,
      `${datei}: der Latenz-Abschnitt verweist nicht auf konfiguration.verschluesselung, wo er die Bedingung nennt`
    ).toMatch(/konfiguration\.verschluesselung/);
    expect(
      abschnitt,
      `${datei}: der Latenz-Abschnitt nennt nicht, dass ohne Verschlüsselung gemessen wurde`
    ).toMatch(/encryption switched off|mit ausgeschalteter Verschlüsselung/i);
  });

  it.each(dateien)("%s behauptet nicht, Frage- oder Antworttext liege im Repo", (datei) => {
    const inhalt = lies(datei);
    const abschnitt =
      inhalt.split(/^###\s+/m).find((block) => /^Benchmark/i.test(block)) ?? "";
    expect(abschnitt.length, `${datei} hat keinen Benchmark-Abschnitt mehr`).toBeGreaterThan(0);
    expect(
      abschnitt,
      `${datei}: die committeten Zeilen tragen keinen Antwort-Text — "every answer / jede Antwort" ist zu viel`
    ).not.toMatch(/every (?:question, )?every answer|every answer[^.\n]{0,40}committed|jede Antwort[^.]{0,40}liegt|jede Frage, jede Antwort/i);
    expect(
      abschnitt,
      `${datei}: der Abschnitt sagt nicht, woher Frage- und Antworttext kommen`
    ).toMatch(/upstream|Upstream/);
  });

  it("die committeten Felder sind die, die der Text aufzaehlt", () => {
    // Der Text nennt seine Felder beim Namen. Statt Prosa zu parsen: die wahre
    // Schluesselmenge der Records festhalten, damit ein Umbau der Zeilen hier
    // anzeigt, dass beide READMEs mitgezogen werden muessen.
    const ordner = path.join(wurzel, "tools", "longmemeval", "ergebnisse");
    const beste = fs
      .readdirSync(ordner)
      .filter((f) => f.endsWith(".json"))
      .map((f) => ({ name: f, inhalt: JSON.parse(lies(path.join("tools", "longmemeval", "ergebnisse", f))) as { bericht?: { genauigkeit_gesamt?: number }; fragen?: Record<string, unknown>[] } }))
      .sort((a, b) => (b.inhalt.bericht?.genauigkeit_gesamt ?? 0) - (a.inhalt.bericht?.genauigkeit_gesamt ?? 0))[0];
    expect(beste, "kein LongMemEval-Record gefunden").toBeTruthy();
    const schluessel = Object.keys(beste.inhalt.fragen?.[0] ?? {}).sort();
    expect(schluessel).toEqual(["faehigkeit", "judge_aufrufe", "question_id", "treffer", "trefferIndex", "typ", "urteil", "verbatim"]);
    for (const feld of ["antwort", "frage_text", "content", "answer"]) {
      expect(schluessel, `Records tragen plötzlich ein Feld "${feld}" — Text der READMEs pruefen`).not.toContain(feld);
    }
  });

  it("jede Ingest-Zahl in der Doku steht in einem committeten Latenz-Record", () => {
    // Der 3.0.0-Eintrag nannte "2,530 → 5,102 memories/s". 2,530 steht in einem
    // Record, 5,102 in keinem — die drei 100k-Laeufe lesen 5,082, 5,136 und 5,268.
    // So geboren: eine Zahl, die einmal gestimmt hat, wird zum Durchschnitt
    // rundgemacht und ueberlebt den Lauf, der sie erzeugt hat.
    const formate = (n: number) => [String(n), n.toLocaleString("en-US")];
    const erlaubt = new Set<string>();
    for (const pfad of latenzRecords()) {
      const record = JSON.parse(lies(pfad)) as {
        ingest?: Record<string, number>;
        konfiguration?: { erinnerungen?: number };
      };
      for (const wert of Object.values(record.ingest ?? {})) for (const f of formate(wert)) erlaubt.add(f);
      for (const f of formate(record.konfiguration?.erinnerungen ?? -1)) erlaubt.add(f);
    }
    expect(erlaubt.size, "keine Ingest-Werte in den Latenz-Records — Waechter ins Leere").toBeGreaterThan(0);

    for (const datei of [...dateien, "CHANGELOG.md"]) {
      const ohneRecord = lies(datei)
        .split("\n")
        .flatMap((zeile, i) =>
          /ingest|memories\/s|notes\/s|Notizen\/s/i.test(zeile)
            ? [...zeile.matchAll(/\b\d{1,3}(?:,\d{3})+\b/g)]
                .map((m) => m[0])
                .filter((z) => !erlaubt.has(z))
                .map((z) => `${i + 1}: ${z}`)
            : []
        );
      expect(
        ohneRecord,
        `${datei} nennt Durchsatz-Zahlen, die in keinem Record stehen (${ohneRecord.join(", ")}) — Zahl aus einem Record holen oder streichen`
      ).toEqual([]);
    }
  });
});