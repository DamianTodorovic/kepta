import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Sidebar } from './Sidebar';
import { MemoryCard } from './MemoryCard';
import { MemoryEditor } from './MemoryEditor';
import { Chat } from './Chat';
import { Settings } from './Settings';
import { KnowledgeGraph } from './KnowledgeGraph';
import { CommandPalette, useCommandPaletteHotkey, buildPaletteActions } from './CommandPalette';
import { saveMemory, deleteMemory, subscribeMemories, refreshMemories } from '../lib/store';
import { subscribeActivity } from '../lib/activity';
import { useToast } from './ui/Toast';
import { hybridSearch, type ScoredMemory } from '../lib/semantic';
import { OnboardingWizard } from './OnboardingWizard';
import { loadProfile } from '../lib/profile';
import { Memory } from '../types';
import { Search, Plus, Database, CheckCircle2, Copy, PanelLeftOpen, ScanSearch, UploadCloud, FileText, Globe, Loader2, Link2, AlertCircle, Sparkles, SlidersHorizontal, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

type ViewKey = 'memories' | 'chat' | 'settings' | 'graph';

function chunkText(text: string, size = 2000): string[] {
  if (text.length <= size) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + size;
    if (end < text.length) {
      const slice = text.slice(start, end);
      const lastBreak = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf(". "), slice.lastIndexOf("\n"));
      if (lastBreak > size * 0.55) end = start + lastBreak + 1;
    }
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  return chunks.filter(Boolean);
}

async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") {
    const buf = await file.arrayBuffer();
    const raw = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(buf));
    const hexParts: string[] = [];
    const hexRe = /<([0-9A-Fa-f\s]+)>/g;
    let hm: RegExpExecArray | null;
    while ((hm = hexRe.exec(raw)) !== null) {
      const hex = hm[1].replace(/\s/g, "");
      if (hex.length < 6 || hex.length % 2 !== 0) continue;
      try {
        const bytes = new Uint8Array(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
        const dec = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
        if (/[\p{L}\p{N}]{3,}/u.test(dec)) hexParts.push(dec);
      } catch { /* ignore */ }
    }
    const parenParts: string[] = [];
    const parenRe = /\(([^()]{2,}?)\)/g;
    let pm: RegExpExecArray | null;
    while ((pm = parenRe.exec(raw)) !== null) {
      let s = pm[1]
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\n")
        .replace(/\\\(/g, "(")
        .replace(/\\\)/g, ")")
        .replace(/\\\\/g, "\\");
      if (s.length < 3) continue;
      if (/^[\x00-\x1F]+$/.test(s)) continue;
      if (!/[\p{L}\p{N}]/u.test(s)) continue;
      parenParts.push(s);
    }
    const candidate = [...parenParts, ...hexParts].join("\n").trim();
    if (candidate.replace(/\s/g, "").length > 120) {
      return candidate.replace(/(\S)\n(\S)/g, "$1 $2").replace(/\s+/g, " ").replace(/\n{3,}/g, "\n\n").slice(0, 60000);
    }
    const filtered = raw.replace(/[^\x09\x0A\x0D\x20-\x7EÄÖÜäöüß\p{L}\p{N}\p{P}\p{Z}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60000);
    return filtered || `[PDF: ${file.name} – kein extrahierbarer Text, Rohgröße ${file.size} Bytes]`;
  }
  return await file.text();
}

export function Dashboard() {
  const toast = useToast();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [currentView, setCurrentView] = useState<ViewKey>('memories');
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);

  // Papierkorb
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashedMemories, setTrashedMemories] = useState<Memory[]>([]);
  const [trashCount, setTrashCount] = useState(0);
  useEffect(() => {
    if (!trashOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/memories?trash=1');
        const data = await res.json();
        if (!cancelled && Array.isArray(data.memories)) setTrashedMemories(data.memories as Memory[]);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [trashOpen]);

  // Erstes Laden: Skeletons statt leerem Grid
  const [initialLoaded, setInitialLoaded] = useState(false);
  useEffect(() => {
    void refreshMemories().finally(() => setInitialLoaded(true));
  }, []);

  // Tastenkürzel: ⌘N = neuer Knoten, ? = Shortcuts-Sheet
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n' && !typing) {
        e.preventDefault();
        setEditingMemory(null);
        setIsEditorOpen(true);
      } else if (e.key === '?' && !typing) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setShortcutsOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Semantische Suche: Toggle + Top-k
  const [semanticEnabled, setSemanticEnabled] = useState<boolean>(() => {
    try { const v = localStorage.getItem('ki_gehirn_semantic'); return v === null ? true : v !== 'false'; } catch { return true; }
  });
  const [topK, setTopK] = useState<number>(() => {
    try { const v = parseInt(localStorage.getItem('ki_gehirn_topK') || '5', 10); return Number.isFinite(v) ? Math.min(20, Math.max(1, v)) : 5; } catch { return 5; }
  });
  useEffect(() => { try { localStorage.setItem('ki_gehirn_semantic', String(semanticEnabled)); } catch { /* ignore */ } }, [semanticEnabled]);
  useEffect(() => { try { localStorage.setItem('ki_gehirn_topK', String(topK)); } catch { /* ignore */ } }, [topK]);

  // 180ms Debounce für Suche — vermeidet hybridSearch bei jedem Keystroke
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearchQuery(searchQuery), 180);
    return () => clearTimeout(id);
  }, [searchQuery]);

  // Importer State
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);

  // URL-Clipper State
  const [clipUrl, setClipUrl] = useState("");
  const [clipping, setClipping] = useState(false);
  const [clipErr, setClipErr] = useState<string | null>(null);
  const [clipOk, setClipOk] = useState<string | null>(null);

  // Inbox Auto-Import — Gehirn liest immer mit (File-Watcher)
  const [inbox, setInbox] = useState<{ inboxDir?: string; files: string[]; archivCount: number; watching: boolean } | null>(null);
  const [inboxScanBusy, setInboxScanBusy] = useState(false);
  const refreshInbox = useCallback(async ()=>{
    try { const r = await fetch('/api/inbox/status'); if(r.ok) setInbox(await r.json()); } catch {}
  }, []);
  useEffect(()=>{ refreshInbox(); const id=setInterval(refreshInbox, 12000); return ()=> clearInterval(id); }, [refreshInbox]);
  const handleInboxScan = async ()=>{
    setInboxScanBusy(true);
    try {
      const r = await fetch('/api/inbox/scan', {method:'POST'});
      const d = await r.json();
      setImportMsg(`Inbox: ${d.scanned} Dateien gescannt, ${d.imported} Knoten importiert`);
      setTimeout(()=> setImportMsg(null), 3000);
      refreshInbox();
    } catch { setImportErr('Inbox-Scan fehlgeschlagen'); setTimeout(()=> setImportErr(null), 2500); }
    finally { setInboxScanBusy(false); }
  };

  // Self-Expansion: Duplikat-Erkennung (Titel/Content-Ähnlichkeit)
  const duplicatePairs = useMemo(()=>{
    if (memories.length < 2) return [] as {a:Memory,b:Memory,reason:string}[];
    const out:{a:Memory,b:Memory,reason:string}[]=[];
    const norm = (s:string)=> s.toLowerCase().trim();
    const seen = new Set<string>();
    for(let i=0;i<memories.length;i++){
      for(let j=i+1;j<memories.length;j++){
        const a=memories[i], b=memories[j];
        const key = `${a.id}|${b.id}`;
        if(seen.has(key)) continue;
        const ta=norm(a.title), tb=norm(b.title);
        if(ta && ta===tb){ out.push({a,b,reason:'Gleicher Titel'}); seen.add(key); continue; }
        const ca=a.content.slice(0,160).toLowerCase(), cb=b.content.slice(0,160).toLowerCase();
        if(ca && ca===cb && a.content.length>30){ out.push({a,b,reason:'Gleicher Inhalt (Prefix)'}); seen.add(key); continue; }
        // Jaccard auf Worten für nahe Duplikate
        if (a.content.length>80 && b.content.length>80){
          const wa=new Set(ca.split(/\s+/).filter(Boolean)), wb=new Set(cb.split(/\s+/).filter(Boolean));
          let inter=0; for(const w of wa) if(wb.has(w)) inter++;
          const uni = wa.size+wb.size - inter;
          const jacc = uni? inter/uni : 0;
          if(jacc>0.82){ out.push({a,b,reason:`Sehr ähnlich (${Math.round(jacc*100)}% Wort-Overlap)`}); seen.add(key); }
        }
      }
      if(out.length>=8) break;
    }
    return out;
  }, [memories]);

  // palette
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const clipInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Windowing / Virtualisierung: nur 48 Karten initial, Rest per "Mehr laden" + IntersectionObserver
  const PAGE_SIZE = 48;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = subscribeMemories(setMemories);
    return unsubscribe;
  }, []);

  // Adaptiver Wizard: öffne automatisch beim ersten Start (kein Profil oder 0 Knoten und noch nicht abgeschlossen)
  useEffect(() => {
    try {
      const p = loadProfile();
      if (!p || !p.hasCompletedOnboarding) {
        // nur auto-öffnen wenn wirklich leer oder kein Profil
        if (memories.length === 0) {
          const timer = setTimeout(()=> setWizardOpen(true), 600);
          return ()=> clearTimeout(timer);
        }
        // Profil fehlt aber Knoten vorhanden -> trotzdem nach 2s anbieten
        if (!p) {
          const timer = setTimeout(()=> setWizardOpen(true), 2500);
          return ()=> clearTimeout(timer);
        }
      }
    } catch {}
  }, [memories.length]);

  useCommandPaletteHotkey(() => setPaletteOpen(true));

  // --- Activity-Stream: das Gehirn lebt — Agent-Aktionen live sehen ---
  const [brainPulse, setBrainPulse] = useState(0);
  const [agentActive, setAgentActive] = useState(false);
  const agentIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return subscribeActivity((evt) => {
      setBrainPulse((p) => p + 1);
      // Liste live aktualisieren, wenn sich der Speicher ändert (auch via MCP!)
      if (evt.type === 'save' || evt.type === 'update' || evt.type === 'delete' || evt.type === 'consolidate') {
        void refreshMemories();
      }
      if (evt.source === 'agent') {
        setAgentActive(true);
        if (agentIdleTimer.current) clearTimeout(agentIdleTimer.current);
        agentIdleTimer.current = setTimeout(() => setAgentActive(false), 9000);
        const t = evt.type === 'save' ? `Agent hat einen Knoten gespeichert${evt.title ? `: ${evt.title.slice(0, 48)}` : ''}`
          : evt.type === 'update' ? 'Agent hat einen Knoten aktualisiert'
          : evt.type === 'delete' ? 'Agent hat einen Knoten entfernt'
          : evt.type === 'consolidate' ? 'Agent konsolidiert das Gedächtnis'
          : null;
        if (t) toast.push({ message: t, kind: 'info' });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allTags = Array.from(new Set(memories.flatMap(m => m.tags))).sort() as string[];

  // --- Tag-gefilterte Basis ---
  const tagFiltered = useMemo(() => {
    if (selectedTags.length === 0) return memories;
    return memories.filter(m => selectedTags.every(t => m.tags.includes(t)));
  }, [memories, selectedTags]);

  // --- Semantisches Ranking (hybridSearch) — instant lokal, überholt von der Server-Engine ---
  const scoredResults: ScoredMemory[] | null = useMemo(() => {
    if (!semanticEnabled) return null;
    const q = debouncedSearchQuery.trim();
    if (!q || q.length < 2) return null;
    try {
      const res = hybridSearch(tagFiltered, q, topK, { ngram: 1 });
      return res;
    } catch {
      return null;
    }
  }, [tagFiltered, debouncedSearchQuery, semanticEnabled, topK]);

  // --- Server-Engine (BM25 + Vektoren + Graph → RRF) lädt asynchron nach ---
  const [serverScored, setServerScored] = useState<ScoredMemory[] | null>(null);
  useEffect(() => {
    const q = debouncedSearchQuery.trim();
    if (!semanticEnabled || q.length < 2) {
      setServerScored(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, topK: Math.max(topK, 20), tags: selectedTags.length > 0 ? selectedTags : undefined }),
        });
        const data = await res.json();
        if (!cancelled) setServerScored(Array.isArray(data.results) ? (data.results as ScoredMemory[]) : []);
      } catch {
        if (!cancelled) setServerScored(null); // Server unerreichbar → lokales Ranking bleibt
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchQuery, semanticEnabled, topK, JSON.stringify(selectedTags)]);
  const effectiveScored = serverScored ?? scoredResults;

  // --- Angezeigte Karten ---
  const { displayedMemories, scoredForDisplay } = useMemo(() => {
    // Semantik aktiv + Query vorhanden -> zeige gerankte Top-k (Server-Engine, Fallback lokal)
    if (semanticEnabled && effectiveScored !== null) {
      const q = debouncedSearchQuery.trim();
      if (q.length >= 2) {
        if (effectiveScored.length > 0) {
          return { displayedMemories: effectiveScored.map(r => r.memory), scoredForDisplay: effectiveScored };
        }
        return { displayedMemories: [] as Memory[], scoredForDisplay: [] as ScoredMemory[] };
      }
    }
    // Kein semantisches Ranking -> klassischer Keyword-Filter oder nur Tag-Filter
    const q = debouncedSearchQuery.trim().toLowerCase();
    if (q) {
      const filtered = tagFiltered.filter(m => m.title.toLowerCase().includes(q) || m.content.toLowerCase().includes(q) || m.tags.some(t => t.toLowerCase().includes(q)));
      return { displayedMemories: filtered, scoredForDisplay: null as ScoredMemory[] | null };
    }
    return { displayedMemories: tagFiltered, scoredForDisplay: null as ScoredMemory[] | null };
  }, [tagFiltered, effectiveScored, semanticEnabled, debouncedSearchQuery]);

  // --- Automatisches Retrieval für Chat: Top-k relevante Knoten statt alle gefilterten ---
  const chatMemories: Memory[] = useMemo(() => {
    if (semanticEnabled) {
      const q = debouncedSearchQuery.trim();
      if (q.length >= 2) {
        if (effectiveScored && effectiveScored.length > 0) return effectiveScored.slice(0, topK).map(r => r.memory);
        // Query vorhanden aber keine Treffer -> leerer Kontext (verhindert Halluzination mit irrelevanten Knoten)
        if (effectiveScored && effectiveScored.length === 0) return [];
      }
      // Keine Query -> neueste Top-k als Kontext (statt alle Knoten = Token-Sparmaßnahme)
      return [...tagFiltered].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, topK);
    }
    // Semantik aus: altes Verhalten – alle gefilterten in den Kontext
    const q = debouncedSearchQuery.trim().toLowerCase();
    if (q) return tagFiltered.filter(m => m.title.toLowerCase().includes(q) || m.content.toLowerCase().includes(q));
    return tagFiltered;
  }, [effectiveScored, semanticEnabled, topK, tagFiltered, debouncedSearchQuery]);

  const handleSave = async (memoryData: Partial<Memory>) => {
    if (editingMemory?.id) {
      saveMemory({ ...memoryData, id: editingMemory.id });
    } else {
      saveMemory(memoryData);
    }
    setIsEditorOpen(false);
    setEditingMemory(null);
  };

  const handleDelete = async (id: string) => {
    if (!id) return;
    const victim = memories.find(m => m.id === id);
    void deleteMemory(id);
    if (editingMemory?.id === id) {
      setIsEditorOpen(false);
      setEditingMemory(null);
    }
    toast.push({
      message: `„${(victim?.title || 'Knoten').slice(0, 40)}“ in den Papierkorb verschoben`,
      kind: 'info',
      action: {
        label: 'Rückgängig',
        onClick: async () => {
          try {
            await fetch(`/api/memories/${encodeURIComponent(id)}/restore`, { method: 'POST' });
            void refreshMemories();
            toast.push({ message: 'Wiederhergestellt', kind: 'success' });
          } catch {
            toast.push({ message: 'Wiederherstellen fehlgeschlagen', kind: 'warn' });
          }
        },
      },
    });
  };

  const copyContextForAI = () => {
    const contextText = chatMemories.map(m => (
      `--- ${m.title} ---\\n${m.content}\\n`
    )).join('\\n');
    const prompt = `[CONTEXT]\\n${contextText}\\n[/CONTEXT]\\n\\nBitte nutze diesen Kontext für die Beantwortung meiner Fragen.`;
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveToBrain = (content: string) => {
    setEditingMemory({
      id: '',
      userId: 'local',
      title: 'Neuer Assistant-Knoten',
      content: content,
      tags: ['ai-log'],
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    setIsEditorOpen(true);
  };

  const handleSaveToBrainWithMeta = useCallback((payload: { title: string; content: string; tags: string[] }) => {
    setEditingMemory({
      id: '',
      userId: 'local',
      title: payload.title || 'Kernaussage',
      content: payload.content,
      tags: payload.tags.length ? payload.tags : ['ai-log'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setIsEditorOpen(true);
  }, []);

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => /\.(pdf|md|txt|json)$/i.test(f.name) || f.type.startsWith("text/") || f.type === "application/json" || f.type === "application/pdf");
    if (list.length === 0) {
      setImportErr("Keine unterstützten Dateien (PDF, MD, TXT, JSON).");
      setTimeout(() => setImportErr(null), 3000);
      return;
    }
    setImporting(true);
    setImportErr(null);
    setImportMsg(null);
    let totalNodes = 0;
    try {
      for (const file of list) {
        const baseName = file.name.replace(/\.[^.]+$/, "");
        const text = await extractTextFromFile(file);
        const chunks = chunkText(text, 2000);
        for (let i = 0; i < chunks.length; i++) {
          const title = chunks.length === 1 ? baseName : `${baseName} — Teil ${i + 1}/${chunks.length}`;
          const tags = ["import", file.name.split(".").pop()?.toLowerCase() || "file"];
          if (file.name.toLowerCase().endsWith(".pdf")) tags.push("pdf");
          await saveMemory({ title, content: chunks[i], tags });
          totalNodes++;
        }
      }
      setImportMsg(`${totalNodes} Knoten aus ${list.length} Datei(en) importiert.`);
      setTimeout(() => setImportMsg(null), 3500);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setImportErr(msg || "Import fehlgeschlagen");
      setTimeout(() => setImportErr(null), 3500);
    } finally {
      setImporting(false);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const handleClip = useCallback(async () => {
    const url = clipUrl.trim();
    if (!url) return;
    setClipping(true);
    setClipErr(null);
    setClipOk(null);
    try {
      const res = await fetch("/api/clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Clip fehlgeschlagen");
      const title: string = data.title || new URL(url).hostname;
      const content: string = data.content || "";
      const tags = ["clip", new URL(url).hostname.replace(/^www\./, "")];
      await saveMemory({ title, content: `Quelle: ${data.url || url}\\n\\n${content}`, tags });
      setClipOk(`„${title.slice(0, 48)}“ importiert`);
      setClipUrl("");
      setTimeout(() => setClipOk(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setClipErr(msg);
      setTimeout(() => setClipErr(null), 4000);
    } finally {
      setClipping(false);
    }
  }, [clipUrl]);

  const paletteActions = buildPaletteActions({
    onNewNode: () => { setEditingMemory(null); setIsEditorOpen(true); },
    onFocusSearch: () => { setCurrentView("memories"); setTimeout(() => searchInputRef.current?.focus(), 50); },
    onGoMemories: () => setCurrentView("memories"),
    onGoChat: () => setCurrentView("chat"),
    onGoSettings: () => setCurrentView("settings"),
    onGoGraph: () => setCurrentView("graph"),
    onImportFileClick: () => fileInputRef.current?.click(),
    onFocusUrl: () => { setCurrentView("memories"); setTimeout(() => clipInputRef.current?.focus(), 60); },
  });

  const scoredMap = useMemo(() => {
    if (!scoredForDisplay) return new Map<string, ScoredMemory>();
    return new Map(scoredForDisplay.map(r => [r.memory.id, r]));
  }, [scoredForDisplay]);

  // Pagination / Windowing: nur erste 48 Karten, Rest per "Mehr laden" + IntersectionObserver
  const paginatedMemories = useMemo(() => displayedMemories.slice(0, visibleCount), [displayedMemories, visibleCount]);

  // Reset Paginierung bei Filter-/Suche-Wechsel
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [debouncedSearchQuery, selectedTags, semanticEnabled, topK]);

  // IntersectionObserver: automatisches Nachladen beim Scrollen (400px Vorlauf)
  useEffect(() => {
    if (visibleCount >= displayedMemories.length) return;
    const el = loadMoreRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((c) => Math.min(c + PAGE_SIZE, displayedMemories.length));
        }
      },
      { rootMargin: "400px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visibleCount, displayedMemories.length]);

  return (
    <div className="flex h-full overflow-hidden text-zinc-900 dark:text-zinc-100">
      <Sidebar
        tags={allTags}
        selectedTags={selectedTags}
        onSelectTag={(tag) => {
          setSelectedTags(prev =>
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
          );
        }}
        onClearTags={() => setSelectedTags([])}
        currentView={currentView}
        onNavigate={setCurrentView}
        totalMemories={memories.length}
        isFocusMode={isFocusMode}
        toggleFocusMode={() => setIsFocusMode(!isFocusMode)}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden my-2 mr-2 hud-panel rounded-2xl">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={cn("flex-1 flex flex-col h-full", currentView === 'memories' ? 'flex' : 'hidden')}
        >
          <header className="h-16 px-6 flex items-center justify-between shrink-0 gap-4 border-gradient-b">
            {isFocusMode && (
              <button
                onClick={() => setIsFocusMode(false)}
                className="btn-ghost p-2 rounded-lg"
              >
                <PanelLeftOpen className="w-5 h-5" />
              </button>
            )}
            <div className="flex-1 max-w-xl relative group">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 transition-colors" style={{ color: 'var(--text-3)' }} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={semanticEnabled ? "Semantisch suchen... (TF-IDF · BM25 · Cosine) — ⌘K" : "Wissens-Index durchsuchen... (⌘K)"}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen(true); } }}
                className="hud-input w-full pl-9 pr-4 py-2.5 rounded-lg text-sm"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={async () => {
                  setTrashOpen((v) => !v);
                  try {
                    const res = await fetch('/api/storage-info');
                    const data = await res.json();
                    setTrashCount(typeof data.trashed === 'number' ? data.trashed : 0);
                  } catch { /* ignore */ }
                }}
                className="btn-ghost hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
                title="Papierkorb"
              >
                <Trash2 className="w-4 h-4" /> {trashCount > 0 ? `Papierkorb (${trashCount})` : 'Papierkorb'}
              </button>
              <button
                onClick={() => setPaletteOpen(true)}
                className="btn-ghost hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
                title="Command Palette (⌘K)"
              >
                <ScanSearch className="w-4 h-4" /> ⌘K
              </button>
              <button
                onClick={copyContextForAI}
                className="btn-ghost flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm"
                title={`${chatMemories.length} Knoten im Retrieval-Kontext`}
              >
                {copied ? <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--ok)' }} /> : <Copy className="w-4 h-4" />}
                <span className="hidden sm:inline">{copied ? 'Kontext kopiert' : `Kontext (${chatMemories.length})`}</span>
              </button>
              <button
                onClick={() => {
                  setEditingMemory(null);
                  setIsEditorOpen(true);
                }}
                className="btn-primary flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium text-sm"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Neuer Knoten</span>
              </button>
            </div>
          </header>

          {/* Papierkorb-Leiste */}
          {trashOpen && (
            <div className="px-6 py-3 shrink-0 overflow-auto" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-inset)', maxHeight: '30vh' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium tracking-wide" style={{ color: 'var(--text-3)' }}>
                  PAPIERKORB ({trashedMemories.length}) — gelöschte Knoten bleiben wiederherstellbar
                </span>
                <button onClick={() => setTrashOpen(false)} className="btn-ghost px-2 py-1 rounded text-xs">Schließen</button>
              </div>
              {trashedMemories.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>Leer — keine gelöschten Knoten.</p>
              ) : (
                <ul className="space-y-1.5">
                  {trashedMemories.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate" style={{ color: 'var(--text-2)' }}>{m.title || 'Ohne Titel'}</span>
                      <button
                        onClick={async () => {
                          try {
                            await fetch(`/api/memories/${encodeURIComponent(m.id)}/restore`, { method: 'POST' });
                            setTrashedMemories((prev) => prev.filter((x) => x.id !== m.id));
                            void refreshMemories();
                          } catch { /* ignore */ }
                        }}
                        className="btn-ghost px-2 py-1 rounded text-xs shrink-0"
                      >
                        Wiederherstellen
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Semantik-Steuerung: Toggle + Top-k Regler */}
          <div className="px-6 py-3 flex flex-wrap items-center gap-4 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <label className="flex items-center gap-2 cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={semanticEnabled}
                onChange={(e) => setSemanticEnabled(e.target.checked)}
                className="sr-only"
              />
              <span className={cn("relative inline-flex h-6 w-11 items-center rounded-full transition-colors border", semanticEnabled ? "border-transparent" : "border-[var(--border-subtle)]")} style={{ background: semanticEnabled ? 'var(--accent)' : 'var(--bg-inset)' }}>
                <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform", semanticEnabled ? "translate-x-6" : "translate-x-1")} />
              </span>
              <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: semanticEnabled ? 'var(--text-1)' : 'var(--text-2)' }}>
                <Sparkles className="w-4 h-4" style={{ color: semanticEnabled ? 'var(--accent)' : 'var(--text-3)' }} />
                Semantik
                <span className="hidden sm:inline hud-label !text-[10px] px-1.5 py-0.5 rounded" style={{ background: semanticEnabled ? 'var(--accent-soft)' : 'var(--bg-inset)', color: semanticEnabled ? 'var(--accent)' : 'var(--text-3)', border: '1px solid var(--border-subtle)' }}>
                  {semanticEnabled ? 'Intelligente Suche' : 'Keyword'}
                </span>
              </span>
            </label>

            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-2)' }}>
                <SlidersHorizontal className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
                Top-k
              </span>
              <input
                type="range"
                min={1}
                max={20}
                value={topK}
                onChange={(e) => setTopK(parseInt(e.target.value, 10))}
                className="w-28 accent-[var(--accent)]"
                title="Anzahl Knoten für Anzeige & Chat-Retrieval"
              />
              <span className="px-2 py-1 rounded-lg text-sm font-semibold hud-inset min-w-[2.2rem] text-center" style={{ color: 'var(--accent)' }}>{topK}</span>
              <span className="hidden lg:inline text-xs" style={{ color: 'var(--text-3)' }}>für Anzeige & Chat-Retrieval</span>
            </div>

            {semanticEnabled && debouncedSearchQuery.trim().length >= 2 && (
              <div className="ml-auto flex items-center gap-2 text-xs">
                {scoredResults && scoredResults.length > 0 ? (
                  <>
                    <span className="hud-label hidden sm:inline-flex items-center gap-1.5" style={{ color: 'var(--text-2)' }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: 'var(--ok)' }} />
                      {scoredResults.length} Treffer
                      <span style={{ color: 'var(--text-3)' }}>·</span>
                      Best: {Math.round(scoredResults[0].score * 100)}%
                    </span>
                    <span className="text-[11px] px-2 py-1 rounded-full hud-inset" style={{ color: 'var(--text-2)' }}>
                      BM25 {Math.round(scoredResults[0].bm25Score * 100)}% · Cosine {Math.round(scoredResults[0].cosineScore * 100)}%
                    </span>
                  </>
                ) : scoredResults && scoredResults.length === 0 ? (
                  <span className="hud-label flex items-center gap-1.5" style={{ color: '#f87171' }}>
                    <AlertCircle className="w-3.5 h-3.5" /> Keine semantischen Treffer
                  </span>
                ) : null}
              </div>
            )}

            {!semanticEnabled && debouncedSearchQuery.trim() && (
              <div className="ml-auto text-xs hud-label" style={{ color: 'var(--text-3)' }}>
                Keyword-Filter: {displayedMemories.length} Treffer
              </div>
            )}
          </div>

          {/* Selbstlernend: Inbox-Watcher + Wissens-Verdichtung */}
          <div className="px-6 py-3 flex flex-wrap items-center gap-3 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-inset)' }}>
            <div className="flex items-center gap-2.5 text-xs flex-1 min-w-[220px]">
              <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: inbox?.watching ? 'var(--accent-soft)' : 'var(--bg-inset-strong)', border:'1px solid var(--border-subtle)' }}>
                <UploadCloud className="w-3.5 h-3.5" style={{ color: inbox?.watching ? 'var(--accent)' : 'var(--text-3)' }} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold" style={{color:'var(--text-1)'}}>Inbox</span>
                  <span className="hud-label !text-[10px] px-1.5 py-0 rounded border truncate max-w-[260px]" style={{borderColor:'var(--border-subtle)', color:'var(--text-3)', background:'var(--bg-inset-strong)'}} title={inbox?.inboxDir || ''}>{inbox?.inboxDir ? inbox.inboxDir.replace(/^.*\.(ki-gehirn|kepta)/,'~/.ki-gehirn') : '~/.kepta/inbox'}</span>
                  {inbox?.watching && <span className="w-1.5 h-1.5 rounded-full bg-[var(--ok)] animate-pulse" title="Watcher aktiv — Gehirn liest mit" />}
                </div>
                <div className="text-xs flex items-center gap-2 mt-0.5 flex-wrap" style={{color:'var(--text-3)'}}>
                  <span>{inbox ? `${inbox.files.length} Datei(en) · ${inbox.archivCount} archiviert` : 'lädt…'}</span>
                  {inbox && inbox.files.length>0 && <span className="truncate max-w-[180px]" style={{color:'var(--text-2)'}}>{inbox.files.slice(0,2).join(', ')}{inbox.files.length>2?` +${inbox.files.length-2}…`:''}</span>}
                </div>
              </div>
            </div>
            <button onClick={handleInboxScan} disabled={inboxScanBusy} className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shrink-0" title="Inbox jetzt scannen und importieren">
              {inboxScanBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanSearch className="w-3.5 h-3.5" />} Inbox scannen
            </button>
            <div className="hidden sm:block w-px h-8 self-center" style={{background:'var(--border-subtle)'}} />
            <div className="flex items-center gap-2 text-xs shrink-0">
              {duplicatePairs.length===0 ? (
                <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hud-inset" style={{color:'var(--ok)'}}><CheckCircle2 className="w-3.5 h-3.5" /> Wissensbasis sauber</span>
              ) : (
                <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{background:'rgba(251,191,36,.14)', border:'1px solid rgba(251,191,36,.28)', color:'#d97706'}}>
                  <AlertCircle className="w-3.5 h-3.5" /> {duplicatePairs.length} mögliche Duplikat{duplicatePairs.length>1?'e':''}
                  <span className="hidden xl:inline" style={{color:'var(--text-3)'}}>· {duplicatePairs[0].reason}</span>
                </span>
              )}
              {duplicatePairs.length>0 && (
                <button onClick={()=>{
                  const first = duplicatePairs[0];
                  if(first){ setEditingMemory(first.a); setIsEditorOpen(true); }
                }} className="btn-ghost px-2.5 py-1.5 rounded-lg text-xs hidden sm:inline-flex">Prüfen</button>
              )}
            </div>
          </div>

          {/* Import: Drag&Drop + URL-Clipper */}
          <div className="px-6 pt-4 pb-0 shrink-0">
            <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-3">
              {/* Drop-Zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={cn(
                  "group relative rounded-xl border-2 border-dashed p-4 flex items-center gap-4 transition-all",
                  dragOver ? "bg-[var(--accent-soft)] border-[var(--accent)]" : "hud-inset hover:border-[color-mix(in_srgb,var(--accent)_28%,transparent)]"
                )}
              >
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors", dragOver ? "btn-primary" : "hud-panel")}>
                  {importing ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: dragOver ? undefined : "var(--accent)" }} /> : <UploadCloud className="w-5 h-5" style={{ color: dragOver ? undefined : "var(--accent)" }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium" style={{ color: "var(--text-1)" }}>
                    {importing ? "Importiere…" : dragOver ? "Ablegen zum Importieren" : "Dateien hierher ziehen"}
                    <span className="hidden sm:inline font-normal" style={{ color: "var(--text-2)" }}> — PDF, MD, TXT, JSON · Chunking 2000 Zeichen</span>
                  </div>
                  <div className="text-xs flex items-center gap-2" style={{ color: "var(--text-3)" }}>
                    <FileText className="w-3 h-3" /> 1 Knoten pro 2000 Zeichen · Titel = Dateiname + Teil
                    {importMsg && <span className="inline-flex items-center gap-1 ml-2" style={{ color: "var(--ok)" }}><CheckCircle2 className="w-3 h-3" />{importMsg}</span>}
                    {importErr && <span className="inline-flex items-center gap-1 ml-2" style={{ color: "#f87171" }}><AlertCircle className="w-3 h-3" />{importErr}</span>}
                  </div>
                </div>
                <label className="btn-ghost px-3 py-2 rounded-lg text-sm font-medium cursor-pointer shrink-0">
                  Durchsuchen
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.md,.txt,.json,text/markdown,text/plain,application/json,application/pdf"
                    className="hidden"
                    onChange={(e) => { if (e.target.files?.length) processFiles(e.target.files); e.target.value = ""; }}
                  />
                </label>
              </div>

              {/* URL-Clipper */}
              <div className="hud-inset rounded-xl p-3 flex flex-col gap-2">
                <div className="flex items-center gap-2 hud-label">
                  <Globe className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} /> URL-Clipper
                  <span className="ml-auto hidden sm:inline-flex items-center gap-1 text-[10px] normal-case tracking-normal font-normal" style={{ color: "var(--text-3)" }}><Link2 className="w-3 h-3" /> POST /api/clip</span>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Link2 className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-3)" }} />
                    <input
                      ref={clipInputRef}
                      value={clipUrl}
                      onChange={(e) => setClipUrl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleClip(); }}
                      placeholder="https://example.com/artikel …"
                      className="hud-input w-full pl-8 pr-3 py-2.5 rounded-lg text-sm"
                    />
                  </div>
                  <button
                    onClick={handleClip}
                    disabled={clipping || !clipUrl.trim()}
                    className="btn-primary px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 shrink-0 disabled:opacity-40"
                  >
                    {clipping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                    <span className="hidden sm:inline">URL importieren</span>
                    <span className="sm:hidden">Import</span>
                  </button>
                </div>
                {(clipErr || clipOk) && (
                  <div className="text-xs flex items-center gap-1.5" style={{ color: clipErr ? "#f87171" : "var(--ok)" }}>
                    {clipErr ? <AlertCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                    {clipErr || clipOk}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-6xl mx-auto h-full flex flex-col">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <div className="flex items-center gap-2 hud-label">
                  <ScanSearch className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                  {semanticEnabled && debouncedSearchQuery.trim().length >= 2 ? (
                    <>Semantik // {String(displayedMemories.length).padStart(2, '0')} von {String(tagFiltered.length).padStart(2, '0')} Knoten · Top-{topK}</>
                  ) : (
                    <>Index // {String(displayedMemories.length).padStart(2, '0')} Knoten aktiv</>
                  )}
                </div>
                <div className="flex items-center gap-2 hud-label">
                  {agentActive ? (
                    <>
                      <span className="agent-dot" />
                      <span style={{ color: 'var(--accent)' }}>AGENT AKTIV</span>
                    </>
                  ) : (
                    <span className="status-dot" />
                  )}
                  {agentActive ? 'Gehirn synchronisiert sich' : semanticEnabled ? `Suche · ${chatMemories.length} im Retrieval` : 'Speicher synchron'}
                </div>
              </div>

              {displayedMemories.length === 0 && !initialLoaded ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="card p-5 h-56 flex flex-col gap-3">
                      <div className="skeleton h-3 w-16" />
                      <div className="skeleton h-5 w-4/5" />
                      <div className="skeleton h-3 w-full" />
                      <div className="skeleton h-3 w-full" />
                      <div className="skeleton h-3 w-2/3" />
                      <div className="mt-auto flex gap-2">
                        <div className="skeleton h-6 w-14 rounded-full" />
                        <div className="skeleton h-6 w-12 rounded-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : displayedMemories.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                  <div className="w-20 h-20 hud-inset rounded-2xl flex items-center justify-center mb-5 relative overflow-hidden">
                    <div className="absolute inset-0 opacity-60" style={{ transform: 'scale(0.55)' }}><BrainAnimationMini pulse={brainPulse} /></div>
                    <motion.div key={brainPulse} initial={{ scale: 1.15 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 12 }}>
                      <Database className="w-7 h-7 relative z-10" style={{ color: 'var(--accent)' }} />
                    </motion.div>
                  </div>
                  <h3 className="text-lg font-semibold mb-1.5" style={{ color: 'var(--text-1)' }}>Keine Knoten gefunden</h3>
                  <p className="text-sm max-w-sm mx-auto" style={{ color: 'var(--text-2)' }}>
                    {debouncedSearchQuery || selectedTags.length > 0
                      ? semanticEnabled && debouncedSearchQuery.trim().length >= 2
                        ? `Keine semantischen Treffer für „${debouncedSearchQuery.trim().slice(0, 48)}“. Versuche andere Begriffe, erhöhe Top-k oder deaktiviere Semantik für Keyword-Suche.`
                        : "Keine Einträge entsprechen den Suchkriterien."
                      : "Dein neuronaler Index ist leer. Ziehe eine Datei herein, clippe eine URL oder erstelle deinen ersten Wissensknoten."}
                  </p>
                  {semanticEnabled && debouncedSearchQuery.trim().length >= 2 && displayedMemories.length === 0 && (
                    <button onClick={() => setSemanticEnabled(false)} className="mt-4 btn-ghost px-4 py-2 rounded-xl text-sm font-medium">
                      Auf Keyword-Suche wechseln
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    <AnimatePresence>
                      {paginatedMemories.map(memory => {
                        const scored = scoredMap.get(memory.id);
                        return (
                          <MemoryCard
                            key={memory.id}
                            memory={memory}
                            score={scored?.score}
                            matchedTerms={scored?.matchedTerms}
                            onClick={() => {
                              setEditingMemory(memory);
                              setIsEditorOpen(true);
                            }}
                          />
                        );
                      })}
                    </AnimatePresence>
                  </div>
                  {visibleCount < displayedMemories.length && (
                    <>
                      <div ref={loadMoreRef} className="h-1" aria-hidden />
                      <div className="flex justify-center pt-6">
                        <button
                          onClick={() => setVisibleCount((c) => Math.min(c + PAGE_SIZE, displayedMemories.length))}
                          className="btn-ghost px-5 py-2.5 rounded-xl text-sm font-medium"
                        >
                          Mehr laden ({displayedMemories.length - visibleCount} weitere)
                        </button>
                      </div>
                      <div className="text-center text-xs mt-2" style={{ color: 'var(--text-3)' }}>
                        {paginatedMemories.length} von {displayedMemories.length} Knoten angezeigt
                      </div>
                    </>
                  )}
                  {visibleCount >= displayedMemories.length && displayedMemories.length > PAGE_SIZE && (
                    <div className="text-center text-xs mt-4" style={{ color: 'var(--text-3)' }}>
                      Alle {displayedMemories.length} Knoten angezeigt
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={cn("flex-1 h-full overflow-hidden", currentView === 'chat' ? 'flex' : 'hidden')}
        >
          <Chat
            activeMemories={chatMemories}
            onSaveToBrain={handleSaveToBrain}
            onSaveToBrainWithMeta={handleSaveToBrainWithMeta}
            isFocusMode={isFocusMode}
            onToggleFocus={() => setIsFocusMode(!isFocusMode)}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={cn("flex-1 flex flex-col h-full min-h-0 overflow-hidden p-4", currentView === 'graph' ? 'flex' : 'hidden')}
        >
          <div className="flex items-center gap-3 mb-3 shrink-0">
            <div className="hud-label flex items-center gap-2"><ScanSearch className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} /> Graph // {memories.length} Knoten</div>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => setCurrentView("memories")} className="btn-ghost px-3 py-1.5 rounded-lg text-xs font-medium">Zurück zum Index</button>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <KnowledgeGraph memories={memories} onSelectMemory={(m) => { setEditingMemory(m); setIsEditorOpen(true); }} />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={cn("flex-1 p-6 h-full overflow-y-auto", currentView === 'settings' ? 'block' : 'hidden')}
        >
          <Settings />
        </motion.div>
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} actions={paletteActions} />

      <OnboardingWizard open={wizardOpen} onClose={() => setWizardOpen(false)} onComplete={() => setWizardOpen(false)} />
      {/* Manueller Trigger falls Wizard geschlossen wurde */}
      {!wizardOpen && (()=>{ try{ const p=loadProfile(); if(!p?.hasCompletedOnboarding) return true; return false; } catch{ return false; }})() && (
        <button onClick={()=> setWizardOpen(true)} className="fixed bottom-4 right-4 z-40 btn-primary flex items-center gap-2 px-4 py-2.5 rounded-full shadow-xl" title="Adaptives Setup öffnen">
          <Sparkles className="w-4 h-4"/> Anpassen
        </button>
      )}

      <AnimatePresence>
        {isEditorOpen && (
          <MemoryEditor
            memory={editingMemory}
            onSave={handleSave}
            onClose={() => setIsEditorOpen(false)}
            onDelete={editingMemory ? () => handleDelete(editingMemory.id) : undefined}
          />
        )}
      </AnimatePresence>
      <ShortcutsSheet open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}

// Kleines statisches neuronales Ornament für den Empty-State — pulsiert bei Aktivität.
function BrainAnimationMini({ pulse = 0 }: { pulse?: number }) {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" fill="none" style={{ transform: pulse > 0 ? 'scale(1)' : undefined }}>
      <path d="M 50 15 C 30 15 15 25 15 45 C 15 60 25 75 40 85" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <path d="M 50 15 C 70 15 85 25 85 45 C 85 60 75 75 60 85" stroke="var(--accent-2)" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <circle cx="30" cy="50" r="3" fill="var(--accent)" opacity="0.8" />
      <circle cx="70" cy="50" r="3" fill="var(--accent-2)" opacity="0.8" />
      <circle cx="50" cy="20" r="3" fill="var(--accent)" opacity="0.8" />
    </svg>
  );
}

// Shortcuts-Cheat-Sheet (per „?“)
const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: '⌘K', action: 'Command Palette — schnelle Aktionen & Suche' },
  { keys: '⌘N', action: 'Neuer Wissensknoten' },
  { keys: '?', action: 'Diese Übersicht' },
  { keys: 'Esc', action: 'Dialog schließen' },
  { keys: '⌘1–4', action: 'Ansicht wechseln (Index, Chat, Graph, System)' },
];

function ShortcutsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center hud-backdrop"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ type: 'spring', damping: 24, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl shadow-2xl p-6"
            style={{ background: 'var(--bg-panel-solid)', border: '1px solid var(--border-subtle)' }}
          >
            <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--text-1)' }}>Tastenkürzel</h3>
            <ul className="space-y-2.5">
              {SHORTCUTS.map((s) => (
                <li key={s.keys} className="flex items-center justify-between gap-4">
                  <span className="text-sm" style={{ color: 'var(--text-2)' }}>{s.action}</span>
                  <kbd className="px-2 py-1 rounded-lg text-xs font-mono shrink-0" style={{ background: 'var(--bg-inset-strong)', border: '1px solid var(--border-subtle)', color: 'var(--text-1)' }}>
                    {s.keys}
                  </kbd>
                </li>
              ))}
            </ul>
            <p className="hud-label mt-4">Agenten nutzen dasselbe Gehirn über MCP — sieh die Aktivität live im Index.</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
