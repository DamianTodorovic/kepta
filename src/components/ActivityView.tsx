// AI activity: which apps use your memory and what they do — live — and the
// audit log, the sealed record of every access, for you and for an auditor.
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Bot, ShieldCheck, Download, Loader2, CheckCircle2, AlertTriangle } from '../lib/icons';
import { ConnectApps } from './ConnectApps';

interface Eintrag { id: number; at: number; who: string; tool: string; text: string | null; noteId: string | null; count: number | null }
interface Agent { who: string; lastSeen: number; calls: number }
interface Pruefeintrag { id: number; at: number; actor: string; action: string; target: string | null; detail: string | null }
interface Pruefung { ok: boolean; entries: number; brokenAt: number | null; truncated: boolean }

/** Apps seen within the last five minutes count as active. */
export const LIVE_MS = 5 * 60_000;

const VERB: Record<string, string> = {
  memory_save: 'saved',
  memory_update: 'changed',
  memory_search: 'searched for',
  memory_delete: 'moved to the trash',
  memory_forget: 'marked as outdated',
  memory_list: 'looked through your notes',
  memory_graph: 'looked at how your notes link',
  memory_consolidate: 'checked for duplicates',
  connect: 'connected',
};

/** The audit actions in words anyone understands. */
export const AKTION: Record<string, string> = {
  search: 'searched for',
  list: 'listed',
  save: 'saved',
  update: 'changed',
  delete: 'moved to the trash',
  'delete permanently': 'deleted permanently',
  forget: 'marked as outdated',
  graph: 'looked at the graph',
  consolidate: 'checked for duplicates',
  connect: 'connected',
  'connect app': 'connected an app',
  'cloud chat': 'asked a cloud model',
  export: 'exported',
  import: 'imported',
  restore: 'restored',
  reclassify: 'sorted by kind',
  scan: 'scanned',
  clip: 'clipped',
  repair: 'repaired',
  'show recovery key': 'showed the recovery key',
  'privacy shield': 'changed the privacy shield',
  'keep both': 'kept both notes',
  'resolve contradiction': 'resolved a contradiction',
};

/** A note id as K3PTA creates it — k-<time>-<8 hex>. */
const NOTIZ_ID = /\bk-[0-9a-z]+-[0-9a-f]{8}\b\s?/g;

/**
 * The details of an audit entry the way a person reads them: note titles
 * without their ids. The ids stay in the log itself and in the CSV export —
 * there they are what an auditor checks against.
 */
export function lesbareDetails(detail: string | null): string | null {
  if (!detail) return null;
  const text = detail.replace(NOTIZ_ID, '').replace(/\s*;\s*$/, '').trim();
  return text && text !== ':' ? text.replace(/:$/, '') : null;
}

const vor = (ms: number) => formatDistanceToNow(new Date(ms), { addSuffix: true });

function Live({ aktiv, onOpenMemory }: { aktiv: boolean; onOpenMemory: (id: string) => void }) {
  const [eintraege, setEintraege] = useState<Eintrag[] | null>(null);
  const [apps, setApps] = useState<Agent[]>([]);
  useEffect(() => {
    if (!aktiv) return;
    let vorbei = false;
    // The first load always runs — only the repeats pause while the window is hidden.
    const holen = (immer = false) => {
      if (!immer && typeof document !== 'undefined' && document.hidden) return;
      fetch('/api/agents')
        .then((r) => r.json())
        .then((d: { entries?: Eintrag[]; agents?: Agent[] }) => {
          if (vorbei) return;
          setEintraege(Array.isArray(d.entries) ? d.entries : []);
          setApps(Array.isArray(d.agents) ? d.agents : []);
        })
        .catch(() => { if (!vorbei) setEintraege((e) => e ?? []); });
    };
    holen(true);
    const t = setInterval(() => holen(), 3000);
    return () => { vorbei = true; clearInterval(t); };
  }, [aktiv]);

  if (eintraege === null) return <p className="text-sm" style={{ color: 'var(--text-3)' }}>Loading…</p>;
  if (eintraege.length === 0) {
    return (
      <div className="space-y-5">
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>
          No AI app has used K3PTA yet. Connect one below — every note it saves or looks up then shows up here as it happens.
        </p>
        <ConnectApps />
      </div>
    );
  }
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5">
        {apps.map((a) => {
          const live = Date.now() - a.lastSeen < LIVE_MS;
          return (
            <span key={a.who} className="px-3 py-1.5 rounded-full text-[12.5px] flex items-center gap-2" style={{ background: 'var(--bg-inset-strong)', color: 'var(--text-1)' }}>
              <span aria-hidden className={live ? 'animate-pulse' : ''} style={{ width: 8, height: 8, borderRadius: 999, background: live ? 'var(--ok)' : 'var(--text-3)' }} />
              <strong>{a.who}</strong>
              <span style={{ color: 'var(--text-3)' }}>{live ? 'active now' : vor(a.lastSeen)} · {a.calls} {a.calls === 1 ? 'call' : 'calls'}</span>
            </span>
          );
        })}
      </div>
      <ul className="space-y-1">
        {eintraege.map((e) => (
          <li key={e.id} className="flex gap-3 items-start px-3 py-2 rounded-lg hover:bg-[var(--bg-inset)]">
            <Bot className="w-4 h-4 mt-0.5 shrink-0" style={{ color: /save|update|delete|forget/.test(e.tool) ? 'var(--accent)' : 'var(--text-3)' }} />
            <div className="min-w-0 text-[13px]" style={{ color: 'var(--text-2)' }}>
              <strong style={{ color: 'var(--text-1)' }}>{e.who}</strong> {VERB[e.tool] ?? e.tool.replace(/^memory_/, '').replace(/_/g, ' ')}{' '}
              {e.text && (e.noteId
                ? <button onClick={() => onOpenMemory(e.noteId!)} className="font-medium hover:underline underline-offset-2" style={{ color: 'var(--text-1)' }}>{e.text}</button>
                : <strong style={{ color: 'var(--text-1)' }}>{e.tool === 'memory_search' ? `“${e.text}”` : e.text}</strong>)}
              {e.tool === 'memory_search' && e.count !== null && <span style={{ color: 'var(--text-3)' }}> · {e.count} {e.count === 1 ? 'note' : 'notes'}</span>}
              <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>{vor(e.at)}</div>
            </div>
          </li>
        ))}
      </ul>
      <details className="mt-6">
        <summary className="text-[13px] cursor-pointer" style={{ color: 'var(--accent)' }}>Connect another app</summary>
        <div className="mt-3"><ConnectApps /></div>
      </details>
    </div>
  );
}

function Protokoll() {
  const [eintraege, setEintraege] = useState<Pruefeintrag[]>([]);
  const [mehr, setMehr] = useState(false);
  const [actors, setActors] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [wer, setWer] = useState('');
  const [was, setWas] = useState('');
  const [suche, setSuche] = useState('');
  const [pruefung, setPruefung] = useState<Pruefung | null>(null);
  const [prueft, setPrueft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const zaehler = useRef(0);

  const filter = useCallback((extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ ...(wer ? { actor: wer } : {}), ...(was ? { action: was } : {}), ...(suche.trim() ? { q: suche.trim() } : {}), ...extra });
    return p.toString();
  }, [wer, was, suche]);

  useEffect(() => {
    const nr = ++zaehler.current;
    const t = setTimeout(() => {
      fetch(`/api/audit?${filter()}`)
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
          if (nr !== zaehler.current) return;
          setEintraege(d.entries ?? []);
          setMehr(!!d.more);
          setActors(d.actors ?? []);
          setActions(d.actions ?? []);
          setFehler(null);
        })
        .catch((e: unknown) => setFehler(e instanceof Error ? e.message : String(e)));
    }, 250);
    return () => clearTimeout(t);
  }, [filter]);

  const weitere = async () => {
    const letzte = eintraege[eintraege.length - 1];
    if (!letzte) return;
    const d = await (await fetch(`/api/audit?${filter({ before: String(letzte.id) })}`)).json();
    setEintraege((e) => [...e, ...(d.entries ?? [])]);
    setMehr(!!d.more);
  };

  const pruefen = async () => {
    setPrueft(true);
    try {
      setPruefung(await (await fetch('/api/audit/verify')).json() as Pruefung);
    } finally {
      setPrueft(false);
    }
  };

  const exportieren = async () => {
    try {
      const r = await fetch(`/api/audit/export.csv?${filter()}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `kepta-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setFehler(`The export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div>
      <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>
        Every access to your knowledge base — by you, by each AI app and by scripts. Each entry is sealed with the one before it:
        if anyone changes or removes an entry, the check below shows it.
      </p>
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => void pruefen()} disabled={prueft} className="btn-primary px-3 py-2 rounded-lg text-[13px] font-medium flex items-center gap-1.5 disabled:opacity-50">
          {prueft ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Check integrity
        </button>
        <button onClick={() => void exportieren()} className="btn-ghost px-3 py-2 rounded-lg text-[13px] flex items-center gap-1.5" style={{ border: '1px solid var(--border-subtle)' }}>
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>
      {pruefung && (
        <p role="status" data-testid="audit-check" className="text-[13px] mb-4 rounded-lg px-3 py-2 flex items-center gap-2" style={{ color: pruefung.ok ? 'var(--ok)' : 'var(--danger)', border: `1px solid ${pruefung.ok ? 'var(--ok)' : 'var(--danger)'}` }}>
          {pruefung.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {pruefung.ok
            ? `Intact — ${pruefung.entries} ${pruefung.entries === 1 ? 'entry' : 'entries'}, none changed or removed.`
            : pruefung.truncated
              ? `Entries are missing at the end — the log was cut off after entry ${pruefung.entries}.`
              : `Something was changed: entry ${pruefung.brokenAt} does not match the one before it.`}
        </p>
      )}
      <div className="flex flex-wrap gap-2 mb-3">
        <select aria-label="Who" value={wer} onChange={(e) => setWer(e.target.value)} className="hud-input rounded-lg px-2.5 py-1.5 text-[13px]">
          <option value="">Everyone</option>
          {actors.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select aria-label="What" value={was} onChange={(e) => setWas(e.target.value)} className="hud-input rounded-lg px-2.5 py-1.5 text-[13px]">
          <option value="">Every action</option>
          {actions.map((a) => <option key={a} value={a}>{AKTION[a] ?? a}</option>)}
        </select>
        <input aria-label="Search the log" value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search a note, a query…" className="hud-input flex-1 min-w-[160px] rounded-lg px-2.5 py-1.5 text-[13px]" />
      </div>
      {fehler && <p className="text-sm mb-2" style={{ color: 'var(--warn)' }}>{fehler}</p>}
      {eintraege.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>Nothing recorded {wer || was || suche ? 'that matches' : 'yet'}.</p>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--border-subtle)' }} data-testid="audit-list">
          {eintraege.map((e) => (
            <li key={e.id} className="py-2 text-[13px]" style={{ borderColor: 'var(--border-subtle)' }}>
              <div style={{ color: 'var(--text-2)' }}>
                <strong style={{ color: 'var(--text-1)' }}>{e.actor}</strong> {AKTION[e.action] ?? e.action}
                {e.target && <> <span style={{ color: 'var(--text-1)' }}>{e.action === 'search' ? `“${e.target}”` : e.target}</span></>}
              </div>
              <div className="text-[11px] mt-0.5 break-words" style={{ color: 'var(--text-3)' }}>
                {new Date(e.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {lesbareDetails(e.detail) ? ` · ${lesbareDetails(e.detail)}` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
      {mehr && <button onClick={() => void weitere()} className="btn-ghost mt-3 px-3 py-1.5 rounded-lg text-[12.5px]">Load more</button>}
    </div>
  );
}

export function ActivityView({ aktiv, onOpenMemory }: { aktiv: boolean; onOpenMemory: (id: string) => void }) {
  const [reiter, setReiter] = useState<'live' | 'audit'>('live');
  return (
    <div className="max-w-3xl mx-auto py-6" data-testid="activity-view">
      <header className="mb-5">
        <h1 className="display">Activity</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>What your AI apps read and write in your memory — and a sealed record of every access.</p>
      </header>
      <div className="flex gap-1 p-1 rounded-xl hud-inset mb-6 max-w-xs" role="tablist">
        {([['live', 'Live'], ['audit', 'Audit log']] as const).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={reiter === id}
            onClick={() => setReiter(id)}
            className={`flex-1 py-1.5 rounded-lg text-[13px] font-medium ${reiter === id ? 'bg-white dark:bg-zinc-800 shadow-sm' : ''}`}
            style={{ color: reiter === id ? 'var(--text-1)' : 'var(--text-2)' }}
          >
            {label}
          </button>
        ))}
      </div>
      {reiter === 'live' ? <Live aktiv={aktiv} onOpenMemory={onOpenMemory} /> : <Protokoll />}
    </div>
  );
}
