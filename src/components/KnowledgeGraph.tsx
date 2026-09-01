import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Memory } from "../types";
import { Search, Maximize2, ZoomIn, ZoomOut } from "lucide-react";

interface KnowledgeGraphProps {
  memories: Memory[];
  onSelectMemory: (m: Memory) => void;
}

interface NodePos {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

interface Edge {
  source: string;
  target: string;
  strength: number;
}

function titleSimilarity(a: string, b: string): number {
  const wa = new Set(a.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  const wb = new Set(b.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return 0;
  let inter = 0;
  wa.forEach((w) => { if (wb.has(w)) inter++; });
  return inter / Math.min(wa.size, wb.size);
}

function tagOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a.map((t) => t.toLowerCase()));
  let inter = 0;
  b.forEach((t) => { if (sa.has(t.toLowerCase())) inter++; });
  return inter / Math.min(a.length, b.length);
}

export function KnowledgeGraph({ memories, onSelectMemory }: KnowledgeGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("");
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [positions, setPositions] = useState<Map<string, NodePos>>(new Map());
  const [dragging, setDragging] = useState<{ id: string | null; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [panning, setPanning] = useState<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ w: 800, h: 500 });

  const filtered = useMemo(() => {
    if (!filter.trim()) return memories;
    const q = filter.toLowerCase();
    return memories.filter((m) => m.title.toLowerCase().includes(q) || m.content.toLowerCase().includes(q) || m.tags.some((t) => t.toLowerCase().includes(q)));
  }, [memories, filter]);

  const edges: Edge[] = useMemo(() => {
    const list: Edge[] = [];
    for (let i = 0; i < filtered.length; i++) {
      for (let j = i + 1; j < filtered.length; j++) {
        const a = filtered[i];
        const b = filtered[j];
        const tagScore = tagOverlap(a.tags, b.tags);
        const titleScore = titleSimilarity(a.title, b.title);
        const strength = Math.max(tagScore * 0.9, titleScore * 0.6);
        if (strength > 0.24) list.push({ source: a.id, target: b.id, strength });
        else if (tagScore > 0 && titleScore > 0.15) list.push({ source: a.id, target: b.id, strength: 0.3 });
      }
    }
    return list.slice(0, 900);
  }, [filtered]);

  // Initialize node positions
  useEffect(() => {
    const w = dimensions.w;
    const h = dimensions.h;
    const next = new Map<string, NodePos>();
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.34;
    filtered.forEach((m, idx) => {
      const prev = positions.get(m.id);
      if (prev) { next.set(m.id, prev); return; }
      const angle = (idx / Math.max(filtered.length, 1)) * Math.PI * 2 + (Math.random() * 0.4 - 0.2);
      const r = radius * (0.55 + Math.random() * 0.45);
      const contentFactor = Math.min(22, 10 + Math.log2((m.content.length || 1) + 1) * 2.2);
      next.set(m.id, {
        id: m.id,
        x: cx + Math.cos(angle) * r + (Math.random() * 30 - 15),
        y: cy + Math.sin(angle) * r + (Math.random() * 30 - 15),
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        r: contentFactor,
      });
    });
    // prune removed
    setPositions(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.map((m) => m.id).join(","), dimensions.w, dimensions.h]);

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const cr = e.contentRect;
        setDimensions({ w: Math.max(400, cr.width), h: Math.max(380, cr.height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Force simulation
  useEffect(() => {
    if (filtered.length === 0 || positions.size === 0) return;
    let raf = 0;
    let running = true;

    const tick = () => {
      if (!running || dragging) return;
      setPositions((prev) => {
        const next = new Map<string, NodePos>();
        const nodes = Array.from(prev.values());
        const idToIdx = new Map(nodes.map((n, i) => [n.id, i]));
        // copy
        nodes.forEach((n) => next.set(n.id, { ...n }));

        const cx = dimensions.w / 2;
        const cy = dimensions.h / 2;
        const kRep = 1400;
        const kAttr = 0.015;
        const ideal = 110;
        const damping = 0.85;
        const gravity = 0.012;

        // repulsion O(n^2) — ok for <150 nodes
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = next.get(nodes[i].id)!;
            const b = next.get(nodes[j].id)!;
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            let distSq = dx * dx + dy * dy;
            if (distSq < 1) distSq = 1;
            const dist = Math.sqrt(distSq);
            const force = kRep / distSq;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            a.vx += fx * 0.016;
            a.vy += fy * 0.016;
            b.vx -= fx * 0.016;
            b.vy -= fy * 0.016;
          }
        }
        // attraction on edges
        for (const e of edges) {
          const a = next.get(e.source);
          const b = next.get(e.target);
          if (!a || !b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const f = kAttr * e.strength * (dist - ideal);
          const fx = (dx / dist) * f;
          const fy = (dy / dist) * f;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }
        // gravity + integrate
        nodes.forEach((orig) => {
          const n = next.get(orig.id)!;
          n.vx += (cx - n.x) * gravity;
          n.vy += (cy - n.y) * gravity;
          n.vx *= damping;
          n.vy *= damping;
          n.x += n.vx;
          n.y += n.vy;
          // clamp
          n.x = Math.max(n.r + 10, Math.min(dimensions.w - n.r - 10, n.x));
          n.y = Math.max(n.r + 10, Math.min(dimensions.h - n.r - 10, n.y));
        });
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    // run with interval ~16ms for 3 seconds burst, then slower
    const interval = setInterval(() => { if (!dragging) tick(); }, 16);
    return () => { running = false; cancelAnimationFrame(raf); clearInterval(interval); };
  }, [edges, filtered.length, dimensions.w, dimensions.h, dragging, positions.size]);

  const zoom = useCallback((delta: number, cx?: number, cy?: number) => {
    setTransform((t) => {
      const nk = Math.min(4, Math.max(0.2, t.k * (delta > 0 ? 1.12 : 0.89)));
      if (cx === undefined || cy === undefined) return { ...t, k: nk };
      // zoom towards pointer
      const scale = nk / t.k;
      const nx = cx - (cx - t.x) * scale;
      const ny = cy - (cy - t.y) * scale;
      return { x: nx, y: ny, k: nk };
    });
  }, []);

  const fitView = useCallback(() => setTransform({ x: 0, y: 0, k: 1 }), []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    const cx = rect ? e.clientX - rect.left : undefined;
    const cy = rect ? e.clientY - rect.top : undefined;
    zoom(e.deltaY < 0 ? 1 : -1, cx, cy);
  }, [zoom]);

  const onPointerDownEmpty = useCallback((e: React.PointerEvent) => {
    if ((e.target as Element).closest("[data-node]")) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setPanning({ sx: e.clientX, sy: e.clientY, ox: transform.x, oy: transform.y });
  }, [transform.x, transform.y]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (panning) {
      const dx = e.clientX - panning.sx;
      const dy = e.clientY - panning.sy;
      setTransform((t) => ({ ...t, x: panning.ox + dx, y: panning.oy + dy }));
    }
    if (dragging && dragging.id) {
      // dragging node: map screen -> world
      const worldX = (e.clientX - (svgRef.current?.getBoundingClientRect().left ?? 0) - transform.x) / transform.k;
      const worldY = (e.clientY - (svgRef.current?.getBoundingClientRect().top ?? 0) - transform.y) / transform.k;
      setPositions((prev) => {
        const next = new Map(prev);
        const n = next.get(dragging.id!);
        if (n) next.set(n.id, { ...n, x: worldX, y: worldY, vx: 0, vy: 0 });
        return next;
      });
    }
  }, [panning, dragging, transform.k, transform.x, transform.y]);

  const onPointerUp = useCallback(() => { setPanning(null); setDragging(null); }, []);

  // Determine node color by primary tag hue
  const nodeFill = (m: Memory): string => {
    if (m.tags.length === 0) return "var(--text-3)";
    let hash = 0; for (let i = 0; i < m.tags[0].length; i++) hash = (hash * 31 + m.tags[0].charCodeAt(i)) >>> 0;
    const hue = hash % 360;
    return `hsl(${hue} 70% 62%)`;
  };

  if (memories.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="hud-label mb-2">Wissens-Graph</div>
        <p className="text-sm max-w-sm" style={{ color: "var(--text-2)" }}>Keine Knoten vorhanden. Erstelle zuerst Wissen – der Graph visualisiert Tags und Titel-Ähnlichkeit.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-2 py-3 shrink-0 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-3)" }} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Graph filtern…"
            className="hud-input w-full pl-8 pr-3 py-2 rounded-lg text-sm"
          />
        </div>
        <div className="hud-label hidden sm:block">{filtered.length} Knoten · {edges.length} Kanten</div>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => zoom(1)} className="btn-ghost p-2 rounded-lg" title="Hineinzoomen"><ZoomIn className="w-4 h-4" /></button>
          <button onClick={() => zoom(-1)} className="btn-ghost p-2 rounded-lg" title="Herauszoomen"><ZoomOut className="w-4 h-4" /></button>
          <button onClick={fitView} className="btn-ghost p-2 rounded-lg" title="Ansicht zurücksetzen"><Maximize2 className="w-4 h-4" /></button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 min-h-[420px] hud-inset rounded-xl overflow-hidden relative"
        style={{ border: "1px solid var(--border-subtle)" }}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          className="absolute inset-0 touch-none select-none"
          style={{ cursor: panning ? "grabbing" : dragging ? "grabbing" : "grab" }}
          onWheel={onWheel}
          onPointerDown={onPointerDownEmpty}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
            {/* Edges */}
            {edges.map((e, i) => {
              const a = positions.get(e.source);
              const b = positions.get(e.target);
              if (!a || !b) return null;
              const isHighlighted = hovered === e.source || hovered === e.target;
              return (
                <line
                  key={`${e.source}-${e.target}-${i}`}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={isHighlighted ? "var(--accent)" : "var(--border-strong)"}
                  strokeOpacity={isHighlighted ? 0.9 : 0.24 + e.strength * 0.28}
                  strokeWidth={isHighlighted ? 2 : 1 + e.strength * 1.2}
                />
              );
            })}
            {/* Nodes */}
            {filtered.map((m) => {
              const pos = positions.get(m.id);
              if (!pos) return null;
              const isHovered = hovered === m.id;
              const fill = nodeFill(m);
              return (
                <g
                  key={m.id}
                  data-node
                  transform={`translate(${pos.x},${pos.y})`}
                  className="cursor-pointer"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.currentTarget as Element).setPointerCapture(e.pointerId);
                    setDragging({ id: m.id, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y });
                  }}
                  onPointerEnter={() => setHovered(m.id)}
                  onPointerLeave={() => setHovered((h) => (h === m.id ? null : h))}
                  onClick={() => { if (!dragging || Math.hypot(pos.x - dragging.origX, pos.y - dragging.origY) < 5) onSelectMemory(m); }}
                >
                  <circle
                    r={isHovered ? pos.r + 4 : pos.r}
                    fill={fill}
                    fillOpacity={isHovered ? 0.95 : 0.88}
                    stroke="var(--bg-panel-solid)"
                    strokeWidth={2}
                    style={{ filter: isHovered ? "drop-shadow(0 0 8px var(--accent-glow))" : undefined }}
                  />
                  {/* inner dot for accesibility */}
                  <circle r={2.2} fill="white" fillOpacity={0.95} />
                  {/* label */}
                  {(isHovered || pos.r > 14) && (
                    <text
                      x={0} y={pos.r + 14}
                      textAnchor="middle"
                      fontSize={isHovered ? 11 : 10}
                      fontWeight={isHovered ? 600 : 500}
                      fill="var(--text-1)"
                      style={{ paintOrder: "stroke", stroke: "var(--bg-panel-solid)", strokeWidth: 3, strokeLinejoin: "round" as const }}
                    >
                      {m.title.length > 22 ? m.title.slice(0, 22) + "…" : m.title || "Ohne Titel"}
                    </text>
                  )}
                  {isHovered && m.tags.length > 0 && (
                    <text
                      x={0} y={pos.r + 26}
                      textAnchor="middle"
                      fontSize={9}
                      fill="var(--text-2)"
                      style={{ paintOrder: "stroke", stroke: "var(--bg-panel-solid)", strokeWidth: 3 }}
                    >
                      {m.tags.slice(0, 3).join(" · ")}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        <div className="absolute left-3 bottom-3 hud-panel rounded-lg px-2.5 py-1.5 hud-label pointer-events-none">
          Ziehen: Knoten verschieben · Leere Fläche: Pan · Mausrad: Zoom
        </div>
      </div>
    </div>
  );
}
