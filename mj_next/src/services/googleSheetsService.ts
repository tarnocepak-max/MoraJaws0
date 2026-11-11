import { Ticket } from '../types/index.ts';
import { GoogleSpreadsheetMeta } from '../types/sheets.ts';

const GOOGLE_OAUTH_CLIENT_ID = (import.meta as any).env?.VITE_GOOGLE_OAUTH_CLIENT_ID || '';
const GOOGLE_OAUTH_REDIRECT_URI = (import.meta as any).env?.VITE_GOOGLE_OAUTH_REDIRECT_URI || (typeof window !== 'undefined' ? `${window.location.origin}/oauth/google/callback` : '');
let cachedAccessToken: string | null = null;
let cachedGoogleUser: any = null;
let globalGISTokenClient: any = null;

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
];/** Google Identity Services only; Firebase is intentionally not part of this integration. */
export const initGoogleAuth=(onAuthSuccess?:(user:any,token:string)=>void,onAuthFailure?:()=>void)=>{if(cachedGoogleUser&&cachedAccessToken)onAuthSuccess?.(cachedGoogleUser,cachedAccessToken);else onAuthFailure?.();return()=>{};};
export const initGISTokenClient=(onSuccess:(data:{user:any;accessToken:string})=>void,onError:(err:Error)=>void):boolean=>{const google=(window as any).google;if(!google?.accounts?.oauth2||!GOOGLE_OAUTH_CLIENT_ID)return false;try{globalGISTokenClient=google.accounts.oauth2.initTokenClient({client_id:GOOGLE_OAUTH_CLIENT_ID,scope:'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file email profile openid',error_callback:(e:any)=>onError(new Error(e?.message||e?.type||'Google OAuth gagal.')),callback:async(resp:any)=>{if(resp.error||!resp.access_token){onError(new Error(resp?.error_description||resp?.error||'Tidak ada access token yang diterima dari Google.'));return;}const token=resp.access_token;cachedAccessToken=token;let user:any={displayName:'Pengguna Google',email:'',photoURL:'',uid:'google-user'};try{const r=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:`Bearer ${token}`}});if(r.ok){const p=await r.json();user={displayName:p.name||p.email,email:p.email||'',photoURL:p.picture||'',uid:p.sub||'google-user'};}}catch{}cachedGoogleUser=user;onSuccess({user,accessToken:token});}});return true;}catch(e:any){onError(e instanceof Error?e:new Error(String(e)));return false;}};
export const requestGISTokenSynchronously=(prompt:'consent'|''='consent')=>{if(!globalGISTokenClient)throw new Error('Google Identity Services belum siap.');globalGISTokenClient.requestAccessToken({prompt});};
export const getDirectGoogleOAuthUrl=()=>{const scopes=encodeURIComponent('https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file email profile openid');return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(GOOGLE_OAUTH_CLIENT_ID)}&redirect_uri=${encodeURIComponent(GOOGLE_OAUTH_REDIRECT_URI)}&response_type=token&scope=${scopes}&prompt=consent`;};
export const signInWithGoogleIdentityServices = (): Promise<{user:any;accessToken:string}> => new Promise((resolve,reject)=>{if(!initGISTokenClient(resolve,reject)){reject(new Error('Google Identity Services belum dimuat atau OAuth Client ID belum dikonfigurasi.'));return;}try{requestGISTokenSynchronously();}catch(e:any){reject(e);}});
export const signInWithGISBasic = (): Promise<{user:any;accessToken:string}> => new Promise((resolve,reject)=>{const google=(window as any).google;if(!google?.accounts?.oauth2||!GOOGLE_OAUTH_CLIENT_ID){reject(new Error('Google Identity Services belum siap atau OAuth Client ID belum dikonfigurasi.'));return;}try{const c=google.accounts.oauth2.initTokenClient({client_id:GOOGLE_OAUTH_CLIENT_ID,scope:'email profile openid',error_callback:(e:any)=>reject(new Error(e?.message||'Google OAuth gagal.')),callback:async(resp:any)=>{if(resp.error||!resp.access_token){reject(new Error(resp?.error_description||resp?.error||'Google OAuth gagal.'));return;}const token=resp.access_token;let user:any={displayName:'Pengguna Google',email:'',photoURL:'',uid:'google-user'};try{const r=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:`Bearer ${token}`}});if(r.ok){const p=await r.json();user={displayName:p.name||p.email,email:p.email||'',photoURL:p.picture||'',uid:p.sub||'google-user'};}}catch{}cachedAccessToken=token;cachedGoogleUser=user;resolve({user,accessToken:token});}});c.requestAccessToken({prompt:'select_account'});}catch(e:any){reject(e);}});
export const signInStaffWithGoogle=async()=>signInWithGISBasic();
export const googleSignIn=async()=>signInWithGoogleIdentityServices();
export const setManualAccessToken=async(token:string)=>{const clean=token.trim();if(!clean)throw new Error('Token tidak boleh kosong.');let user:any={displayName:'Pengguna Google (Manual Token)',email:'',photoURL:'',uid:'manual-token-user'};try{const r=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:`Bearer ${clean}`}});if(r.ok){const p=await r.json();user={displayName:p.name||p.email,email:p.email||'',photoURL:p.picture||'',uid:p.sub||'google-user'};}}catch{}cachedAccessToken=clean;cachedGoogleUser=user;return {user,accessToken:clean};};
export const googleSignOut=async()=>{cachedAccessToken=null;cachedGoogleUser=null;};
export const getAccessToken=()=>cachedAccessToken;
export const getCurrentGoogleUser=()=>cachedGoogleUser;

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
