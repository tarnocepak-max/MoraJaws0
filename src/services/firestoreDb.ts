import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  query,
  orderBy,
  limit,
  Unsubscribe
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, isQuotaExceededError, isPermissionError } from '../lib/firebase';
import {
  Ticket,
  Contractor,
  CoverageArea,
  TicketMessage,
  AuditLog,
  WhatsAppTemplate,
  User,
  UIConfiguration,
  ReportDropdownCategory,
  DroplistItem,
  getCategoryPermanentId,
  NavCategoryConfig,
  StandaloneMenuItem,
  NavSubmenuItem,
  NavigationFirestoreDoc,
  ChatCategoryConfig,
  HierarchicalStatus,
  HierarchicalReason,
  HierarchicalRemark,
  HierarchicalDroplistData
} from '../types/index.ts';
import { deduplicateTicketsInMemory, getDeterministicTicketId, normalizeWoNumber } from './woDeduplicationService';
import { getAuthHeaders } from './authService';

// Collection path constants
export const COLLECTIONS = {
  TICKETS: 'tickets',
  USERS: 'users',
  CONTRACTORS: 'contractors',
  COVERAGE_AREAS: 'coverage_areas',
  MESSAGES: 'ticket_messages',
  AUDIT_LOGS: 'audit_logs',
  WA_TEMPLATES: 'wa_templates',
  APP_SETTINGS: 'appSettings',
  REPORT_DROPDOWN_CATEGORIES: 'report_dropdown_categories',
  HEALTH: 'system_health'
} as const;

/**
 * Evaluates whether Firestore is active for the current runtime environment.
 * Per Phase 13E directives:
 * - Production: Firestore is STRICTLY deactivated as an active database and preserved solely as an archive/backup.
 * - Development: Inactive by default; only active if explicitly enabled via VITE_ENABLE_FIRESTORE_DEV === 'true'.
 */
export function isFirestoreActiveForEnvironment(): boolean {
  if (typeof window !== 'undefined') {
    if (import.meta.env.PROD || process.env.NODE_ENV === 'production') {
      return false;
    }
    return import.meta.env.VITE_ENABLE_FIRESTORE_DEV === 'true';
  }
  return false;
}

// -------------------------------------------------------------
// Data Sanitizer (Removes undefined fields which Firestore rejects)
// -------------------------------------------------------------
function sanitizeForFirestore(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj.toISOString();

  if (Array.isArray(obj)) {
    return (obj as any[])
      .filter(item => item !== undefined)
      .map(item => {
        if (item !== null && typeof item === 'object' && !(item instanceof Date)) {
          return sanitizeForFirestore(item);
        }
        if (item instanceof Date) return item.toISOString();
        return item;
      }) as any;
  }

  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) continue;
    if (val instanceof Date) {
      result[key] = val.toISOString();
    } else if (val !== null && typeof val === 'object') {
      if (Array.isArray(val)) {
        result[key] = (val as any[])
          .filter(item => item !== undefined)
          .map(item => {
            if (item !== null && typeof item === 'object' && !(item instanceof Date)) {
              return sanitizeForFirestore(item);
            }
            if (item instanceof Date) return item.toISOString();
            return item;
          });
      } else {
        result[key] = sanitizeForFirestore(val);
      }
    } else {
      result[key] = val;
    }
  }
  return result;
}

// -------------------------------------------------------------
// Real-time Subscriptions (onSnapshot)
// -------------------------------------------------------------
export interface FirestoreSubscriptionCallbacks {
  onTicketsChange?: (tickets: Ticket[]) => void;
  onContractorsChange?: (contractors: Contractor[]) => void;
  onCoverageAreasChange?: (areas: CoverageArea[]) => void;
  onMessagesChange?: (messages: TicketMessage[]) => void;
  onAuditLogsChange?: (logs: AuditLog[]) => void;
  onTemplatesChange?: (templates: WhatsAppTemplate[]) => void;
  onUsersChange?: (users: User[]) => void;
  onReportDropdownCategoriesChange?: (categories: ReportDropdownCategory[]) => void;
  onChatCategoriesChange?: (categories: ChatCategoryConfig[]) => void;
  onHierarchicalDroplistsChange?: (statuses: HierarchicalStatus[]) => void;
  onError?: (error: Error) => void;
  userRole?: string;
}

export function subscribeToMoraJawsFirestore(callbacks: FirestoreSubscriptionCallbacks): () => void {
  // Phase 13E: Hentikan seluruh listener Firestore aktif pada mode production
  if (!isFirestoreActiveForEnvironment()) {
    console.info('[MoraJaws Phase 13E] Listener Firestore dinonaktifkan di lingkungan produksi. Seluruh data dipasok oleh Express API & Supabase PostgreSQL.');
    return () => {};
  }

  const unsubs: Unsubscribe[] = [];

  // 1. Tickets Real-Time Listener
  if (callbacks.onTicketsChange) {
    try {
      const ticketsRef = collection(db, COLLECTIONS.TICKETS);
      const unsub = onSnapshot(
        ticketsRef,
        (snapshot) => {
          const rawTickets: Ticket[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as Ticket;
            if (!data.id) data.id = docSnap.id;
            rawTickets.push(data);
          });
          const deduplicated = deduplicateTicketsInMemory(rawTickets);
          callbacks.onTicketsChange?.(deduplicated);
        },
        (error) => {
          if (isPermissionError(error)) {
            try {
              handleFirestoreError(error, OperationType.LIST, COLLECTIONS.TICKETS);
            } catch (e: any) {
              callbacks.onError?.(e);
            }
          } else {
            console.warn('[Firestore] Tickets subscription notice:', error?.message || error);
            callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
          }
        }
      );
      unsubs.push(unsub);
    } catch (err: any) {
      console.warn('[Firestore] Failed attaching tickets listener:', err);
    }
  }

  // 2. Contractors Real-Time Listener
  if (callbacks.onContractorsChange) {
    try {
      const contrRef = collection(db, COLLECTIONS.CONTRACTORS);
      const unsub = onSnapshot(
        contrRef,
        (snapshot) => {
          const contractors: Contractor[] = [];
          snapshot.forEach((docSnap) => {
            contractors.push(docSnap.data() as Contractor);
          });
          callbacks.onContractorsChange?.(contractors);
        },
        (error) => {
          if (isPermissionError(error)) {
            try {
              handleFirestoreError(error, OperationType.LIST, COLLECTIONS.CONTRACTORS);
            } catch (e: any) {
              callbacks.onError?.(e);
            }
          } else {
            console.warn('[Firestore] Contractors subscription notice:', error?.message || error);
            callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
          }
        }
      );
      unsubs.push(unsub);
    } catch (err: any) {
      console.warn('[Firestore] Failed attaching contractors listener:', err);
    }
  }

  // 3. Coverage Areas Real-Time Listener
  if (callbacks.onCoverageAreasChange) {
    try {
      const areasRef = collection(db, COLLECTIONS.COVERAGE_AREAS);
      const unsub = onSnapshot(
        areasRef,
        (snapshot) => {
          const areas: CoverageArea[] = [];
          snapshot.forEach((docSnap) => {
            areas.push(docSnap.data() as CoverageArea);
          });
          callbacks.onCoverageAreasChange?.(areas);
        },
        (error) => {
          if (isPermissionError(error)) {
            try {
              handleFirestoreError(error, OperationType.LIST, COLLECTIONS.COVERAGE_AREAS);
            } catch (e: any) {
              callbacks.onError?.(e);
            }
          } else {
            console.warn('[Firestore] Areas subscription notice:', error?.message || error);
            callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
          }
        }
      );
      unsubs.push(unsub);
    } catch (err: any) {
      console.warn('[Firestore] Failed attaching areas listener:', err);
    }
  }

  // 4. Ticket Messages (Live Chat) Real-Time Listener
  if (callbacks.onMessagesChange) {
    try {
      const msgRef = collection(db, COLLECTIONS.MESSAGES);
      const unsub = onSnapshot(
        msgRef,
        (snapshot) => {
          const messages: TicketMessage[] = [];
          snapshot.forEach((docSnap) => {
            messages.push(docSnap.data() as TicketMessage);
          });
          callbacks.onMessagesChange?.(messages);
        },
        (error) => {
          if (isPermissionError(error)) {
            try {
              handleFirestoreError(error, OperationType.LIST, COLLECTIONS.MESSAGES);
            } catch (e: any) {
              callbacks.onError?.(e);
            }
          } else {
            console.warn('[Firestore] Messages subscription notice:', error?.message || error);
            callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
          }
        }
      );
      unsubs.push(unsub);
    } catch (err: any) {
      console.warn('[Firestore] Failed attaching messages listener:', err);
    }
  }

  // 5. Audit Logs Real-Time Listener (Strictly restricted to super_admin and it_support)
  if (callbacks.onAuditLogsChange && (callbacks.userRole === 'super_admin' || callbacks.userRole === 'it_support')) {
    try {
      const auditRef = collection(db, COLLECTIONS.AUDIT_LOGS);
      const auditQuery = query(auditRef, orderBy('timestamp', 'desc'), limit(150));
      const unsub = onSnapshot(
        auditQuery,
        (snapshot) => {
          const logs: AuditLog[] = [];
          snapshot.forEach((docSnap) => {
            logs.push(docSnap.data() as AuditLog);
          });
          callbacks.onAuditLogsChange?.(logs);
        },
        (error) => {
          // Remediation 4.5: Non-fatal notice. Never disrupt global sync status due to audit logs!
          console.warn('[Firestore] Audit logs subscription notice (non-fatal):', error?.message || error);
        }
      );
      unsubs.push(unsub);
    } catch (err: any) {
      console.warn('[Firestore] Failed attaching audit logs listener:', err);
    }
  }

  // 6. WhatsApp Templates Real-Time Listener
  if (callbacks.onTemplatesChange) {
    try {
      const tplRef = collection(db, COLLECTIONS.WA_TEMPLATES);
      const unsub = onSnapshot(
        tplRef,
        (snapshot) => {
          const tpls: WhatsAppTemplate[] = [];
          snapshot.forEach((docSnap) => {
            tpls.push(docSnap.data() as WhatsAppTemplate);
          });
          callbacks.onTemplatesChange?.(tpls);
        },
        (error) => {
          if (isPermissionError(error)) {
            try {
              handleFirestoreError(error, OperationType.LIST, COLLECTIONS.WA_TEMPLATES);
            } catch (e: any) {
              callbacks.onError?.(e);
            }
          } else {
            console.warn('[Firestore] Templates subscription notice:', error?.message || error);
            callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
          }
        }
      );
      unsubs.push(unsub);
    } catch (err: any) {
      console.warn('[Firestore] Failed attaching templates listener:', err);
    }
  }

  // 7. Users Real-Time Listener
  if (callbacks.onUsersChange) {
    try {
      const usersRef = collection(db, COLLECTIONS.USERS);
      const unsub = onSnapshot(
        usersRef,
        (snapshot) => {
          const users: User[] = [];
          snapshot.forEach((docSnap) => {
            users.push(docSnap.data() as User);
          });
          callbacks.onUsersChange?.(users);
        },
        (error) => {
          if (isPermissionError(error)) {
            try {
              handleFirestoreError(error, OperationType.LIST, COLLECTIONS.USERS);
            } catch (e: any) {
              callbacks.onError?.(e);
            }
          } else {
            console.warn('[Firestore] Users subscription notice:', error?.message || error);
            callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
          }
        }
      );
      unsubs.push(unsub);
    } catch (err: any) {
      console.warn('[Firestore] Failed attaching users listener:', err);
    }
  }

  // 8. Report Dropdown Categories Real-Time Listener (stored in appSettings/report_dropdown_categories)
  if (callbacks.onReportDropdownCategoriesChange) {
    try {
      const dropDocRef = doc(db, COLLECTIONS.APP_SETTINGS, 'report_dropdown_categories');
      const unsub = onSnapshot(
        dropDocRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            const cats = Array.isArray(data?.categories) ? (data.categories as ReportDropdownCategory[]) : [];
            if (cats.length > 0) {
              cats.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
              callbacks.onReportDropdownCategoriesChange?.(cats);
              return;
            }
          }
          // Default baseline categories if not yet stored
          callbacks.onReportDropdownCategoriesChange?.(INITIAL_REPORT_DROPDOWN_CATEGORIES);
        },
        (error) => {
          console.warn('[Firestore] Report dropdown categories subscription notice:', error?.message || error);
          callbacks.onReportDropdownCategoriesChange?.(INITIAL_REPORT_DROPDOWN_CATEGORIES);
        }
      );
      unsubs.push(unsub);
    } catch (err: any) {
      console.warn('[Firestore] Failed attaching report dropdown categories listener:', err);
      callbacks.onReportDropdownCategoriesChange?.(INITIAL_REPORT_DROPDOWN_CATEGORIES);
    }
  }

  // 9. Contact Center Chat Categories Listener (stored in appSettings/chat_categories)
  if (callbacks.onChatCategoriesChange) {
    try {
      const chatCatDocRef = doc(db, COLLECTIONS.APP_SETTINGS, 'chat_categories');
      const unsub = onSnapshot(
        chatCatDocRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            const cats = Array.isArray(data?.categories) ? (data.categories as ChatCategoryConfig[]) : [];
            if (cats.length > 0) {
              cats.sort((a, b) => (a.order || 0) - (b.order || 0));
              callbacks.onChatCategoriesChange?.(cats);
              return;
            }
          }
          callbacks.onChatCategoriesChange?.(INITIAL_CHAT_CATEGORIES);
        },
        (error) => {
          console.warn('[Firestore] Chat categories subscription warning:', error);
          callbacks.onChatCategoriesChange?.(INITIAL_CHAT_CATEGORIES);
        }
      );
      unsubs.push(unsub);
    } catch (err: any) {
      console.warn('[Firestore] Failed attaching chat categories listener:', err);
      callbacks.onChatCategoriesChange?.(INITIAL_CHAT_CATEGORIES);
    }
  }

  // 10. Hierarchical Droplist Listener (Status WO -> Reason WO -> Remarks)
  if (callbacks.onHierarchicalDroplistsChange) {
    try {
      const hierDocRef = doc(db, COLLECTIONS.APP_SETTINGS, 'hierarchical_droplists');
      const unsub = onSnapshot(
        hierDocRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            const statuses = Array.isArray(data?.statuses) ? (data.statuses as HierarchicalStatus[]) : [];
            if (statuses.length > 0) {
              statuses.sort((a, b) => (a.order || 0) - (b.order || 0));
              callbacks.onHierarchicalDroplistsChange?.(statuses);
              return;
            }
          }
          callbacks.onHierarchicalDroplistsChange?.(INITIAL_HIERARCHICAL_DROPLISTS);
        },
        (error) => {
          console.warn('[Firestore] Hierarchical droplists subscription warning:', error);
          callbacks.onHierarchicalDroplistsChange?.(INITIAL_HIERARCHICAL_DROPLISTS);
        }
      );
      unsubs.push(unsub);
    } catch (err: any) {
      console.warn('[Firestore] Failed attaching hierarchical droplists listener:', err);
      callbacks.onHierarchicalDroplistsChange?.(INITIAL_HIERARCHICAL_DROPLISTS);
    }
  }

  // Return master cleanup function
  return () => {
    unsubs.forEach(unsub => unsub());
  };
}

/**
 * Dedicated Real-Time Listener for Audit Logs.
 * Strictly registered only after user identity and role are verified (super_admin or it_support).
 * Non-fatal error handling guarantees main application data sync is never disrupted.
 */
export function subscribeToAuditLogs(
  onAuditLogsChange: (logs: AuditLog[]) => void,
  onError?: (error: Error) => void
): () => void {
  try {
    const auditRef = collection(db, COLLECTIONS.AUDIT_LOGS);
    const auditQuery = query(auditRef, orderBy('timestamp', 'desc'), limit(150));
    const unsub = onSnapshot(
      auditQuery,
      (snapshot) => {
        const logs: AuditLog[] = [];
        snapshot.forEach((docSnap) => {
          logs.push(docSnap.data() as AuditLog);
        });
        onAuditLogsChange(logs);
      },
      (error) => {
        console.warn('[Firestore] Dedicated audit logs subscription notice (non-fatal):', error?.message || error);
        onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    );
    return unsub;
  } catch (err: any) {
    console.warn('[Firestore] Failed attaching dedicated audit logs listener:', err);
    return () => {};
  }
}

// -------------------------------------------------------------
// Ticket Mutations (Confirmed Writes)
// -------------------------------------------------------------
export async function saveTicketToFirestore(ticket: Ticket): Promise<void> {
  const targetId = ticket.id || getDeterministicTicketId(ticket.woNumber);
  if (!isFirestoreActiveForEnvironment()) {
    try {
      await fetch(`/api/supabase/work-orders/${encodeURIComponent(targetId)}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(ticket)
      });
    } catch (err) {
      console.warn('[Supabase Direct Sync] Update WO error:', err);
    }
    return;
  }
  const path = `${COLLECTIONS.TICKETS}/${targetId}`;
  try {
    const docRef = doc(db, COLLECTIONS.TICKETS, targetId);
    const sanitized = sanitizeForFirestore({ ...ticket, id: targetId });
    await setDoc(docRef, sanitized, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function batchSaveTicketsToFirestore(tickets: Ticket[]): Promise<{ saved: number; failed: number }> {
  if (tickets.length === 0) return { saved: 0, failed: 0 };
  if (!isFirestoreActiveForEnvironment()) {
    try {
      const res = await fetch('/api/supabase/work-orders/bulk-import', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ tickets })
      });
      const data = await res.json();
      return { saved: data.importedCount || tickets.length, failed: 0 };
    } catch {
      return { saved: 0, failed: tickets.length };
    }
  }
  let saved = 0;
  let failed = 0;

  // Deduplicate before saving to avoid duplicate keys in the same batch
  const uniqueTickets = deduplicateTicketsInMemory(tickets);

  // Process in batches of 450 (Firestore limit is 500 per batch)
  const chunkSize = 450;
  for (let i = 0; i < uniqueTickets.length; i += chunkSize) {
    const chunk = uniqueTickets.slice(i, i + chunkSize);
    const batch = writeBatch(db);

    for (const t of chunk) {
      const targetId = t.id || getDeterministicTicketId(t.woNumber);
      const docRef = doc(db, COLLECTIONS.TICKETS, targetId);
      batch.set(docRef, sanitizeForFirestore({ ...t, id: targetId }), { merge: true });
    }

    try {
      await batch.commit();
      saved += chunk.length;
    } catch (err) {
      console.error('[Firestore] Batch commit failed, falling back to individual writes:', err);
      for (const t of chunk) {
        try {
          await saveTicketToFirestore(t);
          saved++;
        } catch {
          failed++;
        }
      }
    }
  }

  if (saved === 0 && failed > 0) {
    throw new Error(`Semua ${failed} tiket gagal disimpan ke Cloud Firestore.`);
  }

  return { saved, failed };
}

export async function batchDeleteTicketsFromFirestore(ticketIds: string[]): Promise<void> {
  if (!ticketIds || ticketIds.length === 0) return;
  const chunkSize = 450;
  for (let i = 0; i < ticketIds.length; i += chunkSize) {
    const chunk = ticketIds.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    chunk.forEach(id => {
      const docRef = doc(db, COLLECTIONS.TICKETS, id);
      batch.delete(docRef);
    });
    try {
      await batch.commit();
    } catch (err) {
      console.warn('[Firestore] Batch delete error, falling back to individual deletes:', err);
      for (const id of chunk) {
        try {
          await deleteDoc(doc(db, COLLECTIONS.TICKETS, id));
        } catch {}
      }
    }
  }
}

// -------------------------------------------------------------
// Global App Configuration & User Preferences (Permanent Storage)
// -------------------------------------------------------------
export async function saveGlobalAppSettingsToFirestore(settings: Record<string, any>): Promise<void> {
  const path = `${COLLECTIONS.APP_SETTINGS}/global`;
  try {
    const docRef = doc(db, COLLECTIONS.APP_SETTINGS, 'global');
    await setDoc(docRef, {
      ...sanitizeForFirestore(settings),
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function loadGlobalAppSettingsFromFirestore(): Promise<Record<string, any> | null> {
  const path = `${COLLECTIONS.APP_SETTINGS}/global`;
  try {
    const docRef = doc(db, COLLECTIONS.APP_SETTINGS, 'global');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data();
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

export async function saveUserPreferencesToFirestore(userId: string, preferences: Record<string, any>): Promise<void> {
  const path = `users/${userId}/preferences/settings`;
  try {
    const docRef = doc(db, 'users', userId, 'preferences', 'settings');
    await setDoc(docRef, {
      ...sanitizeForFirestore(preferences),
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function loadUserPreferencesFromFirestore(userId: string): Promise<Record<string, any> | null> {
  const path = `users/${userId}/preferences/settings`;
  try {
    const docRef = doc(db, 'users', userId, 'preferences', 'settings');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data();
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

// -------------------------------------------------------------
// UI Builder & Database Application Configuration (Firestore)
// -------------------------------------------------------------
export interface CloudUIConfigurationPayload {
  id?: string;
  config: UIConfiguration;
  navigationItems: any[];
  menuCategories: string[];
  updatedAt: string;
  updatedBy: string;
  app?: string;
  type?: string;
  version?: number;
}

export async function saveUIConfigurationToFirestore(payload: {
  config: UIConfiguration;
  navigationItems: any[];
  menuCategories: string[];
  updatedBy?: string;
}): Promise<{ success: boolean; updatedAt: string }> {
  const path = `${COLLECTIONS.APP_SETTINGS}/ui_configuration`;
  try {
    const docRef = doc(db, COLLECTIONS.APP_SETTINGS, 'ui_configuration');
    const updatedAt = new Date().toISOString();
    const dataToSave = sanitizeForFirestore({
      id: 'ui_configuration',
      config: payload.config,
      navigationItems: payload.navigationItems,
      menuCategories: payload.menuCategories,
      updatedAt,
      updatedBy: payload.updatedBy || 'Super Admin',
      app: 'MoraJaws',
      type: 'database_configuration_app',
      version: Date.now()
    });
    await setDoc(docRef, dataToSave, { merge: true });

    // Build normalized categories mapping according to specification
    const rawCategories = payload.config?.navigationSettings?.categories || {};
    const normalizedCategories: Record<string, { accordionEnabled: boolean }> = {
      dashboard: { accordionEnabled: false },
      operasional: { accordionEnabled: true },
      woContractor: { accordionEnabled: false },
      taskInstaller: { accordionEnabled: false },
      pelanggan: { accordionEnabled: true },
      laporan: { accordionEnabled: true },
      setup: { accordionEnabled: false }
    };

    // Populate normalizedCategories with actual values using permanent IDs
    Object.entries(rawCategories).forEach(([key, val]) => {
      const permId = getCategoryPermanentId(key);
      if (permId && val) {
        normalizedCategories[permId] = { accordionEnabled: Boolean(val.accordionEnabled) };
      }
    });

    const finalNavigationSettings = {
      categories: normalizedCategories,
      allowMultipleOpenGroups: payload.config?.navigationSettings?.allowMultipleOpenGroups !== false
    };

    try {
      const navigationPayload = {
        categories: finalNavigationSettings.categories,
        allowMultipleOpenGroups: finalNavigationSettings.allowMultipleOpenGroups,
        menuCategories: payload.menuCategories,
        items: payload.navigationItems,
        sidebarConfig: {
          style: 'dribbble-enterprise',
          theme: 'dark-navy',
          activeIndicator: 'triple'
        },
        bottomNavConfig: {
          maxItems: 5,
          enabled: true
        },
        updatedAt,
        updatedBy: payload.updatedBy || 'Super Admin'
      };

      const globalDoc = doc(db, COLLECTIONS.APP_SETTINGS, 'global');
      await setDoc(globalDoc, {
        navigationSettings: finalNavigationSettings,
        navigation: navigationPayload,
        uiConfig: {
          ...payload.config,
          navigationSettings: finalNavigationSettings
        },
        navigationItems: payload.navigationItems,
        menuCategories: payload.menuCategories,
        updatedAt,
        updatedBy: payload.updatedBy || 'Super Admin'
      }, { merge: true });
    } catch (gErr) {
      console.warn('[Firestore] Failed to mirror to appSettings/global:', gErr);
    }

    return { success: true, updatedAt };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

export async function saveNavigationSettingsToFirestore(
  navSettings: any,
  updatedBy: string = 'Superadmin'
): Promise<{ success: boolean; updatedAt: string }> {
  const path = `${COLLECTIONS.APP_SETTINGS}/global`;
  try {
    const updatedAt = new Date().toISOString();
    const rawCategories = navSettings?.categories || {};
    const normalizedCategories: Record<string, { accordionEnabled: boolean }> = {
      dashboard: { accordionEnabled: false },
      operasional: { accordionEnabled: true },
      woContractor: { accordionEnabled: false },
      taskInstaller: { accordionEnabled: false },
      pelanggan: { accordionEnabled: true },
      laporan: { accordionEnabled: true },
      setup: { accordionEnabled: false }
    };

    Object.entries(rawCategories).forEach(([key, val]: [string, any]) => {
      const permId = getCategoryPermanentId(key);
      if (permId && val) {
        normalizedCategories[permId] = { accordionEnabled: Boolean(val.accordionEnabled) };
      }
    });

    const finalNavigationSettings = {
      categories: normalizedCategories,
      allowMultipleOpenGroups: navSettings?.allowMultipleOpenGroups !== false
    };

    const payload = {
      navigationSettings: finalNavigationSettings,
      navigation: {
        categories: normalizedCategories,
        allowMultipleOpenGroups: navSettings?.allowMultipleOpenGroups !== false,
        sidebarConfig: {
          style: 'dribbble-enterprise',
          theme: 'dark-navy',
          activeIndicator: 'triple'
        },
        bottomNavConfig: {
          maxItems: 5,
          enabled: true
        },
        updatedAt,
        updatedBy
      },
      updatedAt,
      updatedBy
    };

    // 1. Write to appSettings/global
    const globalRef = doc(db, COLLECTIONS.APP_SETTINGS, 'global');
    await setDoc(globalRef, payload, { merge: true });

    // 2. Also sync to appSettings/ui_configuration
    try {
      const uiRef = doc(db, COLLECTIONS.APP_SETTINGS, 'ui_configuration');
      await setDoc(uiRef, {
        'config.navigationSettings': payload.navigationSettings,
        navigation: payload.navigation,
        updatedAt,
        updatedBy
      }, { merge: true });
    } catch {}

    return { success: true, updatedAt };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

// -------------------------------------------------------------
// Canonical Navigation Configuration Document (appSettings/navigation)
// -------------------------------------------------------------
export async function saveNavigationDocToFirestore(
  data: NavigationFirestoreDoc
): Promise<{ success: boolean; updatedAt: string }> {
  const path = `${COLLECTIONS.APP_SETTINGS}/navigation`;
  try {
    const docRef = doc(db, COLLECTIONS.APP_SETTINGS, 'navigation');
    const updatedAt = new Date().toISOString();
    const payloadToSave = sanitizeForFirestore({
      ...data,
      navigationVersion: (data.navigationVersion || 1) + 1,
      updatedAt
    });
    await setDoc(docRef, payloadToSave, { merge: true });

    // Also mirror to appSettings/global and appSettings/ui_configuration for backward compatibility
    try {
      const globalDoc = doc(db, COLLECTIONS.APP_SETTINGS, 'global');
      await setDoc(globalDoc, {
        navigationDoc: payloadToSave,
        updatedAt,
        updatedBy: data.updatedBy || 'Superadmin'
      }, { merge: true });
    } catch {}

    return { success: true, updatedAt };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

export async function loadNavigationDocFromFirestore(): Promise<NavigationFirestoreDoc | null> {
  const path = `${COLLECTIONS.APP_SETTINGS}/navigation`;
  try {
    const docRef = doc(db, COLLECTIONS.APP_SETTINGS, 'navigation');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as NavigationFirestoreDoc;
    }
    return null;
  } catch (error) {
    if (isPermissionError(error)) {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (e) {
        console.warn('[Firestore] Navigation permission notice:', e);
      }
    } else {
      console.warn('[Firestore] Navigation load notice:', (error as any)?.message || error);
    }
    return null;
  }
}

export function subscribeToNavigationDoc(
  callback: (data: NavigationFirestoreDoc) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const path = `${COLLECTIONS.APP_SETTINGS}/navigation`;
  const docRef = doc(db, COLLECTIONS.APP_SETTINGS, 'navigation');
  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        callback(snap.data() as NavigationFirestoreDoc);
      }
    },
    (error) => {
      if (isPermissionError(error)) {
        try {
          handleFirestoreError(error, OperationType.GET, path);
        } catch (e: any) {
          onError?.(e);
        }
      } else {
        console.warn('[Firestore] Navigation subscription notice:', error?.message || error);
        onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    }
  );
}

export async function loadUIConfigurationFromFirestore(): Promise<CloudUIConfigurationPayload | null> {
  const path = `${COLLECTIONS.APP_SETTINGS}/ui_configuration`;
  try {
    let loadedData: CloudUIConfigurationPayload | null = null;
    let globalNavSettings: any = null;

    // Check global document first for canonical navigationSettings
    try {
      const globalRef = doc(db, COLLECTIONS.APP_SETTINGS, 'global');
      const gSnap = await getDoc(globalRef);
      if (gSnap.exists()) {
        const gData = gSnap.data();
        if (gData.navigationSettings) {
          globalNavSettings = gData.navigationSettings;
        }
        if (gData.uiConfig || gData.navigationItems) {
          loadedData = {
            config: {
              id: 'default_ui_config',
              ...(gData.uiConfig || {})
            } as UIConfiguration,
            navigationItems: gData.navigationItems || [],
            menuCategories: gData.menuCategories || [],
            updatedAt: gData.updatedAt || new Date().toISOString(),
            updatedBy: gData.updatedBy || 'System'
          };
        }
      }
    } catch {}

    // Check ui_configuration document
    try {
      const docRef = doc(db, COLLECTIONS.APP_SETTINGS, 'ui_configuration');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const uData = snap.data() as CloudUIConfigurationPayload;
        if (!loadedData) {
          loadedData = uData;
        } else {
          // Merge with priority on newest data
          loadedData = {
            ...loadedData,
            ...uData,
            config: {
              ...(loadedData.config || {}),
              ...(uData.config || {}),
              id: uData.config?.id || loadedData.config?.id || 'default_ui_config'
            } as UIConfiguration
          };
        }
      }
    } catch {}

    if (loadedData) {
      if (globalNavSettings) {
        if (!loadedData.config) loadedData.config = {} as any;
        loadedData.config.navigationSettings = {
          ...(loadedData.config.navigationSettings || {}),
          ...globalNavSettings,
          categories: {
            ...((loadedData.config.navigationSettings as any)?.categories || {}),
            ...(globalNavSettings.categories || {})
          }
        };
      }
      return loadedData;
    }

    return null;
  } catch (error) {
    if (isPermissionError(error)) {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (e) {
        console.warn('[Firestore] UI config permission notice:', e);
      }
    } else {
      console.warn('[Firestore] UI config load notice:', (error as any)?.message || error);
    }
    return null;
  }
}

export function subscribeToUIConfiguration(callback: (data: CloudUIConfigurationPayload) => void): Unsubscribe {
  const docRef = doc(db, COLLECTIONS.APP_SETTINGS, 'ui_configuration');
  const globalRef = doc(db, COLLECTIONS.APP_SETTINGS, 'global');

  let lastKnownConfig: CloudUIConfigurationPayload | null = null;

  const unsubUI = onSnapshot(docRef, (snap) => {
    if (snap.exists()) {
      const data = snap.data() as CloudUIConfigurationPayload;
      lastKnownConfig = data;
      callback(data);
    }
  }, (err) => {
    console.warn('[Firestore] UI Configuration subscription warning:', err);
  });

  const unsubGlobal = onSnapshot(globalRef, (snap) => {
    if (snap.exists()) {
      const gData = snap.data();
      if (gData.navigationSettings && lastKnownConfig) {
        const merged: CloudUIConfigurationPayload = {
          ...lastKnownConfig,
          config: {
            ...lastKnownConfig.config,
            navigationSettings: {
              ...lastKnownConfig.config?.navigationSettings,
              ...gData.navigationSettings,
              categories: {
                ...(lastKnownConfig.config?.navigationSettings?.categories || {}),
                ...(gData.navigationSettings.categories || {})
              }
            }
          },
          updatedAt: gData.updatedAt || lastKnownConfig.updatedAt
        };
        callback(merged);
      }
    }
  }, (err) => {
    console.warn('[Firestore] Global AppSettings subscription warning:', err);
  });

  return () => {
    unsubUI();
    unsubGlobal();
  };
}

export async function deleteTicketFromFirestore(ticketId: string, woNumber?: string): Promise<void> {
  if (!isFirestoreActiveForEnvironment()) {
    try {
      await fetch(`/api/supabase/work-orders/${encodeURIComponent(ticketId)}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ reason: 'Penghapusan via aplikasi' })
      });
    } catch (err) {
      console.warn('[Supabase Direct Sync] Delete WO error:', err);
    }
    return;
  }
  const path = `${COLLECTIONS.TICKETS}/${ticketId}`;
  try {
    const docRef = doc(db, COLLECTIONS.TICKETS, ticketId);
    await deleteDoc(docRef);

    // Also remove by deterministic ID if different to prevent any resurrection
    if (woNumber) {
      const detId = getDeterministicTicketId(woNumber);
      if (detId !== ticketId) {
        try {
          const detRef = doc(db, COLLECTIONS.TICKETS, detId);
          await deleteDoc(detRef);
        } catch {}
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function softDeleteTicketInFirestore(ticketId: string, deletedBy: string, reason: string): Promise<void> {
  if (!isFirestoreActiveForEnvironment()) {
    try {
      await fetch(`/api/supabase/work-orders/${encodeURIComponent(ticketId)}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ reason: reason || 'Soft delete via aplikasi' })
      });
    } catch (err) {
      console.warn('[Supabase Direct Sync] Soft delete WO error:', err);
    }
    return;
  }
  const path = `${COLLECTIONS.TICKETS}/${ticketId}`;
  try {
    const docRef = doc(db, COLLECTIONS.TICKETS, ticketId);
    await updateDoc(docRef, {
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      deletedBy,
      deletionReason: reason,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function archiveTicketInFirestore(ticketId: string, archivedBy: string): Promise<void> {
  if (!isFirestoreActiveForEnvironment()) {
    try {
      await fetch(`/api/supabase/work-orders/${encodeURIComponent(ticketId)}/archive`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include'
      });
    } catch (err) {
      console.warn('[Supabase Direct Sync] Archive WO error:', err);
    }
    return;
  }
  const path = `${COLLECTIONS.TICKETS}/${ticketId}`;
  try {
    const docRef = doc(db, COLLECTIONS.TICKETS, ticketId);
    await setDoc(docRef, {
      isArchived: true,
      archivedAt: new Date().toISOString(),
      archivedBy,
      updatedAt: new Date().toISOString(),
      updatedBy: archivedBy
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function restoreTicketInFirestore(ticketId: string, restoredBy: string): Promise<void> {
  if (!isFirestoreActiveForEnvironment()) {
    try {
      await fetch(`/api/supabase/work-orders/${encodeURIComponent(ticketId)}/restore`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include'
      });
    } catch (err) {
      console.warn('[Supabase Direct Sync] Restore WO error:', err);
    }
    return;
  }
  const path = `${COLLECTIONS.TICKETS}/${ticketId}`;
  try {
    const docRef = doc(db, COLLECTIONS.TICKETS, ticketId);
    await setDoc(docRef, {
      isArchived: false,
      isDeleted: false,
      archivedAt: null,
      archivedBy: null,
      deletedAt: null,
      deletedBy: null,
      deletionReason: null,
      updatedAt: new Date().toISOString(),
      updatedBy: restoredBy
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// -------------------------------------------------------------
// Contractor & Coverage Area Mutations
// -------------------------------------------------------------
export async function saveContractorToFirestore(contractor: Contractor): Promise<void> {
  const path = `${COLLECTIONS.CONTRACTORS}/${contractor.id}`;
  try {
    const docRef = doc(db, COLLECTIONS.CONTRACTORS, contractor.id);
    await setDoc(docRef, sanitizeForFirestore(contractor), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteContractorFromFirestore(contractorId: string): Promise<void> {
  const path = `${COLLECTIONS.CONTRACTORS}/${contractorId}`;
  try {
    const docRef = doc(db, COLLECTIONS.CONTRACTORS, contractorId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveCoverageAreaToFirestore(area: CoverageArea): Promise<void> {
  const path = `${COLLECTIONS.COVERAGE_AREAS}/${area.id}`;
  try {
    const docRef = doc(db, COLLECTIONS.COVERAGE_AREAS, area.id);
    await setDoc(docRef, sanitizeForFirestore(area), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteCoverageAreaFromFirestore(areaId: string): Promise<void> {
  const path = `${COLLECTIONS.COVERAGE_AREAS}/${areaId}`;
  try {
    const docRef = doc(db, COLLECTIONS.COVERAGE_AREAS, areaId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// -------------------------------------------------------------
// Live Chat Message Mutations
// -------------------------------------------------------------
export async function sendChatMessageToFirestore(msg: TicketMessage): Promise<void> {
  if (!isFirestoreActiveForEnvironment()) {
    try {
      await fetch(`/api/tickets/${encodeURIComponent(msg.ticketId || msg.woNumber)}/messages`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(msg)
      });
    } catch (err) {
      console.warn('[Supabase Sync] Chat message error:', err);
    }
    return;
  }
  const path = `${COLLECTIONS.MESSAGES}/${msg.id}`;
  try {
    const docRef = doc(db, COLLECTIONS.MESSAGES, msg.id);
    await setDoc(docRef, sanitizeForFirestore(msg));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// -------------------------------------------------------------
// Audit Log Mutations (Immutable Append)
// -------------------------------------------------------------
export async function addAuditLogToFirestore(log: AuditLog): Promise<void> {
  if (!isFirestoreActiveForEnvironment()) {
    return;
  }
  const path = `${COLLECTIONS.AUDIT_LOGS}/${log.id}`;
  try {
    const docRef = doc(db, COLLECTIONS.AUDIT_LOGS, log.id);
    await setDoc(docRef, sanitizeForFirestore(log));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// -------------------------------------------------------------
// WhatsApp Template Mutations
// -------------------------------------------------------------
export async function saveTemplateToFirestore(template: WhatsAppTemplate): Promise<void> {
  if (!isFirestoreActiveForEnvironment()) {
    try {
      await fetch('/api/supabase/settings/whatsapp_templates', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ value: template, description: `WA Template: ${template.name}` })
      });
    } catch (err) {
      console.warn('[Supabase Sync] saveTemplate error:', err);
    }
    return;
  }
  const path = `${COLLECTIONS.WA_TEMPLATES}/${template.id}`;
  try {
    const docRef = doc(db, COLLECTIONS.WA_TEMPLATES, template.id);
    await setDoc(docRef, sanitizeForFirestore(template), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteTemplateFromFirestore(templateId: string): Promise<void> {
  if (!isFirestoreActiveForEnvironment()) {
    return;
  }
  const path = `${COLLECTIONS.WA_TEMPLATES}/${templateId}`;
  try {
    const docRef = doc(db, COLLECTIONS.WA_TEMPLATES, templateId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// -------------------------------------------------------------
// User Profile Mutations (Passwords are NEVER stored in Firestore)
// -------------------------------------------------------------
export async function saveUserToFirestore(user: User): Promise<void> {
  if (!isFirestoreActiveForEnvironment()) {
    try {
      await fetch('/api/supabase/users', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(user)
      });
    } catch (err) {
      console.warn('[Supabase Sync] saveUser error:', err);
    }
    return;
  }
  const path = `${COLLECTIONS.USERS}/${user.id}`;
  try {
    // Strip sensitive authentication secrets per MoraJaws Security Policy
    const { passwordHash: _, ...safeUser } = user;
    if ('password' in (safeUser as any)) {
      delete (safeUser as any).password;
    }
    const docRef = doc(db, COLLECTIONS.USERS, user.id);
    await setDoc(docRef, sanitizeForFirestore(safeUser), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteUserFromFirestore(userId: string): Promise<void> {
  if (!isFirestoreActiveForEnvironment()) {
    try {
      await fetch(`/api/supabase/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ reason: 'Dihapus via antarmuka staf' })
      });
    } catch (err) {
      console.warn('[Supabase Sync] deleteUser error:', err);
    }
    return;
  }
  const path = `${COLLECTIONS.USERS}/${userId}`;
  try {
    const docRef = doc(db, COLLECTIONS.USERS, userId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function softDeleteUserInFirestore(userId: string, deletedBy: string, reason: string): Promise<void> {
  if (!isFirestoreActiveForEnvironment()) {
    try {
      await fetch(`/api/supabase/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ reason })
      });
    } catch (err) {
      console.warn('[Supabase Sync] softDeleteUser error:', err);
    }
    return;
  }
  const path = `${COLLECTIONS.USERS}/${userId}`;
  try {
    const docRef = doc(db, COLLECTIONS.USERS, userId);
    await setDoc(docRef, {
      active: false,
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      deletedBy,
      deletionReason: reason,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// -------------------------------------------------------------
// General Droplists Mutations (Status Agent, Status Installer, Slot Time, Ticket Category)
// -------------------------------------------------------------
export async function saveGeneralDroplistsToFirestore(items: DroplistItem[]): Promise<void> {
  if (!isFirestoreActiveForEnvironment()) {
    try {
      await fetch('/api/supabase/settings/general_droplists', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ value: items, description: 'General Droplists Configuration' })
      });
    } catch (err) {
      console.warn('[Supabase Sync] saveGeneralDroplists error:', err);
    }
    return;
  }
  const path = `${COLLECTIONS.APP_SETTINGS}/general_droplists`;
  try {
    const docRef = doc(db, COLLECTIONS.APP_SETTINGS, 'general_droplists');
    await setDoc(docRef, {
      id: 'general_droplists',
      items: sanitizeForFirestore(items),
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function loadGeneralDroplistsFromFirestore(): Promise<DroplistItem[] | null> {
  if (!isFirestoreActiveForEnvironment()) {
    try {
      const res = await fetch('/api/supabase/settings/general_droplists', {
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      const json = await res.json();
      if (json.success && json.data) {
        return (json.data.value || json.data) as DroplistItem[];
      }
    } catch {}
    return null;
  }
  const path = `${COLLECTIONS.APP_SETTINGS}/general_droplists`;
  try {
    const docRef = doc(db, COLLECTIONS.APP_SETTINGS, 'general_droplists');
    const snap = await getDoc(docRef);
    if (snap.exists() && Array.isArray(snap.data()?.items)) {
      return snap.data().items as DroplistItem[];
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

export function subscribeToGeneralDroplists(
  callback: (items: DroplistItem[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!isFirestoreActiveForEnvironment()) {
    return () => {};
  }
  const path = `${COLLECTIONS.APP_SETTINGS}/general_droplists`;
  const docRef = doc(db, COLLECTIONS.APP_SETTINGS, 'general_droplists');
  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists() && Array.isArray(snap.data()?.items)) {
        callback(snap.data().items as DroplistItem[]);
      }
    },
    (error) => {
      console.warn('[Firestore] General droplists subscription warning:', error);
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (e: any) {
        onError?.(e);
      }
    }
  );
}

// -------------------------------------------------------------
// Report Dropdown Category Mutations (Report Status, Reason Report, Rootcause)
// -------------------------------------------------------------
export const INITIAL_REPORT_DROPDOWN_CATEGORIES: ReportDropdownCategory[] = [
  // 1. Report Status
  { id: 'rdc-st-1', categoryType: 'report_status', name: 'En Route', description: 'Teknisi dalam perjalanan menuju lokasi pelanggan', isActive: true, sortOrder: 1, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'rdc-st-2', categoryType: 'report_status', name: 'On Site', description: 'Teknisi tiba di lokasi pelanggan dan memulai pemeriksaan', isActive: true, sortOrder: 2, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'rdc-st-3', categoryType: 'report_status', name: 'Completed', description: 'Pekerjaan selesai dilakukan dan layanan aktif normal', isActive: true, sortOrder: 3, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'rdc-st-4', categoryType: 'report_status', name: 'Installed', description: 'Perangkat baru berhasil terpasang dan terkonfigurasi', isActive: true, sortOrder: 4, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'rdc-st-5', categoryType: 'report_status', name: 'Pending Technical', description: 'Pekerjaan tertunda karena kendala teknis atau redaman', isActive: true, sortOrder: 5, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'rdc-st-6', categoryType: 'report_status', name: 'Failed / Cancelled', description: 'Pekerjaan gagal atau dibatalkan oleh pelanggan', isActive: true, sortOrder: 6, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'rdc-st-7', categoryType: 'report_status', name: 'Assigned', description: 'Work Order telah ditugaskan kepada teknisi', isActive: true, sortOrder: 7, createdAt: '2026-01-01T00:00:00Z' },

  // 2. Reason Report
  { id: 'rdc-rs-1', categoryType: 'reason_report', name: 'Instalasi Selesai Sesuai Standar', description: 'Instalasi FTTH berhasil dengan uji coba internet lancar', isActive: true, sortOrder: 1, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'rdc-rs-2', categoryType: 'reason_report', name: 'Redaman Optik Baik (-16 s/d -24 dBm)', description: 'Hasil ukur OPM memenuhi standar spesifikasi', isActive: true, sortOrder: 2, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'rdc-rs-3', categoryType: 'reason_report', name: 'Perangkat ONT / Router Aktif Normal', description: 'Konfigurasi PPPoE dan WiFi beroperasi tanpa kendala', isActive: true, sortOrder: 3, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'rdc-rs-4', categoryType: 'reason_report', name: 'Selesai Berhasil Diperbaiki', description: 'Troubleshoot gangguan berhasil dan koneksi pulih', isActive: true, sortOrder: 4, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'rdc-rs-5', categoryType: 'reason_report', name: 'Kendala Redaman Tinggi / LOS', description: 'Redaman melebihi batas atau lampu indikator LOS merah', isActive: true, sortOrder: 5, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'rdc-rs-6', categoryType: 'reason_report', name: 'Kabel Dropcore Putus / Terjepit', description: 'Kerusakan fisik kabel pada jalur tiang atau jalur indoor', isActive: true, sortOrder: 6, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'rdc-rs-7', categoryType: 'reason_report', name: 'FAT / ODP Penuh atau Rusak', description: 'Port splitter pada FAT terisi penuh atau konektor rusak', isActive: true, sortOrder: 7, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'rdc-rs-8', categoryType: 'reason_report', name: 'Pelanggan Meminta Reschedule', description: 'Pelanggan meminta penundaan jadwal ke hari lain', isActive: true, sortOrder: 8, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'rdc-rs-9', categoryType: 'reason_report', name: 'Pelanggan Tidak di Tempat', description: 'Rumah kosong atau tidak ada perwakilan yang menerima', isActive: true, sortOrder: 9, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'rdc-rs-10', categoryType: 'reason_report', name: 'Akses Rumah / Lokasi Terkendala', description: 'Izin komplek, portal ditutup, atau cuaca ekstrem', isActive: true, sortOrder: 10, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'rdc-rs-11', categoryType: 'reason_report', name: 'Menunggu Material / Tim Tambahan', description: 'Kekurangan kabel panjang atau butuh tangga tinggi', isActive: true, sortOrder: 11, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'rdc-rs-12', categoryType: 'reason_report', name: 'Pengerjaan Lapangan Sedang Berlangsung', description: 'Teknisi masih berada di titik tiang / rumah pelanggan', isActive: true, sortOrder: 12, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'rdc-rs-13', categoryType: 'reason_report', name: 'Lainnya (Lihat Catatan Remarks)', description: 'Penyebab khusus yang dijelaskan pada catatan teknisi', isActive: true, sortOrder: 13, createdAt: '2026-01-01T00:00:00Z' },

  // 3. Rootcause
  { id: 'rdc-rc-1', categoryType: 'rootcause', name: 'Fiber Optic Putus', description: 'Kabel optik putus terkena pohon, truk, atau gesekan', isActive: true, sortOrder: 1, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'rdc-rc-2', categoryType: 'rootcause', name: 'Redaman Tinggi / Macro Bend', description: 'Bending kabel terlalu tajam menyebabkan loss sinyal optik', isActive: true, sortOrder: 2, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'rdc-rc-3', categoryType: 'rootcause', name: 'Konektor SC/UPC Rusak atau Kotor', description: 'Ujung ferrule konektor berdebu atau retak', isActive: true, sortOrder: 3, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'rdc-rc-4', categoryType: 'rootcause', name: 'FAT / ODP Rusak', description: 'Adapter atau pigtail di dalam enclosure FAT bermasalah', isActive: true, sortOrder: 4, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'rdc-rc-5', categoryType: 'rootcause', name: 'Port FAT Penuh', description: 'Semua port out splitter sudah terisi pelanggan lain', isActive: true, sortOrder: 5, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'rdc-rc-6', categoryType: 'rootcause', name: 'ONT / Router Rusak', description: 'Perangkat pelanggan mati total, port LAN mati, atau loop', isActive: true, sortOrder: 6, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'rdc-rc-7', categoryType: 'rootcause', name: 'Adaptor Daya Mati', description: 'Power supply adaptor 12V ONT terbakar / rusak', isActive: true, sortOrder: 7, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'rdc-rc-8', categoryType: 'rootcause', name: 'Konfigurasi VLAN / PPPoE Error', description: 'Setting username login atau VLAN ID tidak cocok di OLT', isActive: true, sortOrder: 8, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'rdc-rc-9', categoryType: 'rootcause', name: 'Kendala Teknis Lapangan Lainnya', description: 'Masalah unik di lapangan yang memerlukan investigasi lanjut', isActive: true, sortOrder: 9, createdAt: '2026-01-01T00:00:00Z' }
];

export async function saveAllReportDropdownCategoriesToFirestore(categories: ReportDropdownCategory[]): Promise<void> {
  const path = `${COLLECTIONS.APP_SETTINGS}/report_dropdown_categories`;
  try {
    const docRef = doc(db, COLLECTIONS.APP_SETTINGS, 'report_dropdown_categories');
    await setDoc(docRef, {
      id: 'report_dropdown_categories',
      categories: sanitizeForFirestore(categories),
      updatedAt: new Date().toISOString(),
      updatedBy: 'System'
    }, { merge: true });
  } catch (error) {
    console.warn('[Firestore] Error saving report dropdown categories to appSettings:', error);
  }
}

export async function saveReportDropdownCategoryToFirestore(category: ReportDropdownCategory): Promise<void> {
  const path = `${COLLECTIONS.APP_SETTINGS}/report_dropdown_categories`;
  try {
    const docRef = doc(db, COLLECTIONS.APP_SETTINGS, 'report_dropdown_categories');
    const snap = await getDoc(docRef);
    let categories: ReportDropdownCategory[] = [];
    if (snap.exists() && Array.isArray(snap.data()?.categories)) {
      categories = [...snap.data().categories];
    } else {
      categories = [...INITIAL_REPORT_DROPDOWN_CATEGORIES];
    }
    const idx = categories.findIndex(c => c.id === category.id);
    if (idx >= 0) {
      categories[idx] = category;
    } else {
      categories.push(category);
    }
    await setDoc(docRef, {
      id: 'report_dropdown_categories',
      categories: sanitizeForFirestore(categories),
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    console.warn('[Firestore] Error saving single report category:', error);
  }
}

export async function deleteReportDropdownCategoryFromFirestore(categoryId: string): Promise<void> {
  const path = `${COLLECTIONS.APP_SETTINGS}/report_dropdown_categories`;
  try {
    const docRef = doc(db, COLLECTIONS.APP_SETTINGS, 'report_dropdown_categories');
    const snap = await getDoc(docRef);
    if (snap.exists() && Array.isArray(snap.data()?.categories)) {
      const categories = snap.data().categories.filter((c: any) => c.id !== categoryId);
      await setDoc(docRef, {
        categories: sanitizeForFirestore(categories),
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }
  } catch (error) {
    console.warn('[Firestore] Error deleting report category:', error);
  }
}

export async function softDeleteReportDropdownCategoryInFirestore(categoryId: string, updatedBy?: string): Promise<void> {
  const path = `${COLLECTIONS.APP_SETTINGS}/report_dropdown_categories`;
  try {
    const docRef = doc(db, COLLECTIONS.APP_SETTINGS, 'report_dropdown_categories');
    const snap = await getDoc(docRef);
    if (snap.exists() && Array.isArray(snap.data()?.categories)) {
      const categories = snap.data().categories.map((c: any) => {
        if (c.id === categoryId) {
          return {
            ...c,
            isActive: false,
            isDeleted: true,
            updatedAt: new Date().toISOString(),
            updatedBy: updatedBy || 'System'
          };
        }
        return c;
      });
      await setDoc(docRef, {
        categories: sanitizeForFirestore(categories),
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }
  } catch (error) {
    console.warn('[Firestore] Error soft-deleting report category:', error);
  }
}

export async function seedReportDropdownCategoriesIfEmpty(): Promise<number> {
  if (!isFirestoreActiveForEnvironment()) {
    return 0;
  }
  try {
    const docRef = doc(db, COLLECTIONS.APP_SETTINGS, 'report_dropdown_categories');
    const snap = await getDoc(docRef);
    if (!snap.exists() || !snap.data()?.categories || snap.data()?.categories.length === 0) {
      console.log(`[Firestore] Seeding ${INITIAL_REPORT_DROPDOWN_CATEGORIES.length} report dropdown categories to appSettings...`);
      await setDoc(docRef, {
        id: 'report_dropdown_categories',
        categories: sanitizeForFirestore(INITIAL_REPORT_DROPDOWN_CATEGORIES),
        updatedAt: new Date().toISOString(),
        updatedBy: 'System'
      }, { merge: true });
      return INITIAL_REPORT_DROPDOWN_CATEGORIES.length;
    }
    return snap.data()?.categories?.length || 0;
  } catch (err) {
    console.warn('[Firestore] Seed report categories error:', err);
    return 0;
  }
}


// -------------------------------------------------------------
// Seed and Migration Helper
// -------------------------------------------------------------
export async function seedFirestoreIfEmpty(initialData: {
  tickets: Ticket[];
  contractors: Contractor[];
  coverageAreas: CoverageArea[];
  templates: WhatsAppTemplate[];
  users: User[];
}): Promise<{ seeded: boolean; counts: Record<string, number> }> {
  if (!isFirestoreActiveForEnvironment()) {
    console.info('[MoraJaws Phase 13E] Seeding Firestore dinonaktifkan di lingkungan produksi. Supabase PostgreSQL adalah satu-satunya database produksi aktif.');
    return { seeded: false, counts: {} };
  }
  try {
    // Check if system has already completed initial seed in the past
    // CRITICAL: If the database was initialized, NEVER re-seed even if collections are empty (due to user deletions)!
    const metaRef = doc(db, COLLECTIONS.APP_SETTINGS, 'seed_meta');
    try {
      const metaSnap = await getDoc(metaRef);
      if (metaSnap.exists() && metaSnap.data()?.isInitialized) {
        return { seeded: false, counts: {} };
      }
    } catch {}

    const ticketsSnap = await getDocs(collection(db, COLLECTIONS.TICKETS));
    const counts: Record<string, number> = {
      tickets: ticketsSnap.size,
      contractors: 0,
      coverageAreas: 0,
      templates: 0,
      users: 0
    };

    // If Firestore has no tickets yet, seed baseline tickets
    if (ticketsSnap.empty && initialData.tickets.length > 0) {
      console.log(`[Firestore] Seeding ${initialData.tickets.length} baseline tickets to Cloud Firestore...`);
      const { saved } = await batchSaveTicketsToFirestore(initialData.tickets);
      counts.tickets = saved;
    }

    // Check & seed contractors
    const contrSnap = await getDocs(collection(db, COLLECTIONS.CONTRACTORS));
    counts.contractors = contrSnap.size;
    if (contrSnap.empty && initialData.contractors.length > 0) {
      console.log(`[Firestore] Seeding ${initialData.contractors.length} contractors to Cloud Firestore...`);
      for (const c of initialData.contractors) {
        await saveContractorToFirestore(c);
      }
      counts.contractors = initialData.contractors.length;
    }

    // Check & seed coverage areas
    const areasSnap = await getDocs(collection(db, COLLECTIONS.COVERAGE_AREAS));
    counts.coverageAreas = areasSnap.size;
    if (areasSnap.empty && initialData.coverageAreas.length > 0) {
      for (const a of initialData.coverageAreas) {
        await saveCoverageAreaToFirestore(a);
      }
      counts.coverageAreas = initialData.coverageAreas.length;
    }

    // Check & seed templates
    const tplSnap = await getDocs(collection(db, COLLECTIONS.WA_TEMPLATES));
    counts.templates = tplSnap.size;
    if (tplSnap.empty && initialData.templates.length > 0) {
      for (const t of initialData.templates) {
        await saveTemplateToFirestore(t);
      }
      counts.templates = initialData.templates.length;
    }

    // Check & seed users
    const usersSnap = await getDocs(collection(db, COLLECTIONS.USERS));
    counts.users = usersSnap.size;
    if (usersSnap.empty && initialData.users.length > 0) {
      for (const u of initialData.users) {
        await saveUserToFirestore(u);
      }
      counts.users = initialData.users.length;
    }

    // Mark system as initialized so deletions will NEVER be reverted by future seed checks
    try {
      await setDoc(metaRef, {
        id: 'seed_meta',
        isInitialized: true,
        initializedAt: new Date().toISOString(),
        app: 'MoraJaws'
      }, { merge: true });
    } catch (mErr) {
      console.warn('[Firestore] Notice saving seed_meta:', mErr);
    }

    return { seeded: true, counts };
  } catch (err) {
    console.warn('[Firestore] Seed verification error:', err);
    return { seeded: false, counts: {} };
  }
}

export async function fetchAllTicketsFromFirestore(): Promise<Ticket[]> {
  try {
    const snap = await getDocs(collection(db, COLLECTIONS.TICKETS));
    const raw: Ticket[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Ticket;
      if (!data.id) data.id = docSnap.id;
      raw.push(data);
    });
    return deduplicateTicketsInMemory(raw);
  } catch (err) {
    if (isQuotaExceededError(err)) {
      console.warn('[Firestore] fetchAllTicketsFromFirestore: Quota limit reached on free tier database.');
    } else {
      console.warn('[Firestore] fetchAllTicketsFromFirestore notice:', (err as any)?.message || err);
    }
    throw err;
  }
}

export async function findUserInFirestore(identifier: string): Promise<User | null> {
  if (!identifier) return null;
  const clean = String(identifier).trim().toLowerCase();
  try {
    const snap = await getDocs(collection(db, COLLECTIONS.USERS));
    let foundUser: User | null = null;
    snap.forEach((docSnap) => {
      if (foundUser) return;
      const u = docSnap.data() as User;
      if (!u || (u as any).isDeleted) return;
      if (u.username && u.username.toLowerCase() === clean) {
        foundUser = { ...u, id: u.id || docSnap.id };
        return;
      }
      if (u.email && u.email.toLowerCase() === clean) {
        foundUser = { ...u, id: u.id || docSnap.id };
        return;
      }
      if ((u as any).altEmail && (u as any).altEmail.toLowerCase().includes(clean)) {
        foundUser = { ...u, id: u.id || docSnap.id };
        return;
      }
      // Check prefix matching (e.g. "ray" matching "rayjs666@gmail.com")
      const emailPrefix = (u.email || '').split('@')[0].toLowerCase();
      if (emailPrefix === clean || (clean === 'ray' && (emailPrefix.startsWith('ray') || u.name.toLowerCase().includes('ray')))) {
        foundUser = { ...u, id: u.id || docSnap.id };
        return;
      }
    });
    return foundUser;
  } catch (err) {
    console.warn('[Firestore] Error finding user in Firestore:', err);
    return null;
  }
}

// -------------------------------------------------------------
// Contact Center Chat Category Mutations (appSettings/chat_categories)
// -------------------------------------------------------------
export const INITIAL_CHAT_CATEGORIES: ChatCategoryConfig[] = [
  { id: 'cat-progress', name: 'PROGRESS', description: 'Update progress pengerjaan teknisi di lapangan', color: '#7C3AED', order: 1, active: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'cat-complaint', name: 'COMPLAINT', description: 'Keluhan pelanggan, gangguan redaman, atau komplain instalasi', color: '#EF4444', order: 2, active: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'cat-followup', name: 'FOLLOW UP', description: 'Tindak lanjut progress pengerjaan atau konfirmasi status', color: '#3B82F6', order: 3, active: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'cat-techsupport', name: 'TECHNICAL SUPPORT', description: 'Dukungan teknis OPM, konfigurasi OLT, dan kendala kabel', color: '#F59E0B', order: 4, active: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'cat-schedule', name: 'SCHEDULE / APPOINTMENT', description: 'Jadwal kunjungan, perubahan slot, dan waktu temu', color: '#8B5CF6', order: 5, active: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'cat-confirmation', name: 'CUSTOMER CONFIRMATION', description: 'Konfirmasi pelanggan via WhatsApp atau telepon', color: '#10B981', order: 6, active: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'cat-escalation', name: 'ESCALATION', description: 'Eskalasi kendala mendesak ke Supervisor / Management', color: '#EC4899', order: 7, active: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'cat-other', name: 'OTHER', description: 'Percakapan koordinasi operasional umum lainnya', color: '#6B7280', order: 8, active: true, createdAt: '2026-01-01T00:00:00Z' }
];

export async function saveChatCategoriesToFirestore(categories: ChatCategoryConfig[]): Promise<void> {
  const path = `${COLLECTIONS.APP_SETTINGS}/chat_categories`;
  try {
    const docRef = doc(db, COLLECTIONS.APP_SETTINGS, 'chat_categories');
    await setDoc(docRef, {
      id: 'chat_categories',
      categories: sanitizeForFirestore(categories),
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function loadChatCategoriesFromFirestore(): Promise<ChatCategoryConfig[] | null> {
  const path = `${COLLECTIONS.APP_SETTINGS}/chat_categories`;
  try {
    const docRef = doc(db, COLLECTIONS.APP_SETTINGS, 'chat_categories');
    const snap = await getDoc(docRef);
    if (snap.exists() && Array.isArray(snap.data()?.categories)) {
      return snap.data().categories as ChatCategoryConfig[];
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

export function subscribeToChatCategories(
  callback: (categories: ChatCategoryConfig[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `${COLLECTIONS.APP_SETTINGS}/chat_categories`;
  const docRef = doc(db, COLLECTIONS.APP_SETTINGS, 'chat_categories');
  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists() && Array.isArray(snap.data()?.categories)) {
        callback(snap.data().categories as ChatCategoryConfig[]);
      } else {
        callback(INITIAL_CHAT_CATEGORIES);
      }
    },
    (error) => {
      console.warn('[Firestore] Chat categories subscription error:', error);
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (e: any) {
        onError?.(e);
      }
    }
  );
}

// -------------------------------------------------------------
// Hierarchical Droplist Mutations (appSettings/hierarchical_droplists)
// LEVEL 1: STATUS WO (PARENT)
// LEVEL 2: REASON WO (CHILD)
// LEVEL 3: REMARKS (SUB-CHILD)
// -------------------------------------------------------------
export const INITIAL_HIERARCHICAL_DROPLISTS: HierarchicalStatus[] = [
  {
    id: 'hs-complete',
    name: 'COMPLETE',
    code: 'COMPLETE',
    order: 1,
    active: true,
    color: '#10B981',
    reasons: [
      {
        id: 'hr-c1',
        name: 'Ganti Drop Wire Baru',
        order: 1,
        active: true,
        statusId: 'hs-complete',
        remarks: [
          { id: 'hrm-c1-1', name: 'Ter tabrak Truk', order: 1, active: true, reasonId: 'hr-c1' },
          { id: 'hrm-c1-2', name: 'Tergigit Tikus / Hewan', order: 2, active: true, reasonId: 'hr-c1' },
          { id: 'hrm-c1-3', name: 'Kabel Lapuk / Usia', order: 3, active: true, reasonId: 'hr-c1' }
        ]
      },
      {
        id: 'hr-c2',
        name: 'Ganti Precon Baru',
        order: 2,
        active: true,
        statusId: 'hs-complete',
        remarks: [
          { id: 'hrm-c2-1', name: 'Ter tabrak Truk', order: 1, active: true, reasonId: 'hr-c2' },
          { id: 'hrm-c2-2', name: 'Konektor SC Rusak / Kotor', order: 2, active: true, reasonId: 'hr-c2' },
          { id: 'hrm-c2-3', name: 'Macro Bend Jalur Tiang', order: 3, active: true, reasonId: 'hr-c2' }
        ]
      },
      {
        id: 'hr-c3',
        name: 'Instalasi Selesai Sesuai Standar',
        order: 3,
        active: true,
        statusId: 'hs-complete',
        remarks: [
          { id: 'hrm-c3-1', name: 'Redaman Optik Baik (-16 s/d -24 dBm)', order: 1, active: true, reasonId: 'hr-c3' },
          { id: 'hrm-c3-2', name: 'Aktivasi PPPoE dan WiFi Normal', order: 2, active: true, reasonId: 'hr-c3' }
        ]
      },
      {
        id: 'hr-c4',
        name: 'Selesai Berhasil Diperbaiki',
        order: 4,
        active: true,
        statusId: 'hs-complete',
        remarks: [
          { id: 'hrm-c4-1', name: 'Troubleshoot Gangguan Pulih Normal', order: 1, active: true, reasonId: 'hr-c4' },
          { id: 'hrm-c4-2', name: 'Splicing Ulang di Roset / Adapter', order: 2, active: true, reasonId: 'hr-c4' }
        ]
      }
    ]
  },
  {
    id: 'hs-cancel',
    name: 'CANCEL',
    code: 'CANCEL',
    order: 2,
    active: true,
    color: '#EF4444',
    reasons: [
      {
        id: 'hr-can1',
        name: 'Pelanggan Berhenti Berlangganan',
        order: 1,
        active: true,
        statusId: 'hs-cancel',
        remarks: [
          { id: 'hrm-can1-1', name: 'Pelanggan Berhenti Berlangganan', order: 1, active: true, reasonId: 'hr-can1' },
          { id: 'hrm-can1-2', name: 'Pindah Domisili / Lokasi', order: 2, active: true, reasonId: 'hr-can1' }
        ]
      },
      {
        id: 'hr-can2',
        name: 'Re-Visit Berulang',
        order: 2,
        active: true,
        statusId: 'hs-cancel',
        remarks: [
          { id: 'hrm-can2-1', name: 'Re-Visit Berulang (tidak bertemu Customer)', order: 1, active: true, reasonId: 'hr-can2' },
          { id: 'hrm-can2-2', name: 'Kontak Tidak Dapat Dihubungi', order: 2, active: true, reasonId: 'hr-can2' }
        ]
      },
      {
        id: 'hr-can3',
        name: 'Pembatalan Request Upgrade',
        order: 3,
        active: true,
        statusId: 'hs-cancel',
        remarks: [
          { id: 'hrm-can3-1', name: 'Pembatalan Request Upgrade', order: 1, active: true, reasonId: 'hr-can3' }
        ]
      },
      {
        id: 'hr-can4',
        name: 'Pembatalan Request Downgrade',
        order: 4,
        active: true,
        statusId: 'hs-cancel',
        remarks: [
          { id: 'hrm-can4-1', name: 'Pembatalan Request Downgrade', order: 1, active: true, reasonId: 'hr-can4' }
        ]
      },
      {
        id: 'hr-can5',
        name: 'Dibatalkan Pelanggan Saat Kunjungan',
        order: 5,
        active: true,
        statusId: 'hs-cancel',
        remarks: [
          { id: 'hrm-can5-1', name: 'Pelanggan Menolak Biaya Pemasangan', order: 1, active: true, reasonId: 'hr-can5' },
          { id: 'hrm-can5-2', name: 'Menolak Jalur Tarikan Kabel Rumah', order: 2, active: true, reasonId: 'hr-can5' }
        ]
      }
    ]
  },
  {
    id: 'hs-pending',
    name: 'PENDING / RESCHEDULE',
    code: 'PENDING',
    order: 3,
    active: true,
    color: '#F59E0B',
    reasons: [
      {
        id: 'hr-p1',
        name: 'Kendala Redaman Tinggi / LOS',
        order: 1,
        active: true,
        statusId: 'hs-pending',
        remarks: [
          { id: 'hrm-p1-1', name: 'Loss Signal dari FAT / ODP', order: 1, active: true, reasonId: 'hr-p1' },
          { id: 'hrm-p1-2', name: 'Kabel Dropcore Putus di Jalur Utama', order: 2, active: true, reasonId: 'hr-p1' }
        ]
      },
      {
        id: 'hr-p2',
        name: 'Pelanggan Meminta Reschedule',
        order: 2,
        active: true,
        statusId: 'hs-pending',
        remarks: [
          { id: 'hrm-p2-1', name: 'Pelanggan Tidak di Tempat / Luar Kota', order: 1, active: true, reasonId: 'hr-p2' },
          { id: 'hrm-p2-2', name: 'Minta Kunjungan Diundur ke Akhir Pekan', order: 2, active: true, reasonId: 'hr-p2' }
        ]
      },
      {
        id: 'hr-p3',
        name: 'Akses Rumah / Lokasi Terkendala',
        order: 3,
        active: true,
        statusId: 'hs-pending',
        remarks: [
          { id: 'hrm-p3-1', name: 'Portal Komplek / Cluster Terkunci', order: 1, active: true, reasonId: 'hr-p3' },
          { id: 'hrm-p3-2', name: 'Izin Pengelola Gedung Belum Terbit', order: 2, active: true, reasonId: 'hr-p3' }
        ]
      },
      {
        id: 'hr-p4',
        name: 'Menunggu Material / Tim Tambahan',
        order: 4,
        active: true,
        statusId: 'hs-pending',
        remarks: [
          { id: 'hrm-p4-1', name: 'Butuh Dropcore Panjang >150 Meter', order: 1, active: true, reasonId: 'hr-p4' },
          { id: 'hrm-p4-2', name: 'Memerlukan Tiang Sisipan Tambahan', order: 2, active: true, reasonId: 'hr-p4' }
        ]
      }
    ]
  },
  {
    id: 'hs-enroute',
    name: 'EN ROUTE',
    code: 'EN_ROUTE',
    order: 4,
    active: true,
    color: '#3B82F6',
    reasons: [
      {
        id: 'hr-er1',
        name: 'Teknisi Sedang Menuju Lokasi',
        order: 1,
        active: true,
        statusId: 'hs-enroute',
        remarks: [
          { id: 'hrm-er1-1', name: 'Estimasi Tiba Sesuai Slot Waktu', order: 1, active: true, reasonId: 'hr-er1' },
          { id: 'hrm-er1-2', name: 'Kendala Lalu Lintas / Cuaca Hujan', order: 2, active: true, reasonId: 'hr-er1' }
        ]
      }
    ]
  },
  {
    id: 'hs-onsite',
    name: 'ON SITE',
    code: 'ON_SITE',
    order: 5,
    active: true,
    color: '#8B5CF6',
    reasons: [
      {
        id: 'hr-os1',
        name: 'Pemeriksaan Lapangan Berlangsung',
        order: 1,
        active: true,
        statusId: 'hs-onsite',
        remarks: [
          { id: 'hrm-os1-1', name: 'Pengecekan Jalur FAT & Penarikan Kabel', order: 1, active: true, reasonId: 'hr-os1' },
          { id: 'hrm-os1-2', name: 'Pemasangan Roset & Uji Redaman OPM', order: 2, active: true, reasonId: 'hr-os1' }
        ]
      }
    ]
  },
  {
    id: 'hs-installed',
    name: 'INSTALLED',
    code: 'INSTALLED',
    order: 6,
    active: true,
    color: '#059669',
    reasons: [
      {
        id: 'hr-inst1',
        name: 'Perangkat Baru Terpasang & Aktif',
        order: 1,
        active: true,
        statusId: 'hs-installed',
        remarks: [
          { id: 'hrm-inst1-1', name: 'ONT & WiFi Berfungsi Normal', order: 1, active: true, reasonId: 'hr-inst1' },
          { id: 'hrm-inst1-2', name: 'Speedtest Sesuai Paket Layanan', order: 2, active: true, reasonId: 'hr-inst1' }
        ]
      }
    ]
  },
  {
    id: 'hs-assigned',
    name: 'ASSIGNED',
    code: 'ASSIGNED',
    order: 7,
    active: true,
    color: '#6366F1',
    reasons: [
      {
        id: 'hr-as1',
        name: 'Menunggu Keberangkatan Teknisi',
        order: 1,
        active: true,
        statusId: 'hs-assigned',
        remarks: [
          { id: 'hrm-as1-1', name: 'Jadwal Sesuai Slot Waktu Pelanggan', order: 1, active: true, reasonId: 'hr-as1' }
        ]
      }
    ]
  }
];

// -------------------------------------------------------------
// Data Reconciliation Helper
// Merges legacy flat categories (appSettings/report_dropdown_categories)
// into the unified 3-level hierarchy (appSettings/hierarchical_droplists)
// preserving all existing items, IDs, relationships and preventing duplicates.
// -------------------------------------------------------------
export function reconcileDroplistData(
  currentStatuses: HierarchicalStatus[],
  legacyCategories?: ReportDropdownCategory[]
): { reconciled: HierarchicalStatus[]; changedCount: number } {
  let changedCount = 0;
  const statusesCopy: HierarchicalStatus[] = JSON.parse(JSON.stringify(currentStatuses || []));

  if (!Array.isArray(legacyCategories) || legacyCategories.length === 0) {
    return { reconciled: statusesCopy, changedCount: 0 };
  }

  // 1. Reconcile Level 1 (Report Statuses)
  const legacyStatuses = legacyCategories.filter(c => c.categoryType === 'report_status' && !c.isDeleted);
  for (const legSt of legacyStatuses) {
    const cleanName = legSt.name.trim();
    const cleanLower = cleanName.toLowerCase();
    const existing = statusesCopy.find(
      s => s.name.toLowerCase().trim() === cleanLower ||
           (s.code && s.code.toLowerCase().trim() === cleanLower) ||
           s.id === legSt.id
    );

    if (!existing) {
      const newStatus: HierarchicalStatus = {
        id: legSt.id.startsWith('hs-') ? legSt.id : `hs-${legSt.id}`,
        name: cleanName,
        code: cleanName.toUpperCase().replace(/\s+/g, '_'),
        order: statusesCopy.length + 1,
        active: legSt.isActive !== false,
        isActive: legSt.isActive !== false,
        color: '#7135B5',
        reasons: []
      };
      statusesCopy.push(newStatus);
      changedCount++;
    }
  }

  // Helper to find matching status for a reason name
  const findTargetStatus = (reasonName: string): HierarchicalStatus => {
    const rLower = reasonName.toLowerCase();
    if (rLower.includes('selesai') || rLower.includes('standar') || rLower.includes('normal') || rLower.includes('baik')) {
      const match = statusesCopy.find(s => s.name.toUpperCase().includes('COMPLET') || s.code === 'COMPLETE');
      if (match) return match;
    }
    if (rLower.includes('batal') || rLower.includes('cancel') || rLower.includes('menolak') || rLower.includes('berhenti')) {
      const match = statusesCopy.find(s => s.name.toUpperCase().includes('CANCEL') || s.code === 'CANCEL');
      if (match) return match;
    }
    if (rLower.includes('redaman') || rLower.includes('los') || rLower.includes('pending') || rLower.includes('reschedule') || rLower.includes('material') || rLower.includes('akses') || rLower.includes('rumah')) {
      const match = statusesCopy.find(s => s.name.toUpperCase().includes('PENDING') || s.code === 'PENDING');
      if (match) return match;
    }
    if (rLower.includes('en route') || rLower.includes('perjalanan') || rLower.includes('menuju')) {
      const match = statusesCopy.find(s => s.name.toUpperCase().includes('EN ROUTE') || s.code === 'EN_ROUTE');
      if (match) return match;
    }
    if (rLower.includes('on site') || rLower.includes('tiba') || rLower.includes('lokasi')) {
      const match = statusesCopy.find(s => s.name.toUpperCase().includes('ON SITE') || s.code === 'ON_SITE');
      if (match) return match;
    }
    return statusesCopy[0];
  };

  // 2. Reconcile Level 2 (Reason Reports)
  const legacyReasons = legacyCategories.filter(c => c.categoryType === 'reason_report' && !c.isDeleted);
  for (const legRs of legacyReasons) {
    const cleanName = legRs.name.trim();
    const cleanLower = cleanName.toLowerCase();

    // Check if reason already exists in any status
    let alreadyExists = false;
    for (const status of statusesCopy) {
      if ((status.reasons || []).some(r => r.name.toLowerCase().trim() === cleanLower || r.id === legRs.id)) {
        alreadyExists = true;
        break;
      }
    }

    if (!alreadyExists && statusesCopy.length > 0) {
      const targetStatus = findTargetStatus(cleanName);
      if (targetStatus) {
        if (!targetStatus.reasons) targetStatus.reasons = [];
        const newReason: HierarchicalReason = {
          id: legRs.id.startsWith('hr-') ? legRs.id : `hr-${legRs.id}`,
          name: cleanName,
          order: targetStatus.reasons.length + 1,
          active: legRs.isActive !== false,
          isActive: legRs.isActive !== false,
          statusId: targetStatus.id,
          remarks: []
        };
        targetStatus.reasons.push(newReason);
        changedCount++;
      }
    }
  }

  // 3. Reconcile Level 3 (Rootcauses / Remarks)
  const legacyRootcauses = legacyCategories.filter(c => c.categoryType === 'rootcause' && !c.isDeleted);
  for (const legRc of legacyRootcauses) {
    const cleanText = legRc.name.trim();
    const cleanLower = cleanText.toLowerCase();

    // Check if remark already exists
    let alreadyExists = false;
    for (const status of statusesCopy) {
      for (const reason of (status.reasons || [])) {
        if ((reason.remarks || []).some(rm => (rm.text || rm.name).toLowerCase().trim() === cleanLower || rm.id === legRc.id)) {
          alreadyExists = true;
          break;
        }
      }
      if (alreadyExists) break;
    }

    if (!alreadyExists && statusesCopy.length > 0) {
      // Find a suitable reason under Pending or Complete to attach the rootcause
      let targetReason: HierarchicalReason | undefined;
      const pendingStatus = statusesCopy.find(s => s.name.toUpperCase().includes('PENDING'));
      if (pendingStatus && pendingStatus.reasons && pendingStatus.reasons.length > 0) {
        targetReason = pendingStatus.reasons[0];
      } else {
        const firstWithReasons = statusesCopy.find(s => s.reasons && s.reasons.length > 0);
        targetReason = firstWithReasons?.reasons?.[0];
      }

      if (targetReason) {
        if (!targetReason.remarks) targetReason.remarks = [];
        const newRemark: HierarchicalRemark = {
          id: legRc.id.startsWith('hrm-') ? legRc.id : `hrm-${legRc.id}`,
          name: cleanText,
          text: cleanText,
          order: targetReason.remarks.length + 1,
          active: legRc.isActive !== false,
          isActive: legRc.isActive !== false,
          reasonId: targetReason.id
        };
        targetReason.remarks.push(newRemark);
        changedCount++;
      }
    }
  }

  return { reconciled: statusesCopy, changedCount };
}

export async function saveHierarchicalDroplistsToFirestore(statuses: HierarchicalStatus[]): Promise<void> {
  if (!isFirestoreActiveForEnvironment()) {
    try {
      await fetch('/api/supabase/settings/hierarchical_droplists', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ value: statuses, description: 'Hierarchical Droplists Configuration' })
      });
    } catch (err) {
      console.warn('[Supabase Sync] saveHierarchicalDroplists error:', err);
    }
    return;
  }
  const path = `${COLLECTIONS.APP_SETTINGS}/hierarchical_droplists`;
  try {
    const docRef = doc(db, COLLECTIONS.APP_SETTINGS, 'hierarchical_droplists');
    await setDoc(docRef, {
      id: 'hierarchical_droplists',
      statuses: sanitizeForFirestore(statuses),
      updatedAt: new Date().toISOString(),
      updatedBy: 'Droplist Management'
    }, { merge: true });

    // Backwards-compatible mirror to report_dropdown_categories to keep legacy views working
    try {
      const flattenedCategories: ReportDropdownCategory[] = [];
      statuses.forEach((s, sIdx) => {
        flattenedCategories.push({
          id: s.id,
          categoryType: 'report_status',
          name: s.name,
          isActive: s.active !== false && (s as any).isActive !== false,
          sortOrder: sIdx + 1,
          createdAt: new Date().toISOString()
        });
        (s.reasons || []).forEach((r, rIdx) => {
          flattenedCategories.push({
            id: r.id,
            categoryType: 'reason_report',
            name: r.name,
            isActive: r.active !== false && (r as any).isActive !== false,
            sortOrder: rIdx + 1,
            createdAt: new Date().toISOString()
          });
          (r.remarks || []).forEach((rm, rmIdx) => {
            flattenedCategories.push({
              id: rm.id,
              categoryType: 'rootcause',
              name: rm.text || rm.name,
              isActive: rm.active !== false && (rm as any).isActive !== false,
              sortOrder: rmIdx + 1,
              createdAt: new Date().toISOString()
            });
          });
        });
      });
      const dropRef = doc(db, COLLECTIONS.APP_SETTINGS, 'report_dropdown_categories');
      await setDoc(dropRef, {
        id: 'report_dropdown_categories',
        categories: sanitizeForFirestore(flattenedCategories),
        updatedAt: new Date().toISOString(),
        updatedBy: 'Droplist Management Sync'
      }, { merge: true });
    } catch (e) {
      console.warn('[Firestore] Notice mirroring flattened categories:', e);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function loadHierarchicalDroplistsFromFirestore(): Promise<HierarchicalStatus[] | null> {
  if (!isFirestoreActiveForEnvironment()) {
    try {
      const res = await fetch('/api/supabase/settings/hierarchical_droplists', {
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      const json = await res.json();
      if (json.success && json.data) {
        return (json.data.value || json.data) as HierarchicalStatus[];
      }
    } catch {}
    return null;
  }
  const path = `${COLLECTIONS.APP_SETTINGS}/hierarchical_droplists`;
  try {
    const docRef = doc(db, COLLECTIONS.APP_SETTINGS, 'hierarchical_droplists');
    const snap = await getDoc(docRef);
    if (snap.exists() && Array.isArray(snap.data()?.statuses)) {
      return snap.data().statuses as HierarchicalStatus[];
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

export function subscribeToHierarchicalDroplists(
  callback: (statuses: HierarchicalStatus[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!isFirestoreActiveForEnvironment()) {
    return () => {};
  }
  const path = `${COLLECTIONS.APP_SETTINGS}/hierarchical_droplists`;
  const docRef = doc(db, COLLECTIONS.APP_SETTINGS, 'hierarchical_droplists');
  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists() && Array.isArray(snap.data()?.statuses)) {
        callback(snap.data().statuses as HierarchicalStatus[]);
      } else {
        callback(INITIAL_HIERARCHICAL_DROPLISTS);
      }
    },
    (error) => {
      console.warn('[Firestore] Hierarchical droplists subscription error:', error);
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (e: any) {
        onError?.(e);
      }
    }
  );
}


