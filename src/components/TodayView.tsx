// Today: what happened since your last visit, what needs a look, what is due.
// Read straight from the local database — no AI involved, nothing leaves the
// computer, ready the moment the view opens.
import { absage } from '../lib/absage';
import { ApiFehler, tuerSatz } from '../lib/api';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, CheckCircle2, Bot, Clock, RefreshCw } from '../lib/icons';
import { inForm } from '../lib/antwort';

export interface Seite { id: string; title: string; sentence: string; value: string; updatedAt: number }
export interface Widerspruch { key: string; newer: Seite; older: Seite; about: string }
interface Kurz { id: string; title: string; type: string; at: number; by?: string }
export interface Briefing {
  since: number;
  created: { total: number; bySource: { who: string; count: number }[]; notes: Kurz[] };
  changed: { total: number; notes: Kurz[] };
  /** Ab Today 2.0 (Paket 3): die Wahrheitsbewegung im Fenster — optional, damit ältere Stubs nicht brechen. */
  superseded?: { total: number; notes: (Kurz & { supersededBy: string; replacedBy?: string })[] };
  deleted?: { total: number; notes: Kurz[] };
  expiring: (Kurz & { validTo: number })[];
  expired: (Kurz & { validTo: number })[];
  todos: { total: number; items: { id: string; title: string; text: string }[] };
  contradictions: Widerspruch[];
  apps: { who: string; calls: number; saves: number; searches: number }[];
}

// Die Form, die diese Fläche liest. Ein Muster-Element erklärt die Zeilenform
// (die Fläche liest `w.newer.title`); eine fehlende Liste bleibt leer.
const LEERES_BRIEFING: Briefing = {
  since: 0,
  created: { total: 0, bySource: [{ who: '', count: 0 }], notes: [{ id: '', title: '', type: '', at: 0 }] },
  changed: { total: 0, notes: [{ id: '', title: '', type: '', at: 0 }] },
  expiring: [{ id: '', title: '', type: '', at: 0, validTo: 0 }],
  expired: [{ id: '', title: '', type: '', at: 0, validTo: 0 }],
  todos: { total: 0, items: [{ id: '', title: '', text: '' }] },
  contradictions: [{ key: '', about: '', newer: { id: '', title: '', sentence: '', value: '', updatedAt: 0 }, older: { id: '', title: '', sentence: '', value: '', updatedAt: 0 } }],
  apps: [{ who: '', calls: 0, saves: 0, searches: 0 }],
};

export const LETZTER_BESUCH = 'kepta_last_today';
const TAG = 86_400_000;

/**
 * Zeitmaschine (Paket 3): die Fenster, die Today überblicken kann. „Last visit“
 * ist der gewohnte Blick (Gespeichertes von besuchSeit), danach die Stufen aus
 * dem Masterplan — „Everything“ läuft mit since=0 über die ganze Geschichte.
 */
export const FENSTER = [
  { label: 'Last visit', ms: -1, text: 'since your last visit' },
  { label: 'Today', ms: TAG, text: 'in the last 24 hours' },
  { label: '7 days', ms: 7 * TAG, text: 'in the last 7 days' },
  { label: '30 days', ms: 30 * TAG, text: 'in the last 30 days' },
  { label: 'Everything', ms: 0, text: 'in all the time K3PTA remembers' },
] as const;

/** Fensterstart als Zeitstempel: letzter Besuch (<0), fixe Spanne oder „alles“ (0). */
export function fensterSeit(index: number, besuch: number, jetzt: number): number {
  const f = FENSTER[Math.min(Math.max(index, 0), FENSTER.length - 1)]!;
  if (f.ms < 0) return besuch;
  if (f.ms === 0) return 0;
  return jetzt - f.ms;
}

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

/**
 * Die gemessene Spanne seit einem Zeitpunkt, als Wort, das hinter "in the last" einen Satz
 * ergibt: "in the last minute", "in the last hour", "in the last 3 days". Darum steht hier
 * kein Artikel - "in the last a day" ist derselbe Fehler, den der Fall unten verbietet. Absichtlich ohne date-fns: dessen Text traegt seine eigne
 * Richtungsangabe ("2 hours ago", "about 1 hour", "less than a minute"), und die Flaeche schrieb
 * sie hinter "since" — heraus kam "what happened since less than a minute ago", ein Satz, den
 * beide Erstleser dieses Haus-Tests (2.11.) als unlesbar zurueckgewiesen haben. Eine Zahl, die
 * man nur mit einem Fremdwort aussprechen kann, ist kein Text fuer Nutzer.
 */
export function spannenText(seit: number, jetzt = Date.now()): string {
  const s = Math.max(0, Math.floor((jetzt - seit) / 1000));
  const m = Math.floor(s / 60);
  if (m < 2) return "minute";
  if (m < 60) return `${m} minutes`;
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? "hour" : `${h} hours`;
  const t = Math.floor(h / 24);
  if (t < 31) return t === 1 ? "day" : `${t} days`;
  const mo = Math.floor(t / 30);
  if (mo < 12) return mo === 1 ? "month" : `${mo} months`;
  const j = Math.floor(t / 365);
  return j === 1 ? "year" : `${j} years`;
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
    <button onClick={() => onOpen(id)} className="text-left font-semibold hover:underline underline-offset-2" style={{ color: 'var(--text-1)' }}>
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
      <h3 className="fs-3 font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
        {titel}
        {typeof zahl === 'number' && <span className="fs-1 tnum px-2 rounded-md" style={{ background: 'var(--bg-inset-strong)', color: 'var(--text-3)' }}>{zahl}</span>}
      </h3>
      {children}
    </section>
  );
}

/** Die Kategorie einer Bewegung: neu, aktualisiert, abgelöst, gelöscht. */
function ArtTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="fs-1 px-2 py-1 rounded-md shrink-0 translate-y-[-1px]" style={{ background: 'var(--bg-inset-strong)', color: 'var(--text-3)' }}>
      {children}
    </span>
  );
}

interface Props {
  aktiv: boolean;
  onOpenMemory: (id: string) => void;
  onGo: (view: 'activity' | 'memories') => void;
}

export function TodayView({ aktiv, onOpenMemory, onGo }: Props) {
  const [besuch] = useState(() => besuchSeit());
  const [fenster, setFenster] = useState(0);
  const [daten, setDaten] = useState<Briefing | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erledigt, setErledigt] = useState<Record<string, string>>({});

  const seit = useMemo(() => fensterSeit(fenster, besuch, Date.now()), [fenster, besuch]);

  const laden = useCallback(async () => {
    setFehler(null);
    try {
      const r = await fetch(`/api/briefing?since=${seit}`);
      // Punkt 4, 2.11.: der Koerper wurde VOR dem Status gelesen. Ein HTML-Fehlerblatt (Proxy,
      // 502) warf beim Parsen, und ihr Satz war der Nutzertext: "Unexpected token '<', ...".
      // Der Grund der Tuer bleibt bevorzugt — EnterpriseViews.test.tsx haelt "DB locked", und
      // eine Zahl statt eines Grunds waere ein Rueckschritt (gezogen 15:04, 3333/3335).
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        const grund = typeof d?.error === 'string' && d.error.trim() !== ''
          ? d.error.trim()
          : `the store answered ${r.status}`;
        throw new ApiFehler(grund, r.status);
      }
      if (!d) throw new ApiFehler("Today's briefing came back empty.", r.status);
      setDaten(inForm(d, LEERES_BRIEFING));
    } catch (e) {
      setFehler(absage("Today's briefing did not arrive.", e));
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
      if (!r.ok) throw new ApiFehler(tuerSatz((d as { error?: string }).error, `HTTP ${r.status}`), r.status);
      setErledigt((p) => ({ ...p, [w.key]: wahl === 'both' ? 'Noted — K3PTA will not ask about these two again.' : `Done — “${drop.title}” is marked as replaced by “${keep.title}”.` }));
    } catch (e) {
      setErledigt((p) => ({ ...p, [w.key]: absage("That decision was not recorded. The pair is still here.", e) }));
    }
  };

  const jetzt = new Date();
  const fensterInfo = FENSTER[fenster]!;
  // Untertitel: beim gewohnten Blick die gemessene Spanne, sonst der Fenstertext.
  const untertitel = fenster === 0 ? `what happened in the last ${spannenText(seit)}` : `what happened ${fensterInfo.text}`;
  const abgeloest = daten?.superseded ?? { total: 0, notes: [] };
  const geloescht = daten?.deleted ?? { total: 0, notes: [] };
  return (
    <div className="max-w-3xl mx-auto py-6" data-testid="today-view">
      <header className="mb-6">
        <h1 className="display">{gruss(jetzt.getHours())}</h1>
        <p className="fs-4 lh-lesbar mt-1" style={{ color: 'var(--text-2)' }}>
          {jetzt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · {untertitel}
        </p>
        {daten && (
          <div className="flex flex-wrap gap-2 mt-4">
            {[
              [daten.created.total, daten.created.total === 1 ? 'new note' : 'new notes'],
              [daten.changed.total, 'changed'],
              ...(abgeloest.total > 0 ? [[abgeloest.total, 'replaced'] as const] : []),
              ...(geloescht.total > 0 ? [[geloescht.total, 'deleted'] as const] : []),
              [daten.todos.total, daten.todos.total === 1 ? 'open to-do' : 'open to-dos'],
              [daten.contradictions.length, 'to check'],
            ].map(([n, text]) => (
              <span key={String(text)} className="px-3 py-1 rounded-full fs-2 tnum" style={{ background: 'var(--bg-inset-strong)', color: 'var(--text-2)' }}>
                <strong style={{ color: 'var(--text-1)' }}>{n}</strong> {text}
              </span>
            ))}
          </div>
        )}
        {/* Zeitmaschine: das Fenster, in das Today hineinsieht. */}
        <div className="mt-4" data-testid="today-zeitfenster">
          {/* h-7 statt h-1.5: gemessen war die Trefferfläche des Reglers 6 px
              hoch. Z-08 verlangt mindestens 20, für Wiederholtes 28. Die Spur
              malt die Lage darunter, der Knauf sitzt zentriert. */}
          <input
            type="range"
            min={0}
            max={FENSTER.length - 1}
            step={1}
            value={fenster}
            onChange={(e) => setFenster(parseInt(e.target.value, 10))}
            className="w-full h-7 appearance-none bg-transparent accent-[var(--accent)] cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-knopf [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[var(--accent)] [&::-webkit-slider-thumb]:shadow-sm
              [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-knopf [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[var(--accent)]"
            aria-label="Time window"
          />
          <div className="flex justify-between mt-1">
            {FENSTER.map((f, i) => (
              <span key={f.label} className="fs-1" style={i === fenster ? { color: 'var(--text-1)', fontWeight: 600 } : { color: 'var(--text-3)' }}>{f.label}</span>
            ))}
          </div>
        </div>
      </header>

      {fehler && (
        <div className="hud-inset rounded-xl p-4 fs-4 lh-lesbar flex items-center gap-3" style={{ color: 'var(--warn)' }}>
          {fehler}
          <button onClick={() => void laden()} className="btn-ghost px-3 py-1 rounded-lg fs-2 lh-dicht flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> Try again</button>
        </div>
      )}
      {!daten && !fehler && <p className="fs-4 lh-lesbar" style={{ color: 'var(--text-2)' }}>Getting your day ready…</p>}

      {daten && (
        <>
          {daten.contradictions.length > 0 && (
            <Abschnitt titel="Needs a look" zahl={daten.contradictions.length}>
              <div className="space-y-3">
                {daten.contradictions.map((w) => (
                  <div key={w.key} className="hud-inset rounded-xl p-4" data-testid="contradiction">
                    <div className="fs-3 mb-3 flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
                      <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: 'var(--warn)' }} />
                      Two notes disagree{w.about ? ` about “${w.about}”` : ''}.
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3 fs-3" style={{ color: 'var(--text-2)' }}>
                      {([['Newer', w.newer], ['Older', w.older]] as const).map(([label, s]) => (
                        <div key={s.id}>
                          <div className="fs-1 mb-1" style={{ color: 'var(--text-3)' }}>{label} · {vor(s.updatedAt)}</div>
                          <Titel id={s.id} title={s.title} onOpen={onOpenMemory} />
                          <p className="mt-1"><Satz satz={s.sentence} wert={s.value} /></p>
                        </div>
                      ))}
                    </div>
                    {erledigt[w.key] ? (
                      <p role="status" className="fs-3 mt-3" style={{ color: 'var(--ok)' }}>{erledigt[w.key]}</p>
                    ) : (
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button onClick={() => void loese(w, 'newer')} className="btn-primary px-3 py-2 rounded-lg fs-3 font-semibold">Keep the newer</button>
                        <button onClick={() => void loese(w, 'older')} className="btn-ghost px-3 py-2 rounded-lg fs-3" style={{ border: '1px solid var(--border-subtle)' }}>Keep the older</button>
                        <button onClick={() => void loese(w, 'both')} className="btn-ghost px-3 py-2 rounded-lg fs-3">Both are right</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Abschnitt>
          )}

          <Abschnitt titel="What changed" zahl={daten.created.total + daten.changed.total + abgeloest.total + geloescht.total}>
            {daten.created.total === 0 && daten.changed.total === 0 && abgeloest.total === 0 && geloescht.total === 0 ? (
              <p className="fs-4 lh-lesbar" style={{ color: 'var(--text-3)' }}>Nothing new {fensterInfo.text}.</p>
            ) : (
              <>
                {daten.created.bySource.length > 0 && (
                  <p className="fs-3 mb-2" style={{ color: 'var(--text-2)' }}>
                    {daten.created.bySource.map((q) => `${q.who}: ${q.count} new`).join(' · ')}
                    {daten.changed.total > 0 ? ` · ${daten.changed.total} changed` : ''}
                  </p>
                )}
                {/* Konsolidiert (Paket 3): jede Bewegung der Wahrheit in ihrer Kategorie —
                    neu, aktualisiert, abgelöst (mit Nachfolger als Klickziel), gelöscht. */}
                <ul className="space-y-2">
                  {daten.created.notes.map((n) => (
                    <li key={`new-${n.id}-${n.at}`} className="fs-3 flex items-baseline gap-2">
                      <ArtTag>new</ArtTag>
                      <Titel id={n.id} title={n.title} onOpen={onOpenMemory} />
                      <span className="fs-1" style={{ color: 'var(--text-3)' }}>{n.by ? `by ${n.by} · ` : ''}{vor(n.at)}</span>
                    </li>
                  ))}
                  {daten.changed.notes.map((n) => (
                    <li key={`upd-${n.id}-${n.at}`} className="fs-3 flex items-baseline gap-2">
                      <ArtTag>updated</ArtTag>
                      <Titel id={n.id} title={n.title} onOpen={onOpenMemory} />
                      <span className="fs-1" style={{ color: 'var(--text-3)' }}>{vor(n.at)}</span>
                    </li>
                  ))}
                  {abgeloest.notes.map((n) => (
                    <li key={`sup-${n.id}-${n.at}`} className="fs-3 flex items-baseline gap-2">
                      <ArtTag>replaced</ArtTag>
                      <span style={{ color: 'var(--text-3)' }}>{n.title}</span>
                      <span className="fs-1" style={{ color: 'var(--text-3)' }}>
                        → replaced by{' '}
                        <button onClick={() => onOpenMemory(n.supersededBy)} className="hover:underline underline-offset-2" style={{ color: 'var(--accent)' }}>
                          {n.replacedBy || n.supersededBy.slice(0, 8)}
                        </button>
                      </span>
                    </li>
                  ))}
                  {geloescht.notes.map((n) => (
                    <li key={`del-${n.id}-${n.at}`} className="fs-3 flex items-baseline gap-2">
                      <ArtTag>deleted</ArtTag>
                      <span style={{ color: 'var(--text-3)' }}>{n.title}</span>
                      <span className="fs-1" style={{ color: 'var(--text-3)' }}>in the trash — restore it there</span>
                    </li>
                  ))}
                </ul>
                {(() => {
                  const gezeigt = daten.created.notes.length + daten.changed.notes.length + abgeloest.notes.length + geloescht.notes.length;
                  const alles = daten.created.total + daten.changed.total + abgeloest.total + geloescht.total;
                  return alles > gezeigt ? (
                    <p className="fs-1 mt-2" style={{ color: 'var(--text-3)' }}>and {alles - gezeigt} more</p>
                  ) : null;
                })()}
              </>
            )}
          </Abschnitt>

          {daten.todos.total > 0 && (
            <Abschnitt titel="Open to-dos" zahl={daten.todos.total}>
              <ul className="space-y-2">
                {daten.todos.items.map((t, i) => (
                  <li key={`${t.id}-${i}`} className="fs-3 flex items-baseline gap-2" style={{ color: 'var(--text-1)' }}>
                    <span aria-hidden className="w-3 h-3 rounded-[3px] shrink-0 translate-y-0.5" style={{ border: '1.5px solid var(--text-3)' }} />
                    <span className="flex-1">{t.text}</span>
                    <button onClick={() => onOpenMemory(t.id)} className="fs-1 hover:underline shrink-0" style={{ color: 'var(--text-3)' }}>{t.title}</button>
                  </li>
                ))}
              </ul>
              {daten.todos.total > daten.todos.items.length && (
                <p className="fs-1 mt-2" style={{ color: 'var(--text-3)' }}>and {daten.todos.total - daten.todos.items.length} more in your notes</p>
              )}
            </Abschnitt>
          )}

          {(daten.expiring.length > 0 || daten.expired.length > 0) && (
            <Abschnitt titel="Due" zahl={daten.expiring.length + daten.expired.length}>
              <ul className="space-y-2">
                {daten.expiring.map((n) => (
                  <li key={n.id} className="fs-3 flex items-baseline gap-2">
                    <Clock className="w-3.5 h-3.5 shrink-0 translate-y-0.5" style={{ color: 'var(--warn)' }} />
                    <Titel id={n.id} title={n.title} onOpen={onOpenMemory} />
                    <span className="fs-1" style={{ color: 'var(--text-3)' }}>valid until {datum(n.validTo)}</span>
                  </li>
                ))}
                {daten.expired.map((n) => (
                  <li key={n.id} className="fs-3 flex items-baseline gap-2">
                    <Clock className="w-3.5 h-3.5 shrink-0 translate-y-0.5" style={{ color: 'var(--text-3)' }} />
                    <Titel id={n.id} title={n.title} onOpen={onOpenMemory} />
                    <span className="fs-1" style={{ color: 'var(--text-2)' }}>expired {datum(n.validTo)} — still true?</span>
                  </li>
                ))}
              </ul>
            </Abschnitt>
          )}

          <Abschnitt titel="Your AI apps">
            {daten.apps.length === 0 ? (
              <p className="fs-4 lh-lesbar" style={{ color: 'var(--text-2)' }}>
                No AI app has used K3PTA since then.{' '}
                {/* min-h-6: gemessen 20 px hohe Textstelle ohne Polster — die
                    Untergrenze, nicht mehr. */}
                <button onClick={() => onGo('activity')} className="min-h-6 px-1 inline-flex items-center underline underline-offset-2" style={{ color: 'var(--accent)' }}>Connect an app</button>
              </p>
            ) : (
              <ul className="space-y-2">
                {daten.apps.map((a) => (
                  <li key={a.who} className="fs-3 flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
                    <Bot className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                    <strong>{a.who}</strong>
                    <span style={{ color: 'var(--text-2)' }}>
                      {a.calls} {a.calls === 1 ? 'call' : 'calls'} · {a.saves} saved · {a.searches} {a.searches === 1 ? 'search' : 'searches'}
                    </span>
                  </li>
                ))}
                <li>
                  <button onClick={() => onGo('activity')} className="fs-2 hover:underline" style={{ color: 'var(--accent)' }}>See everything they did</button>
                </li>
              </ul>
            )}
          </Abschnitt>

          {daten.contradictions.length === 0 && daten.todos.total === 0 && daten.created.total === 0 && daten.changed.total === 0 && abgeloest.total === 0 && geloescht.total === 0 && (
            <p className="fs-4 lh-lesbar flex items-center gap-2" style={{ color: 'var(--ok)' }}>
              <CheckCircle2 className="w-4 h-4" /> All quiet. Nothing needs you right now.
            </p>
          )}
        </>
      )}
    </div>
  );
}
