import { User, UserRole } from '../types/index.ts';

export type Permission =
  | 'login'
  | 'manage_users'
  | 'create_user'
  | 'create_installer'
  | 'update_user'
  | 'toggle_user_status'
  | 'delete_user'
  | 'import_data'
  | 'manage_field_mapping'
  | 'view_all_wo'
  | 'view_contractor_wo'
  | 'view_assigned_wo'
  | 'distribute_wo'
  | 'assign_technician'
  | 'manage_leader_schedule'
  | 'edit_technical_report'
  | 'access_live_chat'
  | 'manage_contractors'
  | 'view_audit_logs'
  | 'edit_wo_data'
  | 'delete_wo_data'
  | 'delete_customer_data'
  | 'database_management'
  | 'permanent_delete'
  | 'system_health'
  | 'application_configuration'
  | 'ui_configuration'
  | 'setting_droplist'
  | 'manage_whatsapp_templates';

/**
 * Central Permission Matrix strictly aligned with MoraJaws Phase 9O RBAC decisions:
 * - Audit Logs: super_admin (READ), it_support (READ-ONLY). All other roles DENY.
 * - Penghapusan WO: management_data ONLY. super_admin and all other roles DENY.
 * - WhatsApp Templates: super_admin & dispatch ALLOW. All other roles DENY.
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  super_admin: [
    'login',
    'manage_users',
    'create_user',
    'create_installer',
    'update_user',
    'toggle_user_status',
    'delete_user',
    'import_data',
    'manage_field_mapping',
    'view_all_wo',
    'view_contractor_wo',
    'view_assigned_wo',
    'distribute_wo',
    'manage_leader_schedule',
    'edit_technical_report',
    'access_live_chat',
    'manage_contractors',
    'view_audit_logs',
    'database_management',
    'edit_wo_data',
    'system_health',
    'application_configuration',
    'ui_configuration',
    'setting_droplist',
    'manage_whatsapp_templates'
  ],
  dispatch: [
    'login',
    'import_data',
    'view_all_wo',
    'view_contractor_wo',
    'distribute_wo',
    'manage_leader_schedule',
    'edit_technical_report',
    'access_live_chat',
    'edit_wo_data',
    'manage_whatsapp_templates'
  ],
  leader: [
    'login',
    'view_contractor_wo',
    'access_live_chat',
    'assign_technician',
    'create_installer'
  ],
  installer: [
    'login',
    'view_assigned_wo',
    'edit_technical_report',
    'access_live_chat'
  ],
  management_data: [
    'login',
    'view_all_wo',
    'view_contractor_wo',
    'import_data',
    'manage_field_mapping',
    'database_management',
    'delete_wo_data'
  ],
  it_support: [
    'login',
    'system_health',
    'application_configuration',
    'ui_configuration',
    'setting_droplist',
    'view_audit_logs'
  ]
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  return Array.isArray(permissions) ? permissions.includes(permission) : false;
}

// SHA-256 password hash generator with salt
export async function hashPassword(password: string, salt: string = 'morajaws_secure_salt_2026'): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${salt}:${password}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Synchronous fallback hash for initial setup & fast verification
export function quickHash(password: string, salt: string = 'morajaws_secure_salt_2026'): string {
  let h = 0x811c9dc5;
  const str = `${salt}:${password}`;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}

// Default initial hashed passwords for default seed accounts
export const DEFAULT_PASSWORD_HASH = quickHash('12345678');

export interface AuthSession {
  token: string;
  user: User;
  issuedAt: string;
  expiresAt: string;
}

export function createSession(user: User): AuthSession {
  const now = new Date();
  const expires = new Date(now.getTime() + 8 * 60 * 60 * 1000); // 8 hours
  const token = `mora_${user.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  return {
    token,
    user,
    issuedAt: now.toISOString(),
    expiresAt: expires.toISOString()
  };
}

export function getRoleDisplayName(role: UserRole): string {
  switch (role) {
    case 'super_admin':
      return 'Super Admin';
    case 'dispatch':
      return 'Dispatch';
    case 'leader':
      return 'Leader';
    case 'installer':
      return 'Installer';
    case 'management_data':
      return 'Management Data';
    case 'it_support':
      return 'IT Support Application';
    default:
      return role;
  }
}

/**
 * Returns authenticated HTTP headers including Authorization: Bearer <sessionToken>
 * sourced from official stored session in localStorage.
 * Custom spoofable headers (x-user-id, x-user-role, x-username) are strictly omitted.
 */
export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  try {
    const sessionStr = localStorage.getItem('morajaws_auth_session');
    if (sessionStr) {
      const sess = JSON.parse(sessionStr);
      if (sess?.token) {
        headers['Authorization'] = `Bearer ${sess.token}`;
      }
    }
  } catch (err) {
    console.warn('[authService] Failed to read auth session headers:', err);
  }
  return headers;
}

/**
 * Official MoraJaws Custom Authentication client methods communicating through Express backend
 */
export async function loginWithMoraJaws(identifier: string, password: string) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: identifier.trim(), password })
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Backwards-compatible alias
export const loginWithSupabase = loginWithMoraJaws;

export async function refreshMoraJawsSession(refreshToken?: string) {
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Backwards-compatible alias
export const refreshSupabaseSession = refreshMoraJawsSession;

export async function logoutMoraJaws() {
  const headers = getAuthHeaders();
  const res = await fetch('/api/auth/logout', {
    method: 'POST',
    headers
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Backwards-compatible alias
export const logoutSupabase = logoutMoraJaws;

/**
 * Superadmin-exclusive User Management API calls
 */
export async function adminCreateUser(userData: {
  name: string;
  username: string;
  email: string;
  altEmail?: string;
  phone?: string;
  role: UserRole;
  contractor?: string;
  contractorId?: string;
  area?: string;
  password: string;
}) {
  const headers = getAuthHeaders();
  const res = await fetch('/api/admin/users', {
    method: 'POST',
    headers,
    body: JSON.stringify(userData)
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function adminResetPassword(targetUserId: string, newPassword: string, confirmPassword: string) {
  const headers = getAuthHeaders();
  const res = await fetch('/api/auth/admin/reset-password', {
    method: 'POST',
    headers,
    body: JSON.stringify({ targetUserId, newPassword, confirmPassword })
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function adminUpdateUserStatus(targetUserId: string, status: 'active' | 'inactive' | 'locked' | 'unlocked', reason?: string) {
  const headers = getAuthHeaders();
  const res = await fetch(`/api/admin/users/${targetUserId}/status`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status, reason })
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function adminRevokeSessions(targetUserId: string) {
  const headers = getAuthHeaders();
  const res = await fetch(`/api/admin/users/${targetUserId}/revoke-sessions`, {
    method: 'POST',
    headers
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function adminUpdateUser(targetUserId: string, userData: Partial<User>) {
  const headers = getAuthHeaders();
  const res = await fetch(`/api/admin/users/${targetUserId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(userData)
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/**
 * Client Password Recovery Endpoints
 */
export async function requestPasswordRecovery(identifier: string) {
  const res = await fetch('/api/auth/request-password-recovery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier })
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function verifyRecoverySession(token: string | Record<string, any>) {
  const res = await fetch('/api/auth/verify-recovery-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(typeof token === 'string' ? { token } : token)
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function resetPasswordWithRecoveryToken(payload: {
  newPassword: string;
  confirmPassword: string;
  recoveryToken?: string | null;
  code?: string;
  token_hash?: string;
}) {
  const res = await fetch('/api/auth/reset-password-with-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}



