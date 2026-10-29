import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { SessionMetadata, SessionConfig } from '../../types/index.ts';
import {
  ShieldAlert,
  Clock,
  Laptop,
  Smartphone,
  LogOut,
  RotateCw,
  Sliders,
  CheckCircle2,
  AlertCircle,
  X,
  Search,
  Users
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface SessionManagementModalProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const SessionManagementModal: React.FC<SessionManagementModalProps> = ({ isOpen: propIsOpen, onClose: propOnClose }) => {
  const { currentUser, isSessionModalOpen, setIsSessionModalOpen } = useApp();
  const { toast } = useToast();

  const isOpen = propIsOpen !== undefined ? propIsOpen : isSessionModalOpen;
  const onClose = propOnClose || (() => setIsSessionModalOpen(false));

  const [activeTab, setActiveTab] = useState<'monitoring' | 'config'>('monitoring');
  const [sessions, setSessions] = useState<SessionMetadata[]>([]);
  const [sessionConfig, setSessionConfig] = useState<SessionConfig>({
    sessionMaxDurationHours: 8,
    idleTimeoutMinutes: 60,
    extendOnActivity: true,
    maxActiveSessionsPerUser: 3,
    revokePreviousOnLogin: false,
    revokeOnDeactivate: true,
    revokeOnPasswordChange: true
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [searchUser, setSearchUser] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'active' | 'expired' | 'revoked'>('ALL');

  const fetchSessionsAndConfig = async () => {
    setIsLoading(true);
    try {
      const [sessRes, cfgRes] = await Promise.all([
        fetch('/api/sessions', {
          headers: { 'x-user-role': currentUser.role, 'x-user-id': currentUser.id }
        }),
        fetch('/api/sessions/config', {
          headers: { 'x-user-role': currentUser.role, 'x-user-id': currentUser.id }
        })
      ]);

      if (sessRes.ok) {
        const sData = await sessRes.json();
        setSessions(sData.sessions || []);
      }
      if (cfgRes.ok) {
        const cData = await cfgRes.json();
        if (cData.config) setSessionConfig(cData.config);
      }
    } catch (err) {
      console.warn('Could not fetch sessions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSessionsAndConfig();
    }
  }, [isOpen]);

  const handleRevokeSession = async (sessionId: string, username: string) => {
    try {
      const res = await fetch('/api/sessions/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentUser.role,
          'x-user-id': currentUser.id
        },
        body: JSON.stringify({ sessionId, reason: `Dicabut oleh Administrator ${currentUser.name}` })
      });
      if (res.ok) {
        toast.success(`Sesi untuk ${username} berhasil dicabut.`, 'Sesi Dicabut');
        fetchSessionsAndConfig();
      } else {
        const d = await res.json();
        toast.error(d.error || 'Gagal mencabut sesi', 'Error');
      }
    } catch {
      toast.error('Gagal mencabut sesi.', 'Error');
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingConfig(true);
    try {
      const res = await fetch('/api/sessions/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentUser.role,
          'x-user-id': currentUser.id
        },
        body: JSON.stringify(sessionConfig)
      });
      if (res.ok) {
        toast.success('Kebijakan sesi berhasil disimpan ke database.', 'Konfigurasi Sesi Tersimpan');
      } else {
        const d = await res.json();
        toast.error(d.error || 'Gagal menyimpan konfigurasi sesi', 'Error');
      }
    } catch {
      toast.error('Gagal menghubungi backend.', 'Error');
    } finally {
      setIsSavingConfig(false);
    }
  };

  if (!isOpen) return null;

  const filteredSessions = sessions.filter(s => {
    if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
    if (searchUser) {
      const q = searchUser.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        s.username.toLowerCase().includes(q) ||
        s.role.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white dark:bg-[#1E1138] rounded-2xl border border-[#D8CCF3] dark:border-[#3B1D78] shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/80 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                Manajemen Sesi Login Staf (Session Management)
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Kelola masa berlaku sesi, timeout aktivitas, dan pantau sesi aktif staf Dispatch, Leader, dan Installer.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-2 px-5 pt-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('monitoring')}
            className={`pb-2.5 px-3 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'monitoring'
                ? 'border-[#5B35B1] text-[#5B35B1] dark:text-[#E9E1FF] font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Monitoring Sesi Aktif ({sessions.filter(s => s.status === 'active').length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('config')}
            className={`pb-2.5 px-3 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'config'
                ? 'border-[#5B35B1] text-[#5B35B1] dark:text-[#E9E1FF] font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Pengaturan Kebijakan Sesi
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'monitoring' && (
            <div className="space-y-3">
              {/* Search & Status Filter */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari nama staf atau username..."
                    value={searchUser}
                    onChange={e => setSearchUser(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as any)}
                    className="py-1.5 px-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 font-medium"
                  >
                    <option value="ALL">Semua Sesi</option>
                    <option value="active">Aktif Saja</option>
                    <option value="expired">Kedaluwarsa</option>
                    <option value="revoked">Dicabut</option>
                  </select>
                  <button
                    type="button"
                    onClick={fetchSessionsAndConfig}
                    className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100"
                    title="Refresh"
                  >
                    <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {filteredSessions.length === 0 ? (
                <div className="p-8 text-center text-slate-400 space-y-1">
                  <Users className="w-7 h-7 mx-auto text-slate-300 dark:text-slate-700" />
                  <div className="font-semibold text-slate-600 dark:text-slate-400">Tidak ada sesi staf ditemukan.</div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50/50 dark:bg-slate-900/30">
                        <th className="py-2.5 px-3">Pengguna & Peran</th>
                        <th className="py-2.5 px-3">Waktu Login</th>
                        <th className="py-2.5 px-3">Aktivitas Terakhir</th>
                        <th className="py-2.5 px-3">Kedaluwarsa</th>
                        <th className="py-2.5 px-3">Perangkat</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Tindakan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans text-xs">
                      {filteredSessions.map(s => (
                        <tr key={s.sessionId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900 dark:text-white">{s.name}</div>
                            <div className="text-[11px] text-slate-400 font-mono">@{s.username} · <span className="capitalize">{s.role.replace('_', ' ')}</span></div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap text-[11px]">
                            {new Date(s.loginAt).toLocaleTimeString('id-ID')} WIB
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap text-[11px]">
                            {new Date(s.lastActivityAt).toLocaleTimeString('id-ID')} WIB
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap text-[11px]">
                            {new Date(s.expiresAt).toLocaleTimeString('id-ID')} WIB
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 text-[11px]">
                              {s.deviceType === 'mobile' ? <Smartphone className="w-3.5 h-3.5" /> : <Laptop className="w-3.5 h-3.5" />}
                              <span>{s.ipAddress || '127.0.0.1'}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              s.status === 'active'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                                : s.status === 'expired'
                                ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
                            }`}>
                              {s.status === 'active' ? 'Aktif' : s.status === 'expired' ? 'Kedaluwarsa' : 'Dicabut'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {s.status === 'active' && (
                              <button
                                type="button"
                                onClick={() => handleRevokeSession(s.sessionId, s.name)}
                                className="px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 rounded-lg transition-colors cursor-pointer"
                              >
                                Cabut Sesi
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'config' && (
            <form onSubmit={handleSaveConfig} className="space-y-4 max-w-xl">
              <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <h5 className="font-bold text-slate-900 dark:text-white text-xs">
                  Kebijakan Waktu Sesi (Duration & Timeout)
                </h5>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Durasi Maksimum Sesi (Jam):</label>
                    <input
                      type="number"
                      min={1}
                      max={72}
                      value={sessionConfig.sessionMaxDurationHours}
                      onChange={e => setSessionConfig({ ...sessionConfig, sessionMaxDurationHours: parseInt(e.target.value) || 8 })}
                      className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Batas Waktu Tidak Aktif / Idle (Menit):</label>
                    <input
                      type="number"
                      min={5}
                      max={480}
                      value={sessionConfig.idleTimeoutMinutes}
                      onChange={e => setSessionConfig({ ...sessionConfig, idleTimeoutMinutes: parseInt(e.target.value) || 60 })}
                      className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border rounded-lg text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Batas Maksimum Sesi Bersamaan per Akun:</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={sessionConfig.maxActiveSessionsPerUser}
                    onChange={e => setSessionConfig({ ...sessionConfig, maxActiveSessionsPerUser: parseInt(e.target.value) || 3 })}
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                <h5 className="font-bold text-slate-900 dark:text-white text-xs">
                  Otomatisasi Pembatalan Sesi
                </h5>

                <label className="flex items-center gap-2 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={sessionConfig.extendOnActivity}
                    onChange={e => setSessionConfig({ ...sessionConfig, extendOnActivity: e.target.checked })}
                    className="rounded text-[#5B35B1]"
                  />
                  <span>Perpanjang sesi otomatis saat pengguna aktif mengerjakan tiket</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={sessionConfig.revokeOnDeactivate}
                    onChange={e => setSessionConfig({ ...sessionConfig, revokeOnDeactivate: e.target.checked })}
                    className="rounded text-[#5B35B1]"
                  />
                  <span>Cabut seluruh sesi aktif saat akun dinonaktifkan oleh administrator</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={sessionConfig.revokeOnPasswordChange}
                    onChange={e => setSessionConfig({ ...sessionConfig, revokeOnPasswordChange: e.target.checked })}
                    className="rounded text-[#5B35B1]"
                  />
                  <span>Cabut seluruh sesi aktif saat kata sandi akun diubah</span>
                </label>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isSavingConfig}
                  className="px-5 py-2 bg-[#5B35B1] hover:bg-[#3B1D78] text-white rounded-xl font-bold text-xs shadow-md transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSavingConfig ? 'Menyimpan...' : 'Simpan Kebijakan Sesi'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end shrink-0 bg-slate-50/80 dark:bg-slate-800/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-xl font-semibold text-xs"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
