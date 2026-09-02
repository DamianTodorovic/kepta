import { useEffect, useRef, useState, useMemo } from "react";
import { Search, Plus, Database, MessageSquare, Settings as SettingsIcon, Network, Command, Sparkles, Globe, FileUp } from "lucide-react";

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
            placeholder="Befehl oder Suche… (z.B. Graph, Neuer Knoten, Einstellungen)"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-[var(--text-3)]"
            style={{ color: "var(--text-1)" }}
          />
          <span className="hud-label hidden sm:inline-flex items-center gap-1 hud-inset px-2 py-1 rounded-md"><Command className="w-3 h-3" />K</span>
        </div>

        <div ref={listRef} className="overflow-y-auto flex-1 p-2 space-y-1">
          {filtered.length === 0 && (
            <div className="py-10 text-center text-sm" style={{ color: "var(--text-2)" }}>Keine Treffer für „{query}“</div>
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
          <span className="flex items-center gap-1"><span className="hud-inset px-1 py-0.5 rounded text-[10px]">↑↓</span> Navigieren</span>
          <span className="flex items-center gap-1"><span className="hud-inset px-1 py-0.5 rounded text-[10px]">↵</span> Öffnen</span>
          <span className="flex items-center gap-1"><span className="hud-inset px-1 py-0.5 rounded text-[10px]">ESC</span> Schließen</span>
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
    { id: "search", label: "Suche im Index", desc: "Wissens-Index durchsuchen", icon: <Search className="w-4 h-4" />, keywords: "suche finden filter", action: opts.onFocusSearch },
    { id: "new", label: "Neuer Knoten", desc: "Leeren Knoten im Editor öffnen", icon: <Plus className="w-4 h-4" />, hotkey: "N", keywords: "neu knoten erstellen", action: opts.onNewNode },
    { id: "graph", label: "Graph öffnen", desc: "Wissens-Graph anzeigen", icon: <Network className="w-4 h-4" />, keywords: "graph verbindungen kanten", action: opts.onGoGraph },
    { id: "memories", label: "Zum Wissens-Index", desc: "Alle Knoten anzeigen", icon: <Database className="w-4 h-4" />, keywords: "index übersicht", action: opts.onGoMemories },
    { id: "chat", label: "Chat öffnen", desc: "Fragen mit Kontext aus der Wissensbasis", icon: <MessageSquare className="w-4 h-4" />, keywords: "chat ai assistant", action: opts.onGoChat },
    { id: "settings", label: "System / Provider wechseln", desc: "KI-Anbieter und Modell wählen", icon: <SettingsIcon className="w-4 h-4" />, keywords: "einstellungen provider modell", action: opts.onGoSettings },
    { id: "import", label: "Datei importieren", desc: "PDF / MD / TXT / JSON per Dialog", icon: <FileUp className="w-4 h-4" />, keywords: "import datei upload drag drop", action: opts.onImportFileClick },
    { id: "url", label: "URL importieren", desc: "Fokus auf URL-Clipper setzen", icon: <Globe className="w-4 h-4" />, keywords: "url clipper web import", action: opts.onFocusUrl },
    { id: "extract", label: "Kernaussage extrahieren", desc: "Hinweis: im Chat bei einer Antwort verfügbar", icon: <Sparkles className="w-4 h-4" />, keywords: "kernaussage ki extraktion", action: () => { opts.onGoChat(); } },
  ];
}
