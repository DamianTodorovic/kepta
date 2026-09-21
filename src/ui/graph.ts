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
  /** true = [[Link]] (durchgezogen); false = Ähnlichkeit (gestrichelt). */
  real: boolean;
  /** 0..1 — Kantenstärke für die Kürzung und spätere Darstellung. */
  staerke: number;
}

export interface GraphDaten {
  nodes: GraphKnoten[];
  edges: GraphKante[];
  /** [[Verweise]] insgesamt, auch auf Nicht-Knoten (Kontrollzahl). */
  verweise: number;
}

// ---------- Ähnlichkeits-Kanten (Port aus KEPTA Pro, graphLayout.ts) ----------
// Invertierter Index über Tags + Titelwörter; nur Paare mit einem gemeinsamen
// Begriff werden bewertet (tagOverlap * 0.9 vs. titleSimilarity * 0.6,
// Schwellwert 0.24). [[Links]] sind immer echte Kanten und überleben jede
// Kürzung — die schwächsten Ähnlichkeiten fallen zuerst.
function tagOverlap(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a.map((t) => t.toLowerCase()));
  let inter = 0;
  for (const t of b) if (sa.has(t.toLowerCase())) inter++;
  return inter / Math.min(a.length, b.length);
}

function titleSimilarity(a: string, b: string): number {
  const wa = new Set(a.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  const wb = new Set(b.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return 0;
  let inter = 0;
  wa.forEach((w) => { if (wb.has(w)) inter++; });
  return inter / Math.min(wa.size, wb.size);
}

export interface AehnlichkeitsOptionen {
  maxBucket?: number;
  maxAehnlichkeitsKanten?: number;
}

function aehnlichkeitsKanten(notizen: { id: string; titel: string; tags: string[] }[], opts: AehnlichkeitsOptionen = {}): GraphKante[] {
  const maxBucket = opts.maxBucket ?? 60;
  const maxKanten = opts.maxAehnlichkeitsKanten ?? Math.min(12_000, Math.max(1200, notizen.length * 6));
  const index = new Map<string, string[]>();
  const lege = (begriff: string, id: string) => {
    const bucket = index.get(begriff);
    if (bucket) bucket.push(id); else index.set(begriff, [id]);
  };
  const byId = new Map(notizen.map((n) => [n.id, n]));
  for (const n of notizen) {
    for (const t of n.tags) { const s = t.toLowerCase().trim(); if (s) lege(`#${s}`, n.id); }
    for (const w of n.titel.toLowerCase().split(/\W+/)) if (w.length > 2) lege(w, n.id);
  }
  const bewertet = new Set<string>();
  const kandidaten: GraphKante[] = [];
  const schluessel = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const bucket of index.values()) {
    if (bucket.length < 2 || bucket.length > maxBucket) continue;
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const k = schluessel(bucket[i]!, bucket[j]!);
        if (bewertet.has(k)) continue;
        bewertet.add(k);
        const a = byId.get(bucket[i]!)!;
        const b = byId.get(bucket[j]!)!;
        const tagScore = tagOverlap(a.tags, b.tags);
        const titleScore = titleSimilarity(a.titel, b.titel);
        const staerke = Math.max(tagScore * 0.9, titleScore * 0.6);
        if (staerke > 0.24) kandidaten.push({ quelle: a.id, ziel: b.id, real: false, staerke });
        else if (tagScore > 0 && titleScore > 0.15) kandidaten.push({ quelle: a.id, ziel: b.id, real: false, staerke: 0.3 });
      }
    }
  }
  kandidaten.sort((a, b) => b.staerke - a.staerke);
  return kandidaten.slice(0, maxKanten);
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
  const nodes = notizen.map((n) => ({ id: n.id, titel: n.title, type: n.type, grad: 0, tags: n.tags }));
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
      kanten.push({ quelle: n.id, ziel, real: true, staerke: 0.85 });
      grad.set(n.id, (grad.get(n.id) ?? 0) + 1);
      grad.set(ziel, (grad.get(ziel) ?? 0) + 1);
    }
  }
  const echte = new Set(kanten.map((k) => (k.quelle < k.ziel ? `${k.quelle}|${k.ziel}` : `${k.ziel}|${k.quelle}`)));
  const aehnlich = aehnlichkeitsKanten(nodes.map((n) => ({ id: n.id, titel: n.titel, tags: n.tags }))).filter(
    (k) => !echte.has(k.quelle < k.ziel ? `${k.quelle}|${k.ziel}` : `${k.ziel}|${k.quelle}`)
  );
  for (const k of aehnlich) {
    grad.set(k.quelle, (grad.get(k.quelle) ?? 0) + 1);
    grad.set(k.ziel, (grad.get(k.ziel) ?? 0) + 1);
  }
  return {
    nodes: nodes.map((n) => ({ id: n.id, titel: n.titel, type: n.type, grad: grad.get(n.id) ?? 0 })),
    edges: [...kanten, ...aehnlich],
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
