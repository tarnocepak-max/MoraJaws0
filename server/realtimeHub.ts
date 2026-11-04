import type { Request, Response } from 'express';
import crypto from 'crypto';

// ==============================================================================
// MORAJAWS PHASE 9C: SSE FOUNDATION SANDBOX HUB
// High-resilience, multi-instance-aware Server-Sent Events hub for isolated
// sandbox streaming. Strictly isolated from production databases and workflows.
//
// CONSTITUTIONAL RULES:
// 1. NEVER reads from or writes to production Firebase Firestore.
// 2. NEVER reads from or writes to production Supabase PostgreSQL.
// 3. ONLY broadcasts internal dummy events with 'WO-SANDBOX-' prefix.
// 4. Bounded Circular Buffer capped at MAX_SSE_BUFFER_EVENTS (200).
// 5. Connection limits enforced per instance: MAX_SSE_CONNECTIONS_PER_USER (3).
// 6. Explicit Feature Flag required: process.env.ENABLE_SSE_SANDBOX === 'true'.
// ==============================================================================

export const MAX_SSE_CONNECTIONS_PER_USER = 3;
export const REALTIME_HEARTBEAT_INTERVAL_MS = 20000; // 20 seconds
export const MAX_SSE_BUFFER_EVENTS = 200;
export const SANDBOX_RECORD_PREFIX = 'WO-SANDBOX-';

export type SandboxEventType =
  | 'SANDBOX_CONNECTED'
  | 'SANDBOX_HEARTBEAT'
  | 'SANDBOX_DATA_INSERT'
  | 'SANDBOX_DATA_UPDATE'
  | 'SANDBOX_DATA_DELETE'
  | 'SANDBOX_ACCESS_REVOKED'
  | 'SANDBOX_RECONNECT'
  | 'SANDBOX_SHUTDOWN';

export const ALLOWED_SANDBOX_EVENT_TYPES: readonly SandboxEventType[] = [
  'SANDBOX_CONNECTED',
  'SANDBOX_HEARTBEAT',
  'SANDBOX_DATA_INSERT',
  'SANDBOX_DATA_UPDATE',
  'SANDBOX_DATA_DELETE',
  'SANDBOX_ACCESS_REVOKED',
  'SANDBOX_RECONNECT',
  'SANDBOX_SHUTDOWN'
] as const;

/**
 * Returns the allowlist of confirmed Super Admin emails for the SSE sandbox.
 * Prioritizes process.env.SANDBOX_SUPER_ADMIN_EMAILS if configured,
 * otherwise defaults to the confirmed Super Admin accounts established in MoraJaws.
 */
export function getSandboxSuperAdminAllowlist(): string[] {
  const envVal = (process.env.SANDBOX_SUPER_ADMIN_EMAILS || '').trim();
  if (envVal) {
    return envVal.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  }
  // Confirmed Super Admin emails from codebase seed configuration & project administrator
  return [
    'jordiasbes@gmail.com',
    'rayjs666@gmail.com',
    'tarnocepak@gmail.com'
  ];
}

/**
 * Dedicated Sandbox Super Admin Authorization Middleware.
 * Strictly verifies:
 * 1. User is authenticated (req.user exists).
 * 2. Auth source is cryptographically verified Firebase ID Token (req.authSource === 'firebase_token').
 * 3. Token contains email and email_verified === true.
 * 4. Token email is present in confirmed Super Admin allowlist.
 * 5. User role is 'super_admin'.
 */
export function requireSandboxSuperAdmin(req: any, res: Response, next: any) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      code: 'UNAUTHENTICATED',
      error: 'Tidak terautentikasi: Sesi login tidak ditemukan atau telah kedaluwarsa.'
    });
  }

  if (req.authSource !== 'firebase_token' || !req.decodedFirebaseToken) {
    return res.status(403).json({
      success: false,
      code: 'FIREBASE_TOKEN_REQUIRED',
      error: 'Akses Ditolak: Endpoint sandbox wajib menggunakan Firebase ID Token yang diverifikasi secara kriptografis.'
    });
  }

  const emailVerified = req.decodedFirebaseToken.email_verified === true;
  const tokenEmail = (req.decodedFirebaseToken.email || '').toLowerCase().trim();

  if (!tokenEmail || !emailVerified) {
    return res.status(403).json({
      success: false,
      code: 'EMAIL_NOT_VERIFIED',
      error: 'Akses Ditolak: Email pada Firebase ID Token belum diverifikasi (email_verified: true diperlukan).'
    });
  }

  const allowlist = getSandboxSuperAdminAllowlist();
  if (!allowlist.includes(tokenEmail)) {
    return res.status(403).json({
      success: false,
      code: 'FORBIDDEN_NOT_ALLOWLISTED',
      error: 'Akses Ditolak: Email Anda tidak terdaftar dalam allowlist Super Admin sandbox yang diizinkan.'
    });
  }

  if (req.user.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      code: 'REQUIRE_SUPER_ADMIN',
      error: 'Akses Ditolak: Otoritas ini dibatasi HANYA untuk Super Admin.'
    });
  }

  next();
}

export interface SseSandboxEvent {
  id: string;
  event: SandboxEventType;
  recordId: string;
  timestamp: string;
  sandbox: true;
  payload: Record<string, any>;
}

export interface SseConnectionMetadata {
  connectionId: string;
  userId: string;
  userName: string;
  userRole: string;
  connectedAt: string;
  lastHeartbeatAt: string;
  status: 'active' | 'closed';
  lastEventId: string | null;
  isSandbox: true;
}

interface SseInternalConnection extends SseConnectionMetadata {
  res: Response;
  heartbeatTimer: NodeJS.Timeout | null;
  isDraining: boolean;
  drainTimeout: NodeJS.Timeout | null;
}

export interface PublishSandboxInput {
  eventType: SandboxEventType;
  recordId: string;
  payload?: Record<string, any>;
}

export class RealtimeSandboxHub {
  private static instance: RealtimeSandboxHub;

  // Connection registry (Local per instance in Google Cloud Run)
  private connections = new Map<string, SseInternalConnection>();
  private userConnectionCount = new Map<string, number>();

  // Bounded circular buffer for short-term replay (max 200 events)
  private circularBuffer: SseSandboxEvent[] = [];
  private sequenceCounter = 0;

  // Process-level shutdown flag
  private isShuttingDown = false;

  private constructor() {
    this.setupProcessHooks();
  }

  public static getInstance(): RealtimeSandboxHub {
    if (!RealtimeSandboxHub.instance) {
      RealtimeSandboxHub.instance = new RealtimeSandboxHub();
    }
    return RealtimeSandboxHub.instance;
  }

  /**
   * Evaluates feature flag with strict equality: process.env.ENABLE_SSE_SANDBOX === 'true'
   */
  public isEnabled(): boolean {
    return process.env.ENABLE_SSE_SANDBOX === 'true';
  }

  /**
   * Handles incoming SSE connection on the sandbox endpoint.
   * Enforces feature flag, auth, per-UID limit, SSE headers, and lifecycle hooks.
   */
  public handleConnection(
    req: Request & { user?: any },
    res: Response,
    lastEventIdHeader?: string
  ): { success: boolean; connectionId?: string; error?: string; statusCode?: number; code?: string } {
    // 1. Feature Flag Check
    if (!this.isEnabled()) {
      return {
        success: false,
        statusCode: 403,
        code: 'FEATURE_DISABLED',
        error: 'SSE Sandbox endpoint tidak aktif. Administrator harus mengaktifkan ENABLE_SSE_SANDBOX=true pada environment.'
      };
    }

    if (this.isShuttingDown) {
      return {
        success: false,
        statusCode: 503,
        code: 'SERVER_SHUTDOWN',
        error: 'Server sedang dalam proses shutdown. Koneksi SSE baru ditolak.'
      };
    }

    // 2. Authentication Check (Verified via Firebase Admin / Server User)
    const user = req.user;
    if (!user || !user.id) {
      return {
        success: false,
        statusCode: 401,
        code: 'UNAUTHENTICATED',
        error: 'Tidak terautentikasi: Token Firebase tidak valid atau pengguna tidak ditemukan.'
      };
    }

    // 3. Enforce Per-UID Connection Limit (Max 3 concurrent connections per instance)
    const currentCount = this.userConnectionCount.get(user.id) || 0;
    if (currentCount >= MAX_SSE_CONNECTIONS_PER_USER) {
      return {
        success: false,
        statusCode: 429,
        code: 'TOO_MANY_CONNECTIONS',
        error: `Batas koneksi terlampaui: Maksimal ${MAX_SSE_CONNECTIONS_PER_USER} koneksi SSE aktif per pengguna dalam instance ini.`
      };
    }

    // 4. Configure HTTP Headers for SSE Streaming (Anti-buffering & no-cache)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*'
    });

    // Disable socket idle timeout for long-lived streaming
    if (req.socket) {
      req.socket.setTimeout(0);
      req.socket.setKeepAlive(true, 10000);
    }

    // Send initial raw SSE comment to flush intermediate proxy buffers
    res.write(':connected mora-jaws-sandbox\n\n');

    // 5. Register Connection
    const connectionId = `conn_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const nowIso = new Date().toISOString();

    const conn: SseInternalConnection = {
      connectionId,
      userId: user.id,
      userName: user.name || user.username || 'Sandbox User',
      userRole: user.role || 'tester',
      connectedAt: nowIso,
      lastHeartbeatAt: nowIso,
      status: 'active',
      lastEventId: lastEventIdHeader || null,
      isSandbox: true,
      res,
      heartbeatTimer: null,
      isDraining: false,
      drainTimeout: null
    };

    this.connections.set(connectionId, conn);
    this.userConnectionCount.set(user.id, currentCount + 1);

    // 6. Setup Heartbeat Timer (every 20 seconds, format :keep-alive\n\n)
    conn.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat(connectionId);
    }, REALTIME_HEARTBEAT_INTERVAL_MS);

    // 7. Attach Client Disconnect Handlers
    const cleanup = () => this.cleanupConnection(connectionId, 'client_disconnect');
    req.on('close', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);

    // 8. Dispatch Initial Handshake Event
    const initialEvent: SseSandboxEvent = {
      id: `evt_init_${Date.now()}_${connectionId.slice(-6)}`,
      event: 'SANDBOX_CONNECTED',
      recordId: 'WO-SANDBOX-INIT',
      timestamp: nowIso,
      sandbox: true,
      payload: {
        message: 'Koneksi Server-Sent Events Sandbox MoraJaws berhasil dibuka.',
        connectionId,
        userId: user.id,
        userRole: user.role,
        maxPerUser: MAX_SSE_CONNECTIONS_PER_USER,
        heartbeatIntervalMs: REALTIME_HEARTBEAT_INTERVAL_MS,
        bufferCapacity: MAX_SSE_BUFFER_EVENTS,
        serverTime: nowIso
      }
    };
    this.sendEventToConnection(conn, initialEvent);

    // 9. Replay Missed Events if Last-Event-ID was provided
    if (lastEventIdHeader) {
      this.replayEventsForConnection(conn, lastEventIdHeader);
    }

    return {
      success: true,
      connectionId
    };
  }

  /**
   * Publishes an isolated dummy event into the sandbox circular buffer and broadcasts to all active connections.
   * Strictly enforces prefix 'WO-SANDBOX-'.
   */
  public publishEvent(input: PublishSandboxInput): { success: boolean; eventId?: string; error?: string; deliveredCount?: number } {
    if (!this.isEnabled()) {
      return { success: false, error: 'SSE Sandbox endpoint tidak aktif (ENABLE_SSE_SANDBOX=false).' };
    }

    if (!input.recordId || !input.recordId.startsWith(SANDBOX_RECORD_PREFIX)) {
      return {
        success: false,
        error: `Pelanggaran Keamanan Sandbox: Record ID '${input.recordId}' ditolak. Semua event sandbox wajib menggunakan prefix '${SANDBOX_RECORD_PREFIX}'.`
      };
    }

    if (!ALLOWED_SANDBOX_EVENT_TYPES.includes(input.eventType)) {
      return {
        success: false,
        error: `Event type '${input.eventType}' tidak diizinkan dalam sandbox.`
      };
    }

    this.sequenceCounter++;
    const eventId = `evt_sbx_${this.sequenceCounter}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const timestamp = new Date().toISOString();

    const event: SseSandboxEvent = {
      id: eventId,
      event: input.eventType,
      recordId: input.recordId,
      timestamp,
      sandbox: true,
      payload: {
        recordId: input.recordId,
        customerName: 'Sandbox Customer',
        area: 'AREA-SANDBOX',
        contractorName: 'CONTRACTOR-SANDBOX',
        status: 'SANDBOX_TEST',
        ...(input.payload || {}),
        _meta: {
          broadcastTime: timestamp,
          sequence: this.sequenceCounter
        }
      }
    };

    // Append to circular buffer (bounded at 200 events FIFO)
    if (this.circularBuffer.length >= MAX_SSE_BUFFER_EVENTS) {
      this.circularBuffer.shift(); // Remove oldest
    }
    this.circularBuffer.push(event);

    // Broadcast to active connections
    let deliveredCount = 0;
    this.connections.forEach(conn => {
      if (conn.status === 'active') {
        const ok = this.sendEventToConnection(conn, event);
        if (ok) deliveredCount++;
      }
    });

    return {
      success: true,
      eventId,
      deliveredCount
    };
  }

  /**
   * Replays events from circular buffer after lastEventId.
   * If lastEventId is not found in the buffer, sends SANDBOX_RECONNECT with requiresSnapshot: true.
   */
  private replayEventsForConnection(conn: SseInternalConnection, lastEventId: string): void {
    const idx = this.circularBuffer.findIndex(e => e.id === lastEventId);
    if (idx !== -1) {
      // Replay all events after idx
      const missed = this.circularBuffer.slice(idx + 1);
      for (const ev of missed) {
        this.sendEventToConnection(conn, ev);
      }
    } else {
      // Last event ID not found (either expired from ring buffer or was on a different Cloud Run instance)
      const fallbackEvent: SseSandboxEvent = {
        id: `evt_recon_${Date.now()}`,
        event: 'SANDBOX_RECONNECT',
        recordId: 'WO-SANDBOX-RECONNECT',
        timestamp: new Date().toISOString(),
        sandbox: true,
        payload: {
          requiresSnapshot: true,
          reason: 'Cursor Last-Event-ID tidak ditemukan dalam circular buffer instance ini. Client perlu melakukan snapshot refresh.',
          requestedEventId: lastEventId
        }
      };
      this.sendEventToConnection(conn, fallbackEvent);
    }
  }

  /**
   * Sends formatted SSE payload to a specific connection with backpressure guard.
   */
  private sendEventToConnection(conn: SseInternalConnection, event: SseSandboxEvent): boolean {
    if (conn.status !== 'active') return false;

    try {
      const dataString = JSON.stringify(event);
      const rawSseMessage = `id: ${event.id}\nevent: ${event.event}\ndata: ${dataString}\n\n`;

      const canContinue = conn.res.write(rawSseMessage);
      conn.lastEventId = event.id;

      // Handle Node.js Stream Backpressure
      if (!canContinue && !conn.isDraining) {
        conn.isDraining = true;

        // If client remains clogged for more than 10 seconds, close socket to prevent OOM
        conn.drainTimeout = setTimeout(() => {
          if (conn.isDraining && conn.status === 'active') {
            console.warn(`[RealtimeHub] Connection ${conn.connectionId} slow client timed out on drain. Terminating.`);
            this.cleanupConnection(conn.connectionId, 'slow_client_backpressure_timeout');
          }
        }, 10000);

        conn.res.once('drain', () => {
          conn.isDraining = false;
          if (conn.drainTimeout) {
            clearTimeout(conn.drainTimeout);
            conn.drainTimeout = null;
          }
        });
      }

      return true;
    } catch (err) {
      this.cleanupConnection(conn.connectionId, 'write_error');
      return false;
    }
  }

  /**
   * Sends heartbeat keep-alive comment to a connection.
   */
  private sendHeartbeat(connectionId: string): void {
    const conn = this.connections.get(connectionId);
    if (!conn || conn.status !== 'active') return;

    try {
      conn.res.write(':keep-alive\n\n');
      conn.lastHeartbeatAt = new Date().toISOString();
    } catch {
      this.cleanupConnection(connectionId, 'heartbeat_write_failed');
    }
  }

  /**
   * Cleans up connection safely, decrementing per-user counters and clearing all timers.
   */
  public cleanupConnection(connectionId: string, reason = 'unknown'): void {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    conn.status = 'closed';

    if (conn.heartbeatTimer) {
      clearInterval(conn.heartbeatTimer);
      conn.heartbeatTimer = null;
    }

    if (conn.drainTimeout) {
      clearTimeout(conn.drainTimeout);
      conn.drainTimeout = null;
    }

    // Decrement user connection count
    const count = this.userConnectionCount.get(conn.userId) || 1;
    if (count <= 1) {
      this.userConnectionCount.delete(conn.userId);
    } else {
      this.userConnectionCount.set(conn.userId, count - 1);
    }

    // Remove from active map
    this.connections.delete(connectionId);

    try {
      if (!conn.res.writableEnded) {
        conn.res.end();
      }
    } catch {}
  }

  /**
   * Closes all active connections and cleans timers.
   */
  public closeAllConnections(reason = 'server_shutdown'): void {
    const shutdownEvent: SseSandboxEvent = {
      id: `evt_shutdown_${Date.now()}`,
      event: 'SANDBOX_SHUTDOWN',
      recordId: 'WO-SANDBOX-SHUTDOWN',
      timestamp: new Date().toISOString(),
      sandbox: true,
      payload: {
        reason,
        message: 'Koneksi SSE sandbox ditutup oleh server.'
      }
    };

    this.connections.forEach(conn => {
      try {
        this.sendEventToConnection(conn, shutdownEvent);
      } catch {}
      this.cleanupConnection(conn.connectionId, reason);
    });

    this.connections.clear();
    this.userConnectionCount.clear();
  }

  /**
   * Status telemetri untuk pemantauan dan pengujian
   */
  public getStatus() {
    return {
      isEnabled: this.isEnabled(),
      isShuttingDown: this.isShuttingDown,
      activeConnectionsCount: this.connections.size,
      bufferLength: this.circularBuffer.length,
      maxBufferCapacity: MAX_SSE_BUFFER_EVENTS,
      maxConnectionsPerUser: MAX_SSE_CONNECTIONS_PER_USER,
      heartbeatIntervalMs: REALTIME_HEARTBEAT_INTERVAL_MS,
      connections: Array.from(this.connections.values()).map(c => ({
        connectionId: c.connectionId,
        userId: c.userId,
        userName: c.userName,
        userRole: c.userRole,
        connectedAt: c.connectedAt,
        lastHeartbeatAt: c.lastHeartbeatAt
      }))
    };
  }

  /**
   * Returns a copy of the circular buffer (for testing and verification)
   */
  public getBuffer(): readonly SseSandboxEvent[] {
    return [...this.circularBuffer];
  }

  /**
   * Clears circular buffer (for testing reset)
   */
  public clearBufferForTesting(): void {
    this.circularBuffer = [];
    this.sequenceCounter = 0;
  }

  /**
   * Graceful process shutdown integration
   */
  private setupProcessHooks(): void {
    const onSignal = (signal: string) => {
      this.isShuttingDown = true;
      this.closeAllConnections(`process_${signal.toLowerCase()}`);
    };

    process.once('SIGTERM', () => onSignal('SIGTERM'));
    process.once('SIGINT', () => onSignal('SIGINT'));
  }
}

export const realtimeSandboxHub = RealtimeSandboxHub.getInstance();
