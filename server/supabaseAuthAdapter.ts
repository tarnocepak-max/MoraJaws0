import { getSupabaseBackendClient } from './supabaseClient.ts';
import { findUserInSupabaseDetailed } from './supabaseAdapter.ts';
import { resolveAuthRedirectUrl, AuthRedirectConfigError } from './environmentConfig.ts';
import type { ServerUser } from '../server.ts';
import crypto from 'crypto';

export { resolveAuthRedirectUrl, AuthRedirectConfigError };

// ==============================================================================
// MORAJAWS SUPABASE AUTH ADAPTER
// Official backend adapter for Supabase Authentication:
// - Implements Sign In, Token Verification, Refresh Token, Sign Out, Password Reset.
// - Enforces strict MoraJaws Role & Authorization Checks against authoritative database.
// - Validates Active status, Soft-deleted status, Contractor, Area, and Session Version.
// - NEVER exposes Supabase service role key to browser or frontend clients.
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
  expiresAt?: number;
}

export interface MoraJawsAuthSession {
  tokens: SupabaseAuthTokens;
  authUserId: string;
  email: string;
  user: Omit<ServerUser, 'passwordHash'>;
  sessionVersion: number;
}

/**
 * Signs in a staff user via Supabase Auth using email/username and password.
 * Resolves username to email via authoritative user lookup if needed.
 * Strictly verifies authoritative account active state and role.
 */
export async function signInWithSupabaseAuth(
  identifier: string,
  password: string
): Promise<SupabaseAuthResponse<MoraJawsAuthSession>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    const { getEnvironmentConfig, STAGING_SUPABASE_PROJECT_ID } = await import('./environmentConfig.ts');
    const envCheck = getEnvironmentConfig();
    const isMismatch = envCheck.env === 'staging' && envCheck.supabaseProjectId !== STAGING_SUPABASE_PROJECT_ID;
    return {
      success: false,
      error: {
        code: isMismatch ? 'CONFIGURATION_MISMATCH' : 'SUPABASE_NOT_CONFIGURED',
        message: isMismatch
          ? 'Konfigurasi proyek Supabase staging tidak cocok dengan Project ID yang ditentukan.'
          : 'Supabase client backend belum dikonfigurasi.'
      }
    };
  }

  const cleanIdent = (identifier || '').trim().toLowerCase();
  if (!cleanIdent || !password) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: 'Email/username dan password wajib diisi.' }
    };
  }

  try {
    // 1. Resolve email if an identifier or username was provided
    let targetEmail = cleanIdent;
    let authoritativeUser: ServerUser | null = null;

    // Look up authoritative user in Supabase users table
    const userRes = await findUserInSupabaseDetailed(cleanIdent);
    if (!userRes.success) {
      const isSchemaUninit = userRes.error?.isSchemaError;
      return {
        success: false,
        error: {
          code: isSchemaUninit ? 'SCHEMA_NOT_INITIALIZED' : 'DATABASE_UNAVAILABLE',
          message: isSchemaUninit
            ? 'Skema tabel pengguna Supabase belum diinisialisasi (tabel public.users belum ada di database). Jalankan migrasi migrations/001_core_morajaws_schema.sql.'
            : (userRes.error?.message || 'Database authoritative tidak tersedia saat validasi identitas.')
        }
      };
    }

    let candidateEmails: string[] = [];

    if (userRes.data) {
      authoritativeUser = userRes.data;
      const isInputEmail = cleanIdent.includes('@') && cleanIdent.includes('.');

      const parseEmails = (field?: string) => {
        if (!field) return [];
        return String(field)
          .split(/[,;\s]+/)
          .map(s => s.trim().toLowerCase())
          .filter(s => s.includes('@') && s.includes('.'));
      };

      const primaryList = parseEmails(authoritativeUser.email);
      const altList = parseEmails(authoritativeUser.altEmail || (authoritativeUser as any).payload?.altEmail);
      const allStaffEmails = [...primaryList, ...altList];

      // If user typed an email directly, try it FIRST and unconditionally (preventing any username-to-email overwrite)
      if (isInputEmail) {
        candidateEmails.push(cleanIdent);
      }
      for (const e of allStaffEmails) {
        if (!candidateEmails.includes(e)) {
          candidateEmails.push(e);
        }
      }

      if (candidateEmails.length === 0) {
        return {
          success: false,
          error: {
            code: 'STAFF_AUTH_EMAIL_MISSING',
            message: 'Profil staf ditemukan, tetapi email autentikasi belum terdaftar. Hubungi Super Admin untuk melengkapi email akun.'
          }
        };
      }
      targetEmail = candidateEmails[0];
    } else {
      // User not found in authoritative users table (anti-enumeration: safe generic message)
      return {
        success: false,
        error: {
          code: 'auth/user-not-found',
          message: 'Identitas staf tidak terdaftar dalam direktori MoraJaws.'
        }
      };
    }

    // Strict account status and role checks before calling Supabase Auth
    if (authoritativeUser.isDeleted) {
      return {
        success: false,
        error: {
          code: 'ACCOUNT_DELETED',
          message: 'Akun Anda telah dihapus dari sistem MoraJaws. Akses ditolak.'
        }
      };
    }

    if (!authoritativeUser.active) {
      return {
        success: false,
        error: {
          code: 'ACCOUNT_DISABLED',
          message: 'Akun Anda telah dinonaktifkan oleh Administrator. Hubungi Super Admin.'
        }
      };
    }

    const VALID_MORAJAWS_ROLES: ServerUser['role'][] = [
      'super_admin',
      'dispatch',
      'leader',
      'installer',
      'management_data',
      'it_support'
    ];
    if (!VALID_MORAJAWS_ROLES.includes(authoritativeUser.role)) {
      return {
        success: false,
        error: {
          code: 'INVALID_ROLE',
          message: 'Peran akun staf tidak valid atau tidak memiliki otorisasi akses ke MoraJaws.'
        }
      };
    }

    // 2. Perform Supabase Auth Sign In with password across candidate emails
    let authData: any = null;
    let authError: any = null;
    let successfulEmail: string = targetEmail;

    for (const candEmail of candidateEmails) {
      const { data, error } = await client.auth.signInWithPassword({
        email: candEmail,
        password
      });

      if (!error && data?.session && data?.user) {
        authData = data;
        authError = null;
        successfulEmail = candEmail;
        break;
      }

      authError = error;
      const rawCode = String((error as any)?.code || '').toLowerCase();
      const rawMessage = String(error?.message || '').toLowerCase();
      const isInvalidCreds =
        rawCode.includes('invalid_credentials') ||
        rawMessage.includes('invalid login credentials') ||
        rawMessage.includes('invalid credentials') ||
        rawMessage.includes('email or password');

      // Stop trying other emails if the error is ban, network, confirmation, or rate limit
      if (!isInvalidCreds) {
        break;
      }
    }

    if (authError || !authData?.session || !authData?.user) {
      const rawCode = String((authError as any)?.code || '').toLowerCase();
      const rawMessage = String(authError?.message || '').toLowerCase();
      const rawStatus = Number((authError as any)?.status || 0);
      let code = 'AUTH_PROVIDER_ERROR';
      let message = 'Layanan Supabase Auth gagal memproses login. Coba kembali atau hubungi administrator.';

      if (
        rawCode.includes('invalid_credentials') ||
        rawMessage.includes('invalid login credentials') ||
        rawMessage.includes('invalid credentials') ||
        rawMessage.includes('email or password')
      ) {
        code = 'AUTH_INVALID_CREDENTIALS';
        message = 'Email atau kata sandi Supabase tidak cocok. Pastikan email akun dan kata sandi yang digunakan benar.';
      } else if (
        rawCode.includes('email_not_confirmed') ||
        rawMessage.includes('email not confirmed')
      ) {
        code = 'AUTH_EMAIL_NOT_CONFIRMED';
        message = 'Email akun Supabase belum dikonfirmasi. Hubungi Super Admin.';
      } else if (
        rawCode.includes('user_banned') ||
        rawMessage.includes('banned') ||
        rawMessage.includes('disabled')
      ) {
        code = 'ACCOUNT_DISABLED';
        message = 'Akun Supabase sedang dinonaktifkan atau diblokir.';
      } else if (
        rawStatus >= 500 ||
        rawMessage.includes('fetch failed') ||
        rawMessage.includes('network') ||
        rawMessage.includes('timeout')
      ) {
        code = 'AUTH_PROVIDER_UNAVAILABLE';
        message = 'Layanan Supabase Auth tidak dapat dijangkau. Periksa koneksi server dan konfigurasi Supabase.';
      } else if (rawCode.includes('too_many') || rawMessage.includes('rate limit')) {
        code = 'auth/too-many-requests';
        message = 'Terlalu banyak percobaan login. Tunggu beberapa saat sebelum mencoba kembali.';
      }

      return {
        success: false,
        error: { code, message }
      };
    }

    // 3. Validate Auth UID against authoritative staff profile
    const authUid = authData.user.id;
    if (authoritativeUser.authUserId && authoritativeUser.authUserId !== authUid) {
      return {
        success: false,
        error: {
          code: 'AUTH_UID_MISMATCH',
          message: 'Auth UID tidak cocok dengan profil staf terdaftar. Akses ditolak demi integritas keamanan.'
        }
      };
    }

    // Phase 15A.1 Strict Requirement: DO NOT auto-link Auth UID on first login.
    // Unmapped profiles must be explicitly approved by Super Admin and marked NEEDS_MAPPING.
    if (!authoritativeUser.authUserId) {
      return {
        success: false,
        error: {
          code: 'NEEDS_MAPPING',
          message: 'Profil staf belum memiliki pemetaan Supabase Auth UID yang disetujui. Silakan hubungi Super Admin untuk persetujuan pemetaan identitas.',
          details: {
            staffId: authoritativeUser.id,
            username: authoritativeUser.username,
            email: targetEmail
          }
        }
      };
    }

    // 4. Fetch fresh staff profile from users table (Step 8)
    const freshRes = await findUserInSupabaseDetailed(authoritativeUser.id);
    if (!freshRes.success || !freshRes.data) {
      return {
        success: false,
        error: {
          code: 'PROFILE_NOT_FOUND',
          message: 'Profil staf MoraJaws tidak ditemukan dalam direktori authoritative.'
        }
      };
    }

    const freshProfile = freshRes.data;
    if (freshProfile.isDeleted) {
      return {
        success: false,
        error: { code: 'ACCOUNT_DELETED', message: 'Akun Anda telah dihapus dari sistem MoraJaws.' }
      };
    }
    if (!freshProfile.active) {
      return {
        success: false,
        error: { code: 'ACCOUNT_DISABLED', message: 'Akun Anda telah dinonaktifkan oleh Administrator.' }
      };
    }

    const { passwordHash: _, ...safeUser } = freshProfile;
    const sessionTokens: SupabaseAuthTokens = {
      accessToken: authData.session.access_token,
      refreshToken: authData.session.refresh_token,
      tokenType: authData.session.token_type || 'bearer',
      expiresIn: authData.session.expires_in,
      expiresAt: authData.session.expires_at
    };

    return {
      success: true,
      data: {
        tokens: sessionTokens,
        authUserId: authUid,
        email: authData.user.email || targetEmail,
        user: safeUser,
        sessionVersion: freshProfile.sessionVersion || 1
      }
    };
  } catch (err: any) {
    return {
      success: false,
      error: {
        code: 'AUTH_EXCEPTION',
        message: err?.message || 'Terjadi kesalahan sistem saat autentikasi Supabase Auth.'
      }
    };
  }
}

/**
 * Verifies a Supabase Auth JWT token and resolves the authoritative MoraJaws user profile.
 * - Verifies cryptographic token validity with Supabase Auth (getUser).
 * - Distinguishes TOKEN_EXPIRED from TOKEN_INVALID.
 * - Queries authoritative PostgreSQL record (never trusts unverified JWT claims).
 * - Enforces account active status and soft-delete checks.
 * - Enforces sessionVersion validity.
 */
export async function verifySupabaseAuthToken(
  token: string,
  expectedSessionVersion?: number
): Promise<SupabaseAuthResponse<Omit<ServerUser, 'passwordHash'>>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return {
      success: false,
      error: { code: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase client backend belum dikonfigurasi.' }
    };
  }

  if (!token || typeof token !== 'string' || !token.trim()) {
    return {
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Token Supabase Auth tidak ditemukan.' }
    };
  }

  try {
    // 1. Verify token with Supabase Auth service
    const { data: userData, error: userError } = await client.auth.getUser(token.trim());

    if (userError || !userData?.user) {
      const errMsg = (userError?.message || '').toLowerCase();
      const isExpired = errMsg.includes('expired');
      return {
        success: false,
        error: {
          code: isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
          message: isExpired
            ? 'Token Supabase Auth telah kedaluwarsa. Silakan login kembali.'
            : (userError?.message || 'Token Supabase Auth tidak valid atau telah kedaluwarsa.')
        }
      };
    }

    const authUser = userData.user;

    // 2. Query authoritative profile in database
    let profile: ServerUser | null = null;
    const byId = await findUserInSupabaseDetailed(authUser.id);
    if (byId.success && byId.data) {
      profile = byId.data;
    } else if (authUser.email) {
      const byEmail = await findUserInSupabaseDetailed(authUser.email);
      if (byEmail.success && byEmail.data) {
        profile = byEmail.data;
      }
    }

    if (!profile) {
      return {
        success: false,
        error: {
          code: 'PROFILE_NOT_FOUND',
          message: 'Profil staf MoraJaws tidak ditemukan dalam database authoritative.'
        }
      };
    }

    // 2.B. Validate Auth UID consistency
    if (profile.authUserId && profile.authUserId !== authUser.id) {
      return {
        success: false,
        error: {
          code: 'AUTH_UID_MISMATCH',
          message: 'Auth UID token tidak cocok dengan profil staf terdaftar.'
        }
      };
    }

    if (!profile.authUserId && profile.id !== authUser.id) {
      return {
        success: false,
        error: {
          code: 'NEEDS_MAPPING',
          message: 'Profil staf belum memiliki pemetaan Supabase Auth UID yang disetujui. Hubungi Super Admin.'
        }
      };
    }

    // 3. Verify Active and Not Deleted
    if (profile.isDeleted) {
      return {
        success: false,
        error: { code: 'ACCOUNT_DELETED', message: 'Akun pengguna telah dihapus.' }
      };
    }

    if (!profile.active) {
      return {
        success: false,
        error: { code: 'ACCOUNT_DISABLED', message: 'Akun pengguna telah dinonaktifkan.' }
      };
    }

    // 4. Session version check if expected
    const authoritativeVersion = profile.sessionVersion || 1;
    if (expectedSessionVersion !== undefined && authoritativeVersion !== expectedSessionVersion) {
      return {
        success: false,
        error: { code: 'SESSION_REVOKED', message: 'Sesi login telah dicabut karena perubahan akun atau logout.' }
      };
    }

    const { passwordHash: _, ...safeUser } = profile;
    return {
      success: true,
      data: safeUser
    };
  } catch (err: any) {
    return {
      success: false,
      error: {
        code: 'TOKEN_VERIFICATION_EXCEPTION',
        message: err?.message || 'Terjadi kesalahan saat memverifikasi token Supabase Auth.'
      }
    };
  }
}

/**
 * Refreshes an existing Supabase Auth session using a refresh token.
 */
export async function refreshSupabaseAuthSession(
  refreshToken: string
): Promise<SupabaseAuthResponse<SupabaseAuthTokens>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return {
      success: false,
      error: { code: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' }
    };
  }

  if (!refreshToken || !refreshToken.trim()) {
    return {
      success: false,
      error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token wajib disertakan.' }
    };
  }

  try {
    const { data, error } = await client.auth.refreshSession({
      refresh_token: refreshToken.trim()
    });

    if (error || !data?.session) {
      return {
        success: false,
        error: {
          code: 'REFRESH_FAILED',
          message: error?.message || 'Gagal memperbarui sesi Supabase Auth.'
        }
      };
    }

    // Verify refreshed user account is still active and not deleted
    const authUid = data.session.user?.id;
    if (authUid) {
      const userRes = await findUserInSupabaseDetailed(authUid);
      if (userRes.success && userRes.data) {
        if (userRes.data.isDeleted) {
          return {
            success: false,
            error: { code: 'ACCOUNT_DELETED', message: 'Akun staf telah dihapus dari sistem.' }
          };
        }
        if (!userRes.data.active) {
          return {
            success: false,
            error: { code: 'ACCOUNT_DISABLED', message: 'Akun staf telah dinonaktifkan oleh Administrator.' }
          };
        }
      }
    }

    return {
      success: true,
      data: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        tokenType: data.session.token_type || 'bearer',
        expiresIn: data.session.expires_in,
        expiresAt: data.session.expires_at
      }
    };
  } catch (err: any) {
    return {
      success: false,
      error: { code: 'REFRESH_EXCEPTION', message: err?.message || 'Exception during refresh session.' }
    };
  }
}

/**
 * Signs out a user session from Supabase Auth.
 */
export async function signOutSupabaseAuth(): Promise<SupabaseAuthResponse<boolean>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return {
      success: false,
      error: { code: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' }
    };
  }

  try {
    const { error } = await client.auth.signOut();
    if (error) {
      return {
        success: false,
        error: { code: 'SIGNOUT_ERROR', message: error.message }
      };
    }
    return { success: true, data: true };
  } catch (err: any) {
    return {
      success: false,
      error: { code: 'SIGNOUT_EXCEPTION', message: err?.message || 'Exception during signOut.' }
    };
  }
}

/**
 * Initiates a password reset flow via Supabase Auth.
 * Supports email or username (resolves username to canonical email in authoritative DB).
 * Explicitly provides redirectTo to ensure reset links do NOT fall back to localhost:3000.
 */
export async function resetSupabaseAuthPassword(
  identifier: string,
  customRedirectTo?: string
): Promise<SupabaseAuthResponse<{ email: string; redirectTo: string }>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return {
      success: false,
      error: { code: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' }
    };
  }

  const cleanIdent = (identifier || '').trim().toLowerCase();
  if (!cleanIdent) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: 'Alamat email atau nama pengguna wajib diisi.' }
    };
  }

  let targetEmail = cleanIdent;
  if (!cleanIdent.includes('@')) {
    // Resolve username to authoritative email
    try {
      const userRes = await findUserInSupabaseDetailed(cleanIdent);
      if (!userRes.success || !userRes.data) {
        return {
          success: false,
          error: { code: 'USER_NOT_FOUND', message: `Nama pengguna "${identifier}" tidak ditemukan dalam direktori staf MoraJaws.` }
        };
      }
      const staffUser = userRes.data;
      if (staffUser.isDeleted) {
        return {
          success: false,
          error: { code: 'ACCOUNT_DELETED', message: 'Akun telah dihapus dari sistem MoraJaws.' }
        };
      }
      if (!staffUser.active) {
        return {
          success: false,
          error: { code: 'ACCOUNT_DISABLED', message: 'Akun Anda dinonaktifkan oleh Administrator.' }
        };
      }
      const primaryEmail = (staffUser.email || '').trim().toLowerCase();
      if (!primaryEmail || !primaryEmail.includes('@')) {
        return {
          success: false,
          error: { code: 'STAFF_AUTH_EMAIL_MISSING', message: 'Profil staf belum memiliki alamat email valid untuk pemulihan kata sandi.' }
        };
      }
      targetEmail = primaryEmail;
    } catch (e: any) {
      return {
        success: false,
        error: { code: 'DATABASE_ERROR', message: e?.message || 'Gagal mencari data staf.' }
      };
    }
  }

  let redirectTo: string;
  try {
    redirectTo = resolveAuthRedirectUrl(customRedirectTo);
  } catch (err: any) {
    return {
      success: false,
      error: {
        code: err.code || 'REDIRECT_CONFIG_ERROR',
        message: err.message || 'Konfigurasi callback redirect tidak valid atau belum ditetapkan.'
      }
    };
  }

  try {
    const { error } = await client.auth.resetPasswordForEmail(targetEmail, {
      redirectTo
    });
    if (error) {
      return {
        success: false,
        error: { code: 'RESET_FAILED', message: error.message }
      };
    }
    return {
      success: true,
      data: {
        email: targetEmail,
        redirectTo
      }
    };
  } catch (err: any) {
    return {
      success: false,
      error: { code: 'RESET_EXCEPTION', message: err?.message || 'Exception during password reset.' }
    };
  }
}

export interface ServerRecoveryTransaction {
  token: string;
  userId: string;
  email: string;
  createdAt: number;
  expiresAt: number; // 5 minutes TTL
  consumed: boolean;
}

// In-memory short-lived, single-use recovery transaction store
const SERVER_RECOVERY_STORE = new Map<string, ServerRecoveryTransaction>();

export function clearServerRecoveryStoreForTesting(): void {
  SERVER_RECOVERY_STORE.clear();
}

export function createRecoveryTransaction(userId: string, email: string): string {
  const now = Date.now();
  // Auto-clean expired entries
  for (const [k, v] of SERVER_RECOVERY_STORE.entries()) {
    if (now > v.expiresAt || v.consumed) {
      SERVER_RECOVERY_STORE.delete(k);
    }
  }

  const token = `rec_${crypto.randomBytes(24).toString('hex')}`;
  SERVER_RECOVERY_STORE.set(token, {
    token,
    userId,
    email: email || '',
    createdAt: now,
    expiresAt: now + 5 * 60 * 1000, // 5 minutes strict TTL
    consumed: false
  });
  return token;
}

export function getValidRecoveryTransaction(recToken: string): {
  valid: boolean;
  error?: { code: string; message: string };
  tx?: ServerRecoveryTransaction;
} {
  const now = Date.now();
  const tx = SERVER_RECOVERY_STORE.get(recToken);
  if (!tx) {
    return {
      valid: false,
      error: { code: 'INVALID_RECOVERY_TOKEN', message: 'Token pemulihan tidak valid atau tidak terdaftar.' }
    };
  }

  if (tx.consumed) {
    return {
      valid: false,
      error: { code: 'TOKEN_ALREADY_USED', message: 'Bukti sesi pemulihan telah digunakan sebelumnya (token replay dicegah). Silakan minta tautan baru.' }
    };
  }

  if (now > tx.expiresAt) {
    SERVER_RECOVERY_STORE.delete(recToken);
    return {
      valid: false,
      error: { code: 'TOKEN_EXPIRED', message: 'Token pemulihan telah kedaluwarsa. Silakan minta tautan baru.' }
    };
  }

  return { valid: true, tx };
}

/**
 * Detects if a token is a standard login access token rather than an official recovery credential.
 */
export function isLoginAccessToken(tokenCandidate?: string): boolean {
  if (!tokenCandidate || typeof tokenCandidate !== 'string') return false;
  const clean = tokenCandidate.replace(/^Bearer\s+/i, '').trim();
  if (clean.startsWith('eyJ') && clean.includes('.')) {
    const parts = clean.split('.');
    if (parts.length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        if (Array.isArray(payload.amr)) {
          const hasRecovery = payload.amr.some((m: any) => m.method === 'recovery' || m.method === 'otp');
          const hasPassword = payload.amr.some((m: any) => m.method === 'password');
          if (hasPassword && !hasRecovery) {
            return true;
          }
        }
      } catch {}
    }
  }
  return false;
}

/**
 * Verifies recovery session credentials (PKCE code or OTP token_hash with type: 'recovery').
 * Strictly rejects ordinary login access tokens.
 * Issues a short-lived, single-use, account-bound recoveryToken for password update.
 */
export async function verifySupabaseRecoveryToken(params: {
  accessToken?: string;
  recoveryToken?: string;
  code?: string;
  token_hash?: string;
}): Promise<SupabaseAuthResponse<{ userId: string; email?: string; recoveryToken?: string }>> {
  const { accessToken, recoveryToken, code, token_hash } = params;

  // 1. Strictly detect and reject ordinary login access tokens
  if (accessToken || isLoginAccessToken(recoveryToken)) {
    return {
      success: false,
      error: {
        code: 'LOGIN_TOKEN_REJECTED_AS_RECOVERY_PROOF',
        message: 'Access token sesi login biasa tidak dapat digunakan sebagai bukti pemulihan kata sandi. Wajib menggunakan tautan atau kode pemulihan resmi dari email.'
      }
    };
  }

  const client = getSupabaseBackendClient();
  if (!client) {
    return {
      success: false,
      error: { code: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase client backend belum dikonfigurasi.' }
    };
  }

  // 2. PKCE Code Exchange (from email redirect: ?code=...)
  if (code && typeof code === 'string' && code.trim()) {
    try {
      const { data, error } = await client.auth.exchangeCodeForSession(code.trim());
      if (error || !data.user) {
        const errMsg = (error?.message || '').toLowerCase();
        const isExpired = errMsg.includes('expired');
        const isUsed = errMsg.includes('already used') || errMsg.includes('already consumed');
        return {
          success: false,
          error: {
            code: isUsed ? 'TOKEN_ALREADY_USED' : (isExpired ? 'TOKEN_EXPIRED' : 'INVALID_RECOVERY_CODE'),
            message: isUsed
              ? 'Kode otorisasi pemulihan telah digunakan sebelumnya (token replay dicegah).'
              : (isExpired
                ? 'Kode verifikasi pemulihan telah kedaluwarsa. Silakan minta tautan baru.'
                : (error?.message || 'Kode verifikasi recovery tidak valid atau telah kedaluwarsa.'))
          }
        };
      }
      const recToken = createRecoveryTransaction(data.user.id, data.user.email || '');
      return {
        success: true,
        data: {
          userId: data.user.id,
          email: data.user.email,
          recoveryToken: recToken
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'EXCHANGE_CODE_EXCEPTION', message: err?.message || 'Gagal menukar authorization code.' }
      };
    }
  }

  // 3. OTP Token Hash (from email redirect: ?token_hash=...&type=recovery)
  if (token_hash && typeof token_hash === 'string' && token_hash.trim()) {
    try {
      const { data, error } = await client.auth.verifyOtp({
        token_hash: token_hash.trim(),
        type: 'recovery'
      });
      if (error || !data.user) {
        const errMsg = (error?.message || '').toLowerCase();
        const isExpired = errMsg.includes('expired');
        const isUsed = errMsg.includes('already used') || errMsg.includes('already consumed');
        return {
          success: false,
          error: {
            code: isUsed ? 'TOKEN_ALREADY_USED' : (isExpired ? 'TOKEN_EXPIRED' : 'INVALID_RECOVERY_OTP'),
            message: isUsed
              ? 'Token hash pemulihan telah digunakan sebelumnya (token replay dicegah).'
              : (isExpired
                ? 'Token hash pemulihan telah kedaluwarsa. Silakan minta tautan baru.'
                : (error?.message || 'Token verifikasi OTP pemulihan tidak valid atau telah kedaluwarsa.'))
          }
        };
      }
      const recToken = createRecoveryTransaction(data.user.id, data.user.email || '');
      return {
        success: true,
        data: {
          userId: data.user.id,
          email: data.user.email,
          recoveryToken: recToken
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'VERIFY_OTP_EXCEPTION', message: err?.message || 'Gagal memverifikasi OTP recovery.' }
      };
    }
  }

  // 4. Pre-verified Recovery Transaction (issued in Step 1)
  if (recoveryToken && typeof recoveryToken === 'string' && recoveryToken.trim()) {
    const txCheck = getValidRecoveryTransaction(recoveryToken.trim());
    if (!txCheck.valid || !txCheck.tx) {
      return {
        success: false,
        error: txCheck.error || { code: 'INVALID_RECOVERY_TOKEN', message: 'Token recovery tidak valid atau telah kedaluwarsa.' }
      };
    }
    return {
      success: true,
      data: {
        userId: txCheck.tx.userId,
        email: txCheck.tx.email,
        recoveryToken: txCheck.tx.token
      }
    };
  }

  return {
    success: false,
    error: {
      code: 'MISSING_RECOVERY_CREDENTIALS',
      message: 'Kode otorisasi (code), token hash (token_hash), atau token pemulihan (recoveryToken) wajib disertakan.'
    }
  };
}

/**
 * Updates a user's password following recovery verification.
 * CRITICAL SECURITY:
 * - NEVER accepts or trusts client-supplied verifiedUserId.
 * - The target user ID MUST be cryptographically validated by Supabase Auth or verified recovery proof.
 * - Enforces minimum password strength and confirmation match.
 * - Enforces authoritative staff account active status.
 * - Immediately executes global sign-out to invalidate old sessions and prevent token replay.
 * - Output contract omits userId to prevent identifier leakage.
 */
export async function updateSupabaseUserPassword(params: {
  newPassword: string;
  confirmPassword?: string;
  accessToken?: string;
  recoveryToken?: string;
  code?: string;
  token_hash?: string;
}): Promise<SupabaseAuthResponse<{ email?: string }>> {
  const { newPassword, confirmPassword, accessToken, recoveryToken, code, token_hash } = params;

  // 1. Fail-fast input validation
  if (!newPassword || typeof newPassword !== 'string') {
    return {
      success: false,
      error: { code: 'INVALID_PASSWORD', message: 'Kata sandi baru wajib diisi.' }
    };
  }

  if (newPassword.length < 8) {
    return {
      success: false,
      error: { code: 'INVALID_PASSWORD_LENGTH', message: 'Kata sandi baru minimal harus 8 karakter.' }
    };
  }

  if (confirmPassword !== undefined && newPassword !== confirmPassword) {
    return {
      success: false,
      error: { code: 'PASSWORD_MISMATCH', message: 'Konfirmasi kata sandi tidak cocok dengan kata sandi baru.' }
    };
  }

  // 2. Reject login access token outright
  if (accessToken || isLoginAccessToken(recoveryToken)) {
    return {
      success: false,
      error: {
        code: 'LOGIN_TOKEN_REJECTED_AS_RECOVERY_PROOF',
        message: 'Access token sesi login biasa tidak dapat digunakan sebagai bukti pemulihan kata sandi. Wajib menggunakan tautan atau kode pemulihan resmi dari email.'
      }
    };
  }

  if (!code && !token_hash && !recoveryToken) {
    return {
      success: false,
      error: {
        code: 'MISSING_RECOVERY_CREDENTIALS',
        message: 'Bukti pemulihan (code, token_hash, atau recoveryToken) wajib disertakan.'
      }
    };
  }

  // 3. Client configuration check
  const client = getSupabaseBackendClient();
  if (!client) {
    return {
      success: false,
      error: { code: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase client backend belum dikonfigurasi.' }
    };
  }

  let authenticatedUserId: string = '';
  let authenticatedEmail: string = '';
  let isFromStore = false;
  let storeToken = '';

  // 4. Resolve target user strictly through Supabase Auth recovery proof
  if (code && typeof code === 'string' && code.trim()) {
    try {
      const { data, error } = await client.auth.exchangeCodeForSession(code.trim());
      if (error || !data.user) {
        const errMsg = (error?.message || '').toLowerCase();
        const isExpired = errMsg.includes('expired');
        const isUsed = errMsg.includes('already used') || errMsg.includes('already consumed');
        return {
          success: false,
          error: {
            code: isUsed ? 'TOKEN_ALREADY_USED' : (isExpired ? 'TOKEN_EXPIRED' : 'INVALID_RECOVERY_CODE'),
            message: isUsed
              ? 'Kode otorisasi pemulihan telah digunakan sebelumnya (token replay dicegah).'
              : (isExpired
                ? 'Kode verifikasi pemulihan telah kedaluwarsa. Silakan minta tautan baru.'
                : (error?.message || 'Kode verifikasi recovery tidak valid.'))
          }
        };
      }
      authenticatedUserId = data.user.id;
      authenticatedEmail = data.user.email || '';
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'EXCHANGE_CODE_EXCEPTION', message: err?.message || 'Gagal menukar authorization code.' }
      };
    }
  } else if (token_hash && typeof token_hash === 'string' && token_hash.trim()) {
    try {
      const { data, error } = await client.auth.verifyOtp({
        token_hash: token_hash.trim(),
        type: 'recovery'
      });
      if (error || !data.user) {
        const errMsg = (error?.message || '').toLowerCase();
        const isExpired = errMsg.includes('expired');
        const isUsed = errMsg.includes('already used') || errMsg.includes('already consumed');
        return {
          success: false,
          error: {
            code: isUsed ? 'TOKEN_ALREADY_USED' : (isExpired ? 'TOKEN_EXPIRED' : 'INVALID_RECOVERY_OTP'),
            message: isUsed
              ? 'Token hash pemulihan telah digunakan sebelumnya (token replay dicegah).'
              : (isExpired
                ? 'Token hash pemulihan telah kedaluwarsa. Silakan minta tautan baru.'
                : (error?.message || 'Token verifikasi OTP recovery tidak valid.'))
          }
        };
      }
      authenticatedUserId = data.user.id;
      authenticatedEmail = data.user.email || '';
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'VERIFY_OTP_EXCEPTION', message: err?.message || 'Gagal memverifikasi OTP recovery.' }
      };
    }
  } else if (recoveryToken && typeof recoveryToken === 'string' && recoveryToken.trim()) {
    const txCheck = getValidRecoveryTransaction(recoveryToken.trim());
    if (!txCheck.valid || !txCheck.tx) {
      return {
        success: false,
        error: txCheck.error || { code: 'INVALID_RECOVERY_TOKEN', message: 'Token recovery tidak valid atau telah kedaluwarsa.' }
      };
    }
    // Mark consumed immediately to prevent race conditions or replay
    txCheck.tx.consumed = true;
    isFromStore = true;
    storeToken = recoveryToken.trim();
    authenticatedUserId = txCheck.tx.userId;
    authenticatedEmail = txCheck.tx.email;
  }

  if (!authenticatedUserId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED_RECOVERY', message: 'Bukti pemulihan tidak valid atau tidak dapat diverifikasi.' }
    };
  }

  // 5. Verify authoritative staff directory state
  try {
    const userRes = await findUserInSupabaseDetailed(authenticatedUserId);
    if (userRes.success && userRes.data) {
      if (userRes.data.isDeleted) {
        return {
          success: false,
          error: { code: 'ACCOUNT_DELETED', message: 'Akun telah dihapus dari sistem MoraJaws. Pembaruan kata sandi ditolak.' }
        };
      }
      if (!userRes.data.active) {
        return {
          success: false,
          error: { code: 'ACCOUNT_DISABLED', message: 'Akun Anda sedang dinonaktifkan oleh Administrator.' }
        };
      }
    }
  } catch {}

  // 6. Update user password using Supabase Auth Admin API
  try {
    const { data: updatedData, error: updateError } = await client.auth.admin.updateUserById(authenticatedUserId, {
      password: newPassword
    });

    if (updateError) {
      return {
        success: false,
        error: { code: 'UPDATE_PASSWORD_FAILED', message: updateError.message }
      };
    }

    // 7. Global Sign Out: Revoke all existing sessions to enforce re-login with new password
    try {
      await client.auth.admin.signOut(authenticatedUserId, 'global');
    } catch {}

    // Cleanup recovery transaction
    if (isFromStore && storeToken) {
      SERVER_RECOVERY_STORE.delete(storeToken);
    }

    return {
      success: true,
      data: {
        email: updatedData?.user?.email || authenticatedEmail
      }
    };
  } catch (err: any) {
    return {
      success: false,
      error: { code: 'UPDATE_PASSWORD_EXCEPTION', message: err?.message || 'Exception during password update.' }
    };
  }
}

/**
 * Approves and links a Supabase Auth UID to an authoritative staff profile.
 * - Requires super_admin authority.
 * - Enforces valid UUID format for authUserId.
 * - Enforces 1:1 mapping (no duplicate authUserId across active staff).
 * - Updates Supabase users table with authUserId and approval metadata.
 * - Verifies the update by immediately reading back from the database.
 * - Never mutates the primary key profile.id.
 */
export async function approveAuthUidMapping(params: {
  staffId: string;
  authUserId: string;
  adminUser: ServerUser;
}): Promise<SupabaseAuthResponse<{ staffId: string; authUserId: string; verified: boolean }>> {
  const { staffId, authUserId, adminUser } = params;

  if (!adminUser || adminUser.role !== 'super_admin') {
    return {
      success: false,
      error: { code: 'FORBIDDEN', message: 'Hanya Super Admin yang berwenang menyetujui pemetaan identitas Auth UID.' }
    };
  }

  const cleanStaffId = (staffId || '').trim();
  const cleanAuthUid = (authUserId || '').trim();

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!cleanStaffId || !cleanAuthUid || !uuidRegex.test(cleanAuthUid)) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: 'staffId dan authUserId (format UUID valid) wajib diisi.' }
    };
  }

  // 1. Fetch target staff profile
  const targetRes = await findUserInSupabaseDetailed(cleanStaffId);
  if (!targetRes.success || !targetRes.data) {
    return {
      success: false,
      error: { code: 'STAFF_NOT_FOUND', message: `Profil staf "${cleanStaffId}" tidak ditemukan dalam database authoritative.` }
    };
  }
  const staff = targetRes.data;
  if (staff.isDeleted) {
    return {
      success: false,
      error: { code: 'ACCOUNT_DELETED', message: 'Tidak dapat memetakan akun staf yang telah dihapus.' }
    };
  }
  if (!staff.active) {
    return {
      success: false,
      error: { code: 'ACCOUNT_DISABLED', message: 'Tidak dapat memetakan akun staf yang sedang dinonaktifkan.' }
    };
  }

  // 2. Enforce 1:1 uniqueness check
  const { getUsersFromSupabase } = await import('./supabaseAdapter.ts');
  const allUsersRes = await getUsersFromSupabase(true);
  // Fail closed: uniqueness cannot be asserted if the authoritative directory read fails.
  if (!allUsersRes.success || !Array.isArray(allUsersRes.data)) {
    return {
      success: false,
      error: {
        code: 'MAPPING_DIRECTORY_UNAVAILABLE',
        message: 'Pemetaan dibatalkan karena direktori staf authoritative tidak dapat diverifikasi. Coba lagi setelah koneksi database pulih.'
      }
    };
  }
  const existingWithSameUid = allUsersRes.data.find(
    u => !u.isDeleted && u.id !== staff.id && (u.authUserId === cleanAuthUid || (u as any).payload?.authUserId === cleanAuthUid)
  );
  if (existingWithSameUid) {
    return {
      success: false,
      error: {
        code: 'AUTH_UID_ALREADY_MAPPED',
        message: `Auth UID "${cleanAuthUid}" sudah dipetakan ke profil staf lain (${existingWithSameUid.name} - ${existingWithSameUid.id}).`
      }
    };
  }

  // 3. Update staff record with authUserId and approval metadata
  const { updateUserInSupabase } = await import('./supabaseAdapter.ts');
  const updateRes = await updateUserInSupabase(staff.id, {
    authUserId: cleanAuthUid,
    payload: {
      ...(staff as any).payload,
      authUserId: cleanAuthUid,
      mappingApprovedBy: adminUser.id,
      mappingApprovedByName: adminUser.name,
      mappingApprovedAt: new Date().toISOString()
    }
  } as any);

  if (!updateRes.success) {
    return {
      success: false,
      error: {
        code: 'MAPPING_UPDATE_FAILED',
        message: updateRes.error?.message || 'Gagal menyimpan mapping identitas ke database authoritative.'
      }
    };
  }

  // 4. Critical Read-Back Verification: Re-query database to verify persisted state
  const verifyRes = await findUserInSupabaseDetailed(staff.id);
  if (!verifyRes.success || !verifyRes.data) {
    return {
      success: false,
      error: {
        code: 'MAPPING_VERIFICATION_FAILED',
        message: 'Gagal memverifikasi hasil penyimpanan pemetaan: data tidak dapat dibaca kembali.'
      }
    };
  }

  const reReadUser = verifyRes.data;
  const persistedAuthUid = reReadUser.authUserId || (reReadUser as any).payload?.authUserId;
  if (persistedAuthUid !== cleanAuthUid) {
    return {
      success: false,
      error: {
        code: 'MAPPING_VERIFICATION_FAILED',
        message: `Verifikasi gagal: nilai tersimpan "${persistedAuthUid}" tidak sesuai dengan yang diharapkan "${cleanAuthUid}".`
      }
    };
  }

  return {
    success: true,
    data: {
      staffId: staff.id,
      authUserId: cleanAuthUid,
      verified: true
    }
  };
}
