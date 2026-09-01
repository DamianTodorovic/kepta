import { useState, useEffect, FormEvent } from 'react';
import { Key, ShieldCheck, Settings as SettingsIcon, Download, CheckCircle2, RefreshCw, Cpu, HardDriveDownload, Server, Plug, Copy, Terminal, Braces, Globe, Search, Save, Layers, ExternalLink, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { PROVIDERS, providerById, loadAISettings, saveAISettings, AISettings } from '../lib/ai';
import { getMemoriesSync } from '../lib/store';
import { SystemStatus } from './SystemStatus';

type TabId = 'system' | 'mcp';

const API_BASE = 'http://localhost:3000';
const MCP_JSON_TSX = `{
  "mcpServers": {
    "kepta": {
      "command": "npx",
      "args": ["tsx", "src/mcp-server.ts"],
      "cwd": "/ABSOLUTER/PFAD/ZU/ki-gehirn"
    }
  }
}`;
const MCP_JSON_BUILT = `{
  "mcpServers": {
    "kepta": {
      "command": "node",
      "args": ["/ABSOLUTER/PFAD/ZU/ki-gehirn/dist/mcp-server.cjs"]
    }
  }
}`;
const CLAUDE_PATH = '~/Library/Application Support/Claude/claude_desktop_config.json';

export function Settings() {
  const [activeTab, setActiveTab] = useState<TabId>('system');

  // --- System-Tab state (bestehend) ---
  const [settings, setSettings] = useState<AISettings>(loadAISettings());
  const [saved, setSaved] = useState(false);
  const [exported, setExported] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [autoLearn, setAutoLearn] = useState<boolean>(()=>{ try{ return localStorage.getItem('ki_gehirn_autolearn') !== 'false'; }catch{ return true; }});
  const [autoLearnSaved, setAutoLearnSaved] = useState(false);

  // --- MCP-Tab state ---
  const [copied, setCopied] = useState<string | null>(null);
  const [health, setHealth] = useState<{ ok?: boolean; count?: number; uptime?: number } | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const provider = providerById(settings.providerId);

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

  // Für Remote-Anbieter mit Key: einmalig beim Öffnen auto-laden (kein Polling, um Rate-Limits zu schonen)
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

  useEffect(() => {
    setSettings(loadAISettings());
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
    })();
    return () => { cancelled = true; };
  }, [activeTab]);

  const update = (patch: Partial<AISettings>) => setSettings(prev => ({ ...prev, ...patch }));

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
    setTimeout(() => setSaved(false), 2000);
  };

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
      if (!res.ok) throw new Error(data.error || 'Fehler beim Laden der Modelle');
      setModels(data.models || []);
      if (!data.models?.length) setModelError('Keine Modelle gefunden. Läuft der Dienst?');
    } catch (err: unknown) {
      setModelError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingModels(false);
    }
  };

  const handleExport = () => {
    const data = getMemoriesSync();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge_base_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setExported(true);
    setTimeout(() => setExported(false), 3000);
  };

  const copy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
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
          <div className="w-12 h-12 hud-inset rounded-xl flex items-center justify-center">
            <SettingsIcon className="w-6 h-6" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h2 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>System</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>Neural Link konfigurieren, Daten &amp; MCP</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 p-1 rounded-xl hud-inset">
          <button
            onClick={() => setActiveTab('system')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'system' ? 'bg-white dark:bg-zinc-800 shadow-sm' : ''}`}
            style={{ color: activeTab === 'system' ? 'var(--text-1)' : 'var(--text-2)' }}
          >
            <Cpu className="w-4 h-4" /> KI &amp; Daten
          </button>
          <button
            onClick={() => setActiveTab('mcp')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'mcp' ? 'bg-white dark:bg-zinc-800 shadow-sm' : ''}`}
            style={{ color: activeTab === 'mcp' ? 'var(--text-1)' : 'var(--text-2)' }}
          >
            <Plug className="w-4 h-4" /> MCP / API
          </button>
        </div>

        {activeTab === 'system' && (
          <div className="space-y-10">
            <SystemStatus />
            <form onSubmit={handleSave} className="space-y-6">
              <div className="space-y-5">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  <h3 className="hud-label !text-[11px]" style={{ color: 'var(--text-1)' }}>Künstliche Intelligenz</h3>
                </div>

                <div>
                  <label className="hud-label block mb-2">Anbieter</label>
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
                </div>

                <div>
                  <label className="flex items-center gap-2 hud-label mb-2">
                    <Key className="w-3.5 h-3.5" />
                    API Key {provider.needsKey ? '' : '(für lokale Anbieter nicht nötig)'}
                  </label>
                  <input
                    type="password"
                    value={settings.apiKey === 'local' ? '' : settings.apiKey}
                    onChange={(e) => update({ apiKey: e.target.value })}
                    placeholder={provider.needsKey ? 'Key einfügen...' : 'leer lassen'}
                    disabled={!provider.needsKey}
                    className={inputClass}
                  />
                  <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>
                    Der Key wird nur lokal auf deinem Gerät gespeichert und direkt an den Anbieter gesendet.
                  </p>
                </div>

                <div>
                  <label className="hud-label block mb-2">
                    API Endpunkt {provider.id === 'custom' ? '(erforderlich)' : '(optional überschreibbar)'}
                  </label>
                  <input
                    type="text"
                    value={settings.baseUrl}
                    onChange={(e) => update({ baseUrl: e.target.value })}
                    placeholder="https://..."
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="hud-label block mb-2">Modell</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={settings.model}
                      onChange={(e) => update({ model: e.target.value })}
                      placeholder="z.B. gpt-4o-mini"
                      className={inputClass}
                      list="model-list"
                    />
                    <button
                      type="button"
                      onClick={loadModels}
                      disabled={loadingModels}
                      className="btn-ghost shrink-0 flex items-center gap-2 px-4 rounded-xl text-sm font-medium"
                      title="Verfügbare Modelle vom Anbieter laden"
                    >
                      <RefreshCw className={`w-4 h-4 ${loadingModels ? 'animate-spin' : ''}`} />
                      Laden
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
                      <option value="">Geladene Modelle auswählen ({models.length})...</option>
                      {models.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  )}
                  {modelError && (
                    <p className="text-xs mt-2" style={{ color: '#f87171' }}>{modelError}</p>
                  )}
                  {!provider.needsKey && models.length > 0 && (
                    <p className="text-xs mt-2 flex items-center gap-1.5" style={{ color: 'var(--ok)' }}><CheckCircle2 className="w-3.5 h-3.5" /> {models.length} lokale Modelle verbunden — neue Downloads erscheinen automatisch (alle 12s + bei Fokus)</p>
                  )}
                  {!provider.needsKey && models.length === 0 && !loadingModels && !modelError && (
                    <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--text-3)' }}>Keine lokalen Modelle gefunden. Starte Ollama (`ollama serve` + `ollama pull llama3.2`) oder LM Studio — sie erscheinen hier sofort.</p>
                  )}
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl w-full"
              >
                {saved ? (
                  <><ShieldCheck className="w-5 h-5" /> <span>Konfiguration gespeichert</span></>
                ) : (
                  'Speichern'
                )}
              </button>
            </form>

            <div className="pt-8 space-y-6" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <div className="rounded-xl p-4" style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: autoLearn ? 'linear-gradient(135deg, var(--accent), var(--accent-2))' : 'var(--bg-inset-strong)', border:'1px solid var(--border-subtle)' }}>
                      <Sparkles className="w-4 h-4" style={{ color: autoLearn ? 'white' : 'var(--text-3)' }} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold" style={{color:'var(--text-1)'}}>Selbst-Erweiterung — immer mitlesen</div>
                      <div className="text-xs" style={{color:'var(--text-2)'}}>Nach jeder Antwort automatisch Kernaussage als Knoten speichern (Tag <code>auto-learn</code>). Duplikate werden erkannt.</div>
                    </div>
                  </div>
                  <label className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer shrink-0" style={{ background: autoLearn ? 'var(--accent)' : 'var(--bg-inset-strong)', border: autoLearn ? '1px solid transparent' : '1px solid var(--border-subtle)' }}>
                    <input type="checkbox" checked={autoLearn} onChange={e=>{ const v=e.target.checked; setAutoLearn(v); localStorage.setItem('ki_gehirn_autolearn', String(v)); setAutoLearnSaved(true); setTimeout(()=>setAutoLearnSaved(false),1800); }} className="sr-only" />
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${autoLearn ? 'translate-x-6' : 'translate-x-1'}`} />
                  </label>
                </div>
                {autoLearnSaved && <div className="text-xs mt-2 flex items-center gap-1.5" style={{color:'var(--ok)'}}><CheckCircle2 className="w-3.5 h-3.5"/> {autoLearn ? 'Auto-Learn aktiv — Gehirn erweitert sich selbst' : 'Auto-Learn deaktiviert'}</div>}
                <p className="text-xs mt-2 leading-relaxed" style={{color:'var(--text-3)'}}>Schalter in <code>localStorage ki_gehirn_autolearn</code>. Bei jeder KI-Antwort &gt;60 Zeichen läuft im Hintergrund ein kurzer Extract-Call (gleiches Modell) und speichert <code>title/tags/summary</code> als neuen Knoten.</p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-4">
                  <HardDriveDownload className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  <h3 className="hud-label !text-[11px]" style={{ color: 'var(--text-1)' }}>Datenverwaltung</h3>
                </div>
                <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>
                  Lade alle Speicherknoten als JSON-Backup herunter. Deine Daten liegen ausschließlich auf diesem Gerät.
                </p>
                <button
                  onClick={handleExport}
                  className="btn-ghost flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-medium w-full"
                >
                  {exported ? (
                    <><CheckCircle2 className="w-5 h-5" style={{ color: 'var(--ok)' }} /> <span style={{ color: 'var(--ok)' }}>Backup erstellt</span></>
                  ) : (
                    <><Download className="w-5 h-5" /> JSON Backup herunterladen</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'mcp' && (
          <div className="space-y-6">
            {/* Claim */}
            <div className="rounded-xl p-4 flex gap-3" style={{ background: 'var(--accent-soft)', border: '1px solid var(--border-subtle)' }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--accent)' }}>
                <Plug className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Ein Gehirn für alle KIs</p>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-2)' }}>
                  Derselbe lokale Speicher (`~/.ki-gehirn/memories.json`) per HTTP-API und MCP-stdio — nutzbar aus Claude Desktop, Cursor, Zed, Windsurf, eigenen Scripts und Shortcuts.
                </p>
              </div>
            </div>

            {/* Base URL + Health */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Server className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <h3 className="hud-label !text-[11px]" style={{ color: 'var(--text-1)' }}>Lokaler Server</h3>
                <span className="ml-auto flex items-center gap-1.5 text-xs" style={{ color: health?.ok ? 'var(--ok)' : 'var(--text-3)' }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: health?.ok ? 'var(--ok)' : healthError ? '#f87171' : 'var(--text-3)' }} />
                  {health?.ok ? `online · ${health.count ?? 0} Knoten` : healthError ? 'offline' : 'prüfe...'}
                </span>
              </div>
              <div className="hud-inset rounded-xl p-3 flex items-center gap-3">
                <Globe className="w-4 h-4 shrink-0" style={{ color: 'var(--text-2)' }} />
                <code className="text-sm font-mono flex-1 truncate" style={{ color: 'var(--text-1)' }}>{API_BASE}</code>
                <button onClick={() => copy(API_BASE, 'base')} className="btn-ghost p-2 rounded-lg shrink-0" title="Kopieren">
                  {copied === 'base' ? <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--ok)' }} /> : <Copy className="w-4 h-4" />}
                </button>
                <a href={`${API_BASE}/api/health`} target="_blank" rel="noreferrer" className="btn-ghost p-2 rounded-lg shrink-0" title="Health öffnen">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>
                Läuft via <code>npm run dev</code> auf Port 3000. CORS offen — lokale Tools brauchen keine Auth.
              </p>
            </div>

            {/* Endpoints */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Layers className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <h3 className="hud-label !text-[11px]" style={{ color: 'var(--text-1)' }}>HTTP Endpoints</h3>
              </div>
              <div className="space-y-2">
                {[
                  { m: 'GET', p: '/api/health', d: 'Health-Check', c: `curl ${API_BASE}/api/health` },
                  { m: 'GET', p: '/api/memories', d: 'Alle Knoten', c: `curl ${API_BASE}/api/memories` },
                  { m: 'GET', p: '/api/memories/search?q=...&limit=20', d: 'Volltext-Suche', c: `curl "${API_BASE}/api/memories/search?q=ollama&limit=5"` },
                  { m: 'POST', p: '/api/memory', d: 'Speichern (Alias)', c: `curl -X POST ${API_BASE}/api/memory -H "Content-Type: application/json" -d '{"title":"T","content":"C","tags":["a"]}'` },
                  { m: 'POST', p: '/api/mcp/search', d: 'MCP search (plain / JSON-RPC)', c: `curl -X POST ${API_BASE}/api/mcp/search -H "Content-Type: application/json" -d '{"query":"rezept","limit":3}'` },
                  { m: 'POST', p: '/api/mcp/save', d: 'MCP save', c: `curl -X POST ${API_BASE}/api/mcp/save -H "Content-Type: application/json" -d '{"title":"T","content":"C","tags":[]}'` },
                  { m: 'GET', p: '/api/mcp/tools', d: 'Tool-Liste', c: `curl ${API_BASE}/api/mcp/tools` },
                ].map(e => (
                  <div key={e.p} className="hud-inset rounded-xl px-3 py-2.5 flex items-center gap-3">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${e.m === 'GET' ? 'bg-emerald-500 text-white' : 'bg-sky-500 text-white'}`}>{e.m}</span>
                    <code className="text-xs font-mono flex-1 truncate" style={{ color: 'var(--text-1)' }}>{e.p}</code>
                    <span className="text-xs hidden sm:block shrink-0" style={{ color: 'var(--text-3)' }}>{e.d}</span>
                    <button onClick={() => copy(e.c, e.p)} className="btn-ghost p-1.5 rounded-lg shrink-0" title="curl kopieren">
                      {copied === e.p ? <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--ok)' }} /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Tools Preview */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Braces className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <h3 className="hud-label !text-[11px]" style={{ color: 'var(--text-1)' }}>MCP Tools</h3>
              </div>
              <div className="grid gap-2">
                {[
                  { icon: Search, name: 'memory_search', desc: 'Sucht Titel / Inhalt / Tags', schema: '{ query: string, limit?: number, tags?: string[] }' },
                  { icon: Save, name: 'memory_save', desc: 'Speichert oder aktualisiert Knoten', schema: '{ title: string, content: string, tags?: string[], id?: string }' },
                  { icon: Layers, name: 'memory_list', desc: 'Listet alle Knoten paginiert', schema: '{ limit?: number, offset?: number }' },
                ].map(t => (
                  <div key={t.name} className="hud-inset rounded-xl px-3 py-2.5 flex gap-3">
                    <t.icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-mono font-semibold" style={{ color: 'var(--text-1)' }}>{t.name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-2)' }}>{t.desc}</p>
                      <code className="text-[11px] font-mono block mt-1 truncate" style={{ color: 'var(--text-3)' }}>{t.schema}</code>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* mcp.json */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Terminal className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <h3 className="hud-label !text-[11px]" style={{ color: 'var(--text-1)' }}>mcp.json — Cursor / Zed / Windsurf</h3>
              </div>
              <div className="hud-inset rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>mcp.json (Projekt-Root)</span>
                  <button onClick={() => copy(MCP_JSON_TSX, 'mcp-tsx')} className="btn-ghost flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs">
                    {copied === 'mcp-tsx' ? <><CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--ok)' }} /> Kopiert</> : <><Copy className="w-3.5 h-3.5" /> Kopieren</>}
                  </button>
                </div>
                <pre className="p-3 text-xs font-mono overflow-x-auto leading-relaxed" style={{ color: 'var(--text-1)' }}>{MCP_JSON_TSX}</pre>
              </div>
              <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--text-3)' }}>
                Bei Cursor: Settings → Features → MCP. Bei Zed: <code>settings.json → experimental.mcp</code>. Alternative ohne <code>tsx</code> (nach <code>npm run build:mcp</code>):
              </p>
              <div className="hud-inset rounded-xl overflow-hidden mt-2">
                <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>mcp.json (built)</span>
                  <button onClick={() => copy(MCP_JSON_BUILT, 'mcp-built')} className="btn-ghost flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs">
                    {copied === 'mcp-built' ? <><CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--ok)' }} /> Kopiert</> : <><Copy className="w-3.5 h-3.5" /> Kopieren</>}
                  </button>
                </div>
                <pre className="p-3 text-xs font-mono overflow-x-auto leading-relaxed" style={{ color: 'var(--text-1)' }}>{MCP_JSON_BUILT}</pre>
              </div>
            </div>

            {/* Claude Desktop */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Plug className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <h3 className="hud-label !text-[11px]" style={{ color: 'var(--text-1)' }}>Claude Desktop</h3>
              </div>
              <div className="hud-inset rounded-xl p-3">
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
                  Config-Datei (macOS):
                </p>
                <div className="flex items-center gap-2 mt-2 hud-inset rounded-lg px-3 py-2">
                  <code className="text-xs font-mono flex-1 truncate" style={{ color: 'var(--text-1)' }}>{CLAUDE_PATH}</code>
                  <button onClick={() => copy(CLAUDE_PATH, 'claude-path')} className="btn-ghost p-1.5 rounded-lg shrink-0">
                    {copied === 'claude-path' ? <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--ok)' }} /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-xs mt-3 leading-relaxed" style={{ color: 'var(--text-2)' }}>
                  Inhalt = gleiche <code>mcpServers</code> wie oben. Platzhalter <code>/ABSOLUTER/PFAD/ZU/ki-gehirn</code> ersetzen (z. B. <code>{API_BASE.replace('http','')}</code> ist <em>nicht</em> der Pfad — nutze <code>pwd</code> im Terminal). Danach Claude Desktop neu starten.
                </p>
                <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--text-2)' }}>
                  Im Root liegt außerdem <code>mcp-config.json</code> als fertiges Beispiel — direkt kopieren.
                </p>
              </div>
            </div>

            {/* curl snippet */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Terminal className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <h3 className="hud-label !text-[11px]" style={{ color: 'var(--text-1)' }}>Schnelltest (curl)</h3>
              </div>
              <div className="hud-inset rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>Terminal</span>
                  <button
                    onClick={() => copy(`curl ${API_BASE}/api/health | jq\ncurl "${API_BASE}/api/memories/search?q=hallo&limit=3" | jq\ncurl -X POST ${API_BASE}/api/memory -H "Content-Type: application/json" -d '{"title":"Test","content":"Via API","tags":["api"]}' | jq`, 'curl')}
                    className="btn-ghost flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
                  >
                    {copied === 'curl' ? <><CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--ok)' }} /> Kopiert</> : <><Copy className="w-3.5 h-3.5" /> Kopieren</>}
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
              Docs &amp; mehr Beispiele: siehe <code>README.md → MCP &amp; API</code> und <code>mcp-config.json</code> im Projekt-Root.
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
