import type { Memory } from "../types";
import type { LayoutEdge, LayoutNode, Transform } from "./graphLayout";

/** Spatial perspective modes for K3PTA Graph v4 (PDCR Stage C2). */
export type SpatialLens = "atlas" | "timeline" | "privacy" | "review" | "focus";

export interface SpatialLensDef {
  id: SpatialLens;
  label: string;
  caption: string;
}

export const SPATIAL_LENSES: readonly SpatialLensDef[] = [
  { id: "atlas", label: "Atlas", caption: "Topic islands group linked notes; amber dashed outlines mark private records." },
  { id: "timeline", label: "Timeline", caption: "Columns sort notes by age so you can trace updates and deadlines." },
  { id: "privacy", label: "AI & Privacy", caption: "Private vault notes on the left stay blocked from external AI tools." },
  { id: "review", label: "Review & Gaps", caption: "Resolve conflicting records side by side and inspect unlinked notes." },
  { id: "focus", label: "Focus", caption: "Four quadrants separate incoming links, outgoing links, time, and similar themes." },
] as const;

export const FOCUS_EXCLUSION_RADIUS = 112;
export const FOCUS_OUTER_RADIUS = 235;
/** Rings per Focus quadrant and their spacing (world units). */
const FOCUS_MAX_RINGS = 3;
const FOCUS_RING_GAP = 64;
/** Vertical radius of the outer orbit for unrelated notes (always > FOCUS_FIT_RADIUS). */
const FOCUS_REST_RY = 420;
/** Everything inside this radius belongs to the focused neighbourhood. */
export const FOCUS_FIT_RADIUS = 390;

export interface Point2D {
  x: number;
  y: number;
}

const DAY_MS = 86_400_000;

/** Monotone-chain convex hull (CCW). Returns a shallow copy if <= 2 points. */
export function convexHull(pts: readonly Point2D[]): Point2D[] {
  if (pts.length <= 2) return pts.map((p) => ({ x: p.x, y: p.y }));
  const sorted = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point2D, a: Point2D, b: Point2D) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Point2D[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push({ x: p.x, y: p.y });
  }
  const upper: Point2D[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push({ x: p.x, y: p.y });
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Expands a hull outward around its centroid and applies Chaikin corner smoothing. */
export function expandAndChaikin(hull: readonly Point2D[], pad: number, cuts = 2): Point2D[] {
  if (hull.length === 0) return [];
  let pts: Point2D[] = hull.map((p) => ({ x: p.x, y: p.y }));
  if (hull.length === 1) {
    const p = hull[0];
    pts = Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return { x: p.x + Math.cos(a) * pad * 1.3, y: p.y + Math.sin(a) * pad * 1.3 };
    });
  } else if (hull.length === 2) {
    const [a, b] = hull;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * pad;
    const ny = (dx / len) * pad;
    const tx = (dx / len) * pad * 0.7;
    const ty = (dy / len) * pad * 0.7;
    pts = [
      { x: a.x - tx + nx, y: a.y - ty + ny },
      { x: b.x + tx + nx, y: b.y + ty + ny },
      { x: b.x + tx - nx, y: b.y + ty - ny },
      { x: a.x - tx - nx, y: a.y - ty - ny },
    ];
  } else {
    let cx = 0;
    let cy = 0;
    for (const p of pts) {
      cx += p.x;
      cy += p.y;
    }
    cx /= pts.length;
    cy /= pts.length;
    pts = pts.map((p) => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      return { x: p.x + (dx / d) * pad, y: p.y + (dy / d) * pad };
    });
  }

  for (let c = 0; c < cuts; c++) {
    const next: Point2D[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % pts.length];
      next.push(
        { x: p0.x * 0.75 + p1.x * 0.25, y: p0.y * 0.75 + p1.y * 0.25 },
        { x: p0.x * 0.25 + p1.x * 0.75, y: p0.y * 0.25 + p1.y * 0.75 }
      );
    }
    pts = next;
  }
  return pts;
}

/** Traces a closed Chaikin loop using quadratic midpoints (no arc/fillRect ops). */
export function traceSmoothClosedPath(ctx: CanvasRenderingContext2D, pts: readonly Point2D[]): void {
  if (pts.length < 3) return;
  const n = pts.length;
  const startMidX = (pts[n - 1].x + pts[0].x) / 2;
  const startMidY = (pts[n - 1].y + pts[0].y) / 2;
  ctx.beginPath();
  ctx.moveTo(startMidX, startMidY);
  for (let i = 0; i < n; i++) {
    const cur = pts[i];
    const nxt = pts[(i + 1) % n];
    ctx.quadraticCurveTo(cur.x, cur.y, (cur.x + nxt.x) / 2, (cur.y + nxt.y) / 2);
  }
  ctx.closePath();
}

/**
 * Deterministic BFS causal blast-radius discovery from a start note across
 * explicit claims and structure edges up to `maxDepth` steps (1..4).
 */
export function computeBlastSet(
  startId: string,
  edges: readonly LayoutEdge[],
  maxDepth: number
): Map<string, number> {
  const depthCap = Math.max(1, Math.min(4, Math.round(maxDepth)));
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!e.real) continue;
    let aList = adj.get(e.source);
    if (!aList) {
      aList = [];
      adj.set(e.source, aList);
    }
    aList.push(e.target);

    let bList = adj.get(e.target);
    if (!bList) {
      bList = [];
      adj.set(e.target, bList);
    }
    bList.push(e.source);
  }

  const dist = new Map<string, number>([[startId, 0]]);
  const queue: string[] = [startId];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const d = dist.get(cur) ?? 0;
    if (d >= depthCap) continue;
    const neighbors = adj.get(cur);
    if (!neighbors) continue;
    for (const nxt of neighbors) {
      if (!dist.has(nxt)) {
        dist.set(nxt, d + 1);
        queue.push(nxt);
      }
    }
  }
  return dist;
}

/**
 * Computes deterministic non-destructive target world coordinates for any
 * non-Atlas spatial lens. Never mutates `nodes` directly.
 */
export function computeLensTargets(
  lens: Exclude<SpatialLens, "atlas">,
  nodes: readonly LayoutNode[],
  byId: ReadonlyMap<string, Memory>,
  edges: readonly LayoutEdge[],
  selectedId: string | null,
  contradictionIds: ReadonlySet<string>,
  nowMs = Date.now()
): Map<string, Point2D> {
  const targets = new Map<string, Point2D>();
  if (nodes.length === 0) return targets;
  // Hidden gang (shelf page) nodes never take part in a lens layout: at 25k
  // notes they would stretch every lens frame to invisible pixels.
  const shown = nodes.filter((n) => !n.versteckt);
  const visibleNodes = shown.length > 0 ? shown : nodes;

  if (lens === "timeline") {
    const xCols = [-480, -240, 0, 240, 480];
    const buckets: LayoutNode[][] = [[], [], [], [], []];
    // Concept hubs carry no date of their own: they inherit the newest date of
    // the notes that mention them, instead of all landing in "Today".
    const conceptTime = new Map<string, number>();
    const noteTime = (m: Memory) => m.validFrom ?? (m.updatedAt || m.createdAt || 0);
    for (const e of edges) {
      const ms = byId.get(e.source);
      const mt = byId.get(e.target);
      if (ms && !mt) conceptTime.set(e.target, Math.max(conceptTime.get(e.target) ?? 0, noteTime(ms)));
      else if (mt && !ms) conceptTime.set(e.source, Math.max(conceptTime.get(e.source) ?? 0, noteTime(mt)));
    }
    for (const n of visibleNodes) {
      const m = byId.get(n.id);
      const ts = m ? (m.validFrom ?? (m.updatedAt || m.createdAt || nowMs)) : (conceptTime.get(n.id) || nowMs);
      const days = Math.max(0, (nowMs - ts) / DAY_MS);
      const colIdx = days > 90 ? 0 : days > 30 ? 1 : days > 7 ? 2 : days > 2 ? 3 : 4;
      buckets[colIdx].push(n);
    }
    for (let b = 0; b < buckets.length; b++) {
      const arr = buckets[b].sort((a, z) => {
        const ma = byId.get(a.id);
        const mz = byId.get(z.id);
        const ta = ma ? (ma.validFrom ?? ma.updatedAt ?? 0) : 0;
        const tz = mz ? (mz.validFrom ?? mz.updatedAt ?? 0) : 0;
        return tz - ta || a.id.localeCompare(z.id);
      });
      const maxRows = 10;
      const subCols = Math.ceil(arr.length / maxRows);
      const rowCount = Math.min(arr.length, maxRows);
      const rowGap = rowCount > 6 ? 56 : 68;
      // Sub-columns stay inside their own 240px lane — never across the divider.
      const subStep = subCols > 1 ? Math.min(72, 148 / subCols) : 0;
      for (let i = 0; i < arr.length; i++) {
        const subCol = Math.floor(i / maxRows);
        const row = i % maxRows;
        const subOffset = subCols > 1 ? (subCol - (subCols - 1) / 2) * subStep : 0;
        targets.set(arr[i].id, {
          x: xCols[b] + subOffset,
          y: (row - (rowCount - 1) / 2) * rowGap,
        });
      }
    }
    return targets;
  }

  if (lens === "privacy") {
    const priv: LayoutNode[] = [];
    const localNotes: LayoutNode[] = [];
    const concepts: LayoutNode[] = [];
    for (const n of visibleNodes) {
      const m = byId.get(n.id);
      if (m?.scope === "private") priv.push(n);
      else if (m) localNotes.push(n);
      else concepts.push(n);
    }
    const privCols = priv.length > 10 ? 2 : 1;
    priv.forEach((n, i) => {
      const col = i % privCols;
      const row = Math.floor(i / privCols);
      targets.set(n.id, { x: -450 + col * 205, y: -180 + row * 86 });
    });
    const noteCols = localNotes.length > 18 ? 4 : 3;
    localNotes.forEach((n, i) => {
      const col = i % noteCols;
      const row = Math.floor(i / noteCols);
      targets.set(n.id, { x: 145 + col * 210, y: -210 + row * 78 });
    });
    const cBaseY = -170 + Math.ceil(localNotes.length / noteCols) * 78;
    const conceptCols = concepts.length > 16 ? 5 : 4;
    concepts.forEach((n, i) => {
      const col = i % conceptCols;
      const row = Math.floor(i / conceptCols);
      targets.set(n.id, { x: 145 + col * 185, y: cBaseY + row * 58 });
    });
    return targets;
  }

  if (lens === "review") {
    const flagged: LayoutNode[] = [];
    const normal: LayoutNode[] = [];
    const deg = new Map<string, number>();
    for (const e of edges) {
      if (!e.real) continue;
      deg.set(e.source, (deg.get(e.source) ?? 0) + 1);
      deg.set(e.target, (deg.get(e.target) ?? 0) + 1);
    }
    for (const n of visibleNodes) {
      const m = byId.get(n.id);
      const isFlagged = contradictionIds.has(n.id) || (deg.get(n.id) ?? 0) === 0 || Boolean(m?.supersededBy);
      if (isFlagged) flagged.push(n);
      else normal.push(n);
    }
    flagged.sort((a, b) => (contradictionIds.has(b.id) ? 1 : 0) - (contradictionIds.has(a.id) ? 1 : 0));
    const fCols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(Math.max(1, flagged.length)))));
    flagged.forEach((n, i) => {
      const col = i % fCols;
      const row = Math.floor(i / fCols);
      targets.set(n.id, { x: -70 + (col - (fCols - 1) / 2) * 215, y: -250 + row * 72 });
    });
    const rCols = Math.min(6, Math.max(4, Math.ceil(Math.sqrt(Math.max(1, normal.length)))));
    const baseY = -205 + Math.ceil(flagged.length / fCols) * 74;
    normal.forEach((n, i) => {
      const col = i % rCols;
      const row = Math.floor(i / rCols);
      targets.set(n.id, { x: -95 + (col - (rCols - 1) / 2) * 168, y: baseY + row * 56 });
    });
    return targets;
  }

  // "focus": center selected note inside >= 112px exclusion ring with 4 cardinal quadrants
  const focusNode = (selectedId && visibleNodes.find((n) => n.id === selectedId)) || visibleNodes[0];
  targets.set(focusNode.id, { x: 0, y: 0 });
  const inbound: LayoutNode[] = [];
  const outbound: LayoutNode[] = [];
  const temporal: LayoutNode[] = [];
  const similar: LayoutNode[] = [];
  const rest: LayoutNode[] = [];

  // The store is bipartite: notes mention concepts (note -> concept) and
  // claims join concepts (concept -> concept). Direction alone decides the
  // quadrant: what the focus points at is "Links out", what points at the
  // focus is "Cited by". Similarity guesses go north.
  const relKind = new Map<string, "out" | "in" | "time" | "sim">();
  const directConcepts: string[] = [];
  for (const e of edges) {
    const touchesSource = e.source === focusNode.id;
    const touchesTarget = e.target === focusNode.id;
    if (!touchesSource && !touchesTarget) continue;
    const other = touchesSource ? e.target : e.source;
    if (other === focusNode.id || relKind.has(other)) continue;
    if (!e.real) {
      relKind.set(other, "sim");
      continue;
    }
    relKind.set(other, touchesSource ? "out" : "in");
    if (!byId.has(other)) directConcepts.push(other);
  }
  // Second step: notes that share a concept with a focused note are its
  // similar themes (or, when dated/superseded, its time & versions).
  if (byId.has(focusNode.id) && directConcepts.length > 0) {
    const viaConcept = new Set(directConcepts);
    for (const e of edges) {
      if (!e.real) continue;
      const peer = viaConcept.has(e.target) ? e.source : viaConcept.has(e.source) ? e.target : null;
      if (!peer || peer === focusNode.id || relKind.has(peer) || !byId.has(peer)) continue;
      relKind.set(peer, "sim");
    }
  }
  for (const n of visibleNodes) {
    if (n.id === focusNode.id) continue;
    const m = byId.get(n.id);
    const kind = relKind.get(n.id);
    if (m && (m.supersededBy || m.type === "episodic") && kind) temporal.push(n);
    else if (kind === "out") outbound.push(n);
    else if (kind === "in") inbound.push(n);
    else if (kind === "sim") similar.push(n);
    else rest.push(n);
  }

  // Up to three rings per quadrant, so a busy neighbourhood fans out instead
  // of stacking onto one arc.
  const placeArc = (arr: readonly LayoutNode[], centerAng: number, span: number, radius: number) => {
    const perRing = Math.max(8, Math.ceil(arr.length / FOCUS_MAX_RINGS));
    arr.forEach((n, idx) => {
      const ring = Math.min(FOCUS_MAX_RINGS - 1, Math.floor(idx / perRing));
      const inRing = Math.min(perRing, arr.length - ring * perRing);
      const slot = idx - ring * perRing;
      const frac = inRing <= 1 ? 0.5 : slot / (inRing - 1);
      const a = centerAng + (frac - 0.5) * span + (ring % 2) * (span / Math.max(2, inRing * 2));
      const r = radius + ring * FOCUS_RING_GAP;
      targets.set(n.id, { x: Math.cos(a) * r, y: Math.sin(a) * r });
    });
  };
  placeArc(similar, -Math.PI / 2, Math.PI * 0.46, 215);
  placeArc(outbound, 0, Math.PI * 0.46, 245);
  placeArc(temporal, Math.PI / 2, Math.PI * 0.46, 215);
  placeArc(inbound, Math.PI, Math.PI * 0.46, 245);

  // Unrelated notes wait quietly on an outer orbit beyond the camera frame.
  rest.forEach((n, idx) => {
    const a = (idx / Math.max(1, rest.length)) * Math.PI * 2 + 0.35;
    targets.set(n.id, { x: Math.cos(a) * 560, y: Math.sin(a) * FOCUS_REST_RY });
  });
  return targets;
}

/**
 * The points the camera should frame for a lens. Focus frames only the
 * focused neighbourhood (all four quadrants), not the far orbit of unrelated
 * notes — otherwise the centre shrinks under the quadrant labels.
 */
export function getLensFitPoints(
  lens: SpatialLens,
  targets: ReadonlyMap<string, Point2D>,
): Point2D[] {
  const all = [...targets.values()];
  if (lens !== "focus") return all;
  const near = all.filter((p) => Math.hypot(p.x, p.y) <= FOCUS_FIT_RADIUS);
  if (near.length < 2) return all;
  return [...near, { x: -280, y: -230 }, { x: 280, y: 230 }];
}

/** Paints screen-space backdrops for non-Atlas lenses below or beside nodes. */
export function paintSpatialLensBackdrop(
  ctx: CanvasRenderingContext2D,
  lens: SpatialLens,
  t: Transform,
  w: number,
  h: number,
  colors: {
    akzent: string;
    warn: string;
    danger: string;
    text2: string;
    dekore: string;
    paper: string;
    helleFlaeche: boolean;
  }
): void {
  if (lens === "timeline") {
    const xCols = [-480, -240, 0, 240, 480];
    const gapPx = Math.abs((xCols[1] - xCols[0]) * t.k);
    const labels = gapPx >= 95
      ? ["Older (>90d)", "Last 90 days", "Last 30 days", "Last 7 days", "Today"]
      : [">90d", "≤90d", "≤30d", "≤7d", "Today"];
    ctx.save();
    ctx.font = "600 11px ui-sans-serif, system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    xCols.forEach((wx, i) => {
      const sx = wx * t.k + t.x;
      if (sx < -60 || sx > w + 60) return;
      ctx.strokeStyle = colors.dekore;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx, 74);
      ctx.lineTo(sx, h - 42);
      ctx.stroke();
      const tw = ctx.measureText(labels[i]).width + 12;
      ctx.fillStyle = colors.paper;
      ctx.beginPath();
      ctx.roundRect(sx - tw / 2, 48, tw, 20, 5);
      ctx.fill();
      ctx.fillStyle = i === 4 ? colors.akzent : colors.text2;
      ctx.fillText(labels[i], sx, 58);
    });
    ctx.restore();
    return;
  }

  if (lens === "privacy") {
    const boundaryX = Math.max(44, Math.min(w - 44, -65 * t.k + t.x));
    const boxLeft = 18;
    const boxWidth = Math.max(0, boundaryX - boxLeft - 14);
    ctx.save();
    if (boxWidth > 40) {
      ctx.fillStyle = colors.helleFlaeche ? "rgba(168, 116, 46, 0.08)" : "rgba(216, 168, 74, 0.09)";
      ctx.beginPath();
      ctx.roundRect(boxLeft, 82, boxWidth, Math.max(120, h - 126), 12);
      ctx.fill();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = colors.warn;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = colors.danger;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(boundaryX, 72);
    ctx.lineTo(boundaryX, h - 38);
    ctx.stroke();

    ctx.font = "700 12px ui-sans-serif, system-ui, -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const drawZonePill = (txt: string, x: number, y: number, col: string) => {
      const tw = ctx.measureText(txt).width + 12;
      ctx.fillStyle = colors.paper;
      ctx.beginPath();
      ctx.roundRect(x - 6, y - 10, tw, 20, 5);
      ctx.fill();
      ctx.fillStyle = col;
      ctx.fillText(txt, x, y);
    };
    const zoneAX = Math.max(24, Math.min(boundaryX - 185, 28));
    if (boundaryX > 85) drawZonePill("Zone A · Locked Private Vault", zoneAX, 64, colors.warn);
    if (w - boundaryX > 90) drawZonePill("Zone B · AI-Readable & Local Notes", boundaryX + 14, 64, colors.akzent);
    ctx.restore();
    return;
  }

  if (lens === "focus") {
    const cx = t.x;
    const cy = t.y;
    const rInner = Math.max(64, Math.min(140, FOCUS_EXCLUSION_RADIUS * t.k));
    const rOuter = Math.max(rInner + 64, Math.min(280, FOCUS_OUTER_RADIUS * t.k));
    ctx.save();
    ctx.strokeStyle = colors.dekore;
    ctx.setLineDash([4, 4]);
    for (const r of [rInner, rOuter]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const a of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * rInner, cy + Math.sin(a) * rInner);
      ctx.lineTo(cx + Math.cos(a) * (rOuter + 120), cy + Math.sin(a) * (rOuter + 120));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }
}

/** Paints Focus quadrant labels with background paper pills AFTER edges so lines never strike through text. */
export function paintFocusQuadrantPills(
  ctx: CanvasRenderingContext2D,
  t: Transform,
  akzent: string,
  text2: string,
  paper: string
): void {
  const cx = t.x;
  const cy = t.y;
  const rInner = Math.max(64, Math.min(140, FOCUS_EXCLUSION_RADIUS * t.k));
  ctx.save();
  ctx.font = "600 11px ui-sans-serif, system-ui, -apple-system, sans-serif";
  const drawPill = (txt: string, x: number, y: number, col: string) => {
    const tw = ctx.measureText(txt).width + 12;
    ctx.fillStyle = paper;
    ctx.beginPath();
    ctx.roundRect(x - tw / 2, y - 9, tw, 18, 4);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(txt, x, y);
  };
  drawPill("▲ Similar themes", cx, Math.max(66, cy - rInner - 10), text2);
  drawPill("▼ Time & versions", cx, cy + rInner + 14, text2);
  drawPill("◀ Cited by", cx - rInner - 32, cy, text2);
  drawPill("Links out ▶", cx + rInner + 32, cy, akzent);
  ctx.restore();
}
