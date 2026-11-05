import { useState } from 'react';
import { Brain } from "../lib/icons";
import { Hash, MessageSquare, SettingsIcon, Moon, Sun, PanelLeftClose, Network, Sparkles, Clock, FileText, Bot, User } from "../lib/icons";
import { useTheme } from '../contexts/ThemeContext';
import { cn } from '../lib/utils';
import { KeptaMark } from './KeptaMark';
import { t } from '../lib/uiText';

export type Ansicht = 'memories' | 'today' | 'chat' | 'graph' | 'dossier' | 'activity' | 'team' | 'settings';

interface SidebarProps {
  tags: ({ tag: string; count: number })[];
  selectedTags: string[];
  onSelectTag: (tag: string) => void;
  onClearTags: () => void;
  currentView: Ansicht;
  onNavigate: (view: Ansicht) => void;
  totalMemories: number;
  /** Setzt die Fläche, wenn die Tür mehr hält, als die Seite bringt. */
  tagsAusLadung?: number | null;
  /** An AI app used K3PTA in the last minutes — a green dot on „Activity“. */
  appsLive?: boolean;
  /**
   * Eine Organisation hat Rollen gesetzt (managed-settings.json) — nur dann
   * führt der Weg zu Team. Ohne Rollen-Datei gäbe es eine Sackgasse.
   */
  teamVisible?: boolean;
  isFocusMode: boolean;
  toggleFocusMode: () => void;
  /** Ersteinrichtung noch nicht abgeschlossen → dezentes Setup-Icon in der Fußzeile */
  showSetup?: boolean;
  onOpenSetup?: () => void;
}

/* Die Sidebar ist bewusst IMMER dunkel (wie bei Slack/Linear) — sie bildet
   den Kontrast-Rahmen um die Inhaltsfläche und macht die App sofort
   wiedererkennbar, unabhängig vom Theme. Materie liegt in .sidebar-glass.
   Alle Werte dazu stehen in ./huelle.css unter .seiten-leiste. Vorher standen
   sie als sechs Konstanten und siebzehn Inline-Stilen hier — gegen eine
   Inline-Farbe gewinnt kein Thema und keine Increased-Contrast-Regel, und die
   active Beschriftung zeigte im hellen Thema dasselbe #c04a39 wie im dunklen,
   während ihre eigene Registerlasche längst var(--accent) zog (D1-06, Z-13). */
/** So viele Tags stehen sofort da; der Rest kommt auf Wunsch. */
const TAGS_SICHTBAR = 40;

export function Sidebar({ tags, selectedTags, onSelectTag, onClearTags, currentView, onNavigate, totalMemories, tagsAusLadung, appsLive, teamVisible, isFocusMode, toggleFocusMode, showSetup, onOpenSetup }: SidebarProps) {
  const { isDark, toggle: toggleTheme } = useTheme();
  // Die Liste war hart auf 40 geschnitten — ohne ein Wort darueber. Wer viel
  // Wissen hat, sah den Rest schlicht nicht und konnte ihn auch nicht suchen.
  // Dieselbe Sorte stiller Deckel wie frueher bei der Trefferzahl.
  const [alleTags, setAlleTags] = useState(false);
  const sichtbareTags = alleTags ? tags : tags.slice(0, TAGS_SICHTBAR);
  const versteckteTags = tags.length - sichtbareTags.length;

  const navItems = [
    // Punkt 7: jedes Etikett tragt einen Satz, der sein eignes Wort nennt — die
    // Messung (scripts/wortschatz-zaehlen.mjs) zaehlt einen Satz nur dann als
    // Erklaerung, wenn er das Fachwort selbst ausspricht. Ein Satz drumherum erklaert
    // das Wort nicht. Wissen = Gehirn (Outline, wie vom Nutzer vorgegeben) statt
    // Datenbank-Zylinder
    { id: 'memories' as const, label: t('nav.knowledge'), icon: Brain, weight: 'regular' as const, erklaerung: 'Knowledge is everything you have saved, ready to search and reuse' },
    { id: 'today' as const, label: t('nav.today'), icon: Clock, erklaerung: 'Today shows what changed in your notes, and what is still open' },
    { id: 'chat' as const, label: t('nav.chat'), icon: MessageSquare, erklaerung: 'Chat asks your own notes a question and answers with its sources named' },
    { id: 'graph' as const, label: t('nav.graph'), icon: Network, erklaerung: 'Graph shows which of your notes talk about the same people and topics — open it to follow a link' },
    { id: 'dossier' as const, label: t('nav.dossier'), icon: FileText, erklaerung: 'A Dossier is a written brief on one subject, built from the notes you saved' },
    { id: 'activity' as const, label: t('nav.activity'), icon: Bot, erklaerung: 'Activity lists every thing K3PTA did on its own, with the time it happened' },
    // Team nur, wenn eine Organisation Rollen gesetzt hat — sonst wäre der
    // Punkt eine Sackgasse.
    ...(teamVisible ? [{ id: 'team' as const, label: t('nav.team'), icon: User, erklaerung: 'Team lists who else can reach this knowledge base, and what they may do' }] : []),
    { id: 'settings' as const, label: t('nav.settings'), icon: SettingsIcon, erklaerung: 'Settings is where you change how K3PTA reads, stores and connects to other programs' },
  ];

  return (
    <div className={cn(
      "sidebar-glass seiten-leiste flex flex-col h-full shrink-0 transition-[width] duration-300",
      isFocusMode ? "w-0 overflow-hidden border-none" : "w-64"
    )}
      // w-0 versteckt nur die Farbe: die 13 Knöpfe der Leiste blieben im Tab-Weg
      // und waren bei 390 px nicht zu treffen. Gemessen 18.10. mit der Tastatur
      // (tastatur.mjs): 13 von 16 Tab-Schritten fielen auf Knöpfe bei x = -22.
      inert={isFocusMode}
      aria-hidden={isFocusMode}
    >
      {/* Marke */}
      <div className="seiten-kante-unten h-[64px] px-4 flex items-center gap-2 shrink-0">
        <KeptaMark size={26} />
        <div className="min-w-0">
          <div className="seiten-marke font-semibold tracking-[-0.02em] text-[13.5px] leading-none">
            K3PTA
          </div>
          <div className="seiten-zahl text-[11px] mt-1 tnum">
            {totalMemories.toLocaleString('en-GB')} {totalMemories === 1 ? 'note' : 'notes'}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="px-3 py-3">
        <div className="space-y-1">
          {navItems.map(item => {
            const active = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                data-active={active}
                title={item.erklaerung}
                className={cn(
                  "sidebar-nav-btn w-full min-h-9 flex items-center gap-2 px-3 py-2 text-[13.5px] text-left",
                  active ? "font-semibold" : "font-medium"
                )}
              >
                <item.icon className="seiten-ikone w-4 h-4 shrink-0" weight={item.weight ?? 'duotone'} />
                <span className="flex-1">{item.label}</span>
                {item.id === 'activity' && appsLive && (
                  <span aria-hidden title="An AI app is using K3PTA right now" data-testid="apps-live" className="seiten-punkt w-1.5 h-1.5 rounded-full animate-pulse shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex-1 min-h-0 px-3 py-2 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="seiten-kopf text-[10.5px] font-semibold tracking-[0.09em] uppercase">Tags</span>
            {selectedTags.length > 0 && (
              <button onClick={onClearTags} className="seiten-handlung min-h-6 text-[11px]">Reset</button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto space-y-px pr-1">
            {sichtbareTags.map(tag => {
              const name = typeof tag === 'string' ? tag : tag.tag;
              const count = typeof tag === 'string' ? null : tag.count;
              const active = selectedTags.includes(name);
              return (
                <button
                  key={name}
                  onClick={() => onSelectTag(name)}
                  data-active={active}
                  className="sidebar-tag-btn w-full min-h-7 flex items-center gap-2 px-2 py-[5px] text-[13px] text-left"
                >
                  <Hash className="seiten-ikone w-3.5 h-3.5 shrink-0" />
                  <span className="truncate flex-1">{name}</span>
                  {count !== null && count > 1 && (
                    <span className="seiten-plakette text-[10.5px] tnum px-2 py-px rounded-md shrink-0">{count}</span>
                  )}
                </button>
              );
            })}
            {versteckteTags > 0 && (
              <button
                onClick={() => setAlleTags(true)}
                className="seiten-handlung w-full min-h-7 text-left px-2 py-[5px] rounded-md text-[12px]"
              >
                {versteckteTags} more…
              </button>
            )}
            {alleTags && tags.length > TAGS_SICHTBAR && (
              <button
                onClick={() => setAlleTags(false)}
                className="seiten-zahl w-full min-h-7 text-left px-2 py-[5px] rounded-md text-[12px]"
              >
                Show fewer
              </button>
            )}
            {/* Die Zählung neben jedem Tag kann nur zählen, was liegt. Ohne diese
                Zeile wäre „bestand 25" eine Behauptung über 250. */}
            {typeof tagsAusLadung === 'number' && tagsAusLadung > 0 && (
              <div className="seiten-erklarung px-2 pt-2 pb-1 text-[11px] leading-snug">
                counts cover the {tagsAusLadung.toLocaleString('en-GB')} loaded notes
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fußzeile */}
      <div className="seiten-kante-oben p-3 space-y-2">
        <div className="seiten-flaeche px-2 py-2 rounded-lg flex items-center gap-2">
          <KeptaMark size={24} />
          <div className="min-w-0 flex-1">
            <div className="seiten-marke text-[12.5px] truncate font-semibold tracking-[0.01em]">
              {/* Branding 3.1.1: schlicht K3PTA — keine Stufen-Anzeige mehr.
                  Seit 09.10.2026 sagt auch die zweite Zeile nichts über Grenzen,
                  weil es sie nicht mehr gibt: die App läuft unbegrenzt.
                  Die Versionszahl steht bewusst NICHT in der Sidebar (Damian, 25.9.) —
                  sie bleibt über Systemstatus und /api/health abrufbar. */}
              {'K3PTA'}
            </div>
            <div className="seiten-erklarung text-[11px] truncate">
              {/* Vorher: „local · private · encrypted". Die App hat im selben
                  Fenster einen Zustand dafür — die Chip-Leiste meldet
                  „Not encrypted", gemessen am selben Lauf (e3-screens/
                  vorher-dark-1440px-erststart.png). Eine Marke behauptet
                  keinen Zustand, den ein Statusfeld neben ihr misst. */}
              local · private
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {showSetup && onOpenSetup && (
            <button
              onClick={onOpenSetup}
              className="seiten-knopf-einrichten w-9 h-9 flex items-center justify-center rounded-lg shrink-0"
              aria-label="Open setup"
              title="Open setup"
            >
              <Sparkles className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={toggleTheme}
            className="seiten-knopf flex-1 h-9 flex items-center justify-center gap-2 rounded-lg text-[12px] font-medium"
            aria-label="Switch theme"
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isDark ? 'Light' : 'Dark'}</span>
          </button>
          <button
            onClick={toggleFocusMode}
            className="seiten-knopf w-9 h-9 flex items-center justify-center rounded-lg"
            aria-label="Focus mode"
            title="Hide sidebar"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
