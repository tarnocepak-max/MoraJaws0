// ==============================================================================
// MORAJAWS CLIENT-SIDE SUPABASE MODULE (PHASE 13 REMEDIATION)
// SECURITY & ARCHITECTURE DIRECTIVE:
// 1. DILARANG membuat Supabase Client langsung di browser (createClient).
// 2. Kredensial server-side admin key dan secret key dilarang keras ada di frontend.
// 3. Seluruh akses database Supabase wajib melalui Express Backend Proxy (/api/supabase/*).
// 4. Autentikasi dan autorisasi ditegakkan sepenuhnya oleh server backend Express.
// 5. Status koneksi HANYA berasal dari verifikasi aktif backend (fail-closed).
// ==============================================================================

export type ConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'CHECKING';

export interface ClientSupabaseStatus {
  isConfigured: boolean;
  isBackendProxied: boolean;
  status: ConnectionStatus;
  message: string;
  lastCheckedAt?: string;
  latencyMs?: number;
}

// In-memory cached status derived from backend health verification
// Initial state is strictly 'CHECKING' (never assumes 'CONNECTED')
let currentStatus: ClientSupabaseStatus = {
  isConfigured: false,
  isBackendProxied: true,
  status: 'CHECKING',
  message: 'Menunggu pemeriksaan koneksi dari backend Express...'
};

/**
 * Direct client-side Supabase instance is permanently disabled per Security Constitution.
 * Returns null to prevent any browser-side direct DB connection.
 */
export function getClientSupabaseInstance(): null {
  return null;
}

/**
 * Checks Supabase backend-proxy configuration status.
 * Returns the actively verified backend connection status.
 * Never blindly returns 'CONNECTED'.
 */
export function checkClientSupabaseStatus(): ClientSupabaseStatus {
  return currentStatus;
}

/**
 * Actively queries the backend health probe to determine authentic Supabase status.
 * Strictly uses backend proxy (/api/health or /api/supabase/status).
 */
export async function refreshClientSupabaseStatus(): Promise<ClientSupabaseStatus> {
  currentStatus = {
    ...currentStatus,
    status: 'CHECKING',
    message: 'Memeriksa status koneksi database backend...'
  };

  try {
    const res = await fetch('/api/health');
    if (!res.ok) {
      currentStatus = {
        isConfigured: false,
        isBackendProxied: true,
        status: 'ERROR',
        message: `Backend mengembalikan kode status error (${res.status}).`,
        lastCheckedAt: new Date().toISOString()
      };
      return currentStatus;
    }

    const data = await res.json();
    const sb = data?.supabase;

    if (sb?.status === 'connected') {
      currentStatus = {
        isConfigured: true,
        isBackendProxied: true,
        status: 'CONNECTED',
        message: sb.message || 'Koneksi Supabase aktif dan terverifikasi via backend.',
        latencyMs: sb.latencyMs,
        lastCheckedAt: new Date().toISOString()
      };
    } else if (sb?.status === 'disconnected') {
      currentStatus = {
        isConfigured: Boolean(sb.urlConfigured && sb.serviceRoleConfigured),
        isBackendProxied: true,
        status: 'DISCONNECTED',
        message: sb.message || 'Jaringan ke Supabase tidak dapat dijangkau oleh backend.',
        lastCheckedAt: new Date().toISOString()
      };
    } else {
      currentStatus = {
        isConfigured: Boolean(sb?.urlConfigured && sb?.serviceRoleConfigured),
        isBackendProxied: true,
        status: 'ERROR',
        message: sb?.message || 'Database Supabase belum terkonfigurasi atau skema belum siap.',
        lastCheckedAt: new Date().toISOString()
      };
    }
  } catch (err: any) {
    currentStatus = {
      isConfigured: false,
      isBackendProxied: true,
      status: 'DISCONNECTED',
      message: 'Gagal menghubungi backend untuk verifikasi status Supabase.',
      lastCheckedAt: new Date().toISOString()
    };
  }

  return currentStatus;
}

/**
 * Synchronous state setter for testing and deterministic state initialization.
 */
export function setClientSupabaseStatusForTesting(status: ConnectionStatus, message?: string): void {
  currentStatus = {
    isConfigured: status === 'CONNECTED',
    isBackendProxied: true,
    status,
    message: message || `Status set to ${status} for testing`,
    lastCheckedAt: new Date().toISOString()
  };
}
