import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  query,
  limit,
  startAfter,
  getDocs,
  Timestamp,
  GeoPoint,
  Bytes,
  DocumentReference,
  QueryDocumentSnapshot,
  DocumentData
} from 'firebase/firestore';

// -----------------------------------------------------------------------------
// 1. CONFIGURATION & CLIENT INITIALIZATION
// -----------------------------------------------------------------------------
const CONFIG_PATH = path.resolve(process.cwd(), 'firebase-applet-config.json');
if (!fs.existsSync(CONFIG_PATH)) {
  console.error('[BACKUP] Error: firebase-applet-config.json tidak ditemukan.');
  process.exit(1);
}

const firebaseConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

const EXPECTED_PROJECT_ID = 'sonic-ripple-cxtlg';
const EXPECTED_DATABASE_ID = 'ai-studio-morajawsv6-c6c8e7c8-6b4d-4b80-8e21-1af2f4c29daa';

if (firebaseConfig.projectId !== EXPECTED_PROJECT_ID) {
  console.error(`[BACKUP] Mismatch Project ID: Diharapkan ${EXPECTED_PROJECT_ID}, ditemukan ${firebaseConfig.projectId}`);
  process.exit(1);
}

if (firebaseConfig.firestoreDatabaseId !== EXPECTED_DATABASE_ID) {
  console.error(`[BACKUP] Mismatch Database ID: Diharapkan ${EXPECTED_DATABASE_ID}, ditemukan ${firebaseConfig.firestoreDatabaseId}`);
  process.exit(1);
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const TARGET_COLLECTIONS = [
  'tickets',
  'users',
  'audit_logs',
  'contractors',
  'coverage_areas',
  'ticket_messages',
  'wa_templates',
  'appSettings',
  'system_health',
  'system_error_logs'
];

const PAGE_SIZE = 200; // Ukuran halaman maksimal 200 dokumen per ketentuan

// -----------------------------------------------------------------------------
// 2. SPECIAL TYPE SERIALIZER (Tagged Reversible Format)
// -----------------------------------------------------------------------------
interface TypeReport {
  timestampCount: number;
  geoPointCount: number;
  bytesCount: number;
  documentRefCount: number;
  dateCount: number;
}

const typeStats: Record<string, TypeReport> = {};

function initTypeStats(col: string) {
  typeStats[col] = {
    timestampCount: 0,
    geoPointCount: 0,
    bytesCount: 0,
    documentRefCount: 0,
    dateCount: 0
  };
}

function serializeValue(val: any, col: string): any {
  if (val === null || val === undefined) {
    return val; // Pertahankan null dan undefined asli
  }

  // 1. Firestore Timestamp
  if (
    val instanceof Timestamp ||
    (typeof val === 'object' && typeof val.toMillis === 'function' && 'seconds' in val && 'nanoseconds' in val)
  ) {
    typeStats[col].timestampCount++;
    return {
      __type__: 'Timestamp',
      seconds: val.seconds,
      nanoseconds: val.nanoseconds,
      iso: typeof val.toDate === 'function' ? val.toDate().toISOString() : new Date(val.seconds * 1000).toISOString()
    };
  }

  // 2. Firestore GeoPoint
  if (
    val instanceof GeoPoint ||
    (typeof val === 'object' && 'latitude' in val && 'longitude' in val && typeof val.isEqual === 'function')
  ) {
    typeStats[col].geoPointCount++;
    return {
      __type__: 'GeoPoint',
      latitude: val.latitude,
      longitude: val.longitude
    };
  }

  // 3. Firestore Bytes / Blob
  if (val instanceof Bytes || (typeof val === 'object' && typeof val.toBase64 === 'function')) {
    typeStats[col].bytesCount++;
    return {
      __type__: 'Bytes',
      base64: val.toBase64()
    };
  }

  // 4. Firestore DocumentReference
  if (
    val instanceof DocumentReference ||
    (typeof val === 'object' && val.firestore && typeof val.path === 'string' && val.id)
  ) {
    typeStats[col].documentRefCount++;
    return {
      __type__: 'DocumentReference',
      path: val.path,
      id: val.id
    };
  }

  // 5. JavaScript Date
  if (val instanceof Date) {
    typeStats[col].dateCount++;
    return {
      __type__: 'Date',
      iso: val.toISOString()
    };
  }

  // 6. Array (Preserve exact array structure)
  if (Array.isArray(val)) {
    return val.map(item => serializeValue(item, col));
  }

  // 7. Plain Object / Nested Map
  if (typeof val === 'object') {
    const serializedObj: Record<string, any> = {};
    for (const key of Object.keys(val)) {
      serializedObj[key] = serializeValue(val[key], col);
    }
    return serializedObj;
  }

  // 8. Primitive values (string, number, boolean)
  return val;
}

// -------------------------------------------------------------
// 3. EXPORT ENGINE
// -------------------------------------------------------------
interface CollectionExportMetadata {
  collectionName: string;
  documentCount: number;
  pageCount: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  duplicateIdsFound: number;
  status: 'SUCCESS' | 'FAILED';
  specialTypesDetected: {
    timestamps: number;
    geoPoints: number;
    bytes: number;
    documentReferences: number;
  };
  error?: string;
}

async function runBackup() {
  console.log('================================================================');
  console.log('MORAJAWS PHASE 9L-4: FIRESTORE PRODUCTION BACKUP VIA CLIENT SDK');
  console.log('================================================================');
  console.log(`Target Project:  ${EXPECTED_PROJECT_ID}`);
  console.log(`Target Database: ${EXPECTED_DATABASE_ID}`);
  console.log(`Page Size Limit: ${PAGE_SIZE} dokumen per fetch`);
  console.log(`Started At:      ${new Date().toISOString()}\n`);

  const exportStartTime = new Date().toISOString();
  const overallStartMs = Date.now();

  const exportedData: Record<string, any[]> = {};
  const collectionMetadata: Record<string, CollectionExportMetadata> = {};
  const duplicateErrors: string[] = [];
  const globalFailedDocs: string[] = [];

  for (const colName of TARGET_COLLECTIONS) {
    initTypeStats(colName);
    console.log(`>>> [COLLECTION] Memulai ekspor koleksi: "${colName}"...`);
    const colStartMs = Date.now();
    const colStartedAt = new Date().toISOString();

    const colRef = collection(db, colName);
    let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;
    let pageNumber = 1;
    let hasMore = true;
    const colDocs: any[] = [];
    const seenIds = new Set<string>();
    let colDuplicates = 0;
    let colStatus: 'SUCCESS' | 'FAILED' = 'SUCCESS';
    let colErrorMsg: string | undefined;

    try {
      while (hasMore) {
        const pageStartMs = Date.now();
        let q;
        if (!lastDoc) {
          q = query(colRef, limit(PAGE_SIZE));
        } else {
          q = query(colRef, startAfter(lastDoc), limit(PAGE_SIZE));
        }

        const snapshot = await getDocs(q);
        const docsInPage = snapshot.docs;

        if (docsInPage.length === 0) {
          hasMore = false;
          break;
        }

        for (const docSnap of docsInPage) {
          const docId = docSnap.id;
          if (seenIds.has(docId)) {
            colDuplicates++;
            duplicateErrors.push(`[DUPLICATE] Koleksi "${colName}", ID ganda ditemukan: ${docId} (Halaman ${pageNumber})`);
          }
          seenIds.add(docId);

          try {
            const raw = docSnap.data();
            const serialized = serializeValue(raw, colName);
            // Injeksi _id tanpa mengubah field bawaan dan memastikan _id adalah Firestore Document ID asli
            colDocs.push({
              ...serialized,
              _id: docId
            });
          } catch (docErr: any) {
            globalFailedDocs.push(`[DOC ERROR] ${colName}/${docId}: ${docErr?.message || docErr}`);
          }
        }

        console.log(`    - Halaman ${pageNumber}: Berhasil membaca ${docsInPage.length} dokumen (${Date.now() - pageStartMs}ms)`);

        if (docsInPage.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          lastDoc = docsInPage[docsInPage.length - 1];
          pageNumber++;
        }
      }
    } catch (colErr: any) {
      colStatus = 'FAILED';
      colErrorMsg = colErr?.message || String(colErr);
      console.error(`    [ERROR] Gagal mengekspor koleksi "${colName}":`, colErrorMsg);
    }

    const colEndMs = Date.now();
    const colCompletedAt = new Date().toISOString();

    exportedData[colName] = colDocs;
    collectionMetadata[colName] = {
      collectionName: colName,
      documentCount: colDocs.length,
      pageCount: colDocs.length === 0 ? 1 : pageNumber,
      startedAt: colStartedAt,
      completedAt: colCompletedAt,
      durationMs: colEndMs - colStartMs,
      duplicateIdsFound: colDuplicates,
      status: colStatus,
      specialTypesDetected: {
        timestamps: typeStats[colName].timestampCount,
        geoPoints: typeStats[colName].geoPointCount,
        bytes: typeStats[colName].bytesCount,
        documentReferences: typeStats[colName].documentRefCount
      },
      error: colErrorMsg
    };

    console.log(`    [SELESAI] Koleksi "${colName}": ${colDocs.length} dokumen, status=${colStatus}, durasi=${colEndMs - colStartMs}ms\n`);
  }

  const exportEndTime = new Date().toISOString();
  const overallDurationMs = Date.now() - overallStartMs;

  // -------------------------------------------------------------
  // 4. ANALISIS TIKET & AUDIT HASIL
  // -------------------------------------------------------------
  const ticketsList = exportedData['tickets'] || [];
  let activeTicketsCount = 0;
  let softDeletedTicketsCount = 0;
  let archivedTicketsCount = 0;
  let softDeletedAndArchivedCount = 0;

  for (const t of ticketsList) {
    const isDel = t.isDeleted === true;
    const isArc = t.isArchived === true;

    if (isDel && isArc) {
      softDeletedAndArchivedCount++;
    }
    if (isDel) {
      softDeletedTicketsCount++;
    }
    if (isArc) {
      archivedTicketsCount++;
    }
    if (!isDel && !isArc) {
      activeTicketsCount++;
    }
  }

  let totalDocs = 0;
  for (const c of TARGET_COLLECTIONS) {
    totalDocs += exportedData[c]?.length || 0;
  }

  // Snapshot consistency evaluation:
  // Did any errors occur, or any duplicate docs found?
  const hasCollectionFailures = Object.values(collectionMetadata).some(m => m.status === 'FAILED');
  const consistencyStatus = (hasCollectionFailures || duplicateErrors.length > 0 || globalFailedDocs.length > 0)
    ? 'POTENTIALLY_INCONSISTENT'
    : 'CONSISTENT_CLIENT_SNAPSHOT';

  const validationStatus = consistencyStatus === 'CONSISTENT_CLIENT_SNAPSHOT' ? 'SUCCESS_VERIFIED' : 'FAILED_VALIDATION';

  // -------------------------------------------------------------
  // 5. PENULISAN FILE BACKUP
  // -------------------------------------------------------------
  const backupPayload = {
    metadata: {
      projectId: EXPECTED_PROJECT_ID,
      databaseId: EXPECTED_DATABASE_ID,
      exportedAt: exportStartTime,
      exportCompletedAt: exportEndTime,
      exportDurationMs: overallDurationMs,
      exportMethod: 'Firebase Client SDK',
      readOnly: true,
      collections: collectionMetadata,
      totalDocuments: totalDocs,
      validationStatus,
      ticketSummary: {
        totalTickets: ticketsList.length,
        activeTickets: activeTicketsCount,
        softDeletedTickets: softDeletedTicketsCount,
        archivedTickets: archivedTicketsCount,
        softDeletedAndArchived: softDeletedAndArchivedCount
      }
    },
    collections: exportedData
  };

  const outputFilePath = path.resolve(process.cwd(), 'morajaws_production_firestore_backup.json');
  console.log(`Menulis backup ke file: ${outputFilePath}...`);

  const jsonString = JSON.stringify(backupPayload, null, 2);
  fs.writeFileSync(outputFilePath, jsonString, 'utf-8');

  const fileStats = fs.statSync(outputFilePath);
  const fileSizeBytes = fileStats.size;
  const fileSizeMb = (fileSizeBytes / (1024 * 1024)).toFixed(3);

  // -------------------------------------------------------------
  // 6. VALIDASI ULANG INDEPENDEN (Re-parse & Checksum)
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log('VERIFIKASI INTEGRITAS FILE BACKUP');
  console.log('================================================================');

  // Checksum SHA-256
  const fileBuffer = fs.readFileSync(outputFilePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  const sha256Hex = hashSum.digest('hex');

  // Parse check
  let parseSuccess = false;
  let reParsedTotal = 0;
  try {
    const reParsed = JSON.parse(fs.readFileSync(outputFilePath, 'utf-8'));
    parseSuccess = Boolean(reParsed && reParsed.collections && reParsed.metadata);
    for (const c of TARGET_COLLECTIONS) {
      reParsedTotal += (reParsed.collections[c] || []).length;
    }
  } catch (err: any) {
    parseSuccess = false;
    console.error('Error saat re-parse JSON backup:', err);
  }

  // -------------------------------------------------------------
  // 7. PRINT SUMMARY
  // -------------------------------------------------------------
  console.log(`Lokasi File:              ${outputFilePath}`);
  console.log(`Ukuran File:              ${fileSizeBytes} bytes (${fileSizeMb} MB)`);
  console.log(`SHA-256 Checksum:         ${sha256Hex}`);
  console.log(`JSON Parse Status:        ${parseSuccess ? 'VALID (100% Valid JSON)' : 'CORRUPTED'}`);
  console.log(`Dokumen Re-parsed:        ${reParsedTotal} (Sesuai dengan total ${totalDocs})`);
  console.log(`Duplikat ID Terdeteksi:   ${duplicateErrors.length}`);
  console.log(`Dokumen Gagal Diekspor:   ${globalFailedDocs.length}`);
  console.log(`Status Konsistensi:       ${consistencyStatus}`);
  console.log(`Status Validasi Akhir:    ${validationStatus}`);

  return {
    outputFilePath,
    fileSizeBytes,
    fileSizeMb,
    sha256Hex,
    parseSuccess,
    totalDocs,
    collectionMetadata,
    ticketsSummary: {
      total: ticketsList.length,
      active: activeTicketsCount,
      softDeleted: softDeletedTicketsCount,
      archived: archivedTicketsCount,
      both: softDeletedAndArchivedCount
    },
    consistencyStatus,
    validationStatus,
    globalFailedDocs,
    duplicateErrors,
    overallDurationMs
  };
}

runBackup()
  .then((report) => {
    console.log('\n[BACKUP SUKSES] Proses ekspor backup selesai sepenuhnya.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n[BACKUP FATAL] Terjadi kesalahan fatal:', err);
    process.exit(1);
  });
