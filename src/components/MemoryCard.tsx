import { memo } from 'react';
import { cn } from '../lib/utils';
import { Memory } from '../types';
import { Hash, FileText, ExternalLink, Lock } from "../lib/icons";
import { inhaltOhneQuelle, oeffneQuelle, parseChunkTitel, parseQuelle } from '../lib/quelle';
import { gruppenVonNotiz, THEMA_HINWEISE, THEMA_LABELS, TRAEGER_HINWEISE, TRAEGER_LABELS } from '../lib/graphHierarchy';
import { spurChip } from '../lib/spuren';
import { kurzeZeit, typFarbe } from '../lib/zeit';
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
  /**
   * P202, Mockup-Grammatik: die geöffnete Akte ist die aktive Zeile — grün
   * getönt, Titel in Akzent, Kante links (`.row-entry.aktiv`).
   */
  aktiv?: boolean;
}

export const MemoryCard = memo(function MemoryCard({ memory, onClick, score, matchedTerms, herkunft, aktiv = false }: MemoryCardProps) {
  const toast = useToast();
  const pct = typeof score === "number" ? Math.round(score * 100) : null;
  const now = Date.now();
  const expired = memory.validTo != null && memory.validTo < now;
  const superseded = !!memory.supersededBy;
  // P196b: der Punkt trägt den Roh-Ton (`--type-X`); die abgeleitete Fassung
  // (`--type-X-text`) bleibt für die SCHRIFT reserviert.
  const typeColor = memory.type ? `var(--type-${memory.type})` : typFarbe(memory.type);
  // Zeile 1 — was der Nutzer auf der Karte liest.
  const gruppe = gruppenVonNotiz(memory);
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
      className={cn("row-entry cursor-pointer group relative", aktiv && "aktiv")}
    >
      {/* Der Art-Punkt (Mockup .zeile-item .punkt): 8×8 mit Radius 3 in der
          Art-Farbe — die Art ist auf der Zeile SEHBAR, mit derselben Auskunft
          im Schwebetext wie vorher die Pille. */}
      <span
        aria-hidden
        className="row-punkt"
        style={{ background: typeColor }}
        title={`${TRAEGER_LABELS[gruppe.traeger]} — ${TRAEGER_HINWEISE[gruppe.traeger]}`}
      />

      {/* Die Akte selbst: Titel in Sans in EINER Zeile, darunter der Text */}
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

      {/* Register-Meta rechts: kurze Zeit und Herkunft (Mockup .rechts .zeit +
          .herkunft), die Treffer-Auskunft bei Suche */}
      <div className="row-meta">
        {pct !== null && (
          <span
            className="row-pct tnum"
            title={matchedTerms?.length ? `Matched terms: ${matchedTerms.slice(0, 4).join(', ')}` : undefined}
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
        <span className="row-time tnum">{kurzeZeit(memory.updatedAt)}</span>
        {/* Die Herkunft als eigenes Glied (Mockup: „md file“, „Claude Code“, „MCP“). */}
        {quelle && (
          <span className="row-herkunft" title={quelle.pfad ?? quelle.url ?? quelle.name}>
            {quelle.art === "datei"
              ? (quelle.dateiTyp && quelle.dateiTyp.length <= 6 ? `${quelle.dateiTyp} file` : "file")
              : quelle.art === "url"
                ? quelle.name
                : "inbox"}
          </span>
        )}
        {chunk && !quelle && <span className="row-herkunft">{chunk.von} parts</span>}
      </div>
    </div>
  );
});
