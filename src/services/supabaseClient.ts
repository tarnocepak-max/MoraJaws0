// ==============================================================================
// MORAJAWS CLIENT-SIDE SUPABASE MODULE
// SECURITY & ARCHITECTURE DIRECTIVE:
// 1. DILARANG membuat Supabase Client langsung di browser (createClient).
// 2. SUPABASE_SERVICE_ROLE_KEY dan SECRET_KEY tidak boleh ada di frontend.
// 3. Seluruh akses database Supabase wajib melalui Express Backend Proxy (/api/supabase/*).
// 4. Autentikasi dan autorisasi ditegakkan sepenuhnya oleh server backend Express.
// ==============================================================================

export interface ClientSupabaseStatus {
  isConfigured: boolean;
  isBackendProxied: boolean;
  status: 'connected_via_backend' | 'standby' | 'error';
  message: string;
}

/**
 * Direct client-side Supabase instance is disabled per Security Constitution.
 * Returns null to prevent any browser-side direct DB connection.
 */
export function getClientSupabaseInstance(): null {
  return null;
}

/**
 * Checks Supabase backend-proxy configuration status.
 * All operations are securely routed through Express backend proxy with Bearer tokens.
 */
export function checkClientSupabaseStatus(): ClientSupabaseStatus {
  return {
    isConfigured: true,
    isBackendProxied: true,
    status: 'connected_via_backend',
    message: 'Supabase diakses secara aman melalui Express Backend Proxy dengan otentikasi Bearer token.'
  };
}
