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
  real?: boolean;
}

interface GraphApi {
  relations: { source: string; target: string; relation: string; memoryId: string | null }[];
  memoriesByEntity: Record<string, string[]>;
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
  const simTicks = useRef(0);
  // Individuelle Positionierung: einmal verschobene Knoten bleiben gepinnt (Obsidian-Feel)
  const pinnedRef = useRef<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("");
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [positions, setPositions] = useState<Map<string, NodePos>>(new Map());
  const [dragging, setDragging] = useState<{ id: string | null; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [panning, setPanning] = useState<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ w: 800, h: 500 });

  // Echte Relationen aus der Graph-DB (Entities/Relations) laden
  const [graphApi, setGraphApi] = useState<GraphApi | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/graph?depth=2");
        const data = await res.json();
        if (!cancelled && data && Array.isArray(data.relations)) setGraphApi(data as GraphApi);
      } catch { /* Engine nicht erreichbar — heuristische Kanten bleiben */ }
    })();
    return () => { cancelled = true; };
  }, [memories.length]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return memories;
    const q = filter.toLowerCase();
    return memories.filter((m) => m.title.toLowerCase().includes(q) || m.content.toLowerCase().includes(q) || m.tags.some((t) => t.toLowerCase().includes(q)));
  }, [memories, filter]);

  const edges: Edge[] = useMemo(() => {
    const list: Edge[] = [];
    const idSet = new Set(filtered.map((m) => m.id));
    // Echte Kanten aus der Graph-DB: Memories, die an derselben Entität hängen
    if (graphApi && Array.isArray(graphApi.relations)) {
      const added = new Set<string>();
      for (const rel of graphApi.relations) {
        const memsA = (graphApi.memoriesByEntity?.[rel.source] ?? []).filter((id) => idSet.has(id));
        const memsB = (graphApi.memoriesByEntity?.[rel.target] ?? []).filter((id) => idSet.has(id));
        // Verbinde direkte: Memory→Memory über die relation, capped pro Relation
        const pairs: [string, string][] = [];
        for (const a of memsA) for (const b of memsB) { if (a !== b) pairs.push([a, b]); }
        for (const [a, b] of pairs.slice(0, 24)) {
          const key = a < b ? `${a}|${b}` : `${b}|${a}`;
          if (added.has(key)) continue;
          added.add(key);
          list.push({ source: a, target: b, strength: 0.85, real: true });
        }
      }
    }
    const realPairs = new Set(list.map((e) => (e.source < e.target ? `${e.source}|${e.target}` : `${e.target}|${e.source}`)));
    for (let i = 0; i < filtered.length; i++) {
      for (let j = i + 1; j < filtered.length; j++) {
        const a = filtered[i];
        const b = filtered[j];
        const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        if (realPairs.has(key)) continue;
        const tagScore = tagOverlap(a.tags, b.tags);
        const titleScore = titleSimilarity(a.title, b.title);
        const strength = Math.max(tagScore * 0.9, titleScore * 0.6);
        if (strength > 0.24) list.push({ source: a.id, target: b.id, strength });
        else if (tagScore > 0 && titleScore > 0.15) list.push({ source: a.id, target: b.id, strength: 0.3 });
      }
    }
    return list.slice(0, 900);
  }, [filtered, graphApi]);

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
      if (!running) return;
      simTicks.current += 1;
      setPositions((prev) => {
        const next = new Map<string, NodePos>();
        const nodes = Array.from(prev.values());
        // copy
        nodes.forEach((n) => next.set(n.id, { ...n }));

        const cx = dimensions.w / 2;
        const cy = dimensions.h / 2;
        const kRep = 2600;
        const kAttr = 0.018;
        const ideal = 165;
        const damping = 0.85;
        // Obsidian-Feel: Schwerkraft ordnet nur die ersten Sekunden — danach
        // bleibt jeder Knoten, wo der Nutzer ihn hinlegt.
        const gravity = 0.012 * Math.max(0, 1 - simTicks.current / 480);

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
        // gravity + integrate — gepinnte/gezogene Knoten bleiben exakt, wo sie sind
        nodes.forEach((orig) => {
          const n = next.get(orig.id)!;
          if (dragging?.id === orig.id || pinnedRef.current.has(orig.id)) { n.vx = 0; n.vy = 0; return; }
          if (gravity > 0) {
            n.vx += (cx - n.x) * gravity;
            n.vy += (cy - n.y) * gravity;
          }
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
    // rAF-Loop — läuft auch beim Ziehen weiter, damit Verbundene elastisch mitwandern
    const loop = () => {
      if (!running) return;
      tick();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(raf); };
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

  const onPointerUp = useCallback(() => {
    // Nach dem Loslassen sofort zur Ruhe kommen — kein Zurückschnappen des Clusters
    if (dragging) {
      setPositions((prev) => new Map([...prev].map(([id, n]) => [id, { ...n, vx: 0, vy: 0 }])));
    }
    setPanning(null);
    setDragging(null);
  }, [dragging]);

  // Typ-Farben (kohärent mit Karten-Badges WISSEN/EPISODE/ABLAUF) statt Tag-Regenbogen
  // Typ-Farben — individuell anpassbar pro Gerät (localStorage)
  const DEFAULT_TYPE_COLORS: Record<string, string> = {
    semantic: "#60a5fa",
    episodic: "#a78bfa",
    procedural: "#34d399",
  };
  const [customTypeColors, setCustomTypeColors] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("kepta_type_colors") || "{}"); } catch { return {}; }
  });
  const TYPE_COLORS = { ...DEFAULT_TYPE_COLORS, ...customTypeColors };
  const setTypeColor = (t: string, c: string) => {
    setCustomTypeColors((prev) => {
      const next = { ...prev, [t]: c };
      try { localStorage.setItem("kepta_type_colors", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  const nodeFill = (m: Memory): string => TYPE_COLORS[m.type ?? "semantic"] ?? "var(--text-3)";

  // Verbindungsgrad bestimmt die Größe — Hubs sind sofort erkennbar
  const degree = useMemo(() => {
    const d = new Map<string, number>();
    for (const e of edges) { d.set(e.source, (d.get(e.source) ?? 0) + 1); d.set(e.target, (d.get(e.target) ?? 0) + 1); }
    return d;
  }, [edges]);
  const radiusOf = (m: Memory): number => Math.min(24, 7 + Math.log2(1 + (degree.get(m.id) ?? 0)) * 4.5);

  // Nachbarschaft für Fokus-Modus
  const neighborsOf = useMemo(() => {
    const n = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!n.has(e.source)) n.set(e.source, new Set());
      if (!n.has(e.target)) n.set(e.target, new Set());
      n.get(e.source)!.add(e.target);
      n.get(e.target)!.add(e.source);
    }
    return n;
  }, [edges]);

  if (memories.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="hud-label mb-2">Wissens-Graph</div>
        <p className="text-sm max-w-sm" style={{ color: "var(--text-2)" }}>Keine Knoten vorhanden. Lege deine erste Notiz an — der Graph zeigt echte Verbindungen (Wiki-Links, Agenten) und Ähnlichkeiten.</p>
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
        <div className="flex items-center gap-1 ml-2" title="Knotenfarben individuell anpassen">
          {(["semantic", "episodic", "procedural"] as const).map((t) => (
            <input
              key={t}
              type="color"
              value={TYPE_COLORS[t]}
              onChange={(e) => setTypeColor(t, e.target.value)}
              title={`Farbe: ${t === "semantic" ? "Wissen" : t === "episodic" ? "Episode" : "Ablauf"}`}
              className="w-6 h-6 rounded cursor-pointer bg-transparent p-0"
              style={{ border: "1px solid var(--border-subtle)" }}
            />
          ))}
        </div>
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
          {/* Liquid Glass: Licht von oben-links, Typ-Tint, weiche Tiefe */}
          <defs>
            {(["semantic", "episodic", "procedural"] as const).map((t) => (
              <radialGradient key={t} id={`glass-${t}`} cx="0.32" cy="0.28" r="1">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.78" />
                <stop offset="35%" stopColor={TYPE_COLORS[t]} stopOpacity="0.40" />
                <stop offset="100%" stopColor={TYPE_COLORS[t]} stopOpacity="0.18" />
              </radialGradient>
            ))}
            <radialGradient id="glass-neutral" cx="0.32" cy="0.28" r="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#9a9a9a" stopOpacity="0.3" />
            </radialGradient>
          </defs>
          <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
            {/* Edges — echt: gebogene Akzentpfade · Ähnlichkeit: fein gepunktet */}
            {edges.map((e, i) => {
              const a = positions.get(e.source);
              const b = positions.get(e.target);
              if (!a || !b) return null;
              const inFocus = !hovered || hovered === e.source || hovered === e.target;
              const dim = hovered !== null && !inFocus;
              const lit = hovered !== null && inFocus;
              const dx = b.x - a.x, dy = b.y - a.y;
              const len = Math.hypot(dx, dy) || 1;
              const off = e.real ? Math.min(16, len * 0.12) : 0;
              const cx2 = (a.x + b.x) / 2 - (dy / len) * off;
              const cy2 = (a.y + b.y) / 2 + (dx / len) * off;
              const k = transform.k;
              return (
                <path
                  key={`${e.source}-${e.target}-${i}`}
                  d={`M ${a.x} ${a.y} Q ${cx2} ${cy2} ${b.x} ${b.y}`}
                  fill="none"
                  stroke={dim ? "var(--border-strong)" : e.real ? "var(--accent)" : "var(--text-3)"}
                  strokeOpacity={dim ? 0.05 : e.real ? (lit ? 0.95 : 0.55) : lit ? 0.5 : 0.13 + e.strength * 0.2}
                  strokeWidth={(e.real ? 2 : 0.9) / Math.max(0.4, k)}
                  strokeDasharray={e.real ? undefined : `${3 / Math.max(0.4, k)} ${5 / Math.max(0.4, k)}`}
                  strokeLinecap="round"
                />
              );
            })}
            {/* Nodes */}
            {filtered.map((m) => {
              const pos = positions.get(m.id);
              if (!pos) return null;
              const isHovered = hovered === m.id;
              const dimmed = hovered !== null && !isHovered && !neighborsOf.get(hovered)?.has(m.id);
              const r = radiusOf(m);
              const fill = nodeFill(m);
              const expired = m.validTo != null && m.validTo < Date.now();
              const superseded = !!m.supersededBy;
              const showLabel = isHovered || r > 12 || transform.k > 1.4;
              const fs = Math.min(15, 11 / Math.max(0.4, transform.k));
              return (
                <g
                  key={m.id}
                  data-node
                  transform={`translate(${pos.x},${pos.y})`}
                  className="cursor-pointer"
                  opacity={dimmed ? 0.12 : superseded ? 0.55 : 1}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.currentTarget as Element).setPointerCapture(e.pointerId);
                    pinnedRef.current.add(m.id);
                    setDragging({ id: m.id, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y });
                  }}
                  onPointerEnter={() => setHovered(m.id)}
                  onPointerLeave={() => setHovered((h) => (h === m.id ? null : h))}
                  // UX (Persona-Feedback): Ziehen = explorieren/verschieben, ÖFFNEN nur per Doppelklick.
                  // Ein Click-Handler hier würde nach jedem Drag feuern (dragging ist beim click schon null).
                  onDoubleClick={() => onSelectMemory(m)}
                >
                  <circle
                    r={isHovered ? r + 3 : r}
                    fill={`url(#glass-${m.type && TYPE_COLORS[m.type] ? m.type : "neutral"})`}
                    stroke="rgba(255,255,255,0.45)"
                    strokeDasharray={expired ? `${4 / Math.max(0.4, transform.k)} ${3 / Math.max(0.4, transform.k)}` : undefined}
                    strokeWidth={1.2 / Math.max(0.4, transform.k)}
                    style={{ filter: isHovered ? "drop-shadow(0 0 12px var(--accent-glow))" : "drop-shadow(0 3px 7px rgba(0,0,0,0.25))" }}
                  />
                  {/* Refraktions-Ring (leicht chromatisch, wie dicke Glasskante) */}
                  <circle r={r * 0.84} fill="none" stroke="rgba(150,200,255,0.28)" strokeWidth={0.9 / Math.max(0.4, transform.k)} />
                  {/* Gegenschatten unten (Linsen-Tiefe) */}
                  <ellipse cx={0} cy={r * 0.58} rx={r * 0.62} ry={r * 0.26} fill="rgba(10,15,40,0.12)" />
                  {/* Specular: heller Kantenbogen oben + Glass-Schein + Glanzpunkt */}
                  <path
                    d={`M ${-r * 0.68} ${-r * 0.42} A ${r * 0.86} ${r * 0.86} 0 0 1 ${r * 0.68} ${-r * 0.42}`}
                    fill="none" stroke="white" strokeOpacity={dimmed ? 0.15 : 0.6}
                    strokeWidth={1.6 / Math.max(0.4, transform.k)} strokeLinecap="round"
                  />
                  <ellipse
                    cx={-r * 0.2} cy={-r * 0.38} rx={r * 0.42} ry={r * 0.2}
                    fill="white" fillOpacity={dimmed ? 0.08 : 0.4}
                    transform="rotate(-24)"
                  />
                  <circle r={Math.max(1.6, 2 / Math.max(0.4, transform.k))} fill="white" fillOpacity={0.85} />
                  {showLabel && (
                    <text
                      x={0} y={r + fs + 2}
                      textAnchor="middle"
                      fontSize={fs}
                      fontWeight={isHovered ? 600 : 500}
                      fill="var(--text-1)"
                      opacity={dimmed ? 0.3 : 1}
                      style={{ paintOrder: "stroke", stroke: "var(--bg-panel-solid)", strokeWidth: 3 / Math.max(0.4, transform.k), strokeLinejoin: "round" as const }}
                    >
                      {m.title.length > 22 ? m.title.slice(0, 22) + "…" : m.title || "Ohne Titel"}
                    </text>
                  )}
                  {isHovered && m.tags.length > 0 && (
                    <text
                      x={0} y={r + fs * 2 + 4}
                      textAnchor="middle"
                      fontSize={fs * 0.85}
                      fill="var(--text-2)"
                      style={{ paintOrder: "stroke", stroke: "var(--bg-panel-solid)", strokeWidth: 3 / Math.max(0.4, transform.k) }}
                    >
                      {m.tags.slice(0, 3).join(" · ")}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        <div className="absolute left-3 bottom-3 hud-panel rounded-lg px-3 py-2 pointer-events-none space-y-1">
          <div className="flex items-center gap-3 hud-label">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#60a5fa' }} /> Wissen</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#a78bfa' }} /> Episode</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#34d399' }} /> Ablauf</span>
          </div>
          <div className="flex items-center gap-3 hud-label">
            <svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="var(--accent)" strokeWidth="2" /></svg> echte Verbindung
            <svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="var(--text-3)" strokeWidth="1.5" strokeDasharray="3 4" /></svg> Ähnlichkeit
          </div>
          <div className="hud-label">Ziehen: Knoten verschieben · Doppelklick: Notiz öffnen · Mausrad: Zoom · Größe = Verbindungen</div>
        </div>
      </div>
    </div>
  );
}
