import { Hash, ChatCircle as MessageSquare, GearSix as SettingsIcon, Brain, Moon, Sun, SidebarSimple as PanelLeftClose, Graph as Network, Sparkle as Sparkles } from "@phosphor-icons/react";
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { cn } from '../lib/utils';
import { KeptaMark } from './KeptaMark';

interface SidebarProps {
  tags: ({ tag: string; count: number })[];
  selectedTags: string[];
  onSelectTag: (tag: string) => void;
  onClearTags: () => void;
  currentView: 'memories' | 'chat' | 'settings' | 'graph';
  onNavigate: (view: 'memories' | 'chat' | 'settings' | 'graph') => void;
  totalMemories: number;
  isFocusMode: boolean;
  toggleFocusMode: () => void;
  /** Ersteinrichtung noch nicht abgeschlossen → dezentes Setup-Icon in der Fußzeile */
  showSetup?: boolean;
  onOpenSetup?: () => void;
}

/* Die Sidebar ist bewusst IMMER dunkel (wie bei Slack/Linear) — sie bildet
   den Kontrast-Rahmen um die Inhaltsfläche und macht die App sofort
   wiedererkennbar, unabhängig vom Theme. */
const SIDEBAR_BG = 'linear-gradient(180deg, rgba(17, 20, 31, 0.94), rgba(10, 12, 19, 0.97))';
const TEXT_STRONG = '#eef0f8';
const TEXT_MUTED = 'rgba(226, 229, 242, 0.55)';
const TEXT_FAINT = 'rgba(226, 229, 242, 0.34)';
const LINE = 'rgba(255, 255, 255, 0.07)';
const SURFACE = 'rgba(255, 255, 255, 0.055)';
const SURFACE_STRONG = 'rgba(255, 255, 255, 0.10)';
const ACCENT_LIGHT = '#a5b4f5';

export function Sidebar({ tags, selectedTags, onSelectTag, onClearTags, currentView, onNavigate, totalMemories, isFocusMode, toggleFocusMode, showSetup, onOpenSetup }: SidebarProps) {
  const { user } = useAuth();
  const { isDark, toggle: toggleTheme } = useTheme();

  const navItems = [
    // Wissen = Gehirn (Outline, wie vom Nutzer vorgegeben) statt Datenbank-Zylinder
    { id: 'memories' as const, label: 'Wissen', icon: Brain, weight: 'regular' as const },
    { id: 'chat' as const, label: 'Chat', icon: MessageSquare },
    { id: 'graph' as const, label: 'Graph', icon: Network },
    { id: 'settings' as const, label: 'Einstellungen', icon: SettingsIcon },
  ];

  return (
    <div className={cn(
      "flex flex-col h-full shrink-0 transition-all duration-300",
      isFocusMode ? "w-0 overflow-hidden border-none" : "w-64"
    )} style={{ background: SIDEBAR_BG, backdropFilter: 'blur(24px) saturate(1.4)', WebkitBackdropFilter: 'blur(24px) saturate(1.4)', borderRight: `1px solid ${LINE}` }}>
      {/* Marke */}
      <div className="h-[64px] px-4 flex items-center gap-2.5 shrink-0" style={{ borderBottom: `1px solid ${LINE}` }}>
        <KeptaMark size={26} radius={7} />
        <div className="min-w-0">
          <div className="font-semibold tracking-[-0.02em] text-[13.5px] leading-none" style={{ color: TEXT_STRONG }}>
            KEPTA
          </div>
          <div className="text-[11px] mt-1 tnum" style={{ color: TEXT_FAINT }}>
            {totalMemories} {totalMemories === 1 ? 'Eintrag' : 'Einträge'}
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
                className="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13.5px] transition-colors text-left"
                style={{
                  background: active ? 'rgba(123, 146, 236, 0.17)' : 'transparent',
                  color: active ? ACCENT_LIGHT : TEXT_MUTED,
                  fontWeight: active ? 600 : 490,
                  boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.08)' : undefined,
                }}
              >
                <item.icon className="w-4 h-4 shrink-0" weight={item.weight ?? 'duotone'} style={{ color: active ? ACCENT_LIGHT : TEXT_FAINT }} />
                <span className="flex-1">{item.label}</span>
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
              <button onClick={onClearTags} className="text-[11px] hover:underline" style={{ color: ACCENT_LIGHT }}>Zurücksetzen</button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto space-y-px pr-1">
            {tags.slice(0, 40).map(tag => {
              const name = typeof tag === 'string' ? tag : tag.tag;
              const count = typeof tag === 'string' ? null : tag.count;
              const active = selectedTags.includes(name);
              return (
                <button
                  key={name}
                  onClick={() => onSelectTag(name)}
                  className="w-full flex items-center gap-2 px-2 py-[5px] rounded-md text-[13px] text-left transition-colors"
                  style={{
                    background: active ? SURFACE_STRONG : 'transparent',
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
          </div>
        </div>
      )}

      {/* Fußzeile */}
      <div className="p-2.5 space-y-2" style={{ borderTop: `1px solid ${LINE}` }}>
        {user && (
          <div className="px-2 py-2 rounded-lg flex items-center gap-2.5" style={{ background: SURFACE }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold" style={{ background: 'linear-gradient(180deg, rgba(123,146,236,0.95), rgba(90,110,210,0.95))', color: '#0c0e15' }}>
              {((user.displayName || user.email || 'L').slice(0, 1).toUpperCase())}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] truncate font-medium" style={{ color: TEXT_STRONG }}>{user.displayName || user.email || 'Lokal'}</div>
              <div className="text-[11px] truncate" style={{ color: TEXT_FAINT }}>Lokal · privat</div>
            </div>
          </div>
        )}
        <div className="flex items-center gap-1">
          {showSetup && onOpenSetup && (
            <button
              onClick={onOpenSetup}
              className="w-8 h-8 flex items-center justify-center rounded-lg shrink-0"
              style={{ background: 'rgba(123, 146, 236, 0.17)', border: '1px solid rgba(123, 146, 236, 0.3)', color: ACCENT_LIGHT }}
              aria-label="Einrichtung öffnen"
              title="Einrichtung öffnen"
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={toggleTheme}
            className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-[12px] font-medium"
            style={{ background: SURFACE, border: `1px solid ${LINE}`, color: TEXT_MUTED }}
            aria-label="Thema wechseln"
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isDark ? 'Hell' : 'Dunkel'}</span>
          </button>
          <button
            onClick={toggleFocusMode}
            className="w-8 h-8 flex items-center justify-center rounded-lg"
            style={{ background: SURFACE, border: `1px solid ${LINE}`, color: TEXT_MUTED }}
            aria-label="Fokus"
            title="Seitenleiste ausblenden"
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
