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

// ── Kraft-Layout (pure, testbar): Start auf einem Kreis, 280 Ticks Abstoßung +
// Kantensfedern + Zentrierung. Liefert x/y je Knoten — die Ansicht zeichnet nur.
export interface LayoutKnoten extends GraphKnoten {
  x: number;
  y: number;
}

export function kraftLayout(g: GraphDaten, breite: number, hoehe: number, ticks = 280): LayoutKnoten[] {
  const knoten: LayoutKnoten[] = g.nodes.map((n, i) => {
    const winkel = (i / Math.max(1, g.nodes.length)) * 2 * Math.PI;
    return { ...n, x: breite / 2 + Math.cos(winkel) * breite * 0.36, y: hoehe / 2 + Math.sin(winkel) * hoehe * 0.36, vx: 0, vy: 0, fixiert: false } as LayoutKnoten & { vx: number; vy: number; fixiert: boolean };
  });
  const byId = new Map(knoten.map((k) => [k.id, k]));
  const kanten = g.edges
    .map((e) => [byId.get(e.quelle), byId.get(e.ziel)] as const)
    .filter((p): p is [LayoutKnoten, LayoutKnoten] => p[0] !== undefined && p[1] !== undefined);
  for (let tick = 0; tick < ticks; tick++) {
    for (let i = 0; i < knoten.length; i++) {
      const a = knoten[i] as LayoutKnoten & { vx: number; vy: number };
      a.vx = (a.x - breite / 2) * 0.012;
      a.vy = (a.y - hoehe / 2) * 0.012;
      for (let j = i + 1; j < knoten.length; j++) {
        const b = knoten[j] as LayoutKnoten & { vx: number; vy: number };
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const kraft = 2600 / (d * d);
        a.vx += (dx / d) * kraft; a.vy += (dy / d) * kraft;
        b.vx -= (dx / d) * kraft; b.vy -= (dy / d) * kraft;
      }
    }
    for (const [u, v] of kanten) {
      const dx = u.x - v.x, dy = u.y - v.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const kraft = (d - 110) * 0.015;
      (u as LayoutKnoten & { vx: number; vy: number }).vx -= (dx / d) * kraft;
      (u as LayoutKnoten & { vx: number; vy: number }).vy -= (dy / d) * kraft;
      (v as LayoutKnoten & { vx: number; vy: number }).vx += (dx / d) * kraft;
      (v as LayoutKnoten & { vx: number; vy: number }).vy += (dy / d) * kraft;
    }
    for (const k of knoten) {
      const kk = k as LayoutKnoten & { vx: number; vy: number };
      k.x = Math.max(30, Math.min(breite - 30, k.x + Math.max(-14, Math.min(14, kk.vx))));
      k.y = Math.max(26, Math.min(hoehe - 26, k.y + Math.max(-14, Math.min(14, kk.vy))));
    }
  }
  return knoten.map((k) => ({ id: k.id, titel: k.titel, type: k.type, grad: k.grad, x: Math.round(k.x * 10) / 10, y: Math.round(k.y * 10) / 10 }));
}
