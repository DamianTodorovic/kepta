// System-Status — die App legt offen, was funktioniert und was fehlt (statt „funktioniert nicht"-Rätsel).
import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Copy, Check, Send, Loader2 } from 'lucide-react';
import { PROVIDERS, providerById, loadAISettings } from '../lib/ai';

interface Health {
  ok: boolean;
  dbPath: string;
  count: number;
  embeddings: { total: number; embedded: number };
  mcp: { protocol: string; tools: number; http: string };
}

function Row({ ok, label, detail, fix }: { ok: boolean; label: string; detail: string; fix?: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      {ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--ok)' }} /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#e6a100' }} />}
      <div className="min-w-0">
        <div className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{label}</div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>{detail}</div>
        {!ok && fix && <div className="text-xs mt-1 font-medium" style={{ color: '#d97706' }}>So fixst du es: {fix}</div>}
      </div>
    </div>
  );
}

export function SystemStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [ollama, setOllama] = useState<boolean | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/health');
        setHealth(await res.json());
      } catch { setHealth(null); }
      try {
        const res = await fetch('/api/embed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: ['ping'] }),
        });
        setOllama(res.ok);
      } catch { setOllama(false); }
    })();
  }, []);

  const s = loadAISettings();
  const prov = providerById(s.providerId);
  const keyOk = !prov.needsKey || !!s.apiKey;
  const modelOk = !!s.model;

  const copy = (id: string, text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600);
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: s.providerId, protocol: prov.protocol, baseUrl: s.baseUrl || prov.baseUrl, apiKey: s.apiKey, model: s.model, messages: [{ role: 'user', content: 'Antworte nur: OK' }] }),
      });
      const data = await res.json();
      setTestResult(res.ok ? { ok: true, msg: `Modell antwortet: „${String(data.text ?? '').trim().slice(0, 40)}"` } : { ok: false, msg: String(data.error ?? `HTTP ${res.status}`) });
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : 'Verbindungsfehler' });
    } finally {
      setTesting(false);
    }
  };

  const mcpJson = JSON.stringify({ mcpServers: { kepta: { command: 'node', args: ['<KEPTA-PFAD>/dist/mcp-server.cjs'] } } }, null, 2);
  const coverage = health && health.embeddings.total > 0 ? Math.round((health.embeddings.embedded / health.embeddings.total) * 100) : 0;

  return (
    <div className="rounded-2xl p-5" style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg-inset)' }}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>System-Status</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>Was funktioniert — und was fehlt, damit alles funktioniert.</p>
        </div>
      </div>

      <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
        <Row
          ok={!!health?.ok}
          label="Gehirn (SQLite + Engine)"
          detail={health ? `${health.count} Knoten · ${health.dbPath} · MCP ${health.mcp.protocol} (${health.mcp.tools} Tools, ${health.mcp.http})` : 'Server nicht erreichbar — läuft die App?'}
          fix="App über npm run dev bzw. die Desktop-App starten."
        />
        <Row
          ok={keyOk}
          label={`Provider: ${prov.label}`}
          detail={keyOk ? 'API-Key hinterlegt.' : 'Kein API-Key — der Test-Cockpit-Chat kann so nicht antworten. Die Agenten via MCP brauchen das nicht!'}
          fix={'Links „System“ → Einstellungen → Provider wählen → Key eintragen.'}
        />
        <Row
          ok={modelOk}
          label="Modell gewählt"
          detail={modelOk ? `Aktiv: ${s.model}` : 'Kein Modell gesetzt.'}
          fix="Einstellungen → Modell aus der Liste laden/auswählen."
        />
        <Row
          ok={ollama === true}
          label="Ollama / Embeddings (optional)"
          detail={ollama === true ? 'Ollama erreichbar — Vektorsuche aktiv.' : 'Nicht erreichbar — Suche läuft trotzdem rein lexikalisch (92 % Hit@1 im Eval), mit Vektoren auch sprachübergreifend stark.'}
          fix="Ollama installieren und starten: ollama pull nomic-embed-text && ollama serve"
        />
        <Row
          ok={!!health && health.count > 0}
          label="Wissensbestand"
          detail={health && health.count > 0 ? `${health.count} Knoten migriert/vorhanden · Embedding-Coverage ${coverage} %` : '0 Knoten — importiere Notizen oder lass einen Agenten speichern.'}
          fix="Dateien ins Index-Fenster ziehen oder Obsidian-Import nutzen (POST /api/import/markdown)."
        />
      </div>

      <div className="flex items-center gap-2 mt-3">
        <button onClick={runTest} disabled={testing} className="btn-primary flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium">
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Testanfrage senden
        </button>
        {testResult && (
          <span className="text-xs font-medium" style={{ color: testResult.ok ? 'var(--ok)' : '#d97706' }}>
            {testResult.ok ? '✓ ' : '✗ '}{testResult.msg}
          </span>
        )}
      </div>

      <div className="mt-4 rounded-xl p-3" style={{ background: 'var(--bg-panel-solid)', border: '1px dashed var(--border-subtle)' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>Dein Gehirn für Claude Desktop / Cursor</div>
            <code className="text-[11px] block truncate mt-1" style={{ color: 'var(--text-3)' }}>{mcpJson.replaceAll('\n', ' ')}</code>
          </div>
          <button onClick={() => copy('mcp', mcpJson)} className="btn-ghost flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs shrink-0">
            {copied === 'mcp' ? <Check className="w-3.5 h-3.5" style={{ color: 'var(--ok)' }} /> : <Copy className="w-3.5 h-3.5" />}
            {copied === 'mcp' ? 'Kopiert' : 'Konfig kopieren'}
          </button>
        </div>
        <div className="text-[11px] mt-1.5" style={{ color: 'var(--text-3)' }}>
          Oder HTTP: <code>POST http://localhost:3000/mcp</code> (JSON-RPC, Protokoll 2026-07-28)
          <button onClick={() => copy('url', 'http://localhost:3000/mcp')} className="ml-1.5 underline" style={{ color: 'var(--accent)' }}>kopieren</button>
        </div>
      </div>
    </div>
  );
}
