import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getSupabaseBackendClient, isSupabaseConfigured } from './supabaseClient.ts';
import {
  findUserInSupabaseDetailed,
  getUsersFromSupabase,
  insertUserToSupabase,
  updateUserInSupabase,
  postgresRowToUser,
  userToPostgresRow,
  classifySupabaseError
} from './supabaseAdapter.ts';
import type { ServerUser, ServerSession } from '../server.ts';
import { db, saveDatabaseToDisk, isLocalJsonModeAllowed, logServerAuditAsync, hashPasswordLegacy } from '../server.ts';

// ==============================================================================
// MORAJAWS CUSTOM AUTHENTICATION SERVICE (PHASE 1 REMEDIATION)
// Fail-Closed Custom Authentication & PostgreSQL Session Integrity Engine.
//
// Rules enforced:
// 1. Production requires Supabase PostgreSQL (fail-closed if unavailable).
// 2. All logins verify accounts against public.users.
// 3. All sessions are persisted to public.auth_sessions.
// 4. All refresh tokens are persisted to public.refresh_tokens with rotation.
// 5. Session validation verifies session_version against authoritative public.users.
// 6. Token hashes stored (SHA-256) - raw tokens never stored in database.
// 7. Atomic transaction with compensation rollback on session or refresh token failure.
// 8. Replay attacks on refresh tokens are strictly rejected.
// 9. Local fallback stores are STRICTLY FORBIDDEN on production (NODE_ENV=production).
// ==============================================================================

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  expiresAt: string;
}

export interface CustomAuthResult<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface StoredAuthSession {
  id: string;
  userId: string;
  sessionIdHash: string;
  tokenHash: string;
  expiresAt: string;
  lastActivityAt: string;
  sessionVersion?: number;
  revokedAt?: string | null;
  ipAddress?: string;
  userAgent?: string;
  deviceType?: string;
  createdAt: string;
}

export interface StoredRefreshToken {
  id: string;
  userId: string;
  sessionId: string;
  tokenHash: string;
  expiresAt: string;
  sessionVersion?: number;
  revokedAt?: string | null;
  replacedByTokenHash?: string | null;
  createdAt: string;
}

export interface StoredLoginAttempt {
  id: string;
  identifier: string;
  ipAddress?: string;
  success: boolean;
  reason?: string;
  attemptedAt: string;
}

// In-memory fallback stores (strictly allowed ONLY in non-production local development)
export const LOCAL_AUTH_SESSIONS: StoredAuthSession[] = [];
export const LOCAL_REFRESH_TOKENS: StoredRefreshToken[] = [];
export const LOCAL_LOGIN_ATTEMPTS: StoredLoginAttempt[] = [];

// Simulation flags for testing resilience and failure injection
let simulateSessionInsertFailure = false;
let simulateRefreshTokenInsertFailure = false;
let simulateSupabaseUnavailable = false;

export function setSimulateSessionInsertFailure(val: boolean): void {
  simulateSessionInsertFailure = val;
}

export function setSimulateRefreshTokenInsertFailure(val: boolean): void {
  simulateRefreshTokenInsertFailure = val;
}

export function setSimulateSupabaseUnavailable(val: boolean): void {
  simulateSupabaseUnavailable = val;
}

export function resetSimulateFlags(): void {
  simulateSessionInsertFailure = false;
  simulateRefreshTokenInsertFailure = false;
  simulateSupabaseUnavailable = false;
}

/**
 * Determines whether local fallback (memory/JSON) is permitted.
 * STRICT: Returns false on production (NODE_ENV=production or APP_ENV=production).
 * Returns true only when NOT in production and isLocalJsonModeAllowed() is true.
 */
export function isLocalAuthAllowed(): boolean {
  if (process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production') {
    return false;
  }
  return isLocalJsonModeAllowed();
}

/**
 * Resolves active Supabase backend client with fail-closed checks.
 * Honors simulation flag for testing.
 */
function getActiveBackendClient() {
  if (simulateSupabaseUnavailable) {
    return null;
  }
  return getSupabaseBackendClient();
}

// Rate limiting & lockout tracker (in-memory fast cache, backed by login_attempts table)
interface LockoutTracker {
  attempts: number;
  lastAttemptAt: number;
  lockedUntil?: number;
}
const MEMORY_RATE_LIMITER = new Map<string, LockoutTracker>();

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes window
const ACCESS_TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ------------------------------------------------------------------------------
// PASSWORD HASHING & COMPLEXITY
// ------------------------------------------------------------------------------

/**
 * Validates password strength:
 * - Minimum 8 characters
 * - Must contain at least one letter and at least one number
 */
export function validatePasswordStrength(password: string): { valid: boolean; error?: string } {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Kata sandi wajib diisi.' };
  }
  if (password.length < 8) {
    return { valid: false, error: 'Kata sandi harus terdiri dari minimal 8 karakter.' };
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return { valid: false, error: 'Kata sandi harus mengandung kombinasi huruf dan angka.' };
  }
  return { valid: true };
}

/**
 * Generates a standard bcrypt hash (10 salt rounds).
 */
export async function hashPasswordWithBcrypt(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Verifies a candidate password against stored password hash.
 * Supports:
 * 1. Standard bcrypt hash ($2a$, $2b$, $2y$)
 * 2. Legacy PBKDF2 hash (pbkdf2:sha256:iterations:salt:hash)
 * 3. Legacy FNV-1a hash
 * If verified via a legacy algorithm, returns `needsRehash: true` so the caller
 * can automatically upgrade the stored hash to bcrypt.
 */
export async function verifyUserPasswordEx(
  password?: string,
  storedHash?: string
): Promise<{ valid: boolean; needsRehash?: boolean }> {
  if (!password || !storedHash || typeof password !== 'string' || typeof storedHash !== 'string') {
    return { valid: false };
  }

  // 1. Check bcrypt
  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
    try {
      const match = await bcrypt.compare(password, storedHash);
      return { valid: match, needsRehash: false };
    } catch {
      return { valid: false };
    }
  }

  // 2. Check PBKDF2 legacy format
  if (storedHash.startsWith('pbkdf2:sha256:')) {
    const parts = storedHash.split(':');
    if (parts.length === 5) {
      const iterations = parseInt(parts[2], 10);
      const salt = parts[3];
      const originalHash = parts[4];
      if (!isNaN(iterations) && salt && originalHash) {
        try {
          const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
          const isValid = crypto.timingSafeEqual(
            Buffer.from(derivedKey.toString('hex')),
            Buffer.from(originalHash)
          );
          return { valid: isValid, needsRehash: isValid };
        } catch {}
      }
    }
  }

  // 3. Check legacy FNV hash (e.g., initial seed hash '28232849' or salted)
  const legacyAttempt = hashPasswordLegacy(password);
  if (legacyAttempt.length === storedHash.length) {
    try {
      const match = crypto.timingSafeEqual(Buffer.from(legacyAttempt), Buffer.from(storedHash));
      if (match) return { valid: true, needsRehash: true };
    } catch {}
  }
  if (legacyAttempt === storedHash) {
    return { valid: true, needsRehash: true };
  }

  return { valid: false };
}

// ------------------------------------------------------------------------------
// TOKEN GENERATION & HASHING
// ------------------------------------------------------------------------------

/**
 * Generates cryptographically secure random access token tied to sessionVersion.
 */
export function generateSecureAccessToken(sessionVersion: number = 1): string {
  const v = Math.max(1, typeof sessionVersion === 'number' ? sessionVersion : 1);
  return `mora_at_v${v}_${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * Generates cryptographically secure random refresh token tied to sessionVersion.
 */
export function generateSecureRefreshToken(sessionVersion: number = 1): string {
  const v = Math.max(1, typeof sessionVersion === 'number' ? sessionVersion : 1);
  return `mora_rt_v${v}_${crypto.randomBytes(48).toString('hex')}`;
}

/**
 * Computes SHA-256 hash of a token for secure database indexing and storage.
 * Raw tokens are never stored plaintext in the database.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

// ------------------------------------------------------------------------------
// RATE LIMITING & LOCKOUT MANAGEMENT
// ------------------------------------------------------------------------------

/**
 * Evaluates whether an identifier or IP is currently locked out due to excessive failed attempts.
 */
export async function checkRateLimitAndLockout(
  identifier: string,
  ipAddress?: string
): Promise<{ isLocked: boolean; remainingSeconds?: number; message?: string }> {
  const now = Date.now();
  const cleanId = (identifier || '').trim().toLowerCase();
  const key = `${cleanId}_${ipAddress || 'unknown'}`;

  // 1. Fast in-memory check
  const memTracker = MEMORY_RATE_LIMITER.get(key) || MEMORY_RATE_LIMITER.get(cleanId);
  if (memTracker && memTracker.lockedUntil && memTracker.lockedUntil > now) {
    const remainingSeconds = Math.ceil((memTracker.lockedUntil - now) / 1000);
    return {
      isLocked: true,
      remainingSeconds,
      message: `Terlalu banyak percobaan login gagal. Akun dikunci sementara. Silakan coba kembali dalam ${remainingSeconds} detik.`
    };
  }

  // 2. Authoritative check in Supabase PostgreSQL login_attempts
  const client = getActiveBackendClient();
  if (client) {
    try {
      const windowStart = new Date(now - ATTEMPT_WINDOW_MS).toISOString();
      const { data, error } = await client
        .from('login_attempts')
        .select('success, attempted_at')
        .eq('identifier', cleanId)
        .gte('attempted_at', windowStart)
        .order('attempted_at', { ascending: false })
        .limit(10);

      if (!error && Array.isArray(data)) {
        let consecutiveFailures = 0;
        let lastFailureTime = now;
        for (const row of data) {
          if (!row.success) {
            consecutiveFailures++;
            lastFailureTime = new Date(row.attempted_at).getTime();
          } else {
            break; // Stop at most recent success
          }
        }

        if (consecutiveFailures >= MAX_FAILED_ATTEMPTS) {
          const lockExpires = lastFailureTime + LOCKOUT_DURATION_MS;
          if (lockExpires > now) {
            const remainingSeconds = Math.ceil((lockExpires - now) / 1000);
            MEMORY_RATE_LIMITER.set(cleanId, {
              attempts: consecutiveFailures,
              lastAttemptAt: now,
              lockedUntil: lockExpires
            });
            return {
              isLocked: true,
              remainingSeconds,
              message: `Terlalu banyak percobaan login gagal. Akun dikunci sementara. Silakan coba kembali dalam ${remainingSeconds} detik.`
            };
          }
        }
      }
    } catch (err) {
      console.warn('[RateLimiter] Database query check warning:', err);
    }
  }

  return { isLocked: false };
}

/**
 * Records a login attempt into Supabase PostgreSQL login_attempts table and in-memory tracker.
 */
export async function recordLoginAttempt(params: {
  identifier: string;
  ipAddress?: string;
  success: boolean;
  reason?: string;
}): Promise<void> {
  const { identifier, ipAddress, success, reason } = params;
  const cleanId = (identifier || '').trim().toLowerCase();
  const now = Date.now();
  const attemptId = `att_${now}_${crypto.randomBytes(6).toString('hex')}`;
  const nowIso = new Date(now).toISOString();

  // Update in-memory tracker
  const key = `${cleanId}_${ipAddress || 'unknown'}`;
  const current = MEMORY_RATE_LIMITER.get(key) || { attempts: 0, lastAttemptAt: now };
  if (success) {
    MEMORY_RATE_LIMITER.delete(key);
    MEMORY_RATE_LIMITER.delete(cleanId);
  } else {
    current.attempts += 1;
    current.lastAttemptAt = now;
    if (current.attempts >= MAX_FAILED_ATTEMPTS) {
      current.lockedUntil = now + LOCKOUT_DURATION_MS;
    }
    MEMORY_RATE_LIMITER.set(key, current);
    MEMORY_RATE_LIMITER.set(cleanId, current);
  }

  // Persist to Supabase PostgreSQL login_attempts table
  const client = getActiveBackendClient();
  if (client) {
    try {
      await client.from('login_attempts').insert([
        {
          id: attemptId,
          identifier: cleanId,
          ip_address: ipAddress || null,
          success,
          reason: reason || null,
          attempted_at: nowIso
        }
      ]);
    } catch (err: any) {
      console.warn('[CustomAuth] Record login attempt warning:', err?.message || err);
    }
  }

  if (isLocalAuthAllowed()) {
    LOCAL_LOGIN_ATTEMPTS.unshift({
      id: attemptId,
      identifier: cleanId,
      ipAddress,
      success,
      reason,
      attemptedAt: nowIso
    });
    if (LOCAL_LOGIN_ATTEMPTS.length > 500) LOCAL_LOGIN_ATTEMPTS.pop();
  }
}

// ------------------------------------------------------------------------------
// DATABASE SESSION & TOKEN OPERATIONS (SUPABASE POSTGRESQL AUTHORITATIVE)
// ------------------------------------------------------------------------------

/**
 * Creates an authoritative auth session and associated initial refresh token in Supabase PostgreSQL.
 *
 * Enforces Fail-Closed & Atomic Session Persistence:
 * 1. Tokens created cryptographically secure.
 * 2. SHA-256 token hashes stored; raw tokens never stored.
 * 3. Session record inserted to auth_sessions with session_version.
 * 4. Refresh token record inserted to refresh_tokens with session_version.
 * 5. If either insert fails, atomic compensation rolls back the entire session.
 * 6. Never returns success if session persistence failed.
 * 7. In production, local storage is NEVER used as fallback.
 */
export async function persistNewAuthSession(params: {
  userId: string;
  accessToken: string;
  refreshToken: string;
  ipAddress?: string;
  userAgent?: string;
  sessionVersion?: number;
}): Promise<CustomAuthResult<{ sessionId: string; expiresAt: string }>> {
  const { userId, accessToken, refreshToken, ipAddress, userAgent, sessionVersion = 1 } = params;
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const expiresAt = new Date(now + ACCESS_TOKEN_TTL_MS).toISOString();
  const refreshExpiresAt = new Date(now + REFRESH_TOKEN_TTL_MS).toISOString();

  const sessionId = `sess_${now}_${crypto.randomBytes(8).toString('hex')}`;
  const rtId = `rt_${now}_${crypto.randomBytes(8).toString('hex')}`;

  const sessionHash = hashToken(accessToken);
  const rtHash = hashToken(refreshToken);

  const deviceType = userAgent && /mobile|android|iphone/i.test(userAgent) ? 'mobile' : 'desktop';

  const client = getActiveBackendClient();

  // Fail-closed check: Supabase PostgreSQL is MANDATORY in production
  if (!client) {
    if (!isLocalAuthAllowed()) {
      return {
        success: false,
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Koneksi Supabase PostgreSQL wajib tersedia pada environment produksi untuk menyimpan sesi login.'
        }
      };
    }

    // Non-production local fallback mode explicitly permitted
    const localSess: StoredAuthSession = {
      id: sessionId,
      userId,
      sessionIdHash: sessionHash,
      tokenHash: sessionHash,
      expiresAt,
      lastActivityAt: nowIso,
      sessionVersion,
      revokedAt: null,
      ipAddress,
      userAgent,
      deviceType,
      createdAt: nowIso
    };
    const localRt: StoredRefreshToken = {
      id: rtId,
      userId,
      sessionId,
      tokenHash: rtHash,
      sessionVersion,
      expiresAt: refreshExpiresAt,
      revokedAt: null,
      replacedByTokenHash: null,
      createdAt: nowIso
    };

    LOCAL_AUTH_SESSIONS.push(localSess);
    LOCAL_REFRESH_TOKENS.push(localRt);

    return {
      success: true,
      data: { sessionId, expiresAt }
    };
  }

  // Handle simulation hooks for testing
  if (simulateSessionInsertFailure) {
    return {
      success: false,
      error: {
        code: 'SESSION_INSERT_FAILED',
        message: 'Simulasi kegagalan penyimpanan auth_sessions ke PostgreSQL.'
      }
    };
  }

  // 1. Attempt atomic RPC function if provisioned in PostgreSQL (from migration 009)
  try {
    const { data: rpcData, error: rpcError } = await client.rpc('fn_create_auth_session_atomic', {
      p_session_id: sessionId,
      p_user_id: userId,
      p_session_id_hash: sessionHash,
      p_token_hash: sessionHash,
      p_rt_id: rtId,
      p_rt_hash: rtHash,
      p_session_expires_at: expiresAt,
      p_rt_expires_at: refreshExpiresAt,
      p_session_version: sessionVersion,
      p_ip_address: ipAddress || null,
      p_user_agent: userAgent || null,
      p_device_type: deviceType
    });

    if (!rpcError && rpcData?.success) {
      if (isLocalAuthAllowed()) {
        LOCAL_AUTH_SESSIONS.push({
          id: sessionId,
          userId,
          sessionIdHash: sessionHash,
          tokenHash: sessionHash,
          expiresAt,
          lastActivityAt: nowIso,
          sessionVersion,
          revokedAt: null,
          ipAddress,
          userAgent,
          deviceType,
          createdAt: nowIso
        });
        LOCAL_REFRESH_TOKENS.push({
          id: rtId,
          userId,
          sessionId,
          tokenHash: rtHash,
          sessionVersion,
          expiresAt: refreshExpiresAt,
          revokedAt: null,
          replacedByTokenHash: null,
          createdAt: nowIso
        });
      }
      return { success: true, data: { sessionId, expiresAt } };
    }
  } catch {
    // RPC not present in schema yet; proceed with strict transactional insert with rollback
  }

  // 2. Sequential transactional insert with Fail-Closed compensation rollback
  try {
    // A. Insert Session Record
    const sessionInsertPayload: any = {
      id: sessionId,
      user_id: userId,
      session_id_hash: sessionHash,
      token_hash: sessionHash,
      expires_at: expiresAt,
      last_activity_at: nowIso,
      session_version: sessionVersion,
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
      device_type: deviceType,
      created_at: nowIso
    };

    const { error: sessErr } = await client.from('auth_sessions').insert([sessionInsertPayload]);
    if (sessErr) {
      // If error was due to missing session_version column in legacy schema, retry without it
      if (sessErr.code === '42703' || sessErr.message?.includes('session_version')) {
        delete sessionInsertPayload.session_version;
        const { error: sessRetryErr } = await client.from('auth_sessions').insert([sessionInsertPayload]);
        if (sessRetryErr) {
          return {
            success: false,
            error: {
              code: 'SESSION_INSERT_FAILED',
              message: `Gagal menyimpan session record ke PostgreSQL: ${sessRetryErr.message}`
            }
          };
        }
      } else {
        return {
          success: false,
          error: {
            code: 'SESSION_INSERT_FAILED',
            message: `Gagal menyimpan session record ke PostgreSQL: ${sessErr.message}`
          }
        };
      }
    }

    // Simulation hook for refresh token failure testing
    if (simulateRefreshTokenInsertFailure) {
      // ATOMIC COMPENSATION ROLLBACK: Delete previously inserted session record
      await client.from('auth_sessions').delete().eq('id', sessionId);
      return {
        success: false,
        error: {
          code: 'REFRESH_TOKEN_INSERT_FAILED',
          message: 'Simulasi kegagalan penyimpanan refresh_tokens ke PostgreSQL.'
        }
      };
    }

    // B. Insert Refresh Token Record
    const rtInsertPayload: any = {
      id: rtId,
      user_id: userId,
      session_id: sessionId,
      token_hash: rtHash,
      session_version: sessionVersion,
      expires_at: refreshExpiresAt,
      created_at: nowIso
    };

    const { error: rtErr } = await client.from('refresh_tokens').insert([rtInsertPayload]);
    if (rtErr) {
      // If error was due to missing session_version column, retry without it
      let insertFailed = true;
      if (rtErr.code === '42703' || rtErr.message?.includes('session_version')) {
        delete rtInsertPayload.session_version;
        const { error: rtRetryErr } = await client.from('refresh_tokens').insert([rtInsertPayload]);
        if (!rtRetryErr) {
          insertFailed = false;
        }
      }

      if (insertFailed) {
        // ATOMIC COMPENSATION ROLLBACK: Delete the created session record!
        try {
          await client.from('auth_sessions').delete().eq('id', sessionId);
        } catch (delErr) {
          console.error('[CustomAuth] Failed to rollback auth_session after refresh_token failure:', delErr);
        }

        return {
          success: false,
          error: {
            code: 'REFRESH_TOKEN_INSERT_FAILED',
            message: `Gagal menyimpan refresh token record ke PostgreSQL: ${rtErr.message}. Sesi login dibatalkan secara atomik.`
          }
        };
      }
    }

    // Mirror to local memory ONLY if in local mode
    if (isLocalAuthAllowed()) {
      LOCAL_AUTH_SESSIONS.push({
        id: sessionId,
        userId,
        sessionIdHash: sessionHash,
        tokenHash: sessionHash,
        expiresAt,
        lastActivityAt: nowIso,
        sessionVersion,
        revokedAt: null,
        ipAddress,
        userAgent,
        deviceType,
        createdAt: nowIso
      });
      LOCAL_REFRESH_TOKENS.push({
        id: rtId,
        userId,
        sessionId,
        tokenHash: rtHash,
        sessionVersion,
        expiresAt: refreshExpiresAt,
        revokedAt: null,
        replacedByTokenHash: null,
        createdAt: nowIso
      });
    }

    return {
      success: true,
      data: { sessionId, expiresAt }
    };
  } catch (err: any) {
    // Fail closed on exception
    try {
      await client.from('auth_sessions').delete().eq('id', sessionId);
    } catch {}
    return {
      success: false,
      error: {
        code: 'SESSION_PERSISTENCE_FAILED',
        message: `Terjadi exception saat menyimpan sesi login: ${err?.message || err}`
      }
    };
  }
}

/**
 * Verifies access token against Supabase PostgreSQL auth_sessions table and authoritative user status.
 *
 * Rules:
 * 1. Validates token format and computes SHA-256 hash.
 * 2. In production, Supabase PostgreSQL MUST be queried (no local memory fallback).
 * 3. Rejects revoked sessions and expired sessions.
 * 4. Compares session_version between user and session/token; rejects if mismatched.
 * 5. Database failure fails closed with DATABASE_UNAVAILABLE.
 */
export async function verifyAccessToken(
  token: string
): Promise<CustomAuthResult<{ user: ServerUser; session: StoredAuthSession }>> {
  if (!token || typeof token !== 'string' || !token.trim()) {
    return {
      success: false,
      error: { code: 'UNAUTHENTICATED', message: 'Token otentikasi tidak ditemukan.' }
    };
  }

  const cleanToken = token.trim();
  const tokenHash = hashToken(cleanToken);
  const now = Date.now();
  const client = getActiveBackendClient();

  // Fail-closed in production if Supabase client is not available
  if (!client && !isLocalAuthAllowed()) {
    return {
      success: false,
      error: { code: 'DATABASE_UNAVAILABLE', message: 'Database PostgreSQL tidak tersedia saat verifikasi sesi login.' }
    };
  }

  let matchedSession: StoredAuthSession | null = null;

  // 1. Authoritative check in Supabase PostgreSQL auth_sessions
  if (client) {
    try {
      const { data, error } = await client
        .from('auth_sessions')
        .select('*')
        .or(`session_id_hash.eq.${tokenHash},token_hash.eq.${tokenHash}`)
        .limit(1)
        .maybeSingle();

      if (error) {
        if (!isLocalAuthAllowed()) {
          return {
            success: false,
            error: { code: 'DATABASE_UNAVAILABLE', message: `Database error saat verifikasi sesi: ${error.message}` }
          };
        }
      } else if (data) {
        matchedSession = {
          id: data.id,
          userId: data.user_id,
          sessionIdHash: data.session_id_hash,
          tokenHash: data.token_hash || data.session_id_hash,
          expiresAt: data.expires_at,
          lastActivityAt: data.last_activity_at,
          sessionVersion: typeof data.session_version === 'number' ? data.session_version : undefined,
          revokedAt: data.revoked_at,
          ipAddress: data.ip_address,
          userAgent: data.user_agent,
          deviceType: data.device_type,
          createdAt: data.created_at
        };
      }
    } catch (err: any) {
      if (!isLocalAuthAllowed()) {
        return {
          success: false,
          error: { code: 'DATABASE_UNAVAILABLE', message: `Koneksi database gagal saat verifikasi sesi: ${err?.message || err}` }
        };
      }
    }
  }

  // 2. In non-production ONLY, fallback to local store if permitted
  if (!matchedSession && isLocalAuthAllowed()) {
    const found = LOCAL_AUTH_SESSIONS.find(
      s => (s.sessionIdHash === tokenHash || s.tokenHash === tokenHash || cleanToken.includes(s.id))
    );
    if (found) {
      matchedSession = found;
    }
  }

  if (!matchedSession) {
    return {
      success: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'Sesi login tidak valid atau tidak ditemukan.' }
    };
  }

  // Check revocation
  if (matchedSession.revokedAt) {
    return {
      success: false,
      error: { code: 'SESSION_REVOKED', message: 'Sesi login telah dicabut atau Anda telah logout.' }
    };
  }

  // Check expiration
  if (new Date(matchedSession.expiresAt).getTime() < now) {
    return {
      success: false,
      error: { code: 'TOKEN_EXPIRED', message: 'Sesi login telah kedaluwarsa. Silakan login kembali.' }
    };
  }

  // 3. Fetch authoritative user from Supabase PostgreSQL users table
  let authoritativeUser: ServerUser | null = null;
  if (client) {
    try {
      const userRes = await findUserInSupabaseDetailed(matchedSession.userId);
      if (userRes.success && userRes.data) {
        authoritativeUser = userRes.data;
      } else if (!userRes.success && !isLocalAuthAllowed()) {
        return {
          success: false,
          error: { code: 'DATABASE_UNAVAILABLE', message: 'Gagal mengambil data pengguna dari database PostgreSQL.' }
        };
      }
    } catch (err: any) {
      if (!isLocalAuthAllowed()) {
        return {
          success: false,
          error: { code: 'DATABASE_UNAVAILABLE', message: 'Database error saat mengambil profil pengguna.' }
        };
      }
    }
  }

  if (!authoritativeUser && isLocalAuthAllowed()) {
    authoritativeUser = db.users.find((u: any) => u.id === matchedSession!.userId) || null;
  }

  if (!authoritativeUser) {
    return {
      success: false,
      error: { code: 'USER_NOT_FOUND', message: 'Akun staf terdaftar tidak ditemukan dalam sistem.' }
    };
  }

  // Check user active and soft-deleted status
  const nowIso = new Date().toISOString();
  if (authoritativeUser.isDeleted) {
    matchedSession.revokedAt = nowIso;
    if (client) {
      client.from('auth_sessions').update({ revoked_at: nowIso }).eq('id', matchedSession.id).then(() => {}, () => {});
    }
    return {
      success: false,
      error: { code: 'ACCOUNT_DELETED', message: 'Akun staf telah dihapus dari sistem.' }
    };
  }

  if (!authoritativeUser.active || (authoritativeUser as any).account_status === 'inactive' || (authoritativeUser as any).account_status === 'locked') {
    matchedSession.revokedAt = nowIso;
    if (client) {
      client.from('auth_sessions').update({ revoked_at: nowIso }).eq('id', matchedSession.id).then(() => {}, () => {});
    }
    return {
      success: false,
      error: { code: 'ACCOUNT_DISABLED', message: 'Akun Anda sedang dinonaktifkan oleh Administrator.' }
    };
  }

  // 4. Authoritative Session Version Check
  const authoritativeVersion = authoritativeUser.sessionVersion || 1;
  const tokenVersionMatch = cleanToken.match(/^mora_at_v(\d+)_/);
  const tokenSessionVersion = tokenVersionMatch ? parseInt(tokenVersionMatch[1], 10) : undefined;
  const sessionStoredVersion = matchedSession.sessionVersion;

  if (
    (tokenSessionVersion !== undefined && tokenSessionVersion !== authoritativeVersion) ||
    (sessionStoredVersion !== undefined && sessionStoredVersion !== authoritativeVersion)
  ) {
    matchedSession.revokedAt = nowIso;
    if (client) {
      client
        .from('auth_sessions')
        .update({ revoked_at: nowIso })
        .eq('id', matchedSession.id)
        .then(() => {}, () => {});
    }
    return {
      success: false,
      error: {
        code: 'SESSION_REVOKED',
        message: 'Sesi login telah dicabut karena perubahan kata sandi atau pembaruan akun. Silakan login kembali.'
      }
    };
  }

  // Extend last activity timestamp in database asynchronously
  if (client) {
    client
      .from('auth_sessions')
      .update({ last_activity_at: nowIso })
      .eq('id', matchedSession.id)
      .then(() => {}, () => {});
  }
  matchedSession.lastActivityAt = nowIso;

  return {
    success: true,
    data: {
      user: authoritativeUser,
      session: matchedSession
    }
  };
}

/**
 * Rotates a refresh token:
 * 1. Validates refresh token in Supabase PostgreSQL refresh_tokens table.
 * 2. Replay attack rejection: if token is already revoked, reject immediately.
 * 3. Verifies session version matches authoritative user session_version.
 * 4. Revokes the old refresh token (sets revoked_at and replaced_by_token_hash).
 * 5. Issues a new cryptographically secure access token and refresh token.
 * 6. Extends parent auth_session record.
 * 7. Sequential atomic compensation rollback if any database step fails.
 */
export async function rotateRefreshToken(
  rawRefreshToken: string,
  ipAddress?: string,
  userAgent?: string
): Promise<CustomAuthResult<{ tokens: AuthTokens; user: Omit<ServerUser, 'passwordHash'> }>> {
  if (!rawRefreshToken || typeof rawRefreshToken !== 'string' || !rawRefreshToken.trim()) {
    return {
      success: false,
      error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token wajib disertakan.' }
    };
  }

  const cleanRt = rawRefreshToken.trim();
  const rtHash = hashToken(cleanRt);
  const now = Date.now();
  const client = getActiveBackendClient();

  if (!client && !isLocalAuthAllowed()) {
    return {
      success: false,
      error: { code: 'DATABASE_UNAVAILABLE', message: 'Database PostgreSQL tidak tersedia saat memperbarui token.' }
    };
  }

  let matchedRt: StoredRefreshToken | null = null;

  // 1. Look up in Supabase PostgreSQL refresh_tokens table
  if (client) {
    try {
      const { data, error } = await client
        .from('refresh_tokens')
        .select('*')
        .eq('token_hash', rtHash)
        .limit(1)
        .maybeSingle();

      if (error) {
        if (!isLocalAuthAllowed()) {
          return {
            success: false,
            error: { code: 'DATABASE_UNAVAILABLE', message: `Database error saat kueri refresh token: ${error.message}` }
          };
        }
      } else if (data) {
        matchedRt = {
          id: data.id,
          userId: data.user_id,
          sessionId: data.session_id,
          tokenHash: data.token_hash,
          sessionVersion: typeof data.session_version === 'number' ? data.session_version : undefined,
          expiresAt: data.expires_at,
          revokedAt: data.revoked_at,
          replacedByTokenHash: data.replaced_by_token_hash,
          createdAt: data.created_at
        };
      }
    } catch (err: any) {
      if (!isLocalAuthAllowed()) {
        return {
          success: false,
          error: { code: 'DATABASE_UNAVAILABLE', message: `Koneksi database gagal saat kueri refresh token: ${err?.message || err}` }
        };
      }
    }
  }

  // Fallback to local store ONLY in local mode
  if (!matchedRt && isLocalAuthAllowed()) {
    matchedRt = LOCAL_REFRESH_TOKENS.find(r => r.tokenHash === rtHash) || null;
  }

  if (!matchedRt) {
    return {
      success: false,
      error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token tidak valid atau tidak ditemukan.' }
    };
  }

  // Replay Attack Protection: if already revoked, reject immediately
  if (matchedRt.revokedAt) {
    return {
      success: false,
      error: { code: 'REFRESH_TOKEN_REVOKED', message: 'Refresh token telah dicabut (terindikasi replay attack). Silakan login kembali.' }
    };
  }

  // Check expiration
  if (new Date(matchedRt.expiresAt).getTime() < now) {
    return {
      success: false,
      error: { code: 'REFRESH_TOKEN_EXPIRED', message: 'Refresh token telah kedaluwarsa. Silakan login kembali.' }
    };
  }

  // 2. Fetch authoritative user
  let user: ServerUser | null = null;
  if (client) {
    const userRes = await findUserInSupabaseDetailed(matchedRt.userId);
    if (userRes.success && userRes.data) {
      user = userRes.data;
    } else if (!userRes.success && !isLocalAuthAllowed()) {
      return {
        success: false,
        error: { code: 'DATABASE_UNAVAILABLE', message: 'Database PostgreSQL tidak tersedia saat verifikasi pengguna.' }
      };
    }
  }
  if (!user && isLocalAuthAllowed()) {
    user = db.users.find((u: any) => u.id === matchedRt!.userId) || null;
  }

  if (!user || user.isDeleted || !user.active) {
    return {
      success: false,
      error: { code: 'ACCOUNT_DISABLED', message: 'Akun Anda telah dinonaktifkan atau dihapus.' }
    };
  }

  // 3. Authoritative Session Version Check on Refresh Token
  const authoritativeVersion = user.sessionVersion || 1;
  const rtVersionMatch = cleanRt.match(/^mora_rt_v(\d+)_/);
  const rtTokenVersion = rtVersionMatch ? parseInt(rtVersionMatch[1], 10) : undefined;
  const rtStoredVersion = matchedRt.sessionVersion;

  if (
    (rtTokenVersion !== undefined && rtTokenVersion !== authoritativeVersion) ||
    (rtStoredVersion !== undefined && rtStoredVersion !== authoritativeVersion)
  ) {
    const revokeIso = new Date().toISOString();
    matchedRt.revokedAt = revokeIso;
    if (client) {
      await client.from('refresh_tokens').update({ revoked_at: revokeIso }).eq('id', matchedRt.id);
    }
    return {
      success: false,
      error: { code: 'REFRESH_TOKEN_REVOKED', message: 'Refresh token tidak valid karena perubahan kredensial akun.' }
    };
  }

  // 4. Issue new tokens with rotation tied to authoritative sessionVersion
  const newAccessToken = generateSecureAccessToken(authoritativeVersion);
  const newRefreshToken = generateSecureRefreshToken(authoritativeVersion);
  const newSessionHash = hashToken(newAccessToken);
  const newRtHash = hashToken(newRefreshToken);

  const newExpiresAt = new Date(now + ACCESS_TOKEN_TTL_MS).toISOString();
  const newRtExpiresAt = new Date(now + REFRESH_TOKEN_TTL_MS).toISOString();
  const nowIso = new Date(now).toISOString();
  const newRtId = `rt_${now}_${crypto.randomBytes(8).toString('hex')}`;

  // 5. Try atomic RPC rotation if available
  let rotatedViaRpc = false;
  if (client) {
    try {
      const { data: rpcData, error: rpcError } = await client.rpc('fn_rotate_refresh_token_atomic', {
        p_old_rt_hash: rtHash,
        p_new_rt_id: newRtId,
        p_new_rt_hash: newRtHash,
        p_new_session_hash: newSessionHash,
        p_new_session_expires_at: newExpiresAt,
        p_new_rt_expires_at: newRtExpiresAt,
        p_session_version: authoritativeVersion
      });

      if (!rpcError && rpcData?.success) {
        rotatedViaRpc = true;
      }
    } catch {}
  }

  // 6. Sequential atomic rotation with fail-closed compensation rollback
  if (!rotatedViaRpc && client) {
    // Step A: Revoke old refresh token
    const { error: revErr } = await client
      .from('refresh_tokens')
      .update({ revoked_at: nowIso, replaced_by_token_hash: newRtHash })
      .eq('id', matchedRt.id);

    if (revErr) {
      return {
        success: false,
        error: { code: 'DATABASE_ERROR', message: `Gagal mencabut refresh token lama di database: ${revErr.message}` }
      };
    }

    // Step B: Insert new refresh token
    const newRtPayload: any = {
      id: newRtId,
      user_id: user.id,
      session_id: matchedRt.sessionId,
      token_hash: newRtHash,
      session_version: authoritativeVersion,
      expires_at: newRtExpiresAt,
      created_at: nowIso
    };

    const { error: insErr } = await client.from('refresh_tokens').insert([newRtPayload]);
    if (insErr) {
      // Check legacy column
      let insFailed = true;
      if (insErr.code === '42703' || insErr.message?.includes('session_version')) {
        delete newRtPayload.session_version;
        const { error: insRetryErr } = await client.from('refresh_tokens').insert([newRtPayload]);
        if (!insRetryErr) insFailed = false;
      }

      if (insFailed) {
        // Rollback Step A: un-revoke old token
        await client.from('refresh_tokens').update({ revoked_at: null, replaced_by_token_hash: null }).eq('id', matchedRt.id);
        return {
          success: false,
          error: { code: 'DATABASE_ERROR', message: `Gagal menyimpan refresh token baru ke database: ${insErr.message}` }
        };
      }
    }

    // Step C: Update parent session
    const { error: sessUpdErr } = await client
      .from('auth_sessions')
      .update({
        session_id_hash: newSessionHash,
        token_hash: newSessionHash,
        expires_at: newExpiresAt,
        last_activity_at: nowIso
      })
      .eq('id', matchedRt.sessionId);

    if (sessUpdErr) {
      // Rollback Step B & A
      await client.from('refresh_tokens').delete().eq('id', newRtId);
      await client.from('refresh_tokens').update({ revoked_at: null, replaced_by_token_hash: null }).eq('id', matchedRt.id);
      return {
        success: false,
        error: { code: 'DATABASE_ERROR', message: `Gagal memperbarui session record: ${sessUpdErr.message}` }
      };
    }
  }

  // Update in-memory local state if allowed
  matchedRt.revokedAt = nowIso;
  matchedRt.replacedByTokenHash = newRtHash;

  if (isLocalAuthAllowed()) {
    LOCAL_REFRESH_TOKENS.push({
      id: newRtId,
      userId: user.id,
      sessionId: matchedRt.sessionId,
      tokenHash: newRtHash,
      sessionVersion: authoritativeVersion,
      expiresAt: newRtExpiresAt,
      revokedAt: null,
      replacedByTokenHash: null,
      createdAt: nowIso
    });

    const localSess = LOCAL_AUTH_SESSIONS.find(s => s.id === matchedRt!.sessionId);
    if (localSess) {
      localSess.sessionIdHash = newSessionHash;
      localSess.tokenHash = newSessionHash;
      localSess.expiresAt = newExpiresAt;
      localSess.lastActivityAt = nowIso;
    }
  }

  const { passwordHash: _, ...safeUser } = user;

  return {
    success: true,
    data: {
      tokens: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        tokenType: 'bearer',
        expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
        expiresAt: newExpiresAt
      },
      user: safeUser
    }
  };
}

/**
 * Revokes all sessions and refresh tokens for a specified user in Supabase PostgreSQL.
 * Increments user.session_version atomically to instantly invalidate any cached tokens.
 */
export async function revokeAllUserSessions(
  userId: string,
  revokedByUserId?: string
): Promise<CustomAuthResult<boolean>> {
  if (!userId) {
    return { success: false, error: { code: 'INVALID_ID', message: 'User ID wajib diisi.' } };
  }

  const nowIso = new Date().toISOString();
  const client = getActiveBackendClient();

  if (!client && !isLocalAuthAllowed()) {
    return {
      success: false,
      error: { code: 'DATABASE_UNAVAILABLE', message: 'Database PostgreSQL tidak tersedia saat mencabut seluruh sesi.' }
    };
  }

  // 1. Try atomic RPC function if available (from migration 009)
  if (client) {
    try {
      const { data: rpcData, error: rpcErr } = await client.rpc('fn_revoke_all_user_sessions_atomic', {
        p_user_id: userId,
        p_revoked_by: revokedByUserId || null
      });

      if (!rpcErr && rpcData?.success) {
        if (isLocalAuthAllowed()) {
          LOCAL_AUTH_SESSIONS.forEach(s => { if (s.userId === userId) s.revokedAt = nowIso; });
          LOCAL_REFRESH_TOKENS.forEach(r => { if (r.userId === userId) r.revokedAt = nowIso; });
          const lu = db.users.find((u: any) => u.id === userId);
          if (lu) { lu.sessionVersion = rpcData.new_session_version; saveDatabaseToDisk(); }
        }
        return { success: true, data: true };
      }
    } catch {}
  }

  // 2. Sequential atomic update in Supabase PostgreSQL
  if (client) {
    try {
      // Fetch user to confirm existence and current version
      const { data: userData, error: userFetchErr } = await client
        .from('users')
        .select('session_version')
        .eq('id', userId)
        .single();

      if (userFetchErr || !userData) {
        return {
          success: false,
          error: { code: 'USER_NOT_FOUND', message: `Pengguna ID ${userId} tidak ditemukan di database.` }
        };
      }

      const nextVersion = (typeof userData.session_version === 'number' ? userData.session_version : 1) + 1;

      // Increment session_version in users table
      const { error: userUpdErr } = await client
        .from('users')
        .update({ session_version: nextVersion, updated_at: nowIso })
        .eq('id', userId);

      if (userUpdErr) {
        return {
          success: false,
          error: { code: 'DATABASE_ERROR', message: `Gagal menaikkan session_version pengguna: ${userUpdErr.message}` }
        };
      }

      // Revoke all active auth_sessions
      const { error: sessRevErr } = await client
        .from('auth_sessions')
        .update({ revoked_at: nowIso })
        .eq('user_id', userId)
        .is('revoked_at', null);

      if (sessRevErr) {
        console.warn('[CustomAuth] Failed to revoke active auth_sessions:', sessRevErr.message);
      }

      // Revoke all active refresh_tokens
      const { error: rtRevErr } = await client
        .from('refresh_tokens')
        .update({ revoked_at: nowIso })
        .eq('user_id', userId)
        .is('revoked_at', null);

      if (rtRevErr) {
        console.warn('[CustomAuth] Failed to revoke active refresh_tokens:', rtRevErr.message);
      }
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'DATABASE_ERROR', message: `Terjadi kesalahan saat membatalkan sesi pengguna: ${err?.message || err}` }
      };
    }
  }

  // 3. Mirror to local memory ONLY in local mode
  if (isLocalAuthAllowed()) {
    LOCAL_AUTH_SESSIONS.forEach(s => {
      if (s.userId === userId) s.revokedAt = nowIso;
    });
    LOCAL_REFRESH_TOKENS.forEach(r => {
      if (r.userId === userId) r.revokedAt = nowIso;
    });
    const localUser = db.users.find((u: any) => u.id === userId);
    if (localUser) {
      localUser.sessionVersion = (localUser.sessionVersion || 1) + 1;
      saveDatabaseToDisk();
    }
  }

  return { success: true, data: true };
}

/**
 * Revokes a single session by access token or session ID.
 */
export async function revokeSingleSession(tokenOrSessionId: string): Promise<boolean> {
  if (!tokenOrSessionId) return false;
  const tokenHash = hashToken(tokenOrSessionId);
  const nowIso = new Date().toISOString();
  const client = getActiveBackendClient();

  if (client) {
    try {
      await client
        .from('auth_sessions')
        .update({ revoked_at: nowIso })
        .or(`id.eq.${tokenOrSessionId},session_id_hash.eq.${tokenHash},token_hash.eq.${tokenHash}`);

      await client
        .from('refresh_tokens')
        .update({ revoked_at: nowIso })
        .or(`session_id.eq.${tokenOrSessionId},token_hash.eq.${tokenHash}`);
    } catch {}
  }

  if (isLocalAuthAllowed()) {
    LOCAL_AUTH_SESSIONS.forEach(s => {
      if (s.id === tokenOrSessionId || s.sessionIdHash === tokenHash || s.tokenHash === tokenHash) {
        s.revokedAt = nowIso;
      }
    });
  }

  return true;
}

// ------------------------------------------------------------------------------
// CORE LOGIN ENGINE (USERNAME OR EMAIL + PASSWORD)
// ------------------------------------------------------------------------------

export async function loginWithCustomAuth(params: {
  identifier: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<CustomAuthResult<{ user: Omit<ServerUser, 'passwordHash'>; tokens: AuthTokens; sessionId: string }>> {
  const { identifier, password, ipAddress, userAgent } = params;

  const cleanIdent = (identifier || '').trim().toLowerCase();
  if (!cleanIdent || !password) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: 'Nama pengguna atau email dan kata sandi wajib diisi.' }
    };
  }

  // 1. Rate limiting & Temporary account lockout check
  const rateLimitCheck = await checkRateLimitAndLockout(cleanIdent, ipAddress);
  if (rateLimitCheck.isLocked) {
    await recordLoginAttempt({
      identifier: cleanIdent,
      ipAddress,
      success: false,
      reason: 'ACCOUNT_TEMPORARILY_LOCKED'
    });
    return {
      success: false,
      error: {
        code: 'ACCOUNT_LOCKED',
        message: rateLimitCheck.message || 'Terlalu banyak percobaan login gagal. Akun dikunci sementara.'
      }
    };
  }

  // 2. Fail-closed check: Supabase PostgreSQL is MANDATORY in production
  const client = getActiveBackendClient();
  if (!client && !isLocalAuthAllowed()) {
    return {
      success: false,
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Koneksi ke Supabase PostgreSQL database produksi wajib tersedia dan aktif untuk melakukan autentikasi.'
      }
    };
  }

  // 3. Authoritative User Lookup in Supabase PostgreSQL
  let user: ServerUser | null = null;

  if (client) {
    const userRes = await findUserInSupabaseDetailed(cleanIdent);
    if (!userRes.success) {
      return {
        success: false,
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Database PostgreSQL tidak dapat diakses saat memverifikasi identitas pengguna.'
        }
      };
    }
    user = userRes.data;
  }

  // Fallback to local store ONLY if in local development mode
  if (!user && isLocalAuthAllowed()) {
    // 1. Prioritize exact username or email match
    user = db.users.find(
      (u: any) =>
        !u.isDeleted &&
        (u.username.toLowerCase() === cleanIdent || u.email.toLowerCase() === cleanIdent)
    ) || null;

    // 2. If not found, check altEmail token list
    if (!user) {
      user = db.users.find(
        (u: any) =>
          !u.isDeleted &&
          u.altEmail &&
          u.altEmail.toLowerCase().split(/[,;\s]+/).map((s: string) => s.trim()).includes(cleanIdent)
      ) || null;
    }
  }

  // User not found in directory
  if (!user) {
    await recordLoginAttempt({
      identifier: cleanIdent,
      ipAddress,
      success: false,
      reason: 'USER_NOT_FOUND'
    });
    return {
      success: false,
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Nama pengguna atau kata sandi tidak cocok. Hubungi Superadmin untuk mendapatkan akses MoraJaws.'
      }
    };
  }

  // Check account deleted
  if (user.isDeleted) {
    await recordLoginAttempt({
      identifier: cleanIdent,
      ipAddress,
      success: false,
      reason: 'ACCOUNT_DELETED'
    });
    return {
      success: false,
      error: {
        code: 'ACCOUNT_DELETED',
        message: 'Akun Anda telah dihapus dari sistem MoraJaws. Hubungi Superadmin.'
      }
    };
  }

  // Check account active status
  if (!user.active || (user as any).account_status === 'inactive' || (user as any).account_status === 'locked') {
    await recordLoginAttempt({
      identifier: cleanIdent,
      ipAddress,
      success: false,
      reason: 'ACCOUNT_DISABLED'
    });
    return {
      success: false,
      error: {
        code: 'ACCOUNT_DISABLED',
        message: 'Akun Anda sedang dinonaktifkan oleh Administrator. Hubungi Superadmin untuk mendapatkan akses MoraJaws.'
      }
    };
  }

  // Check locked until timestamp
  if ((user as any).locked_until && new Date((user as any).locked_until).getTime() > Date.now()) {
    const rem = Math.ceil((new Date((user as any).locked_until).getTime() - Date.now()) / 1000);
    return {
      success: false,
      error: {
        code: 'ACCOUNT_LOCKED',
        message: `Akun Anda sedang dikunci sementara. Silakan coba kembali dalam ${rem} detik atau hubungi Superadmin.`
      }
    };
  }

  // 4. Verify Password (bcrypt + legacy upgrade fallback)
  const passwordCheck = await verifyUserPasswordEx(password, user.passwordHash);
  if (!passwordCheck.valid) {
    await recordLoginAttempt({
      identifier: cleanIdent,
      ipAddress,
      success: false,
      reason: 'WRONG_PASSWORD'
    });

    // Increment failed login count on user record
    if (client) {
      const currentFailures = ((user as any).failed_login_count || 0) + 1;
      const updates: any = { failed_login_count: currentFailures, updated_at: new Date().toISOString() };
      if (currentFailures >= MAX_FAILED_ATTEMPTS) {
        updates.locked_until = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();
        updates.account_status = 'locked';
      }
      client.from('users').update(updates).eq('id', user.id).then(() => {}, () => {});
    }

    return {
      success: false,
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Nama pengguna atau kata sandi tidak cocok. Pastikan kredensial yang Anda masukkan benar.'
      }
    };
  }

  // 5. Password valid -> Rehash if needed
  if (passwordCheck.needsRehash) {
    try {
      const newBcryptHash = await hashPasswordWithBcrypt(password);
      user.passwordHash = newBcryptHash;
      if (client) {
        await client
          .from('users')
          .update({
            password_hash: newBcryptHash,
            payload: { ...(user as any).payload, passwordHash: newBcryptHash },
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);
      }
      if (isLocalAuthAllowed()) {
        const lu = db.users.find((u: any) => u.id === user!.id);
        if (lu) {
          lu.passwordHash = newBcryptHash;
          saveDatabaseToDisk();
        }
      }
    } catch (rehashErr) {
      console.warn('[CustomAuth] Automatic rehash warning:', rehashErr);
    }
  }

  // 6. Generate Access Token & Refresh Token tied to current authoritative sessionVersion
  const currentVersion = user.sessionVersion || 1;
  const accessToken = generateSecureAccessToken(currentVersion);
  const refreshToken = generateSecureRefreshToken(currentVersion);

  // 7. Persist Session into Supabase PostgreSQL (Fail-closed & Atomic)
  const persistRes = await persistNewAuthSession({
    userId: user.id,
    accessToken,
    refreshToken,
    ipAddress,
    userAgent,
    sessionVersion: currentVersion
  });

  if (!persistRes.success || !persistRes.data) {
    await recordLoginAttempt({
      identifier: cleanIdent,
      ipAddress,
      success: false,
      reason: 'SESSION_PERSISTENCE_FAILED'
    });
    return {
      success: false,
      error: persistRes.error || {
        code: 'SESSION_PERSISTENCE_FAILED',
        message: 'Gagal menyimpan sesi login ke database PostgreSQL. Login dibatalkan.'
      }
    };
  }

  const { sessionId, expiresAt } = persistRes.data;

  // 8. Update User login stats & reset failed login count in Supabase PostgreSQL
  const nowIso = new Date().toISOString();
  if (client) {
    try {
      await client
        .from('users')
        .update({
          last_login_at: nowIso,
          login_count: (user.loginCount || 0) + 1,
          failed_login_count: 0,
          locked_until: null,
          account_status: 'active',
          updated_at: nowIso
        })
        .eq('id', user.id);
    } catch {}
  }

  if (isLocalAuthAllowed()) {
    const lu = db.users.find((u: any) => u.id === user!.id);
    if (lu) {
      lu.lastLoginAt = nowIso;
      lu.loginCount = (lu.loginCount || 0) + 1;
      saveDatabaseToDisk();
    }
  }

  // 9. Record successful login attempt
  await recordLoginAttempt({
    identifier: cleanIdent,
    ipAddress,
    success: true
  });

  // 10. Record Audit Log
  await logServerAuditAsync(
    'USER_LOGIN_SUCCESS',
    'auth',
    user.id,
    `Pengguna ${user.name} (${user.role}) berhasil login via Custom Authentication MoraJaws.`,
    user,
    { ipAddress, userAgent, level: 'informational' }
  );

  const { passwordHash: _, ...safeUser } = user;

  return {
    success: true,
    data: {
      user: safeUser,
      tokens: {
        accessToken,
        refreshToken,
        tokenType: 'bearer',
        expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
        expiresAt
      },
      sessionId
    }
  };
}
