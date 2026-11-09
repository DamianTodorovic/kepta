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

  it("am echten Bestand: 134 von 182 absoluten Behauptungen nennen ihr Messzeug", () => {
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
    // P158 (gemessen 7.11. 21:08:23 MEZ mit dem Zaehler selbst): README.md:262 nennt jetzt
    // beide Haelften der Herkunfts-Zusage und ihre Zeugen — 582/181/79/102 -> 585/184/82/102,
    // Anteil ohne Messzeug 56,4 -> 55,4 %. Alle drei neuen absoluten Saetze tragen ihr Messzeug.
    // Ein Zwischenstand (21:06:24 MEZ: 586/184/81/103) ging auf meinen eignen Satz zurueck:
    // der Punkt IN der zitierten Absage (`Forbidden origin.`) ist ein Satzende fuer den Riss,
    // also stand der Zeuge in der folgenden Einheit und der Satz galt als unbewaffnet.
    // Heilung war die Formulierung, nicht der Zaehler: "must come back 403" statt des Zitats.
    // P159 (gemessen 7.11. 21:23:59 MEZ): die Namens-Zusage der Downloads war fuer 11 von
    // 58 veroeffentlichten Dateien falsch (latest-mac.yml, SHA256SUMS.txt tragen keine
    // Architektur). Zwei Saetze berichtigt, fuenf Traeger mit dem Release-Zensus bewaffnet:
    // Zaehler 82 -> 87, Nenner 184 und Einheiten 585 bleiben, ohne Messzeug 102 -> 97
    // (Anteil 55,4 -> 52,7 %). README allein 69 -> 71 mit, release-notes 5 -> 8 mit.
    // P160 (gemessen 8.11. 11:38:11 MEZ): der Census zaehlt Saetze, keine Absaetze — die
    // Leitsaetze der Gratis-Zusage standen ohne EIGENES Messzeug, weil ihr Beweis hinter
    // dem Punkt im Rest des Absatzes lag. Sieben Traeger bewaffnet: README.md:355 (die
    // Gratis-Zusage, Zeugen tests/keine-grenzen.test.ts:102 und :116), README.md:403 und
    // .github/release-notes.md:34 (die Rest-Downloads, Zeuge der Release-Zensus), die zwei
    // Schluessel-Saetze in release-notes:12 und ihre deutschen Zwillinge in :73 (Zeugen
    // tests/keine-grenzen.test.ts:107, :72 und :85). Zaehler 87 -> 94, Nenner 184 und
    // Einheiten 585 bleiben, ohne Messzeug 97 -> 90 (Anteil 52,7 -> 48,9 %). README allein
    // 71 -> 73 mit, release-notes 8 -> 13 mit. Die Wache dafuer lebt in
    // tests/keine-grenzen.test.ts (fuenf Leitsaetze je genau einmal, jeder mit seiner Wache)
    // und tests/doku-plattform.test.ts (drei Rest-Traeger mit dem Zensus).
    // P161 (gemessen 8.11. 12:08:16 MEZ mit dem Zaehler selbst): der Riss las Code-Zaehne als
    // Prosa — 14 Einheiten der vier Texte stammen aus Zaehnen, 2 davon trugen absolut-Woerter
    // (der Mermaid-Plan "all on your machine", der Python-Rest "No cream.") und standen
    // unbewaffnet im Nenner. satz-riss.mjs streicht Zaun-Zeilen jetzt vor dem Lesen: Saetze
    // 585 -> 571, Nenner 184 -> 182, Zaehler 94 bleibt, ohne Messzeug 90 -> 88 (Anteil
    // 48,9 -> 48,4 %). Kein bewaffneter Satz verliess den Zaehler. Die Wache lebt hier als
    // describe "P161, der Zaun" (Fall fuer den mermaid-Zaun, Fall am echten Bestand).
    // P162 (gemessen 8.11. 12:23:15 MEZ mit dem Zaehler selbst): die zwei Zeit-Film-Saetze
    // in README:17 nennen jetzt ihre Zeugen — die Zeitreise-Zusage (Zeuge
    // tests/engine.test.ts:260, asOf-Abfrage: alt kommt zurueck, neu nicht) und die
    // Demo-Korpus-Zusage (Zeugen scripts/screenshots.mjs und scripts/demo-korpus.mjs).
    // Zaehler 94 -> 96, Nenner 182 und Einheiten 571 bleiben, ohne Messzeug 88 -> 86
    // (Anteil 48,4 -> 47,3 %). Die schmale Klasse bleibt 35 — kein Film-Satz ist
    // maschinell widerlegbar. Die Wache lebt in tests/doku-plattform.test.ts, describe
    // "P162: die zwei Zeit-Film-Saetze nennen ihre Zeugen" (liest mit dem Satz-Riss und
    // der zeug-Regel des Zensus, nicht mit einem zweiten Muster).
    // P163 (gemessen 8.11. 12:40:07 MEZ mit dem Zaehler selbst): die vier staerksten
    // Kaufwirkungs-Saetze nennen jetzt ihre Zeugen — das Audit-Log-Paar in README:179
    // (Zugriff-Versprechen: Zeuge tests/lib/pruefprotokoll.test.ts:80, gelesenVon;
    // Siegel-Kette: :36 Integritats-Pruefung, :39 Veraenderung, :49 Abschneiden), die
    // Acht-Werkzeuge-Zusage in README:188 (Zeugen tests/mcp.test.ts:58 acht Tools,
    // :61 outputSchema-Pflicht je Werkzeug, :102 strukturierter Treffer) und der
    // Einzel-GET-Absage-Satz in README:253 (Zeuge tests/doku-plattform.test.ts,
    // Route-Tafel gegen registrierte Routen). Zaehler 96 -> 100, ohne 86 -> 82
    // (Anteil 47,3 -> 45,1 %). Nenner 182 und Einheiten 571 bleiben, schmale Klasse 35
    // bleibt. Die Wache lebt in tests/doku-plattform.test.ts, describe "P163: ..."
    // (gleiche Lesart wie P162: Satz-Riss und zeug-Regel importiert).
    // P164 (gemessen 8.11. 13:08:55 MEZ mit dem Zaehler selbst): der DELETE/restore-Satz
    // in README:253 Satz 2 (Zeuge tests/doku-plattform.test.ts:153/:155, Route-Tafel gegen
    // registrierte Routen) und der Both-protections-Satz in README:180 (Default-Haelfte:
    // Zeugen tests/lib/schild.test.ts:106/:108; Wolken-Haelfte: Zeuge
    // tests/kette-deckt-nur-schreibwege.test.ts:92 — der Wolken-Chat schreibt die Kette,
    // bevor der Anbieter gefragt wird, Zielhost .invalid stirbt am Namensaufloeser).
    // Zaehler 100 -> 102, ohne 82 -> 80 (Anteil 45,1 -> 44,0 %). Nenner 182, Einheiten 571
    // und schmale Klasse 35 bleiben. Die Wache lebt in tests/doku-plattform.test.ts,
    // describe "P164: ..." (gleiche Lesart wie P162/P163: Satz-Riss und zeug-Regel
    // importiert).
    // P165 (gemessen 8.11. 13:36:43 MEZ mit dem Zaehler selbst): die zwei UI-Zusagen
    // nennen jetzt ihre Zeugen — die Quellen-Chips-Zusage in README:211 (Zeuge
    // tests/components/quellen-chips-und-teil-marke.test.tsx:82, sendet eine Frage durch
    // den Streaming-Chat und haelt Sources:-Zeile, sechs Titel und den +2-Ueberlauf;
    // :100 der leere Fall ohne Zeile) und die Karten-Teil-Marke in README:230 (Zeuge
    // :131, zwei Dateien in einem Wurf — Ein-Stueck ohne Teil, Mehr-Stueck mit der
    // Stueckzahl DIESER Datei, nicht des Ladens). Zaehler 102 -> 104, ohne 80 -> 78
    // (Anteil 44,0 -> 42,9 %). Nenner 182, Einheiten 571 und schmale Klasse 35 bleiben.
    // Die Wache lebt in tests/doku-plattform.test.ts, describe "P165: ..." (gleiche
    // Lesart wie P162-P164: Satz-Riss und zeug-Regel importiert).
    // P166 (gemessen 9.11. 08:53:29 MEZ mit dem Zaehler selbst): die zwei asOf-/
    // Zeitfenster-Saetze in README:41 und die Telemetrie-Triade in README:79 nennen
    // jetzt ihre Zeugen — das Fenster+Regler-Paar (tests/lib/graphTime.test.ts:102
    // activeIdsAt, tests/components/KnowledgeGraph.leiste.test.tsx:183 Regler zieht
    // rueckwaerts), die Suche (HTTP: tests/server.test.ts:1436 NEU am Dateiende,
    // weil die Aussendung auf diese Datei ankert; MCP: tests/mcp-paritaet.test.ts:128;
    // Editor: tests/components/MemoryEditor.test.tsx:253) und die Triade (tests/
    // keine-telemetrie.test.ts:73, tests/keine-grenzen.test.ts:102/:116). Zaehler
    // 104 -> 107, ohne 78 -> 75 (Anteil 42,9 -> 41,2 %). Nenner 182, Einheiten 571
    // und schmale Klasse 35 bleiben. Die Wache lebt in tests/doku-plattform.test.ts,
    // describe "P166: ..." (gleiche Lesart wie P162-P165: Satz-Riss und zeug-Regel
    // importiert).
    // P167 (gemessen 9.11. 09:05:08 MEZ mit dem Zaehler selbst): die Keychain-Zelle
    // (README:74 Satz 2, Zeuge tests/core/schluessel.test.ts:150 — je OS der eigne
    // Geheimnis-Speicher) und der Private-provably-Satz (README:91 Satz 2, Zeugen
    // tests/keine-telemetrie.test.ts:73 und tests/keine-grenzen.test.ts:102) nennen
    // jetzt ihre Zeugen. Zaehler 107 -> 109, ohne 75 -> 73 (Anteil 41,2 -> 40,1 %).
    // Nenner 182 und Einheiten 571 bleiben. Die schmale Klasse waechst 35 -> 36:
    // die Zeugen-Prosa "no unchosen foreign address travels" trifft die maschine-
    // Regel (no…travels, messregel.mjs:35) — der Satz tritt BEWAFFNET (zeuge:true)
    // ein, kein Fehler. Voraussage traf die Hauptzahlen exakt, die schmale Klasse
    // war mit 35 vorausgesagt und wurde 36 (Ursache benannt). README:267 ("not a
    // single byte leaves") bleibt unbewaffnet — keine bereite Wache, eigene Scheibe
    // P168. Die Wache lebt in tests/doku-plattform.test.ts, describe "P167: ...".
    // P168 (gemessen 9.11. 09:26:16 MEZ mit dem Zaehler selbst): der in P167 vertagte
    // Satz README:267 ("With no AI configured, not a single byte leaves the machine")
    // nennt jetzt seinen Zeugen — tests/electron-haertung.test.ts:107 liest connect-src
    // des Electron-Inhalts-Sicherheitsplans (electron.js:169) und weist jeden fremden
    // Host ab; die Oberfläche verbindet nur zu sich selbst und diesem Rechner. Kein
    // Neubau, der Zeuge war bereit. Zaehler 109 -> 110, ohne 73 -> 72 (Anteil 40,1 ->
    // 39,6 %). Nenner 182, Einheiten 571 und schmale Klasse 36 bleiben — Voraussage
    // voll exakt. Die Klammer beschreibt nur die CSP-Sperre, nicht die Nutzer-Wege
    // (Chat/Embed bei gewähltem Anbieter, Clipper auf Aktion); das steht im Papier.
    // Die Wache lebt in tests/doku-plattform.test.ts, describe "P168: ...".
    // P169 (gemessen 9.11. 15:56:40 MEZ mit dem Zaehler selbst): der Sprach- und
    // Embedding-Cluster in README.md (:88 Vier-Notizen-Sprachtest, :88 Re-Embed nach
    // Modellwechsel, :126 persistente Embeddings via Hintergrund-Queue statt Re-Embed
    // pro Query, :460 eval:sprache mit 15 geerbten Fragenpaaren aus den 45 Anfragen des
    // 58-Notizen-Korpus) nennt seine Zeugen (scripts/embed-sprachtest.ts,
    // tests/embeddings.test.ts:166/:229/:298/:327/:354, tests/store.test.ts:129,
    // tests/engine.test.ts:115, tests/konkurrenz-sprachstufen.test.ts:93,
    // scripts/eval-sprachuebergriff.ts). Zaehler 110 -> 114 (README 89 -> 93), ohne
    // 72 -> 68 (README 48 -> 44, Anteil 39,6 -> 37,4 %). Nenner 182, Einheiten 571
    // und schmale Klasse 36 bleiben — Voraussage voll exakt. Die Wache lebt in
    // tests/doku-plattform.test.ts, describe "P169: ...".
    // Nach P170 (9.11.): Acht Feature-, Graph- und Pflege-Versprechen in README.md (:107
    // Re-read imported files, :112 Import your AI history, :139 Single-note title-echo
    // concept count, :150 Schema panel, :159 Settings live in encrypted data directory,
    // :169 Contradictions careful filter rules, :228 Duplicate review, :231 Text size
    // 100/115/130 %) nennen ihre Zeugen (tests/server.test.ts:556,
    // tests/import-chat-api.test.ts:93/:110,
    // tests/components/KnowledgeGraph.render.test.tsx:3415/:3430/:3840,
    // tests/lib/graphLayout.begriffsaufnahme.test.ts:46, tests/lib/ai-settings.test.ts:48/:76,
    // tests/lib/widersprueche.test.ts:32, tests/components/DuplicatesPanel.test.tsx:51/:98/:164,
    // tests/components/Settings-textgroesse-wirkt.test.tsx:36,
    // tests/components/Settings-textgroesse-ohne-ueberlauf.test.tsx:55). Zaehler 114 -> 122
    // (README 93 -> 101), ohne 68 -> 60 (README 44 -> 36, Anteil 37,4 -> 33,0 %). Nenner 182,
    // Einheiten 571 und schmale Klasse 36 bleiben — Voraussage voll exakt. Die Wache lebt in
    // tests/doku-plattform.test.ts, describe "P170: ...".
    // Nach P171 (9.11.): Zwoelf Lokal-, Keine-Grenzen-, Team- und Eval-Versprechen in README.md
    // (:168 Today straight from local database, :181 No license server/phone-home/one file, :209
    // Model discovery for Ollama and LM Studio without key, :260 All data in ~/.kepta/, :266
    // No account/telemetry/nothing to activate, :297 No service in between & encrypted SQLite
    // file, :353 K3PTA Core free & Enterprise by agreement, :357 no route/header/anchor/strings,
    // :358 Without that file no team workspace, :362 no self-serve checkout/key, :459 eval's
    // third leg lands on 76 %) nennen ihre Zeugen (tests/enterprise-api.test.ts:207,
    // tests/electron-haertung.test.ts:107, tests/richtlinien.test.ts:106,
    // tests/keine-telemetrie.test.ts:73, tests/components/chat-custom-verbunden.test.tsx:108,
    // tests/lib/verbindung-lokal-ohne-schluessel.test.ts:12,
    // tests/core/store-verschluesselung.test.ts:76, tests/testkapsel.test.ts:107,
    // tests/keine-grenzen.test.ts:72/:92/:102/:107/:116, tests/herkunft.test.ts:151,
    // tests/doku-zahlen.test.ts:223/:332/:338, tests/team.test.ts:161,
    // tests/components/TeamView.test.tsx:30, docs/belege/tag-0311/eval-drei-beine-1352.log.txt).
    // Zaehler 122 -> 134 (README 101 -> 113), ohne 60 -> 48 (README 36 -> 24, Anteil 33,0 ->
    // 26,4 %). Nenner 182, Einheiten 571 und schmale Klasse 36 bleiben — Voraussage voll exakt.
    // Die Wache lebt in tests/doku-plattform.test.ts, describe "P171: ...".
    expect(absoluten, "der Nenner ist nicht mehr 182 — der Riss oder die Klasse hat sich bewegt").toBe(182);
    expect(mit, `${mit} von ${absoluten} nennen ein Messzeug — erwartet war 134`).toBe(134);
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

/**
 * P161 — der Riss sah Zaehne als Prosa.
 *
 * Gemessen 11:03 MEZ am Probe-Lauf gegen den Zaehler-Stand 585/184/94: 14 Einheiten der vier
 * Texte stammen aus Code-Zaehnen — darunter der Mermaid-Plan ("K3PTA — all on your machine") und
 * der Python-Beispielrest "No cream.", tags=["cooking"])", den der Punkt hinter der Code-Zeile
 * zum eignen "Satz" machte. Zwei davon trugen absolut-Woerter und standen unbewaffnet im
 * Nenner (184 -> 182). Kein Mensch liest einen Zaun als Satz; der Riss darf Zaun-Zeilen nicht
 * mehr zaehlen. Die Sonde selbst liest weiter im ganzen Text — nur die Einheiten sind Prosa.
 */
describe("P161, der Zaun: ein Code-Zaun ist kein Satz", () => {
  it("ein mermaid-Zaun wird keine Einheit — der Text davor und danach bleibt ganz", () => {
    const text = "Before the fence nothing is ever rebuilt.\n\n```mermaid\nflowchart LR\n  A[\"all on your machine\"]\n  B[\"no cloud\"]\n```\n\nAfter the fence every word counts.";
    const einheiten = satzeAusMarkdown(text);
    expect(einheiten.some((e) => e.includes("flowchart")), "der Zaun ist als Satz gezaehlt").toBe(false);
    expect(einheiten.some((e) => e.includes("Before the fence")), "der Text vor dem Zaun fiel weg").toBe(true);
    expect(einheiten.some((e) => e.includes("After the fence")), "der Text nach dem Zaun fiel weg").toBe(true);
  });

  it("am echten Bestand: keine Einheit der vier Texte traegt Zaun-Inhalt", () => {
    const funde = [];
    for (const datei of DATEIEN) {
      const text = fs.readFileSync(path.join(WURZEL, datei), "utf8");
      for (const e of satzeAusMarkdown(text)) {
        if (/flowchart|subgraph |-->|^bash |^python |^json |KeptaClient|No cream/.test(e)) {
          funde.push(`${datei}: ${e.slice(0, 80)}`);
        }
      }
    }
    expect(funde, `${funde.length} Zaun-Einheiten sind noch Saetze:\n  ${funde.slice(0, 6).join("\n  ")}`).toHaveLength(0);
  });
});
