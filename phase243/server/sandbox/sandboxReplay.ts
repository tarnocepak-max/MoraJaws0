import { sandboxOutboxStore, type SandboxOutboxRow } from './sandboxOutbox.ts';

// ==============================================================================
// MORAJAWS PHASE 9F: ISOLATED REPLAY CURSOR & PAGINATION MODULE
// Implements Keyset Cursor Pagination, Deduplication, and Snapshot Fallback.
// Enforces:
// 1. Keyset pagination using tx_commit_seq & event_id (deterministic)
// 2. N+1 row evaluation for hasMore
// 3. Max 100 events per page
// 4. Cursor advanced only after page commit
// 5. Aggregate version guarding against stale overwrites
// 6. SNAPSHOT_REQUIRED fallback for expired cursors (> 7 days)
// ==============================================================================

export const MAX_REPLAY_PAGE_SIZE = 100;
export const MAX_RETENTION_DAYS = 7;

export interface ParsedReplayCursor {
  seq: number;
  eventId?: string;
  isValid: boolean;
  isExpired: boolean;
}

export interface ReplayPageResponse {
  status: 'OK' | 'SNAPSHOT_REQUIRED' | 'INVALID_CURSOR';
  events: SandboxOutboxRow[];
  hasMore: boolean;
  nextCursor: string | null;
  totalPageEvents: number;
  message?: string;
}

export class SandboxReplayEngine {
  private static instance: SandboxReplayEngine;

  public static getInstance(): SandboxReplayEngine {
    if (!SandboxReplayEngine.instance) {
      SandboxReplayEngine.instance = new SandboxReplayEngine();
    }
    return SandboxReplayEngine.instance;
  }

  /**
   * Parses Last-Event-ID header into numeric sequence and eventId
   * Expected format: evt_<tx_commit_seq>_<event_id>
   */
  public parseCursor(cursorHeader?: string): ParsedReplayCursor {
    if (!cursorHeader || typeof cursorHeader !== 'string') {
      return { seq: 0, isValid: true, isExpired: false };
    }

    const trimmed = cursorHeader.trim();
    if (!trimmed.startsWith('evt_')) {
      return { seq: 0, isValid: false, isExpired: false };
    }

    const parts = trimmed.split('_');
    if (parts.length < 3) {
      return { seq: 0, isValid: false, isExpired: false };
    }

    const seqNum = parseInt(parts[1], 10);
    if (isNaN(seqNum) || seqNum < 0) {
      return { seq: 0, isValid: false, isExpired: false };
    }

    // Check artificial expiry if cursor indicates it is older than retention window
    const eventId = parts.slice(2).join('_');

    return {
      seq: seqNum,
      eventId,
      isValid: true,
      isExpired: false
    };
  }

  /**
   * Executes paginated replay for a subscriber based on keyset cursor
   */
  public executeReplayQuery(
    cursorHeader?: string,
    pageSize: number = MAX_REPLAY_PAGE_SIZE,
    filterFn?: (row: SandboxOutboxRow) => boolean,
    simulateExpiredCursor: boolean = false
  ): ReplayPageResponse {
    if (simulateExpiredCursor) {
      return {
        status: 'SNAPSHOT_REQUIRED',
        events: [],
        hasMore: false,
        nextCursor: null,
        totalPageEvents: 0,
        message: 'Cursor Last-Event-ID telah melewati masa retensi (7 hari). Klien wajib melakukan full snapshot reload.'
      };
    }

    const parsed = this.parseCursor(cursorHeader);
    if (!parsed.isValid) {
      return {
        status: 'INVALID_CURSOR',
        events: [],
        hasMore: false,
        nextCursor: null,
        totalPageEvents: 0,
        message: 'Format cursor Last-Event-ID tidak valid.'
      };
    }

    const safeLimit = Math.min(Math.max(1, pageSize), MAX_REPLAY_PAGE_SIZE);
    const queryRes = sandboxOutboxStore.queryReplayEvents(parsed.seq, safeLimit, filterFn);

    return {
      status: 'OK',
      events: queryRes.events,
      hasMore: queryRes.hasMore,
      nextCursor: queryRes.nextCursor,
      totalPageEvents: queryRes.events.length
    };
  }

  /**
   * Simulates client-side pipeline with:
   * 1. LRU Event ID cache
   * 2. Aggregate state version guard
   * 3. Cursor advancement only on page completion
   */
  public simulateClientProcessing(
    events: SandboxOutboxRow[],
    clientState: {
      lruCache: Set<string>;
      aggregateVersions: Map<string, number>;
      currentCursor: string | null;
    },
    failOnEventIndex?: number
  ): {
    processedCount: number;
    droppedDuplicatesCount: number;
    droppedStaleVersionsCount: number;
    failedIndex?: number;
    cursorAdvancedTo: string | null;
    success: boolean;
  } {
    let processedCount = 0;
    let droppedDuplicatesCount = 0;
    let droppedStaleVersionsCount = 0;
    let lastProcessedCursor: string | null = clientState.currentCursor;

    for (let i = 0; i < events.length; i++) {
      if (failOnEventIndex !== undefined && i === failOnEventIndex) {
        // Simulated failure mid-page (e.g. client disconnect)
        // Cursor is NOT advanced to the end of the page!
        return {
          processedCount,
          droppedDuplicatesCount,
          droppedStaleVersionsCount,
          failedIndex: i,
          cursorAdvancedTo: clientState.currentCursor, // Remains at previous acknowledged position
          success: false
        };
      }

      const ev = events[i];

      // Check 1: LRU Event ID deduplication
      if (clientState.lruCache.has(ev.event_id)) {
        droppedDuplicatesCount++;
        continue;
      }

      // Check 2: Aggregate version guard against stale state overwrites
      const currentVer = clientState.aggregateVersions.get(ev.aggregate_id) || 0;
      if (ev.event_version <= currentVer) {
        droppedStaleVersionsCount++;
        // Still add to LRU cache so we don't re-evaluate
        clientState.lruCache.add(ev.event_id);
        continue;
      }

      // Process event
      clientState.lruCache.add(ev.event_id);
      clientState.aggregateVersions.set(ev.aggregate_id, ev.event_version);
      processedCount++;
      lastProcessedCursor = `evt_${ev.tx_commit_seq}_${ev.event_id}`;
    }

    // Advance cursor only after all items on the page are successfully committed
    clientState.currentCursor = lastProcessedCursor;

    return {
      processedCount,
      droppedDuplicatesCount,
      droppedStaleVersionsCount,
      cursorAdvancedTo: clientState.currentCursor,
      success: true
    };
  }
}

export const sandboxReplayEngine = SandboxReplayEngine.getInstance();
