import crypto from 'crypto';

// ==============================================================================
// [SANDBOX SIMULATION ONLY - IN-MEMORY LOCAL SIMULATION]
// MORAJAWS PHASE 9F: ISOLATED SANDBOX DURABLE JOURNAL MODULE
// Namespace: _outbox_journal_sandbox
// Enforces prefix 'WO-SANDBOX-' on all records.
// Zero contact with production collections or tickets.
// Strictly an isolated in-memory test double / simulation harness.
// ==============================================================================

export const SANDBOX_COLLECTION_JOURNAL = '_outbox_journal_sandbox';
export const SANDBOX_COLLECTION_TICKETS = '_tickets_sandbox';
export const SANDBOX_WO_PREFIX = 'WO-SANDBOX-';
export const MAX_FIRESTORE_BATCH_SIZE = 500;
export const RECOMMENDED_CHUNK_SIZE = 200; // 200 tickets = 400 ops (Ticket + Journal), safe under 500

export interface SandboxMutationInput {
  mutationId?: string; // Optional client-provided idempotency key
  aggregateId: string; // Must start with WO-SANDBOX-
  eventType: 'WO_CREATED' | 'WO_IMPORTED' | 'WO_ASSIGNED' | 'WO_REASSIGNED' | 'WO_STATUS_UPDATED' | 'WO_REPORT_SUBMITTED' | 'WO_DELETED' | 'WO_RESTORED' | 'WO_SHEETS_SYNCED' | 'WO_BULK_UPDATED';
  eventVersion: number;
  actorUid: string;
  actorRole: string;
  contractorId?: string;
  contractorName?: string;
  areaId?: string;
  areaName?: string;
  assignedInstallerId?: string;
  assignedInstallerName?: string;
  payload: Record<string, any>;
  timestamp?: string;
}

export interface SandboxJournalDocument {
  journalId: string;
  mutationId: string;
  aggregateId: string;
  eventType: string;
  eventVersion: number;
  actorUid: string;
  actorRole: string;
  contractorId?: string;
  contractorName?: string;
  areaId?: string;
  areaName?: string;
  assignedInstallerId?: string;
  assignedInstallerName?: string;
  payload: Record<string, any>;
  createdAt: string;
  syncedToSupabase: boolean;
  syncedAt?: string;
  retryCount: number;
  lastError?: string;
}

export interface BatchChunkReport {
  chunkIndex: number;
  itemCount: number;
  success: boolean;
  journalIds: string[];
  error?: string;
}

export class SandboxJournalEngine {
  private static instance: SandboxJournalEngine;

  // In-memory durable document store for sandbox journal to simulate Firestore atomicity
  private journalDocs = new Map<string, SandboxJournalDocument>();
  private ticketDocs = new Map<string, Record<string, any>>();

  public static getInstance(): SandboxJournalEngine {
    if (!SandboxJournalEngine.instance) {
      SandboxJournalEngine.instance = new SandboxJournalEngine();
    }
    return SandboxJournalEngine.instance;
  }

  /**
   * Generates a deterministic journal ID based on aggregateId and mutationId
   */
  public generateDeterministicJournalId(aggregateId: string, mutationId: string): string {
    const hash = crypto.createHash('sha256').update(`${aggregateId}:${mutationId}`).digest('hex').slice(0, 12);
    return `jrn_${aggregateId}_${hash}`;
  }

  /**
   * Validates sandbox prefix boundary
   */
  private assertSandboxPrefix(aggregateId: string): void {
    if (!aggregateId || !aggregateId.startsWith(SANDBOX_WO_PREFIX)) {
      throw new Error(`[Sandbox Security Violation] Record '${aggregateId}' ditolak. Semua data sandbox wajib berawalan '${SANDBOX_WO_PREFIX}'.`);
    }
  }

  /**
   * Executes atomic mutation writing Ticket Doc + Journal Doc simultaneously
   * Guarantees:
   * 1. Idempotency: Same mutationId produces same journalId without duplication
   * 2. Distinct mutations on same WO create separate journal entries
   */
  public async commitAtomicMutation(input: SandboxMutationInput): Promise<{
    success: boolean;
    journalId: string;
    mutationId: string;
    isDuplicateRetry: boolean;
    journalDoc: SandboxJournalDocument;
  }> {
    this.assertSandboxPrefix(input.aggregateId);

    const mutationId = input.mutationId || `mut_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const journalId = this.generateDeterministicJournalId(input.aggregateId, mutationId);
    const nowIso = input.timestamp || new Date().toISOString();

    // Check if duplicate retry of identical request
    const existing = this.journalDocs.get(journalId);
    if (existing) {
      return {
        success: true,
        journalId,
        mutationId,
        isDuplicateRetry: true,
        journalDoc: { ...existing }
      };
    }

    // Atomic write Ticket + Journal
    const journalDoc: SandboxJournalDocument = {
      journalId,
      mutationId,
      aggregateId: input.aggregateId,
      eventType: input.eventType,
      eventVersion: input.eventVersion,
      actorUid: input.actorUid,
      actorRole: input.actorRole,
      contractorId: input.contractorId,
      contractorName: input.contractorName,
      areaId: input.areaId,
      areaName: input.areaName,
      assignedInstallerId: input.assignedInstallerId,
      assignedInstallerName: input.assignedInstallerName,
      payload: input.payload,
      createdAt: nowIso,
      syncedToSupabase: false,
      retryCount: 0
    };

    // Update ticket state in sandbox
    const currentTicket = this.ticketDocs.get(input.aggregateId) || { woNumber: input.aggregateId, version: 0 };
    const updatedTicket = {
      ...currentTicket,
      ...input.payload,
      version: input.eventVersion,
      updatedAt: nowIso
    };

    this.ticketDocs.set(input.aggregateId, updatedTicket);
    this.journalDocs.set(journalId, journalDoc);

    return {
      success: true,
      journalId,
      mutationId,
      isDuplicateRetry: false,
      journalDoc: { ...journalDoc }
    };
  }

  /**
   * Commits bulk tickets in safe chunks of max 200 items (400 ops), reporting each chunk independently
   */
  public async commitBulkImportChunked(
    mutations: SandboxMutationInput[],
    maxChunkSize: number = RECOMMENDED_CHUNK_SIZE,
    simulateFailureChunkIndex?: number
  ): Promise<{
    totalItems: number;
    totalChunks: number;
    successChunks: number;
    failedChunks: number;
    chunkReports: BatchChunkReport[];
    allSucceeded: boolean;
  }> {
    const chunkReports: BatchChunkReport[] = [];
    const chunks: SandboxMutationInput[][] = [];

    for (let i = 0; i < mutations.length; i += maxChunkSize) {
      chunks.push(mutations.slice(i, i + maxChunkSize));
    }

    let successChunks = 0;
    let failedChunks = 0;

    for (let idx = 0; idx < chunks.length; idx++) {
      const chunk = chunks[idx];
      const journalIds: string[] = [];

      // Check simulated failure
      if (simulateFailureChunkIndex !== undefined && idx === simulateFailureChunkIndex) {
        chunkReports.push({
          chunkIndex: idx,
          itemCount: chunk.length,
          success: false,
          journalIds: [],
          error: `Simulated atomic batch failure on chunk index ${idx}`
        });
        failedChunks++;
        continue;
      }

      try {
        for (const item of chunk) {
          const res = await this.commitAtomicMutation(item);
          journalIds.push(res.journalId);
        }
        chunkReports.push({
          chunkIndex: idx,
          itemCount: chunk.length,
          success: true,
          journalIds
        });
        successChunks++;
      } catch (err: any) {
        chunkReports.push({
          chunkIndex: idx,
          itemCount: chunk.length,
          success: false,
          journalIds,
          error: err?.message || 'Chunk commit failed'
        });
        failedChunks++;
      }
    }

    return {
      totalItems: mutations.length,
      totalChunks: chunks.length,
      successChunks,
      failedChunks,
      chunkReports,
      allSucceeded: failedChunks === 0
    };
  }

  /**
   * Fetches un-synced journal entries for the recovery worker
   */
  public getPendingJournalEntries(limit: number = 100): SandboxJournalDocument[] {
    const list: SandboxJournalDocument[] = [];
    for (const doc of this.journalDocs.values()) {
      if (!doc.syncedToSupabase) {
        list.push({ ...doc });
        if (list.length >= limit) break;
      }
    }
    return list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  /**
   * Marks journal as successfully synced to Supabase after verification
   */
  public markJournalSynced(journalId: string): boolean {
    const doc = this.journalDocs.get(journalId);
    if (!doc) return false;
    doc.syncedToSupabase = true;
    doc.syncedAt = new Date().toISOString();
    return true;
  }

  /**
   * Increments retry counter and records error
   */
  public recordJournalSyncError(journalId: string, error: string): void {
    const doc = this.journalDocs.get(journalId);
    if (!doc) return;
    doc.retryCount = (doc.retryCount || 0) + 1;
    doc.lastError = error;
  }

  /**
   * Clears sandbox state for testing
   */
  public clearSandboxState(): void {
    this.journalDocs.clear();
    this.ticketDocs.clear();
  }

  public getJournalDocument(journalId: string): SandboxJournalDocument | undefined {
    return this.journalDocs.get(journalId);
  }

  public getTicketDocument(aggregateId: string): Record<string, any> | undefined {
    return this.ticketDocs.get(aggregateId);
  }

  public countTotalJournals(): number {
    return this.journalDocs.size;
  }

  public countPendingJournals(): number {
    let pending = 0;
    for (const doc of this.journalDocs.values()) {
      if (!doc.syncedToSupabase) pending++;
    }
    return pending;
  }
}

export const sandboxJournalEngine = SandboxJournalEngine.getInstance();
