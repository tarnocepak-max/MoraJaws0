import 'dotenv/config';

// ==============================================================================
// MORAJAWS ENVIRONMENT CONFIGURATION & ISOLATION MODULE
// Phase 15A.7.2: Staging Callback Isolation & Recovery Preparation
// 
// Enforces explicit server-side environment selection ('production' | 'staging' | 'development').
// Strictly prevents:
// - Browser selection of target environment or Supabase project.
// - Cross-environment credential and callback leakage.
// - Fallback to production domain when staging callback is unconfigured.
// - Open redirects and untrusted origins.
// ==============================================================================

export type AppEnvironment = 'production' | 'staging' | 'development';

export const STAGING_SUPABASE_PROJECT_ID = 'lvytgqsvxntnvlohmrxi';
export const STAGING_SUPABASE_PROJECT_NAME = 'MoraJaws-Staging-Auth';
export const STAGING_SUPABASE_REGION = 'Singapore';
export const STAGING_DEFAULT_SUPABASE_URL = 'https://lvytgqsvxntnvlohmrxi.supabase.co';

export const PRODUCTION_DEFAULT_APP_BASE_URL = 'https://morajaws.ai.studio';
export const PRODUCTION_DEFAULT_CALLBACK_URL = 'https://morajaws.ai.studio/';

export class AuthRedirectConfigError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'AuthRedirectConfigError';
    this.code = code;
  }
}

let testEnvironmentOverride: AppEnvironment | null = null;

/**
 * Sets an in-memory environment override for testing.
 */
export function setAppEnvironmentForTesting(env?: AppEnvironment | null): void {
  testEnvironmentOverride = env || null;
}

/**
 * Resolves the active server-side application environment.
 * Evaluates in order:
 * 1. Testing override (if set).
 * 2. APP_ENV environment variable.
 * 3. NODE_ENV environment variable.
 * Defaults safely to 'production' if NODE_ENV === 'production', otherwise 'development'.
 */
export function getAppEnvironment(): AppEnvironment {
  if (testEnvironmentOverride) {
    return testEnvironmentOverride;
  }

  const rawEnv = (process.env.APP_ENV || '').trim().toLowerCase();

  if (rawEnv === 'staging' || rawEnv === 'stage') {
    return 'staging';
  }
  if (rawEnv === 'development' || rawEnv === 'dev') {
    return 'development';
  }

  // Default to production to ensure canonical deployment URL https://morajaws.ai.studio is enforced
  return 'production';
}

export interface EnvironmentConfig {
  env: AppEnvironment;
  supabaseProjectId: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  supabaseAnonKey: string;
  appBaseUrl: string;
  recoveryCallbackUrl: string;
  allowedRedirectOrigins: string[];
  isCallbackConfigured: boolean;
  callbackBlockedReason?: string;
}

/**
 * Extracts Supabase project ID from a standard supabase URL (e.g. https://<project-id>.supabase.co)
 */
export function extractSupabaseProjectId(urlStr?: string): string {
  if (!urlStr) return '';
  try {
    const parsed = new URL(urlStr.trim());
    const hostParts = parsed.hostname.split('.');
    if (hostParts.length >= 3 && parsed.hostname.endsWith('.supabase.co')) {
      return hostParts[0];
    }
    return parsed.hostname;
  } catch {
    return '';
  }
}

/**
 * Builds and returns the comprehensive environment configuration for the active environment.
 * Validates cross-environment boundaries and fails closed if configurations conflict.
 */
export function getEnvironmentConfig(envOverride?: AppEnvironment): EnvironmentConfig {
  const env = envOverride || getAppEnvironment();

  if (env === 'staging') {
    // 1. Resolve Staging Supabase URL & Project ID
    const supabaseUrl = (process.env.STAGING_SUPABASE_URL || STAGING_DEFAULT_SUPABASE_URL).trim();
    const projectId = process.env.STAGING_SUPABASE_PROJECT_ID?.trim() || STAGING_SUPABASE_PROJECT_ID;

    // Cross-environment safety: Staging must NOT use production project ID
    const extractedId = extractSupabaseProjectId(supabaseUrl);
    if (extractedId !== STAGING_SUPABASE_PROJECT_ID) {
      console.warn('[EnvironmentConfig] Warning: Staging Supabase URL does not match designated staging project ID.');
    }

    // 2. Resolve Staging Credentials (Server-side only)
    // Strictly isolate: Staging NEVER falls back to production SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY
    const serviceRoleKey = (
      process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY ||
      process.env.STAGING_SUPABASE_SECRET_KEY ||
      ''
    ).trim();

    const anonKey = (
      process.env.STAGING_SUPABASE_ANON_KEY ||
      ''
    ).trim();

    // 3. Staging Application Base URL & Recovery Callback URL
    // CRITICAL: The staging application domain is NOT yet established.
    // Never fallback to production domain (https://morajaws.ai.studio).
    // Never use Supabase API URL as application callback.
    const rawStagingBaseUrl = (process.env.STAGING_APP_BASE_URL || '').trim();
    const rawStagingCallbackUrl = (process.env.STAGING_AUTH_RECOVERY_CALLBACK_URL || '').trim();

    let appBaseUrl = '';
    let recoveryCallbackUrl = '';
    let isCallbackConfigured = false;
    let callbackBlockedReason = 'Domain staging aplikasi BELUM DITETAPKAN. Integrasi recovery callback berstatus BLOCKED.';

    if (rawStagingCallbackUrl || rawStagingBaseUrl) {
      const candidate = rawStagingCallbackUrl || rawStagingBaseUrl;
      try {
        const parsed = new URL(candidate);
        // Tolak protocol selain HTTPS pada staging
        if (parsed.protocol !== 'https:') {
          callbackBlockedReason = 'Domain staging wajib menggunakan protokol HTTPS.';
        } else if (parsed.hostname === 'morajaws.ai.studio') {
          // Strictly reject production domain in staging config
          callbackBlockedReason = 'Domain produksi "morajaws.ai.studio" dilarang digunakan sebagai callback staging.';
        } else if (parsed.hostname.endsWith('.supabase.co')) {
          // Strictly reject Supabase API endpoint as app callback
          callbackBlockedReason = 'Supabase API URL dilarang digunakan sebagai halaman callback aplikasi staging.';
        } else {
          appBaseUrl = rawStagingBaseUrl || parsed.origin;
          recoveryCallbackUrl = rawStagingCallbackUrl || `${parsed.origin}/`;
          isCallbackConfigured = true;
          callbackBlockedReason = '';
        }
      } catch {
        callbackBlockedReason = 'Format URL staging base URL atau callback tidak valid.';
      }
    }

    // Allowed redirect origins for staging
    const allowedRedirectOrigins: string[] = [];
    if (appBaseUrl) {
      try {
        allowedRedirectOrigins.push(new URL(appBaseUrl).origin);
      } catch {}
    }
    if (process.env.STAGING_ALLOWED_REDIRECT_ORIGINS) {
      const parts = process.env.STAGING_ALLOWED_REDIRECT_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
      for (const p of parts) {
        try {
          const parsed = new URL(p);
          if (parsed.protocol === 'https:' && parsed.hostname !== 'morajaws.ai.studio' && !parsed.hostname.endsWith('.supabase.co')) {
            if (!allowedRedirectOrigins.includes(parsed.origin)) {
              allowedRedirectOrigins.push(parsed.origin);
            }
          }
        } catch {}
      }
    }

    return {
      env: 'staging',
      supabaseProjectId: projectId,
      supabaseUrl,
      supabaseServiceRoleKey: serviceRoleKey,
      supabaseAnonKey: anonKey,
      appBaseUrl,
      recoveryCallbackUrl,
      allowedRedirectOrigins,
      isCallbackConfigured,
      callbackBlockedReason
    };
  }

  if (env === 'production') {
    // 1. Resolve Production Supabase URL & Project ID
    const supabaseUrl = (
      process.env.PRODUCTION_SUPABASE_URL ||
      (process.env.APP_ENV === 'staging' ? '' : process.env.SUPABASE_URL) ||
      ''
    ).trim();

    // Cross-environment safety: Production must NOT use staging project ID
    const extractedId = extractSupabaseProjectId(supabaseUrl);
    if (extractedId === STAGING_SUPABASE_PROJECT_ID) {
      console.error('[Security Alert] Cross-environment violation: Production environment configured with Staging Supabase Project ID.');
    }

    // 2. Resolve Production Credentials (Server-side only)
    const serviceRoleKey = (
      process.env.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY ||
      process.env.PRODUCTION_SUPABASE_SECRET_KEY ||
      (process.env.APP_ENV === 'staging' ? '' : (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)) ||
      ''
    ).trim();

    const anonKey = (
      process.env.PRODUCTION_SUPABASE_ANON_KEY ||
      (process.env.APP_ENV === 'staging' ? '' : process.env.SUPABASE_ANON_KEY) ||
      ''
    ).trim();

    // 3. Production Application Base URL & Recovery Callback URL
    const appBaseUrl = (process.env.PRODUCTION_APP_BASE_URL || process.env.APP_BASE_URL || PRODUCTION_DEFAULT_APP_BASE_URL).trim();
    const recoveryCallbackUrl = (process.env.PRODUCTION_AUTH_RECOVERY_CALLBACK_URL || process.env.AUTH_RECOVERY_CALLBACK_URL || PRODUCTION_DEFAULT_CALLBACK_URL).trim();

    const allowedRedirectOrigins = ['https://morajaws.ai.studio'];
    if (process.env.AUTH_ALLOWED_REDIRECT_ORIGINS || process.env.PRODUCTION_ALLOWED_REDIRECT_ORIGINS) {
      const origins = (process.env.AUTH_ALLOWED_REDIRECT_ORIGINS || process.env.PRODUCTION_ALLOWED_REDIRECT_ORIGINS || '')
        .split(',')
        .map(o => o.trim())
        .filter(Boolean);
      for (const o of origins) {
        try {
          const parsed = new URL(o);
          if (parsed.protocol === 'https:' && !allowedRedirectOrigins.includes(parsed.origin)) {
            allowedRedirectOrigins.push(parsed.origin);
          }
        } catch {}
      }
    }

    return {
      env: 'production',
      supabaseProjectId: extractedId,
      supabaseUrl,
      supabaseServiceRoleKey: serviceRoleKey,
      supabaseAnonKey: anonKey,
      appBaseUrl,
      recoveryCallbackUrl,
      allowedRedirectOrigins,
      isCallbackConfigured: true
    };
  }

  // Development environment
  const supabaseUrl = (process.env.DEV_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceRoleKey = (process.env.DEV_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
  const anonKey = (process.env.DEV_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

  const devBaseUrl = (process.env.DEV_APP_BASE_URL || 'http://localhost:3000').trim();
  const devCallbackUrl = (process.env.DEV_AUTH_RECOVERY_CALLBACK_URL || `${devBaseUrl}/`).trim();

  return {
    env: 'development',
    supabaseProjectId: extractSupabaseProjectId(supabaseUrl) || 'dev-local',
    supabaseUrl,
    supabaseServiceRoleKey: serviceRoleKey,
    supabaseAnonKey: anonKey,
    appBaseUrl: devBaseUrl,
    recoveryCallbackUrl: devCallbackUrl,
    allowedRedirectOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    isCallbackConfigured: true
  };
}

/**
 * Resolves and strictly validates the MoraJaws Auth Redirect URL for password recovery.
 * 
 * Rules:
 * 1. Redirect originates strictly from server-side configuration.
 * 2. Validated against exact origin and environment allowlist.
 * 3. Staging strictly accepts staging domains only.
 * 4. Production strictly accepts production domains only.
 * 5. Rejects any protocol other than HTTPS for staging and production.
 * 6. Rejects unlisted hostnames and open redirect attempts.
 * 7. Rejects browser attempts to manipulate destination across environments.
 * 8. Never falls back to production domain if staging callback is unconfigured.
 * 9. Fails closed with AuthRedirectConfigError if staging callback is not configured.
 */
export function resolveAuthRedirectUrl(customRedirect?: string, envOverride?: AppEnvironment): string {
  const config = getEnvironmentConfig(envOverride);

  // -------------------------------------------------------------------------
  // STAGING ENVIRONMENT
  // -------------------------------------------------------------------------
  if (config.env === 'staging') {
    if (!config.isCallbackConfigured || !config.recoveryCallbackUrl) {
      throw new AuthRedirectConfigError(
        'STAGING_CALLBACK_NOT_CONFIGURED',
        config.callbackBlockedReason || 'Domain callback staging belum dikonfigurasi pada server (BLOCKED). Pengalihan ke domain produksi dilarang demi keamanan isolasi.'
      );
    }

    if (customRedirect && typeof customRedirect === 'string' && customRedirect.trim()) {
      try {
        const parsed = new URL(customRedirect.trim());

        if (parsed.protocol !== 'https:') {
          throw new AuthRedirectConfigError('INVALID_PROTOCOL', 'Environment staging hanya mengizinkan protokol HTTPS.');
        }

        // Cross-environment check: Staging must reject production domain
        if (parsed.hostname === 'morajaws.ai.studio') {
          throw new AuthRedirectConfigError(
            'CROSS_ENVIRONMENT_REDIRECT_REJECTED',
            'Pengalihan ke domain produksi dari environment staging ditolak demi keamanan isolasi.'
          );
        }

        // Check against staging allowlist
        if (!config.allowedRedirectOrigins.includes(parsed.origin)) {
          throw new AuthRedirectConfigError(
            'UNAUTHORIZED_REDIRECT_ORIGIN',
            `Origin "${parsed.origin}" tidak terdaftar dalam allowlist staging.`
          );
        }

        return parsed.toString();
      } catch (err: any) {
        if (err instanceof AuthRedirectConfigError) {
          throw err;
        }
        throw new AuthRedirectConfigError('INVALID_REDIRECT_URL', 'URL custom redirect staging tidak valid.');
      }
    }

    return config.recoveryCallbackUrl;
  }

  // -------------------------------------------------------------------------
  // PRODUCTION ENVIRONMENT
  // -------------------------------------------------------------------------
  if (config.env === 'production') {
    if (customRedirect && typeof customRedirect === 'string' && customRedirect.trim()) {
      try {
        const parsed = new URL(customRedirect.trim());

        // Protocol check: Only HTTPS in production
        if (parsed.protocol !== 'https:') {
          throw new AuthRedirectConfigError('INVALID_PROTOCOL', 'Environment produksi hanya mengizinkan protokol HTTPS.');
        }

        // Cross-environment check: Production must reject staging domains
        if (parsed.hostname.includes('staging') || parsed.hostname.includes('lvytgqsvxntnvlohmrxi')) {
          throw new AuthRedirectConfigError(
            'CROSS_ENVIRONMENT_REDIRECT_REJECTED',
            'Pengalihan ke domain staging dari environment produksi ditolak demi keamanan isolasi.'
          );
        }

        // Only allow registered production origins
        if (config.allowedRedirectOrigins.includes(parsed.origin)) {
          return parsed.toString();
        }

        // Open redirect attempt: sanitize back to canonical production callback
        return config.recoveryCallbackUrl;
      } catch (err: any) {
        if (err instanceof AuthRedirectConfigError) {
          throw err;
        }
        // Fallback safely to canonical production callback
        return config.recoveryCallbackUrl;
      }
    }

    return config.recoveryCallbackUrl;
  }

  // -------------------------------------------------------------------------
  // DEVELOPMENT ENVIRONMENT
  // -------------------------------------------------------------------------
  if (customRedirect && typeof customRedirect === 'string' && customRedirect.trim()) {
    try {
      const parsed = new URL(customRedirect.trim());
      if (config.allowedRedirectOrigins.includes(parsed.origin)) {
        return parsed.toString();
      }
    } catch {}
  }

  return config.recoveryCallbackUrl;
}

/**
 * Returns canonical session cookie name isolated per environment.
 * Prevents cookie collisions between production, staging, and development.
 */
export function getSessionCookieName(envOverride?: AppEnvironment): string {
  const env = envOverride || getAppEnvironment();
  if (env === 'staging') {
    return 'morajaws_session_staging';
  }
  if (env === 'production') {
    return 'morajaws_session_prod';
  }
  return 'morajaws_session_dev';
}

/**
 * Validates active environment boundary isolation on server startup.
 * Fails closed if cross-environment violations are detected.
 */
export function validateEnvironmentStartup(envOverride?: AppEnvironment): { valid: boolean; errors: string[] } {
  const config = getEnvironmentConfig(envOverride);
  const errors: string[] = [];

  if (config.env === 'staging') {
    if (config.supabaseProjectId !== STAGING_SUPABASE_PROJECT_ID) {
      errors.push(`Staging Project ID wajib "${STAGING_SUPABASE_PROJECT_ID}", ditemukan: "${config.supabaseProjectId}".`);
    }
    const extracted = extractSupabaseProjectId(config.supabaseUrl);
    if (!extracted || extracted !== STAGING_SUPABASE_PROJECT_ID) {
      errors.push(`Staging Supabase URL (${config.supabaseUrl}) tidak cocok dengan project ID staging "${STAGING_SUPABASE_PROJECT_ID}".`);
    }
    if (config.supabaseProjectId !== extracted) {
      errors.push(`Staging Project ID ("${config.supabaseProjectId}") tidak sama dengan hasil ekstraksi URL ("${extracted}").`);
    }
    if (config.supabaseUrl.includes('morajaws.ai.studio') || (process.env.PRODUCTION_SUPABASE_URL && config.supabaseUrl === process.env.PRODUCTION_SUPABASE_URL.trim())) {
      errors.push('Cross-environment violation: URL project produksi dilarang digunakan oleh staging.');
    }
  } else if (config.env === 'production') {
    if (config.supabaseProjectId === STAGING_SUPABASE_PROJECT_ID) {
      errors.push(`Cross-environment violation: Project ID staging "${STAGING_SUPABASE_PROJECT_ID}" dilarang digunakan di production.`);
    }
    const extracted = extractSupabaseProjectId(config.supabaseUrl);
    if (extracted === STAGING_SUPABASE_PROJECT_ID) {
      errors.push(`Cross-environment violation: Production Supabase URL (${config.supabaseUrl}) mengarah ke project staging.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

