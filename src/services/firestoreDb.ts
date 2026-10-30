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
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  Ticket,
  Contractor,
  CoverageArea,
  TicketMessage,
  AuditLog,
  WhatsAppTemplate,
  User,
  UIConfiguration
} from '../types/index.ts';
import { deduplicateTicketsInMemory, getDeterministicTicketId, normalizeWoNumber } from './woDeduplicationService';

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
  HEALTH: 'system_health'
} as const;

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
  onError?: (error: Error) => void;
}

export function subscribeToMoraJawsFirestore(callbacks: FirestoreSubscriptionCallbacks): () => void {
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
          console.warn('[Firestore] Tickets subscription warning:', error);
          try {
            handleFirestoreError(error, OperationType.LIST, COLLECTIONS.TICKETS);
          } catch (e: any) {
            callbacks.onError?.(e);
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
          console.warn('[Firestore] Contractors subscription warning:', error);
          try {
            handleFirestoreError(error, OperationType.LIST, COLLECTIONS.CONTRACTORS);
          } catch (e: any) {
            callbacks.onError?.(e);
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
          console.warn('[Firestore] Areas subscription warning:', error);
          try {
            handleFirestoreError(error, OperationType.LIST, COLLECTIONS.COVERAGE_AREAS);
          } catch (e: any) {
            callbacks.onError?.(e);
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
          console.warn('[Firestore] Messages subscription warning:', error);
          try {
            handleFirestoreError(error, OperationType.LIST, COLLECTIONS.MESSAGES);
          } catch (e: any) {
            callbacks.onError?.(e);
          }
        }
      );
      unsubs.push(unsub);
    } catch (err: any) {
      console.warn('[Firestore] Failed attaching messages listener:', err);
    }
  }

  // 5. Audit Logs Real-Time Listener
  if (callbacks.onAuditLogsChange) {
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
          console.warn('[Firestore] Audit logs subscription warning:', error);
          try {
            handleFirestoreError(error, OperationType.LIST, COLLECTIONS.AUDIT_LOGS);
          } catch (e: any) {
            callbacks.onError?.(e);
          }
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
          console.warn('[Firestore] Templates subscription warning:', error);
          try {
            handleFirestoreError(error, OperationType.LIST, COLLECTIONS.WA_TEMPLATES);
          } catch (e: any) {
            callbacks.onError?.(e);
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
          console.warn('[Firestore] Users subscription warning:', error);
          try {
            handleFirestoreError(error, OperationType.LIST, COLLECTIONS.USERS);
          } catch (e: any) {
            callbacks.onError?.(e);
          }
        }
      );
      unsubs.push(unsub);
    } catch (err: any) {
      console.warn('[Firestore] Failed attaching users listener:', err);
    }
  }

  // Return master cleanup function
  return () => {
    unsubs.forEach(unsub => unsub());
  };
}

// -------------------------------------------------------------
// Ticket Mutations (Confirmed Writes)
// -------------------------------------------------------------
export async function saveTicketToFirestore(ticket: Ticket): Promise<void> {
  const targetId = ticket.id || getDeterministicTicketId(ticket.woNumber);
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

    // Also mirror to global for backwards compatibility
    try {
      const globalDoc = doc(db, COLLECTIONS.APP_SETTINGS, 'global');
      await setDoc(globalDoc, {
        uiConfig: payload.config,
        navigationItems: payload.navigationItems,
        menuCategories: payload.menuCategories,
        updatedAt,
        updatedBy: payload.updatedBy || 'Super Admin'
      }, { merge: true });
    } catch {}

    return { success: true, updatedAt };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

export async function loadUIConfigurationFromFirestore(): Promise<CloudUIConfigurationPayload | null> {
  const path = `${COLLECTIONS.APP_SETTINGS}/ui_configuration`;
  try {
    const docRef = doc(db, COLLECTIONS.APP_SETTINGS, 'ui_configuration');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as CloudUIConfigurationPayload;
    }
    // Fallback to global
    const globalRef = doc(db, COLLECTIONS.APP_SETTINGS, 'global');
    const gSnap = await getDoc(globalRef);
    if (gSnap.exists()) {
      const gData = gSnap.data();
      if (gData.uiConfig || gData.navigationItems) {
        return {
          config: gData.uiConfig,
          navigationItems: gData.navigationItems,
          menuCategories: gData.menuCategories || [],
          updatedAt: gData.updatedAt || new Date().toISOString(),
          updatedBy: gData.updatedBy || 'System'
        };
      }
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

export function subscribeToUIConfiguration(callback: (data: CloudUIConfigurationPayload) => void): Unsubscribe {
  const docRef = doc(db, COLLECTIONS.APP_SETTINGS, 'ui_configuration');
  return onSnapshot(docRef, (snap) => {
    if (snap.exists()) {
      callback(snap.data() as CloudUIConfigurationPayload);
    }
  }, (err) => {
    console.warn('[Firestore] UI Configuration subscription warning:', err);
  });
}

export async function deleteTicketFromFirestore(ticketId: string): Promise<void> {
  const path = `${COLLECTIONS.TICKETS}/${ticketId}`;
  try {
    const docRef = doc(db, COLLECTIONS.TICKETS, ticketId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function softDeleteTicketInFirestore(ticketId: string, deletedBy: string, reason: string): Promise<void> {
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

export async function saveCoverageAreaToFirestore(area: CoverageArea): Promise<void> {
  const path = `${COLLECTIONS.COVERAGE_AREAS}/${area.id}`;
  try {
    const docRef = doc(db, COLLECTIONS.COVERAGE_AREAS, area.id);
    await setDoc(docRef, sanitizeForFirestore(area), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// -------------------------------------------------------------
// Live Chat Message Mutations
// -------------------------------------------------------------
export async function sendChatMessageToFirestore(msg: TicketMessage): Promise<void> {
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
  const path = `${COLLECTIONS.WA_TEMPLATES}/${template.id}`;
  try {
    const docRef = doc(db, COLLECTIONS.WA_TEMPLATES, template.id);
    await setDoc(docRef, sanitizeForFirestore(template), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteTemplateFromFirestore(templateId: string): Promise<void> {
  const path = `${COLLECTIONS.WA_TEMPLATES}/${templateId}`;
  try {
    const docRef = doc(db, COLLECTIONS.WA_TEMPLATES, templateId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// -------------------------------------------------------------
// User Profile Mutations
// -------------------------------------------------------------
export async function saveUserToFirestore(user: User): Promise<void> {
  const path = `${COLLECTIONS.USERS}/${user.id}`;
  try {
    const docRef = doc(db, COLLECTIONS.USERS, user.id);
    await setDoc(docRef, sanitizeForFirestore(user), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
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
  try {
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

    return { seeded: true, counts };
  } catch (err) {
    console.warn('[Firestore] Seed verification error:', err);
    return { seeded: false, counts: {} };
  }
}
