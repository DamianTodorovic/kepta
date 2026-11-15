// A dossier: everything K3PTA knows about one person, project or topic — on
// one page, ready to copy into a document or keep as a note.
import { absage } from '../lib/absage';
import { ApiFehler, tuerSatz } from '../lib/api';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Check, Save, Loader2, AlertTriangle, Plus } from '../lib/icons';
import { useToast } from './ui/Toast';
import { inForm } from '../lib/antwort';
import { DOSSIER_TITEL } from '../lib/dossierTitel';
import { QUITTUNG_MS } from '../lib/quittung';
import { kurzeZeit } from '../lib/zeit';
import { benutzeFensterStatus } from './ui/FensterStatus';

interface Eintrag { id: string; title: string; sentence: string; at: number }
/** Ein Widerspruch im Dossier — mit ids, wenn der Server sie liefert (tut er). */
interface WiderspruchKarte {
  key: string;
  about: string;
  newer: { id?: string; title: string; value: string };
  older: { id?: string; title: string; value: string };
}
interface Dossier {
  topic: string;
  total: number;
  kinds: Record<string, number>;
  facts: Eintrag[];
  timeline: Eintrag[];
  howtos: Eintrag[];
  documents: Eintrag[];
  todos: { id: string; title: string; text: string }[];
  contradictions: WiderspruchKarte[];
  related: { tag: string; count: number }[];
  first: number | null;
  last: number | null;
  markdown: string;
}
interface Vorschlaege { tags: { name: string; count: number }[]; topics: { name: string; count: number }[] }

// Die Form, die die Fläche liest — ein Muster-Element erklärt die Zeilenform,
// es ist nicht der Inhalt einer leeren Antwort.
const LEERES_DOSSIER: Dossier = {
  topic: '', total: 0, kinds: {}, facts: [{ id: '', title: '', sentence: '', at: 0 }],
  timeline: [{ id: '', title: '', sentence: '', at: 0 }],
  howtos: [{ id: '', title: '', sentence: '', at: 0 }],
  documents: [{ id: '', title: '', sentence: '', at: 0 }],
  todos: [{ id: '', title: '', text: '' }],
  contradictions: [{ key: '', about: '', newer: { title: '', value: '' }, older: { title: '', value: '' } }],
  related: [{ tag: '', count: 0 }],
  first: 0, last: 0, markdown: '',
};

const tag = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/* P202, Mockup-Grammatik (detail-gruppe + zustandszeile): die Abschnitte des
   Dossiers stehen als Gruppen mit Name und Tabelle — jede Zeile trägt links
   ihr Wort (Art, oder das Datum in der Zeitlinie) und rechts den Satz mit
   dem Titel fett. */
function Liste({ titel, eintraege, onOpen }: { titel: string; eintraege: Eintrag[]; mitDatum?: boolean; onOpen: (id: string) => void }) {
  if (!eintraege.length) return null;
  return (
    <section className="detail-gruppe">
      <div className="detail-gruppe-name">{titel}</div>
      <div className="gruppen-tisch">
        {eintraege.map((e, i) => (
          <div key={e.id} className="zustandszeile" style={i === eintraege.length - 1 ? { borderBottom: 'none' } : undefined}>
            <span className="art tnum">{kurzeZeit(e.at)}</span>
            <div className="inhalt">
              <b style={{ color: 'var(--text-1)', fontWeight: 650 }}>
                <button onClick={() => onOpen(e.id)} className="hover:underline underline-offset-2 text-left" style={{ color: 'var(--text-1)' }}>{e.title}</button>
              </b>
              {e.sentence && e.sentence !== e.title && <> — {e.sentence}</>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

interface DossierThema { text: string; nr: number }

const SCANNER_TAGS = new Set([
  'machine-scan', 'json', 'md', 'txt', 'csv', 'pdf', 'html', 'log', 'xml', 'yml', 'yaml', 'ts', 'tsx', 'js', 'jsx',
]);

export function DossierView({ aktiv = true, onOpenMemory, onEditMemory, dossierThema }: { aktiv?: boolean; onOpenMemory: (id: string) => void; onEditMemory?: (id: string) => void; /** von außen gesetzt: das Dossier, das offen sein soll (Klick auf ein Konzept im Graphen). `nr` unterscheidet zwei Klicks auf denselben Begriff. */ dossierThema?: DossierThema }) {
  const toast = useToast();
  const [eingabe, setEingabe] = useState('');
  const [daten, setDaten] = useState<Dossier | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [vorschlaege, setVorschlaege] = useState<Vorschlaege | null>(null);
  const [vorschlagGrund, setVorschlagGrund] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);
  const kopierTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [gespeichert, setGespeichert] = useState(false);
  /** Was mit einem Widerspruch geschehen ist — ehrlich auch im Fehlerfall. */
  const [entschieden, setEntschieden] = useState<Record<string, string>>({});

  /** Paket 3: die Auflösung passiert direkt an der Karte — über die bestehende Resolve-Route. */
  const loese = async (w: WiderspruchKarte, aktion: 'newer' | 'window') => {
    if (!w.newer.id || !w.older.id) return;
    const body = aktion === 'newer' ? { keep: w.newer.id, drop: w.older.id } : { keep: w.newer.id, drop: w.older.id, window: true };
    try {
      const r = await fetch('/api/contradictions/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new ApiFehler(tuerSatz((d as { error?: string }).error, `HTTP ${r.status}`), r.status);
      setEntschieden((p) => ({
        ...p,
        [w.key]: aktion === 'newer'
          ? `Done — “${w.older.title}” is marked as replaced by “${w.newer.title}”.`
          : `Both hold — “${w.older.title}” now ends where “${w.newer.title}” begins.`,
      }));
    } catch (e) {
      setEntschieden((p) => ({ ...p, [w.key]: absage("That decision was not recorded. The pair is still here.", e) }));
    }
  };

  useEffect(() => {
    if (!aktiv || vorschlaege) return;
    let vorbei = false;
    fetch('/api/dossier/suggestions')
      .then((r) => {
        // Punkt 4, 2.11.: vorher `.catch(() => undefined)` und ein `r.ok`, das nur durchgelassen
        // wurde — die Flaeche blieb ohne Vorschlag und ohne Grund stehen.
        if (!r.ok) { if (!vorbei) setVorschlagGrund(`Suggestions did not arrive — the store answered ${r.status}.`); return null; }
        return r.json().catch(() => null);
      })
      .then((d) => { if (!vorbei && d) { setVorschlaege(d as Vorschlaege); setVorschlagGrund(null); } })
      .catch(() => { if (!vorbei) setVorschlagGrund('Suggestions did not arrive — the store did not answer.'); });
    return () => { vorbei = true; };
  }, [aktiv, vorschlaege]);

  const erstelle = async (thema: string) => {
    const t = thema.trim();
    if (!t) return;
    setEingabe(t);
    setLaedt(true);
    setFehler(null);
    setGespeichert(false);
    try {
      const r = await fetch(`/api/dossier?topic=${encodeURIComponent(t)}`);
      // P63: Status zuerst, Koerper verzeihend -- eine geantwortete, aber unlesbare Antwort
      // nennt ihre Zahl, statt im Fang grundlos zu enden.
      const d = (await r.json().catch(() => null)) as Record<string, unknown> | null;
      if (!r.ok) throw new ApiFehler(tuerSatz(d?.error, `HTTP ${r.status}`), r.status);
      if (!d) throw new ApiFehler("The dossier arrived without readable text.", r.status);
      setDaten(inForm(d, LEERES_DOSSIER));
    } catch (e) {
      setFehler(absage("The dossier did not arrive.", e));
    } finally {
      setLaedt(false);
    }
  };

  const absenden = (e: FormEvent) => { e.preventDefault(); void erstelle(eingabe); };

  // Von außen gesetzt (Klick auf ein Konzept im Graphen): dieses Dossier soll
  // offen sein. Die Objekt-Identität ist das Signal — wer zweimal auf denselben
  // Begriff klickt, nachdem er von Hand etwas anderes tippte, sieht wieder den
  // Begriff und nicht die letzte Eingabe.
  useEffect(() => {
    if (dossierThema) void erstelle(dossierThema.text);
  }, [dossierThema]);

  const kopieren = async () => {
    if (!daten) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
      await navigator.clipboard.writeText(daten.markdown);
      if (kopierTimer.current) clearTimeout(kopierTimer.current);
      setKopiert(true);
      kopierTimer.current = setTimeout(() => { setKopiert(false); kopierTimer.current = null; }, QUITTUNG_MS);
    } catch {
      toast.push({ message: 'Copying failed — your system did not allow access to the clipboard.', kind: 'warn' });
    }
  };

  const speichern = async () => {
    if (!daten) return;
    try {
      const r = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `Dossier: ${daten.topic}`, content: daten.markdown, type: 'reference', tags: ['dossier'] }),
      });
      if (!r.ok) throw new ApiFehler(`HTTP ${r.status}`, r.status);
      setGespeichert(true);
      toast.push({ message: `Saved as the note “Dossier: ${daten.topic}”.`, kind: 'info' });
    } catch {
      toast.push({ message: 'The dossier could not be saved as a note.', kind: 'warn' });
    }
  };

  const chips = useMemo(() => {
    const seen = new Set<string>();
    const liste: { name: string; count: number; kind: 'topic' | 'tag'; rang: number }[] = [];
    const hinzufuegen = (name: string, count: number, kind: 'topic' | 'tag') => {
      const norm = name.trim().toLowerCase();
      if (!norm || seen.has(norm)) return;
      seen.add(norm);
      const rang = kind === 'topic' ? 0 : SCANNER_TAGS.has(norm) ? 2 : 1;
      liste.push({ name: name.trim(), count, kind, rang });
    };
    for (const t of vorschlaege?.topics ?? []) hinzufuegen(t.name, t.count, 'topic');
    for (const t of vorschlaege?.tags ?? []) hinzufuegen(t.name, t.count, 'tag');
    liste.sort((a, b) => a.rang - b.rang || b.count - a.count || a.name.localeCompare(b.name));
    return liste.slice(0, 18);
  }, [vorschlaege]);

  // Die Statuszeile wohnt am Fenster-Slot (volle Breite, Mockup .statuszeile):
  // „6 dossiers · 40 notes covered“ — hier ehrlich: das gebaute Dossier und
  // sein Bestand, sonst das Wort des leeren Tisches.
  const melde = benutzeFensterStatus();
  const gebaut = !!daten && daten.total > 0;
  useEffect(() => {
    if (!aktiv) return;
    melde({
      links: gebaut ? (
        <>
          <span className="gruen tnum">1 dossier</span>
          <span className="strich">·</span>
          <span className="tnum">{daten!.total} {daten!.total === 1 ? 'note' : 'notes'} covered</span>
        </>
      ) : (
        <span className="tnum">No dossier built</span>
      ),
      rechts: 'local · private',
    });
  }, [aktiv, gebaut, daten, melde]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 flex min-h-0" data-testid="dossier-view">
        {/* P202, Mockup-Grammatik: das Werkzeug (Eingabe + Vorschläge) steht in der
            Listen-Spalte, das gebaute Dossier füllt die Detail-Spalte — der Hero
            und die zentrierte Form waren die Website-Signatur und flogen. */}
        <aside className="listen-spalte">
          <div className="listen-kopf">
            <h2 className="listen-titel fs-2 font-semibold" style={{ margin: 0 }}>Dossiers</h2>
            {chips.length > 0 && <span className="listen-zahl fs-1 tnum">{chips.length}</span>}
          </div>
          {/* Das Werkzeug als eine Zeile (das Mockup-Bild zeigt die Liste ohne
              Tisch — das Schreiben bleibt, ohne die Spalte zu füllen). */}
          <div className="listen-steuer">
            <form onSubmit={absenden} className="flex flex-1 min-w-0 items-center gap-1">
              <input
                value={eingabe}
                onChange={(e) => setEingabe(e.target.value)}
                placeholder="A person, a client, a project, a topic…"
                aria-label="Who or what is the dossier about?"
                className="hud-input flex-1 min-w-0 rounded-lg px-2 py-1.5 fs-2 lh-dicht"
              />
              <button type="submit" disabled={laedt || !eingabe.trim()} className="btn-primary shrink-0 px-2.5 py-1.5 rounded-lg fs-2 font-semibold flex items-center gap-1 disabled:opacity-50">
                {laedt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Create
              </button>
            </form>
          </div>
          <div className="listen-zeilen">
            {fehler && <p className="fs-3 px-3 py-2" style={{ color: 'var(--warn)', margin: 0 }}>{fehler}</p>}
            {chips.length > 0 && (
              <div>
                <div className="fs-1 font-semibold px-3 pt-2.5 pb-1" style={{ color: 'var(--text-3)' }}>
                  Suggested topics
                </div>
                <ul>
                  {chips.map((c) => {
                    const istAktiv = Boolean(daten && daten.topic.toLowerCase() === c.name.toLowerCase());
                    return (
                      <li key={c.name}>
                        <button
                          type="button"
                          aria-label={c.name}
                          aria-current={istAktiv ? 'true' : undefined}
                          onClick={() => void erstelle(c.name)}
                          className="zeile-item fs-3 w-full text-left"
                          style={istAktiv ? { background: 'var(--accent-soft)' } : undefined}
                        >
                          <span
                            aria-hidden
                            className="row-punkt"
                            style={{
                              background: istAktiv || c.kind === 'topic' ? 'var(--accent)' : 'var(--text-3)',
                              opacity: istAktiv ? 1 : c.kind === 'topic' ? 0.8 : 0.45,
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="row-titel-zeile truncate" style={{ fontWeight: istAktiv ? 650 : 500, color: 'var(--text-1)' }}>
                              {c.name}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <span className="row-zeit tnum">{c.count}</span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {vorschlagGrund && chips.length === 0 && !daten && (
              <p role="status" className="fs-3 px-3 py-2" style={{ color: 'var(--text-3)' }}>{vorschlagGrund}</p>
            )}
            {chips.length === 0 && !vorschlagGrund && !fehler && (
              <p className="fs-2 px-3 py-3" style={{ color: 'var(--text-3)', margin: 0 }}>
                Enter a person, project or topic above.
              </p>
            )}
          </div>
          <div className="listen-fuss">
            <span className="tnum">Builds a brief from your notes</span>
          </div>
        </aside>
        <section className="detail-spalte">
          {daten && daten.total > 0 ? (
            <>
              <div className="detail-kopf">
                <span className="wo">{daten.topic}</span>
                <div className="kopf-handlungen">
                  <button onClick={() => void kopieren()} className="btn-ghost btn-text rounded-lg fs-2 flex items-center gap-1.5">
                    {kopiert ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {kopiert ? 'Copied' : 'Copy as Markdown'}
                  </button>
                  <button onClick={() => void speichern()} disabled={gespeichert} className="btn-ghost btn-text rounded-lg fs-2 flex items-center gap-1.5 disabled:opacity-50">
                    <Save className="w-3.5 h-3.5" /> {gespeichert ? 'Saved' : 'Save as note'}
                  </button>
                </div>
              </div>
              <div className="detail-korper">
                <div className="max-w-[680px]">
                  <h2 className="fs-6 lh-dicht font-semibold" style={{ color: 'var(--text-1)' }}>{daten.topic}</h2>
                  <p className="fs-2 mt-1 tnum" style={{ color: 'var(--text-3)' }}>
                    {daten.total} {daten.total === 1 ? 'note' : 'notes'}
                    {daten.first !== null && daten.last !== null ? ` · ${tag(daten.first)} – ${tag(daten.last)}` : ''}
                  </p>
                  {(() => {
                    const bereiche = [
                      { label: 'Statements', zahl: daten.facts.length },
                      { label: 'Chronology', zahl: daten.timeline.length },
                      { label: 'Instructions', zahl: daten.howtos.length },
                      { label: 'Attachments', zahl: daten.documents.length },
                      { label: 'To-dos', zahl: daten.todos.length },
                    ].filter((b) => b.zahl > 0);
                    if (bereiche.length === 0) return null;
                    return (
                      <div className="gruppen-tisch mt-4 grid grid-cols-2 sm:flex sm:divide-x overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
                        {bereiche.map((b) => (
                          <div key={b.label} className="flex-1 px-3 py-2.5 min-w-0" style={{ borderColor: 'var(--border-subtle)' }}>
                            <div className="fs-1" style={{ color: 'var(--text-3)' }}>{b.label}</div>
                            <div className="fs-4 font-semibold tnum mt-0.5" style={{ color: 'var(--text-1)' }}>{b.zahl}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  <Liste titel={DOSSIER_TITEL.punkte} eintraege={daten.facts} onOpen={onOpenMemory} />
                  <Liste titel={DOSSIER_TITEL.zeit} eintraege={daten.timeline} onOpen={onOpenMemory} />
                  <Liste titel={DOSSIER_TITEL.anleitungen} eintraege={daten.howtos} onOpen={onOpenMemory} />
                  <Liste titel={DOSSIER_TITEL.papiere} eintraege={daten.documents} onOpen={onOpenMemory} />
                  {daten.todos.length > 0 && (
                    <section className="detail-gruppe">
                      <div className="detail-gruppe-name">Open to-dos</div>
                      <div className="gruppen-tisch">
                        {daten.todos.map((t, i) => (
                          <div key={`${t.id}-${i}`} className="app-zeile" style={i === daten.todos.length - 1 ? { borderBottom: 'none' } : undefined}>
                            <span aria-hidden className="app-icon" style={{ background: 'transparent' }}>
                              <span className="block w-3.5 h-3.5 rounded-[4px]" style={{ border: '1.5px solid var(--text-3)' }} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="app-name">{t.text}</div>
                              {t.id ? (
                                <button onClick={() => onOpenMemory(t.id)} className="app-zustand hover:underline underline-offset-2 text-left" style={{ color: 'var(--text-3)' }}>
                                  {t.title}
                                </button>
                              ) : (
                                <div className="app-zustand">{t.title}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                  {daten.contradictions.length > 0 && (
                    <section className="detail-gruppe">
                      <div className="detail-gruppe-name flex items-center gap-1.5" style={{ color: 'var(--text-1)' }}>
                        <AlertTriangle className="w-3.5 h-3.5" style={{ color: 'var(--warn)' }} /> To check
                      </div>
                      {/* Paket 3: die Auflösung passiert im Fluss — je Karte drei Entscheidungen.
                          Ohne ids (alter Server-Stand) bleibt es bei der ehrlichen Textzeile. */}
                      <div className="space-y-3">
                        {daten.contradictions.map((w) => (
                          <div key={w.key} className="gruppen-tisch p-4" data-testid="dossier-contradiction">
                            <div className="fs-3 mb-2 flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
                              Two notes disagree{w.about ? ` about “${w.about}”` : ''}.
                            </div>
                            <div className="grid sm:grid-cols-2 gap-2 fs-3" style={{ color: 'var(--text-2)' }}>
                              {([['Newer', w.newer], ['Older', w.older]] as const).map(([label, s]) => (
                                <div key={label}>
                                  <span className="fs-1 mr-1" style={{ color: 'var(--text-3)' }}>{label}</span>
                                  <strong style={{ color: 'var(--text-1)' }}>{s.value}</strong> in{' '}
                                  {s.id ? (
                                    <button onClick={() => onOpenMemory(s.id!)} className="hover:underline underline-offset-2" style={{ color: 'var(--text-1)' }}>{s.title}</button>
                                  ) : s.title}
                                </div>
                              ))}
                            </div>
                            {entschieden[w.key] ? (
                              <p role="status" className="fs-3 mt-3" style={{ color: 'var(--ok)' }}>{entschieden[w.key]}</p>
                            ) : w.newer.id && w.older.id ? (
                              <div className="flex flex-wrap gap-2 mt-3">
                                <button onClick={() => void loese(w, 'newer')} className="btn-primary px-3 py-2 rounded-lg fs-3 font-semibold">Newer wins</button>
                                <button onClick={() => void loese(w, 'window')} className="btn-ghost px-3 py-2 rounded-lg fs-3" title="Both stay valid — the older note ends where the newer one began.">Both hold — cap the older</button>
                                {onEditMemory && (
                                  <button onClick={() => onEditMemory(w.newer.id!)} className="btn-ghost px-3 py-2 rounded-lg fs-3">Edit</button>
                                )}
                              </div>
                            ) : (
                              <p className="fs-3 mt-2" style={{ color: 'var(--text-2)' }}>
                                <strong style={{ color: 'var(--text-1)' }}>{w.newer.value}</strong> in {w.newer.title}, but <strong style={{ color: 'var(--text-1)' }}>{w.older.value}</strong> in {w.older.title}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                  {daten.related.length > 0 && (
                    <div className="flex flex-wrap gap-2 items-center pt-5 mt-5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <span className="fs-1 mr-1" style={{ color: 'var(--text-3)' }}>Related:</span>
                      {daten.related.map((r) => (
                        <button key={r.tag} onClick={() => void erstelle(r.tag)} className="min-h-7 inline-flex items-center px-2.5 py-0.5 rounded-full fs-2 hover:opacity-80" style={{ background: 'var(--bg-inset-strong)', color: 'var(--text-2)' }}>
                          #{r.tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : daten && daten.total === 0 ? (
            <>
              <div className="detail-kopf"><span className="wo">{daten.topic}</span></div>
              <div className="detail-korper">
                <div className="gruppen-tisch p-5 max-w-xl">
                  <p className="fs-3" style={{ color: 'var(--text-2)', margin: 0 }}>
                    K3PTA knows nothing about “{daten.topic}” yet. Try another name — or save a first note about it.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="detail-kopf"><span className="wo">Overview</span></div>
              <div className="detail-korper">
                <div className="max-w-[680px]">
                  {laedt ? (
                    <p className="fs-3" style={{ color: 'var(--text-2)' }}>Building your dossier…</p>
                  ) : (
                    <>
                      <h2 className="fs-6 lh-dicht font-semibold" style={{ color: 'var(--text-1)' }}>Select or build a dossier</h2>
                      <p className="fs-3 mt-1.5 lh-lesbar" style={{ color: 'var(--text-3)' }}>
                        One page gathers what K3PTA knows about a person, project or topic.
                      </p>
                      <div className="detail-gruppe">
                        <div className="detail-gruppe-name">What it puts together</div>
                        <div className="gruppen-tisch">
                          {[
                            ['Key points', 'Statements and decisions pulled together from your notes.'],
                            ['Timeline', 'What happened first and what changed most recently.'],
                            [`${DOSSIER_TITEL.anleitungen} & ${DOSSIER_TITEL.papiere}`, 'Saved instructions, references and source notes.'],
                            ['Open to-dos & checks', 'Unfinished tasks and notes that disagree with each other.'],
                          ].map(([titel, text], i, arr) => (
                            <div key={titel} className="zustandszeile" style={i === arr.length - 1 ? { borderBottom: 'none' } : undefined}>
                              <span className="shrink-0 font-semibold fs-2" style={{ width: 164, color: 'var(--text-1)' }}>{titel}</span>
                              <div className="inhalt" style={{ color: 'var(--text-2)' }}>{text}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
