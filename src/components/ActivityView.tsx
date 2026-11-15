// AI activity: which apps use your memory and what they do — live — and the
// audit log, the sealed record of every access, for you and for an auditor.
import { ApiFehler, tuerSatz } from '../lib/api';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Bot, ShieldCheck, Download, Loader2, CheckCircle2, AlertTriangle } from '../lib/icons';
import { absage } from '../lib/absage';
import { ConnectApps } from './ConnectApps';
import { benutzeFensterStatus } from './ui/FensterStatus';

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

  if (eintraege === null) return <p className="fs-4 lh-lesbar" style={{ color: 'var(--text-3)' }}>Loading…</p>;
  if (eintraege.length === 0) {
    return (
      <div>
        {/* P202, Mockup-Grammatik: der Leerauftritt steht zentriert in der Fläche,
            der Connect-Tisch darunter in seiner Lesebreite (560 px). */}
        <div className="flex flex-col items-center justify-center text-center" style={{ minHeight: '34vh' }}>
          <h2 className="fs-5 font-bold" style={{ color: 'var(--text-1)', margin: 0 }}>
            No AI app has used K3PTA yet.
          </h2>
          <p className="fs-3 lh-lesbar mt-2 max-w-[52ch]" style={{ color: 'var(--text-2)' }}>
            Connect one below — every note it saves or looks up shows up here as it happens.
          </p>
        </div>
        <div style={{ maxWidth: 560 }}>
          <ConnectApps />
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-[680px]">
      {apps.length > 0 && (
        <section className="detail-gruppe" style={{ marginTop: 0 }}>
          <div className="detail-gruppe-name">Connected apps</div>
          <div className="gruppen-tisch">
            {apps.map((a, i) => {
              const live = Date.now() - a.lastSeen < LIVE_MS;
              return (
                <div
                  key={a.who}
                  className="app-zeile"
                  style={i === apps.length - 1 ? { borderBottom: 'none' } : undefined}
                >
                  <span className={`app-icon ${live ? 'ok' : ''}`}>{a.who.slice(0, 1).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <div className="app-name flex items-center gap-2">
                      <span>{a.who}</span>
                      <span
                        aria-hidden
                        className={live ? 'animate-pulse inline-block' : 'inline-block'}
                        style={{ width: 7, height: 7, borderRadius: 999, background: live ? 'var(--ok)' : 'var(--text-3)' }}
                      />
                    </div>
                    <div className="app-zustand tnum">
                      {live ? 'active now' : vor(a.lastSeen)} · {a.calls} {a.calls === 1 ? 'call' : 'calls'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
      <section className="detail-gruppe" style={apps.length === 0 ? { marginTop: 0 } : undefined}>
        <div className="detail-gruppe-name">Recent calls</div>
        <div className="gruppen-tisch">
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {eintraege.map((e, i) => (
              <li
                key={e.id}
                className="app-zeile"
                style={i === eintraege.length - 1 ? { borderBottom: 'none', alignItems: 'flex-start' } : { alignItems: 'flex-start' }}
              >
                <span
                  aria-hidden
                  className={`app-icon mt-0.5 ${/save|update|delete|forget/.test(e.tool) ? 'ok' : ''}`}
                >
                  <Bot className="w-3.5 h-3.5" style={{ color: /save|update|delete|forget/.test(e.tool) ? 'var(--accent)' : 'var(--text-3)' }} />
                </span>
                <div className="min-w-0 flex-1 fs-3" style={{ color: 'var(--text-2)' }}>
                  <strong style={{ color: 'var(--text-1)' }}>{e.who}</strong> {VERB[e.tool] ?? e.tool.replace(/^memory_/, '').replace(/_/g, ' ')}{' '}
                  {e.text && (e.noteId
                    ? <button onClick={() => onOpenMemory(e.noteId!)} className="font-semibold hover:underline underline-offset-2 text-left" style={{ color: 'var(--text-1)' }}>{e.text}</button>
                    : <strong style={{ color: 'var(--text-1)' }}>{e.tool === 'memory_search' ? `“${e.text}”` : e.text}</strong>)}
                  {e.tool === 'memory_search' && e.count !== null && <span style={{ color: 'var(--text-3)' }}> · {e.count} {e.count === 1 ? 'note' : 'notes'}</span>}
                </div>
                <div className="fs-1 tnum shrink-0 pt-0.5" style={{ color: 'var(--text-3)' }}>{vor(e.at)}</div>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <details className="detail-gruppe">
        <summary className="fs-3 font-semibold cursor-pointer" style={{ color: 'var(--accent)' }}>Connect another app</summary>
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
          if (!r.ok) throw new ApiFehler(tuerSatz(d.error, `HTTP ${r.status}`), r.status);
          if (nr !== zaehler.current) return;
          setEintraege(d.entries ?? []);
          setMehr(!!d.more);
          setActors(d.actors ?? []);
          setActions(d.actions ?? []);
          setFehler(null);
        })
        .catch((e: unknown) => setFehler(absage("The activity list did not arrive.", e)));
    }, 250);
    return () => clearTimeout(t);
  }, [filter]);

  const weitere = async () => {
    const letzte = eintraege[eintraege.length - 1];
    if (!letzte) return;
    // Punkt 4, 2.11.: hier gab es weder eine Status-Frage noch ein catch. Die 500 warf, die
    // Ablehnung ging unbehandelt weg, und der Knopf stand still, als haette er nichts getan.
    try {
      const r = await fetch(`/api/audit?${filter({ before: String(letzte.id) })}`);
      const d = await r.json().catch(() => null);
      if (!r.ok) { setFehler(`More entries did not arrive — the log answered ${r.status}.`); return; }
      setEintraege((e) => [...e, ...(d?.entries ?? [])]);
      setMehr(!!d?.more);
      setFehler(null);
    } catch {
      setFehler('More entries did not arrive — the log did not answer.');
    }
  };

  const pruefen = async () => {
    setPrueft(true);
    try {
      const r = await fetch('/api/audit/verify');
      const d = await r.json().catch(() => null);
      if (!r.ok) { setFehler(`The seal check did not run — the log answered ${r.status}.`); return; }
      setPruefung(d as Pruefung);
      setFehler(null);
    } catch {
      setFehler('The seal check did not run — the log did not answer.');
    } finally {
      setPrueft(false);
    }
  };

  const exportieren = async () => {
    try {
      const r = await fetch(`/api/audit/export.csv?${filter()}`);
      // P61: die Zahl der eignen Tuer in der eigner Unterschrift, sonst endet die Absage grundlos.
      if (!r.ok) throw new ApiFehler(`HTTP ${r.status}`, r.status);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `kepta-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      // P61: der Verweis auf die Konsole ist eine Ausrede, seit die eigne Zahl auf der Flaeche
      // stehen darf; was in der Konsole bleibt, ist der Wortlaut eines Fremden.
      setFehler(absage("The export did not run. Your notes were not changed.", e));
    }
  };

  return (
    <div className="max-w-[680px]">
      <div className="gruppen-tisch p-4 mb-4">
        <p className="fs-3 lh-lesbar mb-3" style={{ color: 'var(--text-2)', marginTop: 0 }}>
          Every access to your knowledge base — by you, by each AI app and by scripts. Each entry is sealed with the one before it:
          if anyone changes or removes an entry, the check below shows it.
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void pruefen()} disabled={prueft} className="btn-primary px-3 py-1.5 rounded-lg fs-2 font-semibold flex items-center gap-2 disabled:opacity-50">
            {prueft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />} Check integrity
          </button>
          <button onClick={() => void exportieren()} className="btn-ghost px-3 py-1.5 rounded-lg fs-2 flex items-center gap-2" style={{ border: '1px solid var(--border-subtle)', background: 'var(--eb-2)' }}>
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
        {pruefung && (
          <p role="status" data-testid="audit-check" className="fs-3 mt-3 rounded-lg px-3 py-2 flex items-center gap-2" style={{ color: pruefung.ok ? 'var(--ok)' : 'var(--danger)', border: `1px solid ${pruefung.ok ? 'var(--ok)' : 'var(--danger)'}`, marginBottom: 0 }}>
            {pruefung.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            {pruefung.ok
              ? `Intact — ${pruefung.entries} ${pruefung.entries === 1 ? 'entry' : 'entries'}, none changed or removed.`
              : pruefung.truncated
                ? `Entries are missing at the end — the log was cut off after entry ${pruefung.entries}.`
                : `Something was changed: entry ${pruefung.brokenAt} does not match the one before it.`}
          </p>
        )}
      </div>
      <div className="flex flex-wrap sm:flex-nowrap gap-2 mb-3">
        <select aria-label="Who" value={wer} onChange={(e) => setWer(e.target.value)} className="hud-input rounded-lg px-3 py-1.5 fs-2">
          <option value="">Everyone</option>
          {actors.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select aria-label="What" value={was} onChange={(e) => setWas(e.target.value)} className="hud-input rounded-lg px-3 py-1.5 fs-2">
          <option value="">Every action</option>
          {actions.map((a) => <option key={a} value={a}>{AKTION[a] ?? a}</option>)}
        </select>
        <input aria-label="Search the log" value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search a note, a query…" className="hud-input flex-1 min-w-[160px] rounded-lg px-3 py-1.5 fs-2" />
      </div>
      {fehler && <p className="fs-4 lh-lesbar mb-2" style={{ color: 'var(--warn)' }}>{fehler}</p>}
      {eintraege.length === 0 ? (
        <div className="gruppen-tisch p-4">
          <p className="fs-3 lh-lesbar" style={{ color: 'var(--text-3)', margin: 0 }}>Nothing recorded {wer || was || suche ? 'that matches' : 'yet'}.</p>
        </div>
      ) : (
        <div className="gruppen-tisch">
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }} data-testid="audit-list">
            {eintraege.map((e, i) => {
              const details = lesbareDetails(e.detail);
              return (
                <li
                  key={e.id}
                  className="app-zeile"
                  style={i === eintraege.length - 1 ? { borderBottom: 'none', alignItems: 'flex-start' } : { alignItems: 'flex-start' }}
                >
                  <div className="min-w-0 flex-1 fs-3">
                    <div style={{ color: 'var(--text-2)' }}>
                      <strong style={{ color: 'var(--text-1)' }}>{e.actor}</strong> {AKTION[e.action] ?? e.action}
                      {e.target && <> <span style={{ color: 'var(--text-1)' }}>{e.action === 'search' ? `“${e.target}”` : e.target}</span></>}
                    </div>
                    {details && (
                      <div className="fs-1 mt-0.5 break-words" style={{ color: 'var(--text-3)' }}>{details}</div>
                    )}
                  </div>
                  <div className="fs-1 tnum shrink-0 pt-0.5" style={{ color: 'var(--text-3)' }}>
                    {new Date(e.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {mehr && (
        <button onClick={() => void weitere()} className="btn-ghost mt-3 px-3 py-1.5 rounded-lg fs-2" style={{ border: '1px solid var(--border-subtle)', background: 'var(--eb-2)' }}>
          Load more
        </button>
      )}
    </div>
  );
}

export function ActivityView({ aktiv, onOpenMemory }: { aktiv: boolean; onOpenMemory: (id: string) => void }) {
  const [reiter, setReiter] = useState<'live' | 'audit'>('live');
  const melde = benutzeFensterStatus();
  useEffect(() => {
    if (!aktiv) return;
    // Die Statuszeile wohnt am Fenster-Slot (volle Breite, Mockup .statuszeile);
    // die Fläche meldet ihre Wörter dorthin.
    melde({
      links: (
        <>
          <span className="gruen">Sealed record</span>
          <span className="strich">·</span>
          <span>every access, local</span>
        </>
      ),
      rechts: reiter === 'live' ? 'Live' : 'Audit log',
    });
  }, [aktiv, reiter, melde]);
  return (
    <div className="flex-1 flex flex-col min-h-0" data-testid="activity-view">
      {/* P202, Mockup-Grammatik: der Titel steht im Kopf der Fläche, die Wahl
          (Live/Audit) als Segmente in den Kopf-Handlungen — der Hero flog. */}
      <div className="listen-kopf">
        <h2 className="listen-titel fs-2 font-semibold" style={{ margin: 0 }}>What your AI apps read and write</h2>
        <div className="kopf-handlungen">
          <div className="apple-seg hud-inset inline-flex items-center p-0.5 rounded-lg" role="tablist">
            {([['live', 'Live', 'Live shows what your AI apps are reading and writing in your memory right now'], ['audit', 'Audit log', 'The audit log is the sealed list of who read or changed what in your memory, and when']] as const).map(([id, label, erklaerung]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={reiter === id}
                onClick={() => setReiter(id)}
                title={erklaerung}
                className={`apple-seg-btn px-3 py-1 rounded-md fs-2 font-semibold transition-colors ${reiter === id ? 'bg-blatt shadow-sm' : ''}`}
                style={{
                  color: reiter === id ? 'var(--text-1)' : 'var(--text-2)',
                  background: reiter === id ? 'var(--eb-2)' : 'transparent',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="detail-korper">
        {reiter === 'live' ? <Live aktiv={aktiv} onOpenMemory={onOpenMemory} /> : <Protokoll />}
      </div>
    </div>
  );
}
