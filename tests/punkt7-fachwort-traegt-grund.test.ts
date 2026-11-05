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
import path from "node:path";
import {
  FLAECHE,
  WERKZEUG,
  istBenutzersprache,
  kandidatenAusQuelltext,
  zaehle,
  zensiere,
} from "../scripts/verstaendlichkeit.mjs";

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

  it("der Nenner der Flaeche ist eine Zahl, keine Luecke", () => {
    // Ein Census ueber null Saetzen waere grün und wertlos.
    expect(census.n).toBeGreaterThan(300);
  });
});
