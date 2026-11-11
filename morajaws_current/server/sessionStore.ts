// ==============================================================================
// MORAJAWS SESSION STORE MODULE (Phase 15A.7.6.2)
// Provides a unified session store abstraction for Express Backend.
// Evaluates deployment architecture: Single-instance (Memory) vs Multi-instance (Shared/Redis).
// Strictly fails closed if external shared storage is required but unconfigured.
// No credentials in source code. No fabricated active state.
// ==============================================================================

export interface ServerSession {
  sessionId: string;
  token: string;
  refreshToken?: string;
  userId: string;
  username: string;
  name: string;
  role: 'super_admin' | 'dispatch' | 'leader' | 'installer' | 'management_data' | 'it_support';
  contractor?: string;
  contractorId?: string;
  area?: string;
  sessionVersion?: number;
  loginAt: string;
  lastActivityAt: string;
  expiresAt: string;
  status: 'active' | 'expired' | 'revoked';
  ipAddress?: string;
  userAgent?: string;
  deviceType?: 'desktop' | 'mobile' | 'tablet' | 'unknown';
}

export interface FindSessionOptions {
  allowInactive?: boolean;
}

export interface ISessionStore {
  getStoreType(): 'memory' | 'redis';
  isSharedStore(): boolean;
  findSession(tokenOrSessionId: string, options?: FindSessionOptions): Promise<ServerSession | undefined>;
  addSession(session: ServerSession): Promise<void>;
  updateSession(sessionId: string, updates: Partial<ServerSession>): Promise<boolean>;
  revokeSession(tokenOrSessionId: string): Promise<boolean>;
  revokeUserSessions(userId: string, exceptSessionId?: string): Promise<number>;
  getActiveSessionsForUser(userId: string): Promise<ServerSession[]>;
  getAllSessions(): ServerSession[];
  cleanupExpired(): Promise<number>;
  loadSessions?(sessions: ServerSession[]): void;
}

// Global flag for simulating store failure during resilience tests
let simulateStoreFailureFlag = false;

export function setSimulateStoreFailure(shouldFail: boolean) {
  simulateStoreFailureFlag = shouldFail;
}

export function isSimulateStoreFailure(): boolean {
  return simulateStoreFailureFlag;
}

/**
 * In-Memory Session Store with Array reference binding for backwards compatibility
 * Designed for single-instance Cloud Run or Development / Staging execution.
 * Enforces TTL check and status check on every session lookup.
 */
export class MemorySessionStore implements ISessionStore {
  private sessions: ServerSession[];
  private revokedTokens: Set<string> = new Set();

  constructor(sessionArray: ServerSession[]) {
    this.sessions = sessionArray;
  }

  getStoreType(): 'memory' {
    return 'memory';
  }

  isSharedStore(): boolean {
    return false;
  }

  private assertHealthy() {
    if (simulateStoreFailureFlag) {
      throw new Error('SESSION_STORE_UNAVAILABLE: Simulasi kegagalan penyimpanan session aktif.');
    }
  }

  async findSession(tokenOrSessionId: string, options?: FindSessionOptions): Promise<ServerSession | undefined> {
    this.assertHealthy();
    if (!tokenOrSessionId) return undefined;

    const session = this.sessions.find(
      s => s.sessionId === tokenOrSessionId || s.token === tokenOrSessionId
    );

    if (!session) return undefined;

    // Check expiration on every find operation
    const now = Date.now();
    if (session.status === 'active' && new Date(session.expiresAt).getTime() < now) {
      session.status = 'expired';
    }

    if (!options?.allowInactive && session.status !== 'active') {
      return undefined;
    }

    return session;
  }

  async addSession(session: ServerSession): Promise<void> {
    this.assertHealthy();
    // Remove any duplicate entry with identical sessionId or token before adding
    const existingIdx = this.sessions.findIndex(
      s => s.sessionId === session.sessionId || s.token === session.token
    );
    if (existingIdx !== -1) {
      this.sessions.splice(existingIdx, 1);
    }
    this.sessions.unshift(session);
  }

  async updateSession(sessionId: string, updates: Partial<ServerSession>): Promise<boolean> {
    this.assertHealthy();
    const session = this.sessions.find(s => s.sessionId === sessionId || s.token === sessionId);
    if (!session) return false;
    Object.assign(session, updates);
    return true;
  }

  async revokeSession(tokenOrSessionId: string): Promise<boolean> {
    this.assertHealthy();
    if (!tokenOrSessionId) return false;
    const session = this.sessions.find(
      s => s.sessionId === tokenOrSessionId || s.token === tokenOrSessionId
    );
    if (session) {
      session.status = 'revoked';
      if (session.token) this.revokedTokens.add(session.token);
      if (session.refreshToken) {
        this.revokedTokens.add(session.refreshToken);
        session.refreshToken = undefined; // Disallow reuse
      }
      return true;
    }
    return false;
  }

  async revokeUserSessions(userId: string, exceptSessionId?: string): Promise<number> {
    this.assertHealthy();
    let count = 0;
    for (const s of this.sessions) {
      if (s.userId === userId && s.status === 'active') {
        if (!exceptSessionId || s.sessionId !== exceptSessionId) {
          s.status = 'revoked';
          if (s.token) this.revokedTokens.add(s.token);
          if (s.refreshToken) {
            this.revokedTokens.add(s.refreshToken);
            s.refreshToken = undefined;
          }
          count++;
        }
      }
    }
    return count;
  }

  async getActiveSessionsForUser(userId: string): Promise<ServerSession[]> {
    this.assertHealthy();
    const now = Date.now();
    return this.sessions.filter(s => {
      if (s.userId !== userId) return false;
      if (s.status === 'active' && new Date(s.expiresAt).getTime() < now) {
        s.status = 'expired';
        return false;
      }
      return s.status === 'active';
    });
  }

  getAllSessions(): ServerSession[] {
    this.assertHealthy();
    return this.sessions;
  }

  loadSessions(sessions: ServerSession[]): void {
    this.assertHealthy();
    this.sessions.length = 0;
    this.sessions.push(...sessions);
  }

  async cleanupExpired(): Promise<number> {
    this.assertHealthy();
    const now = Date.now();
    let expiredCount = 0;
    for (const s of this.sessions) {
      if (s.status === 'active' && new Date(s.expiresAt).getTime() < now) {
        s.status = 'expired';
        expiredCount++;
      }
    }
    return expiredCount;
  }
}

/**
 * Shared Redis Session Store Adapter Stub
 * Fails closed unconditionally. Strictly adheres to Phase 15A.7.6.2 security rules:
 * - Does not claim multi-instance support before real runtime implementation with network Redis.
 * - Does not claim shared storage available merely because REDIS_URL env var exists.
 * - Multi-instance cluster: NOT SUPPORTED.
 */
export class RedisSessionStoreStub implements ISessionStore {
  getStoreType(): 'redis' {
    return 'redis';
  }

  isSharedStore(): boolean {
    return false; // Stub is NOT a functional shared store
  }

  async findSession(_tokenOrSessionId: string): Promise<ServerSession | undefined> {
    throw new Error('REDIS_UNAVAILABLE: Shared Redis session storage is not configured or implemented on this host.');
  }

  async addSession(_session: ServerSession): Promise<void> {
    throw new Error('REDIS_UNAVAILABLE: Shared Redis session storage is not configured or implemented on this host.');
  }

  async updateSession(_sessionId: string, _updates: Partial<ServerSession>): Promise<boolean> {
    throw new Error('REDIS_UNAVAILABLE: Shared Redis session storage is not configured or implemented on this host.');
  }

  async revokeSession(_tokenOrSessionId: string): Promise<boolean> {
    throw new Error('REDIS_UNAVAILABLE: Shared Redis session storage is not configured or implemented on this host.');
  }

  async revokeUserSessions(_userId: string): Promise<number> {
    throw new Error('REDIS_UNAVAILABLE: Shared Redis session storage is not configured or implemented on this host.');
  }

  async getActiveSessionsForUser(_userId: string): Promise<ServerSession[]> {
    throw new Error('REDIS_UNAVAILABLE: Shared Redis session storage is not configured or implemented on this host.');
  }

  getAllSessions(): ServerSession[] {
    return [];
  }

  async cleanupExpired(): Promise<number> {
    return 0;
  }
}

/**
 * Evaluates session storage architecture and returns current status and audit summary.
 * Per Phase 15A.7.6.2: Single-instance MemorySessionStore is active. Multi-instance: NOT SUPPORTED.
 * Redis is not claimed active when it is only a stub.
 */
export function auditSessionStorageArchitecture(): {
  storeType: 'memory' | 'redis';
  multiInstanceSupported: boolean;
  sharedStorageAvailable: boolean;
  limitationNote: string;
} {
  return {
    storeType: 'memory',
    multiInstanceSupported: false,
    sharedStorageAvailable: false,
    limitationNote: 'Single-instance in-memory session store aktif (MemorySessionStore). Multi-instance cluster: NOT SUPPORTED (infrastruktur client Redis belum diimplementasikan).'
  };
}

// Single authoritative in-memory buffer and singleton session store instance
export const SERVER_SESSIONS_BUFFER: ServerSession[] = [];
export const sessionStore: MemorySessionStore = new MemorySessionStore(SERVER_SESSIONS_BUFFER);
