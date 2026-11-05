/* Punkt 7, der Riegel: jedes Fachwort auf der Flaeche schuldet seinen Grund oder eine Taetigkeit.

   Gemessen 5.11.2026 18:35 MEZ am ausgelieferten 3.2.162: acht Saetze standen ohne beides, und
   der Riegel des Censes (`scripts/verstaendlichkeit.mjs`) hielt die Zahl nur, weil er auf ihrem
   eignen Anschlag sass (Max 8 bei gemessenen 8). Ein Riegel ohne Spiel ist eine Meldungszeile.

   Die Suite faehrt hier dieselbe Regel, die der Census fährt — importiert, nicht nachgebaut.
   Ein zweites Regex- Paar in diesem Fall wuerde bei jeder Regel-Aenderung still gruen.
   Gezaehlt wird die Quelle, nicht das Buendel: das Objekt ist auf fremden Rechnern ein anderes,
   die Sprache, die wir schreiben, ist dieselbe. */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  FLAECHE,
  WERKZEUG,
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
    // 33 Kandidaten gemessen 21:05 MEZ an der Quelle (der rote Lauf meldete sie), 32 gemessen
    // 22:36 MEZ -- die Eine, die fehlte, war der Semikolon-Fund. Die Untergrenze sitzt hier,
    // damit ein Schrumpfen der Menge nie als Erfolg durchgeht; der Nenner ist eine Zahl,
    // keine Behauptung, und der Fall darueber zaehlt nur, wenn er etwas findet.
    const satze = [...kandidatenAusQuelltext(WERKZEUG).keys()];
    expect(satze.length, `nur ${satze.length} Werkzeug-Saetze gezaehlt — die Sonde sieht weniger als die Tuer hat`).toBeGreaterThanOrEqual(33);
  });

  it("der Import des Census faehrt ihn nicht selbst", () => {
    // Bis 3.2.167 endete `scripts/verstaendlichkeit.mjs` auf einem nackten `haupt()`. Jeder
    // Import -- und die Suite importiert die Regel, um sie zu fahren -- las darum die
    // 49 200 915 B des ausgelieferten app.asar und druckte siebzig Zeilen in den Lauf.
    // Zwei Seiten, weil ein einzelnes Nullresultat nichts beweist: der Import muss stumm
    // bleiben, und derselbe Befehl muss beim direkten Start melden. Zeuge fuer die eine
    // Seite, gemessen 23:05:52 MEZ: ein reiner `import()` meldet keine einzige Zeile.
    const stumm = execFileSync("node", ["--input-type=module", "-e", `await import("file://${WURZEL}/scripts/verstaendlichkeit.mjs")`], { encoding: "utf8" });
    expect(stumm.trim(), "der Import meldet einen Census — die Suite laeuft dann gegen ein Objekt, das sie nicht bestellt hat").toBe("");
    const laut = execFileSync("node", [path.join(WURZEL, "scripts", "verstaendlichkeit.mjs")], { encoding: "utf8" });
    expect(laut).toContain("URTEIL KAPPE");
  });

  it("der Nenner der Flaeche ist eine Zahl, keine Luecke", () => {
    // Ein Census ueber null Saetzen waere grün und wertlos.
    expect(census.n).toBeGreaterThan(300);
  });
});
