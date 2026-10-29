import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  KeyRound,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Shield,
  Laptop,
  Smartphone,
  Download,
  Filter
} from 'lucide-react';

export const LoginLogView: React.FC = () => {
  const { auditLogs } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'success' | 'failed'>('ALL');

  const loginLogs = useMemo(() => {
    return auditLogs.filter(l => l.entity === 'auth' || l.action.toLowerCase().includes('login'));
  }, [auditLogs]);

  const filteredLogs = useMemo(() => {
    return loginLogs.filter(log => {
      const isSuccess = log.action.toLowerCase().includes('success');
      if (statusFilter === 'success' && !isSuccess) return false;
      if (statusFilter === 'failed' && isSuccess) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const m1 = log.performedBy.toLowerCase().includes(q);
        const m2 = log.details.toLowerCase().includes(q);
        const m3 = log.action.toLowerCase().includes(q);
        if (!m1 && !m2 && !m3) return false;
      }
      return true;
    });
  }, [loginLogs, statusFilter, searchTerm]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#5B35B1] text-white flex items-center justify-center font-bold shadow-xs">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#3B1D78] dark:text-purple-200 flex items-center gap-2">
              <span>Log Aktivitas Login Staf (Login Log)</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E9E1FF] text-[#3B1D78] dark:bg-purple-900/60 dark:text-purple-200">
                Keamanan & Deteksi Anomali
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Jejak audit seluruh autentikasi pengguna, percobaan gagal, pemblokiran brute-force, dan waktu login.
            </p>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari user / rincian login..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded-xl"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded-xl font-medium"
          >
            <option value="ALL">Semua Hasil Login</option>
            <option value="success">Login Berhasil</option>
            <option value="failed">Login Gagal / Diblokir</option>
          </select>
          <span className="text-slate-400 font-mono text-[11px]">
            {filteredLogs.length} Catatan
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 shadow-xs overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-xs">
            Tidak ada riwayat login yang cocok.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#F5F1FF] dark:bg-[#251545] text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase">
                <tr>
                  <th className="py-2.5 px-3">Waktu (WIB)</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Pengguna</th>
                  <th className="py-2.5 px-3">Peran / Role</th>
                  <th className="py-2.5 px-3">Detail & Aktivitas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredLogs.map(log => {
                  const isSuccess = log.action.toLowerCase().includes('success');
                  return (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString('id-ID')}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${
                          isSuccess
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        }`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                        {log.performedBy}
                      </td>
                      <td className="py-2.5 px-3 capitalize font-mono text-slate-500">
                        {log.userRole.replace('_', ' ')}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 max-w-md">
                        {log.details}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
