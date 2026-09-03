import { useEffect, useRef, useState, useMemo } from "react";
import { Search, Plus, Database, MessageSquare, SettingsIcon, Network, Sparkles, Globe, FileUp } from "../lib/icons";

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
}

export function CommandPalette({ open, onClose, actions }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return actions;
    const q = query.toLowerCase();
    return actions.filter((a) => a.label.toLowerCase().includes(q) || (a.desc && a.desc.toLowerCase().includes(q)) || (a.keywords && a.keywords.toLowerCase().includes(q)));
  }, [actions, query]);

  useEffect(() => { setIdx(0); }, [query, actions]);

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
      if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(filtered.length - 1, i + 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = filtered[idx];
        if (item) { onClose(); item.action(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, idx, onClose]);

  useEffect(() => {
    // keep selected visible
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${idx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[20vh] px-4">
      <div className="absolute inset-0 hud-backdrop" onClick={onClose} />
      <div className="relative w-full max-w-xl glass-strong rounded-2xl overflow-hidden flex flex-col" style={{ maxHeight: "min(64vh, 520px)" }}>
        <div className="flex items-center gap-3 px-4 h-14 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <Search className="w-4 h-4 shrink-0" style={{ color: "var(--text-3)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Command or search… (e.g. graph, new node, settings)"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-[var(--text-3)]"
            style={{ color: "var(--text-1)" }}
          />
          <span className="hud-label hidden sm:inline-flex items-center gap-1 hud-inset px-2 py-1 rounded-md"><span className="kbd !px-1 !py-0">⌘</span>K</span>
        </div>

        <div ref={listRef} className="overflow-y-auto flex-1 p-2 space-y-1">
          {filtered.length === 0 && (
            <div className="py-10 text-center text-sm" style={{ color: "var(--text-2)" }}>No matches for “{query}”</div>
          )}
          {filtered.map((a, i) => (
            <button
              key={a.id}
              data-idx={i}
              onMouseEnter={() => setIdx(i)}
              onClick={() => { onClose(); a.action(); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${i === idx ? "hud-inset" : "hover:bg-[var(--bg-inset)]"}`}
              style={{ color: i === idx ? "var(--text-1)" : "var(--text-2)" }}
            >
              <span className="w-8 h-8 rounded-lg hud-inset flex items-center justify-center shrink-0" style={{ color: i === idx ? "var(--accent)" : "var(--text-2)" }}>{a.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium truncate">{a.label}</span>
                {a.desc && <span className="block text-xs truncate" style={{ color: "var(--text-3)" }}>{a.desc}</span>}
              </span>
              {a.hotkey && <span className="hud-label hidden sm:block hud-inset px-1.5 py-1 rounded-md">{a.hotkey}</span>}
            </button>
          ))}
        </div>

        <div className="px-3 py-2 flex items-center gap-3 hud-label shrink-0" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <span className="flex items-center gap-1"><span className="hud-inset px-1 py-0.5 rounded text-[10px]">↑↓</span> Navigate</span>
          <span className="flex items-center gap-1"><span className="hud-inset px-1 py-0.5 rounded text-[10px]">↵</span> Open</span>
          <span className="flex items-center gap-1"><span className="hud-inset px-1 py-0.5 rounded text-[10px]">ESC</span> Close</span>
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
}): PaletteAction[] {
  return [
    { id: "search", label: "Search the index", desc: "Search the knowledge index", icon: <Search className="w-4 h-4" />, keywords: "search find filter", action: opts.onFocusSearch },
    { id: "new", label: "New node", desc: "Open an empty node in the editor", icon: <Plus className="w-4 h-4" />, hotkey: "N", keywords: "neu knoten erstellen", action: opts.onNewNode },
    { id: "graph", label: "Open graph", desc: "Show the knowledge graph", icon: <Network className="w-4 h-4" />, keywords: "graph verbindungen kanten", action: opts.onGoGraph },
    { id: "memories", label: "To the knowledge index", desc: "Show every node", icon: <Database className="w-4 h-4" />, keywords: "index overview", action: opts.onGoMemories },
    { id: "chat", label: "Open chat", desc: "Ask with context from the knowledge base", icon: <MessageSquare className="w-4 h-4" />, keywords: "chat ai assistant", action: opts.onGoChat },
    { id: "settings", label: "Switch system or provider", desc: "Choose an AI provider and model", icon: <SettingsIcon className="w-4 h-4" />, keywords: "settings provider model", action: opts.onGoSettings },
    { id: "import", label: "Import a file", desc: "PDF / MD / TXT / JSON via a dialog", icon: <FileUp className="w-4 h-4" />, keywords: "import file upload drag drop", action: opts.onImportFileClick },
    { id: "url", label: "Import a URL", desc: "Focus the URL clipper", icon: <Globe className="w-4 h-4" />, keywords: "url clipper web import", action: opts.onFocusUrl },
    { id: "extract", label: "Extract the key point", desc: "Note: available in chat once an answer exists", icon: <Sparkles className="w-4 h-4" />, keywords: "kernaussage ki extraktion", action: () => { opts.onGoChat(); } },
  ];
}
