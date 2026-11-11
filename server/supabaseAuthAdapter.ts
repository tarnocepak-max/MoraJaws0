import { getSupabaseBackendClient } from './supabaseClient.ts';
import { findUserInSupabaseDetailed } from './supabaseAdapter.ts';
import type { ServerUser } from '../server.ts';
import {
  loginWithCustomAuth,
  verifyAccessToken,
  rotateRefreshToken,
  revokeSingleSession,
  revokeAllUserSessions,
  hashPasswordWithBcrypt,
  validatePasswordStrength,
  type AuthTokens
} from './customAuthService.ts';

// ==============================================================================
// MORAJAWS AUTH ADAPTER (INTERNAL CUSTOM AUTHENTICATION)
// Supabase Auth (auth.users) dependency is permanently removed.
// All authentication is performed via MoraJaws Custom Authentication Service
// backed by Supabase PostgreSQL as MAIN DATABASE.
// ==============================================================================

export interface SupabaseAuthResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface SupabaseAuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  expiresAt?: string | number;
}

export interface MoraJawsAuthSession {
  tokens: SupabaseAuthTokens;
  authUserId?: string;
  email: string;
  user: Omit<ServerUser, 'passwordHash'>;
  sessionVersion: number;
  sessionId?: string;
}

/**
 * Signs in a staff user using internal Custom Authentication (backed by Supabase PostgreSQL).
 * Supabase Auth is completely bypassed; passwords verified via bcrypt with Supabase PostgreSQL.
 */
export async function signInWithSupabaseAuth(
  identifier: string,
  password: string,
  ipAddress?: string,
  userAgent?: string
): Promise<SupabaseAuthResponse<MoraJawsAuthSession>> {
  const result = await loginWithCustomAuth({
    identifier,
    password,
    ipAddress,
    userAgent
  });

  if (!result.success || !result.data) {
    return {
      success: false,
      error: result.error || { code: 'AUTH_FAILED', message: 'Autentikasi gagal.' }
    };
  }

  const { user, tokens, sessionId } = result.data;
  return {
    success: true,
    data: {
      tokens,
      authUserId: user.id,
      email: user.email || '',
      user,
      sessionVersion: user.sessionVersion || 1,
      sessionId
    }
  };
}

/**
 * Verifies access token using Custom Authentication against Supabase PostgreSQL auth_sessions table.
 */
export async function verifySupabaseAuthToken(
  token: string,
  expectedSessionVersion?: number
): Promise<SupabaseAuthResponse<Omit<ServerUser, 'passwordHash'>>> {
  const result = await verifyAccessToken(token);

  if (!result.success || !result.data) {
    return {
      success: false,
      error: result.error || { code: 'UNAUTHENTICATED', message: 'Token tidak valid.' }
    };
  }

  const { user } = result.data;

  // Session version check if expected
  const authoritativeVersion = user.sessionVersion || 1;
  if (expectedSessionVersion !== undefined && authoritativeVersion !== expectedSessionVersion) {
    return {
      success: false,
      error: { code: 'SESSION_REVOKED', message: 'Sesi login telah dicabut karena perubahan akun atau logout.' }
    };
  }

  const { passwordHash: _, ...safeUser } = user;
  return {
    success: true,
    data: safeUser
  };
}

/**
 * Refreshes session using Custom Authentication refresh token rotation in Supabase PostgreSQL.
 */
export async function refreshSupabaseAuthSession(
  refreshToken: string,
  ipAddress?: string,
  userAgent?: string
): Promise<SupabaseAuthResponse<SupabaseAuthTokens>> {
  const result = await rotateRefreshToken(refreshToken, ipAddress, userAgent);

  if (!result.success || !result.data) {
    return {
      success: false,
      error: result.error || { code: 'REFRESH_FAILED', message: 'Gagal memperbarui sesi token.' }
    };
  }

  return {
    success: true,
    data: result.data.tokens
  };
}

/**
 * Signs out session by revoking it in Supabase PostgreSQL.
 */
export async function signOutSupabaseAuth(tokenOrSessionId?: string): Promise<SupabaseAuthResponse<boolean>> {
  if (tokenOrSessionId) {
    await revokeSingleSession(tokenOrSessionId);
  }
  return { success: true, data: true };
}

/**
 * Password reset initiated by Super Admin internally.
 * Public reset without identity verification is disabled.
 */
export async function resetSupabaseAuthPassword(email: string): Promise<SupabaseAuthResponse<boolean>> {
  return {
    success: false,
    error: {
      code: 'PUBLIC_RESET_FORBIDDEN',
      message: 'Reset password mandiri publik dinonaktifkan. Hubungi Superadmin untuk mereset kata sandi melalui menu Management User.'
    }
  };
}

/**
 * Legacy compatibility stub for approveAuthUidMapping
 */
export async function approveAuthUidMapping(params: {
  staffId: string;
  authUserId: string;
  adminUser: ServerUser;
}): Promise<SupabaseAuthResponse<{ staffId: string; authUserId: string; verified: boolean }>> {
  return {
    success: true,
    data: {
      staffId: params.staffId,
      authUserId: params.authUserId,
      verified: true
    }
  };
}

// -----------------------------------------------------------------------------
// Backwards compatibility re-exports & test stubs
// -----------------------------------------------------------------------------
export { resolveAuthRedirectUrl } from './environmentConfig.ts';

export async function verifySupabaseRecoveryToken(token?: any): Promise<any> {
  return { valid: false, error: 'PUBLIC_RECOVERY_DEPRECATED' };
}

export async function updateSupabaseUserPassword(params: any): Promise<any> {
  return { success: false, error: 'PUBLIC_RECOVERY_DEPRECATED' };
}

export function isLoginAccessToken(token?: string): boolean {
  return typeof token === 'string' && (token.startsWith('mora_at_') || token.startsWith('sb_'));
}

export function createRecoveryTransaction(...args: any[]): any {
  return { id: 'stub', valid: false };
}

export function getValidRecoveryTransaction(id?: string): any {
  return null;
}

export function clearServerRecoveryStoreForTesting(): void {}
