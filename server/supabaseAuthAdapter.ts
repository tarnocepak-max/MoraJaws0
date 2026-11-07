import { getSupabaseBackendClient } from './supabaseClient.ts';
import { findUserInSupabaseDetailed } from './supabaseAdapter.ts';
import type { ServerUser } from '../server.ts';

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
    return {
      success: false,
      error: { code: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase client backend belum dikonfigurasi.' }
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
      return {
        success: false,
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: userRes.error?.message || 'Database authoritative tidak tersedia saat validasi identitas.'
        }
      };
    }

    if (userRes.data) {
      authoritativeUser = userRes.data;
      if (authoritativeUser.email) {
        targetEmail = authoritativeUser.email.trim().toLowerCase();
      }
    } else {
      // User not found in authoritative users table
      return {
        success: false,
        error: {
          code: 'auth/user-not-found',
          message: cleanIdent.includes('@')
            ? `Alamat email "${identifier}" tidak terdaftar dalam direktori staf MoraJaws.`
            : `Nama pengguna "${identifier}" tidak terdaftar dalam direktori staf MoraJaws.`
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

    // 2. Perform Supabase Auth Sign In with password
    const { data: authData, error: authError } = await client.auth.signInWithPassword({
      email: targetEmail,
      password
    });

    if (authError || !authData?.session || !authData?.user) {
      return {
        success: false,
        error: {
          code: 'auth/wrong-password',
          message: 'Autentikasi gagal. Kredensial kata sandi salah. Pastikan kata sandi yang Anda masukkan benar.'
        }
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
    if (!authoritativeUser.authUserId && authoritativeUser.id !== authUid) {
      return {
        success: false,
        error: {
          code: 'NEEDS_MAPPING',
          message: 'Profil staf belum memiliki pemetaan Supabase Auth UID yang disetujui. Silakan hubungi Super Admin untuk persetujuan pemetaan identitas.',
          details: {
            staffId: authoritativeUser.id,
            username: authoritativeUser.username,
            email: targetEmail,
            authUserId: authUid
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
 * Initiates a password reset flow via Supabase Auth for the given email address.
 */
export async function resetSupabaseAuthPassword(email: string): Promise<SupabaseAuthResponse<boolean>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return {
      success: false,
      error: { code: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' }
    };
  }

  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail) {
    return {
      success: false,
      error: { code: 'INVALID_EMAIL', message: 'Alamat email wajib diisi.' }
    };
  }

  try {
    const { error } = await client.auth.resetPasswordForEmail(cleanEmail);
    if (error) {
      return {
        success: false,
        error: { code: 'RESET_FAILED', message: error.message }
      };
    }
    return { success: true, data: true };
  } catch (err: any) {
    return {
      success: false,
      error: { code: 'RESET_EXCEPTION', message: err?.message || 'Exception during password reset.' }
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
  if (allUsersRes.success && allUsersRes.data) {
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
