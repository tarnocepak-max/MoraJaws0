import React from 'react';
import { useOfflineSync } from '../../context/OfflineSyncContext';
import { WifiOff, Database, RefreshCw, ChevronRight } from 'lucide-react';

export const OfflineBanner: React.FC = () => {
  const { isOnline, isSimulatedOffline, pendingCount, setIsOfflineModalOpen, syncNow, isSyncing } = useOfflineSync();

  if (isOnline && pendingCount === 0) return null;

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 max-w-xl w-[92%] sm:w-auto animate-slideUp">
      <div className={`px-4 py-2.5 rounded-2xl shadow-xl border flex items-center justify-between gap-3 text-xs ${
        !isOnline
          ? 'bg-amber-900/90 text-amber-100 border-amber-600/60 backdrop-blur-md'
          : 'bg-indigo-900/90 text-indigo-100 border-indigo-600/60 backdrop-blur-md'
      }`}>
        <div className="flex items-center gap-2.5">
          <div className={`p-1.5 rounded-full ${!isOnline ? 'bg-amber-800 text-amber-200' : 'bg-indigo-800 text-indigo-200'}`}>
            {!isOnline ? <WifiOff className="w-4 h-4 animate-pulse" /> : <Database className="w-4 h-4" />}
          </div>
          <div>
            <div className="font-bold flex items-center gap-1.5">
              <span>{!isOnline ? (isSimulatedOffline ? 'Mode Simulasi Offline' : 'Mode Offline Aktif') : 'Koneksi Pulih'}</span>
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-400 text-amber-950">
                  {pendingCount} Tertunda
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-300 opacity-90 hidden sm:block">
              {!isOnline
                ? 'Data tersimpan di IndexedDB lokal perangkat Anda.'
                : `${pendingCount} perubahan siap disinkronkan ke server.`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isOnline && pendingCount > 0 && (
            <button
              onClick={() => syncNow()}
              disabled={isSyncing}
              className="flex items-center gap-1 px-3 py-1 bg-white text-indigo-950 font-bold rounded-lg shadow-sm hover:bg-indigo-50 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync'}</span>
            </button>
          )}

          <button
            onClick={() => setIsOfflineModalOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition-colors font-semibold"
          >
            <span>Pusat Sinkron</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
