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
  WOAssignmentHistory
} from '../types/index.ts';
import {
  INITIAL_SAMPLE_TICKETS,
  DEFAULT_WHATSAPP_TEMPLATES,
  DEFAULT_WORKFLOW_RULES,
  STANDARD_HEADER_MAPPINGS,
  DEFAULT_CONTRACTORS,
  DEFAULT_COVERAGE_AREAS,
  DEFAULT_ROOT_CAUSE_CATEGORIES,
  DEFAULT_WORK_RESULTS
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
import { useToast } from './ToastContext';
import { saveTicketsOffline, cacheMasterData, getOfflineTickets, removeSyncQueueItem } from '../services/offlineDb';
import { useOfflineSync } from './OfflineSyncContext';
import { testFirestoreConnection, pingFirestore } from '../lib/firebase';
import {
  subscribeToMoraJawsFirestore,
  saveTicketToFirestore,
  batchSaveTicketsToFirestore,
  deleteTicketFromFirestore,
  softDeleteTicketInFirestore,
  saveContractorToFirestore,
  saveCoverageAreaToFirestore,
  sendChatMessageToFirestore,
  addAuditLogToFirestore,
  saveTemplateToFirestore,
  deleteTemplateFromFirestore,
  saveUserToFirestore,
  seedFirestoreIfEmpty,
  saveGlobalAppSettingsToFirestore,
  loadGlobalAppSettingsFromFirestore
} from '../services/firestoreDb';
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
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string; user?: User }> | { success: boolean; error?: string; user?: User };
  loginWithFirebase: (firebaseData: { email: string; uid: string; displayName?: string }) => Promise<{ success: boolean; error?: string; user?: User }>;
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

  // User Management (Super Admin Exclusive)
  registerDispatchAccount: (data: { name: string; username: string; phone?: string; email?: string }) => { success: boolean; user?: User; error?: string };
  registerLeaderAccount: (data: { name: string; username: string; phone?: string; contractor: string; area: string; email?: string }) => { success: boolean; user?: User; error?: string };
  registerInstallerAccount: (data: { name: string; username: string; phone: string; email?: string }) => { success: boolean; user?: User; error?: string };
  toggleUserStatus: (userId: string) => { success: boolean; error?: string };
  resetUserPassword: (userId: string) => { success: boolean; newPassword?: string; error?: string };
  deleteUser: (userId: string, reason: string, permanent?: boolean) => { success: boolean; error?: string };

  // Contractors & Coverage Areas
  contractors: Contractor[];
  addContractor: (data: Omit<Contractor, 'id' | 'createdAt'>) => void;
  updateContractor: (id: string, updates: Partial<Contractor>) => void;
  autoRegisterContractors: (contractorsToRegister: Contractor[], newCoverageAreas?: CoverageArea[]) => { addedCount: number; updatedCount: number };
  coverageAreas: CoverageArea[];
  addCoverageArea: (data: Omit<CoverageArea, 'id'>) => void;
  updateCoverageArea: (id: string, updates: Partial<CoverageArea>) => void;

  // Root Causes & Technical Reports
  rootCauseCategories: RootCauseCategory[];
  workResultsList: string[];
  updateRootCauseCategories: (categories: RootCauseCategory[]) => void;
  saveTechnicalReport: (ticketId: string, report: Omit<TechnicalReport, 'id' | 'ticketId' | 'submittedAt' | 'submittedBy'>) => { success: boolean; error?: string };
  saveProgressReport: (ticketId: string, data: { reportStatus: string; reasonReport: string; rootCause: string; remarksReport: string }) => Promise<{ success: boolean; error?: string; report?: ProgressReportEntry }>;
  verifyTechnicalReport: (ticketId: string) => void;

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

const DEFAULT_USERS: User[] = [
  {
    id: 'u-1',
    userId: 'u-1',
    name: 'Alamsyah (Super Admin)',
    username: 'superadmin',
    email: 'tarnocepak@gmail.com',
    role: 'super_admin',
    active: true,
    passwordHash: DEFAULT_PASSWORD_HASH,
    lastLoginAt: new Date().toISOString(),
    loginCount: 1,
    mustChangePassword: false,
    createdAt: '2026-01-01T00:00:00Z'
  },
  {
    id: 'u-mgmt',
    userId: 'u-mgmt',
    name: 'Rian Data Officer (Management Data)',
    username: 'datamgmt',
    email: 'mgmt@morajaws.net',
    role: 'management_data',
    active: true,
    passwordHash: DEFAULT_PASSWORD_HASH,
    lastLoginAt: new Date().toISOString(),
    loginCount: 1,
    mustChangePassword: false,
    createdAt: '2026-01-01T00:00:00Z'
  }
];

const INITIAL_MESSAGES: TicketMessage[] = [];

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

  const [users, setUsers] = useState<User[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.USERS);
      if (saved) {
        const parsed: User[] = JSON.parse(saved);
        // Ensure u-mgmt is present
        if (!parsed.some(u => u.username === 'datamgmt')) {
          parsed.push(DEFAULT_USERS[1]);
        }
        return parsed;
      }
    } catch (e) {}
    return DEFAULT_USERS;
  });

  const [currentUser, setCurrentUser] = useState<User>(() => {
    try {
      const sessionStr = localStorage.getItem('morajaws_auth_session');
      if (sessionStr) {
        const session = JSON.parse(sessionStr);
        const match = users.find(u => u.id === session.userId || u.username === session.username);
        if (match) return match;
      }
    } catch (e) {}
    return users[0] || DEFAULT_USERS[0];
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

    async function initFirestore() {
      setFirestoreLoading(true);
      setFirestoreStatus('connecting');
      try {
        const isConnected = await testFirestoreConnection();
        if (isCancelled) return;

        if (!isConnected) {
          setFirestoreStatus('offline');
          setFirestoreLoading(false);
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
            if (liveTickets && liveTickets.length > 0) {
              setTickets(liveTickets);
            }
            setFirestoreStatus('connected');
            setFirestoreLoading(false);
            setIsFirestoreReady(true);
          },
          onContractorsChange: (liveContractors) => {
            if (isCancelled) return;
            if (liveContractors && liveContractors.length > 0) {
              setContractors(deduplicateContractors(liveContractors));
            }
          },
          onCoverageAreasChange: (liveAreas) => {
            if (isCancelled) return;
            if (liveAreas && liveAreas.length > 0) {
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
            if (liveLogs && liveLogs.length > 0) {
              setAuditLogs(liveLogs);
            }
          },
          onTemplatesChange: (liveTemplates) => {
            if (isCancelled) return;
            if (liveTemplates && liveTemplates.length > 0) {
              setTemplates(liveTemplates);
            }
          },
          onUsersChange: (liveUsers) => {
            if (isCancelled) return;
            if (liveUsers && liveUsers.length > 0) {
              setUsers(liveUsers);
            }
          },
          onError: (err) => {
            console.warn('[Firestore Live] Error in subscription:', err);
            setFirestoreStatus('error');
          }
        });

        setFirestoreStatus('connected');
      } catch (err: any) {
        console.warn('[Firestore] Initialization error:', err);
        setFirestoreStatus('error');
      } finally {
        if (!isCancelled) {
          setFirestoreLoading(false);
        }
      }
    }

    initFirestore();

    return () => {
      isCancelled = true;
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
      }
    };
  }, []);

  const loadCentralData = async () => {
    setIsDataLoading(true);
    setDataLoadError(null);
    try {
      const headers = getAuthHeaders();
      const res = await fetch('/api/bootstrap', { headers });
      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }
      const data = await res.json();
      if (data && data.success) {
        if (Array.isArray(data.tickets)) {
          setTickets(data.tickets);
        }
        if (Array.isArray(data.contractors) && data.contractors.length > 0) {
          setContractors(deduplicateContractors(data.contractors));
        }
        if (Array.isArray(data.coverageAreas) && data.coverageAreas.length > 0) {
          setCoverageAreas(data.coverageAreas);
        }
        if (Array.isArray(data.templates) && data.templates.length > 0) {
          setTemplates(data.templates);
        }
        if (data.operationalDate) {
          setOperationalDateState(data.operationalDate);
        }
        if (data.currentUser && data.isAuthenticated) {
          setCurrentUser(prev => ({ ...prev, ...data.currentUser }));
        }
      }

      // If user is authenticated, ensure tickets are refreshed from /api/tickets directly
      if (headers['Authorization'] || headers['x-user-id'] || headers['x-username']) {
        const ticketRes = await fetch('/api/tickets', { headers });
        if (ticketRes.ok) {
          const tData = await ticketRes.json();
          if (Array.isArray(tData.tickets)) {
            setTickets(tData.tickets);
          }
        }
      }

      // Sync users from backend if session exists
      const userRes = await fetch('/api/users', { headers });
      if (userRes.ok) {
        const uData = await userRes.json();
        if (Array.isArray(uData.users) && uData.users.length > 0) {
          setUsers(uData.users);
        }
      }
    } catch (err: any) {
      console.warn('[CentralData] Sync error:', err);
      setDataLoadError(err?.message || 'Gagal memuat data dari database pusat');
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
      headers: { 'Content-Type': 'application/json' },
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
  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string; user?: User }> => {
    const cleanUser = username.trim().toLowerCase();
    const hash = quickHash(password);

    // Try backend authentication with rate limiting and session creation
    try {
      const serverRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUser, password })
      });
      const data = await serverRes.json();
      if (!data.success) {
        addAuditLog('Login Attempt Failed', 'auth', cleanUser, data.error || 'Login gagal');
        return { success: false, error: data.error || 'Username atau kata sandi yang Anda masukkan salah.' };
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

        addAuditLog('Login Success', 'auth', authedUser.id, `Pengguna ${authedUser.name} (${authedUser.role}) berhasil login ke sistem`);
        loadCentralData();
        return { success: true, user: authedUser };
      }
    } catch (netErr) {
      // Local fallback in case network to server fails
    }

    const found = users.find(u => (u.username.toLowerCase() === cleanUser || u.email?.toLowerCase() === cleanUser) && !u.isArchived);

    if (!found || (found.passwordHash && found.passwordHash !== hash)) {
      addAuditLog('Login Attempt Failed', 'auth', cleanUser, `Percobaan login gagal untuk username/email: ${cleanUser}`);
      return { success: false, error: 'Username atau kata sandi yang Anda masukkan salah.' };
    }

    if (!found.active) {
      addAuditLog('Login Blocked Inactive', 'auth', found.id, `Akun dinonaktifkan mencoba login: ${found.username}`);
      return { success: false, error: 'Akun Anda telah dinonaktifkan oleh Administrator. Hubungi Super Admin.' };
    }

    const now = new Date().toISOString();
    const updatedUser: User = {
      ...found,
      lastLoginAt: now,
      loginCount: (found.loginCount || 0) + 1
    };

    setUsers(prev => prev.map(u => u.id === found.id ? updatedUser : u));
    setCurrentUser(updatedUser);
    setIsLoggedIn(true);

    try {
      localStorage.setItem('morajaws_logged_in', 'true');
      localStorage.setItem('morajaws_auth_session', JSON.stringify({
        userId: found.id,
        username: found.username,
        role: found.role,
        name: found.name,
        loginAt: now,
        token: `mora_${found.id}_${Date.now()}`
      }));
    } catch (e) {}

    addAuditLog('Login Success', 'auth', found.id, `Pengguna ${found.name} (${found.role}) berhasil login ke sistem`);
    await loadCentralData();
    return { success: true, user: updatedUser };
  };

  const loginWithFirebase = async (firebaseData: { email: string; uid: string; displayName?: string }): Promise<{ success: boolean; error?: string; user?: User }> => {
    try {
      const serverRes = await fetch('/api/auth/firebase-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(firebaseData)
      });
      const data = await serverRes.json();
      if (!data.success) {
        const cleanEmail = String(firebaseData.email || '').trim().toLowerCase();
        if (cleanEmail === 'tarnocepak@gmail.com') {
          const superAdmin = users.find(u => u.role === 'super_admin') || DEFAULT_USERS[0];
          const authedUser: User = {
            ...superAdmin,
            email: cleanEmail,
            lastLoginAt: new Date().toISOString()
          };
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
              token: `mora_fb_${authedUser.id}_${Date.now()}`
            }));
          } catch (e) {}
          addAuditLog('Login Success (Firebase Super Admin)', 'auth', authedUser.id, `Pengguna ${authedUser.name} (${authedUser.role}) berhasil login via Firebase Auth`);
          return { success: true, user: authedUser };
        }
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
      const cleanEmail = String(firebaseData.email || '').trim().toLowerCase();
      if (cleanEmail === 'tarnocepak@gmail.com') {
        const superAdmin = users.find(u => u.role === 'super_admin') || DEFAULT_USERS[0];
        const authedUser: User = {
          ...superAdmin,
          email: cleanEmail,
          lastLoginAt: new Date().toISOString()
        };
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
            token: `mora_fb_${authedUser.id}_${Date.now()}`
          }));
        } catch (e) {}
        return { success: true, user: authedUser };
      }
      return { success: false, error: err?.message || 'Gagal menghubungi server autentikasi.' };
    }
  };

  const logout = () => {
    addAuditLog('User Logout', 'auth', currentUser.id, `Pengguna ${currentUser.name} (${currentUser.role}) logout dari sistem`);
    setIsLoggedIn(false);
    try {
      localStorage.setItem('morajaws_logged_in', 'false');
      localStorage.removeItem('morajaws_auth_session');
    } catch (e) {}

    fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
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
      addAuditLog('User Permanently Deleted', 'auth', userId, `Super Admin ${currentUser.name} menghapus permanen akun ${target.name} (@${target.username}). Alasan: ${reason}`);
      toast.warning(`Akun ${target.name} (@${target.username}) telah dihapus secara permanen.`, 'Akun Dihapus Permanen');
    } else {
      setUsers(prev => prev.map(u => (u.id === userId ? {
        ...u,
        isArchived: true,
        active: false,
        deletedAt: now,
        deletedBy: currentUser.name,
        deletionReason: reason
      } : u)));
      addAuditLog('User Soft Deleted', 'auth', userId, `Super Admin ${currentUser.name} menonaktifkan & menandai terhapus (soft delete) akun ${target.name} (@${target.username}). Alasan: ${reason}`);
      toast.warning(`Akun ${target.name} (@${target.username}) berhasil dinonaktifkan & ditandai terhapus.`, 'Akun Dihapus (Soft Delete)');
    }

    fetch(`/api/users/${userId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      body: JSON.stringify({ reason, permanent })
    }).catch(e => console.error('Error syncing user deletion to server:', e));

    return { success: true };
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
    setTickets(prev => prev.map(t => {
      const isTarget = t.idCustomer === customerId || t.customerId === customerId;
      if (!isTarget) return t;
      return {
        ...t,
        isDeleted: true,
        deletedAt: now,
        deletedBy: currentUser.name,
        deletionReason: `Penghapusan data pelanggan ID ${customerId}: ${reason}`
      };
    }));

    addAuditLog('Customer Data Deleted', 'ticket', customerId, `Super Admin ${currentUser.name} menghapus data pelanggan ID ${customerId}. Alasan: ${reason}`);
    toast.warning(`Data pelanggan ID ${customerId} berhasil dihapus dari sistem.`, 'Data Pelanggan Dihapus');
    return { success: true };
  };

  // Account Registration
  const registerDispatchAccount = (data: { name: string; username: string; phone?: string; email?: string }) => {
    if (currentUser.role !== 'super_admin') {
      addAuditLog('Unauthorized Staff Registration Blocked', 'auth', 'dispatch', `Ditolak: Leader/Staf ${currentUser.name} (${currentUser.role}) mencoba mendaftarkan akun Dispatch. Leader tidak dapat membuat akun staf selain installer.`);
      return { success: false, error: 'Akses Ditolak: Leader tidak dapat membuat akun staf lain selain Installer. Pendaftaran Dispatch hanya dapat dilakukan oleh Super Admin.' };
    }
    const cleanUsername = data.username.trim().toLowerCase();
    if (!cleanUsername) return { success: false, error: 'Username wajib diisi.' };

    if (users.some(u => u.username.toLowerCase() === cleanUsername)) {
      return { success: false, error: `Username "${cleanUsername}" sudah digunakan. Gunakan username lain.` };
    }

    const newUser: User = {
      id: 'u-' + Date.now(),
      name: data.name.trim(),
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
      addAuditLog('Unauthorized Staff Registration Blocked', 'auth', 'leader', `Ditolak: Leader/Staf ${currentUser.name} (${currentUser.role}) mencoba mendaftarkan akun Leader. Leader tidak dapat membuat akun staf selain installer.`);
      toast.error('Akses Ditolak: Leader tidak dapat membuat akun staf selain Installer.', 'Otoritas Dibatasi');
      return { success: false, error: 'Akses Ditolak: Leader tidak dapat membuat akun staf lain selain Installer. Pendaftaran Leader hanya dapat dilakukan oleh Super Admin.' };
    }
    const cleanUsername = data.username.trim().toLowerCase();
    if (!cleanUsername) return { success: false, error: 'Username wajib diisi.' };

    if (users.some(u => u.username.toLowerCase() === cleanUsername)) {
      return { success: false, error: `Username "${cleanUsername}" sudah digunakan. Gunakan username lain.` };
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
        leaderName: data.name.trim(),
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
        `Kontraktor ${matchedContractor.name} (${matchedContractor.code}) didaftarkan otomatis saat membuat akun Leader ${data.name}`
      );
    } else {
      // Ensure area is added to contractor coverage if not already there
      if (data.area && !matchedContractor.coverageAreas.some(a => a.toLowerCase() === data.area.toLowerCase())) {
        const updatedAreas = [...matchedContractor.coverageAreas, data.area];
        const updatedContractorObj = { ...matchedContractor, coverageAreas: updatedAreas, leaderName: matchedContractor.leaderName || data.name.trim() };
        setContractors(prev =>
          prev.map(c => c.id === matchedContractor!.id ? updatedContractorObj : c)
        );
        saveContractorToFirestore(updatedContractorObj).catch(e => console.warn('[Firestore] Error updating contractor:', e));
      }
    }

    const newUser: User = {
      id: 'u-' + Date.now(),
      name: data.name.trim(),
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
    // Both Leader (for their contractor) and Super Admin can register installers
    if (currentUser.role !== 'leader' && currentUser.role !== 'super_admin') {
      toast.error('Hanya Leader / Korlap atau Super Admin yang berwenang mendaftarkan Installer.', 'Akses Ditolak');
      return { success: false, error: 'Hanya Leader / Korlap atau Super Admin yang berwenang mendaftarkan Installer.' };
    }

    const cleanUsername = data.username.trim().toLowerCase();
    if (!cleanUsername) return { success: false, error: 'Username wajib diisi.' };

    if (users.some(u => u.username.toLowerCase() === cleanUsername)) {
      return { success: false, error: `Username "${cleanUsername}" sudah digunakan. Gunakan username lain.` };
    }

    const contractorName = currentUser.role === 'leader' ? (currentUser.contractor || 'PT Mitra Jaringan Solusi') : (contractors[0]?.name || 'PT Mitra Jaringan Solusi');
    const contractorObj = contractors.find(c => c.name === contractorName);

    const newUser: User = {
      id: 'u-' + Date.now(),
      name: data.name.trim(),
      username: cleanUsername,
      email: data.email?.trim() || `${cleanUsername}@installer.morajaws.net`,
      phone: data.phone.trim(),
      role: 'installer',
      contractor: contractorName,
      contractorId: contractorObj?.id,
      area: currentUser.area || contractorObj?.coverageAreas[0] || 'Jabodetabek',
      active: true,
      mustChangePassword: true,
      createdAt: new Date().toISOString()
    };

    setUsers(prev => [...prev, newUser]);
    saveUserToFirestore(newUser).catch(e => console.warn('[Firestore] Error saving installer user:', e));
    addAuditLog('Installer Account Registered', 'auth', newUser.id, `${currentUser.name} registered Installer: ${newUser.name} under ${contractorName}`);

    fetch('/api/users', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(newUser)
    }).catch(e => console.error('Error syncing installer account to server:', e));

    toast.success(`Teknisi ${newUser.name} berhasil didaftarkan ke ${contractorName}! Password default: 12345678`, 'Teknisi Ditambahkan');
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

    const report: TechnicalReport = {
      ...reportData,
      id: 'rep-' + Date.now(),
      ticketId,
      submittedBy: currentUser.name,
      submittedAt: new Date().toISOString()
    };

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
          _offlineSyncStatus: !isOnline ? 'pending' : 'synced',
          _offlineLastModified: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser.name
        };
      })
    );

    const activity: TicketActivity = {
      id: 'act-' + Date.now(),
      ticketId,
      woNumber: ticket.woNumber,
      action: 'Laporan Pekerjaan Teknisi Diserahkan',
      description: `Root Cause: ${report.rootCause} | Hasil: ${report.workResult}`,
      performedBy: currentUser.name,
      userRole: currentUser.role,
      timestamp: new Date().toISOString()
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
      statusWOAgent: reportData.workResult === 'Pekerjaan Berhasil' || reportData.workResult === 'Selesai' ? 'Resolved' : ticket.statusWOAgent,
      _offlineSyncStatus: !isOnline ? 'pending' : 'synced',
      _offlineLastModified: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser.name
    };

    saveTicketToFirestore(updatedWithReport)
      .then(() => {
        toast.success(`Laporan teknis lapangan untuk WO ${ticket.woNumber} berhasil disimpan ke Cloud Firestore.`, 'Laporan Teknis Tersimpan');
      })
      .catch(err => {
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

  const saveProgressReport = async (
    ticketId: string,
    data: { reportStatus: string; reasonReport: string; rootCause: string; remarksReport: string }
  ): Promise<{ success: boolean; error?: string; report?: ProgressReportEntry }> => {
    const ticket = getTicketById(ticketId);
    if (!ticket) return { success: false, error: 'Tiket tidak ditemukan.' };

    if (!data.reportStatus) {
      return { success: false, error: 'Report Status wajib dipilih.' };
    }
    if (!data.reasonReport) {
      return { success: false, error: 'Reason Report wajib dipilih.' };
    }
    if (!data.rootCause) {
      return { success: false, error: 'Rootcause wajib dipilih.' };
    }
    if (!data.remarksReport?.trim()) {
      return { success: false, error: 'Remarks Report wajib diisi.' };
    }

    const now = new Date().toISOString();
    const entry: ProgressReportEntry = {
      id: 'prog-' + Date.now(),
      ticketId,
      timestamp: now,
      submittedBy: currentUser.name,
      userRole: currentUser.role,
      reportStatus: data.reportStatus,
      reasonReport: data.reasonReport,
      rootCause: data.rootCause,
      remarksReport: data.remarksReport.trim(),
      installerName: ticket.installerName,
      appointmentDate: ticket.appointmentDate || ticket.date,
      slotTime: ticket.slotTime
    };

    const techReport: TechnicalReport = {
      id: ticket.technicalReport?.id || ('rep-' + Date.now()),
      ticketId,
      mainCategory: 'Report Status Lapangan',
      rootCause: data.rootCause,
      workResult: data.reasonReport,
      technicalDescription: data.remarksReport.trim(),
      correctiveAction: data.reasonReport,
      submittedBy: currentUser.name,
      submittedAt: now
    };

    const nextInstallerStatus = data.reportStatus as TicketStatusWOInstaller;
    const isCompleted = data.reportStatus === 'Completed' || data.reportStatus === 'Installed';

    const updatedWithProgress: Ticket = {
      ...ticket,
      progressReports: [entry, ...(ticket.progressReports || [])],
      statusWOInstaller: nextInstallerStatus,
      statusWOAgent: isCompleted ? 'Resolved' : ticket.statusWOAgent,
      remarksWOInstaller: data.remarksReport.trim(),
      technicalReport: techReport,
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
      action: `Progress Report: ${data.reportStatus}`,
      description: `Reason: ${data.reasonReport} | Rootcause: ${data.rootCause} | Remarks: ${data.remarksReport.trim()}`,
      performedBy: currentUser.name,
      userRole: currentUser.role,
      timestamp: now
    };
    setTicketActivities(prev => [activity, ...prev]);

    addAuditLog(
      'Progress Report Saved',
      'ticket',
      ticketId,
      `Teknisi ${currentUser.name} melaporkan status ${data.reportStatus} untuk WO ${ticket.woNumber} (Reason: ${data.reasonReport})`
    );

    if (!isOnline) {
      enqueueChange({
        entity: 'technical_report',
        entityId: ticketId,
        action: 'REPORT',
        summary: `Progress Report WO ${ticket.woNumber} (${data.reportStatus})`,
        payload: { ticketId, entry },
        user: { id: currentUser.id, name: currentUser.name, role: currentUser.role }
      }).catch(e => console.warn('Offline progress report enqueue error', e));
    }

    // Persist progress report to Cloud Firestore (Confirmed Write)
    try {
      if (isOnline) {
        await saveTicketToFirestore(updatedWithProgress);
        toast.success(`Progress report WO ${ticket.woNumber} berhasil disimpan ke Cloud Firestore.`, 'Progress Report Tersimpan');
      } else {
        await saveTicketsOffline([updatedWithProgress]);
        toast.warning(`Progress report WO ${ticket.woNumber} tersimpan offline di IndexedDB lokal.`, 'Laporan Offline');
      }
    } catch (err: any) {
      console.error('Failed writing progress report to Firestore:', err);
      toast.error('Gagal menyimpan progress report ke Cloud Firestore: ' + (err?.message || err), 'Penyimpanan Gagal');
      return { success: false, error: err?.message || 'Gagal menyimpan ke Cloud Firestore' };
    }

    fetch(`/api/tickets/${ticketId}/progress-report`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ entry, status: nextInstallerStatus, remarks: data.remarksReport })
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

    saveTicketToFirestore(closedTicket)
      .then(() => {
        toast.success(`Tiket WO ${ticket.woNumber} resmi ditutup (Closed) oleh Dispatch.`, 'Tiket Ditutup');
      })
      .catch(err => {
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

    saveTicketToFirestore(reopenedTicket)
      .then(() => {
        toast.info(`Tiket WO ${ticket.woNumber} berhasil dibuka kembali (Reopened).`, 'Tiket Dibuka Kembali');
      })
      .catch(err => {
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

    const newMessage: TicketMessage = {
      id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      ticketId,
      woNumber: ticket.woNumber,
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderRole: currentUser.role,
      text: text.trim(),
      category: category?.trim() || undefined,
      attachments,
      timestamp: new Date().toISOString(),
      readBy: [currentUser.id]
    };

    setTicketMessages(prev => [...prev, newMessage]);

    // Update ticket message indicators
    const updatedTicketChat = {
      ...ticket,
      chatMessagesCount: (ticket.chatMessagesCount || 0) + 1,
      lastMessageAt: newMessage.timestamp,
      lastMessageSnippet: text.trim() || (attachments.length > 0 ? `[Foto: ${attachments[0].fileName}]` : '')
    };

    setTickets(prev =>
      prev.map(t => (t.id === ticketId ? updatedTicketChat : t))
    );

    sendChatMessageToFirestore(newMessage).catch(e => console.warn('[Firestore] Error saving chat message:', e));
    saveTicketToFirestore(updatedTicketChat).catch(() => {});

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
    saveTicketToFirestore(processed).catch(e => console.warn('[Firestore] Error saving created ticket:', e));

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
      saveTicketToFirestore(mergedTicket).catch(e => console.warn('[Firestore] Error updating ticket:', e));
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
      saveTicketToFirestore(updatedTicketItem)
        .then(() => {
          if (installerName && currentUser.role === 'leader') {
            toast.success(`Teknisi ${installerName} berhasil ditugaskan ke WO ${targetTicket?.woNumber || ''}!`, 'Penugasan Berhasil');
          }
        })
        .catch(err => {
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
    batchSaveTicketsToFirestore(updatedTicketsList)
      .then(({ saved }) => {
        toast.success(`Berhasil memperbarui penugasan untuk ${saved} tiket di Cloud Firestore.`, 'Penugasan Massal Sukses');
      })
      .catch(err => {
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
    saveTicketToFirestore(reassignRes.ticket)
      .then(() => {
        toast.success(`WO ${ticket.woNumber} berhasil dialihkan ke ${newInstallerName}!`, 'Reassign Berhasil');
      })
      .catch(err => {
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
      saveTicketToFirestore(updatedTicketItem)
        .then(() => {
          toast.info(`Status WO ${target?.woNumber || ticketId} diperbarui (${statusInstaller || statusAgent || 'Updated'}).`, 'Status Berubah');
        })
        .catch(err => {
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
    saveTicketToFirestore(archived).catch(() => {});
    addAuditLog('Ticket Archived', 'ticket', ticketId, `Ticket moved to archive`);
    toast.info(`WO ${target?.woNumber || ticketId} dipindahkan ke arsip.`, 'Tiket Diarsipkan');
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
    saveTicketToFirestore(restored).catch(() => {});
    addAuditLog('Ticket Restored', 'ticket', ticketId, `Ticket restored from archive/deletion`);
    toast.success(`WO ${target?.woNumber || ticketId} berhasil dipulihkan dari arsip.`, 'Tiket Dipulihkan');
  };

  const deleteTicket = (ticketId: string, reason: string, permanent: boolean = false): { success: boolean; error?: string } => {
    // STRICT SECURITY POLICY: Only Super Admin can delete WO!
    if (currentUser.role !== 'super_admin') {
      const err = 'Akses Ditolak: Hanya akun dengan kategori Super Admin yang memiliki wewenang menghapus data Work Order.';
      addAuditLog('Unauthorized Deletion Attempt', 'ticket', ticketId, `${currentUser.name} (${currentUser.role}) mencoba menghapus WO tanpa izin Super Admin`);
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
      addAuditLog('Ticket Permanently Deleted', 'ticket', ticketId, `Super Admin ${currentUser.name} menghapus permanen WO ${ticket.woNumber}. Alasan: ${reason}`);
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
      addAuditLog('Ticket Soft Deleted', 'ticket', ticketId, `Super Admin ${currentUser.name} menandai terhapus (soft delete) WO ${ticket.woNumber}. Alasan: ${reason}`);
    }

    const deletePromise = permanent
      ? deleteTicketFromFirestore(ticketId)
      : softDeleteTicketInFirestore(ticketId, currentUser.name, reason);

    deletePromise
      .then(() => {
        if (permanent) {
          toast.warning(`WO ${ticket.woNumber} telah dihapus permanen dari Cloud Firestore.`, 'Dihapus Permanen');
        } else {
          toast.warning(`WO ${ticket.woNumber} berhasil dihapus (soft delete).`, 'WO Dihapus');
        }
      })
      .catch(err => {
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
      batchSaveTicketsToFirestore(itemsToSave)
        .then(({ saved }) => {
          toast.success(
            `Berhasil menyimpan ${saved} tiket ke Cloud Firestore${updatedCount > 0 ? ` (${newItems.length} baru, ${updatedCount} diperbarui)` : ''}.${duplicatesIgnored > 0 ? ` (${duplicatesIgnored} nomor WO duplikat ditolak)` : ''}`,
            'Import Selesai'
          );
        })
        .catch(err => {
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
    if (currentUser.role !== 'super_admin' && currentUser.role !== 'dispatch') {
      const err = 'Akses Ditolak: Hanya Super Admin atau Dispatch yang berwenang menghapus data import.';
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
      const tImportDate = t.importDate || (t.importedAt ? t.importedAt.split('T')[0] : t.createdAt.split('T')[0]);
      return tImportDate === importDate && !t.isDeleted;
    });

    if (matchingTickets.length === 0) {
      toast.info(`Tidak ada tiket import yang ditemukan pada tanggal ${importDate}.`, 'Tidak Ditemukan');
      return { success: false, count: 0, error: 'Tidak ada tiket pada tanggal tersebut.' };
    }

    const targetIds = new Set(matchingTickets.map(t => t.id));
    setTickets(prev => prev.filter(t => !targetIds.has(t.id)));

    // Delete matching from Firestore
    Promise.all(matchingTickets.map(t => deleteTicketFromFirestore(t.id))).catch(err => {
      console.warn('[Firestore] Error deleting batch tickets:', err);
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
      `Super Admin/Dispatch ${currentUser.name} menghapus ${matchingTickets.length} data tiket hasil import tanggal ${importDate}. Alasan: ${reason}`
    );

    toast.warning(`Berhasil menghapus ${matchingTickets.length} tiket hasil import tanggal ${importDate} dari Cloud Firestore.`, 'Data Import Dihapus');
    return { success: true, count: matchingTickets.length };
  };

  // Bulk delete tickets for Super Admin
  const bulkDeleteTickets = (
    ticketIds: string[],
    reason: string
  ): { success: boolean; count: number; error?: string } => {
    if (currentUser.role !== 'super_admin') {
      const err = 'Akses Ditolak: Hanya akun dengan peran Super Admin yang memiliki wewenang menghapus data Work Order.';
      toast.error(err, 'Akses Ditolak');
      return { success: false, count: 0, error: err };
    }

    if (!reason || reason.trim().length < 5) {
      toast.error('Alasan penghapusan tiket wajib diisi minimal 5 karakter.', 'Validasi Gagal');
      return { success: false, count: 0, error: 'Alasan penghapusan minimal 5 karakter.' };
    }

    const targetSet = new Set(ticketIds);
    let deletedCount = 0;
    setTickets(prev => {
      const remaining = prev.filter(t => {
        if (targetSet.has(t.id)) {
          deletedCount++;
          return false;
        }
        return true;
      });
      return remaining;
    });

    // Delete in Cloud Firestore with confirmation before toast
    Promise.all(ticketIds.map(id => deleteTicketFromFirestore(id)))
      .then(() => {
        toast.warning(`Berhasil menghapus ${deletedCount} tiket Work Order dari Cloud Firestore.`, 'Hapus WO Berhasil');
      })
      .catch(err => {
        toast.error('Gagal menghapus tiket massal di Cloud Firestore: ' + (err?.message || err), 'Gagal');
      });

    fetch('/api/tickets/bulk-delete', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ ticketIds, reason })
    }).catch(e => console.error('Error syncing bulk delete tickets to server:', e));

    addAuditLog(
      'Bulk Tickets Deleted',
      'ticket',
      `${ticketIds.length} tickets`,
      `Super Admin ${currentUser.name} menghapus massal ${ticketIds.length} tiket Work Order. Alasan: ${reason}`
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

  // WhatsApp helpers
  const createTemplate = (data: Omit<WhatsAppTemplate, 'id' | 'version' | 'lastUpdated'>): WhatsAppTemplate => {
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
    setTemplates(prev => prev.filter(t => t.id !== id));
    deleteTemplateFromFirestore(id).catch(e => console.warn('[Firestore] Error deleting template:', e));
    addAuditLog('Template Deleted', 'template', id, `Deleted template ${id}`);
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
        contractors,
        addContractor,
        updateContractor,
        autoRegisterContractors,
        coverageAreas,
        addCoverageArea,
        updateCoverageArea,
        rootCauseCategories,
        workResultsList,
        updateRootCauseCategories,
        saveTechnicalReport,
        saveProgressReport,
        verifyTechnicalReport,
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
        isFirestoreReady
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
