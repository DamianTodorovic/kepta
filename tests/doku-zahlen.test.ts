import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CORPUS, QUERIES } from "../scripts/eval-corpus";
import { dokuVergleich, leseBericht, readmeDateien, statischeTestanzahl, testbehauptungen } from "../scripts/test-bericht.mjs";
import { ausgelieferteVersion, pruefePapier, rekorde } from "../scripts/benchmark-belege.mjs";

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
// Welche Dateien eine Testzahl nennen duerfen, liest das Modul aus dem Baum —
// Kern und App haben damit dieselbe Regel und nicht zwei, die unabhaengig voneinander formuliert wurden.
const dateien = readmeDateien();

// Nachtrag: der Waechter deckte nur die Korpuszahlen ab. Waehrenddessen
// behaupteten beide READMEs "333 Tests" (es waren 463) und "20 kB" (es sind
// 74). Dieselbe Sorte Drift, nur an anderer Stelle — also hier mit abgedeckt.
describe("Dokumentation: die Testzahl ist die Zahl eines Laufs", () => {
  it("es gibt READMEs mit einer Testzahl, sonst prueft das hier nichts", () => {
    // Ohne diesen Anker waere die Liste unten leer, it.each liefe nullmal, und
    // die Wache meldete gruen, ohne etwas gesehen zu haben.
    expect(dateien.length, "kein README.md im Baum — wo soll die Testzahl dann stehen?").toBeGreaterThan(0);
  });

  it.each(dateien)("%s nennt die Zahl der Faelle, die in einem Lauf durchgelaufen sind", (datei) => {
    const bericht = leseBericht();
    // Die eine Quelle: der JSON-Bericht, nicht der Quelltext. Kann er nicht gelesen
    // werden — fehlt, aelter als der Baum, stammt er aus einem Teillauf — dann
    // verweigert die Wache und vergleicht nichts. Ein Wert aus der Ablage war der
    // Grund, warum die App-Wache am 10.10. einen drei Tage alten Bericht als
    // "passt" melden konnte: 1967 Tests, 118 von 131 Dateien, 22 Dateien juenger.
    if (!bericht.ok) throw new Error(`Ich kann die Testzahl nicht pruefen: ${bericht.grund}\n  ${bericht.hinweis}`);

    // dokuVergleich ist dieselbe Funktion, die scripts/doku-check.mjs nach dem
    // Lauf anwendet: Zahl und Messstand, Zeile fuer Zeile, das Abzeichen beim
    // Namen genannt — ein Bild in Zeile 2 alterte frueher unbehelligt.
    const text = lies(datei);
    const behauptungen = testbehauptungen(text);
    expect(
      dokuVergleich(text, bericht, datei),
      `${datei} passt nicht zum Lauf vom ${bericht.zeit} (${bericht.dateienBericht} Testdateien, ${bericht.zahl} ausgefuehrte Faelle)`
    ).toEqual([]);
    expect(behauptungen.length, `${datei} nennt gar keine Testanzahl mehr`).toBeGreaterThan(0);

    // Die Wortzaehlung bleibt — als Plausibilitaetsboden nach unten, der frei
    // erfundene Zahlen abfaengt. Sie ist NICHT die Zahl: ein it.each mit einer
    // Tabelle aus einer Variablen steht hier als ein Fall und laeuft als viele,
    // und ein it.skip wird gar nicht gesehen, waehrend vitests numTotalTests ihn
    // mitzaehlt, obwohl er nie lief. Warum, steht in scripts/test-bericht.mjs.
    const boden = statischeTestanzahl() - (bericht.erklaertUebersprungen ?? 0);
    for (const b of behauptungen) {
      expect(b.zahl, `${datei}:${b.zeile} ${b.art}: behauptet ${b.zahl}, aber im Quelltext stehen mindestens ${boden} Testbloecke — die Doku hinkt nach`).toBeGreaterThanOrEqual(boden);
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
    // Ein Bild, das niemand durchsucht: wenn es eine andere Zahl traegt als der
    // Fliesstext, ist das eine zweite, ungepruefte Behauptung.
    const behauptungen = testbehauptungen(lies(datei));
    const abzeichen = behauptungen.filter((b) => b.art === "Abzeichen");
    expect(abzeichen.length, `${datei} hat kein Test-Abzeichen mehr`).toBeGreaterThan(0);
    const fliesstext = behauptungen.filter((b) => b.art === "Fettsatz").map((b) => b.zahl);
    for (const a of abzeichen) {
      expect(fliesstext, `${datei}: Abzeichen (Zeile ${a.zeile}) sagt ${a.zahl}, Fliesstext sagt ${fliesstext.join("/")}`).toContain(a.zahl);
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

describe("Dokumentation: Benchmark-Zahlen haengen an Records vom ausgelieferten Stand", () => {
  // Nicht mehr: „die Zahl muss im Text stehen". Dieses Verlangen hat am 10.10. eine
  // erledigte Zahl zurueck ins Papier zwingen wollen — die Serie lief gegen
  // kepta_version 2.13.2 bis 2.13.22, ausgeliefert war 3.2.0, und der Record sagt das
  // selbst (audit-2026-10-09/Q1-BENCHMARK-QUALITAET.md:34-35, 101). Jetzt gilt:
  //   Zahl da  -> nur mit einem Record VOEM ausgelieferten Stand, oder als Wert eines
  //               genannten aelteren Laufs plus erklaertem Rückzug.
  //   Zahl weg -> nur als erklaerter Rückzug, mit der ausgelieferten Version im Satz.
  // „vergessen" und „zurueckgezogen" abgeben nicht mehr dasselbe Bild.
  const papiere = ["README.md", "README.de.md", "tools/longmemeval/README.md"];

  it("die Records und die ausgelieferte Version sind ueberhaupt da, sonst prueft das hier nichts", () => {
    const alle = rekorde();
    expect(alle.length, "keine LongMemEval-Records — der Waechter wuerde ins Leere laufen").toBeGreaterThan(0);
    expect(/\d+\.\d+\.\d+/.test(ausgelieferteVersion()), `package.json nennt keine lesbare Version`).toBe(true);
  });

  it.each(papiere)("%s: jede Benchmark-Zahl ist belegt, oder der Rückzug ist erklaert", (datei) => {
    const fehler = pruefePapier({
      text: lies(datei),
      datei,
      rekorde: rekorde(),
      version: ausgelieferteVersion(),
    });
    expect(fehler, `${datei} macht Qualitaetsaussagen ohne Record vom ausgelieferten Stand`).toEqual([]);
  });

  it("die erledigte 61,5 % verlangt niemand mehr — und steht sie doch, muss ihre Lauf-Version dabei stehen", () => {
    const text = lies("README.md") + "\n" + lies("README.de.md");
    const alte = /61[.,]5\s*%/.exec(text);
    if (!alte) return; // der gewollte Zustand: kein erzwungener Altwert
    expect(text.slice(0, text.indexOf(alte[0]) + 240)).toMatch(/2\.13\.\d+/);
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
// README und die Fehlermeldung der CLI selbst nannten `npx -y kepta import
// chatgpt …`. Das Paket `kepta` existiert auf npm nicht (Root ist "private",
// veröffentlicht ist `kepta-mcp`) — der Befehl war also kopierbar und scheiterte
// beim Kopieren mit einem 404. Befehle in der Doku müssen den Namen tragen, unter
// dem das Ding wirklich zu holen ist.
// Zweite Regel desselben Fehlers: das veröffentlichte Paket hiesst richtig, wird
// aber im Text auseinandergeschrieben (`npx kep ta-mcp setup`). Genau so steht es
// im live veröffentlichten GitHub-Release v3.1.2 — ein kopierbarer Befehl, der ins
// Leere führt. Ein zerrissener Name ist ausserdem ein zerrissener Pfad (`~/kep
// ta-enterprise/`) und eine ins Leere laufende URL (`pypi.org/project/kep ta`).
describe("Doku und Meldungen: npx ruft nur das veröffentlichte Paket", () => {
  const ordner = ["src", "scripts", "npm", "python", "tools"];
  const Quelldateien = () => {
    const funde: string[] = [];
    const sammle = (ordnerRelativ: string) => {
      const absolut = path.join(wurzel, ordnerRelativ);
      if (!fs.existsSync(absolut)) return;
      for (const eintrag of fs.readdirSync(absolut, { withFileTypes: true })) {
        if (eintrag.name === "node_modules" || eintrag.name === "dist") continue;
        const pfad = path.join(ordnerRelativ, eintrag.name);
        if (eintrag.isDirectory()) sammle(pfad);
        else if (/\.(md|ts|mjs|py)$/.test(eintrag.name)) funde.push(pfad);
      }
    };
    for (const o of ordner) sammle(o);
    for (const md of ["README.md", "README.de.md", "CHANGELOG.md", "SECURITY.md"]) {
      if (fs.existsSync(path.join(wurzel, md))) funde.push(md);
    }
    return funde.sort();
  };

  it("jeder npx-Aufruf heisst kepta-mcp (oder ein Tool, das es wirklich gibt)", () => {
    const erlaubt = new Set(["kepta-mcp", "tsx", "vitest", "eslint", "typescript"]);
    const befunde: string[] = [];
    const dateien = Quelldateien();
    expect(dateien.length, "keine Doku-/Quelldateien gefunden — Waechter ins Leere").toBeGreaterThan(10);
    const zeileVon = (text: string, index: number) => text.slice(0, index).split("\n").length;
    for (const datei of dateien) {
      const text = lies(datei);
      // Zwei Lesarten, damit ein deutscher Prosa-Satz ("damit npx dieselbe
      // Fassung installiert") nicht als Befehl durchgeht: der Befehl steht nach
      // `npx -y`, oder er nennt ein kepta-* Paket.
      const Muster = [/(?:^|[`'"\s])npx\s+-y\s+([a-z][a-z0-9._-]*)/g, /(?:^|[`'"\s])npx\s+(kepta[a-z-]*)/g];
      for (const muster of Muster) {
        for (const m of text.matchAll(muster)) {
          const name = m[1];
          if (erlaubt.has(name)) continue;
          befunde.push(`${datei}:${zeileVon(text, (m.index ?? 0) + m[0].indexOf(m[1]))} → npx ${name}`);
        }
      }
      for (const m of text.matchAll(/\bkep[ \t]+ta\b/gi)) {
        befunde.push(`${datei}:${zeileVon(text, m.index ?? 0)} → "${m[0]}" — Paket-, Pfad- und URL-Teile sind ein Wort`);
      }
    }
    expect(
      befunde,
      `Befehle und Namen müssen so dastehen, wie sie funktionieren (${befunde.join(", ")}) — npx nur mit veröffentlichtem Paket, kein auseinandergezogener Name`
    ).toEqual([]);
  });
});
