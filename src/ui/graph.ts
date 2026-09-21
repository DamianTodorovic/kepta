// Der Wissensgraph der Core-Oberfläche: Notizen als Knoten, [[Links]] als Kanten.
//
// Reine Kernlogik ohne DOM — getestet in tests/ui/graph.test.ts. Bewusst
// note-basiert (wie die Ansicht es verspricht) statt entitätsbasiert: eine
// Notiz ist ein Knoten, ein [[Link]] auf den Titel einer anderen Notiz ist
// eine Kante. Nicht auflösbare Verweise zählen als Verweise, erzeugen aber
// keine Kante — eine Kante verbindet immer zwei echte Knoten.
import type { KeptaStore } from "../core/store";
import type { MemoryType } from "../core/types";

export interface GraphKnoten {
  id: string;
  titel: string;
  type: MemoryType;
  /** Anzahl auflösender Verweise — steuert die Knotengröße in der Ansicht. */
  grad: number;
}

export interface GraphKante {
  quelle: string;
  ziel: string;
}

export interface GraphDaten {
  nodes: GraphKnoten[];
  edges: GraphKante[];
  /** [[Verweise]] insgesamt, auch auf Nicht-Knoten (Kontrollzahl). */
  verweise: number;
}

const LINK_RE = /\[\[([^\[\]]{2,80})\]\]/g;

/**
 * Baut den Notiz-Graph: die `maxKnoten` zuletzt geänderten aktiven Notizen,
 * Kanten aus [[Link]] → Titel einer anderen Notiz (case-insensitive, Teil vor
 * „|"). ID-Determinismus kommt aus den Notiz-IDs selbst — kein Zufall.
 */
export function baueGraph(store: KeptaStore, maxKnoten = 400): GraphDaten {
  const notizen = store.listMemories({ limit: maxKnoten });
  const titelZuId = new Map<string, string>();
  for (const n of notizen) {
    const t = n.title.trim().toLowerCase();
    if (t && !titelZuId.has(t)) titelZuId.set(t, n.id);
  }
  const nodes = notizen.map((n) => ({ id: n.id, titel: n.title, type: n.type, grad: 0 }));
  const grad = new Map<string, number>();
  const kanten: GraphKante[] = [];
  const gesehen = new Set<string>();
  let verweise = 0;
  for (const n of notizen) {
    if (!n.content) continue;
    LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LINK_RE.exec(n.content))) {
      verweise += 1;
      const zielTitel = m[1]!.split("|")[0]!.trim().toLowerCase();
      const ziel = titelZuId.get(zielTitel);
      if (!ziel || ziel === n.id) continue;
      const k = n.id < ziel ? n.id + "\u0000" + ziel : ziel + "\u0000" + n.id;
      if (gesehen.has(k)) continue;
      gesehen.add(k);
      kanten.push({ quelle: n.id, ziel });
      grad.set(n.id, (grad.get(n.id) ?? 0) + 1);
      grad.set(ziel, (grad.get(ziel) ?? 0) + 1);
    }
  }
  return {
    nodes: nodes.map((n) => ({ ...n, grad: grad.get(n.id) ?? 0 })),
    edges: kanten,
    verweise,
  };
}
