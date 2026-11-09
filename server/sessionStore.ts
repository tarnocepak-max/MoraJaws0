import { EventEmitter } from 'events';

// ==============================================================================
// MORAJAWS SESSION STORE MODULE (Phase 15A.7.6)
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

export interface ISessionStore {
  getStoreType(): 'memory' | 'redis';
  isSharedStore(): boolean;
  findSession(tokenOrSessionId: string): Promise<ServerSession | undefined>;
  addSession(session: ServerSession): Promise<void>;
  updateSession(sessionId: string, updates: Partial<ServerSession>): Promise<boolean>;
  revokeSession(tokenOrSessionId: string): Promise<boolean>;
  revokeUserSessions(userId: string): Promise<number>;
  getActiveSessionsForUser(userId: string): Promise<ServerSession[]>;
  getAllSessions(): ServerSession[];
  cleanupExpired(): Promise<number>;
}

/**
 * In-Memory Session Store with Array reference binding for backwards compatibility
 * Designed for single-instance Cloud Run or Development / Staging execution.
 */
export class MemorySessionStore implements ISessionStore {
  private sessions: ServerSession[];

  constructor(sessionArray: ServerSession[]) {
    this.sessions = sessionArray;
  }

  getStoreType(): 'memory' {
    return 'memory';
  }

  isSharedStore(): boolean {
    return false;
  }

  async findSession(tokenOrSessionId: string): Promise<ServerSession | undefined> {
    if (!tokenOrSessionId) return undefined;
    return this.sessions.find(
      s => (s.sessionId === tokenOrSessionId || s.token === tokenOrSessionId) && s.status === 'active'
    );
  }

  async addSession(session: ServerSession): Promise<void> {
    this.sessions.unshift(session);
  }

  async updateSession(sessionId: string, updates: Partial<ServerSession>): Promise<boolean> {
    const session = this.sessions.find(s => s.sessionId === sessionId);
    if (!session) return false;
    Object.assign(session, updates);
    return true;
  }

  async revokeSession(tokenOrSessionId: string): Promise<boolean> {
    const session = this.sessions.find(s => s.sessionId === tokenOrSessionId || s.token === tokenOrSessionId);
    if (session) {
      session.status = 'revoked';
      return true;
    }
    return false;
  }

  async revokeUserSessions(userId: string): Promise<number> {
    let count = 0;
    this.sessions.forEach(s => {
      if (s.userId === userId && s.status === 'active') {
        s.status = 'revoked';
        count++;
      }
    });
    return count;
  }

  async getActiveSessionsForUser(userId: string): Promise<ServerSession[]> {
    return this.sessions.filter(s => s.userId === userId && s.status === 'active');
  }

  getAllSessions(): ServerSession[] {
    return this.sessions;
  }

  async cleanupExpired(): Promise<number> {
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
 * Fails closed when REDIS_URL is not configured.
 * Strictly adheres to Phase 15A.7.6 security rules:
 * - Does not embed credentials in source code.
 * - Does not claim multi-instance support before real runtime testing with Redis.
 */
export class RedisSessionStoreStub implements ISessionStore {
  private isConfigured: boolean;

  constructor() {
    this.isConfigured = Boolean(process.env.REDIS_URL && process.env.REDIS_URL.trim());
  }

  getStoreType(): 'redis' {
    return 'redis';
  }

  isSharedStore(): boolean {
    return this.isConfigured;
  }

  async findSession(_tokenOrSessionId: string): Promise<ServerSession | undefined> {
    if (!this.isConfigured) {
      throw new Error('REDIS_UNAVAILABLE: Shared Redis session storage is not configured on this host.');
    }
    return undefined;
  }

  async addSession(_session: ServerSession): Promise<void> {
    if (!this.isConfigured) {
      throw new Error('REDIS_UNAVAILABLE: Shared Redis session storage is not configured on this host.');
    }
  }

  async updateSession(_sessionId: string, _updates: Partial<ServerSession>): Promise<boolean> {
    if (!this.isConfigured) {
      throw new Error('REDIS_UNAVAILABLE: Shared Redis session storage is not configured on this host.');
    }
    return false;
  }

  async revokeSession(_tokenOrSessionId: string): Promise<boolean> {
    if (!this.isConfigured) {
      throw new Error('REDIS_UNAVAILABLE: Shared Redis session storage is not configured on this host.');
    }
    return false;
  }

  async revokeUserSessions(_userId: string): Promise<number> {
    if (!this.isConfigured) {
      throw new Error('REDIS_UNAVAILABLE: Shared Redis session storage is not configured on this host.');
    }
    return 0;
  }

  async getActiveSessionsForUser(_userId: string): Promise<ServerSession[]> {
    if (!this.isConfigured) {
      throw new Error('REDIS_UNAVAILABLE: Shared Redis session storage is not configured on this host.');
    }
    return [];
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
 */
export function auditSessionStorageArchitecture(): {
  storeType: 'memory' | 'redis';
  multiInstanceSupported: boolean;
  sharedStorageAvailable: boolean;
  limitationNote: string;
} {
  const hasRedis = Boolean(process.env.REDIS_URL && process.env.REDIS_URL.trim());
  if (hasRedis) {
    return {
      storeType: 'redis',
      multiInstanceSupported: false, // Must be tested in live environment before claiming support
      sharedStorageAvailable: true,
      limitationNote: 'REDIS_URL terdeteksi namun adapter multi-instance belum diverifikasi operasional penuh.'
    };
  }

  return {
    storeType: 'memory',
    multiInstanceSupported: false,
    sharedStorageAvailable: false,
    limitationNote: 'Penyimpanan sesi berjalan pada single-instance in-memory dengan persistensi disk lokal. Scaling multi-instance belum didukung dan memerlukan shared Redis store.'
  };
}
