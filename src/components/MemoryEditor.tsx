import { useState, useEffect, KeyboardEvent, FormEvent } from 'react';
import { Memory } from '../types';
import { motion } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { Brain } from "@phosphor-icons/react";
import { X, Save, Trash2, Hash, Clock, Zap } from "../lib/icons";
import { KeptaMark } from './KeptaMark';

type MemoryKind = 'semantic' | 'episodic' | 'procedural';

const KINDS: { key: MemoryKind; label: string; hint: string }[] = [
  { key: 'semantic', label: 'Fact', hint: 'Facts & connections' },
  { key: 'episodic', label: 'Event', hint: 'Events & conversations' },
  { key: 'procedural', label: 'How-to', hint: 'Procedures & processes' },
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
  onSave: (data: Partial<Memory>) => void;
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
    }
  }, [memory]);

  // Desktop-Standard: Escape schließt den Editor
  useEffect(() => {
    const onKey = (e: Event): void => {
      if ((e as globalThis.KeyboardEvent).key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

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

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() && !content.trim()) return;

    let finalTags = [...tags];
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
            <KeptaMark size={30} radius={8} />
            <div>
              <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text-1)' }}>
                {memory?.id ? 'Edit note' : 'New note'}
              </h2>
              <div className="hud-label mt-0.5 flex items-center gap-1.5">
                {memory?.id ? (
                  <>
                    <Clock className="w-3 h-3" />
                    {KINDS.find(k => k.key === (memory.type || 'semantic'))?.label ?? 'Fact'}
                    {' · '}
                    {formatDistanceToNow(new Date(memory.updatedAt), { addSuffix: true })}
                  </>
                ) : (
                  'A new entry in your local knowledge base'
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
              onClick={onClose}
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
              <div className="hud-label mb-2">Title</div>
              <input
                type="text"
                placeholder="Title of this entry"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-3xl font-bold focus:outline-none bg-transparent pb-2 placeholder:text-[var(--text-3)]"
                style={{ color: 'var(--text-1)' }}
                autoFocus
              />
            </div>

            {/* Memory-Typ: segmented control */}
            <div>
              <div className="hud-label mb-2 flex items-center gap-1.5"><Brain className="w-3.5 h-3.5" /> Memory type</div>
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl hud-inset">
                {KINDS.map((k) => (
                  <button
                    key={k.key}
                    type="button"
                    onClick={() => setKind(k.key)}
                    className="px-3 py-2 rounded-lg text-sm font-medium transition-all"
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
              <p className="text-xs mt-1.5 ml-1" style={{ color: 'var(--text-3)' }}>
                {KINDS.find((k) => k.key === kind)?.hint}
              </p>
            </div>

            <div className="flex-1 flex flex-col min-h-[240px]">
              <div className="hud-label mb-2">Content</div>
              <textarea
                placeholder="Knowledge, notes, code… [[wiki links]] are connected automatically."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="hud-input flex-1 w-full resize-none rounded-xl p-5 text-sm leading-relaxed"
              />
            </div>

            <div className="pt-2">
              <div className="hud-label mb-2">Tags</div>
              <div className="hud-input flex flex-wrap gap-2 items-center p-2 rounded-xl">
                {tags.map(tag => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm font-medium hud-inset"
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
                  type="text"
                  placeholder={tags.length === 0 ? "Type and press Enter…" : ""}
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  className="flex-1 min-w-[150px] bg-transparent text-sm focus:outline-none px-2"
                  style={{ color: 'var(--text-1)' }}
                />
              </div>
            </div>

            {/* Temporal & confidence — collapsible */}
            <div className="rounded-xl" style={{ border: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                onClick={() => setShowTemporal((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium"
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
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs" style={{ color: 'var(--text-3)' }}>Valid from</span>
                      <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className="hud-input rounded-lg px-3 py-2 text-sm" />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs" style={{ color: 'var(--text-3)' }}>Valid until (empty = unlimited)</span>
                      <input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} className="hud-input rounded-lg px-3 py-2 text-sm" />
                    </label>
                  </div>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
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

          <footer className="p-5 shrink-0 flex items-center justify-between" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <span className="hud-label">Everything stays local on this device</span>
            <button
              type="submit"
              className="btn-primary flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-medium"
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
