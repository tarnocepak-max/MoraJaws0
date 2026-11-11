import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X, RefreshCw, Loader2 } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading' | 'sync';

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration: number; // in ms, 0 = persistent
  createdAt: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  showToast: (message: string, type?: ToastType, title?: string, duration?: number) => string;
  toast: {
    success: (message: string, title?: string, duration?: number) => string;
    error: (message: string, title?: string, duration?: number) => string;
    warning: (message: string, title?: string, duration?: number) => string;
    info: (message: string, title?: string, duration?: number) => string;
    loading: (message: string, title?: string, duration?: number) => string;
    sync: (message: string, title?: string, duration?: number) => string;
  };
  dismissToast: (id: string) => void;
  clearAllToasts: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Default durations per specification (Bagian 6)
const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 3000, // 3 detik
  info: 4000,    // 4 detik
  warning: 5000, // 5 detik
  error: 7000,   // 7 detik
  sync: 3500,    // 3.5 detik
  loading: 0     // persistent until manually dismissed or replaced
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Record<string, any>>({});
  const lastToastRef = useRef<{ message: string; type: string; timestamp: number } | null>(null);

  const dismissToast = useCallback((id: string) => {
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const clearAllToasts = useCallback(() => {
    Object.values(timersRef.current).forEach(t => clearTimeout(t));
    timersRef.current = {};
    setToasts([]);
  }, []);

  const showToast = useCallback((
    message: string,
    type: ToastType = 'info',
    title?: string,
    customDuration?: number
  ): string => {
    // Avoid rapid identical duplicate toasts within 1.2s
    const now = Date.now();
    if (
      lastToastRef.current &&
      lastToastRef.current.message === message &&
      lastToastRef.current.type === type &&
      now - lastToastRef.current.timestamp < 1200
    ) {
      return '';
    }
    lastToastRef.current = { message, type, timestamp: now };

    const duration = customDuration !== undefined ? customDuration : DEFAULT_DURATIONS[type];
    const id = `toast-${now}-${Math.random().toString(36).substring(2, 7)}`;
    const newToast: ToastItem = {
      id,
      type,
      title,
      message,
      duration,
      createdAt: now
    };

    // Maximum 3 active toasts (Bagian 6 requirement)
    setToasts(prev => [newToast, ...prev].slice(0, 3));

    if (duration > 0) {
      timersRef.current[id] = setTimeout(() => {
        dismissToast(id);
      }, duration);
    }

    return id;
  }, [dismissToast]);

  const toast = {
    success: useCallback((msg: string, title?: string, duration?: number) => showToast(msg, 'success', title, duration), [showToast]),
    error: useCallback((msg: string, title?: string, duration?: number) => showToast(msg, 'error', title, duration), [showToast]),
    warning: useCallback((msg: string, title?: string, duration?: number) => showToast(msg, 'warning', title, duration), [showToast]),
    info: useCallback((msg: string, title?: string, duration?: number) => showToast(msg, 'info', title, duration), [showToast]),
    loading: useCallback((msg: string, title?: string, duration?: number) => showToast(msg, 'loading', title, duration), [showToast]),
    sync: useCallback((msg: string, title?: string, duration?: number) => showToast(msg, 'sync', title, duration), [showToast])
  };

  return (
    <ToastContext.Provider value={{ toasts, showToast, toast, dismissToast, clearAllToasts }}>
      {children}

      {/* Floating Toast Container: Top on mobile Android, Top-Right on Desktop */}
      <div
        aria-live="polite"
        className="fixed top-3 left-3 right-3 sm:left-auto sm:right-5 sm:top-5 z-[99999] flex flex-col gap-2.5 max-w-sm sm:w-96 pointer-events-none"
      >
        {toasts.map(item => {
          // Type styles following Dark Purple Gloss + Lilac palette
          const borderGlow =
            item.type === 'success'
              ? 'border-emerald-400/40 shadow-[0_8px_24px_rgba(16,185,129,0.18)]'
              : item.type === 'error'
              ? 'border-rose-400/50 shadow-[0_8px_24px_rgba(244,63,94,0.22)]'
              : item.type === 'warning'
              ? 'border-amber-400/40 shadow-[0_8px_24px_rgba(245,158,11,0.18)]'
              : item.type === 'sync'
              ? 'border-[#D8B4FE]/60 shadow-[0_8px_24px_rgba(168,85,247,0.25)]'
              : item.type === 'loading'
              ? 'border-[#7135B5]/60 shadow-[0_8px_24px_rgba(113,53,181,0.2)]'
              : 'border-[#D8B4FE]/40 shadow-[0_8px_24px_rgba(113,53,181,0.18)]';

          const progressBg =
            item.type === 'success'
              ? 'bg-gradient-to-r from-emerald-400 to-[#D8B4FE]'
              : item.type === 'error'
              ? 'bg-gradient-to-r from-rose-500 to-[#D8B4FE]'
              : item.type === 'warning'
              ? 'bg-gradient-to-r from-amber-400 to-[#D8B4FE]'
              : 'bg-gradient-to-r from-[#7135B5] via-[#A855F7] to-[#D8B4FE]';

          return (
            <div
              key={item.id}
              role="status"
              className={`pointer-events-auto relative overflow-hidden rounded-xl border backdrop-blur-xl transition-all duration-300 animate-in slide-in-from-top-3 fade-in bg-[#160D29]/95 text-white ${borderGlow}`}
              style={{
                backgroundImage: 'radial-gradient(circle at 15% 20%, rgba(113, 53, 181, 0.28) 0%, rgba(22, 13, 41, 0.95) 100%)'
              }}
            >
              {/* Glossy Top Edge Highlight */}
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#D8B4FE]/60 to-transparent" />

              <div className="flex items-start gap-3 p-3.5 sm:p-4">
                {/* SVG Icon with 3D Glossy effect */}
                <div className="shrink-0 mt-0.5">
                  {item.type === 'success' && (
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.3)]">
                      <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                    </div>
                  )}
                  {item.type === 'error' && (
                    <div className="w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-400/30 flex items-center justify-center text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.3)]">
                      <AlertCircle className="w-4 h-4 text-rose-300" />
                    </div>
                  )}
                  {item.type === 'warning' && (
                    <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.3)]">
                      <AlertTriangle className="w-4 h-4 text-amber-300" />
                    </div>
                  )}
                  {item.type === 'info' && (
                    <div className="w-8 h-8 rounded-lg bg-[#7135B5]/25 border border-[#D8B4FE]/30 flex items-center justify-center text-[#D8B4FE] shadow-[0_0_12px_rgba(168,85,247,0.3)]">
                      <Info className="w-4 h-4 text-[#E9D5FF]" />
                    </div>
                  )}
                  {item.type === 'sync' && (
                    <div className="w-8 h-8 rounded-lg bg-[#7135B5]/30 border border-[#D8B4FE]/40 flex items-center justify-center text-[#D8B4FE] shadow-[0_0_14px_rgba(168,85,247,0.4)] animate-spin" style={{ animationDuration: '3s' }}>
                      <RefreshCw className="w-4 h-4 text-[#D8B4FE]" />
                    </div>
                  )}
                  {item.type === 'loading' && (
                    <div className="w-8 h-8 rounded-lg bg-[#35105E] border border-[#A855F7]/40 flex items-center justify-center text-[#D8B4FE] shadow-[0_0_14px_rgba(168,85,247,0.4)]">
                      <Loader2 className="w-4 h-4 text-[#D8B4FE] animate-spin" />
                    </div>
                  )}
                </div>

                {/* Toast Content */}
                <div className="flex-1 min-w-0 pr-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#D8B4FE]">
                      {item.type === 'sync' ? 'DATABASE SYNC' : item.type === 'loading' ? 'MORAJAWS' : 'MORAJAWS ALERT'}
                    </span>
                  </div>
                  {item.title && (
                    <div className="text-xs font-bold text-[#FFFFFF] leading-tight mt-0.5">
                      {item.title}
                    </div>
                  )}
                  <div className="text-[11.5px] text-[#E9D5FF]/90 mt-0.5 leading-snug break-words">
                    {item.message}
                  </div>
                </div>

                {/* Dismiss Button */}
                <button
                  type="button"
                  onClick={() => dismissToast(item.id)}
                  className="shrink-0 text-[#D8B4FE]/60 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors cursor-pointer"
                  aria-label="Tutup notifikasi"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Countdown Progress Bar (for toasts with duration) */}
              {item.duration > 0 && (
                <div className="h-[2.5px] w-full bg-white/10 overflow-hidden">
                  <div
                    className={`h-full ${progressBg}`}
                    style={{
                      animation: `morajaws-progress-countdown ${item.duration}ms linear forwards`
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
