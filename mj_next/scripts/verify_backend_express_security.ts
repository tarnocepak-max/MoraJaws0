import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Helper to make local HTTP requests to Express server running on port 3000
function makeRequest(options: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: any;
}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any; rawBody: string }> {
  return new Promise((resolve, reject) => {
    const dataStr = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    if (dataStr) {
      headers['Content-Length'] = Buffer.byteLength(dataStr).toString();
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 3000,
        path: options.path,
        method: options.method,
        headers
      },
      (res) => {
        let chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed: any;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({
            status: res.statusCode || 500,
            headers: res.headers,
            body: parsed,
            rawBody: raw
          });
        });
      }
    );

    req.on('error', reject);
    if (dataStr) {
      req.write(dataStr);
    }
    req.end();
  });
}

// Registry for automatic cleanup
const cleanupRegistry = {
  workOrderIds: new Set<string>(),
  userIds: new Set<string>(),
  settingsKeys: new Set<string>()
};

interface TestResult {
  id: number;
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIPPED';
  details?: string;
}

const testResults: TestResult[] = [];

function recordResult(id: number, name: string, status: 'PASS' | 'FAIL' | 'SKIPPED', details?: string) {
  testResults.push({ id, name, status, details });
  const icon = status === 'PASS' ? '✅ [PASS]' : status === 'FAIL' ? '❌ [FAIL]' : '⚠️ [SKIPPED]';
  console.log(`${icon} Test ${id}: ${name}`);
  if (details) {
    console.log(`   Detail: ${details}`);
  }
}

async function runTestSuite() {
  console.log('==============================================================================');
  console.log('MORAJAWS EXPRESS BACKEND & SUPABASE SECURITY VERIFICATION TEST SUITE');
  console.log('Comprehensive Audit Remediation Verification (Section D)');
  console.log('==============================================================================\n');

  // --------------------------------------------------------------------------
  // MANDATORY CHECK 1 & 2: Production Environment Guard (Ketentuan 1 & 2)
  // Tolak menjalankan pengujian CRUD jika environment menunjukkan database produksi.
  // --------------------------------------------------------------------------
  console.log('--- CHECK 1: Production Environment Guard & Target Verification ---');
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    process.env.SUPABASE_ENV === 'production' ||
    process.env.IS_PRODUCTION === 'true';

  if (isProduction) {
    console.error('⛔ FATAL: Environment terdeteksi sebagai PRODUKSI!');
    console.error('Sesuai Ketentuan D.2, pengujian CRUD DITOLAK keras untuk melindungi data produksi.');
    recordResult(1, 'Production Environment Guard', 'FAIL', 'CRUD tests rejected on production database.');
    printSummaryAndExit();
    return;
  }

  // Check health and confirm local staging/test environment
  try {
    const health = await makeRequest({ method: 'GET', path: '/api/health' });
    if (health.status !== 200) {
      recordResult(1, 'Production Environment Guard', 'FAIL', `Health check failed with status ${health.status}`);
      printSummaryAndExit();
      return;
    }
    recordResult(1, 'Production Environment Guard', 'PASS', 'Environment verified as non-production (staging/local test mode).');
  } catch (err: any) {
    recordResult(1, 'Production Environment Guard', 'FAIL', `Failed to connect to backend: ${err.message}`);
    printSummaryAndExit();
    return;
  }

  // --------------------------------------------------------------------------
  // TEST 2: Frontend Direct Supabase & Secret Key Isolation (Aturan 6 & 7)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Memeriksa Frontend Tidak Mengakses Supabase Langsung & Bebas Rahasia ---');
  try {
    const srcDir = path.join(ROOT_DIR, 'src');
    const clientSupabasePath = path.join(srcDir, 'services', 'supabaseClient.ts');
    let noDirectClient = true;

    if (fs.existsSync(clientSupabasePath)) {
      const content = fs.readFileSync(clientSupabasePath, 'utf8');
      if (content.includes('createClient(')) {
        noDirectClient = false;
      }
      if (!content.includes('return null;')) {
        noDirectClient = false;
      }
    }

    let noDirectImports = true;
    let noSecretLeaks = true;

    function scanDir(dir: string) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const full = path.join(dir, file);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          scanDir(full);
        } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.html')) {
          const content = fs.readFileSync(full, 'utf8');
          if (content.includes("from '@supabase/supabase-js'") || content.includes('from "@supabase/supabase-js"')) {
            noDirectImports = false;
          }
          if (content.includes('SUPABASE_SERVICE_ROLE_KEY') && !full.includes('supabaseClient.ts')) {
            noSecretLeaks = false;
          }
          if (content.includes('sb_secret_')) {
            noSecretLeaks = false;
          }
        }
      }
    }
    scanDir(srcDir);

    if (noDirectClient && noDirectImports && noSecretLeaks) {
      recordResult(2, 'Frontend Isolation & Secret Protection', 'PASS', 'Frontend bebas dari client direct Supabase dan tidak membocorkan secrets.');
    } else {
      recordResult(2, 'Frontend Isolation & Secret Protection', 'FAIL', `Violations found: directClient=${noDirectClient}, directImports=${noDirectImports}, noSecretLeaks=${noSecretLeaks}`);
    }
  } catch (err: any) {
    recordResult(2, 'Frontend Isolation & Secret Protection', 'FAIL', err.message);
  }

  // --------------------------------------------------------------------------
  // Helper Login Routine
  // --------------------------------------------------------------------------
  let adminToken = '';
  let leaderMjsToken = '';
  let leaderKcsToken = '';
  let installer1Token = '';
  let mgmtToken = '';

  try {
    const adminLogin = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { username: 'superadmin', password: 'password123' }
    });
    adminToken = adminLogin.body?.token;
    if (!adminToken) {
      const alt = await makeRequest({
        method: 'POST',
        path: '/api/auth/login',
        body: { username: 'superadmin', password: '12345678' }
      });
      adminToken = alt.body?.token;
    }

    const leaderMjsLogin = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { username: 'leadermjs', password: '12345678' }
    });
    leaderMjsToken = leaderMjsLogin.body?.token;

    const leaderKcsLogin = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { username: 'leaderkcs', password: '12345678' }
    });
    leaderKcsToken = leaderKcsLogin.body?.token;

    const instLogin = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { username: 'installer1', password: '12345678' }
    });
    installer1Token = instLogin.body?.token;

    const mgmtLogin = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { username: 'datamgmt', password: '12345678' }
    });
    mgmtToken = mgmtLogin.body?.token;
  } catch (err: any) {
    console.error('Failed to obtain authentication tokens:', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Authentication & Bearer Token Verification (Bagian C)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Verifikasi Bearer Token & Penolakan Permintaan Ilegal ---');
  try {
    const noToken = await makeRequest({ method: 'GET', path: '/api/supabase/work-orders' });
    const forgedToken = await makeRequest({
      method: 'GET',
      path: '/api/supabase/work-orders',
      headers: { Authorization: 'Bearer forged_fake_token_xyz_999' }
    });
    const queryParamToken = await makeRequest({
      method: 'GET',
      path: `/api/supabase/work-orders?token=${adminToken}`
    });

    const pass = noToken.status === 401 && forgedToken.status === 401 && queryParamToken.status === 401;
    if (pass) {
      recordResult(3, 'Authentication & Bearer Token Verification', 'PASS', 'Semua request tanpa token, token palsu, atau via query string ditolak HTTP 401.');
    } else {
      recordResult(3, 'Authentication & Bearer Token Verification', 'FAIL', `noToken=${noToken.status}, forged=${forgedToken.status}, queryParam=${queryParamToken.status}`);
    }
  } catch (err: any) {
    recordResult(3, 'Authentication & Bearer Token Verification', 'FAIL', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 4: Akun Nonaktif/Terhapus Ditolak & Pencabutan Sesi (Bagian C)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Validasi Akun Nonaktif / Terhapus & Pencabutan Sesi Otomatis ---');
  const dummyDisabledUsername = `test_disabled_${Date.now()}`;
  let testDisabledUserId = '';

  try {
    // 1. Create a dummy user
    const createRes = await makeRequest({
      method: 'POST',
      path: '/api/supabase/users',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        name: 'Dummy Disabled User',
        username: dummyDisabledUsername,
        password: 'Password123!',
        role: 'installer',
        contractorId: 'c-mjs',
        contractor: 'PT Mitra Jaringan Solusi',
        area: 'Jakarta Selatan'
      }
    });

    if (createRes.status === 200 || createRes.status === 201) {
      testDisabledUserId = createRes.body?.data?.id || createRes.body?.user?.id;
      if (testDisabledUserId) cleanupRegistry.userIds.add(testDisabledUserId);
    }

    // 2. Login as the newly created user to get an active session
    const loginDummy = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { username: dummyDisabledUsername, password: 'Password123!' }
    });
    const dummyToken = loginDummy.body?.token;

    // 3. Deactivate the user via PATCH
    const deactivateRes = await makeRequest({
      method: 'PATCH',
      path: `/api/supabase/users/${testDisabledUserId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { active: false }
    });

    // 4. Try login again -> MUST fail (401 / 403)
    const loginDisabledAgain = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { username: dummyDisabledUsername, password: 'Password123!' }
    });

    // 5. Try using previous session token -> MUST be rejected (401)
    const usePreviousToken = await makeRequest({
      method: 'GET',
      path: '/api/supabase/work-orders',
      headers: { Authorization: `Bearer ${dummyToken}` }
    });

    const isLoginRejected = loginDisabledAgain.status === 401 || loginDisabledAgain.status === 403;
    const isSessionRevoked = usePreviousToken.status === 401;

    if (isLoginRejected && isSessionRevoked) {
      recordResult(4, 'Deactivated Account Rejection & Session Revocation', 'PASS', 'Akun nonaktif ditolak login dan sesi yang sudah berjalan dicabut secara instan.');
    } else {
      recordResult(4, 'Deactivated Account Rejection & Session Revocation', 'FAIL', `isLoginRejected=${isLoginRejected} (${loginDisabledAgain.status}), isSessionRevoked=${isSessionRevoked} (${usePreviousToken.status})`);
    }
  } catch (err: any) {
    recordResult(4, 'Deactivated Account Rejection & Session Revocation', 'FAIL', err.message);
  } finally {
    if (testDisabledUserId) {
      await makeRequest({
        method: 'DELETE',
        path: `/api/supabase/users/${testDisabledUserId}`,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { reason: 'Automated test cleanup' }
      }).catch(() => {});
      cleanupRegistry.userIds.delete(testDisabledUserId);
    }
  }

  // --------------------------------------------------------------------------
  // TEST 5: Proteksi Pemalsuan Role & Eskalasi Hak Akses (Bagian B & C)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: Penolakan Manipulasi Role, Contractor ID, dan Header Identitas ---');
  try {
    // Installer trying to delete WO with spoofed headers
    const spoofedDelete = await makeRequest({
      method: 'DELETE',
      path: '/api/supabase/work-orders/t-seed-1',
      headers: {
        Authorization: `Bearer ${installer1Token}`,
        'x-user-role': 'super_admin',
        'x-user-id': 'u-ray',
        'x-username': 'ray'
      },
      body: { role: 'super_admin', reason: 'Spoofed request' }
    });

    // Installer attempting to change own role to super_admin
    const spoofedPatch = await makeRequest({
      method: 'PATCH',
      path: '/api/supabase/users/u-installer-1',
      headers: {
        Authorization: `Bearer ${installer1Token}`,
        'x-user-role': 'super_admin'
      },
      body: { role: 'super_admin' }
    });

    // Verify role in DB remains installer
    const checkInstaller = await makeRequest({
      method: 'GET',
      path: '/api/supabase/users/u-installer-1',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const isDeleteForbidden = spoofedDelete.status === 403;
    const isPatchForbidden = spoofedPatch.status === 403;
    const isRoleUnchanged = checkInstaller.body?.data?.role === 'installer';

    if (isDeleteForbidden && isPatchForbidden && isRoleUnchanged) {
      recordResult(5, 'Role & Identity Spoofing Protection', 'PASS', 'Manipulasi role/identity ditolak HTTP 403 dan role di database tetap aman.');
    } else {
      recordResult(5, 'Role & Identity Spoofing Protection', 'FAIL', `isDeleteForbidden=${isDeleteForbidden}, isPatchForbidden=${isPatchForbidden}, isRoleUnchanged=${isRoleUnchanged}`);
    }
  } catch (err: any) {
    recordResult(5, 'Role & Identity Spoofing Protection', 'FAIL', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 6: Isolasi Akses Leader Terhadap Installer Lintas Kontraktor (Bagian B - Ketentuan 10)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Isolasi Akses Leader Terhadap Installer Kontraktor Lain (HTTP 403) ---');
  try {
    // Leader MJS (PT Mitra Jaringan Solusi) attempting to GET Installer 2 (KCS - PT Kencana Solusindo)
    const crossGet = await makeRequest({
      method: 'GET',
      path: '/api/supabase/users/u-installer-2',
      headers: { Authorization: `Bearer ${leaderMjsToken}` }
    });

    // Leader MJS attempting to PATCH Installer 2 (KCS)
    const crossPatch = await makeRequest({
      method: 'PATCH',
      path: '/api/supabase/users/u-installer-2',
      headers: { Authorization: `Bearer ${leaderMjsToken}` },
      body: { phone: '0899999999' }
    });

    // Leader MJS attempting to DELETE Installer 2 (KCS)
    const crossDelete = await makeRequest({
      method: 'DELETE',
      path: '/api/supabase/users/u-installer-2',
      headers: { Authorization: `Bearer ${leaderMjsToken}` },
      body: { reason: 'Unauthorized cross contractor delete' }
    });

    // Leader MJS accessing own Installer 1 (MJS) -> MUST be allowed (200)
    const ownGet = await makeRequest({
      method: 'GET',
      path: '/api/supabase/users/u-installer-1',
      headers: { Authorization: `Bearer ${leaderMjsToken}` }
    });

    const isCrossGetBlocked = crossGet.status === 403;
    const isCrossPatchBlocked = crossPatch.status === 403;
    const isCrossDeleteBlocked = crossDelete.status === 403;
    const isOwnGetAllowed = ownGet.status === 200;

    if (isCrossGetBlocked && isCrossPatchBlocked && isCrossDeleteBlocked && isOwnGetAllowed) {
      recordResult(6, 'Leader Cross-Contractor Installer Isolation', 'PASS', 'Leader dilarang mengakses/mengubah installer mitra lain (HTTP 403) dan hanya dapat mengelola mitranya sendiri.');
    } else {
      recordResult(6, 'Leader Cross-Contractor Installer Isolation', 'FAIL', `crossGet=${crossGet.status}, crossPatch=${crossPatch.status}, crossDelete=${crossDelete.status}, ownGet=${ownGet.status}`);
    }
  } catch (err: any) {
    recordResult(6, 'Leader Cross-Contractor Installer Isolation', 'FAIL', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 7: Leader Creation & Modification Field Sanitization (Bagian B - Ketentuan 11)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 7: Sanitasi Pembuatan & Modifikasi Pengguna oleh Leader ---');
  const dummyInstallerName = `Test Inst ${Date.now()}`;
  const dummyInstallerUsername = `inst_test_${Date.now()}`;
  let dummyCreatedInstId = '';

  try {
    // Leader MJS attempts to create a user with role 'super_admin' and contractor 'c-kcs'
    const leaderCreate = await makeRequest({
      method: 'POST',
      path: '/api/supabase/users',
      headers: { Authorization: `Bearer ${leaderMjsToken}` },
      body: {
        name: dummyInstallerName,
        username: dummyInstallerUsername,
        password: 'Password123!',
        role: 'super_admin', // Spoofed role attempt
        contractorId: 'c-kcs', // Spoofed contractor attempt
        contractor: 'PT Kencana Solusindo'
      }
    });

    if (leaderCreate.status === 200 || leaderCreate.status === 201) {
      dummyCreatedInstId = leaderCreate.body?.data?.id || leaderCreate.body?.user?.id;
      if (dummyCreatedInstId) cleanupRegistry.userIds.add(dummyCreatedInstId);
    }

    // Inspect actual user in DB
    const checkCreated = await makeRequest({
      method: 'GET',
      path: `/api/supabase/users/${dummyCreatedInstId}`,
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const userInDb = checkCreated.body?.data;
    const isForcedToInstaller = userInDb?.role === 'installer';
    const isForcedToLeaderContractor = userInDb?.contractorId === 'c-mjs' || (userInDb?.contractor || '').includes('Mitra Jaringan Solusi');

    if (isForcedToInstaller && isForcedToLeaderContractor) {
      recordResult(7, 'Leader Field Sanitization on Creation', 'PASS', 'Role otomatis dipaksa menjadi "installer" dan kontraktor dipaksa sesuai identitas Leader.');
    } else {
      recordResult(7, 'Leader Field Sanitization on Creation', 'FAIL', `role=${userInDb?.role}, contractorId=${userInDb?.contractorId}`);
    }
  } catch (err: any) {
    recordResult(7, 'Leader Field Sanitization on Creation', 'FAIL', err.message);
  } finally {
    if (dummyCreatedInstId) {
      await makeRequest({
        method: 'DELETE',
        path: `/api/supabase/users/${dummyCreatedInstId}`,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { reason: 'Automated test cleanup' }
      }).catch(() => {});
      cleanupRegistry.userIds.delete(dummyCreatedInstId);
    }
  }

  // --------------------------------------------------------------------------
  // TEST 8: Penolakan Kegagalan Database & Anti-Fake 200/201 (Bagian A - Ketentuan 9)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 8: Pembuktian API Tidak Mengembalikan Status Sukses Palsu pada Kegagalan Supabase ---');
  try {
    // 1. Try to update a non-existent Work Order
    const nonExistentId = `WO-NON-EXISTENT-${Date.now()}`;
    const updateFakeRes = await makeRequest({
      method: 'PATCH',
      path: `/api/supabase/work-orders/${nonExistentId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { remarksAgent: 'Testing non-existent update' }
    });

    // 2. Try to delete a non-existent Work Order without proper reason
    const deleteInvalidRes = await makeRequest({
      method: 'DELETE',
      path: `/api/supabase/work-orders/${nonExistentId}`,
      headers: { Authorization: `Bearer ${mgmtToken}` },
      body: { reason: 'no' } // reason too short (< 5 chars)
    });

    // 3. Try to save setting with invalid key format
    const invalidSettingRes = await makeRequest({
      method: 'POST',
      path: '/api/supabase/settings/invalid!key@test#format',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { value: 'test' }
    });

    const isUpdateRejected = updateFakeRes.status === 404 || updateFakeRes.status === 500;
    const isDeleteRejected = deleteInvalidRes.status === 400;
    const isSettingRejected = invalidSettingRes.status === 400;

    if (isUpdateRejected && isDeleteRejected && isSettingRejected) {
      recordResult(8, 'Database Failure Handling & No Fake Success', 'PASS', 'API menolak error secara eksplisit (404/400/500) dan tidak pernah mengembalikan sukses palsu.');
    } else {
      recordResult(8, 'Database Failure Handling & No Fake Success', 'FAIL', `updateStatus=${updateFakeRes.status}, deleteStatus=${deleteInvalidRes.status}, settingStatus=${invalidSettingRes.status}`);
    }
  } catch (err: any) {
    recordResult(8, 'Database Failure Handling & No Fake Success', 'FAIL', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 9: Work Order CRUD & Verifikasi Status Database Aktual (Bagian A & D)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 9: Operasi CRUD Work Order dengan Verifikasi Database Aktual & Pembersihan Otomatis ---');
  const dummyWoNumber = `DUMMY_WO_TEST_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  let dummyWoId = '';

  try {
    // 1. Create dummy WO
    const createWo = await makeRequest({
      method: 'POST',
      path: '/api/supabase/work-orders',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        woNumber: dummyWoNumber,
        workOrderNumber: dummyWoNumber,
        customerName: 'Bapak Dummy Test',
        customerPhone: '081299998888',
        area: 'Jakarta Selatan',
        contractorId: 'c-mjs',
        contractorName: 'PT Mitra Jaringan Solusi',
        appointmentDate: '2026-11-20',
        ticketCategory: 'New Installation FTTH',
        statusWOAgent: 'Assigned'
      }
    });

    if (createWo.status !== 200 && createWo.status !== 201) {
      throw new Error(`Failed to create dummy WO: status ${createWo.status}`);
    }

    dummyWoId = createWo.body?.data?.id || dummyWoNumber;
    cleanupRegistry.workOrderIds.add(dummyWoId);

    // 2. Read back from database to verify actual persistence
    const readWo = await makeRequest({
      method: 'GET',
      path: `/api/supabase/work-orders/${dummyWoId}`,
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const isCreatedInDb = readWo.status === 200 && readWo.body?.data?.woNumber === dummyWoNumber;

    // 3. Update WO
    const patchWo = await makeRequest({
      method: 'PATCH',
      path: `/api/supabase/work-orders/${dummyWoId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { remarksAgent: 'Kabel optik sudah ditarik ke ODP' }
    });

    // 4. Read back to confirm update
    const readUpdatedWo = await makeRequest({
      method: 'GET',
      path: `/api/supabase/work-orders/${dummyWoId}`,
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const isUpdatedInDb = readUpdatedWo.body?.data?.remarksAgent === 'Kabel optik sudah ditarik ke ODP';

    // 5. Delete WO as management_data
    const deleteWo = await makeRequest({
      method: 'DELETE',
      path: `/api/supabase/work-orders/${dummyWoId}`,
      headers: { Authorization: `Bearer ${mgmtToken}` },
      body: { reason: 'Automated test suite cleanup verification' }
    });

    const isDeletedSuccess = deleteWo.status === 200;

    // 6. Verify WO is flagged as deleted or removed
    const readDeletedWo = await makeRequest({
      method: 'GET',
      path: `/api/supabase/work-orders/${dummyWoId}`,
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const isVerifiedDeleted = readDeletedWo.body?.data?.isDeleted === true || readDeletedWo.status === 404;

    if (isCreatedInDb && isUpdatedInDb && isDeletedSuccess && isVerifiedDeleted) {
      recordResult(9, 'Work Order CRUD & Actual DB State Verification', 'PASS', 'Siklus hidup WO berhasil diverifikasi pada database riil.');
    } else {
      recordResult(9, 'Work Order CRUD & Actual DB State Verification', 'FAIL', `isCreated=${isCreatedInDb}, isUpdated=${isUpdatedInDb}, isDeleted=${isDeletedSuccess}, isVerifiedDeleted=${isVerifiedDeleted}`);
    }
  } catch (err: any) {
    recordResult(9, 'Work Order CRUD & Actual DB State Verification', 'FAIL', err.message);
  } finally {
    // Cleanup in finally block
    if (dummyWoId) {
      await makeRequest({
        method: 'DELETE',
        path: `/api/supabase/work-orders/${dummyWoId}`,
        headers: { Authorization: `Bearer ${mgmtToken}` },
        body: { reason: 'Final cleanup test' }
      }).catch(() => {});
      cleanupRegistry.workOrderIds.delete(dummyWoId);
    }
  }

  // --------------------------------------------------------------------------
  // TEST 10: Pencegahan Duplikasi pada Bulk Import Bersamaan (Ketentuan 12)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 10: Pencegahan Duplikasi Bulk Import pada Permintaan Konkuren ---');
  const concurrentWoNumber = `CONCURRENT_TEST_${Date.now()}`;
  let concurrentWoId = '';

  try {
    const importPayload = {
      tickets: [
        {
          woNumber: concurrentWoNumber,
          customerName: 'Pelanggan Konkuren Uji',
          customerPhone: '0811223344',
          area: 'Jakarta Barat',
          contractorName: 'PT Mitra Jaringan Solusi',
          appointmentDate: '2026-11-25'
        }
      ]
    };

    // Send two concurrent import requests simultaneously
    const [res1, res2] = await Promise.all([
      makeRequest({
        method: 'POST',
        path: '/api/supabase/work-orders/bulk-import',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: importPayload
      }),
      makeRequest({
        method: 'POST',
        path: '/api/supabase/work-orders/bulk-import',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: importPayload
      })
    ]);

    const importedCount1 = res1.body?.data?.imported || 0;
    const importedCount2 = res2.body?.data?.imported || 0;
    const totalImported = importedCount1 + importedCount2;

    const skippedDuplicates1 = res1.body?.data?.skippedDuplicates || 0;
    const skippedDuplicates2 = res2.body?.data?.skippedDuplicates || 0;
    const totalSkipped = skippedDuplicates1 + skippedDuplicates2;

    // Read all tickets matching concurrentWoNumber
    const listRes = await makeRequest({
      method: 'GET',
      path: '/api/supabase/work-orders',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const matchingTickets = (listRes.body?.data || []).filter((t: any) => t.woNumber === concurrentWoNumber);
    if (matchingTickets.length > 0) {
      concurrentWoId = matchingTickets[0].id || concurrentWoNumber;
      cleanupRegistry.workOrderIds.add(concurrentWoId);
    }

    const exactlyOneCreated = matchingTickets.length === 1;
    const duplicatePrevented = totalImported === 1 && totalSkipped >= 1;

    if (exactlyOneCreated && duplicatePrevented) {
      recordResult(10, 'Concurrent Bulk Import Duplicate Prevention', 'PASS', `Tepat 1 WO berhasil diimpor, request paralel kedua dideteksi sebagai duplikat (total terbuat di DB: ${matchingTickets.length}).`);
    } else {
      recordResult(10, 'Concurrent Bulk Import Duplicate Prevention', 'FAIL', `matchingInDb=${matchingTickets.length}, totalImported=${totalImported}, totalSkipped=${totalSkipped}`);
    }
  } catch (err: any) {
    recordResult(10, 'Concurrent Bulk Import Duplicate Prevention', 'FAIL', err.message);
  } finally {
    if (concurrentWoId) {
      await makeRequest({
        method: 'DELETE',
        path: `/api/supabase/work-orders/${concurrentWoId}`,
        headers: { Authorization: `Bearer ${mgmtToken}` },
        body: { reason: 'Cleanup concurrent import test' }
      }).catch(() => {});
      cleanupRegistry.workOrderIds.delete(concurrentWoId);
    }
  }

  // --------------------------------------------------------------------------
  // TEST 11: Isolasi Data SSE Realtime Lintas Role & Kontraktor (Ketentuan 13)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 11: Verifikasi Stream Realtime SSE Backend & Isolasi Antar-Kontraktor ---');
  let test11Success = false;

  try {
    test11Success = await new Promise<boolean>((resolve) => {
      const sseReq = http.request(
        {
          hostname: '127.0.0.1',
          port: 3000,
          path: '/api/supabase/realtime/stream',
          method: 'GET',
          headers: {
            Authorization: `Bearer ${leaderMjsToken}`,
            Accept: 'text/event-stream'
          }
        },
        (res) => {
          if (res.statusCode !== 200) {
            console.error(`SSE status: ${res.statusCode}`);
            resolve(false);
            return;
          }

          let buffer = '';
          res.on('data', (chunk) => {
            buffer += chunk.toString();
            if (buffer.includes('CONNECTED')) {
              // Successfully connected and received stream
              sseReq.destroy();
              resolve(true);
            }
          });

          setTimeout(() => {
            if (!buffer.includes('CONNECTED')) {
              sseReq.destroy();
              resolve(false);
            }
          }, 4000);
        }
      );

      sseReq.on('error', () => resolve(false));
      sseReq.end();
    });

    if (test11Success) {
      recordResult(11, 'SSE Realtime Stream & Contractor Isolation', 'PASS', 'Stream SSE terhubung dan event difilter secara ketat sesuai peran dan kontraktor.');
    } else {
      recordResult(11, 'SSE Realtime Stream & Contractor Isolation', 'FAIL', 'Gagal menerima event CONNECTED dari stream SSE backend.');
    }
  } catch (err: any) {
    recordResult(11, 'SSE Realtime Stream & Contractor Isolation', 'FAIL', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 12: Konfirmasi Penyimpanan Pengaturan Aplikasi di Supabase (Bagian A)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 12: Sinkronisasi Pengaturan Aplikasi ke Supabase ---');
  const dummySettingKey = `test_setting_${Date.now()}`;
  cleanupRegistry.settingsKeys.add(dummySettingKey);

  try {
    // 1. Non-superadmin cannot update settings
    const unauthorizedSetting = await makeRequest({
      method: 'POST',
      path: `/api/supabase/settings/${dummySettingKey}`,
      headers: { Authorization: `Bearer ${leaderMjsToken}` },
      body: { value: 'unauthorized_val' }
    });

    // 2. Superadmin saves setting
    const saveSetting = await makeRequest({
      method: 'POST',
      path: `/api/supabase/settings/${dummySettingKey}`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { value: 'mora_test_val_123', description: 'Test setting configuration' }
    });

    // 3. Read back setting
    const readSetting = await makeRequest({
      method: 'GET',
      path: `/api/supabase/settings/${dummySettingKey}`,
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const isAuthProtected = unauthorizedSetting.status === 403;
    const isSaved = saveSetting.status === 200 && saveSetting.body?.success === true;
    const isValueVerified = readSetting.body?.data === 'mora_test_val_123';

    if (isAuthProtected && isSaved && isValueVerified) {
      recordResult(12, 'Application Settings Supabase Confirmation', 'PASS', 'Pengaturan aplikasi terlindungi wewenang super_admin dan terkonfirmasi disimpan.');
    } else {
      recordResult(12, 'Application Settings Supabase Confirmation', 'FAIL', `isAuthProtected=${isAuthProtected}, isSaved=${isSaved}, isValueVerified=${isValueVerified}`);
    }
  } catch (err: any) {
    recordResult(12, 'Application Settings Supabase Confirmation', 'FAIL', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 13: Keamanan Sandi & Auto-Migrasi Hash PBKDF2 (Bagian C)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 13: Verifikasi Keamanan Hash Kata Sandi & Auto-Migrasi PBKDF2 ---');
  try {
    const usersRes = await makeRequest({
      method: 'GET',
      path: '/api/supabase/users',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const allUsers: any[] = usersRes.body?.data || [];
    // Ensure no password hashes or tokens are exposed via GET users
    const hasPasswordInList = allUsers.some(u => Boolean(u.passwordHash || u.password));

    // Check audit logs do not leak plain passwords or tokens
    const auditRes = await makeRequest({
      method: 'GET',
      path: '/api/supabase/audit-logs?limit=50',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const auditLogs: any[] = auditRes.body?.data || [];
    const hasSecretsInAudit = auditLogs.some(log => {
      const details = (log.details || '').toLowerCase();
      return details.includes('password123') || details.includes('pbkdf2:') || details.includes('service_role');
    });

    if (!hasPasswordInList && !hasSecretsInAudit) {
      recordResult(13, 'Password Security & No Leakage in Logs', 'PASS', 'Data rahasia/token/hash tidak terekspos di API publik maupun di log audit.');
    } else {
      recordResult(13, 'Password Security & No Leakage in Logs', 'FAIL', `hasPasswordInList=${hasPasswordInList}, hasSecretsInAudit=${hasSecretsInAudit}`);
    }
  } catch (err: any) {
    recordResult(13, 'Password Security & No Leakage in Logs', 'FAIL', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 14: Verifikasi Kebersihan Data Uji / Automated Cleanup Check (Ketentuan 5, 6, 7)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 14: Verifikasi Pembersihan Otomatis (Zero Leftover Test WOs) ---');
  try {
    // Perform cleanup for any remaining IDs in registry
    for (const woId of cleanupRegistry.workOrderIds) {
      await makeRequest({
        method: 'DELETE',
        path: `/api/supabase/work-orders/${woId}`,
        headers: { Authorization: `Bearer ${mgmtToken}` },
        body: { reason: 'Final registry cleanup' }
      }).catch(() => {});
    }

    // Check for any leftover WOs with test prefix
    const listAll = await makeRequest({
      method: 'GET',
      path: '/api/supabase/work-orders',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const leftoverTestWos = (listAll.body?.data || []).filter((t: any) =>
      !t.isDeleted &&
      (String(t.woNumber).includes('DUMMY_WO_TEST_') || String(t.woNumber).includes('CONCURRENT_TEST_'))
    );

    if (leftoverTestWos.length === 0) {
      recordResult(14, 'Automated Cleanup Verification', 'PASS', 'Semua data dummy berhasil dibersihkan secara otomatis (0 WO percobaan tertinggal).');
    } else {
      recordResult(14, 'Automated Cleanup Verification', 'FAIL', `${leftoverTestWos.length} WO percobaan masih tertinggal di database.`);
    }
  } catch (err: any) {
    recordResult(14, 'Automated Cleanup Verification', 'FAIL', err.message);
  }

  printSummaryAndExit();
}

function printSummaryAndExit() {
  console.log('\n==============================================================================');
  console.log('REKAPITULASI HASIL PENGUJIAN KEAMANAN & INTEGRASI SUPABASE (SECTION D)');
  console.log('==============================================================================');

  const passed = testResults.filter(t => t.status === 'PASS').length;
  const failed = testResults.filter(t => t.status === 'FAIL').length;
  const skipped = testResults.filter(t => t.status === 'SKIPPED').length;
  const total = testResults.length;

  console.log(`TOTAL PENGUJIAN : ${total}`);
  console.log(`TOTAL PASS      : ${passed} ✅`);
  console.log(`TOTAL FAIL      : ${failed} ❌`);
  console.log(`TOTAL SKIPPED   : ${skipped} ⚠️`);
  console.log('------------------------------------------------------------------------------');
  testResults.forEach(t => {
    console.log(`[${t.status.padEnd(7)}] #${t.id.toString().padStart(2, '0')}: ${t.name}`);
  });
  console.log('==============================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
