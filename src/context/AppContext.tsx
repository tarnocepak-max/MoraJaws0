import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Ticket,
  WhatsAppTemplate,
  WorkflowRule,
  AuditLog,
  User,
  UserRole,
  TicketActivity,
  WhatsAppMessageLog,
  HeaderMapping,
  Contractor,
  CoverageArea,
  RootCauseCategory,
  TechnicalReport,
  ProgressReportEntry,
  TicketStatusWOInstaller,
  TicketMessage,
  ChatAttachment,
  CanonicalFieldConfig,
  WOAssignmentHistory,
  ReportDropdownCategory,
  DataSyncStatus,
  ChatCategoryConfig,
  HierarchicalStatus,
  HierarchicalReason,
  HierarchicalRemark,
  WOApprovalStatus
} from '../types/index.ts';

import {
  INITIAL_SAMPLE_TICKETS,
  DEFAULT_WHATSAPP_TEMPLATES,
  DEFAULT_WORKFLOW_RULES,
  STANDARD_HEADER_MAPPINGS,
  DEFAULT_CONTRACTORS,
  DEFAULT_COVERAGE_AREAS,
  DEFAULT_ROOT_CAUSE_CATEGORIES,
  DEFAULT_WORK_RESULTS,
  DEFAULT_USERS
} from '../constants/defaultConfig';
import { executeWorkflowsOnTicket } from '../services/workflowEngine';
import { renderWhatsAppMessage, buildWhatsAppClickToChatUrl } from '../services/whatsappService';
import {
  MASTER_CANONICAL_FIELDS,
  autoDistributeTicket,
  runWODistributionEngine,
  extractContractorsFromTickets,
  generateContractorCode,
  processRawImportWithEngine,
  reassignWOTechnician
} from '../services/woFieldMappingEngine';
import { DEFAULT_PASSWORD_HASH, quickHash, Permission, hasPermission as checkPermission } from '../services/authService';
import { GoogleSheetsConfig, SheetSyncResult, DEFAULT_SHEETS_CONFIG } from '../types/sheets.ts';
import {
  pullRowsFromSheet,
  pushTicketsToSheet,
  getAccessToken
} from '../services/googleSheetsService.ts';
import {
  calculateDurationMinutes,
  formatWorkDuration,
  isProgressCheckInMessage,
  formatJakartaTimestamp
} from '../services/workSessionService';
import { useToast } from './ToastContext';
import { saveTicketsOffline, cacheMasterData, getOfflineTickets, removeSyncQueueItem } from '../services/offlineDb';
import { useOfflineSync } from './OfflineSyncContext';
import { auth, testFirestoreConnection, pingFirestore, isQuotaExceededError } from '../lib/firebase';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  subscribeToMoraJawsFirestore,
  saveTicketToFirestore,
  batchSaveTicketsToFirestore,
  batchDeleteTicketsFromFirestore,
  deleteTicketFromFirestore,
  softDeleteTicketInFirestore,
  archiveTicketInFirestore,
  restoreTicketInFirestore,
  saveContractorToFirestore,
  deleteContractorFromFirestore,
  saveCoverageAreaToFirestore,
  deleteCoverageAreaFromFirestore,
  sendChatMessageToFirestore,
  addAuditLogToFirestore,
  saveTemplateToFirestore,
  deleteTemplateFromFirestore,
  saveUserToFirestore,
  deleteUserFromFirestore,
  softDeleteUserInFirestore,
  seedFirestoreIfEmpty,
  saveGlobalAppSettingsToFirestore,
  loadGlobalAppSettingsFromFirestore,
  saveReportDropdownCategoryToFirestore,
  deleteReportDropdownCategoryFromFirestore,
  softDeleteReportDropdownCategoryInFirestore,
  seedReportDropdownCategoriesIfEmpty,
  INITIAL_REPORT_DROPDOWN_CATEGORIES,
  fetchAllTicketsFromFirestore,
  findUserInFirestore,
  INITIAL_CHAT_CATEGORIES,
  saveChatCategoriesToFirestore,
  INITIAL_HIERARCHICAL_DROPLISTS,
  saveHierarchicalDroplistsToFirestore,
  reconcileDroplistData
} from '../services/firestoreDb';
import { auditAndCleanDuplicates, DuplicateAuditReport } from '../services/woDeduplicationService';

import { getJakartaDateString, getJakartaDateParts, getTicketAppointmentDate } from '../services/appointmentDateParser';
import {
  normalizeWoNumber,
  isValidWoNumber,
  getDeterministicTicketId,
  validateAndDeduplicateImportBatch,
  deduplicateTicketsInMemory
} from '../services/woDeduplicationService';

interface AppContextType {
  // Current user & RBAC
  currentUser: User;
  isLoggedIn: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string; user?: User; errorCode?: string }>;
  loginWithFirebase: (firebaseData: { email: string; uid: string; displayName?: string; idToken?: string }) => Promise<{ success: boolean; error?: string; user?: User }>;
  logout: () => void;
  users: User[];
  hasPermission: (permission: Permission) => boolean;
  canDelete: boolean;
  canImport: boolean;
  canEditWOData: boolean;
  operationalDate: string;
  setOperationalDate: (date: string) => void;
  isSessionModalOpen: boolean;
  setIsSessionModalOpen: (open: boolean) => void;

  // Cloud Firestore Real-time Sync & Connectivity
  firestoreStatus: 'connected' | 'connecting' | 'offline' | 'error';
  firestoreLoading: boolean;
  isFirestoreReady: boolean;

  // Requirement F: Real-time Cloud Sync Status Management
  syncStatus: DataSyncStatus;
  lastSyncTime: string | null;
  syncError: string | null;
  refreshFirestoreData: () => Promise<void>;

  // User Management (Super Admin Exclusive)
  registerDispatchAccount: (data: { name: string; username: string; phone?: string; email?: string }) => { success: boolean; user?: User; error?: string };
  registerLeaderAccount: (data: { name: string; username: string; phone?: string; contractor: string; area: string; email?: string }) => { success: boolean; user?: User; error?: string };
  registerInstallerAccount: (data: { name: string; username: string; phone: string; email?: string }) => { success: boolean; user?: User; error?: string };
  toggleUserStatus: (userId: string) => { success: boolean; error?: string };
  resetUserPassword: (userId: string) => { success: boolean; newPassword?: string; error?: string };
  deleteUser: (userId: string, reason: string, permanent?: boolean) => { success: boolean; error?: string };
  updateUser: (userId: string, updates: Partial<User>) => Promise<{ success: boolean; error?: string }>;
  executeComprehensiveDeduplication: () => Promise<DuplicateAuditReport>;

  // Contractors & Coverage Areas
  contractors: Contractor[];
  addContractor: (data: Omit<Contractor, 'id' | 'createdAt'>) => void;
  updateContractor: (id: string, updates: Partial<Contractor>) => void;
  deleteContractor: (contractorId: string) => Promise<{ success: boolean; error?: string }>;
  autoRegisterContractors: (contractorsToRegister: Contractor[], newCoverageAreas?: CoverageArea[]) => { addedCount: number; updatedCount: number };
  coverageAreas: CoverageArea[];
  addCoverageArea: (data: Omit<CoverageArea, 'id'>) => void;
  updateCoverageArea: (id: string, updates: Partial<CoverageArea>) => void;
  deleteCoverageArea: (areaId: string) => Promise<{ success: boolean; error?: string }>;

  // Root Causes & Technical Reports
  rootCauseCategories: RootCauseCategory[];
  workResultsList: string[];
  updateRootCauseCategories: (categories: RootCauseCategory[]) => void;
  saveTechnicalReport: (
    ticketId: string,
    reportData: Omit<TechnicalReport, 'id' | 'ticketId' | 'submittedAt' | 'submittedBy'>
  ) => { success: boolean; error?: string };
  saveProgressReport: (
    ticketId: string,
    data: {
      reportStatus: string;
      reasonReport: string;
      rootCause: string;
      remarksReport: string;
      reportStatusId?: string;
      reportStatusLabel?: string;
      reasonReportId?: string;
      reasonReportLabel?: string;
      rootcauseId?: string;
      rootcauseLabel?: string;
    }
  ) => Promise<{ success: boolean; error?: string; report?: ProgressReportEntry }>;
  verifyTechnicalReport: (ticketId: string) => void;
  startWorkOnTicket: (ticketId: string) => Promise<{ success: boolean; error?: string; ticket?: Ticket }>;
  approveProgressReport: (ticketId: string, notes?: string) => Promise<{ success: boolean; error?: string }>;
  rejectProgressReport: (ticketId: string, reason: string) => Promise<{ success: boolean; error?: string }>;

  // Report Dropdown Categories (Report Status, Reason Report, Rootcause)
  reportDropdownCategories: ReportDropdownCategory[];
  isDropdownCategoriesLoading: boolean;
  addReportDropdownCategory: (data: Omit<ReportDropdownCategory, 'id' | 'createdAt'>) => Promise<{ success: boolean; category?: ReportDropdownCategory; error?: string }>;
  updateReportDropdownCategory: (id: string, updates: Partial<ReportDropdownCategory>) => Promise<{ success: boolean; error?: string }>;
  deleteReportDropdownCategory: (id: string, permanent?: boolean) => Promise<{ success: boolean; error?: string }>;
  toggleReportDropdownCategoryActive: (id: string) => Promise<{ success: boolean; error?: string }>;


  // Ticket Operations
  tickets: Ticket[];
  scopedTickets: Ticket[];
  getTicketById: (id: string) => Ticket | undefined;
  createTicket: (ticket: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt' | 'isArchived'>) => Ticket;
  updateTicket: (id: string, updates: Partial<Ticket>, reason?: string) => { success: boolean; error?: string };
  assignTicketPersonnel: (ticketId: string, leaderName?: string, installerName?: string) => void;
  bulkAssignPersonnel: (ticketIds: string[], leaderName?: string, installerName?: string, slotTime?: string, remarks?: string) => { success: boolean; count: number };
  reassignTicketPersonnel: (ticketId: string, newInstallerName: string, reason: string) => { success: boolean; error?: string; historyEntry?: WOAssignmentHistory };
  updateTicketStatus: (ticketId: string, statusAgent?: any, statusInstaller?: any, remarks?: string) => void;
  closeTicket: (ticketId: string, closeNotes: string) => { success: boolean; error?: string };
  reopenTicket: (ticketId: string, reason: string) => { success: boolean; error?: string };
  archiveTicket: (ticketId: string) => void;
  restoreTicket: (ticketId: string) => void;
  deleteTicket: (ticketId: string, reason: string, permanent?: boolean) => { success: boolean; error?: string };
  bulkDeleteTickets: (ticketIds: string[], reason: string) => { success: boolean; count: number; error?: string };
  deleteCustomerData: (customerId: string, reason: string) => { success: boolean; error?: string };
  bulkImportTickets: (
    imported: Partial<Ticket>[],
    options?: { duplicatePolicy?: 'skip' | 'update_allowed' | 'review' }
  ) => { importedCount: number; updatedCount?: number; duplicatesIgnored: number; rejectedDuplicates?: string[] };
  deleteImportedTicketsByDate: (importDate: string, reason: string) => { success: boolean; count: number; error?: string };

  // Live Chat
  ticketMessages: TicketMessage[];
  sendTicketMessage: (ticketId: string, text: string, attachments?: ChatAttachment[], category?: string) => { success: boolean; error?: string; message?: TicketMessage };
  getMessagesForTicket: (ticketId: string) => TicketMessage[];
  markTicketMessagesAsRead: (ticketId: string) => void;
  getTicketUnreadCount: (ticketId: string) => number;

  // Contact Center Chat Categories
  chatCategories: ChatCategoryConfig[];
  addChatCategory: (category: Omit<ChatCategoryConfig, 'id' | 'createdAt'>) => Promise<void>;
  updateChatCategory: (id: string, updates: Partial<ChatCategoryConfig>) => Promise<void>;
  deleteChatCategory: (id: string) => Promise<void>;
  toggleChatCategoryActive: (id: string) => Promise<void>;
  setTicketChatCategory: (ticketId: string, category: string) => Promise<void>;

  // Hierarchical Droplist Management (Level 1: Status WO -> Level 2: Reason WO -> Level 3: Remarks)
  hierarchicalStatuses: HierarchicalStatus[];
  addHierarchicalStatus: (status: Omit<HierarchicalStatus, 'id' | 'reasons'>) => Promise<void>;
  updateHierarchicalStatus: (id: string, updates: Partial<HierarchicalStatus>) => Promise<void>;
  deleteHierarchicalStatus: (id: string) => Promise<void>;
  addHierarchicalReason: (statusId: string, reason: Omit<HierarchicalReason, 'id' | 'statusId' | 'remarks'>) => Promise<void>;
  updateHierarchicalReason: (statusId: string, reasonId: string, updates: Partial<HierarchicalReason>) => Promise<void>;
  deleteHierarchicalReason: (statusId: string, reasonId: string) => Promise<void>;
  moveHierarchicalReason: (fromStatusId: string, toStatusId: string, reasonId: string) => Promise<void>;
  addHierarchicalRemark: (statusId: string, reasonId: string, remark: Omit<HierarchicalRemark, 'id' | 'reasonId'>) => Promise<void>;
  updateHierarchicalRemark: (statusId: string, reasonId: string, remarkId: string, updates: Partial<HierarchicalRemark>) => Promise<void>;
  deleteHierarchicalRemark: (statusId: string, reasonId: string, remarkId: string) => Promise<void>;
  getReasonsForStatus: (statusName: string) => HierarchicalReason[];
  getRemarksForReason: (statusName: string, reasonName: string) => HierarchicalRemark[];
  reconcileDroplistsNow: () => Promise<{ success: boolean; changedCount: number; message: string }>;


  // WhatsApp Operations
  templates: WhatsAppTemplate[];
  createTemplate: (template: Omit<WhatsAppTemplate, 'id' | 'version' | 'lastUpdated'>) => WhatsAppTemplate;
  updateTemplate: (id: string, updates: Partial<WhatsAppTemplate>) => void;
  deleteTemplate: (id: string) => void;
  getWhatsAppPreviewForTicket: (ticketId: string, templateId?: string) => { text: string; url: string; error?: string; missingVars: string[] };
  recordWhatsAppOpened: (ticketId: string, url: string, messageBody: string) => void;
  recordWhatsAppConfirmed: (ticketId: string, notes: string) => void;
  recordWhatsAppReschedule: (ticketId: string, notes: string) => void;
  recordWhatsAppUnreachable: (ticketId: string, notes: string) => void;

  // Workflows
  workflowRules: WorkflowRule[];
  toggleWorkflowRule: (ruleId: string, enabled: boolean) => void;
  updateWorkflowRule: (ruleId: string, updates: Partial<WorkflowRule>) => void;

  // Header Mappings & Central Canonical Field Engine
  headerMappings: HeaderMapping[];
  updateHeaderMapping: (field: string, aliases: string[]) => void;
  canonicalFields: CanonicalFieldConfig[];
  updateCanonicalFieldConfig: (field: string, updates: Partial<CanonicalFieldConfig>) => void;

  // Audit Logs & Activity
  auditLogs: AuditLog[];
  addAuditLog: (action: string, entity: AuditLog['entity'], entityId: string, details: string) => void;
  ticketActivities: TicketActivity[];
  waLogs: WhatsAppMessageLog[];

  // Google Sheets Auto-Sync
  googleSheetsConfig: GoogleSheetsConfig;
  updateGoogleSheetsConfig: (updates: Partial<GoogleSheetsConfig>) => void;
  syncGoogleSheetsNow: (direction?: 'both' | 'export_only' | 'import_only') => Promise<SheetSyncResult>;

  // Helpers
  leadersList: string[];
  installersList: string[];
  contractorsList: string[];
  areasList: string[];

  // Toast Notifications
  toast: {
    success: (message: string, title?: string, duration?: number) => string;
    error: (message: string, title?: string, duration?: number) => string;
    warning: (message: string, title?: string, duration?: number) => string;
    info: (message: string, title?: string, duration?: number) => string;
  };
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info', title?: string, duration?: number) => string;

  // Offline Sync Center
  openOfflineSyncCenter: () => void;

  // Central Database Sync & Health
  isDataLoading: boolean;
  dataLoadError: string | null;
  loadCentralData: () => Promise<void>;
}

const STORAGE_KEYS = {
  USERS: 'morajaws_users_v4',
  TICKETS: 'morajaws_tickets_v4',
  CONTRACTORS: 'morajaws_contractors_v4',
  COVERAGE_AREAS: 'morajaws_coverage_areas_v4',
  ROOT_CAUSES: 'morajaws_root_causes_v4',
  MESSAGES: 'morajaws_messages_v4',
  TEMPLATES: 'morajaws_wa_templates_v4',
  WORKFLOWS: 'morajaws_workflows_v4',
  AUDIT: 'morajaws_audit_logs_v4',
  WA_LOGS: 'morajaws_wa_logs_v4',
  MAPPINGS: 'morajaws_mappings_v4',
  CANONICAL_FIELDS: 'morajaws_canonical_fields_v4',
  SHEETS_CONFIG: 'morajaws_sheets_config_v4'
};

// Purge legacy v1/v2/v3 sample storage keys on script evaluation
try {
  const legacyKeys = [
    'morajaws_users_v3', 'morajaws_tickets_v3', 'morajaws_contractors_v3',
    'morajaws_coverage_areas_v3', 'morajaws_messages_v3', 'morajaws_audit_logs_v3',
    'morajaws_wa_logs_v3', 'morajaws_users_v2', 'morajaws_tickets_v2',
    'morajaws_contractors_v2', 'morajaws_messages_v2'
  ];
  legacyKeys.forEach(k => localStorage.removeItem(k));
} catch (e) {}

export const deduplicateContractors = (list: Contractor[]): Contractor[] => {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const result: Contractor[] = [];

  for (const c of list) {
    if (!c || !c.name) continue;
    const cleanId = (c.id || '').trim();
    const cleanName = c.name.trim().toLowerCase();

    if (cleanId && seenIds.has(cleanId)) continue;
    if (cleanName && seenNames.has(cleanName)) continue;

    if (cleanId) seenIds.add(cleanId);
    if (cleanName) seenNames.add(cleanName);

    result.push(c);
  }
  return result;
};

const INITIAL_MESSAGES: TicketMessage[] = [];

export const UNAUTHENTICATED_USER: User = {
  id: '',
  name: 'Tamu',
  username: '',
  role: 'installer',
  active: false,
  createdAt: '2026-01-01T00:00:00Z'
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { toast, showToast } = useToast();
  const { isOnline, enqueueChange, registerAppSyncHandler, setIsOfflineModalOpen } = useOfflineSync();
  const [isDataLoading, setIsDataLoading] = useState<boolean>(false);
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);

  const getAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    try {
      const sessionStr = localStorage.getItem('morajaws_auth_session');
      if (sessionStr) {
        const sess = JSON.parse(sessionStr);
        if (sess.token) headers['Authorization'] = `Bearer ${sess.token}`;
        if (sess.userId) headers['x-user-id'] = sess.userId;
        if (sess.username) headers['x-username'] = sess.username;
      }
    } catch (e) {}
    return headers;
  };

  // Cloud Firestore Real-time Sync & Connectivity Status
  const [firestoreStatus, setFirestoreStatus] = useState<'connected' | 'connecting' | 'offline' | 'error'>('connecting');
  const [firestoreLoading, setFirestoreLoading] = useState<boolean>(true);
  const [isFirestoreReady, setIsFirestoreReady] = useState<boolean>(false);

  // Requirement F: Real-time Cloud Sync Lifecycle Status
  const [syncStatus, setSyncStatus] = useState<DataSyncStatus>(navigator.onLine ? 'LOADING' : 'OFFLINE');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [users, setUsers] = useState<User[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.USERS);
      if (saved) {
        const parsed: User[] = JSON.parse(saved);
        DEFAULT_USERS.forEach(defU => {
          if (!parsed.some(u => u.id === defU.id || u.username.toLowerCase() === defU.username.toLowerCase())) {
            parsed.push(defU);
          }
        });
        return parsed;
      }
    } catch (e) {}
    return DEFAULT_USERS;
  });

  const [currentUser, setCurrentUser] = useState<User>(() => {
    try {
      const stored = localStorage.getItem('morajaws_logged_in');
      const sessionStr = localStorage.getItem('morajaws_auth_session');
      if (stored === 'true' && sessionStr) {
        const session = JSON.parse(sessionStr);
        const match = users.find(u => u.id === session.userId || u.username === session.username);
        if (match) return match;
        if (session && session.userId && session.role) {
          return {
            id: session.userId,
            name: session.name || session.username,
            username: session.username,
            role: session.role,
            contractor: session.contractor,
            contractorId: session.contractorId,
            area: session.area,
            email: session.email || `${session.username}@morajaws.net`,
            phone: session.phone,
            active: session.active !== false,
            createdAt: session.loginAt || new Date().toISOString()
          };
        }
      }
    } catch (e) {}
    return UNAUTHENTICATED_USER;
  });

  const [contractors, setContractors] = useState<Contractor[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CONTRACTORS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return deduplicateContractors(parsed);
        }
      }
    } catch (e) {}
    return deduplicateContractors(DEFAULT_CONTRACTORS);
  });

  const [coverageAreas, setCoverageAreas] = useState<CoverageArea[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.COVERAGE_AREAS);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return DEFAULT_COVERAGE_AREAS;
  });

  const [rootCauseCategories, setRootCauseCategories] = useState<RootCauseCategory[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.ROOT_CAUSES);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return DEFAULT_ROOT_CAUSE_CATEGORIES;
  });

  const workResultsList = DEFAULT_WORK_RESULTS;

  const [tickets, setTickets] = useState<Ticket[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.TICKETS);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed loading tickets from storage', e);
    }
    return [];
  });

  const [ticketMessages, setTicketMessages] = useState<TicketMessage[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.MESSAGES);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  });

  const [templates, setTemplates] = useState<WhatsAppTemplate[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.TEMPLATES);
      if (saved) {
        const parsed: WhatsAppTemplate[] = JSON.parse(saved);
        const existingIds = new Set(parsed.map(t => t.id));
        const missing = DEFAULT_WHATSAPP_TEMPLATES.filter(t => !existingIds.has(t.id));
        return missing.length > 0 ? [...parsed, ...missing] : parsed;
      }
    } catch (e) {}
    return DEFAULT_WHATSAPP_TEMPLATES;
  });

  const [workflowRules, setWorkflowRules] = useState<WorkflowRule[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.WORKFLOWS);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return DEFAULT_WORKFLOW_RULES;
  });

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.AUDIT);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [
      {
        id: 'audit-1',
        action: 'MoraJaws System Initialized',
        entity: 'auth',
        entityId: 'sys-0',
        details: 'MoraJaws operational with Contractors, Wi-Fi Root Cause Catalog, and Live Chat Engine',
        performedBy: 'System',
        userRole: 'super_admin',
        timestamp: new Date().toISOString()
      }
    ];
  });

  const [ticketActivities, setTicketActivities] = useState<TicketActivity[]>([]);

  const [waLogs, setWaLogs] = useState<WhatsAppMessageLog[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.WA_LOGS);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  });

  const [headerMappings, setHeaderMappings] = useState<HeaderMapping[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.MAPPINGS);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return STANDARD_HEADER_MAPPINGS;
  });

  const [reportDropdownCategories, setReportDropdownCategories] = useState<ReportDropdownCategory[]>(() => {
    try {
      const saved = localStorage.getItem('morajaws_report_dropdown_categories');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return INITIAL_REPORT_DROPDOWN_CATEGORIES;
  });

  const [isDropdownCategoriesLoading, setIsDropdownCategoriesLoading] = useState(true);

  useEffect(() => {
    try {
      localStorage.setItem('morajaws_report_dropdown_categories', JSON.stringify(reportDropdownCategories));
    } catch (e) {}
  }, [reportDropdownCategories]);

  // Contact Center Chat Categories state
  const [chatCategories, setChatCategories] = useState<ChatCategoryConfig[]>(() => {
    try {
      const saved = localStorage.getItem('morajaws_chat_categories');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return INITIAL_CHAT_CATEGORIES;
  });

  useEffect(() => {
    try {
      localStorage.setItem('morajaws_chat_categories', JSON.stringify(chatCategories));
    } catch (e) {}
  }, [chatCategories]);

  // Hierarchical Droplists (Status -> Reason -> Remarks) state
  const [hierarchicalStatuses, setHierarchicalStatuses] = useState<HierarchicalStatus[]>(() => {
    try {
      const saved = localStorage.getItem('morajaws_hierarchical_droplists');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return INITIAL_HIERARCHICAL_DROPLISTS;
  });

  useEffect(() => {
    try {
      localStorage.setItem('morajaws_hierarchical_droplists', JSON.stringify(hierarchicalStatuses));
    } catch (e) {}
  }, [hierarchicalStatuses]);

  const [canonicalFields, setCanonicalFields] = useState<CanonicalFieldConfig[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CANONICAL_FIELDS);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return MASTER_CANONICAL_FIELDS;
  });

  // Persistent storage sync
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CANONICAL_FIELDS, JSON.stringify(canonicalFields));
  }, [canonicalFields]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CONTRACTORS, JSON.stringify(contractors));
  }, [contractors]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.COVERAGE_AREAS, JSON.stringify(coverageAreas));
  }, [coverageAreas]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ROOT_CAUSES, JSON.stringify(rootCauseCategories));
  }, [rootCauseCategories]);

  // Persistent storage sync (localStorage & IndexedDB offline cache)
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(tickets));
    saveTicketsOffline(tickets).catch(e => console.warn('Failed saving tickets to IndexedDB', e));
  }, [tickets]);

  // Mirror master data catalogs into IndexedDB for offline access
  useEffect(() => {
    cacheMasterData({
      contractors,
      users,
      coverageAreas,
      rootCauses: rootCauseCategories
    }).catch(e => console.warn('Failed caching master data to IndexedDB', e));
  }, [contractors, users, coverageAreas, rootCauseCategories]);

  // Load offline tickets from IndexedDB on startup if available
  useEffect(() => {
    async function loadFromIndexedDb() {
      try {
        const offlineList = await getOfflineTickets();
        if (offlineList && offlineList.length > 0) {
          setTickets(prev => {
            const existingMap = new Map(prev.map(t => [t.id, t]));
            offlineList.forEach(t => existingMap.set(t.id, t));
            return Array.from(existingMap.values());
          });
        }
      } catch (e) {
        console.warn('Failed loading offline tickets from IndexedDB', e);
      }
    }
    loadFromIndexedDb();
  }, []);

  // Cloud Firestore Real-Time Subscriptions & Master Sync
  useEffect(() => {
    let unsubscribeFirestore: (() => void) | null = null;
    let isCancelled = false;

    // Handle online/offline network transitions
    const handleOnline = () => {
      setSyncStatus('SYNCING');
      setFirestoreStatus('connecting');
      refreshFirestoreData().catch(() => {});
    };
    const handleOffline = () => {
      setSyncStatus('OFFLINE');
      setFirestoreStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    async function initFirestore() {
      setFirestoreLoading(true);
      setFirestoreStatus('connecting');
      setSyncStatus(navigator.onLine ? 'LOADING' : 'OFFLINE');

      try {
        const isConnected = await testFirestoreConnection();
        if (isCancelled) return;

        if (!isConnected) {
          setFirestoreStatus('offline');
          setFirestoreLoading(false);
          setSyncStatus('OFFLINE');
          return;
        }

        // Seed Firestore if empty so cloud database has initial data
        await seedFirestoreIfEmpty({
          tickets: INITIAL_SAMPLE_TICKETS,
          contractors: DEFAULT_CONTRACTORS,
          coverageAreas: DEFAULT_COVERAGE_AREAS,
          templates: DEFAULT_WHATSAPP_TEMPLATES,
          users: DEFAULT_USERS
        });

        await pingFirestore();

        // Subscribe to real-time collections using onSnapshot
        unsubscribeFirestore = subscribeToMoraJawsFirestore({
          onTicketsChange: (liveTickets) => {
            if (isCancelled) return;
            // Always update state with latest Firestore snapshot
            setTickets(liveTickets || []);
            setFirestoreStatus('connected');
            setFirestoreLoading(false);
            setIsFirestoreReady(true);
            setSyncStatus('SAVED');
            setLastSyncTime(new Date().toISOString());
            setSyncError(null);
          },
          onContractorsChange: (liveContractors) => {
            if (isCancelled) return;
            if (liveContractors) {
              setContractors(deduplicateContractors(liveContractors));
            }
          },
          onCoverageAreasChange: (liveAreas) => {
            if (isCancelled) return;
            if (liveAreas) {
              setCoverageAreas(liveAreas);
            }
          },
          onMessagesChange: (liveMessages) => {
            if (isCancelled) return;
            if (liveMessages) {
              setTicketMessages(liveMessages);
            }
          },
          onAuditLogsChange: (liveLogs) => {
            if (isCancelled) return;
            if (liveLogs) {
              setAuditLogs(liveLogs);
            }
          },
          onTemplatesChange: (liveTemplates) => {
            if (isCancelled) return;
            if (liveTemplates) {
              setTemplates(liveTemplates);
            }
          },
          onUsersChange: (liveUsers) => {
            if (isCancelled) return;
            if (liveUsers && liveUsers.length > 0) {
              setUsers(liveUsers);
              const sessionStr = localStorage.getItem('morajaws_auth_session');
              if (sessionStr) {
                try {
                  const s = JSON.parse(sessionStr);
                  const matchingLive = liveUsers.find(u => u.id === s.userId || u.username.toLowerCase() === (s.username || '').toLowerCase());
                  if (matchingLive) {
                    if (matchingLive.active === false || (matchingLive as any).isDeleted) {
                      logout();
                      toast.error('Akun Anda telah dinonaktifkan oleh Administrator.', 'Akses Ditutup');
                    } else {
                      setCurrentUser(matchingLive);
                    }
                  }
                } catch (e) {}
              }
            }
          },
          onReportDropdownCategoriesChange: (liveCats) => {
            if (isCancelled) return;
            if (liveCats && liveCats.length > 0) {
              setReportDropdownCategories(liveCats);
            }
            setIsDropdownCategoriesLoading(false);
          },
          onChatCategoriesChange: (liveChatCats) => {
            if (isCancelled) return;
            if (liveChatCats && liveChatCats.length > 0) {
              setChatCategories(liveChatCats);
            }
          },
          onHierarchicalDroplistsChange: (liveHier) => {
            if (isCancelled) return;
            if (liveHier && liveHier.length > 0) {
              setHierarchicalStatuses(liveHier);
            }
          },
          onError: (err) => {
            if (isQuotaExceededError(err)) {
              console.warn('[Firestore Live] Daily free read quota reached. MoraJaws active on central server storage.');
              setFirestoreStatus('offline');
              setSyncStatus('SAVED');
              setSyncError('Batas Kuota Harian Firestore Terlampaui (Free Tier). Sistem aktif menggunakan database server MoraJaws.');
            } else {
              console.warn('[Firestore Live] Notice in subscription:', err?.message || err);
              setFirestoreStatus('error');
              setSyncStatus('ERROR');
              setSyncError(err?.message || 'Gagal sinkronisasi data real-time Firestore');
            }
          }
        });

        // Seed report dropdown categories if empty
        seedReportDropdownCategoriesIfEmpty().catch(e => console.warn('[Firestore] Notice seeding report categories:', e));

        setFirestoreStatus('connected');
      } catch (err: any) {
        if (isQuotaExceededError(err)) {
          console.warn('[Firestore] Quota limit reached during initialization, falling back to server database.');
          setFirestoreStatus('offline');
          setSyncStatus('SAVED');
          setSyncError('Batas Kuota Harian Firestore Terlampaui (Free Tier). Sistem aktif menggunakan database server MoraJaws.');
        } else {
          console.warn('[Firestore] Initialization notice:', err?.message || err);
          setFirestoreStatus('error');
          setSyncStatus('ERROR');
          setSyncError(err?.message || 'Gagal inisialisasi koneksi Cloud Firestore');
        }
      } finally {
        if (!isCancelled) {
          setFirestoreLoading(false);
        }
      }
    }

    initFirestore();

    return () => {
      isCancelled = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
      }
    };
  }, []);

  // Explicit Firestore data refresh (re-queries Cloud Firestore without reloading the browser page)
  const refreshFirestoreData = async () => {
    if (!navigator.onLine) {
      setSyncStatus('OFFLINE');
      toast.warning('Koneksi internet terputus. Menggunakan data offline lokal.', 'Mode Offline');
      return;
    }
    setSyncStatus('SYNCING');
    try {
      const liveTickets = await fetchAllTicketsFromFirestore();
      if (Array.isArray(liveTickets) && liveTickets.length > 0) {
        setTickets(liveTickets);
      }
      setSyncStatus('SAVED');
      setLastSyncTime(new Date().toISOString());
      setSyncError(null);
      setFirestoreStatus('connected');
    } catch (err: any) {
      if (isQuotaExceededError(err)) {
        console.warn('[Firestore Sync] Quota limit reached on free tier. Using central server persistence.');
        setSyncStatus('SAVED');
        setFirestoreStatus('offline');
        setSyncError('Batas Kuota Harian Firestore Terlampaui (Free Tier). Sistem aktif menggunakan database server MoraJaws.');
      } else {
        console.warn('[Firestore Sync] Refresh notice:', err?.message || err);
        setSyncStatus('ERROR');
        setSyncError(err?.message || 'Gagal menyinkronkan data dari Cloud Firestore');
      }
    }
  };

  const loadCentralData = async () => {
    setIsDataLoading(true);
    setDataLoadError(null);
    try {
      const headers = getAuthHeaders();
      const res = await fetch('/api/bootstrap', { headers });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success) {
          if (data.operationalDate) {
            setOperationalDateState(data.operationalDate);
          }
          if (data.currentUser && data.isAuthenticated) {
            setCurrentUser(prev => ({ ...prev, ...data.currentUser }));
          } else if (data.isAuthenticated === false && headers['Authorization']) {
            setIsLoggedIn(false);
            setCurrentUser(UNAUTHENTICATED_USER);
            try {
              localStorage.setItem('morajaws_logged_in', 'false');
              localStorage.removeItem('morajaws_auth_session');
            } catch (e) {}
          }
          if (Array.isArray(data.tickets) && data.tickets.length > 0) {
            setTickets(data.tickets);
          }
          if (Array.isArray(data.contractors) && data.contractors.length > 0) {
            setContractors(data.contractors);
          }
          if (Array.isArray(data.coverageAreas) && data.coverageAreas.length > 0) {
            setCoverageAreas(data.coverageAreas);
          }
          if (Array.isArray(data.templates) && data.templates.length > 0) {
            setTemplates(data.templates);
          }
        }
      }
      // Re-trigger Firestore direct sync to make sure everything is up-to-date, with graceful fallback
      try {
        await refreshFirestoreData();
      } catch (fErr) {
        console.warn('[CentralData] Firestore sync fallback to backend server database:', fErr);
      }
    } catch (err: any) {
      console.warn('[CentralData] Sync error:', err);
      setDataLoadError(err?.message || 'Gagal memuat status sesi');
    } finally {
      setIsDataLoading(false);
    }
  };

  // Bootstrap from central backend on startup
  useEffect(() => {
    loadCentralData();
  }, []);

  // Register two-way sync processor with OfflineSyncContext
  useEffect(() => {
    registerAppSyncHandler(async (items) => {
      let successCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      for (const item of items) {
        try {
          if (item.action === 'STATUS_CHANGE') {
            const { ticketId, statusAgent, statusInstaller, remarks } = item.payload;
            setTickets(prev => prev.map(t => {
              if (t.id === ticketId) {
                return {
                  ...t,
                  ...(statusAgent ? { statusWOAgent: statusAgent } : {}),
                  ...(statusInstaller ? { statusWOInstaller: statusInstaller } : {}),
                  ...(remarks !== undefined ? { remarksWOInstaller: remarks } : {}),
                  _offlineSyncStatus: 'synced',
                  updatedAt: new Date().toISOString()
                };
              }
              return t;
            }));
          } else if (item.action === 'REPORT') {
            const { ticketId, report } = item.payload;
            setTickets(prev => prev.map(t => {
              if (t.id === ticketId) {
                return {
                  ...t,
                  technicalReport: report,
                  _offlineSyncStatus: 'synced',
                  updatedAt: new Date().toISOString()
                };
              }
              return t;
            }));
          } else if (item.action === 'ASSIGN') {
            const { ticketId, leaderName, installerName } = item.payload;
            setTickets(prev => prev.map(t => {
              if (t.id === ticketId) {
                return {
                  ...t,
                  ...(leaderName !== undefined ? { leaderName } : {}),
                  ...(installerName !== undefined ? { installerName } : {}),
                  _offlineSyncStatus: 'synced',
                  updatedAt: new Date().toISOString()
                };
              }
              return t;
            }));
          } else if (item.action === 'UPDATE') {
            const { ticketId, updates } = item.payload;
            setTickets(prev => prev.map(t => {
              if (t.id === ticketId) {
                return {
                  ...t,
                  ...updates,
                  _offlineSyncStatus: 'synced',
                  updatedAt: new Date().toISOString()
                };
              }
              return t;
            }));
          }
          await removeSyncQueueItem(item.id);
          successCount++;
        } catch (err: any) {
          failedCount++;
          errors.push(err?.message || 'Error processing item ' + item.id);
        }
      }
      return { successCount, failedCount, errors };
    });
  }, [registerAppSyncHandler]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(ticketMessages));
  }, [ticketMessages]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(templates));
  }, [templates]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.WORKFLOWS, JSON.stringify(workflowRules));
  }, [workflowRules]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.AUDIT, JSON.stringify(auditLogs));
  }, [auditLogs]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.WA_LOGS, JSON.stringify(waLogs));
  }, [waLogs]);

  const [googleSheetsConfig, setGoogleSheetsConfig] = useState<GoogleSheetsConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SHEETS_CONFIG);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_SHEETS_CONFIG,
          ...parsed,
          accountEmail: parsed.accountEmail || '',
          accountName: parsed.accountName || ''
        };
      }
    } catch (e) {}
    return DEFAULT_SHEETS_CONFIG;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SHEETS_CONFIG, JSON.stringify(googleSheetsConfig));
  }, [googleSheetsConfig]);

  const updateGoogleSheetsConfig = (updates: Partial<GoogleSheetsConfig>) => {
    setGoogleSheetsConfig(prev => ({ ...prev, ...updates }));
    addAuditLog('Google Sheets Config Updated', 'ui_config', 'sheets', 'Pengaturan sinkronisasi otomatis Google Sheet diperbarui');
  };

  const addAuditLog = (action: string, entity: AuditLog['entity'], entityId: string, details: string) => {
    const entry: AuditLog = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      action,
      entity,
      entityId,
      details,
      performedBy: currentUser.name,
      userRole: currentUser.role,
      timestamp: new Date().toISOString()
    };
    setAuditLogs(prev => [entry, ...prev.slice(0, 499)]);
    addAuditLogToFirestore(entry).catch(err => {
      console.warn('[Firestore] Error recording audit log:', err);
    });
  };

  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('morajaws_logged_in');
      const session = localStorage.getItem('morajaws_auth_session');
      if (stored === 'true' && session) {
        return true;
      }
    } catch (e) {}
    return false;
  });

  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);

  // Operational schedule reference date (Asia/Jakarta WIB)
  const [operationalDate, setOperationalDateState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('morajaws_operational_date');
      if (saved) return saved;
    } catch (e) {}
    return getJakartaDateString(0);
  });

  const setOperationalDate = (date: string) => {
    setOperationalDateState(date);
    try {
      localStorage.setItem('morajaws_operational_date', date);
    } catch (e) {}
    saveGlobalAppSettingsToFirestore({ operationalDate: date }).catch(() => {});
    fetch('/api/system/operational-date', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ operationalDate: date })
    }).catch(() => {});
  };

  useEffect(() => {
    fetch('/api/system/operational-date')
      .then(res => res.json())
      .then(data => {
        if (data && data.success && data.operationalDate) {
          setOperationalDateState(data.operationalDate);
          localStorage.setItem('morajaws_operational_date', data.operationalDate);
        }
      })
      .catch(() => {});
  }, []);

  // Authentication & Session
  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string; user?: User; errorCode?: string }> => {
    const cleanUser = username.trim();
    if (!cleanUser) {
      return { success: false, error: 'Nama pengguna atau email wajib diisi.', errorCode: 'INVALID_INPUT' };
    }
    if (!password) {
      return { success: false, error: 'Kata sandi wajib diisi.', errorCode: 'INVALID_INPUT' };
    }

    // 1. Connectivity Check: Never blame wrong credentials when connection is down
    if (!navigator.onLine) {
      return {
        success: false,
        error: 'Koneksi jaringan terputus. Pastikan perangkat Anda terhubung ke internet.',
        errorCode: 'auth/network-request-failed'
      };
    }

    try {
      // 2. Identity Resolution: Map username/email to canonical Auth account via secure backend
      let resolveData: any = null;
      try {
        const resolveRes = await fetch('/api/auth/resolve-identity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: cleanUser })
        });
        if (resolveRes.ok) {
          resolveData = await resolveRes.json();
        } else {
          resolveData = await resolveRes.json().catch(() => ({}));
        }
      } catch (netErr: any) {
        console.warn('[Auth] Primary resolve-identity network issue:', netErr);
        return {
          success: false,
          error: 'Gagal terhubung ke server autentikasi MoraJaws. Periksa koneksi jaringan Anda.',
          errorCode: 'auth/network-request-failed'
        };
      }

      if (!resolveData || !resolveData.found) {
        addAuditLog('Login Attempt Failed', 'auth', cleanUser, `Percobaan login gagal: Identitas "${cleanUser}" tidak terdaftar`);
        return {
          success: false,
          error: resolveData?.error || `Nama pengguna atau email "${cleanUser}" tidak ditemukan dalam direktori staf MoraJaws.`,
          errorCode: 'auth/user-not-found'
        };
      }

      if (resolveData.active === false) {
        addAuditLog('Login Blocked Inactive', 'auth', cleanUser, `Akun dinonaktifkan mencoba login: ${cleanUser}`);
        return {
          success: false,
          error: 'Akun Anda telah dinonaktifkan oleh Administrator. Hubungi Super Admin.',
          errorCode: 'auth/user-disabled'
        };
      }

      const targetEmail = resolveData.user.email;
      let firebaseUid: string | undefined = resolveData.user.firebaseUid;

      // 3. Primary Authentication Mechanism: Firebase Authentication signInWithEmailAndPassword
      let firebaseErrorEncountered = false;
      try {
        const userCred = await signInWithEmailAndPassword(auth, targetEmail, password);
        if (userCred && userCred.user) {
          firebaseUid = userCred.user.uid;
        }
      } catch (fbErr: any) {
        firebaseErrorEncountered = true;
        const code = fbErr?.code || '';
        
        // Accurate Firebase Auth error handling per Section 4 of prompt
        if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
          addAuditLog('Login Failed', 'auth', cleanUser, `Kredensial kata sandi salah untuk ${cleanUser}`);
          return {
            success: false,
            error: 'Autentikasi gagal. Kredensial tidak cocok. Pastikan kata sandi yang Anda masukkan benar.',
            errorCode: 'MJ-AUTH-001'
          };
        } else if (code === 'auth/too-many-requests') {
          return {
            success: false,
            error: 'Terlalu banyak percobaan login yang gagal. Akses akun ditangguhkan sementara demi keamanan. Coba lagi dalam beberapa menit.',
            errorCode: 'auth/too-many-requests'
          };
        } else if (code === 'auth/user-disabled') {
          return {
            success: false,
            error: 'Akun staf ini telah dinonaktifkan di Firebase Authentication. Hubungi Administrator.',
            errorCode: 'auth/user-disabled'
          };
        } else if (code === 'auth/network-request-failed') {
          return {
            success: false,
            error: 'Gagal terhubung ke server autentikasi Firebase. Periksa koneksi internet Anda.',
            errorCode: 'auth/network-request-failed'
          };
        } else if (code === 'auth/operation-not-allowed') {
          // Log specific configuration note per Section 4
          console.warn('[Firebase Auth] Password provider is disabled in Firebase Console. Verifying via MoraJaws secure backend provider...');
        } else if (code === 'auth/user-not-found') {
          console.warn('[Firebase Auth] User not found in Firebase Auth tenant. Verifying via MoraJaws secure backend provider...');
        }
      }

      // 4. Secure Backend Session Authorization & Role Verification
      const serverRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUser,
          password,
          firebaseUid: firebaseUid || undefined
        })
      });

      const data = await serverRes.json();
      if (!serverRes.ok || !data.success) {
        const errCode = data.code || 'MJ-AUTH-001';
        addAuditLog('Login Attempt Failed', 'auth', cleanUser, data.error || 'Login gagal');
        return {
          success: false,
          error: data.error || 'Autentikasi gagal. Kredensial tidak cocok.',
          errorCode: errCode
        };
      }

      // 5. Establish authenticated session
      const authedUser: User = {
        ...data.user,
        firebaseUid: firebaseUid || data.user?.firebaseUid,
        lastLoginAt: new Date().toISOString()
      };

      setUsers(prev => {
        const exists = prev.find(u => u.id === authedUser.id);
        if (exists) {
          return prev.map(u => u.id === authedUser.id ? { ...u, ...authedUser } : u);
        }
        return [...prev, authedUser];
      });
      setCurrentUser(authedUser);
      setIsLoggedIn(true);

      try {
        localStorage.setItem('morajaws_logged_in', 'true');
        localStorage.setItem('morajaws_auth_session', JSON.stringify({
          userId: authedUser.id,
          username: authedUser.username,
          role: authedUser.role,
          name: authedUser.name,
          loginAt: authedUser.lastLoginAt,
          token: data.token,
          sessionId: data.sessionId,
          expiresAt: data.expiresAt
        }));
      } catch (e) {}

      addAuditLog('Login Success', 'auth', authedUser.id, `Pengguna ${authedUser.name} (${authedUser.role}) berhasil login ke sistem`);
      await loadCentralData();
      return { success: true, user: authedUser };

    } catch (err: any) {
      console.error('[Auth] Login exception:', err);
      return {
        success: false,
        error: err?.message || 'Terjadi gangguan saat memproses autentikasi.',
        errorCode: 'AUTH_EXCEPTION'
      };
    }
  };

  const loginWithFirebase = async (firebaseData: { email: string; uid: string; displayName?: string; idToken?: string }): Promise<{ success: boolean; error?: string; user?: User }> => {
    try {
      const serverRes = await fetch('/api/auth/firebase-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(firebaseData)
      });
      const data = await serverRes.json();
      if (!data.success) {
        addAuditLog('Firebase Login Failed', 'auth', firebaseData.email, data.error || 'Login Firebase gagal');
        return { success: false, error: data.error || 'Akun Google Anda belum terdaftar di MoraJaws.' };
      }

      if (data.user) {
        const authedUser: User = {
          ...data.user,
          lastLoginAt: new Date().toISOString()
        };
        setUsers(prev => {
          const exists = prev.find(u => u.id === authedUser.id);
          if (exists) {
            return prev.map(u => u.id === authedUser.id ? { ...u, ...authedUser } : u);
          }
          return [...prev, authedUser];
        });
        setCurrentUser(authedUser);
        setIsLoggedIn(true);

        try {
          localStorage.setItem('morajaws_logged_in', 'true');
          localStorage.setItem('morajaws_auth_session', JSON.stringify({
            userId: authedUser.id,
            username: authedUser.username,
            role: authedUser.role,
            name: authedUser.name,
            loginAt: authedUser.lastLoginAt,
            token: data.token,
            sessionId: data.sessionId,
            expiresAt: data.expiresAt
          }));
        } catch (e) {}

        addAuditLog('Login Success (Firebase)', 'auth', authedUser.id, `Pengguna ${authedUser.name} (${authedUser.role}) berhasil login via Firebase Auth`);
        await loadCentralData();
        return { success: true, user: authedUser };
      }
      return { success: false, error: 'Respon server tidak valid' };
    } catch (err: any) {
      addAuditLog('Firebase Login Error', 'auth', firebaseData.email, err?.message || 'Gagal menghubungi server autentikasi.');
      return { success: false, error: 'Gagal menghubungi server autentikasi MoraJaws. Pastikan koneksi server tersedia.' };
    }
  };

  const logout = () => {
    addAuditLog('User Logout', 'auth', currentUser.id, `Pengguna ${currentUser.name} (${currentUser.role}) logout dari sistem`);
    setIsLoggedIn(false);
    setCurrentUser(UNAUTHENTICATED_USER);
    try {
      localStorage.setItem('morajaws_logged_in', 'false');
      localStorage.removeItem('morajaws_auth_session');
    } catch (e) {}

    // Sign out from Firebase Authentication
    try {
      signOut(auth).catch(() => {});
    } catch (e) {}

    fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      }
    }).catch(() => {});

    // Reload public bootstrap after logout
    loadCentralData();

    toast.info('Anda telah berhasil logout dari sistem MoraJaws.', 'Logout');
  };

  const hasPermission = (permission: Permission) => checkPermission(currentUser.role, permission);
  const canDelete = currentUser.role === 'super_admin';
  const canImport = currentUser.role === 'super_admin' || currentUser.role === 'dispatch' || currentUser.role === 'management_data';
  const canEditWOData = currentUser.role === 'super_admin' || currentUser.role === 'dispatch' || currentUser.role === 'management_data';

  // Role Scoped Work Orders (Strict RBAC Data Management)
  const scopedTickets = React.useMemo(() => {
    return tickets.filter(t => {
      if (t.isDeleted) return false;
      // 1. Super Admin, Dispatch, and Management Data have system-wide visibility
      if (currentUser.role === 'super_admin' || currentUser.role === 'dispatch' || currentUser.role === 'management_data') return true;

      const ticketContractor = (t.contactorName || t.contractorName || '').toLowerCase().trim();
      const ticketArea = (t.area || '').toLowerCase().trim();

      // 2. Leader / Korlap: Strictly limited to their contractor and area
      if (currentUser.role === 'leader') {
        const leaderContractor = (currentUser.contractor || '').toLowerCase().trim();
        const leaderArea = (currentUser.area || '').toLowerCase().trim();

        if (!leaderContractor) return false;
        const matchContractor = Boolean(
          ticketContractor === leaderContractor ||
          ticketContractor.includes(leaderContractor) ||
          leaderContractor.includes(ticketContractor)
        );
        const matchArea = !leaderArea || Boolean(
          ticketArea === leaderArea ||
          ticketArea.includes(leaderArea) ||
          leaderArea.includes(ticketArea)
        );
        return matchContractor && matchArea;
      }

      // 3. Installer / Teknisi: STRICTLY LIMITED to tickets explicitly assigned to this technician!
      if (currentUser.role === 'installer') {
        const myName = (currentUser.name || '').toLowerCase().trim();
        const cleanMyName = myName.replace(/\(.*?\)/g, '').trim();
        const ticketInst = (t.installerName || '').toLowerCase().trim();
        if (!ticketInst) return false; // not assigned to anyone

        const nameMatch = Boolean(
          ticketInst === myName ||
          ticketInst === cleanMyName ||
          ticketInst.includes(cleanMyName) ||
          cleanMyName.includes(ticketInst)
        );

        const phoneMatch = Boolean(
          currentUser.phone &&
          t.installerContact &&
          t.installerContact.replace(/\D/g, '') === currentUser.phone.replace(/\D/g, '')
        );

        return nameMatch || phoneMatch;
      }

      return false;
    });
  }, [tickets, currentUser]);



  const deleteUser = (userId: string, reason: string, permanent: boolean = false): { success: boolean; error?: string } => {
    if (currentUser.role !== 'super_admin') {
      const err = 'Akses Ditolak: Hanya Super Admin yang berwenang menghapus akun pengguna.';
      addAuditLog('Unauthorized User Deletion', 'auth', userId, `${currentUser.name} (${currentUser.role}) mencoba menghapus akun pengguna`);
      toast.error(err, 'Akses Ditolak');
      return { success: false, error: err };
    }
    if (userId === currentUser.id) {
      toast.error('Anda tidak dapat menghapus akun Anda sendiri saat sedang login.', 'Gagal Hapus');
      return { success: false, error: 'Anda tidak dapat menghapus akun Anda sendiri saat sedang login.' };
    }
    const target = users.find(u => u.id === userId);
    if (!target) {
      toast.error('Pengguna tidak ditemukan.', 'Error');
      return { success: false, error: 'Pengguna tidak ditemukan.' };
    }
    if (!reason || reason.trim().length < 5) {
      toast.error('Alasan penghapusan akun wajib diisi minimal 5 karakter.', 'Validasi Gagal');
      return { success: false, error: 'Alasan penghapusan akun wajib diisi minimal 5 karakter.' };
    }

    const now = new Date().toISOString();
    if (permanent) {
      setUsers(prev => prev.filter(u => u.id !== userId));
      deleteUserFromFirestore(userId)
        .then(() => toast.warning(`Akun ${target.name} (@${target.username}) telah dihapus permanen dari Cloud Firestore.`, 'Akun Dihapus Permanen'))
        .catch(err => toast.error('Gagal menghapus user dari Cloud Firestore: ' + (err?.message || err)));
      addAuditLog('User Permanently Deleted', 'auth', userId, `Super Admin ${currentUser.name} menghapus permanen akun ${target.name} (@${target.username}). Alasan: ${reason}`);
    } else {
      const softDeleted = {
        ...target,
        isArchived: true,
        active: false,
        deletedAt: now,
        deletedBy: currentUser.name,
        deletionReason: reason
      };
      setUsers(prev => prev.map(u => (u.id === userId ? softDeleted : u)));
      softDeleteUserInFirestore(userId, currentUser.name, reason)
        .then(() => toast.warning(`Akun ${target.name} (@${target.username}) berhasil dinonaktifkan & ditandai terhapus di Cloud Firestore.`, 'Akun Dihapus (Soft Delete)'))
        .catch(err => toast.error('Gagal memperbarui status user di Cloud Firestore: ' + (err?.message || err)));
      addAuditLog('User Soft Deleted', 'auth', userId, `Super Admin ${currentUser.name} menonaktifkan & menandai terhapus (soft delete) akun ${target.name} (@${target.username}). Alasan: ${reason}`);
    }

    fetch(`/api/users/${userId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      body: JSON.stringify({ reason, permanent })
    }).catch(e => console.error('Error syncing user deletion to server:', e));

    return { success: true };
  };

  const updateUser = async (userId: string, updates: Partial<User>): Promise<{ success: boolean; error?: string }> => {
    if (currentUser.role !== 'super_admin' && currentUser.id !== userId) {
      const isLeaderManagingOwnInstaller =
        currentUser.role === 'leader' &&
        users.find(u => u.id === userId)?.role === 'installer' &&
        users.find(u => u.id === userId)?.contractor === currentUser.contractor;
      if (!isLeaderManagingOwnInstaller) {
        const err = 'Akses Ditolak: Anda tidak memiliki wewenang untuk mengubah data pengguna ini.';
        toast.error(err, 'Akses Ditolak');
        return { success: false, error: err };
      }
    }

    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) {
      return { success: false, error: 'Pengguna tidak ditemukan.' };
    }

    // Name and Username uniqueness validation
    if (updates.name) {
      const cleanName = updates.name.trim().replace(/\s+/g, ' ');
      const nameTaken = users.some(
        u => u.id !== userId && !u.isDeleted && u.name.trim().replace(/\s+/g, ' ').toLowerCase() === cleanName.toLowerCase()
      );
      if (nameTaken) {
        const err = 'AKUN SUDAH TERDAFTAR – Nama atau username sudah digunakan.';
        toast.error(err, 'Validasi Gagal');
        return { success: false, error: err };
      }
    }

    if (updates.username) {
      const cleanUsername = updates.username.trim().toLowerCase().replace(/\s+/g, '');
      const usernameTaken = users.some(
        u => u.id !== userId && !u.isDeleted && u.username.trim().toLowerCase() === cleanUsername
      );
      if (usernameTaken) {
        const err = 'AKUN SUDAH TERDAFTAR – Nama atau username sudah digunakan.';
        toast.error(err, 'Validasi Gagal');
        return { success: false, error: err };
      }
    }

    const updatedUser: User = {
      ...targetUser,
      ...updates,
      name: updates.name ? updates.name.trim().replace(/\s+/g, ' ') : targetUser.name,
      username: updates.username ? updates.username.trim().toLowerCase().replace(/\s+/g, '') : targetUser.username,
      id: userId
    };

    setUsers(prev => prev.map(u => (u.id === userId ? updatedUser : u)));

    try {
      setSyncStatus('SYNCING');
      await saveUserToFirestore(updatedUser);
      setSyncStatus('SAVED');
      setLastSyncTime(new Date().toISOString());

      // Sync with backend API
      await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(updates)
      });

      toast.success(`Data akun ${updatedUser.name} berhasil diperbarui di Cloud Firestore.`, 'Akun Diperbarui');
      addAuditLog('User Account Updated', 'auth', userId, `${currentUser.name} memperbarui profil pengguna ${updatedUser.name}`);
      return { success: true };
    } catch (err: any) {
      setSyncStatus('ERROR');
      toast.error('Gagal menyimpan perubahan pengguna: ' + (err?.message || err));
      return { success: false, error: err?.message || 'Gagal update pengguna' };
    }
  };

  const executeComprehensiveDeduplication = async (): Promise<DuplicateAuditReport> => {
    const report = auditAndCleanDuplicates(tickets, (action, _entity, id, details) => {
      addAuditLog(action, 'ticket', id, details);
    });
    if (report.duplicatesCleaned > 0) {
      setTickets(report.cleanedTicketList);
      if (report.mergedMasterTickets.length > 0) {
        try {
          await batchSaveTicketsToFirestore(report.mergedMasterTickets);
        } catch (e) {
          console.warn('[Firestore] Error saving merged master tickets:', e);
        }
      }
      if (report.duplicateDocIdsToDelete.length > 0) {
        try {
          await batchDeleteTicketsFromFirestore(report.duplicateDocIdsToDelete);
        } catch (e) {
          console.warn('[Firestore] Error deleting duplicate docs:', e);
        }
      }
      addAuditLog(
        'Automated Deduplication Executed',
        'database_sync',
        'audit_clean',
        `Pembersihan duplikasi selesai: ${report.duplicatesCleaned} duplikat dibersihkan, ${report.totalValid} dokumen valid dipertahankan, ${report.conflictsFound} konflik ditandai.`
      );
      toast.success(
        `Pembersihan selesai: ${report.duplicatesCleaned} duplikasi dibersihkan dari ${report.totalExamined} dokumen.`,
        'Rekonsiliasi Sukses'
      );
    } else {
      toast.info('Database bersih! Tidak ditemukan record duplikat yang perlu dibersihkan.', 'Pemeriksaan Selesai');
    }
    return report;
  };

  const deleteCustomerData = (customerId: string, reason: string): { success: boolean; error?: string } => {
    if (currentUser.role !== 'super_admin') {
      toast.error('Akses Ditolak: Hanya Super Admin yang berwenang menghapus data pelanggan.', 'Akses Ditolak');
      return { success: false, error: 'Akses Ditolak: Hanya Super Admin yang berwenang menghapus data pelanggan.' };
    }
    if (!reason || reason.trim().length < 5) {
      toast.error('Alasan penghapusan pelanggan wajib diisi minimal 5 karakter.', 'Validasi Gagal');
      return { success: false, error: 'Alasan penghapusan pelanggan wajib diisi minimal 5 karakter.' };
    }

    const now = new Date().toISOString();
    const affectedTickets: Ticket[] = [];
    setTickets(prev => prev.map(t => {
      const isTarget = t.idCustomer === customerId || t.customerId === customerId;
      if (!isTarget) return t;
      const updatedT: Ticket = {
        ...t,
        isDeleted: true,
        deletedAt: now,
        deletedBy: currentUser.name,
        deletionReason: `Penghapusan data pelanggan ID ${customerId}: ${reason}`
      };
      affectedTickets.push(updatedT);
      return updatedT;
    }));

    if (affectedTickets.length > 0) {
      setSyncStatus('SYNCING');
      batchSaveTicketsToFirestore(affectedTickets)
        .then(() => {
          setSyncStatus('SAVED');
          setLastSyncTime(new Date().toISOString());
        })
        .catch(err => {
          setSyncStatus('ERROR');
          console.warn('[Firestore] Error soft-deleting customer tickets:', err);
        });
    }

    addAuditLog('Customer Data Deleted', 'ticket', customerId, `Super Admin ${currentUser.name} menghapus data pelanggan ID ${customerId}. Alasan: ${reason}`);
    toast.warning(`Data pelanggan ID ${customerId} dan ${affectedTickets.length} tiket terkait berhasil dihapus dari Cloud Firestore.`, 'Data Pelanggan Dihapus');
    return { success: true };
  };

  // Account Registration
  const registerDispatchAccount = (data: { name: string; username: string; phone?: string; email?: string }) => {
    if (currentUser.role !== 'super_admin') {
      addAuditLog('Unauthorized Staff Registration Blocked', 'auth', 'dispatch', `Ditolak: Leader/Staf ${currentUser.name} (${currentUser.role}) mencoba mendaftarkan akun Dispatch.`);
      return { success: false, error: 'Akses Ditolak: Hanya Super Admin yang berwenang mendaftarkan akun Dispatch.' };
    }

    const cleanName = data.name.trim().replace(/\s+/g, ' ');
    const cleanUsername = data.username.trim().toLowerCase().replace(/\s+/g, '');
    if (!cleanName || !cleanUsername) {
      return { success: false, error: 'Nama lengkap dan username wajib diisi.' };
    }

    // Check uniqueness of both name and username across all registered users
    const isNameTaken = users.some(u => !u.isDeleted && u.name.trim().replace(/\s+/g, ' ').toLowerCase() === cleanName.toLowerCase());
    const isUsernameTaken = users.some(u => !u.isDeleted && u.username.trim().toLowerCase() === cleanUsername);

    if (isNameTaken || isUsernameTaken) {
      const err = 'AKUN SUDAH TERDAFTAR – Nama atau username sudah digunakan.';
      toast.error(err, 'Registrasi Ditolak');
      return { success: false, error: err };
    }

    const newUser: User = {
      id: 'u-' + Date.now(),
      name: cleanName,
      username: cleanUsername,
      email: data.email?.trim() || `${cleanUsername}@morajaws.net`,
      phone: data.phone?.trim(),
      role: 'dispatch',
      active: true,
      mustChangePassword: true,
      createdAt: new Date().toISOString()
    };

    setUsers(prev => [...prev, newUser]);
    addAuditLog('Dispatch Account Registered', 'auth', newUser.id, `Super Admin registered Dispatch account: ${newUser.name} (@${newUser.username})`);
    
    saveUserToFirestore(newUser).catch(e => console.warn('[Firestore] Error saving dispatch account:', e));

    fetch('/api/users', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(newUser)
    }).catch(e => console.error('Error syncing dispatch account to server:', e));

    toast.success(`Akun Dispatch ${newUser.name} berhasil didaftarkan! Password default: 12345678`, 'Registrasi Sukses');
    return { success: true, user: newUser };
  };

  const registerLeaderAccount = (data: { name: string; username: string; phone?: string; contractor: string; area: string; email?: string }) => {
    if (currentUser.role !== 'super_admin') {
      addAuditLog('Unauthorized Staff Registration Blocked', 'auth', 'leader', `Ditolak: Leader/Staf ${currentUser.name} (${currentUser.role}) mencoba mendaftarkan akun Leader.`);
      toast.error('Akses Ditolak: Leader tidak dapat membuat akun staf selain Installer.', 'Otoritas Dibatasi');
      return { success: false, error: 'Akses Ditolak: Pendaftaran Leader hanya dapat dilakukan oleh Super Admin.' };
    }

    const cleanName = data.name.trim().replace(/\s+/g, ' ');
    const cleanUsername = data.username.trim().toLowerCase().replace(/\s+/g, '');
    if (!cleanName || !cleanUsername) {
      return { success: false, error: 'Nama lengkap dan username wajib diisi.' };
    }

    // Check uniqueness of both name and username across all registered users
    const isNameTaken = users.some(u => !u.isDeleted && u.name.trim().replace(/\s+/g, ' ').toLowerCase() === cleanName.toLowerCase());
    const isUsernameTaken = users.some(u => !u.isDeleted && u.username.trim().toLowerCase() === cleanUsername);

    if (isNameTaken || isUsernameTaken) {
      const err = 'AKUN SUDAH TERDAFTAR – Nama atau username sudah digunakan.';
      toast.error(err, 'Registrasi Ditolak');
      return { success: false, error: err };
    }

    const contractorInput = data.contractor.trim();
    if (!contractorInput) return { success: false, error: 'Nama kontraktor wajib diisi.' };

    // Match existing contractor or auto-create new contractor vendor
    let matchedContractor = contractors.find(
      c => c.name.toLowerCase().trim() === contractorInput.toLowerCase() ||
           c.code.toLowerCase().trim() === contractorInput.toLowerCase()
    );

    if (!matchedContractor) {
      const code = generateContractorCode(contractorInput);
      matchedContractor = {
        id: 'c-' + Date.now(),
        name: contractorInput,
        code,
        coverageAreas: data.area ? [data.area] : ['Jabodetabek'],
        leaderName: cleanName,
        phone: data.phone?.trim(),
        email: data.email?.trim() || `ops@${code.toLowerCase()}.morajaws.net`,
        active: true,
        createdAt: new Date().toISOString()
      };
      setContractors(prev => [...prev, matchedContractor!]);
      saveContractorToFirestore(matchedContractor).catch(e => console.warn('[Firestore] Error saving contractor:', e));
      addAuditLog(
        'Contractor Auto-Registered with Leader',
        'ui_config',
        matchedContractor.id,
        `Kontraktor ${matchedContractor.name} (${matchedContractor.code}) didaftarkan otomatis saat membuat akun Leader ${cleanName}`
      );
    } else {
      // Ensure area is added to contractor coverage if not already there
      if (data.area && !matchedContractor.coverageAreas.some(a => a.toLowerCase() === data.area.toLowerCase())) {
        const updatedAreas = [...matchedContractor.coverageAreas, data.area];
        const updatedContractorObj = { ...matchedContractor, coverageAreas: updatedAreas, leaderName: matchedContractor.leaderName || cleanName };
        setContractors(prev =>
          prev.map(c => c.id === matchedContractor!.id ? updatedContractorObj : c)
        );
        saveContractorToFirestore(updatedContractorObj).catch(e => console.warn('[Firestore] Error updating contractor:', e));
      }
    }

    const newUser: User = {
      id: 'u-' + Date.now(),
      name: cleanName,
      username: cleanUsername,
      email: data.email?.trim() || `${cleanUsername}@${matchedContractor.code.toLowerCase()}.com`,
      phone: data.phone?.trim(),
      role: 'leader',
      contractor: matchedContractor.name,
      contractorId: matchedContractor.id,
      area: data.area,
      active: true,
      mustChangePassword: true,
      createdAt: new Date().toISOString()
    };

    setUsers(prev => [...prev, newUser]);
    saveUserToFirestore(newUser).catch(e => console.warn('[Firestore] Error saving leader user:', e));

    // Update contractor's leader if empty
    setContractors(prev =>
      prev.map(c => (c.id === matchedContractor!.id && !c.leaderName ? { ...c, leaderId: newUser.id, leaderName: newUser.name } : c))
    );

    addAuditLog('Leader Account Registered', 'auth', newUser.id, `Super Admin registered Leader account: ${newUser.name} for ${matchedContractor.name}`);

    // Persist new user & contractor to backend
    fetch('/api/users', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(newUser)
    }).catch(e => console.error('Error syncing leader user to server:', e));

    if (matchedContractor) {
      fetch('/api/contractors', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ contractor: matchedContractor })
      }).catch(e => console.error('Error syncing contractor to server:', e));
    }

    toast.success(`Akun Leader ${newUser.name} berhasil didaftarkan untuk ${matchedContractor.name}! Password default: 12345678`, 'Registrasi Sukses');
    return { success: true, user: newUser };
  };

  const registerInstallerAccount = (data: { name: string; username: string; phone: string; email?: string }) => {
    // Both Leader (for their contractor/area) and Super Admin can register installers
    if (currentUser.role !== 'leader' && currentUser.role !== 'super_admin') {
      toast.error('Hanya Leader / Korlap atau Super Admin yang berwenang mendaftarkan Installer.', 'Akses Ditolak');
      return { success: false, error: 'Hanya Leader / Korlap atau Super Admin yang berwenang mendaftarkan Installer.' };
    }

    const cleanName = data.name.trim().replace(/\s+/g, ' ');
    const cleanUsername = data.username.trim().toLowerCase().replace(/\s+/g, '');
    if (!cleanName || !cleanUsername) {
      return { success: false, error: 'Nama lengkap dan username login wajib diisi.' };
    }

    // Check uniqueness of both name and username across all registered users
    const isNameTaken = users.some(u => !u.isDeleted && u.name.trim().replace(/\s+/g, ' ').toLowerCase() === cleanName.toLowerCase());
    const isUsernameTaken = users.some(u => !u.isDeleted && u.username.trim().toLowerCase() === cleanUsername);

    if (isNameTaken || isUsernameTaken) {
      const err = 'AKUN SUDAH TERDAFTAR – Nama atau username sudah digunakan.';
      toast.error(err, 'Registrasi Ditolak');
      return { success: false, error: err };
    }

    // Contractor and Area strictly locked to Leader's authorized scope
    const contractorName = currentUser.role === 'leader'
      ? (currentUser.contractor || 'PT Mitra Jaringan Solusi')
      : (contractors[0]?.name || 'PT Mitra Jaringan Solusi');
    const contractorObj = contractors.find(c => c.name === contractorName);
    const assignedArea = currentUser.role === 'leader'
      ? (currentUser.area || contractorObj?.coverageAreas[0] || 'Jakarta Selatan')
      : (contractorObj?.coverageAreas[0] || 'Jakarta Selatan');

    const newUser: User = {
      id: 'u-' + Date.now(),
      name: cleanName,
      username: cleanUsername,
      email: data.email?.trim() || `${cleanUsername}@installer.morajaws.net`,
      phone: data.phone.trim(),
      role: 'installer',
      contractor: contractorName,
      contractorId: contractorObj?.id,
      area: assignedArea,
      active: true,
      mustChangePassword: true,
      createdAt: new Date().toISOString()
    };

    setUsers(prev => [...prev, newUser]);
    saveUserToFirestore(newUser).catch(e => console.warn('[Firestore] Error saving installer user:', e));
    addAuditLog('Installer Account Registered', 'auth', newUser.id, `${currentUser.name} registered Installer: ${newUser.name} under ${contractorName} (${assignedArea})`);

    fetch('/api/users', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(newUser)
    }).catch(e => console.error('Error syncing installer account to server:', e));

    toast.success('BERHASIL – Akun Installer berhasil dibuat.', 'Registrasi Sukses');
    return { success: true, user: newUser };
  };

  const toggleUserStatus = (userId: string): { success: boolean; error?: string } => {
    if (currentUser.role !== 'super_admin') {
      toast.error('Akses Ditolak: Hanya Super Admin yang berwenang mengubah status aktif akun pengguna.', 'Akses Ditolak');
      return { success: false, error: 'Akses Ditolak: Hanya Super Admin yang berwenang mengubah status aktif akun pengguna.' };
    }
    const targetUser = users.find(u => u.id === userId);
    if (targetUser) {
      saveUserToFirestore({ ...targetUser, active: !targetUser.active }).catch(e => console.warn('[Firestore] Error toggling user status:', e));
    }
    setUsers(prev =>
      prev.map(u => {
        if (u.id !== userId) return u;
        const nextActive = !u.active;
        addAuditLog('User Status Changed', 'auth', u.id, `Status akun ${u.name} diubah menjadi ${nextActive ? 'Aktif' : 'Nonaktif'}`);
        toast.info(`Status akun ${u.name} diubah menjadi ${nextActive ? 'Aktif' : 'Nonaktif'}.`, 'Status Akun Diubah');
        return { ...u, active: nextActive };
      })
    );

    fetch(`/api/users/${userId}/toggle`, {
      method: 'PUT',
      headers: getAuthHeaders()
    }).catch(e => console.error('Error syncing user status toggle to server:', e));

    return { success: true };
  };

  const resetUserPassword = (userId: string): { success: boolean; newPassword?: string; error?: string } => {
    if (currentUser.role !== 'super_admin') {
      toast.error('Akses Ditolak: Hanya Super Admin yang berwenang mereset kata sandi akun pengguna.', 'Akses Ditolak');
      return { success: false, error: 'Akses Ditolak: Hanya Super Admin yang berwenang mereset kata sandi akun pengguna.' };
    }
    const targetUser = users.find(u => u.id === userId);
    if (targetUser) {
      saveUserToFirestore({ ...targetUser, passwordHash: DEFAULT_PASSWORD_HASH, mustChangePassword: true }).catch(e => console.warn('[Firestore] Error resetting user password:', e));
    }
    setUsers(prev =>
      prev.map(u => {
        if (u.id !== userId) return u;
        addAuditLog('Password Reset', 'auth', u.id, `Password akun ${u.name} di-reset ke default 12345678`);
        toast.success(`Password akun ${u.name} berhasil di-reset ke default 12345678.`, 'Password Direset');
        return { ...u, passwordHash: DEFAULT_PASSWORD_HASH, mustChangePassword: true };
      })
    );

    fetch(`/api/users/${userId}/reset-password`, {
      method: 'POST',
      headers: getAuthHeaders()
    }).catch(e => console.error('Error syncing password reset to server:', e));

    return { success: true, newPassword: '12345678' };
  };

  // Master Contractors & Coverage Areas
  const addContractor = (data: Omit<Contractor, 'id' | 'createdAt'>) => {
    const newContractor: Contractor = {
      ...data,
      id: 'c-' + Date.now(),
      createdAt: new Date().toISOString()
    };
    setContractors(prev => [...prev, newContractor]);
    saveContractorToFirestore(newContractor).catch(e => console.warn('[Firestore] Error saving contractor:', e));
    addAuditLog('Contractor Added', 'ui_config', newContractor.id, `Added contractor vendor: ${newContractor.name}`);

    fetch('/api/contractors', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ contractor: newContractor })
    }).catch(e => console.error('Error syncing new contractor to server:', e));
  };

  const updateContractor = (id: string, updates: Partial<Contractor>) => {
    setContractors(prev =>
      prev.map(c => {
        if (c.id === id) {
          const updated = { ...c, ...updates };
          saveContractorToFirestore(updated).catch(e => console.warn('[Firestore] Error updating contractor:', e));
          return updated;
        }
        return c;
      })
    );
    addAuditLog('Contractor Updated', 'ui_config', id, `Updated contractor: ${updates.name || id}`);

    fetch(`/api/contractors/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates)
    }).catch(e => console.error('Error syncing contractor update to server:', e));
  };

  const deleteContractor = async (contractorId: string): Promise<{ success: boolean; error?: string }> => {
    if (currentUser.role !== 'super_admin') {
      const err = 'Akses Ditolak: Hanya Super Admin yang berwenang menghapus mitra kontraktor.';
      toast.error(err, 'Akses Ditolak');
      return { success: false, error: err };
    }
    const target = contractors.find(c => c.id === contractorId);
    if (!target) return { success: false, error: 'Kontraktor tidak ditemukan.' };

    setContractors(prev => prev.filter(c => c.id !== contractorId));
    try {
      setSyncStatus('SYNCING');
      await deleteContractorFromFirestore(contractorId);
      setSyncStatus('SAVED');
      setLastSyncTime(new Date().toISOString());
      addAuditLog('Contractor Deleted', 'ui_config', contractorId, `Super Admin ${currentUser.name} menghapus kontraktor ${target.name}`);
      toast.warning(`Kontraktor ${target.name} berhasil dihapus dari Cloud Firestore.`, 'Kontraktor Dihapus');
      return { success: true };
    } catch (err: any) {
      setSyncStatus('ERROR');
      toast.error('Gagal menghapus kontraktor di Cloud Firestore: ' + (err?.message || err));
      return { success: false, error: err?.message };
    }
  };

  const autoRegisterContractors = (
    contractorsToRegister: Contractor[],
    newCoverageAreasList: CoverageArea[] = []
  ): { addedCount: number; updatedCount: number } => {
    let addedCount = 0;
    let updatedCount = 0;

    setContractors(prev => {
      let updated = [...prev];
      contractorsToRegister.forEach(incoming => {
        if (!incoming || !incoming.name) return;
        const incomingId = (incoming.id || '').trim();
        const incomingName = incoming.name.trim().toLowerCase();
        const incomingCode = (incoming.code || '').trim().toLowerCase();

        const existingIdx = updated.findIndex(
          c => (incomingId && c.id === incomingId) ||
               c.name.trim().toLowerCase() === incomingName ||
               (incomingCode && c.code && c.code.trim().toLowerCase() === incomingCode)
        );
        if (existingIdx >= 0) {
          const ex = updated[existingIdx];
          const combinedAreas = Array.from(new Set([...(ex.coverageAreas || []), ...(incoming.coverageAreas || [])]));
          const merged = {
            ...ex,
            coverageAreas: combinedAreas,
            leaderName: ex.leaderName || incoming.leaderName,
            phone: ex.phone || incoming.phone
          };
          updated[existingIdx] = merged;
          saveContractorToFirestore(merged).catch(() => {});
          updatedCount++;
        } else {
          updated.push(incoming);
          saveContractorToFirestore(incoming).catch(() => {});
          addedCount++;
        }
      });
      return deduplicateContractors(updated);
    });

    if (newCoverageAreasList.length > 0) {
      setCoverageAreas(prev => {
        const merged = [...prev];
        newCoverageAreasList.forEach(na => {
          if (!merged.some(a => a.name.toLowerCase().trim() === na.name.toLowerCase().trim())) {
            merged.push(na);
            saveCoverageAreaToFirestore(na).catch(() => {});
          }
        });
        return merged;
      });
    }

    addAuditLog(
      'Contractors Registered/Enrolled',
      'ui_config',
      'contractors_batch',
      `${addedCount} kontraktor baru terdaftar, ${updatedCount} kontraktor diperbarui dari import/converter`
    );

    return { addedCount, updatedCount };
  };

  const addCoverageArea = (data: Omit<CoverageArea, 'id'>) => {
    const newArea: CoverageArea = {
      ...data,
      id: 'area-' + Date.now()
    };
    setCoverageAreas(prev => [...prev, newArea]);
    saveCoverageAreaToFirestore(newArea).catch(e => console.warn('[Firestore] Error saving coverage area:', e));
    addAuditLog('Coverage Area Added', 'ui_config', newArea.id, `Added coverage area: ${newArea.name}`);
  };

  const updateCoverageArea = (id: string, updates: Partial<CoverageArea>) => {
    setCoverageAreas(prev =>
      prev.map(a => {
        if (a.id === id) {
          const updated = { ...a, ...updates };
          saveCoverageAreaToFirestore(updated).catch(e => console.warn('[Firestore] Error updating coverage area:', e));
          return updated;
        }
        return a;
      })
    );
    addAuditLog('Coverage Area Updated', 'ui_config', id, `Updated coverage area: ${updates.name || id}`);
  };

  const deleteCoverageArea = async (areaId: string): Promise<{ success: boolean; error?: string }> => {
    if (currentUser.role !== 'super_admin') {
      const err = 'Akses Ditolak: Hanya Super Admin yang berwenang menghapus area coverage.';
      toast.error(err, 'Akses Ditolak');
      return { success: false, error: err };
    }
    const target = coverageAreas.find(a => a.id === areaId);
    if (!target) return { success: false, error: 'Area coverage tidak ditemukan.' };

    setCoverageAreas(prev => prev.filter(a => a.id !== areaId));
    try {
      setSyncStatus('SYNCING');
      await deleteCoverageAreaFromFirestore(areaId);
      setSyncStatus('SAVED');
      setLastSyncTime(new Date().toISOString());
      addAuditLog('Coverage Area Deleted', 'ui_config', areaId, `Super Admin ${currentUser.name} menghapus area ${target.name}`);
      toast.warning(`Area coverage ${target.name} berhasil dihapus dari Cloud Firestore.`, 'Area Dihapus');
      return { success: true };
    } catch (err: any) {
      setSyncStatus('ERROR');
      toast.error('Gagal menghapus area coverage di Cloud Firestore: ' + (err?.message || err));
      return { success: false, error: err?.message };
    }
  };

  // Root Cause Management
  const updateRootCauseCategories = (categories: RootCauseCategory[]) => {
    setRootCauseCategories(categories);
    addAuditLog('Root Causes Updated', 'ui_config', 'root_causes', 'Updated Wi-Fi root cause taxonomy catalog');
  };

  // Technical Report Submission
  const saveTechnicalReport = (
    ticketId: string,
    reportData: Omit<TechnicalReport, 'id' | 'ticketId' | 'submittedAt' | 'submittedBy'>
  ) => {
    const ticket = getTicketById(ticketId);
    if (!ticket) return { success: false, error: 'Tiket tidak ditemukan.' };

    const now = new Date().toISOString();
    const report: TechnicalReport = {
      ...reportData,
      id: 'rep-' + Date.now(),
      ticketId,
      submittedBy: currentUser.name,
      submittedAt: now
    };

    // Requirement 3.B: Auto check-out on valid technical report save
    let checkOutAtVal: string | undefined = ticket.checkOutAt;
    let workDurationMinVal: number | undefined = ticket.workDurationMinutes;
    let workDurationStrVal: string | undefined = ticket.workDurationFormatted;
    let workSessionStatusVal = ticket.workSessionStatus || (ticket.checkInAt ? 'Sedang Dikerjakan' : 'Belum Check-in');
    let updatedSessions = Array.isArray(ticket.workSessions) ? [...ticket.workSessions] : [];

    if (ticket.checkInAt && (!ticket.checkOutAt || ticket.workSessionStatus === 'Sedang Dikerjakan')) {
      checkOutAtVal = now;
      workSessionStatusVal = 'Selesai';
      const mins = calculateDurationMinutes(ticket.checkInAt, now);
      workDurationMinVal = mins;
      workDurationStrVal = formatWorkDuration(mins);

      if (updatedSessions.length > 0) {
        const last = updatedSessions[updatedSessions.length - 1];
        if (last && (last.status === 'Sedang Dikerjakan' || !last.checkOutAt)) {
          last.checkOutAt = now;
          last.status = 'Selesai';
          last.durationMinutes = mins;
          last.durationFormatted = workDurationStrVal;
        }
      } else {
        updatedSessions.push({
          sessionId: 'ws_' + Date.now(),
          checkInAt: ticket.checkInAt,
          checkOutAt: now,
          durationMinutes: mins,
          durationFormatted: workDurationStrVal,
          status: 'Selesai'
        });
      }
    }

    setTickets(prev =>
      prev.map(t => {
        if (t.id !== ticketId) return t;
        const nextInstallerStatus = reportData.workResult === 'Tidak Berhasil'
          ? 'Failed / Cancelled'
          : reportData.workResult === 'Pekerjaan Tertunda'
          ? 'Pending Technical'
          : 'Completed';

        return {
          ...t,
          technicalReport: report,
          statusWOInstaller: nextInstallerStatus,
          statusWOAgent: nextInstallerStatus === 'Completed' ? 'Resolved' : t.statusWOAgent,
          checkOutAt: checkOutAtVal,
          workDurationMinutes: workDurationMinVal,
          workDurationFormatted: workDurationStrVal,
          workSessionStatus: workSessionStatusVal,
          workSessions: updatedSessions,
          _offlineSyncStatus: !isOnline ? 'pending' : 'synced',
          _offlineLastModified: now,
          updatedAt: now,
          updatedBy: currentUser.name
        };
      })
    );

    const activity: TicketActivity = {
      id: 'act-' + Date.now(),
      ticketId,
      woNumber: ticket.woNumber,
      action: 'Laporan Pekerjaan Teknisi Diserahkan',
      description: `Root Cause: ${report.rootCause} | Hasil: ${report.workResult}${checkOutAtVal ? ` | Check-out: ${formatJakartaTimestamp(checkOutAtVal)} (Durasi: ${workDurationStrVal})` : ''}`,
      performedBy: currentUser.name,
      userRole: currentUser.role,
      timestamp: now
    };
    setTicketActivities(prev => [activity, ...prev]);

    addAuditLog('Technical Report Submitted', 'ticket', ticketId, `Installer ${currentUser.name} submitted Wi-Fi report for WO ${ticket.woNumber} (${report.workResult})`);

    if (!isOnline) {
      enqueueChange({
        entity: 'technical_report',
        entityId: ticketId,
        action: 'REPORT',
        summary: `Laporan Teknis WO ${ticket.woNumber} (${report.workResult})`,
        payload: { ticketId, report },
        user: { id: currentUser.id, name: currentUser.name, role: currentUser.role }
      }).catch(e => console.warn('Offline report enqueue error', e));
      toast.warning(`Laporan teknis WO ${ticket.woNumber} tersimpan offline di IndexedDB lokal.`, 'Laporan Offline');
    }

    // Persist report to Cloud Firestore (Confirmed Write)
    const updatedWithReport: Ticket = {
      ...ticket,
      technicalReport: report,
      statusWOInstaller: reportData.workResult === 'Tidak Berhasil' ? 'Failed / Cancelled' : reportData.workResult === 'Pekerjaan Tertunda' ? 'Pending Technical' : 'Completed',
      statusWOAgent: 'In Progress',
      approvalStatus: 'BUTUH APPROVAL',
      checkOutAt: checkOutAtVal,
      workDurationMinutes: workDurationMinVal,
      workDurationFormatted: workDurationStrVal,
      workSessionStatus: workSessionStatusVal,
      workSessions: updatedSessions,
      _offlineSyncStatus: !isOnline ? 'pending' : 'synced',
      _offlineLastModified: now,
      updatedAt: now,
      updatedBy: currentUser.name
    };

    setSyncStatus('SYNCING');
    saveTicketToFirestore(updatedWithReport)
      .then(() => {
        setSyncStatus('SAVED');
        setLastSyncTime(new Date().toISOString());
        toast.success(`Laporan teknis lapangan untuk WO ${ticket.woNumber} berhasil disimpan (BUTUH APPROVAL).`, 'Laporan Teknis Tersimpan');
      })
      .catch(err => {
        setSyncStatus('ERROR');
        if (!isOnline) {
          toast.warning(`Laporan teknis WO ${ticket.woNumber} tersimpan offline di IndexedDB lokal.`, 'Laporan Offline');
        } else {
          toast.error('Gagal menyimpan laporan teknis ke Cloud Firestore: ' + (err?.message || err), 'Penyimpanan Gagal');
        }
      });

    // Also persist report to backend API
    fetch(`/api/tickets/${ticketId}/report`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ report })
    }).catch(e => console.error('Error saving technical report to server:', e));

    return { success: true };
  };

  const isInstallerMatch = (ticketInstaller: string | undefined, installerName: string): boolean => {
    if (!ticketInstaller || !installerName) return false;
    const tInst = ticketInstaller.toLowerCase().trim();
    const effInst = installerName.toLowerCase().trim();
    if (tInst === effInst) return true;
    if (tInst.includes(effInst) || effInst.includes(tInst)) return true;
    const cleanEff = effInst.replace(/\(.*?\)/g, '').trim();
    if (cleanEff && (tInst.includes(cleanEff) || cleanEff.includes(tInst))) return true;
    return false;
  };

  const startWorkOnTicket = async (
    ticketId: string
  ): Promise<{ success: boolean; error?: string; ticket?: Ticket }> => {
    const ticket = getTicketById(ticketId);
    if (!ticket) return { success: false, error: 'Tiket tidak ditemukan.' };

    // 1. Ownership validation for field technician
    if (currentUser.role === 'installer') {
      const myId = currentUser.id || '';
      const myUsername = (currentUser.username || '').toLowerCase().trim();
      const myName = (currentUser.name || '').toLowerCase().trim();
      const tInst = (ticket.installerName || '').toLowerCase().trim();

      const isMine =
        (myId && (ticket.assignedTo === myId || ticket.installerId === myId || ticket.assignedToUid === myId)) ||
        (myUsername && ticket.assignedTo?.toLowerCase() === myUsername) ||
        (myName && (tInst === myName || isInstallerMatch(ticket.installerName, myName)));

      if (!isMine) {
        return {
          success: false,
          error: 'Akses Ditolak: Anda hanya berwenang memulai pengerjaan untuk tiket yang ditugaskan kepada Anda.'
        };
      }
    }

    // 2. Check current status: if already in progress or completed, do not regress status, just open it
    const alreadyStarted =
      ticket.workStartedAt ||
      ticket.statusWOInstaller === 'On Site' ||
      ticket.statusWOInstaller === 'En Route' ||
      ticket.statusWOInstaller === 'Completed' ||
      ticket.statusWOInstaller === 'Installed' ||
      ticket.approvalStatus === 'BUTUH APPROVAL' ||
      ticket.approvalStatus === 'APPROVED';

    if (alreadyStarted) {
      return { success: true, ticket };
    }

    // 3. Mark ticket as In Progress / On Site
    const now = new Date().toISOString();
    const updatedTicket: Ticket = {
      ...ticket,
      statusWOInstaller: 'On Site',
      statusWOAgent: 'In Progress',
      workStartedAt: now,
      workStartedBy: currentUser.name,
      workStartedById: currentUser.id,
      updatedAt: now,
      updatedBy: currentUser.name
    };

    setTickets(prev => prev.map(t => (t.id === ticketId ? updatedTicket : t)));

    const activity: TicketActivity = {
      id: 'act-' + Date.now(),
      ticketId,
      woNumber: ticket.woNumber,
      action: 'Mulai Pengerjaan',
      description: `Teknisi ${currentUser.name} mulai mengerjakan Work Order di lokasi`,
      performedBy: currentUser.name,
      userRole: currentUser.role,
      timestamp: now
    };
    setTicketActivities(prev => [activity, ...prev]);

    addAuditLog(
      'Work Started',
      'ticket',
      ticketId,
      `Teknisi ${currentUser.name} memulai pengerjaan untuk WO ${ticket.woNumber}`
    );

    // Persist to Cloud Firestore
    try {
      await saveTicketToFirestore(updatedTicket);
    } catch (err: any) {
      console.warn('[Firestore] Error saving workStarted status:', err);
    }

    return { success: true, ticket: updatedTicket };
  };

  const saveProgressReport = async (
    ticketId: string,
    data: {
      reportStatus: string;
      reasonReport: string;
      rootCause: string;
      remarksReport: string;
      reportStatusId?: string;
      reportStatusLabel?: string;
      reasonReportId?: string;
      reasonReportLabel?: string;
      rootcauseId?: string;
      rootcauseLabel?: string;
    }
  ): Promise<{ success: boolean; error?: string; report?: ProgressReportEntry }> => {
    const ticket = getTicketById(ticketId);
    if (!ticket) return { success: false, error: 'Tiket tidak ditemukan.' };

    // 1. Strict Installer Assignment Verification
    if (currentUser.role === 'installer') {
      const myId = currentUser.id || '';
      const myUsername = (currentUser.username || '').toLowerCase().trim();
      const myName = (currentUser.name || '').toLowerCase().trim();
      const tInst = (ticket.installerName || '').toLowerCase().trim();

      const isMine =
        (myId && (ticket.assignedTo === myId || ticket.installerId === myId || ticket.assignedToUid === myId)) ||
        (myUsername && ticket.assignedTo?.toLowerCase() === myUsername) ||
        (myName && (tInst === myName || isInstallerMatch(ticket.installerName, myName)));

      if (!isMine) {
        return {
          success: false,
          error: 'Akses Ditolak: Anda hanya berwenang menyimpan laporan untuk tiket yang di-assign kepada Anda.'
        };
      }
    }

    // 2. Validate mandatory fields
    if (!data.reportStatus?.trim()) {
      return { success: false, error: 'Report Status (Level 1) wajib dipilih.' };
    }
    if (!data.reasonReport?.trim()) {
      return { success: false, error: 'Reason Report (Level 2) wajib dipilih.' };
    }
    if (!data.rootCause?.trim()) {
      return { success: false, error: 'Rootcause (Level 3 - Remarks) wajib dipilih.' };
    }

    // 3. Strict 3-Tier Hierarchical Droplist Validation against Firestore appSettings/hierarchical_droplists
    let matchedStatus: HierarchicalStatus | undefined;
    let matchedReason: HierarchicalReason | undefined;
    let matchedRemark: HierarchicalRemark | undefined;

    if (hierarchicalStatuses && hierarchicalStatuses.length > 0) {
      const normStatus = data.reportStatus.trim().toLowerCase();
      matchedStatus = hierarchicalStatuses.find(
        s => s.id === data.reportStatusId || s.name.trim().toLowerCase() === normStatus || (s.code && s.code.trim().toLowerCase() === normStatus)
      );

      if (!matchedStatus) {
        return {
          success: false,
          error: `Validasi Gagal: Report Status "${data.reportStatus}" tidak terdaftar dalam konfigurasi Setting Droplist.`
        };
      }

      const isStatusActive = matchedStatus.active !== false && (matchedStatus as any).isActive !== false;
      if (!isStatusActive) {
        return {
          success: false,
          error: `Validasi Gagal: Report Status "${matchedStatus.name}" telah dinonaktifkan oleh Admin untuk transaksi laporan baru.`
        };
      }

      // Level 2 Reason Validation (Must strictly be child of matchedStatus)
      const normReason = data.reasonReport.trim().toLowerCase();
      matchedReason = (matchedStatus.reasons || []).find(
        r => r.id === data.reasonReportId || r.name.trim().toLowerCase() === normReason
      );

      if (!matchedReason) {
        return {
          success: false,
          error: `Validasi Gagal: Reason Report "${data.reasonReport}" bukan merupakan pilihan turunan (child) yang sah dari Status "${matchedStatus.name}".`
        };
      }

      const isReasonActive = matchedReason.active !== false && (matchedReason as any).isActive !== false;
      if (!isReasonActive) {
        return {
          success: false,
          error: `Validasi Gagal: Reason Report "${matchedReason.name}" telah dinonaktifkan oleh Admin untuk transaksi laporan baru.`
        };
      }

      // Level 3 Rootcause / Remarks Validation (Must strictly be sub-child of matchedReason)
      const normRootcause = data.rootCause.trim().toLowerCase();
      matchedRemark = (matchedReason.remarks || []).find(
        rm => rm.id === data.rootcauseId ||
              rm.name.trim().toLowerCase() === normRootcause ||
              (rm.text && rm.text.trim().toLowerCase() === normRootcause)
      );

      if (!matchedRemark) {
        return {
          success: false,
          error: `Validasi Gagal: Rootcause "${data.rootCause}" bukan merupakan pilihan turunan (sub-child) yang sah dari Reason "${matchedReason.name}".`
        };
      }

      const isRemarkActive = matchedRemark.active !== false && (matchedRemark as any).isActive !== false;
      if (!isRemarkActive) {
        return {
          success: false,
          error: `Validasi Gagal: Rootcause "${matchedRemark.name}" telah dinonaktifkan oleh Admin untuk transaksi laporan baru.`
        };
      }
    }

    const finalStatusName = matchedStatus ? matchedStatus.name : data.reportStatus.trim();
    const finalStatusId = matchedStatus ? matchedStatus.id : (data.reportStatusId || 'hs-' + finalStatusName.toLowerCase());
    const finalReasonName = matchedReason ? matchedReason.name : data.reasonReport.trim();
    const finalReasonId = matchedReason ? matchedReason.id : (data.reasonReportId || 'hr-' + finalReasonName.toLowerCase());
    const finalRootcauseName = matchedRemark ? (matchedRemark.text || matchedRemark.name) : data.rootCause.trim();
    const finalRootcauseId = matchedRemark ? matchedRemark.id : (data.rootcauseId || 'hrm-' + finalRootcauseName.toLowerCase());
    const finalRemarks = (data.remarksReport || '').trim() || finalRootcauseName;

    const now = new Date().toISOString();
    const entry: ProgressReportEntry = {
      id: 'prog-' + Date.now(),
      ticketId,
      timestamp: now,
      submittedBy: currentUser.name,
      userRole: currentUser.role,
      reportStatus: finalStatusName,
      reportStatusId: finalStatusId,
      reportStatusLabel: finalStatusName,
      reasonReport: finalReasonName,
      reasonReportId: finalReasonId,
      reasonReportLabel: finalReasonName,
      rootCause: finalRootcauseName,
      rootcauseId: finalRootcauseId,
      rootcauseLabel: finalRootcauseName,
      remarksReport: finalRemarks,
      installerName: ticket.installerName,
      appointmentDate: ticket.appointmentDate || ticket.date,
      slotTime: ticket.slotTime,
      approvalStatus: 'BUTUH APPROVAL'
    };

    const techReport: TechnicalReport = {
      id: ticket.technicalReport?.id || ('rep-' + Date.now()),
      ticketId,
      mainCategory: finalStatusName,
      rootCause: finalRootcauseName,
      workResult: finalReasonName,
      technicalDescription: finalRemarks,
      correctiveAction: finalReasonName,
      submittedBy: currentUser.name,
      submittedAt: now
    };

    const nextInstallerStatus = (matchedStatus?.code || finalStatusName) as TicketStatusWOInstaller;

    // Requirement 3.B: Auto check-out on valid report save
    let checkOutAtVal: string | undefined = ticket.checkOutAt;
    let workDurationMinVal: number | undefined = ticket.workDurationMinutes;
    let workDurationStrVal: string | undefined = ticket.workDurationFormatted;
    let workSessionStatusVal = ticket.workSessionStatus || (ticket.checkInAt ? 'Sedang Dikerjakan' : 'Belum Check-in');
    let updatedSessions = Array.isArray(ticket.workSessions) ? [...ticket.workSessions] : [];

    if (ticket.checkInAt && (!ticket.checkOutAt || ticket.workSessionStatus === 'Sedang Dikerjakan')) {
      checkOutAtVal = now;
      workSessionStatusVal = 'Selesai';
      const mins = calculateDurationMinutes(ticket.checkInAt, now);
      workDurationMinVal = mins;
      workDurationStrVal = formatWorkDuration(mins);

      if (updatedSessions.length > 0) {
        const last = updatedSessions[updatedSessions.length - 1];
        if (last && (last.status === 'Sedang Dikerjakan' || !last.checkOutAt)) {
          last.checkOutAt = now;
          last.status = 'Selesai';
          last.durationMinutes = mins;
          last.durationFormatted = workDurationStrVal;
        }
      } else {
        updatedSessions.push({
          sessionId: 'ws_' + Date.now(),
          checkInAt: ticket.checkInAt,
          checkOutAt: now,
          durationMinutes: mins,
          durationFormatted: workDurationStrVal,
          status: 'Selesai'
        });
      }
    }

    const updatedWithProgress: Ticket = {
      ...ticket,
      progressReports: [entry, ...(ticket.progressReports || [])],
      statusWOInstaller: nextInstallerStatus,
      // Status proses WO agent tetap In Progress (menunggu approval resmi dari Dispatch)
      statusWOAgent: 'In Progress',
      approvalStatus: 'BUTUH APPROVAL',
      reportStatusId: finalStatusId,
      reportStatusLabel: finalStatusName,
      reasonReportId: finalReasonId,
      reasonReportLabel: finalReasonName,
      rootcauseId: finalRootcauseId,
      rootcauseLabel: finalRootcauseName,
      remarksWOInstaller: finalRemarks,
      technicalReport: techReport,
      checkOutAt: checkOutAtVal,
      workDurationMinutes: workDurationMinVal,
      workDurationFormatted: workDurationStrVal,
      workSessionStatus: workSessionStatusVal,
      workSessions: updatedSessions,
      _offlineSyncStatus: !isOnline ? 'pending' : 'synced',
      _offlineLastModified: now,
      updatedAt: now,
      updatedBy: currentUser.name
    };

    setTickets(prev =>
      prev.map(t => (t.id === ticketId ? updatedWithProgress : t))
    );

    const activity: TicketActivity = {
      id: 'act-' + Date.now(),
      ticketId,
      woNumber: ticket.woNumber,
      action: `Progress Report: ${finalStatusName}`,
      description: `Reason: ${finalReasonName} | Rootcause: ${finalRootcauseName} | Remarks: ${finalRemarks}`,
      performedBy: currentUser.name,
      userRole: currentUser.role,
      timestamp: now
    };
    setTicketActivities(prev => [activity, ...prev]);

    addAuditLog(
      'Progress Report Saved',
      'ticket',
      ticketId,
      `Teknisi ${currentUser.name} melaporkan status ${finalStatusName} untuk WO ${ticket.woNumber} (Reason: ${finalReasonName}, Rootcause: ${finalRootcauseName})`
    );

    if (!isOnline) {
      enqueueChange({
        entity: 'technical_report',
        entityId: ticketId,
        action: 'REPORT',
        summary: `Progress Report WO ${ticket.woNumber} (${finalStatusName})`,
        payload: { ticketId, entry },
        user: { id: currentUser.id, name: currentUser.name, role: currentUser.role }
      }).catch(e => console.warn('Offline progress report enqueue error', e));
    }

    // Persist progress report to Cloud Firestore (Confirmed Write)
    try {
      if (isOnline) {
        setSyncStatus('SYNCING');
        await saveTicketToFirestore(updatedWithProgress);
        setSyncStatus('SAVED');
        setLastSyncTime(new Date().toISOString());
        toast.success(
          `Laporan WO ${ticket.woNumber} (${finalStatusName}) berhasil disimpan dan sedang menunggu approval Dispatch.`,
          'Laporan Tersimpan (Butuh Approval)'
        );
      } else {
        await saveTicketsOffline([updatedWithProgress]);
        toast.warning(`Laporan WO ${ticket.woNumber} tersimpan offline di IndexedDB lokal (Butuh Approval).`, 'Laporan Offline');
      }
    } catch (err: any) {
      setSyncStatus('ERROR');
      console.error('Failed writing progress report to Firestore:', err);
      toast.error('Gagal menyimpan progress report ke Cloud Firestore: ' + (err?.message || err), 'Penyimpanan Gagal');
      return { success: false, error: err?.message || 'Gagal menyimpan ke Cloud Firestore' };
    }

    fetch(`/api/tickets/${ticketId}/progress-report`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        entry,
        status: nextInstallerStatus,
        remarks: finalRemarks,
        reportStatusId: finalStatusId,
        reportStatusLabel: finalStatusName,
        reasonReportId: finalReasonId,
        reasonReportLabel: finalReasonName,
        rootcauseId: finalRootcauseId,
        rootcauseLabel: finalRootcauseName
      })
    }).catch(e => console.error('Error saving progress report to server:', e));

    return { success: true, report: entry };
  };

  const verifyTechnicalReport = (ticketId: string) => {
    if (currentUser.role !== 'dispatch' && currentUser.role !== 'super_admin') return;
    const target = tickets.find(t => t.id === ticketId);
    if (!target || !target.technicalReport) return;

    const verifiedTicket: Ticket = {
      ...target,
      technicalReport: {
        ...target.technicalReport,
        verifiedByDispatch: true,
        verifiedAt: new Date().toISOString(),
        verifiedBy: currentUser.name
      }
    };

    setTickets(prev =>
      prev.map(t => (t.id === ticketId ? verifiedTicket : t))
    );
    addAuditLog('Report Verified', 'ticket', ticketId, `Dispatch ${currentUser.name} verified technician work report`);

    saveTicketToFirestore(verifiedTicket)
      .then(() => {
        toast.success('Laporan teknis pekerjaan lapangan berhasil diverifikasi oleh Dispatch.', 'Laporan Terverifikasi');
      })
      .catch(err => {
        toast.error('Gagal memverifikasi laporan di Cloud Firestore: ' + (err?.message || err), 'Verifikasi Gagal');
      });
  };

  const approveProgressReport = async (
    ticketId: string,
    notes?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (currentUser.role !== 'dispatch' && currentUser.role !== 'super_admin') {
      return { success: false, error: 'Akses Ditolak: Hanya Dispatch dan Super Admin yang berwenang menyetujui laporan.' };
    }

    const ticket = getTicketById(ticketId);
    if (!ticket) return { success: false, error: 'Tiket tidak ditemukan.' };

    // 1. Validasi: Tombol APPROVE hanya dapat diproses jika WO benar-benar dalam status BUTUH APPROVAL
    if (ticket.approvalStatus !== 'BUTUH APPROVAL') {
      return {
        success: false,
        error: 'Validasi Gagal: Tombol APPROVE hanya dapat diproses jika tiket berstatus BUTUH APPROVAL.'
      };
    }

    // 2. Validasi terhadap laporan Installer
    const hasReport = (ticket.progressReports && ticket.progressReports.length > 0) || !!ticket.technicalReport;
    if (!hasReport) {
      return {
        success: false,
        error: 'Validasi Gagal: Laporan pengerjaan teknisi tidak ditemukan pada tiket ini.'
      };
    }

    const now = new Date().toISOString();
    const statusName = (ticket.reportStatusLabel || ticket.statusWOInstaller || '').toUpperCase();
    const dispatchUid = currentUser.id || (currentUser as any).userId || currentUser.firebaseUid || '';

    // Perbarui status approval pada progress report terakhir tanpa merusak histori
    const updatedReports = (ticket.progressReports || []).map((p, idx) =>
      idx === 0
        ? {
            ...p,
            approvalStatus: 'APPROVED' as WOApprovalStatus,
            approvedAt: now,
            approvedBy: currentUser.name,
            approvedById: dispatchUid
          }
        : p
    );

    // Update atomik: Status Approval APPROVED dan Status Ticket WO CLOSED tersimpan bersamaan
    const updatedTicket: Ticket = {
      ...ticket,
      approvalStatus: 'APPROVED',
      approvalNotes: notes || '',
      approvedAt: now,
      approvedBy: currentUser.name,
      approvedById: dispatchUid,
      progressReports: updatedReports,
      technicalReport: ticket.technicalReport ? {
        ...ticket.technicalReport,
        verifiedByDispatch: true,
        verifiedAt: now,
        verifiedBy: currentUser.name
      } : undefined,
      // Status agen resmi CLOSED saat diapprove Dispatch
      statusWOAgent: 'Closed',
      closedAt: now,
      closedBy: currentUser.name,
      closedById: dispatchUid,
      closeNotes: notes || 'Laporan teknisi disetujui (APPROVED) dan WO otomatis resmi ditutup (CLOSED) oleh Dispatch',
      // Jika status teknisi masih aktif, tandai Completed
      statusWOInstaller: (ticket.statusWOInstaller === 'Assigned' || ticket.statusWOInstaller === 'En Route' || ticket.statusWOInstaller === 'On Site')
        ? 'Completed'
        : ticket.statusWOInstaller,
      updatedAt: now,
      updatedBy: currentUser.name
    };

    setTickets(prev => prev.map(t => (t.id === ticketId ? updatedTicket : t)));

    const activity: TicketActivity = {
      id: 'act-' + Date.now(),
      ticketId,
      woNumber: ticket.woNumber,
      action: 'Laporan Disetujui (Approved) & WO Resmi Closed',
      description: `Dispatch ${currentUser.name} (UID: ${dispatchUid}) menyetujui laporan teknisi dan otomatis menutup tiket WO. Catatan: ${notes || '-'}`,
      performedBy: currentUser.name,
      userRole: currentUser.role,
      timestamp: now
    };
    setTicketActivities(prev => [activity, ...prev]);

    addAuditLog(
      'Report Approved & Closed',
      'ticket',
      ticketId,
      `Dispatch ${currentUser.name} (UID: ${dispatchUid}) menyetujui laporan dan otomatis menutup tiket WO ${ticket.woNumber} (Status: ${statusName} -> CLOSED)`
    );

    // Persist ke Cloud Firestore (Pastikan update Firestore berhasil sebelum mengembalikan success)
    try {
      await saveTicketToFirestore(updatedTicket);
      toast.success(
        'Ticket WO berhasil di-approve dan otomatis ditutup.',
        'Approval Berhasil'
      );
    } catch (err: any) {
      console.error('[Firestore] Error saving approved report:', err);
      // Rollback local state jika gagal
      setTickets(prev => prev.map(t => (t.id === ticketId ? ticket : t)));
      return { success: false, error: err?.message || 'Gagal menyimpan status approval ke Cloud Firestore.' };
    }

    return { success: true };
  };

  const rejectProgressReport = async (
    ticketId: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (currentUser.role !== 'dispatch' && currentUser.role !== 'super_admin') {
      return { success: false, error: 'Akses Ditolak: Hanya Dispatch dan Super Admin yang berwenang menolak laporan.' };
    }

    if (!reason || !reason.trim()) {
      return { success: false, error: 'Alasan penolakan / revisi laporan wajib diisi.' };
    }

    const ticket = getTicketById(ticketId);
    if (!ticket) return { success: false, error: 'Tiket tidak ditemukan.' };

    const now = new Date().toISOString();
    const updatedReports = (ticket.progressReports || []).map((p, idx) =>
      idx === 0
        ? { ...p, approvalStatus: 'REJECTED' as WOApprovalStatus }
        : p
    );

    const updatedTicket: Ticket = {
      ...ticket,
      approvalStatus: 'REJECTED',
      rejectionReason: reason.trim(),
      rejectedAt: now,
      rejectedBy: currentUser.name,
      rejectedById: currentUser.id,
      progressReports: updatedReports,
      statusWOAgent: 'In Progress', // Kembalikan ke proses agar teknisi merevisi
      updatedAt: now,
      updatedBy: currentUser.name
    };

    setTickets(prev => prev.map(t => (t.id === ticketId ? updatedTicket : t)));

    const activity: TicketActivity = {
      id: 'act-' + Date.now(),
      ticketId,
      woNumber: ticket.woNumber,
      action: 'Laporan Ditolak / Perlu Revisi',
      description: `Dispatch ${currentUser.name} meminta revisi laporan: "${reason.trim()}"`,
      performedBy: currentUser.name,
      userRole: currentUser.role,
      timestamp: now
    };
    setTicketActivities(prev => [activity, ...prev]);

    addAuditLog(
      'Report Rejected',
      'ticket',
      ticketId,
      `Dispatch ${currentUser.name} menolak laporan WO ${ticket.woNumber}: "${reason.trim()}"`
    );

    try {
      await saveTicketToFirestore(updatedTicket);
    } catch (err: any) {
      console.warn('[Firestore] Error saving rejected report:', err);
      return { success: false, error: err?.message || 'Gagal menyimpan status penolakan ke Firestore.' };
    }

    return { success: true };
  };

  // -------------------------------------------------------------
  // Report Dropdown Categories CRUD (Report Status, Reason Report, Rootcause)
  // -------------------------------------------------------------
  const addReportDropdownCategory = async (
    data: Omit<ReportDropdownCategory, 'id' | 'createdAt'>
  ): Promise<{ success: boolean; category?: ReportDropdownCategory; error?: string }> => {
    if (!data.name || !data.name.trim()) {
      return { success: false, error: 'Nama kategori wajib diisi.' };
    }

    const cleanName = data.name.trim();

    // Check duplicate within same categoryType
    const duplicate = reportDropdownCategories.some(
      c => c.categoryType === data.categoryType && !c.isDeleted && c.name.toLowerCase().trim() === cleanName.toLowerCase()
    );
    if (duplicate) {
      return { success: false, error: `Kategori "${cleanName}" sudah ada dalam daftar ${data.categoryType}.` };
    }

    const nextOrder = data.sortOrder !== undefined
      ? data.sortOrder
      : (reportDropdownCategories.filter(c => c.categoryType === data.categoryType).length + 1);

    const now = new Date().toISOString();
    const newCategory: ReportDropdownCategory = {
      id: `rdc-${data.categoryType.slice(0, 2)}-${Date.now()}`,
      categoryType: data.categoryType,
      name: cleanName,
      description: data.description?.trim() || '',
      isActive: data.isActive !== undefined ? data.isActive : true,
      sortOrder: nextOrder,
      createdAt: now,
      updatedAt: now,
      createdBy: currentUser.name,
      updatedBy: currentUser.name,
      isDeleted: false
    };

    setReportDropdownCategories(prev => [...prev, newCategory]);

    try {
      await saveReportDropdownCategoryToFirestore(newCategory);
      addAuditLog(
        'Dropdown Category Added',
        'global_config',
        newCategory.id,
        `Menambahkan kategori ${newCategory.categoryType}: "${newCategory.name}"`
      );
      toast.success(`Kategori "${newCategory.name}" berhasil disimpan ke Cloud Firestore.`, 'Kategori Ditambahkan');
      return { success: true, category: newCategory };
    } catch (err: any) {
      console.error('[Firestore] Error saving category:', err);
      return { success: false, error: err?.message || 'Gagal menyimpan kategori ke Firestore.' };
    }
  };

  const updateReportDropdownCategory = async (
    id: string,
    updates: Partial<ReportDropdownCategory>
  ): Promise<{ success: boolean; error?: string }> => {
    const existing = reportDropdownCategories.find(c => c.id === id);
    if (!existing) {
      return { success: false, error: 'Kategori tidak ditemukan.' };
    }

    if (updates.name && !updates.name.trim()) {
      return { success: false, error: 'Nama kategori tidak boleh kosong.' };
    }

    // Check duplicate if name changed
    if (updates.name && updates.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = reportDropdownCategories.some(
        c => c.id !== id && c.categoryType === existing.categoryType && !c.isDeleted && c.name.toLowerCase().trim() === updates.name!.trim().toLowerCase()
      );
      if (duplicate) {
        return { success: false, error: `Kategori "${updates.name}" sudah ada dalam daftar.` };
      }
    }

    const now = new Date().toISOString();
    const updatedCategory: ReportDropdownCategory = {
      ...existing,
      ...updates,
      name: updates.name ? updates.name.trim() : existing.name,
      description: updates.description !== undefined ? updates.description.trim() : existing.description,
      updatedAt: now,
      updatedBy: currentUser.name
    };

    setReportDropdownCategories(prev => prev.map(c => c.id === id ? updatedCategory : c));

    try {
      await saveReportDropdownCategoryToFirestore(updatedCategory);
      addAuditLog(
        'Dropdown Category Updated',
        'global_config',
        id,
        `Memperbarui kategori ${existing.categoryType}: "${updatedCategory.name}"`
      );
      toast.success(`Kategori "${updatedCategory.name}" berhasil diperbarui di Cloud Firestore.`, 'Kategori Diperbarui');
      return { success: true };
    } catch (err: any) {
      console.error('[Firestore] Error updating category:', err);
      return { success: false, error: err?.message || 'Gagal memperbarui kategori di Firestore.' };
    }
  };

  const deleteReportDropdownCategory = async (
    id: string,
    permanent: boolean = false
  ): Promise<{ success: boolean; error?: string }> => {
    const existing = reportDropdownCategories.find(c => c.id === id);
    if (!existing) {
      return { success: false, error: 'Kategori tidak ditemukan.' };
    }

    // Soft delete to protect historical tickets that used this category
    if (permanent) {
      setReportDropdownCategories(prev => prev.filter(c => c.id !== id));
      try {
        await deleteReportDropdownCategoryFromFirestore(id);
        addAuditLog(
          'Dropdown Category Permanently Deleted',
          'global_config',
          id,
          `Menghapus permanen kategori ${existing.categoryType}: "${existing.name}"`
        );
        toast.warning(`Kategori "${existing.name}" dihapus permanen dari Cloud Firestore.`, 'Kategori Dihapus');
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Gagal menghapus kategori dari Firestore.' };
      }
    } else {
      // Soft Delete
      const now = new Date().toISOString();
      const softDeleted: ReportDropdownCategory = {
        ...existing,
        isActive: false,
        isDeleted: true,
        updatedAt: now,
        updatedBy: currentUser.name
      };

      setReportDropdownCategories(prev => prev.map(c => c.id === id ? softDeleted : c));
      try {
        await softDeleteReportDropdownCategoryInFirestore(id, currentUser.name);
        addAuditLog(
          'Dropdown Category Soft Deleted',
          'global_config',
          id,
          `Menonaktifkan & menandai terhapus kategori ${existing.categoryType}: "${existing.name}"`
        );
        toast.info(`Kategori "${existing.name}" dinonaktifkan (laporan lama tetap aman).`, 'Kategori Dinonaktifkan');
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Gagal soft-delete kategori di Firestore.' };
      }
    }
  };

  const toggleReportDropdownCategoryActive = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const existing = reportDropdownCategories.find(c => c.id === id);
    if (!existing) return { success: false, error: 'Kategori tidak ditemukan.' };

    return updateReportDropdownCategory(id, { isActive: !existing.isActive });
  };

  // Close Ticket Workflow

  const closeTicket = (ticketId: string, closeNotes: string) => {
    // Only Dispatch and Super Admin can close tickets!
    if (currentUser.role !== 'dispatch' && currentUser.role !== 'super_admin') {
      toast.error('Hanya Agent Dispatch yang memiliki hak akses menutup (Close) tiket.', 'Akses Ditolak');
      return { success: false, error: 'Hanya Agent Dispatch yang memiliki hak akses menutup (Close) tiket.' };
    }

    const ticket = getTicketById(ticketId);
    if (!ticket) {
      toast.error('Tiket tidak ditemukan.', 'Error');
      return { success: false, error: 'Tiket tidak ditemukan.' };
    }

    if (!closeNotes || closeNotes.trim().length < 5) {
      toast.error('Catatan penutupan tiket wajib diisi minimal 5 karakter.', 'Validasi Gagal');
      return { success: false, error: 'Catatan penutupan tiket wajib diisi minimal 5 karakter.' };
    }

    const now = new Date().toISOString();
    const closedTicket: Ticket = {
      ...ticket,
      statusWOAgent: 'Closed',
      closedAt: now,
      closedBy: currentUser.name,
      closeNotes: closeNotes.trim(),
      updatedAt: now,
      updatedBy: currentUser.name
    };

    setTickets(prev =>
      prev.map(t => (t.id === ticketId ? closedTicket : t))
    );

    const activity: TicketActivity = {
      id: 'act-' + Date.now(),
      ticketId,
      woNumber: ticket.woNumber,
      action: 'Tiket Resmi Ditutup (Closed)',
      description: `Closed by Dispatch: ${closeNotes.trim()}`,
      performedBy: currentUser.name,
      userRole: currentUser.role,
      timestamp: now
    };
    setTicketActivities(prev => [activity, ...prev]);

    fetch(`/api/tickets/${ticketId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        statusWOAgent: 'Closed',
        closedAt: now,
        closedBy: currentUser.name,
        closeNotes: closeNotes.trim()
      })
    }).catch(e => console.error('Error syncing close ticket to server:', e));

    addAuditLog('Ticket Closed', 'ticket', ticketId, `Dispatch ${currentUser.name} officially closed WO ${ticket.woNumber}`);

    setSyncStatus('SYNCING');
    saveTicketToFirestore(closedTicket)
      .then(() => {
        setSyncStatus('SAVED');
        setLastSyncTime(new Date().toISOString());
        toast.success(`Tiket WO ${ticket.woNumber} resmi ditutup (Closed) oleh Dispatch.`, 'Tiket Ditutup');
      })
      .catch(err => {
        setSyncStatus('ERROR');
        toast.error('Gagal menyimpan status penutupan di Cloud Firestore: ' + (err?.message || err), 'Gagal');
      });

    return { success: true };
  };

  const reopenTicket = (ticketId: string, reason: string) => {
    if (currentUser.role !== 'dispatch' && currentUser.role !== 'super_admin') {
      toast.error('Hanya Dispatch atau Super Admin yang dapat membuka kembali tiket.', 'Akses Ditolak');
      return { success: false, error: 'Hanya Dispatch atau Super Admin yang dapat membuka kembali tiket.' };
    }
    const ticket = getTicketById(ticketId);
    if (!ticket) {
      toast.error('Tiket tidak ditemukan.', 'Error');
      return { success: false, error: 'Tiket tidak ditemukan.' };
    }

    const now = new Date().toISOString();
    const reopenedTicket: Ticket = {
      ...ticket,
      statusWOAgent: 'In Progress',
      reopenReason: reason,
      closedAt: undefined,
      closedBy: undefined,
      updatedAt: now,
      updatedBy: currentUser.name
    };

    setTickets(prev =>
      prev.map(t => (t.id === ticketId ? reopenedTicket : t))
    );

    addAuditLog('Ticket Reopened', 'ticket', ticketId, `Reopened WO ${ticket.woNumber}. Alasan: ${reason}`);

    setSyncStatus('SYNCING');
    saveTicketToFirestore(reopenedTicket)
      .then(() => {
        setSyncStatus('SAVED');
        setLastSyncTime(new Date().toISOString());
        toast.info(`Tiket WO ${ticket.woNumber} berhasil dibuka kembali (Reopened).`, 'Tiket Dibuka Kembali');
      })
      .catch(err => {
        setSyncStatus('ERROR');
        toast.error('Gagal membuka tiket di Cloud Firestore: ' + (err?.message || err), 'Gagal');
      });

    return { success: true };
  };

  // Live Chat
  const sendTicketMessage = (ticketId: string, text: string, attachments: ChatAttachment[] = [], category?: string) => {
    const ticket = getTicketById(ticketId);
    if (!ticket) return { success: false, error: 'Tiket tidak ditemukan.' };

    // Strict Rule: Leader tidak bisa kirim chat (hanya super admin, dispatch, installer)
    if (currentUser.role === 'leader') {
      toast.error('Akses Dibatasi: Peran Leader hanya dapat membaca chat dan tidak diizinkan mengirim pesan.', 'Akses Ditolak');
      return { success: false, error: 'Peran Leader tidak diizinkan mengirim pesan chat.' };
    }

    if (!text.trim() && attachments.length === 0) {
      return { success: false, error: 'Pesan atau lampiran foto tidak boleh kosong.' };
    }

    // Requirement 7: Validasi wajib bagi Installer untuk memilih kategori chat
    if (currentUser.role === 'installer') {
      const myId = currentUser.id || '';
      const myUsername = (currentUser.username || '').toLowerCase().trim();
      const myName = (currentUser.name || '').toLowerCase().trim();
      const tInst = (ticket.installerName || '').toLowerCase().trim();

      const isMine =
        (myId && (ticket.assignedTo === myId || ticket.installerId === myId || ticket.assignedToUid === myId)) ||
        (myUsername && ticket.assignedTo?.toLowerCase() === myUsername) ||
        (myName && (tInst === myName || isInstallerMatch(ticket.installerName, myName))) ||
        (myUsername && (tInst === myUsername || isInstallerMatch(ticket.installerName, myUsername)));

      if (!isMine) {
        toast.error('Akses Ditolak: Anda hanya berwenang mengirim pesan pada tiket yang ditugaskan kepada Anda.');
        return { success: false, error: 'Akses Ditolak: Anda hanya berwenang mengirim pesan pada tiket yang ditugaskan kepada Anda.' };
      }

      const chosenCategory = (category || ticket.chatCategory || '').trim();
      if (!chosenCategory || chosenCategory.toUpperCase() === 'UNCLASSIFIED') {
        toast.error('Pilih kategori chat terlebih dahulu sebelum memulai percakapan.', 'Kategori Wajib Dipilih');
        return { success: false, error: 'Pilih kategori chat terlebih dahulu sebelum memulai percakapan.' };
      }
    }

    const effectiveCategory = (category || ticket.chatCategory || '').trim();
    const isProgressCategory = effectiveCategory.toUpperCase() === 'PROGRESS';
    const now = new Date().toISOString();

    const newMessage: TicketMessage = {
      id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      ticketId,
      woNumber: ticket.woNumber,
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderRole: currentUser.role,
      text: text.trim(),
      category: effectiveCategory || undefined,
      attachments,
      timestamp: now,
      readBy: [currentUser.id]
    };

    setTicketMessages(prev => [...prev, newMessage]);

    // Update ticket message indicators & sync chatCategory
    let updatedTicketChat: Ticket = {
      ...ticket,
      chatCategory: effectiveCategory || ticket.chatCategory,
      chatMessagesCount: (ticket.chatMessagesCount || 0) + 1,
      lastMessageAt: now,
      lastMessageSnippet: text.trim() || (attachments.length > 0 ? `[Foto: ${attachments[0].fileName}]` : ''),
      updatedAt: now,
      updatedBy: currentUser.name
    };

    // Requirement 3.A & Requirement 6: Integrasi Live Chat Kategori/Pesan PROGRESS dengan Auto Check-in & Status WO
    const isProgressText = isProgressCheckInMessage(text);
    const isProgressActivity = isProgressCategory || isProgressText;

    if (currentUser.role === 'installer' && isProgressActivity) {
      // Automatic Check-in: Only record on first valid PROGRESS activity of the active session
      if (!ticket.checkInAt || ticket.workSessionStatus === 'Belum Check-in') {
        updatedTicketChat.checkInAt = now;
        updatedTicketChat.workSessionStatus = 'Sedang Dikerjakan';

        if (!Array.isArray(updatedTicketChat.workSessions)) {
          updatedTicketChat.workSessions = [];
        }

        const hasActiveSession = updatedTicketChat.workSessions.some(s => s.status === 'Sedang Dikerjakan');
        if (!hasActiveSession) {
          updatedTicketChat.workSessions.push({
            sessionId: 'ws_' + Date.now(),
            checkInAt: now,
            status: 'Sedang Dikerjakan'
          });
        }

        addAuditLog(
          'Installer Check-in Recorded',
          'ticket',
          ticketId,
          `Teknisi ${currentUser.name} check-in otomatis pada WO ${ticket.woNumber} via pesan PROGRESS Live Chat (${formatJakartaTimestamp(now)})`
        );

        toast.info(
          `Check-in berhasil tercatat pada ${formatJakartaTimestamp(now)}. Durasi kerja mulai dihitung.`,
          'Check-in Otomatis'
        );
      }

      const isClosed = ticket.statusWOAgent === 'Closed';
      const isApprovalState = ticket.approvalStatus === 'BUTUH APPROVAL' || ticket.approvalStatus === 'APPROVED';

      // Rule: Jangan menimpa status BUTUH APPROVAL, APPROVED, atau CLOSED
      if (!isClosed && !isApprovalState) {
        const alreadyProgress =
          ticket.statusWOAgent === 'In Progress' &&
          (ticket.statusWOInstaller === 'PROGRESS' || ticket.statusWOInstaller === 'On Site');

        if (!alreadyProgress) {
          updatedTicketChat.statusWOAgent = 'In Progress';
          updatedTicketChat.statusWOInstaller = 'PROGRESS';
          if (!updatedTicketChat.workStartedAt) {
            updatedTicketChat.workStartedAt = now;
            updatedTicketChat.workStartedBy = currentUser.name;
            updatedTicketChat.workStartedById = currentUser.id;
          }

          const progressActivity: TicketActivity = {
            id: 'act-' + Date.now(),
            ticketId,
            woNumber: ticket.woNumber,
            action: 'Status Diperbarui ke PROGRESS via Live Chat',
            description: `Teknisi ${currentUser.name} mengirim chat dengan aktivitas PROGRESS. Status WO otomatis menjadi PROGRESS.`,
            performedBy: currentUser.name,
            userRole: currentUser.role,
            timestamp: now
          };
          setTicketActivities(prev => [progressActivity, ...prev]);

          addAuditLog(
            'Chat Status PROGRESS',
            'ticket',
            ticketId,
            `Status WO ${ticket.woNumber} otomatis diperbarui ke PROGRESS setelah teknisi ${currentUser.name} mengirim pesan PROGRESS.`
          );

          toast.info(
            `Status Work Order ${ticket.woNumber} otomatis ditandai sebagai PROGRESS.`,
            'Status WO: PROGRESS'
          );
        }
      }
    }

    setTickets(prev =>
      prev.map(t => (t.id === ticketId ? updatedTicketChat : t))
    );

    sendChatMessageToFirestore(newMessage).catch(e => console.warn('[Firestore] Error saving chat message:', e));
    saveTicketToFirestore(updatedTicketChat).catch(e => console.warn('[Firestore] Error syncing ticket status from chat:', e));

    // Also persist message & check-in to server API
    fetch(`/api/tickets/${ticketId}/messages`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ text: text.trim(), attachments })
    }).catch(e => console.error('Error syncing chat message to server:', e));

    if (attachments.length > 0) {
      addAuditLog('Chat Attachment Uploaded', 'ticket', ticketId, `${currentUser.name} uploaded ${attachments.length} photo(s) in ticket chat`);
    }

    return { success: true, message: newMessage };
  };

  const getMessagesForTicket = (ticketId: string) => {
    return ticketMessages
      .filter(m => m.ticketId === ticketId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  };

  const markTicketMessagesAsRead = (ticketId: string) => {
    setTicketMessages(prev => {
      let changed = false;
      const next = prev.map(m => {
        if (m.ticketId !== ticketId) return m;
        const currentReaders = m.readBy || [];
        if (currentReaders.includes(currentUser.id)) return m;
        changed = true;
        return { ...m, readBy: [...currentReaders, currentUser.id] };
      });
      return changed ? next : prev;
    });
  };

  const getTicketUnreadCount = (ticketId: string): number => {
    return ticketMessages.filter(
      m => m.ticketId === ticketId &&
           m.senderId !== currentUser.id &&
           !(m.readBy || []).includes(currentUser.id)
    ).length;
  };

  // Ticket CRUD
  const getTicketById = (id: string) => {
    return tickets.find(t => t.id === id);
  };

  const createTicket = (data: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt' | 'isArchived'>): Ticket => {
    const rawWo = data.woNumber || (data as any).workOrderNumber || '';
    const normWo = normalizeWoNumber(rawWo);

    if (!normWo || !isValidWoNumber(normWo)) {
      toast.error('Gagal membuat WO: Nomor WO tidak valid atau kosong.', 'Validasi Gagal');
      throw new Error(`Nomor WO "${rawWo}" tidak valid.`);
    }

    // Check if WO already exists in current state
    const existing = tickets.find(t => normalizeWoNumber(t.woNumber || (t as any).workOrderNumber) === normWo);
    if (existing) {
      toast.warning(`Work Order ${normWo} sudah terdaftar di database. Duplikasi dicegah.`, 'Duplikasi Dicegah');
      return existing;
    }

    const deterministicId = getDeterministicTicketId(normWo);
    const created: Ticket = {
      ...data,
      id: deterministicId,
      woNumber: normWo,
      workOrderNumber: normWo,
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser.name
    };

    const { ticket: processed, logs } = executeWorkflowsOnTicket(
      created,
      'ticket_created',
      workflowRules,
      templates,
      currentUser.name,
      currentUser.role
    );

    setTickets(prev => deduplicateTicketsInMemory([processed, ...prev]));
    setSyncStatus('SYNCING');
    saveTicketToFirestore(processed)
      .then(() => {
        setSyncStatus('SAVED');
        setLastSyncTime(new Date().toISOString());
      })
      .catch(e => {
        console.warn('[Firestore] Error saving created ticket:', e);
        setSyncStatus('ERROR');
      });

    if (logs.length > 0) {
      setTicketActivities(prev => [...logs, ...prev]);
    }

    addAuditLog('Ticket Created', 'ticket', processed.id, `Created Work Order ${processed.woNumber} for ${processed.customerName}`);
    return processed;
  };

  const updateTicket = (id: string, updates: Partial<Ticket>, reason?: string): { success: boolean; error?: string } => {
    const existing = getTicketById(id);
    if (!existing) return { success: false, error: 'Tiket tidak ditemukan.' };

    // Installer can only update technicalReport and remarks on assigned WO
    if (currentUser.role === 'installer') {
      const assignedName = (existing.installerName || '').toLowerCase().trim();
      const currentName = (currentUser.name || '').toLowerCase().trim();
      if (assignedName !== currentName) {
        return { success: false, error: 'Akses Ditolak: Anda hanya berwenang memperbarui tiket yang ditugaskan kepada akun Anda.' };
      }
      const coreFields: (keyof Ticket)[] = ['woNumber', 'idCustomer', 'customerName', 'customerPhone', 'slotTime', 'contactorName', 'leaderName', 'installerName', 'area'];
      const hasCoreEdits = coreFields.some(f => updates[f] !== undefined && updates[f] !== existing[f]);
      if (hasCoreEdits) {
        return { success: false, error: 'Akses Ditolak: Teknisi hanya diizinkan memperbarui laporan teknis dan status penyelesaian.' };
      }
    } else if (currentUser.role === 'leader') {
      // Leader is specifically authorized to assign/update installerName, slotTime, and remarks
      const allowedKeys = ['installerName', 'slotTime', 'remarksWOInstaller'];
      const updateKeys = Object.keys(updates);
      const hasDisallowedKeys = updateKeys.some(k => !allowedKeys.includes(k));
      if (hasDisallowedKeys) {
        return { success: false, error: 'Akses Ditolak: Leader hanya berwenang menugaskan teknisi, slot waktu, dan catatan pada tiket timnya.' };
      }
    }

    // Strict Rule: Non-leaders cannot modify installerName
    if (updates.installerName !== undefined && currentUser.role !== 'leader') {
      delete (updates as any).installerName;
    }

    let mergedTicket: Ticket | undefined;
    setTickets(prev =>
      prev.map(t => {
        if (t.id !== id) return t;
        const merged: Ticket = {
          ...t,
          ...updates,
          statusWOInstaller: updates.installerName ? 'Assigned' : t.statusWOInstaller,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser.name
        };

        if (updates.slotTime && updates.slotTime !== t.slotTime) {
          executeWorkflowsOnTicket(merged, 'slot_time_changed', workflowRules, templates, currentUser.name, currentUser.role);
        }

        if (updates.installerName && updates.installerName !== t.installerName) {
          const res = executeWorkflowsOnTicket(merged, 'installer_assigned', workflowRules, templates, currentUser.name, currentUser.role);
          if (res.logs.length > 0) {
            setTicketActivities(act => [...res.logs, ...act]);
          }
        }

        mergedTicket = merged;
        return merged;
      })
    );

    if (mergedTicket) {
      setSyncStatus('SYNCING');
      saveTicketToFirestore(mergedTicket)
        .then(() => {
          setSyncStatus('SAVED');
          setLastSyncTime(new Date().toISOString());
        })
        .catch(e => {
          console.warn('[Firestore] Error updating ticket:', e);
          setSyncStatus('ERROR');
        });
    }

    fetch(`/api/tickets/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates)
    }).catch(e => console.error('Error syncing ticket update to server:', e));

    addAuditLog('Ticket Updated', 'ticket', id, `Updated fields on ticket: ${reason || Object.keys(updates).join(', ')}`);
    return { success: true };
  };

  const assignTicketPersonnel = (ticketId: string, leaderName?: string, installerName?: string) => {
    // Strict Rule: Hanya LEADER yang bisa assign WO ke teknisi
    if (installerName !== undefined && installerName !== '') {
      if (currentUser.role !== 'leader') {
        addAuditLog(
          'Unauthorized Technician Assignment Blocked',
          'ticket',
          ticketId,
          `Penugasan teknisi ditolak: Hanya Leader yang berwenang menugaskan WO ke teknisi. Operator: ${currentUser.name} (${currentUser.role})`
        );
        toast.error('Akses Ditolak: Hanya Leader yang berwenang menugaskan WO ke teknisi.', 'Otoritas Dibatasi');
        return;
      }
    }

    // Only Dispatch, Super Admin, or Leader (for their contractor) can assign personnel
    if (currentUser.role !== 'super_admin' && currentUser.role !== 'dispatch' && currentUser.role !== 'leader') {
      return;
    }

    const targetTicket = getTicketById(ticketId);
    let updatedTicketItem: Ticket | undefined;

    setTickets(prev =>
      prev.map(t => {
        if (t.id !== ticketId) return t;
        const canAssignInstaller = currentUser.role === 'leader';
        const canAssignLeader = currentUser.role === 'super_admin' || currentUser.role === 'dispatch';
        let updated: Ticket = {
          ...t,
          leaderName: canAssignLeader && leaderName !== undefined ? leaderName : t.leaderName,
          installerName: canAssignInstaller && installerName !== undefined ? installerName : t.installerName,
          statusWOInstaller: (canAssignInstaller && installerName) ? 'Assigned' : t.statusWOInstaller,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser.name
        };

        if (canAssignInstaller && installerName) {
          const res = executeWorkflowsOnTicket(updated, 'installer_assigned', workflowRules, templates, currentUser.name, currentUser.role);
          updated = res.ticket;
          if (res.logs.length > 0) {
            setTicketActivities(act => [...res.logs, ...act]);
          }
        }

        updatedTicketItem = updated;
        return updated;
      })
    );

    if (updatedTicketItem) {
      setSyncStatus('SYNCING');
      saveTicketToFirestore(updatedTicketItem)
        .then(() => {
          setSyncStatus('SAVED');
          setLastSyncTime(new Date().toISOString());
          if (installerName && currentUser.role === 'leader') {
            toast.success(`Teknisi ${installerName} berhasil ditugaskan ke WO ${targetTicket?.woNumber || ''}!`, 'Penugasan Berhasil');
          }
        })
        .catch(err => {
          setSyncStatus('ERROR');
          toast.error('Gagal menyimpan penugasan ke Cloud Firestore: ' + (err?.message || err), 'Penugasan Gagal');
        });
    }

    fetch('/api/tickets/assign', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        ticketId,
        leaderName,
        installerName
      })
    }).catch(e => console.error('Error syncing ticket assignment to server:', e));

    addAuditLog('Personnel Assigned', 'ticket', ticketId, `Leader: ${leaderName || '-'}, Installer: ${currentUser.role === 'leader' ? installerName || '-' : '(Otoritas Terbatas Leader)'}`);
  };

  const bulkAssignPersonnel = (
    ticketIds: string[],
    leaderName?: string,
    installerName?: string,
    slotTime?: string,
    remarks?: string
  ): { success: boolean; count: number } => {
    // Strict Rule: Hanya LEADER yang bisa assign WO ke teknisi
    if (installerName !== undefined && installerName !== '') {
      if (currentUser.role !== 'leader') {
        addAuditLog(
          'Unauthorized Bulk Technician Assignment Blocked',
          'ticket',
          'bulk',
          `Penugasan massal teknisi ditolak: Hanya Leader yang berwenang menugaskan WO ke teknisi. Operator: ${currentUser.name} (${currentUser.role})`
        );
        toast.error('Akses Ditolak: Hanya Leader yang berwenang menugaskan WO ke teknisi.', 'Otoritas Dibatasi');
        return { success: false, count: 0 };
      }
    }

    if (currentUser.role !== 'super_admin' && currentUser.role !== 'dispatch' && currentUser.role !== 'leader') {
      toast.error('Anda tidak memiliki wewenang untuk menugaskan personel.', 'Akses Ditolak');
      return { success: false, count: 0 };
    }

    const targetSet = new Set(ticketIds);
    let updatedCount = 0;
    const now = new Date().toISOString();
    const updatedTicketsList: Ticket[] = [];

    setTickets(prev =>
      prev.map(t => {
        if (!targetSet.has(t.id)) return t;
        updatedCount++;
        let updated: Ticket = {
          ...t,
          leaderName: leaderName !== undefined && leaderName !== '' ? leaderName : t.leaderName,
          installerName: installerName !== undefined && installerName !== '' ? installerName : t.installerName,
          slotTime: slotTime !== undefined && slotTime !== '' ? slotTime : t.slotTime,
          statusWOInstaller: installerName ? 'Assigned' : t.statusWOInstaller,
          remarksWOInstaller: remarks ? (t.remarksWOInstaller ? `${t.remarksWOInstaller}; ${remarks}` : remarks) : t.remarksWOInstaller,
          updatedAt: now,
          updatedBy: currentUser.name
        };

        if (installerName) {
          const res = executeWorkflowsOnTicket(updated, 'installer_assigned', workflowRules, templates, currentUser.name, currentUser.role);
          updated = res.ticket;
          if (res.logs.length > 0) {
            setTicketActivities(act => [...res.logs, ...act]);
          }
        }

        updatedTicketsList.push(updated);
        return updated;
      })
    );

    // Persist batch to Cloud Firestore
    setSyncStatus('SYNCING');
    batchSaveTicketsToFirestore(updatedTicketsList)
      .then(({ saved }) => {
        setSyncStatus('SAVED');
        setLastSyncTime(new Date().toISOString());
        toast.success(`Berhasil memperbarui penugasan untuk ${saved} tiket di Cloud Firestore.`, 'Penugasan Massal Sukses');
      })
      .catch(err => {
        setSyncStatus('ERROR');
        toast.error('Gagal menyimpan penugasan massal ke Cloud Firestore: ' + (err?.message || err), 'Gagal');
      });

    fetch('/api/tickets/assign', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        ticketIds,
        leaderName,
        installerName,
        slotTime,
        remarks
      })
    }).catch(e => console.error('Error syncing bulk assignment to server:', e));

    addAuditLog(
      'Bulk Personnel Assigned',
      'ticket',
      `${ticketIds.length} tickets`,
      `Bulk assigned ${ticketIds.length} tickets by ${currentUser.name}. Leader: ${leaderName || '-'}, Installer: ${installerName || '-'}, Slot: ${slotTime || 'Original'}`
    );

    return { success: true, count: ticketIds.length };
  };

  const reassignTicketPersonnel = (ticketId: string, newInstallerName: string, reason: string): { success: boolean; error?: string; historyEntry?: WOAssignmentHistory } => {
    // 1. RBAC check: Leader only (or Super Admin)
    if (currentUser.role !== 'leader' && currentUser.role !== 'super_admin') {
      const err = 'Akses Ditolak: Hanya Leader / Korlap berwenang melakukan Reassign WO.';
      toast.error(err, 'Akses Ditolak');
      return { success: false, error: err };
    }

    const ticket = getTicketById(ticketId);
    if (!ticket) {
      const err = 'Tiket Work Order tidak ditemukan.';
      toast.error(err, 'Error');
      return { success: false, error: err };
    }

    const targetInstaller = users.find(u => u.name === newInstallerName && u.role === 'installer') || {
      id: 'inst-' + Date.now(),
      name: newInstallerName,
      active: true,
      contractor: currentUser.contractor
    };

    // Call central reassignWOTechnician service engine
    const reassignRes = reassignWOTechnician(
      ticket,
      targetInstaller,
      {
        id: currentUser.id,
        name: currentUser.name,
        role: currentUser.role,
        contractor: currentUser.contractor,
        area: currentUser.area
      },
      reason
    );

    if (!reassignRes.success || !reassignRes.ticket) {
      toast.error(reassignRes.error || 'Gagal melakukan reassign WO.', 'Reassign Gagal');
      return { success: false, error: reassignRes.error };
    }

    // Update tickets state
    setTickets(prev => prev.map(t => t.id === ticketId ? reassignRes.ticket! : t));

    // Confirmed write to Cloud Firestore
    setSyncStatus('SYNCING');
    saveTicketToFirestore(reassignRes.ticket)
      .then(() => {
        setSyncStatus('SAVED');
        setLastSyncTime(new Date().toISOString());
        toast.success(`WO ${ticket.woNumber} berhasil dialihkan ke ${newInstallerName}!`, 'Reassign Berhasil');
      })
      .catch(err => {
        setSyncStatus('ERROR');
        toast.error('Gagal menyimpan reassign ke Cloud Firestore: ' + (err?.message || err), 'Reassign Gagal');
      });

    // Audit log
    addAuditLog(
      'WO Reassigned',
      'ticket',
      ticket.woNumber,
      `WO ${ticket.woNumber} dialihkan dari ${ticket.installerName || 'Unassigned'} ke ${newInstallerName} oleh ${currentUser.name}. Alasan: ${reason}`
    );

    // Call backend API async to persist and verify
    fetch('/api/tickets/reassign', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        ticketId,
        woNumber: ticket.woNumber,
        newInstallerName,
        reason
      })
    }).catch(e => console.warn('Backend reassign sync notice failed', e));

    return { success: true, historyEntry: reassignRes.historyEntry };
  };

  const updateTicketStatus = (ticketId: string, statusAgent?: any, statusInstaller?: any, remarks?: string) => {
    const target = getTicketById(ticketId);
    let updatedTicketItem: Ticket | undefined;

    setTickets(prev =>
      prev.map(t => {
        if (t.id !== ticketId) return t;
        const updated: Ticket = {
          ...t,
          ...(statusAgent ? { statusWOAgent: statusAgent } : {}),
          ...(statusInstaller ? { statusWOInstaller: statusInstaller } : {}),
          ...(remarks ? { remarksWOInstaller: remarks } : {}),
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser.name
        };

        if (statusInstaller === 'Completed') {
          executeWorkflowsOnTicket(updated, 'ticket_completed', workflowRules, templates, currentUser.name, currentUser.role);
        }

        updatedTicketItem = updated;
        return updated;
      })
    );

    if (updatedTicketItem) {
      setSyncStatus('SYNCING');
      saveTicketToFirestore(updatedTicketItem)
        .then(() => {
          setSyncStatus('SAVED');
          setLastSyncTime(new Date().toISOString());
          toast.info(`Status WO ${target?.woNumber || ticketId} diperbarui (${statusInstaller || statusAgent || 'Updated'}).`, 'Status Berubah');
        })
        .catch(err => {
          setSyncStatus('ERROR');
          toast.error('Gagal memperbarui status tiket di Cloud Firestore: ' + (err?.message || err), 'Gagal');
        });
    }

    addAuditLog('Status Changed', 'ticket', ticketId, `Agent: ${statusAgent || '-'}, Installer: ${statusInstaller || '-'}`);
  };

  const archiveTicket = (ticketId: string) => {
    const target = getTicketById(ticketId);
    if (!target) return;
    const archived: Ticket = {
      ...target,
      isArchived: true,
      archivedAt: new Date().toISOString(),
      archivedBy: currentUser.name
    };
    setTickets(prev =>
      prev.map(t => (t.id === ticketId ? archived : t))
    );
    setSyncStatus('SYNCING');
    archiveTicketInFirestore(ticketId, currentUser.name)
      .then(() => {
        setSyncStatus('SAVED');
        setLastSyncTime(new Date().toISOString());
        toast.info(`WO ${target?.woNumber || ticketId} dipindahkan ke arsip Cloud Firestore.`, 'Tiket Diarsipkan');
      })
      .catch(err => {
        setSyncStatus('ERROR');
        toast.error('Gagal mengarsipkan tiket di Cloud Firestore: ' + (err?.message || err), 'Gagal');
      });
    addAuditLog('Ticket Archived', 'ticket', ticketId, `Ticket moved to archive by ${currentUser.name}`);
  };

  const restoreTicket = (ticketId: string) => {
    const target = getTicketById(ticketId);
    if (!target) return;
    const restored: Ticket = {
      ...target,
      isArchived: false,
      isDeleted: false,
      archivedAt: undefined,
      archivedBy: undefined,
      deletedAt: undefined,
      deletedBy: undefined,
      deletionReason: undefined
    };
    setTickets(prev =>
      prev.map(t => (t.id === ticketId ? restored : t))
    );
    setSyncStatus('SYNCING');
    restoreTicketInFirestore(ticketId, currentUser.name)
      .then(() => {
        setSyncStatus('SAVED');
        setLastSyncTime(new Date().toISOString());
        toast.success(`WO ${target?.woNumber || ticketId} berhasil dipulihkan dari arsip Cloud Firestore.`, 'Tiket Dipulihkan');
      })
      .catch(err => {
        setSyncStatus('ERROR');
        toast.error('Gagal memulihkan tiket di Cloud Firestore: ' + (err?.message || err), 'Gagal');
      });
    addAuditLog('Ticket Restored', 'ticket', ticketId, `Ticket restored from archive/deletion by ${currentUser.name}`);
  };

  const deleteTicket = (ticketId: string, reason: string, permanent: boolean = false): { success: boolean; error?: string } => {
    // STRICT SECURITY POLICY: Only Management Data can delete WO!
    if (currentUser.role !== 'management_data') {
      const err = 'Akses Ditolak: Hanya akun dengan peran Management Data yang memiliki wewenang menghapus data Work Order.';
      addAuditLog('Unauthorized Deletion Attempt', 'ticket', ticketId, `${currentUser.name} (${currentUser.role}) mencoba menghapus WO tanpa izin Management Data`);
      toast.error(err, 'Akses Ditolak');
      return { success: false, error: err };
    }

    const ticket = getTicketById(ticketId);
    if (!ticket) {
      toast.error('Tiket tidak ditemukan.', 'Error');
      return { success: false, error: 'Tiket tidak ditemukan.' };
    }

    if (!reason || reason.trim().length < 5) {
      toast.error('Alasan penghapusan wajib diisi minimal 5 karakter.', 'Validasi Gagal');
      return { success: false, error: 'Alasan penghapusan wajib diisi minimal 5 karakter.' };
    }

    const now = new Date().toISOString();
    if (permanent) {
      setTickets(prev => prev.filter(t => t.id !== ticketId));
      addAuditLog('Ticket Permanently Deleted', 'ticket', ticketId, `Management Data ${currentUser.name} menghapus permanen WO ${ticket.woNumber}. Alasan: ${reason}`);
    } else {
      // Soft Delete
      setTickets(prev =>
        prev.map(t => {
          if (t.id !== ticketId) return t;
          return {
            ...t,
            isDeleted: true,
            deletedAt: now,
            deletedBy: currentUser.name,
            deletionReason: reason,
            updatedAt: now,
            updatedBy: currentUser.name
          };
        })
      );
      addAuditLog('Ticket Soft Deleted', 'ticket', ticketId, `Management Data ${currentUser.name} menghapus (soft delete) WO ${ticket.woNumber}. Alasan: ${reason}`);
    }

    const deletePromise = permanent
      ? deleteTicketFromFirestore(ticketId)
      : softDeleteTicketInFirestore(ticketId, currentUser.name, reason);

    setSyncStatus('SYNCING');
    deletePromise
      .then(() => {
        setSyncStatus('SAVED');
        setLastSyncTime(new Date().toISOString());
        if (permanent) {
          toast.warning(`WO ${ticket.woNumber} telah dihapus permanen dari Cloud Firestore.`, 'Dihapus Permanen');
        } else {
          toast.warning(`WO ${ticket.woNumber} berhasil dihapus (soft delete).`, 'WO Dihapus');
        }
      })
      .catch(err => {
        setSyncStatus('ERROR');
        toast.error('Gagal menghapus tiket di Cloud Firestore: ' + (err?.message || err), 'Gagal');
      });

    fetch(`/api/tickets/${ticketId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      body: JSON.stringify({ reason, permanent })
    }).catch(e => console.error('Error syncing ticket delete to server:', e));

    return { success: true };
  };

  const bulkImportTickets = (
    imported: Partial<Ticket>[],
    options?: { duplicatePolicy?: 'skip' | 'update_allowed' | 'review' }
  ) => {
    // Strict RBAC: Leader and Installer MUST be rejected
    if (currentUser.role !== 'super_admin' && currentUser.role !== 'dispatch') {
      addAuditLog('Unauthorized Import Blocked', 'import_batch', 'import-denied', `Akses import ditolak untuk peran ${currentUser.role}`);
      toast.error('Akses Ditolak: Hanya Super Admin atau Dispatch yang berwenang import tiket.', 'Akses Ditolak');
      return { importedCount: 0, updatedCount: 0, duplicatesIgnored: 0 };
    }

    const policy = options?.duplicatePolicy || 'skip';
    let importedCount = 0;
    let updatedCount = 0;
    let duplicatesIgnored = 0;
    const existingWos = new Set(tickets.map(t => t.woNumber.toUpperCase().trim()));

    // Automatic Contractor & Coverage Area Registration from Import Results
    const { newContractors, updatedContractors, newCoverageAreas: extractedNewAreas } = extractContractorsFromTickets(
      imported,
      contractors,
      coverageAreas
    );

    let activeContractors = [...contractors];
    if (newContractors.length > 0 || updatedContractors.length > 0) {
      setContractors(prev => {
        let updated = [...prev];
        updatedContractors.forEach(up => {
          const idx = updated.findIndex(c => c.id === up.id);
          if (idx >= 0) updated[idx] = up;
        });
        newContractors.forEach(nc => {
          if (!updated.some(c => c.id === nc.id || c.name.toLowerCase().trim() === nc.name.toLowerCase().trim())) {
            updated.push(nc);
          }
        });
        return updated;
      });

      updatedContractors.forEach(up => {
        const idx = activeContractors.findIndex(c => c.id === up.id);
        if (idx >= 0) activeContractors[idx] = up;
      });
      newContractors.forEach(nc => {
        if (!activeContractors.some(c => c.id === nc.id || c.name.toLowerCase().trim() === nc.name.toLowerCase().trim())) {
          activeContractors.push(nc);
        }
      });
      if (newContractors.length > 0) {
        addAuditLog(
          'Contractors Auto-Registered',
          'ui_config',
          'import_contractors',
          `${newContractors.length} Kategori Kontraktor baru terdaftar otomatis dari hasil import/text converter: ${newContractors.map(c => `${c.name} [${c.code}]`).join(', ')}`
        );
      }
    }

    let activeCoverageAreas = [...coverageAreas];
    if (extractedNewAreas.length > 0) {
      setCoverageAreas(prev => {
        const merged = [...prev];
        extractedNewAreas.forEach(na => {
          if (!merged.some(a => a.name.toLowerCase().trim() === na.name.toLowerCase().trim())) {
            merged.push(na);
          }
        });
        return merged;
      });
      extractedNewAreas.forEach(na => {
        if (!activeCoverageAreas.some(a => a.name.toLowerCase().trim() === na.name.toLowerCase().trim())) {
          activeCoverageAreas.push(na);
        }
      });
      addAuditLog(
        'Coverage Areas Auto-Registered',
        'ui_config',
        'import_areas',
        `${extractedNewAreas.length} Cakupan Area baru terdaftar dari hasil import: ${extractedNewAreas.map(a => a.name).join(', ')}`
      );
    }

    const newItems: Ticket[] = [];
    const updatedTicketsMap = new Map<string, Partial<Ticket>>();
    const importTimestamp = new Date().toISOString();
    const importDateStr = importTimestamp.split('T')[0];
    const batchId = 'batch_' + Date.now();
    const rejectedDuplicates: string[] = [];
    const batchAcceptedWos = new Set<string>();

    imported.forEach(item => {
      const woNum = (item.woNumber || item.workOrderNumber || '').trim();
      const upperWo = woNum.toUpperCase();

      // Check for empty or invalid WO
      if (!woNum) {
        duplicatesIgnored++;
        return;
      }

      // Check duplicate within the incoming import batch
      if (batchAcceptedWos.has(upperWo)) {
        duplicatesIgnored++;
        if (!rejectedDuplicates.includes(woNum)) {
          rejectedDuplicates.push(woNum);
        }
        return;
      }

      // Check duplicate against existing database
      if (existingWos.has(upperWo)) {
        if (policy === 'update_allowed') {
          // Update allowed fields on existing ticket without overwriting existing technician or technical reports
          const updates: Partial<Ticket> = {};
          if (item.appointmentDate) updates.appointmentDate = item.appointmentDate;
          if (item.slotTime) updates.slotTime = item.slotTime;
          if (item.remarksAgent) updates.remarksAgent = item.remarksAgent;
          if (item.ticketCategory) updates.ticketCategory = item.ticketCategory;
          if (item.customerPhone) updates.customerPhone = item.customerPhone;
          updates.updatedAt = importTimestamp;
          updates.updatedBy = currentUser.name;

          updatedTicketsMap.set(upperWo, updates);
          updatedCount++;
          batchAcceptedWos.add(upperWo);
          return;
        } else {
          // Skip / Reject policy
          duplicatesIgnored++;
          if (!rejectedDuplicates.includes(woNum)) {
            rejectedDuplicates.push(woNum);
          }
          return;
        }
      }

      batchAcceptedWos.add(upperWo);

      // Run central WODistributionEngine with dynamically recognized contractors
      const { ticket: distributed, status: distStatus, reason: distReason } = runWODistributionEngine(
        item,
        activeContractors,
        activeCoverageAreas,
        currentUser.role
      );

      // Customer ID validation (exact 7 digits)
      const rawCustId = (distributed.idCustomer || distributed.customerId || '').trim();
      const custDigits = rawCustId.replace(/\D/g, '');
      const validCustId = custDigits.length === 7 ? custDigits : (rawCustId || '');

      const ticket: Ticket = {
        id: getDeterministicTicketId(woNum),
        woNumber: woNum,
        workOrderNumber: woNum,
        idCustomer: validCustId,
        customerId: validCustId,
        ticketNumber: distributed.ticketNumber,
        ticketDate: distributed.ticketDate,
        date: distributed.date || importDateStr,
        dateUpload: distributed.dateUpload || new Date().toISOString().replace('T', ' ').substring(0, 16),
        fileName: distributed.fileName || 'Imported_Data.xlsx',
        agentId: distributed.agentId || currentUser.username,
        customerName: distributed.customerName || distributed.endUserName || '-',
        endUserName: distributed.customerName || distributed.endUserName || '-',
        customerPhone: distributed.customerPhone || '',
        customerContact1: distributed.customerPhone || '',
        customerPhoneNormalized: distributed.customerPhoneNormalized,
        customerContact2: distributed.customerContact2,
        customerContact3: distributed.customerContact3,
        appointmentDate: distributed.appointmentDate || '',
        appointmentType: distributed.appointmentType,
        dateAssignAgent: distributed.dateAssignAgent,
        dateAssignTechnician: distributed.dateAssignTechnician,
        streetName: distributed.streetName || '',
        streetAlternatif: distributed.streetAlternatif || '',
        clusterName: distributed.clusterName || '',
        area: distributed.area || '',
        fdtCode: distributed.fdtCode,
        fatCode: distributed.fatCode,
        oltCode: distributed.oltCode,
        installationType: distributed.installationType,
        serviceType: distributed.serviceType,
        homepassType: distributed.homepassType,
        homepassDetailId: distributed.homepassDetailId,
        plan: distributed.plan,
        serviceAgingMaintenance: distributed.serviceAgingMaintenance,
        vendorName: distributed.vendorName,
        router: distributed.router,
        stb1Sn: distributed.stb1Sn,
        stb1Mac: distributed.stb1Mac,
        stb2Sn: distributed.stb2Sn,
        stb2Mac: distributed.stb2Mac,
        stb3Sn: distributed.stb3Sn,
        stb3Mac: distributed.stb3Mac,
        ontSerialNumber: distributed.ontSerialNumber,
        ontMacAddress: distributed.ontMacAddress,
        rgSerialNumber: distributed.rgSerialNumber,
        rgMacAddress: distributed.rgMacAddress,
        slotTime: distributed.slotTime || '',
        ticketCategory: distributed.ticketCategory || distributed.initialTicketCategory || 'New Installation FTTH',
        initialTicketCategory: distributed.ticketCategory || distributed.initialTicketCategory || 'New Installation FTTH',
        contactorName: distributed.contactorName || distributed.contractorName || '',
        contractorName: distributed.contactorName || distributed.contractorName || '',
        contractorId: distributed.contractorId,
        leaderName: distributed.leaderName || distributed.corlapName,
        corlapName: distributed.corlapName || distributed.leaderName,
        corlapContact: distributed.corlapContact,
        installerName: distributed.installerName,
        installerContact: distributed.installerContact,
        installerContact2: distributed.installerContact2,
        distributionStatus: distStatus,
        distributionNotes: distReason,
        statusWOAgent: distributed.statusWOAgent || 'Pending',
        statusWOInstaller: distributed.statusWOInstaller || (distributed.installerName ? 'Assigned' : 'Unassigned'),
        statusWhatsApp: distributed.statusWhatsApp || 'not_prepared',
        remarksWOInstaller: distributed.remarksWOInstaller,
        remarksAgent: distributed.remarksAgent,
        isArchived: false,
        importedAt: importTimestamp,
        importDate: importDateStr,
        importBatchId: batchId,
        createdAt: importTimestamp,
        updatedAt: importTimestamp,
        updatedBy: currentUser.name,
        unmappedHeaders: distributed.unmappedHeaders || [],
        additionalFields: distributed.additionalFields || {}
      };

      const res = executeWorkflowsOnTicket(ticket, 'ticket_imported', workflowRules, templates, currentUser.name, currentUser.role);
      newItems.push(res.ticket);
      existingWos.add(upperWo);
      importedCount++;
    });

    // Apply updates and additions to database
    setTickets(prev => {
      let result = prev;
      if (updatedTicketsMap.size > 0) {
        result = result.map(t => {
          const upper = (t.woNumber || '').toUpperCase().trim();
          if (updatedTicketsMap.has(upper)) {
            return { ...t, ...updatedTicketsMap.get(upper)! };
          }
          return t;
        });
      }
      return deduplicateTicketsInMemory([...newItems, ...result]);
    });

    // Persist imported and updated tickets to Cloud Firestore (Confirmed Write)
    const itemsToSave = [...newItems];
    if (updatedTicketsMap.size > 0) {
      updatedTicketsMap.forEach((updates, upperWo) => {
        const found = tickets.find(t => (t.woNumber || '').toUpperCase().trim() === upperWo);
        if (found) {
          itemsToSave.push({ ...found, ...updates });
        }
      });
    }

    if (itemsToSave.length > 0) {
      setSyncStatus('SYNCING');
      batchSaveTicketsToFirestore(itemsToSave)
        .then(({ saved }) => {
          setSyncStatus('SAVED');
          setLastSyncTime(new Date().toISOString());
          toast.success(
            `Berhasil menyimpan ${saved} tiket ke Cloud Firestore${updatedCount > 0 ? ` (${newItems.length} baru, ${updatedCount} diperbarui)` : ''}.${duplicatesIgnored > 0 ? ` (${duplicatesIgnored} nomor WO duplikat ditolak)` : ''}`,
            'Import Selesai'
          );
        })
        .catch(err => {
          setSyncStatus('ERROR');
          toast.error('Gagal menyimpan import tiket ke Cloud Firestore: ' + (err?.message || err), 'Import Gagal');
        });
    } else if (duplicatesIgnored > 0) {
      toast.error(`Semua (${duplicatesIgnored}) nomor WO ditolak karena nomor WO sudah terdaftar dalam sistem.`, 'Nomor WO Duplikat Ditolak');
    }

    // Persist imported tickets to central backend database
    if (newItems.length > 0) {
      fetch('/api/tickets/bulk-import', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          tickets: newItems,
          options: { duplicatePolicy: policy }
        })
      }).catch(e => console.error('Error syncing imported tickets to server:', e));
    }

    addAuditLog('Bulk Import Completed', 'import_batch', batchId, `Imported ${importedCount} tiket baru, diperbarui ${updatedCount} tiket. Ditolak ${duplicatesIgnored} nomor WO duplikat.`);

    if (duplicatesIgnored > 0) {
      addAuditLog(
        'Duplicate WOs Rejected on Import',
        'import_batch',
        batchId,
        `Ditolak ${duplicatesIgnored} nomor WO karena nomor WO sudah terdaftar di sistem: ${rejectedDuplicates.slice(0, 10).join(', ')}${rejectedDuplicates.length > 10 ? ` (+${rejectedDuplicates.length - 10} lainnya)` : ''}`
      );
    }

    return { importedCount, updatedCount, duplicatesIgnored, rejectedDuplicates };
  };

  // Delete imported data filtered by import date within 7-day retention window
  const deleteImportedTicketsByDate = (
    importDate: string,
    reason: string
  ): { success: boolean; count: number; error?: string } => {
    if (currentUser.role !== 'management_data') {
      const err = 'Akses Ditolak: Hanya akun dengan peran Management Data yang berwenang menghapus data Work Order.';
      toast.error(err, 'Akses Ditolak');
      return { success: false, count: 0, error: err };
    }

    if (!importDate) {
      toast.error('Pilih tanggal import yang ingin dihapus.', 'Validasi Gagal');
      return { success: false, count: 0, error: 'Tanggal import wajib diisi.' };
    }

    if (!reason || reason.trim().length < 5) {
      toast.error('Alasan penghapusan data import wajib diisi minimal 5 karakter.', 'Validasi Gagal');
      return { success: false, count: 0, error: 'Alasan penghapusan minimal 5 karakter.' };
    }

    // 7-day retention constraint check:
    const targetDate = new Date(importDate);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - targetDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 7) {
      const err = `Batas Retensi: Data import lebih dari 7 hari yang lalu (${importDate}) terkunci dan tidak dapat dihapus massal. Rentang waktu penghapusan adalah 7 hari terakhir.`;
      toast.error(err, 'Di Luar Rentang 7 Hari');
      return { success: false, count: 0, error: err };
    }

    // Find tickets imported on this date
    const matchingTickets = tickets.filter(t => {
      const tImportDate =
        t.importDate ||
        (t.importedAt ? (t.importedAt.includes('T') ? t.importedAt.split('T')[0] : t.importedAt.slice(0, 10)) : '') ||
        (t.createdAt ? (t.createdAt.includes('T') ? t.createdAt.split('T')[0] : t.createdAt.slice(0, 10)) : '') ||
        (t.date ? (t.date.includes('T') ? t.date.split('T')[0] : t.date.slice(0, 10)) : '');
      return (tImportDate === importDate || t.date === importDate) && !t.isDeleted;
    });

    if (matchingTickets.length === 0) {
      toast.info(`Tidak ada tiket import yang ditemukan pada tanggal ${importDate}.`, 'Tidak Ditemukan');
      return { success: false, count: 0, error: 'Tidak ada tiket pada tanggal tersebut.' };
    }

    const targetIds = new Set(matchingTickets.map(t => t.id));
    setTickets(prev => prev.filter(t => !targetIds.has(t.id)));

    // Delete matching from Firestore
    setSyncStatus('SYNCING');
    Promise.all(matchingTickets.map(t => deleteTicketFromFirestore(t.id)))
      .then(() => {
        setSyncStatus('SAVED');
        setLastSyncTime(new Date().toISOString());
      })
      .catch(err => {
        console.warn('[Firestore] Error deleting batch tickets:', err);
        setSyncStatus('ERROR');
      });

    fetch(`/api/tickets/batch/${importDate}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      body: JSON.stringify({ reason })
    }).catch(e => console.error('Error syncing batch tickets delete to server:', e));

    addAuditLog(
      'Imported Data Purged',
      'import_batch',
      importDate,
      `Management Data ${currentUser.name} menghapus ${matchingTickets.length} data tiket hasil import tanggal ${importDate}. Alasan: ${reason}`
    );

    toast.warning(`Berhasil menghapus ${matchingTickets.length} tiket hasil import tanggal ${importDate} dari Cloud Firestore.`, 'Data Import Dihapus');
    return { success: true, count: matchingTickets.length };
  };

  // Bulk delete tickets for Management Data
  const bulkDeleteTickets = (
    ticketIds: string[],
    reason: string
  ): { success: boolean; count: number; error?: string } => {
    if (currentUser.role !== 'management_data') {
      const err = 'Akses Ditolak: Hanya akun dengan peran Management Data yang memiliki wewenang menghapus data Work Order.';
      toast.error(err, 'Akses Ditolak');
      return { success: false, count: 0, error: err };
    }

    if (!reason || reason.trim().length < 5) {
      toast.error('Alasan penghapusan tiket wajib diisi minimal 5 karakter.', 'Validasi Gagal');
      return { success: false, count: 0, error: 'Alasan penghapusan minimal 5 karakter.' };
    }

    const targetSet = new Set(ticketIds);
    let deletedCount = 0;
    const now = new Date().toISOString();
    setTickets(prev =>
      prev.map(t => {
        if (targetSet.has(t.id)) {
          deletedCount++;
          return {
            ...t,
            isDeleted: true,
            deletedAt: now,
            deletedBy: currentUser.name,
            deletionReason: reason,
            updatedAt: now,
            updatedBy: currentUser.name
          };
        }
        return t;
      })
    );

    // Soft delete in Cloud Firestore
    setSyncStatus('SYNCING');
    Promise.all(ticketIds.map(id => softDeleteTicketInFirestore(id, currentUser.name, reason)))
      .then(() => {
        setSyncStatus('SAVED');
        setLastSyncTime(new Date().toISOString());
        toast.warning(`Berhasil menghapus (soft delete) ${deletedCount} tiket Work Order.`, 'Hapus WO Berhasil');
      })
      .catch(err => {
        setSyncStatus('ERROR');
        toast.error('Gagal menghapus tiket massal di Cloud Firestore: ' + (err?.message || err), 'Gagal');
      });

    fetch('/api/tickets/bulk-delete', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ ticketIds, reason })
    }).catch(e => console.error('Error syncing bulk delete tickets to server:', e));

    addAuditLog(
      'Bulk Tickets Soft Deleted',
      'ticket',
      `${ticketIds.length} tickets`,
      `Management Data ${currentUser.name} menghapus massal (soft delete) ${ticketIds.length} tiket Work Order. Alasan: ${reason}`
    );

    return { success: true, count: deletedCount };
  };

  // Google Sheets Bidirectional / Auto Sync (Super Admin Only)
  const syncGoogleSheetsNow = async (direction?: 'both' | 'export_only' | 'import_only'): Promise<SheetSyncResult> => {
    if (currentUser.role !== 'super_admin') {
      const msg = 'Akses Ditolak: Hanya Super Admin yang berwenang melakukan sinkronisasi Google Sheets.';
      toast.error(msg, 'Akses Ditolak');
      return {
        success: false,
        message: msg,
        timestamp: new Date().toISOString()
      };
    }

    const dir = direction || googleSheetsConfig.syncDirection;
    const sheetId = googleSheetsConfig.spreadsheetId?.trim();
    const tabName = googleSheetsConfig.sheetName?.trim() || 'Work_Orders';

    if (!sheetId) {
      const res: SheetSyncResult = {
        success: false,
        message: 'Spreadsheet ID atau URL Google Sheet belum diisi.',
        timestamp: new Date().toISOString()
      };
      setGoogleSheetsConfig(prev => ({ ...prev, lastSyncStatus: 'error', lastSyncMessage: res.message }));
      toast.error('Spreadsheet ID atau URL Google Sheet belum diisi.', 'Gagal Sinkronisasi');
      return res;
    }

    const token = getAccessToken();
    if (!token) {
      const res: SheetSyncResult = {
        success: false,
        message: 'Akun Google belum terhubung. Silakan login dengan Google terlebih dahulu.',
        timestamp: new Date().toISOString()
      };
      setGoogleSheetsConfig(prev => ({ ...prev, lastSyncStatus: 'error', lastSyncMessage: res.message }));
      toast.warning('Akun Google belum terhubung. Silakan hubungkan akun Google.', 'Perlu Otorisasi');
      return res;
    }

    setGoogleSheetsConfig(prev => ({
      ...prev,
      lastSyncStatus: 'syncing',
      lastSyncMessage: 'Sedang melakukan sinkronisasi data dengan Google Sheets...'
    }));

    try {
      let pulledCount = 0;
      let pushedCount = 0;
      let newContractorsCount = 0;

      // 1. PULL from Google Sheets (Import data rows into MoraJaws)
      if (dir === 'both' || dir === 'import_only') {
        const { rows } = await pullRowsFromSheet(sheetId, tabName);
        if (rows && rows.length > 0) {
          const existingWoSet = new Set(tickets.map(t => t.woNumber.toUpperCase().trim()));
          const engineResult = processRawImportWithEngine(
            rows,
            existingWoSet,
            contractors,
            coverageAreas,
            canonicalFields,
            currentUser.role
          );

          // Auto-register any new contractor categories detected from Google Sheet
          if (googleSheetsConfig.autoRegisterContractors && engineResult.detectedContractors?.length > 0) {
            const toEnroll = engineResult.detectedContractors.map(c => ({
              id: c.id,
              name: c.name,
              code: c.code,
              coverageAreas: c.coverageAreas,
              leaderName: c.leaderName,
              phone: c.phone,
              email: c.email || `ops@${c.code.toLowerCase()}.morajaws.net`,
              active: true,
              createdAt: new Date().toISOString()
            }));
            const enrollRes = autoRegisterContractors(toEnroll);
            newContractorsCount = enrollRes.addedCount;
          }

          const validRowsToImport = engineResult.parsedRows
            .filter(r => r.isValid)
            .map(r => ({
              ...r.mapped,
              fileName: `GoogleSheet_${tabName}`
            }));

          if (validRowsToImport.length > 0) {
            const importRes = bulkImportTickets(validRowsToImport);
            pulledCount = importRes.importedCount;
          }
        }
      }

      // 2. PUSH to Google Sheets (Export current MoraJaws active tickets to Sheet)
      if (dir === 'both' || dir === 'export_only') {
        const activeTickets = tickets.filter(t => !t.isArchived);
        const pushRes = await pushTicketsToSheet(sheetId, tabName, activeTickets);
        pushedCount = pushRes.updatedRows;
      }

      const now = new Date().toISOString();
      const summaryMsg = dir === 'both'
        ? `Sinkronisasi sukses: ${pulledCount} tiket baru diimpor, ${pushedCount} baris tersinkron ke Google Sheet.`
        : dir === 'import_only'
        ? `Tarik data sukses: ${pulledCount} tiket baru diimpor dari Google Sheet.`
        : `Kirim data sukses: ${pushedCount} baris tersimpan ke Google Sheet.`;

      setGoogleSheetsConfig(prev => ({
        ...prev,
        lastSyncAt: now,
        lastSyncStatus: 'success',
        lastSyncMessage: summaryMsg,
        syncedRowCount: pushedCount || tickets.length,
        lastPulledCount: pulledCount,
        lastPushedCount: pushedCount
      }));

      addAuditLog(
        'Google Sheets Synced',
        'ui_config',
        sheetId,
        `${summaryMsg} (${dir.toUpperCase()}) oleh ${currentUser.name}`
      );

      toast.success(summaryMsg, 'Sinkronisasi Sheets Berhasil');

      return {
        success: true,
        message: summaryMsg,
        pulledCount,
        pushedCount,
        newContractorsCount,
        timestamp: now
      };
    } catch (err: any) {
      const errorMsg = err?.message || 'Terjadi kesalahan saat sinkronisasi Google Sheet.';
      setGoogleSheetsConfig(prev => ({
        ...prev,
        lastSyncStatus: 'error',
        lastSyncMessage: errorMsg
      }));
      addAuditLog('Google Sheets Sync Failed', 'ui_config', sheetId, `Gagal sync: ${errorMsg}`);
      toast.error(errorMsg, 'Gagal Sinkronisasi Sheets');
      return {
        success: false,
        message: errorMsg,
        error: errorMsg,
        timestamp: new Date().toISOString()
      };
    }
  };

  // Background interval timer for automatic sync
  useEffect(() => {
    if (!googleSheetsConfig.enabled || !googleSheetsConfig.spreadsheetId) return;

    const intervalMinutes = Math.max(googleSheetsConfig.syncInterval || 10, 1);
    const intervalMs = intervalMinutes * 60 * 1000;

    const timer = setInterval(() => {
      const token = getAccessToken();
      if (!token) return; // Silent skip if not authenticated yet

      syncGoogleSheetsNow(googleSheetsConfig.syncDirection);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [
    googleSheetsConfig.enabled,
    googleSheetsConfig.spreadsheetId,
    googleSheetsConfig.sheetName,
    googleSheetsConfig.syncInterval,
    googleSheetsConfig.syncDirection,
    googleSheetsConfig.autoRegisterContractors,
    tickets
  ]);

  // WhatsApp helpers with strict RBAC: Only Superadmin and Dispatch allowed
  const isTemplateAuthorized = () => {
    return currentUser.role === 'super_admin' || currentUser.role === 'dispatch';
  };

  const createTemplate = (data: Omit<WhatsAppTemplate, 'id' | 'version' | 'lastUpdated'>): WhatsAppTemplate => {
    if (!isTemplateAuthorized()) {
      const errMsg = 'Akses Ditolak: Hanya Superadmin dan Dispatch yang diizinkan menambah Template WhatsApp.';
      toast.error(errMsg, 'Akses Ditolak');
      throw new Error(errMsg);
    }
    const newTpl: WhatsAppTemplate = {
      ...data,
      id: 'tpl_' + Date.now(),
      version: 1,
      lastUpdated: new Date().toISOString()
    };
    setTemplates(prev => [newTpl, ...prev]);
    saveTemplateToFirestore(newTpl).catch(e => console.warn('[Firestore] Error saving template:', e));
    addAuditLog('Template Created', 'template', newTpl.id, `Created WhatsApp template: ${newTpl.name}`);
    return newTpl;
  };

  const updateTemplate = (id: string, updates: Partial<WhatsAppTemplate>) => {
    if (!isTemplateAuthorized()) {
      const errMsg = 'Akses Ditolak: Hanya Superadmin dan Dispatch yang diizinkan mengubah Template WhatsApp.';
      toast.error(errMsg, 'Akses Ditolak');
      return;
    }
    setTemplates(prev =>
      prev.map(t => {
        if (t.id === id) {
          const updated = { ...t, ...updates, version: t.version + 1, lastUpdated: new Date().toISOString(), updatedBy: currentUser.name };
          saveTemplateToFirestore(updated).catch(e => console.warn('[Firestore] Error updating template:', e));
          return updated;
        }
        return t;
      })
    );
    addAuditLog('Template Updated', 'template', id, `Updated WhatsApp template: ${updates.name || id}`);
  };

  const deleteTemplate = (id: string) => {
    if (!isTemplateAuthorized()) {
      const errMsg = 'Akses Ditolak: Hanya Superadmin dan Dispatch yang diizinkan menghapus Template WhatsApp.';
      toast.error(errMsg, 'Akses Ditolak');
      return;
    }
    setTemplates(prev => prev.filter(t => t.id !== id));
    deleteTemplateFromFirestore(id).catch(e => console.warn('[Firestore] Error deleting template:', e));
    addAuditLog('Template Deleted', 'template', id, `Deleted template ${id}`);
  };

  // -------------------------------------------------------------
  // Contact Center Chat Category Operations
  // -------------------------------------------------------------
  const addChatCategory = async (categoryData: Omit<ChatCategoryConfig, 'id' | 'createdAt'>) => {
    const newCat: ChatCategoryConfig = {
      ...categoryData,
      id: 'cat-' + Date.now(),
      createdAt: new Date().toISOString()
    };
    const updated = [...chatCategories, newCat];
    setChatCategories(updated);
    try {
      await saveChatCategoriesToFirestore(updated);
      toast.success(`Kategori chat "${newCat.name}" berhasil disimpan ke Firestore.`);
      addAuditLog('Chat Category Created', 'global_config', newCat.id, `Created chat category ${newCat.name}`);
    } catch (e: any) {
      toast.error('Gagal menyimpan kategori chat: ' + (e?.message || e));
    }
  };

  const updateChatCategory = async (id: string, updates: Partial<ChatCategoryConfig>) => {
    const updated = chatCategories.map(c => (c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c));
    setChatCategories(updated);
    try {
      await saveChatCategoriesToFirestore(updated);
      toast.success('Kategori chat diperbarui.');
      addAuditLog('Chat Category Updated', 'global_config', id, `Updated chat category ${id}`);
    } catch (e: any) {
      toast.error('Gagal memperbarui kategori chat: ' + (e?.message || e));
    }
  };

  const deleteChatCategory = async (id: string) => {
    const target = chatCategories.find(c => c.id === id);
    if (!target) return;
    const updated = chatCategories.filter(c => c.id !== id);
    setChatCategories(updated);
    try {
      await saveChatCategoriesToFirestore(updated);
      toast.info(`Kategori chat "${target.name}" telah dihapus.`);
      addAuditLog('Chat Category Deleted', 'global_config', id, `Deleted chat category ${target.name}`);
    } catch (e: any) {
      toast.error('Gagal menghapus kategori chat: ' + (e?.message || e));
    }
  };

  const toggleChatCategoryActive = async (id: string) => {
    const updated = chatCategories.map(c => (c.id === id ? { ...c, active: !c.active, updatedAt: new Date().toISOString() } : c));
    setChatCategories(updated);
    try {
      await saveChatCategoriesToFirestore(updated);
    } catch (e) {
      console.warn('[Firestore] Error toggling chat category:', e);
    }
  };

  const setTicketChatCategory = async (ticketId: string, category: string) => {
    const target = getTicketById(ticketId);
    if (!target) return;
    const now = new Date().toISOString();
    setTickets(prev =>
      prev.map(t => (t.id === ticketId ? { ...t, chatCategory: category, updatedAt: now } : t))
    );
    try {
      await saveTicketToFirestore({ ...target, chatCategory: category, updatedAt: now });
      addAuditLog('Chat Category Assigned', 'ticket', ticketId, `Assigned category ${category} to WO ${target.woNumber}`);
    } catch (e) {
      console.warn('[Firestore] Error saving ticket chat category:', e);
    }
  };

  // -------------------------------------------------------------
  // Hierarchical Droplist Operations (Status WO -> Reason WO -> Remarks)
  // -------------------------------------------------------------
  const addHierarchicalStatus = async (statusData: Omit<HierarchicalStatus, 'id' | 'reasons'>) => {
    const newStatus: HierarchicalStatus = {
      ...statusData,
      id: 'hs-' + Date.now(),
      reasons: []
    };
    const updated = [...hierarchicalStatuses, newStatus];
    setHierarchicalStatuses(updated);
    try {
      await saveHierarchicalDroplistsToFirestore(updated);
      toast.success(`Status WO "${newStatus.name}" berhasil ditambahkan.`);
      addAuditLog('Status WO Created', 'global_config', newStatus.id, `Created Status WO ${newStatus.name}`);
    } catch (e: any) {
      toast.error('Gagal menyimpan Status WO: ' + (e?.message || e));
    }
  };

  const updateHierarchicalStatus = async (id: string, updates: Partial<HierarchicalStatus>) => {
    const updated = hierarchicalStatuses.map(s => (s.id === id ? { ...s, ...updates } : s));
    setHierarchicalStatuses(updated);
    try {
      await saveHierarchicalDroplistsToFirestore(updated);
      toast.success('Status WO diperbarui.');
      addAuditLog('Status WO Updated', 'global_config', id, `Updated Status WO ${id}`);
    } catch (e: any) {
      toast.error('Gagal memperbarui Status WO: ' + (e?.message || e));
    }
  };

  const deleteHierarchicalStatus = async (id: string) => {
    const target = hierarchicalStatuses.find(s => s.id === id);
    if (!target) return;
    const updated = hierarchicalStatuses.filter(s => s.id !== id);
    setHierarchicalStatuses(updated);
    try {
      await saveHierarchicalDroplistsToFirestore(updated);
      toast.info(`Status WO "${target.name}" telah dihapus.`);
      addAuditLog('Status WO Deleted', 'global_config', id, `Deleted Status WO ${target.name}`);
    } catch (e: any) {
      toast.error('Gagal menghapus Status WO: ' + (e?.message || e));
    }
  };

  const addHierarchicalReason = async (statusId: string, reasonData: Omit<HierarchicalReason, 'id' | 'statusId' | 'remarks'>) => {
    const newReason: HierarchicalReason = {
      ...reasonData,
      id: 'hr-' + Date.now(),
      statusId,
      remarks: []
    };
    const updated = hierarchicalStatuses.map(s => {
      if (s.id !== statusId) return s;
      return {
        ...s,
        reasons: [...s.reasons, newReason]
      };
    });
    setHierarchicalStatuses(updated);
    try {
      await saveHierarchicalDroplistsToFirestore(updated);
      toast.success(`Reason WO "${newReason.name}" berhasil ditambahkan.`);
      addAuditLog('Reason WO Created', 'global_config', newReason.id, `Created Reason WO ${newReason.name}`);
    } catch (e: any) {
      toast.error('Gagal menyimpan Reason WO: ' + (e?.message || e));
    }
  };

  const updateHierarchicalReason = async (statusId: string, reasonId: string, updates: Partial<HierarchicalReason>) => {
    const updated = hierarchicalStatuses.map(s => {
      if (s.id !== statusId) return s;
      return {
        ...s,
        reasons: s.reasons.map(r => (r.id === reasonId ? { ...r, ...updates } : r))
      };
    });
    setHierarchicalStatuses(updated);
    try {
      await saveHierarchicalDroplistsToFirestore(updated);
      toast.success('Reason WO diperbarui.');
      addAuditLog('Reason WO Updated', 'global_config', reasonId, `Updated Reason WO ${reasonId}`);
    } catch (e: any) {
      toast.error('Gagal memperbarui Reason WO: ' + (e?.message || e));
    }
  };

  const deleteHierarchicalReason = async (statusId: string, reasonId: string) => {
    const updated = hierarchicalStatuses.map(s => {
      if (s.id !== statusId) return s;
      return {
        ...s,
        reasons: s.reasons.filter(r => r.id !== reasonId)
      };
    });
    setHierarchicalStatuses(updated);
    try {
      await saveHierarchicalDroplistsToFirestore(updated);
      toast.info('Reason WO telah dihapus.');
      addAuditLog('Reason WO Deleted', 'global_config', reasonId, `Deleted Reason WO ${reasonId}`);
    } catch (e: any) {
      toast.error('Gagal menghapus Reason WO: ' + (e?.message || e));
    }
  };

  const moveHierarchicalReason = async (fromStatusId: string, toStatusId: string, reasonId: string) => {
    let movedReason: HierarchicalReason | null = null;
    hierarchicalStatuses.forEach(s => {
      if (s.id === fromStatusId) {
        const found = s.reasons.find(r => r.id === reasonId);
        if (found) movedReason = { ...found, statusId: toStatusId };
      }
    });
    if (!movedReason) return;

    const updated = hierarchicalStatuses.map(s => {
      if (s.id === fromStatusId) {
        return { ...s, reasons: s.reasons.filter(r => r.id !== reasonId) };
      }
      if (s.id === toStatusId) {
        return { ...s, reasons: [...s.reasons, movedReason!] };
      }
      return s;
    });
    setHierarchicalStatuses(updated);
    try {
      await saveHierarchicalDroplistsToFirestore(updated);
      toast.success('Reason WO dipindahkan.');
    } catch (e: any) {
      toast.error('Gagal memindahkan Reason WO: ' + (e?.message || e));
    }
  };

  const addHierarchicalRemark = async (statusId: string, reasonId: string, remarkData: Omit<HierarchicalRemark, 'id' | 'reasonId'>) => {
    const newRemark: HierarchicalRemark = {
      ...remarkData,
      id: 'hrm-' + Date.now(),
      reasonId
    };
    const updated = hierarchicalStatuses.map(s => {
      if (s.id !== statusId) return s;
      return {
        ...s,
        reasons: s.reasons.map(r => {
          if (r.id !== reasonId) return r;
          return {
            ...r,
            remarks: [...r.remarks, newRemark]
          };
        })
      };
    });
    setHierarchicalStatuses(updated);
    try {
      await saveHierarchicalDroplistsToFirestore(updated);
      toast.success(`Remarks "${newRemark.name}" berhasil ditambahkan.`);
      addAuditLog('Remark Created', 'global_config', newRemark.id, `Created Remark ${newRemark.name}`);
    } catch (e: any) {
      toast.error('Gagal menyimpan Remarks: ' + (e?.message || e));
    }
  };

  const updateHierarchicalRemark = async (statusId: string, reasonId: string, remarkId: string, updates: Partial<HierarchicalRemark>) => {
    const updated = hierarchicalStatuses.map(s => {
      if (s.id !== statusId) return s;
      return {
        ...s,
        reasons: s.reasons.map(r => {
          if (r.id !== reasonId) return r;
          return {
            ...r,
            remarks: r.remarks.map(rm => (rm.id === remarkId ? { ...rm, ...updates } : rm))
          };
        })
      };
    });
    setHierarchicalStatuses(updated);
    try {
      await saveHierarchicalDroplistsToFirestore(updated);
      toast.success('Remarks diperbarui.');
      addAuditLog('Remark Updated', 'global_config', remarkId, `Updated Remark ${remarkId}`);
    } catch (e: any) {
      toast.error('Gagal memperbarui Remarks: ' + (e?.message || e));
    }
  };

  const deleteHierarchicalRemark = async (statusId: string, reasonId: string, remarkId: string) => {
    const updated = hierarchicalStatuses.map(s => {
      if (s.id !== statusId) return s;
      return {
        ...s,
        reasons: s.reasons.map(r => {
          if (r.id !== reasonId) return r;
          return {
            ...r,
            remarks: r.remarks.filter(rm => rm.id !== remarkId)
          };
        })
      };
    });
    setHierarchicalStatuses(updated);
    try {
      await saveHierarchicalDroplistsToFirestore(updated);
      toast.info('Remarks telah dihapus.');
      addAuditLog('Remark Deleted', 'global_config', remarkId, `Deleted Remark ${remarkId}`);
    } catch (e: any) {
      toast.error('Gagal menghapus Remarks: ' + (e?.message || e));
    }
  };

  const getReasonsForStatus = (statusNameOrId: string): HierarchicalReason[] => {
    if (!statusNameOrId) return [];
    const norm = statusNameOrId.trim().toLowerCase();
    const matched = hierarchicalStatuses.find(
      s => s.id === statusNameOrId || s.name.trim().toLowerCase() === norm || (s.code && s.code.trim().toLowerCase() === norm)
    );
    if (!matched) return [];
    return (matched.reasons || []).filter(r => r.active !== false && (r as any).isActive !== false);
  };

  const getRemarksForReason = (statusNameOrId: string, reasonNameOrId: string): HierarchicalRemark[] => {
    if (!statusNameOrId || !reasonNameOrId) return [];
    const reasons = getReasonsForStatus(statusNameOrId);
    const normR = reasonNameOrId.trim().toLowerCase();
    const matchedR = reasons.find(r => r.id === reasonNameOrId || r.name.trim().toLowerCase() === normR);
    if (!matchedR) return [];
    return (matchedR.remarks || []).filter(rm => rm.active !== false && (rm as any).isActive !== false);
  };

  const reconcileDroplistsNow = async (): Promise<{ success: boolean; changedCount: number; message: string }> => {
    try {
      const { reconciled, changedCount } = reconcileDroplistData(hierarchicalStatuses, reportDropdownCategories);
      if (changedCount > 0) {
        setHierarchicalStatuses(reconciled);
        await saveHierarchicalDroplistsToFirestore(reconciled);
        addAuditLog(
          'Droplist Data Reconciled',
          'global_config',
          'hierarchical_droplists',
          `Rekonsiliasi data droplist: ${changedCount} opsi lama berhasil diselaraskan ke struktur hierarki Firestore.`
        );
        toast.success(`Rekonsiliasi selesai: ${changedCount} opsi lama berhasil diselaraskan ke hierarki Firestore.`, 'Rekonsiliasi Berhasil');
        return { success: true, changedCount, message: `${changedCount} opsi berhasil direkonsiliasi ke struktur hierarki.` };
      } else {
        toast.info('Seluruh konfigurasi droplist sudah selaras dan tidak ada data yang tumpang tindih.', 'Data Terverifikasi');
        return { success: true, changedCount: 0, message: 'Seluruh konfigurasi sudah selaras dan terhubung.' };
      }
    } catch (err: any) {
      console.error('[Reconciliation] Error reconciling droplists:', err);
      toast.error('Gagal melakukan rekonsiliasi data: ' + (err?.message || err));
      return { success: false, changedCount: 0, message: err?.message || 'Gagal rekonsiliasi' };
    }
  };


  const getWhatsAppPreviewForTicket = (ticketId: string, templateId?: string) => {
    const t = getTicketById(ticketId);
    if (!t) return { text: '', url: '', error: 'Tiket tidak ditemukan', missingVars: [] };
    const tpl = templateId ? templates.find(item => item.id === templateId) : (templates.find(item => item.isDefault) || templates[0]);
    if (!tpl) return { text: '', url: '', error: 'Tidak ada template aktif', missingVars: [] };

    const { renderedText, missingVariables } = renderWhatsAppMessage(tpl.messageBody, t);
    const { url, error } = buildWhatsAppClickToChatUrl(t.customerPhone, renderedText);

    return {
      text: renderedText,
      url,
      error,
      missingVars: missingVariables
    };
  };

  const recordWhatsAppOpened = (ticketId: string, url: string, messageBody: string) => {
    const t = getTicketById(ticketId);
    if (!t) return;

    const logEntry: WhatsAppMessageLog = {
      id: 'wlog_' + Date.now(),
      ticketId,
      woNumber: t.woNumber,
      customerName: t.customerName,
      customerPhone: t.customerPhone,
      messageBody,
      url,
      eventType: 'opened_in_whatsapp',
      performedBy: currentUser.name,
      userRole: currentUser.role,
      timestamp: new Date().toISOString()
    };

    setWaLogs(prev => [logEntry, ...prev]);

    updateTicket(ticketId, {
      statusWhatsApp: 'opened_in_whatsapp',
      waLastOpenedAt: new Date().toISOString(),
      waGeneratedUrl: url,
      waMessagePreview: messageBody
    }, 'WhatsApp URL opened in browser');

    addAuditLog('WhatsApp URL Opened', 'ticket', ticketId, `Opened WhatsApp chat link for ${t.customerName} (${t.customerPhone})`);
  };

  const recordWhatsAppConfirmed = (ticketId: string, notes: string) => {
    const t = getTicketById(ticketId);
    if (!t) return;

    updateTicket(ticketId, {
      statusWhatsApp: 'confirmed',
      waConfirmedAt: new Date().toISOString(),
      waConfirmedBy: currentUser.name,
      waConfirmationNotes: notes
    }, 'Customer confirmed schedule');

    const logEntry: WhatsAppMessageLog = {
      id: 'wlog_' + Date.now(),
      ticketId,
      woNumber: t.woNumber,
      customerName: t.customerName,
      customerPhone: t.customerPhone,
      messageBody: t.waMessagePreview || '',
      url: t.waGeneratedUrl || '',
      eventType: 'marked_confirmed',
      performedBy: currentUser.name,
      userRole: currentUser.role,
      notes,
      timestamp: new Date().toISOString()
    };

    setWaLogs(prev => [logEntry, ...prev]);
    addAuditLog('Customer Confirmed', 'ticket', ticketId, `Customer verified visit slot. Notes: ${notes}`);
  };

  const recordWhatsAppReschedule = (ticketId: string, notes: string) => {
    updateTicket(ticketId, {
      statusWhatsApp: 'reschedule_requested',
      waConfirmationNotes: notes
    }, 'Customer requested reschedule');

    addAuditLog('Reschedule Requested', 'ticket', ticketId, `Customer requested reschedule. Notes: ${notes}`);
  };

  const recordWhatsAppUnreachable = (ticketId: string, notes: string) => {
    updateTicket(ticketId, {
      statusWhatsApp: 'unreachable',
      waConfirmationNotes: notes
    }, 'Customer unreachable');

    addAuditLog('Customer Unreachable', 'ticket', ticketId, `Customer unreachable. Notes: ${notes}`);
  };

  const toggleWorkflowRule = (ruleId: string, enabled: boolean) => {
    setWorkflowRules(prev =>
      prev.map(r => (r.id === ruleId ? { ...r, enabled } : r))
    );
    addAuditLog('Workflow Toggled', 'workflow', ruleId, `Workflow rule ${ruleId} set to ${enabled ? 'ACTIVE' : 'INACTIVE'}`);
  };

  const updateWorkflowRule = (ruleId: string, updates: Partial<WorkflowRule>) => {
    setWorkflowRules(prev =>
      prev.map(r => (r.id === ruleId ? { ...r, ...updates } : r))
    );
    addAuditLog('Workflow Updated', 'workflow', ruleId, `Updated workflow ${ruleId}`);
  };

  const updateHeaderMapping = (field: string, aliases: string[]) => {
    setHeaderMappings(prev =>
      prev.map(m => (m.standardField === field ? { ...m, aliases } : m))
    );
    addAuditLog('Header Mapping Updated', 'ui_config', field, `Updated alias dictionary for ${field}`);
  };

  const updateCanonicalFieldConfig = (field: string, updates: Partial<CanonicalFieldConfig>) => {
    setCanonicalFields(prev =>
      prev.map(f => (f.canonicalField === field ? { ...f, ...updates } : f))
    );
    addAuditLog('Canonical Field Config Updated', 'ui_config', field, `Updated canonical config for ${field}`);
  };

  // Dynamic Options
  const leadersList = Array.from(
    new Set([
      ...users.filter(u => u.role === 'leader').map(u => u.name),
      ...contractors.map(c => c.leaderName).filter(Boolean),
      ...tickets.map(t => t.leaderName).filter(Boolean)
    ])
  ) as string[];

  const installersList = Array.from(
    new Set([
      ...users.filter(u => u.role === 'installer').map(u => u.name),
      ...tickets.map(t => t.installerName).filter(Boolean)
    ])
  ) as string[];

  const contractorsList = Array.from(
    new Set([
      ...contractors.map(c => c.name),
      ...tickets.map(t => t.contactorName).filter(Boolean)
    ])
  ) as string[];

  const areasList = Array.from(
    new Set([
      ...coverageAreas.map(a => a.name),
      ...tickets.map(t => t.area).filter(Boolean)
    ])
  ) as string[];

  return (
    <AppContext.Provider
      value={{
        currentUser,
        isLoggedIn,
        login,
        loginWithFirebase,
        logout,
        users,
        hasPermission,
        canDelete,
        canImport,
        canEditWOData,
        operationalDate,
        setOperationalDate,
        isSessionModalOpen,
        setIsSessionModalOpen,
        registerDispatchAccount,
        registerLeaderAccount,
        registerInstallerAccount,
        toggleUserStatus,
        resetUserPassword,
        deleteUser,
        updateUser,
        executeComprehensiveDeduplication,
        contractors,
        addContractor,
        updateContractor,
        deleteContractor,
        autoRegisterContractors,
        coverageAreas,
        addCoverageArea,
        updateCoverageArea,
        deleteCoverageArea,
        rootCauseCategories,
        workResultsList,
        updateRootCauseCategories,
        saveTechnicalReport,
        saveProgressReport,
        verifyTechnicalReport,
        startWorkOnTicket,
        approveProgressReport,
        rejectProgressReport,
        tickets,
        scopedTickets,
        getTicketById,
        createTicket,
        updateTicket,
        assignTicketPersonnel,
        bulkAssignPersonnel,
        reassignTicketPersonnel,
        updateTicketStatus,
        closeTicket,
        reopenTicket,
        archiveTicket,
        restoreTicket,
        deleteTicket,
        bulkDeleteTickets,
        deleteCustomerData,
        bulkImportTickets,
        deleteImportedTicketsByDate,
        ticketMessages,
        sendTicketMessage,
        getMessagesForTicket,
        markTicketMessagesAsRead,
        getTicketUnreadCount,
        templates,
        createTemplate,
        updateTemplate,
        deleteTemplate,
        getWhatsAppPreviewForTicket,
        recordWhatsAppOpened,
        recordWhatsAppConfirmed,
        recordWhatsAppReschedule,
        recordWhatsAppUnreachable,
        workflowRules,
        toggleWorkflowRule,
        updateWorkflowRule,
        headerMappings,
        updateHeaderMapping,
        canonicalFields,
        updateCanonicalFieldConfig,
        auditLogs,
        addAuditLog,
        ticketActivities,
        waLogs,
        googleSheetsConfig,
        updateGoogleSheetsConfig,
        syncGoogleSheetsNow,
        leadersList,
        installersList,
        contractorsList,
        areasList,
        toast,
        showToast,
        openOfflineSyncCenter: () => setIsOfflineModalOpen(true),
        isDataLoading,
        dataLoadError,
        loadCentralData,
        firestoreStatus,
        firestoreLoading,
        isFirestoreReady,
        syncStatus,
        lastSyncTime,
        syncError,
        refreshFirestoreData,
        reportDropdownCategories,
        isDropdownCategoriesLoading,
        addReportDropdownCategory,
        updateReportDropdownCategory,
        deleteReportDropdownCategory,
        toggleReportDropdownCategoryActive,
        chatCategories,
        addChatCategory,
        updateChatCategory,
        deleteChatCategory,
        toggleChatCategoryActive,
        setTicketChatCategory,
        hierarchicalStatuses,
        addHierarchicalStatus,
        updateHierarchicalStatus,
        deleteHierarchicalStatus,
        addHierarchicalReason,
        updateHierarchicalReason,
        deleteHierarchicalReason,
        moveHierarchicalReason,
        addHierarchicalRemark,
        updateHierarchicalRemark,
        deleteHierarchicalRemark,
        getReasonsForStatus,
        getRemarksForReason,
        reconcileDroplistsNow
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
