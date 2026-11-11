import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import {
  loginWithCustomAuth,
  verifyAccessToken,
  rotateRefreshToken,
  revokeAllUserSessions,
  revokeSingleSession,
  verifyUserPasswordEx,
  hashPasswordWithBcrypt,
  generateSecureAccessToken,
  generateSecureRefreshToken,
  hashToken,
  setSimulateSessionInsertFailure,
  setSimulateRefreshTokenInsertFailure,
  setSimulateSupabaseUnavailable,
  resetSimulateFlags,
  LOCAL_AUTH_SESSIONS,
  LOCAL_REFRESH_TOKENS,
  isLocalAuthAllowed
} from '../server/customAuthService.ts';
import {
  setSupabaseBackendClientForTesting,
  resetSupabaseBackendClientForTesting,
  isSupabaseConfigured
} from '../server/supabaseClient.ts';

// ==============================================================================
// MORAJAWS PHASE 1 REMEDIATION TEST SUITE
// 12 Mandatory Integration and Resilience Assertions:
//
// 1.  Login normal (with PBKDF2 legacy verification & bcrypt upgrade)
// 2.  Login dengan password salah (rejection, attempt logged)
// 3.  Login saat Supabase tidak tersedia (fail-closed, no local fallback in production)
// 4.  Login ketika session insert gagal (fail-closed, no login returned)
// 5.  Login ketika refresh token insert gagal (atomic compensation rollback)
// 6.  Validasi token lama (expired token rejected)
// 7.  Session version mismatch (token or session version != user version rejected)
// 8.  Refresh token replay (reusing revoked refresh token rejected)
// 9.  Logout (single session revocation)
// 10. Reset password (bcrypt hash, version bumped, all sessions revoked)
// 11. Revoke seluruh session (atomic revocation of sessions & refresh tokens)
// 12. Login kembali setelah password diganti (successful login with new version)
// ==============================================================================

interface TestResult {
  testNumber: number;
  name: string;
  category: 'static_audit' | 'resilience_test' | 'session_integrity';
  passed: boolean;
  details: string;
  evidence?: any;
}

const testResults: TestResult[] = [];

// In-Memory PostgreSQL Mock Engine for Deterministic Testing
class MockPostgresDatabase {
  users: Map<string, any> = new Map();
  authSessions: Map<string, any> = new Map();
  refreshTokens: Map<string, any> = new Map();
  loginAttempts: any[] = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.users.clear();
    this.authSessions.clear();
    this.refreshTokens.clear();
    this.loginAttempts = [];

    // Seed authoritative Superadmin user (matches migration 007)
    // Email: rayhanafirzanx@gmail.com, Username: rays, Role: super_admin
    // Initial Password: mora2026 (stored as PBKDF2 hash)
    this.users.set('u-ray', {
      id: 'u-ray',
      name: 'Ray (Super Admin)',
      username: 'rays',
      email: 'rayhanafirzanx@gmail.com',
      alt_email: 'rayjs666@gmail.com, superadmin@morajaws.net, tarnocepak@gmail.com',
      role: 'super_admin',
      active: true,
      is_deleted: false,
      must_change_password: true,
      session_version: 1,
      password_hash: 'pbkdf2:sha256:310000:f53df92fa13b39f33eee3aaf263b0382:ae3de0d03c3ee7377cce06f04cd5fddab5bc0b7101c4b1b335b7758d9e2e2dc3',
      login_count: 0,
      failed_login_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  createClient() {
    const db = this;
    return {
      from(table: string) {
        return {
          select(fields: string = '*') {
            return {
              eq(col: string, val: any) {
                return {
                  limit(n: number) {
                    return {
                      async maybeSingle() {
                        if (table === 'users') {
                          for (const u of db.users.values()) {
                            if (col === 'id' && u.id === val) return { data: { ...u }, error: null };
                            if (col === 'username' && u.username.toLowerCase() === String(val).toLowerCase()) return { data: { ...u }, error: null };
                            if (col === 'email' && u.email.toLowerCase() === String(val).toLowerCase()) return { data: { ...u }, error: null };
                            if (col === 'firebase_uid' && u.firebase_uid === val) return { data: { ...u }, error: null };
                            if (col === 'auth_user_id' && u.auth_user_id === val) return { data: { ...u }, error: null };
                          }
                          return { data: null, error: null };
                        }
                        if (table === 'refresh_tokens') {
                          for (const rt of db.refreshTokens.values()) {
                            if (col === 'token_hash' && rt.token_hash === val) return { data: { ...rt }, error: null };
                          }
                          return { data: null, error: null };
                        }
                        return { data: null, error: null };
                      },
                      async single() {
                        const res = await this.maybeSingle();
                        if (!res.data) return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
                        return res;
                      }
                    };
                  },
                  async single() {
                    if (table === 'users') {
                      for (const u of db.users.values()) {
                        if (col === 'id' && u.id === val) return { data: { ...u }, error: null };
                      }
                      return { data: null, error: { message: 'User not found', code: 'PGRST116' } };
                    }
                    return { data: null, error: { message: 'Row not found' } };
                  },
                  gte(dateCol: string, dateVal: string) {
                    return {
                      order(orderCol: string, opts: any) {
                        return {
                          limit(lim: number) {
                            return Promise.resolve({ data: [], error: null });
                          }
                        };
                      }
                    };
                  }
                };
              },
              or(expr: string) {
                return {
                  limit(n: number) {
                    return {
                      async maybeSingle() {
                        if (table === 'auth_sessions') {
                          // e.g. session_id_hash.eq.HASH,token_hash.eq.HASH
                          const hashes = expr.match(/eq\.([a-f0-9]+)/g)?.map(m => m.replace('eq.', '')) || [];
                          for (const s of db.authSessions.values()) {
                            if (hashes.includes(s.session_id_hash) || hashes.includes(s.token_hash)) {
                              return { data: { ...s }, error: null };
                            }
                          }
                          return { data: null, error: null };
                        }
                        return { data: null, error: null };
                      }
                    };
                  }
                };
              },
              ilike(col: string, pattern: string) {
                return {
                  limit(n: number) {
                    return {
                      async maybeSingle() {
                        const cleanPattern = pattern.toLowerCase().replace(/%/g, '');
                        if (table === 'users') {
                          for (const u of db.users.values()) {
                            if (col === 'username' && u.username.toLowerCase() === cleanPattern) {
                              return { data: { ...u }, error: null };
                            }
                            if (col === 'email' && u.email.toLowerCase() === cleanPattern) {
                              return { data: { ...u }, error: null };
                            }
                          }
                        }
                        return { data: null, error: null };
                      }
                    };
                  }
                };
              }
            };
          },
          async insert(rows: any[]) {
            for (const r of rows) {
              if (table === 'auth_sessions') {
                db.authSessions.set(r.id, { ...r });
              } else if (table === 'refresh_tokens') {
                db.refreshTokens.set(r.id, { ...r });
              } else if (table === 'login_attempts') {
                db.loginAttempts.push({ ...r });
              } else if (table === 'users') {
                db.users.set(r.id, { ...r });
              }
            }
            return { data: rows, error: null };
          },
          update(updates: any) {
            return {
              eq(col: string, val: any) {
                return {
                  is(isCol: string, isVal: any) {
                    return {
                      then(resolve: any) {
                        // update where col = val and isCol is isVal
                        let count = 0;
                        if (table === 'auth_sessions') {
                          for (const s of db.authSessions.values()) {
                            if (s[col] === val && s[isCol] === isVal) {
                              Object.assign(s, updates);
                              count++;
                            }
                          }
                        }
                        if (table === 'refresh_tokens') {
                          for (const rt of db.refreshTokens.values()) {
                            if (rt[col] === val && rt[isCol] === isVal) {
                              Object.assign(rt, updates);
                              count++;
                            }
                          }
                        }
                        return Promise.resolve({ data: null, error: null }).then(resolve);
                      }
                    };
                  },
                  then(resolve: any) {
                    if (table === 'users') {
                      for (const u of db.users.values()) {
                        if (u[col] === val) {
                          Object.assign(u, updates);
                        }
                      }
                    } else if (table === 'auth_sessions') {
                      for (const s of db.authSessions.values()) {
                        if (s[col] === val) {
                          Object.assign(s, updates);
                        }
                      }
                    } else if (table === 'refresh_tokens') {
                      for (const rt of db.refreshTokens.values()) {
                        if (rt[col] === val) {
                          Object.assign(rt, updates);
                        }
                      }
                    }
                    return Promise.resolve({ data: null, error: null }).then(resolve);
                  }
                };
              },
              or(expr: string) {
                const matchEqs = expr.split(',').map(s => {
                  const parts = s.split('.eq.');
                  return { col: parts[0]?.trim(), val: parts[1]?.trim() };
                });
                if (table === 'auth_sessions') {
                  for (const s of db.authSessions.values()) {
                    for (const m of matchEqs) {
                      if (s[m.col] === m.val) {
                        Object.assign(s, updates);
                      }
                    }
                  }
                }
                if (table === 'refresh_tokens') {
                  for (const rt of db.refreshTokens.values()) {
                    for (const m of matchEqs) {
                      if (rt[m.col] === m.val) {
                        Object.assign(rt, updates);
                      }
                    }
                  }
                }
                return Promise.resolve({ data: null, error: null });
              }
            };
          },
          delete() {
            return {
              eq(col: string, val: any) {
                if (table === 'auth_sessions') {
                  db.authSessions.delete(val);
                } else if (table === 'refresh_tokens') {
                  db.refreshTokens.delete(val);
                }
                return Promise.resolve({ data: null, error: null });
              }
            };
          }
        };
      },
      rpc(fnName: string, args: any) {
        // Mock RPC execution if desired
        return Promise.resolve({ data: null, error: { message: 'Function not found', code: 'PGRST202' } });
      }
    };
  }
}

export async function runAllTests(): Promise<{ passed: boolean; results: TestResult[] }> {
  console.log('================================================================');
  console.log('MORAJAWS PHASE 1: CUSTOM AUTH FAIL-CLOSED & SESSION INTEGRITY');
  console.log('Running 12 Mandatory Tests...');
  console.log('================================================================\n');

  const mockDb = new MockPostgresDatabase();
  const mockClient = mockDb.createClient();
  setSupabaseBackendClientForTesting(mockClient);

  // ---------------------------------------------------------------------------
  // TEST 1: Login Normal dengan Verifikasi PBKDF2 & Upgrade ke Bcrypt
  // ---------------------------------------------------------------------------
  try {
    mockDb.reset();
    resetSimulateFlags();

    const res = await loginWithCustomAuth({
      identifier: 'rays',
      password: 'mora2026',
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 Test Suite'
    });

    const userInDb = mockDb.users.get('u-ray');
    const isBcrypt = userInDb?.password_hash?.startsWith('$2a$') || userInDb?.password_hash?.startsWith('$2b$');
    const sessionInDb = res.data?.sessionId ? mockDb.authSessions.get(res.data.sessionId) : null;
    const rtInDb = mockDb.refreshTokens.size > 0;

    const pass = Boolean(
      res.success &&
      res.data?.tokens?.accessToken &&
      res.data?.user?.username === 'rays' &&
      isBcrypt &&
      sessionInDb &&
      rtInDb &&
      sessionInDb.session_version === 1
    );

    testResults.push({
      testNumber: 1,
      name: 'Login Normal dengan Verifikasi PBKDF2 & Upgrade ke Bcrypt',
      category: 'session_integrity',
      passed: pass,
      details: pass
        ? 'Login berhasil, token dihasilkan, session dan refresh_token tersimpan di PostgreSQL, hash di-upgrade ke bcrypt.'
        : `Gagal: ${JSON.stringify(res.error || {})}`
    });
  } catch (err: any) {
    testResults.push({
      testNumber: 1,
      name: 'Login Normal dengan Verifikasi PBKDF2 & Upgrade ke Bcrypt',
      category: 'session_integrity',
      passed: false,
      details: `Exception: ${err?.message || err}`
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Login dengan Password Salah
  // ---------------------------------------------------------------------------
  try {
    const res = await loginWithCustomAuth({
      identifier: 'rays',
      password: 'wrong_password_123',
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 Test Suite'
    });

    const attemptLogged = mockDb.loginAttempts.some(a => a.identifier === 'rays' && !a.success);
    const pass = !res.success && res.error?.code === 'INVALID_CREDENTIALS' && attemptLogged;

    testResults.push({
      testNumber: 2,
      name: 'Login dengan Password Salah',
      category: 'resilience_test',
      passed: pass,
      details: pass
        ? 'Login ditolak dengan kode INVALID_CREDENTIALS, percobaan gagal tercatat di login_attempts.'
        : `Gagal: res.success=${res.success}, code=${res.error?.code}`
    });
  } catch (err: any) {
    testResults.push({
      testNumber: 2,
      name: 'Login dengan Password Salah',
      category: 'resilience_test',
      passed: false,
      details: `Exception: ${err?.message || err}`
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Login Saat Supabase Tidak Tersedia (Fail-Closed)
  // ---------------------------------------------------------------------------
  try {
    const oldNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    setSimulateSupabaseUnavailable(true);

    const res = await loginWithCustomAuth({
      identifier: 'rays',
      password: 'mora2026',
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 Test Suite'
    });

    process.env.NODE_ENV = oldNodeEnv;
    setSimulateSupabaseUnavailable(false);

    const pass = !res.success && res.error?.code === 'DATABASE_UNAVAILABLE';

    testResults.push({
      testNumber: 3,
      name: 'Login Saat Supabase Tidak Tersedia (Fail-Closed)',
      category: 'resilience_test',
      passed: pass,
      details: pass
        ? 'Login langsung ditolak dengan DATABASE_UNAVAILABLE tanpa fallback lokal saat Supabase offline pada mode produksi.'
        : `Gagal: res.success=${res.success}, code=${res.error?.code}`
    });
  } catch (err: any) {
    testResults.push({
      testNumber: 3,
      name: 'Login Saat Supabase Tidak Tersedia (Fail-Closed)',
      category: 'resilience_test',
      passed: false,
      details: `Exception: ${err?.message || err}`
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Login Ketika Session Insert Gagal
  // ---------------------------------------------------------------------------
  try {
    mockDb.reset();
    setSimulateSessionInsertFailure(true);

    const res = await loginWithCustomAuth({
      identifier: 'rays',
      password: 'mora2026',
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 Test Suite'
    });

    setSimulateSessionInsertFailure(false);

    const noSessionsCreated = mockDb.authSessions.size === 0;
    const pass = !res.success && (res.error?.code === 'SESSION_INSERT_FAILED' || res.error?.code === 'SESSION_PERSISTENCE_FAILED') && noSessionsCreated;

    testResults.push({
      testNumber: 4,
      name: 'Login Ketika Session Insert Gagal',
      category: 'resilience_test',
      passed: pass,
      details: pass
        ? 'Login berhasil dibatalkan, error dilaporkan, dan tidak ada sesi yang bocor ke state aplikasi.'
        : `Gagal: res.success=${res.success}, code=${res.error?.code}`
    });
  } catch (err: any) {
    testResults.push({
      testNumber: 4,
      name: 'Login Ketika Session Insert Gagal',
      category: 'resilience_test',
      passed: false,
      details: `Exception: ${err?.message || err}`
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Login Ketika Refresh Token Insert Gagal (Atomic Compensation Rollback)
  // ---------------------------------------------------------------------------
  try {
    mockDb.reset();
    setSimulateRefreshTokenInsertFailure(true);

    const res = await loginWithCustomAuth({
      identifier: 'rays',
      password: 'mora2026',
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 Test Suite'
    });

    setSimulateRefreshTokenInsertFailure(false);

    // Verify session record was rolled back (deleted from database)
    const sessionsInDb = mockDb.authSessions.size;
    const pass = !res.success && (res.error?.code === 'REFRESH_TOKEN_INSERT_FAILED' || res.error?.code === 'SESSION_PERSISTENCE_FAILED') && sessionsInDb === 0;

    testResults.push({
      testNumber: 5,
      name: 'Login Ketika Refresh Token Insert Gagal (Atomic Compensation Rollback)',
      category: 'resilience_test',
      passed: pass,
      details: pass
        ? 'Kegagalan refresh token membatalkan login dan melakukan kompensasi atomik menghapus auth_session yang sempat terbuat.'
        : `Gagal: res.success=${res.success}, sessionsRemaining=${sessionsInDb}`
    });
  } catch (err: any) {
    testResults.push({
      testNumber: 5,
      name: 'Login Ketika Refresh Token Insert Gagal (Atomic Compensation Rollback)',
      category: 'resilience_test',
      passed: false,
      details: `Exception: ${err?.message || err}`
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Validasi Token Lama / Kedaluwarsa
  // ---------------------------------------------------------------------------
  try {
    mockDb.reset();
    resetSimulateFlags();

    const loginRes = await loginWithCustomAuth({
      identifier: 'rays',
      password: 'mora2026'
    });

    const accessToken = loginRes.data!.tokens.accessToken;
    const sessionId = loginRes.data!.sessionId;

    // Manually expire the session in PostgreSQL
    const sess = mockDb.authSessions.get(sessionId);
    if (sess) {
      sess.expires_at = new Date(Date.now() - 1000 * 60).toISOString(); // 1 minute in the past
    }

    const verifyRes = await verifyAccessToken(accessToken);
    const pass = !verifyRes.success && verifyRes.error?.code === 'TOKEN_EXPIRED';

    testResults.push({
      testNumber: 6,
      name: 'Validasi Token Lama / Kedaluwarsa',
      category: 'session_integrity',
      passed: pass,
      details: pass
        ? 'Sesi dengan expires_at di masa lampau ditolak dengan kode TOKEN_EXPIRED.'
        : `Gagal: verifyRes.success=${verifyRes.success}, code=${verifyRes.error?.code}`
    });
  } catch (err: any) {
    testResults.push({
      testNumber: 6,
      name: 'Validasi Token Lama / Kedaluwarsa',
      category: 'session_integrity',
      passed: false,
      details: `Exception: ${err?.message || err}`
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Session Version Mismatch (Invalidasi Sesi Lama)
  // ---------------------------------------------------------------------------
  try {
    mockDb.reset();
    resetSimulateFlags();

    // Login at session_version 1
    const loginRes = await loginWithCustomAuth({
      identifier: 'rays',
      password: 'mora2026'
    });

    const accessToken = loginRes.data!.tokens.accessToken;
    const sessionId = loginRes.data!.sessionId;

    // Bump user session_version in users table to 2 (simulating password reset or admin revocation)
    const user = mockDb.users.get('u-ray');
    user.session_version = 2;

    const verifyRes = await verifyAccessToken(accessToken);
    const sessionInDb = mockDb.authSessions.get(sessionId);

    const pass = !verifyRes.success && verifyRes.error?.code === 'SESSION_REVOKED' && Boolean(sessionInDb?.revoked_at);

    testResults.push({
      testNumber: 7,
      name: 'Session Version Mismatch (Invalidasi Sesi Lama)',
      category: 'session_integrity',
      passed: pass,
      details: pass
        ? 'Token dengan session_version lama ditolak dengan SESSION_REVOKED dan record sesi langsung dicabut di PostgreSQL.'
        : `Gagal: verifyRes.success=${verifyRes.success}, code=${verifyRes.error?.code}`
    });
  } catch (err: any) {
    testResults.push({
      testNumber: 7,
      name: 'Session Version Mismatch (Invalidasi Sesi Lama)',
      category: 'session_integrity',
      passed: false,
      details: `Exception: ${err?.message || err}`
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Refresh Token Replay Protection
  // ---------------------------------------------------------------------------
  try {
    mockDb.reset();
    resetSimulateFlags();

    const loginRes = await loginWithCustomAuth({
      identifier: 'rays',
      password: 'mora2026'
    });

    const rawRt = loginRes.data!.tokens.refreshToken;

    // First rotation -> should succeed
    const firstRotation = await rotateRefreshToken(rawRt);
    const firstPass = firstRotation.success && firstRotation.data?.tokens?.refreshToken;

    // Second rotation using the SAME old refresh token -> must be rejected as REPLAY ATTACK!
    const replayAttempt = await rotateRefreshToken(rawRt);
    const replayRejected = !replayAttempt.success && replayAttempt.error?.code === 'REFRESH_TOKEN_REVOKED';

    const pass = Boolean(firstPass && replayRejected);

    testResults.push({
      testNumber: 8,
      name: 'Refresh Token Replay Protection',
      category: 'session_integrity',
      passed: pass,
      details: pass
        ? 'Rotasi pertama berhasil mencabut token lama; rotasi kedua dengan token yang sama ditolak (Replay Attack Protection aktif).'
        : `Gagal: firstPass=${firstPass}, replayRejected=${replayRejected}`
    });
  } catch (err: any) {
    testResults.push({
      testNumber: 8,
      name: 'Refresh Token Replay Protection',
      category: 'session_integrity',
      passed: false,
      details: `Exception: ${err?.message || err}`
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 9: Logout (Pencabutan Sesi Tunggal)
  // ---------------------------------------------------------------------------
  try {
    mockDb.reset();
    resetSimulateFlags();

    const loginRes = await loginWithCustomAuth({
      identifier: 'rays',
      password: 'mora2026'
    });

    const accessToken = loginRes.data!.tokens.accessToken;
    const sessionId = loginRes.data!.sessionId;

    const logoutSuccess = await revokeSingleSession(accessToken);
    const sessionInDb = mockDb.authSessions.get(sessionId);
    const isRevoked = Boolean(sessionInDb?.revoked_at);

    // Verify token is now rejected
    const verifyAfterLogout = await verifyAccessToken(accessToken);
    const rejectedAfterLogout = !verifyAfterLogout.success && verifyAfterLogout.error?.code === 'SESSION_REVOKED';

    const pass = logoutSuccess && isRevoked && rejectedAfterLogout;

    testResults.push({
      testNumber: 9,
      name: 'Logout (Pencabutan Sesi Tunggal)',
      category: 'session_integrity',
      passed: pass,
      details: pass
        ? 'Logout mencabut sesi di PostgreSQL dan verifikasi berikutnya menghasilkan SESSION_REVOKED.'
        : `Gagal: logoutSuccess=${logoutSuccess}, isRevoked=${isRevoked}, rejected=${rejectedAfterLogout}`
    });
  } catch (err: any) {
    testResults.push({
      testNumber: 9,
      name: 'Logout (Pencabutan Sesi Tunggal)',
      category: 'session_integrity',
      passed: false,
      details: `Exception: ${err?.message || err}`
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 10: Reset Password oleh Superadmin
  // ---------------------------------------------------------------------------
  try {
    mockDb.reset();
    resetSimulateFlags();

    // 1. Initial login
    const loginRes = await loginWithCustomAuth({
      identifier: 'rays',
      password: 'mora2026'
    });
    const oldAccessToken = loginRes.data!.tokens.accessToken;

    // 2. Perform reset password: new password 'NewPass2026!'
    const newHash = await hashPasswordWithBcrypt('NewPass2026!');
    const targetUser = mockDb.users.get('u-ray');
    const prevVersion = targetUser.session_version || 1;
    targetUser.password_hash = newHash;

    // Revoke all sessions atomically (bumps version and revokes tokens)
    const revokeRes = await revokeAllUserSessions('u-ray', 'superadmin');

    const newVersion = targetUser.session_version;
    const oldTokenCheck = await verifyAccessToken(oldAccessToken);

    const pass = Boolean(
      revokeRes.success &&
      newVersion > prevVersion &&
      !oldTokenCheck.success &&
      oldTokenCheck.error?.code === 'SESSION_REVOKED'
    );

    testResults.push({
      testNumber: 10,
      name: 'Reset Password oleh Superadmin',
      category: 'session_integrity',
      passed: pass,
      details: pass
        ? `Password diubah ke bcrypt, session_version dinaikkan dari ${prevVersion} ke ${newVersion}, seluruh sesi aktif lama langsung dicabut.`
        : `Gagal: revokeSuccess=${revokeRes.success}, newVer=${newVersion}`
    });
  } catch (err: any) {
    testResults.push({
      testNumber: 10,
      name: 'Reset Password oleh Superadmin',
      category: 'session_integrity',
      passed: false,
      details: `Exception: ${err?.message || err}`
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 11: Revoke Seluruh Sesi Aktif Pengguna
  // ---------------------------------------------------------------------------
  try {
    mockDb.reset();
    resetSimulateFlags();

    // Create 2 sessions for rays
    const login1 = await loginWithCustomAuth({ identifier: 'rays', password: 'mora2026' });
    const login2 = await loginWithCustomAuth({ identifier: 'rays', password: 'mora2026' });

    const token1 = login1.data!.tokens.accessToken;
    const token2 = login2.data!.tokens.accessToken;

    const revokeAllRes = await revokeAllUserSessions('u-ray');

    const check1 = await verifyAccessToken(token1);
    const check2 = await verifyAccessToken(token2);

    const pass = Boolean(
      revokeAllRes.success &&
      !check1.success && check1.error?.code === 'SESSION_REVOKED' &&
      !check2.success && check2.error?.code === 'SESSION_REVOKED'
    );

    testResults.push({
      testNumber: 11,
      name: 'Revoke Seluruh Sesi Aktif Pengguna',
      category: 'session_integrity',
      passed: pass,
      details: pass
        ? 'Seluruh sesi aktif (sesi 1 & sesi 2) pengguna berhasil dicabut sekaligus via revokeAllUserSessions.'
        : `Gagal: revokeSuccess=${revokeAllRes.success}, check1=${check1.success}, check2=${check2.success}`
    });
  } catch (err: any) {
    testResults.push({
      testNumber: 11,
      name: 'Revoke Seluruh Sesi Aktif Pengguna',
      category: 'session_integrity',
      passed: false,
      details: `Exception: ${err?.message || err}`
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 12: Login Kembali Setelah Password Diganti
  // ---------------------------------------------------------------------------
  try {
    mockDb.reset();
    resetSimulateFlags();

    // Change password to new password
    const newHash = await hashPasswordWithBcrypt('newPasswordMora2026');
    const user = mockDb.users.get('u-ray');
    user.password_hash = newHash;
    await revokeAllUserSessions('u-ray');

    // Attempt login with old password -> MUST FAIL
    const oldLogin = await loginWithCustomAuth({
      identifier: 'rays',
      password: 'mora2026'
    });

    // Attempt login with new password -> MUST SUCCEED
    const newLogin = await loginWithCustomAuth({
      identifier: 'rays',
      password: 'newPasswordMora2026'
    });

    const pass = Boolean(
      !oldLogin.success &&
      oldLogin.error?.code === 'INVALID_CREDENTIALS' &&
      newLogin.success &&
      newLogin.data?.tokens?.accessToken &&
      newLogin.data?.user?.sessionVersion === user.session_version
    );

    testResults.push({
      testNumber: 12,
      name: 'Login Kembali Setelah Password Diganti',
      category: 'session_integrity',
      passed: pass,
      details: pass
        ? 'Login dengan password lama ditolak, login dengan password baru sukses dengan session_version terbaru.'
        : `Gagal: oldLogin=${oldLogin.success}, newLogin=${newLogin.success}`
    });
  } catch (err: any) {
    testResults.push({
      testNumber: 12,
      name: 'Login Kembali Setelah Password Diganti',
      category: 'session_integrity',
      passed: false,
      details: `Exception: ${err?.message || err}`
    });
  }

  // Cleanup testing stubs
  resetSupabaseBackendClientForTesting();
  resetSimulateFlags();

  // Print Summary Table
  console.log('----------------------------------------------------------------');
  console.log('TEST EXECUTION SUMMARY:');
  console.log('----------------------------------------------------------------');
  let allPassed = true;
  for (const r of testResults) {
    const status = r.passed ? '✓ PASS' : '✗ FAIL';
    if (!r.passed) allPassed = false;
    console.log(`[${status}] Test ${r.testNumber}: ${r.name}`);
    console.log(`       Details: ${r.details}\n`);
  }
  console.log('----------------------------------------------------------------');
  console.log(`TOTAL: ${testResults.filter(r => r.passed).length}/${testResults.length} PASSED`);
  console.log('----------------------------------------------------------------\n');

  return { passed: allPassed, results: testResults };
}

// Execute immediately if invoked directly
runAllTests().then(outcome => {
  if (!outcome.passed) {
    process.exit(1);
  }
});
