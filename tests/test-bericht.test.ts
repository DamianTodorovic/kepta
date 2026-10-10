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
  fs.writeFileSync(
    pfad,
    JSON.stringify({
      numTotalTestSuites: dateien.length,
      numTotalTests: bestanden + fehlgeschlagen + uebersprungen,
      numPassedTests: bestanden,
      numFailedTests: fehlgeschlagen,
      numPendingTests: uebersprungen,
      numTodoTests: 0,
      success: fehlgeschlagen === 0,
      startTime: Date.now() - vergangen,
      testResults: dateien.map((name) => ({
        name,
        status: "passed",
        assertionResults: [],
        startTime: 0,
        endTime: 0,
      })),
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

  it("zaehlt uebersprungene Faelle nicht mit — sie sind nie gelaufen", () => {
    schreibeBericht(wurzel, { bestanden: 8, uebersprungen: 2, dateien: ["tests/a.test.ts"] });
    const r = beglaubigt(leseBericht({ wurzel }));
    expect(r.zahl).toBe(8);
    expect(r.uebersprungen).toBe(2);
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

  it("verlangt den Messstand zu jeder Zahl — und denselben Tag wie den Lauf", () => {
    const lauf = { zahl: 848, tag: "2026-10-10" };
    expect(dokuVergleich("**848 tests**\ntests-848%20passing", lauf, "README.md").join("\n")).toMatch(/keinen Messstand/);
    expect(dokuVergleich("**848 tests** (gemessen am 2026-10-09)", lauf, "README.md").join("\n")).toMatch(/2026-10-09[\s\S]*beglaubigt ist der Lauf vom 2026-10-10/);
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
