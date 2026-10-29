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
  User
} from '../types/index.ts';

// Collection path constants
export const COLLECTIONS = {
  TICKETS: 'tickets',
  USERS: 'users',
  CONTRACTORS: 'contractors',
  COVERAGE_AREAS: 'coverage_areas',
  MESSAGES: 'ticket_messages',
  AUDIT_LOGS: 'audit_logs',
  WA_TEMPLATES: 'wa_templates',
  HEALTH: 'system_health'
} as const;

// -------------------------------------------------------------
// Data Sanitizer (Removes undefined fields which Firestore rejects)
// -------------------------------------------------------------
function sanitizeForFirestore<T extends Record<string, any>>(obj: T): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) continue;
    if (val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
      result[key] = sanitizeForFirestore(val);
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
          const tickets: Ticket[] = [];
          snapshot.forEach((docSnap) => {
            tickets.push(docSnap.data() as Ticket);
          });
          callbacks.onTicketsChange?.(tickets);
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
  const path = `${COLLECTIONS.TICKETS}/${ticket.id}`;
  try {
    const docRef = doc(db, COLLECTIONS.TICKETS, ticket.id);
    const sanitized = sanitizeForFirestore(ticket);
    await setDoc(docRef, sanitized, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function batchSaveTicketsToFirestore(tickets: Ticket[]): Promise<{ saved: number; failed: number }> {
  if (tickets.length === 0) return { saved: 0, failed: 0 };
  let saved = 0;
  let failed = 0;

  // Process in batches of 450 (Firestore limit is 500 per batch)
  const chunkSize = 450;
  for (let i = 0; i < tickets.length; i += chunkSize) {
    const chunk = tickets.slice(i, i + chunkSize);
    const batch = writeBatch(db);

    for (const t of chunk) {
      const docRef = doc(db, COLLECTIONS.TICKETS, t.id);
      batch.set(docRef, sanitizeForFirestore(t), { merge: true });
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

  return { saved, failed };
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
