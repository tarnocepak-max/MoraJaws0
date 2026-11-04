/**
 * MoraJaws Work Order Canonical Identity & Anti-Duplication Engine
 *
 * Enforces strict single-WO business uniqueness across ALL intake channels:
 * - Excel (.xlsx/.xls)
 * - CSV
 * - Google Sheets Sync & Resync
 * - Text-to-Table Importer
 * - Form Sameday & Manual Creation
 * - Real-Time Firestore onSnapshot Listeners
 */

import type { Ticket } from '../types/index.ts';

/**
 * Standardizes and normalizes a Work Order number.
 * Trims whitespace, standardizes casing to uppercase, removes internal excessive spacing.
 */
export function normalizeWoNumber(rawWo?: string | null): string {
  if (!rawWo || typeof rawWo !== 'string') return '';
  return rawWo.trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * Checks whether a Work Order number is valid.
 * Must be non-empty, minimum 4 characters, and start with alphanumeric or WO prefix.
 */
export function isValidWoNumber(rawWo?: string | null): boolean {
  if (!rawWo) return false;
  const normalized = normalizeWoNumber(rawWo);
  if (normalized.length < 4 || normalized.length > 50) return false;
  // Disallow dummy or placeholder strings
  if (normalized === 'NULL' || normalized === 'UNDEFINED' || normalized === 'NONE' || normalized === 'TEST') {
    return false;
  }
  return /^[A-Z0-9_\-\.\/]+$/.test(normalized);
}

/**
 * Generates a deterministic, URL-safe Firestore Document ID for a Work Order.
 * Two concurrent writes for the same WO number will target the exact same Firestore document,
 * guaranteeing atomic database-level deduplication.
 */
export function getDeterministicTicketId(woNumber: string): string {
  const norm = normalizeWoNumber(woNumber);
  const safeStr = norm.replace(/[^A-Z0-9_-]/g, '_');
  return `wo_${safeStr}`;
}

export interface ImportRowValidationResult {
  rowNumber: number;
  woNumber: string;
  status: 'new' | 'duplicate_in_file' | 'existing_identical' | 'existing_conflict' | 'invalid_wo';
  reason?: string;
  ticket?: Ticket;
}

export interface ComprehensiveImportReport {
  totalSourceRows: number;
  newlySaved: number;
  skippedExisting: number;
  duplicateInFile: number;
  conflictsCount: number;
  invalidCount: number;
  failedStorageCount: number;
  rowsToCommit: Ticket[];
  conflicts: Array<{ rowNumber: number; woNumber: string; reason: string }>;
  invalidRows: Array<{ rowNumber: number; reason: string }>;
  duplicateRows: Array<{ rowNumber: number; woNumber: string }>;
}

/**
 * Unified pre-import validator & deduplication pipeline.
 * Evaluates all rows against existing database records and within-batch duplicates.
 */
export function validateAndDeduplicateImportBatch(
  incomingRows: Partial<Ticket>[],
  existingDatabaseTickets: Ticket[],
  sourceFileName = 'Imported_Data.xlsx',
  currentUserName = 'System'
): ComprehensiveImportReport {
  const existingMap = new Map<string, Ticket>();
  existingDatabaseTickets.forEach(t => {
    const key = normalizeWoNumber(t.woNumber || (t as any).workOrderNumber);
    if (key) {
      existingMap.set(key, t);
    }
  });

  const seenInBatch = new Set<string>();
  const rowsToCommit: Ticket[] = [];
  const conflicts: Array<{ rowNumber: number; woNumber: string; reason: string }> = [];
  const invalidRows: Array<{ rowNumber: number; reason: string }> = [];
  const duplicateRows: Array<{ rowNumber: number; woNumber: string }> = [];

  let skippedExisting = 0;
  let duplicateInFile = 0;
  let newlySaved = 0;

  incomingRows.forEach((row, index) => {
    const rowNumber = index + 1;
    const rawWo = row.woNumber || (row as any).workOrderNumber || '';
    const normWo = normalizeWoNumber(rawWo);

    // 1. Validate WO Number
    if (!normWo || !isValidWoNumber(normWo)) {
      invalidRows.push({
        rowNumber,
        reason: !normWo ? 'Nomor WO kosong atau tidak terisi.' : `Nomor WO "${rawWo}" tidak sesuai format resmi.`
      });
      return;
    }

    // 2. Check within-file duplicate
    if (seenInBatch.has(normWo)) {
      duplicateInFile++;
      duplicateRows.push({ rowNumber, woNumber: normWo });
      return;
    }
    seenInBatch.add(normWo);

    // 3. Check against existing database records
    const existing = existingMap.get(normWo);
    if (existing) {
      // Check if data is identical or conflicting
      const incomingCust = (row.customerName || (row as any).endUserName || '').trim().toLowerCase();
      const existingCust = (existing.customerName || existing.endUserName || '').trim().toLowerCase();
      const incomingPhone = (row.customerPhone || '').replace(/\D/g, '');
      const existingPhone = (existing.customerPhone || '').replace(/\D/g, '');

      const isConflicting = (incomingCust && existingCust && incomingCust !== existingCust) ||
        (incomingPhone && existingPhone && incomingPhone !== existingPhone && incomingPhone.length >= 8);

      if (isConflicting) {
        conflicts.push({
          rowNumber,
          woNumber: normWo,
          reason: `Konflik data: Pelanggan di file ("${row.customerName}") berbeda dengan database ("${existing.customerName}"). Data lama dipertahankan.`
        });
      } else {
        skippedExisting++;
      }
      return;
    }

    // 4. Construct brand new pristine Ticket with deterministic ID
    const docId = getDeterministicTicketId(normWo);
    const nowIso = new Date().toISOString();

    const newTicket: Ticket = {
      id: docId,
      woNumber: normWo,
      workOrderNumber: normWo,
      idCustomer: (row.idCustomer || (row as any).customerId || '').toString().trim(),
      customerId: (row.idCustomer || (row as any).customerId || '').toString().trim(),
      ticketNumber: row.ticketNumber || '',
      ticketDate: row.ticketDate || nowIso.slice(0, 10),
      date: row.date || nowIso.slice(0, 10),
      dateUpload: nowIso.replace('T', ' ').slice(0, 16),
      fileName: row.fileName || sourceFileName,
      agentId: row.agentId || 'dispatch',

      customerName: (row.customerName || (row as any).endUserName || `Pelanggan ${normWo}`).trim(),
      endUserName: (row.customerName || (row as any).endUserName || `Pelanggan ${normWo}`).trim(),
      customerPhone: (row.customerPhone || '').trim(),
      customerContact1: (row.customerPhone || '').trim(),
      customerPhoneNormalized: (row.customerPhoneNormalized || (row.customerPhone || '').replace(/\D/g, '')).trim(),
      streetName: (row.streetName || '').trim(),
      streetAlternatif: (row.streetAlternatif || '').trim(),
      clusterName: (row.clusterName || '').trim(),
      area: (row.area || 'Jakarta Selatan').trim(),

      appointmentDate: (row.appointmentDate || '').trim(),
      appointmentType: row.appointmentType || 'Regular Installation',
      slotTime: row.slotTime || '09:00 - 11:00 WIB',
      ticketCategory: row.ticketCategory || 'New Installation FTTH',

      statusWOAgent: row.statusWOAgent || 'Pending',
      statusWOInstaller: row.statusWOInstaller || 'Unassigned',
      statusWhatsApp: row.statusWhatsApp || 'not_prepared',

      contactorName: row.contactorName || (row as any).contractorName || 'PT Mitra Jaringan Solusi',
      contractorName: row.contractorName || row.contactorName || 'PT Mitra Jaringan Solusi',
      contractorId: row.contractorId || 'c-mjs',
      leaderName: row.leaderName || '',
      installerName: row.installerName || '',
      installerContact: row.installerContact || '',

      remarksAgent: row.remarksAgent || '',
      remarksWOInstaller: row.remarksWOInstaller || '',

      isArchived: false,
      isDeleted: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      updatedBy: currentUserName
    };

    rowsToCommit.push(newTicket);
    newlySaved++;
  });

  return {
    totalSourceRows: incomingRows.length,
    newlySaved,
    skippedExisting,
    duplicateInFile,
    conflictsCount: conflicts.length,
    invalidCount: invalidRows.length,
    failedStorageCount: 0,
    rowsToCommit,
    conflicts,
    invalidRows,
    duplicateRows
  };
}

/**
 * Deduplicates an array of tickets in memory strictly by normalized woNumber.
 * Always retains the newest version (by updatedAt or assigned technician).
 */
export function deduplicateTicketsInMemory(ticketList: Ticket[]): Ticket[] {
  if (!ticketList || ticketList.length <= 1) return ticketList || [];

  const seen = new Map<string, Ticket>();

  for (const t of ticketList) {
    if (!t) continue;
    const key = normalizeWoNumber(t.woNumber || (t as any).workOrderNumber) || t.id;
    if (!key) continue;

    if (!seen.has(key)) {
      seen.set(key, t);
    } else {
      const existing = seen.get(key)!;
      const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
      const newTime = new Date(t.updatedAt || t.createdAt || 0).getTime();

      // If existing has no installer but current one does, or current is newer/equal:
      if ((!existing.installerName && t.installerName) || newTime >= existingTime) {
        seen.set(key, { ...existing, ...t, id: t.id || existing.id });
      }
    }
  }

  return Array.from(seen.values());
}

export interface DuplicateAuditReport {
  totalExamined: number;
  totalValid: number;
  duplicatesFound: number;
  duplicatesCleaned: number;
  conflictsFound: number;
  manualReviewList: Array<{
    woNumber: string;
    reason: string;
    conflictingDocs: Array<{ id: string; customerName: string; customerPhone?: string }>;
  }>;
  failedCount: number;
  cleanedTicketList: Ticket[];
  duplicateDocIdsToDelete: string[];
  mergedMasterTickets: Ticket[];
  // 7 standard metrics matching prompt specifications
  totalInspected: number;
  totalDuplicatesDetected: number;
  totalDuplicatesCleaned: number;
  totalConflicts: number;
  totalManualReviewNeeded: number;
  totalFailed: number;
  conflictItems: Array<{ woNumber: string; reasons: string[] }>;
}

/**
 * Enterprise Duplicate Audit & Reconciliation Engine
 * Automatically audits all Work Orders, detects duplicate identities, evaluates data integrity,
 * safely merges critical histories into the master document, and isolates genuine duplicates for cleanup.
 */
export function auditAndCleanDuplicates(
  allTickets: Ticket[],
  onLog?: (action: string, entity: string, entityId: string, details: string) => void
): DuplicateAuditReport {
  const totalExamined = allTickets.length;
  const groups = new Map<string, Ticket[]>();

  // 1. Group by normalized canonical WO Number
  for (const t of allTickets) {
    if (!t) continue;
    const rawWo = t.woNumber || (t as any).workOrderNumber || (t as any).wo_no || '';
    const norm = normalizeWoNumber(rawWo);
    if (!norm) {
      // Empty WO number: treat each as individual record to protect against accidental mass deletion
      groups.set(`unidentified_${t.id || Math.random()}`, [t]);
      continue;
    }
    if (!groups.has(norm)) {
      groups.set(norm, []);
    }
    groups.get(norm)!.push(t);
  }

  let duplicatesFound = 0;
  let duplicatesCleaned = 0;
  let conflictsFound = 0;
  const manualReviewList: DuplicateAuditReport['manualReviewList'] = [];
  const duplicateDocIdsToDelete: string[] = [];
  const mergedMasterTickets: Ticket[] = [];
  const cleanedTicketList: Ticket[] = [];

  for (const [key, list] of groups.entries()) {
    if (list.length === 1) {
      cleanedTicketList.push(list[0]);
      continue;
    }

    // Duplicates found in this group
    const dupsInGroup = list.length - 1;
    duplicatesFound += dupsInGroup;

    // 2. Check for serious context conflict
    // If different customer names and different non-empty phone numbers, flag for review
    const uniqueCustNames = new Set(list.map(t => (t.customerName || t.endUserName || '').trim().toLowerCase()).filter(Boolean));
    const uniquePhones = new Set(list.map(t => (t.customerPhone || '').replace(/\D/g, '')).filter(p => p.length >= 8));

    if (uniqueCustNames.size > 1 && uniquePhones.size > 1) {
      conflictsFound++;
      manualReviewList.push({
        woNumber: key,
        reason: 'Konflik identitas: Dokumen memiliki nama pelanggan dan nomor telepon berbeda untuk WO yang sama.',
        conflictingDocs: list.map(t => ({
          id: t.id,
          customerName: t.customerName || t.endUserName || 'Tanpa Nama',
          customerPhone: t.customerPhone
        }))
      });
      // Retain all copies for manual admin inspection
      cleanedTicketList.push(...list);
      continue;
    }

    // 3. Score documents to pick the true Master Record
    let bestScore = -1;
    let masterIdx = 0;

    list.forEach((t, idx) => {
      let score = 0;
      if (t.statusWOInstaller === 'Completed') score += 15;
      else if (t.statusWOInstaller === 'Installed') score += 12;
      else if (t.statusWOInstaller === 'On Site' || t.statusWOInstaller === 'En Route') score += 10;
      else if (t.statusWOInstaller === 'Assigned') score += 8;

      if (t.technicalReport) score += 10;
      if (t.installerName && t.installerName.trim()) score += 6;
      if (t.statusWhatsApp === 'confirmed') score += 4;
      if (t.fdtCode || t.fatCode) score += 3;
      if (t.idCustomer || t.customerId) score += 2;
      if (t.remarksWOInstaller) score += 2;
      if (t.remarksAgent) score += 2;

      // Prefer canonical deterministic ID
      if (t.id && t.id.startsWith('wo_')) score += 1;

      // Timestamp bonus
      const ts = new Date(t.updatedAt || t.createdAt || 0).getTime();
      if (!isNaN(ts)) score += (ts / 1e13);

      if (score > bestScore) {
        bestScore = score;
        masterIdx = idx;
      }
    });

    const master = { ...list[masterIdx] };
    const duplicates = list.filter((_, idx) => idx !== masterIdx);

    // 4. Merge non-empty metadata from duplicates into master
    duplicates.forEach(dup => {
      if (!master.customerPhone && dup.customerPhone) master.customerPhone = dup.customerPhone;
      if (!master.idCustomer && (dup.idCustomer || dup.customerId)) master.idCustomer = (dup.idCustomer || dup.customerId) as string;
      if (!master.streetName && dup.streetName) master.streetName = dup.streetName;
      if (!master.clusterName && dup.clusterName) master.clusterName = dup.clusterName;
      if (!master.fdtCode && dup.fdtCode) master.fdtCode = dup.fdtCode;
      if (!master.fatCode && dup.fatCode) master.fatCode = dup.fatCode;
      if (!master.installerName && dup.installerName) {
        master.installerName = dup.installerName;
        master.installerContact = dup.installerContact;
      }
      if (!master.technicalReport && dup.technicalReport) master.technicalReport = dup.technicalReport;

      // Merge remarks if duplicate had extra info
      if (dup.remarksAgent && dup.remarksAgent !== master.remarksAgent) {
        master.remarksAgent = master.remarksAgent
          ? `${master.remarksAgent} | [Catatan Duplikat]: ${dup.remarksAgent}`
          : dup.remarksAgent;
      }
      if (dup.remarksWOInstaller && dup.remarksWOInstaller !== master.remarksWOInstaller) {
        master.remarksWOInstaller = master.remarksWOInstaller
          ? `${master.remarksWOInstaller} | [Laporan Duplikat]: ${dup.remarksWOInstaller}`
          : dup.remarksWOInstaller;
      }

      duplicateDocIdsToDelete.push(dup.id);
      duplicatesCleaned++;
    });

    master.updatedAt = new Date().toISOString();
    mergedMasterTickets.push(master);
    cleanedTicketList.push(master);

    if (onLog) {
      onLog(
        'Duplicate Cleaned & Merged',
        'ticket',
        master.id,
        `Membersihkan ${duplicates.length} duplikasi WO ${key}. Dokumen utama ID ${master.id} dipertahankan dengan data terlengkap.`
      );
    }
  }

  const totalValid = cleanedTicketList.length;
  const conflictItems = manualReviewList.map(m => ({
    woNumber: m.woNumber,
    reasons: [m.reason]
  }));

  return {
    totalExamined,
    totalValid,
    duplicatesFound,
    duplicatesCleaned,
    conflictsFound,
    manualReviewList,
    failedCount: 0,
    cleanedTicketList,
    duplicateDocIdsToDelete,
    mergedMasterTickets,
    // 7 prompt metrics
    totalInspected: totalExamined,
    totalDuplicatesDetected: duplicatesFound,
    totalDuplicatesCleaned: duplicatesCleaned,
    totalConflicts: conflictsFound,
    totalManualReviewNeeded: manualReviewList.length,
    totalFailed: 0,
    conflictItems
  };
}

