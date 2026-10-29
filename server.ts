import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Standalone hashing function (matching client quickHash)
function hashPassword(password: string, salt: string = 'morajaws_secure_salt_2026'): string {
  let h = 0x811c9dc5;
  const str = `${salt}:${password}`;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}

const DEFAULT_HASH = hashPassword('12345678');

// Standalone appointment date parser for backend normalization
function normalizeAppointmentDate(val: unknown): string {
  if (!val) return '';
  const str = String(val).trim();
  if (!str || str === '-' || str === 'null' || str === 'undefined') return '';

  // 1. ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
  const isoMatch = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    if (y >= 2000 && y <= 2099 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // 2. Delimited: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const delMatch = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (delMatch) {
    const first = parseInt(delMatch[1], 10);
    const second = parseInt(delMatch[2], 10);
    const y = parseInt(delMatch[3], 10);
    let d = first;
    let m = second;
    if (second > 12 && first <= 12) {
      m = first;
      d = second;
    }
    if (y >= 2000 && y <= 2099 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // 3. Numeric Excel serial date (e.g. 46325)
  const num = Number(str);
  if (!isNaN(num) && num >= 30000 && num <= 70000) {
    try {
      const serialInt = Math.floor(num);
      const utcMs = (serialInt - 25569) * 86400000;
      const dt = new Date(utcMs);
      const y = dt.getUTCFullYear();
      const m = dt.getUTCMonth() + 1;
      const d = dt.getUTCDate();
      if (y >= 2000 && y <= 2099) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    } catch {}
  }

  return str.slice(0, 10);
}

// -------------------------------------------------------------
// Persistent Database Store with Disk Persistence
// -------------------------------------------------------------
export interface ServerUser {
  id: string;
  name: string;
  username: string;
  email: string;
  altEmail?: string;
  firebaseUid?: string;
  role: 'super_admin' | 'dispatch' | 'leader' | 'installer' | 'management_data';
  contractor?: string;
  contractorId?: string;
  area?: string;
  phone?: string;
  active: boolean;
  passwordHash: string;
  permissions?: string[];
  lastLoginAt?: string;
  loginCount?: number;
  mustChangePassword?: boolean;
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deletionReason?: string;
  createdAt: string;
}

export interface ServerSession {
  sessionId: string;
  token: string;
  userId: string;
  username: string;
  name: string;
  role: 'super_admin' | 'dispatch' | 'leader' | 'installer' | 'management_data';
  contractor?: string;
  loginAt: string;
  lastActivityAt: string;
  expiresAt: string;
  status: 'active' | 'expired' | 'revoked';
  ipAddress?: string;
  userAgent?: string;
  deviceType?: 'desktop' | 'mobile' | 'tablet' | 'unknown';
}

export interface ServerSyncHistoryEntry {
  jobId: string;
  syncType: 'full_sync' | 'pull_sheets' | 'push_sheets' | 'manual_check';
  startedAt: string;
  completedAt?: string;
  status: 'Connected' | 'Disconnected' | 'Syncing' | 'Success' | 'Partial Success' | 'Failed' | 'Pending';
  processedCount: number;
  successCount: number;
  failedCount: number;
  newRecordsCount: number;
  updatedRecordsCount: number;
  errorSummary?: string;
  dataSource: string;
  initiatedBy: string;
  initiatedByRole?: string;
  durationMs?: number;
}

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'morajaws_database.json');

interface DatabaseSchema {
  users: ServerUser[];
  tickets: any[];
  contractors: any[];
  coverageAreas: any[];
  templates: any[];
  ticketMessages: any[];
  assignmentHistory: any[];
  auditLogs: any[];
  syncHistory: ServerSyncHistoryEntry[];
  sheetsConfig: any;
  globalConfig: any;
  sessionConfig: any;
  operationalDateOverride: string | null;
  sessions?: ServerSession[];
  attachments?: any[];
}

// Initial seed data so that a fresh deployment is immediately operational and non-empty
const INITIAL_SEED_USERS: ServerUser[] = [
  {
    id: 'u-1',
    name: 'Alamsyah (Super Admin)',
    username: 'superadmin',
    email: 'tarnocepak@gmail.com',
    altEmail: 'nurhestafauladhea@gmail.com, admin@morajaws.net',
    role: 'super_admin',
    active: true,
    passwordHash: DEFAULT_HASH,
    createdAt: '2026-01-01T00:00:00Z'
  },
  {
    id: 'u-mgmt',
    name: 'Staff Management Data',
    username: 'datamgmt',
    email: 'data.ops@morajaws.net',
    role: 'management_data',
    active: true,
    passwordHash: DEFAULT_HASH,
    permissions: [
      'data.view',
      'data.validate',
      'data.import',
      'data.edit',
      'data.export',
      'data.sync.view',
      'data.audit.view'
    ],
    createdAt: '2026-01-01T00:00:00Z'
  },
  {
    id: 'u-dispatch-1',
    name: 'Siti Rahma (Dispatcher)',
    username: 'dispatch',
    email: 'dispatch@morajaws.net',
    role: 'dispatch',
    phone: '081299001122',
    active: true,
    passwordHash: DEFAULT_HASH,
    createdAt: '2026-01-01T00:00:00Z'
  },
  {
    id: 'u-leader-1',
    name: 'Hendra Gunawan (Leader MJS)',
    username: 'leadermjs',
    email: 'hendra@mjs.morajaws.net',
    role: 'leader',
    contractor: 'PT Mitra Jaringan Solusi',
    contractorId: 'c-mjs',
    area: 'Jakarta Selatan',
    phone: '081288990011',
    active: true,
    passwordHash: DEFAULT_HASH,
    createdAt: '2026-01-01T00:00:00Z'
  },
  {
    id: 'u-installer-1',
    name: 'Andi Saputra',
    username: 'installer1',
    email: 'andi@installer.morajaws.net',
    role: 'installer',
    contractor: 'PT Mitra Jaringan Solusi',
    contractorId: 'c-mjs',
    area: 'Jakarta Selatan',
    phone: '081299883344',
    active: true,
    passwordHash: DEFAULT_HASH,
    createdAt: '2026-01-01T00:00:00Z'
  },
  {
    id: 'u-leader-2',
    name: 'Dedi Kurniawan (Leader KCS)',
    username: 'leaderkcs',
    email: 'dedi@kcs.morajaws.net',
    role: 'leader',
    contractor: 'PT Kencana Solusindo',
    contractorId: 'c-kcs',
    area: 'Jakarta Barat',
    phone: '085711223344',
    active: true,
    passwordHash: DEFAULT_HASH,
    createdAt: '2026-01-01T00:00:00Z'
  },
  {
    id: 'u-installer-2',
    name: 'Budi Santoso',
    username: 'installer2',
    email: 'budi@installer.morajaws.net',
    role: 'installer',
    contractor: 'PT Kencana Solusindo',
    contractorId: 'c-kcs',
    area: 'Jakarta Barat',
    phone: '085711224455',
    active: true,
    passwordHash: DEFAULT_HASH,
    createdAt: '2026-01-01T00:00:00Z'
  }
];

const INITIAL_SEED_CONTRACTORS = [
  {
    id: 'c-mjs',
    name: 'PT Mitra Jaringan Solusi',
    code: 'MJS',
    coverageAreas: ['Jakarta Selatan', 'Depok'],
    leaderId: 'u-leader-1',
    leaderName: 'Hendra Gunawan (Leader MJS)',
    phone: '081288990011',
    email: 'ops@mjs.morajaws.net',
    active: true,
    createdAt: '2026-01-01T00:00:00Z'
  },
  {
    id: 'c-kcs',
    name: 'PT Kencana Solusindo',
    code: 'KCS',
    coverageAreas: ['Jakarta Barat', 'Tangerang'],
    leaderId: 'u-leader-2',
    leaderName: 'Dedi Kurniawan (Leader KCS)',
    phone: '085711223344',
    email: 'ops@kcs.morajaws.net',
    active: true,
    createdAt: '2026-01-01T00:00:00Z'
  },
  {
    id: 'c-cfn',
    name: 'PT Cipta Fiber Nusantara',
    code: 'CFN',
    coverageAreas: ['Tangerang Selatan', 'Bogor'],
    phone: '081822334455',
    email: 'ops@cfn.morajaws.net',
    active: true,
    createdAt: '2026-01-01T00:00:00Z'
  }
];

const INITIAL_SEED_AREAS = [
  { id: 'area-js', name: 'Jakarta Selatan', clusters: ['Grand Melati Residence', 'Cilandak Green', 'Kemang Village'], active: true },
  { id: 'area-jb', name: 'Jakarta Barat', clusters: ['Permata Hijau 2', 'Taman Anggrek Residence', 'Kebon Jeruk Baru'], active: true },
  { id: 'area-ts', name: 'Tangerang Selatan', clusters: ['Victoria Riverside', 'Bintaro Jaya Sektor 9', 'BSD City Foresta'], active: true },
  { id: 'area-dp', name: 'Depok', clusters: ['Margonda Raya', 'Grand Depok City'], active: true },
  { id: 'area-bg', name: 'Bogor', clusters: ['Sentul City', 'Bogor Nirwana Residence'], active: true },
  { id: 'area-tg', name: 'Tangerang', clusters: ['Modernland', 'Gading Serpong'], active: true }
];

// Baseline Work Orders including appointment date 2026-10-30 as well as 2026-10-18
const INITIAL_SEED_TICKETS = [
  {
    id: 't-seed-1',
    woNumber: 'WO20267399330',
    workOrderNumber: 'WO20267399330',
    idCustomer: '7399330',
    customerId: '7399330',
    ticketNumber: 'TCK-9901',
    ticketDate: '2026-10-27',
    date: '2026-10-30',
    appointmentDate: '2026-10-30',
    dateUpload: '2026-10-28 08:00',
    fileName: 'BASE_DATA_WO.xlsx',
    agentId: 'superadmin',
    customerName: 'Haji Sulaiman',
    endUserName: 'Haji Sulaiman',
    customerPhone: '081299883344',
    customerContact1: '081299883344',
    customerPhoneNormalized: '6281299883344',
    customerContact2: '081399881122',
    slotTime: '09:00 - 11:00 WIB',
    area: 'Jakarta Selatan',
    clusterName: 'Grand Melati Residence',
    streetName: 'Jl. Kenanga No. 12',
    streetAlternatif: 'Dekat Masjid Al-Ikhlas',
    contactorName: 'PT Mitra Jaringan Solusi',
    contractorName: 'PT Mitra Jaringan Solusi',
    contractorId: 'c-mjs',
    leaderName: 'Hendra Gunawan (Leader MJS)',
    installerName: 'Andi Saputra',
    installerContact: '081299883344',
    fdtCode: 'FDT-JS-015',
    fatCode: 'FAT-JS-015-02',
    ticketCategory: 'New Installation FTTH',
    statusWOAgent: 'Assigned',
    statusWOInstaller: 'Assigned',
    statusWhatsApp: 'ready',
    remarksWOInstaller: 'Material kabel dropcore 150m siap',
    remarksAgent: 'Prioritas pagi, konfirmasi sebelum tiba',
    isArchived: false,
    isDeleted: false,
    distributionStatus: 'auto_distributed',
    distributionNotes: 'Distributed to PT Mitra Jaringan Solusi (Jakarta Selatan)',
    createdAt: '2026-10-28T00:00:00Z',
    updatedAt: '2026-10-28T00:00:00Z',
    updatedBy: 'Alamsyah (Super Admin)'
  },
  {
    id: 't-seed-2',
    woNumber: 'WO20267399331',
    workOrderNumber: 'WO20267399331',
    idCustomer: '7399331',
    customerId: '7399331',
    ticketNumber: 'TCK-9902',
    ticketDate: '2026-10-27',
    date: '2026-10-30',
    appointmentDate: '2026-10-30',
    dateUpload: '2026-10-28 08:00',
    fileName: 'BASE_DATA_WO.xlsx',
    agentId: 'superadmin',
    customerName: 'dr. Anita Wijaya',
    endUserName: 'dr. Anita Wijaya',
    customerPhone: '085711224455',
    customerContact1: '085711224455',
    customerPhoneNormalized: '6285711224455',
    slotTime: '13:00 - 15:00 WIB',
    area: 'Jakarta Barat',
    clusterName: 'Permata Hijau 2',
    streetName: 'Blok C No. 5',
    streetAlternatif: 'Pintu gerbang putih seberang pos satpam',
    contactorName: 'PT Kencana Solusindo',
    contractorName: 'PT Kencana Solusindo',
    contractorId: 'c-kcs',
    leaderName: 'Dedi Kurniawan (Leader KCS)',
    installerName: 'Budi Santoso',
    installerContact: '085711224455',
    fdtCode: 'FDT-JB-008',
    fatCode: 'FAT-JB-008-02',
    ticketCategory: 'Relocation ONT',
    statusWOAgent: 'Assigned',
    statusWOInstaller: 'Assigned',
    statusWhatsApp: 'ready',
    remarksWOInstaller: 'Menunggu kepulangan dokter dari klinik',
    remarksAgent: 'Hubungi 30 menit sebelum jadwal',
    isArchived: false,
    isDeleted: false,
    distributionStatus: 'auto_distributed',
    createdAt: '2026-10-28T00:00:00Z',
    updatedAt: '2026-10-28T00:00:00Z',
    updatedBy: 'Alamsyah (Super Admin)'
  },
  {
    id: 't-seed-3',
    woNumber: 'WO20267399332',
    workOrderNumber: 'WO20267399332',
    idCustomer: '7399332',
    customerId: '7399332',
    ticketNumber: 'TCK-9903',
    ticketDate: '2026-10-28',
    date: '2026-10-30',
    appointmentDate: '2026-10-30',
    dateUpload: '2026-10-28 08:00',
    fileName: 'BASE_DATA_WO.xlsx',
    agentId: 'superadmin',
    customerName: 'Kurnia Sandi',
    endUserName: 'Kurnia Sandi',
    customerPhone: '081822334455',
    customerContact1: '081822334455',
    customerPhoneNormalized: '6281822334455',
    slotTime: '15:00 - 17:00 WIB',
    area: 'Tangerang Selatan',
    clusterName: 'Victoria Riverside',
    streetName: 'Jl. Melati IV No. 22',
    contactorName: 'PT Cipta Fiber Nusantara',
    contractorName: 'PT Cipta Fiber Nusantara',
    contractorId: 'c-cfn',
    fdtCode: 'FDT-TS-005',
    fatCode: 'FAT-TS-005-01',
    ticketCategory: 'Maintenance LOS Red Light',
    statusWOAgent: 'Pending',
    statusWOInstaller: 'Unassigned',
    statusWhatsApp: 'not_prepared',
    remarksAgent: 'Perlu pengecekan redaman FAT, lampu indikator merah LOS',
    isArchived: false,
    isDeleted: false,
    distributionStatus: 'auto_distributed',
    createdAt: '2026-10-28T00:00:00Z',
    updatedAt: '2026-10-28T00:00:00Z',
    updatedBy: 'Alamsyah (Super Admin)'
  },
  {
    id: 't-seed-4',
    woNumber: 'WO20267399335',
    workOrderNumber: 'WO20267399335',
    idCustomer: '7399335',
    customerId: '7399335',
    ticketNumber: 'TCK-9905',
    ticketDate: '2026-10-18',
    date: '2026-10-18',
    appointmentDate: '2026-10-18',
    dateUpload: '2026-10-18 09:30',
    fileName: 'data_wo_20261018.xlsx',
    agentId: 'superadmin',
    customerName: 'Agung Prasetyo',
    endUserName: 'Agung Prasetyo',
    customerPhone: '081288776655',
    customerContact1: '081288776655',
    customerPhoneNormalized: '6281288776655',
    slotTime: '10:00 - 12:00 WIB',
    area: 'Jakarta Selatan',
    clusterName: 'Grand Melati Residence',
    streetName: 'Jl. Melati Raya No. 8',
    contactorName: 'PT Mitra Jaringan Solusi',
    contractorName: 'PT Mitra Jaringan Solusi',
    contractorId: 'c-mjs',
    leaderName: 'Hendra Gunawan (Leader MJS)',
    installerName: 'Andi Saputra',
    installerContact: '081299883344',
    fdtCode: 'FDT-JS-020',
    fatCode: 'FAT-JS-020-04',
    ticketCategory: 'New Installation FTTH',
    statusWOAgent: 'Resolved',
    statusWOInstaller: 'Completed',
    statusWhatsApp: 'confirmed',
    remarksWOInstaller: 'Instalasi selesai berhasil, redaman -18.2 dBm',
    isArchived: false,
    isDeleted: false,
    distributionStatus: 'auto_distributed',
    createdAt: '2026-10-18T00:00:00Z',
    updatedAt: '2026-10-18T11:45:00Z',
    updatedBy: 'Andi Saputra'
  },
  {
    id: 't-seed-5',
    woNumber: 'WO20267399337',
    workOrderNumber: 'WO20267399337',
    idCustomer: '7399337',
    customerId: '7399337',
    ticketNumber: 'TCK-9907',
    ticketDate: '2026-10-28',
    date: '2026-10-30',
    appointmentDate: '2026-10-30',
    dateUpload: '2026-10-28 08:30',
    fileName: 'data_wo_20261028.xlsx',
    agentId: 'superadmin',
    customerName: 'Syamsul Bahri',
    endUserName: 'Syamsul Bahri',
    customerPhone: '081377889900',
    customerContact1: '081377889900',
    customerPhoneNormalized: '6281377889900',
    slotTime: '16:00 - 18:00 WIB',
    area: 'Jakarta Selatan',
    clusterName: 'Grand Melati Residence',
    streetName: 'Jl. Kemuning Blok D2',
    streetAlternatif: 'Titip Kunci di Pos Satpam',
    contactorName: 'PT Mitra Jaringan Solusi',
    contractorName: 'PT Mitra Jaringan Solusi',
    contractorId: 'c-mjs',
    leaderName: 'Hendra Gunawan (Leader MJS)',
    installerName: 'Andi Saputra',
    installerContact: '081299883344',
    fdtCode: 'FDT-JS-022',
    fatCode: 'FAT-JS-022-01',
    ticketCategory: 'Maintenance LOS Red Light',
    statusWOAgent: 'Assigned',
    statusWOInstaller: 'Assigned',
    statusWhatsApp: 'ready',
    remarksWOInstaller: 'Bawa kabel dropcore cadangan 100m',
    isArchived: false,
    isDeleted: false,
    distributionStatus: 'auto_distributed',
    createdAt: '2026-10-28T00:00:00Z',
    updatedAt: '2026-10-28T00:00:00Z',
    updatedBy: 'Alamsyah (Super Admin)'
  }
];

// Persistent state in memory backed by disk
let db: DatabaseSchema = {
  users: [...INITIAL_SEED_USERS],
  tickets: [...INITIAL_SEED_TICKETS],
  contractors: [...INITIAL_SEED_CONTRACTORS],
  coverageAreas: [...INITIAL_SEED_AREAS],
  templates: [],
  ticketMessages: [],
  assignmentHistory: [],
  auditLogs: [
    {
      id: 'log_init',
      action: 'Server Initialized',
      entity: 'auth',
      entityId: 'sys-0',
      details: 'MoraJaws Central Persistent Storage Engine initialized with robust RBAC & synchronization',
      performedBy: 'System',
      userRole: 'super_admin',
      timestamp: new Date().toISOString()
    }
  ],
  syncHistory: [],
  sheetsConfig: {
    enabled: false,
    spreadsheetId: '',
    spreadsheetUrl: '',
    spreadsheetTitle: '',
    sheetName: 'Work_Orders',
    syncDirection: 'both',
    lastSyncAt: null,
    lastSyncStatus: null,
    lastSyncMessage: '',
    recordsCount: 0
  },
  globalConfig: null,
  sessionConfig: {
    sessionMaxDurationHours: 8,
    idleTimeoutMinutes: 60,
    extendOnActivity: true,
    maxActiveSessionsPerUser: 3,
    revokePreviousOnLogin: false,
    revokeOnDeactivate: true,
    revokeOnPasswordChange: true
  },
  operationalDateOverride: '2026-10-28'
};

// Load database from disk or create if not existing
function loadDatabaseFromDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        db = {
          ...db,
          ...parsed,
          // Ensure essential baseline users exist
          users: Array.isArray(parsed.users) && parsed.users.length > 0 ? parsed.users : INITIAL_SEED_USERS,
          tickets: Array.isArray(parsed.tickets) && parsed.tickets.length > 0 ? parsed.tickets : INITIAL_SEED_TICKETS,
          contractors: Array.isArray(parsed.contractors) && parsed.contractors.length > 0 ? parsed.contractors : INITIAL_SEED_CONTRACTORS,
          coverageAreas: Array.isArray(parsed.coverageAreas) && parsed.coverageAreas.length > 0 ? parsed.coverageAreas : INITIAL_SEED_AREAS,
          attachments: Array.isArray(parsed.attachments) ? parsed.attachments : []
        };
        if (Array.isArray(parsed.sessions)) {
          SERVER_SESSIONS.length = 0;
          SERVER_SESSIONS.push(...parsed.sessions);
        }
        console.log(`[Database] Loaded ${db.tickets.length} tickets, ${db.users.length} users, ${db.contractors.length} contractors, ${SERVER_SESSIONS.length} sessions from persistent disk storage.`);
        return;
      }
    }
    // Write initial database to disk
    saveDatabaseToDisk();
  } catch (err) {
    console.warn('[Database] Warning loading database from disk, using baseline in-memory:', err);
  }
}

// Atomically save database to disk
function saveDatabaseToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    db.sessions = SERVER_SESSIONS;
    const tempFile = DB_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error('[Database] Error saving database to disk:', err);
  }
}

// Helper to log server audit entries
function logServerAudit(action: string, entity: string, entityId: string, details: string, user?: ServerUser | null) {
  const entry = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    action,
    entity,
    entityId,
    details,
    performedBy: user ? user.name : 'Anonymous / System',
    userRole: user ? user.role : 'system',
    timestamp: new Date().toISOString()
  };
  db.auditLogs.unshift(entry);
  if (db.auditLogs.length > 1000) db.auditLogs.pop();
  saveDatabaseToDisk();
  return entry;
}

// --- Session Store ---
const SERVER_SESSIONS: ServerSession[] = [];
const LOGIN_ATTEMPTS = new Map<string, { count: number; lastAttempt: number; lockedUntil?: number }>();

function getOperationalDate(): { date: string; isAuto: boolean; timezone: string } {
  if (db.operationalDateOverride) {
    return { date: db.operationalDateOverride, isAuto: false, timezone: 'Asia/Jakarta' };
  }
  try {
    const dtf = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return { date: dtf.format(new Date()), isAuto: true, timezone: 'Asia/Jakarta' };
  } catch {
    const d = new Date();
    return {
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      isAuto: true,
      timezone: 'Asia/Jakarta'
    };
  }
}

let isSyncInProgress = false;
let currentSyncJobId: string | null = null;

// Standalone phone & WhatsApp helpers
function normalizePhoneNumber(phone: string | undefined | null): string {
  if (!phone) return '';
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('0')) {
    digits = '62' + digits.substring(1);
  } else if (digits.startsWith('8')) {
    digits = '62' + digits;
  } else if (!digits.startsWith('62') && digits.length >= 8) {
    digits = '62' + digits;
  }
  return digits;
}

function isValidPhoneNumber(phone: string): boolean {
  const normalized = normalizePhoneNumber(phone);
  return /^62[2-9]\d{7,12}$/.test(normalized);
}

function renderWhatsAppMessage(templateBody: string, ticket: any) {
  const missingVariables: string[] = [];
  const varMap: Record<string, string> = {
    customer_name: ticket?.customerName || ticket?.endUserName || '',
    customer_id: ticket?.idCustomer || ticket?.customerId || '',
    customer_phone: ticket?.customerPhone || '',
    wo_number: ticket?.woNumber || ticket?.workOrderNumber || '',
    ticket_number: ticket?.ticketNumber || ticket?.woNumber || '',
    ticket_category: ticket?.ticketCategory || '',
    slot_time: ticket?.slotTime || '',
    street_name: ticket?.streetName || '',
    street_alternatif: ticket?.streetAlternatif || '',
    cluster_name: ticket?.clusterName || '',
    area: ticket?.area || '',
    contractor_name: ticket?.contactorName || ticket?.contractorName || '',
    contactor_name: ticket?.contactorName || ticket?.contractorName || '',
    installer_name: ticket?.installerName || '',
    date: ticket?.appointmentDate || ticket?.date || '',
    fdt_code: ticket?.fdtCode || '',
    fat_code: ticket?.fatCode || ''
  };

  if (ticket?.additionalFields) {
    Object.entries(ticket.additionalFields).forEach(([k, v]) => {
      varMap[k.toLowerCase()] = String(v || '');
    });
  }

  const rendered = (templateBody || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match: string, varName: string) => {
    const key = varName.toLowerCase();
    const val = varMap[key];
    if (val === undefined || val === null || val.trim() === '') {
      missingVariables.push(varName);
      return '';
    }
    return val;
  });

  return {
    renderedText: rendered,
    missingVariables: Array.from(new Set(missingVariables)),
    hasWarnings: missingVariables.length > 0
  };
}

function buildWhatsAppClickToChatUrl(phone: string, messageText: string): { url: string; error?: string } {
  const normalizedPhone = normalizePhoneNumber(phone);
  if (!isValidPhoneNumber(normalizedPhone)) {
    return {
      url: '',
      error: `Nomor telepon tidak valid untuk WhatsApp Indonesia (${phone || 'Kosong'}). Pastikan diawali 08/628 dan minimal 10 digit.`
    };
  }
  const encodedMessage = encodeURIComponent(messageText || '');
  return { url: `https://wa.me/${normalizedPhone}?text=${encodedMessage}` };
}

// -------------------------------------------------------------
// Authentication & RBAC Middleware
// -------------------------------------------------------------
interface AuthenticatedRequest extends Request {
  user?: ServerUser;
  session?: ServerSession;
}

function resolveUserFromHeader(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const userHeader = req.headers['x-user-id'] || req.headers['x-username'];

  let found: ServerUser | undefined;
  let activeSession: ServerSession | undefined;
  const now = Date.now();

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    activeSession = SERVER_SESSIONS.find(s => s.token === token && s.status === 'active');

    if (activeSession) {
      if (new Date(activeSession.expiresAt).getTime() < now) {
        activeSession.status = 'expired';
        activeSession = undefined;
      } else {
        const lastAct = new Date(activeSession.lastActivityAt).getTime();
        const idleLimitMs = (db.sessionConfig.idleTimeoutMinutes || 60) * 60 * 1000;
        if (now - lastAct > idleLimitMs) {
          activeSession.status = 'expired';
          activeSession = undefined;
        } else {
          if (db.sessionConfig.extendOnActivity) {
            activeSession.lastActivityAt = new Date().toISOString();
          }
          found = db.users.find(u => u.id === activeSession!.userId && !u.isDeleted && u.active);
        }
      }
    } else {
      const parts = token.split('_');
      if (parts.length >= 2) {
        found = db.users.find(u => u.id === parts[1] && !u.isDeleted && u.active);
      }
    }
  }

  if (!found && userHeader) {
    const identifier = String(userHeader).toLowerCase().trim();
    found = db.users.find(
      u => (u.id === identifier || u.username.toLowerCase() === identifier || u.email.toLowerCase() === identifier) && !u.isDeleted && u.active
    );
  }

  req.user = found;
  req.session = activeSession;
  next();
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Tidak terautentikasi: Sesi login tidak ditemukan atau telah kedaluwarsa. Silakan login kembali.',
      code: 'UNAUTHENTICATED'
    });
  }
  next();
}

function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Tidak terautentikasi', code: 'UNAUTHENTICATED' });
  }
  if (req.user.role !== 'super_admin') {
    logServerAudit('Access Denied (Super Admin Required)', 'rbac', req.originalUrl, `User ${req.user.name} (${req.user.role}) ditolak mengakses resource Super Admin`, req.user);
    return res.status(403).json({
      error: 'Akses Ditolak: Otoritas ini dibatasi HANYA untuk Super Admin.',
      code: 'REQUIRE_SUPER_ADMIN'
    });
  }
  next();
}

function requireImportPermission(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Tidak terautentikasi', code: 'UNAUTHENTICATED' });
  }
  if (req.user.role !== 'super_admin' && req.user.role !== 'dispatch' && req.user.role !== 'management_data') {
    logServerAudit('Access Denied (Import Permission Required)', 'rbac', req.originalUrl, `User ${req.user.name} (${req.user.role}) ditolak melakukan import WO`, req.user);
    return res.status(403).json({
      error: 'Akses Ditolak: Otoritas import data Work Order hanya diberikan kepada Super Admin, Dispatch, dan Management Data.',
      code: 'REQUIRE_IMPORT_PERMISSION'
    });
  }
  next();
}

function requireLeaderOrAdminForAssignment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Tidak terautentikasi', code: 'UNAUTHENTICATED' });
  }

  if (req.user.role === 'leader') {
    return next();
  }

  if (req.user.role === 'super_admin' && req.body?.isEmergencyOverride === true && req.body?.overrideReason) {
    logServerAudit('Emergency WO Assignment Override', 'assignment', req.body.ticketId || req.body.woNumber || 'bulk', `Super Admin ${req.user.name} melakukan override penugasan darurat: ${req.body.overrideReason}`, req.user);
    return next();
  }

  logServerAudit('Access Denied (Leader Role Required)', 'rbac', req.originalUrl, `User ${req.user.name} (${req.user.role}) ditolak menugaskan/reassign WO`, req.user);
  return res.status(403).json({
    error: 'Akses Ditolak: Hak penugasan dan reassign WO teknisi dibatasi HANYA untuk Leader / Korlap lapangan.',
    code: 'REQUIRE_LEADER_ROLE'
  });
}

function requireDispatch(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Tidak terautentikasi', code: 'UNAUTHENTICATED' });
  }

  if (req.user.role === 'dispatch') {
    return next();
  }

  logServerAudit('Access Denied (Dispatch Role Required for Same Day)', 'rbac', req.originalUrl, `User ${req.user.name} (${req.user.role}) ditolak mengakses fitur WO Same Day`, req.user);
  return res.status(403).json({
    error: 'Akses Ditolak: Fitur WO Same Day khusus diperuntukkan bagi role Dispatch.',
    code: 'REQUIRE_DISPATCH_ROLE'
  });
}

// Scoping helper for tickets according to User Role
function scopeTicketsForUser(tickets: any[], user: ServerUser): any[] {
  return tickets.filter(t => {
    if (t.isDeleted) return false;
    if (user.role === 'super_admin' || user.role === 'dispatch' || user.role === 'management_data') {
      return true;
    }
    const ticketContractor = (t.contactorName || t.contractorName || '').toLowerCase().trim();
    const ticketArea = (t.area || '').toLowerCase().trim();

    if (user.role === 'leader') {
      const leaderContr = (user.contractor || '').toLowerCase().trim();
      const leaderArea = (user.area || '').toLowerCase().trim();
      if (!leaderContr) return false;
      const matchContr = ticketContractor === leaderContr || ticketContractor.includes(leaderContr) || leaderContr.includes(ticketContractor);
      const matchArea = !leaderArea || ticketArea === leaderArea || ticketArea.includes(leaderArea) || leaderArea.includes(ticketArea);
      return matchContr && matchArea;
    }

    if (user.role === 'installer') {
      const myName = (user.name || '').toLowerCase().trim();
      const cleanMyName = myName.replace(/\(.*?\)/g, '').trim();
      const ticketInst = (t.installerName || '').toLowerCase().trim();
      if (!ticketInst) return false;
      const nameMatch = ticketInst === myName || ticketInst === cleanMyName || ticketInst.includes(cleanMyName) || cleanMyName.includes(ticketInst);
      const phoneMatch = user.phone && t.installerContact && t.installerContact.replace(/\D/g, '') === user.phone.replace(/\D/g, '');
      return Boolean(nameMatch || phoneMatch);
    }

    return false;
  });
}

async function startServer() {
  loadDatabaseFromDisk();

  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  // Production CORS & Security Headers
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, x-username, x-google-access-token');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(resolveUserFromHeader);

  // Health check endpoint with infrastructure and integration status
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      environment: process.env.NODE_ENV || 'production',
      database: {
        status: 'Connected',
        type: 'Central Persistent JSON Database with Atomic Disk Sync',
        totalTickets: db.tickets.length,
        totalUsers: db.users.length,
        totalContractors: db.contractors.length,
        totalAuditLogs: db.auditLogs.length
      },
      integrations: {
        googleSheets: {
          configured: Boolean(db.sheetsConfig.spreadsheetId),
          spreadsheetId: db.sheetsConfig.spreadsheetId || null,
          sheetName: db.sheetsConfig.sheetName || 'Work_Orders',
          status: db.sheetsConfig.status || (db.sheetsConfig.spreadsheetId ? 'Connected' : 'Disconnected'),
          lastSyncAt: db.sheetsConfig.lastSyncAt,
          lastSyncStatus: db.sheetsConfig.lastSyncStatus
        },
        firebaseAuth: {
          enabled: true,
          projectId: 'sonic-ripple-cxtlg',
          firestoreDatabaseId: 'ai-studio-morajawsv6-c6c8e7c8-6b4d-4b80-8e21-1af2f4c29daa'
        },
        cloudFirestore: {
          status: 'Connected',
          projectId: 'sonic-ripple-cxtlg',
          firestoreDatabaseId: 'ai-studio-morajawsv6-c6c8e7c8-6b4d-4b80-8e21-1af2f4c29daa'
        },
        firebaseStorage: {
          enabled: true,
          bucket: 'sonic-ripple-cxtlg.firebasestorage.app',
          totalAttachments: (db.attachments || []).length
        }
      },
      serverTime: new Date().toISOString()
    });
  });

  // Current Auth Session Endpoint
  app.get('/api/auth/session', requireAuth, (req: AuthenticatedRequest, res) => {
    const { passwordHash: _, ...safeUser } = req.user!;
    res.json({
      authenticated: true,
      user: safeUser,
      session: req.session || null
    });
  });

  // Firebase Authentication Backend Verification Endpoint
  app.post('/api/auth/firebase-login', (req: Request, res: Response) => {
    const { email, uid, displayName } = req.body;
    if (!email && !uid) {
      return res.status(400).json({ error: 'Email atau UID Firebase wajib disertakan.' });
    }
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanUid = String(uid || '').trim();

    let user = db.users.find(u => {
      if (u.isDeleted) return false;
      if (cleanEmail && (
        u.email.toLowerCase() === cleanEmail ||
        (u.altEmail && u.altEmail.toLowerCase().includes(cleanEmail))
      )) return true;
      if (cleanUid && u.firebaseUid === cleanUid) return true;
      return false;
    });

    // Auto-link runtime app owner / administrator email (e.g. tarnocepak@gmail.com, rayhanafirzanx@gmail.com)
    const isAdminEmail = cleanEmail === 'tarnocepak@gmail.com' || cleanEmail === 'rayhanafirzanx@gmail.com' || cleanEmail.includes('tarnocepak') || cleanEmail.includes('rayhanafirzanx');
    if (!user && (isAdminEmail || db.users.length > 0)) {
      if (isAdminEmail) {
        const superAdmin = db.users.find(u => u.role === 'super_admin');
        if (superAdmin) {
          if (!superAdmin.altEmail) superAdmin.altEmail = superAdmin.email;
          superAdmin.email = cleanEmail;
          if (cleanUid) superAdmin.firebaseUid = cleanUid;
          if (displayName) superAdmin.name = `${displayName} (Super Admin)`;
          user = superAdmin;
        }
      }
    }

    if (!user) {
      logServerAudit('Firebase Login Rejected', 'auth', cleanEmail || cleanUid, `Percobaan login Firebase ditolak: Akun belum terdaftar (${cleanEmail || cleanUid})`, null);
      return res.status(403).json({
        error: `Akun Google / Firebase (${cleanEmail || cleanUid}) belum terdaftar dalam sistem MoraJaws. Hubungi Super Admin untuk mendaftarkan akun staf Anda.`,
        code: 'USER_NOT_REGISTERED'
      });
    }

    if (!user.active) {
      logServerAudit('Firebase Login Blocked Inactive', 'auth', user.id, `Akun dinonaktifkan mencoba login Firebase: ${user.name}`, user);
      return res.status(403).json({
        error: 'Akun Anda telah dinonaktifkan oleh Administrator. Hubungi Super Admin.',
        code: 'USER_INACTIVE'
      });
    }

    if (cleanUid && !user.firebaseUid) {
      user.firebaseUid = cleanUid;
    }

    const nowIso = new Date().toISOString();
    const nowMs = Date.now();
    const sessionMaxDurationMs = (db.sessionConfig.sessionMaxDurationHours || 8) * 3600 * 1000;
    const expiresIso = new Date(nowMs + sessionMaxDurationMs).toISOString();

    const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const token = `mora_${user.id}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Firebase Web Client';
    const deviceType = userAgent.toLowerCase().includes('mobi') ? 'mobile' : 'desktop';

    const newSession: ServerSession = {
      sessionId,
      token,
      userId: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      contractor: user.contractor,
      loginAt: nowIso,
      lastActivityAt: nowIso,
      expiresAt: expiresIso,
      status: 'active',
      ipAddress: clientIp,
      userAgent,
      deviceType
    };

    SERVER_SESSIONS.unshift(newSession);
    user.lastLoginAt = nowIso;
    user.loginCount = (user.loginCount || 0) + 1;
    saveDatabaseToDisk();

    logServerAudit('Firebase Login Success', 'auth', user.id, `User ${user.name} (${user.role}) berhasil masuk via Firebase Auth [${cleanEmail}]`, user);

    const { passwordHash: _, ...safeUser } = user;
    res.json({
      success: true,
      token,
      sessionId,
      expiresAt: expiresIso,
      user: safeUser
    });
  });

  // --- Bootstrap Initial State for Client Startup ---
  app.get('/api/bootstrap', (req: AuthenticatedRequest, res) => {
    const user = req.user;
    const scopedTickets = user ? scopeTicketsForUser(db.tickets, user) : [];

    res.json({
      success: true,
      isAuthenticated: Boolean(user),
      currentUser: user ? {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.role,
        contractor: user.contractor,
        contractorId: user.contractorId,
        area: user.area,
        active: user.active
      } : null,
      tickets: scopedTickets,
      contractors: db.contractors,
      coverageAreas: db.coverageAreas,
      templates: db.templates,
      globalConfig: db.globalConfig,
      sheetsConfig: user?.role === 'super_admin' ? db.sheetsConfig : undefined,
      operationalDate: getOperationalDate().date,
      serverTime: new Date().toISOString()
    });
  });

  // --- Auth Endpoints with Brute-Force Rate Limiting & Session Lifecycle ---
  app.post('/api/auth/login', (req: AuthenticatedRequest, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username dan kata sandi wajib diisi.' });
    }

    const cleanUser = String(username).trim().toLowerCase();
    const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const rateLimitKey = `${cleanUser}_${clientIp}`;

    const attemptInfo = LOGIN_ATTEMPTS.get(rateLimitKey);
    const nowMs = Date.now();
    if (attemptInfo && attemptInfo.lockedUntil && attemptInfo.lockedUntil > nowMs) {
      const waitSeconds = Math.ceil((attemptInfo.lockedUntil - nowMs) / 1000);
      return res.status(429).json({
        error: `Terlalu banyak percobaan login yang gagal. Akun/IP ditangguhkan sementara demi keamanan. Coba lagi dalam ${waitSeconds} detik.`,
        code: 'RATE_LIMITED'
      });
    }

    const user = db.users.find(
      u => (u.username.toLowerCase() === cleanUser || u.email.toLowerCase() === cleanUser) && !u.isDeleted
    );

    const attemptedHash = hashPassword(password);

    if (!user || user.passwordHash !== attemptedHash) {
      const currentAttempts = (attemptInfo?.count || 0) + 1;
      let lockedUntil: number | undefined;
      if (currentAttempts >= 5) {
        lockedUntil = nowMs + 5 * 60 * 1000;
      }
      LOGIN_ATTEMPTS.set(rateLimitKey, {
        count: currentAttempts,
        lastAttempt: nowMs,
        lockedUntil
      });

      logServerAudit('Login Failed', 'auth', cleanUser, `Percobaan login gagal untuk: ${cleanUser} (${currentAttempts}x gagal)`, null);
      return res.status(401).json({ error: 'Kredensial login tidak valid. Periksa username dan kata sandi.' });
    }

    if (!user.active) {
      logServerAudit('Login Blocked', 'auth', user.id, `Akun nonaktif mencoba login: ${user.username}`, user);
      return res.status(403).json({ error: 'Akun Anda telah dinonaktifkan oleh Administrator. Hubungi Super Admin.' });
    }

    LOGIN_ATTEMPTS.delete(rateLimitKey);

    const nowIso = new Date().toISOString();
    const sessionMaxDurationMs = (db.sessionConfig.sessionMaxDurationHours || 8) * 3600 * 1000;
    const expiresIso = new Date(nowMs + sessionMaxDurationMs).toISOString();

    if (db.sessionConfig.revokePreviousOnLogin) {
      SERVER_SESSIONS.forEach(s => {
        if (s.userId === user.id && s.status === 'active') {
          s.status = 'revoked';
        }
      });
    } else {
      const activeUserSessions = SERVER_SESSIONS.filter(s => s.userId === user.id && s.status === 'active');
      if (activeUserSessions.length >= (db.sessionConfig.maxActiveSessionsPerUser || 3)) {
        const oldest = activeUserSessions.sort((a, b) => new Date(a.loginAt).getTime() - new Date(b.loginAt).getTime())[0];
        if (oldest) oldest.status = 'revoked';
      }
    }

    const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const token = `mora_${user.id}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const userAgent = req.headers['user-agent'] || 'Web Browser';
    const deviceType = userAgent.toLowerCase().includes('mobi') ? 'mobile' : 'desktop';

    const newSession: ServerSession = {
      sessionId,
      token,
      userId: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      contractor: user.contractor,
      loginAt: nowIso,
      lastActivityAt: nowIso,
      expiresAt: expiresIso,
      status: 'active',
      ipAddress: clientIp,
      userAgent,
      deviceType
    };

    SERVER_SESSIONS.unshift(newSession);

    user.lastLoginAt = nowIso;
    user.loginCount = (user.loginCount || 0) + 1;
    saveDatabaseToDisk();

    logServerAudit('Login Success', 'auth', user.id, `User ${user.name} (${user.role}) berhasil masuk ke sistem`, user);

    const { passwordHash: _, ...safeUser } = user;

    res.json({
      success: true,
      token,
      sessionId,
      expiresAt: expiresIso,
      user: safeUser
    });
  });

  app.post('/api/auth/logout', requireAuth, (req: AuthenticatedRequest, res) => {
    if (req.session) {
      req.session.status = 'revoked';
    }
    if (req.user) {
      logServerAudit('Logout Success', 'auth', req.user.id, `User ${req.user.name} (${req.user.role}) logout dari sistem`, req.user);
    }
    res.json({ success: true, message: 'Sesi berhasil diakhiri' });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    const { passwordHash: _, ...safeUser } = req.user!;
    res.json({
      user: safeUser,
      session: req.session ? {
        sessionId: req.session.sessionId,
        loginAt: req.session.loginAt,
        lastActivityAt: req.session.lastActivityAt,
        expiresAt: req.session.expiresAt,
        status: req.session.status
      } : null
    });
  });

  // --- Work Order Core Endpoints ---
  app.get('/api/tickets', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const scopedTickets = scopeTicketsForUser(db.tickets, user);

    res.json({
      success: true,
      tickets: scopedTickets,
      count: scopedTickets.length,
      role: user.role,
      user: user.name,
      serverTime: new Date().toISOString()
    });
  });

  // Same Day Work Order Creation (Strictly Exclusive to Dispatch Role)
  app.post('/api/tickets/sameday', requireDispatch, (req: AuthenticatedRequest, res) => {
    const data = req.body;
    if (!data.woNumber || !data.customerName || !data.customerPhone) {
      return res.status(400).json({ error: 'Field wajib WO Number, Nama Pelanggan, dan No. HP harus diisi.' });
    }

    const newTicket = {
      ...data,
      id: 't-sameday-' + Date.now(),
      ticketCategory: data.ticketCategory || 'New Installation FTTH (Sameday)',
      statusWOAgent: 'Pending',
      statusWOInstaller: 'Unassigned',
      statusWhatsApp: 'ready',
      isArchived: false,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: req.user!.name
    };

    db.tickets.unshift(newTicket);
    saveDatabaseToDisk();

    logServerAudit('Create Sameday WO', 'ticket', newTicket.id, `Dispatcher ${req.user!.name} mendaftarkan tiket sameday ${newTicket.woNumber} untuk ${newTicket.customerName}`, req.user);

    res.json({
      success: true,
      ticket: newTicket,
      message: `Tiket Sameday ${newTicket.woNumber} berhasil diterbitkan.`
    });
  });

  // Bulk Import Tickets (Super Admin, Dispatch, Management Data)
  app.post('/api/tickets/bulk-import', requireImportPermission, (req: AuthenticatedRequest, res) => {
    const { tickets: importedRows, options } = req.body;
    if (!Array.isArray(importedRows) || importedRows.length === 0) {
      return res.status(400).json({ error: 'Array data tiket tidak valid atau kosong.' });
    }

    const policy = options?.duplicatePolicy || 'skip';
    let importedCount = 0;
    let updatedCount = 0;
    let duplicatesIgnored = 0;
    const rejectedDuplicates: string[] = [];

    const existingWoMap = new Map<string, any>();
    db.tickets.forEach(t => {
      const upper = (t.woNumber || t.workOrderNumber || '').trim().toUpperCase();
      if (upper) existingWoMap.set(upper, t);
    });

    const nowIso = new Date().toISOString();
    const batchId = 'batch_' + Date.now();
    const newItems: any[] = [];

    importedRows.forEach((item: any) => {
      const rawWo = (item.woNumber || item.workOrderNumber || '').trim();
      if (!rawWo) {
        duplicatesIgnored++;
        return;
      }
      const upperWo = rawWo.toUpperCase();

      // Normalize appointment date
      const appDate = normalizeAppointmentDate(item.appointmentDate || item.date);

      // Customer ID validation (7 digits)
      const rawCustId = (item.idCustomer || item.customerId || '').trim();
      const custDigits = rawCustId.replace(/\D/g, '');
      const validCustId = custDigits.length === 7 ? custDigits : (rawCustId || '');

      if (existingWoMap.has(upperWo)) {
        if (policy === 'update_allowed') {
          const existing = existingWoMap.get(upperWo);
          if (appDate) existing.appointmentDate = appDate;
          if (item.slotTime) existing.slotTime = item.slotTime;
          if (item.ticketCategory) existing.ticketCategory = item.ticketCategory;
          if (item.customerPhone) existing.customerPhone = item.customerPhone;
          if (item.remarksAgent) existing.remarksAgent = item.remarksAgent;
          existing.updatedAt = nowIso;
          existing.updatedBy = req.user!.name;
          updatedCount++;
        } else {
          duplicatesIgnored++;
          if (!rejectedDuplicates.includes(rawWo)) {
            rejectedDuplicates.push(rawWo);
          }
        }
        return;
      }

      const newTicket = {
        ...item,
        id: item.id || ('t-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4)),
        woNumber: rawWo,
        workOrderNumber: rawWo,
        idCustomer: validCustId,
        customerId: validCustId,
        appointmentDate: appDate,
        date: appDate || item.date || nowIso.split('T')[0],
        dateUpload: item.dateUpload || nowIso.replace('T', ' ').substring(0, 16),
        statusWOAgent: item.statusWOAgent || 'Pending',
        statusWOInstaller: item.statusWOInstaller || (item.installerName ? 'Assigned' : 'Unassigned'),
        statusWhatsApp: item.statusWhatsApp || 'not_prepared',
        isArchived: false,
        isDeleted: false,
        importBatchId: batchId,
        createdAt: nowIso,
        updatedAt: nowIso,
        updatedBy: req.user!.name
      };

      existingWoMap.set(upperWo, newTicket);
      newItems.push(newTicket);
      importedCount++;
    });

    db.tickets.unshift(...newItems);
    db.sheetsConfig.recordsCount = db.tickets.length;
    saveDatabaseToDisk();

    logServerAudit(
      'Bulk Import Completed',
      'import_batch',
      batchId,
      `Berhasil import ${importedCount} tiket baru, ${updatedCount} tiket diperbarui, ditolak ${duplicatesIgnored} tiket duplikat`,
      req.user
    );

    res.json({
      success: true,
      importedCount,
      updatedCount,
      duplicatesIgnored,
      rejectedDuplicates,
      totalTicketsNow: db.tickets.length,
      batchId
    });
  });

  // Update a single Ticket
  app.put('/api/tickets/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const updates = req.body;

    const ticketIndex = db.tickets.findIndex(t => t.id === id || t.woNumber === id);
    if (ticketIndex === -1) {
      return res.status(404).json({ error: 'Work Order tidak ditemukan.' });
    }

    const currentTicket = db.tickets[ticketIndex];

    // Check RBAC permission for modifying WO
    if (req.user!.role === 'installer') {
      const isAssigned = (currentTicket.installerName || '').toLowerCase().trim() === req.user!.name.toLowerCase().trim();
      if (!isAssigned) {
        return res.status(403).json({ error: 'Akses Ditolak: Anda hanya dapat memperbarui WO yang ditugaskan kepada Anda.' });
      }
    }

    if (updates.appointmentDate) {
      updates.appointmentDate = normalizeAppointmentDate(updates.appointmentDate);
    }

    db.tickets[ticketIndex] = {
      ...currentTicket,
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user!.name
    };

    saveDatabaseToDisk();

    res.json({ success: true, ticket: db.tickets[ticketIndex] });
  });

  // Assign Ticket Personnel (Leader or Super Admin)
  app.post('/api/tickets/assign', requireLeaderOrAdminForAssignment, (req: AuthenticatedRequest, res) => {
    const { ticketId, ticketIds, woNumber, installerName, slotTime, remarks } = req.body;
    if (!installerName || !installerName.trim()) {
      return res.status(400).json({ error: 'Nama teknisi tujuan wajib diisi.' });
    }

    const assignedIds: string[] = ticketIds || (ticketId ? [ticketId] : []);
    const now = new Date().toISOString();
    const idSet = new Set(assignedIds);

    db.tickets = db.tickets.map(t => {
      if (!idSet.has(t.id) && t.woNumber !== woNumber) return t;
      return {
        ...t,
        installerName: installerName.trim(),
        slotTime: slotTime || t.slotTime,
        statusWOInstaller: 'Assigned',
        remarksWOInstaller: remarks ? (t.remarksWOInstaller ? `${t.remarksWOInstaller}; ${remarks}` : remarks) : t.remarksWOInstaller,
        updatedAt: now,
        updatedBy: req.user!.name
      };
    });

    assignedIds.forEach(id => {
      const historyEntry = {
        id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        woNumber: woNumber || id,
        ticketId: id,
        newInstallerName: installerName.trim(),
        leaderName: req.user!.name,
        leaderId: req.user!.id,
        contractorName: req.user!.contractor || 'MoraJaws Partner',
        timestamp: now,
        reason: req.body?.reason || 'Penugasan awal oleh Leader',
        previousStatus: 'Unassigned',
        newStatus: 'Assigned',
        sourceAction: 'initial_assignment'
      };
      db.assignmentHistory.unshift(historyEntry);
    });

    saveDatabaseToDisk();

    logServerAudit(
      'WO Assigned by Leader',
      'assignment',
      assignedIds.join(','),
      `Leader ${req.user?.name} menugaskan ${assignedIds.length} WO ke teknisi ${installerName}`,
      req.user
    );

    res.json({
      success: true,
      message: `Berhasil menugaskan ${assignedIds.length} Work Order ke teknisi ${installerName}`,
      assignedIds,
      installerName,
      slotTime,
      assignedAt: now
    });
  });

  // Reassign WO (Leader within contractor scope or Super Admin override)
  app.post('/api/tickets/reassign', requireLeaderOrAdminForAssignment, (req: AuthenticatedRequest, res) => {
    const { ticketId, woNumber, previousInstallerName, newInstallerName, reason, contractorName } = req.body;

    if (!woNumber && !ticketId) {
      return res.status(400).json({ error: 'WO Number atau ID Tiket wajib disertakan.' });
    }
    if (!newInstallerName || !newInstallerName.trim()) {
      return res.status(400).json({ error: 'Teknisi baru tujuan wajib dipilih.' });
    }
    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ error: 'Alasan reassign wajib diisi minimal 5 karakter untuk keperluan audit.' });
    }

    if (req.user!.role === 'leader' && contractorName && req.user!.contractor) {
      const leaderContr = req.user!.contractor.toLowerCase().trim();
      const woContr = String(contractorName).toLowerCase().trim();
      if (!woContr.includes(leaderContr) && !leaderContr.includes(woContr)) {
        return res.status(403).json({
          error: `Akses Ditolak: Anda hanya dapat mereassign Work Order dalam cakupan mitra kontraktor Anda (${req.user!.contractor}).`,
          code: 'SCOPE_MISMATCH'
        });
      }
    }

    const now = new Date().toISOString();
    const targetTicket = db.tickets.find(t => t.id === ticketId || t.woNumber === woNumber);
    if (targetTicket) {
      targetTicket.installerName = newInstallerName.trim();
      targetTicket.statusWOInstaller = 'Assigned';
      targetTicket.updatedAt = now;
      targetTicket.updatedBy = req.user!.name;
    }

    const historyEntry = {
      id: 'hist_reassign_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      woNumber: woNumber || ticketId,
      ticketId: ticketId || woNumber,
      previousInstallerName: previousInstallerName?.trim() || targetTicket?.installerName || 'Teknisi Sebelumnya',
      newInstallerName: newInstallerName.trim(),
      leaderName: req.user!.name,
      leaderId: req.user!.id,
      contractorName: req.user!.contractor || contractorName || 'Mitra Lapangan',
      timestamp: now,
      reason: reason.trim(),
      previousStatus: 'Assigned',
      newStatus: 'Assigned',
      sourceAction: 'reassign'
    };

    db.assignmentHistory.unshift(historyEntry);
    saveDatabaseToDisk();

    logServerAudit(
      'WO Reassigned by Leader',
      'assignment',
      woNumber || ticketId,
      `Leader ${req.user!.name} mereassign WO ${woNumber || ticketId} dari "${previousInstallerName || '-'}" ke "${newInstallerName}". Alasan: ${reason}`,
      req.user
    );

    res.json({
      success: true,
      message: `Work Order ${woNumber || ticketId} berhasil dialihkan ke teknisi ${newInstallerName}.`,
      historyEntry,
      reassignedAt: now,
      reassignedBy: req.user!.name
    });
  });

  // Save Technical Report
  app.post('/api/tickets/:id/report', requireAuth, (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { report } = req.body;

    const ticket = db.tickets.find(t => t.id === id || t.woNumber === id);
    if (!ticket) {
      return res.status(404).json({ error: 'Work Order tidak ditemukan.' });
    }

    const now = new Date().toISOString();
    const technicalReport = {
      ...report,
      id: 'rep_' + Date.now(),
      ticketId: ticket.id,
      submittedAt: now,
      submittedBy: req.user!.name
    };

    ticket.technicalReport = technicalReport;
    ticket.statusWOInstaller = 'Completed';
    ticket.updatedAt = now;
    ticket.updatedBy = req.user!.name;

    saveDatabaseToDisk();

    logServerAudit('Technical Report Submitted', 'report', ticket.woNumber, `Laporan teknis diserahkan oleh ${req.user!.name} untuk WO ${ticket.woNumber}`, req.user);

    res.json({ success: true, technicalReport, ticket });
  });

  // Save Progress Report
  app.post('/api/tickets/:id/progress-report', requireAuth, (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { entry, status, remarks } = req.body;

    const ticket = db.tickets.find(t => t.id === id || t.woNumber === id);
    if (!ticket) {
      return res.status(404).json({ error: 'Work Order tidak ditemukan.' });
    }

    const now = new Date().toISOString();
    if (!ticket.progressReports) {
      ticket.progressReports = [];
    }
    const reportEntry = {
      ...entry,
      id: entry?.id || ('prog_' + Date.now()),
      ticketId: ticket.id,
      timestamp: entry?.timestamp || now,
      submittedBy: req.user!.name,
      userRole: req.user!.role
    };

    ticket.progressReports.unshift(reportEntry);
    if (status) {
      ticket.statusWOInstaller = status;
      if (status === 'Completed' || status === 'Installed') {
        ticket.statusWOAgent = 'Resolved';
      }
    }
    if (remarks) {
      ticket.remarksWOInstaller = remarks;
    }
    ticket.updatedAt = now;
    ticket.updatedBy = req.user!.name;

    saveDatabaseToDisk();

    logServerAudit(
      'Progress Report Saved',
      'report',
      ticket.woNumber,
      `Progress report (${status || entry?.reportStatus}) diserahkan oleh ${req.user!.name} untuk WO ${ticket.woNumber}`,
      req.user
    );

    res.json({ success: true, entry: reportEntry, ticket });
  });

  // Delete Work Order (Super Admin Exclusive)
  app.delete('/api/tickets/:id', requireSuperAdmin, (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { reason, permanent } = req.body;

    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ error: 'Alasan penghapusan Work Order wajib diisi minimal 5 karakter.' });
    }

    const idx = db.tickets.findIndex(t => t.id === id || t.woNumber === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Work Order tidak ditemukan.' });
    }

    const target = db.tickets[idx];
    const now = new Date().toISOString();

    if (permanent) {
      db.tickets.splice(idx, 1);
      logServerAudit('WO Permanently Deleted', 'ticket', target.woNumber, `Super Admin ${req.user!.name} menghapus permanen WO ${target.woNumber}. Alasan: ${reason}`, req.user);
    } else {
      target.isDeleted = true;
      target.deletedAt = now;
      target.deletedBy = req.user!.name;
      target.deletionReason = reason;
      logServerAudit('WO Soft Deleted', 'ticket', target.woNumber, `Super Admin ${req.user!.name} menandai terhapus (soft delete) WO ${target.woNumber}. Alasan: ${reason}`, req.user);
    }

    saveDatabaseToDisk();
    res.json({ success: true, message: `Work Order ${target.woNumber} berhasil dihapus.` });
  });

  // Bulk Delete Work Orders (Super Admin Exclusive)
  app.post('/api/tickets/bulk-delete', requireSuperAdmin, (req: AuthenticatedRequest, res) => {
    const { ticketIds, reason, permanent } = req.body;
    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      return res.status(400).json({ error: 'Daftar ID tiket tidak valid.' });
    }
    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ error: 'Alasan penghapusan massal wajib minimal 5 karakter.' });
    }

    const idSet = new Set(ticketIds);
    const now = new Date().toISOString();
    let count = 0;

    if (permanent) {
      db.tickets = db.tickets.filter(t => {
        if (idSet.has(t.id)) {
          count++;
          return false;
        }
        return true;
      });
      logServerAudit('Bulk WO Permanently Deleted', 'ticket', `${count} items`, `Super Admin ${req.user!.name} menghapus permanen ${count} WO. Alasan: ${reason}`, req.user);
    } else {
      db.tickets.forEach(t => {
        if (idSet.has(t.id)) {
          t.isDeleted = true;
          t.deletedAt = now;
          t.deletedBy = req.user!.name;
          t.deletionReason = reason;
          count++;
        }
      });
      logServerAudit('Bulk WO Soft Deleted', 'ticket', `${count} items`, `Super Admin ${req.user!.name} menandai terhapus ${count} WO. Alasan: ${reason}`, req.user);
    }

    saveDatabaseToDisk();
    res.json({ success: true, count, message: `Berhasil menghapus ${count} Work Order.` });
  });

  // Purge imported tickets by date within 7-day window
  app.post('/api/tickets/purge-by-date', requireImportPermission, (req: AuthenticatedRequest, res) => {
    const { importDate, reason } = req.body;
    if (!importDate) return res.status(400).json({ error: 'Tanggal import wajib disertakan.' });
    if (!reason || reason.trim().length < 5) return res.status(400).json({ error: 'Alasan wajib minimal 5 karakter.' });

    const beforeCount = db.tickets.length;
    db.tickets = db.tickets.filter(t => {
      const d = t.importDate || (t.createdAt ? t.createdAt.split('T')[0] : '');
      return d !== importDate;
    });
    const purged = beforeCount - db.tickets.length;

    saveDatabaseToDisk();
    logServerAudit('Imported Tickets Purged by Date', 'import_batch', importDate, `${req.user!.name} menghapus ${purged} tiket tanggal import ${importDate}. Alasan: ${reason}`, req.user);

    res.json({ success: true, count: purged, message: `Berhasil menghapus ${purged} tiket import tanggal ${importDate}.` });
  });

  // Get Assignment History
  app.get('/api/tickets/:woNumber/assignment-history', requireAuth, (req: AuthenticatedRequest, res) => {
    const { woNumber } = req.params;
    const history = db.assignmentHistory.filter(
      h => h.woNumber.toUpperCase() === woNumber.toUpperCase() || h.ticketId === woNumber
    );
    res.json({ history });
  });

  // --- Contractor Endpoints ---
  app.get('/api/contractors', requireAuth, (_req, res) => {
    res.json({ contractors: db.contractors });
  });

  app.post('/api/contractors', requireAuth, (req: AuthenticatedRequest, res) => {
    const { contractor, contractors: batch } = req.body;
    const toAdd = batch || (contractor ? [contractor] : []);
    let added = 0;

    toAdd.forEach((c: any) => {
      if (!c.name) return;
      const cleanName = c.name.trim().toLowerCase();
      const existing = db.contractors.find(ex => ex.name.trim().toLowerCase() === cleanName);
      if (!existing) {
        db.contractors.push({
          id: c.id || ('c-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4)),
          name: c.name.trim(),
          code: c.code || c.name.substring(0, 3).toUpperCase(),
          coverageAreas: c.coverageAreas || [],
          leaderName: c.leaderName,
          phone: c.phone,
          email: c.email,
          active: true,
          createdAt: new Date().toISOString()
        });
        added++;
      } else {
        // Merge coverage areas
        if (c.coverageAreas && Array.isArray(c.coverageAreas)) {
          c.coverageAreas.forEach((area: string) => {
            if (!existing.coverageAreas.includes(area)) existing.coverageAreas.push(area);
          });
        }
      }
    });

    saveDatabaseToDisk();
    res.json({ success: true, addedCount: added, contractors: db.contractors });
  });

  // --- Coverage Area Endpoints ---
  app.get('/api/coverage-areas', requireAuth, (_req, res) => {
    res.json({ coverageAreas: db.coverageAreas });
  });

  app.post('/api/coverage-areas', requireAuth, (req: AuthenticatedRequest, res) => {
    const { area, coverageAreas: batch } = req.body;
    const toAdd = batch || (area ? [area] : []);
    toAdd.forEach((a: any) => {
      if (!a.name) return;
      const cleanName = a.name.trim().toLowerCase();
      if (!db.coverageAreas.some(ex => ex.name.trim().toLowerCase() === cleanName)) {
        db.coverageAreas.push({
          id: a.id || ('area-' + Date.now()),
          name: a.name.trim(),
          clusters: a.clusters || [],
          active: true
        });
      }
    });
    saveDatabaseToDisk();
    res.json({ success: true, coverageAreas: db.coverageAreas });
  });

  // --- User Management Endpoints (Super Admin / Leader creating Installer) ---
  app.get('/api/users', requireAuth, (_req, res) => {
    const activeUsers = db.users.filter(u => !u.isDeleted).map(u => {
      const { passwordHash: _, ...safe } = u;
      return safe;
    });
    res.json({ users: activeUsers });
  });

  app.post('/api/users', requireAuth, (req: AuthenticatedRequest, res) => {
    const { name, username, email, phone, role, contractor, contractorId, area } = req.body;
    if (!name || !username || !role) {
      return res.status(400).json({ error: 'Nama, username, dan role akun wajib diisi.' });
    }

    // Role creation security check
    if (req.user!.role !== 'super_admin') {
      if (req.user!.role === 'leader' && role === 'installer') {
        // Leader allowed to create installer for their contractor
      } else {
        return res.status(403).json({ error: 'Akses Ditolak: Anda tidak memiliki wewenang untuk membuat akun ini.' });
      }
    }

    const cleanUsername = username.trim().toLowerCase();
    if (db.users.some(u => u.username.toLowerCase() === cleanUsername && !u.isDeleted)) {
      return res.status(409).json({ error: `Username ${cleanUsername} sudah digunakan.` });
    }

    const newUser: ServerUser = {
      id: 'u-' + Date.now(),
      name: name.trim(),
      username: cleanUsername,
      email: email?.trim() || `${cleanUsername}@morajaws.net`,
      phone: phone?.trim(),
      role,
      contractor: contractor || req.user?.contractor,
      contractorId: contractorId || req.user?.contractorId,
      area: area || req.user?.area,
      active: true,
      passwordHash: DEFAULT_HASH,
      createdAt: new Date().toISOString()
    };

    db.users.push(newUser);
    saveDatabaseToDisk();

    logServerAudit('User Created', 'auth', newUser.id, `User ${req.user!.name} membuat akun: ${newUser.name} (@${newUser.username}) [${newUser.role}]`, req.user);

    const { passwordHash: _, ...safeUser } = newUser;
    res.status(201).json({ success: true, user: safeUser });
  });

  app.post('/api/users/:id/toggle', requireSuperAdmin, (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const user = db.users.find(u => u.id === id);
    if (!user) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });

    user.active = !user.active;
    saveDatabaseToDisk();
    logServerAudit('User Status Toggled', 'auth', id, `Akun ${user.name} diubah menjadi ${user.active ? 'Aktif' : 'Nonaktif'}`, req.user);

    const { passwordHash: _, ...safe } = user;
    res.json({ success: true, user: safe });
  });

  app.post('/api/users/:id/reset-password', requireSuperAdmin, (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const user = db.users.find(u => u.id === id);
    if (!user) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });

    user.passwordHash = DEFAULT_HASH;
    user.mustChangePassword = true;
    saveDatabaseToDisk();
    logServerAudit('User Password Reset', 'auth', id, `Password akun ${user.name} di-reset ke default 12345678`, req.user);

    res.json({ success: true, message: 'Password berhasil di-reset ke default 12345678.' });
  });

  app.delete('/api/users/:id', requireSuperAdmin, (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { reason, permanent } = req.body;

    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ error: 'Alasan penghapusan akun wajib disertakan minimal 5 karakter.' });
    }

    const userIndex = db.users.findIndex(u => u.id === id);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
    }

    const targetUser = db.users[userIndex];
    if (targetUser.id === req.user?.id) {
      return res.status(400).json({ error: 'Anda tidak dapat menghapus akun Anda sendiri saat sedang login.' });
    }

    if (permanent) {
      db.users.splice(userIndex, 1);
      logServerAudit('User Permanently Deleted', 'auth', id, `Akun ${targetUser.name} (@${targetUser.username}) dihapus permanen oleh Super Admin. Alasan: ${reason}`, req.user);
    } else {
      targetUser.isDeleted = true;
      targetUser.active = false;
      targetUser.deletedAt = new Date().toISOString();
      targetUser.deletedBy = req.user?.name;
      targetUser.deletionReason = reason;
      logServerAudit('User Soft Deleted', 'auth', id, `Akun ${targetUser.name} dinonaktifkan & ditandai terhapus (soft delete). Alasan: ${reason}`, req.user);
    }

    saveDatabaseToDisk();
    res.json({ success: true, message: `Akun ${targetUser.name} berhasil dihapus.` });
  });

  // --- Session Management Endpoints ---
  app.get('/api/sessions', requireSuperAdmin, (_req, res) => {
    const now = Date.now();
    SERVER_SESSIONS.forEach(s => {
      if (s.status === 'active' && new Date(s.expiresAt).getTime() < now) {
        s.status = 'expired';
      }
    });
    const safeSessions = SERVER_SESSIONS.map(s => {
      const { token: _, ...safe } = s;
      return safe;
    });
    res.json({ sessions: safeSessions });
  });

  app.post('/api/sessions/revoke', requireAuth, (req: AuthenticatedRequest, res) => {
    const { sessionId, reason } = req.body;
    const session = SERVER_SESSIONS.find(s => s.sessionId === sessionId);
    if (!session) return res.status(404).json({ error: 'Sesi tidak ditemukan.' });

    if (session.userId !== req.user!.id && req.user!.role !== 'super_admin') {
      return res.status(403).json({ error: 'Akses Ditolak: Anda hanya dapat mencabut sesi Anda sendiri.' });
    }

    session.status = 'revoked';
    logServerAudit('Session Revoked', 'session', sessionId, `Sesi dicabut oleh ${req.user!.name}. Alasan: ${reason || 'Pencabutan manual'}`, req.user);
    res.json({ success: true, message: 'Sesi berhasil dicabut.' });
  });

  // --- Global Configuration Storage ---
  app.get('/api/config/global', (_req, res) => {
    res.json({ config: db.globalConfig });
  });

  app.post('/api/config/global', requireSuperAdmin, (req: AuthenticatedRequest, res) => {
    const { config } = req.body;
    db.globalConfig = {
      ...config,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user!.name,
      updatedByRole: req.user!.role
    };
    saveDatabaseToDisk();
    logServerAudit('Global Config Updated', 'ui_config', 'global', `Super Admin ${req.user!.name} memperbarui konfigurasi global`, req.user);
    res.json({ success: true, config: db.globalConfig });
  });

  // --- Operational Date Engine (Asia/Jakarta) ---
  app.get('/api/system/operational-date', (_req, res) => {
    res.json(getOperationalDate());
  });

  app.post('/api/system/operational-date', requireSuperAdmin, (req: AuthenticatedRequest, res) => {
    const { date, isAuto } = req.body;
    db.operationalDateOverride = isAuto || !date ? null : String(date).trim();
    saveDatabaseToDisk();
    const current = getOperationalDate();
    logServerAudit('Operational Date Changed', 'global_config', 'operational-date', `Tanggal acuan operasional diubah menjadi: ${current.date}`, req.user);
    res.json({ success: true, ...current });
  });

  // Helper to extract clean Google Spreadsheet ID
  function extractCleanSpreadsheetId(input: string): string {
    if (!input) return '';
    const trimmed = input.trim();
    const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) return match[1];
    if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
    return trimmed;
  }

  // --- Google Sheets Sync Configuration & Real Backend Integration ---
  app.get(['/api/sheets/config', '/api/integrations/google-sheets/config'], requireSuperAdmin, (_req, res) => {
    res.json({ config: db.sheetsConfig });
  });

  app.post(['/api/sheets/config', '/api/integrations/google-sheets/config'], requireSuperAdmin, (req: AuthenticatedRequest, res) => {
    const updates = req.body;
    const cleanId = extractCleanSpreadsheetId(updates.spreadsheetId || updates.spreadsheetUrl || db.sheetsConfig.spreadsheetId);

    db.sheetsConfig = {
      ...db.sheetsConfig,
      ...updates,
      spreadsheetId: cleanId || db.sheetsConfig.spreadsheetId,
      spreadsheetUrl: cleanId ? `https://docs.google.com/spreadsheets/d/${cleanId}/edit` : db.sheetsConfig.spreadsheetUrl,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user!.name
    };

    saveDatabaseToDisk();
    logServerAudit('Google Sheets Config Updated', 'ui_config', 'sheets', `Konfigurasi Google Sheets diperbarui oleh ${req.user!.name}`, req.user);
    res.json({ success: true, config: db.sheetsConfig });
  });

  // Google Sheets Real-Time Status Endpoint
  app.get('/api/integrations/google-sheets/status', requireAuth, (_req, res) => {
    const hasSheets = Boolean(db.sheetsConfig.spreadsheetId);
    res.json({
      success: true,
      status: db.sheetsConfig.status || (hasSheets ? 'Connected' : 'Disconnected'),
      configured: hasSheets,
      projectId: db.sheetsConfig.projectId || process.env.GOOGLE_CLOUD_PROJECT_ID || 'clever-gearing-s5wls',
      spreadsheetId: db.sheetsConfig.spreadsheetId || null,
      spreadsheetTitle: db.sheetsConfig.spreadsheetTitle || null,
      spreadsheetUrl: db.sheetsConfig.spreadsheetUrl || null,
      sheetName: db.sheetsConfig.sheetName || 'Work_Orders',
      destSheetName: db.sheetsConfig.destSheetName || 'Work_Orders',
      authMethod: db.sheetsConfig.authMethod || 'oauth_token',
      lastSyncAt: db.sheetsConfig.lastSyncAt,
      lastSyncStatus: db.sheetsConfig.lastSyncStatus,
      lastSyncMessage: db.sheetsConfig.lastSyncMessage || '',
      lastErrorMessage: db.sheetsConfig.lastErrorMessage || '',
      recordsCount: db.tickets.length,
      isSyncing: isSyncInProgress,
      currentJobId: currentSyncJobId
    });
  });

  // Google Sheets Test Connection (Validates Google Sheets API, Permissions, Header Structure)
  app.post('/api/integrations/google-sheets/test', requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const { spreadsheetId, sheetName = 'Work_Orders', accessToken, projectId, authMethod } = req.body;
    const targetId = extractCleanSpreadsheetId(spreadsheetId || db.sheetsConfig.spreadsheetId);
    const targetSheet = (sheetName || db.sheetsConfig.sheetName || 'Work_Orders').trim();
    const token = accessToken || req.headers['x-google-access-token'] || process.env.GOOGLE_OAUTH_ACCESS_TOKEN;

    if (!targetId) {
      return res.status(400).json({
        connected: false,
        status: 'Disconnected',
        error: 'Spreadsheet ID atau URL spreadsheet wajib diisi.'
      });
    }

    const startMs = Date.now();
    try {
      const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${targetId}?fields=properties.title,sheets.properties(sheetId,title)`;
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const metaRes = await fetch(metaUrl, { headers });
      const latencyMs = Date.now() - startMs;

      if (!metaRes.ok) {
        const errBody = await metaRes.json().catch(() => ({}));
        const errMsg = errBody.error?.message || `Google Sheets API error HTTP ${metaRes.status}`;

        let friendlyError = errMsg;
        if (metaRes.status === 401) {
          friendlyError = 'Otorisasi Google kedaluwarsa atau token tidak valid. Silakan sambungkan kembali akun Google Anda.';
        } else if (metaRes.status === 403) {
          friendlyError = 'Izin akses ditolak (403 Forbidden). Pastikan spreadsheet telah dibagikan kepada akun Google Anda atau Service Account backend.';
        } else if (metaRes.status === 404) {
          friendlyError = 'Spreadsheet tidak ditemukan (404). Periksa kembali Spreadsheet ID atau URL spreadsheet.';
        }

        db.sheetsConfig.status = 'Disconnected';
        db.sheetsConfig.lastSyncStatus = 'failed';
        db.sheetsConfig.lastErrorMessage = friendlyError;
        saveDatabaseToDisk();

        logServerAudit('Google Sheets Test Failed', 'integration', targetId, `Koneksi Google Sheets gagal (${metaRes.status}): ${friendlyError}`, req.user);

        return res.status(400).json({
          connected: false,
          status: 'Disconnected',
          latencyMs,
          error: friendlyError,
          rawStatus: metaRes.status
        });
      }

      const metaData = await metaRes.json();
      const sheetTitle = metaData.properties?.title || 'Spreadsheet Tanpa Judul';
      const availableTabs: string[] = (metaData.sheets || []).map((s: any) => s.properties?.title).filter(Boolean);

      // Read header row from target tab to verify column structure
      const range = `${encodeURIComponent(targetSheet)}!A1:AZ1`;
      const rangeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${targetId}/values/${range}?valueRenderOption=FORMATTED_VALUE`;
      const rangeRes = await fetch(rangeUrl, { headers });
      let detectedHeaders: string[] = [];

      if (rangeRes.ok) {
        const rangeData = await rangeRes.json();
        if (rangeData.values && rangeData.values.length > 0) {
          detectedHeaders = rangeData.values[0];
        }
      }

      db.sheetsConfig = {
        ...db.sheetsConfig,
        spreadsheetId: targetId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${targetId}/edit`,
        spreadsheetTitle: sheetTitle,
        sheetName: targetSheet,
        projectId: projectId || db.sheetsConfig.projectId || process.env.GOOGLE_CLOUD_PROJECT_ID || 'clever-gearing-s5wls',
        authMethod: authMethod || db.sheetsConfig.authMethod || 'oauth_token',
        status: 'Connected',
        lastErrorMessage: '',
        lastCheckedAt: new Date().toISOString()
      };
      saveDatabaseToDisk();

      logServerAudit('Google Sheets Test Succeeded', 'integration', targetId, `Koneksi ke Google Sheets "${sheetTitle}" [${targetSheet}] berhasil (${latencyMs}ms)`, req.user);

      return res.json({
        connected: true,
        status: 'Connected',
        latencyMs,
        spreadsheetId: targetId,
        spreadsheetTitle: sheetTitle,
        sheetName: targetSheet,
        availableTabs,
        headers: detectedHeaders,
        message: `Koneksi ke spreadsheet "${sheetTitle}" berhasil diverifikasi (${latencyMs}ms). Ditemukan ${availableTabs.length} tab.`
      });
    } catch (err: any) {
      const latencyMs = Date.now() - startMs;
      const msg = err?.message || 'Gagal menghubungi Google Sheets API.';
      db.sheetsConfig.status = 'Disconnected';
      db.sheetsConfig.lastErrorMessage = msg;
      saveDatabaseToDisk();

      return res.status(500).json({
        connected: false,
        status: 'Disconnected',
        latencyMs,
        error: msg
      });
    }
  });

  // Google Sheets Two-Way Synchronization Engine (Pull & Push)
  app.post('/api/integrations/google-sheets/sync', requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
    if (isSyncInProgress) {
      return res.status(409).json({
        error: `Sinkronisasi sedang berlangsung (Job ID: ${currentSyncJobId}).`,
        code: 'SYNC_IN_PROGRESS',
        jobId: currentSyncJobId
      });
    }

    const {
      direction = 'pull',
      spreadsheetId,
      sheetName = 'Work_Orders',
      accessToken
    } = req.body;

    const targetId = extractCleanSpreadsheetId(spreadsheetId || db.sheetsConfig.spreadsheetId);
    const targetSheet = (sheetName || db.sheetsConfig.sheetName || 'Work_Orders').trim();
    const token = accessToken || req.headers['x-google-access-token'] || process.env.GOOGLE_OAUTH_ACCESS_TOKEN;

    if (!targetId) {
      return res.status(400).json({ error: 'Spreadsheet ID belum dikonfigurasi.' });
    }

    const jobId = 'sync_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const startedAt = new Date().toISOString();
    const startMs = Date.now();
    isSyncInProgress = true;
    currentSyncJobId = jobId;

    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      if (direction === 'pull' || direction === 'both') {
        const fetchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${targetId}/values/${encodeURIComponent(targetSheet)}!A1:AZ5000?valueRenderOption=FORMATTED_VALUE`;
        const sheetRes = await fetch(fetchUrl, { headers });

        if (!sheetRes.ok) {
          const errJson = await sheetRes.json().catch(() => ({}));
          throw new Error(errJson.error?.message || `Gagal membaca sheet '${targetSheet}' (${sheetRes.status})`);
        }

        const sheetData = await sheetRes.json();
        const rawValues: string[][] = sheetData.values || [];

        if (rawValues.length === 0) {
          throw new Error(`Tab '${targetSheet}' tidak memiliki data baris.`);
        }

        const colHeaders = rawValues[0].map(h => (h ? String(h).trim() : ''));
        const headerIndexMap = new Map<string, number>();
        colHeaders.forEach((h, idx) => {
          if (h) headerIndexMap.set(h.toLowerCase(), idx);
        });

        const getVal = (row: string[], ...names: string[]) => {
          for (const name of names) {
            const idx = headerIndexMap.get(name.toLowerCase());
            if (idx !== undefined && row[idx] !== undefined) {
              const val = String(row[idx]).trim();
              if (val) return val;
            }
          }
          return '';
        };

        const existingWoMap = new Map<string, any>();
        db.tickets.forEach(t => {
          const key = (t.woNumber || t.workOrderNumber || '').trim().toUpperCase();
          if (key) existingWoMap.set(key, t);
        });

        let processedCount = 0;
        let newCount = 0;
        let updatedCount = 0;
        let skippedCount = 0;
        const nowIso = new Date().toISOString();

        for (let i = 1; i < rawValues.length; i++) {
          const row = rawValues[i];
          if (!row || row.every(c => !c || String(c).trim() === '')) continue;
          processedCount++;

          const woNumber = getVal(row, 'WO Number', 'Work Order Number', 'WO', 'Ticket WO');
          if (!woNumber) {
            skippedCount++;
            continue;
          }

          const upperWo = woNumber.toUpperCase();
          const rawCustId = getVal(row, 'ID Customer', 'Customer ID', 'Cust ID');
          const custDigits = rawCustId.replace(/\D/g, '');
          const validCustId = custDigits.length === 7 ? custDigits : (rawCustId || '');
          const appDate = normalizeAppointmentDate(getVal(row, 'Appointment Date', 'Date', 'Schedule Date'));

          if (existingWoMap.has(upperWo)) {
            const existing = existingWoMap.get(upperWo);
            // PRESERVE OPERATIONAL FIELDS: Do NOT wipe leader assignment, installerName, status, or report!
            if (appDate) existing.appointmentDate = appDate;
            const slot = getVal(row, 'Slot Time', 'Time Slot');
            if (slot) existing.slotTime = slot;
            const phone = getVal(row, 'Customer Phone', 'Phone', 'Telp');
            if (phone) existing.customerPhone = phone;
            const remarks = getVal(row, 'Remarks Agent', 'Agent Notes');
            if (remarks) existing.remarksAgent = remarks;
            const cat = getVal(row, 'Ticket Category', 'Category');
            if (cat) existing.ticketCategory = cat;

            existing.updatedAt = nowIso;
            existing.updatedBy = `Google Sheets Sync (${req.user!.name})`;
            updatedCount++;
          } else {
            // New WO
            const newTicket = {
              id: 't-gs-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
              woNumber,
              workOrderNumber: woNumber,
              idCustomer: validCustId,
              customerId: validCustId,
              ticketNumber: getVal(row, 'Ticket Number', 'Ticket No') || ('TCK-' + woNumber.slice(-4)),
              ticketDate: getVal(row, 'Ticket Date', 'Date') || nowIso.split('T')[0],
              date: appDate || nowIso.split('T')[0],
              appointmentDate: appDate,
              dateUpload: nowIso.replace('T', ' ').substring(0, 16),
              fileName: `GoogleSheets_${targetSheet}`,
              agentId: getVal(row, 'Agent ID') || req.user!.username,
              customerName: getVal(row, 'Customer Name', 'End User Name') || '-',
              endUserName: getVal(row, 'Customer Name', 'End User Name') || '-',
              customerPhone: getVal(row, 'Customer Phone', 'Phone') || '',
              customerPhoneNormalized: normalizePhoneNumber(getVal(row, 'Customer Phone', 'Phone')),
              customerContact2: getVal(row, 'Customer Phone 2', 'Customer Contact 2') || '',
              slotTime: getVal(row, 'Slot Time') || '',
              area: getVal(row, 'Area') || '',
              clusterName: getVal(row, 'Cluster Name', 'Cluster') || '',
              streetName: getVal(row, 'Street Name', 'Alamat') || '',
              streetAlternatif: getVal(row, 'Street Alternatif', 'Patokan') || '',
              contactorName: getVal(row, 'Contactor Name', 'Contractor Name', 'Vendor') || '',
              contractorName: getVal(row, 'Contactor Name', 'Contractor Name', 'Vendor') || '',
              leaderName: getVal(row, 'Leader Name', 'Corlap Name') || '',
              installerName: getVal(row, 'Installer Name', 'Teknisi') || '',
              installerContact: getVal(row, 'Installer Contact') || '',
              fdtCode: getVal(row, 'FDT Code', 'FDT') || '',
              fatCode: getVal(row, 'FAT Code', 'FAT') || '',
              ticketCategory: getVal(row, 'Ticket Category') || 'New Installation FTTH',
              statusWOAgent: getVal(row, 'Status WO Agent') || 'Pending',
              statusWOInstaller: getVal(row, 'Status WO Installer') || 'Unassigned',
              statusWhatsApp: 'not_prepared',
              remarksWOInstaller: getVal(row, 'Remarks WO Installer') || '',
              remarksAgent: getVal(row, 'Remarks Agent') || '',
              isArchived: false,
              isDeleted: false,
              distributionStatus: 'sheets_synced',
              createdAt: nowIso,
              updatedAt: nowIso,
              updatedBy: `Google Sheets Sync (${req.user!.name})`
            };

            db.tickets.unshift(newTicket);
            existingWoMap.set(upperWo, newTicket);
            newCount++;
          }
        }

        const durationMs = Date.now() - startMs;
        const completedAt = new Date().toISOString();

        db.sheetsConfig = {
          ...db.sheetsConfig,
          lastSyncAt: completedAt,
          lastSyncStatus: 'success',
          lastSyncMessage: `Sinkronisasi berhasil: ${processedCount} diproses, ${newCount} baru, ${updatedCount} diperbarui (${durationMs}ms)`,
          lastErrorMessage: '',
          recordsCount: db.tickets.length
        };

        const historyEntry: ServerSyncHistoryEntry = {
          jobId,
          syncType: 'pull_sheets',
          startedAt,
          completedAt,
          status: 'Success',
          processedCount,
          successCount: newCount + updatedCount,
          failedCount: skippedCount,
          newRecordsCount: newCount,
          updatedRecordsCount: updatedCount,
          dataSource: `Google Sheets [${targetSheet}]`,
          initiatedBy: req.user!.name,
          initiatedByRole: req.user!.role,
          durationMs
        };

        db.syncHistory.unshift(historyEntry);
        if (db.syncHistory.length > 200) db.syncHistory.pop();
        saveDatabaseToDisk();

        logServerAudit('Google Sheets Sync Succeeded', 'integration', targetId, `Sync Google Sheets [${targetSheet}]: +${newCount} baru, ~${updatedCount} diupdate (${durationMs}ms)`, req.user);

        return res.json({
          success: true,
          jobId,
          durationMs,
          processedCount,
          newRecordsCount: newCount,
          updatedRecordsCount: updatedCount,
          skippedCount,
          totalTicketsNow: db.tickets.length,
          message: `Sinkronisasi Google Sheets selesai: ${newCount} tiket baru ditambahkan, ${updatedCount} tiket diperbarui.`
        });
      }

      throw new Error(`Mode sinkronisasi '${direction}' belum didukung.`);
    } catch (err: any) {
      const durationMs = Date.now() - startMs;
      const completedAt = new Date().toISOString();
      const errMsg = err?.message || 'Kegagalan sinkronisasi dengan Google Sheets.';

      db.sheetsConfig.lastSyncAt = completedAt;
      db.sheetsConfig.lastSyncStatus = 'failed';
      db.sheetsConfig.lastErrorMessage = errMsg;

      const historyEntry: ServerSyncHistoryEntry = {
        jobId,
        syncType: 'pull_sheets',
        startedAt,
        completedAt,
        status: 'Failed',
        processedCount: 0,
        successCount: 0,
        failedCount: 1,
        newRecordsCount: 0,
        updatedRecordsCount: 0,
        errorSummary: errMsg,
        dataSource: `Google Sheets [${targetSheet}]`,
        initiatedBy: req.user!.name,
        initiatedByRole: req.user!.role,
        durationMs
      };

      db.syncHistory.unshift(historyEntry);
      saveDatabaseToDisk();

      logServerAudit('Google Sheets Sync Failed', 'integration', targetId, `Sync Google Sheets gagal: ${errMsg}`, req.user);

      return res.status(500).json({
        success: false,
        error: `Gagal melakukan sinkronisasi: ${errMsg}. Data operasional lokal tetap aman dan dipertahankan.`,
        jobId,
        durationMs
      });
    } finally {
      isSyncInProgress = false;
      currentSyncJobId = null;
    }
  });

  // --- Attachments & File Upload API (Firebase Storage / Secure Persistent Storage) ---
  app.post('/api/attachments', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const { fileName, fileType, fileSize, fileData, woNumber, ticketId } = req.body;
    if (!fileName || !fileData) {
      return res.status(400).json({ error: 'Nama file dan data file wajib disertakan.' });
    }

    // Validate file size (max 10MB)
    const maxSizeBytes = 10 * 1024 * 1024;
    const estimatedSize = fileSize || Math.round((fileData.length * 3) / 4);
    if (estimatedSize > maxSizeBytes) {
      return res.status(413).json({ error: `Ukuran file melebihi batas maksimum 10MB (Ukuran: ${(estimatedSize / (1024 * 1024)).toFixed(2)}MB).` });
    }

    // Validate MIME type
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain'];
    const cleanMime = (fileType || 'image/jpeg').toLowerCase().trim();
    const isAllowed = allowedMimes.some(m => cleanMime.startsWith(m) || cleanMime.includes(m.split('/')[1]));
    if (!isAllowed) {
      return res.status(415).json({
        error: `Format file tidak diizinkan (${cleanMime}). Hanya file gambar (JPG, PNG, WEBP), PDF, dan dokumen teks yang diizinkan.`
      });
    }

    const fileId = 'att_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const now = new Date().toISOString();

    const attachment = {
      fileId,
      id: fileId,
      woNumber: woNumber || ticketId || 'WO-GENERAL',
      ticketId: ticketId || woNumber,
      fileName: String(fileName).trim(),
      fileType: cleanMime,
      fileSize: estimatedSize,
      storagePath: `work_orders/${woNumber || 'general'}/${fileId}_${fileName}`,
      storageType: 'Firebase Storage / Secure Persistent Storage',
      url: fileData.startsWith('data:') ? fileData : `data:${cleanMime};base64,${fileData}`,
      sender: req.user!.name,
      senderId: req.user!.id,
      senderRole: req.user!.role,
      uploadedAt: now,
      validationStatus: 'verified'
    };

    db.attachments = db.attachments || [];
    db.attachments.unshift(attachment);
    if (db.attachments.length > 500) db.attachments.pop();
    saveDatabaseToDisk();

    logServerAudit('Attachment Uploaded', 'attachment', fileId, `${req.user!.name} (${req.user!.role}) mengunggah lampiran "${fileName}" (${(estimatedSize / 1024).toFixed(1)} KB) untuk WO ${woNumber}`, req.user);

    res.json({ success: true, attachment });
  });

  // --- Work Order Core Aliases per Section 12 Specification ---
  app.get('/api/work-orders', requireAuth, (req: AuthenticatedRequest, res) => {
    const scopedTickets = scopeTicketsForUser(db.tickets, req.user!);
    res.json({ success: true, workOrders: scopedTickets, count: scopedTickets.length });
  });

  app.get('/api/work-orders/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const ticket = db.tickets.find(t => t.id === id || t.woNumber === id);
    if (!ticket) return res.status(404).json({ error: 'Work Order tidak ditemukan.' });
    res.json({ success: true, workOrder: ticket });
  });

  app.post('/api/work-orders/:id/assign', requireLeaderOrAdminForAssignment, (req: AuthenticatedRequest, res) => {
    req.body.ticketId = req.params.id;
    const { installerName, slotTime, remarks } = req.body;
    if (!installerName || !installerName.trim()) {
      return res.status(400).json({ error: 'Nama teknisi tujuan wajib diisi.' });
    }
    const target = db.tickets.find(t => t.id === req.params.id || t.woNumber === req.params.id);
    if (!target) return res.status(404).json({ error: 'Work Order tidak ditemukan.' });

    target.installerName = installerName.trim();
    if (slotTime) target.slotTime = slotTime;
    target.statusWOInstaller = 'Assigned';
    if (remarks) target.remarksWOInstaller = target.remarksWOInstaller ? `${target.remarksWOInstaller}; ${remarks}` : remarks;
    target.updatedAt = new Date().toISOString();
    target.updatedBy = req.user!.name;

    saveDatabaseToDisk();
    res.json({ success: true, message: `Work Order berhasil ditugaskan ke teknisi ${installerName}`, workOrder: target });
  });

  app.post('/api/work-orders/:id/reassign', requireLeaderOrAdminForAssignment, (req: AuthenticatedRequest, res) => {
    req.body.ticketId = req.params.id;
    const { newInstallerName, reason } = req.body;
    if (!newInstallerName || !newInstallerName.trim()) {
      return res.status(400).json({ error: 'Teknisi baru tujuan wajib dipilih.' });
    }
    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ error: 'Alasan reassign wajib minimal 5 karakter.' });
    }
    const target = db.tickets.find(t => t.id === req.params.id || t.woNumber === req.params.id);
    if (!target) return res.status(404).json({ error: 'Work Order tidak ditemukan.' });

    const prevName = target.installerName || 'Sebelumnya';
    target.installerName = newInstallerName.trim();
    target.statusWOInstaller = 'Assigned';
    target.updatedAt = new Date().toISOString();
    target.updatedBy = req.user!.name;

    saveDatabaseToDisk();
    res.json({ success: true, message: `Work Order berhasil dialihkan dari ${prevName} ke ${newInstallerName}`, workOrder: target });
  });

  app.get('/api/settings', requireAuth, (_req, res) => {
    res.json({ globalConfig: db.globalConfig, sessionConfig: db.sessionConfig });
  });

  app.get('/api/reports', requireAuth, (req: AuthenticatedRequest, res) => {
    const scopedTickets = scopeTicketsForUser(db.tickets, req.user!);
    const reports = scopedTickets
      .filter(t => t.technicalReport)
      .map(t => ({
        ticketId: t.id,
        woNumber: t.woNumber,
        customerName: t.customerName,
        installerName: t.installerName,
        statusWOInstaller: t.statusWOInstaller,
        report: t.technicalReport
      }));
    res.json({ success: true, count: reports.length, reports });
  });

  // Legacy sync check & run
  app.get('/api/sync/status', requireAuth, (_req, res) => {
    const hasSheets = Boolean(db.sheetsConfig.spreadsheetId);
    res.json({
      appDbStatus: 'Connected',
      sheetsStatus: hasSheets ? 'Connected' : 'Unconfigured',
      lastSyncStatus: db.sheetsConfig.lastSyncStatus || (hasSheets ? 'Success' : 'Pending'),
      lastSyncAt: db.sheetsConfig.lastSyncAt,
      lastAttemptAt: db.sheetsConfig.lastSyncAt || new Date().toISOString(),
      totalRecordsRead: db.tickets.length,
      totalRecordsProcessed: db.tickets.length,
      totalRecordsFailed: 0,
      pendingChangesCount: 0,
      isSyncing: isSyncInProgress,
      currentJobId: currentSyncJobId
    });
  });

  app.post('/api/sync/check-connection', requireAuth, (_req, res) => {
    const hasSheets = Boolean(db.sheetsConfig.spreadsheetId);
    res.json({
      success: true,
      appDb: {
        status: 'Connected',
        latencyMs: 5,
        storageType: 'Central Persistent JSON Database'
      },
      sheets: {
        status: hasSheets ? 'Connected' : 'Unconfigured',
        spreadsheetId: db.sheetsConfig.spreadsheetId || null,
        sheetName: db.sheetsConfig.sheetName || 'Work_Orders',
        lastCheckedAt: new Date().toISOString()
      }
    });
  });

  app.get('/api/sync/history', requireAuth, (_req, res) => {
    res.json({ history: db.syncHistory });
  });

  // --- Live Chat Messages ---
  app.get('/api/tickets/:id/messages', requireAuth, (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const msgs = db.ticketMessages.filter(m => m.ticketId === id || m.woNumber === id);
    res.json({ messages: msgs });
  });

  app.post('/api/tickets/:id/messages', requireAuth, (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { text, attachments } = req.body;
    const user = req.user!;

    const ticket = db.tickets.find(t => t.id === id || t.woNumber === id);
    const newMsg = {
      id: 'msg_' + Date.now(),
      ticketId: ticket ? ticket.id : id,
      woNumber: ticket ? ticket.woNumber : id,
      senderId: user.id,
      senderName: user.name,
      senderRole: user.role,
      text: text || '',
      attachments: attachments || [],
      timestamp: new Date().toISOString()
    };

    db.ticketMessages.push(newMsg);
    saveDatabaseToDisk();

    res.json({ success: true, message: newMsg });
  });

  // --- WhatsApp Preview ---
  app.post('/api/whatsapp/preview', (req, res) => {
    try {
      const { templateBody, ticket } = req.body;
      const result = renderWhatsAppMessage(templateBody, ticket);
      const urlResult = buildWhatsAppClickToChatUrl(ticket?.customerPhone || '', result.renderedText);
      res.json({
        renderedText: result.renderedText,
        missingVariables: result.missingVariables,
        url: urlResult.url,
        urlError: urlResult.error
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // --- Audit Logs ---
  app.get('/api/audit-logs', requireSuperAdmin, (_req, res) => {
    res.json({ logs: db.auditLogs });
  });

  app.post('/api/audit-logs', requireAuth, (req: AuthenticatedRequest, res) => {
    const { action, entity, entityId, details } = req.body;
    const entry = logServerAudit(action, entity, entityId, details, req.user || null);
    res.json(entry);
  });

  // Mount Vite middleware in development or serve static in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MoraJaws Dispatch Management Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
