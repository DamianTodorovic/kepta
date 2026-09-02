import { memo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { Memory } from '../types';
import { motion } from 'motion/react';
import { Hash, Brain, Clock, Zap } from 'lucide-react';

interface MemoryCardProps {
  memory: Memory;
  onClick: () => void;
  score?: number;
  matchedTerms?: string[];
}

const TYPE_META: Record<string, { label: string; icon: typeof Brain }> = {
  semantic: { label: 'Wissen', icon: Brain },
  episodic: { label: 'Episode', icon: Clock },
  procedural: { label: 'Ablauf', icon: Zap },
};

export const MemoryCard = memo(function MemoryCard({ memory, onClick, score, matchedTerms }: MemoryCardProps) {
  const pct = typeof score === "number" ? Math.round(score * 100) : null;
  const now = Date.now();
  const expired = memory.validTo != null && memory.validTo < now;
  const superseded = !!memory.supersededBy;
  const meta = memory.type ? TYPE_META[memory.type] : undefined;
  const typeLabel = meta?.label ?? null;
  const TypeIcon = meta?.icon;
  const typeColor = memory.type ? `var(--type-${memory.type})` : null;

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      onClick={onClick}
      className="card p-4 cursor-pointer grid grid-rows-[auto_1fr_auto] h-52 overflow-hidden group relative rounded-xl"
    >
      {/* Typ-Lichtkante oben: die Karte „färbt“ sich nach Knotentyp */}
      {typeColor && (
        <span
          aria-hidden
          className="absolute top-0 left-4 right-4 h-px"
          style={{ background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${typeColor} 55%, transparent), transparent)` }}
        />
      )}

      {/* Kopfzeile: Typ + Status */}
      <div className="flex items-center gap-2 mb-2.5 min-w-0">
        {typeLabel && (
          <span
            className="badge-type !gap-1 !py-0.5"
            style={{ color: typeColor ?? 'var(--text-2)', background: `color-mix(in srgb, ${typeColor} 10%, transparent)` }}
          >
            {TypeIcon && <TypeIcon className="w-3 h-3" />}
            {typeLabel}
          </span>
        )}
        {(expired || superseded) && (
          <span
            className="badge-type"
            style={{ color: 'var(--warn)', background: 'var(--warn-soft)' }}
            title={superseded ? 'Durch eine neuere Erinnerung ersetzt' : 'Gültigkeit abgelaufen'}
          >
            {superseded ? 'ERSETZT' : 'ABGELAUFEN'}
          </span>
        )}
        {pct !== null && (
          <span
            className="ml-auto inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium tnum chip"
            title={matchedTerms?.length ? `Getroffene Begriffe: ${matchedTerms.slice(0, 4).join(', ')}` : undefined}
          >
            {pct}%
          </span>
        )}
      </div>

      {/* Inhalt */}
      <div className="min-h-0 overflow-hidden">
        <h3 className="font-semibold leading-snug line-clamp-2 text-[14.5px] tracking-[-0.01em] text-[var(--text-1)]">
          {memory.title || 'Ohne Titel'}
        </h3>
        <p className="text-[13px] line-clamp-3 leading-[1.55] mt-1.5 text-[var(--text-2)]">
          {memory.content}
        </p>
      </div>

      {/* Fußzeile: Tags + Treffer-Begriffe + Zeit */}
      <div className="self-end pt-3 flex items-center justify-between gap-3 min-w-0">
        <div className="flex flex-nowrap gap-1.5 min-w-0 overflow-hidden">
          {memory.tags.slice(0, 3).map(tag => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium border shrink-0 max-w-[110px]"
              style={{ color: 'var(--text-2)', background: 'var(--bg-inset)', borderColor: 'var(--border-subtle)' }}
            >
              <Hash className="w-2.5 h-2.5 opacity-50 shrink-0" />
              <span className="truncate">{tag}</span>
            </span>
          ))}
          {memory.tags.length > 3 && (
            <span className="text-[11px] px-1 py-0.5 shrink-0 tnum" style={{ color: 'var(--text-3)' }}>+{memory.tags.length - 3}</span>
          )}
          {pct !== null && matchedTerms && matchedTerms.length > 0 && (
            <span className="text-[11px] truncate max-w-[130px] shrink-0" style={{ color: 'var(--text-3)' }}>
              {matchedTerms.slice(0, 2).join(', ')}
            </span>
          )}
        </div>
        <span className="text-[11px] shrink-0 whitespace-nowrap tnum" style={{ color: 'var(--text-3)' }}>
          {formatDistanceToNow(new Date(memory.updatedAt), { addSuffix: true, locale: de })}
        </span>
      </div>
    </motion.div>
  );
});
