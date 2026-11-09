import { auth } from '../lib/firebase';

export interface BackupDownloadResult {
  success: boolean;
  size?: number;
  sha256?: string;
  error?: string;
}

export const EXPECTED_BACKUP_SIZE = 1055520;
export const EXPECTED_BACKUP_SHA256 = 'c4b0b42c78f634735f1eb361947e641d096e13b9d071d8654fa13bfb5b1ab876';

/**
 * Downloads the production Firestore backup securely using Authorization: Bearer <token>.
 * Validates exact file size (1,055,520 bytes) and SHA-256 checksum before triggering save.
 */
export async function downloadProductionBackup(): Promise<BackupDownloadResult> {
  // 1. Send GET request with credentials: 'include' for HttpOnly session cookie
  // Fallback to Firebase ID token header if available in dev
  const headers: Record<string, string> = {
    'X-Morajaws-Client': 'browser'
  };

  if (auth.currentUser) {
    try {
      const fbToken = await auth.currentUser.getIdToken();
      if (fbToken) {
        headers['Authorization'] = `Bearer ${fbToken}`;
      }
    } catch (e) {}
  }

  try {
    const response = await fetch('/api/admin/backup/download', {
      method: 'GET',
      headers,
      credentials: 'include'
    });

    if (response.status === 401) {
      return {
        success: false,
        error: 'Sesi autentikasi ditolak (HTTP 401). Silakan login kembali.'
      };
    }

    if (response.status === 403) {
      return {
        success: false,
        error: 'Akses Ditolak (HTTP 403): Otoritas unduh backup dibatasi untuk Super Admin dan Data Management.'
      };
    }

    if (!response.ok) {
      let errMsg = `Gagal mengunduh file backup (HTTP ${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson?.error) errMsg = errJson.error;
      } catch (e) {}
      return { success: false, error: errMsg };
    }

    // 3. Receive file blob
    const blob = await response.blob();

    // 4. Verify exact file size
    if (blob.size !== EXPECTED_BACKUP_SIZE) {
      return {
        success: false,
        error: `Integritas ukuran file gagal: Ukuran ${blob.size.toLocaleString()} bytes tidak cocok dengan target ${EXPECTED_BACKUP_SIZE.toLocaleString()} bytes. Unduhan dibatalkan.`
      };
    }

    // 5. Verify exact SHA-256 checksum in browser
    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const calculatedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    if (calculatedHash !== EXPECTED_BACKUP_SHA256) {
      return {
        success: false,
        error: `Integritas SHA-256 gagal: Checksum ${calculatedHash.slice(0, 16)}... tidak cocok dengan target sumber. Unduhan dibatalkan.`
      };
    }

    // 6. Trigger attachment download
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.style.display = 'none';
    link.href = blobUrl;
    link.download = 'morajaws_production_firestore_backup.json';
    document.body.appendChild(link);
    link.click();
    window.URL.revokeObjectURL(blobUrl);
    document.body.removeChild(link);

    return {
      success: true,
      size: blob.size,
      sha256: calculatedHash
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Terjadi gangguan jaringan saat mengunduh file backup.'
    };
  }
}
