import { useState, useEffect, FormEvent } from 'react';
import { Key, ShieldCheck, SettingsIcon, Download, CheckCircle2, RefreshCw, Cpu, HardDriveDownload, Server, Plug, Copy, Terminal, Braces, Globe, Search, Save, Layers, ExternalLink, Sparkles } from "../lib/icons";
import { motion } from 'motion/react';
import { PROVIDERS, providerById, loadAISettings, saveAISettings, AISettings } from '../lib/ai';
import { AUTO_LEARN_TIMEOUT_MS } from '../lib/autolearn';
import { getMemoriesSync } from '../lib/store';
import { SystemStatus } from './SystemStatus';
import { KeptaMark } from './KeptaMark';

type TabId = 'system' | 'mcp';

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
      "args": ["/PATH/TO/KEPTA-REPO/dist/mcp-server.cjs"]
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
  const [autoLearn, setAutoLearn] = useState<boolean>(()=>{ try{ return localStorage.getItem('ki_gehirn_autolearn') === 'true'; }catch{ return false; }});
  const [autoLearnSaved, setAutoLearnSaved] = useState(false);
  const [extractModel, setExtractModel] = useState<string>(()=>{ try{ return loadAISettings().extractModel ?? ''; }catch{ return ''; }});
  const [extractSaved, setExtractSaved] = useState(false);

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
      if (!res.ok) throw new Error(data.error || 'Could not load the models');
      setModels(data.models || []);
      if (!data.models?.length) setModelError('No models found. Is the service running?');
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
          <KeptaMark size={40} radius={10} />
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
        </div>

        {activeTab === 'system' && (
          <div className="space-y-10">
            <SystemStatus />
            <form onSubmit={handleSave} className="space-y-6">
              <div className="space-y-5">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  <h3 className="hud-label !text-[11px]" style={{ color: 'var(--text-1)' }}>Artificial intelligence</h3>
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
                    The key is stored locally on your device and sent straight to the provider.
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
                    placeholder="https://..."
                    className={inputClass}
                  />
                </div>

                <div>
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
                    <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--text-3)' }}>No local models found. Start Ollama (`ollama serve` + `ollama pull llama3.2`) or LM Studio — they show up here immediately.</p>
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
                    <input type="checkbox" checked={autoLearn} onChange={e=>{ const v=e.target.checked; setAutoLearn(v); localStorage.setItem('ki_gehirn_autolearn', String(v)); setAutoLearnSaved(true); setTimeout(()=>setAutoLearnSaved(false),1800); }} className="sr-only" />
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${autoLearn ? 'translate-x-6' : 'translate-x-1'}`} />
                  </label>
                </div>
                {autoLearnSaved && <div className="text-xs mt-2 flex items-center gap-1.5" style={{color:'var(--ok)'}}><CheckCircle2 className="w-3.5 h-3.5"/> {autoLearn ? 'Auto-learn active — the brain extends itself' : 'Auto-Learn deaktiviert'}</div>}
                {autoLearn && (
                  <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <label className="text-xs font-semibold block mb-1.5" style={{color:'var(--text-1)'}}>Extraction model <span style={{color:'var(--text-3)'}}>— optional</span></label>
                    <input
                      type="text"
                      value={extractModel}
                      onChange={(e) => setExtractModel(e.target.value)}
                      onBlur={() => { const s = loadAISettings(); saveAISettings({ ...s, extractModel: extractModel.trim() }); setExtractSaved(true); setTimeout(()=>setExtractSaved(false),1800); }}
                      placeholder="e.g. llama3.2:3b — empty = the chat model"
                      className="w-full text-sm rounded-lg px-3 py-2"
                      style={{ background: 'var(--bg-inset-strong)', border: '1px solid var(--border-subtle)', color: 'var(--text-1)' }}
                    />
                    {extractSaved && <div className="text-xs mt-1.5 flex items-center gap-1.5" style={{color:'var(--ok)'}}><CheckCircle2 className="w-3.5 h-3.5"/> Gespeichert</div>}
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
                  <h3 className="hud-label !text-[11px]" style={{ color: 'var(--text-1)' }}>Data management</h3>
                </div>
                <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>
                  Download every memory node as a JSON backup. Your data lives on this device and nowhere else.
                </p>
                <button
                  onClick={handleExport}
                  className="btn-ghost flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-medium w-full"
                >
                  {exported ? (
                    <><CheckCircle2 className="w-5 h-5" style={{ color: 'var(--ok)' }} /> <span style={{ color: 'var(--ok)' }}>Backup erstellt</span></>
                  ) : (
                    <><Download className="w-5 h-5" /> Download JSON backup</>
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
                <h3 className="hud-label !text-[11px]" style={{ color: 'var(--text-1)' }}>Local server</h3>
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
                <h3 className="hud-label !text-[11px]" style={{ color: 'var(--text-1)' }}>HTTP Endpoints</h3>
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
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${e.m === 'GET' ? 'bg-emerald-500 text-white' : 'bg-sky-500 text-white'}`}>{e.m}</span>
                    <code className="text-xs font-mono flex-1 truncate" style={{ color: 'var(--text-1)' }}>{e.p}</code>
                    <span className="text-xs hidden sm:block shrink-0" style={{ color: 'var(--text-3)' }}>{e.d}</span>
                    <button onClick={() => copy(e.c, e.p)} className="btn-ghost p-1.5 rounded-lg shrink-0" title="Copy the curl command">
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
                  { icon: Search, name: 'memory_search', desc: 'Searches titles, content and tags', schema: '{ query: string, limit?: number, tags?: string[] }' },
                  { icon: Save, name: 'memory_save', desc: 'Creates or updates a node', schema: '{ title: string, content: string, tags?: string[], id?: string }' },
                  { icon: Layers, name: 'memory_list', desc: 'Lists every node, paginated', schema: '{ limit?: number, offset?: number }' },
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
                  <span className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>mcp.json (project root)</span>
                  <button onClick={() => copy(MCP_JSON_NPX, 'mcp-npx')} className="btn-ghost flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs">
                    {copied === 'mcp-npx' ? <><CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--ok)' }} /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                  </button>
                </div>
                <pre className="p-3 text-xs font-mono overflow-x-auto leading-relaxed" style={{ color: 'var(--text-1)' }}>{MCP_JSON_NPX}</pre>
              </div>
              <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--text-3)' }}>
                In Cursor: Settings → Features → MCP. In Zed: <code>settings.json → experimental.mcp</code>. Nothing to build — <code>npx</code> fetches the server on first use. From your own checkout instead (after <code>npm run build:mcp</code>):
              </p>
              <div className="hud-inset rounded-xl overflow-hidden mt-2">
                <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>mcp.json (built)</span>
                  <button onClick={() => copy(MCP_JSON_BUILT, 'mcp-built')} className="btn-ghost flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs">
                    {copied === 'mcp-built' ? <><CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--ok)' }} /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
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
                  Config file (macOS):
                </p>
                <div className="flex items-center gap-2 mt-2 hud-inset rounded-lg px-3 py-2">
                  <code className="text-xs font-mono flex-1 truncate" style={{ color: 'var(--text-1)' }}>{CLAUDE_PATH}</code>
                  <button onClick={() => copy(CLAUDE_PATH, 'claude-path')} className="btn-ghost p-1.5 rounded-lg shrink-0">
                    {copied === 'claude-path' ? <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--ok)' }} /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-xs mt-3 leading-relaxed" style={{ color: 'var(--text-2)' }}>
                  Content = the same <code>mcpServers</code> as above. Replace the placeholder <code>/PATH/TO/KEPTA-REPO</code> (get the real path with <code>pwd</code> in the project folder). Then restart Claude Desktop.
                </p>
                <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--text-2)' }}>
                  The repo root also holds <code>mcp-config.json</code> as a ready-made example — copy it straight in.
                </p>
              </div>
            </div>

            {/* curl snippet */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Terminal className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <h3 className="hud-label !text-[11px]" style={{ color: 'var(--text-1)' }}>Quick test (curl)</h3>
              </div>
              <div className="hud-inset rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>Terminal</span>
                  <button
                    onClick={() => copy(`curl ${API_BASE}/api/health | jq\ncurl "${API_BASE}/api/memories/search?q=hallo&limit=3" | jq\ncurl -X POST ${API_BASE}/api/memory -H "Content-Type: application/json" -d '{"title":"Test","content":"Via API","tags":["api"]}' | jq`, 'curl')}
                    className="btn-ghost flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
                  >
                    {copied === 'curl' ? <><CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--ok)' }} /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
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
