import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CORPUS, QUERIES } from "../scripts/eval-corpus";
import { dokuVergleich, leseBericht, readmeDateien, statischeTestanzahl, testbehauptungen } from "../scripts/test-bericht.mjs";

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
// Kern und App haben damit dieselbe Regel und nicht zwei, die unabhaengig
// voneinander formuliert wurden. Hier sind es die einen READMEs seit dem
// Open-Core-Split; README.de.md existiert in diesem Repo nicht.
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
    if (!bericht.ok) {
      // Der Lauf kann seinen eigenen Bericht nicht lesen, waehrend er ihn schreibt:
      // vitest oeffnet die JSON erst am Ende, und ein Leser mittendrin erwischt eine
      // halbe Datei (gemessen am Kern-Lauf 1 am 12.10.: "Expected property name or '}'
      // in JSON at position 1"). In diesem einen Fall ist das Weigern der Befund, nicht
      // die rote Zahl — die Autoritaet fuer Zahl und Stand ist `scripts/doku-check.mjs`
      // NACH dem Lauf. Jede andere Weigerung (fehlt, alt, unvollstaendig, passt nicht zum
      // Baum) bleibt ein Wurf: die zeigt an, dass jemand eine alte Zahl ungeprueft liest.
      if (/kein lesbares JSON/.test(bericht.grund)) {
        expect(bericht.hinweis, "ein halb geschriebener Bericht muss den Weg zum echten Lauf nennen").toContain("npm test");
        return;
      }
      throw new Error(`Ich kann die Testzahl nicht pruefen: ${bericht.grund}\n  ${bericht.hinweis}`);
    }

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
  function serverQuellen(): string[] {
    // Seit dem Refactoring 2026-09 lebt die API in server.ts + server/router/*.
    const dateien = [path.join(wurzel, "server.ts")];
    const routerOrdner = path.join(wurzel, "server");
    const sammle = (ordner: string) => {
      for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
        const voll = path.join(ordner, eintrag.name);
        if (eintrag.isDirectory()) sammle(voll);
        else if (eintrag.name.endsWith(".ts")) dateien.push(voll);
      }
    };
    sammle(routerOrdner);
    return dateien;
  }

  function echteRouten(): number {
    const pfade = new Set<string>();
    const re = /\b(?:app|router)\.(get|post|put|delete|patch)\(\s*["'`]([^"'`]+)["'`]/g;
    for (const datei of serverQuellen()) {
      const quelle = lies(path.relative(wurzel, datei));
      let m: RegExpExecArray | null;
      while ((m = re.exec(quelle)) !== null) {
        // Der SPA-Fallback ist kein API-Endpunkt: in Express 4 als "*", seit
        // Express 5 als "/{*splat}" — beides zählt nicht mit.
        if (m[2] !== "*" && m[2] !== "/{*splat}") pfade.add(m[2]);
      }
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
    const zuPruefen = [
      "README.md", "AGENTS.md",
      "src/components/SystemStatus.tsx", "src/components/Settings.tsx",
      "src/components/Dashboard.tsx", "src/components/Chat.tsx",
    ];
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

  it("die Anwendung nennt eine Trefferquote, die der Eval entspricht", () => {
    // Vorher war das hier ein Band: jede Zahl zwischen 45 und 75 durfte durch,
    // auch die von gestern. Ein Band schuetzt keine Messung, es dekoriert sie.
    // Die erlaubten Werte kommen jetzt aus dem Beleg selbst — und der Beleg ist
    // die gefaehrliche Stelle: heisst er anders, muss diese Wache rot werden.
    // Seit 3.11. nennt der Beleg drei Hit@1-Zahlen statt zwei: v1, v2 ohne Vektoren
    // und v3 mit — das ausgelieferte Retrieval. Das 71 % der Flaeche ist die Zahl des
    // zweiten Beins, weil dieser Ast der Flaeche ohne Ollama laeuft.
    const belegt = lies("docs/belege/tag-0311/eval-drei-beine-1352.log.txt");
    const gemessen = [...belegt.matchAll(/Hit@1:\s+(\d+(?:[.,]\d+)?)\s*%/g)]
      .map((m) => Math.round(Number(m[1].replace(",", "."))));
    expect(gemessen.length, "der Eval-Beleg nennt keine zwei Hit@1-Zahlen — diese Wache ist taub").toBeGreaterThanOrEqual(2);
    const erlaubt = [...new Set(gemessen)];
    // Eine Zahl ohne ihren Korpus ist eine halbe Auskunft: 71 % auf 58 Notizen
    // und 71 % auf 2 000 Notizen sind zwei verschiedene Behauptungen. Der Korpus
    // kommt aus derselben Datei, die auch der Eval liest (scripts/eval.ts:15).
    const korpus = `${CORPUS.length}`;
    const zuPruefen = [
      "src/components/SystemStatus.tsx", "src/components/Settings.tsx",
      "src/components/Dashboard.tsx", "src/components/Chat.tsx",
    ];
    for (const datei of zuPruefen) {
      const inhalt = lies(datei);
      for (const m of inhalt.matchAll(/(\d+)\s*%\s*Hit@1/g)) {
        const z = Number(m[1]);
        expect(erlaubt, `${datei} behauptet ${z} % Hit@1 — der Beleg misst ${erlaubt.join(" %, ")} %`).toContain(z);
        const umfeld = inhalt.slice(Math.max(0, (m.index ?? 0) - 220), (m.index ?? 0) + 220);
        expect(umfeld, `${datei}: die Hit@1-Zahl ${z} % nennt keinen Korpus — welche ${korpus} Notizen sind gemeint?`).toContain(korpus);
      }
    }
  });
});

// P100: die vierte Zahl des Ollama-Zweigs. Die drei Hit@1-Werte oben sind an den
// Drei-Beine-Beleg gekoppelt; der Sprachuebergriff und die Baseline-Ohne-Vektoren-Zahl
// waren es nicht -- eine Zahl, die niemand nachrechnet, ist eine Behauptung.
describe("Dokumentation: Sprachuebergriff und Baseline nennen ihren Beleg", () => {
  it("die Flaeche nennt den Sprachuebergriff mit seinem Nenner, seiner Zahl und dem Beleg dahinter", () => {
    // Der Ollama-Zweig der Flaeche sagt seit 3.2.131, dass Englisch ueber deutsche
    // Notizen schwach ist. Die Zahl war wahr -- sie stand in
    // docs/belege/tag-0311/sprachuebergriff-nomic-1406.log.txt ("Gemessen sind 4 von 15
    // treffern (26,7 %)") -- aber sie war die einzige der vier Flaechenzahlen ohne Wache,
    // und der Nenner (15 Paare) war nicht als Nenner geschrieben. Gemessen im Fenster
    // 6.11.2026 10:29:39 MEZ: "it found 4 of 15" ohne Prozent und ohne Paar-Wort.
    const belegt = lies("docs/belege/tag-0311/sprachuebergriff-nomic-1406.log.txt");
    const m = /Gemessen sind (\d+) von (\d+) treffern/.exec(belegt);
    expect(m, "der Sprachuebergriff-Beleg nennt keine Treffer-Zahl — diese Wache ist taub").not.toBeNull();
    const treffer = Number(m![1]);
    const paare = Number(m![2]);
    const inhalt = lies("src/components/SystemStatus.tsx");
    const s = /found (\d+) of (\d+) cross-language pairs \((\d+) %\)/.exec(inhalt);
    expect(s, "die Flaeche nennt den Sprachuebergriff nicht mit Paar-Nenner und Prozent").not.toBeNull();
    expect(Number(s![1]), `die Flaeche behauptet ${s![1]} Treffer — der Beleg misst ${treffer}`).toBe(treffer);
    expect(Number(s![2]), `die Flaeche behauptet ${s![2]} Paare — der Beleg faehrt ${paare}`).toBe(paare);
    expect(Number(s![3]), `die Flaeche rundet auf ${s![3]} % — ${treffer} von ${paare} sind ${Math.round((100 * treffer) / paare)} %`).toBe(Math.round((100 * treffer) / paare));
    // Biss-Kontrolle: die nackte alte Form (Zahl ohne Paar-Wort und ohne Prozent) darf
    // nicht durchgehen, sonst ist diese Wache ein Band, das alles lasst.
    const alt = "it found 4 of 15. Embeddings are the numbers";
    expect(/found \d+ of \d+ cross-language pairs \(\d+ %\)/.test(alt), "die Gegenprobe trifft die alte Form nicht").toBe(false);
  });

  it("die Baseline ohne Vektoren heisst auf der Flaeche, was sie im Beleg ist", () => {
    // "51 % for naive substring search" ist die v1-Zahl des Drei-Beine-Laufs. Die
    // Hit@1-Wache oben sieht sie nicht, weil ihr Muster "Zahl % Hit@1" verlangt und
    // dieser Satz die Abkuerzung meidet. Also hier: Zahl und ihr Name, am Beleg.
    const belegt = lies("docs/belege/tag-0311/eval-drei-beine-1352.log.txt");
    const v1 = /── v1-Baseline[^\n]*\n[\s\S]*?Hit@1:\s+(\d+(?:[.,]\d+)?)\s*%/.exec(belegt);
    expect(v1, "der Beleg nennt keine v1-Baseline — diese Wache ist taub").not.toBeNull();
    const erlaubt = Math.round(Number(v1![1].replace(",", ".")));
    const inhalt = lies("src/components/SystemStatus.tsx");
    const s = /(\d+) % for naive substring search/.exec(inhalt);
    expect(s, "die Flaeche nennt keine Baseline-Zahl fuer die Suche ohne Vektoren").not.toBeNull();
    expect(Number(s![1]), `die Flaeche behauptet ${s![1]} % — der Beleg misst in der v1-Legbe ${erlaubt} %`).toBe(erlaubt);
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
    for (const bereich of ["src/core", "src/scan", "src/lib", "src/components"]) {
      const z = zeileFuer(new RegExp("^\\| `" + bereich + "`"));
      const soll = schwellen[`${bereich}/**`] as Record<string, number>;
      expect(zeilenVon(z), `${datei}: ${bereich} — Zeilen`).toBe(soll.lines);
      if (/of functions|der Funktionen/.test(z)) {
        expect(funktionenVon(z), `${datei}: ${bereich} — Funktionen`).toBe(soll.functions);
      }
    }
  });
});

// Der Stufen-Kanon (4.10.2026, für alle Außenflächen): es gibt K3PTA Core (0 €) und
// K3PTA Enterprise (nur gegen Vereinbarung). „K3PTA Pro" ist tot — und ein README, das
// trotzdem eine Pro-Stufe zum Kauf anbietet, ist kein Tippfehler sondern ein Versprechen,
// das niemand einlösen kann.
describe("README: die Stufen heißen, wie sie vergeben werden", () => {
  it("bietet kein K3PTA Pro und keinen Pro-Kauf an", () => {
    const text = lies("README.md");
    const proStellen = [...text.matchAll(/K3PTA Pro\b|\bPro day\b|\bPro tool\b|\bPro removes\b|\bBuying Pro\b/gi)].map((m) => m[0]);
    expect(proStellen, "README nennt eine tote Stufe: " + proStellen.join(", ")).toEqual([]);
  });

  it("nennt Core frei und Enterprise nur gegen Vereinbarung", () => {
    const text = lies("README.md");
    expect(text).toMatch(/K3PTA Core\*\*, free|Core, free/i);
    expect(text).toMatch(/Enterprise\*\*, by agreement|Enterprise.*agreement/i);
  });
});

describe("Der Messstand: eine Aussage ueber einen moeglichen Lauf, nicht ueb die Uhr", () => {
  // Am 12.10. fiel der App-Gate zweimal auf demselben Baum: um 23:50 UTC gruen,
  // um 00:00 UTC rot (Lauf 38185328804), und die Zahl 2 243 stimmte beide Male.
  // Die alte Regel verglich den Stempel mit dem Tag DES laufenden Berichts — ueb
  // Mitternacht konnte kein Stand gruen sein, und jeder Nachtschicht-Lauf war ein
  // Los. Die neue Regel lasst dem Stempel nur die Grenze, die keine Maschine
  // brechen kann: er darf nicht vor dem beglaubigten Lauf liegen.
  const lauf = (zahl: number, tag: string) => ({ zahl, tag, zeit: tag + " 00:00:00 UTC" });

  it("faellt nicht ueb Mitternacht: Stempel vom Vortag, der Lauf eine Minute spaeter", () => {
    expect(dokuVergleich("**2243 tests** (measured 2026-10-11)", lauf(2243, "2026-10-12"), "README.md")).toEqual([]);
  });

  it("laesst denselben Stempel am Tag des Laufs gelten", () => {
    expect(dokuVergleich("**2243 tests** (measured 2026-10-12)", lauf(2243, "2026-10-12"), "README.md")).toEqual([]);
  });

  it("verweigert einen Messstand in der Zukunft", () => {
    const fehler = dokuVergleich("**2243 tests** (measured 2026-11-01)", lauf(2243, "2026-10-12"), "README.md");
    expect(fehler.join(" | ")).toMatch(/Zukunft/);
  });

  it("verweigert weiter die Zahl eines anderen Laufs", () => {
    const fehler = dokuVergleich("**2241 tests** (measured 2026-10-11)", lauf(2243, "2026-10-12"), "README.md");
    expect(fehler.join(" | ")).toMatch(/nennt 2241 Tests, gelaufen sind 2243/);
  });

  it("verweigert eine Zahl ohne jeden Messstand", () => {
    expect(dokuVergleich("**2243 tests**", lauf(2243, "2026-10-12"), "README.md").join(" | ")).toMatch(/keinen Messstand/);
  });
});
