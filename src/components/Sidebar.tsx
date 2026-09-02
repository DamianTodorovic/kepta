import { Hash, MessageSquare, Settings as SettingsIcon, Database, Moon, Sun, PanelLeftClose, Network } from 'lucide-react';
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
}

export function Sidebar({ tags, selectedTags, onSelectTag, onClearTags, currentView, onNavigate, totalMemories, isFocusMode, toggleFocusMode }: SidebarProps) {
  const { user } = useAuth();
  const { isDark, toggle: toggleTheme } = useTheme();

  const navItems = [
    { id: 'memories' as const, label: 'Wissen', icon: Database },
    { id: 'chat' as const, label: 'Chat', icon: MessageSquare },
    { id: 'graph' as const, label: 'Graph', icon: Network },
    { id: 'settings' as const, label: 'Einstellungen', icon: SettingsIcon },
  ];

  return (
    <div className={cn(
      "flex flex-col h-full shrink-0 transition-all duration-300 border-r",
      isFocusMode ? "w-0 overflow-hidden border-none" : "w-60"
    )} style={{ background: 'var(--bg-panel)', borderColor: 'var(--border-subtle)' }}>
      <div className="h-[60px] px-4 flex items-center gap-2.5 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <KeptaMark size={26} radius={7} />
        <div className="min-w-0">
          <div className="font-semibold tracking-[-0.02em] text-[13.5px] leading-none" style={{ color: 'var(--text-1)' }}>
            KEPTA
          </div>
          <div className="text-[11px] mt-1 tnum" style={{ color: 'var(--text-3)' }}>
            {totalMemories} {totalMemories === 1 ? 'Eintrag' : 'Einträge'}
          </div>
        </div>
      </div>

      <div className="px-2 py-3">
        <div className="space-y-0.5">
          {navItems.map(item => {
            const active = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13.5px] transition-colors text-left",
                )}
                style={{
                  background: active ? 'var(--accent-soft)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-2)',
                  fontWeight: active ? 590 : 480,
                }}
              >
                <item.icon className="w-4 h-4 shrink-0" style={{ color: active ? 'var(--accent)' : 'var(--text-3)' }} />
                <span className="flex-1">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {tags.length > 0 && (
        <div className="flex-1 min-h-0 px-2 py-2 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-2 mb-1.5">
            <span className="label-caps">Tags</span>
            {selectedTags.length > 0 && (
              <button onClick={onClearTags} className="text-[11px] hover:underline" style={{ color: 'var(--accent)' }}>Zurücksetzen</button>
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
                    background: active ? 'var(--bg-inset-strong)' : 'transparent',
                    color: active ? 'var(--text-1)' : 'var(--text-2)',
                  }}
                >
                  <Hash className="w-3.5 h-3.5 shrink-0 opacity-50" />
                  <span className="truncate flex-1">{name}</span>
                  {count !== null && count > 1 && (
                    <span className="text-[10.5px] tnum px-1.5 py-px rounded-md shrink-0" style={{ background: 'var(--bg-inset-strong)', color: 'var(--text-3)' }}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="p-2 space-y-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        {user && (
          <div className="px-2 py-2 rounded-lg flex items-center gap-2.5" style={{ background: 'var(--bg-inset)' }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
              {((user.displayName || user.email || 'L').slice(0,1).toUpperCase())}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] truncate font-medium" style={{ color: 'var(--text-1)' }}>{user.displayName || user.email || 'Lokal'}</div>
              <div className="text-[11px] truncate" style={{ color: 'var(--text-3)' }}>Lokal · privat</div>
            </div>
          </div>
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-[12px] font-medium"
            style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)', color: 'var(--text-2)' }}
            aria-label="Thema wechseln"
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isDark ? 'Hell' : 'Dunkel'}</span>
          </button>
          <button
            onClick={toggleFocusMode}
            className="w-8 h-8 flex items-center justify-center rounded-lg"
            style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)', color: 'var(--text-2)' }}
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
