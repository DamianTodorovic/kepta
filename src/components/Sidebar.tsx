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
  /** An AI app used KEPTA in the last minutes — a green dot on „Activity“. */
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
   Onyx-Palette: warm-weißer Text, Champagner-Akzent, neutrale Flächen. */
const TEXT_STRONG = '#eaeae8';
const TEXT_MUTED = 'rgba(235, 235, 232, 0.55)';
const TEXT_FAINT = 'rgba(235, 235, 232, 0.34)';
const LINE = 'rgba(255, 255, 255, 0.07)';
const SURFACE = 'rgba(255, 255, 255, 0.05)';
const ACCENT_LIGHT = '#c04a39';
/** So viele Tags stehen sofort da; der Rest kommt auf Wunsch. */
const TAGS_SICHTBAR = 40;

export function Sidebar({ tags, selectedTags, onSelectTag, onClearTags, currentView, onNavigate, totalMemories, appsLive, teamVisible, isFocusMode, toggleFocusMode, showSetup, onOpenSetup }: SidebarProps) {
  const { isDark, toggle: toggleTheme } = useTheme();
  // Die Liste war hart auf 40 geschnitten — ohne ein Wort darueber. Wer viel
  // Wissen hat, sah den Rest schlicht nicht und konnte ihn auch nicht suchen.
  // Dieselbe Sorte stiller Deckel wie frueher bei der Trefferzahl.
  const [alleTags, setAlleTags] = useState(false);
  const sichtbareTags = alleTags ? tags : tags.slice(0, TAGS_SICHTBAR);
  const versteckteTags = tags.length - sichtbareTags.length;

  const navItems = [
    // Wissen = Gehirn (Outline, wie vom Nutzer vorgegeben) statt Datenbank-Zylinder
    { id: 'memories' as const, label: t('nav.knowledge'), icon: Brain, weight: 'regular' as const },
    { id: 'today' as const, label: t('nav.today'), icon: Clock },
    { id: 'chat' as const, label: t('nav.chat'), icon: MessageSquare },
    { id: 'graph' as const, label: t('nav.graph'), icon: Network },
    { id: 'dossier' as const, label: t('nav.dossier'), icon: FileText },
    { id: 'activity' as const, label: t('nav.activity'), icon: Bot },
    // Team nur, wenn eine Organisation Rollen gesetzt hat — sonst wäre der
    // Punkt eine Sackgasse.
    ...(teamVisible ? [{ id: 'team' as const, label: t('nav.team'), icon: User }] : []),
    { id: 'settings' as const, label: t('nav.settings'), icon: SettingsIcon },
  ];

  return (
    <div className={cn(
      "sidebar-glass flex flex-col h-full shrink-0 transition-[width] duration-300",
      isFocusMode ? "w-0 overflow-hidden border-none" : "w-64"
    )}>
      {/* Marke */}
      <div className="h-[64px] px-4 flex items-center gap-2.5 shrink-0" style={{ borderBottom: `1px solid ${LINE}` }}>
        <KeptaMark size={26} radius={7} />
        <div className="min-w-0">
          <div className="font-semibold tracking-[-0.02em] text-[13.5px] leading-none" style={{ color: TEXT_STRONG }}>
            KEPTA
          </div>
          <div className="text-[11px] mt-1 tnum" style={{ color: TEXT_FAINT }}>
            {totalMemories} {totalMemories === 1 ? 'entry' : 'entries'}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="px-2.5 py-3">
        <div className="space-y-0.5">
          {navItems.map(item => {
            const active = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                data-active={active}
                className="sidebar-nav-btn w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13.5px] text-left"
                style={{
                  color: active ? ACCENT_LIGHT : TEXT_MUTED,
                  fontWeight: active ? 600 : 490,
                }}
              >
                <item.icon className="w-4 h-4 shrink-0" weight={item.weight ?? 'duotone'} style={{ color: active ? ACCENT_LIGHT : TEXT_FAINT }} />
                <span className="flex-1">{item.label}</span>
                {item.id === 'activity' && appsLive && (
                  <span aria-hidden title="An AI app is using KEPTA right now" data-testid="apps-live" className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: '#7fb08a' }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex-1 min-h-0 px-2.5 py-2 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-2 mb-1.5">
            <span className="text-[10.5px] font-semibold tracking-[0.09em] uppercase" style={{ color: TEXT_FAINT }}>Tags</span>
            {selectedTags.length > 0 && (
              <button onClick={onClearTags} className="text-[11px] hover:underline" style={{ color: ACCENT_LIGHT }}>Reset</button>
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
                  className="sidebar-tag-btn w-full flex items-center gap-2 px-2 py-[5px] rounded-md text-[13px] text-left"
                  style={{
                    color: active ? TEXT_STRONG : TEXT_MUTED,
                  }}
                >
                  <Hash className="w-3.5 h-3.5 shrink-0" style={{ color: TEXT_FAINT }} />
                  <span className="truncate flex-1">{name}</span>
                  {count !== null && count > 1 && (
                    <span className="text-[10.5px] tnum px-1.5 py-px rounded-md shrink-0" style={{ background: SURFACE, color: TEXT_FAINT }}>{count}</span>
                  )}
                </button>
              );
            })}
            {versteckteTags > 0 && (
              <button
                onClick={() => setAlleTags(true)}
                className="w-full text-left px-2 py-[5px] rounded-md text-[12px]"
                style={{ color: ACCENT_LIGHT }}
              >
                {versteckteTags} more…
              </button>
            )}
            {alleTags && tags.length > TAGS_SICHTBAR && (
              <button
                onClick={() => setAlleTags(false)}
                className="w-full text-left px-2 py-[5px] rounded-md text-[12px]"
                style={{ color: TEXT_FAINT }}
              >
                Show fewer
              </button>
            )}
          </div>
        </div>
      )}

      {/* Fußzeile */}
      <div className="p-2.5 space-y-2" style={{ borderTop: `1px solid ${LINE}` }}>
        <div
          className="px-2 py-2 rounded-lg flex items-center gap-2.5"
          style={{ background: SURFACE, border: '1px solid rgba(255, 255, 255, 0.04)' }}
        >
          <KeptaMark size={24} radius={6} />
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] truncate font-semibold tracking-[0.01em]" style={{ color: TEXT_STRONG }}>
              {/* Branding 3.1.1: schlicht KEPTA — keine Stufen-Anzeige mehr.
                  Seit 09.10.2026 sagt auch die zweite Zeile nichts über Grenzen,
                  weil es sie nicht mehr gibt: die App läuft unbegrenzt.
                  Die Versionszahl steht bewusst NICHT in der Sidebar (Damian, 25.9.) —
                  sie bleibt über Systemstatus und /api/health abrufbar. */}
              {'KEPTA'}
            </div>
            <div className="text-[11px] truncate" style={{ color: TEXT_FAINT }} title="local · private · encrypted">
              local · private · encrypted
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {showSetup && onOpenSetup && (
            <button
              onClick={onOpenSetup}
              className="w-8 h-8 flex items-center justify-center rounded-lg shrink-0"
              style={{ background: 'rgba(192, 74, 57, 0.12)', border: '1px solid rgba(192, 74, 57, 0.3)', color: ACCENT_LIGHT }}
              aria-label="Open setup"
              title="Open setup"
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={toggleTheme}
            className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-[12px] font-medium"
            style={{ background: SURFACE, border: `1px solid ${LINE}`, color: TEXT_MUTED }}
            aria-label="Switch theme"
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isDark ? 'Light' : 'Dark'}</span>
          </button>
          <button
            onClick={toggleFocusMode}
            className="w-8 h-8 flex items-center justify-center rounded-lg"
            style={{ background: SURFACE, border: `1px solid ${LINE}`, color: TEXT_MUTED }}
            aria-label="Focus mode"
            title="Hide sidebar"
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
