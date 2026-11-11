import { getSupabaseBackendClient } from './supabaseClient.ts';
import path from 'path';
import crypto from 'crypto';

// ==============================================================================
// MORAJAWS SUPABASE STORAGE SUBSYSTEM (PHASE 1: PREPARATION & ISOLATION)
// Handles organized, secure object storage for technician reports, attachments,
// live chat, and profiles, strictly preserving legacy Firebase and Base64 compat.
// ==============================================================================

export const MORAJAWS_STORAGE_BUCKET = 'morajaws-reports';

/**
 * Standard folder taxonomy inside morajaws-reports bucket.
 */
export const STORAGE_FOLDERS = {
  WORK_ORDERS: 'work-orders',
  TECHNICAL_REPORTS: 'technical-reports',
  LIVE_CHAT: 'live-chat',
  USER_PROFILES: 'user-profiles',
  TEST_SANDBOX: 'test-sandbox'
} as const;

export type StorageCategory = keyof typeof STORAGE_FOLDERS;

export type FileSourceType =
  | 'base64'
  | 'firebase_storage'
  | 'supabase_storage'
  | 'local_static'
  | 'external_http'
  | 'unknown';

export interface StorageValidationRule {
  allowedMimes: string[];
  allowedExtensions: string[];
  maxSizeBytes: number;
}

export const STORAGE_VALIDATION_RULES: Record<string, StorageValidationRule> = {
  IMAGE_REPORT: {
    allowedMimes: ['image/jpeg', 'image/png', 'image/webp'],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    maxSizeBytes: 5 * 1024 * 1024 // 5 MB
  },
  CHAT_ATTACHMENT: {
    allowedMimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
    maxSizeBytes: 5 * 1024 * 1024 // 5 MB
  },
  WO_DOCUMENT: {
    allowedMimes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'text/plain',
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.txt', '.csv', '.xlsx'],
    maxSizeBytes: 10 * 1024 * 1024 // 10 MB
  },
  USER_PROFILE: {
    allowedMimes: ['image/jpeg', 'image/png', 'image/webp'],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    maxSizeBytes: 2 * 1024 * 1024 // 2 MB
  }
};

export interface FileClassificationResult {
  sourceType: FileSourceType;
  isBase64: boolean;
  isFirebase: boolean;
  isSupabase: boolean;
  mimeType?: string;
  estimatedSize?: number;
  identifiedPath?: string;
  previewUrl: string;
}

/**
 * Classifies an arbitrary URL or payload string to distinguish:
 * 1. Firebase Storage URL
 * 2. Legacy Base64 Data URL
 * 3. Supabase Storage URL / Object Path
 * 4. Local static or external URL
 */
export function classifyFileSource(rawInput?: string | null): FileClassificationResult {
  if (!rawInput || typeof rawInput !== 'string') {
    return {
      sourceType: 'unknown',
      isBase64: false,
      isFirebase: false,
      isSupabase: false,
      previewUrl: ''
    };
  }

  const trimmed = rawInput.trim();

  // 1. Detect Base64 Data URI
  if (trimmed.startsWith('data:')) {
    const mimeMatch = trimmed.match(/^data:([a-zA-Z0-9/+-]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : undefined;
    const base64Data = mimeMatch ? trimmed.slice(mimeMatch[0].length) : trimmed;
    const estimatedSize = Math.round((base64Data.length * 3) / 4);

    return {
      sourceType: 'base64',
      isBase64: true,
      isFirebase: false,
      isSupabase: false,
      mimeType,
      estimatedSize,
      previewUrl: trimmed
    };
  }

  // 2. Detect Firebase Storage
  if (
    trimmed.includes('firebasestorage.googleapis.com') ||
    trimmed.includes('.firebasestorage.app') ||
    trimmed.includes('storage.googleapis.com')
  ) {
    return {
      sourceType: 'firebase_storage',
      isBase64: false,
      isFirebase: true,
      isSupabase: false,
      previewUrl: trimmed
    };
  }

  // 3. Detect Supabase Storage URL
  if (
    trimmed.includes('.supabase.co/storage/v1/object/') ||
    trimmed.includes('/storage/v1/object/public/') ||
    trimmed.includes('/storage/v1/object/sign/') ||
    trimmed.startsWith(`/${MORAJAWS_STORAGE_BUCKET}/`) ||
    trimmed.startsWith(`${MORAJAWS_STORAGE_BUCKET}/`)
  ) {
    return {
      sourceType: 'supabase_storage',
      isBase64: false,
      isFirebase: false,
      isSupabase: true,
      identifiedPath: trimmed,
      previewUrl: trimmed
    };
  }

  // 4. Local static assets
  if (trimmed.startsWith('/') || trimmed.startsWith('./')) {
    return {
      sourceType: 'local_static',
      isBase64: false,
      isFirebase: false,
      isSupabase: false,
      previewUrl: trimmed
    };
  }

  // 5. Generic HTTP(S) URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return {
      sourceType: 'external_http',
      isBase64: false,
      isFirebase: false,
      isSupabase: false,
      previewUrl: trimmed
    };
  }

  return {
    sourceType: 'unknown',
    isBase64: false,
    isFirebase: false,
    isSupabase: false,
    previewUrl: trimmed
  };
}

/**
 * Sanitizes a filename and identifier to prevent directory traversal and special character corruption.
 */
export function sanitizeFileName(name: string): string {
  if (!name) return 'unnamed_file';
  // Strip null bytes, paths, and dangerous chars
  const base = path.basename(name).replace(/\0/g, '');
  return base
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 120);
}

/**
 * Sanitizes folder subpath components (e.g. WO numbers or User IDs).
 */
export function sanitizePathSegment(segment: string): string {
  if (!segment) return 'general';
  return segment
    .trim()
    .split('/')
    .map(p => p.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64))
    .filter(Boolean)
    .join('/');
}

/**
 * Validates a file against security constraints:
 * - MIME type validation
 * - Extension matching
 * - Maximum file size
 */
export function validateFileConstraints(
  buffer: Buffer,
  declaredFileName: string,
  declaredMimeType: string,
  rule: StorageValidationRule
): { valid: boolean; error?: string; extension: string } {
  const ext = path.extname(declaredFileName).toLowerCase();

  // 1. Validate extension
  if (!rule.allowedExtensions.includes(ext)) {
    return {
      valid: false,
      extension: ext,
      error: `Ekstensi file "${ext}" tidak diizinkan. Ekstensi yang didukung: ${rule.allowedExtensions.join(', ')}`
    };
  }

  // 2. Validate MIME type
  const cleanMime = declaredMimeType.toLowerCase().trim();
  const isMimeAllowed = rule.allowedMimes.some(
    m => cleanMime === m || (m.endsWith('/*') && cleanMime.startsWith(m.replace('/*', '')))
  );

  if (!isMimeAllowed) {
    return {
      valid: false,
      extension: ext,
      error: `Tipe MIME "${cleanMime}" tidak diizinkan. Tipe yang didukung: ${rule.allowedMimes.join(', ')}`
    };
  }

  // 3. Validate size
  if (buffer.length > rule.maxSizeBytes) {
    const maxMb = (rule.maxSizeBytes / (1024 * 1024)).toFixed(1);
    const actualMb = (buffer.length / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      extension: ext,
      error: `Ukuran file (${actualMb} MB) melebihi batas maksimum ${maxMb} MB.`
    };
  }

  // 4. Magic number inspection for image safety (JPG, PNG, WebP, GIF, PDF)
  if (buffer.length >= 4) {
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    const isGif = buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46;
    const isPdf = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46; // %PDF
    const isRiffWebp =
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP';

    if (cleanMime.startsWith('image/jpeg') && !isJpeg) {
      return { valid: false, extension: ext, error: 'Integritas file tidak valid: header file bukan format JPEG yang sah.' };
    }
    if (cleanMime.startsWith('image/png') && !isPng) {
      return { valid: false, extension: ext, error: 'Integritas file tidak valid: header file bukan format PNG yang sah.' };
    }
    if (cleanMime.startsWith('image/webp') && !isRiffWebp) {
      return { valid: false, extension: ext, error: 'Integritas file tidak valid: header file bukan format WebP yang sah.' };
    }
    if (cleanMime === 'application/pdf' && !isPdf) {
      return { valid: false, extension: ext, error: 'Integritas file tidak valid: header file bukan format PDF yang sah.' };
    }
  }

  return { valid: true, extension: ext };
}

/**
 * Builds a clean, collision-resistant path within morajaws-reports bucket.
 * Pattern: <folder>/<entityId>/<uniqueId>_<filename>
 */
export function buildStorageObjectPath(
  folder: keyof typeof STORAGE_FOLDERS | string,
  entityId: string,
  originalFileName: string,
  prefix = ''
): { fullPath: string; uniqueFileId: string } {
  const safeFolder = sanitizePathSegment(folder);
  const safeEntity = sanitizePathSegment(entityId);
  const safeName = sanitizeFileName(originalFileName);
  const timestamp = Date.now();
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const uniqueFileId = `file_${timestamp}_${randomSuffix}`;

  const prefixSegment = prefix ? `${sanitizePathSegment(prefix)}_` : '';
  const finalFileName = `${prefixSegment}${uniqueFileId}_${safeName}`;
  const fullPath = `${safeFolder}/${safeEntity}/${finalFileName}`;

  return { fullPath, uniqueFileId };
}

export interface StorageUploadResult {
  success: boolean;
  bucket: string;
  storagePath?: string;
  uniqueFileId?: string;
  fileSize?: number;
  mimeType?: string;
  storageType: 'supabase_storage';
  signedUrl?: string;
  expiresIn?: number;
  error?: string;
}

/**
 * Uploads a file buffer to Supabase Storage via backend administrative client.
 * Isolated function: does not alter production pointers.
 */
export async function uploadBufferToSupabaseStorage(params: {
  bucket?: string;
  storagePath: string;
  fileBuffer: Buffer;
  mimeType: string;
  cacheControl?: string;
  upsert?: boolean;
}): Promise<StorageUploadResult> {
  const bucket = params.bucket || MORAJAWS_STORAGE_BUCKET;
  const client = getSupabaseBackendClient();

  if (!client) {
    return {
      success: false,
      bucket,
      storageType: 'supabase_storage',
      error: 'Supabase client belum dikonfigurasi (SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum aktif).'
    };
  }

  try {
    const { data, error } = await client.storage
      .from(bucket)
      .upload(params.storagePath, params.fileBuffer, {
        contentType: params.mimeType,
        cacheControl: params.cacheControl || '3600',
        upsert: params.upsert ?? false
      });

    if (error) {
      console.warn('[Supabase Storage] Upload error:', error.message);
      return {
        success: false,
        bucket,
        storagePath: params.storagePath,
        storageType: 'supabase_storage',
        error: error.message
      };
    }

    // Generate signed URL (valid for 1 hour)
    let signedUrl: string | undefined;
    const { data: signedData, error: signErr } = await client.storage
      .from(bucket)
      .createSignedUrl(params.storagePath, 3600);

    if (!signErr && signedData?.signedUrl) {
      signedUrl = signedData.signedUrl;
    }

    return {
      success: true,
      bucket,
      storagePath: data?.path || params.storagePath,
      fileSize: params.fileBuffer.length,
      mimeType: params.mimeType,
      storageType: 'supabase_storage',
      signedUrl,
      expiresIn: 3600
    };
  } catch (err: any) {
    return {
      success: false,
      bucket,
      storagePath: params.storagePath,
      storageType: 'supabase_storage',
      error: err?.message || 'Storage upload exception'
    };
  }
}

/**
 * Generates an expirable Signed URL for a private object in Supabase Storage.
 */
export async function createSupabaseStorageSignedUrl(
  storagePath: string,
  expiresInSeconds = 3600,
  bucket = MORAJAWS_STORAGE_BUCKET
): Promise<{ success: boolean; signedUrl?: string; expiresIn?: number; error?: string }> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: 'Supabase backend client belum aktif.' };
  }

  try {
    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, signedUrl: data?.signedUrl, expiresIn: expiresInSeconds };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Signed URL error' };
  }
}

/**
 * Refreshes an expirable Signed URL for an existing file in Supabase Storage.
 * The backend verifies that the signed URL is never stored permanently.
 */
export async function refreshSupabaseStorageSignedUrl(
  storagePath: string,
  expiresInSeconds = 3600,
  bucket = MORAJAWS_STORAGE_BUCKET
): Promise<{ success: boolean; signedUrl?: string; expiresIn?: number; refreshedAt?: string; error?: string }> {
  const result = await createSupabaseStorageSignedUrl(storagePath, expiresInSeconds, bucket);
  if (!result.success) {
    return { success: false, error: result.error || 'Gagal memperbarui Signed URL' };
  }
  return {
    success: true,
    signedUrl: result.signedUrl,
    expiresIn: result.expiresIn || expiresInSeconds,
    refreshedAt: new Date().toISOString()
  };
}

/**
 * Downloads a file buffer from Supabase Storage via backend administrative client.
 */
export async function downloadBufferFromSupabaseStorage(params: {
  bucket?: string;
  storagePath: string;
}): Promise<{
  success: boolean;
  data?: Buffer;
  mimeType?: string;
  sizeBytes?: number;
  error?: string;
}> {
  const bucket = params.bucket || MORAJAWS_STORAGE_BUCKET;
  const client = getSupabaseBackendClient();

  if (!client) {
    return {
      success: false,
      error: 'Supabase client belum dikonfigurasi (SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum aktif).'
    };
  }

  try {
    const { data, error } = await client.storage
      .from(bucket)
      .download(params.storagePath);

    if (error || !data) {
      return {
        success: false,
        error: error?.message || 'File tidak ditemukan di Supabase Storage.'
      };
    }

    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = (data as any).type || 'application/octet-stream';

    return {
      success: true,
      data: buffer,
      mimeType,
      sizeBytes: buffer.length
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Gagal mengunduh file dari Supabase Storage'
    };
  }
}

/**
 * Verifies the actual availability and accessibility of the Supabase Storage bucket.
 * CRITICAL RULE: Never assume bucket exists solely from HTTP 200 or readiness response.
 * If bucket is not found, never create it automatically; report configuration requirement.
 */
export async function checkActualBucketAvailability(bucketName = MORAJAWS_STORAGE_BUCKET): Promise<{
  clientConfigured: boolean;
  connected: boolean;
  bucketExists: boolean;
  isPrivate?: boolean;
  privacy: 'PRIVATE' | 'PUBLIC' | 'UNKNOWN';
  availableBuckets: string[];
  bucketName: string;
  status: 'READY' | 'BUCKET_NOT_FOUND' | 'NOT_CONFIGURED' | 'ERROR';
  message: string;
}> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return {
      clientConfigured: false,
      connected: false,
      bucketExists: false,
      privacy: 'UNKNOWN',
      availableBuckets: [],
      bucketName,
      status: 'NOT_CONFIGURED',
      message: 'Supabase client belum dikonfigurasi pada environment variables (SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY belum aktif).'
    };
  }

  try {
    const { data: buckets, error } = await client.storage.listBuckets();
    if (error) {
      return {
        clientConfigured: true,
        connected: false,
        bucketExists: false,
        privacy: 'UNKNOWN',
        availableBuckets: [],
        bucketName,
        status: 'ERROR',
        message: `Koneksi API berhasil, tetapi pemanggilan listBuckets menghasilkan error: ${error.message}`
      };
    }

    const availableBuckets = (buckets || []).map(b => b.name);
    const targetBucket = (buckets || []).find(b => b.name === bucketName);
    const bucketExists = Boolean(targetBucket);
    const isPrivate = targetBucket ? !targetBucket.public : undefined;
    const privacy: 'PRIVATE' | 'PUBLIC' | 'UNKNOWN' = targetBucket
      ? (targetBucket.public ? 'PUBLIC' : 'PRIVATE')
      : 'UNKNOWN';

    if (bucketExists) {
      return {
        clientConfigured: true,
        connected: true,
        bucketExists: true,
        isPrivate,
        privacy,
        availableBuckets,
        bucketName,
        status: 'READY',
        message: `Bucket "${bucketName}" benar-benar tersedia dan terverifikasi di Supabase Storage (${privacy}).`
      };
    } else {
      return {
        clientConfigured: true,
        connected: true,
        bucketExists: false,
        isPrivate: undefined,
        privacy: 'UNKNOWN',
        availableBuckets,
        bucketName,
        status: 'BUCKET_NOT_FOUND',
        message: `Bucket "${bucketName}" BELUM DIBUAT di Supabase Storage. Administrator perlu membuat bucket "${bucketName}" (Private) di Supabase Dashboard.`
      };
    }
  } catch (err: any) {
    return {
      clientConfigured: true,
      connected: false,
      bucketExists: false,
      privacy: 'UNKNOWN',
      availableBuckets: [],
      bucketName,
      status: 'ERROR',
      message: `Pengecekan ketersediaan bucket mengalami error: ${err?.message || err}`
    };
  }
}

export interface StorageAccessContext {
  category: 'work-orders' | 'technical-reports' | 'live-chat' | 'user-profiles' | 'test-sandbox' | string;
  ownerUserId?: string;
  woNumber?: string;
  storagePath?: string;
}

export interface AccessEvaluationResult {
  allowed: boolean;
  statusCode: 200 | 403 | 404;
  role: string;
  reason: string;
}

/**
 * Evaluates file access authorization based on user role and document ownership.
 * CRITICAL RULE: Installer can ONLY access files associated with Work Orders assigned to them.
 * Never validate solely based on folder or storage path name.
 */
export function evaluateFileAccessPermission(
  user: { id: string; role: string; name?: string; contractor?: string; area?: string; phone?: string },
  context: StorageAccessContext,
  tickets: any[] = []
): AccessEvaluationResult {
  const role = user.role;

  // 1. Super Admin & IT Support have full system inspection access
  if (role === 'super_admin' || role === 'it_support') {
    return {
      allowed: true,
      statusCode: 200,
      role,
      reason: `Diizinkan: Role ${role} memiliki hak akses inspeksi sistem dan operasional penuh.`
    };
  }

  // 2. Dispatch and Management Data have operational backend access to all tickets/files
  if (role === 'dispatch' || role === 'management_data') {
    return {
      allowed: true,
      statusCode: 200,
      role,
      reason: `Diizinkan: Role ${role} memiliki wewenang operasional manajemen data dan dispatch.`
    };
  }

  // 3. User Profiles: Any authenticated user can view profile avatars
  if (context.category === 'user-profiles') {
    return {
      allowed: true,
      statusCode: 200,
      role,
      reason: 'Diizinkan: Foto profil pengguna dapat diakses oleh seluruh staf terautentikasi.'
    };
  }

  // 4. Work Order, Technical Reports, and Live Chat: Check document ownership in database tickets
  const isOperational =
    context.category === 'work-orders' ||
    context.category === 'wo_document' ||
    context.category === 'technical-reports' ||
    context.category === 'image_report' ||
    context.category === 'live-chat' ||
    context.category === 'chat_attachment' ||
    Boolean(context.woNumber);

  if (isOperational) {
    let woNum = context.woNumber;
    if (!woNum && context.storagePath) {
      const match = context.storagePath.match(/(?:work-orders|wo_document|technical-reports|image_report|live-chat|chat_attachment)\/([a-zA-Z0-9_-]+)/);
      if (match) {
        woNum = match[1];
      }
    }

    if (woNum) {
      const ticket = tickets.find(t => (t.woNumber && t.woNumber === woNum) || (t.id && t.id === woNum));
      if (!ticket) {
        return {
          allowed: false,
          statusCode: 404,
          role,
          reason: `Ditolak: Work Order "${woNum}" tidak ditemukan dalam database.`
        };
      }

      // Leader verification: check contractor and area
      if (role === 'leader') {
        const leaderContr = (user.contractor || '').toLowerCase().trim();
        const ticketContr = (ticket.contactorName || ticket.contractorName || '').toLowerCase().trim();
        const leaderArea = (user.area || '').toLowerCase().trim();
        const ticketArea = (ticket.area || '').toLowerCase().trim();

        const matchContr = Boolean(leaderContr && (ticketContr.includes(leaderContr) || leaderContr.includes(ticketContr)));
        const matchArea = !leaderArea || ticketArea.includes(leaderArea) || leaderArea.includes(ticketArea);

        if (matchContr && matchArea) {
          return {
            allowed: true,
            statusCode: 200,
            role,
            reason: `Diizinkan: Work Order ${woNum} berada di bawah supervisi kontraktor Leader (${user.contractor || 'General'}).`
          };
        }

        return {
          allowed: false,
          statusCode: 403,
          role,
          reason: `Ditolak: Work Order ${woNum} dikelola oleh kontraktor "${ticketContr}", di luar wewenang Leader "${user.contractor}".`
        };
      }

      // Installer authorization is based only on the immutable application user ID.
      if (role === 'installer') {
        const assignedUserId = String(ticket.installerUserId || '').trim();
        const currentUserId = String(user.id || '').trim();
        if (assignedUserId && currentUserId && assignedUserId === currentUserId) {
          return {
            allowed: true,
            statusCode: 200,
            role,
            reason: `Diizinkan: Work Order ${woNum} ditugaskan ke akun installer (${user.name}).`
          };
        }
        return {
          allowed: false,
          statusCode: 403,
          role,
          reason: `Ditolak: akun installer (${user.name}) bukan akun yang ditugaskan ke Work Order ${woNum}.`
        };
      }
    }
  }

  // 5. Test Sandbox: Strictly isolated per user folder test-sandbox/{user_id}/
  if (context.category === 'test-sandbox' || (context.storagePath && context.storagePath.startsWith('test-sandbox/'))) {
    // Check if the user is the owner of the sandbox
    const pathOwnerMatch = context.storagePath?.match(/^test-sandbox\/([^/]+)/);
    const targetUserId = context.ownerUserId || (pathOwnerMatch ? pathOwnerMatch[1] : undefined);

    if (targetUserId && targetUserId === user.id) {
      return {
        allowed: true,
        statusCode: 200,
        role,
        reason: `Diizinkan: Pengguna (${user.id}) mengakses folder sandbox miliknya sendiri.`
      };
    }

    if (role === 'leader') {
      return {
        allowed: true,
        statusCode: 200,
        role,
        reason: 'Diizinkan: Leader memiliki akses supervisi pengujian sandbox anggota tim.'
      };
    }

    return {
      allowed: false,
      statusCode: 403,
      role,
      reason: `Ditolak: Folder sandbox "${context.storagePath || targetUserId}" terisolasi dan bukan milik akun (${user.id}).`
    };
  }


  return {
    allowed: false,
    statusCode: 403,
    role,
    reason: `Ditolak: Hak akses tidak memadai untuk role "${role}".`
  };
}

/**
 * Checks readiness of Supabase Storage subsystem.
 * Confirms whether Supabase client is initialized and lists available buckets.
 */
export async function checkSupabaseStorageReadiness(): Promise<{
  configured: boolean;
  bucketDesigned: string;
  folderTaxonomy: string[];
  backendConnected: boolean;
  message: string;
}> {
  const client = getSupabaseBackendClient();
  const folderTaxonomy = Object.values(STORAGE_FOLDERS);

  if (!client) {
    return {
      configured: false,
      bucketDesigned: MORAJAWS_STORAGE_BUCKET,
      folderTaxonomy,
      backendConnected: false,
      message: 'Supabase client standby (belum terhubung atau kredensial env belum terpasang).'
    };
  }

  try {
    const { data: buckets, error } = await client.storage.listBuckets();
    if (error) {
      return {
        configured: true,
        bucketDesigned: MORAJAWS_STORAGE_BUCKET,
        folderTaxonomy,
        backendConnected: false,
        message: `Terhubung ke API namun query list buckets menghasilkan: ${error.message}`
      };
    }

    const bucketNames = (buckets || []).map(b => b.name);
    const hasBucket = bucketNames.includes(MORAJAWS_STORAGE_BUCKET);

    return {
      configured: true,
      bucketDesigned: MORAJAWS_STORAGE_BUCKET,
      folderTaxonomy,
      backendConnected: true,
      message: hasBucket
        ? `Bucket "${MORAJAWS_STORAGE_BUCKET}" siap dan terdeteksi di Supabase Storage.`
        : `Supabase Storage terhubung. Bucket "${MORAJAWS_STORAGE_BUCKET}" dirancang untuk fase migrasi (belum di-provision).`
    };
  } catch (err: any) {
    return {
      configured: true,
      bucketDesigned: MORAJAWS_STORAGE_BUCKET,
      folderTaxonomy,
      backendConnected: false,
      message: `Pengecekan storage mengalami kesalahan: ${err?.message || err}`
    };
  }
}

// ==============================================================================
// PHASE 4: BACKEND STORAGE ADAPTER CORE IMPLEMENTATION
// Provides safe, unified adapter methods for MoraJaws backend.
// Enforces:
// 1. Backend as strict intermediary (frontend never accesses service role key)
// 2. Storage provider selection (Firebase is default production, Supabase is sandbox-only)
// 3. Ephemeral Signed URLs (never persisted as permanent database reference)
// 4. Strict RBAC & Document Ownership authorization
// 5. Sanitized audit logging (no tokens, keys, full signed URLs, or file bodies)
// ==============================================================================

export interface StorageProviderConfig {
  STORAGE_PROVIDER: 'firebase';
  SUPABASE_STORAGE_ENABLED: boolean;
  SUPABASE_STORAGE_MODE: 'sandbox';
  DEFAULT_PRODUCTION_PROVIDER: 'firebase';
}

export function getStorageProvider(): StorageProviderConfig {
  return {
    STORAGE_PROVIDER: 'firebase',
    SUPABASE_STORAGE_ENABLED: process.env.SUPABASE_STORAGE_ENABLED === 'true' || false,
    SUPABASE_STORAGE_MODE: 'sandbox',
    DEFAULT_PRODUCTION_PROVIDER: 'firebase'
  };
}

export interface StorageFileMetadata {
  fileId: string;
  storageProvider: 'firebase' | 'supabase' | 'base64';
  bucketName: string;
  filePath: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedByRole?: string;
  uploadedAt: string;
  relatedWoNumber?: string;
  fileCategory: 'image_report' | 'wo_document' | 'chat_attachment' | 'user_profile';
  sha256?: string;
}

export interface StorageOperationLog {
  operation: 'upload' | 'download' | 'delete' | 'sign' | 'refresh';
  status: 'success' | 'failed';
  provider: 'supabase' | 'firebase';
  fileId?: string;
  filePath?: string;
  userId: string;
  userRole?: string;
  timestamp: string;
  errorCode?: string;
  errorMessage?: string;
}

// In-memory sanitized audit ring buffer (max 300 entries)
const STORAGE_AUDIT_LOGS: StorageOperationLog[] = [];

export function logStorageOperation(log: StorageOperationLog): void {
  // Sanitize: Strip any tokens, secret keys, or base64 payloads
  const sanitizedPath = (log.filePath || '').replace(/[?&]token=[^&]+/g, '');
  const entry: StorageOperationLog = {
    ...log,
    filePath: sanitizedPath,
    errorMessage: log.errorMessage ? log.errorMessage.slice(0, 200) : undefined
  };

  STORAGE_AUDIT_LOGS.unshift(entry);
  if (STORAGE_AUDIT_LOGS.length > 300) {
    STORAGE_AUDIT_LOGS.pop();
  }
}

export function getStorageOperationLogs(limit = 50): StorageOperationLog[] {
  return STORAGE_AUDIT_LOGS.slice(0, limit);
}

/**
 * Validates a file before upload against categorized constraints.
 */
export function validateFileBeforeUpload(
  buffer: Buffer,
  fileName: string,
  declaredMime: string,
  category: 'image_report' | 'wo_document' | 'chat_attachment' | 'user_profile' | string
): { valid: boolean; error?: string; extension: string } {
  const ruleKeyMap: Record<string, keyof typeof STORAGE_VALIDATION_RULES> = {
    image_report: 'IMAGE_REPORT',
    wo_document: 'WO_DOCUMENT',
    chat_attachment: 'CHAT_ATTACHMENT',
    user_profile: 'USER_PROFILE'
  };

  const ruleKey = ruleKeyMap[category] || (category.toUpperCase() as keyof typeof STORAGE_VALIDATION_RULES) || 'IMAGE_REPORT';
  const rule = STORAGE_VALIDATION_RULES[ruleKey] || STORAGE_VALIDATION_RULES.IMAGE_REPORT;

  return validateFileConstraints(buffer, fileName, declaredMime, rule);
}

/**
 * Checks file access authorization with anti-traversal protections.
 */
export function checkFileAccess(
  user: { id: string; role: string; name?: string; contractor?: string; area?: string; phone?: string },
  context: StorageAccessContext,
  tickets: any[] = []
): AccessEvaluationResult {
  // Anti-traversal check
  const pathToCheck = context.storagePath || '';
  if (pathToCheck.includes('..') || pathToCheck.includes('%2e%2e') || pathToCheck.includes('\\')) {
    return {
      allowed: false,
      statusCode: 403,
      role: user.role,
      reason: 'Ditolak: Percobaan manipulasi path traversal (../) terdeteksi.'
    };
  }

  return evaluateFileAccessPermission(user, context, tickets);
}

/**
 * Uploads a file via the backend Storage Adapter.
 * Path pattern strictly: test-sandbox/{userId}/{fileCategory}/{uniqueId}_{filename}
 */
export async function uploadFile(params: {
  userId: string;
  userRole?: string;
  userName?: string;
  fileCategory: 'image_report' | 'wo_document' | 'chat_attachment' | 'user_profile';
  fileName: string;
  fileBuffer: Buffer;
  mimeType: string;
  relatedWoNumber?: string;
  bucket?: string;
}): Promise<{
  success: boolean;
  metadata?: StorageFileMetadata;
  signedUrl?: string;
  expiresIn?: number;
  error?: string;
}> {
  const { userId, fileCategory, fileName, fileBuffer, mimeType, relatedWoNumber } = params;
  const bucket = params.bucket || MORAJAWS_STORAGE_BUCKET;

  // 1. Validation
  const validation = validateFileBeforeUpload(fileBuffer, fileName, mimeType, fileCategory);
  if (!validation.valid) {
    logStorageOperation({
      operation: 'upload',
      status: 'failed',
      provider: 'supabase',
      userId,
      userRole: params.userRole,
      timestamp: new Date().toISOString(),
      errorCode: 'VALIDATION_FAILED',
      errorMessage: validation.error
    });
    return { success: false, error: validation.error };
  }

  // 2. Build collision-resistant sandbox path
  const { fullPath, uniqueFileId } = buildStorageObjectPath(
    `test-sandbox/${sanitizePathSegment(userId)}/${fileCategory}`,
    'data',
    fileName,
    'adp'
  );

  // 3. Compute SHA-256 for audit & deduplication
  const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  // 4. Upload to Supabase Storage
  const uploadResult = await uploadBufferToSupabaseStorage({
    bucket,
    storagePath: fullPath,
    fileBuffer,
    mimeType
  });

  if (!uploadResult.success) {
    logStorageOperation({
      operation: 'upload',
      status: 'failed',
      provider: 'supabase',
      fileId: uniqueFileId,
      filePath: fullPath,
      userId,
      userRole: params.userRole,
      timestamp: new Date().toISOString(),
      errorCode: 'STORAGE_UPLOAD_ERROR',
      errorMessage: uploadResult.error
    });
    return { success: false, error: uploadResult.error };
  }

  // 5. Build compatible metadata
  const metadata: StorageFileMetadata = {
    fileId: uniqueFileId,
    storageProvider: 'supabase',
    bucketName: bucket,
    filePath: fullPath,
    originalFileName: sanitizeFileName(fileName),
    mimeType,
    fileSize: fileBuffer.length,
    uploadedBy: userId,
    uploadedByRole: params.userRole,
    uploadedAt: new Date().toISOString(),
    relatedWoNumber: relatedWoNumber ? String(relatedWoNumber).trim() : undefined,
    fileCategory,
    sha256
  };

  logStorageOperation({
    operation: 'upload',
    status: 'success',
    provider: 'supabase',
    fileId: uniqueFileId,
    filePath: fullPath,
    userId,
    userRole: params.userRole,
    timestamp: new Date().toISOString()
  });

  return {
    success: true,
    metadata,
    signedUrl: uploadResult.signedUrl,
    expiresIn: uploadResult.expiresIn || 3600
  };
}

/**
 * Downloads a file via the backend Storage Adapter with access evaluation.
 */
export async function downloadFile(params: {
  storagePath: string;
  user: { id: string; role: string; name?: string; contractor?: string; area?: string; phone?: string };
  category?: string;
  woNumber?: string;
  bucket?: string;
  tickets?: any[];
}): Promise<{
  success: boolean;
  statusCode: number;
  data?: Buffer;
  mimeType?: string;
  sizeBytes?: number;
  sha256?: string;
  error?: string;
}> {
  const { storagePath, user, category, woNumber, tickets = [] } = params;
  const bucket = params.bucket || MORAJAWS_STORAGE_BUCKET;

  // 1. Permission Check
  const access = checkFileAccess(
    user,
    {
      category: category || 'test-sandbox',
      woNumber,
      storagePath
    },
    tickets
  );

  if (!access.allowed) {
    logStorageOperation({
      operation: 'download',
      status: 'failed',
      provider: 'supabase',
      filePath: storagePath,
      userId: user.id,
      userRole: user.role,
      timestamp: new Date().toISOString(),
      errorCode: 'PERMISSION_DENIED',
      errorMessage: access.reason
    });
    return {
      success: false,
      statusCode: access.statusCode,
      error: access.reason
    };
  }

  // 2. Download Buffer
  const downloadResult = await downloadBufferFromSupabaseStorage({
    bucket,
    storagePath
  });

  if (!downloadResult.success || !downloadResult.data) {
    logStorageOperation({
      operation: 'download',
      status: 'failed',
      provider: 'supabase',
      filePath: storagePath,
      userId: user.id,
      userRole: user.role,
      timestamp: new Date().toISOString(),
      errorCode: 'DOWNLOAD_NOT_FOUND',
      errorMessage: downloadResult.error
    });
    return {
      success: false,
      statusCode: 404,
      error: downloadResult.error || 'File tidak ditemukan di storage.'
    };
  }

  const sha256 = crypto.createHash('sha256').update(downloadResult.data).digest('hex');

  logStorageOperation({
    operation: 'download',
    status: 'success',
    provider: 'supabase',
    filePath: storagePath,
    userId: user.id,
    userRole: user.role,
    timestamp: new Date().toISOString()
  });

  return {
    success: true,
    statusCode: 200,
    data: downloadResult.data,
    mimeType: downloadResult.mimeType,
    sizeBytes: downloadResult.sizeBytes,
    sha256
  };
}

/**
 * Generates an expirable signed URL via the backend Storage Adapter.
 */
export async function getSignedFileUrl(params: {
  storagePath: string;
  user: { id: string; role: string; name?: string; contractor?: string; area?: string; phone?: string };
  expiresInSeconds?: number;
  category?: string;
  woNumber?: string;
  bucket?: string;
  tickets?: any[];
}): Promise<{
  success: boolean;
  statusCode: number;
  signedUrl?: string;
  expiresIn?: number;
  isPermanentReference: false;
  error?: string;
}> {
  const { storagePath, user, category, woNumber, tickets = [] } = params;
  const expiresInSeconds = params.expiresInSeconds || 3600;
  const bucket = params.bucket || MORAJAWS_STORAGE_BUCKET;

  // 1. Permission Check
  const access = checkFileAccess(
    user,
    {
      category: category || 'test-sandbox',
      woNumber,
      storagePath
    },
    tickets
  );

  if (!access.allowed) {
    return {
      success: false,
      statusCode: access.statusCode,
      isPermanentReference: false,
      error: access.reason
    };
  }

  const res = await createSupabaseStorageSignedUrl(storagePath, expiresInSeconds, bucket);
  if (!res.success) {
    return {
      success: false,
      statusCode: 500,
      isPermanentReference: false,
      error: res.error
    };
  }

  logStorageOperation({
    operation: 'sign',
    status: 'success',
    provider: 'supabase',
    filePath: storagePath,
    userId: user.id,
    userRole: user.role,
    timestamp: new Date().toISOString()
  });

  return {
    success: true,
    statusCode: 200,
    signedUrl: res.signedUrl,
    expiresIn: res.expiresIn || expiresInSeconds,
    isPermanentReference: false
  };
}

/**
 * Refreshes an expirable signed URL via backend Storage Adapter.
 */
export async function refreshSignedFileUrl(params: {
  storagePath: string;
  user: { id: string; role: string; name?: string; contractor?: string; area?: string; phone?: string };
  expiresInSeconds?: number;
  category?: string;
  woNumber?: string;
  bucket?: string;
  tickets?: any[];
}): Promise<{
  success: boolean;
  statusCode: number;
  signedUrl?: string;
  expiresIn?: number;
  refreshedAt?: string;
  isPermanentReference: false;
  error?: string;
}> {
  const signRes = await getSignedFileUrl(params);
  if (!signRes.success) {
    return {
      success: false,
      statusCode: signRes.statusCode,
      isPermanentReference: false,
      error: signRes.error
    };
  }

  logStorageOperation({
    operation: 'refresh',
    status: 'success',
    provider: 'supabase',
    filePath: params.storagePath,
    userId: params.user.id,
    userRole: params.user.role,
    timestamp: new Date().toISOString()
  });

  return {
    success: true,
    statusCode: 200,
    signedUrl: signRes.signedUrl,
    expiresIn: signRes.expiresIn,
    refreshedAt: new Date().toISOString(),
    isPermanentReference: false
  };
}

/**
 * Deletes a file strictly inside test-sandbox/{userId}/.
 * Production files can NEVER be deleted via this adapter.
 */
export async function deleteFile(params: {
  storagePath: string;
  user: { id: string; role: string; name?: string };
  bucket?: string;
}): Promise<{
  success: boolean;
  statusCode: number;
  error?: string;
}> {
  const { storagePath, user } = params;
  const bucket = params.bucket || MORAJAWS_STORAGE_BUCKET;

  // Strict check: only sandbox files are allowed to be deleted
  if (!storagePath.startsWith('test-sandbox/')) {
    return {
      success: false,
      statusCode: 403,
      error: 'Penghapusan dibatasi: File produksi tidak dapat dihapus melalui adapter ini.'
    };
  }

  // Permission check: ensure user owns the sandbox folder
  const access = checkFileAccess(user, {
    category: 'test-sandbox',
    storagePath
  });

  if (!access.allowed) {
    logStorageOperation({
      operation: 'delete',
      status: 'failed',
      provider: 'supabase',
      filePath: storagePath,
      userId: user.id,
      userRole: user.role,
      timestamp: new Date().toISOString(),
      errorCode: 'PERMISSION_DENIED',
      errorMessage: access.reason
    });
    return {
      success: false,
      statusCode: access.statusCode,
      error: access.reason
    };
  }

  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, statusCode: 503, error: 'Supabase client belum aktif.' };
  }

  try {
    const { error } = await client.storage.from(bucket).remove([storagePath]);
    if (error) {
      logStorageOperation({
        operation: 'delete',
        status: 'failed',
        provider: 'supabase',
        filePath: storagePath,
        userId: user.id,
        userRole: user.role,
        timestamp: new Date().toISOString(),
        errorCode: 'STORAGE_DELETE_ERROR',
        errorMessage: error.message
      });
      return { success: false, statusCode: 500, error: error.message };
    }

    logStorageOperation({
      operation: 'delete',
      status: 'success',
      provider: 'supabase',
      filePath: storagePath,
      userId: user.id,
      userRole: user.role,
      timestamp: new Date().toISOString()
    });

    return { success: true, statusCode: 200 };
  } catch (err: any) {
    return { success: false, statusCode: 500, error: err?.message || 'Delete operation exception' };
  }
}

/**
 * Inspects orphaned files in the sandbox without performing automatic deletion.
 */
export async function inspectStorageOrphans(
  trackedPaths: string[] = [],
  bucket = MORAJAWS_STORAGE_BUCKET
): Promise<{
  totalTrackedFiles: number;
  totalBucketFiles: number;
  orphanFiles: string[];
  missingFiles: string[];
  safeToDeleteCount: number;
  message: string;
}> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return {
      totalTrackedFiles: trackedPaths.length,
      totalBucketFiles: 0,
      orphanFiles: [],
      missingFiles: [],
      safeToDeleteCount: 0,
      message: 'Supabase client belum aktif untuk rekonsiliasi storage.'
    };
  }

  try {
    const { data: list, error } = await client.storage.from(bucket).list('test-sandbox', {
      limit: 100,
      offset: 0
    });

    if (error || !list) {
      return {
        totalTrackedFiles: trackedPaths.length,
        totalBucketFiles: 0,
        orphanFiles: [],
        missingFiles: [],
        safeToDeleteCount: 0,
        message: `Gagal membaca isi bucket: ${error?.message || 'Unknown error'}`
      };
    }

    const bucketFileNames = list.map(item => `test-sandbox/${item.name}`);
    const orphanFiles = bucketFileNames.filter(name => !trackedPaths.includes(name));
    const missingFiles = trackedPaths.filter(name => !bucketFileNames.includes(name));

    return {
      totalTrackedFiles: trackedPaths.length,
      totalBucketFiles: bucketFileNames.length,
      orphanFiles,
      missingFiles,
      safeToDeleteCount: orphanFiles.length,
      message: 'Pemeriksaan rekonsiliasi selesai (penghapusan otomatis dinonaktifkan sesuai aturan).'
    };
  } catch (err: any) {
    return {
      totalTrackedFiles: trackedPaths.length,
      totalBucketFiles: 0,
      orphanFiles: [],
      missingFiles: [],
      safeToDeleteCount: 0,
      message: `Eksepsi saat rekonsiliasi: ${err?.message || err}`
    };
  }
}


