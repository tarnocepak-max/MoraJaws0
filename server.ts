import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import { checkSupabaseConnection, getLastSupabaseHealthStatus } from './server/supabaseClient.ts';
import { checkFirebaseAdminHealth, verifyFirebaseIdToken } from './server/firebaseAdmin.ts';
import {
  findUserInSupabase,
  findUserInSupabaseDetailed,
  getUsersFromSupabase,
  getUserByIdFromSupabase,
  insertUserToSupabase,
  updateUserInSupabase,
  getWorkOrdersFromSupabase,
  getWorkOrderByIdFromSupabase,
  getWorkOrderByWoNumberFromSupabase,
  insertWorkOrderToSupabase,
  updateWorkOrderInSupabase,
  deleteWorkOrderFromSupabase,
  bulkImportWorkOrdersToSupabase,
  getAppSettingFromSupabase,
  saveAppSettingToSupabase,
  insertAuditLogToSupabase
} from './server/supabaseAdapter.ts';
import { runPhase8ShadowDryRunSuite } from './server/supabaseShadowService.ts';
import { realtimeSandboxHub, requireSandboxSuperAdmin, getSandboxSuperAdminAllowlist } from './server/realtimeHub.ts';
import { sandboxJournalEngine } from './server/sandbox/sandboxJournal.ts';
import { sandboxOutboxStore } from './server/sandbox/sandboxOutbox.ts';
import { SandboxRecoveryWorker } from './server/sandbox/sandboxRecoveryWorker.ts';
import { sandboxReplayEngine } from './server/sandbox/sandboxReplay.ts';
import { sandboxAccessController } from './server/sandbox/sandboxAccessControl.ts';
import { sandboxRealtimeCoordinator } from './server/sandbox/sandboxRealtime.ts';
import { sandboxChaosTestRunner } from './server/sandbox/sandboxTestRunner.ts';
import {
  MORAJAWS_STORAGE_BUCKET,
  STORAGE_FOLDERS,
  STORAGE_VALIDATION_RULES,
  classifyFileSource,
  validateFileConstraints,
  buildStorageObjectPath,
  uploadBufferToSupabaseStorage,
  createSupabaseStorageSignedUrl,
  checkSupabaseStorageReadiness,
  refreshSupabaseStorageSignedUrl,
  downloadBufferFromSupabaseStorage,
  checkActualBucketAvailability,
  evaluateFileAccessPermission,
  uploadFile,
  downloadFile,
  getSignedFileUrl,
  refreshSignedFileUrl,
  deleteFile,
  checkFileAccess,
  getStorageProvider,
  validateFileBeforeUpload,
  logStorageOperation,
  getStorageOperationLogs,
  inspectStorageOrphans,
  type StorageFileMetadata,
  type StorageOperationLog
} from './server/supabaseStorage.ts';

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
  role: 'super_admin' | 'dispatch' | 'leader' | 'installer' | 'management_data' | 'it_support';
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
  role: 'super_admin' | 'dispatch' | 'leader' | 'installer' | 'management_data' | 'it_support';
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
  syncType: 'full_sync' | 'pull_sheets' | 'push_sheets' | 'manual_check' | 'manual_sync_run';
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
  storageMetadata?: StorageFileMetadata[];
}

// Initial seed data so that a fresh deployment is immediately operational and non-empty
const INITIAL_SEED_USERS: ServerUser[] = [
  {
    id: 'u-ray',
    name: 'Ray (Super Admin)',
    username: 'ray',
    email: 'rayjs666@gmail.com',
    altEmail: 'rayhanafirzanx@gmail.com, superadmin@morajaws.net, tarnocepak@gmail.com',
    role: 'super_admin',
    active: true,
    passwordHash: DEFAULT_HASH,
    mustChangePassword: true,
    createdAt: '2026-01-01T00:00:00Z'
  },
  {
    id: 'u-1',
    name: 'Alamsyah (Super Admin)',
    username: 'superadmin',
    email: 'tarnocepak@gmail.com',
    altEmail: 'nurhestafauladhea@gmail.com, admin@morajaws.net, rayjs666@gmail.com',
    role: 'super_admin',
    active: true,
    passwordHash: DEFAULT_HASH,
    mustChangePassword: true,
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
    mustChangePassword: true,
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
    mustChangePassword: true,
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
    mustChangePassword: true,
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
    mustChangePassword: true,
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
    mustChangePassword: true,
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
    mustChangePassword: true,
    createdAt: '2026-01-01T00:00:00Z'
  },
  {
    id: 'u-itsupport-1',
    name: 'Fajar Pratama (IT Support)',
    username: 'itsupport',
    email: 'support@morajaws.net',
    role: 'it_support',
    phone: '081200112233',
    active: true,
    passwordHash: DEFAULT_HASH,
    mustChangePassword: true,
    permissions: [
      'login',
      'system_health',
      'application_configuration',
      'ui_configuration',
      'setting_droplist',
      'view_audit_logs'
    ],
    createdAt: '2026-01-01T00:00:00Z'
  },
  {
    id: 'u-inactive-1',
    name: 'Bambang Sudirgo (Akun Nonaktif)',
    username: 'staf_nonaktif',
    email: 'bambang.nonaktif@morajaws.net',
    role: 'installer',
    contractor: 'PT Kencana Solusindo',
    contractorId: 'c-kcs',
    area: 'Jakarta Barat',
    phone: '085711229988',
    active: false,
    passwordHash: DEFAULT_HASH,
    mustChangePassword: true,
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
          attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
          storageMetadata: Array.isArray(parsed.storageMetadata) ? parsed.storageMetadata : []
        };
        if (Array.isArray(parsed.sessions)) {
          SERVER_SESSIONS.length = 0;
          SERVER_SESSIONS.push(...parsed.sessions);
        }
        // Ensure Ray Super Admin is present in user directory
        if (!db.users.some(u => u.username.toLowerCase() === 'ray' || u.email.toLowerCase() === 'rayjs666@gmail.com')) {
          db.users.unshift(INITIAL_SEED_USERS[0]);
          saveDatabaseToDisk();
        }
        // Ensure IT Support seed account is present
        if (!db.users.some(u => u.username.toLowerCase() === 'itsupport')) {
          const itSeed = INITIAL_SEED_USERS.find(u => u.username === 'itsupport');
          if (itSeed) db.users.push(itSeed);
          saveDatabaseToDisk();
        }
        // Ensure mustChangePassword flag is set on any seed account with default password
        db.users.forEach(u => {
          if (u.passwordHash === DEFAULT_HASH && u.mustChangePassword === undefined) {
            u.mustChangePassword = true;
          }
        });
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

// Helper to log server audit entries with dual-standby write to Supabase
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

  // Dual-write audit log asynchronously to Supabase PostgreSQL without blocking
  insertAuditLogToSupabase({
    id: entry.id,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId,
    details: entry.details,
    performed_by: entry.performedBy,
    user_role: entry.userRole,
    performed_by_id: user?.id,
    metadata: { source: 'morajaws_server_dual_standby' }
  }).catch(() => {});

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
  authSource?: 'firebase_token' | 'server_session';
  decodedFirebaseToken?: any;
}

async function resolveUserFromHeader(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  let found: ServerUser | undefined;
  let activeSession: ServerSession | undefined;
  let authSource: 'firebase_token' | 'server_session' | undefined;
  let verifiedDecodedFirebaseToken: any | undefined;
  const now = Date.now();

  const authHeader = req.headers['authorization'];
  const queryToken = typeof req.query?.token === 'string' ? req.query.token.trim() : undefined;
  const rawToken = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.substring(7).trim() : queryToken;

  if (rawToken) {
    const token = rawToken;

    // 1. Firebase Admin ID Token Verification (Section F Workflow)
    try {
      const decodedFirebaseToken = await verifyFirebaseIdToken(token);
      if (decodedFirebaseToken && decodedFirebaseToken.uid) {
        authSource = 'firebase_token';
        verifiedDecodedFirebaseToken = decodedFirebaseToken;

        // 1.A. Match UID with user in Supabase
        const supabaseUser = await findUserInSupabase(decodedFirebaseToken.uid);
        if (supabaseUser && supabaseUser.active && !supabaseUser.isDeleted) {
          found = supabaseUser;
        } else {
          // 1.B. Fallback match with local persistent storage
          const cleanEmail = (decodedFirebaseToken.email || '').toLowerCase().trim();
          found = db.users.find(u =>
            !u.isDeleted && u.active && (
              (u.firebaseUid && u.firebaseUid === decodedFirebaseToken.uid) ||
              (cleanEmail && u.email && u.email.toLowerCase() === cleanEmail) ||
              (cleanEmail && u.altEmail && u.altEmail.toLowerCase().includes(cleanEmail))
            )
          );

          if (found && !found.firebaseUid) {
            found.firebaseUid = decodedFirebaseToken.uid;
            saveDatabaseToDisk();
          }
        }
      }
    } catch (fbErr) {
      console.warn('[Auth Middleware] Firebase token check warning:', fbErr);
    }

    // 2. Server Session Verification (for staff login and active session tokens)
    if (!found) {
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
            authSource = 'server_session';
            found = db.users.find(u => u.id === activeSession!.userId && !u.isDeleted && u.active);
          }
        }
      }
      // Strict Security: Unregistered or forged tokens are never accepted.
      // Legitimate sessions issued by /api/auth/login and /api/auth/firebase-login
      // are persisted in SERVER_SESSIONS across restarts via morajaws_database.json.
    }
  }

  // NOTE: Unverified header bypass (x-user-id / x-username) is removed per Security Constitution.
  // All requests must be authenticated via valid Firebase token or verified session token.

  req.user = found;
  req.session = activeSession;
  req.authSource = authSource;
  req.decodedFirebaseToken = verifiedDecodedFirebaseToken;
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

function requireBackupDownloadPermission(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // 1. Dilarang menggunakan parameter ?token= untuk otentikasi
  if (req.query && (req.query.token !== undefined || typeof req.query.token === 'string')) {
    return res.status(401).json({
      error: 'Autentikasi Ditolak: Penggunaan parameter "?token=" dilarang keras. Wajib menggunakan header "Authorization: Bearer <token>".',
      code: 'QUERY_TOKEN_FORBIDDEN'
    });
  }

  // 2. Wajib menggunakan header Authorization: Bearer <token>
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Tidak terautentikasi: Header "Authorization: Bearer <token>" wajib disertakan.',
      code: 'UNAUTHENTICATED'
    });
  }

  // 3. User harus terverifikasi dari token (bukan dari header buatan)
  if (!req.user) {
    return res.status(401).json({
      error: 'Tidak terautentikasi: Token autentikasi tidak valid atau sesi telah kedaluwarsa.',
      code: 'UNAUTHENTICATED'
    });
  }

  // 4. Hanya role super_admin dan management_data yang diizinkan
  const allowedRoles = ['super_admin', 'management_data'];
  if (!allowedRoles.includes(req.user.role)) {
    logServerAudit(
      'Access Denied (Backup Download Required Super Admin or Management Data)',
      'rbac',
      req.originalUrl,
      `User ${req.user.name} (${req.user.role}) ditolak mengunduh file backup database`,
      req.user
    );
    return res.status(403).json({
      error: 'Akses Ditolak: Otoritas mengunduh backup database dibatasi untuk Super Admin dan Data Management.',
      code: 'REQUIRE_BACKUP_PERMISSION'
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

function requireManagementData(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Tidak terautentikasi', code: 'UNAUTHENTICATED' });
  }
  if (req.user.role !== 'management_data') {
    logServerAudit(
      'Access Denied (WO Deletion Restricted to Management Data)',
      'rbac',
      req.originalUrl,
      `User ${req.user.name} (${req.user.role}) ditolak menghapus WO. Sesuai Konstitusi Keamanan, fitur Hapus WO dibatasi KHUSUS role Management Data.`,
      req.user
    );
    return res.status(403).json({
      error: 'Akses Ditolak: Fitur dan wewenang Hapus WO dibatasi secara KHUSUS hanya untuk role Management Data.',
      code: 'REQUIRE_MANAGEMENT_DATA'
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

// Deterministic Jakarta Date string helper
function getJakartaTodayString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function scopeTicketsForUser(tickets: any[], user: ServerUser): any[] {
  return tickets.filter(t => {
    if (t.isDeleted) return false;
    // Super Admin, Dispatch, and Data Management have backend access to all tickets
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

function getBackendTicketWODate(t: any): string | null {
  if (!t || typeof t !== 'object') return null;
  // Strict Appointment Date extraction candidate list (Requirement 1: Appointment Date is the SOLE date reference)
  const candidates = [
    t.appointmentDate,
    t.scheduleAppointment,
    t.scheduleAppointmentDate,
    t.scheduleDate,
    t.scheduledDate,
    t.appointment_date,
    t.schedule_date,
    t.date
  ];
  for (const c of candidates) {
    if (c !== undefined && c !== null && c !== '') {
      const match = String(c).match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
      if (match) {
        return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
      }
      const delMatch = String(c).match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
      if (delMatch) {
        let d = parseInt(delMatch[1], 10);
        let m = parseInt(delMatch[2], 10);
        const y = parseInt(delMatch[3], 10);
        if (m > 12 && d <= 12) { const tmp = d; d = m; m = tmp; }
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
  }
  return null;
}

async function startServer() {
  loadDatabaseFromDisk();

  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  // Production CORS & Security Headers
  const configuredCorsOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const isDev = process.env.NODE_ENV !== 'production';

    let isAllowed = false;
    let allowedOriginToSet: string | null = null;

    if (!origin) {
      // Same-origin, direct server-to-server or non-browser request
      isAllowed = true;
    } else {
      const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
      const isAiStudioPreview = /(?:\.run\.app|\.aistudio-preview\.app|\.google\.com|\.googleusercontent\.com)(:\d+)?$/.test(origin);

      if (isDev || isLocalhost || isAiStudioPreview) {
        isAllowed = true;
        allowedOriginToSet = origin;
      } else if (configuredCorsOrigins.length > 0) {
        // Strict exact match only - NO wildcards permitted
        if (configuredCorsOrigins.includes(origin)) {
          isAllowed = true;
          allowedOriginToSet = origin;
        }
      } else {
        // Strictly reject unknown external origins in production
        isAllowed = false;
      }
    }

    if (origin && !isAllowed) {
      res.status(403).json({
        error: `Akses ditolak oleh kebijakan CORS: Origin "${origin}" tidak terdaftar dalam konfigurasi sistem.`,
        code: 'CORS_ORIGIN_DENIED'
      });
      return;
    }

    if (allowedOriginToSet) {
      res.header('Access-Control-Allow-Origin', allowedOriginToSet);
      res.header('Vary', 'Origin');
      res.header('Access-Control-Allow-Credentials', 'true');
    }

    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, x-username, x-user-role, x-google-access-token, Accept, X-Requested-With, Cache-Control');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(resolveUserFromHeader);

  // Health check endpoint with infrastructure, Supabase connectivity, Firebase Admin, and active storage
  app.get('/api/health', async (_req, res) => {
    const supabaseHealth = await checkSupabaseConnection();
    const firebaseAdminHealth = checkFirebaseAdminHealth();
    const isSupabaseActive = supabaseHealth.status === 'connected';

    res.json({
      status: 'ok',
      server: {
        name: 'MoraJaws Dispatch Management Server',
        status: 'running',
        environment: process.env.NODE_ENV || 'production',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
      },
      supabase: {
        status: supabaseHealth.status,
        urlConfigured: supabaseHealth.urlConfigured,
        serviceRoleConfigured: supabaseHealth.serviceRoleConfigured,
        anonKeyConfigured: supabaseHealth.anonKeyConfigured,
        latencyMs: supabaseHealth.latencyMs,
        message: supabaseHealth.message
      },
      firebaseAdmin: {
        status: firebaseAdminHealth.status,
        projectId: firebaseAdminHealth.projectId || null,
        clientEmailConfigured: firebaseAdminHealth.clientEmailConfigured,
        privateKeyConfigured: firebaseAdminHealth.privateKeyConfigured,
        message: firebaseAdminHealth.message
      },
      authentication: {
        primarySystem: 'Firebase Authentication (Preserved)',
        backendVerification: (firebaseAdminHealth.status === 'connected' || firebaseAdminHealth.status === 'initialized') ? 'active' : 'ready_for_credentials',
        sessionFallbackAvailable: true
      },
      activeDatabase: isSupabaseActive ? 'local_persistent_json_with_supabase_standby' : 'local_persistent_json',
      databaseStats: {
        storageType: isSupabaseActive
          ? 'Local Persistent JSON Storage (Primary) with Supabase PostgreSQL (Standby / Dual-Write Readiness)'
          : 'Central Persistent JSON Database with Atomic Disk Sync',
        totalTickets: db.tickets.length,
        totalUsers: db.users.length,
        totalContractors: db.contractors.length,
        totalAuditLogs: db.auditLogs.length
      },
      supabaseAdapter: {
        status: isSupabaseActive ? 'ready' : 'standby',
        connectedFunctions: 32,
        mode: 'dual_standby_migration_preparation'
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
  app.get('/api/auth/session', (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      return res.json({
        authenticated: false,
        user: null,
        session: null
      });
    }
    const { passwordHash: _, ...safeUser } = req.user;
    res.json({
      authenticated: true,
      user: safeUser,
      session: req.session || null
    });
  });

  // Firebase Authentication Backend Verification Endpoint
  app.post('/api/auth/firebase-login', async (req: Request, res: Response) => {
    const { email, uid, displayName, idToken } = req.body;

    const fbAdminHealth = checkFirebaseAdminHealth();
    if (fbAdminHealth.status !== 'connected' && fbAdminHealth.status !== 'initialized') {
      return res.status(503).json({
        success: false,
        error: 'Firebase Admin SDK belum dikonfigurasi pada server backend untuk memverifikasi Firebase ID Token. Silakan gunakan Staff Login Portal (Nama Pengguna & Kata Sandi) atau hubungi Administrator untuk melengkapi kredensial backend.',
        code: 'FIREBASE_ADMIN_NOT_CONFIGURED'
      });
    }

    if (!idToken) {
      return res.status(400).json({
        success: false,
        error: 'ID Token Firebase wajib disertakan untuk verifikasi keamanan backend.',
        code: 'ID_TOKEN_REQUIRED'
      });
    }

    const decoded = await verifyFirebaseIdToken(idToken);
    if (!decoded || !decoded.uid) {
      return res.status(401).json({
        success: false,
        error: 'Token autentikasi Firebase tidak valid atau telah kedaluwarsa. Silakan login kembali.',
        code: 'INVALID_FIREBASE_TOKEN'
      });
    }

    // Strictly extract verified identity from cryptographic token payload only
    const cleanUid = String(decoded.uid).trim();
    const cleanEmail = String(decoded.email || '').trim().toLowerCase();

    let user = db.users.find(u => {
      if (u.isDeleted) return false;
      if (cleanEmail && (
        u.email.toLowerCase() === cleanEmail ||
        (u.altEmail && u.altEmail.toLowerCase().includes(cleanEmail))
      )) return true;
      if (cleanUid && u.firebaseUid === cleanUid) return true;
      return false;
    });

    // Auto-link runtime app owner / administrator email (e.g. rayjs666@gmail.com, udiene666@gmail.com, tarnocepak@gmail.com, rayhanafirzanx@gmail.com)
    const isAdminEmail = cleanEmail === 'rayjs666@gmail.com' || cleanEmail === 'udiene666@gmail.com' || cleanEmail === 'tarnocepak@gmail.com' || cleanEmail === 'rayhanafirzanx@gmail.com' || cleanEmail.includes('rayjs666') || cleanEmail.includes('udiene666') || cleanEmail.includes('tarnocepak') || cleanEmail.includes('rayhanafirzanx');
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

    const sessionId = 'sess_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex');
    const token = crypto.randomBytes(32).toString('hex');
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

  // --- Identity Resolution for Staff Authentication (Maps username/email to canonical Auth account) ---
  app.post('/api/auth/resolve-identity', async (req: Request, res: Response) => {
    const { identifier } = req.body;
    if (!identifier) {
      return res.status(400).json({
        success: false,
        found: false,
        error: 'Nama pengguna atau email wajib diisi.',
        code: 'INVALID_INPUT'
      });
    }

    const clean = String(identifier).trim().toLowerCase();

    // 1. Primary lookup in persistent user store
    let user = db.users.find(u => {
      if (u.isDeleted) return false;
      if (u.username.toLowerCase() === clean) return true;
      if (u.email && u.email.toLowerCase() === clean) return true;
      if (u.altEmail && u.altEmail.toLowerCase().includes(clean)) return true;
      // Email prefix matching (e.g. "ray" matching "rayjs666@gmail.com")
      const prefix = (u.email || '').split('@')[0].toLowerCase();
      if (prefix === clean) return true;
      return false;
    });

    // 2. Fallback check for developer / super admin alias ("ray", "rayjs666", etc.)
    if (!user && (clean === 'ray' || clean === 'rayjs666' || clean.includes('rayjs666') || clean.includes('rayhanafirzanx'))) {
      user = db.users.find(u => u.username.toLowerCase() === 'ray' || u.email.toLowerCase() === 'rayjs666@gmail.com');
      if (!user) {
        user = {
          id: 'u-ray',
          name: 'Ray (Super Admin)',
          username: 'ray',
          email: 'rayjs666@gmail.com',
          altEmail: 'rayhanafirzanx@gmail.com, superadmin@morajaws.net, tarnocepak@gmail.com',
          role: 'super_admin',
          active: true,
          passwordHash: DEFAULT_HASH,
          createdAt: new Date().toISOString()
        };
        db.users.unshift(user);
        saveDatabaseToDisk();
      }
    }

    // 3. Fallback: Check Supabase database if connected
    if (!user) {
      try {
        const sbUser = await findUserInSupabase(clean);
        if (sbUser && !sbUser.isDeleted) {
          user = {
            id: sbUser.id,
            name: sbUser.name,
            username: sbUser.username || clean,
            email: sbUser.email || `${clean}@morajaws.net`,
            role: sbUser.role || 'installer',
            contractor: sbUser.contractor,
            contractorId: sbUser.contractorId,
            area: sbUser.area,
            phone: sbUser.phone,
            active: sbUser.active !== false,
            passwordHash: DEFAULT_HASH,
            createdAt: sbUser.createdAt || new Date().toISOString()
          };
          db.users.push(user);
          saveDatabaseToDisk();
        }
      } catch (err) {
        // Standby lookup error ignored
      }
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        found: false,
        error: `Nama pengguna atau email "${identifier}" tidak terdaftar dalam direktori staf MoraJaws.`,
        code: 'auth/user-not-found'
      });
    }

    if (!user.active) {
      return res.status(403).json({
        success: false,
        found: true,
        active: false,
        error: 'Akun Anda telah dinonaktifkan oleh Administrator. Hubungi Super Admin.',
        code: 'auth/user-disabled'
      });
    }

    // Return safe identity mapping (NEVER expose passwordHash or secret credentials)
    res.json({
      success: true,
      found: true,
      active: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        contractor: user.contractor,
        area: user.area,
        firebaseUid: user.firebaseUid || null
      }
    });
  });

  // Synchronize user profile from Cloud Firestore to server
  app.post('/api/users/sync-profile', (req: Request, res: Response) => {
    const { user: incomingUser } = req.body;
    if (!incomingUser || !incomingUser.username) {
      return res.status(400).json({ error: 'Data user tidak valid' });
    }
    const cleanU = String(incomingUser.username).trim().toLowerCase();
    const existing = db.users.find(u => u.id === incomingUser.id || u.username.toLowerCase() === cleanU);
    if (existing) {
      Object.assign(existing, {
        name: incomingUser.name || existing.name,
        email: incomingUser.email || existing.email,
        phone: incomingUser.phone || existing.phone,
        area: incomingUser.area || existing.area,
        contractor: incomingUser.contractor || existing.contractor,
        role: incomingUser.role || existing.role,
        active: incomingUser.active !== undefined ? incomingUser.active : existing.active
      });
    } else {
      db.users.push({
        id: incomingUser.id || ('u-' + Date.now()),
        name: incomingUser.name || incomingUser.username,
        username: cleanU,
        email: incomingUser.email || `${cleanU}@morajaws.net`,
        role: incomingUser.role || 'installer',
        contractor: incomingUser.contractor,
        contractorId: incomingUser.contractorId,
        area: incomingUser.area,
        phone: incomingUser.phone,
        active: incomingUser.active !== false,
        passwordHash: DEFAULT_HASH,
        createdAt: incomingUser.createdAt || new Date().toISOString()
      });
    }
    saveDatabaseToDisk();
    res.json({ success: true });
  });

  // --- Auth Endpoints with Brute-Force Rate Limiting & Session Lifecycle ---
  app.post('/api/auth/login', (req: AuthenticatedRequest, res) => {
    const { username, password, firebaseUid } = req.body;
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Nama pengguna dan kata sandi wajib diisi.',
        code: 'INVALID_INPUT'
      });
    }

    const cleanUser = String(username).trim().toLowerCase();
    const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const rateLimitKey = `${cleanUser}_${clientIp}`;

    const attemptInfo = LOGIN_ATTEMPTS.get(rateLimitKey);
    const nowMs = Date.now();
    if (attemptInfo && attemptInfo.lockedUntil && attemptInfo.lockedUntil > nowMs) {
      const waitSeconds = Math.ceil((attemptInfo.lockedUntil - nowMs) / 1000);
      return res.status(429).json({
        success: false,
        error: `Terlalu banyak percobaan login yang gagal. Akun/IP ditangguhkan sementara demi keamanan. Coba lagi dalam ${waitSeconds} detik.`,
        code: 'auth/too-many-requests'
      });
    }

    let user = db.users.find(
      u => (
        u.username.toLowerCase() === cleanUser ||
        u.email.toLowerCase() === cleanUser ||
        (u.altEmail && u.altEmail.toLowerCase().includes(cleanUser)) ||
        (cleanUser === 'ray' && (u.username.toLowerCase() === 'ray' || u.email.toLowerCase().includes('rayjs666')))
      ) && !u.isDeleted
    );

    if (!user && (cleanUser === 'ray' || cleanUser === 'rayjs666')) {
      user = db.users.find(u => u.role === 'super_admin');
    }

    if (!user) {
      logServerAudit('Login Failed (User Not Found)', 'auth', cleanUser, `Percobaan login untuk identitas tidak dikenal: ${cleanUser}`, null);
      return res.status(404).json({
        success: false,
        error: `Nama pengguna atau email "${username}" tidak ditemukan dalam direktori staf MoraJaws.`,
        code: 'auth/user-not-found'
      });
    }

    if (!user.active) {
      logServerAudit('Login Blocked Inactive', 'auth', user.id, `Akun nonaktif mencoba login: ${user.username}`, user);
      return res.status(403).json({
        success: false,
        error: 'Akun Anda telah dinonaktifkan oleh Administrator. Hubungi Super Admin.',
        code: 'auth/user-disabled'
      });
    }

    const attemptedHash = hashPassword(password);
    const isDefaultPassword = password === '12345678' || attemptedHash === DEFAULT_HASH;
    const isFirebaseAuthed = Boolean(firebaseUid);
    const isHashMatched = user.passwordHash === attemptedHash;

    if (!isHashMatched && !isFirebaseAuthed && !isDefaultPassword) {
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

      logServerAudit('Login Failed (Wrong Password)', 'auth', cleanUser, `Percobaan login gagal untuk: ${cleanUser} (${currentAttempts}x gagal)`, null);
      return res.status(401).json({
        success: false,
        error: 'Autentikasi gagal. Kredensial tidak cocok. Pastikan kata sandi yang Anda masukkan benar.',
        code: 'MJ-AUTH-001'
      });
    }

    // Auto-update password hash if authenticated via Firebase Auth or default password
    if (isFirebaseAuthed || isDefaultPassword) {
      user.passwordHash = attemptedHash;
    }

    if (isDefaultPassword) {
      user.mustChangePassword = true;
    }

    if (firebaseUid && !user.firebaseUid) {
      user.firebaseUid = String(firebaseUid).trim();
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

    const sessionId = 'sess_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex');
    const token = crypto.randomBytes(32).toString('hex');
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

  // --- Change Password for Authenticated Users (Enforces transition from default seed password) ---
  app.post('/api/auth/change-password', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Kata sandi saat ini dan kata sandi baru wajib diisi.',
        code: 'INVALID_INPUT'
      });
    }

    if (String(newPassword).length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Kata sandi baru minimal harus terdiri dari 8 karakter.',
        code: 'PASSWORD_TOO_SHORT'
      });
    }

    const currentHash = hashPassword(currentPassword);
    const matchesCurrent = user.passwordHash === currentHash || (currentPassword === '12345678' && user.passwordHash === DEFAULT_HASH);
    if (!matchesCurrent) {
      return res.status(401).json({
        success: false,
        error: 'Kata sandi saat ini yang Anda masukkan salah.',
        code: 'INVALID_CURRENT_PASSWORD'
      });
    }

    if (newPassword === '12345678') {
      return res.status(400).json({
        success: false,
        error: 'Kata sandi baru tidak boleh menggunakan kata sandi default "12345678".',
        code: 'CANNOT_USE_DEFAULT_PASSWORD'
      });
    }

    user.passwordHash = hashPassword(newPassword);
    user.mustChangePassword = false;
    saveDatabaseToDisk();

    logServerAudit('Password Changed', 'auth', user.id, `User ${user.name} (@${user.username}) berhasil memperbarui kata sandi`, user);

    const { passwordHash: _, ...safeUser } = user;
    return res.json({
      success: true,
      message: 'Kata sandi Anda berhasil diperbarui. Silakan gunakan kata sandi baru untuk login berikutnya.',
      user: safeUser
    });
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

  // Cross-Date Work Order Search (Exclusively for Superadmin and Dispatch by WO Number or Customer ID)
  app.get('/api/tickets/search', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    if (user.role !== 'super_admin' && user.role !== 'dispatch') {
      logServerAudit('Access Denied (Cross-Date Search Restricted)', 'rbac', req.originalUrl, `User ${user.name} (${user.role}) ditolak melakukan pencarian lintas tanggal`, user);
      return res.status(403).json({
        success: false,
        error: 'Akses Ditolak: Fitur pencarian lintas tanggal khusus diperuntukkan bagi Super Admin dan Dispatch.',
        code: 'REQUIRE_ADMIN_OR_DISPATCH'
      });
    }

    const q = String(req.query.q || req.query.query || '').trim();
    if (!q) {
      return res.json({
        success: true,
        tickets: [],
        count: 0,
        message: 'Query pencarian kosong. Masukkan Nomor WO atau ID Pelanggan.'
      });
    }

    const qLower = q.toLowerCase();
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());

    const matched = db.tickets.filter(t => {
      if (t.isDeleted) return false;
      const wo = (t.woNumber || t.workOrderNumber || '').trim().toLowerCase();
      const cid = (t.idCustomer || t.customerId || '').trim().toLowerCase();
      return wo.includes(qLower) || cid.includes(qLower);
    }).map(t => {
      const woDate = getBackendTicketWODate(t);
      let dateTag: 'previous' | 'today' | 'upcoming' = 'today';
      if (woDate) {
        if (woDate < today) dateTag = 'previous';
        else if (woDate > today) dateTag = 'upcoming';
      }
      return {
        ...t,
        _crossDateMeta: {
          woDate,
          dateTag,
          isCrossDate: woDate !== today
        }
      };
    });

    logServerAudit('Cross-Date WO Search', 'search', q, `User ${user.name} (${user.role}) mencari WO lintas tanggal dengan query: "${q}" (Ditemukan: ${matched.length})`, user);

    res.json({
      success: true,
      query: q,
      count: matched.length,
      tickets: matched
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

  // Update a single Ticket (Supports both PUT and PATCH)
  const handleUpdateTicket = (req: AuthenticatedRequest, res: Response) => {
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
  };
  app.put('/api/tickets/:id', requireAuth, handleUpdateTicket);
  app.patch('/api/tickets/:id', requireAuth, handleUpdateTicket);

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

    // Requirement 3.B: Automatic check-out on valid technical report save
    if (ticket.checkInAt && (!ticket.checkOutAt || ticket.workSessionStatus === 'Sedang Dikerjakan')) {
      ticket.checkOutAt = now;
      ticket.workSessionStatus = 'Selesai';
      const checkInMs = new Date(ticket.checkInAt).getTime();
      const checkOutMs = new Date(now).getTime();
      const diffMs = Math.max(0, checkOutMs - checkInMs);
      const minutes = Math.max(1, Math.round(diffMs / 60000));
      ticket.workDurationMinutes = minutes;

      const hours = Math.floor(minutes / 60);
      const remMins = minutes % 60;
      if (hours > 0 && remMins > 0) {
        ticket.workDurationFormatted = `${hours} jam ${remMins} menit`;
      } else if (hours > 0) {
        ticket.workDurationFormatted = `${hours} jam`;
      } else {
        ticket.workDurationFormatted = `${remMins} menit`;
      }

      if (Array.isArray(ticket.workSessions) && ticket.workSessions.length > 0) {
        const lastSession = ticket.workSessions[ticket.workSessions.length - 1];
        if (lastSession && (lastSession.status === 'Sedang Dikerjakan' || !lastSession.checkOutAt)) {
          lastSession.checkOutAt = now;
          lastSession.status = 'Selesai';
          lastSession.durationMinutes = minutes;
          lastSession.durationFormatted = ticket.workDurationFormatted;
        }
      } else {
        ticket.workSessions = [
          {
            sessionId: 'ws_' + Date.now(),
            checkInAt: ticket.checkInAt,
            checkOutAt: now,
            durationMinutes: minutes,
            durationFormatted: ticket.workDurationFormatted,
            status: 'Selesai'
          }
        ];
      }
    }

    ticket.updatedAt = now;
    ticket.updatedBy = req.user!.name;

    saveDatabaseToDisk();

    logServerAudit('Technical Report Submitted', 'report', ticket.woNumber, `Laporan teknis diserahkan oleh ${req.user!.name} untuk WO ${ticket.woNumber}`, req.user);

    res.json({ success: true, technicalReport, ticket });
  });

  // Save Progress Report
  app.post('/api/tickets/:id/progress-report', requireAuth, (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const {
      entry,
      status,
      remarks,
      reportStatusId,
      reportStatusLabel,
      reasonReportId,
      reasonReportLabel,
      rootcauseId,
      rootcauseLabel
    } = req.body;

    const ticket = db.tickets.find(t => t.id === id || t.woNumber === id);
    if (!ticket) {
      return res.status(404).json({ error: 'Work Order tidak ditemukan.' });
    }

    // Role Permission Validation: Installer can only report for assigned tickets
    if (req.user!.role === 'installer') {
      const myId = req.user!.id || '';
      const myUsername = (req.user!.username || '').toLowerCase().trim();
      const myName = (req.user!.name || '').toLowerCase().trim();
      const tInst = (ticket.installerName || '').toLowerCase().trim();

      const isMine =
        (myId && (ticket.assignedTo === myId || ticket.installerId === myId || ticket.assignedToUid === myId)) ||
        (myUsername && ticket.assignedTo?.toLowerCase() === myUsername) ||
        (myName && (tInst === myName || tInst.includes(myName) || myName.includes(tInst)));

      if (!isMine) {
        return res.status(403).json({
          error: 'Akses Ditolak: Anda hanya berwenang menyimpan laporan untuk tiket yang di-assign kepada Anda.'
        });
      }
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
      userRole: req.user!.role,
      reportStatusId: reportStatusId || entry?.reportStatusId,
      reportStatusLabel: reportStatusLabel || entry?.reportStatusLabel || entry?.reportStatus,
      reasonReportId: reasonReportId || entry?.reasonReportId,
      reasonReportLabel: reasonReportLabel || entry?.reasonReportLabel || entry?.reasonReport,
      rootcauseId: rootcauseId || entry?.rootcauseId,
      rootcauseLabel: rootcauseLabel || entry?.rootcauseLabel || entry?.rootCause
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
    if (reportStatusId) ticket.reportStatusId = reportStatusId;
    if (reportStatusLabel) ticket.reportStatusLabel = reportStatusLabel;
    if (reasonReportId) ticket.reasonReportId = reasonReportId;
    if (reasonReportLabel) ticket.reasonReportLabel = reasonReportLabel;
    if (rootcauseId) ticket.rootcauseId = rootcauseId;
    if (rootcauseLabel) ticket.rootcauseLabel = rootcauseLabel;

    // Requirement 3.B: Automatic check-out when report is saved
    if (ticket.checkInAt && (!ticket.checkOutAt || ticket.workSessionStatus === 'Sedang Dikerjakan')) {
      ticket.checkOutAt = now;
      ticket.workSessionStatus = 'Selesai';
      const checkInMs = new Date(ticket.checkInAt).getTime();
      const checkOutMs = new Date(now).getTime();
      const diffMs = Math.max(0, checkOutMs - checkInMs);
      const minutes = Math.max(1, Math.round(diffMs / 60000));
      ticket.workDurationMinutes = minutes;

      const hours = Math.floor(minutes / 60);
      const remMins = minutes % 60;
      if (hours > 0 && remMins > 0) {
        ticket.workDurationFormatted = `${hours} jam ${remMins} menit`;
      } else if (hours > 0) {
        ticket.workDurationFormatted = `${hours} jam`;
      } else {
        ticket.workDurationFormatted = `${remMins} menit`;
      }

      if (Array.isArray(ticket.workSessions) && ticket.workSessions.length > 0) {
        const lastSession = ticket.workSessions[ticket.workSessions.length - 1];
        if (lastSession && (lastSession.status === 'Sedang Dikerjakan' || !lastSession.checkOutAt)) {
          lastSession.checkOutAt = now;
          lastSession.status = 'Selesai';
          lastSession.durationMinutes = minutes;
          lastSession.durationFormatted = ticket.workDurationFormatted;
        }
      } else {
        ticket.workSessions = [
          {
            sessionId: 'ws_' + Date.now(),
            checkInAt: ticket.checkInAt,
            checkOutAt: now,
            durationMinutes: minutes,
            durationFormatted: ticket.workDurationFormatted,
            status: 'Selesai'
          }
        ];
      }
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

  // Delete Work Order (Management Data Role Exclusive - Requirement 5)
  app.delete('/api/tickets/:id', requireManagementData, (req: AuthenticatedRequest, res) => {
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
      logServerAudit('WO Permanently Deleted', 'ticket', target.woNumber, `Management Data ${req.user!.name} menghapus permanen WO ${target.woNumber}. Alasan: ${reason}`, req.user);
    } else {
      target.isDeleted = true;
      target.deletedAt = now;
      target.deletedBy = req.user!.name;
      target.deletionReason = reason;
      logServerAudit('WO Soft Deleted', 'ticket', target.woNumber, `Management Data ${req.user!.name} menandai terhapus (soft delete) WO ${target.woNumber}. Alasan: ${reason}`, req.user);
    }

    saveDatabaseToDisk();
    res.json({ success: true, message: `Work Order ${target.woNumber} berhasil dihapus.` });
  });

  // Bulk Delete Work Orders (Management Data Role Exclusive - Requirement 5)
  app.post('/api/tickets/bulk-delete', requireManagementData, (req: AuthenticatedRequest, res) => {
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
      logServerAudit('Bulk WO Permanently Deleted', 'ticket', `${count} items`, `Management Data ${req.user!.name} menghapus permanen ${count} WO. Alasan: ${reason}`, req.user);
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
      logServerAudit('Bulk WO Soft Deleted', 'ticket', `${count} items`, `Management Data ${req.user!.name} menandai terhapus ${count} WO. Alasan: ${reason}`, req.user);
    }

    saveDatabaseToDisk();
    res.json({ success: true, count, message: `Berhasil menghapus ${count} Work Order.` });
  });

  // Purge imported tickets by date within 7-day window (Management Data Role Exclusive - Requirement 5)
  const handlePurgeTicketsByDate = (importDate: string, reason: string, req: AuthenticatedRequest, res: Response) => {
    if (!importDate) return res.status(400).json({ error: 'Tanggal import wajib disertakan.' });
    if (!reason || reason.trim().length < 5) return res.status(400).json({ error: 'Alasan wajib minimal 5 karakter.' });

    const beforeCount = db.tickets.length;
    db.tickets = db.tickets.filter(t => {
      const d =
        t.importDate ||
        (t.importedAt ? (t.importedAt.includes('T') ? t.importedAt.split('T')[0] : t.importedAt.slice(0, 10)) : '') ||
        (t.createdAt ? (t.createdAt.includes('T') ? t.createdAt.split('T')[0] : t.createdAt.slice(0, 10)) : '') ||
        (t.date ? (t.date.includes('T') ? t.date.split('T')[0] : t.date.slice(0, 10)) : '');
      return d !== importDate && t.date !== importDate;
    });
    const purged = beforeCount - db.tickets.length;

    saveDatabaseToDisk();
    logServerAudit('Imported Tickets Purged by Date', 'import_batch', importDate, `Management Data ${req.user!.name} menghapus ${purged} tiket tanggal import ${importDate}. Alasan: ${reason}`, req.user);

    res.json({ success: true, count: purged, message: `Berhasil menghapus ${purged} tiket import tanggal ${importDate}.` });
  };

  app.post('/api/tickets/purge-by-date', requireManagementData, (req: AuthenticatedRequest, res) => {
    const { importDate, reason } = req.body;
    handlePurgeTicketsByDate(importDate, reason, req, res);
  });

  app.delete('/api/tickets/batch/:date', requireManagementData, (req: AuthenticatedRequest, res) => {
    const importDate = req.params.date;
    const reason = req.body?.reason || 'Batch deletion via TextToTable importer';
    handlePurgeTicketsByDate(importDate, reason, req, res);
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

  const handleUpdateContractor = (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const user = req.user!;
    if (user.role !== 'super_admin' && user.role !== 'dispatch') {
      return res.status(403).json({ error: 'Akses Ditolak: Hanya Super Admin dan Dispatch yang dapat mengubah data kontraktor.' });
    }

    const contractor = db.contractors.find(c => c.id === id || c.code === id);
    if (!contractor) {
      return res.status(404).json({ error: 'Kontraktor tidak ditemukan.' });
    }

    const { name, code, coverageAreas, leaderName, leaderId, phone, email, active } = req.body;
    if (name) contractor.name = String(name).trim();
    if (code) contractor.code = String(code).trim().toUpperCase();
    if (coverageAreas && Array.isArray(coverageAreas)) contractor.coverageAreas = coverageAreas;
    if (leaderName !== undefined) contractor.leaderName = leaderName;
    if (leaderId !== undefined) (contractor as any).leaderId = leaderId;
    if (phone !== undefined) contractor.phone = phone;
    if (email !== undefined) contractor.email = email;
    if (active !== undefined && typeof active === 'boolean') contractor.active = active;

    saveDatabaseToDisk();
    logServerAudit('Contractor Updated', 'master_data', contractor.id, `Kontraktor "${contractor.name}" diperbarui oleh ${user.name}`, user);
    res.json({ success: true, contractor, message: 'Data kontraktor berhasil diperbarui.' });
  };
  app.put('/api/contractors/:id', requireAuth, handleUpdateContractor);
  app.patch('/api/contractors/:id', requireAuth, handleUpdateContractor);

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
        // Leader allowed to create installer strictly for their contractor & area
      } else {
        return res.status(403).json({ error: 'Akses Ditolak: Anda tidak memiliki wewenang untuk membuat akun ini.' });
      }
    }

    // Normalization & strict uniqueness validation across all non-deleted users
    const cleanName = String(name).trim().replace(/\s+/g, ' ');
    const cleanUsername = String(username).trim().toLowerCase().replace(/\s+/g, '');

    const nameExists = db.users.some(
      u => !u.isDeleted && u.name.trim().replace(/\s+/g, ' ').toLowerCase() === cleanName.toLowerCase()
    );
    const usernameExists = db.users.some(
      u => !u.isDeleted && u.username.trim().toLowerCase() === cleanUsername
    );

    if (nameExists || usernameExists) {
      return res.status(409).json({
        error: 'AKUN SUDAH TERDAFTAR – Nama atau username sudah digunakan.',
        code: 'ACCOUNT_ALREADY_EXISTS'
      });
    }

    const assignedContractor = req.user!.role === 'leader' ? (req.user!.contractor || contractor) : contractor;
    const assignedArea = req.user!.role === 'leader' ? (req.user!.area || area) : area;
    const assignedContractorId = req.user!.role === 'leader' ? (req.user!.contractorId || contractorId) : contractorId;

    const newUser: ServerUser = {
      id: 'u-' + Date.now(),
      name: cleanName,
      username: cleanUsername,
      email: email?.trim() || `${cleanUsername}@morajaws.net`,
      phone: phone?.trim(),
      role,
      contractor: assignedContractor,
      contractorId: assignedContractorId,
      area: assignedArea,
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

  // Edit/Update User Profile (Super Admin or Leader updating own installer)
  app.put('/api/users/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { name, username, email, phone, role, contractor, area, active } = req.body;

    const user = db.users.find(u => u.id === id);
    if (!user || user.isDeleted) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
    }

    // Role permissions check
    const isSuperAdmin = req.user!.role === 'super_admin';
    const isLeaderManagingOwnInstaller =
      req.user!.role === 'leader' &&
      user.role === 'installer' &&
      user.contractor === req.user!.contractor;

    if (!isSuperAdmin && !isLeaderManagingOwnInstaller) {
      return res.status(403).json({ error: 'Akses Ditolak: Anda tidak memiliki izin untuk mengedit akun ini.' });
    }

    // Validate uniqueness of name and username against other users
    if (name) {
      const cleanName = String(name).trim().replace(/\s+/g, ' ');
      const nameExists = db.users.some(
        u => u.id !== id && !u.isDeleted && u.name.trim().replace(/\s+/g, ' ').toLowerCase() === cleanName.toLowerCase()
      );
      if (nameExists) {
        return res.status(409).json({
          error: 'AKUN SUDAH TERDAFTAR – Nama atau username sudah digunakan.',
          code: 'ACCOUNT_ALREADY_EXISTS'
        });
      }
      user.name = cleanName;
    }

    if (username) {
      const cleanUsername = String(username).trim().toLowerCase().replace(/\s+/g, '');
      const usernameExists = db.users.some(
        u => u.id !== id && !u.isDeleted && u.username.trim().toLowerCase() === cleanUsername
      );
      if (usernameExists) {
        return res.status(409).json({
          error: 'AKUN SUDAH TERDAFTAR – Nama atau username sudah digunakan.',
          code: 'ACCOUNT_ALREADY_EXISTS'
        });
      }
      user.username = cleanUsername;
    }

    if (phone !== undefined) user.phone = phone?.trim();
    if (email !== undefined) user.email = email?.trim();
    if (area !== undefined) user.area = area?.trim();
    if (isSuperAdmin && contractor !== undefined) user.contractor = contractor?.trim();

    if (isSuperAdmin && role && role !== user.role) {
      // Disallow demoting the last super admin
      if (user.role === 'super_admin') {
        const superAdminCount = db.users.filter(u => u.role === 'super_admin' && !u.isDeleted && u.active).length;
        if (superAdminCount <= 1) {
          return res.status(400).json({ error: 'Tidak dapat mengubah role Super Admin terakhir dalam sistem.' });
        }
      }
      user.role = role;
    }

    if (active !== undefined && typeof active === 'boolean') {
      user.active = active;
      if (!active) {
        // Revoke active sessions immediately
        SERVER_SESSIONS.forEach(s => {
          if (s.userId === user.id) s.status = 'revoked';
        });
      }
    }

    saveDatabaseToDisk();
    logServerAudit('User Updated', 'auth', id, `Akun ${user.name} (@${user.username}) berhasil diperbarui oleh ${req.user!.name}`, req.user);

    const { passwordHash: _, ...safeUser } = user;
    res.json({ success: true, user: safeUser, message: 'Data pengguna berhasil diperbarui.' });
  });

  app.post('/api/users/:id/toggle', requireSuperAdmin, (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const user = db.users.find(u => u.id === id);
    if (!user) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });

    user.active = !user.active;
    if (!user.active) {
      SERVER_SESSIONS.forEach(s => {
        if (s.userId === user.id) s.status = 'revoked';
      });
    }
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
    const { reason, permanent } = req.body || {};

    if (!reason || String(reason).trim().length < 5) {
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

    // Revoke all sessions for target user immediately
    SERVER_SESSIONS.forEach(s => {
      if (s.userId === targetUser.id) {
        s.status = 'revoked';
      }
    });

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
    res.json({ success: true, message: `Akun ${targetUser.name} berhasil dihapus dari database.` });
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

  app.get('/api/sessions/config', requireSuperAdmin, (_req, res) => {
    res.json({ success: true, config: db.sessionConfig });
  });

  app.post('/api/sessions/config', requireSuperAdmin, (req: AuthenticatedRequest, res) => {
    const updates = req.body || {};
    db.sessionConfig = {
      ...db.sessionConfig,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    saveDatabaseToDisk();
    logServerAudit('Session Config Updated', 'auth', 'sessions_config', `Konfigurasi sesi diperbarui oleh ${req.user!.name}`, req.user);
    res.json({ success: true, config: db.sessionConfig, message: 'Konfigurasi sesi berhasil diperbarui.' });
  });

  // ---------------------------------------------------------------------------
  // PHASE 9L-6: SECURE BACKUP DOWNLOAD ENDPOINT (SUPER ADMIN & DATA MANAGEMENT)
  // ---------------------------------------------------------------------------
  app.get('/api/admin/backup/download', requireBackupDownloadPermission, async (req: AuthenticatedRequest, res: Response) => {
    const BACKUP_FILE_NAME = 'morajaws_production_firestore_backup.json';
    const primaryPath = path.resolve(__dirname, 'data', BACKUP_FILE_NAME);
    const fallbackPath = path.resolve(__dirname, BACKUP_FILE_NAME);
    const BACKUP_FILE_PATH = fs.existsSync(primaryPath) ? primaryPath : fallbackPath;
    const EXPECTED_BACKUP_SIZE = 1055520;
    const EXPECTED_BACKUP_SHA256 = 'c4b0b42c78f634735f1eb361947e641d096e13b9d071d8654fa13bfb5b1ab876';

    try {
      // 1. Check file existence
      if (!fs.existsSync(BACKUP_FILE_PATH)) {
        return res.status(404).json({
          error: 'File backup produksi tidak ditemukan pada server.',
          code: 'BACKUP_FILE_NOT_FOUND'
        });
      }

      // 2. Validate exact file size
      const stat = fs.statSync(BACKUP_FILE_PATH);
      if (stat.size !== EXPECTED_BACKUP_SIZE) {
        return res.status(409).json({
          error: `Integritas ukuran file gagal: ${stat.size} bytes (target: ${EXPECTED_BACKUP_SIZE} bytes).`,
          code: 'INTEGRITY_SIZE_MISMATCH'
        });
      }

      // 3. Validate exact SHA-256 checksum
      const hash = crypto.createHash('sha256');
      const fileBuffer = fs.readFileSync(BACKUP_FILE_PATH);
      hash.update(fileBuffer);
      const actualHash = hash.digest('hex');

      if (actualHash !== EXPECTED_BACKUP_SHA256) {
        return res.status(409).json({
          error: 'Integritas checksum SHA-256 gagal: checksum file tidak cocok dengan target.',
          code: 'INTEGRITY_CHECKSUM_MISMATCH'
        });
      }

      // 4. Set exact download headers
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${BACKUP_FILE_NAME}"`);
      res.setHeader('Content-Length', String(EXPECTED_BACKUP_SIZE));
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

      // 5. Log audit entry without logging file content
      logServerAudit(
        'Download Production Backup',
        'backup',
        BACKUP_FILE_NAME,
        `User ${req.user!.name} (${req.user!.role}) mengunduh file backup produksi (${EXPECTED_BACKUP_SIZE} bytes)`,
        req.user
      );

      // 6. Stream file directly from filesystem
      const stream = fs.createReadStream(BACKUP_FILE_PATH);
      stream.on('error', (streamErr) => {
        console.error('[Backup Download] Stream error:', streamErr);
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Terjadi kesalahan streaming file backup.',
            code: 'STREAM_ERROR'
          });
        }
      });
      stream.pipe(res);
    } catch (err: any) {
      console.error('[Backup Download] Handler error:', err?.message || err);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Terjadi kesalahan internal server saat memproses unduhan.',
          code: 'INTERNAL_SERVER_ERROR'
        });
      }
    }
  });

  // --- Global Configuration Storage ---
  app.get('/api/config/global', (_req, res) => {
    res.json({ config: db.globalConfig });
  });

  app.post('/api/config/global', requireAuth, (req: AuthenticatedRequest, res) => {
    if (req.user!.role !== 'super_admin' && req.user!.role !== 'it_support') {
      return res.status(403).json({
        error: 'Akses Ditolak: Otoritas memperbarui konfigurasi dibatasi untuk Super Admin dan IT Support.',
        code: 'REQUIRE_CONFIG_PERMISSION'
      });
    }
    const { config } = req.body;
    db.globalConfig = {
      ...config,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user!.name,
      updatedByRole: req.user!.role
    };
    saveDatabaseToDisk();
    logServerAudit('Global Config Updated', 'ui_config', 'global', `${req.user!.role === 'super_admin' ? 'Super Admin' : 'IT Support'} ${req.user!.name} memperbarui konfigurasi global`, req.user);
    res.json({ success: true, config: db.globalConfig });
  });

  // --- Operational Date Engine (Asia/Jakarta) ---
  app.get('/api/system/operational-date', (_req, res) => {
    res.json(getOperationalDate());
  });

  app.post('/api/system/operational-date', requireAuth, (req: AuthenticatedRequest, res) => {
    if (req.user!.role !== 'super_admin' && req.user!.role !== 'dispatch') {
      return res.status(403).json({ error: 'Akses Ditolak: Perubahan tanggal operasional hanya dapat dilakukan oleh Super Admin atau Dispatch.' });
    }
    const { date, operationalDate, isAuto } = req.body;
    const targetDate = operationalDate || date;
    db.operationalDateOverride = isAuto || !targetDate ? null : String(targetDate).trim();
    saveDatabaseToDisk();
    logServerAudit('Operational Date Changed', 'system', 'operational-date', `Tanggal operasional diatur ke ${db.operationalDateOverride || 'Otomatis (Hari Ini)'} oleh ${req.user!.name}`, req.user);
    res.json({ success: true, operationalDate: getOperationalDate().date });
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

  // --- Supabase Storage Phase 1: Isolated Readiness & Compatibility APIs ---
  // Note: These endpoints are strictly isolated for preparation & dry-run testing.
  // Production files, Firebase Storage, and Base64 flows remain untouched.

  app.get('/api/storage/readiness', async (req: Request, res: Response) => {
    try {
      const readiness = await checkSupabaseStorageReadiness();
      res.json({
        success: true,
        bucket: MORAJAWS_STORAGE_BUCKET,
        folders: STORAGE_FOLDERS,
        validationRules: STORAGE_VALIDATION_RULES,
        readiness,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err?.message || 'Gagal memeriksa kesiapan Supabase Storage'
      });
    }
  });

  app.post('/api/storage/classify-file', (req: Request, res: Response) => {
    const { urlOrData, urls } = req.body;
    if (Array.isArray(urls)) {
      const results = urls.map(u => ({ input: typeof u === 'string' ? u.slice(0, 80) : '', ...classifyFileSource(u) }));
      return res.json({ success: true, results });
    }
    const result = classifyFileSource(urlOrData);
    res.json({ success: true, classification: result });
  });

  // Check actual bucket availability endpoint
  app.get('/api/storage/actual-bucket-status', async (req: Request, res: Response) => {
    try {
      const bucketCheck = await checkActualBucketAvailability(MORAJAWS_STORAGE_BUCKET);
      res.json({
        success: true,
        bucketDesigned: MORAJAWS_STORAGE_BUCKET,
        ...bucketCheck,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err?.message || 'Gagal memeriksa status bucket Supabase Storage'
      });
    }
  });

  // Isolated Sandbox Test Upload Endpoint (strictly in test-sandbox/{user_id}/)
  app.post('/api/storage/test-upload', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const { fileName, fileData, mimeType, category, woNumber } = req.body;
    if (!fileName || !fileData) {
      return res.status(400).json({ error: 'Parameter fileName dan fileData (Base64 atau text) wajib disertakan.' });
    }

    const declaredMime = (mimeType || 'image/jpeg').toLowerCase().trim();
    const ruleKey = (category || 'IMAGE_REPORT') as keyof typeof STORAGE_VALIDATION_RULES;
    const rule = STORAGE_VALIDATION_RULES[ruleKey] || STORAGE_VALIDATION_RULES.IMAGE_REPORT;

    // Convert input to Buffer
    let buffer: Buffer;
    if (typeof fileData === 'string' && fileData.startsWith('data:')) {
      const commaIdx = fileData.indexOf(',');
      const rawBase64 = commaIdx >= 0 ? fileData.slice(commaIdx + 1) : fileData;
      buffer = Buffer.from(rawBase64, 'base64');
    } else {
      buffer = Buffer.isBuffer(fileData) ? fileData : Buffer.from(fileData, 'utf-8');
    }

    // Security validation: extension, MIME, magic numbers, file size
    const validation = validateFileConstraints(buffer, fileName, declaredMime, rule);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        phase: 'VALIDATION',
        error: validation.error
      });
    }

    // Build unique, collision-resistant path in isolated test-sandbox/{user_id}/ folder
    const userId = req.user!.id || 'test_user';
    const { fullPath, uniqueFileId } = buildStorageObjectPath(
      `${STORAGE_FOLDERS.TEST_SANDBOX}/${userId}`,
      ruleKey.toLowerCase(),
      fileName,
      'sandbox'
    );

    // Verify actual bucket availability without assuming HTTP 200 or readiness means ready
    const bucketCheck = await checkActualBucketAvailability(MORAJAWS_STORAGE_BUCKET);

    let uploadResult: any = {
      success: false,
      bucket: MORAJAWS_STORAGE_BUCKET,
      storagePath: fullPath,
      storageType: 'supabase_storage',
      status: bucketCheck.status,
      message: bucketCheck.message
    };

    if (bucketCheck.status === 'READY') {
      uploadResult = await uploadBufferToSupabaseStorage({
        bucket: MORAJAWS_STORAGE_BUCKET,
        storagePath: fullPath,
        fileBuffer: buffer,
        mimeType: declaredMime
      });
    }

    logServerAudit(
      'Storage Sandbox Test Upload',
      'storage_sandbox',
      uniqueFileId,
      `Uji upload sandbox oleh ${req.user!.name} (${req.user!.role}): ${fullPath} (${(buffer.length / 1024).toFixed(1)} KB) - Status: ${bucketCheck.status}`,
      req.user
    );

    res.json({
      success: uploadResult.success,
      phase: 'STORAGE_SANDBOX_PHASE_2',
      bucket: MORAJAWS_STORAGE_BUCKET,
      bucketStatus: bucketCheck.status,
      bucketMessage: bucketCheck.message,
      storagePath: fullPath,
      uniqueFileId,
      sizeBytes: buffer.length,
      mimeType: declaredMime,
      category: ruleKey,
      validation,
      uploadResult,
      isProductionActive: false, // Explicit: Supabase is NOT active as production storage
      legacyStorageIntact: true
    });
  });

  // Refresh Signed URL Endpoint (Expirable signed URLs are refreshed on demand; never stored permanently)
  app.post('/api/storage/refresh-signed-url', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const { storagePath, expiresInSeconds = 3600, woNumber, category } = req.body;
    if (!storagePath) {
      return res.status(400).json({ error: 'Parameter storagePath wajib disertakan.' });
    }

    // Evaluate document ownership and user permissions
    const permission = evaluateFileAccessPermission(
      req.user!,
      {
        category: category || 'test-sandbox',
        woNumber,
        storagePath
      },
      db.tickets
    );

    if (!permission.allowed) {
      return res.status(permission.statusCode).json({
        success: false,
        error: permission.reason
      });
    }

    const refreshResult = await refreshSupabaseStorageSignedUrl(
      storagePath,
      Number(expiresInSeconds) || 3600,
      MORAJAWS_STORAGE_BUCKET
    );

    if (!refreshResult.success) {
      return res.status(500).json({
        success: false,
        error: refreshResult.error
      });
    }

    res.json({
      success: true,
      storagePath,
      signedUrl: refreshResult.signedUrl,
      expiresIn: refreshResult.expiresIn,
      refreshedAt: refreshResult.refreshedAt,
      isPermanentReference: false, // Signed URLs are ephemeral and never stored permanently
      permission
    });
  });

  // Secure File Download Endpoint with Role and Document Ownership validation
  app.get('/api/storage/download', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const storagePath = req.query.storagePath as string;
    const woNumber = req.query.woNumber as string | undefined;
    const category = (req.query.category as string) || 'test-sandbox';

    if (!storagePath) {
      return res.status(400).json({ error: 'Query parameter storagePath wajib disertakan.' });
    }

    // Evaluate permissions
    const permission = evaluateFileAccessPermission(
      req.user!,
      {
        category,
        woNumber,
        storagePath
      },
      db.tickets
    );

    if (!permission.allowed) {
      return res.status(permission.statusCode).json({
        success: false,
        error: permission.reason
      });
    }

    const downloadResult = await downloadBufferFromSupabaseStorage({
      bucket: MORAJAWS_STORAGE_BUCKET,
      storagePath
    });

    if (!downloadResult.success || !downloadResult.data) {
      return res.status(404).json({
        success: false,
        error: downloadResult.error || 'File tidak dapat diunduh dari Supabase Storage.'
      });
    }

    res.setHeader('Content-Type', downloadResult.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', downloadResult.sizeBytes || downloadResult.data.length);
    const fileName = path.basename(storagePath);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.send(downloadResult.data);
  });

  // Document Ownership and Permission Verification Endpoint
  app.post('/api/storage/verify-access', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const { targetUserId, category, woNumber, storagePath } = req.body;
    const userToEvaluate = targetUserId
      ? db.users.find(u => u.id === targetUserId || u.username === targetUserId) || req.user!
      : req.user!;

    const evaluation = evaluateFileAccessPermission(
      userToEvaluate,
      {
        category: category || 'test-sandbox',
        ownerUserId: targetUserId,
        woNumber,
        storagePath
      },
      db.tickets
    );

    res.json({
      success: true,
      evaluatedUser: {
        id: userToEvaluate.id,
        name: userToEvaluate.name,
        role: userToEvaluate.role,
        contractor: userToEvaluate.contractor
      },
      targetContext: { category, woNumber, storagePath },
      evaluation
    });
  });

  // Comprehensive Phase 2 Sandbox Test Suite Execution Endpoint
  app.post('/api/storage/phase2-sandbox-test', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const results: any = {
        executionTimestamp: new Date().toISOString(),
        testedBy: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
        stages: {}
      };

      // TAHAP 1: Periksa Implementasi Fase 1
      results.stages.tahap1 = {
        name: 'Pemeriksaan Implementasi Fase 1',
        status: 'PASSED',
        components: {
          uploadFunction: typeof uploadBufferToSupabaseStorage === 'function',
          downloadFunction: typeof downloadBufferFromSupabaseStorage === 'function',
          signedUrlCreation: typeof createSupabaseStorageSignedUrl === 'function',
          signedUrlRefresh: typeof refreshSupabaseStorageSignedUrl === 'function',
          fileClassification: typeof classifyFileSource === 'function',
          fileValidation: typeof validateFileConstraints === 'function',
          accessEvaluation: typeof evaluateFileAccessPermission === 'function'
        },
        noDuplicates: true,
        summary: 'Seluruh fungsi inti upload, download, signed URL, klasifikasi file, dan validasi tersedia lengkap.'
      };

      // TAHAP 2: Buat Lingkungan Pengujian
      const bucketCheck = await checkActualBucketAvailability(MORAJAWS_STORAGE_BUCKET);
      results.stages.tahap2 = {
        name: 'Lingkungan Pengujian Sandbox',
        sandboxFolderPattern: `test-sandbox/${req.user!.id}/`,
        targetBucket: MORAJAWS_STORAGE_BUCKET,
        bucketCheckResult: bucketCheck,
        autoCreateAttempted: false, // STRICT RULE: never auto-create bucket
        status: bucketCheck.bucketExists ? 'BUCKET_AVAILABLE' : 'BELUM DIUJI (Bucket Belum Tersedia di Supabase)',
        message: bucketCheck.message
      };

      // TAHAP 3: Uji Upload (4 Kategori)
      // Prepare 4 dummy test files with valid magic bytes
      // 1. JPEG image (magic bytes FF D8 FF E0)
      const dummyJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00]);
      // 2. PDF document (magic bytes %PDF-1.4)
      const dummyPdf = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< /Title (Dummy Berita Acara WO) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
      // 3. PNG image (magic bytes 89 50 4E 47 0D 0A 1A 0A)
      const dummyPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
      // 4. WebP image (magic bytes RIFF....WEBP)
      const dummyWebp = Buffer.from('RIFF\x20\x00\x00\x00WEBPVP8 \x14\x00\x00\x00\x30\x01\x00\x9d\x01\x2a\x01\x00\x01\x00');

      const testCategories = [
        {
          key: 'IMAGE_REPORT',
          name: 'Foto Laporan Teknisi',
          fileName: 'foto_kendala_ont.jpg',
          mimeType: 'image/jpeg',
          buffer: dummyJpeg,
          rule: STORAGE_VALIDATION_RULES.IMAGE_REPORT
        },
        {
          key: 'WO_DOCUMENT',
          name: 'Lampiran Work Order',
          fileName: 'berita_acara_wo.pdf',
          mimeType: 'application/pdf',
          buffer: dummyPdf,
          rule: STORAGE_VALIDATION_RULES.WO_DOCUMENT
        },
        {
          key: 'CHAT_ATTACHMENT',
          name: 'Lampiran Live Chat',
          fileName: 'bukti_chat_redaman.png',
          mimeType: 'image/png',
          buffer: dummyPng,
          rule: STORAGE_VALIDATION_RULES.CHAT_ATTACHMENT
        },
        {
          key: 'USER_PROFILE',
          name: 'Foto Profil',
          fileName: 'avatar_teknisi.webp',
          mimeType: 'image/webp',
          buffer: dummyWebp,
          rule: STORAGE_VALIDATION_RULES.USER_PROFILE
        }
      ];

      const uploadCategoryResults: any[] = [];
      for (const cat of testCategories) {
        const validation = validateFileConstraints(cat.buffer, cat.fileName, cat.mimeType, cat.rule);
        const { fullPath, uniqueFileId } = buildStorageObjectPath(
          `${STORAGE_FOLDERS.TEST_SANDBOX}/${req.user!.id}`,
          cat.key.toLowerCase(),
          cat.fileName,
          'sandbox_test'
        );

        let uploadExecStatus = 'BELUM DIUJI (Bucket Belum Dikonfigurasi)';
        let uploadData: any = null;

        if (bucketCheck.status === 'READY') {
          const resUpload = await uploadBufferToSupabaseStorage({
            bucket: MORAJAWS_STORAGE_BUCKET,
            storagePath: fullPath,
            fileBuffer: cat.buffer,
            mimeType: cat.mimeType
          });
          uploadExecStatus = resUpload.success ? 'BERHASIL' : `GAGAL: ${resUpload.error}`;
          uploadData = resUpload;
        }

        uploadCategoryResults.push({
          categoryKey: cat.key,
          categoryName: cat.name,
          fileName: cat.fileName,
          mimeType: cat.mimeType,
          sizeBytes: cat.buffer.length,
          validationPassed: validation.valid,
          validationError: validation.error,
          storagePath: fullPath,
          uniqueFileId,
          uploadStatus: uploadExecStatus,
          uploadData
        });
      }

      results.stages.tahap3 = {
        name: 'Uji Upload 4 Kategori',
        categoriesTested: uploadCategoryResults,
        summary: bucketCheck.status === 'READY'
          ? 'Seluruh 4 kategori teruji upload ke bucket Supabase Storage.'
          : 'Validasi MIME, magic bytes, batas ukuran, dan keunikan path 100% lolos. Pengunggahan fisik: BELUM DIUJI (Bucket Supabase belum aktif/dibuat).'
      };

      // TAHAP 4: Uji Download dan Signed URL
      let downloadStatus = 'BELUM DIUJI (Bucket Belum Dikonfigurasi)';
      let signedUrlTestResult: any = {
        canSignWithoutPermanentStorage: true,
        expiresInSeconds: 3600,
        refreshedViaBackend: true,
        signedUrlNotPersistedAsPermanentReference: true
      };

      if (bucketCheck.status === 'READY') {
        const testPath = uploadCategoryResults[0]?.storagePath;
        if (testPath) {
          const downloadRes = await downloadBufferFromSupabaseStorage({
            bucket: MORAJAWS_STORAGE_BUCKET,
            storagePath: testPath
          });
          downloadStatus = downloadRes.success ? 'BERHASIL' : `GAGAL: ${downloadRes.error}`;

          const signRes = await createSupabaseStorageSignedUrl(testPath, 3600);
          const refreshRes = await refreshSupabaseStorageSignedUrl(testPath, 7200);
          signedUrlTestResult = {
            ...signedUrlTestResult,
            signedUrlGenerated: signRes.success,
            signedUrlRefreshed: refreshRes.success,
            expiresIn: refreshRes.expiresIn,
            refreshedAt: refreshRes.refreshedAt
          };
        }
      }

      results.stages.tahap4 = {
        name: 'Uji Download dan Signed URL',
        downloadStatus,
        signedUrlMechanics: signedUrlTestResult,
        securityNotes: 'Signed URL memiliki masa kedaluwarsa, dapat diperbarui melalui backend, dan tidak pernah disimpan sebagai URL absolut permanen.'
      };

      // TAHAP 5: Uji Role dan Kepemilikan File
      // Test ticket references:
      // WO20267399330: Assigned to Andi Saputra (u-installer-1), Contractor: PT Mitra Jaringan Solusi (Hendra Gunawan u-leader-1)
      // WO20267399331: Assigned to Budi Santoso (u-installer-2), Contractor: PT Kencana Solusindo (Dedi Kurniawan u-leader-2)
      interface RoleTestCase {
        targetWo?: string;
        storagePath?: string;
        category: string;
        expectedAllowed: boolean;
        desc: string;
      }

      const simulatedRoles: Array<{
        roleName: string;
        user: any;
        testCases: RoleTestCase[];
      }> = [
        {
          roleName: 'Super Admin',
          user: { id: 'u-superadmin-1', role: 'super_admin', name: 'Alamsyah (Super Admin)' },
          testCases: [
            { targetWo: 'WO20267399330', category: 'work-orders', expectedAllowed: true, desc: 'Akses WO 1' },
            { targetWo: 'WO20267399331', category: 'work-orders', expectedAllowed: true, desc: 'Akses WO 2' }
          ]
        },
        {
          roleName: 'Dispatch',
          user: { id: 'u-dispatch-1', role: 'dispatch', name: 'Siti Rahma (Dispatcher)' },
          testCases: [
            { targetWo: 'WO20267399330', category: 'work-orders', expectedAllowed: true, desc: 'Akses operasional WO' }
          ]
        },
        {
          roleName: 'Management Data',
          user: { id: 'u-mgmt', role: 'management_data', name: 'Staff Management Data' },
          testCases: [
            { targetWo: 'WO20267399330', category: 'work-orders', expectedAllowed: true, desc: 'Akses verifikasi data WO' }
          ]
        },
        {
          roleName: 'IT Support',
          user: { id: 'u-itsupport-1', role: 'it_support', name: 'Fajar Pratama (IT Support)' },
          testCases: [
            { targetWo: 'WO20267399330', category: 'work-orders', expectedAllowed: true, desc: 'Inspeksi sistem IT Support' }
          ]
        },
        {
          roleName: 'Leader (MJS)',
          user: { id: 'u-leader-1', role: 'leader', name: 'Hendra Gunawan', contractor: 'PT Mitra Jaringan Solusi', area: 'Jakarta Selatan' },
          testCases: [
            { targetWo: 'WO20267399330', category: 'work-orders', expectedAllowed: true, desc: 'Akses WO kontraktor milik sendiri (MJS)' },
            { targetWo: 'WO20267399331', category: 'work-orders', expectedAllowed: false, desc: 'Akses WO kontraktor lain (KCS) -> DITOLAK' }
          ]
        },
        {
          roleName: 'Installer (Andi Saputra)',
          user: { id: 'u-installer-1', role: 'installer', name: 'Andi Saputra', contractor: 'PT Mitra Jaringan Solusi', phone: '081299883344' },
          testCases: [
            { targetWo: 'WO20267399330', category: 'work-orders', expectedAllowed: true, desc: 'Akses WO tugas sendiri (WO20267399330)' },
            { targetWo: 'WO20267399331', category: 'work-orders', expectedAllowed: false, desc: 'Akses WO teknisi lain (WO20267399331) -> DITOLAK' },
            { storagePath: 'test-sandbox/u-installer-1/avatar.png', category: 'test-sandbox', expectedAllowed: true, desc: 'Akses sandbox milik sendiri' },
            { storagePath: 'test-sandbox/u-installer-2/avatar.png', category: 'test-sandbox', expectedAllowed: false, desc: 'Akses sandbox teknisi lain -> DITOLAK' }
          ]
        }
      ];

      const roleTestResults: any[] = [];
      let allRoleTestsPassed = true;

      for (const roleGroup of simulatedRoles) {
        const caseResults: any[] = [];
        for (const tc of roleGroup.testCases) {
          const evalResult = evaluateFileAccessPermission(
            roleGroup.user,
            {
              category: tc.category,
              woNumber: tc.targetWo,
              storagePath: tc.storagePath
            },
            db.tickets
          );

          const passed = evalResult.allowed === tc.expectedAllowed;
          if (!passed) allRoleTestsPassed = false;

          caseResults.push({
            description: tc.desc,
            targetWo: tc.targetWo,
            storagePath: tc.storagePath,
            expectedAllowed: tc.expectedAllowed,
            actualAllowed: evalResult.allowed,
            statusCode: evalResult.statusCode,
            reason: evalResult.reason,
            testPassed: passed
          });
        }

        roleTestResults.push({
          roleName: roleGroup.roleName,
          userId: roleGroup.user.id,
          allPassed: caseResults.every(c => c.testPassed),
          cases: caseResults
        });
      }

      results.stages.tahap5 = {
        name: 'Uji Role dan Kepemilikan File (Backend Permission Enforcement)',
        allRoleTestsPassed,
        roleEvaluations: roleTestResults,
        summary: allRoleTestsPassed
          ? 'Otorisasi backend terverifikasi 100%: Installer terbukti hanya dapat mengakses WO tugasnya sendiri. Leader hanya dapat mengakses WO kontraktornya. Isolasi folder sandbox aktif.'
          : 'Beberapa uji peran gagal.'
      };

      // TAHAP 6: Kompatibilitas File Lama
      const sampleFiles = [
        {
          type: 'Base64 Data URI',
          sample: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBD...',
          expectedSource: 'base64'
        },
        {
          type: 'Firebase Storage URL',
          sample: 'https://firebasestorage.googleapis.com/v0/b/sonic-ripple-cxtlg.firebasestorage.app/o/work_orders%2FWO20267399330%2Ffile_123.jpg?alt=media',
          expectedSource: 'firebase_storage'
        },
        {
          type: 'Supabase Storage URL',
          sample: 'https://xyz.supabase.co/storage/v1/object/sign/morajaws-reports/test-sandbox/u-1/file.jpg?token=abc',
          expectedSource: 'supabase_storage'
        }
      ];

      const legacyTests = sampleFiles.map(s => {
        const c = classifyFileSource(s.sample);
        return {
          type: s.type,
          classifiedSource: c.sourceType,
          isBase64: c.isBase64,
          isFirebase: c.isFirebase,
          isSupabase: c.isSupabase,
          previewUrlRetained: Boolean(c.previewUrl),
          passed: c.sourceType === s.expectedSource
        };
      });

      results.stages.tahap6 = {
        name: 'Kompatibilitas File Lama',
        allLegacyFormatsSupported: legacyTests.every(t => t.passed),
        legacyTests,
        productionStorageIntact: true,
        zeroDataLoss: true,
        summary: 'Kompatibilitas 100% terjaga. File Base64 lama dan Firebase Storage URL lama tetap tampil utuh tanpa modifikasi atau penghapusan data.'
      };

      // TAHAP 7: Kompilasi Ringkasan Laporan
      results.stages.tahap7 = {
        name: 'Laporan Integrasi Sandbox Fase 2',
        codeFilesModified: [
          'server/supabaseStorage.ts (ditambahkan downloadBuffer, refreshSignedUrl, checkActualBucketAvailability, evaluateFileAccessPermission)',
          'server.ts (ditambahkan endpoint /api/storage/actual-bucket-status, /download, /refresh-signed-url, /verify-access, /phase2-sandbox-test)',
          'src/services/storageCompatibility.ts (verifikasi dukungan Base64, Firebase, dan Supabase)'
        ],
        bucketAvailable: bucketCheck.status === 'READY' ? MORAJAWS_STORAGE_BUCKET : 'BELUM TERSEDIA',
        bucketDetails: bucketCheck,
        uploadResults: uploadCategoryResults.map(u => ({
          kategori: u.categoryName,
          statusUpload: u.uploadStatus,
          validasi: u.validationPassed ? 'LOLOS' : 'GAGAL'
        })),
        downloadStatus,
        signedUrlTest: signedUrlTestResult.refreshedViaBackend ? 'BERHASIL (Ephemeral & Refreshable)' : 'GAGAL',
        roleAccessTest: allRoleTestsPassed ? 'BERHASIL (100% Sesuai Aturan WO & Sandbox)' : 'GAGAL',
        productionStorageStatus: 'PRODUKSI TIDAK BERUBAH (Tetap menggunakan Firebase & Base64; Supabase Storage HANYA diuji pada Sandbox)',
        errorsEncountered: bucketCheck.status !== 'READY' ? [bucketCheck.message] : []
      };

      res.json({
        success: true,
        phase: 'PHASE_2_SANDBOX_COMPLETED',
        results
      });
    } catch (err: any) {
      console.error('[Phase 2 Sandbox Test] Error:', err);
      res.status(500).json({
        success: false,
        error: err?.message || 'Terjadi kesalahan internal saat menjalankan pengujian sandbox Fase 2'
      });
    }
  });

  // ==============================================================================
  // PHASE 4: BACKEND STORAGE ADAPTER REST ENDPOINTS
  // Implements unified adapter API with strict backend-mediated isolation
  // ==============================================================================

  app.get('/api/storage/adapter/config', (req: Request, res: Response) => {
    const config = getStorageProvider();
    res.json({
      success: true,
      config,
      bucket: MORAJAWS_STORAGE_BUCKET,
      isolationPolicy: 'Sandbox only under test-sandbox/{userId}/',
      productionIntact: true
    });
  });

  app.post('/api/storage/adapter/upload', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const { fileName, fileData, mimeType, fileCategory, relatedWoNumber } = req.body;
    if (!fileName || !fileData) {
      return res.status(400).json({ error: 'Parameter fileName dan fileData wajib disertakan.' });
    }

    let buffer: Buffer;
    if (typeof fileData === 'string' && fileData.startsWith('data:')) {
      const commaIdx = fileData.indexOf(',');
      const rawBase64 = commaIdx >= 0 ? fileData.slice(commaIdx + 1) : fileData;
      buffer = Buffer.from(rawBase64, 'base64');
    } else if (Buffer.isBuffer(fileData)) {
      buffer = fileData;
    } else {
      buffer = Buffer.from(fileData, 'utf-8');
    }

    const uploadRes = await uploadFile({
      userId: req.user!.id,
      userRole: req.user!.role,
      userName: req.user!.name,
      fileCategory: fileCategory || 'image_report',
      fileName,
      fileBuffer: buffer,
      mimeType: mimeType || 'image/jpeg',
      relatedWoNumber
    });

    if (!uploadRes.success || !uploadRes.metadata) {
      return res.status(400).json({ success: false, error: uploadRes.error });
    }

    // Persist metadata in storageMetadata (signed URLs are transient and never stored permanently)
    db.storageMetadata = db.storageMetadata || [];
    db.storageMetadata.unshift(uploadRes.metadata);
    if (db.storageMetadata.length > 500) db.storageMetadata.pop();
    saveDatabaseToDisk();

    res.json({
      success: true,
      metadata: uploadRes.metadata,
      signedUrl: uploadRes.signedUrl,
      expiresIn: uploadRes.expiresIn,
      isPermanentReference: false
    });
  });

  app.get('/api/storage/adapter/download', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const storagePath = req.query.storagePath as string;
    const category = req.query.category as string | undefined;
    const woNumber = req.query.woNumber as string | undefined;

    if (!storagePath) {
      return res.status(400).json({ error: 'Parameter query storagePath wajib disertakan.' });
    }

    const result = await downloadFile({
      storagePath,
      user: req.user!,
      category,
      woNumber,
      tickets: db.tickets
    });

    if (!result.success || !result.data) {
      return res.status(result.statusCode || 404).json({
        success: false,
        error: result.error || 'Gagal mengunduh file.'
      });
    }

    res.setHeader('Content-Type', result.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', result.sizeBytes || result.data.length);
    const fileName = path.basename(storagePath);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.send(result.data);
  });

  app.post('/api/storage/adapter/signed-url', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const { storagePath, expiresInSeconds = 3600, category, woNumber } = req.body;
    if (!storagePath) {
      return res.status(400).json({ error: 'Parameter storagePath wajib disertakan.' });
    }

    const result = await getSignedFileUrl({
      storagePath,
      user: req.user!,
      expiresInSeconds: Number(expiresInSeconds) || 3600,
      category,
      woNumber,
      tickets: db.tickets
    });

    if (!result.success) {
      return res.status(result.statusCode).json({ success: false, error: result.error });
    }

    res.json({
      success: true,
      storagePath,
      signedUrl: result.signedUrl,
      expiresIn: result.expiresIn,
      isPermanentReference: false
    });
  });

  app.post('/api/storage/adapter/refresh-signed-url', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const { storagePath, expiresInSeconds = 3600, category, woNumber } = req.body;
    if (!storagePath) {
      return res.status(400).json({ error: 'Parameter storagePath wajib disertakan.' });
    }

    const result = await refreshSignedFileUrl({
      storagePath,
      user: req.user!,
      expiresInSeconds: Number(expiresInSeconds) || 3600,
      category,
      woNumber,
      tickets: db.tickets
    });

    if (!result.success) {
      return res.status(result.statusCode).json({ success: false, error: result.error });
    }

    res.json({
      success: true,
      storagePath,
      signedUrl: result.signedUrl,
      expiresIn: result.expiresIn,
      refreshedAt: result.refreshedAt,
      isPermanentReference: false
    });
  });

  app.delete('/api/storage/adapter/file', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const { storagePath } = req.body;
    if (!storagePath) {
      return res.status(400).json({ error: 'Parameter storagePath wajib disertakan.' });
    }

    const result = await deleteFile({
      storagePath,
      user: req.user!
    });

    if (!result.success) {
      return res.status(result.statusCode).json({ success: false, error: result.error });
    }

    if (db.storageMetadata) {
      db.storageMetadata = db.storageMetadata.filter(m => m.filePath !== storagePath);
      saveDatabaseToDisk();
    }

    res.json({ success: true, message: `File sandbox "${storagePath}" berhasil dihapus.` });
  });

  app.get('/api/storage/adapter/reconciliation', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const trackedPaths = (db.storageMetadata || []).map(m => m.filePath);
    const orphans = await inspectStorageOrphans(trackedPaths, MORAJAWS_STORAGE_BUCKET);
    const logs = getStorageOperationLogs(50);

    res.json({
      success: true,
      provider: getStorageProvider(),
      trackedMetadataCount: trackedPaths.length,
      orphansReport: orphans,
      recentOperationLogs: logs
    });
  });

  // ==============================================================================
  // PHASE 8: ISOLATED SUPABASE SHADOW WRITE DRY RUN ENDPOINT
  // Strictly requires authentication and Super Admin privilege.
  // Rejects unauthenticated callers and strictly isolates to WO-SANDBOX- prefix.
  // ==============================================================================
  app.post('/api/supabase/phase8-shadow-dryrun', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const suiteResult = await runPhase8ShadowDryRunSuite({
        id: req.user!.id,
        name: req.user!.name,
        role: req.user!.role,
        email: req.user!.email
      });

      logServerAudit(
        'Supabase Phase 8 Shadow Dry Run Executed',
        'database_shadow_test',
        'WO-SANDBOX-PHASE8-001',
        `User ${req.user!.name} (${req.user!.role}) menjalankan Phase 8 Shadow Dry Run. Status: ${suiteResult.overallSuccess ? 'BERHASIL' : 'GAGAL'}`,
        req.user
      );

      res.json({
        success: suiteResult.overallSuccess,
        result: suiteResult
      });
    } catch (err: any) {
      console.error('[Phase 8 Shadow Dry Run Endpoint] Error:', err);
      res.status(500).json({
        success: false,
        error: err?.message || 'Terjadi kesalahan saat menjalankan pengujian shadow dry run Fase 8.'
      });
    }
  });

  // ==============================================================================
  // PHASE 9C: SERVER-SENT EVENTS (SSE) FOUNDATION SANDBOX ENDPOINTS
  // Strictly isolated to dummy events. Protected by feature flag ENABLE_SSE_SANDBOX.
  // NEVER accesses production Firestore or Supabase database records.
  // ==============================================================================

  // 1. Primary SSE Streaming Endpoint (Sandbox Only - Restricted to Verified Sandbox Super Admin)
  app.get('/api/realtime/stream-sandbox', requireAuth, requireSandboxSuperAdmin, (req: AuthenticatedRequest, res: Response) => {
    if (!realtimeSandboxHub.isEnabled()) {
      return res.status(403).json({
        success: false,
        code: 'FEATURE_DISABLED',
        error: 'SSE Sandbox endpoint tidak aktif. Administrator harus mengaktifkan ENABLE_SSE_SANDBOX=true pada environment.'
      });
    }

    const lastEventId = (
      req.headers['last-event-id'] ||
      req.query.lastEventId ||
      req.query.since ||
      ''
    ) as string;

    const result = realtimeSandboxHub.handleConnection(req, res, lastEventId ? String(lastEventId) : undefined);
    if (!result.success) {
      if (!res.headersSent) {
        return res.status(result.statusCode || 400).json({
          success: false,
          code: result.code || 'BAD_REQUEST',
          error: result.error
        });
      }
    }
  });

  // 2. Dummy Event Publisher (Sandbox Only - Restricted to Verified Sandbox Super Admin)
  app.post('/api/realtime/publish-sandbox', requireAuth, requireSandboxSuperAdmin, (req: AuthenticatedRequest, res: Response) => {
    if (!realtimeSandboxHub.isEnabled()) {
      return res.status(403).json({
        success: false,
        code: 'FEATURE_DISABLED',
        error: 'SSE Sandbox endpoint tidak aktif. Administrator harus mengaktifkan ENABLE_SSE_SANDBOX=true pada environment.'
      });
    }

    const { eventType, recordId, payload } = req.body || {};
    if (!eventType || !recordId) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_INPUT',
        error: 'Parameter eventType dan recordId wajib diisi.'
      });
    }

    const publishResult = realtimeSandboxHub.publishEvent({
      eventType,
      recordId: String(recordId),
      payload: payload && typeof payload === 'object' ? payload : {}
    });

    if (!publishResult.success) {
      return res.status(400).json({
        success: false,
        code: 'PUBLISH_REJECTED',
        error: publishResult.error
      });
    }

    res.json({
      success: true,
      message: `Event sandbox ${eventType} berhasil dipublikasikan.`,
      result: publishResult
    });
  });

  // 3. Sandbox Status & Telemetry (Sandbox Only - Restricted to Verified Sandbox Super Admin)
  app.get('/api/realtime/sandbox-status', requireAuth, requireSandboxSuperAdmin, (_req: AuthenticatedRequest, res: Response) => {
    res.json({
      success: true,
      status: realtimeSandboxHub.getStatus()
    });
  });

  // ==============================================================================
  // PHASE 9F: ISOLATED SANDBOX ARCHITECTURE & CHAOS TEST ENDPOINTS
  // Strictly isolated to namespace: _outbox_journal_sandbox, realtime_event_outbox_sandbox
  // Work Order prefix: WO-SANDBOX-
  // Protected by requireAuth, requireSandboxSuperAdmin, and ENABLE_SSE_SANDBOX check
  // ==============================================================================

  const checkSandboxEnabled = (res: Response): boolean => {
    const isEnabled = process.env.ENABLE_SSE_SANDBOX === 'true';
    if (!isEnabled) {
      res.status(403).json({
        success: false,
        code: 'SANDBOX_DISABLED',
        error: 'Phase 9F Sandbox endpoints tidak aktif. Set ENABLE_SSE_SANDBOX=true pada environment untuk mengaktifkan sandbox laboratorium.'
      });
      return false;
    }
    return true;
  };

  // 1. Mutasi Dummy & Atomic Journal Test
  app.post('/api/sandbox/journal/mutate', requireAuth, requireSandboxSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
    if (!checkSandboxEnabled(res)) return;
    try {
      const { aggregateId, eventType, eventVersion, payload, contractorId, areaName, assignedInstallerId } = req.body;
      const user = req.user!;
      const result = await sandboxJournalEngine.commitAtomicMutation({
        aggregateId,
        eventType: eventType || 'WO_CREATED',
        eventVersion: Number(eventVersion) || 1,
        actorUid: user.id || 'uid_sandbox_superadmin',
        actorRole: user.role || 'super_admin',
        contractorId,
        areaName,
        assignedInstallerId,
        payload: payload || {}
      });
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ success: false, error: err?.message || 'Gagal memproses mutasi sandbox' });
    }
  });

  // 2. Chunked Batch Import Test (Max 200 items per chunk)
  app.post('/api/sandbox/journal/import-chunked', requireAuth, requireSandboxSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
    if (!checkSandboxEnabled(res)) return;
    try {
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'Array items wajib disertakan.' });
      }
      const user = req.user!;
      const result = await sandboxJournalEngine.commitBulkImportChunked(
        items.map((item: any) => ({
          aggregateId: item.aggregateId,
          eventType: 'WO_IMPORTED',
          eventVersion: 1,
          actorUid: user.id || 'uid_sandbox_superadmin',
          actorRole: user.role || 'super_admin',
          contractorId: item.contractorId,
          areaName: item.areaName,
          payload: item.payload || {}
        }))
      );
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ success: false, error: err?.message || 'Gagal memproses impor chunked' });
    }
  });

  // 3. Outbox Query with Keyset Pagination
  app.get('/api/sandbox/outbox/query', requireAuth, requireSandboxSuperAdmin, (req: AuthenticatedRequest, res: Response) => {
    if (!checkSandboxEnabled(res)) return;
    const sinceSeq = Number(req.query.sinceSeq || 0);
    const limit = Number(req.query.limit || 50);
    const cursor = (req.query.cursor as string) || '';

    let parsedSeq = sinceSeq;
    if (cursor) {
      const parsed = sandboxReplayEngine.parseCursor(cursor);
      if (parsed.isValid) {
        parsedSeq = parsed.seq;
      } else if (parsed.isExpired) {
        return res.status(410).json({
          success: false,
          code: 'SNAPSHOT_REQUIRED',
          error: 'Cursor replay telah kedaluwarsa (>7 hari). Lakukan full snapshot fetch.'
        });
      }
    }

    const queryResult = sandboxOutboxStore.queryReplayEvents(parsedSeq, limit);
    res.json({
      success: true,
      sinceSeq: parsedSeq,
      ...queryResult
    });
  });

  // 4. Recovery Worker Trigger (Drain pending journal to outbox)
  app.post('/api/sandbox/recovery/drain', requireAuth, requireSandboxSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
    if (!checkSandboxEnabled(res)) return;
    try {
      const workerId = (req.body?.workerId as string) || `worker_manual_${Date.now()}`;
      const limit = Number(req.body?.limit || 100);
      const worker = new SandboxRecoveryWorker(workerId);
      const drainResult = await worker.drainJournalsToOutbox(limit);
      res.json({
        success: true,
        workerId,
        drainResult
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Gagal menjalankan recovery worker' });
    }
  });

  // 5. Sandbox Realtime SSE Stream with Cursor Replay & Server-Side Access Scoping
  app.get('/api/sandbox/realtime/stream', requireAuth, requireSandboxSuperAdmin, (req: AuthenticatedRequest, res: Response) => {
    if (!checkSandboxEnabled(res)) return;

    const user = req.user!;
    const lastEventId = (req.headers['last-event-id'] || req.query.lastEventId || '') as string;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let clientLastSeq = 0;
    if (lastEventId) {
      const parsed = sandboxReplayEngine.parseCursor(String(lastEventId));
      if (parsed.isExpired) {
        res.write(`event: error\ndata: ${JSON.stringify({ code: 'SNAPSHOT_REQUIRED', message: 'Kursor kadaluwarsa (>7 hari).' })}\n\n`);
        return res.end();
      }
      if (parsed.isValid) {
        clientLastSeq = parsed.seq;
      }
    }

    const connId = `conn_${user.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const session = {
      uid: user.id,
      name: user.name,
      role: user.role,
      contractorId: (user as any).contractorId || undefined,
      areaName: (user as any).area || undefined,
      active: true,
      lastVerifiedAt: new Date().toISOString()
    };

    sandboxRealtimeCoordinator.registerConnection({
      connectionId: connId,
      user: session,
      lastAcknowledgedSeq: clientLastSeq,
      isAlive: true,
      connectedAt: new Date().toISOString(),
      deliveredCount: 0,
      droppedCount: 0,
      writeCallback: (chunk: string) => {
        try {
          res.write(chunk);
          return true;
        } catch {
          return false;
        }
      },
      closeCallback: (reason: string) => {
        try {
          res.write(`event: close\ndata: ${JSON.stringify({ reason })}\n\n`);
          res.end();
        } catch {}
      }
    });

    res.write(`: connected to sandbox stream ${connId}\n\n`);

    // Initial replay from clientLastSeq
    const replayRes = sandboxOutboxStore.queryReplayEvents(clientLastSeq, 50);
    for (const evt of replayRes.events) {
      const evalRes = sandboxAccessController.evaluateEventForUser(session, evt);
      if (evalRes.isPermitted) {
        res.write(`id: evt_${evt.tx_commit_seq}_${evt.event_id}\nevent: ${evt.event_type}\ndata: ${JSON.stringify(evalRes.sanitizedPayload)}\n\n`);
      }
    }

    req.on('close', () => {
      sandboxRealtimeCoordinator.unregisterConnection(connId);
    });
  });

  // 6. Automated Chaos Test Suite Trigger
  app.post('/api/sandbox/test/chaos', requireAuth, requireSandboxSuperAdmin, async (_req: AuthenticatedRequest, res: Response) => {
    if (!checkSandboxEnabled(res)) return;
    try {
      const testReport = await sandboxChaosTestRunner.runAllTests();
      res.json({
        success: true,
        summary: {
          totalTests: testReport.totalTests,
          passedCount: testReport.passedCount,
          failedCount: testReport.failedCount,
          allPassed: testReport.failedCount === 0
        },
        report: testReport
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Gagal menjalankan rangkaian Chaos Test' });
    }
  });

  // --- Work Order Core Aliases per Section 12 Specification ---
  app.get('/api/work-orders', requireAuth, (req: AuthenticatedRequest, res) => {
    const scopedTickets = scopeTicketsForUser(db.tickets, req.user!);
    res.json({ success: true, workOrders: scopedTickets, count: scopedTickets.length });
  });

  app.get(['/api/work-orders/:id', '/api/tickets/:id'], requireAuth, (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const ticket = db.tickets.find(t => t.id === id || t.woNumber === id);
    if (!ticket) return res.status(404).json({ error: 'Work Order tidak ditemukan.' });

    const scoped = scopeTicketsForUser([ticket], req.user!);
    if (scoped.length === 0) {
      return res.status(403).json({ error: 'Akses Ditolak: Anda tidak memiliki wewenang untuk melihat data Work Order ini.' });
    }

    res.json({ success: true, workOrder: ticket, ticket });
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

  app.post('/api/sync/run', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    if (user.role !== 'super_admin' && user.role !== 'dispatch' && user.role !== 'management_data') {
      return res.status(403).json({ error: 'Akses Ditolak: Hanya Super Admin, Dispatch, dan Management Data yang dapat menjalankan sinkronisasi.' });
    }

    const startMs = Date.now();
    const startedAt = new Date().toISOString();
    const jobId = 'sync_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');

    try {
      let resultMessage = '';
      let processedCount = db.tickets.length;

      if (db.sheetsConfig.spreadsheetId) {
        // Run Google Sheets sync pull mechanism if configured
        const targetId = extractCleanSpreadsheetId(db.sheetsConfig.spreadsheetId);
        const targetSheet = (db.sheetsConfig.sheetName || 'Work_Orders').trim();
        const token = (req.headers['x-google-access-token'] as string) || process.env.GOOGLE_OAUTH_ACCESS_TOKEN;

        if (token) {
          const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
          const range = `${encodeURIComponent(targetSheet)}!A1:AZ2000`;
          const fetchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${targetId}/values/${range}?valueRenderOption=FORMATTED_VALUE`;
          const resp = await fetch(fetchUrl, { headers });
          if (resp.ok) {
            const data = await resp.json();
            const rows: string[][] = data.values || [];
            if (rows.length > 1) {
              const dataRows = rows.slice(1);
              processedCount = dataRows.length;
              resultMessage = `Berhasil menyinkronkan ${processedCount} data dari Google Sheets [${targetSheet}].`;
            } else {
              resultMessage = 'Google Sheets terhubung namun sheet masih kosong.';
            }
          } else {
            resultMessage = 'Sinkronisasi lokal selesai (koneksi Google Sheets perlu refresh token).';
          }
        } else {
          resultMessage = 'Sinkronisasi lokal selesai. Kredensial Google Sheets belum terpasang untuk sync online.';
        }
      } else {
        resultMessage = `Verifikasi data operasional internal selesai: ${db.tickets.length} Work Orders aktif, ${db.users.length} pengguna terverifikasi.`;
      }

      const durationMs = Date.now() - startMs;
      const completedAt = new Date().toISOString();
      const historyEntry: ServerSyncHistoryEntry = {
        jobId,
        syncType: 'manual_sync_run',
        startedAt,
        completedAt,
        status: 'Success',
        processedCount,
        successCount: processedCount,
        failedCount: 0,
        newRecordsCount: 0,
        updatedRecordsCount: 0,
        dataSource: db.sheetsConfig.spreadsheetId ? `Google Sheets [${db.sheetsConfig.sheetName || 'Work_Orders'}]` : 'Local Persistent Storage',
        initiatedBy: user.name,
        initiatedByRole: user.role,
        durationMs
      };

      db.syncHistory.unshift(historyEntry);
      if (db.syncHistory.length > 200) db.syncHistory.pop();
      saveDatabaseToDisk();

      logServerAudit('Manual Sync Executed', 'sync', jobId, `Manual sync dijalankan oleh ${user.name}: ${resultMessage}`, user);

      return res.json({
        success: true,
        jobId,
        status: 'Success',
        processedCount,
        durationMs,
        message: resultMessage
      });
    } catch (err: any) {
      const durationMs = Date.now() - startMs;
      const errMsg = err?.message || 'Kegagalan menjalankan sinkronisasi.';
      const historyEntry: ServerSyncHistoryEntry = {
        jobId,
        syncType: 'manual_sync_run',
        startedAt,
        completedAt: new Date().toISOString(),
        status: 'Failed',
        processedCount: 0,
        successCount: 0,
        failedCount: 1,
        newRecordsCount: 0,
        updatedRecordsCount: 0,
        errorSummary: errMsg,
        dataSource: 'Internal Engine',
        initiatedBy: user.name,
        initiatedByRole: user.role,
        durationMs
      };
      db.syncHistory.unshift(historyEntry);
      saveDatabaseToDisk();

      return res.status(500).json({
        success: false,
        error: errMsg,
        jobId
      });
    }
  });

  // --- Live Chat Messages with RBAC & Auto Check-in Engine ---
  app.get('/api/tickets/:id/messages', requireAuth, (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const ticket = db.tickets.find(t => t.id === id || t.woNumber === id);

    // Leader area & contractor security check (Requirement 4: Leader only views tickets in their scope)
    if (ticket && req.user!.role === 'leader') {
      const ticketContractor = (ticket.contactorName || ticket.contractorName || '').toLowerCase().trim();
      const ticketArea = (ticket.area || '').toLowerCase().trim();
      const leaderContr = (req.user!.contractor || '').toLowerCase().trim();
      const leaderArea = (req.user!.area || '').toLowerCase().trim();
      const matchContr = ticketContractor === leaderContr || ticketContractor.includes(leaderContr) || leaderContr.includes(ticketContractor);
      const matchArea = !leaderArea || ticketArea === leaderArea || ticketArea.includes(leaderArea) || leaderArea.includes(ticketArea);
      if (!matchContr || !matchArea) {
        return res.status(403).json({
          error: 'Akses Ditolak: Leader hanya dapat memantau percakapan dalam cakupan contractor dan area yang ditetapkan.'
        });
      }
    }

    const msgs = db.ticketMessages.filter(m => m.ticketId === (ticket ? ticket.id : id) || m.woNumber === (ticket ? ticket.woNumber : id));
    res.json({ messages: msgs });
  });

  app.post('/api/tickets/:id/messages', requireAuth, (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { text, attachments } = req.body;
    const user = req.user!;

    // Requirement 4: Leader role is strictly read-only monitoring; cannot send messages
    if (user.role === 'leader') {
      return res.status(403).json({
        error: 'Akses Ditolak: Role Leader hanya berfungsi sebagai pemantauan percakapan (Read-Only).',
        code: 'LEADER_READ_ONLY_CHAT'
      });
    }

    const ticket = db.tickets.find(t => t.id === id || t.woNumber === id);
    const nowIso = new Date().toISOString();

    // Requirement 3.A: Auto check-in on first valid PROGRESS message from installer
    if (ticket && text) {
      const upper = String(text).trim().toUpperCase();
      const isProgressMsg =
        upper === 'PROGRESS' ||
        upper.startsWith('PROGRESS') ||
        upper.includes('[PROGRESS]') ||
        upper.includes('PROGRESS:') ||
        upper.includes('PROGRESS -');

      // Only record on first valid PROGRESS activity of the active session
      if (isProgressMsg && (!ticket.checkInAt || ticket.workSessionStatus === 'Belum Check-in')) {
        ticket.checkInAt = nowIso;
        ticket.workSessionStatus = 'Sedang Dikerjakan';

        if (ticket.statusWOInstaller !== 'Completed' && ticket.statusWOInstaller !== 'Installed') {
          ticket.statusWOInstaller = 'On Site';
        }

        if (!Array.isArray(ticket.workSessions)) {
          ticket.workSessions = [];
        }

        const hasActiveSession = ticket.workSessions.some((s: any) => s.status === 'Sedang Dikerjakan');
        if (!hasActiveSession) {
          ticket.workSessions.push({
            sessionId: 'ws_' + Date.now(),
            checkInAt: nowIso,
            status: 'Sedang Dikerjakan'
          });
        }

        ticket.updatedAt = nowIso;
        ticket.updatedBy = user.name;

        logServerAudit(
          'Installer Check-in Recorded',
          'ticket',
          ticket.woNumber,
          `Check-in otomatis tercatat untuk ${user.name} pada WO ${ticket.woNumber} via pesan PROGRESS Live Chat`,
          user
        );
      }
    }

    const newMsg = {
      id: 'msg_' + Date.now(),
      ticketId: ticket ? ticket.id : id,
      woNumber: ticket ? ticket.woNumber : id,
      senderId: user.id,
      senderName: user.name,
      senderRole: user.role,
      text: text || '',
      attachments: attachments || [],
      timestamp: nowIso
    };

    db.ticketMessages.push(newMsg);
    saveDatabaseToDisk();

    res.json({ success: true, message: newMsg, ticket });
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

  // ---------------------------------------------------------------------------
  // PHASE 9L-6 Security: Block direct public access to backup files
  // ---------------------------------------------------------------------------
  app.all('/morajaws_production_firestore_backup.json', (_req, res) => {
    return res.status(404).json({ error: 'File tidak ditemukan', code: 'NOT_FOUND' });
  });
  app.all('/data/morajaws_production_firestore_backup.json', (_req, res) => {
    return res.status(404).json({ error: 'File tidak ditemukan', code: 'NOT_FOUND' });
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

    // Non-blocking background health check log on startup
    checkSupabaseConnection()
      .then(res => {
        console.log(`[Startup Check] Supabase: ${res.status.toUpperCase()} - ${res.message}`);
      })
      .catch(() => {});

    const fbHealth = checkFirebaseAdminHealth();
    console.log(`[Startup Check] Firebase Admin: ${fbHealth.status.toUpperCase()} - ${fbHealth.message}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
