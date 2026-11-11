// ==============================================================================
// MORAJAWS STORAGE COMPATIBILITY LAYER
// Ensures transparent rendering and handling of:
// 1. Firebase Storage URLs
// 2. Legacy Base64 Data URLs
// 3. Supabase Storage URLs and Signed Paths
// ==============================================================================

export type FileSourceCategory =
  | 'base64'
  | 'firebase'
  | 'supabase'
  | 'static'
  | 'external'
  | 'empty';

export interface StorageClassification {
  source: FileSourceCategory;
  isBase64: boolean;
  isFirebase: boolean;
  isSupabase: boolean;
  canDirectPreview: boolean;
  badgeLabel: string;
  badgeColor: string;
}

/**
 * Categorizes an image or document URL to provide safe previewing and metadata badges.
 */
export function classifyFileSource(urlOrData?: string | null): StorageClassification {
  if (!urlOrData || typeof urlOrData !== 'string') {
    return {
      source: 'empty',
      isBase64: false,
      isFirebase: false,
      isSupabase: false,
      canDirectPreview: false,
      badgeLabel: 'Tidak Ada File',
      badgeColor: 'text-slate-400 bg-slate-100 dark:bg-slate-800'
    };
  }

  const clean = urlOrData.trim();

  // 1. Base64 Data URI
  if (clean.startsWith('data:')) {
    return {
      source: 'base64',
      isBase64: true,
      isFirebase: false,
      isSupabase: false,
      canDirectPreview: true,
      badgeLabel: 'Base64 Inline',
      badgeColor: 'text-amber-700 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
    };
  }

  // 2. Firebase Storage URL
  if (
    clean.includes('firebasestorage.googleapis.com') ||
    clean.includes('.firebasestorage.app') ||
    clean.includes('storage.googleapis.com')
  ) {
    return {
      source: 'firebase',
      isBase64: false,
      isFirebase: true,
      isSupabase: false,
      canDirectPreview: true,
      badgeLabel: 'Firebase Storage',
      badgeColor: 'text-orange-700 bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800'
    };
  }

  // 3. Supabase Storage URL / Object / Sandbox Path
  if (
    clean.includes('.supabase.co/storage/v1/object/') ||
    clean.includes('/storage/v1/object/') ||
    clean.startsWith('/morajaws-reports/') ||
    clean.startsWith('morajaws-reports/') ||
    clean.startsWith('test-sandbox/') ||
    clean.startsWith('/api/storage/')
  ) {
    return {
      source: 'supabase',
      isBase64: false,
      isFirebase: false,
      isSupabase: true,
      canDirectPreview: true,
      badgeLabel: 'Supabase Storage',
      badgeColor: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
    };
  }

  // 4. Local Static Asset
  if (clean.startsWith('/') || clean.startsWith('./')) {
    return {
      source: 'static',
      isBase64: false,
      isFirebase: false,
      isSupabase: false,
      canDirectPreview: true,
      badgeLabel: 'Aset Lokal',
      badgeColor: 'text-blue-700 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800'
    };
  }

  // 5. External HTTP URL
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    return {
      source: 'external',
      isBase64: false,
      isFirebase: false,
      isSupabase: false,
      canDirectPreview: true,
      badgeLabel: 'Eksternal Web',
      badgeColor: 'text-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800'
    };
  }

  return {
    source: 'empty',
    isBase64: false,
    isFirebase: false,
    isSupabase: false,
    canDirectPreview: false,
    badgeLabel: 'Format Tidak Dikenal',
    badgeColor: 'text-slate-400 bg-slate-100'
  };
}

/**
 * Resolves safe preview URL without corrupting legacy data.
 * Base64 is rendered directly. Firebase URLs are rendered directly.
 * Supabase test-sandbox paths are proxied through backend download adapter.
 */
export function getSafePreviewUrl(urlOrData?: string | null): string {
  if (!urlOrData) return '';
  const clean = urlOrData.trim();
  const normalized = clean.replace(/^\/+/, '').replace(/^morajaws-reports\//, '');
  if (normalized.startsWith('test-sandbox/')) {
    return `/api/storage/adapter/download?storagePath=${encodeURIComponent(normalized)}`;
  }
  return clean;
}

/**
 * Computes human-readable file size from bytes or base64 length.
 */
export function formatFileSize(sizeOrBase64?: number | string | null): string {
  if (sizeOrBase64 === null || sizeOrBase64 === undefined) return '';

  let bytes = 0;
  if (typeof sizeOrBase64 === 'number') {
    bytes = sizeOrBase64;
  } else if (typeof sizeOrBase64 === 'string') {
    if (sizeOrBase64.startsWith('data:')) {
      const commaIdx = sizeOrBase64.indexOf(',');
      const dataLen = commaIdx >= 0 ? sizeOrBase64.length - commaIdx - 1 : sizeOrBase64.length;
      bytes = Math.round((dataLen * 3) / 4);
    } else {
      bytes = Number(sizeOrBase64) || 0;
    }
  }

  if (bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
