// ==============================================================================
// MORAJAWS CLIENT-SIDE SUPABASE MODULE
// SECURITY & ARCHITECTURE DIRECTIVE:
// 1. DILARANG membuat Supabase Client langsung di browser (createClient).
// 2. Kredensial server-side administratif (secret / service role key) tidak boleh ada di frontend.
// 3. Seluruh akses database Supabase wajib melalui Express Backend Proxy (/api/supabase/*).
// 4. Autentikasi dan autorisasi ditegakkan sepenuhnya oleh server backend Express.
// 5. Status koneksi wajib mencerminkan probe aktual ke database, bukan sekadar backend aktif.
// ==============================================================================

export type SupabaseConnectionState = 'CHECKING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';

export interface ClientSupabaseStatus {
  isConfigured: boolean;
  isBackendProxied: boolean;
  status: SupabaseConnectionState;
  backendAlive: boolean;
  databaseConnected: boolean;
  latencyMs?: number;
  message: string;
  checkedAt?: string;
}

let cachedStatus: ClientSupabaseStatus = {
  isConfigured: false,
  isBackendProxied: true,
  status: 'CHECKING',
  backendAlive: true,
  databaseConnected: false,
  message: 'Memeriksa koneksi aktual database Supabase...',
  checkedAt: new Date().toISOString()
};

let activeFetchPromise: Promise<ClientSupabaseStatus> | null = null;

/**
 * Direct client-side Supabase instance is disabled per Security Constitution.
 * Returns null to prevent any browser-side direct DB connection.
 */
export function getClientSupabaseInstance(): null {
  return null;
}

/**
 * Executes a live health probe against backend Supabase status endpoint.
 * Accurately measures live DB reachability, distinguishes backend alive from DB connected,
 * and handles timeout/network failures safely without leaking secrets.
 */
export async function fetchLiveSupabaseStatus(): Promise<ClientSupabaseStatus> {
  if (activeFetchPromise) {
    return activeFetchPromise;
  }

  activeFetchPromise = (async () => {
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), 6000);

    try {
      const res = await fetch('/api/supabase/status', {
        signal: controller.signal,
        headers: { Accept: 'application/json' }
      });
      clearTimeout(timeoutTimer);

      if (!res.ok) {
        cachedStatus = {
          isConfigured: false,
          isBackendProxied: true,
          status: 'ERROR',
          backendAlive: true,
          databaseConnected: false,
          message: `Backend probe mengembalikan HTTP ${res.status}`,
          checkedAt: new Date().toISOString()
        };
        return cachedStatus;
      }

      const data = await res.json();
      const rawStatus = String(data.status || '').toUpperCase();
      let status: SupabaseConnectionState = 'ERROR';
      if (rawStatus === 'CONNECTED') status = 'CONNECTED';
      else if (rawStatus === 'DISCONNECTED') status = 'DISCONNECTED';
      else if (rawStatus === 'CHECKING') status = 'CHECKING';

      cachedStatus = {
        isConfigured: Boolean(data.databaseConnected || status === 'CONNECTED'),
        isBackendProxied: true,
        status,
        backendAlive: Boolean(data.backendAlive !== false),
        databaseConnected: Boolean(data.databaseConnected),
        latencyMs: typeof data.latencyMs === 'number' ? data.latencyMs : undefined,
        message: data.message || (status === 'CONNECTED' ? 'Koneksi Supabase aktif dan terverifikasi.' : 'Koneksi database tidak tersedia.'),
        checkedAt: data.checkedAt || new Date().toISOString()
      };
      return cachedStatus;
    } catch (err: any) {
      clearTimeout(timeoutTimer);
      const isTimeout = err?.name === 'AbortError';
      cachedStatus = {
        isConfigured: false,
        isBackendProxied: true,
        status: isTimeout ? 'DISCONNECTED' : 'ERROR',
        backendAlive: false,
        databaseConnected: false,
        message: isTimeout
          ? 'Probe koneksi Supabase melebihi batas waktu (timeout >6s).'
          : `Gagal memeriksa koneksi: ${err?.message || 'Network unreachable'}`,
        checkedAt: new Date().toISOString()
      };
      return cachedStatus;
    } finally {
      activeFetchPromise = null;
    }
  })();

  return activeFetchPromise;
}

/**
 * Synchronous getter returning the latest probed Supabase status.
 * Starts background probe if status is still INITIAL/CHECKING.
 */
export function checkClientSupabaseStatus(): ClientSupabaseStatus {
  if (cachedStatus.status === 'CHECKING' && !activeFetchPromise) {
    fetchLiveSupabaseStatus().catch(() => {});
  }
  return cachedStatus;
}
