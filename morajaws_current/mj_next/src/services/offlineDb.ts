import { Ticket, Contractor, User, CoverageArea, RootCauseCategory } from '../types/index.ts';

export interface SyncQueueItem {
  id: string;
  entity: 'ticket' | 'technical_report' | 'message' | 'status_change' | 'assign' | 'contractor';
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'STATUS_CHANGE' | 'DELETE' | 'REPORT' | 'CHAT' | 'ASSIGN';
  summary: string;
  payload: any;
  createdAt: string;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  retryCount: number;
  error?: string;
  user: {
    id: string;
    name: string;
    role: string;
  };
}

export interface SyncHistoryRecord {
  id: string;
  timestamp: string;
  trigger: 'auto_online' | 'manual' | 'periodic' | 'simulated';
  itemsProcessed: number;
  successCount: number;
  failedCount: number;
  durationMs: number;
  status: 'success' | 'partial' | 'failed';
  details: string;
}

export interface OfflineSettings {
  conflictResolution: 'local_wins' | 'server_wins' | 'manual';
  autoSyncOnReconnect: boolean;
  simulateOffline: boolean;
  lastSyncedAt: string | null;
  syncIntervalMinutes: number;
}

const DB_NAME = 'MoraJaws_OfflineDB';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

/**
 * Open and initialize IndexedDB with stores for tickets, syncQueue, syncHistory, settings, and masterCache.
 */
export async function openOfflineDb(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. Tickets Object Store
      if (!db.objectStoreNames.contains('tickets')) {
        const ticketStore = db.createObjectStore('tickets', { keyPath: 'id' });
        ticketStore.createIndex('woNumber', 'woNumber', { unique: false });
        ticketStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        ticketStore.createIndex('installerName', 'installerName', { unique: false });
        ticketStore.createIndex('leaderName', 'leaderName', { unique: false });
        ticketStore.createIndex('_offlineSyncStatus', '_offlineSyncStatus', { unique: false });
      }

      // 2. Sync Queue Object Store (FIFO pending offline changes)
      if (!db.objectStoreNames.contains('syncQueue')) {
        const queueStore = db.createObjectStore('syncQueue', { keyPath: 'id' });
        queueStore.createIndex('status', 'status', { unique: false });
        queueStore.createIndex('createdAt', 'createdAt', { unique: false });
        queueStore.createIndex('entity', 'entity', { unique: false });
        queueStore.createIndex('entityId', 'entityId', { unique: false });
      }

      // 3. Sync History Object Store
      if (!db.objectStoreNames.contains('syncHistory')) {
        const historyStore = db.createObjectStore('syncHistory', { keyPath: 'id' });
        historyStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // 4. Offline Settings Object Store (Key-Value)
      if (!db.objectStoreNames.contains('offlineSettings')) {
        db.createObjectStore('offlineSettings', { keyPath: 'key' });
      }

      // 5. Master Data Cache Store (contractors, users, catalogs)
      if (!db.objectStoreNames.contains('masterCache')) {
        db.createObjectStore('masterCache', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Save full list of tickets into offline IndexedDB
 */
export async function saveTicketsOffline(tickets: Ticket[]): Promise<void> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tickets', 'readwrite');
    const store = tx.objectStore('tickets');

    // Put each ticket
    tickets.forEach(ticket => {
      store.put(ticket);
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Save or update a single ticket offline
 */
export async function saveTicketOffline(ticket: Ticket): Promise<void> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tickets', 'readwrite');
    const store = tx.objectStore('tickets');
    const req = store.put(ticket);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get all tickets stored in offline IndexedDB
 */
export async function getOfflineTickets(): Promise<Ticket[]> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tickets', 'readonly');
    const store = tx.objectStore('tickets');
    const req = store.getAll();

    req.onsuccess = () => {
      resolve(req.result || []);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Add a pending operation to the offline sync queue
 */
export async function addToSyncQueue(
  item: Omit<SyncQueueItem, 'id' | 'createdAt' | 'status' | 'retryCount'>
): Promise<SyncQueueItem> {
  const db = await openOfflineDb();
  const queueItem: SyncQueueItem = {
    ...item,
    id: 'sync-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    createdAt: new Date().toISOString(),
    status: 'pending',
    retryCount: 0
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readwrite');
    const store = tx.objectStore('syncQueue');
    const req = store.put(queueItem);

    req.onsuccess = () => resolve(queueItem);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get all pending sync queue items
 */
export async function getPendingSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readonly');
    const store = tx.objectStore('syncQueue');
    const req = store.getAll();

    req.onsuccess = () => {
      const all: SyncQueueItem[] = req.result || [];
      const pending = all.filter(i => i.status === 'pending' || i.status === 'failed');
      // Sort oldest first (FIFO)
      pending.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      resolve(pending);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get all sync queue items regardless of status
 */
export async function getAllSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readonly');
    const store = tx.objectStore('syncQueue');
    const req = store.getAll();

    req.onsuccess = () => {
      const all: SyncQueueItem[] = req.result || [];
      all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      resolve(all);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Update a sync queue item
 */
export async function updateSyncQueueItem(id: string, updates: Partial<SyncQueueItem>): Promise<void> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readwrite');
    const store = tx.objectStore('syncQueue');
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      if (!getReq.result) {
        resolve();
        return;
      }
      const updated = { ...getReq.result, ...updates };
      const putReq = store.put(updated);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Remove an item from the sync queue
 */
export async function removeSyncQueueItem(id: string): Promise<void> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readwrite');
    const store = tx.objectStore('syncQueue');
    const req = store.delete(id);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Clear the entire sync queue
 */
export async function clearSyncQueue(): Promise<void> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readwrite');
    const store = tx.objectStore('syncQueue');
    const req = store.clear();

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Add a record to the sync history log
 */
export async function addSyncHistoryRecord(
  record: Omit<SyncHistoryRecord, 'id' | 'timestamp'>
): Promise<SyncHistoryRecord> {
  const db = await openOfflineDb();
  const entry: SyncHistoryRecord = {
    ...record,
    id: 'synchist-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    timestamp: new Date().toISOString()
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncHistory', 'readwrite');
    const store = tx.objectStore('syncHistory');
    const req = store.put(entry);

    req.onsuccess = () => resolve(entry);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get sync history (up to last 50 entries)
 */
export async function getSyncHistory(): Promise<SyncHistoryRecord[]> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncHistory', 'readonly');
    const store = tx.objectStore('syncHistory');
    const req = store.getAll();

    req.onsuccess = () => {
      const records: SyncHistoryRecord[] = req.result || [];
      records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      resolve(records.slice(0, 50));
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Default offline settings
 */
export const DEFAULT_OFFLINE_SETTINGS: OfflineSettings = {
  conflictResolution: 'local_wins',
  autoSyncOnReconnect: true,
  simulateOffline: false,
  lastSyncedAt: null,
  syncIntervalMinutes: 5
};

/**
 * Load offline settings
 */
export async function getOfflineSettings(): Promise<OfflineSettings> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineSettings', 'readonly');
    const store = tx.objectStore('offlineSettings');
    const req = store.get('config');

    req.onsuccess = () => {
      if (req.result && req.result.value) {
        resolve({ ...DEFAULT_OFFLINE_SETTINGS, ...req.result.value });
      } else {
        resolve(DEFAULT_OFFLINE_SETTINGS);
      }
    };
    req.onerror = () => resolve(DEFAULT_OFFLINE_SETTINGS);
  });
}

/**
 * Save offline settings
 */
export async function saveOfflineSettings(settings: OfflineSettings): Promise<void> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineSettings', 'readwrite');
    const store = tx.objectStore('offlineSettings');
    const req = store.put({ key: 'config', value: settings });

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Cache master data for offline access
 */
export async function cacheMasterData(data: {
  contractors: Contractor[];
  users: User[];
  coverageAreas: CoverageArea[];
  rootCauses: RootCauseCategory[];
}): Promise<void> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('masterCache', 'readwrite');
    const store = tx.objectStore('masterCache');

    store.put({ key: 'contractors', value: data.contractors });
    store.put({ key: 'users', value: data.users });
    store.put({ key: 'coverageAreas', value: data.coverageAreas });
    store.put({ key: 'rootCauses', value: data.rootCauses });
    store.put({ key: 'cachedAt', value: new Date().toISOString() });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Export complete offline database as a JSON string for offline sharing/backup
 */
export async function exportOfflineDbBackup(): Promise<string> {
  const tickets = await getOfflineTickets();
  const queue = await getAllSyncQueue();
  const history = await getSyncHistory();
  const settings = await getOfflineSettings();

  const backupData = {
    version: '1.0',
    appName: 'MoraJaws Offline Database Backup',
    exportedAt: new Date().toISOString(),
    stats: {
      ticketsCount: tickets.length,
      queueCount: queue.length,
      historyCount: history.length
    },
    settings,
    tickets,
    syncQueue: queue,
    syncHistory: history
  };

  return JSON.stringify(backupData, null, 2);
}

/**
 * Restore offline database from JSON string
 */
export async function importOfflineDbBackup(jsonString: string): Promise<{ success: boolean; importedTickets: number; error?: string }> {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed.tickets || !Array.isArray(parsed.tickets)) {
      return { success: false, importedTickets: 0, error: 'Format berkas cadangan tidak valid (tidak ada data tiket).' };
    }

    await saveTicketsOffline(parsed.tickets);

    if (Array.isArray(parsed.syncQueue) && parsed.syncQueue.length > 0) {
      const db = await openOfflineDb();
      const tx = db.transaction('syncQueue', 'readwrite');
      const store = tx.objectStore('syncQueue');
      parsed.syncQueue.forEach((item: SyncQueueItem) => store.put(item));
    }

    if (parsed.settings) {
      await saveOfflineSettings({ ...DEFAULT_OFFLINE_SETTINGS, ...parsed.settings });
    }

    return {
      success: true,
      importedTickets: parsed.tickets.length
    };
  } catch (err: any) {
    return {
      success: false,
      importedTickets: 0,
      error: err?.message || 'Gagal membaca berkas cadangan JSON.'
    };
  }
}

/**
 * Get storage statistics (estimated bytes used and ticket/queue counts)
 */
export async function getStorageEstimate(): Promise<{
  usageBytes: number;
  quotaBytes: number;
  percentage: number;
  ticketCount: number;
  pendingCount: number;
}> {
  let usage = 0;
  let quota = 0;

  if (navigator.storage && navigator.storage.estimate) {
    try {
      const est = await navigator.storage.estimate();
      usage = est.usage || 0;
      quota = est.quota || 0;
    } catch (e) {}
  }

  const tickets = await getOfflineTickets().catch(() => []);
  const pending = await getPendingSyncQueue().catch(() => []);

  const percentage = quota > 0 ? Math.min(100, (usage / quota) * 100) : 0;

  return {
    usageBytes: usage,
    quotaBytes: quota,
    percentage,
    ticketCount: tickets.length,
    pendingCount: pending.length
  };
}

/**
 * Reset and clear offline database
 */
export async function clearEntireOfflineDb(): Promise<void> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['tickets', 'syncQueue', 'syncHistory'], 'readwrite');
    tx.objectStore('tickets').clear();
    tx.objectStore('syncQueue').clear();
    tx.objectStore('syncHistory').clear();

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
