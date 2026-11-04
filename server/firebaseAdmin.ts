import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';

// ==============================================================================
// MORAJAWS FIREBASE ADMIN SDK MODULE
// Handles server-side cryptographic verification of Firebase ID Tokens.
// User authentication remains fully rooted in Firebase Authentication.
// ==============================================================================

export type FirebaseAdminStatus = 'connected' | 'initialized' | 'not_configured' | 'error';

export interface FirebaseAdminHealthResult {
  status: FirebaseAdminStatus;
  projectId?: string;
  clientEmailConfigured: boolean;
  privateKeyConfigured: boolean;
  message: string;
}

const MORAJAWS_ADMIN_APP_NAME = 'morajaws-firebase-admin';

let firebaseAdminApp: App | null = null;
let lastFirebaseAdminHealth: FirebaseAdminHealthResult = {
  status: 'not_configured',
  clientEmailConfigured: false,
  privateKeyConfigured: false,
  message: 'Kredensial Firebase Admin SDK belum dikonfigurasi.'
};

/**
 * Resolves the expected Firebase Project ID.
 * Priority: FIREBASE_PROJECT_ID env > GOOGLE_CLOUD_PROJECT_ID env > firebase-applet-config.json
 */
export function getExpectedProjectId(): string | undefined {
  const envProjectId = process.env.FIREBASE_PROJECT_ID?.trim();
  if (envProjectId) return envProjectId;

  const gcpProjectId = process.env.GOOGLE_CLOUD_PROJECT_ID?.trim();
  if (gcpProjectId) return gcpProjectId;

  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed?.projectId) return String(parsed.projectId).trim();
    }
  } catch {
    // Ignore error silently to prevent leaking filesystem details
  }

  return undefined;
}

/**
 * Normalizes private key from environment variables (handles multiline and escaped newlines).
 * Strips wrapping quotes and replaces escaped newlines safely.
 */
export function normalizePrivateKey(key?: string): string | null {
  if (!key) return null;
  let cleanKey = key.trim();
  if (
    (cleanKey.startsWith('"') && cleanKey.endsWith('"')) ||
    (cleanKey.startsWith("'") && cleanKey.endsWith("'"))
  ) {
    cleanKey = cleanKey.slice(1, -1);
  }
  return cleanKey.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').trim();
}

/**
 * Validates that the private key conforms to PEM format (BEGIN & END markers).
 * Never prints or leaks key contents.
 */
export function validatePrivateKey(key: string | null): boolean {
  if (!key) return false;
  const hasBegin = key.includes('-----BEGIN PRIVATE KEY-----');
  const hasEnd = key.includes('-----END PRIVATE KEY-----');
  return hasBegin && hasEnd;
}

/**
 * Initializes and returns the Firebase Admin singleton.
 * Strictly verifies project ID and prevents indiscriminate getApps()[0] usage.
 */
export function getFirebaseAdminApp(): App | null {
  const targetProjectId = getExpectedProjectId();

  // If already initialized singleton exists, ensure its projectId matches targetProjectId
  if (firebaseAdminApp) {
    const activeProjectId = firebaseAdminApp.options?.projectId;
    if (targetProjectId && activeProjectId && activeProjectId !== targetProjectId) {
      console.error('[Firebase Admin] Instance aktif memiliki Project ID berbeda dari target FIREBASE_PROJECT_ID.');
      lastFirebaseAdminHealth = {
        status: 'error',
        projectId: targetProjectId,
        clientEmailConfigured: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
        privateKeyConfigured: Boolean(process.env.FIREBASE_PRIVATE_KEY),
        message: 'Konfigurasi error: Instance Firebase Admin aktif memiliki Project ID yang tidak sesuai.'
      };
      return null;
    }
    return firebaseAdminApp;
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
  const privateKey = normalizePrivateKey(rawPrivateKey);

  const clientEmailConfigured = Boolean(clientEmail && clientEmail.includes('@'));
  const privateKeyConfigured = validatePrivateKey(privateKey);

  // If targetProjectId is missing, we cannot initialize Firebase Admin
  if (!targetProjectId) {
    lastFirebaseAdminHealth = {
      status: 'not_configured',
      projectId: undefined,
      clientEmailConfigured: false,
      privateKeyConfigured: false,
      message: 'FIREBASE_PROJECT_ID belum dikonfigurasi pada environment variables atau firebase-applet-config.json.'
    };
    return null;
  }

  const hasServiceAccount = clientEmailConfigured && privateKeyConfigured;

  try {
    const existingApps = getApps();

    // 1. Check if any existing app has a different project ID.
    // If an instance with different project ID exists, NEVER use it.
    const conflictingApp = existingApps.find(app => {
      const pId = app.options?.projectId;
      return pId && pId !== targetProjectId;
    });

    // 2. Search for an app that specifically matches our app name or target projectId
    const matchingApp = existingApps.find(app => {
      if (app.name === MORAJAWS_ADMIN_APP_NAME) {
        return !app.options?.projectId || app.options.projectId === targetProjectId;
      }
      return app.options?.projectId === targetProjectId;
    });

    if (matchingApp) {
      const matchedProjectId = matchingApp.options?.projectId;
      if (matchedProjectId && matchedProjectId !== targetProjectId) {
        console.error('[Firebase Admin] Instance Firebase Admin yang ditemukan memiliki Project ID tidak cocok.');
        lastFirebaseAdminHealth = {
          status: 'error',
          projectId: targetProjectId,
          clientEmailConfigured,
          privateKeyConfigured,
          message: 'Konfigurasi error: Instance Firebase Admin yang ditemukan memiliki Project ID tidak cocok.'
        };
        return null;
      }
      firebaseAdminApp = matchingApp;
    } else {
      // If conflicting app exists and no matching app exists, do NOT reuse conflicting instance
      if (conflictingApp) {
        console.error('[Firebase Admin] Terdeteksi instance Firebase dengan Project ID berbeda. Menghentikan inisialisasi.');
        lastFirebaseAdminHealth = {
          status: 'error',
          projectId: targetProjectId,
          clientEmailConfigured,
          privateKeyConfigured,
          message: 'Konfigurasi error: Terdeteksi instance Firebase Admin dengan Project ID berbeda.'
        };
        return null;
      }

      // Initialize with full service account if available, or with projectId for public key verification
      const appOptions = hasServiceAccount
        ? {
            credential: cert({
              projectId: targetProjectId,
              clientEmail: clientEmail!,
              privateKey: privateKey!
            }),
            projectId: targetProjectId
          }
        : {
            projectId: targetProjectId
          };

      const hasDefault = existingApps.some(app => app.name === '[DEFAULT]');
      if (!hasDefault) {
        firebaseAdminApp = initializeApp(appOptions);
      } else {
        firebaseAdminApp = initializeApp(appOptions, MORAJAWS_ADMIN_APP_NAME);
      }
    }

    // Set status to 'initialized' (transitions to 'connected' once token verification succeeds)
    lastFirebaseAdminHealth = {
      status: 'initialized',
      projectId: targetProjectId,
      clientEmailConfigured,
      privateKeyConfigured,
      message: hasServiceAccount
        ? `Firebase Admin SDK terinisialisasi dengan Service Account untuk project: ${targetProjectId}. Siap memverifikasi token.`
        : `Firebase Admin SDK terinisialisasi dalam mode Public Key Verification untuk project: ${targetProjectId}. Service account belum dikonfigurasi (BLOCKED).`
    };

    return firebaseAdminApp;
  } catch (err: any) {
    console.error('[Firebase Admin] Inisialisasi Firebase Admin gagal:', err?.message || err);
    lastFirebaseAdminHealth = {
      status: 'error',
      projectId: targetProjectId,
      clientEmailConfigured,
      privateKeyConfigured,
      message: 'Inisialisasi Firebase Admin gagal: ' + (err?.message || 'Periksa konfigurasi.')
    };
    return null;
  }
}

/**
 * Verifies a client-provided Firebase ID Token securely on the server.
 * Returns DecodedIdToken or null if verification fails.
 *
 * Enforces:
 * - Cryptographic signature check via Firebase Admin
 * - Audience and issuer matching target FIREBASE_PROJECT_ID
 * - Check for token revocation (checkRevoked)
 * - Immediate rejection of empty, malformed, expired, or revoked tokens
 * - Never accepts body UID/email as token substitutes
 */
export async function verifyFirebaseIdToken(
  idToken: unknown,
  checkRevoked: boolean = true
): Promise<DecodedIdToken | null> {
  if (!idToken || typeof idToken !== 'string') {
    return null;
  }

  const token = idToken.trim();
  if (!token) {
    return null;
  }

  // Reject malformed JWT strings early
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    console.warn('[Firebase Admin] Token ditolak: Format token JWT rusak atau tidak valid.');
    return null;
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    return null;
  }

  const targetProjectId = getExpectedProjectId();

  try {
    const auth = getAuth(app);
    const hasServiceAccount = Boolean(lastFirebaseAdminHealth.clientEmailConfigured && lastFirebaseAdminHealth.privateKeyConfigured);
    const decodedToken = await auth.verifyIdToken(token, hasServiceAccount && checkRevoked);

    // Verify audience matches expected project ID
    if (targetProjectId && decodedToken.aud !== targetProjectId) {
      console.warn('[Firebase Admin] Token ditolak: Audience token tidak cocok dengan FIREBASE_PROJECT_ID.');
      return null;
    }

    // Verify issuer matches expected project ID
    if (targetProjectId && decodedToken.iss !== `https://securetoken.google.com/${targetProjectId}`) {
      console.warn('[Firebase Admin] Token ditolak: Issuer token tidak cocok dengan FIREBASE_PROJECT_ID.');
      return null;
    }

    // Ensure token contains a valid non-empty string UID
    if (!decodedToken.uid || typeof decodedToken.uid !== 'string' || !decodedToken.uid.trim()) {
      console.warn('[Firebase Admin] Token ditolak: Token tidak memuat UID valid.');
      return null;
    }

    // Transition health status to 'connected' once authentication verification succeeds
    if (lastFirebaseAdminHealth.status === 'initialized') {
      lastFirebaseAdminHealth.status = 'connected';
      lastFirebaseAdminHealth.message = `Firebase Admin SDK aktif dan terhubung (terverifikasi) untuk project: ${targetProjectId || 'default'}`;
    }

    return decodedToken;
  } catch (err: any) {
    const code = err?.code;
    if (code === 'auth/id-token-expired') {
      console.warn('[Firebase Admin] Token ditolak: Token telah kedaluwarsa.');
    } else if (code === 'auth/id-token-revoked') {
      console.warn('[Firebase Admin] Token ditolak: Token telah dicabut (revoked).');
    } else if (code === 'auth/invalid-id-token' || code === 'auth/argument-error') {
      console.warn('[Firebase Admin] Token ditolak: Token tidak valid.');
    } else {
      console.warn('[Firebase Admin] Verifikasi token gagal secara kriptografis.');
    }
    return null;
  }
}

/**
 * Returns current health status of Firebase Admin SDK backend integration.
 */
export function checkFirebaseAdminHealth(): FirebaseAdminHealthResult {
  if (!firebaseAdminApp && lastFirebaseAdminHealth.status === 'not_configured') {
    getFirebaseAdminApp();
  }
  return lastFirebaseAdminHealth;
}
