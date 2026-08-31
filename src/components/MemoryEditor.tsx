import { useState, useEffect, KeyboardEvent, FormEvent } from 'react';
import { Memory } from '../types';
import { motion } from 'motion/react';
import { X, Save, Trash2, Hash, Database } from 'lucide-react';

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

  useEffect(() => {
    if (memory) {
      setTitle(memory.title);
      setContent(memory.content);
      setTags(memory.tags);
    }
  }, [memory]);

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

    onSave({ title, content, tags: finalTags });
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
        className="relative w-full max-w-2xl h-full shadow-2xl flex flex-col z-10"
        style={{ background: 'var(--bg-panel-solid)', borderLeft: '1px solid var(--border-subtle)' }}
      >
        <header className="flex items-center justify-between p-6 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 hud-inset rounded-lg flex items-center justify-center">
              <Database className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-1)' }}>
                {memory ? 'Knoten bearbeiten' : 'Neuer Knoten'}
              </h2>
              <div className="hud-label mt-0.5">Wissens-Editor</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="p-2 rounded-lg transition-colors hover:bg-red-500/10"
                style={{ color: '#f87171' }}
                title="Löschen"
              >
                <Trash2 className="w-5 h-5" />
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
              <div className="hud-label mb-2">Bezeichnung</div>
              <input
                type="text"
                placeholder="Titel des Eintrags"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-3xl font-bold focus:outline-none bg-transparent pb-2 placeholder:text-[var(--text-3)]"
                style={{ color: 'var(--text-1)' }}
                autoFocus
              />
            </div>

            <div className="flex-1 flex flex-col min-h-[300px]">
              <div className="hud-label mb-2">Datenpayload</div>
              <textarea
                placeholder="Wissen, Notizen, Code eingeben..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="hud-input flex-1 w-full resize-none rounded-xl p-5 text-sm leading-relaxed"
              />
            </div>

            <div className="pt-2">
              <div className="hud-label mb-2">Synapsen / Kategorien</div>
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
                  placeholder={tags.length === 0 ? "Tippen und Enter drücken..." : ""}
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  className="flex-1 min-w-[150px] bg-transparent text-sm focus:outline-none px-2"
                  style={{ color: 'var(--text-1)' }}
                />
              </div>
            </div>
          </div>

          <footer className="p-6 shrink-0 flex items-center justify-between" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <span className="hud-label">Speichern schreibt in lokalen Index</span>
            <button
              type="submit"
              className="btn-primary flex items-center gap-2 px-6 py-2.5 rounded-xl"
            >
              <Save className="w-4 h-4" />
              Speichern
            </button>
          </footer>
        </form>
      </motion.div>
    </div>
  );
}
