// System-Status — die App legt offen, was funktioniert und was fehlt (statt „funktioniert nicht"-Rätsel).
import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Copy, Check, Send, Loader2, ShieldCheck } from "../lib/icons";
import { APP_VERSION } from '../core/version';
import { PROVIDERS, providerById, loadAISettings, hydrateAISettings } from '../lib/ai';
import { RecoveryKey } from './RecoveryKey';
import { getJsonOderNull } from '../lib/api';
import { QUITTUNG_MS } from '../lib/quittung';
import { istLokaleAdresse } from '../lib/schild';

interface Health {
  ok: boolean;
  dbPath: string;
  count: number;
  embeddings: { total: number; embedded: number };
  mcp: { protocol: string; tools: number; http: string };
  encryption: { aktiv: boolean; ablage?: string; hinweis?: string };
}

/**
 * Die Antwort von /api/health in eine verlaessliche Form bringen.
 *
 * Vorher wurde sie ungeprueft uebernommen und danach tief ausgelesen
 * (health.embeddings.total, health.mcp.protocol). Fehlte ein Feld — eine
 * aeltere Fassung, ein Fehlerobjekt mit Status 200, eine Zwischenschicht, die
 * etwas anderes zurueckgibt — warf das Auslesen, und React haengte den GANZEN
 * Einstellungs-Bildschirm aus: leeres Fenster, keine Meldung, kein Hinweis.
 * Eine Statusanzeige, die selbst am Zustand zerbricht, ist das Gegenteil ihres
 * Zwecks.
 */
export function normalisiereHealth(roh: unknown): Health | null {
  if (!roh || typeof roh !== "object") return null;
  const d = roh as Record<string, unknown>;
  const zahl = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const text = (v: unknown, fallback: string): string => (typeof v === "string" && v ? v : fallback);
  const e = (d.embeddings ?? {}) as Record<string, unknown>;
  const m = (d.mcp ?? {}) as Record<string, unknown>;
  const v = (d.encryption ?? {}) as Record<string, unknown>;
  const verschluesselung: Health["encryption"] = { aktiv: v.aktiv === true };
  if (typeof v.ablage === "string" && v.ablage) verschluesselung.ablage = v.ablage;
  if (typeof v.hinweis === "string" && v.hinweis) verschluesselung.hinweis = v.hinweis;
  return {
    ok: d.ok === true,
    dbPath: text(d.dbPath, "unknown"),
    count: zahl(d.count),
    embeddings: { total: zahl(e.total), embedded: zahl(e.embedded) },
    mcp: { protocol: text(m.protocol, "?"), tools: zahl(m.tools), http: text(m.http, "/mcp") },
    encryption: verschluesselung,
  };
}

/** Wo der Schluessel liegt, in einem halben Satz. */
function schluesselOrt(ablage?: string): string {
  if (!ablage) return '';
  if (ablage === 'KEPTA_DB_KEY') return ', key from KEPTA_DB_KEY';
  if (ablage === 'Windows DPAPI') return ', key protected by Windows DPAPI';
  return `, key in the ${ablage}`;
}

function Row({ ok, label, detail, fix, seal, unknown }: { ok: boolean; label: string; detail: string; fix?: string; seal?: boolean; unknown?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-3">
      {unknown
        ? <Loader2 className="w-4 h-4 mt-1 shrink-0 animate-spin" style={{ color: 'var(--text-3)' }} />
        : ok
          ? seal
            ? <ShieldCheck className="w-4.5 h-4.5 mt-1 shrink-0" style={{ color: 'var(--accent)' }} />
            : <CheckCircle2 className="w-4 h-4 mt-1 shrink-0" style={{ color: 'var(--ok)' }} />
          : <XCircle className="w-4 h-4 mt-1 shrink-0" style={{ color: '#e6a100' }} />}
      <div className="min-w-0">
        <div className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{label}</div>
        <div className="text-xs mt-1" style={{ color: 'var(--text-2)' }}>{detail}</div>
        {!unknown && !ok && fix && <div className="text-xs mt-1 font-medium" style={{ color: '#d97706' }}>How to fix it: {fix}</div>}
      </div>
    </div>
  );
}

/**
 * Was die Tafel ueber die Auskunft weiss — drei Zustände, nicht zwei.
 *
 * Gemessen 17.10. am ausgelieferten 3.2.17: `GET /api/health` braucht im Stand
 * 2,5 s, im geoeffneten Fenster unter Nebenlast 20,1 s. Bis dahin gab es nur
 * „hat geantwortet" und „hat nicht geantwortet", und die ausstehende Antwort
 * fiel in dieselbe Schublade wie der Ausfall — die Tafel verneinte, was die
 * Tuer im selben Augenblick bejahte („Server unreachable", „not encrypted",
 * „0 nodes" bei 21 066 Knoten und Schluessel True). Ein ausstehender Messwert
 * ist kein Befund.
 */
type Auskunft = 'laeuft' | 'da' | 'weg';

export function SystemStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [antwort, setAntwort] = useState<Auskunft>('laeuft');
  const [ollama, setOllama] = useState<boolean | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // K1 — die Verbindung liegt in der verschluesselten Datenbank (`ai_connection`)
  // und wird nach einem Neustart asynchronous zurueckgelesen. Vorher traegt
  // localStorage nichts, und ein Behaupten ueber sie war ein Raten: gemessen 174 ms
  // lang „No key yet" auf dem Schirm, obwohl der Schluessel da war.
  const [bereit, setBereit] = useState(false);

  useEffect(() => {
    let vorbei = false;
    hydrateAISettings().then(
      () => { if (!vorbei) setBereit(true); },
      () => { if (!vorbei) setBereit(true); },
    );
    return () => { vorbei = true; };
  }, []);

  useEffect(() => {
    void (async () => {
      const h = await getJsonOderNull<Parameters<typeof normalisiereHealth>[0]>('/api/health');
      setHealth(h ? normalisiereHealth(h) : null);
      setAntwort(h ? 'da' : 'weg');
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
  // Aufgabe #8 (24.10.): dieselbe Bedingung wie die Tuer (server/router/chat.ts:46). Ein
  // lokaler Endpunkt traegt die Anfrage ohne Schluessel - die Zeile sagt das jetzt, statt
  // "No key yet" zu behaupten und damit etwas zu versprechen, das nicht stimmt.
  const lokalOhneSchluessel = prov.needsKey && !s.apiKey && istLokaleAdresse(s.baseUrl);
  const keyOk = !prov.needsKey || !!s.apiKey || lokalOhneSchluessel;
  const modelOk = !!s.model;

  /**
   * "Copied" erst melden, wenn es auch geklappt hat.
   *
   * Vorher wurde der Haken gesetzt, ohne das Ergebnis abzuwarten — ohne
   * Zwischenablage (fehlende Berechtigung, unsicherer Kontext) bekam der Nutzer
   * eine Erfolgsmeldung fuer etwas, das nicht passiert ist.
   */
  const copy = (id: string, text: string) => {
    const zwischenablage = navigator.clipboard;
    if (!zwischenablage?.writeText) { setCopyError(id); return; }
    void zwischenablage.writeText(text).then(
      () => {
        setCopied(id);
        setTimeout(() => setCopied((c) => (c === id ? null : c)), QUITTUNG_MS);
      },
      () => setCopyError(id)
    );
  };

  function setCopyError(id: string) {
    setCopied(`fehler:${id}`);
    setTimeout(() => setCopied((c) => (c === `fehler:${id}` ? null : c)), QUITTUNG_MS);
  }

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: s.providerId, protocol: prov.protocol, baseUrl: s.baseUrl || prov.baseUrl, apiKey: s.apiKey, model: s.model, messages: [{ role: 'user', content: 'Reply only: OK' }] }),
      });
      const data = await res.json();
      setTestResult(res.ok ? { ok: true, msg: `Model answers: “${String(data.text ?? '').trim().slice(0, 40)}”` } : { ok: false, msg: String(data.error ?? `HTTP ${res.status}`) });
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : 'Connection error' });
    } finally {
      setTesting(false);
    }
  };

  const mcpJson = JSON.stringify({ mcpServers: { kepta: { command: 'npx', args: ['-y', 'kepta-mcp'] } } }, null, 2);
  const coverage = health && health.embeddings.total > 0 ? Math.round((health.embeddings.embedded / health.embeddings.total) * 100) : 0;

  return (
    <div className="rounded-2xl p-3 sm:p-5" style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg-inset)' }}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>System status</h3>
          <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>What works — and what is missing for everything to work.</p>
        </div>
      </div>

      <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
        <Row
          ok
          label={`Version ${APP_VERSION}`}
          detail="The running app — also reported over MCP and /api/health."
        />
        <Row
          unknown={antwort === 'laeuft'}
          ok={!!health?.ok}
          label="The database on this computer"
          detail={
            antwort === 'laeuft' ? 'Asking K3PTA itself…'
              : antwort === 'weg' ? 'K3PTA did not answer this time.'
                : health ? `${health.count} notes · file: ${health.dbPath} · ${health.mcp.tools} tools for AI apps (MCP ${health.mcp.protocol} at ${health.mcp.http})`
                  : 'K3PTA answered, but not in a form this panel can read.'
          }
          fix={antwort === 'weg' ? 'Close K3PTA and open it again.' : undefined}
        />
        <Row
          unknown={antwort === 'laeuft'}
          ok={!!health?.encryption.aktiv}
          seal={!!health?.encryption.aktiv}
          label="Encrypted on this disk"
          detail={antwort === 'laeuft' ? 'Not known yet — this line fills in with the rest.'
            : !health ? 'K3PTA could not read its own state. That says nothing about the file.'
              : health.encryption.aktiv
                ? `The knowledge base file is encrypted (SQLCipher 4 format, AES-256${schluesselOrt(health.encryption.ablage)}).`
                : health.encryption.hinweis ?? 'The knowledge base file is not encrypted.'}
          fix={health && !health.encryption.aktiv ? "Close other programs that use K3PTA (AI agents over MCP) and restart K3PTA — it encrypts the file as soon as it has it to itself." : undefined}
        />
        <Row
          unknown={!bereit}
          ok={keyOk}
          label={bereit ? `Provider: ${prov.label}` : 'Provider'}
          detail={bereit
            ? (lokalOhneSchluessel ? 'Local endpoint - this address needs no key.'
              : keyOk ? 'API key stored.' : 'No key yet — chat stays silent until you add one. Your agents read and write without a key.')
            : 'Reading the connection stored on this computer…'}
          fix={'“Settings” on the left → “AI & data” → pick a provider → enter a key.'}
        />
        <Row
          unknown={!bereit}
          ok={modelOk}
          label="Model selected"
          detail={bereit ? (modelOk ? `Active: ${s.model}` : 'No model set.') : 'Reading the connection stored on this computer…'}
          fix="Settings → load and pick a model from the list."
        />
        <Row
          unknown={ollama === null}
          ok={ollama === true}
          label="Ollama / Embeddings (optional)"
          detail={ollama === null ? 'Checking whether Ollama answers on this computer…' : ollama ? 'Ollama reachable — vector search active.' : 'No answer from Ollama — search still runs purely lexically (71 % Hit@1 over the 58-note, 45-question test corpus that ships with K3PTA, against 51 % for naive substring search); with vectors it is stronger across languages too.'}
          fix={ollama === false ? 'Optional: install Ollama from ollama.com and start it — K3PTA picks it up on its own.' : undefined}
        />
        <Row
          unknown={antwort === 'laeuft'}
          ok={!!health && health.count > 0}
          label="Knowledge base"
          detail={antwort === 'laeuft' ? 'Not read yet — the count comes with the answer.'
            : health && health.count > 0 ? `${health.count} notes on this computer · ${coverage} % of their text is searchable by meaning`
              : 'No notes yet — drop files into the window, or let an agent save something.'}
          fix={health ? 'Drag files into the K3PTA window, or import a folder of notes.' : undefined}
        />
      </div>

      {health?.encryption.aktiv && <RecoveryKey />}

      <div className="flex items-center gap-2 mt-3">
        <button onClick={runTest} disabled={testing} className="btn-primary flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium">
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Send a test request
        </button>
        {testResult && (
          <span className="text-xs font-medium" style={{ color: testResult.ok ? 'var(--ok)' : '#d97706' }}>
            {testResult.ok ? '✓ ' : '✗ '}{testResult.msg}
          </span>
        )}
      </div>

      <div className="mt-4 rounded-xl p-2 sm:p-3" style={{ background: 'var(--bg-panel-solid)', border: '1px dashed var(--border-subtle)' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>Your brain for Claude Desktop and Cursor</div>
            <code className="text-[11px] block truncate mt-1" style={{ color: 'var(--text-3)' }}>{mcpJson.replaceAll('\n', ' ')}</code>
          </div>
          <button onClick={() => copy('mcp', mcpJson)} className="btn-ghost flex items-center gap-2 px-3 py-2 rounded-lg text-xs shrink-0">
            {copied === 'mcp' ? <Check className="w-3.5 h-3.5" style={{ color: 'var(--ok)' }} /> : <Copy className="w-3.5 h-3.5" />}
            {copied === 'mcp' ? 'Copied' : copied === 'fehler:mcp' ? 'Copying failed' : 'Copy config'}
          </button>
        </div>
        <div className="text-xs mt-2 flex flex-wrap items-center gap-x-2" style={{ color: 'var(--text-2)' }}>
          <span className="min-w-0">Or HTTP: <code className="break-all">POST {typeof window !== 'undefined' ? window.location.origin : ''}/mcp</code> (JSON-RPC, protocol 2026-07-28)</span>
          <button onClick={() => copy('url', `${typeof window !== 'undefined' ? window.location.origin : ''}/mcp`)} className="min-h-6 px-1 inline-flex items-center underline" style={{ color: 'var(--accent)' }}>copy</button>
        </div>
      </div>
    </div>
  );
}
