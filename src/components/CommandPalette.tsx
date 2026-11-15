import { useEffect, useRef, useState, useMemo } from "react";
import { Search, Plus, Database, MessageSquare, SettingsIcon, Network, Sparkles, Globe, FileUp } from "../lib/icons";
import type { Memory } from "../types";
import { kurzeZeit, typFarbe } from "../lib/zeit";
import { TYP_BESCHREIBUNG } from "../lib/graphHierarchy";

export interface PaletteAction {
  id: string;
  label: string;
  desc?: string;
  icon?: React.ReactNode;
  hotkey?: string;
  action: () => void;
  keywords?: string;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  actions: PaletteAction[];
  memories?: Memory[];
  onSelectMemory?: (m: Memory) => void;
}

type PaletteEntry =
  | { kind: "cmd"; action: PaletteAction }
  | { kind: "note"; memory: Memory };

export function CommandPalette({ open, onClose, actions, memories, onSelectMemory }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return actions;
    const q = query.toLowerCase();
    return actions.filter((a) => a.label.toLowerCase().includes(q) || (a.desc && a.desc.toLowerCase().includes(q)) || (a.keywords && a.keywords.toLowerCase().includes(q)));
  }, [actions, query]);

  const matchingNotes = useMemo(() => {
    if (!memories || memories.length === 0) return [] as Memory[];
    const q = query.trim().toLowerCase();
    if (!q) return memories.slice(0, 4);
    const hits: Memory[] = [];
    for (const m of memories) {
      const titleHit = (m.title || "").toLowerCase().includes(q);
      const bodyHit = (m.content || "").toLowerCase().includes(q);
      const tagHit = m.tags.some((t) => t.toLowerCase().includes(q));
      if (titleHit || bodyHit || tagHit) {
        hits.push(m);
        if (hits.length >= 6) break;
      }
    }
    return hits;
  }, [memories, query]);

  const entries: PaletteEntry[] = useMemo(() => [
    ...filtered.map((action) => ({ kind: "cmd" as const, action })),
    ...matchingNotes.map((memory) => ({ kind: "note" as const, memory })),
  ], [filtered, matchingNotes]);

  useEffect(() => { setIdx(0); }, [query, actions, memories]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(Math.max(0, entries.length - 1), i + 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = entries[idx];
        if (!item) return;
        onClose();
        if (item.kind === "cmd") item.action.action();
        else onSelectMemory?.(item.memory);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, entries, idx, onClose, onSelectMemory]);

  useEffect(() => {
    // keep selected visible
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${idx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  if (!open) return null;

  const activeEntry = entries[idx] ?? entries[0] ?? null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[10vh] px-4">
      <div className="absolute inset-0 hud-backdrop" onClick={onClose} />
      <div className="relative w-full max-w-[640px] palette-lens flex flex-col" style={{ maxHeight: "min(64vh, 520px)" }}>
        <div className="flex items-center gap-[9px] px-[14px] py-[11px] shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-3)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Command or search"
            placeholder="Command or search… (e.g. graph, new note, settings)"
            className="flex-1 bg-transparent outline-none fs-3 lh-lesbar placeholder:text-[var(--text-3)]"
            style={{ color: "var(--text-1)" }}
          />
        </div>

        <div className="flex flex-1 min-h-0">
          <div ref={listRef} className="overflow-y-auto w-full sm:w-[320px] shrink-0" style={{ borderRight: "1px solid var(--border-subtle)", padding: "5px" }}>
            {entries.length === 0 && (
              <div className="py-10 px-6 text-center fs-3 lh-prosa" style={{ color: "var(--text-2)" }}>
                Nothing here answers “{query}”.
                <span className="block fs-2 mt-1" style={{ color: "var(--text-2)" }}>
                  One word of a title, a tag, or the first letters of a command — Esc closes this.
                </span>
              </div>
            )}
            {filtered.map((a, i) => (
              <button
                key={a.id}
                data-idx={i}
                data-active={i === idx}
                onMouseEnter={() => setIdx(i)}
                onClick={() => { onClose(); a.action(); }}
                className="palette-row w-full text-left"
                style={{ color: i === idx ? "var(--text-1)" : "var(--text-2)" }}
              >
                <span className="pal-ikon">{a.icon}</span>
                <span className="flex-1 min-w-0">
                  <span className="block fs-3 lh-lesbar font-semibold truncate">{a.label}</span>
                  {a.desc && <span className="block fs-2 lh-dicht truncate" style={{ color: "var(--text-3)" }}>{a.desc}</span>}
                </span>
                {a.hotkey && <span className="kbd shrink-0">{a.hotkey}</span>}
              </button>
            ))}
            {matchingNotes.length > 0 && (
              <div className="px-2.5 pt-2 pb-1 fs-1 font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-3)" }}>
                Notes
              </div>
            )}
            {matchingNotes.map((m, noteOffset) => {
              const globalIdx = filtered.length + noteOffset;
              const isAct = globalIdx === idx;
              return (
                <button
                  key={`note-${m.id}`}
                  data-idx={globalIdx}
                  data-active={isAct}
                  onMouseEnter={() => setIdx(globalIdx)}
                  onClick={() => { onClose(); onSelectMemory?.(m); }}
                  className="palette-row w-full text-left"
                  style={{ color: isAct ? "var(--text-1)" : "var(--text-2)" }}
                >
                  <span className="pal-ikon">
                    <span className="w-2 h-2 rounded-[3px] block" style={{ background: typFarbe(m.type) }} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block fs-3 lh-lesbar font-semibold truncate">{m.title || "Untitled"}</span>
                    <span className="block fs-2 lh-dicht truncate" style={{ color: "var(--text-3)" }}>
                      {TYP_BESCHREIBUNG[m.type ?? "semantic"] ?? TYP_BESCHREIBUNG.semantic} · {kurzeZeit(m.updatedAt)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="hidden sm:flex flex-1 flex-col justify-between p-4 min-w-0" style={{ background: "var(--bg-inset)" }}>
            {activeEntry?.kind === "cmd" ? (
              <>
                <div className="space-y-3">
                  <div className="fs-1 font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>
                    Command preview
                  </div>
                  <div className="flex items-start gap-3">
                    <span
                      className="w-8 h-8 grid place-items-center shrink-0"
                      style={{
                        borderRadius: "var(--r-btn)",
                        background: "var(--accent-soft)",
                        color: "var(--accent)",
                        border: "1px solid color-mix(in srgb, var(--accent) 22%, transparent)",
                      }}
                    >
                      {activeEntry.action.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="fs-1 font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--accent)" }}>
                        {activeEntry.action.id}
                      </div>
                      <p className="mt-1 fs-2 lh-lesbar" style={{ color: "var(--text-1)" }}>
                        {activeEntry.action.desc || "Ready"}
                      </p>
                    </div>
                  </div>
                  <div className="pt-2 space-y-1.5" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <div className="flex items-center justify-between gap-2 fs-1">
                      <span style={{ color: "var(--text-3)" }}>Execution</span>
                      <span style={{ color: "var(--text-2)" }}>Local vault</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 fs-1">
                      <span style={{ color: "var(--text-3)" }}>Trigger</span>
                      <span style={{ color: "var(--text-2)" }}>{activeEntry.action.hotkey || "Return"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 fs-1">
                      <span style={{ color: "var(--text-3)" }}>Position</span>
                      <span className="tnum" style={{ color: "var(--text-2)" }}>{Math.min(idx, Math.max(0, entries.length - 1)) + 1} / {entries.length}</span>
                    </div>
                  </div>
                </div>
                <div className="pt-3 flex items-center justify-between gap-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <span className="fs-1" style={{ color: "var(--text-3)" }}>
                    ↑↓ Move · ↵ Run · Esc Close
                  </span>
                  {activeEntry.action.hotkey && <span className="kbd">{activeEntry.action.hotkey}</span>}
                </div>
              </>
            ) : activeEntry?.kind === "note" ? (
              <>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-[3px] shrink-0" style={{ background: typFarbe(activeEntry.memory.type) }} />
                    <span className="fs-1 font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>
                      Note preview · {TYP_BESCHREIBUNG[activeEntry.memory.type ?? "semantic"] ?? TYP_BESCHREIBUNG.semantic}
                    </span>
                  </div>
                  <div className="fs-4 font-semibold lh-dicht" style={{ color: "var(--text-1)" }}>
                    {activeEntry.memory.title || "Untitled"}
                  </div>
                  <p className="fs-2 lh-lesbar" style={{ color: "var(--text-2)", margin: 0 }}>
                    {activeEntry.memory.content.length > 200
                      ? `${activeEntry.memory.content.slice(0, 200)}…`
                      : activeEntry.memory.content}
                  </p>
                  {activeEntry.memory.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {activeEntry.memory.tags.slice(0, 5).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-full fs-1 font-semibold"
                          style={{
                            color: "var(--type-semantic)",
                            background: "color-mix(in srgb, var(--type-semantic) 12%, transparent)",
                          }}
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="pt-2 space-y-1.5" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <div className="flex items-center justify-between gap-2 fs-1">
                      <span style={{ color: "var(--text-3)" }}>Updated</span>
                      <span className="tnum" style={{ color: "var(--text-2)" }}>{kurzeZeit(activeEntry.memory.updatedAt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 fs-1">
                      <span style={{ color: "var(--text-3)" }}>Position</span>
                      <span className="tnum" style={{ color: "var(--text-2)" }}>{Math.min(idx, Math.max(0, entries.length - 1)) + 1} / {entries.length}</span>
                    </div>
                  </div>
                </div>
                <div className="pt-3 flex items-center justify-between gap-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <span className="fs-1" style={{ color: "var(--text-3)" }}>
                    ↑↓ Move · ↵ Open · Esc Close
                  </span>
                </div>
              </>
            ) : (
              <div className="my-auto text-center fs-2 lh-lesbar" style={{ color: "var(--text-3)" }}>
                No command selected
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper hook: global ⌘K listener
export function useCommandPaletteHotkey(onOpen: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onOpen]);
}

// Quick builder for default actions – used by Dashboard
export function buildPaletteActions(opts: {
  onNewNode: () => void;
  onFocusSearch: () => void;
  onGoMemories: () => void;
  onGoChat: () => void;
  onGoSettings: () => void;
  onGoGraph: () => void;
  onImportFileClick: () => void;
  onFocusUrl: () => void;
  onOpenSetup?: () => void;
}): PaletteAction[] {
  return [
    { id: "search", label: "Search the index", desc: "Search the knowledge index", icon: <Search className="w-4 h-4" />, keywords: "search find filter", action: opts.onFocusSearch },
    { id: "new", label: "New note", desc: "Open an empty note in the editor", icon: <Plus className="w-4 h-4" />, hotkey: "N", keywords: "neu knoten erstellen", action: opts.onNewNode },
    { id: "graph", label: "Open graph", desc: "Show the knowledge graph", icon: <Network className="w-4 h-4" />, keywords: "graph verbindungen kanten", action: opts.onGoGraph },
    { id: "memories", label: "All your notes", desc: "Show every note you have", icon: <Database className="w-4 h-4" />, keywords: "index overview", action: opts.onGoMemories },
    { id: "chat", label: "Open chat", desc: "Ask with context from the knowledge base", icon: <MessageSquare className="w-4 h-4" />, keywords: "chat ai assistant", action: opts.onGoChat },
    { id: "settings", label: "Switch system or provider", desc: "Choose an AI provider and model", icon: <SettingsIcon className="w-4 h-4" />, keywords: "settings provider model", action: opts.onGoSettings },
    { id: "import", label: "Import a file", desc: "PDF / MD / TXT / JSON via a dialog", icon: <FileUp className="w-4 h-4" />, keywords: "import file upload drag drop", action: opts.onImportFileClick },
    { id: "url", label: "Import a URL", desc: "Focus the URL clipper", icon: <Globe className="w-4 h-4" />, keywords: "url clipper web import", action: opts.onFocusUrl },
    { id: "extract", label: "Extract the key point", desc: "Note: available in chat once an answer exists", icon: <Sparkles className="w-4 h-4" />, keywords: "kernaussage ki extraktion", action: () => { opts.onGoChat(); } },
    // P202: der Weg zur Ersteinrichtung — der Fuß trägt die zwei Mockup-Ikons,
    // die Palette hält den Setup-Weg offen.
    ...(opts.onOpenSetup ? [{ id: "setup", label: "Set up K3PTA", desc: "Open the first-run assistant", icon: <Sparkles className="w-4 h-4" />, keywords: "einrichtung wizard setup", action: opts.onOpenSetup }] : []),
  ];
}
