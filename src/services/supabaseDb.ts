import { Ticket, User, Contractor, CoverageArea, TicketMessage, AuditLog } from '../types';
import { getClientSupabaseInstance } from './supabaseClient';

// ==============================================================================
// MORAJAWS SUPABASE REPOSITORY LAYER (PHASE 6 ADAPTER CONTRACT)
// Provides unified CRUD, Archive, Restore, Batch, and Realtime interfaces.
// Adheres strictly to the Fase 6 Constitution:
// - Sandbox testing is completely isolated.
// - Production remains on Firebase Cloud Firestore.
// - No production dual-write.
// - Backend-proxy routes are utilized for authenticated mutations.
// ==============================================================================

export interface SupabaseResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    isSchemaError?: boolean;
    isDuplicate?: boolean;
    isNotFound?: boolean;
  };
}

export interface WorkOrderFilterOptions {
  area?: string;
  contractorId?: string;
  installerName?: string;
  statusWOAgent?: string;
  statusWOInstaller?: string;
  appointmentDate?: string;
  includeArchived?: boolean;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

export interface RealtimeSubscriptionOptions {
  table?: 'work_orders' | 'ticket_messages' | 'audit_logs';
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  filter?: string;
  onPayload: (payload: any) => void;
  onError?: (error: any) => void;
}

// In-Memory Sandbox Mock Store for isolated contract testing when Supabase remote is standby
const SANDBOX_STORE = {
  workOrders: new Map<string, Ticket>(),
  messages: new Map<string, TicketMessage>(),
  auditLogs: new Array<AuditLog>()
};

export class SupabaseRepository {
  private static instance: SupabaseRepository;

  private constructor() {}

  public static getInstance(): SupabaseRepository {
    if (!SupabaseRepository.instance) {
      SupabaseRepository.instance = new SupabaseRepository();
    }
    return SupabaseRepository.instance;
  }

  // ---------------------------------------------------------------------------
  // WORK ORDER OPERATIONS
  // ---------------------------------------------------------------------------

  /**
   * CREATE: Insert a work order into Supabase (or sandbox namespace)
   */
  async createWorkOrder(ticket: Ticket, isSandbox = false): Promise<SupabaseResponse<Ticket>> {
    if (isSandbox || ticket.id?.startsWith('migration_sandbox') || ticket.woNumber?.startsWith('SANDBOX-')) {
      // Isolated sandbox execution
      const id = ticket.id || `migration_sandbox_${Date.now()}`;
      if (Array.from(SANDBOX_STORE.workOrders.values()).some(t => t.woNumber.toUpperCase() === ticket.woNumber.toUpperCase())) {
        return {
          success: false,
          error: {
            code: '23505',
            isDuplicate: true,
            message: `Duplikasi terdeteksi: Nomor WO ${ticket.woNumber} sudah ada.`
          }
        };
      }
      const newTicket: Ticket = {
        ...ticket,
        id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      SANDBOX_STORE.workOrders.set(id, newTicket);
      return { success: true, data: newTicket };
    }

    // Remote backend proxy to avoid exposing secret key
    try {
      const res = await fetch('/api/supabase/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ticket)
      });
      const json = await res.json();
      return json;
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'NETWORK_ERROR', message: err?.message || 'Gagal menghubungi backend Supabase proxy' }
      };
    }
  }

  /**
   * GET BY ID: Retrieve single work order
   */
  async getWorkOrderById(id: string, isSandbox = false): Promise<SupabaseResponse<Ticket | null>> {
    if (isSandbox || id.startsWith('migration_sandbox')) {
      const t = SANDBOX_STORE.workOrders.get(id);
      if (!t) {
        return {
          success: false,
          error: { code: 'PGRST116', isNotFound: true, message: `Work Order ${id} tidak ditemukan.` }
        };
      }
      return { success: true, data: t };
    }

    try {
      const res = await fetch(`/api/supabase/work-orders/${encodeURIComponent(id)}`);
      const json = await res.json();
      return json;
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'NETWORK_ERROR', message: err?.message || 'Gagal mengambil data dari Supabase proxy' }
      };
    }
  }

  /**
   * GET LIST: Retrieve work orders with filtering
   */
  async getWorkOrders(options: WorkOrderFilterOptions = {}, isSandbox = false): Promise<SupabaseResponse<Ticket[]>> {
    if (isSandbox) {
      let list = Array.from(SANDBOX_STORE.workOrders.values());
      if (!options.includeDeleted) list = list.filter(t => !t.isDeleted);
      if (!options.includeArchived) list = list.filter(t => !t.isArchived);
      if (options.area) list = list.filter(t => t.area === options.area);
      if (options.installerName) list = list.filter(t => t.installerName === options.installerName);
      if (options.appointmentDate) list = list.filter(t => t.appointmentDate === options.appointmentDate);
      return { success: true, data: list };
    }

    try {
      const query = new URLSearchParams(options as any).toString();
      const res = await fetch(`/api/supabase/work-orders?${query}`);
      const json = await res.json();
      return json;
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'NETWORK_ERROR', message: err?.message || 'Gagal mengambil list tiket dari Supabase proxy' }
      };
    }
  }

  /**
   * UPDATE: Partial update of a work order
   */
  async updateWorkOrder(id: string, updates: Partial<Ticket>, isSandbox = false): Promise<SupabaseResponse<Ticket>> {
    if (isSandbox || id.startsWith('migration_sandbox')) {
      const existing = SANDBOX_STORE.workOrders.get(id);
      if (!existing) {
        return {
          success: false,
          error: { code: 'PGRST116', isNotFound: true, message: `Work order ${id} tidak ditemukan.` }
        };
      }
      const updated: Ticket = {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString()
      };
      SANDBOX_STORE.workOrders.set(id, updated);
      return { success: true, data: updated };
    }

    try {
      const res = await fetch(`/api/supabase/work-orders/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      return await res.json();
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'NETWORK_ERROR', message: err?.message || 'Gagal memperbarui data di Supabase proxy' }
      };
    }
  }

  /**
   * SOFT DELETE: Mark work order as deleted
   */
  async deleteWorkOrder(id: string, reason?: string, deletedBy?: string, isSandbox = false): Promise<SupabaseResponse<Ticket>> {
    if (isSandbox || id.startsWith('migration_sandbox')) {
      const existing = SANDBOX_STORE.workOrders.get(id);
      if (!existing) {
        return {
          success: false,
          error: { code: 'PGRST116', isNotFound: true, message: `Work order ${id} tidak ditemukan.` }
        };
      }
      const deleted: Ticket = {
        ...existing,
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        deletedBy: deletedBy || 'Tester',
        deletionReason: reason || 'Sandbox Soft Delete'
      };
      SANDBOX_STORE.workOrders.set(id, deleted);
      return { success: true, data: deleted };
    }

    try {
      const res = await fetch(`/api/supabase/work-orders/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, deletedBy })
      });
      return await res.json();
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'NETWORK_ERROR', message: err?.message || 'Gagal soft delete di Supabase proxy' }
      };
    }
  }

  /**
   * ARCHIVE: Move work order to archive
   */
  async archiveWorkOrder(id: string, archivedBy?: string, isSandbox = false): Promise<SupabaseResponse<Ticket>> {
    if (isSandbox || id.startsWith('migration_sandbox')) {
      const existing = SANDBOX_STORE.workOrders.get(id);
      if (!existing) {
        return {
          success: false,
          error: { code: 'PGRST116', isNotFound: true, message: `Work order ${id} tidak ditemukan.` }
        };
      }
      const archived: Ticket = {
        ...existing,
        isArchived: true,
        archivedAt: new Date().toISOString(),
        archivedBy: archivedBy || 'Tester'
      };
      SANDBOX_STORE.workOrders.set(id, archived);
      return { success: true, data: archived };
    }

    try {
      const res = await fetch(`/api/supabase/work-orders/${encodeURIComponent(id)}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivedBy })
      });
      return await res.json();
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'NETWORK_ERROR', message: err?.message || 'Gagal mengarsipkan data' }
      };
    }
  }

  /**
   * RESTORE: Restore an archived or soft-deleted work order
   */
  async restoreWorkOrder(id: string, restoredBy?: string, isSandbox = false): Promise<SupabaseResponse<Ticket>> {
    if (isSandbox || id.startsWith('migration_sandbox')) {
      const existing = SANDBOX_STORE.workOrders.get(id);
      if (!existing) {
        return {
          success: false,
          error: { code: 'PGRST116', isNotFound: true, message: `Work order ${id} tidak ditemukan.` }
        };
      }
      const restored: Ticket = {
        ...existing,
        isArchived: false,
        isDeleted: false,
        archivedAt: undefined,
        deletedAt: undefined,
        updatedAt: new Date().toISOString()
      };
      SANDBOX_STORE.workOrders.set(id, restored);
      return { success: true, data: restored };
    }

    try {
      const res = await fetch(`/api/supabase/work-orders/${encodeURIComponent(id)}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restoredBy })
      });
      return await res.json();
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'NETWORK_ERROR', message: err?.message || 'Gagal memulihkan data' }
      };
    }
  }

  /**
   * BATCH WRITE / BULK IMPORT: Insert multiple work orders with file and database deduplication
   */
  async batchCreateWorkOrders(tickets: Ticket[], batchId?: string, isSandbox = false): Promise<SupabaseResponse<any>> {
    if (isSandbox) {
      const summary = {
        totalSubmitted: tickets.length,
        imported: 0,
        skippedDuplicates: 0,
        duplicateInFile: [] as string[],
        duplicateExisting: [] as string[]
      };

      const seenInBatch = new Set<string>();

      for (const t of tickets) {
        const norm = (t.woNumber || '').trim().toUpperCase().replace(/\s+/g, '');
        if (seenInBatch.has(norm)) {
          summary.skippedDuplicates++;
          summary.duplicateInFile.push(norm);
          continue;
        }
        seenInBatch.add(norm);

        const existsInStore = Array.from(SANDBOX_STORE.workOrders.values()).some(
          x => (x.woNumber || '').trim().toUpperCase().replace(/\s+/g, '') === norm
        );

        if (existsInStore) {
          summary.skippedDuplicates++;
          summary.duplicateExisting.push(norm);
          continue;
        }

        const id = t.id || `migration_sandbox_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        SANDBOX_STORE.workOrders.set(id, { ...t, id, importBatchId: batchId || `sandbox_batch_${Date.now()}` });
        summary.imported++;
      }

      return { success: true, data: summary };
    }

    try {
      const res = await fetch('/api/supabase/work-orders/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickets, batchId })
      });
      return await res.json();
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'NETWORK_ERROR', message: err?.message || 'Gagal batch import' }
      };
    }
  }

  // ---------------------------------------------------------------------------
  // REALTIME SUBSCRIPTION PROTOTYPE
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to Supabase Realtime changes on tables
   */
  subscribeToChanges(options: RealtimeSubscriptionOptions): () => void {
    const client = getClientSupabaseInstance();
    if (!client) {
      // In standby mode, return a harmless no-op unsubscriber
      console.info('[Supabase Repository] Realtime is in standby mode (client unconfigured).');
      return () => {};
    }

    try {
      const channelName = `realtime-${options.table || 'work_orders'}-${Date.now()}`;
      const channel = client.channel(channelName);

      channel.on(
        'postgres_changes',
        {
          event: options.event || '*',
          schema: 'public',
          table: options.table || 'work_orders',
          filter: options.filter
        },
        (payload) => {
          options.onPayload(payload);
        }
      );

      channel.subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          options.onError?.(err || new Error(`Channel subscription status: ${status}`));
        }
      });

      return () => {
        client.removeChannel(channel).catch(() => {});
      };
    } catch (err) {
      options.onError?.(err);
      return () => {};
    }
  }
}

export const supabaseDb = SupabaseRepository.getInstance();
