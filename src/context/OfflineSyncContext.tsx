import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  openOfflineDb,
  saveTicketsOffline,
  getOfflineTickets,
  addToSyncQueue,
  getPendingSyncQueue,
  getAllSyncQueue,
  updateSyncQueueItem,
  removeSyncQueueItem,
  clearSyncQueue,
  addSyncHistoryRecord,
  getSyncHistory,
  getOfflineSettings,
  saveOfflineSettings,
  exportOfflineDbBackup,
  importOfflineDbBackup,
  getStorageEstimate,
  clearEntireOfflineDb,
  SyncQueueItem,
  SyncHistoryRecord,
  OfflineSettings
} from '../services/offlineDb';
import { Ticket } from '../types/index.ts';
import { useToast } from './ToastContext';

interface OfflineSyncContextType {
  isOnline: boolean;
  isSimulatedOffline: boolean;
  toggleSimulatedOffline: () => void;
  isSyncing: boolean;
  pendingCount: number;
  pendingItems: SyncQueueItem[];
  syncHistory: SyncHistoryRecord[];
  lastSyncedAt: string | null;
  conflictStrategy: 'local_wins' | 'server_wins' | 'manual';
  setConflictStrategy: (strategy: 'local_wins' | 'server_wins' | 'manual') => Promise<void>;
  autoSyncOnReconnect: boolean;
  setAutoSyncOnReconnect: (enabled: boolean) => Promise<void>;
  storageStats: {
    usageBytes: number;
    quotaBytes: number;
    percentage: number;
    ticketCount: number;
    pendingCount: number;
  };
  isOfflineModalOpen: boolean;
  setIsOfflineModalOpen: (open: boolean) => void;

  enqueueChange: (item: {
    entity: SyncQueueItem['entity'];
    entityId: string;
    action: SyncQueueItem['action'];
    summary: string;
    payload: any;
    user: { id: string; name: string; role: string };
  }) => Promise<SyncQueueItem>;

  syncNow: () => Promise<{ success: boolean; syncedCount: number; failedCount: number; message: string }>;
  removeQueueItem: (id: string) => Promise<void>;
  clearQueue: () => Promise<void>;
  exportBackup: () => Promise<void>;
  importBackup: (file: File) => Promise<{ success: boolean; message: string }>;
  clearLocalDatabase: () => Promise<void>;
  refreshStorageStats: () => Promise<void>;

  // Register state updater from AppContext
  registerAppSyncHandler: (handler: (items: SyncQueueItem[]) => Promise<{ successCount: number; failedCount: number; errors: string[] }>) => void;
}

const OfflineSyncContext = createContext<OfflineSyncContextType | undefined>(undefined);

export const OfflineSyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { showToast } = useToast();
  const [networkOnline, setNetworkOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [isSimulatedOffline, setIsSimulatedOffline] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [pendingItems, setPendingItems] = useState<SyncQueueItem[]>([]);
  const [syncHistory, setSyncHistory] = useState<SyncHistoryRecord[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [conflictStrategy, setConflictStrategyState] = useState<'local_wins' | 'server_wins' | 'manual'>('local_wins');
  const [autoSyncOnReconnect, setAutoSyncOnReconnectState] = useState<boolean>(true);
  const [storageStats, setStorageStats] = useState({
    usageBytes: 0,
    quotaBytes: 0,
    percentage: 0,
    ticketCount: 0,
    pendingCount: 0
  });
  const [isOfflineModalOpen, setIsOfflineModalOpen] = useState<boolean>(false);

  // App sync handler ref (injected by AppContext)
  const appSyncHandlerRef = useRef<((items: SyncQueueItem[]) => Promise<{ successCount: number; failedCount: number; errors: string[] }>) | null>(null);

  const registerAppSyncHandler = useCallback((handler: (items: SyncQueueItem[]) => Promise<{ successCount: number; failedCount: number; errors: string[] }>) => {
    appSyncHandlerRef.current = handler;
  }, []);

  // Effective online status (false if browser offline OR simulated offline)
  const isOnline = networkOnline && !isSimulatedOffline;

  // Load initial settings and pending items from IndexedDB
  const refreshQueue = useCallback(async () => {
    try {
      const items = await getPendingSyncQueue();
      setPendingItems(items);
      const hist = await getSyncHistory();
      setSyncHistory(hist);
      const stats = await getStorageEstimate();
      setStorageStats(stats);
    } catch (err) {
      console.warn('Error refreshing sync queue from IndexedDB:', err);
    }
  }, []);

  const refreshStorageStats = useCallback(async () => {
    try {
      const stats = await getStorageEstimate();
      setStorageStats(stats);
    } catch (err) {
      console.warn('Error updating storage estimate:', err);
    }
  }, []);

  useEffect(() => {
    async function initDbAndSettings() {
      try {
        await openOfflineDb();
        const settings = await getOfflineSettings();
        setConflictStrategyState(settings.conflictResolution);
        setAutoSyncOnReconnectState(settings.autoSyncOnReconnect);
        setIsSimulatedOffline(settings.simulateOffline);
        setLastSyncedAt(settings.lastSyncedAt);

        await refreshQueue();
      } catch (e) {
        console.warn('Offline DB init error:', e);
      }
    }
    initDbAndSettings();
  }, [refreshQueue]);

  // Network listeners
  useEffect(() => {
    const handleOnline = () => {
      setNetworkOnline(true);
      showToast('Koneksi internet terdeteksi online', 'success');
    };

    const handleOffline = () => {
      setNetworkOnline(false);
      showToast('Koneksi terputus. Mode offline database lokal aktif.', 'warning');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [showToast]);

  // Execute sync
  const syncNow = useCallback(async (): Promise<{
    success: boolean;
    syncedCount: number;
    failedCount: number;
    message: string;
  }> => {
    if (!isOnline) {
      const msg = 'Tidak dapat menyinkronkan saat mode offline aktif.';
      showToast(msg, 'warning');
      return { success: false, syncedCount: 0, failedCount: 0, message: msg };
    }

    if (isSyncing) {
      return { success: false, syncedCount: 0, failedCount: 0, message: 'Sinkronisasi sedang berlangsung...' };
    }

    setIsSyncing(true);
    const startTime = Date.now();

    try {
      const currentQueue = await getPendingSyncQueue();

      if (currentQueue.length === 0) {
        setIsSyncing(false);
        const now = new Date().toISOString();
        setLastSyncedAt(now);
        await saveOfflineSettings({
          conflictResolution: conflictStrategy,
          autoSyncOnReconnect,
          simulateOffline: isSimulatedOffline,
          lastSyncedAt: now,
          syncIntervalMinutes: 5
        });

        await addSyncHistoryRecord({
          trigger: isSimulatedOffline ? 'simulated' : 'manual',
          itemsProcessed: 0,
          successCount: 0,
          failedCount: 0,
          durationMs: Date.now() - startTime,
          status: 'success',
          details: 'Pemeriksaan database: Seluruh data lokal sudah sinkron dengan server.'
        });

        showToast('Database offline sudah up-to-date! Tidak ada antrean pending.', 'info');
        await refreshQueue();
        return { success: true, syncedCount: 0, failedCount: 0, message: 'Database sudah tersinkronisasi.' };
      }

      // If AppContext registered a sync handler, run it
      let successCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      if (appSyncHandlerRef.current) {
        const result = await appSyncHandlerRef.current(currentQueue);
        successCount = result.successCount;
        failedCount = result.failedCount;
        errors.push(...result.errors);
      } else {
        // Fallback: mark items as synced
        for (const item of currentQueue) {
          try {
            await removeSyncQueueItem(item.id);
            successCount++;
          } catch (e: any) {
            failedCount++;
            errors.push(e?.message || 'Unknown error');
            await updateSyncQueueItem(item.id, {
              status: 'failed',
              retryCount: item.retryCount + 1,
              error: e?.message
            });
          }
        }
      }

      const durationMs = Date.now() - startTime;
      const now = new Date().toISOString();
      setLastSyncedAt(now);

      await saveOfflineSettings({
        conflictResolution: conflictStrategy,
        autoSyncOnReconnect,
        simulateOffline: isSimulatedOffline,
        lastSyncedAt: now,
        syncIntervalMinutes: 5
      });

      const historyRecord = await addSyncHistoryRecord({
        trigger: 'manual',
        itemsProcessed: currentQueue.length,
        successCount,
        failedCount,
        durationMs,
        status: failedCount === 0 ? 'success' : successCount > 0 ? 'partial' : 'failed',
        details: `Sinkronisasi ${successCount} berhasil, ${failedCount} gagal dari total ${currentQueue.length} antrean.`
      });

      await refreshQueue();
      setIsSyncing(false);

      if (failedCount === 0) {
        showToast(`Sinkronisasi sukses! ${successCount} perubahan telah diperbarui.`, 'success');
        return {
          success: true,
          syncedCount: successCount,
          failedCount: 0,
          message: `Berhasil menyinkronkan ${successCount} perubahan.`
        };
      } else {
        showToast(`Sinkronisasi parsial: ${successCount} berhasil, ${failedCount} gagal.`, 'warning');
        return {
          success: false,
          syncedCount: successCount,
          failedCount,
          message: `Sinkronisasi parsial: ${successCount} sukses, ${failedCount} gagal.`
        };
      }
    } catch (err: any) {
      setIsSyncing(false);
      const errMsg = err?.message || 'Gagal menjalankan sinkronisasi.';
      showToast(errMsg, 'error');
      await refreshQueue();
      return { success: false, syncedCount: 0, failedCount: 1, message: errMsg };
    }
  }, [isOnline, isSyncing, conflictStrategy, autoSyncOnReconnect, isSimulatedOffline, showToast, refreshQueue]);

  // Auto-sync when transitioning from offline to online
  useEffect(() => {
    if (isOnline && autoSyncOnReconnect && pendingItems.length > 0 && !isSyncing) {
      const timer = setTimeout(() => {
        showToast(`Tersambung ke internet. Menjalankan auto-sync untuk ${pendingItems.length} perubahan pending...`, 'info');
        syncNow();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isOnline, autoSyncOnReconnect, pendingItems.length, isSyncing, syncNow, showToast]);

  // Toggle simulated offline mode
  const toggleSimulatedOffline = useCallback(async () => {
    const nextState = !isSimulatedOffline;
    setIsSimulatedOffline(nextState);
    await saveOfflineSettings({
      conflictResolution: conflictStrategy,
      autoSyncOnReconnect,
      simulateOffline: nextState,
      lastSyncedAt,
      syncIntervalMinutes: 5
    });

    if (nextState) {
      showToast('Mode Simulasi Offline AKTIF. Aplikasi beroperasi dengan IndexedDB lokal.', 'warning');
    } else {
      showToast('Mode Simulasi Offline DINONAKTIFKAN. Kembali ke status jaringan normal.', 'success');
    }
  }, [isSimulatedOffline, conflictStrategy, autoSyncOnReconnect, lastSyncedAt, showToast]);

  // Conflict strategy changer
  const setConflictStrategy = useCallback(async (strategy: 'local_wins' | 'server_wins' | 'manual') => {
    setConflictStrategyState(strategy);
    await saveOfflineSettings({
      conflictResolution: strategy,
      autoSyncOnReconnect,
      simulateOffline: isSimulatedOffline,
      lastSyncedAt,
      syncIntervalMinutes: 5
    });
    showToast(`Strategi resolusi konflik diubah: ${strategy === 'local_wins' ? 'Prioritas Data Lokal' : strategy === 'server_wins' ? 'Prioritas Data Server' : 'Konfirmasi Manual'}`, 'info');
  }, [autoSyncOnReconnect, isSimulatedOffline, lastSyncedAt, showToast]);

  // Auto-sync on reconnect changer
  const setAutoSyncOnReconnect = useCallback(async (enabled: boolean) => {
    setAutoSyncOnReconnectState(enabled);
    await saveOfflineSettings({
      conflictResolution: conflictStrategy,
      autoSyncOnReconnect: enabled,
      simulateOffline: isSimulatedOffline,
      lastSyncedAt,
      syncIntervalMinutes: 5
    });
    showToast(`Auto-sync saat online: ${enabled ? 'Diaktifkan' : 'Dinonaktifkan'}`, 'info');
  }, [conflictStrategy, isSimulatedOffline, lastSyncedAt, showToast]);

  // Enqueue a mutation
  const enqueueChange = useCallback(async (item: {
    entity: SyncQueueItem['entity'];
    entityId: string;
    action: SyncQueueItem['action'];
    summary: string;
    payload: any;
    user: { id: string; name: string; role: string };
  }): Promise<SyncQueueItem> => {
    const queued = await addToSyncQueue(item);
    await refreshQueue();
    return queued;
  }, [refreshQueue]);

  // Remove a single queue item
  const removeQueueItem = useCallback(async (id: string) => {
    await removeSyncQueueItem(id);
    await refreshQueue();
    showToast('Item antrean berhasil dihapus.', 'info');
  }, [refreshQueue, showToast]);

  // Clear entire queue
  const clearQueue = useCallback(async () => {
    await clearSyncQueue();
    await refreshQueue();
    showToast('Seluruh antrean sinkronisasi telah dikosongkan.', 'info');
  }, [refreshQueue, showToast]);

  // Export JSON backup
  const exportBackup = useCallback(async () => {
    try {
      const backupJson = await exportOfflineDbBackup();
      const blob = new Blob([backupJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `morajaws_offline_db_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Cadangan database offline berhasil diunduh.', 'success');
    } catch (e: any) {
      showToast('Gagal mengekspor berkas cadangan: ' + e?.message, 'error');
    }
  }, [showToast]);

  // Import JSON backup
  const importBackup = useCallback(async (file: File): Promise<{ success: boolean; message: string }> => {
    try {
      const text = await file.text();
      const res = await importOfflineDbBackup(text);
      if (res.success) {
        await refreshQueue();
        showToast(`Berhasil memulihkan ${res.importedTickets} tiket ke database lokal.`, 'success');
        return { success: true, message: `Berhasil memulihkan ${res.importedTickets} tiket.` };
      } else {
        showToast('Gagal memulihkan database: ' + res.error, 'error');
        return { success: false, message: res.error || 'Gagal memulihkan database.' };
      }
    } catch (e: any) {
      showToast('Gagal membaca berkas: ' + e?.message, 'error');
      return { success: false, message: e?.message || 'Gagal membaca berkas.' };
    }
  }, [refreshQueue, showToast]);

  // Clear entire local DB
  const clearLocalDatabase = useCallback(async () => {
    try {
      await clearEntireOfflineDb();
      await refreshQueue();
      showToast('Database lokal berhasil dibersihkan.', 'info');
    } catch (e: any) {
      showToast('Gagal membersihkan database: ' + e?.message, 'error');
    }
  }, [refreshQueue, showToast]);

  return (
    <OfflineSyncContext.Provider
      value={{
        isOnline,
        isSimulatedOffline,
        toggleSimulatedOffline,
        isSyncing,
        pendingCount: pendingItems.length,
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
        enqueueChange,
        syncNow,
        removeQueueItem,
        clearQueue,
        exportBackup,
        importBackup,
        clearLocalDatabase,
        refreshStorageStats,
        registerAppSyncHandler
      }}
    >
      {children}
    </OfflineSyncContext.Provider>
  );
};

export const useOfflineSync = () => {
  const context = useContext(OfflineSyncContext);
  if (!context) {
    throw new Error('useOfflineSync must be used within an OfflineSyncProvider');
  }
  return context;
};
