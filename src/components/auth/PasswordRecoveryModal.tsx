import React, { useState, useEffect } from 'react';
import {
  Lock,
  Mail,
  User,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  X,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import {
  requestPasswordRecovery,
  verifyRecoverySession,
  resetPasswordWithRecoveryToken
} from '../../services/authService';

export interface PasswordRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'request' | 'reset';
  initialParams?: {
    accessToken?: string;
    code?: string;
    token_hash?: string;
    type?: string;
  };
  onSuccessLoginRedirect?: () => void;
}

export const PasswordRecoveryModal: React.FC<PasswordRecoveryModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'request',
  initialParams,
  onSuccessLoginRedirect
}) => {
  const [mode, setMode] = useState<'request' | 'reset'>(initialMode);
  
  // Request mode state
  const [identifier, setIdentifier] = useState('');
  const [requestSent, setRequestSent] = useState(false);
  const [requestSuccessMessage, setRequestSuccessMessage] = useState('');
  const [requestTargetEmail, setRequestTargetEmail] = useState('');

  // Reset mode state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [verifyingSession, setVerifyingSession] = useState(false);
  const [sessionVerified, setSessionVerified] = useState(false);
  
  // Common states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recovery credentials and token state held strictly in memory
  const [recoveryCredentials, setRecoveryCredentials] = useState<{
    accessToken?: string;
    code?: string;
    token_hash?: string;
  }>({});
  const [recoverySessionToken, setRecoverySessionToken] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Check incoming props or window location for recovery parameters
    const hash = window.location.hash ? window.location.hash.substring(1) : '';
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(hash);

    const accessToken = initialParams?.accessToken || hashParams.get('access_token') || undefined;
    const code = initialParams?.code || searchParams.get('code') || undefined;
    const tokenHash = initialParams?.token_hash || searchParams.get('token_hash') || undefined;
    const type = initialParams?.type || hashParams.get('type') || searchParams.get('type') || '';

    const hasRecoveryCredentials = (Boolean(accessToken) && type === 'recovery') || Boolean(code) || (Boolean(tokenHash) && type === 'recovery') || initialMode === 'reset';

    if (hasRecoveryCredentials) {
      setMode('reset');
      const creds = {
        accessToken: accessToken || undefined,
        code: code || undefined,
        token_hash: tokenHash || undefined
      };
      setRecoveryCredentials(creds);

      // SENSITIVE CREDENTIAL CLEANUP:
      // Immediately wipe recovery tokens and codes from the browser address bar
      // to prevent leaks into browser history, logs, or screen snooping.
      try {
        if (window.history && window.history.replaceState) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch {}

      verifyToken(creds);
    } else {
      setMode(initialMode);
    }
  }, [isOpen, initialMode, initialParams]);

  const verifyToken = async (creds: { accessToken?: string; code?: string; token_hash?: string }) => {
    if (!creds.accessToken && !creds.code && !creds.token_hash) return;
    
    setVerifyingSession(true);
    setError(null);
    try {
      const res = await verifyRecoverySession(creds);
      if (res.ok && res.data?.valid) {
        setSessionVerified(true);
        if (res.data.email) {
          setVerifiedEmail(res.data.email);
        }
        if (res.data.recoveryToken) {
          setRecoverySessionToken(res.data.recoveryToken);
        }
      } else {
        const errorMsg = res.data?.error || 'Tautan pemulihan kata sandi tidak valid atau telah kedaluwarsa. Silakan minta tautan baru.';
        setError(errorMsg);
        setSessionVerified(false);
      }
    } catch (e: any) {
      setError(e?.message || 'Gagal memverifikasi token pemulihan. Periksa koneksi jaringan Anda.');
      setSessionVerified(false);
    } finally {
      setVerifyingSession(false);
    }
  };

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanIdent = identifier.trim();
    if (!cleanIdent) {
      setError('Masukkan nama pengguna atau alamat email akun Anda.');
      return;
    }

    setLoading(true);
    try {
      const res = await requestPasswordRecovery(cleanIdent, 'https://morajaws.ai.studio/');
      if (res.ok && res.data?.success) {
        setRequestSent(true);
        setRequestSuccessMessage(res.data.message || 'Tautan pemulihan berhasil dikirim.');
        if (res.data.email) {
          setRequestTargetEmail(res.data.email);
        }
      } else {
        setError(res.data?.error || 'Gagal mengirim email pemulihan. Pastikan nama pengguna atau email terdaftar.');
      }
    } catch (err: any) {
      setError(err?.message || 'Terjadi kesalahan sistem saat menghubungi server pemulihan.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!newPassword || newPassword.length < 8) {
      setError('Kata sandi baru minimal harus 8 karakter.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    const effectiveToken = recoverySessionToken || recoveryCredentials.accessToken;
    if (!effectiveToken && !recoveryCredentials.code && !recoveryCredentials.token_hash) {
      setError('Bukti pemulihan tidak ditemukan atau telah kedaluwarsa. Silakan minta tautan pemulihan baru.');
      return;
    }

    setLoading(true);
    try {
      const res = await resetPasswordWithRecoveryToken({
        newPassword,
        confirmPassword,
        recoveryToken: effectiveToken,
        code: recoveryCredentials.code,
        token_hash: recoveryCredentials.token_hash
      });

      if (res.ok && res.data?.success) {
        setResetSuccess(true);
        // Wipe memory tokens
        setRecoverySessionToken(null);
        setRecoveryCredentials({});
      } else {
        setError(res.data?.error || 'Gagal memperbarui kata sandi. Tautan mungkin telah kedaluwarsa.');
      }
    } catch (err: any) {
      setError(err?.message || 'Terjadi kesalahan sistem saat menyimpan kata sandi baru. Periksa koneksi internet.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#160D29] border border-[#D8B4FE]/30 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden">
        {/* Top gloss highlight */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#D8B4FE]/80 to-transparent" />
        <div className="absolute -top-24 -right-24 w-60 h-60 bg-[#7135B5]/20 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-[#35105E] flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7135B5] to-[#35105E] border border-[#D8B4FE]/40 flex items-center justify-center text-white shadow-[0_0_15px_rgba(113,53,181,0.4)]">
              <KeyRound className="w-5 h-5 text-[#E9D5FF]" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base tracking-tight">
                {mode === 'reset' ? 'Perbarui Kata Sandi' : 'Pemulihan Kata Sandi'}
              </h3>
              <p className="text-xs text-[#D8B4FE]/70">
                MoraJaws Security & Supabase Auth
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#D8B4FE]/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            title="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 relative z-10 space-y-4">
          {error && (
            <div className="p-3.5 bg-rose-950/60 border border-rose-800/80 rounded-xl flex items-start gap-3 text-xs text-rose-200 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{error}</div>
            </div>
          )}

          {/* ================= MODE: REQUEST RECOVERY LINK ================= */}
          {mode === 'request' && !requestSent && (
            <form onSubmit={handleRequestSubmit} className="space-y-4">
              <div className="p-3.5 bg-[#35105E]/40 border border-[#D8B4FE]/20 rounded-xl text-xs text-[#E9D5FF] leading-relaxed flex items-start gap-2.5">
                <Mail className="w-4 h-4 text-[#D8B4FE] shrink-0 mt-0.5" />
                <div>
                  Masukkan nama pengguna atau email akun Anda. Sistem akan mengirimkan tautan pemulihan resmi yang mengarah ke domain <span className="font-mono text-white underline">https://morajaws.ai.studio/</span>.
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#E9D5FF] mb-1.5">
                  Nama Pengguna atau Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#D8B4FE]/70">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="Contoh: superadmin atau nama@morajaws.com"
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-[#160D29]/70 border border-[#D8B4FE]/30 rounded-xl text-xs font-medium text-white placeholder-[#D8B4FE]/40 focus:outline-hidden focus:ring-2 focus:ring-[#A855F7] focus:border-[#D8B4FE] transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-gradient-to-r from-[#7135B5] via-[#A855F7] to-[#7135B5] hover:brightness-110 active:scale-98 text-white rounded-xl font-bold text-xs shadow-[0_8px_25px_rgba(113,53,181,0.5)] border border-[#D8B4FE]/40 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Mengirim Permintaan...</span>
                  </>
                ) : (
                  <>
                    <span>Kirim Tautan Pemulihan</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ================= MODE: REQUEST SUCCESS ================= */}
          {mode === 'request' && requestSent && (
            <div className="space-y-4 text-center py-2 animate-in fade-in">
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h4 className="font-bold text-white text-sm">Tautan Pemulihan Terkirim</h4>
                <p className="text-xs text-[#D8B4FE]/80 mt-1 leading-relaxed">
                  {requestSuccessMessage}
                </p>
                {requestTargetEmail && (
                  <p className="text-xs font-mono text-emerald-300 mt-2 bg-[#35105E]/50 py-1.5 px-3 rounded-lg border border-[#D8B4FE]/20 inline-block">
                    {requestTargetEmail}
                  </p>
                )}
              </div>

              <div className="p-3 bg-[#35105E]/30 border border-[#D8B4FE]/20 rounded-xl text-[11px] text-[#D8B4FE]/70 text-left leading-relaxed">
                <span className="font-semibold text-white block mb-0.5">Langkah berikutnya:</span>
                1. Buka kotak masuk email Anda.<br />
                2. Klik tombol konfirmasi pemulihan kata sandi.<br />
                3. Tautan akan otomatis mengarahkan ke halaman ini untuk memasukkan kata sandi baru.
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 px-4 bg-[#35105E]/80 hover:bg-[#35105E] text-white rounded-xl font-semibold text-xs border border-[#D8B4FE]/30 transition-all cursor-pointer"
              >
                Kembali ke Form Login
              </button>
            </div>
          )}

          {/* ================= MODE: RESET PASSWORD FORM ================= */}
          {mode === 'reset' && !resetSuccess && (
            <div className="space-y-4">
              {verifyingSession && (
                <div className="p-4 bg-[#35105E]/40 border border-[#D8B4FE]/30 rounded-xl flex items-center justify-center gap-3 text-xs text-[#E9D5FF]">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#D8B4FE]" />
                  <span>Memverifikasi token pemulihan Supabase...</span>
                </div>
              )}

              {sessionVerified && (
                <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl flex items-center gap-2.5 text-xs text-emerald-200">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    Sesi pemulihan terverifikasi{verifiedEmail ? ` untuk akun ${verifiedEmail}` : ''}.
                  </span>
                </div>
              )}

              <form onSubmit={handleResetSubmit} className="space-y-4">
                {/* New Password */}
                <div>
                  <label className="block text-xs font-bold text-[#E9D5FF] mb-1.5">
                    Kata Sandi Baru (Minimal 8 Karakter)
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#D8B4FE]/70">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoFocus
                      placeholder="Masukkan kata sandi baru"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-2.5 bg-[#160D29]/70 border border-[#D8B4FE]/30 rounded-xl text-xs font-medium text-white placeholder-[#D8B4FE]/40 focus:outline-hidden focus:ring-2 focus:ring-[#A855F7] focus:border-[#D8B4FE] transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#D8B4FE]/70 hover:text-white transition-colors cursor-pointer"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-xs font-bold text-[#E9D5FF] mb-1.5">
                    Konfirmasi Kata Sandi Baru
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#D8B4FE]/70">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      placeholder="Ulangi kata sandi baru"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-2.5 bg-[#160D29]/70 border border-[#D8B4FE]/30 rounded-xl text-xs font-medium text-white placeholder-[#D8B4FE]/40 focus:outline-hidden focus:ring-2 focus:ring-[#A855F7] focus:border-[#D8B4FE] transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#D8B4FE]/70 hover:text-white transition-colors cursor-pointer"
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Password match helper */}
                {confirmPassword && (
                  <div className={`text-[11px] flex items-center gap-1.5 ${newPassword === confirmPassword ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {newPassword === confirmPassword ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Kata sandi cocok</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Konfirmasi kata sandi belum sama</span>
                      </>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || verifyingSession || (!sessionVerified && !recoverySessionToken && !recoveryCredentials.code && !recoveryCredentials.token_hash && !recoveryCredentials.accessToken)}
                  className="w-full py-3 px-4 bg-gradient-to-r from-[#7135B5] via-[#A855F7] to-[#7135B5] hover:brightness-110 active:scale-98 text-white rounded-xl font-bold text-xs shadow-[0_8px_25px_rgba(113,53,181,0.5)] border border-[#D8B4FE]/40 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      <span>Menyimpan Kata Sandi Baru...</span>
                    </>
                  ) : (
                    <>
                      <span>Simpan & Perbarui Kata Sandi</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                {error && !sessionVerified && !verifyingSession && (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setMode('request');
                      setRequestSent(false);
                    }}
                    className="w-full py-2.5 px-4 bg-[#35105E]/60 hover:bg-[#35105E] text-[#E9D5FF] rounded-xl font-semibold text-xs border border-[#D8B4FE]/30 transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-[#D8B4FE]" />
                    <span>Minta Tautan Pemulihan Baru</span>
                  </button>
                )}
              </form>
            </div>
          )}

          {/* ================= MODE: RESET SUCCESS ================= */}
          {mode === 'reset' && resetSuccess && (
            <div className="space-y-4 text-center py-3 animate-in fade-in">
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h4 className="font-bold text-white text-base">Kata Sandi Berhasil Diperbarui</h4>
                <p className="text-xs text-[#D8B4FE]/80 mt-1 leading-relaxed">
                  Kata sandi akun MoraJaws Anda telah diperbarui melalui Supabase Auth. Seluruh sesi sebelumnya telah dicabut demi keamanan.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSuccessLoginRedirect?.();
                }}
                className="w-full py-3 px-4 bg-gradient-to-r from-[#7135B5] via-[#A855F7] to-[#7135B5] hover:brightness-110 active:scale-98 text-white rounded-xl font-bold text-xs shadow-[0_8px_25px_rgba(113,53,181,0.5)] border border-[#D8B4FE]/40 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <span>Masuk Sekarang</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer Note */}
        <div className="p-3.5 bg-[#0D0719]/60 border-t border-[#35105E] text-center text-[11px] text-[#D8B4FE]/60">
          Semua pergantian kata sandi diaudit secara ketat oleh sistem backend MoraJaws.
        </div>
      </div>
    </div>
  );
};
