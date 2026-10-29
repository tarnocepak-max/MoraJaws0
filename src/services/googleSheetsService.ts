import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { Ticket } from '../types/index.ts';
import { GoogleSpreadsheetMeta } from '../types/sheets.ts';

// Initialize Firebase App
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

// Configure Google Auth Provider for Staff Identity (Profile & Email only - NO sensitive scopes)
export const staffLoginProvider = new GoogleAuthProvider();
staffLoginProvider.addScope('email');
staffLoginProvider.addScope('profile');
staffLoginProvider.addScope('openid');
staffLoginProvider.setCustomParameters({
  prompt: 'select_account'
});

// Configure Google Auth Provider with Sheets & Drive.file scopes (Incremental auth for Google Sheets Sync)
export const sheetsProvider = new GoogleAuthProvider();
sheetsProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
sheetsProvider.addScope('https://www.googleapis.com/auth/drive.file');
sheetsProvider.setCustomParameters({
  prompt: 'select_account'
});

const provider = sheetsProvider;

// In-Memory Token Cache (MANDATORY: Never store in localStorage or sessionStorage)
let cachedAccessToken: string | null = null;
let cachedFirebaseUser: any = null;
let isSigningIn = false;

export const STANDARD_SHEET_HEADERS = [
  'WO Number',
  'Ticket Number',
  'Date',
  'Appointment Date',
  'ID Customer',
  'Customer Name',
  'Customer Phone',
  'Customer Phone 2',
  'Area',
  'Cluster Name',
  'Street Name',
  'Street Alternatif',
  'Contactor Name',
  'Leader Name',
  'Corlap Contact',
  'Installer Name',
  'Installer Contact',
  'Slot Time',
  'FDT Code',
  'FAT Code',
  'Port FAT',
  'Ticket Category',
  'Status WO Agent',
  'Status WO Installer',
  'Remarks WO Installer',
  'Remarks Agent',
  'Work Result',
  'Root Cause Category',
  'Root Cause Sub Category',
  'Optical Power Rx',
  'ONT Serial Number',
  'Router Serial Number',
  'Date Assign Agent',
  'Date Assign Technician',
  'Date Upload',
  'File Name',
  'Agent ID',
  'Updated At',
  'Updated By'
];

/**
 * Listen for auth state changes and manage in-memory credentials
 */
export const initGoogleAuth = (
  onAuthSuccess?: (user: FirebaseUser, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: FirebaseUser | null) => {
    if (user) {
      cachedFirebaseUser = user;
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // Token expired or page refreshed
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedFirebaseUser = null;
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

let globalGISTokenClient: any = null;

/**
 * Initialize Google Identity Services (GIS) Token Client once on page load
 */
export const initGISTokenClient = (
  onSuccess: (data: { user: any; accessToken: string }) => void,
  onError: (err: Error) => void
): boolean => {
  const google = (window as any).google;
  if (!google?.accounts?.oauth2) {
    return false;
  }

  const clientId = (firebaseConfig as any).oAuthClientId;
  if (!clientId) {
    return false;
  }

  try {
    globalGISTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file email profile openid',
      error_callback: (err: any) => {
        console.warn('GIS error_callback received:', err);
        const msg = err?.message || err?.type || 'Jendela login diblokir oleh browser.';
        onError(new Error(msg === 'popup_failed_to_open' 
          ? 'Browser memblokir pop-up. Harap izinkan pop-up untuk situs ini atau buka melalui tautan otorisasi di bawah.' 
          : `Gagal membuka jendela autentikasi: ${msg}`));
      },
      callback: async (resp: any) => {
        if (resp.error) {
          onError(new Error(`Google OAuth error: ${resp.error_description || resp.error}`));
          return;
        }
        if (!resp.access_token) {
          onError(new Error('Tidak ada access token yang diterima dari Google.'));
          return;
        }

        const token = resp.access_token;
        cachedAccessToken = token;

        // Fetch user profile from Google userinfo
        try {
          const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (userRes.ok) {
            const profile = await userRes.json();
            const userObj = {
              displayName: profile.name || profile.email || 'Super Admin (Google)',
              email: profile.email || '',
              photoURL: profile.picture || '',
              uid: profile.sub || 'google-user'
            };
            cachedFirebaseUser = userObj as any;
            onSuccess({ user: cachedFirebaseUser!, accessToken: token });
            return;
          }
        } catch (e) {
          console.warn('Could not fetch userinfo, using token user:', e);
        }

        const fallbackUser = {
          displayName: 'Super Admin (Google Sheets)',
          email: '',
          photoURL: '',
          uid: 'google-oauth-user'
        };
        cachedFirebaseUser = fallbackUser as any;
        onSuccess({ user: cachedFirebaseUser!, accessToken: token });
      }
    });
    return true;
  } catch (err: any) {
    console.error('Failed to initTokenClient:', err);
    return false;
  }
};

/**
 * Synchronously triggers the GIS popup (MUST be called directly from user click)
 */
export const requestGISTokenSynchronously = (prompt: 'consent' | '' = 'consent') => {
  if (!globalGISTokenClient) {
    throw new Error('Google Identity Services belum siap. Harap tunggu beberapa detik atau muat ulang halaman.');
  }
  globalGISTokenClient.requestAccessToken({ prompt });
};

/**
 * Returns a direct Google OAuth authorization URL that can be opened safely via an <a target="_blank"> link
 */
export const getDirectGoogleOAuthUrl = (): string => {
  const clientId = (firebaseConfig as any).oAuthClientId || '';
  const redirectUri = `https://${(firebaseConfig as any).authDomain}/__/auth/handler`;
  const scopes = encodeURIComponent('https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file email profile openid');
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${scopes}&prompt=consent`;
};

/**
 * Sign in using Google Identity Services (GIS) token client with Promise wrapper
 */
export const signInWithGoogleIdentityServices = (): Promise<{ user: any; accessToken: string }> => {
  return new Promise((resolve, reject) => {
    const success = initGISTokenClient(resolve, reject);
    if (!success) {
      reject(new Error('Google Identity Services belum dimuat. Silakan muat ulang halaman.'));
      return;
    }
    try {
      requestGISTokenSynchronously();
    } catch (e: any) {
      reject(e);
    }
  });
};

/**
 * Sign in using Google Identity Services (GIS) with basic non-sensitive scopes (email, profile, openid)
 * Completely safe from Google's unverified app block because it requests NO sensitive scopes.
 */
export const signInWithGISBasic = (): Promise<{ user: any; accessToken: string }> => {
  return new Promise((resolve, reject) => {
    const google = (window as any).google;
    if (!google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services belum siap. Harap tunggu beberapa detik atau muat ulang halaman.'));
      return;
    }
    const clientId = (firebaseConfig as any).oAuthClientId;
    if (!clientId) {
      reject(new Error('OAuth Client ID tidak ditemukan dalam konfigurasi.'));
      return;
    }

    try {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'email profile openid',
        error_callback: (err: any) => {
          const msg = err?.message || err?.type || 'Jendela login diblokir oleh browser.';
          reject(new Error(msg === 'popup_failed_to_open'
            ? 'Browser memblokir pop-up. Harap izinkan pop-up untuk situs ini.'
            : `Gagal membuka jendela autentikasi: ${msg}`));
        },
        callback: async (resp: any) => {
          if (resp.error) {
            reject(new Error(`Google OAuth error: ${resp.error_description || resp.error}`));
            return;
          }
          if (!resp.access_token) {
            reject(new Error('Tidak ada access token yang diterima dari Google.'));
            return;
          }
          const token = resp.access_token;
          try {
            const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (userRes.ok) {
              const profile = await userRes.json();
              resolve({
                user: {
                  displayName: profile.name || profile.email,
                  email: profile.email,
                  photoURL: profile.picture || '',
                  uid: profile.sub || 'google-user'
                },
                accessToken: token
              });
              return;
            }
          } catch (e) {
            console.warn('Could not fetch userinfo, resolving basic:', e);
          }
          resolve({
            user: { displayName: 'Pengguna Google', email: '', photoURL: '', uid: 'google-user' },
            accessToken: token
          });
        }
      });
      client.requestAccessToken({ prompt: 'select_account' });
    } catch (err: any) {
      reject(err);
    }
  });
};

/**
 * Dedicated sign-in method for staff (Super Admin, Dispatch, Management Data, Leader, Installer).
 * Uses ONLY basic identity scopes (openid, email, profile), NEVER triggering "Aplikasi belum diverifikasi Google" (Error 403).
 */
export const signInStaffWithGoogle = async (): Promise<{ user: any; accessToken: string }> => {
  isSigningIn = true;
  try {
    try {
      const result = await signInWithPopup(auth, staffLoginProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      cachedFirebaseUser = result.user;
      return {
        user: result.user,
        accessToken: credential?.accessToken || ''
      };
    } catch (fbError: any) {
      console.warn('Firebase staff sign-in popup error, trying GIS basic:', fbError?.code || fbError?.message);

      if (fbError?.code === 'auth/popup-closed-by-user') {
        throw new Error('Jendela login Google ditutup sebelum selesai. Silakan klik tombol untuk mencoba lagi.');
      }
      if (fbError?.code === 'auth/popup-blocked') {
        throw new Error('Jendela popup diblokir oleh peramban. Harap izinkan pop-up untuk situs ini lalu coba lagi.');
      }

      // If domain is unauthorized in Firebase Auth or any other domain restriction, fallback to GIS basic
      const google = (window as any).google;
      if (google?.accounts?.oauth2) {
        return await signInWithGISBasic();
      }

      throw fbError;
    }
  } finally {
    isSigningIn = false;
  }
};

/**
 * Sign in using Google OAuth for Google Sheets Sync (requests sensitive spreadsheets & drive.file scopes).
 */
export const googleSignIn = async (): Promise<{ user: any; accessToken: string }> => {
  isSigningIn = true;
  try {
    // 1. Try Firebase Auth popup first (standard Workspace Integration pattern)
    try {
      const result = await signInWithPopup(auth, sheetsProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        cachedAccessToken = credential.accessToken;
        cachedFirebaseUser = result.user;
        return { user: result.user, accessToken: credential.accessToken };
      }
    } catch (fbError: any) {
      console.warn('Firebase popup sign-in attempted, checking fallback:', fbError?.code || fbError?.message);

      const isDomainOrPopupIssue =
        fbError?.code === 'auth/unauthorized-domain' ||
        fbError?.code === 'auth/popup-blocked' ||
        fbError?.code === 'auth/internal-error' ||
        fbError?.code === 'auth/cancelled-popup-request' ||
        fbError?.code === 'auth/configuration-not-found';

      const google = (window as any).google;
      if (isDomainOrPopupIssue && google?.accounts?.oauth2) {
        return await signInWithGoogleIdentityServices();
      }

      if (fbError?.code === 'auth/popup-closed-by-user') {
        throw new Error('Jendela login Google ditutup sebelum otorisasi selesai. Silakan klik tombol untuk mencoba lagi.');
      }
      if (fbError?.code === 'auth/popup-blocked') {
        throw new Error('Jendela popup diblokir oleh peramban. Harap izinkan pop-up untuk situs ini lalu coba lagi.');
      }
      if (fbError?.message?.includes('verifikasi') || fbError?.message?.includes('verification') || fbError?.code === 'auth/access-denied') {
        throw new Error(
          'Google memblokir izin Google Sheets karena aplikasi belum menyelesaikan proses verifikasi publik. Silakan gunakan opsi Token Manual di bawah atau tambahkan email Anda ke Test Users di Google Cloud Console.'
        );
      }
      if (fbError?.code === 'auth/unauthorized-domain') {
        if (google?.accounts?.oauth2) {
          return await signInWithGoogleIdentityServices();
        }
        throw new Error('Domain preview belum di-whitelist di Firebase. Silakan gunakan opsi Google Identity Services atau masukkan token akses manual.');
      }
      throw fbError;
    }

    // Fallback to GIS if Firebase credential didn't contain access token
    const google = (window as any).google;
    if (google?.accounts?.oauth2) {
      return await signInWithGoogleIdentityServices();
    }

    throw new Error('Gagal memperoleh access token dari Google OAuth.');
  } finally {
    isSigningIn = false;
  }
};

/**
 * Set token manually for fallback environments
 */
export const setManualAccessToken = async (token: string): Promise<{ user: any; accessToken: string }> => {
  const cleanToken = token.trim();
  if (!cleanToken) throw new Error('Token tidak boleh kosong.');

  let userObj: any = {
    displayName: 'Pengguna Google (Manual Token)',
    email: 'Token terverifikasi',
    photoURL: '',
    uid: 'manual-token-user'
  };

  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${cleanToken}` }
    });
    if (res.ok) {
      const profile = await res.json();
      userObj = {
        displayName: profile.name || profile.email,
        email: profile.email,
        photoURL: profile.picture,
        uid: profile.sub || 'google-user'
      };
    }
  } catch (e) {
    console.warn('Could not fetch userinfo with manual token:', e);
  }

  cachedAccessToken = cleanToken;
  cachedFirebaseUser = userObj;
  return { user: userObj, accessToken: cleanToken };
};

/**
 * Sign out from Google Auth and clear in-memory token
 */
export const googleSignOut = async (): Promise<void> => {
  try {
    await firebaseSignOut(auth);
  } catch (e) {}
  cachedAccessToken = null;
  cachedFirebaseUser = null;
};

/**
 * Retrieve active access token or null
 */
export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

/**
 * Get current Google authenticated user
 */
export const getCurrentGoogleUser = (): any => {
  return cachedFirebaseUser;
};

/**
 * Extracts a Google Spreadsheet ID from either a full Google Sheets URL or a raw ID string
 */
export function extractSpreadsheetId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  // Matches /spreadsheets/d/([a-zA-Z0-9-_]+)
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }
  // If it's already an ID
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
    return trimmed;
  }
  return trimmed;
}

/**
 * Fetch metadata of a Google Spreadsheet (Title, Sheet tab names)
 */
export async function fetchSpreadsheetMeta(spreadsheetId: string): Promise<GoogleSpreadsheetMeta> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('Anda belum terautentikasi dengan akun Google. Silakan klik Masuk dengan Google.');
  }

  const cleanId = extractSpreadsheetId(spreadsheetId);
  if (!cleanId) {
    throw new Error('Spreadsheet ID atau URL tidak valid.');
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}?fields=properties.title,sheets.properties(sheetId,title)`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const message = errorData.error?.message || `Gagal mengakses spreadsheet (${res.status} ${res.statusText})`;
    if (res.status === 401) {
      cachedAccessToken = null;
      throw new Error('Sesi Google telah kedaluwarsa. Silakan masuk kembali dengan Google.');
    }
    if (res.status === 404) {
      throw new Error('Spreadsheet tidak ditemukan. Periksa kembali ID atau URL spreadsheet.');
    }
    if (res.status === 403) {
      throw new Error('Izin ditolak. Pastikan akun Google Anda memiliki akses ke spreadsheet tersebut.');
    }
    throw new Error(message);
  }

  const data = await res.json();
  const title = data.properties?.title || 'Spreadsheet Tanpa Judul';
  const sheets: string[] = (data.sheets || []).map((s: any) => s.properties?.title).filter(Boolean);

  return {
    id: cleanId,
    title,
    url: `https://docs.google.com/spreadsheets/d/${cleanId}/edit`,
    sheets: sheets.length > 0 ? sheets : ['Sheet1']
  };
}

/**
 * Automatically creates a new standardized MoraJaws Google Spreadsheet in the user's Google Drive
 */
export async function createDefaultMoraJawsSpreadsheet(customTitle?: string): Promise<GoogleSpreadsheetMeta> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('Anda belum terautentikasi dengan Google. Silakan login terlebih dahulu.');
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const title = customTitle?.trim() || `MoraJaws_WO_Master_Sync_${dateStr}`;

  const requestBody = {
    properties: {
      title
    },
    sheets: [
      {
        properties: {
          title: 'Work_Orders',
          gridProperties: {
            frozenRowCount: 1
          }
        },
        data: [
          {
            startRow: 0,
            startColumn: 0,
            rowData: [
              {
                values: STANDARD_SHEET_HEADERS.map(header => ({
                  userEnteredValue: { stringValue: header }
                }))
              }
            ]
          }
        ]
      }
    ]
  };

  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Gagal membuat Google Spreadsheet baru.');
  }

  const data = await res.json();
  const createdId = data.spreadsheetId;

  return {
    id: createdId,
    title,
    url: `https://docs.google.com/spreadsheets/d/${createdId}/edit`,
    sheets: ['Work_Orders']
  };
}

/**
 * Convert a MoraJaws Ticket into a standardized array of cell values
 */
export function formatTicketToSheetRow(t: Ticket): (string | number)[] {
  return [
    t.woNumber || '',
    t.ticketNumber || '',
    t.date || '',
    t.appointmentDate || '',
    t.idCustomer || t.customerId || '',
    t.customerName || t.endUserName || '',
    t.customerPhone || '',
    t.customerContact2 || '',
    t.area || '',
    t.clusterName || '',
    t.streetName || '',
    t.streetAlternatif || '',
    t.contactorName || t.contractorName || (t as any).contractor || '',
    t.leaderName || t.corlapName || '',
    t.corlapContact || '',
    t.installerName || '',
    t.installerContact || '',
    t.slotTime || '',
    t.fdtCode || '',
    t.fatCode || '',
    t.fatPort || '',
    t.ticketCategory || '',
    t.statusWOAgent || '',
    t.statusWOInstaller || '',
    t.remarksWOInstaller || '',
    t.remarksAgent || '',
    t.technicalReport?.workResult || '',
    t.technicalReport?.rootCauseCategory || '',
    t.technicalReport?.rootCauseSubCategory || '',
    t.technicalReport?.opticalPowerRx || t.technicalReport?.opticalPowerDbm || '',
    t.ontSerialNumber || '',
    t.routerSerialNumber || '',
    t.dateAssignAgent || '',
    t.dateAssignTechnician || '',
    t.dateUpload || '',
    t.fileName || '',
    t.agentId || '',
    t.updatedAt || new Date().toISOString(),
    t.updatedBy || 'MoraJaws Sync'
  ];
}

/**
 * Pull all data rows from a Google Sheet tab and convert them to record objects
 */
export async function pullRowsFromSheet(
  spreadsheetId: string,
  sheetName: string = 'Work_Orders'
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('Belum login dengan akun Google.');
  }

  const cleanId = extractSpreadsheetId(spreadsheetId);
  const range = `${encodeURIComponent(sheetName)}!A1:AZ2500`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${range}?valueRenderOption=FORMATTED_VALUE`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal membaca tab '${sheetName}' dari spreadsheet.`);
  }

  const data = await res.json();
  const rawValues: string[][] = data.values || [];

  if (rawValues.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = rawValues[0].map((h, i) => (h && h.trim()) ? h.trim() : `Column_${i + 1}`);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < rawValues.length; i++) {
    const row = rawValues[i];
    // Skip empty lines
    if (!row || row.every(c => !c || c.trim() === '')) continue;

    const rowObj: Record<string, string> = {};
    headers.forEach((h, colIndex) => {
      rowObj[h] = row[colIndex] !== undefined ? String(row[colIndex]).trim() : '';
    });
    rows.push(rowObj);
  }

  return { headers, rows };
}

/**
 * Push tickets to Google Sheet (overwrites data rows with updated state)
 * NOTE: Callers MUST show user confirmation before triggering this operation as required by Workspace skill rules.
 */
export async function pushTicketsToSheet(
  spreadsheetId: string,
  sheetName: string = 'Work_Orders',
  tickets: Ticket[]
): Promise<{ updatedRows: number }> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('Belum login dengan akun Google.');
  }

  const cleanId = extractSpreadsheetId(spreadsheetId);
  // Prepare header and rows
  const rows = tickets.map(formatTicketToSheetRow);
  const allValues = [STANDARD_SHEET_HEADERS, ...rows];

  const range = `${encodeURIComponent(sheetName)}!A1:AM${allValues.length}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${range}?valueInputOption=USER_ENTERED`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range,
      majorDimension: 'ROWS',
      values: allValues
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Gagal menyimpan data ke Google Spreadsheet.');
  }

  return { updatedRows: rows.length };
}

/**
 * Append single new ticket or update a single row in Google Sheet
 */
export async function appendTicketToSheet(
  spreadsheetId: string,
  sheetName: string = 'Work_Orders',
  ticket: Ticket
): Promise<void> {
  const token = getAccessToken();
  if (!token) return;

  const cleanId = extractSpreadsheetId(spreadsheetId);
  const rowValues = formatTicketToSheetRow(ticket);
  const range = `${encodeURIComponent(sheetName)}!A:AM`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range,
      majorDimension: 'ROWS',
      values: [rowValues]
    })
  });
}
