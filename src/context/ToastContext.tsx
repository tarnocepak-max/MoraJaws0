import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  showToast: (message: string, type?: ToastType, title?: string, duration?: number) => string;
  toast: {
    success: (message: string, title?: string, duration?: number) => string;
    error: (message: string, title?: string, duration?: number) => string;
    warning: (message: string, title?: string, duration?: number) => string;
    info: (message: string, title?: string, duration?: number) => string;
  };
  dismissToast: (id: string) => void;
  clearAllToasts: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Record<string, any>>({});

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
    duration: number = 3800
  ): string => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newToast: ToastItem = { id, type, title, message, duration };

    setToasts(prev => [newToast, ...prev].slice(0, 5)); // Keep max 5 active toasts

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
    info: useCallback((msg: string, title?: string, duration?: number) => showToast(msg, 'info', title, duration), [showToast])
  };

  return (
    <ToastContext.Provider value={{ toasts, showToast, toast, dismissToast, clearAllToasts }}>
      {children}
      {/* Floating Toast Notification Container */}
      <div
        aria-live="polite"
        className="fixed top-4 right-4 z-[9999] flex flex-col gap-2.5 max-w-sm sm:max-w-md w-[calc(100%-2rem)] sm:w-auto pointer-events-none"
      >
        {toasts.map(item => (
          <div
            key={item.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 p-3.5 sm:p-4 rounded-xl border shadow-xl backdrop-blur-md transition-all duration-200 animate-in slide-in-from-top-3 fade-in ${
              item.type === 'success'
                ? 'bg-white/95 dark:bg-slate-900/95 border-emerald-300 dark:border-emerald-800 text-slate-800 dark:text-slate-100 shadow-emerald-500/10'
                : item.type === 'error'
                ? 'bg-white/95 dark:bg-slate-900/95 border-rose-300 dark:border-rose-800 text-slate-800 dark:text-slate-100 shadow-rose-500/10'
                : item.type === 'warning'
                ? 'bg-white/95 dark:bg-slate-900/95 border-amber-300 dark:border-amber-800 text-slate-800 dark:text-slate-100 shadow-amber-500/10'
                : 'bg-white/95 dark:bg-slate-900/95 border-indigo-300 dark:border-indigo-800 text-slate-800 dark:text-slate-100 shadow-indigo-500/10'
            }`}
          >
            {/* Status Icon */}
            <div className="shrink-0 mt-0.5">
              {item.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
              {item.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />}
              {item.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
              {item.type === 'info' && <Info className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
            </div>

            {/* Message Body */}
            <div className="flex-1 min-w-0 pr-1">
              {item.title ? (
                <>
                  <div className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                    {item.title}
                  </div>
                  <div className="text-[11.5px] text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">
                    {item.message}
                  </div>
                </>
              ) : (
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-snug">
                  {item.message}
                </div>
              )}
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => dismissToast(item.id)}
              className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Tutup notifikasi"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
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
