// Today: what happened since your last visit, what needs a look, what is due.
// Read straight from the local database — no AI involved, nothing leaves the
// computer, ready the moment the view opens.
import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, CheckCircle2, Bot, Clock, RefreshCw } from '../lib/icons';

export interface Seite { id: string; title: string; sentence: string; value: string; updatedAt: number }
export interface Widerspruch { key: string; newer: Seite; older: Seite; about: string }
interface Kurz { id: string; title: string; type: string; at: number; by?: string }
export interface Briefing {
  since: number;
  created: { total: number; bySource: { who: string; count: number }[]; notes: Kurz[] };
  changed: { total: number; notes: Kurz[] };
  expiring: (Kurz & { validTo: number })[];
  expired: (Kurz & { validTo: number })[];
  todos: { total: number; items: { id: string; title: string; text: string }[] };
  contradictions: Widerspruch[];
  apps: { who: string; calls: number; saves: number; searches: number }[];
}

export const LETZTER_BESUCH = 'kepta_last_today';
const TAG = 86_400_000;

/** When Today was last opened — a day ago the first time. Stores now for the next visit. */
export function besuchSeit(jetzt = Date.now()): number {
  let seit = jetzt - TAG;
  try {
    const roh = Number(localStorage.getItem(LETZTER_BESUCH));
    if (Number.isFinite(roh) && roh > 0 && roh < jetzt) seit = roh;
    localStorage.setItem(LETZTER_BESUCH, String(jetzt));
  } catch {
    // private window — a day ago it is
  }
  return seit;
}

export function gruss(stunde: number): string {
  if (stunde >= 5 && stunde < 12) return 'Good morning';
  if (stunde >= 12 && stunde < 18) return 'Good afternoon';
  return 'Good evening';
}

const vor = (ms: number) => formatDistanceToNow(new Date(ms), { addSuffix: true });
const datum = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function Titel({ id, title, onOpen }: { id: string; title: string; onOpen: (id: string) => void }) {
  return (
    <button onClick={() => onOpen(id)} className="text-left font-medium hover:underline underline-offset-2" style={{ color: 'var(--text-1)' }}>
      {title || 'Untitled'}
    </button>
  );
}

/** The sentence with its value in bold — so the difference jumps out. */
function Satz({ satz, wert }: { satz: string; wert: string }) {
  const i = satz.indexOf(wert);
  if (i < 0) return <>{satz}</>;
  return (
    <>
      {satz.slice(0, i)}
      <strong style={{ color: 'var(--text-1)' }}>{wert}</strong>
      {satz.slice(i + wert.length)}
    </>
  );
}

function Abschnitt({ titel, zahl, children }: { titel: string; zahl?: number; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h3 className="text-[13px] font-semibold mb-2.5 flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
        {titel}
        {typeof zahl === 'number' && <span className="text-[11px] tnum px-1.5 rounded-md" style={{ background: 'var(--bg-inset-strong)', color: 'var(--text-3)' }}>{zahl}</span>}
      </h3>
      {children}
    </section>
  );
}

interface Props {
  aktiv: boolean;
  onOpenMemory: (id: string) => void;
  onGo: (view: 'activity' | 'memories') => void;
}

export function TodayView({ aktiv, onOpenMemory, onGo }: Props) {
  const [seit] = useState(() => besuchSeit());
  const [daten, setDaten] = useState<Briefing | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erledigt, setErledigt] = useState<Record<string, string>>({});

  const laden = useCallback(async () => {
    setFehler(null);
    try {
      const r = await fetch(`/api/briefing?since=${seit}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setDaten(d as Briefing);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }, [seit]);

  useEffect(() => { if (aktiv) void laden(); }, [aktiv, laden]);

  const loese = async (w: Widerspruch, wahl: 'newer' | 'older' | 'both') => {
    const keep = wahl === 'older' ? w.older : w.newer;
    const drop = wahl === 'older' ? w.newer : w.older;
    try {
      const r = await fetch('/api/contradictions/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keep: keep.id, drop: drop.id, both: wahl === 'both' }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? `HTTP ${r.status}`);
      setErledigt((p) => ({ ...p, [w.key]: wahl === 'both' ? 'Noted — KEPTA will not ask about these two again.' : `Done — “${drop.title}” is marked as replaced by “${keep.title}”.` }));
    } catch (e) {
      setErledigt((p) => ({ ...p, [w.key]: `That did not work: ${e instanceof Error ? e.message : String(e)}` }));
    }
  };

  const jetzt = new Date();
  return (
    <div className="max-w-3xl mx-auto py-6" data-testid="today-view">
      <header className="mb-6">
        <h1 className="display">{gruss(jetzt.getHours())}</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
          {jetzt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · what happened since {vor(seit)}
        </p>
        {daten && (
          <div className="flex flex-wrap gap-2 mt-4">
            {[
              [daten.created.total, daten.created.total === 1 ? 'new note' : 'new notes'],
              [daten.changed.total, 'changed'],
              [daten.todos.total, daten.todos.total === 1 ? 'open to-do' : 'open to-dos'],
              [daten.contradictions.length, 'to check'],
            ].map(([n, text]) => (
              <span key={String(text)} className="px-2.5 py-1 rounded-full text-[12px] tnum" style={{ background: 'var(--bg-inset-strong)', color: 'var(--text-2)' }}>
                <strong style={{ color: 'var(--text-1)' }}>{n}</strong> {text}
              </span>
            ))}
          </div>
        )}
      </header>

      {fehler && (
        <div className="hud-inset rounded-xl p-4 text-sm flex items-center gap-3" style={{ color: 'var(--warn)' }}>
          Today could not be loaded — {fehler}
          <button onClick={() => void laden()} className="btn-ghost px-2.5 py-1 rounded-lg text-xs flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> Try again</button>
        </div>
      )}
      {!daten && !fehler && <p className="text-sm" style={{ color: 'var(--text-3)' }}>Getting your day ready…</p>}

      {daten && (
        <>
          {daten.contradictions.length > 0 && (
            <Abschnitt titel="Needs a look" zahl={daten.contradictions.length}>
              <div className="space-y-3">
                {daten.contradictions.map((w) => (
                  <div key={w.key} className="hud-inset rounded-xl p-4" data-testid="contradiction">
                    <div className="text-[13px] mb-3 flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
                      <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: 'var(--warn)' }} />
                      Two notes disagree{w.about ? ` about “${w.about}”` : ''}.
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3 text-[13px]" style={{ color: 'var(--text-2)' }}>
                      {([['Newer', w.newer], ['Older', w.older]] as const).map(([label, s]) => (
                        <div key={s.id}>
                          <div className="text-[11px] mb-1" style={{ color: 'var(--text-3)' }}>{label} · {vor(s.updatedAt)}</div>
                          <Titel id={s.id} title={s.title} onOpen={onOpenMemory} />
                          <p className="mt-1"><Satz satz={s.sentence} wert={s.value} /></p>
                        </div>
                      ))}
                    </div>
                    {erledigt[w.key] ? (
                      <p role="status" className="text-[12.5px] mt-3" style={{ color: 'var(--ok)' }}>{erledigt[w.key]}</p>
                    ) : (
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button onClick={() => void loese(w, 'newer')} className="btn-primary px-3 py-1.5 rounded-lg text-[12.5px] font-medium">Keep the newer</button>
                        <button onClick={() => void loese(w, 'older')} className="btn-ghost px-3 py-1.5 rounded-lg text-[12.5px]" style={{ border: '1px solid var(--border-subtle)' }}>Keep the older</button>
                        <button onClick={() => void loese(w, 'both')} className="btn-ghost px-3 py-1.5 rounded-lg text-[12.5px]">Both are right</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Abschnitt>
          )}

          <Abschnitt titel="Since your last visit" zahl={daten.created.total + daten.changed.total}>
            {daten.created.total === 0 && daten.changed.total === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>Nothing new since your last visit.</p>
            ) : (
              <>
                {daten.created.bySource.length > 0 && (
                  <p className="text-[12.5px] mb-2" style={{ color: 'var(--text-2)' }}>
                    {daten.created.bySource.map((q) => `${q.who}: ${q.count} new`).join(' · ')}
                    {daten.changed.total > 0 ? ` · ${daten.changed.total} changed` : ''}
                  </p>
                )}
                <ul className="space-y-1.5">
                  {[...daten.created.notes, ...daten.changed.notes].map((n) => (
                    <li key={`${n.id}-${n.at}`} className="text-[13px] flex items-baseline gap-2">
                      <Titel id={n.id} title={n.title} onOpen={onOpenMemory} />
                      <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>{n.by ? `by ${n.by} · ` : ''}{vor(n.at)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Abschnitt>

          {daten.todos.total > 0 && (
            <Abschnitt titel="Open to-dos" zahl={daten.todos.total}>
              <ul className="space-y-1.5">
                {daten.todos.items.map((t, i) => (
                  <li key={`${t.id}-${i}`} className="text-[13px] flex items-baseline gap-2" style={{ color: 'var(--text-1)' }}>
                    <span aria-hidden className="w-3 h-3 rounded-[3px] shrink-0 translate-y-0.5" style={{ border: '1.5px solid var(--text-3)' }} />
                    <span className="flex-1">{t.text}</span>
                    <button onClick={() => onOpenMemory(t.id)} className="text-[11px] hover:underline shrink-0" style={{ color: 'var(--text-3)' }}>{t.title}</button>
                  </li>
                ))}
              </ul>
              {daten.todos.total > daten.todos.items.length && (
                <p className="text-[11px] mt-2" style={{ color: 'var(--text-3)' }}>and {daten.todos.total - daten.todos.items.length} more in your notes</p>
              )}
            </Abschnitt>
          )}

          {(daten.expiring.length > 0 || daten.expired.length > 0) && (
            <Abschnitt titel="Due" zahl={daten.expiring.length + daten.expired.length}>
              <ul className="space-y-1.5">
                {daten.expiring.map((n) => (
                  <li key={n.id} className="text-[13px] flex items-baseline gap-2">
                    <Clock className="w-3.5 h-3.5 shrink-0 translate-y-0.5" style={{ color: 'var(--warn)' }} />
                    <Titel id={n.id} title={n.title} onOpen={onOpenMemory} />
                    <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>valid until {datum(n.validTo)}</span>
                  </li>
                ))}
                {daten.expired.map((n) => (
                  <li key={n.id} className="text-[13px] flex items-baseline gap-2">
                    <Clock className="w-3.5 h-3.5 shrink-0 translate-y-0.5" style={{ color: 'var(--text-3)' }} />
                    <Titel id={n.id} title={n.title} onOpen={onOpenMemory} />
                    <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>expired {datum(n.validTo)} — still true?</span>
                  </li>
                ))}
              </ul>
            </Abschnitt>
          )}

          <Abschnitt titel="Your AI apps">
            {daten.apps.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>
                No AI app has used KEPTA since then.{' '}
                <button onClick={() => onGo('activity')} className="underline underline-offset-2" style={{ color: 'var(--accent)' }}>Connect an app</button>
              </p>
            ) : (
              <ul className="space-y-1.5">
                {daten.apps.map((a) => (
                  <li key={a.who} className="text-[13px] flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
                    <Bot className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                    <strong>{a.who}</strong>
                    <span style={{ color: 'var(--text-2)' }}>
                      {a.calls} {a.calls === 1 ? 'call' : 'calls'} · {a.saves} saved · {a.searches} {a.searches === 1 ? 'search' : 'searches'}
                    </span>
                  </li>
                ))}
                <li>
                  <button onClick={() => onGo('activity')} className="text-[12px] hover:underline" style={{ color: 'var(--accent)' }}>See everything they did</button>
                </li>
              </ul>
            )}
          </Abschnitt>

          {daten.contradictions.length === 0 && daten.todos.total === 0 && daten.created.total === 0 && (
            <p className="text-sm flex items-center gap-2" style={{ color: 'var(--ok)' }}>
              <CheckCircle2 className="w-4 h-4" /> All quiet. Nothing needs you right now.
            </p>
          )}
        </>
      )}
    </div>
  );
}
