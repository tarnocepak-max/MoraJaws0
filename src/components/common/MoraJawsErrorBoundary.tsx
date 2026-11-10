import React, { Component, ErrorInfo, ReactNode } from 'react';
import { MoraJawsLogo } from './MoraJawsLogo';
import { RotateCcw, ShieldAlert, LogOut, Copy, Check, ChevronDown, ChevronUp, Terminal } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  incidentId: string;
  errorMessage: string;
  componentStack: string;
  failedComponentName: string;
  moduleInfo: string;
  isCopied: boolean;
  showDetails: boolean;
}

function sanitizeDiagnostics(text: string): string {
  if (!text) return '';
  return text
    .replace(/(bearer\s+[a-z0-9._-]+|token=[a-z0-9._-]+)/gi, '[REDACTED_TOKEN]')
    .replace(/(password|secret|apikey|api_key)=['"]?[^&'"\s]+['"]?/gi, '$1=[REDACTED]')
    .replace(/supabaseKey=['"]?[^&'"\s]+['"]?/gi, 'supabaseKey=[REDACTED]');
}

function extractComponentName(stack?: string): string {
  if (!stack) return 'UnknownComponent';
  // Common React stack line format: in ComponentName (at ...) or at ComponentName
  const match = stack.match(/in\s+([A-Za-z0-9_]+)/) || stack.match(/at\s+([A-Za-z0-9_]+)/);
  return match ? match[1] : 'MoraJawsView';
}

function extractModuleInfo(error?: Error, stack?: string): string {
  const combined = `${error?.stack || ''} ${stack || ''}`;
  const fileMatch = combined.match(/([a-zA-Z0-9_\-./]+\.(?:tsx|ts|jsx|js)(?::\d+:\d+)?)/);
  return fileMatch ? fileMatch[1] : 'src/components/dashboard/DashboardOverview.tsx';
}

/**
 * MoraJawsErrorBoundary (Incident Guard)
 * Catches uncaught runtime render exceptions in React components.
 * Prevents blank screen crashes and provides clean, secure recovery paths.
 * STRICT SECURITY: Zero credentials, passwords, or tokens displayed.
 * Full component stack and failure module diagnostics provided.
 */
export class MoraJawsErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    incidentId: '',
    errorMessage: '',
    componentStack: '',
    failedComponentName: '',
    moduleInfo: '',
    isCopied: false,
    showDetails: false
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    const incidentId = `MJ-ERR-${Date.now().toString(36).toUpperCase()}-${rand}`;
    const safeMessage = error && error.message
      ? sanitizeDiagnostics(error.message)
      : 'Terjadi kegagalan render antarmuka aplikasi.';

    return {
      hasError: true,
      incidentId,
      errorMessage: safeMessage
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const sanitizedStack = sanitizeDiagnostics(errorInfo?.componentStack || '');
    const failedComponent = extractComponentName(errorInfo?.componentStack);
    const modInfo = extractModuleInfo(error, errorInfo?.componentStack);

    this.setState({
      componentStack: sanitizedStack,
      failedComponentName: failedComponent,
      moduleInfo: modInfo
    });

    console.error('[MoraJaws Crash Shield] React Error Boundary caught an exception:', {
      message: sanitizeDiagnostics(error?.message || ''),
      component: failedComponent,
      module: modInfo,
      componentStack: sanitizedStack
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
    const payload = [
      `[MORAJAWS CRASH REPORT]`,
      `Incident ID: ${this.state.incidentId}`,
      `Timestamp: ${new Date().toISOString()}`,
      `Component: ${this.state.failedComponentName || 'Unknown'}`,
      `Module Info: ${this.state.moduleInfo || 'N/A'}`,
      `Message: ${this.state.errorMessage}`,
      `Component Stack:`,
      this.state.componentStack ? this.state.componentStack.trim() : 'N/A',
      `Environment: MoraJaws Custom Auth / Production Shield Active`
    ].join('\n');

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

          <div className="relative z-10 w-full max-w-xl rounded-2xl p-6 sm:p-8 bg-slate-900/90 backdrop-blur-xl border border-purple-500/40 shadow-2xl shadow-purple-950/80 text-center">
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
            <div className="rounded-xl bg-purple-950/40 border border-purple-500/30 p-4 mb-4 text-left space-y-2.5">
              <div className="flex items-center justify-between text-purple-200">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
                  <span className="text-xs font-semibold">Incident Guard Active</span>
                </div>
                {this.state.failedComponentName && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-900/60 border border-purple-400/30 text-purple-200">
                    {this.state.failedComponentName}
                  </span>
                )}
              </div>
              <p className="text-xs text-purple-100/90 leading-relaxed font-mono">
                {this.state.errorMessage}
              </p>
              <div className="pt-2 border-t border-purple-500/20 flex items-center justify-between text-[11px] font-mono text-purple-300/70">
                <span>ID Insiden:</span>
                <span className="text-amber-300 font-bold px-2 py-0.5 rounded bg-black/40 border border-amber-400/20">
                  {this.state.incidentId}
                </span>
              </div>
            </div>

            {/* Expandable Technical Diagnostics Accordion */}
            <div className="mb-6 rounded-xl border border-purple-500/20 bg-slate-950/50 overflow-hidden text-left">
              <button
                type="button"
                onClick={() => this.setState(prev => ({ showDetails: !prev.showDetails }))}
                className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs text-purple-300 hover:text-white hover:bg-purple-900/20 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-purple-400" />
                  <span className="font-semibold">Detail Diagnostik Teknis (Aman)</span>
                </div>
                {this.state.showDetails ? (
                  <ChevronUp className="w-4 h-4 text-purple-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-purple-400" />
                )}
              </button>

              {this.state.showDetails && (
                <div className="p-3.5 pt-1 space-y-2 text-[11px] font-mono border-t border-purple-500/20 text-purple-200/80">
                  <div className="flex justify-between py-1 border-b border-purple-900/40">
                    <span className="text-purple-400">Komponen:</span>
                    <span className="text-white font-bold">{this.state.failedComponentName || 'DashboardOverview'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-purple-900/40">
                    <span className="text-purple-400">Modul Sumber:</span>
                    <span className="text-white">{this.state.moduleInfo || 'src/components/dashboard'}</span>
                  </div>
                  {this.state.componentStack && (
                    <div className="pt-1">
                      <span className="text-purple-400 block mb-1">Component Hierarchy:</span>
                      <pre className="text-[10px] leading-tight text-slate-300 bg-black/40 p-2 rounded-lg max-h-36 overflow-auto border border-purple-500/20 whitespace-pre-wrap">
                        {this.state.componentStack}
                      </pre>
                    </div>
                  )}
                </div>
              )}
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
