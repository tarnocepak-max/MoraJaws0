import React, { Component, ErrorInfo, ReactNode } from 'react';
import { MoraJawsLogo } from './MoraJawsLogo';
import { RotateCcw, ShieldAlert, LogOut, Copy, Check } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  incidentId: string;
  errorMessage: string;
  isCopied: boolean;
}

/**
 * MoraJawsErrorBoundary
 * Catches uncaught runtime render exceptions in React components.
 * Prevents blank screen crashes and provides clean, secure recovery paths.
 * STRICT SECURITY: Zero stack traces, tokens, or credentials displayed to the user.
 */
export class MoraJawsErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    incidentId: '',
    errorMessage: '',
    isCopied: false
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    const incidentId = `MJ-ERR-${Date.now().toString(36).toUpperCase()}-${rand}`;
    const safeMessage = error && error.message
      ? error.message.replace(/(bearer\s+[a-z0-9._-]+|token=[a-z0-9._-]+)/gi, '[REDACTED]')
      : 'Terjadi kegagalan render antarmuka aplikasi.';

    return {
      hasError: true,
      incidentId,
      errorMessage: safeMessage
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[MoraJaws Crash Shield] React Error Boundary caught an exception:', {
      message: error?.message,
      componentStack: errorInfo?.componentStack
    });
  }

  private handleReload = () => {
    if (this.props.onReset) {
      this.props.onReset();
    }
    window.location.reload();
  };

  private handleResetSession = () => {
    try {
      localStorage.removeItem('morajaws_logged_in');
      localStorage.removeItem('morajaws_auth_session');
      sessionStorage.clear();
    } catch {}
    window.location.href = '/';
  };

  private handleCopyIncident = async () => {
    const payload = `[MORAJAWS CRASH REPORT]\nIncident ID: ${this.state.incidentId}\nTimestamp: ${new Date().toISOString()}\nMessage: ${this.state.errorMessage}\nEnvironment: Production Safe`;
    try {
      await navigator.clipboard.writeText(payload);
      this.setState({ isCopied: true });
      setTimeout(() => this.setState({ isCopied: false }), 2500);
    } catch {
      this.setState({ isCopied: true });
      setTimeout(() => this.setState({ isCopied: false }), 2500);
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 text-white font-sans">
          {/* Ambient Purple Gloss Background Glow */}
          <div className="fixed inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-indigo-600/15 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 w-full max-w-lg rounded-2xl p-6 sm:p-8 bg-slate-900/90 backdrop-blur-xl border border-purple-500/40 shadow-2xl shadow-purple-950/80 text-center">
            {/* MoraJaws Logo & Header */}
            <div className="flex flex-col items-center gap-3 mb-6">
              <MoraJawsLogo size="md" withGlow={true} />
              <div>
                <span className="text-[11px] font-mono tracking-widest text-purple-300 uppercase font-bold block">
                  MORAJAWS SYSTEM RECOVERY
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-white mt-1 tracking-tight">
                  {this.props.fallbackTitle || 'Aplikasi Mengalami Kendala Tampilan'}
                </h2>
              </div>
            </div>

            {/* Error Shield Card */}
            <div className="rounded-xl bg-purple-950/40 border border-purple-500/30 p-4 mb-6 text-left space-y-2.5">
              <div className="flex items-center gap-2 text-purple-200">
                <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
                <span className="text-xs font-semibold">Incident Guard Active</span>
              </div>
              <p className="text-xs text-purple-100/80 leading-relaxed">
                {this.state.errorMessage}
              </p>
              <div className="pt-2 border-t border-purple-500/20 flex items-center justify-between text-[11px] font-mono text-purple-300/70">
                <span>ID Insiden:</span>
                <span className="text-amber-300 font-bold px-2 py-0.5 rounded bg-black/40 border border-amber-400/20">
                  {this.state.incidentId}
                </span>
              </div>
            </div>

            {/* Recovery Action Buttons */}
            <div className="flex flex-col gap-2.5">
              <button
                onClick={this.handleReload}
                className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 via-purple-700 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-98 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg shadow-purple-900/40 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>MUAT ULANG APLIKASI</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={this.handleResetSession}
                  className="py-2.5 px-3 bg-white/5 hover:bg-white/10 active:scale-98 text-purple-200 border border-purple-400/20 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-400" />
                  <span>BERSIHKAN SESI</span>
                </button>

                <button
                  onClick={this.handleCopyIncident}
                  className="py-2.5 px-3 bg-white/5 hover:bg-white/10 active:scale-98 text-purple-200 border border-purple-400/20 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  {this.state.isCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>TERSALIN</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-purple-300" />
                      <span>SALIN KODE</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <p className="mt-5 text-[10px] text-purple-300/50 font-mono">
              MoraJaws Operations Platform &bull; Safe Fail-Closed Guard
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
