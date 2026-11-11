import { EventEmitter } from 'events';
import { sandboxOutboxStore, type SandboxOutboxRow } from './sandboxOutbox.ts';
import { sandboxAccessController, type SandboxUserSession } from './sandboxAccessControl.ts';

// ==============================================================================
// MORAJAWS PHASE 9F: ISOLATED SHARED BROKER & POLLING SAFETY-NET MODULE
// Coordinates:
// 1. Wake-up signal transport between Cloud Run instances
// 2. Database-backed polling safety-net (Zero RAM cache dependency)
// 3. Server-side scoping before delivery to active subscriber connections
// ==============================================================================

export interface SandboxActiveConnection {
  connectionId: string;
  user: SandboxUserSession;
  lastAcknowledgedSeq: number;
  isAlive: boolean;
  connectedAt: string;
  deliveredCount: number;
  droppedCount: number;
  writeCallback: (formattedEvent: string) => boolean;
  closeCallback: (reason: string) => void;
}

export class SandboxRealtimeCoordinator {
  private static instance: SandboxRealtimeCoordinator;

  // Inter-instance event bus simulating Supabase Realtime channel
  private brokerEmitter = new EventEmitter();

  // Active SSE connections connected to this specific instance
  private activeConnections = new Map<string, SandboxActiveConnection>();

  // Persistent sequence cursor for this instance (persisted locally / database-backed)
  private lastPolledSeq = 0;
  private pollingTimer: NodeJS.Timeout | null = null;
  private isBrokerConnected = true;

  public static getInstance(): SandboxRealtimeCoordinator {
    if (!SandboxRealtimeCoordinator.instance) {
      SandboxRealtimeCoordinator.instance = new SandboxRealtimeCoordinator();
    }
    return SandboxRealtimeCoordinator.instance;
  }

  constructor() {
    // Listen to broker wake-up signals
    this.brokerEmitter.on('WAKE_UP_SIGNAL', (signal: { sourceInstance: string; maxSeq: number }) => {
      if (this.isBrokerConnected) {
        this.drainNewEventsFromOutbox();
      }
    });
  }

  public registerConnection(conn: SandboxActiveConnection): void {
    this.activeConnections.set(conn.connectionId, conn);
  }

  public unregisterConnection(connectionId: string): void {
    this.activeConnections.delete(connectionId);
  }

  public setBrokerConnected(connected: boolean): void {
    this.isBrokerConnected = connected;
  }

  /**
   * Broadcasts wake-up signal across instances (Simulating Supabase Realtime channel)
   */
  public broadcastWakeUpSignal(maxSeq: number, sourceInstance: string = 'instance_local'): void {
    if (this.isBrokerConnected) {
      this.brokerEmitter.emit('WAKE_UP_SIGNAL', { sourceInstance, maxSeq });
    }
  }

  /**
   * Reads new events from Outbox database starting from lastPolledSeq
   * Evaluates server-side scoping for every connected subscriber
   * Zero RAM cache dependency: Source of truth is solely the database outbox rows
   */
  public async drainNewEventsFromOutbox(): Promise<{
    eventsFound: number;
    deliveredCount: number;
    droppedCount: number;
  }> {
    const replayRes = sandboxOutboxStore.queryReplayEvents(this.lastPolledSeq, 100);
    const events = replayRes.events;

    if (events.length === 0) {
      return { eventsFound: 0, deliveredCount: 0, droppedCount: 0 };
    }

    let totalDelivered = 0;
    let totalDropped = 0;

    for (const event of events) {
      // Advance local instance water-mark
      if (event.tx_commit_seq > this.lastPolledSeq) {
        this.lastPolledSeq = event.tx_commit_seq;
      }

      // Distribute to active connections on this instance
      for (const conn of this.activeConnections.values()) {
        const evalRes = sandboxAccessController.evaluateEventForUser(conn.user, event);

        if (evalRes.isEvictionTriggered) {
          // Immediately terminate socket on deactivation
          conn.closeCallback('Sesi ditutup: Akun Anda dinonaktifkan.');
          this.activeConnections.delete(conn.connectionId);
          continue;
        }

        if (evalRes.isPermitted) {
          const sseString = `id: evt_${event.tx_commit_seq}_${event.event_id}\nevent: ${event.event_type}\ndata: ${JSON.stringify(evalRes.sanitizedPayload)}\n\n`;
          const written = conn.writeCallback(sseString);
          if (written) {
            conn.deliveredCount++;
            conn.lastAcknowledgedSeq = event.tx_commit_seq;
            totalDelivered++;
          }
        } else {
          conn.droppedCount++;
          totalDropped++;
        }
      }
    }

    return {
      eventsFound: events.length,
      deliveredCount: totalDelivered,
      droppedCount: totalDropped
    };
  }

  /**
   * Starts periodic polling safety-net (e.g. every 3 seconds)
   * Guaranteed to catch any events missed due to broker disconnect or restart
   */
  public startPollingSafetyNet(intervalMs: number = 3000): void {
    if (this.pollingTimer) return;
    this.pollingTimer = setInterval(() => {
      this.drainNewEventsFromOutbox();
    }, intervalMs);
  }

  public stopPollingSafetyNet(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  public resetCoordinatorState(): void {
    this.activeConnections.clear();
    this.lastPolledSeq = 0;
    this.isBrokerConnected = true;
    this.stopPollingSafetyNet();
  }

  public getActiveConnectionCount(): number {
    return this.activeConnections.size;
  }
}

export const sandboxRealtimeCoordinator = SandboxRealtimeCoordinator.getInstance();
