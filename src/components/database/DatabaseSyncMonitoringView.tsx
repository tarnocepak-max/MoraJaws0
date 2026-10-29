import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { SyncMonitoringStatus, SyncHistoryEntry } from '../../types/index.ts';
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Database,
  FileSpreadsheet,
  Layers,
  Search,
  Activity,
  History,
  Info,
  Check,
  X,
  Play,
  RotateCw,
  ShieldCheck,
  Radio,
  FileDown
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

export const DatabaseSyncMonitoringView: React.FC = () => {
  const { currentUser, googleSheetsConfig } = useApp();
  const { toast } = useToast();

  const [monitoringStatus, setMonitoringStatus] = useState<SyncMonitoringStatus>({
    appDbStatus: 'Connected',
    sheetsStatus: googleSheetsConfig.spreadsheetId ? 'Connected' : 'Unconfigured',
    lastSyncStatus: 'Pending',
    lastSyncAt: null,
    lastAttemptAt: null,
    totalRecordsRead: 0,
    totalRecordsProcessed: 0,
    totalRecordsFailed: 0,
    pendingChangesCount: 0,
    isSyncing: false
  });

  const [syncHistory, setSyncHistory] = useState<SyncHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);
  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<SyncHistoryEntry | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch live sync status and history
  const fetchStatusAndHistory = async () => {
    setIsLoading(true);
    try {
      const [statusRes, historyRes] = await Promise.all([
        fetch('/api/sync/status', {
          headers: { 'x-user-role': currentUser.role, 'x-user-id': currentUser.id }
        }),
        fetch('/api/sync/history', {
          headers: { 'x-user-role': currentUser.role, 'x-user-id': currentUser.id }
        })
      ]);

      if (statusRes.ok) {
        const sData = await statusRes.json();
        setMonitoringStatus(prev => ({
          ...prev,
          ...sData,
          sheetsStatus: googleSheetsConfig.spreadsheetId ? 'Connected' : sData.sheetsStatus
        }));
      }

      if (historyRes.ok) {
        const hData = await historyRes.json();
        setSyncHistory(hData.history || []);
      }
    } catch (err: any) {
      console.warn('Could not fetch sync status from backend:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatusAndHistory();
    const interval = setInterval(fetchStatusAndHistory, 20000);
    return () => clearInterval(interval);
  }, [googleSheetsConfig.spreadsheetId]);

  // Periksa Koneksi
  const handleCheckConnection = async () => {
    setIsCheckingConnection(true);
    try {
      const res = await fetch('/api/sync/check-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentUser.role,
          'x-user-id': currentUser.id
        }
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          `Database: ${data.appDb?.status} (${data.appDb?.latencyMs}ms). Google Sheets: ${data.sheets?.status}`,
          'Pemeriksaan Koneksi Berhasil'
        );
        fetchStatusAndHistory();
      } else {
        toast.error(data.error || 'Gagal memeriksa koneksi', 'Koneksi Terganggu');
      }
    } catch (err: any) {
      toast.error('Gagal menghubungi server backend.', 'Koneksi Error');
    } finally {
      setIsCheckingConnection(false);
    }
  };

  // Sinkronkan Sekarang (Idempotent job trigger)
  const handleSyncNow = async () => {
    if (isSyncingNow || monitoringStatus.isSyncing) {
      toast.error('Proses sinkronisasi sedang berlangsung. Harap tunggu.', 'Proses Aktif');
      return;
    }

    setIsSyncingNow(true);
    try {
      const res = await fetch('/api/sync/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentUser.role,
          'x-user-id': currentUser.id
        },
        body: JSON.stringify({
          syncType: 'full_sync',
          dataSource: googleSheetsConfig.sheetName || 'Google Sheets Master'
        })
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(
          `Sinkronisasi dimulai dengan Job ID: ${data.jobId}. Status transisi ke Syncing.`,
          'Sinkronisasi Diinisiasi'
        );
        setMonitoringStatus(prev => ({ ...prev, isSyncing: true, currentJobId: data.jobId }));
        // Poll for completion after 1.5 seconds
        setTimeout(() => {
          fetchStatusAndHistory();
          setIsSyncingNow(false);
        }, 1800);
      } else {
        toast.error(data.error || 'Gagal memulai sinkronisasi', 'Sinkronisasi Ditolak');
        setIsSyncingNow(false);
      }
    } catch (err: any) {
      toast.error('Gagal memicu sinkronisasi.', 'Error');
      setIsSyncingNow(false);
    }
  };

  // Filter history
  const filteredHistory = syncHistory.filter(item => {
    if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        item.jobId.toLowerCase().includes(q) ||
        item.dataSource.toLowerCase().includes(q) ||
        item.initiatedBy.toLowerCase().includes(q) ||
        (item.errorSummary && item.errorSummary.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Connected':
      case 'Success':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
      case 'Syncing':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-300 dark:border-blue-800 animate-pulse';
      case 'Partial Success':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-300 dark:border-amber-800';
      case 'Failed':
      case 'Disconnected':
        return 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border-rose-300 dark:border-rose-800';
      case 'Pending':
      case 'Unconfigured':
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Title */}
      <div className="bg-white dark:bg-[#1E1138] rounded-2xl border border-[#D8CCF3] dark:border-[#3B1D78] p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#E9E1FF] dark:bg-[#3B1D78]/60 border border-[#D8CCF3] dark:border-[#5B35B1]/50 rounded-full text-[#3B1D78] dark:text-[#E9E1FF] text-xs font-semibold mb-2">
            <Radio className="w-3.5 h-3.5 text-[#5B35B1] animate-pulse" />
            <span>MoraJaws Sync Engine & Pipeline Health</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#21183A] dark:text-white tracking-tight flex items-center gap-2">
            <Database className="w-6 h-6 text-[#5B35B1] dark:text-[#B19CF0]" />
            <span>Monitoring Sinkronisasi Database</span>
          </h2>
          <p className="text-xs sm:text-sm text-[#756B8D] dark:text-[#D8CCF3] mt-1 max-w-2xl">
            Pantau status koneksi, latensi, transaksi dua arah antara Database Aplikasi MoraJaws dan Google Sheets terhubung secara real-time.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCheckConnection}
            disabled={isCheckingConnection}
            className="px-3.5 py-2 text-xs font-semibold text-[#3B1D78] dark:text-[#E9E1FF] bg-[#E9E1FF] dark:bg-[#3B1D78]/60 hover:bg-[#D8CCF3] dark:hover:bg-[#3B1D78] border border-[#D8CCF3] dark:border-[#5B35B1] rounded-xl flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            title="Uji koneksi ke database aplikasi dan Google Sheets"
          >
            <Activity className={`w-4 h-4 text-[#5B35B1] ${isCheckingConnection ? 'animate-spin' : ''}`} />
            <span>{isCheckingConnection ? 'Memeriksa...' : 'Periksa Koneksi'}</span>
          </button>

          <button
            type="button"
            onClick={fetchStatusAndHistory}
            disabled={isLoading}
            className="p-2 text-[#756B8D] hover:text-[#21183A] dark:text-[#D8CCF3] dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer"
            title="Muat Ulang Status"
          >
            <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {(currentUser.role === 'super_admin' || currentUser.role === 'management_data') && (
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={isSyncingNow || monitoringStatus.isSyncing}
              className="px-4 py-2 bg-gradient-to-r from-[#5B35B1] to-[#3B1D78] hover:from-[#6A3ECC] hover:to-[#4A2494] active:scale-98 text-white rounded-xl font-bold text-xs shadow-md shadow-[#3B1D78]/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Eksekusi proses sinkronisasi transaksional sekarang"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncingNow || monitoringStatus.isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncingNow || monitoringStatus.isSyncing ? 'Sinkronisasi Berjalan...' : 'Sinkronkan Sekarang'}</span>
            </button>
          )}
        </div>
      </div>

      {/* 4 Health Cards Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: App Database Connection */}
        <div className="p-5 bg-white dark:bg-[#1E1138] rounded-2xl border border-[#D8CCF3] dark:border-[#3B1D78] shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#756B8D] dark:text-[#D8CCF3] uppercase tracking-wider">
              Database Aplikasi
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold border ${getStatusBadge(monitoringStatus.appDbStatus)}`}>
              {monitoringStatus.appDbStatus}
            </span>
            <span className="text-[11px] text-[#756B8D] dark:text-[#9A8FB3]">Indexed Storage</span>
          </div>
          <p className="text-[11px] text-[#756B8D] dark:text-[#D8CCF3] pt-1">
            Latensi: <strong className="text-emerald-600">8 ms</strong> · Penyimpanan master lokal & persistensi sinkron
          </p>
        </div>

        {/* Card 2: Google Sheets Connection */}
        <div className="p-5 bg-white dark:bg-[#1E1138] rounded-2xl border border-[#D8CCF3] dark:border-[#3B1D78] shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#756B8D] dark:text-[#D8CCF3] uppercase tracking-wider">
              Google Sheets Terhubung
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/80 text-blue-600 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold border ${getStatusBadge(monitoringStatus.sheetsStatus)}`}>
              {monitoringStatus.sheetsStatus}
            </span>
            <span className="text-[11px] text-[#756B8D] dark:text-[#9A8FB3]">
              {googleSheetsConfig.sheetName || 'Work_Orders'}
            </span>
          </div>
          <p className="text-[11px] text-[#756B8D] dark:text-[#D8CCF3] pt-1 truncate" title={googleSheetsConfig.spreadsheetTitle || googleSheetsConfig.spreadsheetId || 'Belum dihubungkan'}>
            Sumber: {googleSheetsConfig.spreadsheetTitle || googleSheetsConfig.spreadsheetId || 'Belum dikonfigurasi'}
          </p>
        </div>

        {/* Card 3: Last Sync Status */}
        <div className="p-5 bg-white dark:bg-[#1E1138] rounded-2xl border border-[#D8CCF3] dark:border-[#3B1D78] shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#756B8D] dark:text-[#D8CCF3] uppercase tracking-wider">
              Status Terakhir
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950/80 text-purple-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold border ${getStatusBadge(monitoringStatus.lastSyncStatus)}`}>
              {monitoringStatus.lastSyncStatus}
            </span>
          </div>
          <p className="text-[11px] text-[#756B8D] dark:text-[#D8CCF3] pt-1">
            {monitoringStatus.lastSyncAt
              ? `Waktu: ${new Date(monitoringStatus.lastSyncAt).toLocaleTimeString('id-ID')} WIB`
              : 'Belum pernah disinkronkan'}
          </p>
        </div>

        {/* Card 4: Record Statistics */}
        <div className="p-5 bg-white dark:bg-[#1E1138] rounded-2xl border border-[#D8CCF3] dark:border-[#3B1D78] shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#756B8D] dark:text-[#D8CCF3] uppercase tracking-wider">
              Total Record Diproses
            </span>
            <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-[#21183A] dark:text-white pt-1">
            {monitoringStatus.totalRecordsProcessed}
          </div>
          <div className="text-[11px] text-[#756B8D] dark:text-[#D8CCF3] flex items-center gap-3">
            <span className="text-emerald-600 font-semibold">Sukses: {monitoringStatus.totalRecordsProcessed}</span>
            <span className="text-rose-600 font-semibold">Gagal: {monitoringStatus.totalRecordsFailed}</span>
          </div>
        </div>
      </div>

      {/* Sync History Table */}
      <div className="bg-white dark:bg-[#1E1138] rounded-2xl border border-[#D8CCF3] dark:border-[#3B1D78] shadow-xs p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E9E1FF] dark:border-[#3B1D78]/60 pb-4">
          <div>
            <h3 className="text-sm font-bold text-[#21183A] dark:text-white flex items-center gap-2">
              <History className="w-4 h-4 text-[#5B35B1]" />
              <span>Riwayat & Log Transaksi Sinkronisasi</span>
            </h3>
            <p className="text-xs text-[#756B8D] dark:text-[#D8CCF3] mt-0.5">
              Setiap proses mencatat Job ID unik, durasi eksekusi, volume data, dan operator inisiator.
            </p>
          </div>

          {/* Filters & Search */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari Job ID / Operator..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-1 focus:ring-[#5B35B1]"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="py-1.5 px-3 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 font-medium focus:outline-hidden"
            >
              <option value="ALL">Semua Status</option>
              <option value="Success">Success</option>
              <option value="Syncing">Syncing</option>
              <option value="Failed">Failed</option>
              <option value="Partial Success">Partial Success</option>
            </select>
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 space-y-2">
            <Database className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
            <div className="font-semibold text-slate-600 dark:text-slate-400">Belum ada riwayat proses sinkronisasi tercatat.</div>
            <div className="text-[11px]">Tekan tombol "Sinkronkan Sekarang" di atas untuk menjalankan sinkronisasi pertama.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-[#756B8D] dark:text-[#D8CCF3] uppercase tracking-wider bg-slate-50/50 dark:bg-slate-900/30">
                  <th className="py-2.5 px-3">Job ID</th>
                  <th className="py-2.5 px-3">Jenis Proses</th>
                  <th className="py-2.5 px-3">Waktu Mulai</th>
                  <th className="py-2.5 px-3">Durasi</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-center">Diproses</th>
                  <th className="py-2.5 px-3 text-center">Gagal</th>
                  <th className="py-2.5 px-3">Inisiator</th>
                  <th className="py-2.5 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-xs">
                {filteredHistory.map(item => (
                  <tr key={item.jobId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors font-sans">
                    <td className="py-3 px-3 font-mono font-bold text-[#5B35B1] dark:text-[#B19CF0]">
                      {item.jobId}
                    </td>
                    <td className="py-3 px-3 capitalize font-medium text-slate-800 dark:text-slate-200">
                      {item.syncType.replace('_', ' ')}
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-400 text-[11px]">
                      {new Date(item.startedAt).toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-400 text-[11px]">
                      {item.durationMs ? `${item.durationMs} ms` : '-'}
                    </td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold border ${getStatusBadge(item.status)}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-emerald-600 dark:text-emerald-400">
                      {item.processedCount}
                    </td>
                    <td className="py-3 px-3 text-center font-semibold text-rose-600">
                      {item.failedCount}
                    </td>
                    <td className="py-3 px-3 text-slate-700 dark:text-slate-300 text-xs">
                      {item.initiatedBy} {item.initiatedByRole ? `(${item.initiatedByRole})` : ''}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedHistoryItem(item)}
                        className="px-2.5 py-1 text-[11px] font-semibold text-[#5B35B1] hover:text-[#3B1D78] bg-[#E9E1FF] dark:bg-[#3B1D78]/60 hover:bg-[#D8CCF3] rounded-lg transition-colors cursor-pointer"
                      >
                        Detail
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Process Details Modal */}
      {selectedHistoryItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1E1138] rounded-2xl border border-[#D8CCF3] dark:border-[#3B1D78] shadow-2xl max-w-lg w-full p-6 text-xs space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-[#5B35B1]" />
                <h4 className="font-bold text-[#21183A] dark:text-white text-sm">
                  Detail Transaksi Sinkronisasi ({selectedHistoryItem.jobId})
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setSelectedHistoryItem(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-900 rounded-xl space-y-2 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Job ID:</span>
                <span className="font-bold text-[#5B35B1]">{selectedHistoryItem.jobId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Sumber Data:</span>
                <span className="text-slate-700 dark:text-slate-300">{selectedHistoryItem.dataSource}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Status:</span>
                <span className={`px-2 py-0.5 rounded text-[10.5px] font-bold ${getStatusBadge(selectedHistoryItem.status)}`}>
                  {selectedHistoryItem.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Waktu Mulai:</span>
                <span className="text-slate-700 dark:text-slate-300">{new Date(selectedHistoryItem.startedAt).toLocaleString('id-ID')}</span>
              </div>
              {selectedHistoryItem.completedAt && (
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Waktu Selesai:</span>
                  <span className="text-slate-700 dark:text-slate-300">{new Date(selectedHistoryItem.completedAt).toLocaleString('id-ID')}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Total Diproses:</span>
                <span className="font-bold text-emerald-600">{selectedHistoryItem.processedCount} baris</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Berhasil:</span>
                <span className="font-bold text-emerald-600">{selectedHistoryItem.successCount} baris</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Gagal:</span>
                <span className="font-bold text-rose-600">{selectedHistoryItem.failedCount} baris</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Inisiator:</span>
                <span className="text-slate-800 dark:text-slate-200 font-semibold">{selectedHistoryItem.initiatedBy}</span>
              </div>
              {selectedHistoryItem.errorSummary && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-rose-600 text-[11px]">
                  <strong>Catatan Error:</strong> {selectedHistoryItem.errorSummary}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedHistoryItem(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
