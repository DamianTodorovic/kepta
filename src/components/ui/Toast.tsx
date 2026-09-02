// KEPTA Toast-System — Undo statt Bestätigungs-Dialoge.
// useToast().push({ message, kind?, action?: { label, onClick } })
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';

export interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
}

export interface ToastOptions {
  message: string;
  kind?: 'success' | 'info' | 'warn';
  action?: ToastAction;
  /** ms, default 4200 */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  push: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const ICONS = {
  success: CheckCircle2,
  info: Info,
  warn: AlertTriangle,
};

const ACCENTS = {
  success: 'var(--ok, #34d399)',
  info: 'var(--accent)',
  warn: '#e6aa00',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback((options: ToastOptions) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev.slice(-3), { ...options, id }]);
    const duration = options.duration ?? (options.action ? 6500 : 4200);
    timers.current.set(id, setTimeout(() => dismiss(id), duration));
  }, [dismiss]);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => {
            const Icon = ICONS[t.kind ?? 'info'];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ type: 'spring', damping: 24, stiffness: 320 }}
                className="pointer-events-auto flex items-center gap-3 pl-3.5 pr-2 py-2.5 rounded-xl min-w-[260px] max-w-sm glass-strong"
              >
                <Icon className="w-4 h-4 shrink-0" style={{ color: ACCENTS[t.kind ?? 'info'] }} />
                <span className="text-sm flex-1" style={{ color: 'var(--text-1)' }}>{t.message}</span>
                {t.action && (
                  <button
                    onClick={() => { void t.action!.onClick(); dismiss(t.id); }}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors hover:opacity-80 shrink-0"
                    style={{ color: 'var(--accent)', background: 'var(--accent-soft)' }}
                  >
                    {t.action.label}
                  </button>
                )}
                <button
                  onClick={() => dismiss(t.id)}
                  className="p-1 rounded-md opacity-40 hover:opacity-80 transition-opacity shrink-0"
                  style={{ color: 'var(--text-2)' }}
                  aria-label="Schließen"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast muss innerhalb von ToastProvider verwendet werden');
  return ctx;
}
