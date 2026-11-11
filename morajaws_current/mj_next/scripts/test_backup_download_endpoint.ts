import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const BASE_URL = 'http://localhost:3000';
const BACKUP_FILE = path.resolve(process.cwd(), 'morajaws_production_firestore_backup.json');
const TARGET_CHECKSUM = 'c4b0b42c78f634735f1eb361947e641d096e13b9d071d8654fa13bfb5b1ab876';
const TARGET_SIZE = 1055520;

interface TestResult {
  id: number;
  name: string;
  expected: string;
  actual: string;
  pass: boolean;
  details?: string;
}

const results: TestResult[] = [];

async function loginUser(username: string, password: string = '12345678'): Promise<{ token: string; role: string } | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      console.error(`Login failed for ${username}: HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    return { token: data.token, role: data.user?.role };
  } catch (err: any) {
    console.error(`Login error for ${username}:`, err.message);
    return null;
  }
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('TEST SUITE: GET /api/admin/backup/download (PHASE 9L-5)');
  console.log('================================================================\n');

  // Ensure server is up
  const healthRes = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  if (!healthRes || !healthRes.ok) {
    console.error('Server localhost:3000 belum siap.');
    process.exit(1);
  }

  // Verify initial backup file state
  const initialBuffer = fs.readFileSync(BACKUP_FILE);
  const initialHash = crypto.createHash('sha256').update(initialBuffer).digest('hex');
  if (initialHash !== TARGET_CHECKSUM || initialBuffer.length !== TARGET_SIZE) {
    console.error('File backup sumber korup sebelum pengujian!');
    process.exit(1);
  }
  console.log(`[PRE-FLIGHT] File sumber terverifikasi: ${initialBuffer.length} bytes, SHA-256: ${initialHash}\n`);

  // ---------------------------------------------------------------------------
  // TEST 1: Tanpa autentikasi -> HTTP 401
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Akses Tanpa Autentikasi ---');
  const res1 = await fetch(`${BASE_URL}/api/admin/backup/download`);
  const pass1 = res1.status === 401;
  const body1 = await res1.json().catch(() => ({}));
  results.push({
    id: 1,
    name: 'Akses tanpa autentikasi ditolak',
    expected: 'HTTP 401 (UNAUTHENTICATED)',
    actual: `HTTP ${res1.status} (${body1.code || 'NO_CODE'})`,
    pass: pass1,
    details: body1.error
  });
  console.log(`Result 1: [${pass1 ? 'PASS' : 'FAIL'}] Status ${res1.status}\n`);

  // ---------------------------------------------------------------------------
  // TEST 2: Pengguna non-Super Admin -> HTTP 403
  // ---------------------------------------------------------------------------
  console.log('--- TEST 2: Akses Pengguna Non-Super Admin (Leader / Dispatch) ---');
  const leaderAuth = await loginUser('leadermjs');
  if (!leaderAuth) throw new Error('Gagal login akun Leader');
  console.log(`Leader login OK: user role = ${leaderAuth.role}`);

  const res2 = await fetch(`${BASE_URL}/api/admin/backup/download`, {
    headers: { Authorization: `Bearer ${leaderAuth.token}` }
  });
  const pass2 = res2.status === 403;
  const body2 = await res2.json().catch(() => ({}));
  results.push({
    id: 2,
    name: 'Akses non-Super Admin ditolak',
    expected: 'HTTP 403 (REQUIRE_SUPER_ADMIN)',
    actual: `HTTP ${res2.status} (${body2.code || 'NO_CODE'})`,
    pass: pass2,
    details: body2.error
  });
  console.log(`Result 2: [${pass2 ? 'PASS' : 'FAIL'}] Status ${res2.status}\n`);

  // ---------------------------------------------------------------------------
  // TEST 3, 6, 7: Super Admin terautentikasi -> HTTP 200, Attachment, Ukuran, SHA-256
  // ---------------------------------------------------------------------------
  console.log('--- TEST 3, 6, 7: Akses Super Admin Terautentikasi & Unduhan Lengkap ---');
  const adminAuth = await loginUser('superadmin');
  if (!adminAuth) throw new Error('Gagal login akun Super Admin');
  console.log(`Super Admin login OK: user role = ${adminAuth.role}`);

  const res3 = await fetch(`${BASE_URL}/api/admin/backup/download`, {
    headers: { Authorization: `Bearer ${adminAuth.token}` }
  });

  const contentType = res3.headers.get('content-type');
  const contentDisp = res3.headers.get('content-disposition');
  const contentLength = res3.headers.get('content-length');

  const downloadedArrayBuffer = await res3.arrayBuffer();
  const downloadedBuffer = Buffer.from(downloadedArrayBuffer);
  const downloadedHash = crypto.createHash('sha256').update(downloadedBuffer).digest('hex');

  const pass3 = res3.status === 200 &&
    (contentType?.includes('application/json') ?? false) &&
    (contentDisp?.includes('attachment') ?? false) &&
    (contentDisp?.includes('morajaws_production_firestore_backup.json') ?? false);

  results.push({
    id: 3,
    name: 'Super Admin terautentikasi menerima file attachment',
    expected: 'HTTP 200 dengan header attachment & application/json',
    actual: `HTTP ${res3.status}, Type: ${contentType}, Disp: ${contentDisp}`,
    pass: pass3,
    details: `Content-Length header: ${contentLength}`
  });
  console.log(`Result 3: [${pass3 ? 'PASS' : 'FAIL'}] Status ${res3.status}`);

  // TEST 6: Ukuran file hasil unduhan
  const pass6 = downloadedBuffer.length === TARGET_SIZE;
  results.push({
    id: 6,
    name: 'Ukuran file hasil unduhan tepat 1.055.520 bytes',
    expected: `${TARGET_SIZE} bytes`,
    actual: `${downloadedBuffer.length} bytes`,
    pass: pass6
  });
  console.log(`Result 6: [${pass6 ? 'PASS' : 'FAIL'}] Ukuran: ${downloadedBuffer.length} bytes`);

  // TEST 7: SHA-256 file hasil unduhan
  const pass7 = downloadedHash === TARGET_CHECKSUM;
  results.push({
    id: 7,
    name: 'SHA-256 file unduhan cocok dengan target',
    expected: TARGET_CHECKSUM,
    actual: downloadedHash,
    pass: pass7
  });
  console.log(`Result 7: [${pass7 ? 'PASS' : 'FAIL'}] SHA-256: ${downloadedHash}\n`);

  // Also test direct query token download (?token=...)
  console.log('--- TEST 3B: Akses Super Admin via Query Parameter (?token=...) ---');
  const res3b = await fetch(`${BASE_URL}/api/admin/backup/download?token=${adminAuth.token}`);
  const downloadedBuffer3b = Buffer.from(await res3b.arrayBuffer());
  const pass3b = res3b.status === 200 && downloadedBuffer3b.length === TARGET_SIZE;
  console.log(`Result 3B (?token=...): [${pass3b ? 'PASS' : 'FAIL'}] Status ${res3b.status}, bytes: ${downloadedBuffer3b.length}\n`);

  // ---------------------------------------------------------------------------
  // TEST 4: File tidak ditemukan -> HTTP 404
  // ---------------------------------------------------------------------------
  console.log('--- TEST 4: Pengujian File Tidak Ditemukan ---');
  const backupBackupPath = BACKUP_FILE + '.safety_test_bak';
  try {
    fs.renameSync(BACKUP_FILE, backupBackupPath);
    const res4 = await fetch(`${BASE_URL}/api/admin/backup/download`, {
      headers: { Authorization: `Bearer ${adminAuth.token}` }
    });
    const body4 = await res4.json().catch(() => ({}));
    const pass4 = res4.status === 404 && body4.code === 'BACKUP_FILE_NOT_FOUND';
    results.push({
      id: 4,
      name: 'Penolakan saat file tidak ditemukan pada server',
      expected: 'HTTP 404 (BACKUP_FILE_NOT_FOUND)',
      actual: `HTTP ${res4.status} (${body4.code || 'NO_CODE'})`,
      pass: pass4,
      details: body4.error
    });
    console.log(`Result 4: [${pass4 ? 'PASS' : 'FAIL'}] Status ${res4.status}\n`);
  } finally {
    if (fs.existsSync(backupBackupPath)) {
      fs.renameSync(backupBackupPath, BACKUP_FILE);
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Checksum tidak cocok -> Unduhan dibatalkan (HTTP 409)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 5: Pengujian Checksum / Ukuran Tidak Cocok ---');
  try {
    fs.renameSync(BACKUP_FILE, backupBackupPath);
    // Write a dummy file with different size and checksum
    fs.writeFileSync(BACKUP_FILE, '{"corrupted": true, "tampered": "invalid_test"}');
    const res5 = await fetch(`${BASE_URL}/api/admin/backup/download`, {
      headers: { Authorization: `Bearer ${adminAuth.token}` }
    });
    const body5 = await res5.json().catch(() => ({}));
    const pass5 = res5.status === 409 && (body5.code === 'INTEGRITY_SIZE_MISMATCH' || body5.code === 'INTEGRITY_CHECKSUM_MISMATCH');
    results.push({
      id: 5,
      name: 'Pembatalan unduhan saat integritas ukuran/checksum tidak cocok',
      expected: 'HTTP 409 (INTEGRITY_SIZE_MISMATCH / INTEGRITY_CHECKSUM_MISMATCH)',
      actual: `HTTP ${res5.status} (${body5.code || 'NO_CODE'})`,
      pass: pass5,
      details: body5.error
    });
    console.log(`Result 5: [${pass5 ? 'PASS' : 'FAIL'}] Status ${res5.status}\n`);
  } finally {
    if (fs.existsSync(backupBackupPath)) {
      fs.copyFileSync(backupBackupPath, BACKUP_FILE);
      fs.unlinkSync(backupBackupPath);
    }
  }

  // Post-flight verification
  const postBuffer = fs.readFileSync(BACKUP_FILE);
  const postHash = crypto.createHash('sha256').update(postBuffer).digest('hex');
  if (postHash !== TARGET_CHECKSUM || postBuffer.length !== TARGET_SIZE) {
    console.error('FATAL: File backup sumber berubah setelah pengujian!');
    process.exit(1);
  }
  console.log(`[POST-FLIGHT] File sumber terverifikasi utuh: ${postBuffer.length} bytes, SHA-256: ${postHash}\n`);

  // ---------------------------------------------------------------------------
  // PRINT SUMMARY
  // ---------------------------------------------------------------------------
  console.log('================================================================');
  console.log('RINGKASAN HASIL PENGUJIAN');
  console.log('================================================================');
  let allPass = true;
  for (const r of results) {
    console.log(`[TEST ${r.id}] [${r.pass ? 'PASS' : 'FAIL'}] ${r.name}`);
    console.log(`         Ekspektasi: ${r.expected}`);
    console.log(`         Hasil:      ${r.actual}`);
    if (r.details) console.log(`         Detail:     ${r.details}`);
    if (!r.pass) allPass = false;
  }
  console.log('================================================================');
  console.log(`TOTAL TEST: ${results.length} | PASS: ${results.filter(r => r.pass).length} | FAIL: ${results.filter(r => !r.pass).length}`);
  console.log('================================================================');

  process.exit(allPass ? 0 : 1);
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
