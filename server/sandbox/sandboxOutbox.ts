import crypto from 'crypto';
import { SANDBOX_WO_PREFIX, type SandboxJournalDocument } from './sandboxJournal.ts';

// ==============================================================================
// MORAJAWS PHASE 9F: ISOLATED SUPABASE SANDBOX OUTBOX MODULE
// Namespace: realtime_event_outbox_sandbox
// Enforces prefix 'WO-SANDBOX-' on all records.
// Zero contact with production tables.
// ==============================================================================

export const SANDBOX_TABLE_OUTBOX = 'realtime_event_outbox_sandbox';

export interface SandboxOutboxRow {
  id: string; // Internal primary key UUID
  journal_id: string; // UNIQUE constraint matching Firestore journalId
  event_id: string; // Stable UUID for the broadcast event
  aggregate_id: string; // WO-SANDBOX-xxxxx
  event_type: string;
  event_version: number;
  actor_uid: string;
  actor_role: string;
  contractor_id: string | null;
  area_name: string | null;
  assigned_installer_id: string | null;
  payload: Record<string, any>;
  created_at: string; // Event occurrence timestamp (client/mutation time)
  ingested_at: string; // Outbox arrival timestamp (database ingestion time)
  tx_commit_seq: number; // Monotonic sequence for deterministic keyset cursor replay
  delivery_status: 'pending' | 'processing' | 'published' | 'failed';
  locked_by: string | null;
  locked_until: string | null; // ISO timestamp for atomic lease expiration
  retry_count: number;
}

export interface IngestOutboxResult {
  success: boolean;
  row: SandboxOutboxRow;
  isDuplicateIgnored: boolean;
  ingested_at: string;
}

export class SandboxOutboxStore {
  private static instance: SandboxOutboxStore;

  // Persistent in-memory table store simulating PostgreSQL with UNIQUE constraints & atomic locks
  private rows = new Map<string, SandboxOutboxRow>(); // Key: id
  private journalIndex = new Map<string, string>(); // Key: journal_id -> id (Unique Index)
  private sequenceCounter = 0;

  public static getInstance(): SandboxOutboxStore {
    if (!SandboxOutboxStore.instance) {
      SandboxOutboxStore.instance = new SandboxOutboxStore();
    }
    return SandboxOutboxStore.instance;
  }

  private assertSandboxPrefix(aggregateId: string): void {
    if (!aggregateId || !aggregateId.startsWith(SANDBOX_WO_PREFIX)) {
      throw new Error(`[Sandbox Outbox Security Violation] Record '${aggregateId}' ditolak. Semua data outbox sandbox wajib berawalan '${SANDBOX_WO_PREFIX}'.`);
    }
  }

  /**
   * Idempotent insert matching PostgreSQL:
   * INSERT INTO realtime_event_outbox_sandbox (...) VALUES (...) ON CONFLICT (journal_id) DO NOTHING;
   */
  public async ingestJournalEvent(journal: SandboxJournalDocument): Promise<IngestOutboxResult> {
    this.assertSandboxPrefix(journal.aggregateId);

    // Check UNIQUE constraint on journal_id
    const existingId = this.journalIndex.get(journal.journalId);
    if (existingId) {
      const existingRow = this.rows.get(existingId)!;
      return {
        success: true,
        row: { ...existingRow },
        isDuplicateIgnored: true,
        ingested_at: existingRow.ingested_at
      };
    }

    this.sequenceCounter++;
    const rowId = `obx_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const eventId = `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const nowIso = new Date().toISOString();

    const row: SandboxOutboxRow = {
      id: rowId,
      journal_id: journal.journalId,
      event_id: eventId,
      aggregate_id: journal.aggregateId,
      event_type: journal.eventType,
      event_version: journal.eventVersion,
      actor_uid: journal.actorUid,
      actor_role: journal.actorRole,
      contractor_id: journal.contractorId || null,
      area_name: journal.areaName || null,
      assigned_installer_id: journal.assignedInstallerId || null,
      payload: journal.payload,
      created_at: journal.createdAt,
      ingested_at: nowIso,
      tx_commit_seq: this.sequenceCounter,
      delivery_status: 'pending',
      locked_by: null,
      locked_until: null,
      retry_count: 0
    };

    this.rows.set(rowId, row);
    this.journalIndex.set(journal.journalId, rowId);

    return {
      success: true,
      row: { ...row },
      isDuplicateIgnored: false,
      ingested_at: nowIso
    };
  }

  /**
   * Simulates:
   * BEGIN;
   * SELECT * FROM realtime_event_outbox_sandbox
   * WHERE delivery_status = 'pending' OR (delivery_status = 'processing' AND locked_until < NOW())
   * ORDER BY tx_commit_seq ASC
   * LIMIT :limit
   * FOR UPDATE SKIP LOCKED;
   * UPDATE realtime_event_outbox_sandbox SET locked_by = :workerId, locked_until = NOW() + :leaseDurationMs, delivery_status = 'processing'
   * COMMIT;
   */
  public async claimPendingEventsWithLease(
    workerId: string,
    limit: number = 20,
    leaseDurationMs: number = 15000
  ): Promise<SandboxOutboxRow[]> {
    const now = Date.now();
    const claimed: SandboxOutboxRow[] = [];

    // Sort rows by tx_commit_seq ASC (strict ingestion order)
    const sorted = Array.from(this.rows.values()).sort((a, b) => a.tx_commit_seq - b.tx_commit_seq);

    for (const row of sorted) {
      if (claimed.length >= limit) break;

      const isPending = row.delivery_status === 'pending';
      const isLeaseExpired =
        row.delivery_status === 'processing' &&
        row.locked_until &&
        new Date(row.locked_until).getTime() < now;

      // Atomically claim row
      if (isPending || isLeaseExpired) {
        row.delivery_status = 'processing';
        row.locked_by = workerId;
        row.locked_until = new Date(now + leaseDurationMs).toISOString();
        row.retry_count = isLeaseExpired ? row.retry_count + 1 : row.retry_count;
        claimed.push({ ...row });
      }
    }

    return claimed;
  }

  /**
   * Only the worker holding the valid lease can acknowledge and complete delivery
   */
  public async acknowledgeEventDelivery(rowId: string, workerId: string): Promise<boolean> {
    const row = this.rows.get(rowId);
    if (!row) return false;

    // Verify lease ownership and non-expiration
    if (row.locked_by !== workerId) {
      return false; // Lost lease to another worker!
    }

    row.delivery_status = 'published';
    row.locked_by = null;
    row.locked_until = null;
    return true;
  }

  /**
   * Releases lease on failure so another worker or retry can process it
   */
  public async releaseLeaseOnError(rowId: string, workerId: string): Promise<void> {
    const row = this.rows.get(rowId);
    if (!row) return;
    if (row.locked_by === workerId) {
      row.delivery_status = 'pending';
      row.locked_by = null;
      row.locked_until = null;
    }
  }

  /**
   * Verifies if an event exists in outbox by journal_id
   */
  public verifyEventExistsByJournalId(journalId: string): boolean {
    return this.journalIndex.has(journalId);
  }

  /**
   * Query outbox rows with stable keyset cursor pagination based on ingestion sequence
   */
  public queryReplayEvents(
    lastSeq: number = 0,
    limit: number = 100,
    filterFn?: (row: SandboxOutboxRow) => boolean
  ): {
    events: SandboxOutboxRow[];
    hasMore: boolean;
    nextCursor: string | null;
  } {
    // Fetch limit + 1 to detect hasMore reliably
    const fetchLimit = limit + 1;
    const sorted = Array.from(this.rows.values())
      .filter(r => r.tx_commit_seq > lastSeq)
      .sort((a, b) => a.tx_commit_seq - b.tx_commit_seq);

    const filtered = filterFn ? sorted.filter(filterFn) : sorted;
    const pageRows = filtered.slice(0, limit);
    const hasMore = filtered.length > limit;

    const lastRow = pageRows[pageRows.length - 1];
    const nextCursor = lastRow ? `evt_${lastRow.tx_commit_seq}_${lastRow.event_id}` : null;

    return {
      events: pageRows.map(r => ({ ...r })),
      hasMore,
      nextCursor
    };
  }

  public getRowCount(): number {
    return this.rows.size;
  }

  public getPublishedCount(): number {
    return Array.from(this.rows.values()).filter(r => r.delivery_status === 'published').length;
  }

  public clearSandboxState(): void {
    this.rows.clear();
    this.journalIndex.clear();
    this.sequenceCounter = 0;
  }
}

export const sandboxOutboxStore = SandboxOutboxStore.getInstance();
