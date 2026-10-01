import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Sidebar } from './Sidebar';
import { MemoryCard } from './MemoryCard';
import { MemoryEditor } from './MemoryEditor';
import { MemoryPreview } from './MemoryPreview';
import { ProUpgrade, holeUpgradeUrl, type Lizenz } from './ProUpgrade';
import { Chat } from './Chat';
import { hydrateAISettings } from '../lib/ai';
import { hydratePrefs, spiegelePrefs } from '../lib/prefs';
import { Settings } from './Settings';
import { KnowledgeGraph } from './KnowledgeGraph';
import { TodayView } from './TodayView';
import { DossierView } from './DossierView';
import { TeamView } from './TeamView';
import { ActivityView } from './ActivityView';
import { CommandPalette, useCommandPaletteHotkey, buildPaletteActions } from './CommandPalette';
import { saveMemory, deleteMemory, subscribeMemories, refreshMemories, deleteMemories, restoreMemories } from '../lib/store';
import { subscribeActivity } from '../lib/activity';
import { useToast } from './ui/Toast';
import { hybridSearch, type ScoredMemory } from '../lib/semantic';
import { useSuchPrefs, leseTreffer, normalisiereTreffer, schreibeTreffer, SUCH_PREFS_EVENT, RESULT_STOPS } from '../lib/searchPrefs';
import { OnboardingWizard } from './OnboardingWizard';
import { DuplicatesPanel, loadDismissed } from './DuplicatesPanel';
import { MachineScan } from './MachineScan';
import { findDuplicateGroups, redundantCount } from '../lib/duplicates';
import { loadProfile } from '../lib/profile';
import { KeptaMark } from './KeptaMark';
import { Memory } from '../types';
import { parseQuelle, oeffneQuelle, type Quelle } from '../lib/quelle';
import { pdfTextAusBuffer } from '../lib/pdfText';
import { TYP_LABELS } from '../lib/graphHierarchy';
import { t, wendeZoomAn } from '../lib/uiText';
import { Search, Plus, CheckCircle2, Copy, PanelLeftOpen, ScanSearch, UploadCloud, Globe, Loader2, AlertCircle, Sparkles, Trash2, HardDriveDownload, FileText, ExternalLink } from "../lib/icons";
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

type ViewKey = 'memories' | 'today' | 'chat' | 'graph' | 'dossier' | 'activity' | 'team' | 'settings';

/**
 * Was "alles" gegenueber der Engine bedeutet — dieselbe Grenze wie im Kern.
 * Die Stufen des Ergebnisreglers (5..250..0) leben in lib/searchPrefs —
 * die Einstellungen zeigen denselben Regler und schreiben dieselben Schlüssel.
 */
const ALL_RESULTS = 10_000;
/**
 * Der Chat bekommt weiterhin nur eine Handvoll Knoten. Der Regler steuert die
 * ANZEIGE; 361 Notizen in einen LLM-Aufruf zu schieben waere teuer und schlechter.
 */
const CHAT_CONTEXT_LIMIT = 25;

function resultLabel(v: number): string {
  return v === 0 ? 'All' : String(v);
}

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
    // pdf.js mit CMaps vom lokalen Server — eingebettete Schriften dekodieren
    // zu Buchstaben statt Glyph-Namen (gleiche Extraktion wie der Scan).
    const text = await pdfTextAusBuffer(buf);
    if (text) return text;
    return `[PDF: ${file.name} – no extractable text, raw size ${file.size} bytes]`;
  }
  return await file.text();
}

export function Dashboard() {
  const toast = useToast();
  // Die Textgroesse gilt ab dem ersten Bild; geaendert wird sie in den Einstellungen.
  // AI-Settings rehydrieren (26.9.-Audit): das localStorage hängt am
  // Random-Port-Origin und ist nach jedem Neustart leer — die DB-Spiegelung
  // (lib/ai.ts) liefert Provider, Modell und API-Schlüssel zurück. Der
  // aiBereit-Zähler zwingt zum Neulesen, NACHDEM die Werte da sind.
  const [aiBereit, setAiBereit] = useState(0);
  useEffect(() => {
    let cancelled = false;
    hydrateAISettings().then(() => { if (!cancelled) setAiBereit(z => z + 1); });
    return () => { cancelled = true; };
  }, []);
  // Dieselbe Rettung für alle Nutzer-Präferenzen (Semantic, TopK, Gruppierung,
  // Wizard, AutoLearn, Profil): Hydration beim Start, Spiegel im Takt — der
  // Random-Port-Origin verliert sonst JEDE Einstellung.
  useEffect(() => {
    let cancelled = false;
    hydratePrefs().then(() => { if (!cancelled) setAiBereit(z => z + 1); });
    const takt = setInterval(spiegelePrefs, 10_000);
    spiegelePrefs();
    return () => { cancelled = true; clearInterval(takt); };
  }, []);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [currentView, setCurrentView] = useState<ViewKey>('memories');
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  // Klick auf eine Karte oeffnet die lesbare Vorschau — der Editor kommt nur
  // noch ueber deren „Edit“-Knopf.
  const [vorschauMemory, setVorschauMemory] = useState<Memory | null>(null);
  const [upgradeOffen, setUpgradeOffen] = useState(false);
  const [upgradeUrl, setUpgradeUrl] = useState<string | undefined>(undefined);
  // Erst wenn KEPTA_UPGRADE_URL gesetzt ist (Paddle live), führt der Kaufen-Knopf
  // wirklich zur Kasse — sonst auf den Kontakt-Weg (LinkedIn).
  const [checkoutLive, setCheckoutLive] = useState(false);
  // Wem die Lizenz gehoert — steht sichtbar in der Seitenleiste (2.12.0), damit
  // ein weitergegebener Schluessel auffaellt.
  const [lizenz, setLizenz] = useState<Lizenz | null>(null);
  const [lizenzWiderrufen, setLizenzWiderrufen] = useState(false);
  // Der Pro-Tag: 24 h ab Erststart alle Pro-Werkzeuge offen (helfer/probetag.ts
  // serverseitig) — die Seitenleiste zeigt die Uhr, das Ende kommt als Toast.
  const [protag, setProtag] = useState<{ aktiv: boolean; restMs: number } | null>(null);
  // Gruppierung der Liste: Alle (flach), Nach Datei, Nach Typ, Zeitraum.
  const [gruppierung, setGruppierung] = useState<'alle' | 'datei' | 'typ' | 'zeitraum'>(() => {
    try {
      const v = localStorage.getItem('ki_gehirn_gruppierung');
      return v === 'datei' || v === 'typ' || v === 'zeitraum' ? v : 'alle';
    } catch { return 'alle'; }
  });
  useEffect(() => {
    try { localStorage.setItem('ki_gehirn_gruppierung', gruppierung); } catch { /* ignore */ }
  }, [gruppierung]);

  // Der sanfte Übergang: läuft der Pro-Tag zum ersten Mal nicht mehr, sagt
  // ein Toast Bescheid — einmal pro Installation, nie eine Wand. Der Nutzer
  // verliert die App nicht, nur die Grenzenlosigkeit.
  const uebernimmProtag = useCallback((d: { protag?: { aktiv?: boolean; restMs?: number } }) => {
    if (!d.protag || typeof d.protag.aktiv !== 'boolean') return;
    setProtag({ aktiv: d.protag.aktiv, restMs: typeof d.protag.restMs === 'number' ? d.protag.restMs : 0 });
    if (!d.protag.aktiv) {
      try {
        if (!localStorage.getItem('ki_gehirn_protag_ende')) {
          localStorage.setItem('ki_gehirn_protag_ende', '1');
          toast.push({
            message: 'Your unlimited day is over — KEPTA keeps running, free, with daily limits. A key removes them.',
            kind: 'info',
          });
        }
      } catch { /* privates Fenster */ }
    }
  }, [toast]);

  // Lizenzdaten: einmal beim Mount. Die App ist NIE gesperrt (Freemium) —
  // ohne Schlüssel läuft der Free-Plan mit Tageslimiten; dieses Laden holt nur
  // Lizenzinhaber, den Pro-Tag und den Upgrade-Weg fürs Seitenleisten-Panel.
  useEffect(() => {
    fetch('/api/license').then(r => r.json()).then(d => {
      if (d.licensed && typeof d.licensee === 'string' && typeof d.number === 'string') {
        setLizenz({ licensee: d.licensee, number: d.number, edition: typeof d.edition === 'string' ? d.edition : undefined, seats: typeof d.seats === 'number' ? d.seats : undefined });
      }
      setLizenzWiderrufen(d.revoked === true);
      if (typeof d.upgradeUrl === 'string') setUpgradeUrl(d.upgradeUrl);
      setCheckoutLive(d.checkoutLive === true);
      uebernimmProtag(d);
    }).catch(() => { /* der Hintergrundserver meldet sich, wenn er bereit ist */ });
  }, []);
  // Stufenwechsel (z. B. per License Studio/API während die App offen ist):
  // Bei Fensterfokus frisch nachfragen, damit Fußzeile und Organization-Panel
  // die aktuelle Stufe zeigen, statt des Stands vom Start.
  useEffect(() => {
    const lade = () => {
      fetch('/api/license').then(r => r.json()).then(d => {
        if (d.licensed && typeof d.licensee === 'string' && typeof d.number === 'string') {
          setLizenz({ licensee: d.licensee, number: d.number, edition: typeof d.edition === 'string' ? d.edition : undefined, seats: typeof d.seats === 'number' ? d.seats : undefined });
          setLizenzWiderrufen(d.revoked === true);
        }
        uebernimmProtag(d);
      }).catch(() => { /* Fokus-Refresh ist best effort */ });
    };
    window.addEventListener('focus', lade);
    document.addEventListener('visibilitychange', lade);
    return () => {
      window.removeEventListener('focus', lade);
      document.removeEventListener('visibilitychange', lade);
    };
  }, []);
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

  // Shortcuts: ⌘N = neuer Knoten, ? = Shortcuts-Sheet
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
      } else if ((e.metaKey || e.ctrlKey) && ['1', '2', '3', '4', '5', '6', '7'].includes(e.key) && !typing) {
        // Sheet verspricht ⌘1–4 — jetzt halten wir es auch (Finding B4); ⌘5–7 seit 2.13
        e.preventDefault();
        setCurrentView((['memories', 'chat', 'graph', 'settings', 'today', 'dossier', 'activity'] as const)[Number(e.key) - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Semantic search: Toggle + Top-k
  const [semanticEnabled, setSemanticEnabled] = useState<boolean>(() => {
    try { const v = localStorage.getItem('ki_gehirn_semantic'); return v === null ? true : v !== 'false'; } catch { return true; }
  });
  // Der Ergebnisregler lebt in lib/searchPrefs — die Einstellungen zeigen
  // denselben Regler; beide Flächen synchronisieren sich live über das Event.
  const [topK, setTopKState] = useState<number>(leseTreffer);
  const setTopK = useCallback((v: number) => {
    setTopKState(normalisiereTreffer(v));
    schreibeTreffer(v);
  }, []);
  useEffect(() => {
    const on = () => setTopKState(leseTreffer());
    window.addEventListener(SUCH_PREFS_EVENT, on);
    return () => window.removeEventListener(SUCH_PREFS_EVENT, on);
  }, []);
  // Suchtiefe + Spuren-Schalter (Paket 2): aus den Einstellungen, an jeden Search-Call.
  const [suchPrefs, setzeSuchPrefs] = useSuchPrefs();
  /** Was die Suche wirklich anfordert — 0 ("All") heisst: so viel, wie es gibt. */
  const effectiveLimit = topK === 0 ? ALL_RESULTS : topK;
  /**
   * Der Request-topk: nie unter der eingestellten Suchtiefe. Die Engine
   * fusioniert ihre drei Beine in dieser Tiefe — ANGEZEIGT wird der Stand
   * des Ergebnisreglers; tiefer zu suchen schneidet nichts ab, es verfeinert.
   */
  const anfrageLimit = topK === 0 ? ALL_RESULTS : Math.max(effectiveLimit, suchPrefs.tiefe);
  useEffect(() => { try { localStorage.setItem('ki_gehirn_semantic', String(semanticEnabled)); } catch { /* ignore */ } }, [semanticEnabled]); spiegelePrefs();

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
  const [inbox, setInbox] = useState<{ inboxDir?: string; files: string[]; archiveCount: number; watching: boolean } | null>(null);
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
      setImportMsg(`Inbox: ${d.scanned} files scanned, ${d.imported} nodes imported`);
      setTimeout(()=> setImportMsg(null), 3000);
      refreshInbox();
    } catch { setImportErr('Inbox scan failed'); setTimeout(()=> setImportErr(null), 2500); }
    finally { setInboxScanBusy(false); }
  };

  // Duplikate: erkannt in src/lib/duplicates (Blocking statt Alle-gegen-alle,
  // vollstaendig statt "die ersten acht"). Was der Nutzer als "kein Duplikat"
  // markiert hat, bleibt draussen.
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  // Rechner-Scan: im Assistenten angeboten, hier geoeffnet. Der Wunsch wird
  // ueber localStorage weitergereicht, damit der Assistent nichts davon wissen muss.
  const [scanOpen, setScanOpen] = useState(false);
  /** Kommt der Dialog aus dem Assistenten, sieht er sofort nach. */
  const [scanAusAssistent, setScanAusAssistent] = useState(false);
  const [dismissedPairs, setDismissedPairs] = useState<Set<string>>(() => loadDismissed());
  useEffect(() => {
    if (!duplicatesOpen) setDismissedPairs(loadDismissed());
  }, [duplicatesOpen]);
  const duplicateGroups = useMemo(
    () => findDuplicateGroups(memories, { dismissed: dismissedPairs }),
    [memories, dismissedPairs]
  );
  const duplicateCount = useMemo(() => redundantCount(duplicateGroups), [duplicateGroups]);

  // palette
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Adaptiver Wizard: öffnet sich automatisch NUR beim echten Erstbesuch.
  // „Later“ wird persistiert — der Wizard kämpft nie gegen den Nutzer (Persona-Finding A1).
  const wizardDismissed = (): boolean => {
    try { return localStorage.getItem('ki_gehirn_wizard_dismissed') === '1'; } catch { return false; }
  };
  const [wizardOpen, setWizardOpen] = useState(false);
  const closeWizard = () => {
    setWizardOpen(false);
    try { localStorage.setItem('ki_gehirn_wizard_dismissed', '1'); } catch { /* ignore */ }
    // Wer im Assistenten zugestimmt hat, den Rechner ansehen zu lassen, bekommt
    // die Zustimmungsfrage direkt danach — beantwortet wird sie dort, nicht hier.
    try {
      if (localStorage.getItem('kepta_scan_wunsch') === '1') {
        localStorage.removeItem('kepta_scan_wunsch');
        setScanAusAssistent(true);
        setTimeout(() => setScanOpen(true), 350);
      }
    } catch { /* ignore */ }
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
        // Named messages („Claude saved …“) come from /api/agents below — this
        // stream only knows that something changed, not who did it.
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Named and live: which AI app saved what. The MCP server of every app writes
  // its calls to the database (src/lib/aktivitaet.ts); the app asks what is new
  // every four seconds and says it in plain words.
  const [appsLive, setAppsLive] = useState(false);
  useEffect(() => {
    let letzte: number | null = null;
    let vorbei = false;
    const holen = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const r = await fetch(`/api/agents${letzte === null ? '' : `?after=${letzte}`}`);
        if (!r.ok) return;
        const d = await r.json() as { entries?: { id: number; who: string; tool: string; text: string | null }[]; agents?: { lastSeen: number }[] };
        if (vorbei || !d || typeof d !== 'object') return;
        const neu = Array.isArray(d.entries) ? d.entries : [];
        setAppsLive((Array.isArray(d.agents) ? d.agents : []).some((a) => Date.now() - a.lastSeen < 5 * 60_000));
        const erstes = letzte === null;
        letzte = neu.length ? Math.max(letzte ?? 0, ...neu.map((e) => e.id)) : (letzte ?? 0);
        if (erstes) return;
        const schreibend = neu.filter((e) => /^memory_(save|update|delete|forget)$/.test(e.tool));
        if (!schreibend.length) return;
        const e = schreibend[0];
        const verb = e.tool === 'memory_save' ? 'saved' : e.tool === 'memory_update' ? 'changed' : e.tool === 'memory_delete' ? 'moved to the trash' : 'marked as outdated';
        toast.push({ message: `${e.who} ${verb}${e.text ? ` “${e.text.slice(0, 60)}”` : ''}${schreibend.length > 1 ? ` — and ${schreibend.length - 1} more` : ''}.`, kind: 'info' });
        void refreshMemories();
      } catch { /* the next round tries again */ }
    };
    void holen();
    const takt = setInterval(() => void holen(), 4000);
    return () => { vorbei = true; clearInterval(takt); };
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
    const c = { semantic: 0, episodic: 0, procedural: 0, reference: 0 } as Record<string, number>;
    for (const m of memories) if (m.type && c[m.type] !== undefined) c[m.type] += 1;
    return c;
  }, [memories]);

  // Begrüßung nach Tageszeit + Name aus dem adaptiven Profil
  const greeting = (() => {
    const h = new Date().getHours();
    return h < 5 ? 'Good night' : h < 11 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
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
      const res = hybridSearch(tagFiltered, q, effectiveLimit, { ngram: 1 });
      return res;
    } catch {
      return null;
    }
  }, [tagFiltered, debouncedSearchQuery, semanticEnabled, effectiveLimit]);

  // --- Server-Engine (BM25 + Vektoren + Graph → RRF) lädt asynchron nach ---
  const [serverScored, setServerScored] = useState<ScoredMemory[] | null>(null);
  /** Wie viele Treffer es INSGESAMT gab — auch die, die das Limit abschneidet. */
  const [serverTotal, setServerTotal] = useState<number | null>(null);
  /**
   * Der Such-Cache des Kerns (3.1.1): nach dem ersten Zugriff ist das Gehirn
   * warm — Delta-Writes patchen den Cache, statt ihn neu aufzubauen. Die App
   * kennt den ersten Request-Zeitpunkt: vor der ersten Antwort wärmt sich das
   * Gehirn, danach zeigt sie die zuletzt gemessene Antwortzeit.
   */
  const [gehirnWaermt, setGehirnWaermt] = useState(false);
  const [gehirnWarm, setGehirnWarm] = useState(false);
  const [suchDauerMs, setSuchDauerMs] = useState<number | null>(null);
  useEffect(() => {
    const q = debouncedSearchQuery.trim();
    if (!semanticEnabled || q.length < 2) {
      setServerScored(null);
      setServerTotal(null);
      return;
    }
    let cancelled = false;
    if (!gehirnWarm) setGehirnWaermt(true);
    void (async () => {
      const start = performance.now();
      try {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Paket 2 (UI-Parität): die Such-Einstellungen reisen mit jedem Call —
          // Suchtiefe (topk) und die drei Spuren (engine: params.tracks).
          body: JSON.stringify({
            query: q,
            topK: anfrageLimit,
            tags: selectedTags.length > 0 ? selectedTags : undefined,
            tracks: { bm25: suchPrefs.spurBm25, vector: suchPrefs.spurVektor, entity: suchPrefs.spurGraph },
          }),
        });
        const data = await res.json();
        if (!cancelled) {
          setServerScored(Array.isArray(data.results) ? (data.results as ScoredMemory[]) : []);
          setServerTotal(typeof data.total === 'number' ? data.total : null);
          setSuchDauerMs(Math.round(performance.now() - start));
          setGehirnWarm(true);
          setGehirnWaermt(false);
        }
      } catch {
        if (!cancelled) { setServerScored(null); setServerTotal(null); } // Server unerreichbar → lokales Ranking bleibt
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchQuery, semanticEnabled, anfrageLimit, suchPrefs.spurBm25, suchPrefs.spurVektor, suchPrefs.spurGraph, JSON.stringify(selectedTags)]);
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
        if (effectiveScored && effectiveScored.length > 0) return effectiveScored.slice(0, Math.min(effectiveLimit, CHAT_CONTEXT_LIMIT)).map(r => r.memory);
        // Query vorhanden aber keine Treffer -> leerer Kontext (verhindert Halluzination mit irrelevanten Knoten)
        if (effectiveScored && effectiveScored.length === 0) return [];
      }
      // Keine Query -> neueste Top-k als Kontext (statt alle Knoten = Token-Sparmaßnahme)
      return [...tagFiltered].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, Math.min(effectiveLimit, CHAT_CONTEXT_LIMIT));
    }
    // Semantik aus: altes Verhalten – alle gefilterten in den Kontext
    const q = debouncedSearchQuery.trim().toLowerCase();
    if (q) return tagFiltered.filter(m => m.title.toLowerCase().includes(q) || m.content.toLowerCase().includes(q));
    return tagFiltered;
  }, [effectiveScored, semanticEnabled, effectiveLimit, tagFiltered, debouncedSearchQuery]);

  /** Opens a note from Today, a dossier or the activity — by its id. */
  const oeffneNotiz = useCallback((id: string) => {
    const m = memories.find((x) => x.id === id);
    if (m) setVorschauMemory(m);
    else toast.push({ message: 'This note is no longer there — it may have been deleted or replaced.', kind: 'warn' });
  }, [memories, toast]);

  const handleSave = async (memoryData: Partial<Memory>) => {
    const result = await saveMemory(
      editingMemory?.id ? { ...memoryData, id: editingMemory.id } : memoryData
    );
    if (result === null) {
      toast.push({ message: 'Save failed — your changes were not applied.', kind: 'warn' });
    } else {
      setIsEditorOpen(false);
      setEditingMemory(null);
    }
  };

  /**
   * Viele Notizen auf einmal — fuer das Aufraeumen von Duplikaten.
   *
   * Frueher rief das Duplikate-Fenster handleDelete je Notiz auf. Bei 155
   * Duplikaten waren das 155 Anfragen, 155 Meldungen und 155-mal Neuladen;
   * ab der einundsechzigsten griff die Schreibdrossel und alles Weitere
   * scheiterte lautlos. Hier: ein Aufruf, eine Meldung, ein Rueckgaengig, das
   * die ganze Aktion zuruecknimmt.
   */
  const handleDeleteMany = async (ids: string[]) => {
    if (ids.length === 0) return;
    const { deleted, ids: erledigt } = await deleteMemories(ids);
    if (deleted === 0) {
      toast.push({ message: 'Nothing was deleted — the server refused the request.', kind: 'warn' });
      return;
    }
    const fehlend = ids.length - deleted;
    toast.push({
      message: fehlend > 0
        ? `${deleted} notes moved to the trash · ${fehlend} were already gone`
        : `${deleted} notes moved to the trash`,
      kind: 'info',
      action: {
        label: 'Undo',
        onClick: async () => {
          const zurueck = await restoreMemories(erledigt);
          toast.push({
            message: zurueck === erledigt.length ? `${zurueck} restored` : `${zurueck} of ${erledigt.length} restored`,
            kind: zurueck > 0 ? 'success' : 'warn',
          });
        },
      },
    });
  };

  const handleDelete = async (id: string) => {
    if (!id) return;
    const victim = memories.find(m => m.id === id);
    // Sofort aus dem Grid nehmen — der Refresh kam früher erst mit dem nächsten
    // Event, die gelöschte Karte stand sichtbar im Raum (Funktionsbefund 5.9.).
    void deleteMemory(id).then(() => void refreshMemories());
    if (editingMemory?.id === id) {
      setIsEditorOpen(false);
      setEditingMemory(null);
    }
    toast.push({
      message: `“${(victim?.title || 'Node').slice(0, 40)}” moved to the trash`,
      kind: 'info',
      action: {
        label: 'Undo',
        onClick: async () => {
          try {
            await fetch(`/api/memories/${encodeURIComponent(id)}/restore`, { method: 'POST' });
            void refreshMemories();
            toast.push({ message: 'Restored', kind: 'success' });
          } catch {
            toast.push({ message: 'Restore failed', kind: 'warn' });
          }
        },
      },
    });
  };

  const copyContextForAI = () => {
    const contextText = chatMemories.map(m => (
      `--- ${m.title} ---\n${m.content}\n`
    )).join('\n');
    const prompt = `[CONTEXT]\n${contextText}\n[/CONTEXT]\n\nPlease use this context when answering my questions.`;
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveToBrain = (content: string) => {
    setEditingMemory({
      id: '',
      userId: 'local',
      title: 'New assistant node',
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
      setImportErr("No supported files (PDF, MD, TXT, JSON).");
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
        // Electron liefert den Pfad mit — damit die Karte spaeter zur
        // Original-Datei zurueckfuehren kann (dieselbe Konvention wie der
        // Rechner-Scan: "— Source: <pfad>" am Ende).
        const pfad = (file as unknown as { path?: string }).path;
        for (let i = 0; i < chunks.length; i++) {
          const title = chunks.length === 1 ? baseName : `${baseName} — Teil ${i + 1}/${chunks.length}`;
          const tags = ["import", file.name.split(".").pop()?.toLowerCase() || "file"];
          if (file.name.toLowerCase().endsWith(".pdf")) tags.push("pdf");
          const content = pfad ? `${chunks[i]}\n\n— Source: ${pfad}` : chunks[i];
          await saveMemory({ title, content, tags });
          totalNodes++;
        }
      }
      setImportMsg(`Imported ${totalNodes} nodes from ${list.length} file(s).`);
      setTimeout(() => setImportMsg(null), 3500);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setImportErr(msg || "Import failed");
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
      if (!res.ok) throw new Error(data.error || "Clip failed");
      const title: string = data.title || new URL(url).hostname;
      const content: string = data.content || "";
      const tags = ["clip", new URL(url).hostname.replace(/^www\./, "")];
      await saveMemory({ title, content: `Source: ${data.url || url}\n\n${content}`, tags });
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

  // --- Gruppierungen: Datei, Typ, Zeitraum ---
  //
  // Gebaut aus dem SICHTBAREN Ausschnitt (paginatedMemories): „Load more"
  // faellt neue Eintraege einfach in ihre Gruppe. Reihenfolge = erstes
  // Auftreten, „Ohne Quelle" wandert nach hinten.
  interface KarteGruppe {
    schluessel: string;
    titel: string;
    untertitel: string;
    /** Zum Öffnen im Gruppenkopf — Datei oder Weblink, wenn alle denselben Ursprung haben. */
    quelle: Quelle | null;
    typMix: string | null;
    memories: Memory[];
  }
  // Bei aktiver Suche zählt Relevanz: dann wird flach angezeigt, egal welche
  // Gruppierung gewählt war — sonst versinkt der beste Treffer in einer Gruppe.
  const effektivGruppierung = debouncedSearchQuery.trim() ? 'alle' : gruppierung;
  const gruppen: KarteGruppe[] | null = useMemo(() => {
    if (effektivGruppierung === 'alle') return null;
    const map = new Map<string, KarteGruppe>();
    const hinueber = (schluessel: string, titel: string, untertitel: string, quelle: Quelle | null, m: Memory) => {
      let g = map.get(schluessel);
      if (!g) { g = { schluessel, titel, untertitel, quelle, typMix: null, memories: [] }; map.set(schluessel, g); }
      g.memories.push(m);
    };
    for (const m of displayedMemories) {
      if (effektivGruppierung === 'datei') {
        const q = parseQuelle(m);
        if (q?.art === 'datei') hinueber(`datei:${q.pfad}`, q.name, 'Datei', q, m);
        else if (q?.art === 'url') hinueber(`url:${q.url}`, q.name, 'Web', q, m);
        else if (q?.art === 'inbox') hinueber(`inbox:${q.name}`, q.name, 'Inbox', null, m);
        else hinueber('ohne', t('list.noSource'), 'Handnotiz o. Agent', null, m);
      } else if (effektivGruppierung === 'typ') {
        const typ = m.type ?? 'semantic';
        hinueber(`typ:${typ}`, TYP_LABELS[typ] ?? typ, '', null, m);
      } else {
        const tag = new Date(m.createdAt);
        const heute = new Date(); heute.setHours(0, 0, 0, 0);
        const woche = new Date(heute); woche.setDate(woche.getDate() - 6);
        if (tag >= heute) hinueber('heute', t('list.today'), '', null, m);
        else if (tag >= woche) hinueber('woche', t('list.thisWeek'), '', null, m);
        else hinueber('aelter', t('list.older'), '', null, m);
      }
    }
    const liste = [...map.values()];
    // „Ohne Quelle“ nach hinten; im Typ-/Zeitraum-Modus bleibt die Auffolge.
    if (effektivGruppierung === 'datei') {
      liste.sort((a, b) => (a.schluessel === 'ohne' ? 1 : 0) - (b.schluessel === 'ohne' ? 1 : 0));
    }
    for (const g of liste) {
      const typen = [...new Set(g.memories.map((m) => TYP_LABELS[m.type ?? 'semantic'] ?? m.type ?? '—'))];
      g.typMix = typen.length === 1 ? typen[0] : typen.slice(0, 3).join(' · ') + (typen.length > 3 ? ' …' : '');
    }
    return liste;
  }, [displayedMemories, effektivGruppierung]);

  // Ganze Gruppen statt halber: das Sichtfenster („Load more“) schließt eine
  // Gruppe immer KOMPLETT ein, sobald ihr Anfang dran ist — eine 5-teilige
  // Akte, von der 2 Teile fehlen, sieht wie ein Bug aus.
  const sichtbareGruppen = useMemo(() => {
    if (!gruppen) return null;
    const out: KarteGruppe[] = [];
    let laufend = 0;
    for (const g of gruppen) {
      if (laufend >= visibleCount) break;
      out.push(g);
      laufend += g.memories.length;
    }
    return out;
  }, [gruppen, visibleCount]);

  // Eine Karte, an beiden Renderorten (flach + gruppiert) identisch.
  // Klick = Vorschau; der Editor kommt aus der Vorschau heraus.
  const karteFuer = (memory: Memory) => {
    const scored = scoredMap.get(memory.id);
    // Server-Scores sind rohe RRF-Werte (~0,02) — als Prozent wären sie Unsinn.
    // Prozent nur bei der lokalen Fusion (0..1) zeigen.
    const pct = serverScored ? undefined : scored?.score;
    // Spuren-Herkunft: nur die Server-Engine kennt die Bein-Ränge.
    const herkunft = scored?.tracks
      ? { bm25: scored.tracks.bm25, vektor: scored.tracks.vektor, graph: scored.tracks.graph }
      : undefined;
    return (
      <MemoryCard
        key={memory.id}
        memory={memory}
        score={pct}
        matchedTerms={scored?.matchedTerms}
        herkunft={herkunft}
        onClick={() => setVorschauMemory(memory)}
      />
    );
  };

  // Der komplette Listen-Inhalt als gecachtes JSX.
  //
  // Ohne diesen Cache lief bei JEDEM Ansichtswechsel der komplette Dashboard-
  // Render erneut: 3.241 Karten je ~40 DOM-Elemente (≈124.000 Objekte) wurden
  // neu als Elemente gebaut und von React durchgediffen — gemessen ~1,9 s
  // reine Renderzeit pro Klick auf „Knowledge“. Mit dem Cache bleibt die
  // Element-Referenz identisch, solange sich Bestand, Such-Scores, Paginierung
  // oder Gruppierung nicht ändern — React überspringt dann den gesamten
  // Teilbaum (referenzielle Gleichheit), und der Ansichtswechsel kostet
  // praktisch nichts.
  const listenInhalt = useMemo(() => (
    <>
      {gruppen ? (
        <div className="space-y-7">
          {(sichtbareGruppen ?? []).map((g) => (
            <section key={g.schluessel}>
              <div className="flex items-center gap-2 mb-2 px-0.5 min-w-0">
                {g.quelle?.art === 'datei' && <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />}
                {g.quelle?.art === 'url' && <ExternalLink className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />}
                <h3 className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-1)' }} title={g.quelle?.art === 'datei' ? g.quelle.pfad : g.titel}>
                  {g.titel}
                </h3>
                <span className="text-[11px] tnum whitespace-nowrap" style={{ color: 'var(--text-3)' }}>
                  {g.memories.length} {g.memories.length === 1 ? 'entry' : 'entries'}{g.typMix ? ` · ${g.typMix}` : ''}
                </span>
                {g.quelle && (
                  <button
                    onClick={() => void oeffneQuelle(g.quelle!)}
                    className="btn-ghost px-1.5 py-0.5 rounded text-[10px] shrink-0"
                    title={g.quelle.art === 'datei' ? `Open file: ${g.quelle.pfad}` : `Open link: ${g.quelle.url}`}
                  >
                    {g.quelle.art === 'url' ? 'Open link' : 'Open file'}
                  </button>
                )}
              </div>
              <div className="flex flex-col ledger">
                <AnimatePresence>
                  {g.memories.map(memory => karteFuer(memory))}
                </AnimatePresence>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="flex flex-col ledger">
          <AnimatePresence>
            {paginatedMemories.map(memory => karteFuer(memory))}
          </AnimatePresence>
        </div>
      )}
      {visibleCount < displayedMemories.length && (
        <>
          <div ref={loadMoreRef} className="h-1" aria-hidden />
          <div className="flex justify-center pt-6">
            <button
              onClick={() => setVisibleCount((c) => Math.min(c + PAGE_SIZE, displayedMemories.length))}
              className="btn-ghost px-4 py-2 rounded-lg text-[13px] font-medium"
            >
              Load more ({displayedMemories.length - visibleCount} more)
            </button>
          </div>
          <div className="text-center text-[11px] mt-2 tnum" style={{ color: 'var(--text-3)' }}>
            {paginatedMemories.length} von {displayedMemories.length} shown
          </div>
        </>
      )}
      {visibleCount >= displayedMemories.length && displayedMemories.length > PAGE_SIZE && (
        <div className="text-center text-[11px] mt-4 tnum" style={{ color: 'var(--text-3)' }}>
          All {displayedMemories.length} entries shown
        </div>
      )}
    </>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [gruppen, sichtbareGruppen, paginatedMemories, displayedMemories, visibleCount, scoredMap, serverScored, loadMoreRef]);

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
        appsLive={appsLive}
        licensee={lizenz?.licensee ?? null}
        licenseNumber={lizenz?.number ?? null}
        licenseEdition={lizenz?.edition ?? null}
        licenseSeats={lizenz?.seats ?? null}
        protagAktiv={!lizenz && (protag?.aktiv ?? false)}
        protagRestMs={protag?.restMs ?? null}
        isFocusMode={isFocusMode}
        toggleFocusMode={() => setIsFocusMode(!isFocusMode)}
        showSetup={(() => { try { const p = loadProfile(); return !p?.hasCompletedOnboarding; } catch { return false; } })()}
        onOpenSetup={() => setWizardOpen(true)}
        onUpgrade={() => setUpgradeOffen(true)}
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
                aria-label="Show sidebar"
              >
                <PanelLeftOpen className="w-4.5 h-4.5" />
              </button>
            )}
            <div className="flex items-center gap-2 shrink-0" style={{ color: 'var(--text-1)' }}>
              <KeptaMark size={22} radius={6} />
              <span className="hidden md:block font-semibold text-[13px] tracking-[-0.02em]">KEPTA</span>
            </div>
            <div className="flex-1 max-w-xl relative group">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 transition-colors" style={{ color: 'var(--text-3)' }} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search… (⌘K for commands)"
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
                title="Trash — restore deleted entries"
              >
                <Trash2 className="w-4 h-4" />
                {trashCount > 0 && <span className="tnum">{trashCount}</span>}
              </button>
              <button
                onClick={() => setPaletteOpen(true)}
                className="btn-ghost hidden sm:flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium"
                title="Command palette"
              >
                <ScanSearch className="w-4 h-4" /> <span className="kbd !py-px">⌘K</span>
              </button>
              <button
                onClick={copyContextForAI}
                className="btn-ghost flex items-center gap-1.5 px-2.5 py-2 rounded-lg font-medium text-xs"
                title={`${chatMemories.length} entries in the chat context — copy as a prompt`}
              >
                {copied ? <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--ok)' }} /> : <Copy className="w-4 h-4" />}
                <span className="hidden sm:inline">{copied ? 'Copied' : `Context (${chatMemories.length})`}</span>
              </button>
              <button
                onClick={() => {
                  setEditingMemory(null);
                  setIsEditorOpen(true);
                }}
                className="btn-primary flex items-center gap-1.5 px-3 py-2 rounded-lg font-medium text-xs"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New</span>
              </button>
            </div>
          </header>

          {/* Papierkorb */}
          {trashOpen && (
            <div className="px-5 py-3 shrink-0 overflow-auto" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-inset)', maxHeight: '30vh' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-medium" style={{ color: 'var(--text-2)' }}>
                  Trash — {trashedMemories.length} deleted entries, all restorable
                </span>
                <button onClick={() => setTrashOpen(false)} className="btn-ghost px-2 py-1 rounded-md text-[11px]">Close</button>
              </div>
              {trashedMemories.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>Empty.</p>
              ) : (
                <ul className="space-y-1">
                  {trashedMemories.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="truncate" style={{ color: 'var(--text-2)' }}>{m.title || 'Untitled'}</span>
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
                        Restore
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Werkzeugleiste: Suche-Modus, Kontextgröße, Quellen-Status */}
          <div className="px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={semanticEnabled}
                onChange={(e) => setSemanticEnabled(e.target.checked)}
                className="sr-only"
              />
              <span className="switch" data-on={semanticEnabled}><span className="knob" /></span>
              <span className="text-[13px] font-medium" style={{ color: semanticEnabled ? 'var(--text-1)' : 'var(--text-2)' }}>
                Semantic search
              </span>
            </label>

            <div className="flex items-center gap-2">
              <span className="text-[12.5px]" style={{ color: 'var(--text-2)' }}>Results</span>
              <input
                type="range"
                min={0}
                max={RESULT_STOPS.length - 1}
                step={1}
                value={Math.max(0, RESULT_STOPS.indexOf(topK as typeof RESULT_STOPS[number]))}
                onChange={(e) => setTopK(RESULT_STOPS[parseInt(e.target.value, 10)] ?? 5)}
                className="w-24"
                aria-label="Number of results shown"
                title="How many hits the index shows. The last step shows everything that matches."
              />
              <span
                className="chip tnum !px-1.5"
                title={topK === 0
                  ? 'Showing every note that matches — nothing is cut off. The chat still gets only the most relevant ones.'
                  : `Showing at most ${topK} hits. Slide to the end for all of them.`}
              >
                {resultLabel(topK)}
              </span>
            </div>

            <div className="ml-auto flex items-center gap-2 text-xs">
              {/* Such-Cache-Status: der Kern baut den Suchindex beim ersten
                  Zugriff einmal auf und patcht ihn danach nur noch — die App
                  misst die Antwortzeit und zeigt, wenn das Gehirn warm ist. */}
              {gehirnWaermt && (
                <span className="chip" title="The search cache is being built once — from now on, every write only patches it.">
                  <span className="agent-dot" /> Brain warming up…
                </span>
              )}
              {gehirnWarm && !gehirnWaermt && (
                <span className="chip tnum" title="Search cache warm — every write patches it instead of rebuilding. The time is the last search as measured by the app.">
                  <span className="status-dot" />
                  Brain warm — answer in {suchDauerMs ?? 0} ms
                </span>
              )}
              {/* Die Zahl muss zu den gezeigten Karten passen: hier stand vorher das
                  LOKALE Ranking (150 Treffer), waehrend die Liste daneben die 261
                  Treffer der Server-Engine zeigte. Zwei Zahlen fuer dieselbe Sache. */}
              {semanticEnabled && debouncedSearchQuery.trim().length >= 2 && effectiveScored && effectiveScored.length > 0 && (
                <span
                  className="chip tnum"
                  title={`${effectiveScored.length} hits · similarity of the best match ${Math.round(effectiveScored[0].cosineScore * 100)} %`}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--ok)' }} />
                  <span>{effectiveScored.length} {effectiveScored.length === 1 ? 'hit' : 'hits'}</span>
                  {/* Nicht der Fusionswert: der ist ein RRF-Rohwert (rund 0,02) und
                      ergibt als Prozentzahl "best 2 %" — hier steht die echte
                      Vektor-Aehnlichkeit, oder gar nichts, wenn ohne Vektoren gesucht wird. */}
                  {effectiveScored[0].cosineScore > 0 && (
                    <span style={{ color: 'var(--text-3)' }}>best {Math.round(effectiveScored[0].cosineScore * 100)} %</span>
                  )}
                </span>
              )}
              {semanticEnabled && debouncedSearchQuery.trim().length >= 2 && effectiveScored && effectiveScored.length === 0 && (
                <span className="chip" style={{ color: 'var(--warn)' }}>
                  <AlertCircle className="w-3 h-3" /> No matches
                </span>
              )}
              {!semanticEnabled && debouncedSearchQuery.trim() && (
                <span className="chip tnum">{displayedMemories.length} {displayedMemories.length === 1 ? 'hit' : 'hits'}</span>
              )}

              <span
                className="chip"
                title={inbox?.inboxDir ? `Inbox folder: ${inbox.inboxDir}` : 'Watch the inbox folder'}
              >
                <UploadCloud className="w-3 h-3" style={{ color: inbox?.watching ? 'var(--ok)' : 'var(--text-3)' }} />
                {inbox ? `${inbox.files.length} in Inbox` : 'Inbox…'}
                <button
                  onClick={handleInboxScan}
                  disabled={inboxScanBusy}
                  className="ml-0.5 -mr-1 px-1 rounded text-[10px] font-semibold hover:opacity-80 disabled:opacity-40"
                  style={{ color: 'var(--accent)' }}
                  title="Scan the inbox now and import"
                >
                  {inboxScanBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Scan'}
                </button>
              </span>

              {duplicateGroups.length === 0 ? (
                <span className="chip hidden lg:inline-flex" title="Nothing to do — the knowledge base has no obvious duplicates">
                  <CheckCircle2 className="w-3 h-3" style={{ color: 'var(--ok)' }} /> Clean
                </span>
              ) : (
                <button
                  onClick={() => setDuplicatesOpen(true)}
                  className="chip"
                  style={{ color: 'var(--warn)', background: 'var(--warn-soft)', borderColor: 'transparent', cursor: 'pointer' }}
                  title="Review every duplicate side by side and remove the copies you do not want"
                >
                  <AlertCircle className="w-3 h-3" /> {duplicateCount} duplicate{duplicateCount === 1 ? '' : 's'}
                  <span className="ml-1 font-semibold underline underline-offset-2">Review</span>
                </button>
              )}
            </div>
          </div>

          {/* Quellen: Datei-Import + URL-Clipper — eine Fläche, eine Geste */}
          <div className="px-5 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className="import-band"
              data-drag={dragOver}
            >
              <div className="flex-1 flex items-center gap-3 px-4 py-3">
                {importing ? <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: "var(--accent)" }} /> : <UploadCloud className="w-4 h-4 shrink-0" style={{ color: dragOver ? "var(--accent)" : "var(--text-3)" }} />}
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate" style={{ color: "var(--text-1)" }}>
                    {importing ? "Importing…" : dragOver ? "Drop to import" : "Drag files here"}
                    <span className="hidden sm:inline font-normal" style={{ color: "var(--text-3)" }}> — PDF, MD, TXT, JSON</span>
                  </div>
                  {importMsg && <div className="text-[11px] mt-0.5 flex items-center gap-1" style={{ color: "var(--ok)" }}><CheckCircle2 className="w-3 h-3" />{importMsg}</div>}
                  {importErr && <div className="text-[11px] mt-0.5 flex items-center gap-1" style={{ color: "var(--danger)" }}><AlertCircle className="w-3 h-3" />{importErr}</div>}
                </div>
                <label className="btn-ghost px-3 py-1.5 text-xs font-medium cursor-pointer shrink-0">
                  Choose
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
              <div className="import-divider hidden md:block" />
              <div className="hidden lg:flex items-center px-4 py-3 shrink-0">
                <button
                  onClick={() => setScanOpen(true)}
                  className="btn-ghost px-3 py-1.5 text-xs font-medium flex items-center gap-1.5"
                  title="Let KEPTA look through this computer for documents — you see what would be imported before anything is read"
                >
                  <HardDriveDownload className="w-3.5 h-3.5" /> Scan this computer
                </button>
              </div>
              <div className="import-divider hidden lg:block" />
              <div className="flex-1 hidden md:flex items-center gap-2.5 px-4 py-3">
                <Globe className="w-4 h-4 shrink-0" style={{ color: "var(--text-3)" }} />
                <input
                  ref={clipInputRef}
                  value={clipUrl}
                  onChange={(e) => setClipUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleClip(); }}
                  placeholder="Paste a URL and import…"
                  className="flex-1 min-w-0 bg-transparent text-sm outline-none"
                  style={{ color: "var(--text-1)" }}
                />
                <button
                  onClick={handleClip}
                  disabled={clipping || !clipUrl.trim()}
                  className="btn-ghost px-3 py-1.5 text-xs font-medium shrink-0 disabled:opacity-40"
                >
                  {clipping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Import'}
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
              {/* Persönlicher Kopf — Datum als Zeile, Aussage als Display */}
              <div className="mb-4 shrink-0">
                <h1 className="display">
                  {greeting}{profileName ? `, ${profileName}` : ''}
                </h1>
                <p className="text-[13px] mt-1" style={{ color: 'var(--text-2)' }}>
                  {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                  {agentActive ? ' — an agent is working right now' : ''}
                </p>
              </div>

              {/* Übersicht — der Index-Streifen: eine dominante Zahl, leise Zweitgrößen */}
              <div className="index-strip mb-4 shrink-0 flex-wrap gap-y-3">
                <div className="index-cell" style={{ flex: '0 1 auto' }}>
                  <span className="num-hero">{memories.length}</span>
                  <span className="k">{memories.length === 1 ? 'entry in the index' : 'entries in the index'}</span>
                </div>
                <div className="index-cell">
                  <span className="v" style={{ gap: 10 }}>
                    <span style={{ color: 'var(--type-semantic)' }}>{typeCounts.semantic} <span className="text-[10px] opacity-70">{t('legend.facts')}</span></span>
                    <span style={{ color: 'var(--type-episodic)' }}>{typeCounts.episodic} <span className="text-[10px] opacity-70">{t('legend.events')}</span></span>
                    <span style={{ color: 'var(--type-procedural)' }}>{typeCounts.procedural} <span className="text-[10px] opacity-70">{t('legend.howtos')}</span></span>
                    <span style={{ color: 'var(--type-reference)' }}>{typeCounts.reference} <span className="text-[10px] opacity-70">{t('legend.documents')}</span></span>
                  </span>
                  <span className="k">facts, events, how-tos</span>
                </div>
                <div className="index-cell">
                  <span className="v">{allTags.length}</span>
                  <span className="k">categories</span>
                </div>
                <div className="index-cell ml-auto">
                  <span className="v">
                    {agentActive ? <span className="agent-dot" /> : <span className="status-dot" />}
                    {agentActive ? 'Agent working' : 'In sync'}
                  </span>
                  <span className="k">local, private, MCP</span>
                </div>
              </div>

              <div className="flex items-center justify-between mb-3 shrink-0">
                <div className="flex items-center gap-2.5 text-[12px] tnum" style={{ color: 'var(--text-3)' }}>
                  <span>{displayedMemories.length} of {tagFiltered.length} entries</span>
                  {semanticEnabled && debouncedSearchQuery.trim().length >= 2 && (
                    serverTotal !== null && serverTotal > displayedMemories.length ? (
                      <button
                        onClick={() => setTopK(0)}
                        className="chip !py-px"
                        style={{ color: 'var(--warn)', cursor: 'pointer' }}
                        title="More notes match this topic than are shown — click to show all of them"
                      >
                        {displayedMemories.length} of {serverTotal} matches · show all
                      </button>
                    ) : (
                      <span className="chip !py-px">{topK === 0 ? 'All matches' : `Top ${topK}`}</span>
                    )
                  )}
                </div>
                <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-3)' }}>
                  {agentActive ? (
                    <>
                      <span className="agent-dot" />
                      <span style={{ color: 'var(--accent)', fontWeight: 560 }}>Agent active</span>
                    </>
                  ) : (
                    <span className="status-dot" title="Local storage in sync" />
                  )}
                </div>
              </div>

              {displayedMemories.length === 0 && !initialLoaded ? (
                <div className="flex flex-col ledger">
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
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)', boxShadow: 'inset 0 1px 0 var(--edge-light)' }}>
                    <KeptaMark size={34} radius={8} />
                  </div>
                  <h3 className="text-[15px] font-semibold mb-1.5" style={{ color: 'var(--text-1)' }}>
                    {debouncedSearchQuery || selectedTags.length > 0 ? 'No matches' : 'No entries yet'}
                  </h3>
                  <p className="text-[13px] max-w-sm mx-auto leading-relaxed" style={{ color: 'var(--text-2)' }}>
                    {debouncedSearchQuery || selectedTags.length > 0
                      ? semanticEnabled && debouncedSearchQuery.trim().length >= 2
                        ? `Nothing found for “${debouncedSearchQuery.trim().slice(0, 48)}”. Try different terms, raise the result count, or switch to keyword search.`
                        : "No entries match the search criteria."
                      : "Drop files here, import a URL, or start with “New” — agents write into the very same base over MCP."}
                  </p>
                  {semanticEnabled && debouncedSearchQuery.trim().length >= 2 && displayedMemories.length === 0 && (
                    <button onClick={() => setSemanticEnabled(false)} className="mt-4 btn-ghost px-3.5 py-2 rounded-lg text-[13px] font-medium">
                      Switch to keyword search
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="apple-seg mb-3" role="group" aria-label="Grouping of the list">
                    {([['alle', t('list.all')], ['datei', t('list.byFile')], ['typ', t('list.byType')], ['zeitraum', t('list.period')]] as const).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setGruppierung(key)}
                        disabled={!!debouncedSearchQuery.trim()}
                        className="apple-seg-btn text-[11px] font-medium disabled:opacity-40"
                        data-on={effektivGruppierung === key ? "true" : "false"}
                        title={debouncedSearchQuery.trim()
                          ? 'Grouping is off while you search — results are ranked by relevance'
                          : key === 'alle' ? 'Flat grid, newest relevance first'
                          : key === 'datei' ? 'Group all chunks under their source file or link'
                          : key === 'typ' ? 'Facts, Events, How-tos, Documents'
                          : 'Today, this week, older'}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {listenInhalt}
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
            <div className="text-[12px] tnum" style={{ color: 'var(--text-3)' }}>{memories.length} entries · connected through tags, similarity and knowledge entities</div>
            <div className="ml-auto">
              <button onClick={() => setCurrentView("memories")} className="btn-ghost px-2.5 py-1.5 rounded-md text-xs font-medium">Back to the list</button>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <KnowledgeGraph memories={memories} sichtbar={currentView === 'graph'} onSelectMemory={(m) => { setEditingMemory(m); setIsEditorOpen(true); }} />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={cn("flex-1 px-5 h-full overflow-y-auto", currentView === 'today' ? 'block' : 'hidden')}
        >
          <TodayView aktiv={currentView === 'today'} onOpenMemory={oeffneNotiz} onGo={(v) => setCurrentView(v)} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={cn("flex-1 px-5 h-full overflow-y-auto", currentView === 'dossier' ? 'block' : 'hidden')}
        >
          <DossierView onOpenMemory={oeffneNotiz} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={cn("flex-1 px-5 h-full overflow-y-auto", currentView === 'activity' ? 'block' : 'hidden')}
        >
          <ActivityView aktiv={currentView === 'activity'} onOpenMemory={oeffneNotiz} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={cn("flex-1 px-5 h-full overflow-y-auto", currentView === 'team' ? 'block' : 'hidden')}
        >
          <TeamView aktiv={currentView === 'team'} />
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
        {vorschauMemory && (
          <MemoryPreview
            memory={vorschauMemory}
            onClose={() => setVorschauMemory(null)}
            onEdit={(m) => { setVorschauMemory(null); setEditingMemory(m); setIsEditorOpen(true); }}
          />
        )}
      </AnimatePresence>

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
      <MachineScan
        open={scanOpen}
        autoPreview={scanAusAssistent}
        onClose={() => { setScanOpen(false); setScanAusAssistent(false); }}
        onImported={(n) => {
          void refreshMemories();
          if (n > 0) toast.push({ message: `${n} notes imported from this computer — tagged “machine-scan”.`, kind: 'info' });
        }}
      />
      <DuplicatesPanel
        memories={memories}
        open={duplicatesOpen}
        onClose={() => { setDuplicatesOpen(false); setDismissedPairs(loadDismissed()); }}
        onDelete={handleDelete}
        onDeleteMany={handleDeleteMany}
        onOpenMemory={(m) => { setDuplicatesOpen(false); setEditingMemory(m); setIsEditorOpen(true); }}
      />
      <ShortcutsSheet open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {upgradeOffen && (
        <ProUpgrade
          onClose={() => setUpgradeOffen(false)}
          onActivated={(neu) => { setLizenz(neu); setLizenzWiderrufen(false); setUpgradeOffen(false); }}
          revoked={lizenzWiderrufen}
          upgradeUrl={upgradeUrl}
          checkoutLive={checkoutLive}
          protagRestMs={!lizenz && (protag?.aktiv ?? false) ? (protag?.restMs ?? null) : null}
        />
      )}
    </div>
  );
}

// Shortcuts-Cheat-Sheet (per „?“)
const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: '⌘K', action: 'Command palette — quick actions and search' },
  { keys: '⌘N', action: 'New knowledge node' },
  { keys: '?', action: 'This overview' },
  { keys: 'Esc', action: 'Close dialog' },
  { keys: '⌘1–4', action: 'Knowledge, Chat, Graph, Settings' },
  { keys: '⌘5–7', action: 'Today, Dossier, Activity' },
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
            <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--text-1)' }}>Shortcuts</h3>
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
            <p className="hud-label mt-4">Agents use the same brain over MCP — watch the activity live in the index.</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
