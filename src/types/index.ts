export type UserRole = 'super_admin' | 'dispatch' | 'leader' | 'installer' | 'management_data' | 'it_support';

export interface User {
  id: string;
  userId?: string;
  name: string;
  username: string;
  email?: string;
  phone?: string;
  role: UserRole;
  contractor?: string;
  contractorId?: string;
  area?: string;
  clusterName?: string;
  active: boolean;
  passwordHash?: string;
  permissions?: string[];
  mustChangePassword?: boolean;
  lastLoginAt?: string;
  loginCount?: number;
  isArchived?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deletionReason?: string;
  createdAt?: string;
}

export interface ContactConversation {
  id: string;
  woNumber: string;
  ticketId: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  area?: string;
  contractor?: string;
  channelType: 'dispatch_leader' | 'leader_installer' | 'general';
  lastMessageSnippet?: string;
  lastMessageAt: string;
  unreadCount: number;
  participants: string[];
  createdAt: string;
}

export interface BasecampLocation {
  id: string;
  contractorId: string;
  contractorName: string;
  name: string;
  area: string;
  address: string;
  latitude?: number;
  longitude?: number;
  phone: string;
  leaderName: string;
  installerCount: number;
  active: boolean;
}

export interface DroplistItem {
  id: string;
  category: 'status_agent' | 'status_installer' | 'ticket_category' | 'slot_time' | 'installation_type' | 'service_type' | 'root_cause';
  label: string;
  value: string;
  order: number;
  active: boolean;
}

export interface Contractor {
  id: string;
  name: string;
  code: string;
  coverageAreas: string[];
  leaderId?: string;
  leaderName?: string;
  phone?: string;
  email?: string;
  active: boolean;
  createdAt: string;
}

export interface CoverageArea {
  id: string;
  name: string;
  clusters: string[];
  active: boolean;
}

export interface RootCauseCategory {
  id: string;
  name: string;
  description?: string;
  items: string[];
}

export interface TechnicalReport {
  id: string;
  ticketId: string;
  mainCategory: string;
  rootCause: string;
  subCategory?: string;
  workResult: string;
  technicalDescription: string;
  correctiveAction: string;
  usedMaterials?: string;
  deviceSerialNumber?: string;
  opticalPowerDbm?: string;
  opticalPowerRx?: string;
  rootCauseCategory?: string;
  rootCauseSubCategory?: string;
  photos?: string[];
  startTime?: string;
  endTime?: string;
  photoBeforeUrl?: string;
  photoAfterUrl?: string;
  additionalNotes?: string;
  verifiedByDispatch?: boolean;
  verifiedAt?: string;
  verifiedBy?: string;
  submittedBy: string;
  submittedAt: string;
  updatedAt?: string;
}

export interface ProgressReportEntry {
  id: string;
  ticketId: string;
  timestamp: string;
  submittedBy: string;
  userRole?: string;
  reportStatus: string;
  reasonReport: string;
  rootCause: string;
  remarksReport: string;
  installerName?: string;
  appointmentDate?: string;
  slotTime?: string;
}

export interface ChatAttachment {
  id: string;
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  woNumber: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  text: string;
  category?: string;
  attachments: ChatAttachment[];
  timestamp: string;
  readBy?: string[];
}

export type WhatsAppConfirmationStatus =
  | 'not_prepared'
  | 'ready'
  | 'opened_in_whatsapp'
  | 'awaiting_confirmation'
  | 'confirmed'
  | 'reschedule_requested'
  | 'unreachable'
  | 'invalid_number'
  | 'cancelled';

export type TicketStatusWOAgent =
  | 'Pending'
  | 'Assigned'
  | 'In Progress'
  | 'Resolved'
  | 'Cancelled'
  | 'Closed';

export type TicketStatusWOInstaller =
  | 'Unassigned'
  | 'Assigned'
  | 'En Route'
  | 'On Site'
  | 'Installed'
  | 'Pending Technical'
  | 'Failed / Cancelled'
  | 'Completed';

export type WODistributionStatus =
  | 'distributed'
  | 'unmapped_contractor'
  | 'coverage_mismatch'
  | 'schedule_not_available'
  | 'unmatched_installer'
  | 'pending';

export interface Ticket {
  id: string;
  // --- A. Core Identification & Work Order ---
  woNumber: string;
  workOrderNumber?: string;
  idCustomer: string;
  customerId?: string;
  ticketNumber?: string;
  ticketDate?: string;
  date: string;
  dateUpload?: string;
  fileName?: string;
  agentId?: string;

  // --- B. Customer Details & Contacts ---
  customerName: string;
  endUserName?: string;
  customerPhone: string;
  customerContact1?: string;
  customerContact2?: string;
  customerContact3?: string;
  customerPhoneNormalized?: string;
  streetName?: string;
  streetAlternatif?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  clusterName?: string;
  area: string;

  // --- C. Appointment & Schedule ---
  appointmentDate?: string;
  appointmentType?: string;
  slotTime: string;
  ticketCategory: string;
  initialTicketCategory?: string;

  // --- D. Network & Technical Infrastructure (BASE_DATA_WO baseline) ---
  installationType?: string;
  serviceType?: string;
  homepassType?: string;
  homepassDetailId?: string;
  oltCode?: string;
  fdtCode?: string;
  fatCode?: string;
  fatPort?: string;
  dropcoreLength?: string;
  plan?: string;
  serviceAgingMaintenance?: string;
  vendorName?: string;
  router?: string;
  ontBrand?: string;
  ontModel?: string;
  routerBrand?: string;
  routerModel?: string;
  routerSerialNumber?: string;
  stb1Sn?: string;
  stb1Mac?: string;
  stb2Sn?: string;
  stb2Mac?: string;
  stb3Sn?: string;
  stb3Mac?: string;
  ontSerialNumber?: string;
  ontMacAddress?: string;
  rgSerialNumber?: string;
  rgMacAddress?: string;

  // --- E. Contractor, Leader & Installer ---
  contactorName: string;
  contractorName?: string;
  contractorId?: string;
  leaderName?: string;
  corlapName?: string;
  corlapContact?: string;
  installerName?: string;
  installerContact?: string;
  installerContact2?: string;
  installerEmail?: string;
  dateAssignAgent?: string;
  dateAssignTechnician?: string;
  assignedAt?: string;
  assignedBy?: string;
  reassignedAt?: string;
  reassignedBy?: string;
  reassignmentReason?: string;
  assignmentHistory?: WOAssignmentHistory[];

  // --- F. Automatic Distribution Engine Status ---
  distributionStatus?: WODistributionStatus;
  distributionNotes?: string;

  // --- G. Operational Statuses ---
  statusWOAgent: TicketStatusWOAgent;
  statusWOInstaller: TicketStatusWOInstaller;
  statusWhatsApp: WhatsAppConfirmationStatus;
  remarksWOInstaller?: string;
  remarksAgent?: string;
  remarks?: string;

  // --- H. Technical Report & Wi-Fi Root Cause ---
  technicalReport?: TechnicalReport;
  progressReports?: ProgressReportEntry[];

  // --- I. Closure & Completion ---
  closedAt?: string;
  closedBy?: string;
  closeNotes?: string;
  reopenReason?: string;

  // --- J. Live Chat Indicators ---
  chatMessagesCount?: number;
  lastMessageAt?: string;
  lastMessageSnippet?: string;

  // --- K. WhatsApp Tracking ---
  waMessagePreview?: string;
  waGeneratedUrl?: string;
  waLastOpenedAt?: string;
  waConfirmedAt?: string;
  waConfirmedBy?: string;
  waConfirmationNotes?: string;

  // --- L. Soft Delete & Auditing (Super Admin Exclusive) ---
  isArchived: boolean;
  archivedAt?: string;
  archivedBy?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deletionReason?: string;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;

  // --- M. Unmapped & Unnamed Dynamic Columns ---
  unmappedHeaders?: string[];
  additionalFields?: Record<string, string>;

  // --- N. Import Tracking & 7-Day Retention ---
  importedAt?: string;
  importDate?: string; // Format: YYYY-MM-DD
  importBatchId?: string;

  // --- O. Offline Database Synchronization Status ---
  _offlineSyncStatus?: 'synced' | 'pending' | 'conflict';
  _offlineLastModified?: string;
}

export interface WOAssignmentHistory {
  id: string;
  woNumber: string;
  ticketId: string;
  previousInstallerName?: string;
  previousInstaller?: string;
  newInstallerName: string;
  assignedInstaller?: string;
  leaderName: string;
  performedBy?: string;
  performedByRole?: string;
  leaderId?: string;
  contractorName?: string;
  timestamp: string;
  reason: string;
  previousStatus?: string;
  newStatus?: string;
  sourceAction: 'initial_assignment' | 'reassign';
}

export interface TicketActivity {
  id: string;
  ticketId: string;
  woNumber: string;
  action: string;
  description: string;
  performedBy: string;
  userRole: UserRole;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  messageBody: string;
  availableVariables: string[];
  isDefault: boolean;
  active: boolean;
  editableByRole: UserRole[];
  createdBy: string;
  updatedBy: string;
  version: number;
  lastUpdated: string;
}

export interface WhatsAppMessageLog {
  id: string;
  ticketId: string;
  woNumber: string;
  customerName: string;
  customerPhone: string;
  templateId?: string;
  messageBody: string;
  url: string;
  eventType: 'url_generated' | 'opened_in_whatsapp' | 'copied' | 'marked_confirmed' | 'marked_rescheduled' | 'marked_unreachable';
  performedBy: string;
  userRole: UserRole;
  notes?: string;
  timestamp: string;
}

export interface WorkflowRule {
  id: string;
  name: string;
  description: string;
  trigger: 
    | 'ticket_imported'
    | 'ticket_created'
    | 'installer_assigned'
    | 'slot_time_changed'
    | 'installer_changed'
    | 'wo_status_changed'
    | 'phone_updated'
    | 'confirmation_required'
    | 'ticket_completed';
  conditions: {
    field?: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'is_not_empty';
    value?: string;
  }[];
  actions: {
    type: 'prepare_whatsapp' | 'notify_leader' | 'notify_installer' | 'log_event' | 'update_wa_status';
    templateId?: string;
    targetStatus?: WhatsAppConfirmationStatus;
  }[];
  enabled: boolean;
  executionCount: number;
  lastExecutedAt?: string;
}

export interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  order: number;
  width?: number; // in pixels or min-width
  align?: 'left' | 'center' | 'right';
  format?: 'text' | 'date' | 'phone' | 'badge' | 'status_agent' | 'status_installer' | 'status_wa' | 'code';
  sticky?: 'left' | 'right' | 'none';
  wrapText?: boolean;
  sortable?: boolean;
  filterable?: boolean;
}

export interface TablePreset {
  id: string;
  name: string;
  description: string;
  columns: ColumnConfig[];
  density: 'compact' | 'comfortable' | 'spacious';
  rowsPerPage: number;
}

export interface ToolbarButtonConfig {
  id: string;
  label: string;
  icon: string;
  visible: boolean;
  order: number;
  roleRequired?: UserRole[];
  group: 'primary' | 'secondary' | 'more_menu';
  color?: string;
}

export interface SectionDetailConfig {
  id: string;
  title: string;
  visible: boolean;
  order: number;
  fields: {
    key: string;
    label: string;
    visible: boolean;
    order: number;
    width: 'full' | 'half' | 'third';
    isReadOnly?: boolean;
  }[];
}

export interface UIConfiguration {
  id: string;
  version: number;
  updatedAt: string;
  updatedBy: string;
  
  // Global Theme & Layout
  global: {
    appName: string;
    logoIcon: string;
    primaryColor: string; // e.g., 'blue', 'indigo', 'emerald', 'slate', 'violet'
    themeMode: 'light' | 'dark' | 'system';
    fontScale: 'small' | 'medium' | 'large';
    density: 'compact' | 'comfortable' | 'spacious';
    contentWidth: 'contained' | 'full';
    borderRadius: 'none' | 'small' | 'medium' | 'large';
    buttonStyle: 'solid' | 'subtle' | 'outline';
    tableStyle: 'bordered' | 'striped' | 'minimal';
    sidebarState: 'expanded' | 'minimized' | 'closed';
    sidebarCollapsed: boolean;
    toolbarPosition: 'top' | 'floating' | 'inline';
    modalSize: 'small' | 'medium' | 'large' | 'full';
  };

  // Ticket Table Configuration
  ticketsTable: {
    columns: ColumnConfig[];
    density: 'compact' | 'comfortable' | 'spacious';
    rowsPerPage: number;
    showEmptyFields: boolean;
    activePresetId: string;
    presets: TablePreset[];
  };

  // Toolbar Configuration
  toolbar: {
    buttons: ToolbarButtonConfig[];
    showSearch: boolean;
    showFilters: boolean;
    showExport: boolean;
    showImport: boolean;
    showArchiveToggle: boolean;
    showDensityToggle: boolean;
  };

  // Ticket Detail Configuration
  ticketDetail: {
    showEmptyFields: boolean;
    sections: SectionDetailConfig[];
  };

  // Page Specific Layouts
  pageLayouts: {
    dashboard: { sectionOrder: string[]; columns: number };
    tickets: { layout: 'table' | 'cards'; filterPosition: 'top' | 'sidebar' };
    importWO: { showInstructions: boolean };
    detail: { layout: 'two_column' | 'single_column' };
  };

  // Device Specific Configuration (Android vs PC layout)
  device: {
    mode: 'auto' | 'pc' | 'android';
    
    // Android / Smartphone Ergonomics
    android: {
      layoutType: 'cards' | 'compact_table';
      touchTargetSize: 'comfortable' | 'large' | 'compact';
      showBottomNavigation: boolean;
      cardDensity: 'spacious' | 'comfortable' | 'compact';
      showQuickCall: boolean;
      showQuickWhatsApp: boolean;
      showQuickDetail: boolean;
      highContrastBadges: boolean;
      autoCloseSidebarOnNavigate: boolean;
    };

    // PC / Desktop Productivity
    pc: {
      tableDensity: 'compact' | 'comfortable' | 'spacious';
      stickyColumns: boolean;
      wideScreenFullWidth: boolean;
      showInlineFilters: boolean;
      showBulkToolbar: boolean;
      actionButtonsLayout: 'inline_icons' | 'labeled_buttons' | 'overflow_menu';
      multiColumnDetail: boolean;
    };
  };
}

export interface CanonicalFieldConfig {
  canonicalField: string;
  displayLabel: string;
  aliases: string[];
  dataType: 'string' | 'phone' | 'date' | 'time_slot' | 'status' | 'number';
  category: 'core' | 'customer' | 'location' | 'technical' | 'assignment' | 'status' | 'metadata';
  required: boolean;
  validationRules?: string[];
  sourceMapping?: string;
  normalizationRules?: string;
  displayOrder: number;
  visible: boolean;
  editableByRoles: UserRole[];
}

export interface HeaderMapping {
  standardField: string;
  label: string;
  aliases: string[];
  required: boolean;
  category: 'core' | 'customer' | 'location' | 'technical' | 'assignment' | 'status';
}

export interface LeaderScheduleSlot {
  slotTime: string;
  date: string;
  assignedCount: number;
  maxCapacity: number;
  tickets: Ticket[];
}

export interface ParsedRowData {
  rowIndex: number;
  raw: Record<string, string>;
  mapped: Partial<Ticket>;
  isValid: boolean;
  validationErrors: string[];
  isDuplicate: boolean;
  unrecognizedColumns: string[];
  appointmentDateMeta?: {
    date: string | null;
    rawValue: string;
    isValid: boolean;
    isEmpty: boolean;
    error?: string;
    formatDetected?: string;
  };
}

export interface DetectedImportContractor {
  id: string;
  name: string;
  code: string;
  coverageAreas: string[];
  clusters: string[];
  leaderName?: string;
  phone?: string;
  email?: string;
  isNew: boolean;
  woCount: number;
}

export interface TextToTableResult {
  totalDetected: number;
  validCount: number;
  problematicCount: number;
  duplicateCount: number;
  unrecognizedHeaders: string[];
  detectedHeaders: string[];
  parsedRows: ParsedRowData[];
  detectedContractors?: DetectedImportContractor[];
  newCoverageAreas?: string[];
}

export interface AuditLog {
  id: string;
  action: string;
  entity: 'ticket' | 'template' | 'workflow' | 'ui_config' | 'import_batch' | 'auth' | 'session' | 'database_sync' | 'global_config';
  entityId: string;
  details: string;
  performedBy: string;
  userRole: UserRole;
  timestamp: string;
}

export type ManagementDataPermission =
  | 'data.view'
  | 'data.validate'
  | 'data.import'
  | 'data.edit'
  | 'data.delete'
  | 'data.export'
  | 'data.sync.view'
  | 'data.sync.run'
  | 'data.audit.view';

export interface SessionMetadata {
  sessionId: string;
  userId: string;
  username: string;
  name: string;
  role: UserRole;
  contractor?: string;
  loginAt: string;
  lastActivityAt: string;
  expiresAt: string;
  status: 'active' | 'expired' | 'revoked';
  ipAddress?: string;
  userAgent?: string;
  deviceType?: 'desktop' | 'mobile' | 'tablet' | 'unknown';
}

export interface SessionConfig {
  sessionMaxDurationHours: number; // default: 8
  idleTimeoutMinutes: number; // default: 60
  extendOnActivity: boolean; // default: true
  maxActiveSessionsPerUser: number; // default: 3
  revokePreviousOnLogin: boolean; // default: false
  revokeOnDeactivate: boolean; // default: true
  revokeOnPasswordChange: boolean; // default: true
}

export type SyncProcessStatus =
  | 'Connected'
  | 'Disconnected'
  | 'Syncing'
  | 'Success'
  | 'Partial Success'
  | 'Failed'
  | 'Pending';

export interface SyncHistoryEntry {
  jobId: string;
  syncType: 'full_sync' | 'pull_sheets' | 'push_sheets' | 'manual_check';
  startedAt: string;
  completedAt?: string;
  status: SyncProcessStatus;
  processedCount: number;
  successCount: number;
  failedCount: number;
  newRecordsCount: number;
  updatedRecordsCount: number;
  errorSummary?: string;
  dataSource: string;
  initiatedBy: string;
  initiatedByRole?: UserRole;
  durationMs?: number;
}

export interface SyncMonitoringStatus {
  appDbStatus: 'Connected' | 'Disconnected' | 'Degraded';
  sheetsStatus: 'Connected' | 'Disconnected' | 'Unconfigured' | 'Invalid Credentials';
  lastSyncStatus: SyncProcessStatus;
  lastSyncAt: string | null;
  lastAttemptAt: string | null;
  totalRecordsRead: number;
  totalRecordsProcessed: number;
  totalRecordsFailed: number;
  pendingChangesCount: number;
  isSyncing: boolean;
  currentJobId?: string;
}

