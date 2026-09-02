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
import { Search, Plus, Database, CheckCircle2, Copy, PanelLeftOpen, ScanSearch, UploadCloud, Globe, Loader2, AlertCircle, Sparkles, SlidersHorizontal, Trash2 } from 'lucide-react';
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
        // API liefert ein nacktes Array — defensiv auch {memories:[]} akzeptieren
        const list = Array.isArray(data) ? data : Array.isArray(data?.memories) ? data.memories : [];
        if (!cancelled) setTrashedMemories(list as Memory[]);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [trashOpen]);

  // Erstes Laden: Skeletons statt leerem Grid
  const [initialLoaded, setInitialLoaded] = useState(false);
  useEffect(() => {
    void refreshMemories().finally(() => setInitialLoaded(true));
  }, []);
  // Fenster-Fokus: Agenten schreiben evtl. aus anderen Prozessen — auffrischen
  useEffect(() => {
    const onFocus = () => void refreshMemories();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
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
      } else if ((e.metaKey || e.ctrlKey) && ['1', '2', '3', '4'].includes(e.key) && !typing) {
        // Sheet verspricht ⌘1–4 — jetzt halten wir es auch (Finding B4)
        e.preventDefault();
        setCurrentView((['memories', 'chat', 'graph', 'settings'] as const)[Number(e.key) - 1]);
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
  // Adaptiver Wizard: öffnet sich automatisch NUR beim echten Erstbesuch.
  // „Später“ wird persistiert — der Wizard kämpft nie gegen den Nutzer (Persona-Finding A1).
  const wizardDismissed = (): boolean => {
    try { return localStorage.getItem('ki_gehirn_wizard_dismissed') === '1'; } catch { return false; }
  };
  const [wizardOpen, setWizardOpen] = useState(false);
  const closeWizard = () => {
    setWizardOpen(false);
    try { localStorage.setItem('ki_gehirn_wizard_dismissed', '1'); } catch { /* ignore */ }
  };
  useEffect(() => {
    try {
      if (wizardDismissed()) return;
      const p = loadProfile();
      if (p?.hasCompletedOnboarding) return;
      if (memories.length === 0) {
        const timer = setTimeout(() => setWizardOpen(true), 600);
        return () => clearTimeout(timer);
      }
      if (!p) {
        const timer = setTimeout(() => setWizardOpen(true), 2500);
        return () => clearTimeout(timer);
      }
    } catch {}
    // Bewusst nur beim Mount + erstem Datenlayout — Dismiss-Speicher entscheidet dauerhaft
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memories.length === 0]);
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

  // Tags nach Häufigkeit (Finding C2: Sidebar muss bei großen Basen sortiert zählen)
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of memories) for (const t of m.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, count]) => ({ tag, count }));
  }, [memories]);

  // Typen-Verteilung für die Übersichtskacheln
  const typeCounts = useMemo(() => {
    const c = { semantic: 0, episodic: 0, procedural: 0 } as Record<string, number>;
    for (const m of memories) if (m.type && c[m.type] !== undefined) c[m.type] += 1;
    return c;
  }, [memories]);

  // Begrüßung nach Tageszeit + Name aus dem adaptiven Profil
  const greeting = (() => {
    const h = new Date().getHours();
    return h < 5 ? 'Gute Nacht' : h < 11 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend';
  })();
  const profileName = (() => { try { return loadProfile()?.displayName || ''; } catch { return ''; } })();

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
    const result = await saveMemory(
      editingMemory?.id ? { ...memoryData, id: editingMemory.id } : memoryData
    );
    if (result === null) {
      toast.push({ message: 'Speichern fehlgeschlagen — Änderungen wurden nicht übernommen.', kind: 'warn' });
    } else {
      setIsEditorOpen(false);
      setEditingMemory(null);
    }
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
      `--- ${m.title} ---\n${m.content}\n`
    )).join('\n');
    const prompt = `[CONTEXT]\n${contextText}\n[/CONTEXT]\n\nBitte nutze diesen Kontext für die Beantwortung meiner Fragen.`;
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
      await saveMemory({ title, content: `Quelle: ${data.url || url}\n\n${content}`, tags });
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
        showSetup={(() => { try { const p = loadProfile(); return !p?.hasCompletedOnboarding; } catch { return false; } })()}
        onOpenSetup={() => setWizardOpen(true)}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden my-2.5 mr-2.5 panel rounded-2xl relative z-10">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={cn("flex-1 flex flex-col h-full min-h-0 rounded-2xl overflow-hidden", currentView === 'memories' ? 'flex' : 'hidden')}
        >
          <header className="h-14 px-5 flex items-center gap-3 shrink-0 border-gradient-b">
            {isFocusMode && (
              <button
                onClick={() => setIsFocusMode(false)}
                className="btn-ghost p-2 rounded-lg"
                aria-label="Seitenleiste einblenden"
              >
                <PanelLeftOpen className="w-4.5 h-4.5" />
              </button>
            )}
            <div className="flex-1 max-w-xl relative group">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 transition-colors" style={{ color: 'var(--text-3)' }} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Suchen… (⌘K für Befehle)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen(true); } }}
                className="hud-input w-full pl-9 pr-4 py-2 rounded-lg text-sm"
              />
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={async () => {
                  setTrashOpen((v) => !v);
                  try {
                    const res = await fetch('/api/storage-info');
                    const data = await res.json();
                    setTrashCount(typeof data.trashed === 'number' ? data.trashed : 0);
                  } catch { /* ignore */ }
                }}
                className="btn-ghost hidden sm:flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium"
                title="Papierkorb — gelöschte Einträge wiederherstellen"
              >
                <Trash2 className="w-4 h-4" />
                {trashCount > 0 && <span className="tnum">{trashCount}</span>}
              </button>
              <button
                onClick={() => setPaletteOpen(true)}
                className="btn-ghost hidden sm:flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium"
                title="Befehlspalette"
              >
                <ScanSearch className="w-4 h-4" /> <span className="kbd !py-px">⌘K</span>
              </button>
              <button
                onClick={copyContextForAI}
                className="btn-ghost flex items-center gap-1.5 px-2.5 py-2 rounded-lg font-medium text-xs"
                title={`${chatMemories.length} Einträge im Chat-Kontext — als Prompt kopieren`}
              >
                {copied ? <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--ok)' }} /> : <Copy className="w-4 h-4" />}
                <span className="hidden sm:inline">{copied ? 'Kopiert' : `Kontext (${chatMemories.length})`}</span>
              </button>
              <button
                onClick={() => {
                  setEditingMemory(null);
                  setIsEditorOpen(true);
                }}
                className="btn-primary flex items-center gap-1.5 px-3 py-2 rounded-lg font-medium text-xs"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Neu</span>
              </button>
            </div>
          </header>

          {/* Papierkorb */}
          {trashOpen && (
            <div className="px-5 py-3 shrink-0 overflow-auto" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-inset)', maxHeight: '30vh' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-medium" style={{ color: 'var(--text-2)' }}>
                  Papierkorb · {trashedMemories.length} gelöschte Einträge, wiederherstellbar
                </span>
                <button onClick={() => setTrashOpen(false)} className="btn-ghost px-2 py-1 rounded-md text-[11px]">Schließen</button>
              </div>
              {trashedMemories.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>Leer.</p>
              ) : (
                <ul className="space-y-1">
                  {trashedMemories.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="truncate" style={{ color: 'var(--text-2)' }}>{m.title || 'Ohne Titel'}</span>
                      <button
                        onClick={async () => {
                          try {
                            await fetch(`/api/memories/${encodeURIComponent(m.id)}/restore`, { method: 'POST' });
                            setTrashedMemories((prev) => prev.filter((x) => x.id !== m.id));
                            void refreshMemories();
                          } catch { /* ignore */ }
                        }}
                        className="btn-ghost px-2 py-1 rounded-md text-[11px] shrink-0"
                      >
                        Wiederherstellen
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Werkzeugleiste: Suche-Modus, Kontextgröße, Quellen-Status */}
          <div className="px-5 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-2 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={semanticEnabled}
                onChange={(e) => setSemanticEnabled(e.target.checked)}
                className="sr-only"
              />
              <span className="switch" data-on={semanticEnabled}><span className="knob" /></span>
              <span className="text-[13px] font-medium" style={{ color: semanticEnabled ? 'var(--text-1)' : 'var(--text-2)' }}>
                Semantische Suche
              </span>
            </label>

            <div className="flex items-center gap-2">
              <span className="text-[12.5px]" style={{ color: 'var(--text-2)' }}>Ergebnisse</span>
              <input
                type="range"
                min={1}
                max={20}
                value={topK}
                onChange={(e) => setTopK(parseInt(e.target.value, 10))}
                className="w-24"
                title="Anzahl Einträge für Anzeige & Chat-Kontext"
              />
              <span className="chip tnum !px-1.5" title="Anzahl Einträge für Anzeige & Chat-Kontext">{topK}</span>
            </div>

            <div className="ml-auto flex items-center gap-2 text-xs">
              {semanticEnabled && debouncedSearchQuery.trim().length >= 2 && scoredResults && scoredResults.length > 0 && (
                <span
                  className="chip tnum"
                  title={`${scoredResults.length} Treffer · beste Übereinstimmung ${Math.round(scoredResults[0].score * 100)} % · BM25 ${Math.round(scoredResults[0].bm25Score * 100)} % · Vektor ${Math.round(scoredResults[0].cosineScore * 100)} %`}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--ok)' }} />
                  {scoredResults.length} Treffer · best {Math.round(scoredResults[0].score * 100)} %
                </span>
              )}
              {semanticEnabled && debouncedSearchQuery.trim().length >= 2 && scoredResults && scoredResults.length === 0 && (
                <span className="chip" style={{ color: 'var(--warn)' }}>
                  <AlertCircle className="w-3 h-3" /> Keine Treffer
                </span>
              )}
              {!semanticEnabled && debouncedSearchQuery.trim() && (
                <span className="chip tnum">{displayedMemories.length} Treffer</span>
              )}

              <span
                className="chip"
                title={inbox?.inboxDir ? `Inbox-Ordner: ${inbox.inboxDir}` : 'Inbox-Ordner beobachten'}
              >
                <UploadCloud className="w-3 h-3" style={{ color: inbox?.watching ? 'var(--ok)' : 'var(--text-3)' }} />
                {inbox ? `${inbox.files.length} in Inbox` : 'Inbox…'}
                <button
                  onClick={handleInboxScan}
                  disabled={inboxScanBusy}
                  className="ml-0.5 -mr-1 px-1 rounded text-[10px] font-semibold hover:opacity-80 disabled:opacity-40"
                  style={{ color: 'var(--accent)' }}
                  title="Inbox jetzt scannen und importieren"
                >
                  {inboxScanBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Scan'}
                </button>
              </span>

              {duplicatePairs.length === 0 ? (
                <span className="chip hidden lg:inline-flex" title="Nichts zu tun — die Wissensbasis hat keine auffälligen Duplikate">
                  <CheckCircle2 className="w-3 h-3" style={{ color: 'var(--ok)' }} /> Sauber
                </span>
              ) : (
                <>
                  <span
                    className="chip"
                    style={{ color: 'var(--warn)', background: 'var(--warn-soft)', borderColor: 'transparent' }}
                    title="Nur ein Hinweis — es wird nichts gelöscht oder verändert. Duplikate kannst du per MCP memory_consolidate sicher zusammenführen."
                  >
                    <AlertCircle className="w-3 h-3" /> {duplicatePairs.length} Duplikat{duplicatePairs.length > 1 ? 'e' : ''}
                  </span>
                  <button
                    onClick={() => {
                      const first = duplicatePairs[0];
                      if (first) { setEditingMemory(first.a); setIsEditorOpen(true); }
                    }}
                    className="btn-ghost px-2 py-1 rounded-md text-[11px] font-medium hidden sm:inline-block"
                    title="Ähnlichste Paare im Editor ansehen — ohne Änderung"
                  >
                    Ansehen
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Quellen: Datei-Import + URL-Clipper */}
          <div className="px-5 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-2.5">
              {/* Drop-Zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={cn(
                  "group relative rounded-lg border border-dashed px-3.5 py-2.5 flex items-center gap-3 transition-colors",
                  dragOver ? "border-[var(--accent)]" : ""
                )}
                style={{ background: dragOver ? 'var(--accent-soft)' : 'var(--bg-inset)', borderColor: dragOver ? 'var(--accent)' : 'var(--border-subtle)' }}
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: "var(--accent)" }} /> : <UploadCloud className="w-4 h-4 shrink-0" style={{ color: "var(--text-3)" }} />}
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate" style={{ color: "var(--text-1)" }}>
                    {importing ? "Importiere…" : dragOver ? "Loslassen zum Importieren" : "Dateien hierher ziehen"}
                    <span className="hidden sm:inline font-normal" style={{ color: "var(--text-3)" }}> · PDF, MD, TXT, JSON</span>
                  </div>
                  {importMsg && <div className="text-[11px] mt-0.5 flex items-center gap-1" style={{ color: "var(--ok)" }}><CheckCircle2 className="w-3 h-3" />{importMsg}</div>}
                  {importErr && <div className="text-[11px] mt-0.5 flex items-center gap-1" style={{ color: "var(--danger)" }}><AlertCircle className="w-3 h-3" />{importErr}</div>}
                </div>
                <label className="btn-ghost px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer shrink-0">
                  Auswählen
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
              <div className="rounded-lg flex items-center gap-2 px-3.5 py-2.5" style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)' }}>
                <Globe className="w-4 h-4 shrink-0" style={{ color: "var(--text-3)" }} />
                <input
                  ref={clipInputRef}
                  value={clipUrl}
                  onChange={(e) => setClipUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleClip(); }}
                  placeholder="URL einfügen und importieren…"
                  className="flex-1 min-w-0 bg-transparent text-sm outline-none"
                  style={{ color: "var(--text-1)" }}
                />
                <button
                  onClick={handleClip}
                  disabled={clipping || !clipUrl.trim()}
                  className="btn-ghost px-2.5 py-1.5 rounded-md text-xs font-medium shrink-0 disabled:opacity-40"
                >
                  {clipping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Importieren'}
                </button>
              </div>
            </div>
            {(clipErr || clipOk) && (
              <div className="text-[11px] flex items-center gap-1.5 mt-1.5" style={{ color: clipErr ? "var(--danger)" : "var(--ok)" }}>
                {clipErr ? <AlertCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                {clipErr || clipOk}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="max-w-6xl mx-auto h-full flex flex-col">
              {/* Persönlicher Kopf — Datum + Stand */}
              <div className="mb-4 shrink-0">
                <h1 className="text-[21px] font-bold tracking-[-0.02em]" style={{ color: 'var(--text-1)' }}>
                  {greeting}{profileName ? `, ${profileName}` : ''}
                </h1>
                <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-2)' }}>
                  {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })} · {memories.length} {memories.length === 1 ? 'Eintrag' : 'Einträge'} bereit{agentActive ? ' · Agent arbeitet gerade' : ''}
                </p>
              </div>

              {/* Übersicht — das Gehirn auf einen Blick */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4 shrink-0">
                <div className="stat-tile card !transform-none">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--accent-soft)', boxShadow: 'inset 0 1px 0 var(--edge-light)' }}>
                    <Database className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[17px] font-semibold leading-tight tnum" style={{ color: 'var(--text-1)' }}>{memories.length}</span>
                    <span className="block text-[11px]" style={{ color: 'var(--text-3)' }}>Einträge im Index</span>
                  </span>
                </div>
                <div className="stat-tile card !transform-none">
                  <span className="w-8 h-8 rounded-lg flex flex-col items-center justify-center shrink-0 gap-[3px]" style={{ background: 'var(--bg-inset)', boxShadow: 'inset 0 1px 0 var(--edge-light)' }}>
                    <span className="flex gap-[2px]">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--type-semantic)' }} />
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--type-episodic)' }} />
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--type-procedural)' }} />
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-semibold leading-tight tnum truncate" style={{ color: 'var(--text-1)' }}>
                      {typeCounts.semantic} · {typeCounts.episodic} · {typeCounts.procedural}
                    </span>
                    <span className="block text-[11px]" style={{ color: 'var(--text-3)' }}>Wissen · Episode · Ablauf</span>
                  </span>
                </div>
                <div className="stat-tile card !transform-none">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--bg-inset)', boxShadow: 'inset 0 1px 0 var(--edge-light)' }}>
                    <SlidersHorizontal className="w-4 h-4" style={{ color: 'var(--text-2)' }} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[17px] font-semibold leading-tight tnum" style={{ color: 'var(--text-1)' }}>{allTags.length}</span>
                    <span className="block text-[11px]" style={{ color: 'var(--text-3)' }}>Kategorien</span>
                  </span>
                </div>
                <div className="stat-tile card !transform-none">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: agentActive ? 'var(--accent-soft)' : 'var(--ok-soft)', boxShadow: 'inset 0 1px 0 var(--edge-light)' }}>
                    {agentActive ? <span className="agent-dot" /> : <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--ok)' }} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-semibold leading-tight truncate" style={{ color: 'var(--text-1)' }}>
                      {agentActive ? 'Agent arbeitet' : 'Synchron'}
                    </span>
                    <span className="block text-[11px]" style={{ color: 'var(--text-3)' }}>lokal · privat · MCP</span>
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between mb-3 shrink-0">
                <div className="flex items-center gap-2 text-[12px] tnum" style={{ color: 'var(--text-3)' }}>
                  {displayedMemories.length} von {tagFiltered.length} Einträgen
                  {semanticEnabled && debouncedSearchQuery.trim().length >= 2 && ` · Top-${topK}`}
                </div>
                <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-3)' }}>
                  {agentActive ? (
                    <>
                      <span className="agent-dot" />
                      <span style={{ color: 'var(--accent)', fontWeight: 560 }}>Agent aktiv</span>
                    </>
                  ) : (
                    <span className="status-dot" title="Lokaler Speicher synchron" />
                  )}
                </div>
              </div>

              {displayedMemories.length === 0 && !initialLoaded ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="card p-4 h-52 rounded-xl flex flex-col gap-3">
                      <div className="skeleton h-3 w-16" />
                      <div className="skeleton h-5 w-4/5" />
                      <div className="skeleton h-3 w-full" />
                      <div className="skeleton h-3 w-full" />
                      <div className="skeleton h-3 w-2/3" />
                      <div className="mt-auto flex gap-2">
                        <div className="skeleton h-5 w-14 rounded-md" />
                        <div className="skeleton h-5 w-12 rounded-md" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : displayedMemories.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)' }}>
                    <motion.div key={brainPulse} initial={{ scale: 1.12 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 14 }}>
                      <Database className="w-6 h-6" style={{ color: 'var(--text-3)' }} />
                    </motion.div>
                  </div>
                  <h3 className="text-[15px] font-semibold mb-1.5" style={{ color: 'var(--text-1)' }}>
                    {debouncedSearchQuery || selectedTags.length > 0 ? 'Keine Treffer' : 'Noch keine Einträge'}
                  </h3>
                  <p className="text-[13px] max-w-sm mx-auto leading-relaxed" style={{ color: 'var(--text-2)' }}>
                    {debouncedSearchQuery || selectedTags.length > 0
                      ? semanticEnabled && debouncedSearchQuery.trim().length >= 2
                        ? `Nichts gefunden für „${debouncedSearchQuery.trim().slice(0, 48)}“. Versuche andere Begriffe, erhöhe die Ergebnisanzahl oder nutze die Keyword-Suche.`
                        : "Keine Einträge entsprechen den Suchkriterien."
                      : "Ziehe Dateien hierher, importiere eine URL oder lege mit „Neu“ los — Agenten schreiben über MCP direkt in dieselbe Basis."}
                  </p>
                  {semanticEnabled && debouncedSearchQuery.trim().length >= 2 && displayedMemories.length === 0 && (
                    <button onClick={() => setSemanticEnabled(false)} className="mt-4 btn-ghost px-3.5 py-2 rounded-lg text-[13px] font-medium">
                      Zur Keyword-Suche wechseln
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
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
                          className="btn-ghost px-4 py-2 rounded-lg text-[13px] font-medium"
                        >
                          Mehr laden ({displayedMemories.length - visibleCount} weitere)
                        </button>
                      </div>
                      <div className="text-center text-[11px] mt-2 tnum" style={{ color: 'var(--text-3)' }}>
                        {paginatedMemories.length} von {displayedMemories.length} angezeigt
                      </div>
                    </>
                  )}
                  {visibleCount >= displayedMemories.length && displayedMemories.length > PAGE_SIZE && (
                    <div className="text-center text-[11px] mt-4 tnum" style={{ color: 'var(--text-3)' }}>
                      Alle {displayedMemories.length} Einträge angezeigt
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
          className={cn("flex-1 flex flex-col h-full min-h-0 overflow-hidden px-5 py-3", currentView === 'graph' ? 'flex' : 'hidden')}
        >
          <div className="flex items-center gap-3 mb-2 shrink-0">
            <div className="text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>Graph</div>
            <div className="text-[12px] tnum" style={{ color: 'var(--text-3)' }}>{memories.length} Einträge · Verbindungen über Tags, Ähnlichkeit & Wissens-Entitäten</div>
            <div className="ml-auto">
              <button onClick={() => setCurrentView("memories")} className="btn-ghost px-2.5 py-1.5 rounded-md text-xs font-medium">Zurück zur Liste</button>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <KnowledgeGraph memories={memories} onSelectMemory={(m) => { setEditingMemory(m); setIsEditorOpen(true); }} />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={cn("flex-1 p-5 h-full overflow-y-auto", currentView === 'settings' ? 'block' : 'hidden')}
        >
          <Settings />
        </motion.div>
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} actions={paletteActions} />

      <OnboardingWizard open={wizardOpen} onClose={closeWizard} onComplete={closeWizard} />

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
            className="w-full max-w-md rounded-2xl p-6 glass-strong"
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
