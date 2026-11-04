import { db } from '../lib/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';

export type MoraJawsErrorCode =
  | 'MJ-AUTH-001'
  | 'MJ-AUTH-002'
  | 'MJ-AUTH-003'
  | 'MJ-AUTH-004'
  | 'MJ-AUTH-005'
  | 'MJ-AUTH-NET-001'
  | 'MJ-FS-001'
  | 'MJ-FS-002'
  | 'MJ-FS-003'
  | 'MJ-FS-004'
  | 'MJ-NET-001'
  | 'MJ-IMP-001'
  | 'MJ-WO-001'
  | 'MJ-SCH-001'
  | 'MJ-SYS-001'
  | 'MJ-UNK-001';

export interface ErrorDetails {
  errorCode: MoraJawsErrorCode;
  firebaseErrorCode?: string;
  module: 'Firestore' | 'Authentication' | 'Network' | 'Import' | 'WorkOrder' | 'Schedule' | 'System' | string;
  operation: string;
  description?: string;
  message?: string;
  technicalDetails?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  requestId?: string;
  status?: 'OPEN' | 'INVESTIGATING' | 'RESOLVED';
  onRetry?: () => void | Promise<void>;
}

export interface SystemErrorLogDocument {
  id: string;
  errorCode: MoraJawsErrorCode;
  firebaseErrorCode?: string;
  module: string;
  operation: string;
  message: string;
  technicalDetails: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  timestamp: string;
  userId: string;
  requestId: string;
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED';
}

/**
 * Sanitizes any sensitive data from error strings
 * Removes API keys, tokens, auth headers, passwords, and secrets.
 */
export function sanitizeErrorMessage(input: unknown): string {
  if (!input) return 'Tidak ada informasi teknis tambahan.';
  let text = typeof input === 'string' ? input : input instanceof Error ? input.message : JSON.stringify(input);

  // Mask API Keys (AIzaSy..., etc.)
  text = text.replace(/AIza[0-9A-Za-z-_]{35}/g, 'AIza***[PROTECTED_API_KEY]***');
  
  // Mask Bearer tokens
  text = text.replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer ***[PROTECTED_TOKEN]***');

  // Mask Passwords or passwordHash
  text = text.replace(/(password|passwordHash|secret|apiKey|accessToken)['"]?\s*[:=]\s*['"]?[^'"\s,]+/gi, '$1: "***[REDACTED]***"');

  // Mask Firebase Auth refresh tokens / JWT
  text = text.replace(/ey[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g, '***[PROTECTED_JWT]***');

  return text.trim();
}

/**
 * Asynchronously logs error to Firestore `system_error_logs` collection
 * Guaranteed never to throw or disrupt user execution flow.
 */
export async function logSystemErrorToFirestore(details: ErrorDetails): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    const requestId = details.requestId || `req-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const logId = `err-${details.errorCode}-${Date.now()}`;

    const docData: SystemErrorLogDocument = {
      id: logId,
      errorCode: details.errorCode,
      firebaseErrorCode: details.firebaseErrorCode || '',
      module: details.module,
      operation: details.operation,
      message: details.description || details.message || 'Terjadi kesalahan sistem.',
      technicalDetails: sanitizeErrorMessage(details.technicalDetails || ''),
      severity: ((details.severity ? details.severity.toUpperCase() : 'MEDIUM') as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'),
      timestamp,
      userId: details.userId || 'anonymous_or_system',
      requestId,
      status: (details.status || 'OPEN') as 'OPEN' | 'INVESTIGATING' | 'RESOLVED'
    };

    const docRef = doc(db, 'system_error_logs', logId);
    await setDoc(docRef, docData, { merge: true });
  } catch (logErr) {
    // Non-fatal background catch: safe fallback to console
    console.debug('[ErrorLogger] Non-fatal log recording catch:', logErr);
  }
}
