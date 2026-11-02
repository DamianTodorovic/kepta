// A dossier: everything K3PTA knows about one person, project or topic — on
// one page, ready to copy into a document or keep as a note.
import { FormEvent, useEffect, useRef, useState } from 'react';
import { FileText, Copy, Check, Save, Loader2, AlertTriangle } from '../lib/icons';
import { useToast } from './ui/Toast';
import { inForm } from '../lib/antwort';
import { DOSSIER_TITEL } from '../lib/dossierTitel';
import { QUITTUNG_MS } from '../lib/quittung';

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

function Liste({ titel, eintraege, mitDatum, onOpen }: { titel: string; eintraege: Eintrag[]; mitDatum?: boolean; onOpen: (id: string) => void }) {
  if (!eintraege.length) return null;
  return (
    <section className="mb-6">
      <h3 className="text-[13px] font-semibold mb-2" style={{ color: 'var(--text-1)' }}>{titel}</h3>
      <ul className="space-y-3">
        {eintraege.map((e) => (
          <li key={e.id} className="text-[13px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
            {mitDatum && <span className="tnum text-[11.5px] mr-2" style={{ color: 'var(--text-3)' }}>{tag(e.at)}</span>}
            <button onClick={() => onOpen(e.id)} className="font-medium hover:underline underline-offset-2 text-left" style={{ color: 'var(--text-1)' }}>{e.title}</button>
            {e.sentence && e.sentence !== e.title && <> — {e.sentence}</>}
          </li>
        ))}
      </ul>
    </section>
  );
}

interface DossierThema { text: string; nr: number }

export function DossierView({ onOpenMemory, onEditMemory, dossierThema }: { onOpenMemory: (id: string) => void; onEditMemory?: (id: string) => void; /** von außen gesetzt: das Dossier, das offen sein soll (Klick auf ein Konzept im Graphen). `nr` unterscheidet zwei Klicks auf denselben Begriff. */ dossierThema?: DossierThema }) {
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
      if (!r.ok) throw new Error((d as { error?: string }).error ?? `HTTP ${r.status}`);
      setEntschieden((p) => ({
        ...p,
        [w.key]: aktion === 'newer'
          ? `Done — “${w.older.title}” is marked as replaced by “${w.newer.title}”.`
          : `Both hold — “${w.older.title}” now ends where “${w.newer.title}” begins.`,
      }));
    } catch (e) {
      setEntschieden((p) => ({ ...p, [w.key]: `That did not work: ${e instanceof Error ? e.message : String(e)}` }));
    }
  };

  useEffect(() => {
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
  }, []);

  const erstelle = async (thema: string) => {
    const t = thema.trim();
    if (!t) return;
    setEingabe(t);
    setLaedt(true);
    setFehler(null);
    setGespeichert(false);
    try {
      const r = await fetch(`/api/dossier?topic=${encodeURIComponent(t)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setDaten(inForm(d, LEERES_DOSSIER));
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
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
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setGespeichert(true);
      toast.push({ message: `Saved as the note “Dossier: ${daten.topic}”.`, kind: 'info' });
    } catch {
      toast.push({ message: 'The dossier could not be saved as a note.', kind: 'warn' });
    }
  };

  const chips = [...(vorschlaege?.topics ?? []), ...(vorschlaege?.tags ?? [])].filter((v, i, a) => a.findIndex((x) => x.name.toLowerCase() === v.name.toLowerCase()) === i).slice(0, 12);

  return (
    <div className="max-w-3xl mx-auto py-6" data-testid="dossier-view">
      <header className="mb-5">
        <h1 className="display">Dossier</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
          Everything you know about a person, a project or a topic — on one page: the statements, what happened
          when, how it's done, the files behind it and what is still open.
        </p>
      </header>
      <form onSubmit={absenden} className="flex gap-2 mb-3">
        <input
          value={eingabe}
          onChange={(e) => setEingabe(e.target.value)}
          placeholder="A person, a client, a project, a topic…"
          aria-label="Who or what is the dossier about?"
          className="hud-input flex-1 rounded-xl px-4 py-3 text-sm"
        />
        <button type="submit" disabled={laedt || !eingabe.trim()} className="btn-primary px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-50">
          {laedt ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Create dossier
        </button>
      </form>
      {chips.length > 0 && !daten && (
        <div className="flex flex-wrap gap-2 mb-6">
          <span className="text-[12px] self-center mr-1" style={{ color: 'var(--text-2)' }}>For example:</span>
          {chips.map((c) => (
            <button key={c.name} onClick={() => void erstelle(c.name)} className="min-h-7 inline-flex items-center px-3 py-1 rounded-full text-[12px]" style={{ background: 'var(--bg-inset-strong)', color: 'var(--text-2)' }}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      {vorschlagGrund && chips.length === 0 && !daten && (
        <p role="status" className="text-[12.5px] mb-4" style={{ color: 'var(--text-3)' }}>{vorschlagGrund}</p>
      )}
      {fehler && <p className="text-sm" style={{ color: 'var(--warn)' }}>{fehler}</p>}

      {daten && daten.total === 0 && (
        <p className="text-sm mt-4" style={{ color: 'var(--text-2)' }}>
          K3PTA knows nothing about “{daten.topic}” yet. Try another name — or save a first note about it.
        </p>
      )}

      {daten && daten.total > 0 && (
        <article className="hud-panel rounded-2xl p-6 mt-4">
          <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
            <div>
              <h2 className="text-xl font-semibold" style={{ color: 'var(--text-1)' }}>{daten.topic}</h2>
              <p className="text-[12px] mt-1 tnum" style={{ color: 'var(--text-3)' }}>
                {daten.total} {daten.total === 1 ? 'note' : 'notes'}
                {daten.first !== null && daten.last !== null ? ` · ${tag(daten.first)} – ${tag(daten.last)}` : ''}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => void kopieren()} className="btn-ghost px-3 py-2 rounded-lg text-[12.5px] flex items-center gap-2" style={{ border: '1px solid var(--border-subtle)' }}>
                {kopiert ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {kopiert ? 'Copied' : 'Copy as Markdown'}
              </button>
              <button onClick={() => void speichern()} disabled={gespeichert} className="btn-ghost px-3 py-2 rounded-lg text-[12.5px] flex items-center gap-2 disabled:opacity-50" style={{ border: '1px solid var(--border-subtle)' }}>
                <Save className="w-3.5 h-3.5" /> {gespeichert ? 'Saved' : 'Save as note'}
              </button>
            </div>
          </div>
          <Liste titel={DOSSIER_TITEL.punkte} eintraege={daten.facts} onOpen={onOpenMemory} />
          <Liste titel={DOSSIER_TITEL.zeit} eintraege={daten.timeline} mitDatum onOpen={onOpenMemory} />
          <Liste titel={DOSSIER_TITEL.anleitungen} eintraege={daten.howtos} onOpen={onOpenMemory} />
          <Liste titel={DOSSIER_TITEL.papiere} eintraege={daten.documents} onOpen={onOpenMemory} />
          {daten.todos.length > 0 && (
            <section className="mb-6">
              <h3 className="text-[13px] font-semibold mb-2" style={{ color: 'var(--text-1)' }}>Open to-dos</h3>
              <ul className="space-y-2">
                {daten.todos.map((t, i) => (
                  <li key={`${t.id}-${i}`} className="text-[13px]" style={{ color: 'var(--text-1)' }}>
                    ☐ {t.text} <button onClick={() => onOpenMemory(t.id)} className="text-[11px] hover:underline" style={{ color: 'var(--text-3)' }}>({t.title})</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {daten.contradictions.length > 0 && (
            <section className="mb-6">
              <h3 className="text-[13px] font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
                <AlertTriangle className="w-3.5 h-3.5" style={{ color: 'var(--warn)' }} /> To check
              </h3>
              {/* Paket 3: die Auflösung passiert im Fluss — je Karte drei Entscheidungen.
                  Ohne ids (alter Server-Stand) bleibt es bei der ehrlichen Textzeile. */}
              <div className="space-y-3">
                {daten.contradictions.map((w) => (
                  <div key={w.key} className="hud-inset rounded-xl p-4" data-testid="dossier-contradiction">
                    <div className="text-[13px] mb-2 flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
                      Two notes disagree{w.about ? ` about “${w.about}”` : ''}.
                    </div>
                    <div className="grid sm:grid-cols-2 gap-2 text-[13px]" style={{ color: 'var(--text-2)' }}>
                      {([['Newer', w.newer], ['Older', w.older]] as const).map(([label, s]) => (
                        <div key={label}>
                          <span className="text-[11px] mr-1" style={{ color: 'var(--text-3)' }}>{label}</span>
                          <strong style={{ color: 'var(--text-1)' }}>{s.value}</strong> in{' '}
                          {s.id ? (
                            <button onClick={() => onOpenMemory(s.id!)} className="hover:underline underline-offset-2" style={{ color: 'var(--text-1)' }}>{s.title}</button>
                          ) : s.title}
                        </div>
                      ))}
                    </div>
                    {entschieden[w.key] ? (
                      <p role="status" className="text-[12.5px] mt-3" style={{ color: 'var(--ok)' }}>{entschieden[w.key]}</p>
                    ) : w.newer.id && w.older.id ? (
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button onClick={() => void loese(w, 'newer')} className="btn-primary px-3 py-2 rounded-lg text-[12.5px] font-medium">Newer wins</button>
                        <button onClick={() => void loese(w, 'window')} className="btn-ghost px-3 py-2 rounded-lg text-[12.5px]" title="Both stay valid — the older note ends where the newer one began.">Both hold — cap the older</button>
                        {onEditMemory && (
                          <button onClick={() => onEditMemory(w.newer.id!)} className="btn-ghost px-3 py-2 rounded-lg text-[12.5px]">Edit</button>
                        )}
                      </div>
                    ) : (
                      <p className="text-[13px] mt-2" style={{ color: 'var(--text-2)' }}>
                        <strong style={{ color: 'var(--text-1)' }}>{w.newer.value}</strong> in {w.newer.title}, but <strong style={{ color: 'var(--text-1)' }}>{w.older.value}</strong> in {w.older.title}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
          {daten.related.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <span className="text-[11px] mr-1" style={{ color: 'var(--text-3)' }}>Related:</span>
              {daten.related.map((r) => (
                <button key={r.tag} onClick={() => void erstelle(r.tag)} className="px-2 py-1 rounded-full text-[12px]" style={{ background: 'var(--bg-inset-strong)', color: 'var(--text-2)' }}>
                  #{r.tag}
                </button>
              ))}
            </div>
          )}
        </article>
      )}
    </div>
  );
}
