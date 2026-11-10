import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ==============================================================================
// MORAJAWS SUPABASE BACKEND CLIENT MODULE
// Provides a singleton client for trusted server-side execution.
// Strictly requires SUPABASE_SERVICE_ROLE_KEY for administrative backend access.
// Service Role Key is NEVER exposed to the frontend browser or API responses.
// Credentials are exclusively loaded from server process.env (no /proc scanning).
// ==============================================================================

/**
 * Resolves Supabase credentials strictly from server environment variables.
 * Disallows /proc filesystem reading.
 */
function resolveRuntimeSupabaseEnv(): void {
  // 1. Handle standard server-side aliases without exposing secrets
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SECRET_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SECRET_KEY;
  }

  // 2. Normalize SUPABASE_URL to origin (strip trailing /rest/v1 or subpaths)
  if (process.env.SUPABASE_URL) {
    try {
      const parsed = new URL(process.env.SUPABASE_URL.trim());
      if (parsed.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && parsed.protocol === 'http:')) {
        process.env.SUPABASE_URL = parsed.origin;
      }
    } catch {}
  }
}

// Execute environment resolution immediately on module load
resolveRuntimeSupabaseEnv();

export type SupabaseConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'not_configured'
  | 'error'
  | 'schema_not_initialized';

export interface SupabaseHealthResult {
  status: SupabaseConnectionStatus;
  urlConfigured: boolean;
  serviceRoleConfigured: boolean;
  anonKeyConfigured: boolean;
  latencyMs?: number;
  message: string;
}

// Singleton backend client instance
let supabaseInstance: SupabaseClient | null = null;

let lastCheckStatus: SupabaseHealthResult = {
  status: 'not_configured',
  urlConfigured: false,
  serviceRoleConfigured: false,
  anonKeyConfigured: false,
  message: 'Kredensial Supabase belum dikonfigurasi pada environment variables.'
};

/**
 * Safely decodes a JWT payload without external libraries.
 * Does not expose or leak token contents.
 */
function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const jsonStr = Buffer.from(padded, 'base64').toString('utf8');
    const parsed = JSON.parse(jsonStr);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Validates Supabase Secret Key (Service Role Key).
 * Supports:
 * 1. Modern Secret Key format: starts with 'sb_secret_'
 * 2. Legacy JWT format: valid 3-part JWT specifically with role: 'service_role'
 * Rejects arbitrary strings, short strings, and publishable/anon keys.
 */
export function isValidSupabaseSecretKey(key?: string): boolean {
  if (!key) return false;
  const trimmed = key.trim();

  // 1. Modern Supabase Secret Key (sb_secret_...)
  if (trimmed.startsWith('sb_secret_')) {
    return trimmed.length >= 20 && /^sb_secret_[A-Za-z0-9_\-\.]+$/.test(trimmed);
  }

  // 2. Legacy JWT format (eyJ...) with service_role payload
  if (trimmed.startsWith('eyJ')) {
    const payload = decodeJwtPayload(trimmed);
    if (!payload) return false;
    return payload.role === 'service_role';
  }

  return false;
}

/**
 * Validates Supabase Publishable Key (Anon Key).
 * Supports:
 * 1. Modern Publishable Key format: starts with 'sb_publishable_'
 * 2. Legacy JWT format: valid 3-part JWT specifically with role: 'anon'
 */
export function isValidSupabasePublishableKey(key?: string): boolean {
  if (!key) return false;
  const trimmed = key.trim();

  // 1. Modern Supabase Publishable Key (sb_publishable_...)
  if (trimmed.startsWith('sb_publishable_')) {
    return trimmed.length >= 20 && /^sb_publishable_[A-Za-z0-9_\-\.]+$/.test(trimmed);
  }

  // 2. Legacy JWT format (eyJ...) with anon payload
  if (trimmed.startsWith('eyJ')) {
    const payload = decodeJwtPayload(trimmed);
    if (!payload) return false;
    return payload.role === 'anon';
  }

  return false;
}

/**
 * Validates Supabase API key format (distinguishing secret vs publishable).
 * Preserved for backwards compatibility.
 */
export function isValidSupabaseKey(key?: string): boolean {
  return isValidSupabaseSecretKey(key) || isValidSupabasePublishableKey(key);
}

/**
 * Validates Supabase URL.
 * - Mandatory HTTPS in production environment.
 * - In non-production, supports HTTP for local testing (localhost / 127.0.0.1).
 * - Validates standard URL structure.
 */
export function isValidSupabaseUrl(urlString?: string): boolean {
  if (!urlString) return false;
  const trimmed = urlString.trim();

  try {
    const parsed = new URL(trimmed);
    const isHttps = parsed.protocol === 'https:';
    const isHttp = parsed.protocol === 'http:';

    if (!isHttps && !isHttp) {
      return false;
    }

    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && !isHttps) {
      return false;
    }

    if (!parsed.hostname || parsed.hostname.length < 3) {
      return false;
    }

    // Require hostname with dot, or localhost in non-production
    if (!parsed.hostname.includes('.')) {
      if (!isProduction && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
        return true;
      }
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Validates and initializes the backend Supabase client.
 * STRICT: Administrative backend client MUST use SUPABASE_SERVICE_ROLE_KEY.
 * Fallback to SUPABASE_ANON_KEY is permanently removed.
 * Returns null if SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing or invalid.
 */
export function getSupabaseBackendClient(): SupabaseClient | null {
  // Singleton pattern: return existing instance without recreating on each request
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  // Strict check: Secret key is mandatory. Never substitute with anon key.
  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  if (!isValidSupabaseUrl(supabaseUrl)) {
    console.warn('[Supabase Backend] URL Supabase tidak valid atau tidak menggunakan HTTPS.');
    return null;
  }

  if (!isValidSupabaseSecretKey(serviceRoleKey)) {
    console.warn('[Supabase Backend] SUPABASE_SERVICE_ROLE_KEY tidak valid (wajib berupa sb_secret_ atau format legacy service_role JWT).');
    return null;
  }

  try {
    const cleanUrl = new URL(supabaseUrl).origin;
    supabaseInstance = createClient(cleanUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });

    return supabaseInstance;
  } catch (err: any) {
    // Sanitized log without printing credentials
    console.error('[Supabase Backend] Inisialisasi client gagal:', err?.message || 'Kesalahan inisialisasi');
    return null;
  }
}

/**
 * Test helper: Sets mock or stub client for deterministic testing.
 */
export function setSupabaseBackendClientForTesting(client: any): void {
  supabaseInstance = client;
}

/**
 * Test helper: Resets backend client instance.
 */
export function resetSupabaseBackendClientForTesting(): void {
  supabaseInstance = null;
}

/**
 * Actively checks Supabase connection using the backend administrative client (Secret Key).
 * Differentiates states accurately:
 * - 'connected': connection and query succeeded.
 * - 'not_configured': environment variables missing or incomplete.
 * - 'schema_not_initialized': connection succeeded, but required tables are missing (PGRST205 / 42P01).
 * - 'error': credentials or authorization rejected by PostgREST / Supabase.
 * - 'disconnected': network unreachable / failure to fetch.
 */
export async function checkSupabaseConnection(): Promise<SupabaseHealthResult> {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();

  const urlConfigured = isValidSupabaseUrl(supabaseUrl);
  const serviceRoleConfigured = isValidSupabaseSecretKey(serviceRoleKey);
  const anonKeyConfigured = isValidSupabasePublishableKey(anonKey);

  // Check if mandatory backend credentials are fully configured
  if (!supabaseUrl || !serviceRoleKey) {
    lastCheckStatus = {
      status: 'not_configured',
      urlConfigured,
      serviceRoleConfigured,
      anonKeyConfigured,
      message: 'SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi pada environment variables.'
    };
    return lastCheckStatus;
  }

  if (!urlConfigured || !serviceRoleConfigured) {
    lastCheckStatus = {
      status: 'not_configured',
      urlConfigured,
      serviceRoleConfigured,
      anonKeyConfigured,
      message: !urlConfigured
        ? 'Format SUPABASE_URL tidak valid (wajib format URL valid dan HTTPS pada produksi).'
        : 'Format SUPABASE_SERVICE_ROLE_KEY tidak valid (wajib sb_secret_ atau legacy service_role JWT).'
    };
    return lastCheckStatus;
  }

  const client = getSupabaseBackendClient();
  if (!client) {
    lastCheckStatus = {
      status: 'error',
      urlConfigured,
      serviceRoleConfigured,
      anonKeyConfigured,
      message: 'Gagal membuat Supabase client backend administratif.'
    };
    return lastCheckStatus;
  }

  const startTime = Date.now();
  try {
    // Perform a lightweight probe query on the 'roles' table using the administrative client
    const { error } = await client.from('roles').select('code').limit(1);
    const latencyMs = Date.now() - startTime;

    if (error) {
      const errorCode = String(error.code || '').toUpperCase();
      const errorMsg = String(error.message || '').toLowerCase();

      // Check if table is not yet created in the database schema:
      // - PGRST205: PostgREST table not found in schema cache
      // - 42P01: PostgreSQL undefined_table (relation does not exist)
      if (
        errorCode === 'PGRST205' ||
        errorCode === '42P01' ||
        errorMsg.includes('schema cache') ||
        errorMsg.includes('does not exist') ||
        errorMsg.includes('relation')
      ) {
        lastCheckStatus = {
          status: 'schema_not_initialized',
          urlConfigured,
          serviceRoleConfigured,
          anonKeyConfigured,
          latencyMs,
          message: `Koneksi ke Supabase berhasil (${latencyMs}ms), namun skema tabel MoraJaws belum diinisialisasi (Kode: ${error.code || 'PGRST205'}).`
        };
        return lastCheckStatus;
      }

      // Check for authentication / authorization / invalid key errors:
      // - PGRST301: JWT expired or invalid
      // - 42501: PostgreSQL insufficient privilege
      // - 28P01 / 28000: Invalid authorization specification
      if (
        errorCode === 'PGRST301' ||
        errorCode === '42501' ||
        errorCode === '28P01' ||
        errorCode === '28000' ||
        errorMsg.includes('jwt') ||
        errorMsg.includes('apikey') ||
        errorMsg.includes('invalid api key') ||
        errorMsg.includes('unauthorized') ||
        errorMsg.includes('forbidden') ||
        errorMsg.includes('permission denied')
      ) {
        lastCheckStatus = {
          status: 'error',
          urlConfigured,
          serviceRoleConfigured,
          anonKeyConfigured,
          latencyMs,
          message: `Kredensial atau otorisasi Supabase ditolak: ${error.message} (Kode: ${error.code || 'AUTH_ERROR'})`
        };
        return lastCheckStatus;
      }

      // Other PostgREST / database error
      lastCheckStatus = {
        status: 'error',
        urlConfigured,
        serviceRoleConfigured,
        anonKeyConfigured,
        latencyMs,
        message: `Kueri Supabase ditolak: ${error.message} (Kode: ${error.code || 'UNKNOWN'})`
      };
      return lastCheckStatus;
    }

    // Connection and query successful
    lastCheckStatus = {
      status: 'connected',
      urlConfigured,
      serviceRoleConfigured,
      anonKeyConfigured,
      latencyMs,
      message: `Koneksi Supabase aktif dan terverifikasi (${latencyMs}ms).`
    };
    return lastCheckStatus;
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const errMsg = String(err?.message || '').toLowerCase();
    const errCode = String(err?.code || '').toUpperCase();

    // Accurately distinguish network failures from client/configuration errors
    const isNetworkError =
      errMsg.includes('fetch failed') ||
      errMsg.includes('failed to fetch') ||
      errMsg.includes('enotfound') ||
      errMsg.includes('econnrefused') ||
      errMsg.includes('etimedout') ||
      errMsg.includes('eai_again') ||
      errMsg.includes('econnreset') ||
      errMsg.includes('network') ||
      errCode === 'ENOTFOUND' ||
      errCode === 'ECONNREFUSED' ||
      errCode === 'ETIMEDOUT' ||
      errCode === 'EAI_AGAIN' ||
      errCode === 'ECONNRESET';

    if (isNetworkError) {
      lastCheckStatus = {
        status: 'disconnected',
        urlConfigured,
        serviceRoleConfigured,
        anonKeyConfigured,
        latencyMs,
        message: `Koneksi jaringan ke Supabase gagal: ${err?.message || 'Network unreachable'}`
      };
    } else {
      lastCheckStatus = {
        status: 'error',
        urlConfigured,
        serviceRoleConfigured,
        anonKeyConfigured,
        latencyMs,
        message: `Terjadi kesalahan saat memeriksa koneksi Supabase: ${err?.message || 'Unknown error'}`
      };
    }

    return lastCheckStatus;
  }
}

/**
 * Returns the cached health status from the latest check.
 */
export function getLastSupabaseHealthStatus(): SupabaseHealthResult {
  return lastCheckStatus;
}

/**
 * Returns true if both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are configured with valid formats.
 */
export function isSupabaseConfigured(): boolean {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)?.trim();
  return Boolean(supabaseUrl && serviceRoleKey && isValidSupabaseUrl(supabaseUrl) && isValidSupabaseSecretKey(serviceRoleKey));
}
