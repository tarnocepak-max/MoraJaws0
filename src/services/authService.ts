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
  | 'setting_droplist';

/**
 * Central Permission Matrix strictly according to the MoraJaws specification:
 * Feature                             | Super Admin | Dispatch | Leader           | Installer
 * Login                               | Yes         | Yes      | Yes              | Yes
 * Kelola akun pengguna umum           | Yes         | No       | No               | No
 * Membuat akun staf (Dispatch/Leader) | Yes         | No       | No (Dilarang)    | No
 * Membuat akun Teknisi (Installer)    | Yes         | No       | Yes (Hanya Mitra)| No
 * Mengubah akun pengguna              | Yes         | No       | No               | No
 * Menonaktifkan akun                  | Yes         | No       | No               | No
 * Menghapus akun pengguna             | Yes (Strict)| No       | No               | No
 * Import data                         | Yes         | Yes      | No               | No
 * Kelola mapping field                | Yes         | No       | No               | No
 * Melihat seluruh WO                  | Yes         | Yes      | No               | No
 * Melihat WO kontraktor               | Yes         | Yes      | Yes              | Only assigned
 * Distribusi WO                       | Yes         | Yes      | No               | No
 * Assign WO ke Teknisi                | No          | No       | Yes (Only)       | No
 * Mengatur jadwal Leader              | Yes         | Yes      | No               | No
 * Mengubah laporan teknis             | Yes         | Yes      | No               | Only assigned
 * Mengakses live chat                 | Yes         | Yes      | Contractor WO    | Assigned WO
 * Mengelola kontraktor                | Yes         | No       | No               | No
 * Melihat audit log                   | Yes         | No       | No               | No
 * Database Management                 | Yes         | No       | No               | No
 * Mengubah data WO                    | Yes         | Yes      | No               | Only assigned rep
 * Menghapus data WO                   | Yes (Strict)| No       | No               | No
 * Menghapus data pelanggan            | Yes (Strict)| No       | No               | No
 * Menghapus histori/audit             | Super Admin | No       | No               | No
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
    'delete_wo_data',
    'delete_customer_data',
    'permanent_delete',
    'system_health',
    'application_configuration',
    'ui_configuration',
    'setting_droplist'
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
    'edit_wo_data'
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
    'database_management'
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
