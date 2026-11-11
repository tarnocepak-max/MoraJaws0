export interface GoogleSpreadsheetMeta {
  id: string;
  title: string;
  url: string;
  sheets: string[];
}

export type SheetSyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'connected' | 'unconfigured' | 'invalid_credentials';

export interface GoogleSheetsConfig {
  spreadsheetId: string;
  spreadsheetUrl?: string;
  spreadsheetTitle?: string;
  sheetName: string;
  autoSyncEnabled: boolean;
  enabled?: boolean;
  syncIntervalMinutes: number;
  syncInterval?: number;
  autoExportOnStatusChange?: boolean;
  syncDirection: 'both' | 'export_only' | 'import_only';
  autoRegisterContractors: boolean;
  lastSyncAt?: string;
  lastSyncStatus: 'idle' | 'syncing' | 'success' | 'error';
  lastSyncMessage?: string;
  syncedRowCount?: number;
  lastPulledCount?: number;
  lastPushedCount?: number;
  accountEmail?: string;
  accountName?: string;
}

export interface SheetSyncResult {
  success: boolean;
  message: string;
  pulledCount?: number;
  pushedCount?: number;
  newContractorsCount?: number;
  timestamp: string;
  error?: string;
}

export const DEFAULT_SHEETS_CONFIG: GoogleSheetsConfig = {
  spreadsheetId: '',
  spreadsheetUrl: '',
  spreadsheetTitle: '',
  sheetName: 'Work_Orders',
  autoSyncEnabled: false,
  enabled: false,
  syncIntervalMinutes: 15,
  syncInterval: 15,
  autoExportOnStatusChange: true,
  syncDirection: 'both',
  autoRegisterContractors: true,
  lastSyncAt: undefined,
  lastSyncStatus: 'idle',
  lastSyncMessage: '',
  syncedRowCount: 0,
  lastPulledCount: 0,
  lastPushedCount: 0,
  accountEmail: '',
  accountName: ''
};
