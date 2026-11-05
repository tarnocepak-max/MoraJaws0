import { getSupabaseBackendClient } from './supabaseClient.ts';
import type { ServerUser } from '../server.ts';

// ==============================================================================
// MORAJAWS SUPABASE DATA ACCESS LAYER & HARDENED ADAPTER
// Bridges camelCase client/in-memory records to snake_case PostgreSQL tables.
// Strictly adheres to migrations/001_core_morajaws_schema.sql.
// ==============================================================================

export const PROTECTED_PRODUCTION_WO_IDS = new Set<string>([
  'wo_1793825457141_u4bnht',
  'wo_imp_1793825458959_4i4f1h',
  'wo_imp_1793825458959_262dei'
]);

export interface SupabaseOpError {
  code: string;
  message: string;
  details?: any;
  isConnectionError?: boolean;
  isSchemaError?: boolean;
  isDuplicate?: boolean;
  isNotFound?: boolean;
}

export interface SupabaseOpResult<T = any> {
  success: boolean;
  data?: T;
  error?: SupabaseOpError;
}

export interface BulkImportResult {
  totalSubmitted: number;
  imported: number;
  skippedDuplicates: number;
  invalidCount: number;
  failedCount: number;
  duplicateInFileWoNumbers: string[];
  duplicateExistingWoNumbers: string[];
  invalidRows: Array<{ index: number; reason: string; rawWo?: string }>;
  failedErrors: string[];
}

export interface DateValidationResult {
  valid: boolean;
  dateStr: string | null;
  isExplicitClear: boolean;
  error?: string;
}

/**
 * Classifies Supabase / PostgREST errors into structured, distinguishable categories.
 * Differentiates network connection, missing schema, duplicate conflicts, and not found.
 */
export function classifySupabaseError(error: any): SupabaseOpError {
  const code = String(error?.code || '').toUpperCase();
  const msg = String(error?.message || '').toLowerCase();

  const isSchemaError =
    code === 'PGRST205' ||
    code === '42P01' ||
    msg.includes('schema cache') ||
    msg.includes('does not exist') ||
    msg.includes('relation');

  const isDuplicate =
    code === '23505' ||
    msg.includes('duplicate key') ||
    msg.includes('unique constraint') ||
    msg.includes('already exists');

  const isNotFound =
    code === 'PGRST116' ||
    msg.includes('no rows') ||
    msg.includes('not found');

  const isConnectionError =
    msg.includes('fetch failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT';

  return {
    code: error?.code || 'DB_ERROR',
    message: error?.message || 'Database operation failed',
    details: error?.details || undefined,
    isConnectionError,
    isSchemaError,
    isDuplicate,
    isNotFound
  };
}

/**
 * Real calendar date validator.
 * Validates days per month, leap years, and rejects invalid dates like February 30 or 31.
 */
export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 1970 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const daysInMonth = [0, 31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return day <= daysInMonth[month];
}

/**
 * Formats a valid date-only string (YYYY-MM-DD) or returns null.
 * Strictly:
 * - Validates against the real calendar (rejects February 31, April 31, etc.)
 * - Retains ISO YYYY-MM-DD
 * - Supports Indonesian format DD/MM/YYYY and DD-MM-YYYY
 * - Supports Excel serial dates without UTC/Asia-Jakarta day-shifting
 * - Never returns today's date if input is empty or invalid
 */
export function toDateOnlyString(val: unknown): string | null {
  if (!val) return null;
  const str = String(val).trim();
  if (!str || str === '-' || str === 'null' || str === 'undefined') return null;

  // 1. ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
  const isoMatch = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    if (isValidCalendarDate(y, m, d)) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return null; // Reject impossible calendar dates like 2026-02-31
  }

  // 2. Delimited format (DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY)
  const delMatch = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (delMatch) {
    const first = parseInt(delMatch[1], 10);
    const second = parseInt(delMatch[2], 10);
    const y = parseInt(delMatch[3], 10);
    let d = first;
    let m = second;
    if (second > 12 && first <= 12) {
      m = first;
      d = second;
    }
    if (isValidCalendarDate(y, m, d)) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return null;
  }

  // 3. Excel serial date (e.g. 46325)
  const num = Number(str);
  if (!isNaN(num) && num >= 30000 && num <= 75000) {
    try {
      const serialInt = Math.floor(num);
      // Epoch conversion: 25569 = days between 1899-12-30 and 1970-01-01
      const utcMs = (serialInt - 25569) * 86400000;
      const dt = new Date(utcMs);
      const y = dt.getUTCFullYear();
      const m = dt.getUTCMonth() + 1;
      const d = dt.getUTCDate();
      if (isValidCalendarDate(y, m, d)) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    } catch {}
  }

  return null;
}

/**
 * Validates date input specifically for update operations.
 * - If date is explicitly null or empty string, recognizes intent to clear.
 * - If date is provided but format/calendar is invalid, flags as validation error.
 * - Does NOT silently convert invalid input to null or wipe out existing date.
 */
export function parseAndValidateDateForUpdate(val: unknown, fieldName: string): DateValidationResult {
  if (val === null || val === '') {
    return { valid: true, dateStr: null, isExplicitClear: true };
  }
  if (val === undefined) {
    return { valid: true, dateStr: null, isExplicitClear: false };
  }

  const str = String(val).trim();
  if (str === '-' || str === 'null' || str === 'undefined') {
    return { valid: true, dateStr: null, isExplicitClear: true };
  }

  const parsed = toDateOnlyString(str);
  if (!parsed) {
    return {
      valid: false,
      dateStr: null,
      isExplicitClear: false,
      error: `Format tanggal "${str}" pada field "${fieldName}" tidak valid atau tidak sesuai kalender sebenarnya (contoh valid: YYYY-MM-DD atau DD/MM/YYYY).`
    };
  }

  return { valid: true, dateStr: parsed, isExplicitClear: false };
}

/**
 * Normalizes WO Number for canonical deduplication.
 * Strips outer whitespace, converts to uppercase, removes internal spaces.
 */
export function normalizeWoNumber(rawWo?: string | null): string {
  if (!rawWo || typeof rawWo !== 'string') return '';
  return rawWo.trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * Lowercased canonical WO key for case-insensitive and space-free deduplication.
 */
export function canonicalWoKey(rawWo?: string | null): string {
  if (!rawWo || typeof rawWo !== 'string') return '';
  return rawWo.trim().toLowerCase().replace(/\s+/g, '');
}

/**
 * Escapes PostgREST ILIKE pattern metacharacters so identifiers are matched
 * exactly rather than treating user-supplied '%' or '_' as wildcards.
 */
function escapePostgrestLikeValue(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

// ------------------------------------------------------------------------------
// USER OBJECT MAPPINGS
// ------------------------------------------------------------------------------

/**
 * Converts camelCase User object to snake_case PostgreSQL row for public.users table.
 * SECURITY:
 * - Never uses fixed default password '28232849'.
 * - Never auto-generates passwords when passwordHash is empty.
 * - Stores non-relational staff password hash securely inside payload.passwordHash.
 * - Firebase Authentication remains the sole authority for identity verification.
 */
export function userToPostgresRow(user: ServerUser): Record<string, any> {
  const existingPayload = (user as any).payload && typeof (user as any).payload === 'object'
    ? (user as any).payload
    : {};

  const payload = {
    ...existingPayload,
    passwordHash: user.passwordHash || null,
    sessionVersion: typeof user.sessionVersion === 'number' ? user.sessionVersion : 1
  };

  return {
    id: user.id,
    firebase_uid: user.firebaseUid || null,
    name: user.name,
    username: user.username,
    email: user.email || null,
    alt_email: user.altEmail || null,
    phone: user.phone || null,
    role: user.role,
    role_id: (user as any).roleId || null,
    contractor_id: user.contractorId || null,
    contractor: user.contractor || null,
    area: user.area || null,
    cluster_name: (user as any).clusterName || null,
    active: user.active !== false,
    must_change_password: Boolean(user.mustChangePassword),
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
    last_login_at: user.lastLoginAt || null,
    login_count: typeof user.loginCount === 'number' ? user.loginCount : 0,
    is_archived: Boolean((user as any).isArchived),
    archived_at: (user as any).archivedAt || null,
    archived_by: (user as any).archivedBy || null,
    is_deleted: Boolean(user.isDeleted),
    deleted_at: user.deletedAt || null,
    deleted_by: user.deletedBy || null,
    deletion_reason: user.deletionReason || null,
    payload,
    created_at: user.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

/**
 * Converts snake_case PostgreSQL user row from public.users to application ServerUser object.
 * SECURITY: Never defaults to fixed '28232849' password.
 */
export function postgresRowToUser(row: any): ServerUser {
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
  const passwordHash = row.password_hash || payload.passwordHash || '';
  const sessionVersion = typeof payload.sessionVersion === 'number'
    ? payload.sessionVersion
    : (typeof row.session_version === 'number' ? row.session_version : 1);

  return {
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email || '',
    altEmail: row.alt_email || undefined,
    phone: row.phone || undefined,
    role: row.role,
    contractor: row.contractor || undefined,
    contractorId: row.contractor_id || undefined,
    area: row.area || undefined,
    active: row.active !== false,
    passwordHash,
    permissions: Array.isArray(row.permissions) ? row.permissions : [],
    lastLoginAt: row.last_login_at || undefined,
    loginCount: typeof row.login_count === 'number' ? row.login_count : 0,
    firebaseUid: row.firebase_uid || undefined,
    mustChangePassword: Boolean(row.must_change_password),
    sessionVersion,
    isDeleted: Boolean(row.is_deleted),
    deletedAt: row.deleted_at || undefined,
    deletedBy: row.deleted_by || undefined,
    deletionReason: row.deletion_reason || undefined,
    createdAt: row.created_at || new Date().toISOString()
  };
}

// ------------------------------------------------------------------------------
// WORK ORDER MAPPINGS
// ------------------------------------------------------------------------------

/**
 * Converts application Ticket / Work Order object to snake_case PostgreSQL row for public.work_orders table.
 * ACCURACY & INTEGRITY:
 * - Never auto-fills today's date if date is empty.
 * - Preserves appointmentDate as appointment schedule date distinct from importDate.
 * - Never fabricates dummy values for customer ID, area, slot time, or ticket category.
 * - Preserves both contactor_name and contractor_name without data loss.
 * - Preserves unmappedHeaders and additionalFields.
 * - Encapsulates all non-column custom fields into JSONB payload column.
 */
export function ticketToPostgresRow(ticket: any): Record<string, any> {
  const extraPayload = {
    installerId: ticket.installerId || null,
    installerUid: ticket.installerUid || null,
    assignedTo: ticket.assignedTo || null,
    assignedToUid: ticket.assignedToUid || null,
    progressReports: Array.isArray(ticket.progressReports) ? ticket.progressReports : [],
    reportStatusId: ticket.reportStatusId || null,
    reportStatusLabel: ticket.reportStatusLabel || null,
    reasonReportId: ticket.reasonReportId || null,
    reasonReportLabel: ticket.reasonReportLabel || null,
    rootcauseId: ticket.rootcauseId || null,
    rootcauseLabel: ticket.rootcauseLabel || null,
    workStartedAt: ticket.workStartedAt || null,
    workStartedBy: ticket.workStartedBy || null,
    workStartedById: ticket.workStartedById || null,
    approvalStatus: ticket.approvalStatus || 'NONE',
    approvalNotes: ticket.approvalNotes || null,
    approvedAt: ticket.approvedAt || null,
    approvedBy: ticket.approvedBy || null,
    approvedById: ticket.approvedById || null,
    rejectedAt: ticket.rejectedAt || null,
    rejectedBy: ticket.rejectedBy || null,
    rejectedById: ticket.rejectedById || null,
    rejectionReason: ticket.rejectionReason || null,
    checkOutAt: ticket.checkOutAt || null,
    workDurationMinutes: ticket.workDurationMinutes ?? null,
    workDurationFormatted: ticket.workDurationFormatted || null,
    chatCategory: ticket.chatCategory || null,
    ...(ticket.payload && typeof ticket.payload === 'object' ? ticket.payload : {})
  };

  const contractorVal = ticket.contractorName ?? ticket.contactorName ?? null;
  const contactorVal = ticket.contactorName ?? ticket.contractorName ?? null;

  return {
    id: ticket.id,
    wo_number: ticket.woNumber || ticket.workOrderNumber,
    work_order_number: ticket.workOrderNumber || ticket.woNumber || null,
    id_customer: ticket.idCustomer || ticket.customerId || null,
    customer_id: ticket.customerId || ticket.idCustomer || null,
    ticket_number: ticket.ticketNumber || null,
    ticket_date: toDateOnlyString(ticket.ticketDate),
    date: toDateOnlyString(ticket.date),
    appointment_date: toDateOnlyString(ticket.appointmentDate),
    date_upload: ticket.dateUpload || null,
    file_name: ticket.fileName || null,
    agent_id: ticket.agentId || null,

    // Customer
    customer_name: ticket.customerName || ticket.endUserName || null,
    end_user_name: ticket.endUserName || ticket.customerName || null,
    customer_phone: ticket.customerPhone || null,
    customer_contact1: ticket.customerContact1 || ticket.customerPhone || null,
    customer_contact2: ticket.customerContact2 || null,
    customer_contact3: ticket.customerContact3 || null,
    customer_phone_normalized: ticket.customerPhoneNormalized || null,
    street_name: ticket.streetName || null,
    street_alternatif: ticket.streetAlternatif || null,
    address: ticket.address || null,
    city: ticket.city || null,
    postal_code: ticket.postalCode || null,
    cluster_name: ticket.clusterName || null,
    area: ticket.area || null,

    // Schedule & Category
    appointment_type: ticket.appointmentType || null,
    slot_time: ticket.slotTime || null,
    ticket_category: ticket.ticketCategory || null,
    initial_ticket_category: ticket.initialTicketCategory || null,

    // Telecom FTTH
    installation_type: ticket.installationType || null,
    service_type: ticket.serviceType || null,
    homepass_type: ticket.homepassType || null,
    homepass_detail_id: ticket.homepassDetailId || null,
    olt_code: ticket.oltCode || null,
    fdt_code: ticket.fdtCode || null,
    fat_code: ticket.fatCode || null,
    fat_port: ticket.fatPort || null,
    dropcore_length: ticket.dropcoreLength || null,
    plan: ticket.plan || null,
    service_aging_maintenance: ticket.serviceAgingMaintenance || null,
    vendor_name: ticket.vendorName || null,
    router: ticket.router || null,
    ont_brand: ticket.ontBrand || null,
    ont_model: ticket.ontModel || null,
    router_brand: ticket.routerBrand || null,
    router_model: ticket.routerModel || null,
    router_serial_number: ticket.routerSerialNumber || null,
    stb1_sn: ticket.stb1Sn || null,
    stb1_mac: ticket.stb1Mac || null,
    stb2_sn: ticket.stb2Sn || null,
    stb2_mac: ticket.stb2Mac || null,
    stb3_sn: ticket.stb3Sn || null,
    stb3_mac: ticket.stb3Mac || null,
    ont_serial_number: ticket.ontSerialNumber || null,
    ont_mac_address: ticket.ontMacAddress || null,
    rg_serial_number: ticket.rgSerialNumber || null,
    rg_mac_address: ticket.rgMacAddress || null,

    // Contractors & Technicians
    contractor_id: ticket.contractorId || null,
    contractor_name: contractorVal,
    contactor_name: contactorVal,
    leader_name: ticket.leaderName || null,
    corlap_name: ticket.corlapName || null,
    corlap_contact: ticket.corlapContact || null,
    installer_name: ticket.installerName || null,
    installer_contact: ticket.installerContact || null,
    installer_contact2: ticket.installerContact2 || null,
    installer_email: ticket.installerEmail || null,
    date_assign_agent: ticket.dateAssignAgent || null,
    date_assign_technician: ticket.dateAssignTechnician || null,
    assigned_at: ticket.assignedAt || null,
    assigned_by: ticket.assignedBy || null,
    reassigned_at: ticket.reassignedAt || null,
    reassigned_by: ticket.reassignedBy || null,
    reassignment_reason: ticket.reassignmentReason || null,

    // Operational Statuses
    distribution_status: ticket.distributionStatus || 'pending',
    distribution_notes: ticket.distributionNotes || null,
    status_wo_agent: ticket.statusWOAgent || 'Pending',
    status_wo_installer: ticket.statusWOInstaller || 'Unassigned',
    status_whatsapp: ticket.statusWhatsApp || 'not_prepared',
    remarks_wo_installer: ticket.remarksWOInstaller || null,
    remarks_agent: ticket.remarksAgent || null,
    remarks: ticket.remarks || null,

    // WhatsApp Tracking
    wa_message_preview: ticket.waMessagePreview || null,
    wa_generated_url: ticket.waGeneratedUrl || null,
    wa_last_opened_at: ticket.waLastOpenedAt || null,
    wa_confirmed_at: ticket.waConfirmedAt || null,
    wa_confirmed_by: ticket.waConfirmedBy || null,
    wa_confirmation_notes: ticket.waConfirmationNotes || null,

    // Chat stats & Sessions
    chat_messages_count: typeof ticket.chatMessagesCount === 'number' ? ticket.chatMessagesCount : 0,
    last_message_at: ticket.lastMessageAt || null,
    last_message_snippet: ticket.lastMessageSnippet || null,
    check_in_at: ticket.checkInAt || null,
    work_session_status: ticket.workSessionStatus || null,
    work_sessions: Array.isArray(ticket.workSessions) ? ticket.workSessions : [],

    // Closure & Technical Report
    closed_at: ticket.closedAt || null,
    closed_by: ticket.closedBy || null,
    close_notes: ticket.closeNotes || null,
    reopen_reason: ticket.reopenReason || null,
    technical_report: ticket.technicalReport || null,

    // Soft delete & Archival
    is_archived: Boolean(ticket.isArchived),
    archived_at: ticket.archivedAt || null,
    archived_by: ticket.archivedBy || null,
    is_deleted: Boolean(ticket.isDeleted),
    deleted_at: ticket.deletedAt || null,
    deleted_by: ticket.deletedBy || null,
    deletion_reason: ticket.deletionReason || null,

    // Dynamic unmapped headers & batch
    unmapped_headers: Array.isArray(ticket.unmappedHeaders) ? ticket.unmappedHeaders : [],
    additional_fields: ticket.additionalFields && typeof ticket.additionalFields === 'object' ? ticket.additionalFields : {},
    imported_at: ticket.importedAt || null,
    import_date: toDateOnlyString(ticket.importDate),
    import_batch_id: ticket.importBatchId || null,

    payload: extraPayload,
    created_at: ticket.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: ticket.updatedBy || null
  };
}

/**
 * Converts PostgreSQL work_orders row to application Ticket object.
 * Restores all standard columns and all custom fields from JSONB payload.
 */
export function postgresRowToTicket(row: any): any {
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};

  return {
    id: row.id,
    woNumber: row.wo_number,
    workOrderNumber: row.work_order_number || row.wo_number,
    idCustomer: row.id_customer || row.customer_id || '',
    customerId: row.customer_id || row.id_customer || '',
    ticketNumber: row.ticket_number || undefined,
    ticketDate: row.ticket_date || undefined,
    date: row.date || undefined,
    dateUpload: row.date_upload || undefined,
    fileName: row.file_name || undefined,
    agentId: row.agent_id || undefined,

    customerName: row.customer_name || '',
    endUserName: row.end_user_name || row.customer_name || '',
    customerPhone: row.customer_phone || '',
    customerContact1: row.customer_contact1 || row.customer_phone || undefined,
    customerContact2: row.customer_contact2 || undefined,
    customerContact3: row.customer_contact3 || undefined,
    customerPhoneNormalized: row.customer_phone_normalized || undefined,
    streetName: row.street_name || undefined,
    streetAlternatif: row.street_alternatif || undefined,
    address: row.address || undefined,
    city: row.city || undefined,
    postalCode: row.postal_code || undefined,
    clusterName: row.cluster_name || undefined,
    area: row.area || '',

    appointmentDate: row.appointment_date || undefined,
    appointmentType: row.appointment_type || undefined,
    slotTime: row.slot_time || '',
    ticketCategory: row.ticket_category || '',
    initialTicketCategory: row.initial_ticket_category || undefined,

    installationType: row.installation_type || undefined,
    serviceType: row.service_type || undefined,
    homepassType: row.homepass_type || undefined,
    homepassDetailId: row.homepass_detail_id || undefined,
    oltCode: row.olt_code || undefined,
    fdtCode: row.fdt_code || undefined,
    fatCode: row.fat_code || undefined,
    fatPort: row.fat_port || undefined,
    dropcoreLength: row.dropcore_length || undefined,
    plan: row.plan || undefined,
    serviceAgingMaintenance: row.service_aging_maintenance || undefined,
    vendorName: row.vendor_name || undefined,
    router: row.router || undefined,
    ontBrand: row.ont_brand || undefined,
    ontModel: row.ont_model || undefined,
    routerBrand: row.router_brand || undefined,
    routerModel: row.router_model || undefined,
    routerSerialNumber: row.router_serial_number || undefined,
    stb1Sn: row.stb1_sn || undefined,
    stb1Mac: row.stb1_mac || undefined,
    stb2Sn: row.stb2_sn || undefined,
    stb2Mac: row.stb2_mac || undefined,
    stb3Sn: row.stb3_sn || undefined,
    stb3Mac: row.stb3_mac || undefined,
    ontSerialNumber: row.ont_serial_number || undefined,
    ontMacAddress: row.ont_mac_address || undefined,
    rgSerialNumber: row.rg_serial_number || undefined,
    rgMacAddress: row.rg_mac_address || undefined,

    contactorName: row.contactor_name || row.contractor_name || '',
    contractorName: row.contractor_name || row.contactor_name || '',
    contractorId: row.contractor_id || undefined,
    leaderName: row.leader_name || undefined,
    corlapName: row.corlap_name || undefined,
    corlapContact: row.corlap_contact || undefined,
    installerName: row.installer_name || undefined,
    installerContact: row.installer_contact || undefined,
    installerContact2: row.installer_contact2 || undefined,
    installerEmail: row.installer_email || undefined,
    dateAssignAgent: row.date_assign_agent || undefined,
    dateAssignTechnician: row.date_assign_technician || undefined,
    assignedAt: row.assigned_at || undefined,
    assignedBy: row.assigned_by || undefined,
    reassignedAt: row.reassigned_at || undefined,
    reassignedBy: row.reassigned_by || undefined,
    reassignmentReason: row.reassignment_reason || undefined,

    distributionStatus: row.distribution_status || 'pending',
    distributionNotes: row.distribution_notes || undefined,
    statusWOAgent: row.status_wo_agent || 'Pending',
    statusWOInstaller: row.status_wo_installer || 'Unassigned',
    statusWhatsApp: row.status_whatsapp || 'not_prepared',
    remarksWOInstaller: row.remarks_wo_installer || undefined,
    remarksAgent: row.remarks_agent || undefined,
    remarks: row.remarks || undefined,

    // Payload restored fields
    installerId: payload.installerId || row.installer_id || undefined,
    installerUid: payload.installerUid || row.installer_uid || undefined,
    assignedTo: payload.assignedTo || row.assigned_to || row.installer_name || undefined,
    assignedToUid: payload.assignedToUid || row.assigned_to_uid || undefined,
    progressReports: Array.isArray(payload.progressReports) ? payload.progressReports : [],
    reportStatusId: payload.reportStatusId || undefined,
    reportStatusLabel: payload.reportStatusLabel || undefined,
    reasonReportId: payload.reasonReportId || undefined,
    reasonReportLabel: payload.reasonReportLabel || undefined,
    rootcauseId: payload.rootcauseId || undefined,
    rootcauseLabel: payload.rootcauseLabel || undefined,
    workStartedAt: payload.workStartedAt || undefined,
    workStartedBy: payload.workStartedBy || undefined,
    workStartedById: payload.workStartedById || undefined,
    approvalStatus: payload.approvalStatus || 'NONE',
    approvalNotes: payload.approvalNotes || undefined,
    approvedAt: payload.approvedAt || undefined,
    approvedBy: payload.approvedBy || undefined,
    approvedById: payload.approvedById || undefined,
    rejectedAt: payload.rejectedAt || undefined,
    rejectedBy: payload.rejectedBy || undefined,
    rejectedById: payload.rejectedById || undefined,
    rejectionReason: payload.rejectionReason || undefined,

    checkInAt: row.check_in_at || undefined,
    checkOutAt: payload.checkOutAt || undefined,
    workDurationMinutes: payload.workDurationMinutes ?? undefined,
    workDurationFormatted: payload.workDurationFormatted || undefined,
    workSessionStatus: row.work_session_status || 'Belum Check-in',
    workSessions: Array.isArray(row.work_sessions) ? row.work_sessions : [],
    chatCategory: payload.chatCategory || undefined,

    waMessagePreview: row.wa_message_preview || undefined,
    waGeneratedUrl: row.wa_generated_url || undefined,
    waLastOpenedAt: row.wa_last_opened_at || undefined,
    waConfirmedAt: row.wa_confirmed_at || undefined,
    waConfirmedBy: row.wa_confirmed_by || undefined,
    waConfirmationNotes: row.wa_confirmation_notes || undefined,

    chatMessagesCount: row.chat_messages_count || 0,
    lastMessageAt: row.last_message_at || undefined,
    lastMessageSnippet: row.last_message_snippet || undefined,
    closedAt: row.closed_at || undefined,
    closedBy: row.closed_by || undefined,
    closeNotes: row.close_notes || undefined,
    reopenReason: row.reopen_reason || undefined,

    technicalReport: row.technical_report || undefined,

    isArchived: Boolean(row.is_archived),
    archivedAt: row.archived_at || undefined,
    archivedBy: row.archived_by || undefined,
    isDeleted: Boolean(row.is_deleted),
    deletedAt: row.deleted_at || undefined,
    deletedBy: row.deleted_by || undefined,
    deletionReason: row.deletion_reason || undefined,

    unmappedHeaders: Array.isArray(row.unmapped_headers) ? row.unmapped_headers : [],
    additionalFields: row.additional_fields && typeof row.additional_fields === 'object' ? row.additional_fields : {},
    importedAt: row.imported_at || undefined,
    importDate: row.import_date || undefined,
    importBatchId: row.import_batch_id || undefined,

    payload,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
    updatedBy: row.updated_by || undefined
  };
}

// ------------------------------------------------------------------------------
// DATA ACCESS LAYER: USERS
// ------------------------------------------------------------------------------

/**
 * Searches for user in Supabase by Firebase UID, ID, Username, or Email.
 * - Distinguishes between "user not found" (returns null) and database failure (throws).
 * - Never converts database/network errors into a silent null.
 * - Protects callers from misinterpreting a database outage as non-existent user.
 */
export async function findUserInSupabase(identifier: string): Promise<ServerUser | null> {
  const result = await findUserInSupabaseDetailed(identifier);
  if (!result.success) {
    if (result.error?.code === 'NOT_CONFIGURED') {
      return null;
    }
    throw new Error(
      `[Supabase Database Error: ${result.error?.code || 'UNKNOWN'}] ${result.error?.message || 'Database query failed'}`
    );
  }
  return result.data || null;
}

/**
 * Hardened user search returning explicit success status, user data, and classified error.
 * - Retains all special characters in usernames and emails (no aggressive character stripping).
 * - Avoids fragile .or(...) string concatenation.
 * - Executes targeted, prioritized parameter-bound queries:
 *   1. firebase_uid (exact)
 *   2. id (exact primary key)
 *   3. email and alt_email (case-insensitive exact)
 *   4. username (case-insensitive exact)
 * - Returns immediately if database error occurs at any step.
 */
export async function findUserInSupabaseDetailed(identifier: string): Promise<SupabaseOpResult<ServerUser | null>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return {
      success: false,
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' }
    };
  }

  if (!identifier || typeof identifier !== 'string') {
    return {
      success: false,
      data: null,
      error: { code: 'INVALID_IDENTIFIER', message: 'Identifier wajib berupa string non-kosong.' }
    };
  }

  const raw = identifier.trim();
  if (!raw) {
    return {
      success: false,
      data: null,
      error: { code: 'INVALID_IDENTIFIER', message: 'Identifier tidak memuat nilai yang valid.' }
    };
  }

  try {
    // 1. Check exact match on firebase_uid
    const { data: byFbUid, error: errFb } = await client
      .from('users')
      .select('*')
      .eq('firebase_uid', raw)
      .limit(1)
      .maybeSingle();

    if (errFb) {
      const classified = classifySupabaseError(errFb);
      console.error('[Supabase DAL] findUser query error (firebase_uid):', classified.message);
      return { success: false, data: null, error: classified };
    }
    if (byFbUid) {
      return { success: true, data: postgresRowToUser(byFbUid) };
    }

    // 2. Check exact match on primary key id
    const { data: byId, error: errId } = await client
      .from('users')
      .select('*')
      .eq('id', raw)
      .limit(1)
      .maybeSingle();

    if (errId) {
      const classified = classifySupabaseError(errId);
      console.error('[Supabase DAL] findUser query error (id):', classified.message);
      return { success: false, data: null, error: classified };
    }
    if (byId) {
      return { success: true, data: postgresRowToUser(byId) };
    }

    // 3. If identifier has '@', search by email and alt_email
    if (raw.includes('@')) {
      const { data: byEmail, error: errEmail } = await client
        .from('users')
        .select('*')
        .ilike('email', escapePostgrestLikeValue(raw))
        .limit(1)
        .maybeSingle();

      if (errEmail) {
        const classified = classifySupabaseError(errEmail);
        console.error('[Supabase DAL] findUser query error (email):', classified.message);
        return { success: false, data: null, error: classified };
      }
      if (byEmail) {
        return { success: true, data: postgresRowToUser(byEmail) };
      }

      // Check alt_email
      const { data: byAltEmail, error: errAlt } = await client
        .from('users')
        .select('*')
        .ilike('alt_email', escapePostgrestLikeValue(raw))
        .limit(1)
        .maybeSingle();

      if (errAlt) {
        const classified = classifySupabaseError(errAlt);
        console.error('[Supabase DAL] findUser query error (alt_email):', classified.message);
        return { success: false, data: null, error: classified };
      }
      if (byAltEmail) {
        return { success: true, data: postgresRowToUser(byAltEmail) };
      }
    }

    // 4. Check case-insensitive exact match on username
    const { data: byUsername, error: errUser } = await client
      .from('users')
      .select('*')
      .ilike('username', escapePostgrestLikeValue(raw))
      .limit(1)
      .maybeSingle();

    if (errUser) {
      const classified = classifySupabaseError(errUser);
      console.error('[Supabase DAL] findUser query error (username):', classified.message);
      return { success: false, data: null, error: classified };
    }
    if (byUsername) {
      return { success: true, data: postgresRowToUser(byUsername) };
    }

    // User legitimately not found across all search criteria
    return { success: true, data: null };
  } catch (err: any) {
    const classified = classifySupabaseError(err);
    console.error('[Supabase DAL] findUser connection exception:', classified.message);
    return { success: false, data: null, error: classified };
  }
}

/**
 * Fetches all users from Supabase.
 */
export async function getUsersFromSupabase(includeDeleted = false): Promise<SupabaseOpResult<ServerUser[]>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }

  try {
    let query = client.from('users').select('*').order('name', { ascending: true });
    if (!includeDeleted) {
      query = query.eq('is_deleted', false);
    }

    const { data, error } = await query;
    if (error) {
      const classified = classifySupabaseError(error);
      console.error('[Supabase DAL] getUsers error:', classified.message);
      return { success: false, error: classified };
    }

    const users = (data || []).map(postgresRowToUser);
    return { success: true, data: users };
  } catch (err: any) {
    const classified = classifySupabaseError(err);
    return { success: false, error: classified };
  }
}

/**
 * Fetches a single user by ID from Supabase.
 */
export async function getUserByIdFromSupabase(id: string): Promise<SupabaseOpResult<ServerUser | null>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }

  if (!id || typeof id !== 'string' || !id.trim()) {
    return { success: false, error: { code: 'INVALID_ID', message: 'User ID wajib diisi.' } };
  }

  try {
    const { data, error } = await client
      .from('users')
      .select('*')
      .eq('id', id.trim())
      .maybeSingle();

    if (error) {
      const classified = classifySupabaseError(error);
      return { success: false, error: classified };
    }

    return { success: true, data: data ? postgresRowToUser(data) : null };
  } catch (err: any) {
    const classified = classifySupabaseError(err);
    return { success: false, error: classified };
  }
}

/**
 * Inserts a new user into Supabase.
 */
export async function insertUserToSupabase(user: ServerUser): Promise<SupabaseOpResult<ServerUser>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }

  if (!user || !user.id || !user.username) {
    return { success: false, error: { code: 'INVALID_DATA', message: 'Data user tidak lengkap (id dan username wajib).' } };
  }

  try {
    const row = userToPostgresRow(user);
    const { data, error } = await client.from('users').insert([row]).select('*').single();

    if (error) {
      const classified = classifySupabaseError(error);
      console.error('[Supabase DAL] insertUser error:', classified.message);
      return { success: false, error: classified };
    }

    return { success: true, data: postgresRowToUser(data) };
  } catch (err: any) {
    const classified = classifySupabaseError(err);
    return { success: false, error: classified };
  }
}

/**
 * Updates an existing user in Supabase. Never deletes old data if update fails.
 */
export async function updateUserInSupabase(id: string, updates: Partial<ServerUser>): Promise<SupabaseOpResult<ServerUser>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }

  if (!id || typeof id !== 'string' || !id.trim()) {
    return { success: false, error: { code: 'INVALID_ID', message: 'User ID wajib diisi.' } };
  }

  try {
    // 1. Check existing record
    const { data: existing, error: checkError } = await client
      .from('users')
      .select('*')
      .eq('id', id.trim())
      .maybeSingle();

    if (checkError) {
      return { success: false, error: classifySupabaseError(checkError) };
    }
    if (!existing) {
      return { success: false, error: { code: 'NOT_FOUND', isNotFound: true, message: `User dengan ID "${id}" tidak ditemukan.` } };
    }

    const updateRow: Record<string, any> = {
      updated_at: new Date().toISOString()
    };

    if (updates.name !== undefined) updateRow.name = updates.name;
    if (updates.username !== undefined) updateRow.username = updates.username;
    if (updates.email !== undefined) updateRow.email = updates.email || null;
    if (updates.altEmail !== undefined) updateRow.alt_email = updates.altEmail || null;
    if (updates.phone !== undefined) updateRow.phone = updates.phone || null;
    if (updates.role !== undefined) updateRow.role = updates.role;
    if (updates.contractor !== undefined) updateRow.contractor = updates.contractor || null;
    if (updates.contractorId !== undefined) updateRow.contractor_id = updates.contractorId || null;
    if (updates.area !== undefined) updateRow.area = updates.area || null;
    if (updates.active !== undefined) updateRow.active = updates.active;
    if (updates.mustChangePassword !== undefined) updateRow.must_change_password = Boolean(updates.mustChangePassword);
    if (updates.permissions !== undefined) updateRow.permissions = updates.permissions;
    if (updates.lastLoginAt !== undefined) updateRow.last_login_at = updates.lastLoginAt;
    if (updates.loginCount !== undefined) updateRow.login_count = updates.loginCount;
    if (updates.firebaseUid !== undefined) updateRow.firebase_uid = updates.firebaseUid || null;

    const prevPayload = existing.payload && typeof existing.payload === 'object' ? existing.payload : {};
    const currentSessionVersion = typeof prevPayload.sessionVersion === 'number' ? prevPayload.sessionVersion : 1;

    const isSecuritySensitiveChange =
      (updates.active !== undefined && updates.active !== existing.active) ||
      (updates.role !== undefined && updates.role !== existing.role) ||
      (updates.contractor !== undefined && updates.contractor !== existing.contractor) ||
      (updates.contractorId !== undefined && updates.contractorId !== existing.contractor_id) ||
      (updates.area !== undefined && updates.area !== existing.area) ||
      updates.passwordHash !== undefined;

    const nextSessionVersion = updates.sessionVersion !== undefined
      ? updates.sessionVersion
      : (isSecuritySensitiveChange ? currentSessionVersion + 1 : currentSessionVersion);

    updateRow.payload = {
      ...prevPayload,
      ...(updates.passwordHash !== undefined ? { passwordHash: updates.passwordHash || null } : {}),
      sessionVersion: nextSessionVersion
    };

    const { data, error } = await client
      .from('users')
      .update(updateRow)
      .eq('id', id.trim())
      .select('*')
      .single();

    if (error) {
      const classified = classifySupabaseError(error);
      console.error('[Supabase DAL] updateUser error:', classified.message);
      return { success: false, error: classified };
    }

    return { success: true, data: postgresRowToUser(data) };
  } catch (err: any) {
    const classified = classifySupabaseError(err);
    return { success: false, error: classified };
  }
}

/**
 * Soft deletes a user in Supabase.
 * Checks ID availability, verifies record existence, returns updated user, retains audit trail.
 */
export async function deleteUserInSupabase(
  id: string,
  deletedBy?: string,
  reason?: string
): Promise<SupabaseOpResult<ServerUser>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }

  if (!id || typeof id !== 'string' || !id.trim()) {
    return { success: false, error: { code: 'INVALID_ID', message: 'ID User wajib diisi.' } };
  }

  const cleanId = id.trim();

  try {
    const { data: existingUser } = await client
      .from('users')
      .select('payload')
      .eq('id', cleanId)
      .maybeSingle();

    const existingPayload = existingUser?.payload && typeof existingUser.payload === 'object' ? existingUser.payload : {};
    const curVersion = typeof existingPayload.sessionVersion === 'number' ? existingPayload.sessionVersion : 1;

    const { data, error } = await client
      .from('users')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: deletedBy || 'Admin',
        deletion_reason: reason || 'Soft delete via user management',
        payload: {
          ...existingPayload,
          sessionVersion: curVersion + 1
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', cleanId)
      .select('*');

    if (error) {
      const classified = classifySupabaseError(error);
      console.error('[Supabase DAL] deleteUser error:', classified.message);
      return { success: false, error: classified };
    }

    if (!data || data.length === 0) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', isNotFound: true, message: `User dengan ID "${cleanId}" tidak ditemukan.` }
      };
    }

    return { success: true, data: postgresRowToUser(data[0]) };
  } catch (err: any) {
    const classified = classifySupabaseError(err);
    return { success: false, error: classified };
  }
}

// ------------------------------------------------------------------------------
// DATA ACCESS LAYER: WORK ORDERS / TICKETS
// ------------------------------------------------------------------------------

export interface GetWorkOrdersOptions {
  limit?: number;
  offset?: number;
  includeDeleted?: boolean;
  includeArchived?: boolean;
  area?: string;
  contractorId?: string;
  installerName?: string;
  appointmentDate?: string;
}

/**
 * Fetches Work Orders from Supabase with flexible filtering.
 */
export async function getWorkOrdersFromSupabase(options: GetWorkOrdersOptions = {}): Promise<SupabaseOpResult<any[]>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }

  try {
    let query = client.from('work_orders').select('*');

    if (!options.includeDeleted) {
      query = query.eq('is_deleted', false);
    }
    if (!options.includeArchived) {
      query = query.eq('is_archived', false);
    }
    if (options.area) {
      query = query.eq('area', options.area);
    }
    if (options.contractorId) {
      query = query.eq('contractor_id', options.contractorId);
    }
    if (options.installerName) {
      query = query.eq('installer_name', options.installerName);
    }
    if (options.appointmentDate) {
      query = query.eq('appointment_date', options.appointmentDate);
    }

    query = query.order('created_at', { ascending: false });

    if (typeof options.limit === 'number' && options.limit > 0) {
      query = query.limit(options.limit);
    }
    if (typeof options.offset === 'number' && options.offset > 0) {
      query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
    }

    const { data, error } = await query;
    if (error) {
      const classified = classifySupabaseError(error);
      console.error('[Supabase DAL] getWorkOrders error:', classified.message);
      return { success: false, error: classified };
    }

    const tickets = (data || []).map(postgresRowToTicket);
    return { success: true, data: tickets };
  } catch (err: any) {
    const classified = classifySupabaseError(err);
    return { success: false, error: classified };
  }
}

/**
 * Fetches a single Work Order by ID.
 */
export async function getWorkOrderByIdFromSupabase(id: string): Promise<SupabaseOpResult<any | null>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }

  if (!id || typeof id !== 'string' || !id.trim()) {
    return { success: false, error: { code: 'INVALID_ID', message: 'ID Work Order wajib diisi.' } };
  }

  try {
    const { data, error } = await client
      .from('work_orders')
      .select('*')
      .eq('id', id.trim())
      .maybeSingle();

    if (error) {
      const classified = classifySupabaseError(error);
      return { success: false, error: classified };
    }

    return { success: true, data: data ? postgresRowToTicket(data) : null };
  } catch (err: any) {
    const classified = classifySupabaseError(err);
    return { success: false, error: classified };
  }
}

/**
 * Fetches a single Work Order by WO Number.
 * Searches with case-insensitive whitespace-trimmed query.
 */
export async function getWorkOrderByWoNumberFromSupabase(woNumber: string): Promise<SupabaseOpResult<any | null>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }

  const cleanWo = normalizeWoNumber(woNumber);
  if (!cleanWo) {
    return { success: false, error: { code: 'INVALID_WO', message: 'Nomor WO kosong atau tidak valid.' } };
  }

  try {
    const { data, error } = await client
      .from('work_orders')
      .select('*')
      .ilike('wo_number', cleanWo)
      .maybeSingle();

    if (error) {
      const classified = classifySupabaseError(error);
      return { success: false, error: classified };
    }

    return { success: true, data: data ? postgresRowToTicket(data) : null };
  } catch (err: any) {
    const classified = classifySupabaseError(err);
    return { success: false, error: classified };
  }
}

/**
 * Inserts a single Work Order into Supabase.
 */
export async function insertWorkOrderToSupabase(ticket: any): Promise<SupabaseOpResult<any>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }

  if (!ticket) {
    return { success: false, error: { code: 'INVALID_DATA', message: 'Data tiket Work Order kosong.' } };
  }

  const rawWo = ticket.woNumber || ticket.workOrderNumber;
  const normWo = normalizeWoNumber(rawWo);
  if (!normWo) {
    return { success: false, error: { code: 'INVALID_WO', message: 'Nomor WO wajib disertakan.' } };
  }

  try {
    const row = ticketToPostgresRow(ticket);
    const { data, error } = await client
      .from('work_orders')
      .insert([row])
      .select('*')
      .single();

    if (error) {
      const classified = classifySupabaseError(error);
      console.error('[Supabase DAL] insertWorkOrder error:', classified.message);
      return { success: false, error: classified };
    }

    return { success: true, data: postgresRowToTicket(data) };
  } catch (err: any) {
    const classified = classifySupabaseError(err);
    return { success: false, error: classified };
  }
}

/**
 * Hardened Partial Update of a Work Order in Supabase.
 * - Validates date format when date is sent; returns validation error on invalid date instead of converting to null.
 * - Does not wipe out existing dates when input is invalid.
 * - Allows explicit date clearing only if caller explicitly passes null or empty string.
 * - Updates ONLY columns that are explicitly provided in `updates`.
 * - Never turns unprovided columns into null.
 * - Never modifies appointment_date if not explicitly changed.
 * - Never modifies statuses automatically.
 * - Safely merges payload and additional_fields without overwriting untouched data.
 */
export async function updateWorkOrderInSupabase(id: string, updates: Record<string, any>): Promise<SupabaseOpResult<any>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }

  if (!id || typeof id !== 'string' || !id.trim()) {
    return { success: false, error: { code: 'INVALID_ID', message: 'ID Work Order wajib diisi.' } };
  }

  if (!updates || typeof updates !== 'object') {
    return { success: false, error: { code: 'INVALID_UPDATES', message: 'Objek update tidak valid.' } };
  }

  const cleanId = id.trim();

  if (PROTECTED_PRODUCTION_WO_IDS.has(cleanId)) {
    return {
      success: false,
      error: {
        code: 'PROTECTED_RECORD',
        message: 'Tiga WO produksi yang telah di-soft-delete dilindungi secara mutlak dan dilarang diubah atau dihapus.'
      }
    };
  }

  try {
    // 1. Fetch current existing row to ensure atomic partial update
    const { data: existingRow, error: fetchError } = await client
      .from('work_orders')
      .select('*')
      .eq('id', cleanId)
      .maybeSingle();

    if (fetchError) {
      return { success: false, error: classifySupabaseError(fetchError) };
    }
    if (!existingRow) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', isNotFound: true, message: `Work Order dengan ID "${cleanId}" tidak ditemukan.` }
      };
    }

    // 2. Validate date fields: if provided and invalid, reject immediately without mutating data
    const updateRow: Record<string, any> = {
      updated_at: new Date().toISOString()
    };

    if (updates.appointmentDate !== undefined || updates.appointment_date !== undefined) {
      const rawVal = updates.appointmentDate !== undefined ? updates.appointmentDate : updates.appointment_date;
      const valRes = parseAndValidateDateForUpdate(rawVal, 'appointmentDate');
      if (!valRes.valid) {
        return {
          success: false,
          error: { code: 'INVALID_DATE_FORMAT', message: valRes.error! }
        };
      }
      if (valRes.isExplicitClear) {
        updateRow.appointment_date = null;
      } else if (valRes.dateStr) {
        updateRow.appointment_date = valRes.dateStr;
      }
    }

    if (updates.date !== undefined) {
      const valRes = parseAndValidateDateForUpdate(updates.date, 'date');
      if (!valRes.valid) {
        return {
          success: false,
          error: { code: 'INVALID_DATE_FORMAT', message: valRes.error! }
        };
      }
      if (valRes.isExplicitClear) {
        updateRow.date = null;
      } else if (valRes.dateStr) {
        updateRow.date = valRes.dateStr;
      }
    }

    if (updates.ticketDate !== undefined || updates.ticket_date !== undefined) {
      const rawVal = updates.ticketDate !== undefined ? updates.ticketDate : updates.ticket_date;
      const valRes = parseAndValidateDateForUpdate(rawVal, 'ticketDate');
      if (!valRes.valid) {
        return {
          success: false,
          error: { code: 'INVALID_DATE_FORMAT', message: valRes.error! }
        };
      }
      if (valRes.isExplicitClear) {
        updateRow.ticket_date = null;
      } else if (valRes.dateStr) {
        updateRow.ticket_date = valRes.dateStr;
      }
    }

    if (updates.importDate !== undefined || updates.import_date !== undefined) {
      const rawVal = updates.importDate !== undefined ? updates.importDate : updates.import_date;
      const valRes = parseAndValidateDateForUpdate(rawVal, 'importDate');
      if (!valRes.valid) {
        return {
          success: false,
          error: { code: 'INVALID_DATE_FORMAT', message: valRes.error! }
        };
      }
      if (valRes.isExplicitClear) {
        updateRow.import_date = null;
      } else if (valRes.dateStr) {
        updateRow.import_date = valRes.dateStr;
      }
    }

    // Identifiers
    if (updates.woNumber !== undefined || updates.wo_number !== undefined) {
      const rawWo = updates.woNumber !== undefined ? updates.woNumber : updates.wo_number;
      const normalizedWo = normalizeWoNumber(rawWo);
      if (!normalizedWo || normalizedWo.length < 3) {
        return {
          success: false,
          error: { code: 'INVALID_WO_NUMBER', message: 'Nomor WO tidak valid. Nomor WO wajib berisi minimal 3 karakter.' }
        };
      }
      updateRow.wo_number = normalizedWo;
    }
    if (updates.workOrderNumber !== undefined || updates.work_order_number !== undefined) {
      updateRow.work_order_number = updates.workOrderNumber || updates.work_order_number;
    }
    if (updates.idCustomer !== undefined || updates.id_customer !== undefined) {
      updateRow.id_customer = updates.idCustomer ?? updates.id_customer;
    }
    if (updates.customerId !== undefined || updates.customer_id !== undefined) {
      updateRow.customer_id = updates.customerId ?? updates.customer_id;
    }
    if (updates.ticketNumber !== undefined || updates.ticket_number !== undefined) {
      updateRow.ticket_number = updates.ticketNumber ?? updates.ticket_number;
    }

    if (updates.dateUpload !== undefined || updates.date_upload !== undefined) {
      updateRow.date_upload = updates.dateUpload ?? updates.date_upload;
    }
    if (updates.fileName !== undefined || updates.file_name !== undefined) {
      updateRow.file_name = updates.fileName ?? updates.file_name;
    }
    if (updates.agentId !== undefined || updates.agent_id !== undefined) {
      updateRow.agent_id = updates.agentId ?? updates.agent_id;
    }

    // Customer info
    if (updates.customerName !== undefined || updates.customer_name !== undefined) {
      updateRow.customer_name = updates.customerName ?? updates.customer_name;
    }
    if (updates.endUserName !== undefined || updates.end_user_name !== undefined) {
      updateRow.end_user_name = updates.endUserName ?? updates.end_user_name;
    }
    if (updates.customerPhone !== undefined || updates.customer_phone !== undefined) {
      updateRow.customer_phone = updates.customerPhone ?? updates.customer_phone;
    }
    if (updates.customerContact1 !== undefined || updates.customer_contact1 !== undefined) {
      updateRow.customer_contact1 = updates.customerContact1 ?? updates.customer_contact1;
    }
    if (updates.customerContact2 !== undefined || updates.customer_contact2 !== undefined) {
      updateRow.customer_contact2 = updates.customerContact2 ?? updates.customer_contact2;
    }
    if (updates.customerContact3 !== undefined || updates.customer_contact3 !== undefined) {
      updateRow.customer_contact3 = updates.customerContact3 ?? updates.customer_contact3;
    }
    if (updates.customerPhoneNormalized !== undefined || updates.customer_phone_normalized !== undefined) {
      updateRow.customer_phone_normalized = updates.customerPhoneNormalized ?? updates.customer_phone_normalized;
    }
    if (updates.streetName !== undefined || updates.street_name !== undefined) {
      updateRow.street_name = updates.streetName ?? updates.street_name;
    }
    if (updates.streetAlternatif !== undefined || updates.street_alternatif !== undefined) {
      updateRow.street_alternatif = updates.streetAlternatif ?? updates.street_alternatif;
    }
    if (updates.address !== undefined) updateRow.address = updates.address;
    if (updates.city !== undefined) updateRow.city = updates.city;
    if (updates.postalCode !== undefined || updates.postal_code !== undefined) {
      updateRow.postal_code = updates.postalCode ?? updates.postal_code;
    }
    if (updates.clusterName !== undefined || updates.cluster_name !== undefined) {
      updateRow.cluster_name = updates.clusterName ?? updates.cluster_name;
    }
    if (updates.area !== undefined) updateRow.area = updates.area;

    // Schedule & Category
    if (updates.appointmentType !== undefined || updates.appointment_type !== undefined) {
      updateRow.appointment_type = updates.appointmentType ?? updates.appointment_type;
    }
    if (updates.slotTime !== undefined || updates.slot_time !== undefined) {
      updateRow.slot_time = updates.slotTime ?? updates.slot_time;
    }
    if (updates.ticketCategory !== undefined || updates.ticket_category !== undefined) {
      updateRow.ticket_category = updates.ticketCategory ?? updates.ticket_category;
    }
    if (updates.initialTicketCategory !== undefined || updates.initial_ticket_category !== undefined) {
      updateRow.initial_ticket_category = updates.initialTicketCategory ?? updates.initial_ticket_category;
    }

    // Telecom FTTH fields
    if (updates.installationType !== undefined || updates.installation_type !== undefined) {
      updateRow.installation_type = updates.installationType ?? updates.installation_type;
    }
    if (updates.serviceType !== undefined || updates.service_type !== undefined) {
      updateRow.service_type = updates.serviceType ?? updates.service_type;
    }
    if (updates.homepassType !== undefined || updates.homepass_type !== undefined) {
      updateRow.homepass_type = updates.homepassType ?? updates.homepass_type;
    }
    if (updates.homepassDetailId !== undefined || updates.homepass_detail_id !== undefined) {
      updateRow.homepass_detail_id = updates.homepassDetailId ?? updates.homepass_detail_id;
    }
    if (updates.oltCode !== undefined || updates.olt_code !== undefined) updateRow.olt_code = updates.oltCode ?? updates.olt_code;
    if (updates.fdtCode !== undefined || updates.fdt_code !== undefined) updateRow.fdt_code = updates.fdtCode ?? updates.fdt_code;
    if (updates.fatCode !== undefined || updates.fat_code !== undefined) updateRow.fat_code = updates.fatCode ?? updates.fat_code;
    if (updates.fatPort !== undefined || updates.fat_port !== undefined) updateRow.fat_port = updates.fatPort ?? updates.fat_port;
    if (updates.dropcoreLength !== undefined || updates.dropcore_length !== undefined) {
      updateRow.dropcore_length = updates.dropcoreLength ?? updates.dropcore_length;
    }
    if (updates.plan !== undefined) updateRow.plan = updates.plan;
    if (updates.serviceAgingMaintenance !== undefined || updates.service_aging_maintenance !== undefined) {
      updateRow.service_aging_maintenance = updates.serviceAgingMaintenance ?? updates.service_aging_maintenance;
    }
    if (updates.vendorName !== undefined || updates.vendor_name !== undefined) {
      updateRow.vendor_name = updates.vendorName ?? updates.vendor_name;
    }
    if (updates.router !== undefined) updateRow.router = updates.router;
    if (updates.ontBrand !== undefined || updates.ont_brand !== undefined) updateRow.ont_brand = updates.ontBrand ?? updates.ont_brand;
    if (updates.ontModel !== undefined || updates.ont_model !== undefined) updateRow.ont_model = updates.ontModel ?? updates.ont_model;
    if (updates.routerBrand !== undefined || updates.router_brand !== undefined) updateRow.router_brand = updates.routerBrand ?? updates.router_brand;
    if (updates.routerModel !== undefined || updates.router_model !== undefined) updateRow.router_model = updates.routerModel ?? updates.router_model;
    if (updates.routerSerialNumber !== undefined || updates.router_serial_number !== undefined) {
      updateRow.router_serial_number = updates.routerSerialNumber ?? updates.router_serial_number;
    }
    if (updates.stb1Sn !== undefined || updates.stb1_sn !== undefined) updateRow.stb1_sn = updates.stb1Sn ?? updates.stb1_sn;
    if (updates.stb1Mac !== undefined || updates.stb1_mac !== undefined) updateRow.stb1_mac = updates.stb1Mac ?? updates.stb1_mac;
    if (updates.stb2Sn !== undefined || updates.stb2_sn !== undefined) updateRow.stb2_sn = updates.stb2Sn ?? updates.stb2_sn;
    if (updates.stb2Mac !== undefined || updates.stb2_mac !== undefined) updateRow.stb2_mac = updates.stb2Mac ?? updates.stb2_mac;
    if (updates.stb3Sn !== undefined || updates.stb3_sn !== undefined) updateRow.stb3_sn = updates.stb3Sn ?? updates.stb3_sn;
    if (updates.stb3Mac !== undefined || updates.stb3_mac !== undefined) updateRow.stb3_mac = updates.stb3Mac ?? updates.stb3_mac;
    if (updates.ontSerialNumber !== undefined || updates.ont_serial_number !== undefined) {
      updateRow.ont_serial_number = updates.ontSerialNumber ?? updates.ont_serial_number;
    }
    if (updates.ontMacAddress !== undefined || updates.ont_mac_address !== undefined) {
      updateRow.ont_mac_address = updates.ontMacAddress ?? updates.ont_mac_address;
    }
    if (updates.rgSerialNumber !== undefined || updates.rg_serial_number !== undefined) {
      updateRow.rg_serial_number = updates.rgSerialNumber ?? updates.rg_serial_number;
    }
    if (updates.rgMacAddress !== undefined || updates.rg_mac_address !== undefined) {
      updateRow.rg_mac_address = updates.rgMacAddress ?? updates.rg_mac_address;
    }

    // Contractors & Technicians
    if (updates.contractorId !== undefined || updates.contractor_id !== undefined) {
      updateRow.contractor_id = updates.contractorId ?? updates.contractor_id;
    }
    if (updates.contractorName !== undefined || updates.contractor_name !== undefined) {
      updateRow.contractor_name = updates.contractorName ?? updates.contractor_name;
    }
    if (updates.contactorName !== undefined || updates.contactor_name !== undefined) {
      updateRow.contactor_name = updates.contactorName ?? updates.contactor_name;
    }
    if (updates.leaderName !== undefined || updates.leader_name !== undefined) {
      updateRow.leader_name = updates.leaderName ?? updates.leader_name;
    }
    if (updates.corlapName !== undefined || updates.corlap_name !== undefined) {
      updateRow.corlap_name = updates.corlapName ?? updates.corlap_name;
    }
    if (updates.corlapContact !== undefined || updates.corlap_contact !== undefined) {
      updateRow.corlap_contact = updates.corlapContact ?? updates.corlap_contact;
    }
    if (updates.installerName !== undefined || updates.installer_name !== undefined) {
      updateRow.installer_name = updates.installerName ?? updates.installer_name;
    }
    if (updates.installerContact !== undefined || updates.installer_contact !== undefined) {
      updateRow.installer_contact = updates.installerContact ?? updates.installer_contact;
    }
    if (updates.installerContact2 !== undefined || updates.installer_contact2 !== undefined) {
      updateRow.installer_contact2 = updates.installerContact2 ?? updates.installer_contact2;
    }
    if (updates.installerEmail !== undefined || updates.installer_email !== undefined) {
      updateRow.installer_email = updates.installerEmail ?? updates.installer_email;
    }
    if (updates.dateAssignAgent !== undefined || updates.date_assign_agent !== undefined) {
      updateRow.date_assign_agent = updates.dateAssignAgent ?? updates.date_assign_agent;
    }
    if (updates.dateAssignTechnician !== undefined || updates.date_assign_technician !== undefined) {
      updateRow.date_assign_technician = updates.dateAssignTechnician ?? updates.date_assign_technician;
    }
    if (updates.assignedAt !== undefined || updates.assigned_at !== undefined) {
      updateRow.assigned_at = updates.assignedAt ?? updates.assigned_at;
    }
    if (updates.assignedBy !== undefined || updates.assigned_by !== undefined) {
      updateRow.assigned_by = updates.assignedBy ?? updates.assigned_by;
    }
    if (updates.reassignedAt !== undefined || updates.reassigned_at !== undefined) {
      updateRow.reassigned_at = updates.reassignedAt ?? updates.reassigned_at;
    }
    if (updates.reassignedBy !== undefined || updates.reassigned_by !== undefined) {
      updateRow.reassigned_by = updates.reassignedBy ?? updates.reassigned_by;
    }
    if (updates.reassignmentReason !== undefined || updates.reassignment_reason !== undefined) {
      updateRow.reassignment_reason = updates.reassignmentReason ?? updates.reassignment_reason;
    }

    // Operational statuses (never altered automatically)
    if (updates.distributionStatus !== undefined || updates.distribution_status !== undefined) {
      updateRow.distribution_status = updates.distributionStatus ?? updates.distribution_status;
    }
    if (updates.distributionNotes !== undefined || updates.distribution_notes !== undefined) {
      updateRow.distribution_notes = updates.distributionNotes ?? updates.distribution_notes;
    }
    if (updates.statusWOAgent !== undefined || updates.statusWoAgent !== undefined || updates.status_wo_agent !== undefined) {
      updateRow.status_wo_agent = updates.statusWOAgent ?? updates.statusWoAgent ?? updates.status_wo_agent;
    }
    if (updates.statusWOInstaller !== undefined || updates.statusWoInstaller !== undefined || updates.status_wo_installer !== undefined) {
      updateRow.status_wo_installer = updates.statusWOInstaller ?? updates.statusWoInstaller ?? updates.status_wo_installer;
    }
    if (updates.statusWhatsApp !== undefined || updates.status_whatsapp !== undefined) {
      updateRow.status_whatsapp = updates.statusWhatsApp ?? updates.status_whatsapp;
    }
    if (updates.remarksWOInstaller !== undefined || updates.remarksWoInstaller !== undefined || updates.remarks_wo_installer !== undefined) {
      updateRow.remarks_wo_installer = updates.remarksWOInstaller ?? updates.remarksWoInstaller ?? updates.remarks_wo_installer;
    }
    if (updates.remarksAgent !== undefined || updates.remarks_agent !== undefined) {
      updateRow.remarks_agent = updates.remarksAgent ?? updates.remarks_agent;
    }
    if (updates.remarks !== undefined) updateRow.remarks = updates.remarks;

    // WhatsApp Tracking
    if (updates.waMessagePreview !== undefined || updates.wa_message_preview !== undefined) {
      updateRow.wa_message_preview = updates.waMessagePreview ?? updates.wa_message_preview;
    }
    if (updates.waGeneratedUrl !== undefined || updates.wa_generated_url !== undefined) {
      updateRow.wa_generated_url = updates.waGeneratedUrl ?? updates.wa_generated_url;
    }
    if (updates.waLastOpenedAt !== undefined || updates.wa_last_opened_at !== undefined) {
      updateRow.wa_last_opened_at = updates.waLastOpenedAt ?? updates.wa_last_opened_at;
    }
    if (updates.waConfirmedAt !== undefined || updates.wa_confirmed_at !== undefined) {
      updateRow.wa_confirmed_at = updates.waConfirmedAt ?? updates.wa_confirmed_at;
    }
    if (updates.waConfirmedBy !== undefined || updates.wa_confirmed_by !== undefined) {
      updateRow.wa_confirmed_by = updates.waConfirmedBy ?? updates.wa_confirmed_by;
    }
    if (updates.waConfirmationNotes !== undefined || updates.wa_confirmation_notes !== undefined) {
      updateRow.wa_confirmation_notes = updates.waConfirmationNotes ?? updates.wa_confirmation_notes;
    }

    // Chat stats, sessions, technical report
    if (updates.chatMessagesCount !== undefined || updates.chat_messages_count !== undefined) {
      updateRow.chat_messages_count = updates.chatMessagesCount ?? updates.chat_messages_count;
    }
    if (updates.lastMessageAt !== undefined || updates.last_message_at !== undefined) {
      updateRow.last_message_at = updates.lastMessageAt ?? updates.last_message_at;
    }
    if (updates.lastMessageSnippet !== undefined || updates.last_message_snippet !== undefined) {
      updateRow.last_message_snippet = updates.lastMessageSnippet ?? updates.last_message_snippet;
    }
    if (updates.checkInAt !== undefined || updates.check_in_at !== undefined) {
      updateRow.check_in_at = updates.checkInAt ?? updates.check_in_at;
    }
    if (updates.workSessionStatus !== undefined || updates.work_session_status !== undefined) {
      updateRow.work_session_status = updates.workSessionStatus ?? updates.work_session_status;
    }
    if (updates.workSessions !== undefined || updates.work_sessions !== undefined) {
      const ws = updates.workSessions ?? updates.work_sessions;
      updateRow.work_sessions = Array.isArray(ws) ? ws : existingRow.work_sessions;
    }
    if (updates.closedAt !== undefined || updates.closed_at !== undefined) {
      updateRow.closed_at = updates.closedAt ?? updates.closed_at;
    }
    if (updates.closedBy !== undefined || updates.closed_by !== undefined) {
      updateRow.closed_by = updates.closedBy ?? updates.closed_by;
    }
    if (updates.closeNotes !== undefined || updates.close_notes !== undefined) {
      updateRow.close_notes = updates.closeNotes ?? updates.close_notes;
    }
    if (updates.reopenReason !== undefined || updates.reopen_reason !== undefined) {
      updateRow.reopen_reason = updates.reopenReason ?? updates.reopen_reason;
    }
    if (updates.technicalReport !== undefined || updates.technical_report !== undefined) {
      updateRow.technical_report = updates.technicalReport ?? updates.technical_report;
    }

    // Soft delete & Archival
    if (updates.isArchived !== undefined || updates.is_archived !== undefined) {
      updateRow.is_archived = Boolean(updates.isArchived ?? updates.is_archived);
    }
    if (updates.archivedAt !== undefined || updates.archived_at !== undefined) {
      updateRow.archived_at = updates.archivedAt ?? updates.archived_at;
    }
    if (updates.archivedBy !== undefined || updates.archived_by !== undefined) {
      updateRow.archived_by = updates.archivedBy ?? updates.archived_by;
    }
    if (updates.isDeleted !== undefined || updates.is_deleted !== undefined) {
      updateRow.is_deleted = Boolean(updates.isDeleted ?? updates.is_deleted);
    }
    if (updates.deletedAt !== undefined || updates.deleted_at !== undefined) {
      updateRow.deleted_at = updates.deletedAt ?? updates.deleted_at;
    }
    if (updates.deletedBy !== undefined || updates.deleted_by !== undefined) {
      updateRow.deleted_by = updates.deletedBy ?? updates.deleted_by;
    }
    if (updates.deletionReason !== undefined || updates.deletion_reason !== undefined) {
      updateRow.deletion_reason = updates.deletionReason ?? updates.deletion_reason;
    }

    // Dynamic unmapped headers & additional fields (merged safely)
    if (updates.unmappedHeaders !== undefined || updates.unmapped_headers !== undefined) {
      const uh = updates.unmappedHeaders ?? updates.unmapped_headers;
      updateRow.unmapped_headers = Array.isArray(uh) ? uh : existingRow.unmapped_headers;
    }
    if (updates.additionalFields !== undefined || updates.additional_fields !== undefined) {
      const prevAf = existingRow.additional_fields && typeof existingRow.additional_fields === 'object'
        ? existingRow.additional_fields
        : {};
      const newAf = updates.additionalFields ?? updates.additional_fields;
      updateRow.additional_fields = {
        ...prevAf,
        ...(newAf && typeof newAf === 'object' ? newAf : {})
      };
    }
    if (updates.updatedBy !== undefined || updates.updated_by !== undefined) {
      updateRow.updated_by = updates.updatedBy ?? updates.updated_by;
    }

    // JSONB payload merging (safely retains untouched custom data)
    const prevPayload = existingRow.payload && typeof existingRow.payload === 'object'
      ? existingRow.payload
      : {};
    const mergedPayload = { ...prevPayload };

    if (updates.progressReports !== undefined) mergedPayload.progressReports = updates.progressReports;
    if (updates.reportStatusId !== undefined) mergedPayload.reportStatusId = updates.reportStatusId;
    if (updates.reportStatusLabel !== undefined) mergedPayload.reportStatusLabel = updates.reportStatusLabel;
    if (updates.reasonReportId !== undefined) mergedPayload.reasonReportId = updates.reasonReportId;
    if (updates.reasonReportLabel !== undefined) mergedPayload.reasonReportLabel = updates.reasonReportLabel;
    if (updates.rootcauseId !== undefined) mergedPayload.rootcauseId = updates.rootcauseId;
    if (updates.rootcauseLabel !== undefined) mergedPayload.rootcauseLabel = updates.rootcauseLabel;
    if (updates.workStartedAt !== undefined) mergedPayload.workStartedAt = updates.workStartedAt;
    if (updates.workStartedBy !== undefined) mergedPayload.workStartedBy = updates.workStartedBy;
    if (updates.workStartedById !== undefined) mergedPayload.workStartedById = updates.workStartedById;
    if (updates.approvalStatus !== undefined) mergedPayload.approvalStatus = updates.approvalStatus;
    if (updates.approvalNotes !== undefined) mergedPayload.approvalNotes = updates.approvalNotes;
    if (updates.approvedAt !== undefined) mergedPayload.approvedAt = updates.approvedAt;
    if (updates.approvedBy !== undefined) mergedPayload.approvedBy = updates.approvedBy;
    if (updates.approvedById !== undefined) mergedPayload.approvedById = updates.approvedById;
    if (updates.rejectedAt !== undefined) mergedPayload.rejectedAt = updates.rejectedAt;
    if (updates.rejectedBy !== undefined) mergedPayload.rejectedBy = updates.rejectedBy;
    if (updates.rejectedById !== undefined) mergedPayload.rejectedById = updates.rejectedById;
    if (updates.rejectionReason !== undefined) mergedPayload.rejectionReason = updates.rejectionReason;
    if (updates.checkOutAt !== undefined) mergedPayload.checkOutAt = updates.checkOutAt;
    if (updates.workDurationMinutes !== undefined) mergedPayload.workDurationMinutes = updates.workDurationMinutes;
    if (updates.workDurationFormatted !== undefined) mergedPayload.workDurationFormatted = updates.workDurationFormatted;
    if (updates.chatCategory !== undefined) mergedPayload.chatCategory = updates.chatCategory;
    if (updates.installerId !== undefined) mergedPayload.installerId = updates.installerId;
    if (updates.installerUid !== undefined) mergedPayload.installerUid = updates.installerUid;
    if (updates.assignedTo !== undefined) mergedPayload.assignedTo = updates.assignedTo;
    if (updates.assignedToUid !== undefined) mergedPayload.assignedToUid = updates.assignedToUid;
    if (updates.payload && typeof updates.payload === 'object') {
      Object.assign(mergedPayload, updates.payload);
    }

    updateRow.payload = mergedPayload;

    // 3. Execute partial update
    const { data, error } = await client
      .from('work_orders')
      .update(updateRow)
      .eq('id', cleanId)
      .select('*')
      .single();

    if (error) {
      const classified = classifySupabaseError(error);
      console.error('[Supabase DAL] updateWorkOrder error:', classified.message);
      return { success: false, error: classified };
    }

    return { success: true, data: postgresRowToTicket(data) };
  } catch (err: any) {
    const classified = classifySupabaseError(err);
    return { success: false, error: classified };
  }
}

/**
 * Soft deletes a Work Order in Supabase.
 * Checks ID availability, verifies record existence, returns updated ticket, retains audit trail.
 */
export async function deleteWorkOrderFromSupabase(
  id: string,
  reason?: string,
  deletedBy?: string
): Promise<SupabaseOpResult<any>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }

  if (!id || typeof id !== 'string' || !id.trim()) {
    return { success: false, error: { code: 'INVALID_ID', message: 'ID Work Order wajib diisi.' } };
  }

  const cleanId = id.trim();

  if (PROTECTED_PRODUCTION_WO_IDS.has(cleanId)) {
    return {
      success: false,
      error: {
        code: 'PROTECTED_RECORD',
        message: 'Tiga WO produksi yang telah di-soft-delete dilindungi secara mutlak dan dilarang diubah atau dihapus.'
      }
    };
  }

  try {
    const { data: existingCheck } = await client
      .from('work_orders')
      .select('id, wo_number')
      .eq('id', cleanId)
      .maybeSingle();

    if (existingCheck && (PROTECTED_PRODUCTION_WO_IDS.has(existingCheck.id) || PROTECTED_PRODUCTION_WO_IDS.has(existingCheck.wo_number))) {
      return {
        success: false,
        error: {
          code: 'PROTECTED_RECORD',
          message: 'Tiga WO produksi yang telah di-soft-delete dilindungi secara mutlak dan dilarang diubah atau dihapus.'
        }
      };
    }

    const { data, error } = await client
      .from('work_orders')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: deletedBy || 'System',
        deletion_reason: reason || 'Soft deleted via Management Data',
        updated_at: new Date().toISOString()
      })
      .eq('id', cleanId)
      .select('*');

    if (error) {
      const classified = classifySupabaseError(error);
      console.error('[Supabase DAL] deleteWorkOrder error:', classified.message);
      return { success: false, error: classified };
    }

    if (!data || data.length === 0) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', isNotFound: true, message: `Work Order dengan ID "${cleanId}" tidak ditemukan.` }
      };
    }

    return { success: true, data: postgresRowToTicket(data[0]) };
  } catch (err: any) {
    const classified = classifySupabaseError(err);
    return { success: false, error: classified };
  }
}

/**
 * Archives a Work Order in Supabase.
 * Checks ID availability, verifies record existence, returns updated ticket.
 */
export async function archiveWorkOrderInSupabase(id: string, archivedBy?: string): Promise<SupabaseOpResult<any>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }

  if (!id || typeof id !== 'string' || !id.trim()) {
    return { success: false, error: { code: 'INVALID_ID', message: 'ID Work Order wajib diisi.' } };
  }

  const cleanId = id.trim();

  if (PROTECTED_PRODUCTION_WO_IDS.has(cleanId)) {
    return {
      success: false,
      error: {
        code: 'PROTECTED_RECORD',
        message: 'Tiga WO produksi yang telah di-soft-delete dilindungi secara mutlak dan dilarang diubah atau dihapus.'
      }
    };
  }

  try {
    const { data: existingCheck } = await client
      .from('work_orders')
      .select('id, wo_number')
      .eq('id', cleanId)
      .maybeSingle();

    if (existingCheck && (PROTECTED_PRODUCTION_WO_IDS.has(existingCheck.id) || PROTECTED_PRODUCTION_WO_IDS.has(existingCheck.wo_number))) {
      return {
        success: false,
        error: {
          code: 'PROTECTED_RECORD',
          message: 'Tiga WO produksi yang telah di-soft-delete dilindungi secara mutlak dan dilarang diubah atau dihapus.'
        }
      };
    }

    const { data, error } = await client
      .from('work_orders')
      .update({
        is_archived: true,
        archived_at: new Date().toISOString(),
        archived_by: archivedBy || 'System',
        updated_at: new Date().toISOString()
      })
      .eq('id', cleanId)
      .select('*');

    if (error) {
      const classified = classifySupabaseError(error);
      return { success: false, error: classified };
    }

    if (!data || data.length === 0) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', isNotFound: true, message: `Work Order dengan ID "${cleanId}" tidak ditemukan.` }
      };
    }

    return { success: true, data: postgresRowToTicket(data[0]) };
  } catch (err: any) {
    const classified = classifySupabaseError(err);
    return { success: false, error: classified };
  }
}

/**
 * Restores an archived or soft-deleted Work Order in Supabase.
 * Checks ID availability, verifies record existence, returns restored ticket.
 */
export async function restoreWorkOrderInSupabase(id: string, restoredBy?: string): Promise<SupabaseOpResult<any>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }

  if (!id || typeof id !== 'string' || !id.trim()) {
    return { success: false, error: { code: 'INVALID_ID', message: 'ID Work Order wajib diisi.' } };
  }

  const cleanId = id.trim();

  if (PROTECTED_PRODUCTION_WO_IDS.has(cleanId)) {
    return {
      success: false,
      error: {
        code: 'PROTECTED_RECORD',
        message: 'Tiga WO produksi yang telah di-soft-delete dilindungi secara mutlak dan dilarang diubah atau dihapus.'
      }
    };
  }

  try {
    const { data: existingCheck } = await client
      .from('work_orders')
      .select('id, wo_number')
      .eq('id', cleanId)
      .maybeSingle();

    if (existingCheck && (PROTECTED_PRODUCTION_WO_IDS.has(existingCheck.id) || PROTECTED_PRODUCTION_WO_IDS.has(existingCheck.wo_number))) {
      return {
        success: false,
        error: {
          code: 'PROTECTED_RECORD',
          message: 'Tiga WO produksi yang telah di-soft-delete dilindungi secara mutlak dan dilarang diubah atau dihapus.'
        }
      };
    }

    const { data, error } = await client
      .from('work_orders')
      .update({
        is_deleted: false,
        deleted_at: null,
        deleted_by: null,
        deletion_reason: null,
        is_archived: false,
        archived_at: null,
        archived_by: null,
        updated_at: new Date().toISOString(),
        updated_by: restoredBy || 'System'
      })
      .eq('id', cleanId)
      .select('*');

    if (error) {
      const classified = classifySupabaseError(error);
      return { success: false, error: classified };
    }

    if (!data || data.length === 0) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', isNotFound: true, message: `Work Order dengan ID "${cleanId}" tidak ditemukan.` }
      };
    }

    return { success: true, data: postgresRowToTicket(data[0]) };
  } catch (err: any) {
    const classified = classifySupabaseError(err);
    return { success: false, error: classified };
  }
}

/**
 * Hard-deletes a sandbox Work Order strictly from public.work_orders table.
 * SAFETY RULE: Only records with wo_number starting with 'WO-SANDBOX-' can be deleted.
 * All production WO numbers are strictly rejected.
 */
export async function deleteSandboxWorkOrderHardFromSupabase(woNumber: string): Promise<SupabaseOpResult<boolean>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }

  const cleanWo = normalizeWoNumber(woNumber);
  if (!cleanWo || !cleanWo.toUpperCase().startsWith('WO-SANDBOX-')) {
    return {
      success: false,
      error: {
        code: 'SECURITY_VIOLATION',
        message: `Operasi hard-delete dilarang untuk nomor WO selain prefix sandbox (WO-SANDBOX-). Target: "${woNumber}"`
      }
    };
  }

  try {
    const { error } = await client
      .from('work_orders')
      .delete()
      .ilike('wo_number', cleanWo);

    if (error) {
      const classified = classifySupabaseError(error);
      return { success: false, error: classified };
    }

    return { success: true, data: true };
  } catch (err: any) {
    const classified = classifySupabaseError(err);
    return { success: false, error: classified };
  }
}

/**
 * Hardened Bulk Import of Work Orders to Supabase.
 * - WO Number is strictly mandatory; empty numbers are rejected and logged.
 * - Consistently normalizes WO numbers across all channels.
 * - Reports in-file duplicates and existing Supabase duplicates separately.
 * - Relies on the database unique constraint as the primary protection against duplicates.
 * - Handles PostgreSQL error 23505 as duplicate conflict.
 * - Never overwrites or mutates existing Work Orders.
 * - Returns accurate breakdown: totalSubmitted, imported, skippedDuplicates, invalidCount, failedCount.
 * - Ensures failed batches are never reported as successful.
 */
export async function bulkImportWorkOrdersToSupabase(
  tickets: any[],
  batchId?: string,
  importedBy?: string
): Promise<SupabaseOpResult<BulkImportResult>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }

  const result: BulkImportResult = {
    totalSubmitted: Array.isArray(tickets) ? tickets.length : 0,
    imported: 0,
    skippedDuplicates: 0,
    invalidCount: 0,
    failedCount: 0,
    duplicateInFileWoNumbers: [],
    duplicateExistingWoNumbers: [],
    invalidRows: [],
    failedErrors: []
  };

  if (!Array.isArray(tickets) || tickets.length === 0) {
    return { success: true, data: result };
  }

  try {
    // 1. Validate each ticket and detect duplicates within incoming file
    const validBatchMap = new Map<string, any>();

    tickets.forEach((t, index) => {
      if (!t || typeof t !== 'object') {
        result.invalidCount++;
        result.invalidRows.push({ index: index + 1, reason: 'Baris data kosong atau bukan objek.' });
        return;
      }

      const rawWo = t.woNumber || t.workOrderNumber || t.wo_number || '';
      const normWo = normalizeWoNumber(rawWo);
      const canonicalKey = canonicalWoKey(rawWo);

      if (!normWo || normWo.length < 3) {
        result.invalidCount++;
        result.invalidRows.push({
          index: index + 1,
          reason: 'Nomor WO kosong atau tidak memenuhi panjang minimum 3 karakter.',
          rawWo: String(rawWo)
        });
        return;
      }

      if (validBatchMap.has(canonicalKey)) {
        result.skippedDuplicates++;
        result.duplicateInFileWoNumbers.push(normWo);
        return;
      }

      validBatchMap.set(canonicalKey, { ...t, canonicalKey, normWo });
    });

    const uniqueCandidates = Array.from(validBatchMap.values());
    if (uniqueCandidates.length === 0) {
      return { success: result.failedCount === 0, data: result };
    }

    // 2. Query Supabase for existing WO numbers in chunks of 200
    // Gather both exact strings and normalized candidates
    const existingInDbCanonicalSet = new Set<string>();
    const checkChunkSize = 200;

    for (let i = 0; i < uniqueCandidates.length; i += checkChunkSize) {
      const slice = uniqueCandidates.slice(i, i + checkChunkSize);
      const sliceWoList = slice.map(c => c.normWo);

      const { data: existingRows, error: searchError } = await client
        .from('work_orders')
        .select('wo_number')
        .in('wo_number', sliceWoList);

      if (searchError) {
        const classified = classifySupabaseError(searchError);
        console.error('[Supabase DAL] bulkImport duplicate check query failed:', classified.message);
        return { success: false, error: classified };
      }

      (existingRows || []).forEach(r => {
        const key = canonicalWoKey(r.wo_number);
        if (key) existingInDbCanonicalSet.add(key);
      });
    }

    // 3. Separate candidate rows: skip those already in DB, prepare fresh rows
    const rowsToInsert: Record<string, any>[] = [];

    for (const candidate of uniqueCandidates) {
      if (existingInDbCanonicalSet.has(candidate.canonicalKey)) {
        result.skippedDuplicates++;
        result.duplicateExistingWoNumbers.push(candidate.normWo);
      } else {
        const row = ticketToPostgresRow({
          ...candidate,
          woNumber: candidate.normWo,
          workOrderNumber: candidate.normWo,
          importBatchId: batchId || `batch_${Date.now()}`,
          importedAt: new Date().toISOString(),
          updatedBy: importedBy || 'Import'
        });
        rowsToInsert.push(row);
      }
    }

    // 4. Primary Defense: Insert fresh rows in chunks of 50
    // If PostgreSQL 23505 (unique constraint violation) occurs:
    // Isolate the duplicate rows, mark them as duplicate conflicts, and do not fail the entire batch.
    const insertChunkSize = 50;

    for (let i = 0; i < rowsToInsert.length; i += insertChunkSize) {
      const chunk = rowsToInsert.slice(i, i + insertChunkSize);
      const { error: insertError } = await client.from('work_orders').insert(chunk);

      if (insertError) {
        const classified = classifySupabaseError(insertError);

        if (classified.isDuplicate || classified.code === '23505') {
          // Race-condition duplicate or unindexed legacy spacing duplicate:
          // Fall back to row-by-row insertion to salvage non-duplicate records in this chunk
          for (const singleRow of chunk) {
            const { error: singleErr } = await client.from('work_orders').insert([singleRow]);
            if (singleErr) {
              const singleClassified = classifySupabaseError(singleErr);
              if (singleClassified.isDuplicate || singleClassified.code === '23505') {
                result.skippedDuplicates++;
                result.duplicateExistingWoNumbers.push(singleRow.wo_number);
              } else {
                result.failedCount++;
                result.failedErrors.push(`Gagal mengimpor WO ${singleRow.wo_number}: ${singleClassified.message}`);
              }
            } else {
              result.imported++;
            }
          }
        } else {
          result.failedCount += chunk.length;
          result.failedErrors.push(`Gagal mengimpor chunk ${i} - ${i + chunk.length}: ${classified.message}`);
        }
      } else {
        result.imported += chunk.length;
      }
    }

    const hasFailed = result.failedCount > 0 || result.failedErrors.length > 0;
    return {
      success: !hasFailed,
      data: result
    };
  } catch (err: any) {
    const classified = classifySupabaseError(err);
    return { success: false, error: classified };
  }
}


// ------------------------------------------------------------------------------
// DATA ACCESS LAYER: CONTRACTORS
// ------------------------------------------------------------------------------

export async function getContractorsFromSupabase(includeArchived = false): Promise<SupabaseOpResult<any[]>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }
  try {
    let q = client.from('contractors').select('*');
    if (!includeArchived) {
      q = q.eq('is_archived', false).eq('active', true);
    }
    const { data, error } = await q.order('name', { ascending: true });
    if (error) {
      return { success: false, error: classifySupabaseError(error) };
    }
    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, error: classifySupabaseError(err) };
  }
}

export async function getContractorByIdFromSupabase(id: string): Promise<SupabaseOpResult<any | null>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }
  try {
    const { data, error } = await client.from('contractors').select('*').eq('id', id).maybeSingle();
    if (error) {
      return { success: false, error: classifySupabaseError(error) };
    }
    return { success: true, data: data || null };
  } catch (err: any) {
    return { success: false, error: classifySupabaseError(err) };
  }
}

export async function insertContractorToSupabase(contractor: any): Promise<SupabaseOpResult<any>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }
  try {
    const row = {
      id: contractor.id || `contractor_${Date.now()}`,
      name: contractor.name,
      code: contractor.code || null,
      coverage_areas: Array.isArray(contractor.coverageAreas) ? contractor.coverageAreas : [],
      leader_id: contractor.leaderId || null,
      leader_name: contractor.leaderName || null,
      phone: contractor.phone || null,
      email: contractor.email || null,
      active: contractor.active !== false,
      is_archived: Boolean(contractor.isArchived),
      archived_at: contractor.archivedAt || null,
      payload: contractor.payload && typeof contractor.payload === 'object' ? contractor.payload : {},
      created_at: contractor.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const { data, error } = await client.from('contractors').insert([row]).select().maybeSingle();
    if (error) {
      return { success: false, error: classifySupabaseError(error) };
    }
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: classifySupabaseError(err) };
  }
}

export async function updateContractorInSupabase(id: string, updates: any): Promise<SupabaseOpResult<any>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }
  try {
    const updateRow: Record<string, any> = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) updateRow.name = updates.name;
    if (updates.code !== undefined) updateRow.code = updates.code;
    if (updates.coverageAreas !== undefined) updateRow.coverage_areas = updates.coverageAreas;
    if (updates.leaderId !== undefined) updateRow.leader_id = updates.leaderId;
    if (updates.leaderName !== undefined) updateRow.leader_name = updates.leaderName;
    if (updates.phone !== undefined) updateRow.phone = updates.phone;
    if (updates.email !== undefined) updateRow.email = updates.email;
    if (updates.active !== undefined) updateRow.active = updates.active;
    if (updates.isArchived !== undefined) updateRow.is_archived = updates.isArchived;
    if (updates.archivedAt !== undefined) updateRow.archived_at = updates.archivedAt;

    const { data, error } = await client.from('contractors').update(updateRow).eq('id', id).select().maybeSingle();
    if (error) {
      return { success: false, error: classifySupabaseError(error) };
    }
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: classifySupabaseError(err) };
  }
}

// ------------------------------------------------------------------------------
// DATA ACCESS LAYER: COVERAGE AREAS
// ------------------------------------------------------------------------------

export async function getCoverageAreasFromSupabase(onlyActive = true): Promise<SupabaseOpResult<any[]>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }
  try {
    let q = client.from('coverage_areas').select('*');
    if (onlyActive) q = q.eq('active', true);
    const { data, error } = await q.order('name', { ascending: true });
    if (error) {
      return { success: false, error: classifySupabaseError(error) };
    }
    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, error: classifySupabaseError(err) };
  }
}

export async function insertCoverageAreaToSupabase(area: any): Promise<SupabaseOpResult<any>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }
  try {
    const row = {
      id: area.id || `area_${Date.now()}`,
      name: area.name,
      clusters: Array.isArray(area.clusters) ? area.clusters : [],
      active: area.active !== false,
      payload: area.payload && typeof area.payload === 'object' ? area.payload : {},
      created_at: area.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const { data, error } = await client.from('coverage_areas').insert([row]).select().maybeSingle();
    if (error) {
      return { success: false, error: classifySupabaseError(error) };
    }
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: classifySupabaseError(err) };
  }
}

// ------------------------------------------------------------------------------
// DATA ACCESS LAYER: TICKET LIVE-CHAT MESSAGES
// ------------------------------------------------------------------------------

export async function getTicketMessagesFromSupabase(ticketIdOrWo: string): Promise<SupabaseOpResult<any[]>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }
  try {
    const { data, error } = await client
      .from('ticket_messages')
      .select('*')
      .or(`ticket_id.eq.${ticketIdOrWo},wo_number.eq.${ticketIdOrWo}`)
      .order('created_at', { ascending: true });
    if (error) {
      return { success: false, error: classifySupabaseError(error) };
    }
    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, error: classifySupabaseError(err) };
  }
}

export async function insertTicketMessageToSupabase(message: {
  id?: string;
  ticketId?: string;
  woNumber?: string;
  senderId?: string;
  senderName: string;
  senderRole: string;
  messageText: string;
  attachments?: any[];
  payload?: any;
}): Promise<SupabaseOpResult<any>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }
  try {
    const row = {
      id: message.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      ticket_id: message.ticketId || null,
      wo_number: message.woNumber || null,
      sender_id: message.senderId || null,
      sender_name: message.senderName,
      sender_role: message.senderRole,
      message_text: message.messageText || '',
      attachments: Array.isArray(message.attachments) ? message.attachments : [],
      payload: message.payload && typeof message.payload === 'object' ? message.payload : {},
      created_at: new Date().toISOString()
    };
    const { data, error } = await client.from('ticket_messages').insert([row]).select().maybeSingle();
    if (error) {
      return { success: false, error: classifySupabaseError(error) };
    }
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: classifySupabaseError(err) };
  }
}

// ------------------------------------------------------------------------------
// DATA ACCESS LAYER: WHATSAPP TEMPLATES
// ------------------------------------------------------------------------------

export async function getWaTemplatesFromSupabase(): Promise<SupabaseOpResult<any[]>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }
  try {
    const { data, error } = await client.from('wa_templates').select('*').order('name', { ascending: true });
    if (error) {
      return { success: false, error: classifySupabaseError(error) };
    }
    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, error: classifySupabaseError(err) };
  }
}

export async function insertWaTemplateToSupabase(template: any): Promise<SupabaseOpResult<any>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }
  try {
    const row = {
      id: template.id || `template_${Date.now()}`,
      name: template.name,
      category: template.category || null,
      body: template.body || '',
      active: template.active !== false,
      created_by: template.createdBy || null,
      updated_by: template.updatedBy || null,
      payload: template.payload && typeof template.payload === 'object' ? template.payload : {},
      created_at: template.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const { data, error } = await client.from('wa_templates').insert([row]).select().maybeSingle();
    if (error) {
      return { success: false, error: classifySupabaseError(error) };
    }
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: classifySupabaseError(err) };
  }
}

// ------------------------------------------------------------------------------
// DATA ACCESS LAYER: APPLICATION SETTINGS
// ------------------------------------------------------------------------------


/**
 * Gets application setting from public.app_settings.
 */
export async function getAppSettingFromSupabase(key: string): Promise<SupabaseOpResult<any>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }

  if (!key || typeof key !== 'string' || !key.trim()) {
    return { success: false, error: { code: 'INVALID_KEY', message: 'Kunci setting wajib diisi.' } };
  }

  try {
    const { data, error } = await client
      .from('app_settings')
      .select('*')
      .eq('setting_key', key.trim())
      .maybeSingle();

    if (error) {
      const classified = classifySupabaseError(error);
      return { success: false, error: classified };
    }

    return { success: true, data: data ? data.setting_value : null };
  } catch (err: any) {
    const classified = classifySupabaseError(err);
    return { success: false, error: classified };
  }
}

/**
 * Upserts application setting in public.app_settings.
 */
export async function saveAppSettingToSupabase(
  key: string,
  value: any,
  description?: string,
  updatedBy?: string
): Promise<SupabaseOpResult<boolean>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }

  if (!key || typeof key !== 'string' || !key.trim()) {
    return { success: false, error: { code: 'INVALID_KEY', message: 'Kunci setting wajib diisi.' } };
  }

  try {
    const payload = {
      setting_key: key.trim(),
      setting_value: value && typeof value === 'object' ? value : { value },
      description: description || null,
      updated_by: updatedBy || 'System',
      updated_at: new Date().toISOString()
    };

    const { error } = await client
      .from('app_settings')
      .upsert(payload, { onConflict: 'setting_key' });

    if (error) {
      const classified = classifySupabaseError(error);
      console.error('[Supabase DAL] saveAppSetting error:', classified.message);
      return { success: false, error: classified };
    }

    return { success: true, data: true };
  } catch (err: any) {
    const classified = classifySupabaseError(err);
    return { success: false, error: classified };
  }
}

// ------------------------------------------------------------------------------
// DATA ACCESS LAYER: USER PREFERENCES
// ------------------------------------------------------------------------------

/**
 * Gets user preferences from public.user_preferences.
 */
export async function getUserPreferencesFromSupabase(userId: string): Promise<SupabaseOpResult<any>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }

  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return { success: false, error: { code: 'INVALID_ID', message: 'User ID wajib diisi.' } };
  }

  try {
    const { data, error } = await client
      .from('user_preferences')
      .select('preferences')
      .eq('user_id', userId.trim())
      .maybeSingle();

    if (error) {
      const classified = classifySupabaseError(error);
      return { success: false, error: classified };
    }

    return { success: true, data: data ? data.preferences : null };
  } catch (err: any) {
    const classified = classifySupabaseError(err);
    return { success: false, error: classified };
  }
}

/**
 * Upserts user preferences in public.user_preferences.
 */
export async function saveUserPreferencesToSupabase(
  userId: string,
  preferences: any
): Promise<SupabaseOpResult<boolean>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }

  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return { success: false, error: { code: 'INVALID_ID', message: 'User ID wajib diisi.' } };
  }

  try {
    const payload = {
      user_id: userId.trim(),
      preferences: preferences && typeof preferences === 'object' ? preferences : {},
      updated_at: new Date().toISOString()
    };

    const { error } = await client
      .from('user_preferences')
      .upsert(payload, { onConflict: 'user_id' });

    if (error) {
      const classified = classifySupabaseError(error);
      console.error('[Supabase DAL] saveUserPreferences error:', classified.message);
      return { success: false, error: classified };
    }

    return { success: true, data: true };
  } catch (err: any) {
    const classified = classifySupabaseError(err);
    return { success: false, error: classified };
  }
}

// ------------------------------------------------------------------------------
// DATA ACCESS LAYER: AUDIT LOGS
// ------------------------------------------------------------------------------

/**
 * Fetches audit logs from public.audit_logs (append-only table).
 */
export async function getAuditLogsFromSupabase(limit = 100): Promise<SupabaseOpResult<any[]>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }

  try {
    const { data, error } = await client
      .from('audit_logs')
      .select('*')
      .order('event_at', { ascending: false })
      .limit(limit);

    if (error) {
      const classified = classifySupabaseError(error);
      return { success: false, error: classified };
    }

    return { success: true, data: data || [] };
  } catch (err: any) {
    const classified = classifySupabaseError(err);
    return { success: false, error: classified };
  }
}

/**
 * Inserts an append-only audit log entry in Supabase.
 * Respects PostgreSQL trigger trg_audit_logs_immutable (only INSERT allowed).
 */
function sanitizeAuditPayload(data: any): any {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitizeAuditPayload);
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    const lk = k.toLowerCase();
    if (
      lk.includes('password') ||
      lk.includes('secret') ||
      lk.includes('token') ||
      lk.includes('apikey') ||
      lk.includes('servicerole') ||
      lk.includes('authorization') ||
      lk.includes('credential')
    ) {
      clean[k] = '[REDACTED_SENSITIVE_DATA]';
    } else if (v && typeof v === 'object') {
      clean[k] = sanitizeAuditPayload(v);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

export async function insertAuditLogToSupabase(log: {
  id?: string;
  action: string;
  entity: string;
  entity_id: string;
  details: string;
  performed_by: string;
  user_role: string;
  performed_by_id?: string;
  previous_state?: any;
  new_state?: any;
  ip_address?: string;
  user_agent?: string;
  metadata?: any;
}): Promise<boolean> {
  const client = getSupabaseBackendClient();
  if (!client) return false;

  try {
    const sanitizedDetails = typeof log.details === 'string'
      ? log.details.replace(/password[:=]\s*\S+/gi, 'password:[REDACTED]')
      : String(log.details || '');

    const entry = {
      id: log.id || `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      action: log.action,
      entity: log.entity,
      entity_id: log.entity_id,
      details: sanitizedDetails,
      performed_by: log.performed_by || 'System',
      user_role: log.user_role || 'system',
      performed_by_id: log.performed_by_id || null,
      previous_state: sanitizeAuditPayload(log.previous_state) || null,
      new_state: sanitizeAuditPayload(log.new_state) || null,
      ip_address: log.ip_address || null,
      user_agent: log.user_agent || null,
      metadata: sanitizeAuditPayload(log.metadata) || {},
      event_at: new Date().toISOString()
    };

    const { error } = await client.from('audit_logs').insert([entry]);
    if (error) {
      console.error('[Supabase DAL] insertAuditLog error:', error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error('[Supabase DAL] insertAuditLog exception:', err?.message || err);
    return false;
  }
}

/**
 * Recursively sanitizes metadata or payload objects to scrub sensitive keys
 * such as passwords, tokens, API keys, secrets, or authorization headers.
 */
export function sanitizeSensitiveData(data: any, depth = 0): any {
  if (data === null || data === undefined) return data;
  if (depth > 6) return '[Max Depth Reached]';

  if (typeof data === 'string') {
    if (/^bearer\s+[A-Za-z0-9\-._~+/]+=*/i.test(data)) {
      return 'Bearer [REDACTED]';
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeSensitiveData(item, depth + 1));
  }

  if (typeof data === 'object') {
    const sensitivePattern = /password|secret|token|auth|bearer|cookie|private_?key|service_?role|anon_?key|api_?key/i;
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(data)) {
      if (sensitivePattern.test(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeSensitiveData(value, depth + 1);
      }
    }
    return sanitized;
  }

  return data;
}

/**
 * Input interface for system error logs.
 * Supports physical schema columns (source, endpoint, metadata, is_resolved)
 * while maintaining 100% backward compatibility with legacy fields (module, operation, payload, status).
 */
export interface SystemErrorLogInput {
  id?: string;
  error_code: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string;
  message: string;
  stack_trace?: string | null;
  // Module & Source mapping
  source?: string;
  module?: string;
  // Endpoint & Operation mapping
  endpoint?: string | null;
  operation?: string | null;
  http_method?: string | null;
  // User identity
  user_id?: string | null;
  username?: string | null;
  user_role?: string | null;
  // Request context
  request_id?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  // Resolution status
  is_resolved?: boolean;
  status?: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | string;
  resolved_at?: string | null;
  resolved_by?: string | null;
  // Metadata & payload
  metadata?: Record<string, any>;
  payload?: Record<string, any>;
  technical_details?: string | null;
  firebase_error_code?: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * System error log handler aligned with public.system_error_logs table.
 * - Maps module -> source
 * - Maps operation -> endpoint (if operation is an endpoint/URL) or preserves in metadata
 * - Maps payload + technical_details -> metadata
 * - Maps status -> is_resolved (boolean)
 * - Sanitizes sensitive credentials
 * - Never throws unhandled exceptions to disrupt main application flow
 */
export async function insertSystemErrorLogToSupabase(errorLog: SystemErrorLogInput): Promise<boolean> {
  const client = getSupabaseBackendClient();
  if (!client) {
    console.warn('[Supabase DAL] insertSystemErrorLog skipped: Supabase backend client is unavailable.');
    return false;
  }

  try {
    // 1. Determine endpoint, http_method, and operation
    let determinedEndpoint: string | null = null;
    let determinedHttpMethod: string | null = errorLog.http_method ? errorLog.http_method.toUpperCase() : null;
    let operationPreservedInMetadata: string | null = null;

    if (errorLog.endpoint) {
      determinedEndpoint = errorLog.endpoint;
    } else if (errorLog.operation) {
      const op = errorLog.operation.trim();
      const methodMatch = op.match(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(\S+)/i);
      if (methodMatch) {
        if (!determinedHttpMethod) {
          determinedHttpMethod = methodMatch[1].toUpperCase();
        }
        determinedEndpoint = methodMatch[2];
      } else if (op.startsWith('/') || op.startsWith('http://') || op.startsWith('https://')) {
        determinedEndpoint = op;
      } else {
        // Operation is a function or workflow name (e.g. "SYNC_BATCH", "fetchWorkOrders")
        operationPreservedInMetadata = op;
      }
    }

    // 2. Determine resolution status (boolean)
    let resolved = false;
    if (typeof errorLog.is_resolved === 'boolean') {
      resolved = errorLog.is_resolved;
    } else if (errorLog.status) {
      resolved = String(errorLog.status).trim().toUpperCase() === 'RESOLVED';
    }

    // 3. Assemble and sanitize metadata
    const combinedMetadata: Record<string, any> = {
      ...(errorLog.metadata || {}),
      ...(errorLog.payload || {})
    };

    if (errorLog.technical_details && !combinedMetadata.technical_details) {
      combinedMetadata.technical_details = errorLog.technical_details;
    }
    if (errorLog.firebase_error_code && !combinedMetadata.firebase_error_code) {
      combinedMetadata.firebase_error_code = errorLog.firebase_error_code;
    }
    if (operationPreservedInMetadata && !combinedMetadata.operation) {
      combinedMetadata.operation = operationPreservedInMetadata;
    }
    if (errorLog.status && combinedMetadata.legacy_status === undefined) {
      combinedMetadata.legacy_status = errorLog.status;
    }

    const sanitizedMetadata = sanitizeSensitiveData(combinedMetadata);

    // 4. Assemble physical row matching public.system_error_logs schema
    const row = {
      id: errorLog.id || `err_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      error_code: errorLog.error_code || 'UNKNOWN_ERROR',
      severity: (errorLog.severity || 'HIGH').toUpperCase(),
      message: errorLog.message || 'No error message provided',
      stack_trace: errorLog.stack_trace || null,
      source: errorLog.source || errorLog.module || 'system',
      endpoint: determinedEndpoint,
      http_method: determinedHttpMethod,
      user_id: errorLog.user_id || null,
      username: errorLog.username || null,
      user_role: errorLog.user_role || null,
      request_id: errorLog.request_id || null,
      ip_address: errorLog.ip_address || null,
      user_agent: errorLog.user_agent || null,
      metadata: sanitizedMetadata,
      is_resolved: resolved,
      resolved_at: errorLog.resolved_at || (resolved ? new Date().toISOString() : null),
      resolved_by: errorLog.resolved_by || null,
      created_at: errorLog.created_at || new Date().toISOString(),
      updated_at: errorLog.updated_at || new Date().toISOString()
    };

    // 5. Execute direct insert into system_error_logs
    const { error } = await client.from('system_error_logs').insert([row]);
    if (error) {
      console.error('[Supabase DAL] insertSystemErrorLog error:', error.message, error.details || '');
      return false;
    }

    return true;
  } catch (err: any) {
    console.error('[Supabase DAL] insertSystemErrorLog exception caught safely:', err?.message || err);
    return false;
  }
}

/**
 * Retrieves a system error log by ID from Supabase.
 * Useful for verification, testing, and error inspection.
 */
export async function getSystemErrorLogByIdFromSupabase(id: string): Promise<any | null> {
  const client = getSupabaseBackendClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('system_error_logs')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[Supabase DAL] getSystemErrorLogById error:', error.message);
      return null;
    }
    return data;
  } catch (err: any) {
    console.error('[Supabase DAL] getSystemErrorLogById exception:', err?.message || err);
    return null;
  }
}

/**
 * Deletes a system error log by ID from Supabase.
 * Useful for automated cleanup of test/sandbox error records.
 */
export async function deleteSystemErrorLogFromSupabase(id: string): Promise<boolean> {
  const client = getSupabaseBackendClient();
  if (!client) return false;

  try {
    const { error } = await client
      .from('system_error_logs')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Supabase DAL] deleteSystemErrorLog error:', error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error('[Supabase DAL] deleteSystemErrorLog exception:', err?.message || err);
    return false;
  }
}

/**
 * Inserts user session metadata into public.user_sessions in Supabase.
 * Strictly persists token_fingerprint (SHA-256 hash), never the raw plaintext bearer token.
 */
export async function insertUserSessionToSupabase(session: {
  sessionId: string;
  userId: string;
  username: string;
  name: string;
  role: string;
  contractor?: string;
  loginAt: string;
  lastActivityAt: string;
  expiresAt: string;
  status: 'active' | 'expired' | 'revoked';
  ipAddress?: string;
  userAgent?: string;
  deviceType?: string;
  tokenFingerprint?: string;
}): Promise<boolean> {
  const client = getSupabaseBackendClient();
  if (!client) return false;

  try {
    const row = {
      id: `us_${session.sessionId}`,
      session_id: session.sessionId,
      user_id: session.userId,
      username: session.username,
      name: session.name,
      role: session.role,
      contractor: session.contractor || null,
      login_at: session.loginAt,
      last_activity_at: session.lastActivityAt,
      expires_at: session.expiresAt,
      status: session.status || 'active',
      ip_address: session.ipAddress && session.ipAddress !== '127.0.0.1' && !session.ipAddress.includes(':') ? session.ipAddress : null,
      user_agent: session.userAgent || null,
      device_type: session.deviceType || 'unknown',
      token_fingerprint: session.tokenFingerprint || null,
      payload: {
        raw_ip: session.ipAddress || null,
        created_via: 'express_backend_session_dual_standby'
      }
    };

    const { error } = await client.from('user_sessions').upsert([row], { onConflict: 'session_id' });
    if (error) {
      // Foreign key or table warning logged without breaking session creation
      console.warn('[Supabase DAL] insertUserSession warning:', error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn('[Supabase DAL] insertUserSession exception:', err?.message || err);
    return false;
  }
}

/**
 * Revokes a user session in public.user_sessions table.
 */
export async function revokeUserSessionInSupabase(sessionId: string): Promise<boolean> {
  const client = getSupabaseBackendClient();
  if (!client) return false;

  try {
    const { error } = await client
      .from('user_sessions')
      .update({ status: 'revoked', last_activity_at: new Date().toISOString() })
      .eq('session_id', sessionId);

    if (error) {
      console.warn('[Supabase DAL] revokeUserSession warning:', error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn('[Supabase DAL] revokeUserSession exception:', err?.message || err);
    return false;
  }
}

/**
 * Retrieves user sessions from public.user_sessions table.
 */
export async function getUserSessionsFromSupabase(userId?: string): Promise<SupabaseOpResult<any[]>> {
  const client = getSupabaseBackendClient();
  if (!client) {
    return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Supabase client belum dikonfigurasi.' } };
  }

  try {
    let query = client.from('user_sessions').select('*').order('login_at', { ascending: false }).limit(50);
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;
    if (error) {
      return { success: false, error: classifySupabaseError(error) };
    }
    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, error: classifySupabaseError(err) };
  }
}


