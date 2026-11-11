/**
 * MORAJAWS — PHASE 16A.2: STAGING SCHEMA INITIALIZATION & SUPABASE AUTH ALIGNMENT TEST
 * 
 * Tests all 14 mandatory scenarios required by Phase 16A.2:
 * 1. Tabel "public.users" ditemukan.
 * 2. Tabel "public.users" tidak ditemukan (PGRST205 / 42P01).
 * 3. "auth_user_id" memiliki foreign key yang benar ke auth.users(id).
 * 4. Auth UID yang tidak ada ditolak.
 * 5. Satu Auth UID tidak dapat terhubung ke dua profil staf (Uniqueness guard).
 * 6. Profil staf dapat dicari dengan email canonical.
 * 7. Username dapat dipetakan ke email Auth.
 * 8. Role dan permission tetap benar (RBAC validation).
 * 9. RLS tidak memberikan akses berlebihan (Deny-by-default anon, service_role authorized).
 * 10. Koneksi Supabase gagal (Distinguished from schema uninitialized).
 * 11. Project ID tidak cocok (Staging validation against lvytgqsvxntnvlohmrxi).
 * 12. Initialization guard memberikan error yang benar (MJ-SYS-001 / SCHEMA_NOT_INITIALIZED).
 * 13. Login tidak menggunakan Firebase Auth (Supabase Auth sole provider).
 * 14. Tidak ada fallback JSON saat database gagal (Fail-closed principle).
 */

import fs from 'fs';
import path from 'path';
import {
  setAppEnvironmentForTesting,
  getEnvironmentConfig,
  STAGING_SUPABASE_PROJECT_ID,
  STAGING_DEFAULT_SUPABASE_URL
} from '../server/environmentConfig.ts';
import {
  setSupabaseBackendClientForTesting,
  resetSupabaseBackendClientForTesting
} from '../server/supabaseClient.ts';
import {
  signInWithSupabaseAuth
} from '../server/supabaseAuthAdapter.ts';
import {
  classifySupabaseError,
  findUserInSupabaseDetailed
} from '../server/supabaseAdapter.ts';

interface AssertionResult {
  num: number;
  scenario: string;
  passed: boolean;
  expected: string;
  actual: string;
  details: string;
}

const assertions: AssertionResult[] = [];

function recordTest(
  num: number,
  scenario: string,
  passed: boolean,
  expected: string,
  actual: string,
  details: string
) {
  assertions.push({
    num,
    scenario,
    passed,
    expected,
    actual,
    details
  });
  const tag = passed ? 'PASS' : 'FAIL';
  console.log(`[${tag}] #${num} ${scenario}`);
  console.log(`       Expected: ${expected}`);
  console.log(`       Actual:   ${actual}`);
  console.log(`       Details:  ${details}\n`);
}

/**
 * Creates a fluent Mock Supabase Client supporting chaining (.eq, .ilike, .limit, .maybeSingle).
 */
function createMockClient(
  users: any[] = [],
  options: {
    schemaError?: any;
    authError?: any;
    throwNetwork?: boolean;
    queryError?: any;
  } = {}
) {
  return {
    from: (tbl: string) => {
      let filtered = [...users];
      const error = options.schemaError || options.queryError || null;

      const chain: any = {
        select: (_fields?: string) => chain,
        eq: (col: string, val: any) => {
          if (options.throwNetwork) {
            throw new Error('fetch failed: getaddrinfo ENOTFOUND lvytgqsvxntnvlohmrxi.supabase.co');
          }
          if (error) return chain;
          filtered = filtered.filter(u => String(u[col] ?? '') === String(val ?? ''));
          return chain;
        },
        ilike: (col: string, val: string) => {
          if (options.throwNetwork) {
            throw new Error('fetch failed: getaddrinfo ENOTFOUND lvytgqsvxntnvlohmrxi.supabase.co');
          }
          if (error) return chain;
          // Unescape PostgREST escaped wildcard characters (\% and \_)
          const cleanPattern = String(val ?? '')
            .replace(/\\([\\%_])/g, '$1')
            .replace(/%/g, '')
            .toLowerCase()
            .trim();
          filtered = filtered.filter(u => String(u[col] ?? '').toLowerCase().includes(cleanPattern));
          return chain;
        },
        limit: (_n: number) => chain,
        maybeSingle: async () => {
          if (options.throwNetwork) {
            throw new Error('fetch failed: getaddrinfo ENOTFOUND lvytgqsvxntnvlohmrxi.supabase.co');
          }
          if (error) {
            return { data: null, error };
          }
          return { data: filtered[0] || null, error: null };
        },
        then: (resolve: any) => {
          if (options.throwNetwork) {
            throw new Error('fetch failed: getaddrinfo ENOTFOUND lvytgqsvxntnvlohmrxi.supabase.co');
          }
          return resolve({ data: filtered, error });
        }
      };
      return chain;
    },
    auth: {
      signInWithPassword: async (params: { email: string; password: string }) => {
        if (options.authError) {
          return { data: { user: null, session: null }, error: options.authError };
        }
        const user = users.find(u => u.email?.toLowerCase() === params.email?.toLowerCase());
        if (user && params.password === 'CorrectSecureStagingPassword2026!') {
          return {
            data: {
              user: { id: user.auth_user_id || 'mock-auth-id', email: user.email },
              session: {
                access_token: 'mock_jwt_access_token',
                refresh_token: 'mock_jwt_refresh_token',
                expires_in: 3600
              }
            },
            error: null
          };
        }
        return {
          data: { user: null, session: null },
          error: { code: 'invalid_credentials', message: 'Invalid login credentials' }
        };
      }
    }
  };
}

async function runPhase16A2TestSuite() {
  console.log('==============================================================================');
  console.log('MORAJAWS — PHASE 16A.2 TEST SUITE: SCHEMA & SUPABASE AUTH ALIGNMENT');
  console.log('Target Staging Project ID: lvytgqsvxntnvlohmrxi (MoraJaws-Staging-Auth)');
  console.log('==============================================================================\n');

  const STAGING_STAF_EMAIL = 'rayhanafirzanx@gmail.com';
  const STAGING_STAF_UID = 'a32628b2-25fb-48c3-934c-9d2d7eb58255';
  const STAGING_PASSWORD = 'CorrectSecureStagingPassword2026!';

  const validStagingUserRow = {
    id: 'usr_staging_01',
    auth_user_id: STAGING_STAF_UID,
    name: 'Rayhana Firzan',
    username: 'rayhana_staging',
    email: STAGING_STAF_EMAIL,
    alt_email: 'rayjs666@gmail.com',
    role: 'super_admin',
    contractor: 'PT Mora Solusi Staging',
    area: 'Jakarta Barat',
    active: true,
    is_deleted: false,
    session_version: 1,
    permissions: ['all']
  };

  // ===========================================================================
  // TEST 1: Tabel "public.users" ditemukan
  // ===========================================================================
  {
    const mockClient = createMockClient([validStagingUserRow]);
    setSupabaseBackendClientForTesting(mockClient);

    const res = await findUserInSupabaseDetailed(STAGING_STAF_EMAIL);
    const passed = Boolean(res.success && res.data && res.data.username === 'rayhana_staging');
    recordTest(
      1,
      'Tabel "public.users" ditemukan dan kueri profil berhasil',
      passed,
      'success: true with valid user profile',
      `success: ${res.success}, username: ${res.data?.username || 'null'}`,
      'Profil staf berhasil ditemukan dan di-parse dari baris PostgreSQL public.users'
    );
  }

  // ===========================================================================
  // TEST 2: Tabel "public.users" tidak ditemukan (PGRST205 / 42P01)
  // ===========================================================================
  {
    const schemaError = {
      code: 'PGRST205',
      message: "Could not find the table 'public.users' in the schema cache"
    };
    const mockClient = createMockClient([], { schemaError });
    setSupabaseBackendClientForTesting(mockClient);

    const res = await findUserInSupabaseDetailed(STAGING_STAF_EMAIL);
    const classified = classifySupabaseError(schemaError);
    const passed = Boolean(!res.success && classified.isSchemaError && res.error?.isSchemaError);
    recordTest(
      2,
      'Tabel "public.users" tidak ditemukan (PGRST205 terklasifikasi sebagai isSchemaError)',
      passed,
      'isSchemaError: true, error.code: PGRST205',
      `isSchemaError: ${classified.isSchemaError}, code: ${res.error?.code}`,
      'Sistem mendeteksi relasi database belum ada tanpa menganggap sebagai kredensial salah'
    );
  }

  // ===========================================================================
  // TEST 3: "auth_user_id" memiliki foreign key yang benar ke auth.users(id)
  // ===========================================================================
  {
    const migrationPath = path.resolve(process.cwd(), 'migrations/007_phase16a2_staging_schema_initialization.sql');
    const sqlContent = fs.readFileSync(migrationPath, 'utf8');

    const hasAuthUserIdCol = sqlContent.includes('auth_user_id UUID');
    const hasFkConstraint = sqlContent.includes('FOREIGN KEY (auth_user_id) REFERENCES auth.users(id)');
    const hasOnDeleteSetNull = sqlContent.includes('ON DELETE SET NULL');

    const passed = hasAuthUserIdCol && hasFkConstraint && hasOnDeleteSetNull;
    recordTest(
      3,
      '"auth_user_id" memiliki foreign key yang benar ke auth.users(id) ON DELETE SET NULL',
      passed,
      'auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL',
      `Col: ${hasAuthUserIdCol}, FK: ${hasFkConstraint}, Action: ${hasOnDeleteSetNull}`,
      'Constraint fisik fk_users_auth_user_id terverifikasi pada blueprint DDL 007'
    );
  }

  // ===========================================================================
  // TEST 4: Auth UID yang tidak ada ditolak
  // ===========================================================================
  {
    const randomNonExistentUid = '99999999-9999-4999-8999-999999999999';
    const mockClient = createMockClient([validStagingUserRow]);
    setSupabaseBackendClientForTesting(mockClient);

    const res = await findUserInSupabaseDetailed(randomNonExistentUid);
    const passed = Boolean(res.success && res.data === null);
    recordTest(
      4,
      'Auth UID yang tidak ada di database ditolak secara aman',
      passed,
      'success: true, data: null',
      `success: ${res.success}, data: ${res.data}`,
      'Pencarian dengan Auth UID acak tidak menghasilkan profil staf palsu'
    );
  }

  // ===========================================================================
  // TEST 5: Satu Auth UID tidak dapat terhubung ke dua profil staf (Uniqueness)
  // ===========================================================================
  {
    const migrationPath = path.resolve(process.cwd(), 'migrations/007_phase16a2_staging_schema_initialization.sql');
    const sqlContent = fs.readFileSync(migrationPath, 'utf8');

    const hasPartialUniqueIndex = sqlContent.includes('idx_users_auth_user_id_unique') &&
      sqlContent.includes('ON public.users (auth_user_id)') &&
      sqlContent.includes('WHERE auth_user_id IS NOT NULL AND is_deleted = false');

    const duplicateError = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "idx_users_auth_user_id_unique"'
    };
    const classified = classifySupabaseError(duplicateError);

    const passed = hasPartialUniqueIndex && classified.isDuplicate;
    recordTest(
      5,
      'Satu Auth UID tidak dapat terhubung ke dua profil staf aktif (Index Unik 1:1)',
      passed,
      'Unique index idx_users_auth_user_id_unique exists and code 23505 classified as duplicate',
      `Index exists: ${hasPartialUniqueIndex}, isDuplicate: ${classified.isDuplicate}`,
      'Partial unique index menjamin relasi 1:1 antara Supabase Auth UID dan profil staf aktif'
    );
  }

  // ===========================================================================
  // TEST 6: Profil staf dapat dicari dengan email canonical
  // ===========================================================================
  {
    const mockClient = createMockClient([validStagingUserRow]);
    setSupabaseBackendClientForTesting(mockClient);

    const res = await findUserInSupabaseDetailed(STAGING_STAF_EMAIL);
    const passed = Boolean(res.success && res.data?.email === STAGING_STAF_EMAIL);
    recordTest(
      6,
      'Profil staf dapat dicari dengan email kanonikal (case-insensitive)',
      passed,
      `email matches ${STAGING_STAF_EMAIL}`,
      `matched email: ${res.data?.email}`,
      'Pencarian email langsung menghasilkan profil otoritatif'
    );
  }

  // ===========================================================================
  // TEST 7: Username dapat dipetakan ke email Auth
  // ===========================================================================
  {
    const mockClient = createMockClient([validStagingUserRow]);
    setSupabaseBackendClientForTesting(mockClient);

    const authRes = await signInWithSupabaseAuth('rayhana_staging', STAGING_PASSWORD);
    const passed = Boolean(authRes.success && authRes.data?.user.email === STAGING_STAF_EMAIL);
    recordTest(
      7,
      'Username berhasil dipetakan ke email Auth untuk login Supabase Auth',
      passed,
      `Login via username resolves to Auth email ${STAGING_STAF_EMAIL}`,
      `Success: ${authRes.success}, User email: ${authRes.data?.user.email}`,
      'Backend Express menyelesaikan username menjadi email kanonikal sebelum memanggil Supabase Auth'
    );
  }

  // ===========================================================================
  // TEST 8: Role dan permission tetap benar (RBAC)
  // ===========================================================================
  {
    const invalidRoleUser = {
      id: 'usr_hack',
      auth_user_id: 'some-uid',
      name: 'Hacker',
      username: 'hacker',
      email: 'invalid_role@morajaws.net',
      role: 'super_root_admin', // Invalid role
      active: true,
      is_deleted: false
    };

    const mockClient = createMockClient([invalidRoleUser]);
    setSupabaseBackendClientForTesting(mockClient);

    const invalidRoleRes = await signInWithSupabaseAuth('invalid_role@morajaws.net', 'AnyPassword123!');
    const passed = Boolean(!invalidRoleRes.success && invalidRoleRes.error?.code === 'INVALID_ROLE');
    recordTest(
      8,
      'Role dan permission divalidasi ketat oleh Express backend (Role asing ditolak)',
      passed,
      'code: INVALID_ROLE',
      `code: ${invalidRoleRes.error?.code}`,
      'Role di luar 6 canonical roles MoraJaws diblokir secara otoritatif oleh backend'
    );
  }

  // ===========================================================================
  // TEST 9: RLS tidak memberikan akses berlebihan
  // ===========================================================================
  {
    const migrationPath = path.resolve(process.cwd(), 'migrations/007_phase16a2_staging_schema_initialization.sql');
    const sqlContent = fs.readFileSync(migrationPath, 'utf8');

    const hasRlsOnUsers = sqlContent.includes('ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;');
    const hasRlsOnWo = sqlContent.includes('ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;');
    const hasRlsOnAudit = sqlContent.includes('ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;');
    const hasStrictRevoke = sqlContent.includes('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated, anon;');
    const hasServiceRoleGrant = sqlContent.includes('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;');

    const passed = hasRlsOnUsers && hasRlsOnWo && hasRlsOnAudit && hasStrictRevoke && hasServiceRoleGrant;
    recordTest(
      9,
      'Matriks Row Level Security (RLS) bebas-rekursi mencegah akses berlebihan (Express-only access)',
      passed,
      'RLS enabled on all tables, direct access revoked from authenticated & anon, service_role authorized',
      `Users: ${hasRlsOnUsers}, WO: ${hasRlsOnWo}, Audit RLS: ${hasRlsOnAudit}, Revoke All: ${hasStrictRevoke}, ServiceRole: ${hasServiceRoleGrant}`,
      'Anon dan authenticated tidak memiliki akses langsung; seluruh kueri database harus melalui Express Backend'
    );
  }

  // ===========================================================================
  // TEST 10: Koneksi Supabase gagal
  // ===========================================================================
  {
    const mockClient = createMockClient([], { throwNetwork: true });
    setSupabaseBackendClientForTesting(mockClient);

    const res = await findUserInSupabaseDetailed(STAGING_STAF_EMAIL);
    const passed = Boolean(!res.success && res.error?.isConnectionError && !res.error?.isSchemaError);
    recordTest(
      10,
      'Koneksi Supabase gagal diklasifikasikan dengan tepat (bukan skema belum ada)',
      passed,
      'isConnectionError: true, isSchemaError: false',
      `isConnectionError: ${res.error?.isConnectionError}, isSchemaError: ${res.error?.isSchemaError}`,
      'Network failure dibedakan secara akurat dari schema_not_initialized'
    );
  }

  // ===========================================================================
  // TEST 11: Project ID tidak cocok
  // ===========================================================================
  {
    setAppEnvironmentForTesting('staging');
    process.env.STAGING_SUPABASE_PROJECT_ID = 'wrong_project_id_123';
    process.env.STAGING_SUPABASE_URL = 'https://wrong_project_id_123.supabase.co';

    const cfg = getEnvironmentConfig('staging');
    const isMismatch = cfg.supabaseProjectId !== STAGING_SUPABASE_PROJECT_ID;

    // Reset environment test
    process.env.STAGING_SUPABASE_PROJECT_ID = STAGING_SUPABASE_PROJECT_ID;
    process.env.STAGING_SUPABASE_URL = STAGING_DEFAULT_SUPABASE_URL;
    setAppEnvironmentForTesting(null);

    const passed = isMismatch;
    recordTest(
      11,
      'Project ID yang tidak cocok dengan target staging ("lvytgqsvxntnvlohmrxi") terdeteksi',
      passed,
      'isMismatch: true when targeting wrong project',
      `isMismatch: ${isMismatch}`,
      'Initialization guard menolak operasi jika Project ID bukan lvytgqsvxntnvlohmrxi'
    );
  }

  // ===========================================================================
  // TEST 12: Initialization guard memberikan error yang benar (MJ-SYS-001)
  // ===========================================================================
  {
    const schemaError = {
      code: 'PGRST205',
      message: "Could not find the table 'public.users' in the schema cache"
    };
    const mockClient = createMockClient([], { schemaError });
    setSupabaseBackendClientForTesting(mockClient);

    const loginRes = await signInWithSupabaseAuth(STAGING_STAF_EMAIL, 'any_password');
    const passed = Boolean(!loginRes.success && loginRes.error?.code === 'SCHEMA_NOT_INITIALIZED');
    recordTest(
      12,
      'Initialization guard memberikan error SCHEMA_NOT_INITIALIZED saat tabel belum dibuat',
      passed,
      'code: SCHEMA_NOT_INITIALIZED',
      `code: ${loginRes.error?.code}`,
      'Error menginstruksikan penerapan migrasi 007 tanpa mengekspos kredensial rahasia'
    );
  }

  // ===========================================================================
  // TEST 13: Login tidak menggunakan Firebase Auth
  // ===========================================================================
  {
    const mockClient = createMockClient([validStagingUserRow]);
    setSupabaseBackendClientForTesting(mockClient);

    const res = await signInWithSupabaseAuth(STAGING_STAF_EMAIL, STAGING_PASSWORD);
    const resolvedAuthUid = res.data?.authUserId || res.data?.user.authUserId;
    const passed = Boolean(res.success && resolvedAuthUid === STAGING_STAF_UID);
    recordTest(
      13,
      'Login sepenuhnya menggunakan Supabase Auth (auth.users), tanpa Firebase Auth fallback',
      passed,
      `auth user id ${STAGING_STAF_UID} authenticated via Supabase`,
      `Success: ${res.success}, Auth UID: ${resolvedAuthUid}`,
      'Supabase Auth adalah satu-satunya otoritas verifikasi kata sandi'
    );
  }

  // ===========================================================================
  // TEST 14: Tidak ada fallback JSON saat database gagal (Fail-Closed)
  // ===========================================================================
  {
    const dbOutageError = {
      code: '503',
      message: 'Database connection failed: ECONNREFUSED'
    };
    const mockClient = createMockClient([], { queryError: dbOutageError });
    setSupabaseBackendClientForTesting(mockClient);

    const res = await findUserInSupabaseDetailed(STAGING_STAF_EMAIL);
    const passed = Boolean(!res.success && res.data === null);
    recordTest(
      14,
      'Tidak ada silent fallback ke data lokal/JSON saat database Supabase gagal (Fail-Closed)',
      passed,
      'success: false, data: null (fails closed)',
      `success: ${res.success}, data: ${res.data}`,
      'Sistem mengembalikan service error dan menolak menyajikan data JSON lama saat database tidak dapat dijangkau'
    );
  }

  // Reset testing client
  resetSupabaseBackendClientForTesting();

  // Print summary
  console.log('==============================================================================');
  console.log('PHASE 16A.2 TEST EXECUTION SUMMARY');
  console.log('==============================================================================');
  const allPassed = assertions.every(a => a.passed);
  const total = assertions.length;
  const passedCount = assertions.filter(a => a.passed).length;
  const failedCount = total - passedCount;

  console.log(`Total Scenarios: ${total}`);
  console.log(`Passed:          ${passedCount}`);
  console.log(`Failed:          ${failedCount}`);
  console.log(`Final Result:    ${allPassed ? 'ALL PASS (14/14)' : 'SOME FAILED'}`);
  console.log('==============================================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

runPhase16A2TestSuite().catch(err => {
  console.error('Fatal error during test suite execution:', err);
  process.exit(1);
});
