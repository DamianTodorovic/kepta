/* P128 — der Riss des Zensus muss Markdown-Blöcke trennen, sonst ist seine Einheit kein Satz.

   Gemessen 21:19:19 MEZ: von 132 als "absolute Behauptung" gezaehlten Einheiten des Zensus
   (docs/belege/aussendungsatz-0611/zaehlen.mjs) waren 32 = 24,2 % keine Saetze, sondern Bloecke
   aus mehreren Aufzaehlungen, Tabellenzeilen oder `<summary>`-Kuelsen; die laengste Einheit trug
   3 364 Zeichen. Folge: ein Messzeug in Bulle A deckt die Behauptung in Bulle B, und beide
   Lesungen — enge und Abschnitts-Lesung — messen eine andere Grundgesamtheit, als sie vorgeben.

   Dieser Fall faehrt denselben Riss, den der Census faehrt: importiert, nicht nachgebaut. Ein
   zweites Muster hier wuerde bei jeder Aenderung des Census still gruen. */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { BLOCKMARKER, satzeAusMarkdown } from "../docs/belege/aussendungsatz-0611/satz-riss.mjs";
import { absolut, maschine, zeug } from "../docs/belege/aussendungsatz-0611/messregel.mjs";

const WURZEL = path.resolve(import.meta.dirname, "..");
const DATEIEN = ["README.md", "SECURITY.md", "ROADMAP.md", ".github/release-notes.md"];

/** Der Blockmarker kommt aus demselben Blatt wie der Riss — kein zweites Muster hier. */

describe("P128, der Riss: eine Markdown-Einheit ist ein Satz, kein Block", () => {
  it("zwei Aufzaehlungen sind zwei Einheiten, jede ueber ihr eignes Thema", () => {
    const einheiten = satzeAusMarkdown(
      "- **Privacy shield** — nothing is ever read from your keychain. - **Private notes** — a note marked private never travels to a model."
    );
    expect(einheiten.length, "der Block bleibt eine Einheit — die Aufzaehlung wird verschluckt").toBe(2);
    for (const e of einheiten) expect(e, `Einheit traegt noch einen Aufzaeicher: ${e.slice(0, 90)}`).not.toMatch(BLOCKMARKER);
    // Nicht nur die Zahl: die eine Einheit darf die andere nicht mehr enthalten.
    expect(einheiten.filter((e) => e.includes("keychain")).length).toBe(1);
    expect(einheiten.filter((e) => e.includes("travels")).length).toBe(1);
  });

  it("Absatzgrenzen und Tabellenzeilen trennen, eine Tabellenzeile bleibt eine Einheit", () => {
    const einheiten = satzeAusMarkdown(
      "Erste Zeile, die alles guarantees.\n\nZweite Zeile, die niemals etwas read.\n\n| Feature | What shipped |\n|---|---|\n| **Scope** | Separates who a memory belongs to |"
    );
    for (const e of einheiten) expect(e, `Einheit traegt Markdown-Struktur: ${e.slice(0, 90)}`).not.toMatch(BLOCKMARKER);
    expect(einheiten.some((e) => e.includes("Scope") && e.includes("who a memory belongs to")), "die Tabellenzeile ist zerfallen").toBe(true);
  });

  it("HTML-Kapseln und Bild-Markup stehen nicht in einer Einheit", () => {
    const einheiten = satzeAusMarkdown(
      '<details open> <summary><strong>Capture &amp; store</strong></summary> - Create notes that are never deleted quietly. <img src="docs/demo.gif" alt="Eighteen months of knowledge growing">'
    );
    for (const e of einheiten) expect(e, `Einheit traegt HTML: ${e.slice(0, 90)}`).not.toMatch(BLOCKMARKER);
  });

  it("ein nackter Bindestrich ist keine Grenze — P109s Strich darf einen Satz nicht teilen", () => {
    const einheiten = satzeAusMarkdown(
      "The picture keeps its place - and settles under the new forces, which means nothing is ever rebuilt here."
    );
    expect(einheiten.length, "der nackte Strich hat den Satz zerschnitten").toBe(1);
  });

  it("die Biss-Kontrolle: der Marker sieht einen Block, auch ohne den Riss", () => {
    // Diese Zeile prueft den MARKER, nicht den Riss: wird der Block durch den Riss getrennt,
    // ist "einheit traegt den Marker" keine Antwort mehr. Genau darum fiel dieser Fall rot
    // (1 rot / 5 gruen), nachdem der Riss healed war: er pruefte den Riss, wo er den Marker
    // pruefen wollte. Jetzt prueft er den Marker, und zwar in beide Richtungen.
    expect(BLOCKMARKER.test("- **A** — first claim that never says why. - **B** — second claim that always stays."), "der Marker sieht einen nackten Block nicht — die Kontrolle ist taub").toBe(true);
    expect(BLOCKMARKER.test("first claim that never says why."), "der Marker ist zu weit — er traegt jede Zeile").toBe(false);
  });

  it("am echten Bestand: keine einzige Einheit traegt noch Block-Struktur", () => {
    const funde = [];
    for (const datei of DATEIEN) {
      const text = fs.readFileSync(path.join(WURZEL, datei), "utf8");
      for (const e of satzeAusMarkdown(text)) if (BLOCKMARKER.test(e)) funde.push(`${datei}: ${e.slice(0, 80)}`);
    }
    expect(funde, `${funde.length} Einheiten sind keine Saetze:\n  ${funde.slice(0, 6).join("\n  ")}`).toHaveLength(0);
  });
});

describe("P129, der Wortschatz: ein benanntes Instrument ist ein Messzeug", () => {
  /* P128 meldete 16 von 172 absoluten Behauptungen mit Messzeug (9,3 %). Nachgelesen 21:55:40 MEZ:
     sechs davon nannten ihr Werkzeug wohl, aber das Muster sah die Namen nicht —
     `vitest.config.ts` mit seinen Schwellen (funf Zeilen der Coverage-Tabelle) und
     `electron-builder.json` mit seinen Plattform-Zielen (die Vorlage). Eine Zahl, die unter einem
     zu engen Wortschatz gemessen wird, ist keine Messung, sondern ein Verdacht; P128 hatte recht
     mit der Richtung und unrecht mit der Groesse. */

  it("ein benanntes Konfig-Instrument zaehlt als Messzeug", () => {
    const satz = 'must not fall under 98 % of lines · must hold 100 % of functions (both in vitest.config.ts, key "src/scan/")';
    expect(absolut.test(satz), "die Behauptung selbst faellt aus der breiten Klasse — dann ist der Fall hohl").toBe(true);
    expect(zeug.test(satz), "vitest.config.ts ist kein Messzeug? dann sind Coverage-Zahlen nach aussen blind").toBe(true);
  });

  it("electron-builder.json heisst ein Instrument, weil die Datei das Ziel erfuellt oder nicht", () => {
    const satz = "Windows and Linux targets exist in electron-builder.json and in CI, but no Windows or Linux installer is published";
    expect(zeug.test(satz), "electron-builder.json ist kein Messzeug? dann nennt die Vorlage ihr Werkzeug nicht").toBe(true);
  });

  it("ein blosses Wort bleibt kein Messzeug — die Wortschatz-Erweiterung ist nicht alles", () => {
    const nackig = "the pipeline is configured carefully and every build always works, nothing untested is shipped";
    expect(zeug.test(nackig), "erweitert zu weit: ein Satz ohne Instrument-Namen gilt als gemessen").toBe(false);
  });

  it("ein gebrochener Satz bleibt ein Satz — die Zeile ist kein Satzende", () => {
    // Gemessen 22:12:50 MEZ, nachdem SECURITY.md bewaffnet war: der Riss von P128 trennte pro
    // Zeile, und ein Mensch schreibt Umbriche mitten im Satz. Die Behauptung stand in der
    // ersten Zeile, ihr Messzeug in der zweiten — der Census meldete "ohne Messzeug", obwohl
    // derselbe Satz es nennt. Ein Riss, der einen Satz zerlegt, kann ein Zeugnis nicht halten.
    const gebrochen = "It never leaves the keychain on its own — what that\nmeans is checked, not promised: `tests/core/schluessel.test.ts:111` reads the argv.";
    const einheiten = satzeAusMarkdown(gebrochen);
    expect(einheiten.length, `der Umbruch zerlegte den Satz in ${einheiten.length} Einheiten`).toBe(1);
    expect(zeug.test(einheiten[0]), "das Messzeug steht im selben Satz, wird aber nicht gesehen").toBe(true);
  });

  it("am echten Bestand: 79 von 181 absoluten Behauptungen nennen ihr Messzeug", () => {
    let absoluten = 0;
    let mit = 0;
    for (const datei of DATEIEN) {
      const text = fs.readFileSync(path.join(WURZEL, datei), "utf8");
      for (const s of satzeAusMarkdown(text)) {
        if (!absolut.test(s)) continue;
        absoluten++;
        if (zeug.test(s)) mit++;
      }
    }
    // Gemessen 7.11. 03:36:00 MEZ mit dem Zaehler selbst (docs/belege/aussendungsatz-0611/
    // zaehlung-0611.log.txt): P146 bewaffnete README.md:181 und :427 sowie die zweisprachige
    // Schluessel-Zeile in .github/release-notes.md:12 und :75 (58 -> 62), P147 bewaffnete
    // README.md:357 mit einem Historien-Beleg (62 -> 63), P148 gab zwei Saetzen ihren Nenner
    // (63 -> 64), P149 bewaffnete README.md:456 (64 -> 65), P151 bewaffnete README.md:177 in
    // beiden Saetzen und :355 (65 -> 68): die Klientenliste der Maschine wird jetzt gegen das
    // Blatt gehalten, nicht gegen meine Aufzaehlung. P152 bewaffnete README.md:85 — "one brain
    // for every AI tool" nennt jetzt die zwei Tueren, die auf demselben Leib lesen, und die
    // Gegenprobe (68 -> 69). Zaehler steigt, Nenner 174 bleibt; die Einheiten wuchsen von 573
    // auf 574, weil der bewaffnete Satz beim Umbau zwei wurde.
    // Nenner 174 -> 177 am 7.11. 03:50:51 MEZ: P153 berichtigt eine Ueber-behauptung
    // ("runs without bound", "nothing in it is metered", "nichts darin ist begrenzt") durch eine
    // Schutzkante mit Zahlen — chat 20/min, clipper 12/min, suche 240/min, schreiben 600/min. Die
    // drei neuen Erklaerungen sind selbst absolute Behauptungen, also steigt der Nenner um 3 und
    // der Zaehler um 3: ohne Messzeug bleiben 105. Der Wert dieses Schlages ist die Wahrheit der
    // Saetze, nicht ihre Deckung — das steht so ins Papier.
    // Zaehlung der Vorgeschichte: P146 (58 -> 62), P147 (62 -> 63), P148 (63 -> 64), P149
    // (64 -> 65), P151 (65 -> 68), P152 (68 -> 69), P153 (69 -> 72 bei Nenner 177).
    // P154 (zuletzt gemessen 10:30:54 MEZ mit dem Zaehler selbst): der neue Anker-Absatz in
    // README.md:433 bringt vier absolute Saetze, alle vier mit Messzeug — Nenner 177 -> 181,
    // Zaehler 72 -> 76, ohne Messzeug bleiben 105. Die Einheiten wuchsen 577 -> 582, weil der
    // Riss den Absatz in fuenf Einheiten zerlegt. Zwei Zwischenstaende (179/74, dann 180/74 bei
    // 106 ohne Messzeug) gingen auf meine eignen Umformulierungen zurueck: der Zahlensatz blieb
    // ohne Messzeug im eignen Satz, und ein Punkt statt eines Semikolons machte aus einem zwei.
    // Die 158 verwaisten Kurzformen halten tests/anker-wache.test.ts:197, :204 und :205.
    // Zugleich fiel README.md:181 aus der schmalen Klasse (34 -> 33): das Wort, das sie dort
    // hielt, war "as always" in "validated offline as always", und diese Formulierung war falsch.
    expect(absoluten, "der Nenner ist nicht mehr 181 — der Riss oder die Klasse hat sich bewegt").toBe(181);
    expect(mit, `${mit} von ${absoluten} nennen ein Messzeug — erwartet war 79`).toBe(79);
    expect(mit / absoluten, "Anteil ohne Nenner ist ein Urteil").toBeGreaterThan(0.3);
    expect(maschine.source.length, "die schmale Klasse wurde nicht mitgeändert").toBeGreaterThan(10);
  });
});

/**
 * P143 — die Zahlen-Einheit der absolut-Regel war nicht nach hinten begrenzt.
 *
 * Gemessen 6.11. 00:48:43 und 00:49:32: `\\d[\\d., ]*(...|of|von)` trifft in "tests/engine.test.ts:268
 * off the search hit" das "of" in "off" — ein Satz, der gar keine Zahl behauptet, zaeilt als
 * Zahlenbehauptung. Der erste Gegenentwurf (ein nacktes `\b` hinter der ganzen Alternation) ist
 * widerlegt: er warf 8 Sätze aus dem Nenner, 6 davon echte Prozentangaben, weil `%` vor einem
 * Leerzeichen keine Wortgrenze findet. Die Regel muss also **die Woerter** begrenzen und die
 * Prozent-Marke frei lassen.
 */
describe("P143, die Zahlen-Einheit: ein of in einem groesseren Wort ist keine Einheit", () => {
  it("ein of in 'off' macht keinen Satz zu einer Zahlenbehauptung", () => {
    // Genau mein README-Satz aus P142: die Zahl ist eine Zeilennummer in einem Zitat.
    const satz = "Contradictions supersede each other and expired facts are marked (tests/components/MemoryCard.test.tsx:47 and :52 read both marks off the rendered card, tests/engine.test.ts:268 off the search hit)";
    expect(absolut.test(satz), "das of in 'off' zaehlt als Zahlen-Einheit — die Sonde ist zu weit").toBe(false);
  });

  it("ein of als eignes Wort nach einer Zahl zaehlt weiter — der Nenner darf nicht schmeicheln", () => {
    expect(absolut.test("175 of 573 sentences carry an absolute claim.")).toBe(true);
    expect(absolut.test("The share rose: 58 of 175 claims name their instrument.")).toBe(true);
  });

  it("die Prozent-Marke verliert ihre Kraft nicht an einem Leerzeichen", () => {
    // Die Kontrollen gegen den naive `\b`-Entwurf: alle vier sind echte Zahl-Angaben und
    // vier von den acht Saetzen, die der naive Wurf zu Unrecht aus dem Nenner warf.
    expect(absolut.test("Text size — 100, 115 or 130 %, under Settings → Display.")).toBe(true);
    expect(absolut.test("src/core must not fall under 97 % of lines and must hold 100 % of functions.")).toBe(true);
    expect(absolut.test("Hit@1 71 % for the engine without a vector leg.")).toBe(true);
    expect(absolut.test("The eval's third leg lands on the same 76 %.")).toBe(true);
  });

  it("ms, MiB, GiB, notes und queries bleiben Einheiten, 'off' und 'note' sind es nicht", () => {
    expect(absolut.test("The answer took 612 ms and touched 4 notes.")).toBe(true);
    expect(absolut.test("The database file holds 1,4 GiB of knowledge.")).toBe(true);
    expect(absolut.test("Set the interval to 250 ms, never less.")).toBe(true);
    // Ohne eine echte Einheit darf kein Wort mit einem Einheitsstamm den Satz zaehlen.
    expect(absolut.test("The panel shows 250 note-headers and 3 office links.")).toBe(false);
  });
});
