import { memo } from 'react';
type IconWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
import { formatDistanceToNow } from 'date-fns';
import { Memory } from '../types';
import { Brain } from "../lib/icons";
import { Hash, Clock, Zap, FileText, ExternalLink, Lock } from "../lib/icons";
import { inhaltOhneQuelle, oeffneQuelle, parseChunkTitel, parseQuelle } from '../lib/quelle';
import { gruppenVonNotiz, THEMA_HINWEISE, THEMA_LABELS, TRAEGER_HINWEISE, TRAEGER_LABELS } from '../lib/graphHierarchy';
import { spurChip } from '../lib/spuren';
import { useToast } from './ui/Toast';

interface MemoryCardProps {
  memory: Memory;
  onClick: () => void;
  score?: number;
  matchedTerms?: string[];
  /**
   * Spuren-Herkunft aus der Server-Engine (Paket 2): an welcher Position sah
   * jedes Retrieval-Bein (BM25/Vektor/Graph) diesen Treffer. Fehlt das Feld,
   * stammen die Karten aus dem lokalen Sofort-Ranking — dann keine Badges.
   */
  herkunft?: { bm25: number | null; vektor: number | null; graph: number | null };
}

/**
 * Die vier Rechen-Arten: sie liefern Icon und Farbe (Token `--type-*`, hält E1).
 * Ihr NAME steht hier nicht mehr auf der Karte — was der Nutzer liest, ist der
 * Traeger aus Zeile 1 ("Notes · Files · Code"), siehe unten.
 */
const TYPE_META: Record<string, { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties; weight?: IconWeight }> }> = {
  semantic: { icon: Brain },
  episodic: { icon: Clock },
  reference: { icon: FileText },
  procedural: { icon: Zap },
};
export const MemoryCard = memo(function MemoryCard({ memory, onClick, score, matchedTerms, herkunft }: MemoryCardProps) {
  const toast = useToast();
  const pct = typeof score === "number" ? Math.round(score * 100) : null;
  const now = Date.now();
  const expired = memory.validTo != null && memory.validTo < now;
  const superseded = !!memory.supersededBy;
  const meta = memory.type ? TYPE_META[memory.type] : undefined;
  const TypeIcon = meta?.icon;
  // P196b: der Grat und die Flächen tragen den Roh-Ton (`--type-X`); die SCHRIFT
  // (Etikett) liest die abgeleitete Fassung (`--type-X-text`), dunkle Wahlen
  // bleiben also lesbar, ohne dass die Wahl selbst verändert wird.
  const typeColor = memory.type ? `var(--type-${memory.type})` : null;
  const typeText = memory.type ? `var(--type-${memory.type}-text, var(--type-${memory.type}))` : null;
  // Zeile 1 und 2 — was der Nutzer auf der Karte liest. Ein Lauf durch dieselben
  // Regeln wie in den Tests; Traeger und Themen sind ableitbar, nicht gespeichert.
  const gruppe = gruppenVonNotiz(memory);
  const traegerEtikett = TRAEGER_LABELS[gruppe.traeger];
  // Woher die Notiz stammt und ob sie Teil eines mehrteiligen Imports ist —
  // beides steht in Titel/Content (Konvention der Import-Wege).
  const quelle = parseQuelle(memory);
  const chunk = parseChunkTitel(memory.title);
  const lesetext = inhaltOhneQuelle(memory.content);

  return (
    // P199 (Emil-Audit §1+§5): die Layout-Feder der Karte flog — die
    // meistbediente Fläche der App (jeder Suchtakt, jeder Filter, jeder
    // Resize) schob bis zu 48 Karten auf dem Main-Thread um den Tisch.
    // Dichte Listen springen an ihren Platz (Linear/Notion-Stil); Farb- und
    // Drück-Quittungen bleiben.
    <div
      onClick={onClick}
      className="row-entry cursor-pointer group relative"
    >
      {/* Farbstreich links: der Typ färbt den Kartenrand */}
      {/* P197: 6 px statt 4 px — die Art-Farbe muss auf einen Blick sichtbar sein
          (Damian: „die Farben, die man einstellt, bleiben ja überall"). Die Kapsel
          malt dasselbe Bild wie 2 px, nennt aber eine Form statt eines Werts
          ausserhalb der Stufen. */}
      {typeColor && (
        <span
          aria-hidden
          className="row-grat absolute left-0 top-2 bottom-2 w-[6px]"
          style={{ background: `linear-gradient(180deg, ${typeColor}, color-mix(in srgb, ${typeColor} 30%, transparent))`, borderRadius: 999 }}
        />
      )}

      {/* Standarte: Glyph, Art-Farbe als weicher Chip, Wort aus Zeile 1 — die Art
          ist auf der Karte SEHBAR, nicht nur am Streifen (P197). */}
      <span
        className="row-type"
        style={{
          color: typeText ?? 'var(--text-2)',
          background: typeColor ? `color-mix(in srgb, ${typeColor} 14%, transparent)` : undefined,
          borderRadius: 999,
          paddingInline: 8,
          paddingBlock: 2,
        }}
        title={TRAEGER_HINWEISE[gruppe.traeger]}
      >
        {TypeIcon && <TypeIcon className="w-3.5 h-3.5 shrink-0" weight="duotone" />}
        <span className="row-type-label">{traegerEtikett}</span>
      </span>

      {/* Die Akte selbst: Titel in Serif, darunter der bereinigte Text */}
      <div className="row-body">
        <h3>{memory.title || 'Untitled'}</h3>
        <p>{lesetext || memory.content}</p>
        <div className="row-body-foot">
          {/* Zeile 2 — kombinierbare Themen, in Code keine. Maximal drei genannt,
              damit die Fusszeile bei 390 px nicht umbricht und der Quellknopf
              nicht von der Karte rutscht. */}
          {gruppe.themen.length > 0 && (
            <span className="row-quiet inline-flex items-center gap-1 min-w-0">
              {gruppe.themen.slice(0, 3).map((t) => (
                <span key={t} className="shrink-0" style={{ color: 'var(--text-2)' }} title={THEMA_HINWEISE[t]}>
                  {THEMA_LABELS[t]}
                </span>
              )).reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, <span key={`t${i}`}>·</span>, el] : [el]), [])}
              {gruppe.themen.length > 3 && <span>+{gruppe.themen.length - 3}</span>}
            </span>
          )}
          {herkunft && (herkunft.bm25 !== null || herkunft.vektor !== null || herkunft.graph !== null) && (
            <span className="row-quiet inline-flex items-center gap-1 tnum" title="Where the search found this note — rank in words, meaning, graph. Absent means unseen">
              <span>Found via</span>
              {herkunft.bm25 !== null && <span style={{ color: 'var(--accent)' }}>{spurChip('bm25')} #{herkunft.bm25 + 1}</span>}
              {herkunft.vektor !== null && <span style={{ color: 'var(--accent)' }}>{spurChip('vektor')} #{herkunft.vektor + 1}</span>}
              {herkunft.graph !== null && <span style={{ color: 'var(--accent)' }}>{spurChip('graph')} #{herkunft.graph + 1}</span>}
            </span>
          )}
          {chunk && (
            <span className="row-quiet tnum" title={`Part ${chunk.nr} of ${chunk.von} — the file came in as separate pieces`}>
              {chunk.nr}/{chunk.von}
            </span>
          )}
          {(expired || superseded) && (
            <span
              className="row-stamp"
              style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }}
              title={superseded ? 'Superseded by a newer memory' : 'Validity expired'}
            >
              {superseded ? 'SUPERSEDED' : 'EXPIRED'}
            </span>
          )}
          {memory.scope === 'private' && (
            <span className="row-quiet inline-flex items-center gap-1" title="Private — never shown to AI apps or cloud AI">
              <Lock className="w-3 h-3" /> Private
            </span>
          )}
          {quelle && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                const ok = await oeffneQuelle(quelle);
                if (!ok) {
                  toast.push({
                    message: quelle.art === 'url'
                      ? 'Link could not be opened.'
                      : 'File could not be opened — it may have moved or been deleted.',
                    kind: 'warn',
                  });
                }
              }}
              className="row-quiet hover:!border-[var(--accent)]"
              style={{ color: 'var(--text-2)' }}
              title={quelle.art === 'datei'
                ? `Open file: ${quelle.pfad}`
                : quelle.art === 'url'
                  ? `Open link: ${quelle.url}`
                  : `Imported from inbox: ${quelle.name}`}
            >
              {quelle.art === 'url'
                ? <ExternalLink className="w-2.5 h-2.5 opacity-60 shrink-0" />
                : <FileText className="w-2.5 h-2.5 opacity-60 shrink-0" />}
              <span className="truncate">{quelle.name}</span>
            </button>
          )}
        </div>
      </div>

      {/* Register-Meta rechts: Treffer, Tags, Alter */}
      <div className="row-meta">
        {pct !== null && (
          <span
            className="row-pct tnum"
            title={matchedTerms?.length ? `Getroffene Begriffe: ${matchedTerms.slice(0, 4).join(', ')}` : undefined}
          >
            {pct}%
          </span>
        )}
        <div className="row-tags">
          {memory.tags.slice(0, 3).map(tag => (
            <span key={tag} className="row-tag"><Hash className="w-2.5 h-2.5 opacity-50 shrink-0" />{tag}</span>
          ))}
          {memory.tags.length > 3 && (
            <span className="row-quiet tnum">+{memory.tags.length - 3}</span>
          )}
          {pct !== null && matchedTerms && matchedTerms.length > 0 && (
            <span className="row-quiet truncate max-w-[130px]">{matchedTerms.slice(0, 2).join(', ')}</span>
          )}
        </div>
        <span className="row-time tnum">{formatDistanceToNow(new Date(memory.updatedAt), { addSuffix: true })}</span>
      </div>
    </div>
  );
});
