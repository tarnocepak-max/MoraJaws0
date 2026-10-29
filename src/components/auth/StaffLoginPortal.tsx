import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { UserRole } from '../../types/index.ts';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Server,
  Sparkles,
  KeyRound,
  CheckCircle2
} from 'lucide-react';
import { signInStaffWithGoogle } from '../../services/googleSheetsService.ts';

interface StaffLoginPortalProps {
  onLoginSuccess?: (role: UserRole) => void;
}

export const StaffLoginPortal: React.FC<StaffLoginPortalProps> = ({ onLoginSuccess }) => {
  const { login, loginWithFirebase } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [rememberSession, setRememberSession] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUser = username.trim();
    if (!cleanUser) {
      setError('Nama pengguna atau alamat email wajib diisi.');
      return;
    }
    if (!password) {
      setError('Kata sandi wajib diisi.');
      return;
    }

    setLoading(true);

    try {
      const res = await login(cleanUser, password);
      if (res.success && res.user) {
        onLoginSuccess?.(res.user.role);
      } else {
        setError(res.error || 'Kredensial login tidak valid. Pastikan nama pengguna dan kata sandi benar.');
      }
    } catch (err: any) {
      setError(err?.message || 'Terjadi gangguan saat menghubungkan ke server autentikasi.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const authResult = await signInStaffWithGoogle();
      if (!authResult?.user) {
        throw new Error('Autentikasi Google dibatalkan atau tidak menerima profil.');
      }

      const email = authResult.user.email || '';
      const uid = authResult.user.uid || '';
      const displayName = authResult.user.displayName || '';

      const res = await loginWithFirebase({ email, uid, displayName });
      if (res.success && res.user) {
        onLoginSuccess?.(res.user.role);
      } else {
        setError(res.error || `Akun Google (${email}) belum didaftarkan di MoraJaws. Hubungi Administrator untuk verifikasi akun.`);
      }
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('verifikasi') || msg.includes('verification') || msg.includes('access_denied')) {
        setError('Akses Google dibatasi. Anda dapat masuk langsung menggunakan nama pengguna/email dan kata sandi resmi pada formulir di bawah.');
      } else {
        setError(err?.message || 'Gagal masuk dengan akun Google.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F1FF] dark:bg-[#140827] flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 relative overflow-hidden transition-colors">
      {/* Background ambient lighting in MoraJaws brand palette */}
      <div className="absolute inset-0 bg-radial from-[#3B1D78]/15 via-[#F5F1FF] dark:via-[#140827] to-transparent pointer-events-none" />
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-[#5B35B1]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-[#8064D9]/15 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md flex flex-col items-center">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#E9E1FF] dark:bg-[#3B1D78]/60 border border-[#D8CCF3] dark:border-[#5B35B1]/50 rounded-full text-[#3B1D78] dark:text-[#E9E1FF] text-xs font-semibold mb-4 shadow-xs">
            <Server className="w-3.5 h-3.5 text-[#5B35B1] dark:text-[#B19CF0]" />
            <span>MoraJaws Dispatch Management System</span>
          </div>

          <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-[#5B35B1] to-[#3B1D78] flex items-center justify-center text-white shadow-xl shadow-[#3B1D78]/25 ring-4 ring-[#E9E1FF] dark:ring-[#3B1D78]/40">
            <ShieldCheck className="w-9 h-9" />
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#21183A] dark:text-white tracking-tight">
            Portal Autentikasi Staf
          </h1>
          <p className="text-xs sm:text-sm text-[#756B8D] dark:text-[#D8CCF3] mt-1.5 max-w-sm mx-auto">
            Masukkan identitas login atau akun Google resmi Anda. Sistem akan memverifikasi peran dan hak akses secara otomatis.
          </p>
        </div>

        {/* Login Card */}
        <div className="w-full bg-white dark:bg-[#1E1138] border border-[#D8CCF3] dark:border-[#3B1D78] rounded-2xl shadow-xl shadow-[#3B1D78]/10 p-6 sm:p-8 backdrop-blur-md">
          {error && (
            <div className="mb-5 p-3.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-xl flex items-start gap-3 text-xs text-rose-800 dark:text-rose-200 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{error}</div>
            </div>
          )}

          {/* Google / Firebase Auth One-Click Sign In */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading || loading}
            className="w-full py-2.5 px-4 bg-white dark:bg-[#281747] border border-[#D8CCF3] dark:border-[#5B35B1] hover:bg-[#F5F1FF] dark:hover:bg-[#341C5A] active:scale-98 text-[#21183A] dark:text-white rounded-xl font-bold text-xs shadow-xs flex items-center justify-center gap-3 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed mb-5"
          >
            {googleLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-[#5B35B1] border-t-transparent rounded-full animate-spin" />
                <span>Memverifikasi Akun Google...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Masuk dengan Akun Google</span>
              </>
            )}
          </button>

          <div className="relative flex py-2 items-center mb-4">
            <div className="grow border-t border-[#E9E1FF] dark:border-[#3B1D78]" />
            <span className="shrink mx-3 text-[11px] font-semibold text-[#756B8D] dark:text-[#9A8FB3] uppercase tracking-wider">
              Atau kredensial staf
            </span>
            <div className="grow border-t border-[#E9E1FF] dark:border-[#3B1D78]" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username / Email field */}
            <div>
              <label className="block text-xs font-bold text-[#21183A] dark:text-[#E9E1FF] mb-1.5">
                Nama Pengguna atau Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#756B8D] dark:text-[#9A8FB3]">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  autoFocus
                  required
                  autoComplete="username"
                  placeholder="Masukkan nama pengguna atau email"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-[#F5F1FF]/60 dark:bg-[#140827]/60 border border-[#D8CCF3] dark:border-[#3B1D78] rounded-xl text-xs font-medium text-[#21183A] dark:text-white placeholder-[#9A8FB3] focus:outline-hidden focus:ring-2 focus:ring-[#5B35B1] focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Password field with show/hide toggle */}
            <div>
              <label className="block text-xs font-bold text-[#21183A] dark:text-[#E9E1FF] mb-1.5">
                Kata Sandi
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#756B8D] dark:text-[#9A8FB3]">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="Masukkan kata sandi akun"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-[#F5F1FF]/60 dark:bg-[#140827]/60 border border-[#D8CCF3] dark:border-[#3B1D78] rounded-xl text-xs font-medium text-[#21183A] dark:text-white placeholder-[#9A8FB3] focus:outline-hidden focus:ring-2 focus:ring-[#5B35B1] focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#756B8D] dark:text-[#9A8FB3] hover:text-[#3B1D78] dark:hover:text-[#E9E1FF] transition-colors cursor-pointer"
                  title={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember session checkbox */}
            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none text-[#756B8D] dark:text-[#D8CCF3]">
                <input
                  type="checkbox"
                  checked={rememberSession}
                  onChange={e => setRememberSession(e.target.checked)}
                  className="rounded border-[#D8CCF3] dark:border-[#3B1D78] text-[#5B35B1] focus:ring-[#5B35B1]"
                />
                <span>Simpan sesi aktif terproteksi</span>
              </label>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-[#5B35B1] to-[#3B1D78] hover:from-[#6A3ECC] hover:to-[#4A2494] active:scale-98 text-white rounded-xl font-bold text-xs shadow-lg shadow-[#3B1D78]/30 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Memverifikasi Sesi...</span>
                </>
              ) : (
                <>
                  <span>Masuk ke Sistem</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Security footnote */}
          <div className="mt-6 pt-5 border-t border-[#E9E1FF] dark:border-[#3B1D78]/50 text-center">
            <div className="inline-flex items-center gap-1.5 text-[11px] text-[#756B8D] dark:text-[#9A8FB3]">
              <Lock className="w-3.5 h-3.5 text-[#5B35B1] dark:text-[#8064D9]" />
              <span>Akses dibatasi hanya untuk staf berwenang. Semua aktivitas diaudit.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

