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

  it("am echten Bestand: 50 von 171 absoluten Behauptungen nennen ihr Messzeug", () => {
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
    expect(absoluten, "der Nenner ist nicht mehr 171 — der Riss oder die Klasse hat sich bewegt").toBe(171);
    expect(mit, `${mit} von ${absoluten} nennen ein Messzeug — erwartet war 50`).toBe(50);
    expect(mit / absoluten, "Anteil ohne Nenner ist ein Urteil").toBeGreaterThan(0.28);
    expect(maschine.source.length, "die schmale Klasse wurde nicht mitgeändert").toBeGreaterThan(10);
  });
});
