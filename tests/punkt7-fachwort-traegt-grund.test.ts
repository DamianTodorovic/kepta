/* Punkt 7, der Riegel: jedes Fachwort auf der Flaeche schuldet seinen Grund oder eine Taetigkeit.

   Gemessen 5.11.2026 18:35 MEZ am ausgelieferten 3.2.162: acht Saetze standen ohne beides, und
   der Riegel des Censes (`scripts/verstaendlichkeit.mjs`) hielt die Zahl nur, weil er auf ihrem
   eignen Anschlag sass (Max 8 bei gemessenen 8). Ein Riegel ohne Spiel ist eine Meldungszeile.

   Die Suite faehrt hier dieselbe Regel, die der Census fährt — importiert, nicht nachgebaut.
   Ein zweites Regex- Paar in diesem Fall wuerde bei jeder Regel-Aenderung still gruen.
   Gezaehlt wird die Quelle, nicht das Buendel: das Objekt ist auf fremden Rechnern ein anderes,
   die Sprache, die wir schreiben, ist dieselbe. */
import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  ALGORITHMEN,
  DIENER,
  FLAECHE,
  SATZKAPPE,
  WERKZEUG,
  artenAusQuelltext,
  etikettAusText,
  etiketteAusQuelltext,
  doppelteNamen,
  einmalNachWortlaut,
  etikettNenntAlgorithmus,
  satzAusText,
  istBenutzersprache,
  satzAusQuelltextMitEtiketten,
  vierWortlauf,
  imObjekt,
  glaetteInterpolation,
  NAMEN_LAGEN,
  NAMEN_MINDESTENS,
  wortlautAusText,
  wortlautInventar,
  kappenZeilen,
  kandidatenAusQuelltext,
  randUeberKappe,
  summenPruefung,
  traegtKappe,
  zaehle,
  zensiere,
} from "../scripts/verstaendlichkeit.mjs";
import { SPUR_LABELS, spurAria } from "../src/lib/spuren";
import { ANSICHT_LABELS, ansichtBeschreibung } from "../src/lib/ansichten";

/** Die Form einer Fundstelle -- Satz oder Etikett. Der Census ist JavaScript ohne Typdecke. */
type Stelle = { s: string; art: string; quelle: string };

/** Dieselbe Liste, dasselbe Muster: die Suite prueft gegen die Sonde, nicht gegen ein zweites Regex. */
const ALGORITHMEN_RE = new RegExp("\\b(" + ALGORITHMEN.join("|") + ")\\b", "i");

const WURZEL = path.resolve(import.meta.dirname, "..");

const LATE = 0;

/** Die Form dessen, was `zensiere` zurueckgibt. Der Census ist JavaScript ohne Typdecke,
    also wird die Form hier benannt -- ein implizites `any` in einem Fall, der eine Zahl
    verteidigt, waere ein Fall, der nichts behauptet. */
type Fund = { s: string; quelle: string; fach: string[]; grund: boolean; handlung: boolean; woerter: number };
type Census = { n: number; unterKappe: number; mitGrund: number; mitHandlung: number; mitFach: number; fachOhneAlles: Fund[] };

describe("Punkt 7: Fachwort-Saetze der Flaeche tragen Grund oder Taetigkeit", () => {
  const funde = kandidatenAusQuelltext(FLAECHE);
  const getragen = [...funde].map(([s, quelle]) => ({ ...zaehle(s), s, quelle }));
  const census = zensiere(getragen) as Census;

  it("kein Satz der Flaeche nennt ein Fachwort, ohne zu erklaeren oder zu handeln", () => {
    const liste = census.fachOhneAlles
      .map((z: Fund) => `    ${z.fach.join(",")}  ${z.quelle}  ::  ${z.s.slice(0, 96)}`)
      .join("\n");
    expect(census.fachOhneAlles.length, `\n  ${census.fachOhneAlles.length} Funde:\n${liste}`).toBeLessThanOrEqual(LATE);
  });

  it("der Census ist nicht taub: ein Satz ohne Grund und ohne Taetigkeit wird getroffen", () => {
    const blind = zaehle("The graph shows the notes that share an entity, so you can follow a name.");
    expect(blind.fach.length).toBeGreaterThan(0);
    expect(blind.grund || blind.handlung).toBe(true);
    const taub = zaehle("The graph lists entities and their embeddings.");
    expect(taub.fach.length).toBeGreaterThan(0);
    expect(taub.grund || taub.handlung).toBe(false);
  });

  it("die Werkzeug-Lage hat denselben Riegel: kein Fachwort ohne Grund", () => {
    // Punkt 7 gilt auch fuer den Leser, der ein Modell ist. Gemessen 5.11.2026 21:05 MEZ
    // am ausgelieferten 3.2.166: 3 von 33 Werkzeug-Saetzen nannten ein Fachwort ohne Grund
    // oder Taetigkeit -- zwei in `src/core/mcp.ts` (memory_graph: "capped." und "default 2"),
    // einer in `src/core/embeddings.ts` ("Embedding count does not match").
    // Dieselbe Regel, dieselbe Sonde, eigne Menge.
    const funde = kandidatenAusQuelltext(WERKZEUG);
    const getragen = [...funde].map(([s, quelle]) => ({ ...zaehle(s), s, quelle }));
    const c = zensiere(getragen) as Census;
    const liste = c.fachOhneAlles.map((z: Fund) => `    ${z.fach.join(",")}  ${z.quelle}  ::  ${z.s.slice(0, 84)}`).join("\n");
    expect(c.fachOhneAlles.length, `\n  ${c.fachOhneAlles.length} Funde in ${c.n} Werkzeug-Saetzen:\n${liste}`).toBe(0);
  });

  it("der Tiefen-Hinweis bleibt dem Riegel sichtbar", () => {
    // Gemessen 5.11.2026 22:36 MEZ an der Quelle: die Sonde zaehlt 32 Werkzeug-Kandidaten,
    // nicht 33 wie um 21:05. Der eine verlorene ist mein eigener neuer Satz "Graph depth 1-4,
    // default 2; use 1 for a quick lookup" -- die Kante gegen Code (`{`, '}', '=', ';') trifft
    // sein Semikolon, und ein Satz, den die Sonde nicht sieht, kann keinen Befund melden.
    // Nach dem Schnitt: 33 Kandidaten, einer mit "quick lookup", gemessen 23:05:52 MEZ.
    // Ein gruenes Urteil auf einer still kleineren Menge ist keine bessere Messung.
    const satze = [...kandidatenAusQuelltext(WERKZEUG).keys()];
    const sichtbare = satze.filter((s: string) => s.includes("quick lookup"));
    expect(sichtbare.length, `kein Werkzeug-Satz mit "quick lookup" ist Kandidat -- die Menge ist geblendet`).toBe(1);
  });

  it("die Werkzeug-Menge hat einen Nenner, keine Luecke", () => {
    // 33 Kandidaten gemessen 21:05 MEZ an der Quelle (der rote Lauf meldete sie), 32 um
    // 22:36 MEZ -- die Eine, die fehlte, war der Semikolon-Fund. Nach dem Raster-Fix sind es
    // 38, gemessen 23:22 MEZ: die sieben verdeckten Saetze sind da, drei davon in mehrere
    // Zaehlbare zerlegt. Die Untergrenze sitzt hier, damit ein Schrumpfen der Menge nie als
    // Erfolg durchgeht; der Nenner ist eine Zahl, keine Behauptung.
    const satze = [...kandidatenAusQuelltext(WERKZEUG).keys()];
    expect(satze.length, `nur ${satze.length} Werkzeug-Saetze gezaehlt — die Sonde sieht weniger als die Tuer hat`).toBeGreaterThanOrEqual(38);
  });

  it("Satzgestalt schuetzt vor dem Code-Raster, Notation nicht", () => {
    // Das Raster wirft Quelltextfragmente aus der Benutzersprache. Bis hierhin traf es auch
    // jeden Satz mit einem Semikolon oder einer geschweiften Klammer -- gemessen 22:40 MEZ
    // sieben Werkzeug-Saetze, darunter die memory_search-Beschreibung, die ein Modell wirklich
    // liest. Neu: starke Codezeichen (`=>`, `if(`, `for(`, `.wort(`) bleiben absolute Absage;
    // `{`, `}`, `;`, `=` nur, wenn der Satz keine Satzgestalt hat.
    const suche = "Hybrid retrieval (BM25 + vectors + knowledge graph) over K3PTA memory. Expired and superseded memories are flagged as such.";
    expect(istBenutzersprache(suche), "die naechste Zeile ist ein Satz, kein Codefragment").toBe(true);
    expect(istBenutzersprache("Graph depth 1-4, default 2; use 1 for a quick lookup")).toBe(true);
    // Notation ohne Satzgestalt bleibt draussen: sie erklaert keine Sprache, sie listet Werte.
    expect(istBenutzersprache("semantic=fact, episodic=event, procedural=how-to, reference=imported document")).toBe(false);
    expect(istBenutzersprache("true = delete permanently")).toBe(false);
    expect(istBenutzersprache("mode=expire only, defaults to now")).toBe(false);
    // und ein echtes Codefragment bleibt es auch mit Punkt am Ende
    expect(istBenutzersprache("Call foo(bar) and if(x) else y, then return z.")).toBe(false);
  });

  it("die drei lange unsichtbaren Werkzeug-Beschreibungen sind Kandidaten", () => {
    // src/core/mcp.ts: die Beschreibungen von memory_search, memory_save und dem Feld
    // `beziehungen` in memory_consolidate. Ihre Merk-Woerter sind so gewaehlt, dass sie einen
    // Wortlautwechsel ueberleben: BM25, Wiki links, beziehungen -- nicht ein ganzer Satz.
    const satze = [...kandidatenAusQuelltext(WERKZEUG).keys()];
    for (const merk of ["BM25", "[[Wiki links]]", "beziehungen sets claims"]) {
      expect(satze.some((s: string) => s.includes(merk)), `${merk} steht in keinem Kandidaten -- die Sonde sieht den Satz nicht`).toBe(true);
    }
  });

  it("die Satzkappe der Flaeche haelt 80 Prozent", () => {
    // Der Census meldet die Kappe nur auf der Platte; die Suite hielt sie nicht. Seit dem
    // Raster-Fix 3.2.169 sind neun lange Saetze sichtbar, gemessen 23:22 MEZ: 279 von 344
    // unter 14 Woertern = 81,1 %. Ohne diesen Fall haette die Gruppe still unter die Latte
    // rutschen koennen, waehrend der Riegel weiter 0 Funde meldete.
    const satze = [...kandidatenAusQuelltext(FLAECHE)];
    const c = zensiere(satze.map(([s, quelle]) => ({ ...zaehle(s), s, quelle }))) as Census;
    expect(c.unterKappe / Math.max(1, c.n), `${c.unterKappe} von ${c.n} unter der Kappe`).toBeGreaterThanOrEqual(0.8);
  });

  it("die Diener-Lage hat denselben Riegel: ihr Text erreicht die Flaeche", () => {
    // `server/` war keine Census-Menge, obwohl fuenf Stellen den Leib einer Antwort in die
    // Flaeche schreiben: Settings.tsx:340 und :379, Chat.tsx:680 (`tuerSatz(json.error, …)`),
    // store.ts:327 und :489. Gemessen 00:30:54 MEZ: 62 Kandidaten, 5 Funde, Kappe 82,3 %.
    // Dieselbe Sonde, dieselbe Regel, eigne Menge -- und eigne Untergrenze.
    const funde = kandidatenAusQuelltext(DIENER);
    const getragen = [...funde].map(([s, quelle]) => ({ ...zaehle(s), s, quelle }));
    const c = zensiere(getragen) as Census;
    const liste = c.fachOhneAlles.map((z: Fund) => `    ${z.fach.join(",")}  ${z.quelle}  ::  ${z.s.slice(0, 84)}`).join("\n");
    expect(c.fachOhneAlles.length, `\n  ${c.fachOhneAlles.length} Funde in ${c.n} Diener-Saetzen:\n${liste}`).toBe(0);
    expect(c.n, `nur ${c.n} Diener-Saetze gezaehlt -- die Menge ist kleiner als gemessen`).toBeGreaterThanOrEqual(62);
  });

  it("erklaerende Verben und das Senden des Agenten sind Grund und Taetigkeit", () => {
    // P82, gemessen 00:30:54 MEZ: "a mention says no more than that two terms appeared
    // together" erklaert das Fachwort, indem es sagt, was es bedeutet -- und das Raster sah
    // darin keinen Grund. Ein Satz, der eine Bedeutung nennt, ist erklaert; ein Satz, der dem
    // Leser eine Nachricht wegschicken heisst, ist eine Taetigkeit.
    // Der gemessene Fall von 00:30:54 MEZ in voller Laenge -- sein Fachwort ist "graph",
    // die Erklaerung steckt im that-Satz ueber die Maennung.
    const erklaert = zaehle("This note claims nothing yet - the graph draws only mentions for it, and a mention says no more than that two terms appeared together.");
    expect(erklaert.fach.length).toBeGreaterThan(0);
    expect(erklaert.grund, "sagen, was ein Wort bedeutet, ist ein Grund").toBe(true);
    const sendend = zaehle("Send one request at a time, because the protocol removed batching.");
    expect(sendend.handlung, "dem Leser senden heisst, dem Leser eine Taetigkeit nennen").toBe(true);
    // Die Biss-Kante bleibt: ein nackter Fachwort-Satz ohne Bedeutung und ohne Senden.
    const taub = zaehle("The graph lists entities and their embeddings.");
    expect(taub.fach.length).toBeGreaterThan(0);
    expect(taub.grund || taub.handlung).toBe(false);
  });

  it("der Import des Census faehrt ihn nicht selbst", () => {
    // Bis 3.2.167 endete `scripts/verstaendlichkeit.mjs` auf einem nackten `haupt()`. Jeder
    // Import -- und die Suite importiert die Regel, um sie zu fahren -- las darum die
    // 49 200 915 B des ausgelieferten app.asar und druckte siebzig Zeilen in den Lauf.
    // Zwei Seiten, weil ein einzelnes Nullresultat nichts beweist: der Import muss stumm
    // bleiben, und derselbe Befehl muss beim direkten Start melden. Gemessen 23:05:52 MEZ:
    // ein reiner `import()` meldet keine einzige Zeile.
    // Der direkte Start wird mit spawnSync gefahren, nicht mit execFileSync: der Census gibt
    // 1 zurueck, wenn eine Latte faellt (gemessen 23:26:25 MEZ gegen das installierte
    // 3.2.168: URTEIL KAPPE FAELLT, weil die neun neuen Saetze dort noch nicht stehen), und
    // dieser Fall prueft die Sprache des Werkzeugs, nicht das Urteil des Produkts.
    const stumm = execFileSync("node", ["--input-type=module", "-e", `await import("file://${WURZEL}/scripts/verstaendlichkeit.mjs")`], { encoding: "utf8" });
    expect(stumm.trim(), "der Import meldet einen Census — die Suite laeuft dann gegen ein Objekt, das sie nicht bestellt hat").toBe("");
    const laut = spawnSync("node", [path.join(WURZEL, "scripts", "verstaendlichkeit.mjs")], { encoding: "utf8" });
    expect(laut.stdout).toContain("URTEIL KAPPE");
  });

  it("die Kappe-Zeile nennt, ob sie an dieser Lage misst oder nur berichtet", () => {
    // Gemessen 6.11.2026 01:16:40 MEZ am ausgelieferten 3.2.173: der Werkzeug-Block schrieb
    // "unter der Kappe von 14 Woertern: 18 (72.0 %) -- Latte 80 %", obwohl URTEIL KAPPE nur
    // die Flaeche misst (Diener ebenso). Eine Latte, die neben einer nicht gemessenen Zahl
    // steht, erfindet eine Regel -- und die Zahl, die sie erfindet, faellt.
    const laut = spawnSync("node", [path.join(WURZEL, "scripts", "verstaendlichkeit.mjs"), "--nur", "quelltext"], { encoding: "utf8" });
    expect(laut.stdout).toContain("FLAECHE (ein Mensch liest)");
    const flaeche = laut.stdout.split("FLAECHE (ein Mensch liest)")[1].split("WERKZEUG (")[0];
    const werkzeug = laut.stdout.split("WERKZEUG (ein Agent liest)")[1].split("DIENER (")[0];
    const diener = laut.stdout.split("DIENER (ein Mensch oder ein Agent")[1];
    expect(flaeche).toContain("Latte 80 %");
    expect(flaeche).not.toContain("Bericht, keine Latte");
    expect(werkzeug).toContain("Bericht, keine Latte");
    expect(werkzeug).not.toContain("— Latte 80 %");
    expect(diener).toContain("Bericht, keine Latte");
    // Nebenbefund aus demselben Lauf (01:50:03 MEZ): die Kopfzeile nannte die Zahl "im
    // ausgelieferten Objekt", obwohl `--nur quelltext` gar kein Objekt liest. Ein Kopf, der
    // eine Auslieferung meldet, die er nicht gesehen hat, ist dieselbe Krankheit.
    expect(werkzeug).toContain("im Baum, nicht am ausgelieferten Objekt");
    // Und das Urteil sagt weiter, welche Lage es misst.
    expect(laut.stdout).toMatch(/URTEIL KAPPE: (HALTET|FAELLT) \(Flaeche/);
  });

  it("der Vorlesername ist nicht derselbe Lesefall wie ein Titel", () => {
    // Ein `title=` malt das Betriebssystem in ein kleines, unbestaendiges Kaestchen, das
    // verschwindet, sobald der Zeiger wandert -- ein Hover ist kein Absatz. Ein
    // `aria-label` wird voellig gesprochen, ein Vorleser ueberschlaegt nichts. Seit P98
    // liefen beide unter demselben Wort "rand" (gemessen 10:01:40 MEZ: 17 Saetze ueber
    // der Kappe, 16 davon Titel, einer der Vorlesername des Graphen). Also zwei Arten.
    const funde = kandidatenAusQuelltext(FLAECHE);
    const arten = artenAusQuelltext(FLAECHE);
    const vorleser = "Knowledge graph. Use the arrow keys to move between notes and concepts, Enter opens the note, or the dossier of a concept, Escape clears the selection.";
    expect(arten.get(vorleser), "ein Name fuer den Vorleser ist kein Schwebezettel").toBe("vorleser");
    // Nicht an einem bestimmten Wortlaeufer haengen: ein Titeltext ist Produkttext und
    // darf sich aendern. Geprueft wird die Art, an der Zahl der Titel und daran, dass
    // der Vorleser eine eigne Art hat.
    const randArten = [...arten.values()];
    expect(randArten.filter((a) => a === "rand").length, "Titel und Platzhalter brauchen eine eigne Art").toBeGreaterThan(20);
    expect(randArten.filter((a) => a === "vorleser").length).toBeGreaterThan(0);
    expect(funde.size, "kein Satz darf durch die Art-Abspaltung verloren gehen").toBe(arten.size);
  });

  it("kein Titel unter dem Zeiger steht ueber der Kappe", () => {
    // Die Latte ist absolut, nicht als Anteil: ein Hover ist ein einzelner Atemzug, und
    // wer ihn nicht in einem Zug lesen kann, liest ihn gar nicht. Gemessen 10:01:40 MEZ
    // am Baum: 16 Titel ueber der Kappe, die laengsten 32 Woerter.
    const funde = kandidatenAusQuelltext(FLAECHE);
    const arten = artenAusQuelltext(FLAECHE);
    const zeilen = [...funde].map(([s]) => ({ s, woerter: zaehle(s).woerter, art: arten.get(s) || "literal" }));
    const ueber = randUeberKappe(zeilen);
    expect(ueber.map((z: { s: string; woerter: number; art: string }) => z.s), "Titel unter dem Zeiger ueber der Kappe").toEqual([]);
    // Biss-Kontrolle: dieselbe Rechnung muss einen erfundenen langen Titel sehen.
    expect(randUeberKappe([{ s: "x", woerter: SATZKAPPE + 1, art: "rand" }]).length, "die Latte hat kein Messzeug").toBe(1);
    // Und der Vorlesername faellt nicht unter sie -- seine Laenge ist keine Schranke.
    expect(randUeberKappe([{ s: "x", woerter: 40, art: "vorleser" }]).length, "der Vorleser wird von der Hover-Latte getroffen").toBe(0);
  });

  it("der Nenner der Flaeche ist eine Zahl, keine Luecke", () => {
    // Ein Census ueber null Saetzen waere grün und wertlos.
    expect(census.n).toBeGreaterThan(300);
  });

  it("die Kappe hat eine Kante, die sie selbst nennt", () => {
    // Gemessen 6.11.2026 06:45:22 MEZ am Baum: 348 Flaeche-Saetze, davon 38 mit GENAU 14
    // Woetern -- bei 13 Woetern sind es 20, bei 15 nur 9. Die Latte (80 Prozent) haelt mit
    // `<= 14` bei 80,5 % und faellt mit `< 14` auf 69,5 %. Das Urteil haengt an einer
    // Vergleichsrichtung, die das Werkzeug nirgends nannte, und die Art-Zeile des Laufs
    // (06:43:19 MEZ) zahlte `<`, das Urteil `<=`: 242 gegen 280 aus demselben Lauf.
    // Also zuerst die Kante selbst, an zwei eigens gezählten Saetzen.
    const vierzehn = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen";
    const fnfzehn = vierzehn + " fifteen";
    expect(zaehle(vierzehn).woerter, "die Sonde muss die Probe erst richtig zaehlen").toBe(14);
    // Die Schadenregel lautet "ueber 14 Woertern verliert ein Mensch den Bezug". Genau 14
    // ist nicht darueber, also traegt es. Wer das umdrehen will, dreht hier einen Satz um.
    expect(traegtKappe(14), "ein Satz von genau 14 Woertern faellt nicht ueber die Kappe").toBe(true);
    expect(traegtKappe(15), "ein Satz von 15 Woertern traegt nicht — dann ist die Kappe ohne Kante").toBe(false);
  });

  it("ein nackter Strich ist kein Wort", () => {
    // Gemessen 6.11.2026 06:52:17 MEZ am Baum: `zaehle` trennt nur an Leerraum, und der
    // Gedankenstrich des Hauses steht als eignes Token. 165 von 348 Flaeche-Saetzen (47,4 %)
    // tragen mindestens ein nacktes Token, 181 an der Zahl -- jeder davon wird einen Wort
    // zu lang gemessen. Sieben Saetze standen dadurch auf der falschen Seite der Kappe:
    // der Korpus traegt 280 von 348 (80,5 %) mit Strich als Wort, 287 von 348 (82,5 %) ohne.
    // Der Zaehler mass sieben Saetze zu lang, und die Marge der Latte hing an diesem Fehler.
    const mitStrich = "The tool list did not arrive — the local server answered without a list.";
    const ohneStrich = "The tool list did not arrive the local server answered without a list";
    expect(zaehle(ohneStrich).woerter, "die Probe erst richtig zaehlen").toBe(13);
    expect(zaehle(mitStrich).woerter, "ein Strich traegt keine Bedeutung, also kein Wort").toBe(13);
    // Die Kante: Wortzeichen, auch Ziffern, zaehlen weiter. (Zuerst stand hier 3 -- ich hatte
    // die eigne Probe falsch gezaehlt; "Restart in 5 seconds" sind vier Woerter. Die Sonde
    // hatte recht, der Fall nicht. Gemessen im Volllauf 06:57:26 MEZ: expected 4 to be 3.)
    expect(zaehle("Restart in 5 seconds").woerter).toBe(4);
    expect(zaehle("Root → type → entity → note").woerter, "Pfeile sind Notation, kein Wort").toBe(4);
  });

  it("die Art-Zeilen und das Urteil rechnen auf demselben Korpus", () => {
    // Die zwei Lesungen duerfen sich nicht um die Kante irren: die Summe der Art-Zeilen muss
    // auf dieselbe Grundgesamtheit und denselben Zaehler kommen wie das Urteil.
    const arten = artenAusQuelltext(FLAECHE);
    const nachArt = [...funde].map(([s, quelle]) => ({ ...zaehle(s), s, quelle, art: arten.get(s) || "literal" }));
    const zeilen = kappenZeilen(nachArt);
    expect(zeilen.map((z) => z.gruppe).sort()).toEqual(["rand (Titel, Platzhalter)", "sichtbar (Blatt, Meldung, Kopfzeile)", "vorleser (Name fuer den Vorleser)"]);
    const pruefung = summenPruefung(zeilen, census.n, census.unterKappe);
    expect(pruefung.ok, `die eigne Rechnung des Census traegt nicht: ${pruefung.grund}`).toBe(true);
    // Biss-Kontrolle: dieselbe Kontrolle muss ein frisiertes Paar zurückweisen, sonst ist
    // sie ein Nachschlagen, das nie verliert.
    expect(summenPruefung(zeilen, census.n, census.unterKappe + 1).ok, "die Kontrolle hat keinen Biss").toBe(false);
    expect(summenPruefung(zeilen.slice(1), census.n, census.unterKappe).ok, "eine fehlende Art-Gruppe geht durch").toBe(false);
  });

  it("die Sprache des Census sagt hochstens, weil seine Rechnung <= meint", () => {
    // Ein Werkzeug, das "unter 14" schreibt und `<= 14` zaehlt, beschreibt eine Regel, die es
    // nicht faehrt. Ein Leser, der die Zahl nachrechnet, findet 242 und haelt den Census für
    // falsch. Also: eine Wortmeldung, und die Selbstkontrolle muss im stdout stehen.
    const laut = spawnSync("node", [path.join(WURZEL, "scripts", "verstaendlichkeit.mjs"), "--nur", "quelltext"], { encoding: "utf8" });
    expect(laut.stdout).toContain("SELBSTKONTROLLE KAPPE: HALTET");
    expect(laut.stdout).toContain(`an der Kante von genau ${SATZKAPPE} Woertern`);
    expect(laut.stdout).toContain("Anteil mit hoechstens");
    expect(laut.stdout).not.toContain("unter 14 Woertern");
    expect(laut.stdout).not.toContain("unter der Kappe");
    // Die Art-Zeilen bleiben Bericht, keine eigne Latte: die Latte gilt dem Korpus als Ganzes.
    expect(laut.stdout).toMatch(/sichtbar \(Blatt, Meldung, Kopfzeile\): \d+ von \d+ mit hoechstens/);
    expect(laut.stdout).toMatch(/rand \(Titel, Platzhalter\): \d+ von \d+ mit hoechstens/);
    expect(laut.stdout).toMatch(/vorleser \(Name fuer den Vorleser\): \d+ von \d+ mit hoechstens/);
    // Und die Hover-Latte ist eine eigne Zeile mit eigner Zahl.
    expect(laut.stdout).toMatch(/URTEIL RAND: (HALTET|FAELLT) \(\d+ Titel/);
    expect(laut.stdout).toContain("Bericht, keine Latte");
  });
});

describe("Punkt 7, die Etikette: ein kurzes sichtbares Wort schuldet einen Klarnamen", () => {
  /* Ein Etikett ist kein Satz. Die Kappe und der Riegel des Census greifen an Texten ab 20
     Zeichen, und ein Chip mit sieben Zeichen faellt durch die Maske — gemessen 11:28:51 MEZ am
     Baum und 11:26:06 MEZ am ausgelieferten 3.2.182: "bm25 #", "vector #", "graph #" stehen je
     zweimal im asar (MemoryCard.tsx:98-100, Chat.tsx:1168-1170), und auf jedem Kartenbild der
     Flaeche liest ein Mensch "Found via bm25 #2" (Bild: belege-0611/fenster-183-vor/spuren-nur-bm25.png).
     Ein Algorithmus-Name in einem Etikett ist die einzige Sprache, die ein Etikett nicht hat:
     es hat keinen Raum fuer einen Grund. */
  const etikette = etiketteAusQuelltext(FLAECHE);

  it("die Sonde sieht ein Etikett, und wirft Codefragment und Langtext raus", () => {
    // Biss-Kontrolle an einem Kunsttext: drei Etiketten-Formen muessen getroffen werden,
    // zwei Nicht-Etikette duerfen nicht.
    const text = [
      '<span>Found via</span>',
      '<span>bm25 #{n + 1}</span>',
      '<input aria-label="Track BM25" />',
      "const spur = ['spurBm25', 'BM25', 'Exact words win'];",
      "{absage ?",
      "; themen: Record",
      "<p>Search depth: how far the engine looks before ranking, so a deeper search costs time.</p>",
    ].join("\n");
    const funde = etikettAusText(text, "src/components/Probe.tsx");
    const worte = funde.map((f) => f.s);
    expect(worte, "ein Chip-Etikett wird nicht gesehen").toContain("bm25 #");
    expect(worte, "ein Vorleser-Name wird nicht gesehen").toContain("Track BM25");
    expect(worte, "eine Spur-Beschriftung wird nicht gesehen").toContain("BM25");
    expect(worte, "ein Codefragment ist kein Etikett").not.toContain("absage ?");
    expect(worte, "ein Halbsatz ohne Raum ist kein Etikett").not.toContain("themen: Record");
    expect(worte, "ein langer Satz ist kein Etikett, sondern ein Satz").not.toContain(
      "Search depth: how far the engine looks before ranking, so a deeper search costs time."
    );
    expect(etikettNenntAlgorithmus(funde).length, "drei Etikette nennen eine Suchmethode").toBe(3);
  });

  it("kein Etikett der Flaeche nennt eine Methode", () => {
    const fehl = etikettNenntAlgorithmus(etikette);
    const liste = fehl.map((f: Stelle) => `    [${f.art}] "${f.s}"  ${f.quelle}`).join("\n");
    expect(fehl.length, `\n  ${fehl.length} Etikette nennen eine Methode:\n${liste}`).toBe(LATE);
  });

  it("die drei Spuren haben einen Namen, und der Name steht an einer Stelle", () => {
    // Ein Name pro Sache, definiert einmal: die Karte, der Chat und die Einstellungen lesen
    // dieselbe Quelle. Vorher standen dieselben drei Woerter an vier Stellen im Quelltext, und
    // die P99-Kuerzung der Titel musste sie von Hand nachziehen.
    expect(Object.values(SPUR_LABELS)).toEqual(["Words", "Meaning", "Graph"]);
    for (const wert of Object.values(SPUR_LABELS))
      expect(wert, `"${wert}" nennt eine Methode`).not.toMatch(ALGORITHMEN_RE);
    for (const [datei, was] of [
      ["src/components/MemoryCard.tsx", "die Karte"],
      ["src/components/Chat.tsx", "der Chat"],
      ["src/components/Settings.tsx", "die Einstellungen"],
    ]) {
      const quelltext = fs.readFileSync(path.join(WURZEL, datei), "utf8");
      expect(quelltext, `${was} erfindet einen eignen Namen fuer eine Spur`).toContain("lib/spuren");
      expect(quelltext, `${was} malt noch einen Methoden-Namen auf die Flaeche`).not.toMatch(/bm25 #|vector #/);
    }
  });

  it("der Fenster-Pruefer nennt die Namen, die die Spur traegt", () => {
    // Die Selektoren des Fenster-Pruefers sind harte Wortlaeufer. Ein Namenswechsel in der
    // Quelle, den der Pruefer nicht mitmacht, schlaegt nicht die App — er schlaegt blind.
    const pruefer = fs.readFileSync(path.join(WURZEL, "scripts", "pruefe-einstellungen-im-fenster.mjs"), "utf8");
    for (const schluessel of Object.keys(SPUR_LABELS))
      expect(pruefer, `der Fenster-Pruefer kennt ${spurAria(schluessel as never)} nicht`).toContain(spurAria(schluessel as never));
    expect(pruefer, "der Pruefer sucht noch die alte Tiefen-Beschriftung").not.toContain("Search depth (top-k)");
  });

  it("die Flaeche hat einen Nenner, keine Luecke", () => {
    // Gemessen 12:16:40 MEZ: 349 Kandidaten. Der Fall entstand, weil im P104-Lauf drei Titel
    // von festen Woertern auf zusammengesetzte umgestellt wurden ("${Name} view — …") und der
    // Korpus auf 346 sank -- der Census sah drei Saelze nicht mehr, meldete aber weiter
    // "HALTET". Eine Latte, die auf einer still kleineren Menge gruen wird, ist keine Messung.
    // Die Untergrenze sitzt eine Stelle unter dem Messwert: ein einzelner Wortlautwechsel darf
    // durch, eine Klasse, die aus der Grundgesamtheit faellt, nicht.
    const satze = [...kandidatenAusQuelltext(FLAECHE)];
    expect(satze.length, `nur ${satze.length} Flaeche-Saetze gezaehlt -- die Sonde sieht weniger als gemessen`).toBeGreaterThanOrEqual(348);
  });

  it("der Census meldet das Etikett-Urteil, und die Fachklasse bleibt im Bericht", () => {
    const laut = spawnSync("node", [path.join(WURZEL, "scripts", "verstaendlichkeit.mjs"), "--nur", "quelltext"], { encoding: "utf8" });
    expect(laut.stdout).toMatch(/URTEIL ETIKETT: (HALTET|FAELLT) \(\d+ von \d+ Etiketten nennen eine Methode/);
    // Die breitere Klasse (jedes Fachwort im Etikett) ist Bericht, keine Latte: ein Etikett,
    // das ein Fachwort nennt, kann es erklaeren, wenn der Satz daneben es tut -- "Forces"
    // (Physik-Panel) nennt die Kraft und erklaert sie unter dem Zeiger, "MCP / API" benennt
    // eine Tür, die der Nutzer oeffnet. Der Bericht haelt die Zahl sichtbar, damit ein
    // Fund nicht aus einer Liste verschwindet, statt ihn zu verbieten.
    expect(laut.stdout).toMatch(/Bericht Etikett-Fachwort: \d+ Stelle/);
  });
});

describe("Punkt 7, die Ansichts-Namen: drei Knoepfe, drei Klarnamen, eine Quelle", () => {
  /* P103 hat die Such-Familie gemessen und die Ansichts-Familie offen gelassen, weil die drei
     Graph-Knoepfe ein Trio sind: "Force | Tree | Semantic". Gemessen 12:05:55 MEZ am Baum, nach
     der vierten Etikett-Form (Knopf-Argument): 4 von 472 Etiketten nennen eine Methode --
     "Semantic search" (Dashboard), "Semantic map" (Graph-Panel), "Force" und "Semantic"
     (die beiden Knopfworte). Ein Wort des Trios zu tauschen waere ein Rest, kein Name; also
     werden alle drei benannt, und die Methode zieht in die Erklaerung, wo ein Satz sie traegt. */

  it("die vierte Etikett-Form wird gesehen: ein Knopfwort als letztes Argument", () => {
    const text = `segment(an, "Force view - the links as they are claimed", klick, "Force")`;
    const funde = etikettAusText(text, "src/components/Probe.tsx");
    expect(funde.map((f) => f.s), "ein Knopfwort als Argument wird nicht gesehen").toContain("Force");
    expect(etikettNenntAlgorithmus(funde).length, "das Knopfwort nennt eine Methode").toBe(1);
    // Die Erklaerung daneben ist ein Satz, kein Etikett: sie darf die Methode nennen.
    expect(funde.map((f) => f.s).some((s) => s.startsWith("Force view - the links")), "ein langer Titel ist kein Etikett").toBe(false);
  });

  it("die drei Ansichten haben einen Namen, und der Name steht an einer Stelle", () => {
    expect(Object.values(ANSICHT_LABELS)).toEqual(["Claims", "Tree", "Meaning"]);
    for (const wert of Object.values(ANSICHT_LABELS))
      expect(wert, `"${wert}" nennt eine Methode`).not.toMatch(ALGORITHMEN_RE);
    // Die Erklaerung traegt den Namen voran, damit Knopf und Titel dieselbe Sache heissen.
    expect(ansichtBeschreibung("force").startsWith(`${ANSICHT_LABELS.force} view`), "Titel und Knopf heissen verschieden").toBe(true);
    const graph = fs.readFileSync(path.join(WURZEL, "src", "components", "KnowledgeGraph.tsx"), "utf8");
    expect(graph, "der Graph erfindet eigne Ansichts-Woerter").toContain("lib/ansichten");
    expect(graph, "der Graph malt noch eine Methode auf einen Knopf").not.toMatch(/, "Force"\)|, "Semantic"\)/);
  });

  it("das Wort der Bedeutungssuche ist dasselbe wie das der Ansichts-Karte", () => {
    // Ein Ding, ein Name: der Schalter, die Meldung und die Ansicht heissen alle "Meaning".
    const dashboard = fs.readFileSync(path.join(WURZEL, "src", "components", "Dashboard.tsx"), "utf8");
    const graph = fs.readFileSync(path.join(WURZEL, "src", "components", "KnowledgeGraph.tsx"), "utf8");
    expect(dashboard, "die Flaeche nennt die Suche noch beim Verfahren").not.toMatch(/Semantic search|Semantic index/);
    expect(dashboard, "die Suche erfindet ein zweites Wort fuer dieselbe Sache").toContain("lib/ansichten");
    expect(graph, "das Panel nennt die Ansicht noch beim Verfahren").not.toMatch(/Semantic map/);
  });

  it("die Instrumente und Faelle suchen die Ansichten unter den Namen, die sie traegen", () => {
    // Ein Selektor, der ein Wort nachschreibt, ist eine harte Kopplung: ein Namenswechsel,
    // den er nicht mitmacht, schlägt nicht die Flaeche — er schlägt blind.
    for (const [datei, was] of [
      ["scripts/fps-laeufer.mjs", "der Kosten-Laeufer"],
      ["scripts/screenshots.mjs", "der Bildmacher"],
    ]) {
      const text = fs.readFileSync(path.join(WURZEL, datei), "utf8");
      expect(text, `${was} klickt die Kraft-Ansicht unter einem alten Titel`).toContain(ansichtBeschreibung("force").slice(0, 11));
      expect(text, `${was} sucht noch den alten Verfahrenstitel`).not.toContain("Force view");
    }
    for (const [datei, was] of [
      ["tests/components/KnowledgeGraph.f8.test.tsx", "der F-8-Fall"],
      ["tests/components/KnowledgeGraph.schrift.test.tsx", "der Schrift-Fall"],
    ]) {
      const text = fs.readFileSync(path.join(WURZEL, datei), "utf8");
      expect(text, `${was} findet den Baum-Knopf nicht mehr`).toContain(ansichtBeschreibung("dendrogram").slice(0, 9));
      expect(text, `${was} sucht noch das Verfahren`).not.toContain('"Dendrogram"');
    }
  });

  it("der Census meldet die Etikett-Latte mit der neuen Wortmeldung", () => {
    const laut = spawnSync("node", [path.join(WURZEL, "scripts", "verstaendlichkeit.mjs"), "--nur", "quelltext"], { encoding: "utf8" });
    expect(laut.stdout).toContain("Etikette, die eine Methode nennen");
    expect(laut.stdout).not.toContain("nennen eine Suchmethode");
  });
});

describe("Punkt 7, die Expression: ein Satz, der eine Zahl einsetzt, ist kein Formatierer", () => {
  /* Gemessen 12:38:50 MEZ: die Sprache des Census steht in immer mehr Stellen nicht als
     nackter Text, sondern als Template -- `{`Die chips run over the ${n} notes loaded on this
     page, not over everything you have saved.`}`. Der Riegel des Census warf jeden Kandidaten
     mit `${` raus ("Formatierer"), und die Muster für JSX-Text in `{...}` gab es nicht.
     Bewiesen an zwei Stellen, die ausgeliefert sind und von der Inhaltssperre verlangt werden
     ("Share of painted dots per group" 1, "No note of the core is inside this picture" 1):
     der Census sah sie nicht. Ein Zaehler, der einen gelieferten Satz nicht sieht, kann ihn
     nicht schuetzen -- und sein Nenner ist kleiner, als er meldet. */

  it("ein Satz in einer Expression wird gesehen, ein Klassenkleid nicht", () => {
    const text = [
      "<p>{`The chips run over the ${n} notes loaded on this page, not over everything you have saved.`}</p>",
      'aria-label={`Share of painted dots per group — ${gesamt} painted`}',
      'title={`Part ${chunk.nr} of ${chunk.von} — the file came in as separate pieces`}',
      'aria-label={`Copy the curl command for ${e.p}`}',
      'className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg fs-4 lh-lesbar font-semibold transition-colors ${aktiv}`}',
      'const weg = `${API_BASE}/api/health`;',
      'printf("the answer is %s here", wert);',
    ].join("\n");
    const funde = satzAusText(text, "src/components/Probe.tsx").map((f) => f.s);
    expect(funde.some((s) => s.startsWith("The chips run over the")), "ein JSX-Template-Satz wird nicht gesehen").toBe(true);
    expect(funde.some((s) => s.startsWith("Share of painted dots per group")), "ein Vorleser-Template wird nicht gesehen").toBe(true);
    expect(funde.some((s) => s.startsWith("Part ")), "ein Titel-Template wird nicht gesehen").toBe(true);
    expect(funde.some((s) => s.startsWith("Copy the curl command")), "eine Vorleser-Expression wird nicht gesehen").toBe(true);
    expect(funde.some((s) => s.includes("flex-1 flex items-center")), "ein Klassenkleid ist kein Satz").toBe(false);
    expect(funde.some((s) => s.includes("/api/health")), "ein Pfad ist kein Satz").toBe(false);
    expect(funde.some((s) => s.includes("%s")), "ein Formatierer ist kein Satz").toBe(false);
  });

  it("die zwei ausgelieferten Saetze stehen jetzt im Korpus", () => {
    // Merk-Woerter, kein ganzer Wortlaut: die Zahl dahinter kommt aus der Engine.
    const satze = [...kandidatenAusQuelltext(FLAECHE)].map(([s]) => s);
    expect(satze.some((s) => s.startsWith("Share of painted dots per group")), "der Vorlesersatz der Gruppenband-Schiene ist immer noch unsichtbar").toBe(true);
    expect(satze.some((s) => s.startsWith("No note of the core is inside this picture")), "der Panel-Satz ueber der Zahl ist immer noch unsichtbar").toBe(true);
  });

  it("der Census nennt, wie viele Saetze aus einer Expression kommen", () => {
    const laut = spawnSync("node", [path.join(WURZEL, "scripts", "verstaendlichkeit.mjs"), "--nur", "quelltext"], { encoding: "utf8" });
    expect(laut.stdout).toMatch(/davon aus einer Expression: \d+ von \d+ Saetzen/);
    expect(laut.stdout).toContain("SELBSTKONTROLLE KAPPE: HALTET");
  });
});

describe("Punkt 7, ein Ding, ein Wort: die Flaeche sagt nicht zweimal dasselbe", () => {
  /* Gemessen 12:43:17 MEZ, nachdem die Expression-Saetze sichtbar wurden: vier Funde nannten
     "nodes" ohne Erklaerung, und ein Census der Etikette zaehlte vier Etikette mit dem Wort.
     Die Flaeche hiess dasselbe Ding zwei Mal: "note" auf der Karte, "node" im Befehl, im
     Schalter und in der Legende. Neu gilt eine eigne Latte, ueber Saetzen UND Etiketten. */

  it("die Doppelnamen-Sonde trifft ein erfundenes Beispiel und verschont das korrekte", () => {
    const text = [
      '<span>Save as a node</span>',
      'aria-label={`Share of painted nodes per group — ${gesamt} painted`}',
      '<span>Save as a note</span>',
      "<p>Hover a dot and its title comes back.</p>",
    ].join("\n");
    const funde = doppelteNamen(einmalNachWortlaut(satzAusText(text, "src/components/Probe.tsx").concat(etikettAusText(text, "src/components/Probe.tsx"))));
    expect(funde.length, "zwei Stellen nennen das Ding beim alten Namen").toBe(2);
    expect(funde.some((f: Stelle) => f.s === "Save as a node"), "ein Etikett wird nicht getroffen").toBe(true);
    expect(funde.some((f: Stelle) => f.s === "Save as a note"), "das richtige Wort wird verwechselt").toBe(false);
  });

  it("kein sichtbarer Text der Flaeche nennt ein Ding beim zweiten Namen", () => {
    const alle = satzAusQuelltextMitEtiketten();
    const fehl = doppelteNamen(alle);
    const liste = fehl.map((f: Stelle) => `    [${f.art}] "${f.s}"  ${f.quelle}`).join("\n");
    expect(fehl.length, `\n  ${fehl.length} Stellen nennen ein Ding zweimal:\n${liste}`).toBe(LATE);
  });

  it("der Census meldet die Doppelnamen-Latte", () => {
    const laut = spawnSync("node", [path.join(WURZEL, "scripts", "verstaendlichkeit.mjs"), "--nur", "quelltext"], { encoding: "utf8" });
    expect(laut.stdout).toMatch(/URTEIL DOPPELNAMEN: (HALTET|FAELLT) \(\d+ von \d+ Wortlauten nennen ein Ding beim zweiten Namen/);
    expect(laut.stdout).toContain("DOPPELNAMEN");
  });
});

describe("Punkt 105, die Reichweite der Namens-Latte: jeder Wortlaut, jede Lage", () => {
  /* Gemessen 6.11.2026 13:08:36 MEZ: die Latte meldete "HALTET (0 von 761 Stellen)", und
     dieselbe Suite warf vier Woerter zurueck, die in keinem ihrer Muster standen. Nachgezaehlt
     am Baum: 15 ausgelieferte Wortlaute nannten das Ding beim alten Namen, und keiner der 15
     lag in der Liste, die die Latte geoeffnet hatte. Die Latte war nicht gruen -- sie war blind. */

  it("ein Wortlaut in Anweisungsposition ist kein unsichtbarer Name", () => {
    const text = [
      "function meldung(n) {",
      "  return `${n} unfolded notes are drawn as nodes`;",
      "}",
      'const warnung = voll ? "Limit reached: 3 active nodes" : "Alles frei";',
      "function gut(n) {",
      "  return `${n} unfolded notes are drawn as dots`;",
      "}",
    ].join("\n");
    const funde = doppelteNamen(wortlautAusText(text, "src/components/Probe.tsx"));
    expect(funde.length, "beide Anweisungs-Wortlaute bleiben unsichtbar").toBe(2);
    expect(funde.some((f: Stelle) => /drawn as nodes/.test(f.s)), "der return-Zweig wird nicht getroffen").toBe(true);
    expect(funde.some((f: Stelle) => /active nodes/.test(f.s)), "der Ternaer-Zweig wird nicht getroffen").toBe(true);
  });

  it("ein Einwort-Token nennt nichts: Specifier, Programmname und Stil-Token bleiben draussen", () => {
    // Die Form ist eine Messung, keine Bequemlichkeit: gezaehlt 13:13:07 MEZ nannte in der
    // ganzen Auslieferung kein Einwort-Wortlaut das Ding auf der Flaeche -- bis der Fallback
    // in Dashboard.tsx:1139 gefunden wurde (`victim?.title || 'Node'`). Also gilt die Gestalt
    // einer Benennung: grossgeschrieben und bloss Buchstaben. Gemessen 12:20:16 MEZ hebt die
    // Form den Nenner von 2 840 auf 2 959 Wortlaute und traegt genau den einen alten Fund.
    const text = [
      'import fs from "node:fs";',
      'const befehl = { command: "node", args: ["/PATH/TO/dist/mcp-server.cjs"] };',
      'const rim = lies("--node-rim", "rgba(255,255,255,0.2)");',
    ].join("\n");
    expect(doppelteNamen(wortlautAusText(text, "src/components/Probe.tsx")).length, "ein Token ohne Benennungsgestalt ist kein Fund").toBe(0);
    const fallback = 'const meldung = `moved to the trash ${victim?.title || \'Node\'}`;';
    expect(doppelteNamen(wortlautAusText(fallback, "src/components/Probe.tsx")).length, "der grossgeschriebene Einwort-Fallback bleibt unsichtbar").toBe(1);
  });

  it("die Namens-Latte sieht Diener, Werkzeug und den Boden des Quelltextes", () => {
    expect(NAMEN_LAGEN).toContain("server");
    expect(NAMEN_LAGEN).toContain("src/core");
    expect(NAMEN_LAGEN).toContain("src");
  });

  it("die Namens-Latte hat eine Grundgesamtheit, keine Luecke", () => {
    const erfuellt = wortlautInventar();
    expect(erfuellt.length, "ein Census ueber null Wortlaute meldet Sauberkeit fuer Ungelesenes").toBeGreaterThanOrEqual(NAMEN_MINDESTENS);
    // Die Untergrenze muss real sein: ein Puffer, den der Bestand nie verfehlen koennte, ist eine Luecke.
    expect(NAMEN_MINDESTENS, "die Untergrenze darf nicht ueber dem Bestand liegen").toBeLessThan(erfuellt.length);
  });

  it("keine ausgelieferte Wortmeldung nennt ein Ding beim zweiten Namen", () => {
    const fehl = doppelteNamen(wortlautInventar());
    const liste = fehl.map((f: Stelle) => `    [${f.art}] "${f.s}"  ${f.quelle}`).join("\n");
    expect(fehl.length, `\n  ${fehl.length} Wortlaute nennen ein Ding zweimal:\n${liste}`).toBe(LATE);
  });

  it("die Gleichung einer Legende ist kein Codezeichen", () => {
    // Die Kante gegen Quelltext traf auch die Legende des Graphen: "Size = connections".
    // Gemessen 13:05:11 MEZ war das in der ganzen Flaeche genau ein Satz -- der einzige,
    // der die Namensregel brach.
    expect(istBenutzersprache("Drag: a dot stays where you drop it · Wheel: zoom · Size = connections"), "eine Legende mit Gleichheitszeichen faellt durch die Sonde").toBe(true);
    // Die zwei Formen, fuer die die Kante gebaut wurde, bleiben draussen.
    expect(istBenutzersprache("y.source ? 1 : x.target"), "ein Ternaer darf nicht als Satz zaehlen").toBe(false);
    expect(istBenutzersprache("true = delete permanently"), "Notation darf nicht als Satz zaehlen").toBe(false);
  });

  it("der Census meldet die Wortlaut-Grundgesamtheit und ihre Untergrenze", () => {
    const laut = spawnSync("node", [path.join(WURZEL, "scripts", "verstaendlichkeit.mjs"), "--nur", "quelltext"], { encoding: "utf8" });
    expect(laut.stdout).toMatch(/URTEIL DOPPELNAMEN: (HALTET|FAELLT) \(\d+ von \d+ Wortlauten nennen ein Ding beim zweiten Namen/);
    expect(laut.stdout).toContain(`Nenner-Untergrenze ${NAMEN_MINDESTENS}`);
  });
});

describe("Punkt 106, die Anweisungsform: ein Satz in einem Backtick ist ein Satz", () => {
  /* Gemessen 6.11.2026 13:46:32 MEZ: 130 ausgelieferte Menschensaetze der Flaeche, 11 des
     Werkzeugs und 28 des Dieners standen in einer Backtick-Kette ohne Klammern herum
     (`return \`...\``, `cond ? "..." : \`...\``, ein Argument) und keins der acht Muster sah
     sie. Die Namens-Latte hatte diese Form seit P105 im Blick; die vier Satz-Latten nicht. */

  it("vier alphabetische Woerter hintereinander sind die Prosa-Form, ein Klassenkleid nicht", () => {
    expect(vierWortlauf("flex items-center justify-center gap-2 rounded-lg font-semibold"), "ein Utility-Kleid darf nicht als Satz zaehlen").toBe(false);
    expect(vierWortlauf("The journal did not answer"), "vier Woerter sind ein Anfang").toBe(true);
    expect(vierWortlauf("the local server answered HTTP 429"), "auch klein anfangen ist Prosa, wenn vier Woerter folgen").toBe(true);
    expect(vierWortlauf("rounded-lg shadow-md"), "zwei Huell-Woerter sind keine Sprache").toBe(false);
  });

  it("ein Satz in Anweisungsposition steht im Korpus, ein Klassenkleid nicht", () => {
    const text = [
      "function meldung(zahl) {",
      "  return `The journal did not answer — it was asked and the store said ${zahl}`;",
      "}",
      'const kleid = `flex items-center justify-center gap-2 rounded-lg py-3`;',
      'const kurz = `the local server answered HTTP ${res.status}`;',
    ].join("\n");
    const funde = satzAusText(text, "src/components/Probe.tsx").map((f: Stelle) => f.s);
    expect(funde.some((s: string) => /journal did not answer/.test(s)), "der return-Satz fehlt im Korpus").toBe(true);
    expect(funde.some((s: string) => /local server answered/.test(s)), "der kleine Fragment-Satz fehlt im Korpus").toBe(true);
    expect(funde.some((s: string) => /items-center/.test(s)), "ein Klassenkleid zaehlt als Satz").toBe(false);
  });

  it("die drei Lagen haben nach der neuen Form ihre Nenner", () => {
    // Gemessen 13:47:24 MEZ: Flaeche 498 (vorher 374), Werkzeug 49 (38), Diener 90 (62).
    // Die Untergrenzen sitzen hier, damit ein still schrumpfender Korpus nie als Erfolg geht.
    expect(kandidatenAusQuelltext(FLAECHE).size, "der Flaeche-Korpus ist geschrumpft").toBeGreaterThanOrEqual(480);
    expect(kandidatenAusQuelltext(WERKZEUG).size, "der Werkzeug-Korpus ist geschrumpft").toBeGreaterThanOrEqual(45);
    expect(kandidatenAusQuelltext(DIENER).size, "der Diener-Korpus ist geschrumpft").toBeGreaterThanOrEqual(85);
  });

  it("die zehn vorher unsichtbaren Stellen sind Kandidaten, und die Latten gelten ihnen", () => {
    const flaeche = [...kandidatenAusQuelltext(FLAECHE).keys()];
    const diener = [...kandidatenAusQuelltext(DIENER).keys()];
    for (const suche of ["notes left out", "parked at the rim", "What the picture starts with"]) {
      expect(flaeche.some((s: string) => s.includes(suche)), `kein Flaeche-Kandidat mit "${suche}" — die Form ist weiterhin blind`).toBe(true);
    }
    for (const suche of ["No matches at offset", "read from offset"]) {
      expect(diener.some((s: string) => s.includes(suche)), `kein Diener-Kandidat mit "${suche}"`).toBe(true);
    }
  });

  it("der Census meldet, wie viele Saetze aus der Anweisungsform kommen", () => {
    const laut = spawnSync("node", [path.join(WURZEL, "scripts", "verstaendlichkeit.mjs"), "--nur", "quelltext"], { encoding: "utf8" });
    expect(laut.stdout).toMatch(/davon aus der Anweisungsform: \d+ von \d+ Saetzen \(Werkzeug \d+ von \d+, Diener \d+ von \d+\)/);
  });
});

describe("Punkt 107, die Auslieferungsgleichung: eine zerlegte Kette ist kein fremder Satz", () => {
  /* Gemessen 14:37:45 MEZ am ausgelieferten 3.2.186: die Gleichung verwirft 145 von 498
     Flaeche-Saetzen (Werkzeug 14, Diener 28). Grund, an der Sonde gelesen
     (scripts/verstaendlichkeit.mjs:313): sie vergleicht den geglaetteten Wortlaut mit den
     Bytes. Esbuild schreibt `zahl(a) + " notes left out — … keeps the first " + zahl(b)` als
     drei Stuecke, und kein "N" steht dort als Wort. 130 davon sind ausgeliefert. */

  const sucheAus = (stuecke: string[]) => {
    const text = stuecke.join("), \"(\"");
    const puffer = Buffer.from(text, "utf8");
    return {
      puffer,
      textGlatt: text.replace(/\s+/g, " "),
      textEntfl: text.replace(/\s+/g, " "),
    };
  };

  it("eine in drei Stuecke zerlegte Kette wird erkannt", () => {
    const suche = sucheAus([
      "N of N unfolded notes are drawn as dots",
      " notes left out \u2014 the picture places notes by meaning, and keeps the first ",
      "Zahl je mit Einheit",
    ]);
    const satz = "N notes left out \u2014 the picture places notes by meaning, and keeps the first N";
    expect(imObjekt(suche, satz), "die Gleichung verwirft einen Satz, der ausgeliefert ist").toBe(true);
  });

  it("die Stuecke muessen in ihrer Reihenfolge stehen", () => {
    // Rueckwaerts eingebaut: derselbe Inhalt, eine andere Folge -- das ist nicht der Satz.
    const suche = sucheAus([
      "and keeps the first \u2014 by meaning places picture the notes left out notes",
      "unverfanglicher Quelltext an ganz anderer stelle",
    ]);
    const satz = "N notes left out \u2014 the picture places notes by meaning, and keeps the first N";
    expect(imObjekt(suche, satz), "eine umgekehrte Folge gilt als Auslieferung").toBe(false);
  });

  it("ein erfundener Satz bleibt abgewiesen", () => {
    const suche = sucheAus(["notes", "the picture", "keeps the first"]);
    expect(imObjekt(suche, "N notes left out \u2014 the picture flies to mars, and keeps the first N")).toBe(false);
  });

  it("eine Interpolation ist ein eignes Wort, auch wenn sie festklebte", () => {
    // Gemessen 14:38:24 MEZ: 79 von 189 Backtick-Ketten der Flaeche kleben ihre Zahl an ein
    // Wort ("came through${n}"). Ohne Leerzeichen zaehlt der Wortzaehler die Zahl nicht mit,
    // und die Gleichung findet ein Stueck, das im Bundel nie so dasteht.
    expect(glaetteInterpolation("Backup short \u2014 ${a} of ${b} notes came through${c}.")).toBe(
      "Backup short \u2014 N of N notes came through N."
    );
    expect(zaehle(glaetteInterpolation("${a} commitment${b} here end after today")).woerter).toBe(7);
  });

  it("ein Plural-Suffix ist kein eignes Wort", () => {
    // Gemessen 14:43:42 MEZ am Quelltext: sieben Ketten der Art
    // `${x === 1 ? "" : "s"}` haengen ein Plural-Anhaengsel an. Wird das ein eignes `N`,
    // zaehlt der Wortzaehler einen Wort zu viel, und ein Titel von 14 Woertern rutscht ueber
    // die Kappe -- die Latte fiele ueber eine Zahl, die kein Mensch liest.
    expect(glaetteInterpolation('${n} commitment${n === 1 ? "" : "s"} here end after today')).toBe(
      "N commitments here end after today"
    );
    expect(zaehle(glaetteInterpolation('${n} class${n === 1 ? "" : "es"} in the store')).woerter).toBe(5);
  });

  it("ein einziges langes Stueck gilt als ausgeliefert", () => {
    const suche = sucheAus(["commitments here end after today — a state on the link, not a step"]);
    expect(imObjekt(suche, "N commitments here end after today — a state on the link, not a step")).toBe(true);
  });

  it("der Census nennt, wie viele Baum-Saetze der Gleichung entgehen", () => {
    const laut = spawnSync("node", [path.join(WURZEL, "scripts", "verstaendlichkeit.mjs")], { encoding: "utf8" });
    expect(laut.stdout).toMatch(/die Objekt-Gleichung verwirft: Flaeche \d+, Werkzeug \d+, Diener \d+/);
    // Die Zahl ist eine Latte, kein Bericht. Gemessen 14:51:39 MEZ am ausgelieferten 3.2.186:
    // Flaeche 4, Werkzeug 5, Diener 1 -- vorher 145 / 14 / 28. Ueber zwoelf pro Lage darf ein
    // Lauf nicht hinaus, sonst ist die Gleichung wieder eine Behauptung. Die Restgruende sind
    // benannt: vier Werkzeug-Saetze stammen aus `src/core/chatgpt-import.ts`, das nicht
    // ausgeliefert wird, und die uebrigen fuenf zerlegen ein Plural-Suffix im Bundel
    // ("claim" + (n === 1 ? "" : "s") + " not drawn"), was keine zusammenhaengende Kette ist.
    const zahl = (lage: string) => Number((laut.stdout.match(new RegExp(lage + ": (\\d+) von")) || [0, "999"])[1]);
    expect(zahl("Flaeche"), `die Gleichung verwirft ${zahl("Flaeche")} Flaeche-Saetze`).toBeLessThanOrEqual(12);
    expect(zahl("Werkzeug"), `die Gleichung verwirft ${zahl("Werkzeug")} Werkzeug-Saetze`).toBeLessThanOrEqual(12);
    expect(zahl("Diener"), `die Gleichung verwirft ${zahl("Diener")} Diener-Saetze`).toBeLessThanOrEqual(12);
  });
});
