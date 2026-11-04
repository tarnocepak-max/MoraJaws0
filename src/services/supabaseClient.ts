import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ==============================================================================
// MORAJAWS CLIENT-SIDE SUPABASE MODULE
// Provides a secure, non-privileged Supabase client for frontend usage.
// SECURITY CONSTITUTION:
// 1. SUPABASE_SERVICE_ROLE_KEY is STRICTLY FORBIDDEN on the client.
// 2. Only VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are accepted.
// 3. If credentials are not present, client operates in standby/disabled mode.
// 4. Production database remains Firebase Cloud Firestore.
// ==============================================================================

export interface ClientSupabaseStatus {
  isConfigured: boolean;
  url: string | null;
  hasAnonKey: boolean;
  status: 'connected' | 'unconfigured' | 'error';
  message: string;
}

let clientInstance: SupabaseClient | null = null;

export function getClientSupabaseInstance(): SupabaseClient | null {
  if (clientInstance) {
    return clientInstance;
  }

  // Vite environment variables for public client
  const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL || '').trim();
  const supabaseAnonKey = (import.meta.env?.VITE_SUPABASE_ANON_KEY || '').trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  try {
    let cleanUrl = supabaseUrl;
    try {
      cleanUrl = new URL(supabaseUrl).origin;
    } catch {}

    clientInstance = createClient(cleanUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });
    return clientInstance;
  } catch (err: any) {
    console.warn('[Supabase Client] Failed to initialize frontend client:', err?.message || err);
    return null;
  }
}

export function checkClientSupabaseStatus(): ClientSupabaseStatus {
  const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL || '').trim();
  const supabaseAnonKey = (import.meta.env?.VITE_SUPABASE_ANON_KEY || '').trim();

  const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);

  return {
    isConfigured,
    url: supabaseUrl || null,
    hasAnonKey: Boolean(supabaseAnonKey),
    status: isConfigured ? 'connected' : 'unconfigured',
    message: isConfigured
      ? 'Supabase client-side configured with Anon key.'
      : 'Supabase client-side is in standby (VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY not set).'
  };
}
