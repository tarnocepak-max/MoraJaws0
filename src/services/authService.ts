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
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
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
 * Returns authenticated HTTP headers for browser client.
 * Browser authentication is maintained exclusively via HttpOnly session cookies with credentials: 'include'.
 * Access tokens, refresh tokens, and user credentials from localStorage are strictly removed.
 */
export function getAuthHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Morajaws-Client': 'browser'
  };
}

/**
 * Official MoraJaws Supabase Auth client methods communicating through Express backend
 */
export async function loginWithSupabase(identifier: string, password: string) {
  const res = await fetch('/api/auth/supabase-login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Morajaws-Client': 'browser'
    },
    credentials: 'include',
    body: JSON.stringify({ identifier: identifier.trim(), password })
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/**
 * Refreshes session strictly using server-side HttpOnly cookie.
 * Does not accept or transmit refresh token via body, headers, or query parameters.
 */
export async function refreshSupabaseSession() {
  const res = await fetch('/api/auth/supabase-refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Morajaws-Client': 'browser'
    },
    credentials: 'include',
    body: JSON.stringify({})
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function logoutSupabase() {
  const res = await fetch('/api/auth/logout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Morajaws-Client': 'browser'
    },
    credentials: 'include'
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/**
 * Initiates password recovery through Express backend with server-authoritative canonical redirect.
 */
export async function requestPasswordRecovery(identifier: string, customRedirectTo?: string) {
  const body: Record<string, string> = {
    emailOrUsername: identifier.trim()
  };
  if (customRedirectTo && typeof customRedirectTo === 'string' && customRedirectTo.trim()) {
    body.redirectTo = customRedirectTo.trim();
  }
  const res = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/**
 * Verifies recovery token, code, or hash server-side
 */
export async function verifyRecoverySession(params: {
  accessToken?: string;
  recoveryToken?: string;
  code?: string;
  token_hash?: string;
}) {
  const res = await fetch('/api/auth/verify-recovery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/**
 * Submits new password for recovery through Express backend.
 * Never supplies or trusts verifiedUserId or login accessToken from browser.
 */
export async function resetPasswordWithRecoveryToken(params: {
  newPassword: string;
  confirmPassword: string;
  recoveryToken?: string;
  code?: string;
  token_hash?: string;
}) {
  const res = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}



