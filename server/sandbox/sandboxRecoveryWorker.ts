import { sandboxJournalEngine, type SandboxJournalDocument } from './sandboxJournal.ts';
import { sandboxOutboxStore, type SandboxOutboxRow } from './sandboxOutbox.ts';

// ==============================================================================
// [SANDBOX SIMULATION ONLY - IN-MEMORY LOCAL SIMULATION]
// MORAJAWS PHASE 9F: ISOLATED RECOVERY WORKER MODULE
// Coordinates durable synchronization between Firestore Journal and Supabase Outbox in sandbox.
// Strictly an isolated in-memory test double / simulation harness.
// ==============================================================================

export interface WorkerRunResult {
  workerId: string;
  journalsDrained: number;
  outboxClaimed: number;
  outboxPublished: number;
  failedCount: number;
  conflictsResolved: number;
  errors: string[];
}

export class SandboxRecoveryWorker {
  private workerId: string;
  private isRunning: boolean = false;
  private leaseDurationMs: number;

  constructor(workerId?: string, leaseDurationMs: number = 15000) {
    this.workerId = workerId || `worker_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.leaseDurationMs = leaseDurationMs;
  }

  public getWorkerId(): string {
    return this.workerId;
  }

  /**
   * Phase 1: Drain pending Firestore journals into Supabase Outbox
   * Guaranteed:
   * 1. Idempotent insert via UNIQUE(journal_id)
   * 2. Only marks journal synced AFTER confirming persistence in Supabase Outbox
   */
  public async drainJournalsToOutbox(limit: number = 50): Promise<{
    drainedCount: number;
    duplicateIgnoredCount: number;
    failedCount: number;
    errors: string[];
  }> {
    const pendingJournals = sandboxJournalEngine.getPendingJournalEntries(limit);
    let drainedCount = 0;
    let duplicateIgnoredCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const journal of pendingJournals) {
      try {
        const ingestRes = await sandboxOutboxStore.ingestJournalEvent(journal);
        if (ingestRes.isDuplicateIgnored) {
          duplicateIgnoredCount++;
        } else {
          drainedCount++;
        }

        // CRITICAL: Strictly verify event is persisted in Supabase Outbox BEFORE updating Firestore
        const isVerifiedInSupabase = sandboxOutboxStore.verifyEventExistsByJournalId(journal.journalId);
        if (!isVerifiedInSupabase) {
          throw new Error(`[Verification Failure] Event untuk journal ${journal.journalId} tidak ditemukan di outbox!`);
        }

        // Update Firestore journal state
        sandboxJournalEngine.markJournalSynced(journal.journalId);
      } catch (err: any) {
        failedCount++;
        errors.push(err?.message || 'Drain error');
        sandboxJournalEngine.recordJournalSyncError(journal.journalId, err?.message || 'Drain error');
      }
    }

    return {
      drainedCount,
      duplicateIgnoredCount,
      failedCount,
      errors
    };
  }

  /**
   * Phase 2: Claim outbox rows with atomic lease and broadcast to SSE streams
   * Guarantees:
   * 1. Concurrent workers do not process the same rows (SKIP LOCKED)
   * 2. Worker crash / lease expiration allows another worker to recover
   */
  public async processOutboxBatch(
    limit: number = 20,
    broadcastCallback?: (row: SandboxOutboxRow) => Promise<boolean>
  ): Promise<{
    claimedCount: number;
    publishedCount: number;
    failedCount: number;
    errors: string[];
  }> {
    const claimedRows = await sandboxOutboxStore.claimPendingEventsWithLease(
      this.workerId,
      limit,
      this.leaseDurationMs
    );

    let publishedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const row of claimedRows) {
      try {
        // Broadcast to stream if callback provided
        let broadcastSuccess = true;
        if (broadcastCallback) {
          broadcastSuccess = await broadcastCallback(row);
        }

        if (broadcastSuccess) {
          // Acknowledge only if this worker still holds the lease
          const ackOk = await sandboxOutboxStore.acknowledgeEventDelivery(row.id, this.workerId);
          if (ackOk) {
            publishedCount++;
          } else {
            failedCount++;
            errors.push(`Worker ${this.workerId} lost lease for row ${row.id} during processing.`);
          }
        } else {
          await sandboxOutboxStore.releaseLeaseOnError(row.id, this.workerId);
          failedCount++;
        }
      } catch (err: any) {
        await sandboxOutboxStore.releaseLeaseOnError(row.id, this.workerId);
        failedCount++;
        errors.push(err?.message || 'Publishing error');
      }
    }

    return {
      claimedCount: claimedRows.length,
      publishedCount,
      failedCount,
      errors
    };
  }

  /**
   * Full execution pass combining journal drain + outbox publish
   */
  public async runCycle(broadcastCallback?: (row: SandboxOutboxRow) => Promise<boolean>): Promise<WorkerRunResult> {
    const drainResult = await this.drainJournalsToOutbox(50);
    const processResult = await this.processOutboxBatch(50, broadcastCallback);

    return {
      workerId: this.workerId,
      journalsDrained: drainResult.drainedCount,
      outboxClaimed: processResult.claimedCount,
      outboxPublished: processResult.publishedCount,
      failedCount: drainResult.failedCount + processResult.failedCount,
      conflictsResolved: drainResult.duplicateIgnoredCount,
      errors: [...drainResult.errors, ...processResult.errors]
    };
  }
}
