import { memo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { Memory } from '../types';
import { motion } from 'motion/react';
import { Hash } from 'lucide-react';

interface MemoryCardProps {
  memory: Memory;
  onClick: () => void;
  score?: number;
  matchedTerms?: string[];
}

export const MemoryCard = memo(function MemoryCard({ memory, onClick, score, matchedTerms }: MemoryCardProps) {
  const pct = typeof score === "number" ? Math.round(score * 100) : null;
  const relevancy = pct !== null ? (pct > 65 ? 'hoch' : pct > 28 ? 'mittel' : 'niedrig') : null;
  const now = Date.now();
  const expired = memory.validTo != null && memory.validTo < now;
  const superseded = !!memory.supersededBy;
  const typeLabel = memory.type === 'episodic' ? 'EPISODE' : memory.type === 'procedural' ? 'ABLAUF' : memory.type === 'semantic' ? 'WISSEN' : null;
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      whileHover={{ y: -2 }}
      onClick={onClick}
      className="card p-5 cursor-pointer grid grid-rows-[auto_1fr_auto] h-56 overflow-hidden group relative"
    >
      {pct !== null && (
        <div
          className="absolute top-3 right-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium border"
          style={{
            color: relevancy === 'hoch' ? '#0f0f0f' : relevancy === 'mittel' ? '#3a3a3a' : 'var(--text-3)',
            background: relevancy === 'hoch' ? 'var(--bg-inset-strong)' : 'var(--bg-inset)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: relevancy === 'hoch' ? '#0f0f0f' : relevancy === 'mittel' ? '#6b6b6b' : '#c8c8c8' }} />
          {pct}%
        </div>
      )}
      <div className="min-h-0 overflow-hidden">
        <div className="flex items-center gap-2 mb-2.5 flex-wrap">
          <span className="text-[11px] font-medium tracking-wide" style={{ color: 'var(--text-3)' }}>
            {memory.tags[0]?.toUpperCase() || 'NOTIZ'}
          </span>
          {typeLabel && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full border font-medium tracking-wide"
              style={{ color: 'var(--text-2)', background: 'var(--bg-inset)', borderColor: 'var(--border-subtle)' }}
            >
              {typeLabel}
            </span>
          )}
          {(expired || superseded) && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full border font-medium"
              style={{ color: '#8a5a00', background: 'rgba(230,170,0,0.12)', borderColor: 'rgba(230,170,0,0.35)' }}
              title={superseded ? 'Durch eine neuere Erinnerung ersetzt' : 'Gültigkeit abgelaufen'}
            >
              {superseded ? 'ERSETZT' : 'ABGELAUFEN'}
            </span>
          )}
          {pct !== null && matchedTerms && matchedTerms.length > 0 && (
            <span className="text-[11px] truncate max-w-[140px]" style={{ color: 'var(--text-3)' }}>
              · {matchedTerms.slice(0, 2).join(", ")}
            </span>
          )}
        </div>
        <h3 className={`font-[580] leading-snug line-clamp-2 text-[15px] tracking-[-0.012em] ${pct !== null ? 'pr-12' : ''}`} style={{ color: 'var(--text-1)' }}>
          {memory.title || 'Ohne Titel'}
        </h3>
        <p className="text-[13.5px] line-clamp-3 leading-6 mt-1.5" style={{ color: 'var(--text-2)' }}>
          {memory.content}
        </p>
      </div>
      <div className="self-end pt-4 flex items-center justify-between gap-3 min-w-0">
        <div className="flex flex-nowrap gap-1.5 min-w-0 overflow-hidden">
          {memory.tags.slice(0, 3).map(tag => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border shrink-0 max-w-[120px]"
              style={{ color: 'var(--text-2)', background: 'var(--bg-inset)', borderColor: 'var(--border-subtle)' }}
            >
              <Hash className="w-3 h-3 opacity-50 shrink-0" />
              <span className="truncate">{tag}</span>
            </span>
          ))}
          {memory.tags.length > 3 && (
            <span className="text-xs px-1.5 py-1 shrink-0" style={{ color: 'var(--text-3)' }}>+{memory.tags.length - 3}</span>
          )}
        </div>
        <span className="text-xs shrink-0 whitespace-nowrap" style={{ color: 'var(--text-3)' }}>
          {formatDistanceToNow(new Date(memory.updatedAt), { addSuffix: true, locale: de })}
        </span>
      </div>
    </motion.div>
  );
});
