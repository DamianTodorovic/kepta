import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  dokuVergleich,
  leseBericht,
  genannteTestzahlen,
  readmeDateien,
  statischeTestanzahl,
  testbehauptungen,
  testDateien,
  messstempel,
} from "../scripts/test-bericht.mjs";

// Die Zahl der Tests war die am haeufigsten falsche Zahl des Repos — nicht weil
// jemand sie erfunden haette, sondern weil drei Werkzeuge drei verschiedene
// Fragen beantwortet haben: der Bericht eines alten Laufs (474), eine statische
// Wortzaehlung (687) und die README-Behauptung (476). Zwei davon sollten hueten.
// Dieses Modul beantwortet nur noch eine Frage: wie viele Faelle sind in einem
// Lauf wirklich durchgelaufen? Und wenn sie nicht beantwortet werden kann, sagt
// sie das — ein alter Wert aus der Ablage gilt nicht als Beweis.

/** Minimaler vitest-json-Bericht, so wie ihn der Reporter schreibt. */
function schreibeBericht(
  wurzel: string,
  {
    vergangen = 0,
    bestanden = 0,
    fehlgeschlagen = 0,
    uebersprungen = 0,
    dateien = [],
  }: { vergangen?: number; bestanden?: number; fehlgeschlagen?: number; uebersprungen?: number; dateien?: string[] }
) {
  const pfad = path.join(wurzel, "test-results", "vitest.json");
  fs.mkdirSync(path.dirname(pfad), { recursive: true });
  const namen = [
    ...Array.from({ length: bestanden }, (_, i) => ({ fullName: `bestanden ${i}`, status: "passed" })),
    ...Array.from({ length: fehlgeschlagen }, (_, i) => ({ fullName: `fehlgeschlagen ${i}`, status: "failed" })),
    ...Array.from({ length: uebersprungen }, (_, i) => ({ fullName: `uebersprungen ${i}`, status: "pending" })),
  ];
  const dateienListe = dateien.length > 0 ? dateien : ["tests/a.test.ts"];
  const testResults = dateienListe.map((name, i) => ({
    name: path.join(wurzel, name),
    status: "passed",
    startTime: 0,
    endTime: 0,
    assertionResults: namen.filter((_, k) => k % dateienListe.length === i),
  }));
  const gesamt = bestanden + fehlgeschlagen + uebersprungen;
  fs.writeFileSync(
    pfad,
    JSON.stringify({
      numTotalTestSuites: dateienListe.length,
      numTotalTests: gesamt,
      numPassedTests: bestanden,
      numFailedTests: fehlgeschlagen,
      numPendingTests: uebersprungen,
      numTodoTests: 0,
      success: fehlgeschlagen === 0,
      startTime: Date.now() - vergangen,
      testResults,
    })
  );
  return pfad;
}

/** Ein Bericht, der sich weigert — die Felder sind nur im Weigerungsfall da. */
function unbeglaubigt(r: ReturnType<typeof leseBericht>) {
  if (r.ok) throw new Error(`beglaubigt, wo eine Weigerung erwartet war: ${JSON.stringify(r)}`);
  return r;
}

/** Ein beglaubigter Bericht — die Zahl und ihr Stand sind dann vorhanden. */
function beglaubigt(r: ReturnType<typeof leseBericht>) {
  if (!r.ok) throw new Error(`weigert sich: ${r.grund} — ${r.hinweis}`);
  return r;
}

describe("Der Bericht als einzige Quelle der Testzahl", () => {
  let wurzel = "";

  beforeEach(() => {
    wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "test-bericht-"));
    fs.mkdirSync(path.join(wurzel, "tests"), { recursive: true });
    // Eine Testdatei auf der Platte, damit Vollstaendigkeit ueberhaupt etwas heisst.
    fs.writeFileSync(path.join(wurzel, "tests", "a.test.ts"), 'import { it } from "vitest";\nit("a", () => {});\n');
  });

  afterEach(() => {
    fs.rmSync(wurzel, { recursive: true, force: true });
  });

  it("findet die Testdateien im Unterordner, relativ und sortiert", () => {
    fs.mkdirSync(path.join(wurzel, "tests", "core"), { recursive: true });
    fs.writeFileSync(path.join(wurzel, "tests", "core", "b.test.tsx"), "it('b', () => {});");
    fs.writeFileSync(path.join(wurzel, "tests", "helfer.ts"), "kein test");
    expect(testDateien(wurzel)).toEqual(["tests/a.test.ts", "tests/core/b.test.tsx"]);
  });

  it("sagt, dass es nicht pruefen kann, wenn der Bericht fehlt", () => {
    const r = unbeglaubigt(leseBericht({ wurzel }));
    expect(String(r.grund)).toMatch(/fehlt/);
    expect(String(r.hinweis), "der Hinweis muss sagen, wie der Bericht entsteht").toMatch(/npm test/);
  });

  it("sagt, dass es nicht pruefen kann, wenn der Bericht Muell ist", () => {
    const pfad = path.join(wurzel, "test-results", "vitest.json");
    fs.mkdirSync(path.dirname(pfad), { recursive: true });
    fs.writeFileSync(pfad, "kein json");
    expect(leseBericht({ wurzel }).ok).toBe(false);
    fs.writeFileSync(pfad, JSON.stringify({ numPassedTests: 12 }));
    expect(unbeglaubigt(leseBericht({ wurzel })).ok).toBe(false);
    const ohneFelder = unbeglaubigt(leseBericht({ wurzel }));
    expect(String(ohneFelder.grund)).toMatch(/unvollst/i);
  });

  it("weist einen Bericht ab, der aelter ist als die juengste Testdatei", () => {
    schreibeBericht(wurzel, { bestanden: 1, dateien: ["tests/a.test.ts"] });
    const aelter = new Date(Date.now() - 60_000);
    fs.utimesSync(path.join(wurzel, "test-results", "vitest.json"), aelter, aelter);
    const juenger = new Date();
    fs.utimesSync(path.join(wurzel, "tests", "a.test.ts"), juenger, juenger);

    const r = unbeglaubigt(leseBericht({ wurzel }));
    expect(String(r.grund), "genau diese Datei muss benannt werden").toMatch(/tests\/a\.test\.ts/);
    expect(String(r.hinweis)).toMatch(/npm test/);
  });

  it("weist einen Teillauf ab: der Bericht kennt eine von zwei Dateien", () => {
    fs.writeFileSync(path.join(wurzel, "tests", "b.test.ts"), "it('b', () => {});");
    schreibeBericht(wurzel, { bestanden: 2, dateien: ["tests/a.test.ts"] });
    const r = unbeglaubigt(leseBericht({ wurzel }));
    expect(String(r.grund)).toMatch(/1 von 2/);
    expect(String(r.grund)).toMatch(/b\.test\.ts/);
  });

  it("weist einen Bericht ab, der eine Datei kennt, die es nicht mehr gibt", () => {
    schreibeBericht(wurzel, { bestanden: 5, dateien: ["tests/a.test.ts", "tests/weg.test.ts"] });
    const r = unbeglaubigt(leseBericht({ wurzel }));
    expect(String(r.grund)).toMatch(/weg\.test\.ts/);
  });

  it("zahlt die gelaufenen Faelle auch dann, wenn der Lauf rot war — die Zahl ist stabil", () => {
    // Die Zahlenwache sitzt in der Suite. Verlangte sie hier einen gruenen Bericht,
    // koennte sie sich mit ihrem eigenen Fehlschlag aussperren: 9 bestanden + 1
    // fehlgeschlagen waere eine Zahl, die nur exists, weil sie fehlt. Beglaubigt
    // wird, was gelaufen ist; die Gruen-Pflicht traegt doku-check nach der Suite.
    schreibeBericht(wurzel, { bestanden: 9, fehlgeschlagen: 1, dateien: ["tests/a.test.ts"] });
    const r = beglaubigt(leseBericht({ wurzel }));
    expect(r.zahl).toBe(10);
    expect(r.fehlgeschlagen).toBe(1);
    expect(r.bestanden).toBe(9);
  });

  it("zurueckgewiesene Faelle zaehlen mit, erklaerte nicht", () => {
    // zwei faelle wurden nicht ausgefuehrt, aber keiner ist im quelltext als skip
    // erklaert — sie bleiben in der zahl, und der bericht sagt, was sie sind
    schreibeBericht(wurzel, { bestanden: 8, uebersprungen: 2, dateien: ["tests/a.test.ts"] });
    const r = beglaubigt(leseBericht({ wurzel }));
    expect(r.zahl).toBe(10);
    expect(r.uebersprungen).toBe(2);
    expect(r.erklaertUebersprungen).toBe(0);
    expect(r.zurueckgewiesen).toBe(2);
  });

  it("gibt die Zahl der ausgefuehrten Faelle des Laufs zurueck", () => {
    schreibeBericht(wurzel, { bestanden: 481, dateien: ["tests/a.test.ts"] });
    const r = beglaubigt(leseBericht({ wurzel }));
    expect(r.zahl).toBe(481);
    expect(r.dateienBericht).toBe(1);
    expect(r.dateienBaum).toBe(1);
    // Der Tag ist der Stand, den die Doku nennen muss — auf den Tag genau, nicht
    // auf die Minute: sonst verlangte jeder Lauf eine README-Aenderung.
    expect(r.tag).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("liest absolute Berichtpfade auf den relativen Pfad im Baum zurueck", () => {
    schreibeBericht(wurzel, { bestanden: 1, dateien: [path.join(wurzel, "tests", "a.test.ts")] });
    expect(leseBericht({ wurzel }).ok).toBe(true);
  });

  it("zieht nur Erklaertes ab, was im Quelltext als skip steht — nicht was die Ruhe ablehnt", () => {
    // Drei zeitmessende Faelle ueberspringen zur Laufzeit, wenn die Ruhe-Klammer
    // sie nicht vorlaesst. Auf einem dedizierten Runner laufen zwei von drei, auf
    // diesem Rechner keins — dieselbe Suite, dieselbe Datei, verschiedene Zahl.
    // Die Zahl der Doku darf daran nicht ruehren: abgezogen wird nur, was im
    // Quelltext erklaert ist.
    fs.writeFileSync(
      path.join(wurzel, "tests", "skip.test.ts"),
      'import { it } from "vitest";\nit.skip("erklärt: Windows-only", () => {});\nit("laufzeit-abgewiesen", () => {});\n'
    );
    // Fuenf Faelle, immer dieselben: einer laeuft immer, einer ist im Quelltext als
    // skip erklaert, und drei zeitmessende werden auf dem einen Rechner ausgefuehrt
    // und auf dem anderen von der Ruhe-Klammer abgewiesen. Nur der Status wandert.
    const gelaufen = (abgewiesen: string[]) => {
      const eintraege = [
        { fullName: "zaehlt immer", status: "passed" },
        { fullName: "erklärt: Windows-only", status: "pending" },
        ...["eins", "zwei", "drei"].map((t) => ({
          fullName: `zeitmessend ${t}`,
          status: abgewiesen.includes(t) ? "pending" : "passed",
        })),
      ];
      fs.mkdirSync(path.join(wurzel, "test-results"), { recursive: true });
      fs.writeFileSync(
        path.join(wurzel, "test-results", "vitest.json"),
        JSON.stringify({
          numTotalTestSuites: 2,
          numTotalTests: eintraege.length,
          numPassedTests: eintraege.filter((e) => e.status === "passed").length,
          numFailedTests: 0,
          numPendingTests: eintraege.filter((e) => e.status === "pending").length,
          numTodoTests: 0,
          success: true,
          startTime: Date.now(),
          testResults: [
            { name: path.join(wurzel, "tests/a.test.ts"), status: "passed", startTime: 0, endTime: 0, assertionResults: [eintraege[0], ...eintraege.slice(2)] },
            { name: path.join(wurzel, "tests/skip.test.ts"), status: "passed", startTime: 0, endTime: 0, assertionResults: [eintraege[1]] },
          ],
        })
      );
      return leseBericht({ wurzel });
    };

    const ruhigeMaschine = beglaubigt(gelaufen([]));
    const runner = beglaubigt(gelaufen(["eins", "zwei", "drei"]));
    // die Zahl ist dieselbe, egal wie viele Faelle die Ruhe abgewiesen hat
    expect(runner.zahl).toBe(ruhigeMaschine.zahl);
    expect(ruhigeMaschine.erklaertUebersprungen).toBe(1);
    expect(runner.zurueckgewiesen).toBe(3);
    expect(ruhigeMaschine.zurueckgewiesen).toBe(0);
    // und die alte rechnung (total minus pending) liefert hier zwei verschiedene
    // zahlen — der test greift also gegen den alten stand
    expect(ruhigeMaschine.zahlNachAlterRegel).not.toBe(runner.zahlNachAlterRegel);
  });

  it("verwirft einen bericht, in dem ein erklaerter Fall fehlt", () => {
    fs.writeFileSync(
      path.join(wurzel, "tests", "skip.test.ts"),
      'import { it } from "vitest";\nit.skip("taucht nirgends auf", () => {});\n'
    );
    schreibeBericht(wurzel, { bestanden: 1, dateien: ["tests/a.test.ts", "tests/skip.test.ts"] });
    const r = unbeglaubigt(leseBericht({ wurzel }));
    expect(String(r.grund)).toMatch(/taucht nirgends auf/);
  });

  it("liest nur die READMEs, die es wirklich gibt", () => {
    // Ohne README.md ist die Liste leer — dass die Wache das nicht schweigend
    // hinnehmen darf, ankert tests/doku-zahlen.test.ts selbst.
    expect(readmeDateien(wurzel)).toEqual([]);
    fs.writeFileSync(path.join(wurzel, "README.md"), "**10 tests**");
    expect(readmeDateien(wurzel)).toEqual(["README.md"]);
    fs.writeFileSync(path.join(wurzel, "README.de.md"), "**10 Tests**");
    expect(readmeDateien(wurzel)).toEqual(["README.md", "README.de.md"]);
  });

  it("findet die Testzahl im Fettsatz, im Abzeichen und im Kommentar", () => {
    const text = "**481 tests** und **480 Tests** alt\nbadge/tests-481%20passing-brightgreen\nnpm test           # 481 tests (vitest)";
    expect(genannteTestzahlen(text).sort()).toEqual([480, 481]);
  });

  it("nennt jede Behauptung mit Art und Zeile — ein Abzeichen bekommt einen Namen", () => {
    // Das Bild in der README-Zeile 2 ist die Behauptung, die niemand durchsucht.
    // Ohne Art und Zeile meldet die Wache nur „README.md: behauptet 788" und
    // niemand sieht, dass der Fliesstext laengst 840 sagt.
    const text = ["", "**481 tests** hier", "img tests-481%20passing-brightgreen", "npm test  # 480 tests (vitest)"].join("\n");
    expect(testbehauptungen(text)).toEqual([
      { zahl: 481, art: "Fettsatz", zeile: 2 },
      { zahl: 481, art: "Abzeichen", zeile: 3 },
      { zahl: 480, art: "Befehlskommentar", zeile: 4 },
    ]);
  });

  it("liest den Messstand, an dem eine Zahl haengt", () => {
    expect(messstempel("gemessen am 2026-10-10 sind 788 Faelle durchgelaufen")).toEqual(["2026-10-10"]);
    expect(messstempel("the run of 2026-10-09 — measured 2026-10-09")).toEqual(["2026-10-09"]);
    // Ein Datum ohne dieses Wort ist kein Messstand: die READMEs nennen Daten fuer
    // Coverage-Laeufe, Rekorde und Aenderungen, und keines davon darf als Stand der
    // Testzahl durchgehen.
    expect(messstempel("Stand 4.10.2026, Repo vom 2026-09-01, nichts gemessen")).toEqual([]);
  });
  it("vergleicht eine Dokuzeile mit dem Lauf — und nennt das Abzeichen beim Namen", () => {
    const lauf = { zahl: 848, tag: "2026-10-10" };
    const gut = "**848 tests** (measured 2026-10-10)\nimg tests-848%20passing-brightgreen";
    expect(dokuVergleich(gut, lauf, "README.md")).toEqual([]);

    // Nur das Bild ist alt, der Fliesstext laengst richtig. Genau dieser Fall
    // alterte frueher unbehelligt: niemand durchsucht ein Bild.
    const badgeAlt = "**848 tests** (measured 2026-10-10)\nimg tests-788%20passing-brightgreen";
    const funde = dokuVergleich(badgeAlt, lauf, "README.md");
    expect(funde.length).toBe(1);
    expect(funde[0]).toMatch(/README\.md:2 Abzeichen: nennt 788 Tests, gelaufen sind 848/);
  });

  it("verlangt den Messstand zu jeder Zahl — und ein Datum, das dieser Lauf nicht widerlegt", () => {
    const lauf = { zahl: 848, tag: "2026-10-10" };
    expect(dokuVergleich("**848 tests**\ntests-848%20passing", lauf, "README.md").join("\n")).toMatch(/keinen Messstand/);

    // Der Fall, der am 12.10. den App-Gate riss (lauf 38185328804): derselbe Baum,
    // zwei minuten ueb Mitternacht, die Zahl nie in streit. Ein Stempel vom Vortag
    // ist an diesem Lauf wahr — also ist die Meldung leer.
    expect(dokuVergleich("**848 tests** (gemessen am 2026-10-09)", lauf, "README.md")).toEqual([]);
    expect(dokuVergleich("**848 tests** (gemessen am 2026-10-10)", lauf, "README.md")).toEqual([]);

    // Die Untergrenze "nicht aelter als die juengste Testdatei", die hier einen
    // Moment lang stand, ist auf einem Runner nicht fahrbar: actions/checkout@v4
    // schreibt mit fetch-depth 1 jede Datei neu, dort ist die juengste Testdatei
    // immer der Tag des Laufs, und ein unveraendert richtiges README waerte beim
    // naechsten Push rot — dieselbe Sorte Grund-los-rot, die dieser Lauf abgestellt
    // hat. Halten tut stattdessen die Zahl: sie muss DIESES Laufs Zahl sein.
    expect(dokuVergleich("**841 tests** (gemessen am 2026-10-01)", lauf, "README.md").join("\n")).toMatch(
      /nennt 841 Tests, gelaufen sind 848/
    );

    // und ein Stempel aus der Zukunft bleibt eine erfundene Zahl
    expect(
      dokuVergleich("**848 tests** (gemessen am 2026-10-11)", lauf, "README.md").join("\n")
    ).toMatch(/Zukunft/);
  });
});

describe("Die statische Zaehlung: Plausibilitaetsboden, nicht die Wahrheit", () => {
  let wurzel = "";

  beforeEach(() => {
    wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "test-zaehlung-"));
    fs.mkdirSync(path.join(wurzel, "tests"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(wurzel, { recursive: true, force: true });
  });

  it("zaehlt ein it.each mit Variablen-Tabelle als eins, obwohl es als viele laeuft", () => {
    fs.writeFileSync(
      path.join(wurzel, "tests", "a.test.ts"),
      [
        'import { it } from "vitest";',
        "const regeln = ['eins', 'zwei', 'drei'];",
        "it.each(regeln)('%s', (r) => {});",
        "it('wirklich zwei', () => {});",
      ].join("\n")
    );
    // Zur Laufzeit sind das 4 Faelle (3 aus der Tabelle + 1), statisch nur 2.
    expect(statischeTestanzahl(wurzel)).toBe(2);
  });

  it("sieht ein it.skip ueberhaupt nicht — die Zaehlung ist in beide Richtungen falsch", () => {
    fs.writeFileSync(
      path.join(wurzel, "tests", "a.test.ts"),
      'import { it } from "vitest";\nit("lebt", () => {});\nit.skip("schlaeft", () => {});\n'
    );
    // Die Muster der Zaehlung kennen nur `it(`, `test(` und `it.each(` — die
    // .skip-Endung entgeht ihr. vitests numTotalTests zaehlt den Fall dagegen
    // mit, obwohl er nie laeuft. Kein Statik-Wert ist deshalb die Zahl; die Zahl
    // ist, was in einem Lauf durchgelaufen ist.
    expect(statischeTestanzahl(wurzel)).toBe(1);
  });

  it("zaehlt eine sichtbare it.each-Tabelle nach ihren Eintraegen", () => {
    fs.writeFileSync(
      path.join(wurzel, "tests", "a.test.ts"),
      'import { it } from "vitest";\nit.each([["a"], ["b"], ["c"]])("%s", (x) => {});\n'
    );
    expect(statischeTestanzahl(wurzel)).toBe(3);
  });
});
