import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import { useAnimation } from '../../context/AnimationContext';
import { MoraJawsLogo } from '../common/MoraJawsLogo';
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
interface StaffLoginPortalProps {
  onLoginSuccess?: (role: UserRole) => void;
}

export const StaffLoginPortal: React.FC<StaffLoginPortalProps> = ({ onLoginSuccess }) => {
  const { login } = useApp();
  const { toast } = useToast();
  const { startLoading, stopLoading, showGlobalError } = useAnimation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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
    startLoading({
      title: 'MENGOTENTIKASI AKUN...',
      subtitle: 'Memverifikasi kredensial staf dan hak akses MoraJaws'
    });

    try {
      const res = await login(cleanUser, password);
      if (res.success && res.user) {
        toast.success(`Selamat datang kembali, ${res.user.name}!`, 'LOGIN BERHASIL');
        onLoginSuccess?.(res.user.role);
      } else {
        const errorMsg = res.error || 'Kredensial login tidak valid. Pastikan nama pengguna dan kata sandi benar.';
        setError(errorMsg);

        if (res.errorCode === 'ACCOUNT_NOT_FOUND' || res.errorCode === 'auth/user-not-found') {
          showGlobalError({
            errorCode: 'MJ-AUTH-002',
            module: 'Authentication',
            operation: 'User Lookup',
            description: 'Akun tidak terdaftar pada direktori internal MoraJaws.',
            message: 'Hubungi Superadmin untuk mendapatkan akses MoraJaws.',
            technicalDetails: errorMsg,
            severity: 'MEDIUM',
            status: 'OPEN'
          });
        } else if (res.errorCode === 'ACCOUNT_LOCKED' || res.errorCode === 'auth/too-many-requests') {
          showGlobalError({
            errorCode: 'MJ-AUTH-LOCK',
            module: 'Authentication',
            operation: 'Brute Force Protection',
            description: 'Akun dikunci sementara karena terlalu banyak percobaan gagal.',
            message: 'Terlalu banyak percobaan login gagal. Akun dikunci sementara demi keamanan.',
            technicalDetails: errorMsg,
            severity: 'HIGH',
            status: 'OPEN'
          });
        } else if (res.errorCode === 'ACCOUNT_DISABLED' || res.errorCode === 'auth/user-disabled') {
          showGlobalError({
            errorCode: 'MJ-AUTH-DISABLED',
            module: 'Authentication',
            operation: 'Account Status Check',
            description: 'Akun dinonaktifkan.',
            message: 'Akun Anda telah dinonaktifkan oleh Administrator. Hubungi Superadmin.',
            technicalDetails: errorMsg,
            severity: 'HIGH',
            status: 'OPEN'
          });
        } else if (
          res.errorCode === 'MJ-AUTH-001' ||
          res.errorCode === 'AUTH_INVALID_CREDENTIALS' ||
          res.errorCode === 'INVALID_CREDENTIALS' ||
          res.errorCode === 'auth/wrong-password'
        ) {
          showGlobalError({
            errorCode: 'MJ-AUTH-001',
            module: 'Authentication',
            operation: 'Staff Credential Login',
            description: 'Autentikasi gagal. Kredensial tidak cocok.',
            message: 'Autentikasi gagal. Kredensial tidak cocok.',
            technicalDetails: errorMsg,
            severity: 'MEDIUM',
            status: 'OPEN'
          });
        } else if (res.errorCode === 'DATABASE_UNAVAILABLE') {
          showGlobalError({
            errorCode: 'MJ-DB-001',
            module: 'Authentication',
            operation: 'Database Connectivity',
            description: 'Database Supabase PostgreSQL tidak dapat dijangkau.',
            message: 'Database PostgreSQL tidak dapat diakses saat login.',
            technicalDetails: errorMsg,
            severity: 'HIGH',
            status: 'OPEN'
          });
        } else if (res.errorCode === 'auth/network-request-failed' || res.errorCode === 'NETWORK_OFFLINE') {
          showGlobalError({
            errorCode: 'MJ-NET-001',
            module: 'Authentication',
            operation: 'Staff Network Connection',
            description: 'Koneksi jaringan terputus.',
            message: 'Gagal terhubung ke layanan autentikasi.',
            technicalDetails: errorMsg,
            severity: 'HIGH',
            status: 'OPEN'
          });
        } else if (res.errorCode === 'auth/user-disabled' || String(errorMsg || '').includes('dinonaktifkan')) {
          showGlobalError({
            errorCode: 'MJ-AUTH-003',
            module: 'Authentication',
            operation: 'Staff Account Status',
            description: 'Akun staf dinonaktifkan.',
            message: 'Akun telah dinonaktifkan oleh Administrator.',
            technicalDetails: errorMsg,
            severity: 'HIGH',
            status: 'OPEN'
          });
        } else if (res.errorCode === 'auth/user-not-found' || String(errorMsg || '').includes('tidak ditemukan') || String(errorMsg || '').includes('tidak terdaftar')) {
          showGlobalError({
            errorCode: 'MJ-AUTH-002',
            module: 'Authentication',
            operation: 'Staff Identity Lookup',
            description: 'Identitas staf tidak terdaftar.',
            message: 'Akun staf tidak ditemukan dalam direktori MoraJaws.',
            technicalDetails: errorMsg,
            severity: 'MEDIUM',
            status: 'OPEN'
          });
        } else if (res.errorCode === 'auth/too-many-requests') {
          showGlobalError({
            errorCode: 'MJ-AUTH-005',
            module: 'Authentication',
            operation: 'Staff Rate Limiting',
            description: 'Terlalu banyak percobaan login yang gagal.',
            message: 'Akses akun ditangguhkan sementara demi keamanan.',
            technicalDetails: errorMsg,
            severity: 'MEDIUM',
            status: 'OPEN'
          });
        } else {
          showGlobalError({
            errorCode: 'MJ-AUTH-004',
            module: 'Authentication',
            operation: 'Staff Authentication',
            description: 'Kendala autentikasi akun staf.',
            message: errorMsg,
            technicalDetails: errorMsg,
            severity: 'MEDIUM',
            status: 'OPEN'
          });
        }
      }
    } catch (err: any) {
      const errTxt = err?.message || 'Terjadi gangguan saat menghubungkan ke server autentikasi.';
      setError(errTxt);
      showGlobalError({
        errorCode: 'MJ-SYS-001',
        module: 'Authentication',
        operation: 'Staff Login Exception',
        description: 'Gagal menghubungi sistem autentikasi.',
        message: 'Gagal menghubungi sistem autentikasi.',
        technicalDetails: errTxt,
        severity: 'HIGH',
        status: 'OPEN'
      });
    } finally {
      setLoading(false);
      stopLoading();
    }
  };

  return (
    <div className="min-h-screen bg-[#160D29] flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 relative overflow-hidden transition-colors selection:bg-[#7135B5] selection:text-white">
      {/* Background ambient lighting in MoraJaws Dark Purple Gloss + Lilac palette */}
      <div className="absolute inset-0 bg-radial from-[#35105E]/60 via-[#160D29] to-[#0D0719] pointer-events-none" />
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-[#7135B5]/25 rounded-full blur-3xl pointer-events-none animate-pulse" style={{ animationDuration: '6s' }} />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-[#A855F7]/20 rounded-full blur-3xl pointer-events-none" />

      {/* Glossy light diagonal sweep */}
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-[#D8B4FE]/5 to-transparent pointer-events-none" />

      <div className="relative z-10 w-full max-w-md flex flex-col items-center">
        {/* Brand Header with Custom MoraJaws 3D Glossy Logo */}
        <div className="text-center mb-6 flex flex-col items-center">
          <div className="mb-4 transform hover:scale-105 transition-transform duration-300">
            <MoraJawsLogo size="lg" showText={true} animated={true} />
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#35105E]/70 border border-[#D8B4FE]/30 rounded-full text-[#E9D5FF] text-xs font-semibold shadow-[0_0_15px_rgba(113,53,181,0.3)]">
            <Server className="w-3.5 h-3.5 text-[#D8B4FE]" />
            <span>Dispatch & Work Order Management System</span>
          </div>

          <p className="text-xs sm:text-sm text-[#D8B4FE]/80 mt-2.5 max-w-sm mx-auto leading-relaxed">
            Masukkan identitas akun resmi MoraJaws. Hak akses dan peran staf diverifikasi melalui Supabase Auth.
          </p>
        </div>

        {/* Login Card with Dark Purple Gloss + Lilac Glowing Border */}
        <div className="w-full bg-[#160D29]/90 border border-[#D8B4FE]/35 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] p-6 sm:p-8 backdrop-blur-2xl relative overflow-hidden">
          {/* Top gloss highlight */}
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#D8B4FE]/80 to-transparent" />
          {error && (
            <div className="mb-5 p-3.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-xl flex items-start gap-3 text-xs text-rose-800 dark:text-rose-200 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{error}</div>
            </div>
          )}

          {/* Supabase Auth Production Gateway Notice */}
          <div className="mb-5 p-3.5 bg-[#35105E]/50 border border-[#D8B4FE]/30 rounded-xl flex items-center gap-3 text-xs text-[#E9D5FF] shadow-inner">
            <ShieldCheck className="w-5 h-5 text-[#D8B4FE] shrink-0" />
            <div className="leading-snug">
              <span className="font-bold text-white block">Portal Autentikasi Staf MoraJaws</span>
              <span className="text-[#D8B4FE]/80 text-[11px]">MoraJaws Custom Authentication &amp; Supabase PostgreSQL</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username / Email field */}
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
                  autoFocus
                  required
                  autoComplete="username"
                  placeholder="Masukkan nama pengguna atau email"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-[#160D29]/70 border border-[#D8B4FE]/30 rounded-xl text-xs font-medium text-white placeholder-[#D8B4FE]/40 focus:outline-hidden focus:ring-2 focus:ring-[#A855F7] focus:border-[#D8B4FE] transition-all"
                />
              </div>
            </div>

            {/* Password field with show/hide toggle */}
            <div>
              <label className="block text-xs font-bold text-[#E9D5FF] mb-1.5">
                Kata Sandi
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#D8B4FE]/70">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="Masukkan kata sandi akun"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-[#160D29]/70 border border-[#D8B4FE]/30 rounded-xl text-xs font-medium text-white placeholder-[#D8B4FE]/40 focus:outline-hidden focus:ring-2 focus:ring-[#A855F7] focus:border-[#D8B4FE] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#D8B4FE]/70 hover:text-white transition-colors cursor-pointer"
                  title={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember session checkbox */}
            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none text-[#D8B4FE]/80">
                <input
                  type="checkbox"
                  checked={rememberSession}
                  onChange={e => setRememberSession(e.target.checked)}
                  className="rounded border-[#D8CCF3] dark:border-[#3B1D78] text-[#7135B5] focus:ring-[#7135B5]"
                />
                <span>Simpan sesi aktif terproteksi</span>
              </label>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-[#7135B5] via-[#A855F7] to-[#7135B5] hover:brightness-110 active:scale-98 text-white rounded-xl font-bold text-xs shadow-[0_8px_25px_rgba(113,53,181,0.5)] border border-[#D8B4FE]/40 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
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

