import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { UserRole } from '../../types';
import {
  Users,
  UserPlus,
  Shield,
  Wrench,
  UserCheck,
  Check,
  KeyRound,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Building2,
  Phone,
  Mail,
  Lock,
  Trash2,
  ShieldAlert
} from 'lucide-react';
import { SuperAdminDeleteModal } from '../common/SuperAdminDeleteModal';
import { User as UserType } from '../../types';

export const UserManagementView: React.FC = () => {
  const {
    currentUser,
    users,
    contractors,
    coverageAreas,
    registerDispatchAccount,
    registerLeaderAccount,
    toggleUserStatus,
    resetUserPassword
  } = useApp();

  const [activeTab, setActiveTab] = useState<'users_list' | 'create_dispatch' | 'create_leader'>('users_list');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  // Dispatch Form State
  const [dispName, setDispName] = useState('');
  const [dispUsername, setDispUsername] = useState('');
  const [dispPhone, setDispPhone] = useState('');
  const [dispEmail, setDispEmail] = useState('');

  // Leader Form State
  const [leadName, setLeadName] = useState('');
  const [leadUsername, setLeadUsername] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadContractor, setLeadContractor] = useState('');
  const [leadArea, setLeadArea] = useState(coverageAreas[0]?.name || '');

  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserType | null>(null);

  const triggerNotice = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 4000);
  };

  const handleCreateDispatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispName.trim() || !dispUsername.trim()) {
      triggerNotice('error', 'Nama lengkap dan Username wajib diisi.');
      return;
    }

    const res = registerDispatchAccount({
      name: dispName,
      username: dispUsername,
      phone: dispPhone,
      email: dispEmail
    });

    if (res.success) {
      triggerNotice('success', `Akun Dispatch ${dispName} berhasil didaftarkan! Password default: 12345678`);
      setDispName('');
      setDispUsername('');
      setDispPhone('');
      setDispEmail('');
      setActiveTab('users_list');
    } else {
      triggerNotice('error', res.error || 'Gagal mendaftarkan akun Dispatch.');
    }
  };

  const handleCreateLeader = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadName.trim() || !leadUsername.trim() || !leadContractor) {
      triggerNotice('error', 'Nama lengkap, Username, dan Kontraktor wajib diisi.');
      return;
    }

    const res = registerLeaderAccount({
      name: leadName,
      username: leadUsername,
      phone: leadPhone,
      contractor: leadContractor,
      area: leadArea,
      email: leadEmail
    });

    if (res.success) {
      triggerNotice('success', `Akun Leader ${leadName} berhasil didaftarkan untuk ${leadContractor}! Password default: 12345678`);
      setLeadName('');
      setLeadUsername('');
      setLeadContractor('');
      setLeadPhone('');
      setLeadEmail('');
      setActiveTab('users_list');
    } else {
      triggerNotice('error', res.error || 'Gagal mendaftarkan akun Leader.');
    }
  };

  const filteredUsers = users.filter(u => {
    if (roleFilter === 'ALL') return true;
    return u.role === roleFilter;
  });

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'super_admin':
        return <span className="px-2 py-0.5 rounded font-semibold text-[10px] bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">Super Admin</span>;
      case 'dispatch':
        return <span className="px-2 py-0.5 rounded font-semibold text-[10px] bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">Dispatch</span>;
      case 'leader':
        return <span className="px-2 py-0.5 rounded font-semibold text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">Leader / Korlap</span>;
      case 'installer':
        return <span className="px-2 py-0.5 rounded font-semibold text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Installer / Teknisi</span>;
    }
  };

  if (currentUser.role !== 'super_admin') {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl p-8 border border-slate-200 dark:border-slate-800 text-center max-w-lg mx-auto space-y-4 shadow-sm my-8">
        <div className="w-12 h-12 bg-rose-100 dark:bg-rose-950/60 text-rose-600 rounded-full flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h3 className="font-bold text-slate-900 dark:text-white text-base">
          Akses Ditolak: Manajemen Akun Staf Dibatasi
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Leader tidak dapat membuat atau mengelola akun staf lain selain <strong>Installer (Teknisi)</strong>. Pembuatan akun staf umum (Dispatch, Leader, Super Admin) hanya dapat dilakukan oleh <strong>Super Admin</strong>.
        </p>
        <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs text-slate-600 dark:text-slate-300 font-medium">
          Akun Anda: <span className="font-bold capitalize">{currentUser.name} ({currentUser.role})</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-purple-600 text-white flex items-center justify-center shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Manajemen Akun & Role RBAC (MoraJaws)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Super Admin berwenang mendaftarkan akun Dispatch dan Leader terikat kategori kontraktor dengan password default <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-indigo-600 dark:text-indigo-400">12345678</code>.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('create_dispatch')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'create_dispatch'
                ? 'bg-indigo-600 text-white'
                : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 hover:bg-indigo-100'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ Akun Dispatch</span>
          </button>

          <button
            onClick={() => setActiveTab('create_leader')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'create_leader'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 hover:bg-amber-100'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>+ Akun Leader (Korlap)</span>
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`p-3 rounded-lg border flex items-center gap-2 text-xs ${
            notice.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
          }`}
        >
          {notice.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{notice.text}</span>
        </div>
      )}

      {/* Tab Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 text-xs font-medium pb-1">
        <button
          onClick={() => setActiveTab('users_list')}
          className={`px-3 py-1.5 border-b-2 flex items-center gap-1.5 ${
            activeTab === 'users_list'
              ? 'border-purple-600 text-purple-600 dark:text-purple-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Daftar Seluruh Pengguna ({users.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('create_dispatch')}
          className={`px-3 py-1.5 border-b-2 flex items-center gap-1.5 ${
            activeTab === 'create_dispatch'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>Form Pendaftaran Dispatch</span>
        </button>

        <button
          onClick={() => setActiveTab('create_leader')}
          className={`px-3 py-1.5 border-b-2 flex items-center gap-1.5 ${
            activeTab === 'create_leader'
              ? 'border-amber-600 text-amber-600 dark:text-amber-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Form Pendaftaran Leader / Korlap</span>
        </button>
      </div>

      {/* TAB 1: USERS LIST */}
      {activeTab === 'users_list' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h4 className="font-bold text-slate-900 dark:text-white text-xs">
              Daftar Akun Pengguna Aktif & Akses Role
            </h4>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Filter Role:</span>
              <select
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
                className="px-2.5 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-800 dark:text-slate-200 font-medium"
              >
                <option value="ALL">Semua Role ({users.length})</option>
                <option value="super_admin">Super Admin</option>
                <option value="dispatch">Dispatch</option>
                <option value="leader">Leader / Korlap</option>
                <option value="installer">Installer / Teknisi</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase">
                <tr>
                  <th className="py-2.5 px-3">Nama Pengguna</th>
                  <th className="py-2.5 px-3">Username</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Kontraktor & Area</th>
                  <th className="py-2.5 px-3">Kontak</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-center">Aksi Keamanan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredUsers.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>{u.name}</span>
                        {u.id === currentUser.id && (
                          <span className="text-[10px] px-1.5 py-0.2 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300 rounded font-normal">
                            Anda
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400">{u.email || '-'}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-medium text-slate-700 dark:text-slate-300">
                      @{u.username}
                    </td>
                    <td className="py-2.5 px-3">{getRoleBadge(u.role)}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-800 dark:text-slate-200">{u.contractor || '-'}</div>
                      <div className="text-[11px] text-slate-400">{u.area || '-'}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                      {u.phone || '-'}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          u.active
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        }`}
                      >
                        {u.active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => {
                            const res = resetUserPassword(u.id);
                            triggerNotice('success', `Password untuk ${u.name} berhasil direset ke: ${res.newPassword}`);
                          }}
                          className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded border border-slate-200 dark:border-slate-700 text-[11px] flex items-center gap-1"
                          title="Reset Password ke default 12345678"
                        >
                          <KeyRound className="w-3 h-3 text-amber-500" />
                          <span>Reset Pass</span>
                        </button>

                        {u.id !== currentUser.id && (
                          <>
                            <button
                              onClick={() => toggleUserStatus(u.id)}
                              className={`px-2 py-1 rounded text-[11px] font-medium border ${
                                u.active
                                  ? 'border-rose-200 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50'
                                  : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50'
                              }`}
                            >
                              {u.active ? 'Nonaktifkan' : 'Aktifkan'}
                            </button>

                            {currentUser.role === 'super_admin' && (
                              <button
                                onClick={() => setUserToDelete(u)}
                                className="px-2 py-1 rounded text-[11px] font-medium border border-rose-300 dark:border-rose-900 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 flex items-center gap-1"
                                title="Hapus Akun Pengguna (Super Admin Only)"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Hapus</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: CREATE DISPATCH */}
      {activeTab === 'create_dispatch' && (
        <form onSubmit={handleCreateDispatch} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-4 text-xs max-w-2xl">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                Pendaftaran Akun Baru: Dispatch Officer
              </h4>
              <p className="text-[11px] text-slate-500">
                Dispatch bertanggung jawab memonitor tiket, live chat dengan installer, dan menutup (close) tiket.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Nama Lengkap Petugas <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: Rina Kartika"
                value={dispName}
                onChange={e => setDispName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Username Unik <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: dispatch_rina"
                value={dispUsername}
                onChange={e => setDispUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Nomor Telepon / WhatsApp
              </label>
              <input
                type="text"
                placeholder="0812xxxxxxxx"
                value={dispPhone}
                onChange={e => setDispPhone(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Email
              </label>
              <input
                type="email"
                placeholder="rina@morajaws.net"
                value={dispEmail}
                onChange={e => setDispEmail(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold text-slate-800 dark:text-slate-200">Kebijakan Password Awal:</span>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Password default otomatis disetel ke <strong className="font-mono text-indigo-600">12345678</strong>. Pengguna akan diminta mengganti password pada login pertama.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setActiveTab('users_list')}
              className="px-4 py-2 border rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold flex items-center gap-1.5 shadow-xs"
            >
              <Check className="w-4 h-4" />
              <span>Daftarkan Akun Dispatch</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: CREATE LEADER */}
      {activeTab === 'create_leader' && (
        <form onSubmit={handleCreateLeader} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-4 text-xs max-w-2xl">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                Pendaftaran Akun Baru: Leader / Korlap Mitra
              </h4>
              <p className="text-[11px] text-slate-500">
                Leader wajib dihubungkan ke Kontraktor yang valid dari Master Data Kontraktor.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Nama Lengkap Korlap <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: Hendra Gunawan"
                value={leadName}
                onChange={e => setLeadName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Username Unik <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: leader_hendra"
                value={leadUsername}
                onChange={e => setLeadUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Nama Kontraktor <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                list="contractor-suggestions"
                placeholder="Ketik nama kontraktor (misal: PT Mitra Jaringan Solusi)"
                value={leadContractor}
                onChange={e => setLeadContractor(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
              />
              <datalist id="contractor-suggestions">
                {contractors.map((c, cIdx) => (
                  <option key={`suggestion-${c.id || c.name}-${cIdx}`} value={c.name}>{c.name} ({c.code})</option>
                ))}
              </datalist>
              <p className="text-[10.5px] text-slate-400 mt-1">
                Ketik nama kontraktor secara bebas atau pilih dari saran master data.
              </p>
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Coverage Area Utama <span className="text-rose-500">*</span>
              </label>
              <select
                value={leadArea}
                onChange={e => setLeadArea(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
              >
                {coverageAreas.map(a => (
                  <option key={a.id} value={a.name}>{a.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Nomor Telepon / WhatsApp
              </label>
              <input
                type="text"
                placeholder="0812xxxxxxxx"
                value={leadPhone}
                onChange={e => setLeadPhone(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Email
              </label>
              <input
                type="email"
                placeholder="hendra@mitrajaringan.co.id"
                value={leadEmail}
                onChange={e => setLeadEmail(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold text-slate-800 dark:text-slate-200">Kebijakan Password Awal:</span>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Password default otomatis disetel ke <strong className="font-mono text-amber-600">12345678</strong>.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setActiveTab('users_list')}
              className="px-4 py-2 border rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold flex items-center gap-1.5 shadow-xs"
            >
              <Check className="w-4 h-4" />
              <span>Daftarkan Akun Leader (Korlap)</span>
            </button>
          </div>
        </form>
      )}

      {userToDelete && (
        <SuperAdminDeleteModal
          isOpen={Boolean(userToDelete)}
          onClose={() => setUserToDelete(null)}
          targetType="user"
          targetId={userToDelete.id}
          targetLabel={`${userToDelete.name} (@${userToDelete.username})`}
          targetDetails={[
            { label: 'Role', value: userToDelete.role },
            { label: 'Kontraktor', value: userToDelete.contractor || '-' },
            { label: 'Telepon', value: userToDelete.phone || '-' },
            { label: 'Status Saat Ini', value: userToDelete.active ? 'Aktif' : 'Nonaktif' }
          ]}
          onSuccess={() => {
            triggerNotice('success', `Akun pengguna ${userToDelete.name} berhasil dihapus/diarsipkan.`);
            setUserToDelete(null);
          }}
        />
      )}
    </div>
  );
};
