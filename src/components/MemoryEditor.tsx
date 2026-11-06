import { useState, useEffect, KeyboardEvent, FormEvent } from 'react';
import { Memory } from '../types';
import { motion } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { Brain } from "../lib/icons";
import { X, Save, Trash2, Hash, Clock, Zap, Lock } from "../lib/icons";
import { KeptaMark } from './KeptaMark';
import { holeBehauptungen } from '../lib/store';
import type { BehauptungEingabe } from '../core/wortschatz';
import { gruppenVonNotiz, THEMA_LABELS, TRAEGER_LABELS, TYP_BESCHREIBUNG } from '../lib/graphHierarchy';

type MemoryKind = 'semantic' | 'episodic' | 'procedural' | 'reference';

const KINDS: { key: MemoryKind; label: string; hint: string }[] = [
  // Die Tipps erklaeren in Alltagssprache, was hier gehoert — sie duerfen das
  // Wort nicht selbst wiederholen. „Fact — Facts & connections" erklaert nichts.
  { key: 'semantic', label: TYP_BESCHREIBUNG.semantic, hint: 'Something that is simply true — a definition, a number, a decision you made' },
  { key: 'episodic', label: TYP_BESCHREIBUNG.episodic, hint: 'Something that happened at a time — a meeting, a call, a date' },
  { key: 'procedural', label: TYP_BESCHREIBUNG.procedural, hint: 'How something is done — steps, a setup, a checklist' },
  // Vierte Art, weil die drei anderen jedes uebernommene Dokument zum "Fakt"
  // machten: an einem echten Bestand 2320 von 2421 Notizen.
  { key: 'reference', label: TYP_BESCHREIBUNG.reference, hint: 'A paper you keep — a contract, an invoice, a file from your folders' },
];

function toLocalDateInput(ts: number | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fromLocalDateInput(v: string): number | null {
  if (!v) return null;
  const t = Date.parse(v + 'T12:00:00');
  return Number.isNaN(t) ? null : t;
}

interface MemoryEditorProps {
  memory: Memory | null;
  onSave: (data: Partial<Memory> & { beziehungen?: BehauptungEingabe[] }) => void;
  onClose: () => void;
  onDelete?: () => void;
}

export function MemoryEditor({ memory, onSave, onClose, onDelete }: MemoryEditorProps) {
  const [title, setTitle] = useState(memory?.title || '');
  const [content, setContent] = useState(memory?.content || '');
  const [tagsInput, setTagsInput] = useState('');
  const [tags, setTags] = useState<string[]>(memory?.tags || []);
  const [kind, setKind] = useState<MemoryKind>(memory?.type || 'semantic');
  const [confidence, setConfidence] = useState<number>(memory?.confidence ?? 1);
  const [validFrom, setValidFrom] = useState<string>(toLocalDateInput(memory?.validFrom));
  const [validTo, setValidTo] = useState<string>(toLocalDateInput(memory?.validTo));
  const [showTemporal, setShowTemporal] = useState(!!(memory?.validFrom || memory?.validTo));
  // Private: never shown to AI apps, never sent to a cloud model (2.13).
  const [privat, setPrivat] = useState(memory?.scope === 'private');

  /**
   * Punkt 126 — die Behauptungen dieser Notiz. Der Kern setzt sie, das Tor nimmt sie an,
   * und die Linie malt ihr Wort (seit 3.2.88 auch mit ihrem Zoom-Boden). Was fehlte, war
   * diese Hand: gemessen 29.10. 08:19:52 an Damians echtem Bestand sind 1 468 von 1 468
   * Kanten Systemwoerter, 0 Aussagen mit einem Wort von jemandem.
   *
   * `behAnfang` ist die Grundlinie, nicht das Ergebnis: ein Speichern ohne Anynderung
   * schickt dieselbe Liste zurueck, und nur darum bleibt ein leeres Feld beim Loeschen
   * eine Absicht — ein Feld, das nie geladen wurde, ist kein leeres Feld.
   */
  const [beh, setBeh] = useState<BehauptungEingabe[]>([]);
  const [behAnfang, setBehAnfang] = useState<BehauptungEingabe[]>([]);
  const [wer, setWer] = useState('');
  const [was, setWas] = useState('');
  const [wen, setWen] = useState('');
  const [meldung, setMeldung] = useState('');

  useEffect(() => {
    if (memory) {
      setTitle(memory.title);
      setContent(memory.content);
      setTags(memory.tags);
      setKind(memory.type || 'semantic');
      setConfidence(memory.confidence ?? 1);
      setValidFrom(toLocalDateInput(memory.validFrom));
      setValidTo(toLocalDateInput(memory.validTo));
      setShowTemporal(!!(memory.validFrom || memory.validTo));
      setPrivat(memory.scope === 'private');
      setWarnUnsaved(false);
    }
  }, [memory]);

  /**
   * Punkt 126: was steht schon? Die Liste kommt vom Tor, nicht aus dem Notizobjekt —
   * Behauptungen gehören der Relation, nicht dem Blatt. Ohne diesen Leser waere das Feld
   * ein Blindtext: schreiben ja, sehen und loeschen nein.
   */
  useEffect(() => {
    const id = memory?.id ?? '';
    let abgebrochen = false;
    setBeh([]);
    setBehAnfang([]);
    setWer(''); setWas(''); setWen('');
    if (!id) {
      // Noch kein Blatt: die Liste ist leer, und der Text sagt, was als naechstes kommt.
      void holeBehauptungen('').then((r) => { if (!abgebrochen) setMeldung(r.grund ?? r.hinweis); });
      return () => { abgebrochen = true; };
    }
    void holeBehauptungen(id).then((r) => {
      if (abgebrochen) return;
      setBeh(r.liste);
      setBehAnfang(r.liste);
      // Ein Lesefehler bleibt sichtbar: ohne Grund waere die leere Liste eine Behauptung.
      setMeldung(r.grund ? r.grund : r.liste.length === 0 ? r.hinweis : '');
    });
    return () => { abgebrochen = true; };
  }, [memory?.id]);

  // Ungespeicherte Änderungen nicht still wegwerfen: erster Schließversuch
  // warnt, der zweite (oder der Abbruch-Knopf) gibt den Datensatz frei.
  const [warnUnsaved, setWarnUnsaved] = useState(false);
  const dirty =
    title !== (memory?.title || '') ||
    content !== (memory?.content || '') ||
    JSON.stringify(tags) !== JSON.stringify(memory?.tags || []) ||
    kind !== (memory?.type || 'semantic') ||
    confidence !== (memory?.confidence ?? 1) ||
    validFrom !== toLocalDateInput(memory?.validFrom) ||
    validTo !== toLocalDateInput(memory?.validTo) ||
    JSON.stringify(beh) !== JSON.stringify(behAnfang) ||
    privat !== (memory?.scope === 'private');

  /**
   * Wo diese Notiz landet — live aus dem getippten Text, mit dem Grund der
   * Regel. Dieselbe Rechnung wie auf der Karte und im Filter, damit der
   * Nutzer nicht zwei Antworten auf „wo ist das?" bekommt.
   */
  const ablage = gruppenVonNotiz({ title, content, tags });
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const requestClose = () => {
    if (dirty && !warnUnsaved) { setWarnUnsaved(true); return; }
    onClose();
  };

  // Desktop-Standard: Escape schließt den Editor
  useEffect(() => {
    const onKey = (e: Event): void => {
      if ((e as globalThis.KeyboardEvent).key === 'Escape') {
        e.stopPropagation();
        if (dirty && !warnUnsaved) { setWarnUnsaved(true); return; }
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, dirty, warnUnsaved]);

  const handleAddTag = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const newTag = tagsInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (newTag && !tags.includes(newTag)) {
        setTags([...tags, newTag]);
      }
      setTagsInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  /**
   * Punkt 126: eine Behauptung anlegen. Die drei Teile sind Pflicht, und leere Eingaben
   * gehen nicht durch — ein halber Satz im Netz waer eine Linie ohne Auskunft, genau das
   * Bild, das dieser Punkt abschafft.
   */
  const behauptungHinzufuegen = () => {
    const quelle = wer.trim().toLowerCase();
    const wort = was.trim().toLowerCase();
    const ziel = wen.trim().toLowerCase();
    if (!quelle || !wort || !ziel) {
      setMeldung('A claim needs three parts: who, the word, whom.');
      return;
    }
    if (quelle === ziel) {
      setMeldung('Who and whom are the same term — a claim needs two different ends.');
      return;
    }
    if (beh.some((b) => b.quelle === quelle && b.ziel === ziel && b.wort === wort)) {
      setMeldung('This claim is already on the list.');
      return;
    }
    setBeh([...beh, { quelle, ziel, wort }]);
    setWer(''); setWas(''); setWen('');
    setMeldung('');
  };

  const behauptungEntfernen = (index: number) => {
    setBeh(beh.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() && !content.trim()) return;

    const finalTags = [...tags];
    if (tagsInput.trim()) {
      const newTag = tagsInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (newTag && !finalTags.includes(newTag)) {
        finalTags.push(newTag);
      }
    }

    onSave({
      title,
      content,
      tags: finalTags,
      type: kind,
      confidence,
      validFrom: fromLocalDateInput(validFrom),
      validTo: fromLocalDateInput(validTo),
      // Punkt 126: die Behauptungen gehen immer mit — auch wenn die Person nur am Text
      // gedreht hat. Das Feld ist die volle Absicht ("so steht es danach"), nicht ein Diff.
      beziehungen: beh,
      // Only say something about the scope when it changes to or from private.
      ...(privat ? { scope: 'private' } : memory?.scope === 'private' ? { scope: 'local' } : {}),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 hud-backdrop"
        onClick={onClose}
      />

      <motion.div
        initial={{ x: '100%', opacity: 0.5 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0.5 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="relative w-full max-w-2xl h-full flex flex-col z-10 glass-strong"
        style={{ borderLeft: '1px solid var(--border-subtle)' }}
      >
        <header className="flex items-center justify-between p-5 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-3">
            <KeptaMark size={30} />
            <div>
              <h2 className="fs-5 font-semibold" style={{ color: 'var(--text-1)' }}>
                {memory?.id ? 'Edit note' : 'New note'}
              </h2>
              <div className="hud-label mt-1 flex items-center gap-2">
                {memory?.id ? (
                  <>
                    <Clock className="w-3 h-3" />
                    {KINDS.find(k => k.key === (memory.type || 'semantic'))?.label ?? TYP_BESCHREIBUNG.semantic}
                    {' · '}
                    {formatDistanceToNow(new Date(memory.updatedAt), { addSuffix: true })}
                  </>
                ) : (
                  'A new note in your local knowledge base'
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onDelete && memory?.id && (
              <button
                type="button"
                onClick={onDelete}
                className="btn-danger-ghost p-2 rounded-lg"
                title="Move to trash"
              >
                <Trash2 className="w-4.5 h-4.5" />
              </button>
            )}
            <button
              onClick={requestClose}
              aria-label="Close editor"
              className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-inset)]"
              style={{ color: 'var(--text-3)' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          <div className="p-8 flex-1 flex flex-col gap-6">
            <div>
              <label htmlFor="memory-titel" className="hud-label mb-2">Title</label>
              <input
                id="memory-titel"
                type="text"
                placeholder="Title of this note"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full fs-7 font-bold focus:outline-none bg-transparent pb-2 placeholder:text-[var(--text-3)]"
                style={{ color: 'var(--text-1)' }}
                autoFocus
              />
            </div>

            {/* Zeile 1 und 2 — was die Regeln aus dem Text machen, solange er
                getippt wird. Read-only: der Nutzer waehlt den Inhalt, die
                Ablage folgt daraus. */}
            <div className="flex flex-wrap items-center gap-2 mb-3" aria-label="Filed under">
              <span className="hud-label shrink-0">Filed under</span>
              <span className="row-quiet" title={ablage.grund}>{TRAEGER_LABELS[ablage.traeger]}</span>
              {ablage.themen.map((t) => (
                <span key={t} className="row-quiet" title="A topic word in this text points here">{THEMA_LABELS[t]}</span>
              ))}
              {ablage.themen.length === 0 && (
                <span className="fs-2 lh-dicht" style={{ color: 'var(--text-3)' }}>
                  {ablage.traeger === 'code' ? 'code is never sorted by topic' : 'no topic word in this text yet'}
                </span>
              )}
            </div>

            {/* Memory-Typ: segmented control */}
            <div>
              <div className="hud-label mb-2 flex items-center gap-2"><Brain className="w-3.5 h-3.5" /> Type of this note</div>
              <div className="grid grid-cols-3 lg:grid-cols-4 gap-2 p-1 rounded-xl hud-inset">
                {KINDS.map((k) => (
                  <button
                    key={k.key}
                    type="button"
                    onClick={() => setKind(k.key)}
                    className="px-3 py-2 rounded-lg fs-4 lh-lesbar font-semibold transition-colors"
                    style={{
                      background: kind === k.key ? 'var(--accent-soft)' : 'transparent',
                      color: kind === k.key ? 'var(--accent)' : 'var(--text-2)',
                      border: kind === k.key ? '1px solid var(--accent)' : '1px solid transparent',
                    }}
                    title={k.hint}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
              <p className="fs-2 lh-dicht mt-2 ml-1" style={{ color: 'var(--text-3)' }}>
                {KINDS.find((k) => k.key === kind)?.hint}
              </p>
            </div>

            <div className="inhalt-block flex-1 flex flex-col">
              <label htmlFor="memory-inhalt" className="hud-label mb-2">Content</label>
              <textarea
                id="memory-inhalt"
                placeholder="Knowledge, notes, code… [[wiki links]] are connected automatically."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="hud-input flex-1 w-full resize-none rounded-xl p-5 fs-4 lh-prosa"
              />
            </div>

            {/* Punkt 126 — eine Hand legt das Wort hin. Vorher konnte niemand sagen, WAS
                zwei Begriffe verbinden: gemessen 29.10. 08:19:52 an Damians echtem Bestand
                sind 1 468 von 1 468 Kanten Mitennungen und 0 Aussagen mit einem Wort.
                Punkt 128 — die Zeile steht direkt unter dem Inhalt und nicht unter Tags und
                Privat, weil sie gemessen 29.10. 13:35 auf 1440 x 900 unter der Kante lag. */}
            <div className="rounded-xl" style={{ border: '1px solid var(--border-subtle)' }} data-testid="behauptung-feld">
              <div className="flex items-center justify-between gap-2 px-4 pt-3">
                <span className="flex items-center gap-2 fs-4 lh-lesbar font-semibold" style={{ color: 'var(--text-2)' }}>
                  <Brain className="w-4 h-4" style={{ color: 'var(--text-3)' }} /> Claims on this note
                </span>
                <span className="hud-label tnum shrink-0" style={{ color: 'var(--text-3)' }}>
                  {beh.length} {beh.length === 1 ? 'claim' : 'claims'}
                </span>
              </div>
              <div className="px-4 py-3 flex flex-col gap-2">
                {beh.map((b, i) => (
                  <div key={`${b.quelle} ${b.wort} ${b.ziel}`} data-testid="behauptung-reihe" className="flex items-center gap-2 fs-4 lh-lesbar">
                    <span className="flex-1 min-w-0 break-words" style={{ color: 'var(--text-1)' }}>{b.quelle}</span>
                    <span className="hud-label shrink-0" style={{ color: 'var(--accent)' }}>{b.wort}</span>
                    <span className="flex-1 min-w-0 break-words text-right" style={{ color: 'var(--text-1)' }}>{b.ziel}</span>
                    <button
                      type="button"
                      data-testid="behauptung-entfernen"
                      aria-label={`Remove the claim ${b.quelle} ${b.wort} ${b.ziel}`}
                      onClick={() => behauptungEntfernen(i)}
                      className="p-2 rounded-lg btn-ghost shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="fs-2 lh-dicht" style={{ color: 'var(--text-3)' }}>Who</span>
                    <input data-testid="behauptung-wer" value={wer} onChange={(e) => setWer(e.target.value)} className="hud-input rounded-lg px-3 py-2 fs-4 lh-lesbar" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="fs-2 lh-dicht" style={{ color: 'var(--text-3)' }}>Does what</span>
                    <input data-testid="behauptung-tutwas" value={was} onChange={(e) => setWas(e.target.value)} className="hud-input rounded-lg px-3 py-2 fs-4 lh-lesbar" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="fs-2 lh-dicht" style={{ color: 'var(--text-3)' }}>Whom</span>
                    <input data-testid="behauptung-wen" value={wen} onChange={(e) => setWen(e.target.value)} className="hud-input rounded-lg px-3 py-2 fs-4 lh-lesbar" />
                  </label>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    data-testid="behauptung-hinzufuegen"
                    onClick={behauptungHinzufuegen}
                    className="btn-ghost rounded-lg px-3 py-2 fs-4 lh-lesbar"
                  >
                    Add claim
                  </button>
                  {/* Steht die Zeile, sagt sie den Grund: eine leere Liste ohne Ursache ist
                      eine Behauptung, und eine Absage ohne Grund ein Rat. */}
                  <span data-testid="behauptung-meldung" className="hud-label" style={{ color: 'var(--text-3)' }}>{meldung}</span>
                </div>
                <p className="fs-2 lh-dicht" style={{ color: 'var(--text-3)' }}>
                  A claim is the word on the graph line. Words you name here are added to this note.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <label htmlFor="memory-schlagwort" className="hud-label mb-2">Tags</label>
              <div className="hud-input flex flex-wrap gap-2 items-center p-2 rounded-xl">
                {tags.map(tag => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 px-3 py-1 rounded-lg fs-4 lh-lesbar font-semibold hud-inset"
                    style={{ color: 'var(--accent)' }}
                  >
                    <Hash className="w-3.5 h-3.5 opacity-60" />
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="ml-1 opacity-60 hover:opacity-100 focus:outline-none transition-opacity"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
                <input
                  id="memory-schlagwort"
                  type="text"
                  placeholder={tags.length === 0 ? "Type and press Enter…" : ""}
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  className="flex-1 min-w-[150px] bg-transparent fs-4 lh-lesbar focus:outline-none px-2"
                  style={{ color: 'var(--text-1)' }}
                />
              </div>
            </div>

            {/* Private — never shown to AI apps, never sent to a cloud model */}
            <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ border: '1px solid var(--border-subtle)' }}>
              <Lock className="w-4 h-4 shrink-0" style={{ color: privat ? 'var(--accent)' : 'var(--text-3)' }} />
              <div className="flex-1">
                <div className="fs-4 lh-lesbar font-semibold" style={{ color: 'var(--text-1)' }}>Private</div>
                <div className="fs-2 lh-dicht" style={{ color: 'var(--text-3)' }}>AI apps never see this note, and it is never sent to a cloud model.</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={privat}
                aria-label="Private"
                onClick={() => setPrivat((v) => !v)}
                className="relative w-10 h-6 rounded-full shrink-0 transition-colors"
                style={{ background: privat ? 'var(--accent)' : 'var(--bg-inset-strong)', border: '1px solid var(--border-subtle)' }}
              >
                <span className="absolute top-0.5 rounded-full bg-white transition-all" style={{ left: privat ? 18 : 2, width: 18, height: 18 }} />
              </button>
            </div>

            {/* Temporal & confidence — collapsible */}
            <div className="rounded-xl" style={{ border: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                onClick={() => setShowTemporal((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 fs-4 lh-lesbar font-semibold"
                style={{ color: 'var(--text-2)' }}
              >
                <span className="flex items-center gap-2"><Clock className="w-4 h-4" style={{ color: 'var(--text-3)' }} /> Validity & confidence</span>
                <span style={{ color: 'var(--text-3)' }}>{showTemporal ? '−' : '+'}</span>
              </button>
              {showTemporal && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="px-4 pb-4 flex flex-col gap-4 overflow-hidden"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-2">
                      <span className="fs-2 lh-dicht" style={{ color: 'var(--text-3)' }}>Valid from</span>
                      <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className="hud-input rounded-lg px-3 py-2 fs-4 lh-lesbar" />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className="fs-2 lh-dicht" style={{ color: 'var(--text-3)' }}>Valid until (empty = no end date)</span>
                      <input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} className="hud-input rounded-lg px-3 py-2 fs-4 lh-lesbar" />
                    </label>
                  </div>
                  <label className="flex flex-col gap-2">
                    <span className="fs-2 lh-dicht flex items-center gap-2" style={{ color: 'var(--text-3)' }}>
                      <Zap className="w-3 h-3" /> Confidence — {Math.round(confidence * 100)} % (how reliable is this memory?)
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(confidence * 100)}
                      onChange={(e) => setConfidence(Number(e.target.value) / 100)}
                      className="w-full accent-[var(--accent)]"
                    />
                  </label>
                </motion.div>
              )}
            </div>
          </div>

          {warnUnsaved && dirty && (
            <div role="alert" className="mx-5 mb-1 flex items-center gap-3 px-3 py-2 rounded-lg fs-3" style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger)' }}>
              <span style={{ color: 'var(--text-1)' }}>Unsaved changes. Press Esc again to discard, or save first.</span>
              <button type="button" onClick={onClose} className="ml-auto fs-2 lh-dicht font-semibold px-3 py-1 rounded-lg btn-danger-ghost">Discard</button>
              <button type="button" onClick={() => setWarnUnsaved(false)} className="fs-2 lh-dicht font-semibold px-3 py-1 rounded-lg btn-ghost">Keep editing</button>
            </div>
          )}
          <footer className="p-5 shrink-0 flex items-center justify-between" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <span className="hud-label">Everything stays local on this device</span>
            <button
              type="submit"
              className="btn-primary flex items-center gap-2 px-5 py-2 rounded-lg fs-3 font-semibold"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
          </footer>
        </form>
      </motion.div>
    </div>
  );
}
