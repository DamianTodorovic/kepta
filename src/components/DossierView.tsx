// A dossier: everything KEPTA knows about one person, project or topic — on
// one page, ready to copy into a document or keep as a note.
import { FormEvent, useEffect, useState } from 'react';
import { FileText, Copy, Check, Save, Loader2, AlertTriangle } from '../lib/icons';
import { useToast } from './ui/Toast';

interface Eintrag { id: string; title: string; sentence: string; at: number }
interface Dossier {
  topic: string;
  total: number;
  kinds: Record<string, number>;
  facts: Eintrag[];
  timeline: Eintrag[];
  howtos: Eintrag[];
  documents: Eintrag[];
  todos: { id: string; title: string; text: string }[];
  contradictions: { key: string; about: string; newer: { title: string; value: string }; older: { title: string; value: string } }[];
  related: { tag: string; count: number }[];
  first: number | null;
  last: number | null;
  markdown: string;
}
interface Vorschlaege { tags: { name: string; count: number }[]; topics: { name: string; count: number }[] }

const tag = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function Liste({ titel, eintraege, mitDatum, onOpen }: { titel: string; eintraege: Eintrag[]; mitDatum?: boolean; onOpen: (id: string) => void }) {
  if (!eintraege.length) return null;
  return (
    <section className="mb-6">
      <h3 className="text-[13px] font-semibold mb-2" style={{ color: 'var(--text-1)' }}>{titel}</h3>
      <ul className="space-y-2.5">
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

export function DossierView({ onOpenMemory }: { onOpenMemory: (id: string) => void }) {
  const toast = useToast();
  const [eingabe, setEingabe] = useState('');
  const [daten, setDaten] = useState<Dossier | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [vorschlaege, setVorschlaege] = useState<Vorschlaege | null>(null);
  const [kopiert, setKopiert] = useState(false);
  const [gespeichert, setGespeichert] = useState(false);

  useEffect(() => {
    let vorbei = false;
    fetch('/api/dossier/suggestions')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!vorbei && d) setVorschlaege(d as Vorschlaege); })
      .catch(() => undefined);
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
      setDaten(d as Dossier);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setLaedt(false);
    }
  };

  const absenden = (e: FormEvent) => { e.preventDefault(); void erstelle(eingabe); };

  const kopieren = async () => {
    if (!daten) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
      await navigator.clipboard.writeText(daten.markdown);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 1800);
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
          Everything you know about a person, a project or a topic — on one page. Facts, a timeline, how-tos, documents and what is
          still open.
        </p>
      </header>
      <form onSubmit={absenden} className="flex gap-2 mb-3">
        <input
          value={eingabe}
          onChange={(e) => setEingabe(e.target.value)}
          placeholder="A person, a client, a project, a topic…"
          aria-label="Who or what is the dossier about?"
          className="hud-input flex-1 rounded-xl px-4 py-2.5 text-sm"
        />
        <button type="submit" disabled={laedt || !eingabe.trim()} className="btn-primary px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-50">
          {laedt ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Create dossier
        </button>
      </form>
      {chips.length > 0 && !daten && (
        <div className="flex flex-wrap gap-1.5 mb-6">
          <span className="text-[11px] self-center mr-1" style={{ color: 'var(--text-3)' }}>For example:</span>
          {chips.map((c) => (
            <button key={c.name} onClick={() => void erstelle(c.name)} className="px-2.5 py-1 rounded-full text-[12px]" style={{ background: 'var(--bg-inset-strong)', color: 'var(--text-2)' }}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      {fehler && <p className="text-sm" style={{ color: 'var(--warn)' }}>{fehler}</p>}

      {daten && daten.total === 0 && (
        <p className="text-sm mt-4" style={{ color: 'var(--text-2)' }}>
          KEPTA knows nothing about “{daten.topic}” yet. Try another name — or save a first note about it.
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
              <button onClick={() => void kopieren()} className="btn-ghost px-3 py-1.5 rounded-lg text-[12.5px] flex items-center gap-1.5" style={{ border: '1px solid var(--border-subtle)' }}>
                {kopiert ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {kopiert ? 'Copied' : 'Copy as Markdown'}
              </button>
              <button onClick={() => void speichern()} disabled={gespeichert} className="btn-ghost px-3 py-1.5 rounded-lg text-[12.5px] flex items-center gap-1.5 disabled:opacity-50" style={{ border: '1px solid var(--border-subtle)' }}>
                <Save className="w-3.5 h-3.5" /> {gespeichert ? 'Saved' : 'Save as note'}
              </button>
            </div>
          </div>
          <Liste titel="Key facts" eintraege={daten.facts} onOpen={onOpenMemory} />
          <Liste titel="Timeline" eintraege={daten.timeline} mitDatum onOpen={onOpenMemory} />
          <Liste titel="How-tos" eintraege={daten.howtos} onOpen={onOpenMemory} />
          <Liste titel="Documents" eintraege={daten.documents} onOpen={onOpenMemory} />
          {daten.todos.length > 0 && (
            <section className="mb-6">
              <h3 className="text-[13px] font-semibold mb-2" style={{ color: 'var(--text-1)' }}>Open to-dos</h3>
              <ul className="space-y-1.5">
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
              <h3 className="text-[13px] font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-1)' }}>
                <AlertTriangle className="w-3.5 h-3.5" style={{ color: 'var(--warn)' }} /> To check
              </h3>
              <ul className="space-y-1.5">
                {daten.contradictions.map((w) => (
                  <li key={w.key} className="text-[13px]" style={{ color: 'var(--text-2)' }}>
                    {w.about ? `“${w.about}”: ` : ''}<strong>{w.newer.value}</strong> in {w.newer.title}, but <strong>{w.older.value}</strong> in {w.older.title}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {daten.related.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <span className="text-[11px] mr-1" style={{ color: 'var(--text-3)' }}>Related:</span>
              {daten.related.map((r) => (
                <button key={r.tag} onClick={() => void erstelle(r.tag)} className="px-2 py-0.5 rounded-full text-[12px]" style={{ background: 'var(--bg-inset-strong)', color: 'var(--text-2)' }}>
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
