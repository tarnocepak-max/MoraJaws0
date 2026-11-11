import React, { useState, useRef } from 'react';
import { useOfflineSync } from '../../context/OfflineSyncContext';
import { useApp } from '../../context/AppContext';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Database,
  Cloud,
  CloudOff,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Trash2,
  Download,
  Upload,
  Sliders,
  X,
  FileText,
  MessageSquare,
  UserCheck,
  ChevronRight,
  HardDrive,
  ShieldCheck,
  Activity,
  Check,
  RotateCcw
} from 'lucide-react';

export const OfflineSyncModal: React.FC = () => {
  const {
    isOnline,
    isSimulatedOffline,
    toggleSimulatedOffline,
    isSyncing,
    pendingCount,
    pendingItems,
    syncHistory,
    lastSyncedAt,
    conflictStrategy,
    setConflictStrategy,
    autoSyncOnReconnect,
    setAutoSyncOnReconnect,
    storageStats,
    isOfflineModalOpen,
    setIsOfflineModalOpen,
    syncNow,
    removeQueueItem,
    clearQueue,
    exportBackup,
    importBackup,
    clearLocalDatabase,
    refreshStorageStats
  } = useOfflineSync();

  const { tickets } = useApp();
  const [activeTab, setActiveTab] = useState<'status' | 'queue' | 'history' | 'backup'>('status');
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOfflineModalOpen) return null;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDateTime = (isoString?: string | null) => {
    if (!isoString) return 'Belum pernah sinkron';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    await importBackup(file);
    setIsImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'STATUS_CHANGE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
            <Activity className="w-3 h-3" /> Status WO
          </span>
        );
      case 'REPORT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
            <FileText className="w-3 h-3" /> Laporan Teknis
          </span>
        );
      case 'CHAT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
            <MessageSquare className="w-3 h-3" /> Pesan Chat
          </span>
        );
      case 'ASSIGN':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
            <UserCheck className="w-3 h-3" /> Penugasan
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            {action}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${
              !isOnline
                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
                : pendingCount > 0
                ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
            }`}>
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Pusat Sinkronisasi Database Offline
                </h2>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  !isOnline
                    ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                    : 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                }`}>
                  {isOnline ? (
                    <>
                      <Wifi className="w-3 h-3 text-emerald-600" />
                      <span>Online</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3 h-3 text-amber-600" />
                      <span>{isSimulatedOffline ? 'Simulasi Offline' : 'Offline'}</span>
                    </>
                  )}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Penyimpanan lokal IndexedDB untuk teknisi lapangan tanpa internet dengan antrean sinkronisasi otomatis
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsOfflineModalOpen(false)}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-5 pt-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold overflow-x-auto">
          <button
            onClick={() => setActiveTab('status')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'status'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Status & Sinkronisasi</span>
          </button>

          <button
            onClick={() => setActiveTab('queue')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'queue'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Antrean Tertunda</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'history'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Riwayat Sinkron</span>
          </button>

          <button
            onClick={() => setActiveTab('backup')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'backup'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Cadangan & Alat</span>
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* TAB 1: STATUS & SINKRONISASI */}
          {activeTab === 'status' && (
            <div className="space-y-5">
              {/* Connection Status Card */}
              <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                !isOnline
                  ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50'
                  : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50'
              }`}>
                <div className="flex items-start sm:items-center gap-3">
                  <div className={`p-2.5 rounded-full ${
                    !isOnline
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300'
                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300'
                  }`}>
                    {!isOnline ? <CloudOff className="w-5 h-5" /> : <Cloud className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {!isOnline ? 'Aplikasi Berjalan dalam Mode Offline' : 'Koneksi Server Terhubung (Online)'}
                      </h3>
                      {isSimulatedOffline && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
                          Simulasi
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                      {!isOnline
                        ? 'Seluruh penutupan WO, update laporan teknis, dan live chat disimpan langsung di IndexedDB lokal browser Anda.'
                        : 'Sistem siap melakukan sinkronisasi otomatis dua arah saat ada perubahan baru.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                  <button
                    type="button"
                    onClick={toggleSimulatedOffline}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      isSimulatedOffline
                        ? 'bg-purple-600 text-white border-purple-600 hover:bg-purple-700'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {isSimulatedOffline ? 'Matikan Simulasi' : 'Uji Mode Offline'}
                  </button>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                    WO Tersimpan Lokal
                  </span>
                  <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                    {tickets.length} <span className="text-xs font-normal text-slate-500">tiket</span>
                  </div>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-1">
                    <CheckCircle2 className="w-3 h-3" /> Siap diakses offline
                  </span>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                    Antrean Tertunda
                  </span>
                  <div className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                    {pendingCount} <span className="text-xs font-normal text-slate-500">aksi</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    {pendingCount === 0 ? 'Semua tersinkron' : 'Menunggu koneksi'}
                  </span>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                    Terakhir Sinkron
                  </span>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1.5 leading-snug">
                    {formatDateTime(lastSyncedAt)}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block font-mono">
                    Status: OK
                  </span>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                    Storage IndexedDB
                  </span>
                  <div className="text-sm font-bold text-slate-900 dark:text-white mt-1.5">
                    {formatBytes(storageStats.usageBytes)}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Kapasitas aman browser
                  </span>
                </div>
              </div>

              {/* Force Sync Action Button */}
              <div className="p-4 bg-indigo-50/70 dark:bg-indigo-950/30 rounded-xl border border-indigo-200 dark:border-indigo-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-indigo-950 dark:text-indigo-200">
                    Sinkronisasi Manual Dua Arah
                  </h4>
                  <p className="text-[11px] text-indigo-700 dark:text-indigo-300 mt-0.5">
                    Kirim antrean mutasi offline ke server dan unduh pembaruan data tiket terbaru ke perangkat.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => syncNow()}
                  disabled={!isOnline || isSyncing}
                  className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs text-white shadow-md transition-all ${
                    !isOnline
                      ? 'bg-slate-400 dark:bg-slate-700 cursor-not-allowed opacity-60'
                      : isSyncing
                      ? 'bg-indigo-400 cursor-wait'
                      : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95'
                  }`}
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Sekarang'}</span>
                </button>
              </div>

              {/* Quick Guide for Field Technicians */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Panduan Operasional Lapangan (Offline Field Ops):</span>
                </div>
                <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-400 text-[11.5px]">
                  <li>Saat berada di area tanpa sinyal (basement, cluster terpencil), Anda tetap dapat membuka tiket, mengunggah foto laporan teknis, dan mengganti status tiket menjadi <strong>Done / Reschedule / Pending</strong>.</li>
                  <li>Perubahan tersebut otomatis diberi tanda status <span className="font-semibold text-amber-600">Tertunda Sync</span> di perangkat.</li>
                  <li>Begitu ponsel/laptop kembali mendapatkan internet atau Wi-Fi, sistem akan otomatis mengirim seluruh antrean data secara aman tanpa risiko kehilangan data.</li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB 2: ANTREAN TERTUNDA (PENDING QUEUE) */}
          {activeTab === 'queue' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Daftar Antrean Sinkronisasi ({pendingItems.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Aksi yang dilakukan saat offline dan belum dikirim ke server pusat
                  </p>
                </div>

                {pendingItems.length > 0 && (
                  <button
                    type="button"
                    onClick={clearQueue}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Kosongkan Antrean</span>
                  </button>
                )}
              </div>

              {pendingItems.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center mb-2">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Tidak Ada Antrean Tertunda
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Seluruh perubahan tiket, laporan, dan obrolan sudah tersinkronisasi 100% dengan database utama.
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {pendingItems.map(item => (
                    <div
                      key={item.id}
                      className="p-3.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-start gap-3 flex-1">
                        <div className="mt-0.5">
                          {getActionBadge(item.action)}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {item.summary}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-500 font-mono">
                            <span>ID: {item.entityId}</span>
                            <span>•</span>
                            <span>Oleh: {item.user.name} ({item.user.role})</span>
                            <span>•</span>
                            <span>{formatDateTime(item.createdAt)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                        <button
                          type="button"
                          onClick={() => removeQueueItem(item.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-md transition-colors"
                          title="Hapus item ini dari antrean"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: RIWAYAT SINKRONISASI */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Riwayat Log Sinkronisasi
                </h3>
                <p className="text-xs text-slate-500">
                  Catatan audit proses sinkronisasi database offline ke server
                </p>
              </div>

              {syncHistory.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700">
                  <Activity className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                  <p className="text-xs text-slate-500">Belum ada riwayat aktivitas sinkronisasi yang dicatat.</p>
                </div>
              ) : (
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {syncHistory.map(hist => (
                    <div key={hist.id} className="p-3 bg-white dark:bg-slate-900 flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200">
                          <span className={`w-2 h-2 rounded-full ${
                            hist.status === 'success' ? 'bg-emerald-500' : hist.status === 'partial' ? 'bg-amber-500' : 'bg-rose-500'
                          }`} />
                          <span>{hist.details}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 font-mono flex items-center gap-2">
                          <span>{formatDateTime(hist.timestamp)}</span>
                          <span>•</span>
                          <span>Durasi: {hist.durationMs}ms</span>
                          <span>•</span>
                          <span className="capitalize">Pemicu: {hist.trigger.replace('_', ' ')}</span>
                        </div>
                      </div>

                      <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 shrink-0">
                        {hist.successCount} sukses / {hist.itemsProcessed} total
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: CADANGAN & ALAT (BACKUP & RESTORE) */}
          {activeTab === 'backup' && (
            <div className="space-y-5 text-xs">
              {/* Conflict Strategy Settings */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-600" />
                  <span>Pengaturan Resolusi Konflik Data</span>
                </h4>
                <p className="text-slate-500 text-[11px]">
                  Tentukan bagaimana sistem menangani jika data tiket yang diedit secara offline diubah oleh pengguna lain di server:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <label className={`p-3 rounded-lg border cursor-pointer flex items-start gap-2.5 transition-colors ${
                    conflictStrategy === 'local_wins'
                      ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-500 text-indigo-950 dark:text-indigo-200'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}>
                    <input
                      type="radio"
                      name="conflictStrategy"
                      checked={conflictStrategy === 'local_wins'}
                      onChange={() => setConflictStrategy('local_wins')}
                      className="mt-0.5 text-indigo-600"
                    />
                    <div>
                      <span className="font-bold block">Prioritas Lokal Menang (Local Wins)</span>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        Perubahan dari teknisi lapangan diutamakan menimpa data server (Direkomendasikan untuk operational dispatch).
                      </span>
                    </div>
                  </label>

                  <label className={`p-3 rounded-lg border cursor-pointer flex items-start gap-2.5 transition-colors ${
                    conflictStrategy === 'server_wins'
                      ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-500 text-indigo-950 dark:text-indigo-200'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}>
                    <input
                      type="radio"
                      name="conflictStrategy"
                      checked={conflictStrategy === 'server_wins'}
                      onChange={() => setConflictStrategy('server_wins')}
                      className="mt-0.5 text-indigo-600"
                    />
                    <div>
                      <span className="font-bold block">Prioritas Server Menang (Server Wins)</span>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        Data server pusat diutamakan jika terdapat pembaruan yang bertabrakan.
                      </span>
                    </div>
                  </label>
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-slate-200 dark:border-slate-700">
                  <span className="font-medium text-slate-700 dark:text-slate-300 text-[11.5px]">
                    Otomatis sinkron saat internet kembali online
                  </span>
                  <input
                    type="checkbox"
                    checked={autoSyncOnReconnect}
                    onChange={e => setAutoSyncOnReconnect(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                </div>
              </div>

              {/* Offline Database Export & Import */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-600" />
                  <span>Cadangan Berkas Database Offline (.JSON)</span>
                </h4>
                <p className="text-slate-500 text-[11px]">
                  Unduh seluruh database offline lokal ke berkas JSON untuk dibagikan via flashdisk / WhatsApp jika teknisi tidak terhubung internet dalam durasi lama.
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={exportBackup}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-sm transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Unduh Cadangan JSON</span>
                  </button>

                  <label className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 font-semibold rounded-lg cursor-pointer transition-colors">
                    <Upload className="w-4 h-4 text-indigo-600" />
                    <span>{isImporting ? 'Memulihkan...' : 'Impor & Pulihkan Cadangan'}</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json"
                      onChange={handleFileUpload}
                      className="hidden"
                      disabled={isImporting}
                    />
                  </label>
                </div>
              </div>

              {/* Maintenance & Reset */}
              <div className="p-4 bg-rose-50/50 dark:bg-rose-950/20 rounded-xl border border-rose-200 dark:border-rose-900/40 flex items-center justify-between gap-4">
                <div>
                  <h5 className="font-bold text-rose-900 dark:text-rose-200">
                    Bersihkan Cache Database Lokal
                  </h5>
                  <p className="text-[11px] text-rose-700 dark:text-rose-300 mt-0.5">
                    Hapus salinan database IndexedDB di browser ini dan unduh ulang dataset segar dari server.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Yakin ingin mereset database offline lokal di perangkat ini?')) {
                      clearLocalDatabase();
                    }
                  }}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg shrink-0 transition-colors"
                >
                  Reset DB Lokal
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-500 font-mono text-[11px]">
            <HardDrive className="w-3.5 h-3.5" />
            <span>MoraJaws Offline Storage Engine v1.0 (IndexedDB)</span>
          </div>

          <button
            type="button"
            onClick={() => setIsOfflineModalOpen(false)}
            className="px-4 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 font-semibold text-slate-800 dark:text-slate-200 rounded-lg transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
