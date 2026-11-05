/* Punkt 7, der Riegel: jedes Fachwort auf der Flaeche schuldet seinen Grund oder eine Taetigkeit.

   Gemessen 5.11.2026 18:35 MEZ am ausgelieferten 3.2.162: acht Saetze standen ohne beides, und
   der Riegel des Censes (`scripts/verstaendlichkeit.mjs`) hielt die Zahl nur, weil er auf ihrem
   eignen Anschlag sass (Max 8 bei gemessenen 8). Ein Riegel ohne Spiel ist eine Meldungszeile.

   Die Suite faehrt hier dieselbe Regel, die der Census fährt — importiert, nicht nachgebaut.
   Ein zweites Regex- Paar in diesem Fall wuerde bei jeder Regel-Aenderung still gruen.
   Gezaehlt wird die Quelle, nicht das Buendel: das Objekt ist auf fremden Rechnern ein anderes,
   die Sprache, die wir schreiben, ist dieselbe. */
import { describe, expect, it } from "vitest";
import {
  FLAECHE,
  WERKZEUG,
  kandidatenAusQuelltext,
  zaehle,
  zensiere,
} from "../scripts/verstaendlichkeit.mjs";

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

  it("der Nenner der Flaeche ist eine Zahl, keine Luecke", () => {
    // Ein Census ueber null Saetzen waere grün und wertlos.
    expect(census.n).toBeGreaterThan(300);
  });
});
