import { describe, it, expect } from "vitest";
import { entitaetsNetz } from "../../src/lib/graphLayout";

// Die Klage vom 13.10. abends: „12 000 Notes drauf … ich erkenn gar nix außer
// einem großen Kreis." In Damians Bestand stehen 30 Begriffe und 5 Behauptungen.
// Diese Fälle fragen das Eine: wo bleiben diese 5 Behauptungen auf dem Weg ins
// Bild?
//
// Der Schreibweg legt jede Wiki-Link-Aussage von der TITEL-Entität der
// beurkundenden Notiz aus an (`src/core/store.ts:937-966`, `verknuepfeNotiz`:
// Zeile 939 setzt den Titel auf die Knotenmenge, 945 das Paar, 966 die Relation
// mit `memory_id` = diese Notiz). Die Titel-Echo-Regel der Fläche wirft eine
// Behauptung weg, wenn Quelle oder Ziel ein Begriff ist, den nur seine eigene
// Notiz trägt und der deren Titel ist — bei genau diesen Kanten. Das ist die
// bewusste Entscheidung G-1 (`tests/lib/graphLayout.test.ts`, „ein Begriff, der
// nur den Titel seiner einen Notiz wiederholt, ist keiner"): in einer vollen
// Basis ist die Hälfte der „Ontologie" eine Titelliste, und die Wurzel liegt in
// `src/core/store.ts`, das eine andere Scheibe hält. Was die Fläche nicht tun
// darf: den Verlust verschlucken. Darum zählt sie ihn.

function netz(
  beiEntity: Record<string, string[]>,
  relationen: { source: string; target: string; relation?: string; memoryId?: string | null }[],
  sichtbar: string[],
  titel: Record<string, string>
) {
  return entitaetsNetz(beiEntity, relationen, new Set(sichtbar), 2, (id) => titel[id]);
}

describe("Titel-Anker: verbergen ja, aber mit der Zahl", () => {
  it("meldet die Behauptung, die das Echo nicht durchlässt, als verschluckt", () => {
    const r = netz(
      { "elena weiss": ["n1"], "nordwind logistik": ["n1"] },
      [{ source: "elena weiss", target: "nordwind logistik", relation: "mentions", memoryId: "n1" }],
      ["n1"],
      { n1: "Elena Weiss" }
    );
    // G-1 bleibt gelten: die Kante wird nicht gezeichnet …
    expect(r.behauptungen).toEqual([]);
    expect(r.knoten.map((k) => k.id)).not.toContain("__ent:elena weiss");
    // … aber die Fläche sagt, dass eine lebende Aussage in ihrem Bild fehlt.
    expect(r.vomEchoVerschluckt).toBe(1);
  });

  it("ändert der Suchfilter nichts an der Echo-Frage — die Kante bleibt", () => {
    // Dieselbe Aussage, aber die Titel-Entität hat eine zweite Trägerin, die
    // gerade herausgefiltert ist. entschieden, weil: „wer trägt diesen Begriff"
    // ist eine Tatsache des Bestands, nicht des Ausschnitts. Der Filter
    // entscheidet weiterhin, ob die Kante GEZEICHNET wird — über die
    // Trägerregel in `graphLayout.ts`, nicht über das Echo.
    const traeger = { "elena weiss": ["n1", "n2"], "nordwind logistik": ["n1"] };
    const aussage = [{ source: "elena weiss", target: "nordwind logistik", relation: "arbeitet bei", memoryId: "n1" }];
    const titel = { n1: "Elena Weiss", n2: "Notiz von 2023" };

    const ganz = netz(traeger, aussage, ["n1", "n2"], titel);
    const gefiltert = netz(traeger, aussage, ["n1"], titel);
    expect(ganz.behauptungen).toHaveLength(1);
    expect(gefiltert.behauptungen).toHaveLength(1);
    expect(gefiltert.vomEchoVerschluckt).toBe(0);
  });

  it("wirft einen nackten Titel-Begriff ohne jede Aussage weiter weg", () => {
    // Die Gegenprobe: die Echo-Regel darf nicht einfach abgeschafft werden. Ein
    // Begriff, den nur seine eigene Notiz trägt und der kein Paar behauptet, ist
    // eine Überschrift, kein Wissen — er darf nicht als Knoten im Feld stehen.
    const r = netz({ "beste besprechung": ["n1"] }, [], ["n1"], { n1: "Beste Besprechung" });
    expect(r.knoten).toHaveLength(0);
    expect(r.erwahnungen).toHaveLength(0);
    expect(r.vomEchoVerschluckt).toBe(0);
  });
});
