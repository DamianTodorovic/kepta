// Die semantische Karte des Graphen — vom Bestand zur projizierten Fläche.
//
// Gerechnet wird hier und nicht im Renderer, weil die Vektoren den Renderer
// nichts angehen: 768 Gleitkommazahlen je Abschnitt durch ein HTTP-Fenster zu
// schieben, damit die Fläche zwei Koordinaten daraus baut, wäre teuer und
// hätte doch nur einen Bruch davon gebraucht. Was über die Leitung geht, sind
// Plätze — und die Wache dafür steht in tests/rest-semantik.test.ts.
//
// Der Zwischenspeicher hängt an der Daten-Generation, genau wie die Caches des
// Suchpfads (src/core/engine.ts): jede Mutation an Notizen oder Abschnitten
// wirft ihn, und ohne Mutation kostet das Öffnen der Ansicht nichts.
import type { KeptaStore } from "../../src/core/store";
import { semantikKarte, type SemantikKarte } from "../../src/lib/graphSemantik";

const kartenCache = new WeakMap<KeptaStore, { generation: number; karte: SemantikKarte }>();

export function semantikVomBestand(store: KeptaStore): SemantikKarte {
  const generation = store.datenGeneration();
  const alt = kartenCache.get(store);
  if (alt && alt.generation === generation) return alt.karte;
  const chunks = store.allEmbeddableChunks();
  const karte = semantikKarte(chunks.map((c) => ({ id: c.memoryId, vektor: c.embedding, modell: c.model })));
  kartenCache.set(store, { generation, karte });
  return karte;
}
