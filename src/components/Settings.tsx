import { useState, useEffect, useRef, FormEvent } from 'react';
import { Key, ShieldCheck, SettingsIcon, Download, CheckCircle2, AlertTriangle, RefreshCw, Cpu, HardDriveDownload, Server, Plug, Copy, Terminal, Braces, Globe, Search, Save, Layers, ExternalLink, Sparkles } from "../lib/icons";
import { motion } from 'motion/react';
import { PROVIDERS, providerById, loadAISettings, hydrateAISettings, saveAISettings, kiSchluesselStatus, type AISchluesselStatus, type AISettings } from '../lib/ai';
import { AUTO_LEARN_TIMEOUT_MS } from '../lib/autolearn';
import { refreshMemories } from '../lib/store';
import { SystemStatus } from './SystemStatus';
import PraxisSync from './PraxisSync';
import { KeptaMark } from './KeptaMark';
import { getZoom, setZoom as speichereZoom, wendeZoomAn } from '../lib/uiText';
import { sendJson } from '../lib/api';
import { TRAEGER_LABELS, TRAEGER_REIHENFOLGE, THEMA_LABELS, THEMA_REIHENFOLGE, type Traeger, type Thema } from '../lib/graphHierarchy';
import { PrivacyShield } from './PrivacyShield';
import { ConnectApps } from './ConnectApps';
import { useSuchPrefs, leseTreffer, normalisiereTreffer, schreibeTreffer, SUCH_PREFS_EVENT, RESULT_STOPS, SUCH_TIEFE_MIN, SUCH_TIEFE_MAX, SUCH_TIEFE_DEFAULT } from '../lib/searchPrefs';

/** Was die Import-Reparatur gefunden (Vorschau) oder getan hat (fertig). */
type ReparaturStand = {
  geprueft: number; dateien: number; aktualisiert: number; entfernt: number;
  erstellt: number; clips: number; fehler?: string[];
};

function beschreibeReparatur(s: ReparaturStand, fertig: boolean): string {
  const saetze: string[] = [];
  if (s.dateien > 0) {
    saetze.push(`${s.dateien} ${s.dateien === 1 ? 'file' : 'files'} ${fertig ? 'read again' : 'would be read again'} — ${s.aktualisiert} parts updated, ${s.entfernt} moved to the trash, ${s.erstellt} added.`);
  }
  if (s.clips > 0) {
    const verlieren = s.clips === 1 ? 'would lose its menu lines' : 'would lose their menu lines';
    saetze.push(`${s.clips} web ${s.clips === 1 ? 'clip' : 'clips'} ${fertig ? 'cleaned of menu lines' : verlieren}.`);
  }
  if (saetze.length === 0) {
    saetze.push(`${s.geprueft} imported ${s.geprueft === 1 ? 'file' : 'files'} checked — everything reads fine, nothing to repair.`);
  }
  if (s.fehler && s.fehler.length > 0) saetze.push(`Could not read: ${s.fehler.join('; ')}`);
  return (fertig ? 'Done: ' : '') + saetze.join(' ');
}

type TabId = 'system' | 'mcp' | 'sync';

// Immer der eigene Origin — die App läuft hinter Vite-Dev wie hinter dem
// Electron-Server auf zufälligem Port gleich mit.
const API_BASE = typeof window !== 'undefined' ? window.location.origin : '';
// Der Normalfall: npx holt das veroeffentlichte Paket. Kein Pfad, den jemand
// falsch abtippen kann — der haeufigste Grund, warum die Verbindung nicht steht.
const MCP_JSON_NPX = `{
  "mcpServers": {
    "kepta": {
      "command": "npx",
      "args": ["-y", "kepta-mcp"]
    }
  }
}`;
// Fuer alle, die aus dem eigenen Checkout starten wollen.
const MCP_JSON_BUILT = `{
  "mcpServers": {
    "kepta": {
      "command": "node",
      "args": ["/PATH/TO/K3PTA-REPO/dist/mcp-server.cjs"]
    }
  }
}`;
const CLAUDE_PATHS = [
  { os: 'macOS', pfad: '~/Library/Application Support/Claude/claude_desktop_config.json' },
  { os: 'Windows', pfad: '%APPDATA%\\Claude\\claude_desktop_config.json' },
];

/**
 * Was die lokale Tür advertiert, steht bei der Tür — nicht in diesem Text.
 * Die Fläche zeigte drei Werkzeuge, während `GET /api/health` auf demselben
 * Schirm acht meldete (`server/router/system.ts:45`, `src/core/mcp.ts:84`).
 */
type McpWerkzeug = {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: { properties?: Record<string, unknown>; required?: unknown };
};

/** Ikonen sind Schmuck; die Namen kommen von der Tür. */
const WERKZEUGIKON: Record<string, typeof Search> = {
  memory_search: Search,
  memory_save: Save,
  memory_list: Layers,
};

/** Erster Satz der Werkzeugbeschreibung, an einer Wortgrenze gekappt. */
function bescheid(w: McpWerkzeug): string {
  const satz = ((w.description ?? '').trim().split(/(?<=[.!?])\s/)[0] ?? '').trim();
  if (satz.length <= 110) return satz;
  const knappe = satz.slice(0, 110);
  const letzteLuecke = knappe.lastIndexOf(' ');
  return `${knappe.slice(0, letzteLuecke > 60 ? letzteLuecke : 110).trimEnd()}…`;
}

/** Die Felder der Tür als Kurzform: Pflicht ohne ?, alles andre mit ?. */
function schemaKurz(w: McpWerkzeug): string {
  const eigentum = w.inputSchema?.properties ?? {};
  const pflicht = new Set(Array.isArray(w.inputSchema?.required) ? (w.inputSchema.required as unknown[]).map(String) : []);
  const teile = Object.keys(eigentum).map((k) => `${k}${pflicht.has(k) ? '' : '?'}`);
  return teile.length ? `{ ${teile.join(', ')} }` : '{}';
}

/** #26 Regel 1 — EINE Lebensdauer fuer alle persistierenden Quittungen.
 *  Vorher: 2 000 ms Verbindung, 6 000 ms Sicherung, 1 800 ms Auto-learn und
 *  1 800 ms Extraktionsmodell — vier Stellen, drei Zahlen. Eine Bestaetigung, die
 *  verschwindet, bevor der Mensch den Kopf hebt, ist keine. */
const QUITTUNG_MS = 6_000;

/** #26 Richtung B — die Meldung gehoert an die Zeile, die sich geaendert hat.
 *  Sie traegt ihren Ort selbst ("data-quittung"), damit ein Fall zaehlen kann,
 *  wie viele Meldungen im Blatt stehen und wo. */
function Meldung({ meldung, ort }: { meldung: { ort: string; text: string } | null; ort: string }) {
  if (!meldung || meldung.ort !== ort) return null;
  return (
    <p data-quittung={ort} className="text-xs mt-2 flex items-center gap-1.5" style={{ color: 'var(--ok)' }}>
      <CheckCircle2 className="w-3.5 h-3.5" /> {meldung.text}
    </p>
  );
}

export function Settings() {
  const [activeTab, setActiveTab] = useState<TabId>('system');
  const [zoom, setZoomState] = useState<number>(getZoom());

  const setZoom = (z: number) => { setZoomState(z); speichereZoom(z); wendeZoomAn(); };

  // --- Suche (Paket 2 — UI-Parität): Suchtiefe, Spuren, Treffer ---
  const [suchPrefs, setzeSuchPrefs] = useSuchPrefs();
  const [treffer, setTrefferState] = useState<number>(leseTreffer);
  const setzeTreffer = (v: number) => {
    setTrefferState(normalisiereTreffer(v));
    schreibeTreffer(v);
  };
  // Der Dashboard-Regler schreibt dieselben Schlüssel — live nachziehen.
  useEffect(() => {
    const on = () => setTrefferState(leseTreffer());
    window.addEventListener(SUCH_PREFS_EVENT, on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener(SUCH_PREFS_EVENT, on); window.removeEventListener('storage', on); };
  }, []);

  // --- System-Tab state (bestehend) ---
  const [settings, setSettings] = useState<AISettings>(loadAISettings());
  const [saved, setSaved] = useState(false);
  const [meldung, setMeldung] = useState<{ ort: string; text: string } | null>(null);
  const ortZuletzt = useRef<string | null>(null);   // null = es wurde noch keine Zeile angefasst
  // Die Quittung lebt zwei Sekunden ab der LETZTEN Speicherung. Ohne den Griff auf
  // den laufenden Timer nahm der erste Speichern-Knopf dem zweiten die Bestaetigung
  // weg: wer innerhalb von zwei Sekunden zweimal speicherte, sah "Save" statt der
  // Quittung, die er gerade ausgelost hatte (gemessen 16.10. 15:32:29).
  const quittung = useRef<number | undefined>(undefined);
  const [sicherung, setSicherung] = useState<{ knoten: number } | { fehler: string } | null>(null);
  /**
   * Nachsortieren nach Wissensart.
   *
   * Noetig, weil die Zuordnung frueher niemand vornahm: der Rechner-Scan setzte
   * gar keinen Typ, also fiel alles auf "Fakt" zurueck. Erst schauen, dann —
   * nach ausdruecklicher Bestaetigung — schreiben.
   */
  const [sortierVorschau, setSortierVorschau] = useState<{ changed: number; after: Record<string, number> } | null>(null);
  const [bestandGruppen, setBestandGruppen] = useState<{ bestand: number; traeger: Record<Traeger, number>; themen: Record<Thema, number> } | null>(null);
  const [sortiertLaeuft, setSortiertLaeuft] = useState(false);
  const [sortiertFertig, setSortiertFertig] = useState<number | null>(null);
  /**
   * Importe neu lesen (POST /api/repair/imports) — erst zaehlen, dann auf
   * Bestaetigung schreiben. In 2.10.0 gab es die Reparatur nur als API: wer
   * alte, unlesbare PDF-Importe hatte, kam aus der App heraus nicht an sie heran.
   */
  const [reparaturVorschau, setReparaturVorschau] = useState<ReparaturStand | null>(null);
  const [reparaturFertig, setReparaturFertig] = useState<ReparaturStand | null>(null);
  const [reparaturLaeuft, setReparaturLaeuft] = useState(false);
  const [reparaturFehler, setReparaturFehler] = useState<string | null>(null);
  const pruefeImporte = async (anwenden: boolean) => {
    setReparaturLaeuft(true);
    setReparaturFehler(null);
    try {
      const stand = await sendJson<ReparaturStand>('/api/repair/imports', anwenden ? { apply: true } : {});
      if (anwenden) { setReparaturFertig(stand); setReparaturVorschau(null); }
      else setReparaturVorschau(stand);
    } catch {
      setReparaturFehler(anwenden
        ? 'The repair could not be completed. Check again to see what is left.'
        : 'The imported files could not be checked — is the local server running?');
    } finally {
      setReparaturLaeuft(false);
    }
  };
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [autoLearn, setAutoLearn] = useState<boolean>(()=>{ try{ return localStorage.getItem('ki_gehirn_autolearn') === 'true'; }catch{ return false; }});
  const [autoLearnSaved, setAutoLearnSaved] = useState(false);
  const [extractModel, setExtractModel] = useState<string>(()=>{ try{ return loadAISettings().extractModel ?? ''; }catch{ return ''; }});
  const [extractSaved, setExtractSaved] = useState(false);
  /**
   * Wo der KI-Schluessel wirklich liegt (F13): versiegelt mit dem
   * Datenbankschluessel dieser Installation, oder — wenn es den nicht gibt —
   * gar nicht. Der Satz darunter sagt beides, denn der zweite Fall ist der,
   * in dem jemand nach dem Neustart vor einem leeren Feld steht.
   */
  const [schluesselHuelle, setSchluesselHuelle] = useState<AISchluesselStatus | null>(null);
  useEffect(() => {
    let gueltig = true;
    kiSchluesselStatus().then((s) => { if (gueltig) setSchluesselHuelle(s); });
    return () => { gueltig = false; };
  }, []);

  // --- MCP-Tab state ---
  const [copied, setCopied] = useState<string | null>(null);
  const [health, setHealth] = useState<{ ok?: boolean; count?: number; uptime?: number; mcp?: { stdio?: { command: string; args: string[]; env: Record<string, string> } | null } } | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [werkzeuge, setWerkzeuge] = useState<McpWerkzeug[]>([]);
  const [werkzeugeFehler, setWerkzeugeFehler] = useState<string | null>(null);

  const provider = providerById(settings.providerId);
  // In der fertigen App: der mitgelieferte MCP-Server, gestartet vom K3PTA-Programm
  // selbst — kein Node.js, kein npm. Außerhalb der App bleibt es beim Weg über npx.
  const mcpAusApp = health?.mcp?.stdio ? JSON.stringify({ mcpServers: { kepta: health.mcp.stdio } }, null, 2) : null;

  // Organisation: die verwaltete Konfiguration für das Admin-Panel. Eine Lizenz
  // gehört hier nicht mehr her — die App hat keine (09.10.2026).
  const [orgInfo, setOrgInfo] = useState<{
    managed: boolean;
    policies: Record<string, string>;
  } | null>(null);
  useEffect(() => {
    const lade = () => {
      void (async () => {
        try {
          const richtlinien = await fetch('/api/policies').then(r => r.json()).catch(() => null);
          if (!richtlinien) return;
          setOrgInfo({
            managed: richtlinien.managed === true,
            policies: richtlinien.policies ?? {},
          });
        } catch { /* Settings bleibt ohne Organisations-Panel */ }
      })();
    };
    lade();
    // Die Datei kann im Betrieb geändert werden: bei Fokus frisch zeigen.
    window.addEventListener('focus', lade);
    document.addEventListener('visibilitychange', lade);
    return () => {
      window.removeEventListener('focus', lade);
      document.removeEventListener('visibilitychange', lade);
    };
  }, []);

  // Auto-Erkennung für lokale Modelle: Ollama/LM Studio sofort + alle 12s + bei Fenster-Fokus
  useEffect(() => {
    const isLocal = !provider.needsKey || settings.baseUrl.includes('localhost') || settings.baseUrl.includes('127.0.0.1');
    if (!isLocal) return;
    let cancelled = false;
    const silentLoad = async () => {
      try {
        const res = await fetch('/api/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            protocol: provider.protocol,
            baseUrl: settings.baseUrl || provider.baseUrl,
            apiKey: settings.apiKey === 'local' ? '' : settings.apiKey,
          }),
        });
        const data = await res.json();
        if (!cancelled && res.ok && Array.isArray(data.models)) {
          setModels(prev => {
            const next = (data.models as string[]).sort();
            // nur updaten wenn sich Liste ändert, um Flackern zu vermeiden
            if (prev.length === next.length && prev.every((v,i) => v === next[i])) return prev;
            return next;
          });
          setModelError(null);
        }
      } catch { /* silent for auto-poll */ }
    };
    silentLoad();
    const id = setInterval(silentLoad, 12000);
    const onFocus = () => silentLoad();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { cancelled = true; clearInterval(id); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [settings.providerId, settings.baseUrl, provider.needsKey, provider.protocol]);

  // Für Remote-Anbieter mit Key: einmalig beim Open auto-laden (kein Polling, um Rate-Limits zu schonen)
  useEffect(() => {
    const isLocal = !provider.needsKey || settings.baseUrl.includes('localhost') || settings.baseUrl.includes('127.0.0.1');
    if (isLocal) return;
    if (!settings.apiKey || settings.apiKey === 'local') return;
    let cancelled = false;
    const loadOnce = async () => {
      try {
        const res = await fetch('/api/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ protocol: provider.protocol, baseUrl: settings.baseUrl || provider.baseUrl, apiKey: settings.apiKey }),
        });
        const data = await res.json();
        if (!cancelled && res.ok && Array.isArray(data.models)) {
          setModels((data.models as string[]).sort());
          setModelError(null);
        }
      } catch { /* silent */ }
    };
    loadOnce();
    const onFocus = () => loadOnce();
    window.addEventListener('focus', onFocus);
    return () => { cancelled = true; window.removeEventListener('focus', onFocus); };
  }, [settings.providerId, settings.baseUrl, settings.apiKey, provider.needsKey, provider.protocol]);

  // Jemand, der gleich nach dem Start in die Einstellungen klickt, trifft die
  // Rehydrierung des Dashboard noch laufend an — die Messung aus dem gebauten
  // Buendel liess das Feld leer. Also selbst nachholen, dann nachziehen.
  useEffect(() => {
    let gueltig = true;
    hydrateAISettings().then((s) => {
      if (!gueltig) return;
      setSettings(s);
      setExtractModel(s.extractModel ?? '');
    });
    return () => { gueltig = false; };
  }, []);

  useEffect(() => {
    if (activeTab !== 'mcp') return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/health`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (!cancelled) { setHealth(d); setHealthError(null); }
      } catch (e: unknown) {
        if (!cancelled) setHealthError(e instanceof Error ? e.message : String(e));
      }
      // Dieselbe Tür, die auch die Agenten lesen: was sie advertiert, wird
      // gezeigt. Ein Fetch, ein Tab — und keine Zahl, die die Fläche erfindet.
      try {
        const t = await fetch(`${API_BASE}/api/mcp/tools`);
        if (!t.ok) throw new Error(`HTTP ${t.status}`);
        const d = await t.json();
        const liste = Array.isArray((d as { tools?: unknown })?.tools) ? (d as { tools: McpWerkzeug[] }).tools : null;
        if (!cancelled) {
          setWerkzeuge(liste ?? []);
          setWerkzeugeFehler(liste ? null : 'The tool list did not arrive — the local server answered without a list.');
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setWerkzeuge([]);
          setWerkzeugeFehler(`The tool list could not be read: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [activeTab]);

  const update = (patch: Partial<AISettings>) => {
    if (patch.providerId !== undefined) ortZuletzt.current = "anbieter";
    if (patch.baseUrl !== undefined) ortZuletzt.current = "endpunkt";
    if (patch.apiKey !== undefined) ortZuletzt.current = "schluessel";
    if (patch.model !== undefined) ortZuletzt.current = "modelle";
    setSettings(prev => ({ ...prev, ...patch }));
  };

  const selectProvider = (id: string) => {
    const p = providerById(id);
    setModels([]);
    setModelError(null);
    update({
      providerId: id,
      baseUrl: p.baseUrl,
      model: p.defaultModel,
      apiKey: p.needsKey ? (id === settings.providerId ? settings.apiKey : '') : 'local',
    });
  };

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    saveAISettings(settings);
    setSaved(true);
    // #26, leerer Zustand: eine Meldung an einer Zeile, die niemand angefasst hat, ist
    // eine Behauptung. Gemalt wird nur, wo etwas stand — und danach ist nichts mehr an.
    setMeldung(ortZuletzt.current ? { ort: ortZuletzt.current, text: 'Saved — the change is on this computer.' } : null);
    ortZuletzt.current = null;
    window.clearTimeout(quittung.current);
    quittung.current = window.setTimeout(() => { setSaved(false); setMeldung(null); }, QUITTUNG_MS);
  };

  // Beim Verlassen der Platte darf kein Timer nachlaufen.
  useEffect(() => () => window.clearTimeout(quittung.current), []);

  const loadModels = async () => {
    setLoadingModels(true);
    setModelError(null);
    try {
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protocol: provider.protocol,
          baseUrl: settings.baseUrl || provider.baseUrl,
          apiKey: settings.apiKey === 'local' ? '' : settings.apiKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load the models');
      setModels(data.models || []);
      if (!data.models?.length) setModelError('No models found. Is the service running?');
    } catch (err: unknown) {
      setModelError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingModels(false);
    }
  };

  /**
   * Die Sicherung holt den Bestand, nicht den Seiten-Cache. Vorher gab
   * `getMemoriesSync()` den Cache aus `fetch('/api/memories')` zurück — eine
   * Seite von `SEITE_STD = 100` (server/helfer/api-form.ts:78), und auf frischem
   * Start gar nichts, weil der Cache erst nach dem ersten Refresh gefüllt ist.
   * Die Fläche meldete in beiden Fällen „Backup created". Ein Knopf, der
   * „every memory node" verspricht, darf nicht fragen, was ein Fenster zufällig
   * geladen hat.
   */
  const handleExport = async () => {
    setSicherung(null);
    let knoten: unknown[];
    try {
      const res = await fetch('/api/memories?alle=1');
      if (!res.ok) {
        setSicherung({ fehler: `Backup failed — the memory service answered ${res.status}. No file was written.` });
        return;
      }
      const daten = await res.json();
      knoten = Array.isArray(daten) ? daten
        : Array.isArray((daten as { memories?: unknown[] })?.memories) ? (daten as { memories: unknown[] }).memories : [];
    } catch {
      setSicherung({ fehler: 'Backup failed — the memory service did not answer. No file was written.' });
      return;
    }
    const blob = new Blob([JSON.stringify(knoten, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge_base_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setSicherung({ knoten: knoten.length });
    setTimeout(() => setSicherung(null), QUITTUNG_MS);
  };

  /** KI-Verlauf (ChatGPT/Claude-Export) übernehmen — WS5: „Switch to K3PTA, keep your memory." */
  const chatImportFeld = useRef<HTMLInputElement>(null);
  const [chatImportLaeuft, setChatImportLaeuft] = useState(false);
  const [chatImportErgebnis, setChatImportErgebnis] = useState<{ format: string; conversations: number; imported: number; emptyConversations: number } | null>(null);
  const [chatImportFehler, setChatImportFehler] = useState<string | null>(null);
  const importiereChatVerlauf = async (datei: File) => {
    setChatImportLaeuft(true);
    setChatImportFehler(null);
    setChatImportErgebnis(null);
    try {
      const content = await datei.text();
      const r = await fetch('/api/import/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setChatImportFehler(d.error ?? `The server rejected the file (${r.status}).`); return; }
      setChatImportErgebnis(d);
      void refreshMemories();
    } catch {
      setChatImportFehler('The export could not be read — is the file a valid conversations.json?');
    } finally {
      setChatImportLaeuft(false);
    }
  };

  /**
   * Kopieren mit ehrlicher Rueckmeldung.
   *
   * Vorher stand hier ein blankes await ohne Absicherung: ohne Zwischenablage
   * (fehlende Berechtigung, unsicherer Kontext) scheiterte der Aufruf, der
   * Nutzer bekam GAR keine Rueckmeldung und im Protokoll landete eine
   * unbehandelte Ausnahme.
   */
  const copy = async (text: string, id: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      setCopied(id);
    } catch {
      setCopied(`error:${id}`);
    }
    setTimeout(() => setCopied(null), 2000);
  };

  const inputClass = "hud-input w-full rounded-xl px-4 py-3 text-sm";

  return (
    <div className="max-w-2xl mx-auto py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="hud-panel rounded-2xl p-6 md:p-8"
      >
        <div className="flex items-center gap-4 mb-6 pb-6" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <KeptaMark size={40} />
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-1)' }}>Settings</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>AI connection, data and MCP</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 p-1 rounded-xl hud-inset">
          <button
            onClick={() => setActiveTab('system')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'system' ? 'bg-white dark:bg-zinc-800 shadow-sm' : ''}`}
            style={{ color: activeTab === 'system' ? 'var(--text-1)' : 'var(--text-2)' }}
          >
            <Cpu className="w-4 h-4" /> AI &amp; data
          </button>
          <button
            onClick={() => setActiveTab('mcp')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'mcp' ? 'bg-white dark:bg-zinc-800 shadow-sm' : ''}`}
            style={{ color: activeTab === 'mcp' ? 'var(--text-1)' : 'var(--text-2)' }}
          >
            <Plug className="w-4 h-4" /> MCP / API
          </button>
          <button
            onClick={() => setActiveTab('sync')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'sync' ? 'bg-white dark:bg-zinc-800 shadow-sm' : ''}`}
            style={{ color: activeTab === 'sync' ? 'var(--text-1)' : 'var(--text-2)' }}
          >
            <ShieldCheck className="w-4 h-4" /> Device Sync
          </button>
        </div>

        {activeTab === 'sync' && <PraxisSync />}

        {activeTab === 'system' && (
          <div className="space-y-10">
            <SystemStatus />
            <PrivacyShield />

            {/* Suche (Paket 2 — UI-Funktionsparität): was die Engine tut, ist
                hier einstellbar — Suchtiefe, die drei Spuren, Treffer-Anzahl.
                Jede Änderung geht mit dem nächsten Search-Call raus. */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Search className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <h3 className="settings-h" style={{ color: 'var(--text-1)' }}>Search</h3>
              </div>
              <div className="space-y-5">
                <div>
                  <label className="text-xs block mb-1.5" htmlFor="such-tiefe" style={{ color: 'var(--text-3)' }}>
                    Search depth (top-k) · <span className="tnum">{suchPrefs.tiefe}</span>
                  </label>
                  <input
                    id="such-tiefe"
                    type="range"
                    min={SUCH_TIEFE_MIN}
                    max={SUCH_TIEFE_MAX}
                    step={1}
                    value={suchPrefs.tiefe}
                    onChange={(e) => setzeSuchPrefs({ ...suchPrefs, tiefe: parseInt(e.target.value, 10) })}
                    className="w-full"
                    aria-label="Search depth (top-k)"
                    title="How deep the engine searches across all three tracks before ranking. Deeper costs a little time, finds more at the edge."
                  />
                  <div className="text-xs mt-1.5" style={{ color: 'var(--text-3)' }}>
                    The engine fuses BM25, vectors and the knowledge graph to this depth — a value of {SUCH_TIEFE_MIN}–{SUCH_TIEFE_MAX} ({SUCH_TIEFE_DEFAULT} by default).
                  </div>
                </div>

                <div>
                  <span className="text-xs block mb-2" style={{ color: 'var(--text-3)' }}>Retrieval tracks</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {([
                      ['spurBm25', 'BM25', 'Lexical full-text (FTS5) — exact words win'],
                      ['spurVektor', 'Vectors', 'Semantic similarity across languages'],
                      ['spurGraph', 'Graph', 'Mentions of knowledge entities (people, projects, systems)'],
                    ] as const).map(([key, label, beschreibung]) => {
                      const an = suchPrefs[key];
                      return (
                        <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={an}
                            onChange={(e) => setzeSuchPrefs({ ...suchPrefs, [key]: e.target.checked })}
                            aria-label={`Track ${label}`}
                          />
                          <span className="switch" data-on={an}><span className="knob" /></span>
                          <span>
                            <span className="text-[13px] font-medium block" style={{ color: an ? 'var(--text-1)' : 'var(--text-2)' }}>{label}</span>
                            <span className="text-[11px] block" style={{ color: 'var(--text-3)' }}>{beschreibung}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="text-xs mt-1.5" style={{ color: 'var(--text-3)' }}>
                    Switching a track off removes its voice from the ranking — useful to see what each track contributes.
                  </div>
                </div>

                <div>
                  <label className="text-xs block mb-1.5" htmlFor="such-treffer" style={{ color: 'var(--text-3)' }}>
                    Results shown · <span className="tnum">{treffer === 0 ? 'All' : treffer}</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="such-treffer"
                      type="range"
                      min={0}
                      max={RESULT_STOPS.length - 1}
                      step={1}
                      value={Math.max(0, RESULT_STOPS.indexOf(treffer as (typeof RESULT_STOPS)[number]))}
                      onChange={(e) => setzeTreffer(RESULT_STOPS[parseInt(e.target.value, 10)] ?? 5)}
                      className="flex-1"
                      aria-label="Results shown"
                      title="How many hits the index shows. The last step shows everything that matches."
                    />
                    <span className="chip tnum !px-2">{treffer === 0 ? 'All' : treffer}</span>
                  </div>
                  <div className="text-xs mt-1.5" style={{ color: 'var(--text-3)' }}>
                    Same control as the toolbar above the list — both move together.
                  </div>
                </div>
              </div>
            </div>

            <form data-abschnitt="verbindung" onSubmit={handleSave} className="space-y-6">
              <div className="space-y-5">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  <h3 className="settings-h" style={{ color: 'var(--text-1)' }}>Artificial intelligence</h3>
                </div>

                <div>
                  <label className="hud-label block mb-2">Provider</label>
                  <select
                    value={settings.providerId}
                    onChange={(e) => selectProvider(e.target.value)}
                    className={inputClass}
                  >
                    {PROVIDERS.map(p => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                  <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>{provider.hint}</p>
                  <Meldung meldung={meldung} ort="anbieter" />
                </div>

                <div>
                  <label className="flex items-center gap-2 hud-label mb-2">
                    <Key className="w-3.5 h-3.5" />
                    API Key {provider.needsKey ? '' : '(not needed for local providers)'}
                  </label>
                  <input
                    type="password"
                    value={settings.apiKey === 'local' ? '' : settings.apiKey}
                    onChange={(e) => update({ apiKey: e.target.value })}
                    placeholder={provider.needsKey ? 'Paste key…' : 'leave empty'}
                    disabled={!provider.needsKey}
                    className={inputClass}
                  />
                  <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>
                    {!provider.needsKey || schluesselHuelle === null
                      ? 'The key is stored locally on your device and sent straight to the provider.'
                      : schluesselHuelle.verschlossen
                        ? `Sealed with this installation's database key (${schluesselHuelle.ablage ?? 'the system keychain'}) — never returned by the settings API. A working copy stays in this app's local storage on this computer, so the model is reachable after a restart without asking again.`
                        : 'This knowledge base has no database key, so an API key cannot be sealed here. It stays in this window and must be entered again after a restart.'}
                  </p>
                </div>

                <div>
                  <label className="hud-label block mb-2">
                    API endpoint {provider.id === 'custom' ? '(required)' : '(optional override)'}
                  </label>
                  <input
                    type="text"
                    value={settings.baseUrl}
                    onChange={(e) => update({ baseUrl: e.target.value })}
                    placeholder="https://api.example.com/v1"
                    className={inputClass}
                  />
                  <Meldung meldung={meldung} ort="endpunkt" />
                </div>

                <div data-abschnitt="modelle">
                  <label className="hud-label block mb-2">Model</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={settings.model}
                      onChange={(e) => update({ model: e.target.value })}
                      placeholder="e.g. gpt-4o-mini"
                      className={inputClass}
                      list="model-list"
                    />
                    <button
                      type="button"
                      onClick={loadModels}
                      disabled={loadingModels}
                      className="btn-ghost shrink-0 flex items-center gap-2 px-4 rounded-xl text-sm font-medium"
                      title="Load available models from the provider"
                    >
                      <RefreshCw className={`w-4 h-4 ${loadingModels ? 'animate-spin' : ''}`} />
                      Load
                    </button>
                  </div>
                  <datalist id="model-list">
                    {models.map(m => <option key={m} value={m} />)}
                  </datalist>
                  {models.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => e.target.value && update({ model: e.target.value })}
                      className={inputClass + " mt-2"}
                    >
                      <option value="">Loaded models ({models.length})...</option>
                      {models.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  )}
                  {modelError && (
                    <p className="text-xs mt-2" style={{ color: '#f87171' }}>{modelError}</p>
                  )}
                  {!provider.needsKey && models.length > 0 && (
                    <p className="text-xs mt-2 flex items-center gap-1.5" style={{ color: 'var(--ok)' }}><CheckCircle2 className="w-3.5 h-3.5" /> {models.length} local models connected — new downloads appear automatically (every 12s + on focus)</p>
                  )}
                  {!provider.needsKey && models.length === 0 && !loadingModels && !modelError && (
                    <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--text-3)' }}>No local models found. Start Ollama (`ollama serve` + `ollama pull llama3.2`) or LM Studio — they show up here immediately.</p>
                  )}
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl w-full"
              >
                {saved ? (
                  <><ShieldCheck className="w-5 h-5" /> <span>Configuration saved</span></>
                ) : (
                  'Save'
                )}
              </button>
            </form>

            <div className="pt-8 space-y-6" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <div className="rounded-xl p-4" style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: autoLearn ? 'var(--accent-soft)' : 'var(--bg-inset-strong)', border: '1px solid var(--border-subtle)' }}>
                      <Sparkles className="w-4 h-4" style={{ color: autoLearn ? 'var(--accent)' : 'var(--text-3)' }} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold" style={{color:'var(--text-1)'}}>Learn automatically</div>
                      <div className="text-xs" style={{color:'var(--text-2)'}}>Save the key point of every chat answer as an entry (tagged <code>auto-learn</code>). Duplicates are detected.</div>
                    </div>
                  </div>
                  <label className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer shrink-0" style={{ background: autoLearn ? 'var(--accent)' : 'var(--bg-inset-strong)', border: autoLearn ? '1px solid transparent' : '1px solid var(--border-subtle)' }}>
                    <input type="checkbox" aria-label="Auto-learn" checked={autoLearn} onChange={e=>{ const v=e.target.checked; setAutoLearn(v); localStorage.setItem('ki_gehirn_autolearn', String(v)); setAutoLearnSaved(true); setTimeout(()=>setAutoLearnSaved(false),QUITTUNG_MS); }} className="sr-only" />
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${autoLearn ? 'translate-x-6' : 'translate-x-1'}`} />
                  </label>
                </div>
                {autoLearnSaved && <div className="text-xs mt-2 flex items-center gap-1.5" style={{color:'var(--ok)'}}><CheckCircle2 className="w-3.5 h-3.5"/> {autoLearn ? 'Auto-learn active — the brain extends itself' : 'Auto-learn off'}</div>}
                {autoLearn && (
                  <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <label className="text-xs font-semibold block mb-1.5" style={{color:'var(--text-1)'}}>Extraction model <span style={{color:'var(--text-3)'}}>— optional</span></label>
                    <input
                      type="text"
                      value={extractModel}
                      onChange={(e) => setExtractModel(e.target.value)}
                      onBlur={() => { const s = loadAISettings(); saveAISettings({ ...s, extractModel: extractModel.trim() }); setExtractSaved(true); setTimeout(()=>setExtractSaved(false),QUITTUNG_MS); }}
                      placeholder="e.g. llama3.2:3b — empty = the chat model"
                      className="w-full text-sm rounded-lg px-3 py-2"
                      style={{ background: 'var(--bg-inset-strong)', border: '1px solid var(--border-subtle)', color: 'var(--text-1)' }}
                    />
                    {extractSaved && <div className="text-xs mt-1.5 flex items-center gap-1.5" style={{color:'var(--ok)'}}><CheckCircle2 className="w-3.5 h-3.5"/> Saved</div>}
                    <p className="text-xs mt-2 leading-relaxed" style={{color:'var(--text-3)'}}>
                      A small model is plenty for a title and three tags. Large reasoning models take minutes per answer and often return no clean JSON — auto-learn then gives up after {Math.round(AUTO_LEARN_TIMEOUT_MS/1000)} seconds and tells you so.
                    </p>
                  </div>
                )}

                <p className="text-xs mt-2 leading-relaxed" style={{color:'var(--text-3)'}}>The switch lives in <code>localStorage ki_gehirn_autolearn</code>. For every AI answer of 60 characters or more, a short extraction call runs in the background and saves <code>title/tags/summary</code> as a new node. Both success and failure are reported as a notification.</p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-4">
                  <HardDriveDownload className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  <h3 className="settings-h" style={{ color: 'var(--text-1)' }}>Display</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs block mb-1.5" style={{ color: 'var(--text-3)' }}>Text size</label>
                    <select
                      value={String(zoom)}
                      onChange={(e) => { const v = Number(e.target.value); setZoom(v); wendeZoomAn(); }}
                      className="w-full px-3 py-2 rounded-lg text-sm bg-transparent"
                      style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-1)' }}
                    >
                      <option value="100">100 %</option>
                      <option value="115">115 %</option>
                      <option value="130">130 %</option>
                    </select>
                    <div className="text-xs mt-1.5" style={{ color: 'var(--text-3)' }}>Scales the whole interface — handy on high-resolution displays.</div>
                  </div>
                </div>
              </div>

                <div data-abschnitt="sicherung" className="mt-6 pt-6" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <HardDriveDownload className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                    <h3 className="settings-h" style={{ color: 'var(--text-1)' }}>Data management</h3>
                  </div>
                <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>
                  Download every memory node as a JSON backup. Your data lives on this device and nowhere else.
                </p>
                <button
                  onClick={handleExport}
                  className="btn-ghost flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-medium w-full"
                >
                  {sicherung && 'knoten' in sicherung ? (
                    <><CheckCircle2 className="w-5 h-5" style={{ color: 'var(--ok)' }} /> <span style={{ color: 'var(--ok)' }}>Backup created · {sicherung.knoten.toLocaleString('en-US')} nodes</span></>
                  ) : sicherung ? (
                    <><AlertTriangle className="w-5 h-5" style={{ color: 'var(--warn)' }} /> <span style={{ color: 'var(--warn)' }}>{sicherung.fehler}</span></>
                  ) : (
                    <><Download className="w-5 h-5" /> Download JSON backup</>
                  )}
                </button>

                <div className="mt-6 pt-6" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <h3 className="settings-h mb-2" style={{ color: 'var(--text-1)' }}>Organization</h3>
                  {orgInfo?.managed ? (
                    <div className="text-sm" style={{ color: 'var(--text-2)' }}>
                      <p className="mb-1.5">This installation is <strong style={{ color: 'var(--text-1)' }}>managed by your organization</strong> (managed-settings.json). Active policies:</p>
                      <ul className="list-disc pl-5 space-y-1">
                        {orgInfo.policies.chat_cloud === 'deny' && <li>Cloud models are disabled — local models (e.g. Ollama) only</li>}
                        {orgInfo.policies.machine_scan === 'deny' && <li>The computer scan is disabled</li>}
                        {orgInfo.policies.privacy_shield === 'force_on' && <li>The privacy shield is always on and cannot be switched off</li>}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                      No organization policies. Personal install — every setting on this page is yours.
                    </p>
                  )}
                </div>

                <div className="mt-6 pt-6" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <h3 className="settings-h mb-2" style={{ color: 'var(--text-1)' }}>Import your AI history</h3>
                  <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>
                    Bring your ChatGPT or Claude memory with you. Request your data export
                    (ChatGPT: Settings → Data controls → Export; Claude: Settings → Privacy → Export data),
                    unzip it and pick the <code>conversations.json</code> here. Every conversation with at
                    least one answer becomes a searchable note — importing the same file twice updates
                    instead of duplicating.
                  </p>
                  <input
                    ref={chatImportFeld}
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void importiereChatVerlauf(f); e.target.value = ''; }}
                  />
                  <button
                    onClick={() => chatImportFeld.current?.click()}
                    disabled={chatImportLaeuft}
                    className="btn-ghost flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-medium w-full disabled:opacity-50"
                  >
                    {chatImportLaeuft
                      ? <><RefreshCw className="w-5 h-5 animate-spin" /> Reading export…</>
                      : <>Pick conversations.json</>}
                  </button>
                  {chatImportErgebnis && (
                    <div className="text-sm mt-3" style={{ color: 'var(--ok)' }}>
                      {chatImportErgebnis.imported > 0
                        ? <>{chatImportErgebnis.imported} notes imported from {chatImportErgebnis.conversations} conversations ({chatImportErgebnis.format}).</>
                        : <>Nothing new to import — {chatImportErgebnis.conversations} conversations, all already present.</>}
                      {chatImportErgebnis.emptyConversations > 0 && <> {chatImportErgebnis.emptyConversations} empty or one-sided conversations skipped.</>}
                    </div>
                  )}
                  {chatImportFehler && <div className="text-sm mt-3" style={{ color: 'var(--warn)' }}>{chatImportFehler}</div>}
                </div>

                <div className="mt-6 pt-6" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <h3 className="settings-h mb-2" style={{ color: 'var(--text-1)' }}>Sort knowledge by kind</h3>
                  <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>
                    Every note came from somewhere and is about something — that is what the two rows on
                    the list say. Imported notes used to land in one basket by default, because nothing ever
                    decided. This looks at every note again and sorts it — and tells you why. Nothing is
                    written until you confirm.
                  </p>
                  {sortiertFertig !== null ? (
                    <div className="text-sm" style={{ color: 'var(--ok)' }}>{sortiertFertig} notes sorted.</div>
                  ) : sortierVorschau ? (
                    <div className="space-y-3">
                      <div className="hud-inset rounded-lg p-3 text-sm" style={{ color: 'var(--text-2)' }}>
                        <div><strong style={{ color: 'var(--text-1)' }}>{sortierVorschau.changed}</strong> notes would change.</div>
                        {/* #84 mit #77: was die Sortierung in den vier inneren Arten
                            tut, bleibt Sache der Maschine — was der Nutzer sieht, sind
                            die zwei Zeilen, und ihre Zahlen kommen aus dem Laden. */}
                        {bestandGruppen && (
                          <div className="mt-1.5 space-y-1">
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
                              {TRAEGER_REIHENFOLGE.map((t) => (
                                <span key={t}>{bestandGruppen.traeger[t].toLocaleString('en-GB')} × {TRAEGER_LABELS[t]}</span>
                              ))}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]" style={{ color: 'var(--text-3)' }}>
                              {THEMA_REIHENFOLGE.map((t) => (
                                <span key={t}>{bestandGruppen.themen[t].toLocaleString('en-GB')} × {THEMA_LABELS[t]}</span>
                              ))}
                            </div>
                            <div className="text-[11.5px]" style={{ color: 'var(--text-3)' }}>
                              counted over all {bestandGruppen.bestand.toLocaleString('en-GB')} entries in the store
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setSortierVorschau(null)} className="btn-ghost px-4 py-2 rounded-xl text-sm">Cancel</button>
                        <button
                          disabled={sortiertLaeuft}
                          onClick={async () => {
                            setSortiertLaeuft(true);
                            try {
                              const d = await sendJson<{ changed: number }>('/api/memories/reclassify', { apply: true });
                              setSortiertFertig(d.changed);
                              setSortierVorschau(null);
                            } finally { setSortiertLaeuft(false); }
                          }}
                          className="btn-primary px-4 py-2 rounded-xl text-sm flex-1"
                        >Yes, sort {sortierVorschau.changed} notes</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      disabled={sortiertLaeuft}
                      onClick={async () => {
                        setSortiertLaeuft(true);
                        try {
                          setSortierVorschau(await sendJson<{ changed: number; after: Record<string, number> }>('/api/memories/reclassify', {}));
                          try { setBestandGruppen(await (await fetch('/api/memories/gruppen')).json()); } catch { /* die Zahl fehlt dann */ }
                        } finally { setSortiertLaeuft(false); }
                      }}
                      className="btn-ghost flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-medium w-full"
                    >{sortiertLaeuft ? 'Looking…' : 'Show me what would change'}</button>
                  )}
                </div>

                <div className="mt-6 pt-6" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <h3 className="settings-h mb-2" style={{ color: 'var(--text-1)' }}>Re-read imported files</h3>
                  <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>
                    PDFs imported before version 2.10 could arrive as unreadable characters — glyph names and
                    binary blocks instead of text. This reads every imported PDF again from where it came from,
                    with the current extraction, and takes menu lines (“Skip to main content”, cookie banners)
                    out of web clips. Files that no longer exist stay as they are; parts that are no longer
                    needed go to the trash, where you can restore them. Nothing is written until you confirm.
                  </p>
                  {reparaturFehler && (
                    <div className="text-sm mb-3" style={{ color: 'var(--warn)' }}>{reparaturFehler}</div>
                  )}
                  {reparaturFertig ? (
                    <div className="text-sm" style={{ color: 'var(--ok)' }}>{beschreibeReparatur(reparaturFertig, true)}</div>
                  ) : reparaturVorschau && (reparaturVorschau.dateien > 0 || reparaturVorschau.clips > 0) ? (
                    <div className="space-y-3">
                      <div className="hud-inset rounded-lg p-3 text-sm" style={{ color: 'var(--text-2)' }}>
                        {beschreibeReparatur(reparaturVorschau, false)}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setReparaturVorschau(null)} className="btn-ghost px-4 py-2 rounded-xl text-sm">Cancel</button>
                        <button
                          disabled={reparaturLaeuft}
                          onClick={() => void pruefeImporte(true)}
                          className="btn-primary px-4 py-2 rounded-xl text-sm flex-1"
                        >{reparaturLaeuft ? 'Repairing…' : 'Yes, repair'}</button>
                      </div>
                    </div>
                  ) : reparaturVorschau ? (
                    <div className="text-sm" style={{ color: 'var(--ok)' }}>{beschreibeReparatur(reparaturVorschau, false)}</div>
                  ) : (
                    <button
                      disabled={reparaturLaeuft}
                      onClick={() => void pruefeImporte(false)}
                      className="btn-ghost flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-medium w-full"
                    >{reparaturLaeuft ? 'Reading…' : 'Check imported files'}</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'mcp' && (
          <div className="space-y-6">
            <ConnectApps />
            {/* Claim */}
            <div className="rounded-xl p-4 flex gap-3" style={{ background: 'var(--accent-soft)', border: '1px solid var(--border-subtle)' }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--accent)' }}>
                <Plug className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>One brain for every AI</p>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-2)' }}>
                  The same local store (<code>~/.kepta/kepta.db</code>, SQLite) over the HTTP API and MCP stdio — usable from Claude Desktop, Cursor, Zed, Windsurf, your own scripts and shortcuts.
                </p>
              </div>
            </div>

            {/* Base URL + Health */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Server className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <h3 className="settings-h" style={{ color: 'var(--text-1)' }}>Local server</h3>
                <span className="ml-auto flex items-center gap-1.5 text-xs" style={{ color: health?.ok ? 'var(--ok)' : 'var(--text-3)' }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: health?.ok ? 'var(--ok)' : healthError ? '#f87171' : 'var(--text-3)' }} />
                  {health?.ok ? `online · ${health.count ?? 0} nodes` : healthError ? 'offline' : 'checking…'}
                </span>
              </div>
              <div className="hud-inset rounded-xl p-3 flex items-center gap-3">
                <Globe className="w-4 h-4 shrink-0" style={{ color: 'var(--text-2)' }} />
                <code className="text-sm font-mono flex-1 truncate" style={{ color: 'var(--text-1)' }}>{API_BASE}</code>
                <button onClick={() => copy(API_BASE, 'base')} className="btn-ghost p-2 rounded-lg shrink-0" title="Copy">
                  {copied === 'base' ? <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--ok)' }} /> : <Copy className="w-4 h-4" />}
                </button>
                <a href={`${API_BASE}/api/health`} target="_blank" rel="noreferrer" className="btn-ghost p-2 rounded-lg shrink-0" title="Open health">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>
                Running locally ({API_BASE || 'this origin'}). By default the server binds to 127.0.0.1 only — change that with <code>KEPTA_HOST</code>.
              </p>
            </div>

            {/* Endpoints */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Layers className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <h3 className="settings-h" style={{ color: 'var(--text-1)' }}>HTTP Endpoints</h3>
              </div>
              <div className="space-y-2">
                {[
                  { m: 'GET', p: '/api/health', d: 'Health check', c: `curl ${API_BASE}/api/health` },
                  { m: 'GET', p: '/api/memories', d: 'All nodes', c: `curl ${API_BASE}/api/memories` },
                  { m: 'GET', p: '/api/memories/search?q=...&limit=20', d: 'Full-text search', c: `curl "${API_BASE}/api/memories/search?q=ollama&limit=5"` },
                  { m: 'POST', p: '/api/memory', d: 'Save (alias)', c: `curl -X POST ${API_BASE}/api/memory -H "Content-Type: application/json" -d '{"title":"T","content":"C","tags":["a"]}'` },
                  { m: 'POST', p: '/api/mcp/search', d: 'MCP search (plain / JSON-RPC)', c: `curl -X POST ${API_BASE}/api/mcp/search -H "Content-Type: application/json" -d '{"query":"rezept","limit":3}'` },
                  { m: 'POST', p: '/api/mcp/save', d: 'MCP save', c: `curl -X POST ${API_BASE}/api/mcp/save -H "Content-Type: application/json" -d '{"title":"T","content":"C","tags":[]}'` },
                  { m: 'GET', p: '/api/mcp/tools', d: 'Tool list', c: `curl ${API_BASE}/api/mcp/tools` },
                ].map(e => (
                  <div key={e.p} className="hud-inset rounded-xl px-3 py-2.5 flex items-center gap-3">
                    <span className="method-badge" data-method={e.m}>{e.m}</span>
                    <code className="text-xs font-mono flex-1 truncate" style={{ color: 'var(--text-1)' }}>{e.p}</code>
                    <span className="text-xs hidden sm:block shrink-0" style={{ color: 'var(--text-3)' }}>{e.d}</span>
                    <button onClick={() => copy(e.c, e.p)} className="btn-ghost p-1.5 rounded-lg shrink-0" title="Copy the curl command">
                      {copied === e.p ? <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--ok)' }} /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Tools Preview — die Liste kommt von der Tür, nicht aus diesem Text */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Braces className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <h3 className="settings-h" style={{ color: 'var(--text-1)' }}>MCP Tools</h3>
                {werkzeuge.length > 0 && (
                  <span className="ml-auto chip tnum !px-2" title="Tools the local server advertises over MCP">{werkzeuge.length}</span>
                )}
              </div>
              {werkzeugeFehler && (
                <p className="text-sm mb-2" style={{ color: 'var(--warn)' }}>{werkzeugeFehler}</p>
              )}
              {!werkzeugeFehler && werkzeuge.length === 0 && (
                <p className="text-sm mb-2" style={{ color: 'var(--text-2)' }}>Asking the local server which tools agents get…</p>
              )}
              <div className="grid gap-2">
                {werkzeuge.map((w) => {
                  const Icon = WERKZEUGIKON[w.name] ?? Braces;
                  return (
                    <div key={w.name} className="hud-inset rounded-xl px-3 py-2.5 flex gap-3 min-w-0">
                      <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-mono font-semibold" style={{ color: 'var(--text-1)' }}>{w.name}</p>
                        <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                          {w.title ? `${w.title} — ` : ''}{bescheid(w)}
                        </p>
                        {/* Kein `truncate`: die Felderliste ist die Auskunft. Umbricht
                            sie, bleibt sie lesbar; gekappt wäre sie wieder eine Zahl
                            ohne Sinn — bei 390 px waren es 288 px Überstand. */}
                        <code className="text-[11px] font-mono block mt-1 break-words" style={{ color: 'var(--text-3)' }}>{schemaKurz(w)}</code>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* mcp.json */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Terminal className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <h3 className="settings-h" style={{ color: 'var(--text-1)' }}>mcp.json — Cursor / Zed / Windsurf</h3>
              </div>
              <div className="hud-inset rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>{mcpAusApp ? 'mcp.json — runs inside the K3PTA app' : 'mcp.json (project root)'}</span>
                  <button onClick={() => copy(mcpAusApp ?? MCP_JSON_NPX, 'mcp-npx')} className="btn-ghost flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs">
                    {copied === 'mcp-npx' ? <><CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--ok)' }} /> Copied</> : copied === 'error:mcp-npx' ? <><Copy className="w-3.5 h-3.5" /> Copying failed</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                  </button>
                </div>
                <pre className="p-3 text-xs font-mono overflow-x-auto leading-relaxed" style={{ color: 'var(--text-1)' }}>{mcpAusApp ?? MCP_JSON_NPX}</pre>
              </div>
              <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--text-3)' }}>
                {mcpAusApp
                  ? <>In Cursor: Settings → Features → MCP. In Zed: <code>settings.json → experimental.mcp</code>. This starts the MCP server that ships inside K3PTA — no Node.js, no npm. With Node.js 22.13 or newer, <code>npx -y kepta-mcp</code> works too (kepta-mcp 2.11 or newer). From your own checkout instead (after <code>npm run build:mcp</code>):</>
                  : <>In Cursor: Settings → Features → MCP. In Zed: <code>settings.json → experimental.mcp</code>. Nothing to build — <code>npx</code> fetches the server on first use. From your own checkout instead (after <code>npm run build:mcp</code>):</>}
              </p>
              <div className="hud-inset rounded-xl overflow-hidden mt-2">
                <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>mcp.json (built)</span>
                  <button onClick={() => copy(MCP_JSON_BUILT, 'mcp-built')} className="btn-ghost flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs">
                    {copied === 'mcp-built' ? <><CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--ok)' }} /> Copied</> : copied === 'error:mcp-built' ? <><Copy className="w-3.5 h-3.5" /> Copying failed</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                  </button>
                </div>
                <pre className="p-3 text-xs font-mono overflow-x-auto leading-relaxed" style={{ color: 'var(--text-1)' }}>{MCP_JSON_BUILT}</pre>
              </div>
            </div>

            {/* Claude Desktop */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Plug className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <h3 className="settings-h" style={{ color: 'var(--text-1)' }}>Claude Desktop</h3>
              </div>
              <div className="hud-inset rounded-xl p-3">
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
                  Config file:
                </p>
                {CLAUDE_PATHS.map(({ os, pfad }) => (
                  <div key={os} className="flex items-center gap-2 mt-2 hud-inset rounded-lg px-3 py-2">
                    <span className="text-xs shrink-0" style={{ color: 'var(--text-2)' }}>{os}</span>
                    <code className="text-xs font-mono flex-1 truncate" style={{ color: 'var(--text-1)' }}>{pfad}</code>
                    <button onClick={() => copy(pfad, `claude-path-${os}`)} className="btn-ghost p-1.5 rounded-lg shrink-0" aria-label={`Copy the ${os} path`}>
                      {copied === `claude-path-${os}` ? <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--ok)' }} /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ))}
                {mcpAusApp ? (
                  <p className="text-xs mt-3 leading-relaxed" style={{ color: 'var(--text-2)' }}>
                    Content = the same <code>mcpServers</code> block as above — it already points to this app. Then restart Claude Desktop.
                  </p>
                ) : (
                  <>
                    <p className="text-xs mt-3 leading-relaxed" style={{ color: 'var(--text-2)' }}>
                      Content = the same <code>mcpServers</code> as above. Replace the placeholder <code>/PATH/TO/K3PTA-REPO</code> (get the real path with <code>pwd</code> in the project folder). Then restart Claude Desktop.
                    </p>
                    <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--text-2)' }}>
                      The repo root also holds <code>mcp-config.json</code> as a ready-made example — copy it straight in.
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* curl snippet */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Terminal className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <h3 className="settings-h" style={{ color: 'var(--text-1)' }}>Quick test (curl)</h3>
              </div>
              <div className="hud-inset rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>Terminal</span>
                  <button
                    onClick={() => copy(`curl ${API_BASE}/api/health | jq\ncurl "${API_BASE}/api/memories/search?q=hallo&limit=3" | jq\ncurl -X POST ${API_BASE}/api/memory -H "Content-Type: application/json" -d '{"title":"Test","content":"Via API","tags":["api"]}' | jq`, 'curl')}
                    className="btn-ghost flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
                  >
                    {copied === 'curl' ? <><CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--ok)' }} /> Copied</> : copied === 'error:curl' ? <><Copy className="w-3.5 h-3.5" /> Copying failed</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                  </button>
                </div>
                <pre className="p-3 text-xs font-mono overflow-x-auto leading-relaxed" style={{ color: 'var(--text-1)' }}>{`curl ${API_BASE}/api/health | jq
curl "${API_BASE}/api/memories/search?q=hallo&limit=3" | jq
curl -X POST ${API_BASE}/api/memory \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Test","content":"Via API","tags":["api"]}' | jq`}</pre>
              </div>
            </div>

            <p className="text-xs text-center leading-relaxed" style={{ color: 'var(--text-3)' }}>
              Docs and more examples: see <code>README.md → MCP &amp; API</code> and <code>mcp-config.json</code> in the project root.
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

