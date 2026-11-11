import type { SandboxOutboxRow } from './sandboxOutbox.ts';

// ==============================================================================
// MORAJAWS PHASE 9F: ISOLATED SERVER-SIDE ACCESS CONTROL & SCOPING MODULE
// Enforces:
// 1. Firebase UID as primary identity for Installer (no phone-only matching)
// 2. Strict multi-tenant contractor and area isolation for Leader
// 3. Dynamic mid-stream session eviction and account revocation
// 4. Sanitized minimal delta payloads on reassignment / deletion
// ==============================================================================

export interface SandboxUserSession {
  uid: string; // Firebase UID
  name: string;
  role: 'super_admin' | 'dispatch' | 'management_data' | 'leader' | 'installer' | 'it_support';
  active: boolean;
  contractorId?: string;
  contractorName?: string;
  areaName?: string;
  phone?: string;
  lastVerifiedAt: string;
}

export interface AccessEvaluationResult {
  isPermitted: boolean;
  sanitizedPayload: Record<string, any> | null;
  denialReason?: string;
  isEvictionTriggered?: boolean;
}

export class SandboxAccessController {
  private static instance: SandboxAccessController;

  public static getInstance(): SandboxAccessController {
    if (!SandboxAccessController.instance) {
      SandboxAccessController.instance = new SandboxAccessController();
    }
    return SandboxAccessController.instance;
  }

  /**
   * Evaluates if a given event can be sent to a specific user connection.
   * Strips sensitive data if event is a revocation / unassign notice.
   */
  public evaluateEventForUser(user: SandboxUserSession, event: SandboxOutboxRow): AccessEvaluationResult {
    // Check 1: Active status guard (Immediate eviction if deactivated)
    if (!user.active) {
      return {
        isPermitted: false,
        sanitizedPayload: null,
        denialReason: 'Akun dinonaktifkan.',
        isEvictionTriggered: true
      };
    }

    // Check 2: Global roles (Super Admin, Dispatch, Management Data)
    if (user.role === 'super_admin' || user.role === 'dispatch' || user.role === 'management_data') {
      return {
        isPermitted: true,
        sanitizedPayload: {
          aggregateId: event.aggregate_id,
          eventType: event.event_type,
          ...event.payload
        }
      };
    }

    // Check 3: Leader Scope (Strict Contractor ID & Area matching)
    if (user.role === 'leader') {
      if (!user.contractorId) {
        return { isPermitted: false, sanitizedPayload: null, denialReason: 'Leader tidak memiliki afiliasi kontraktor.' };
      }

      const matchContractor = event.contractor_id === user.contractorId;
      const matchArea = !user.areaName || !event.area_name || event.area_name === user.areaName;

      if (!matchContractor || !matchArea) {
        return {
          isPermitted: false,
          sanitizedPayload: null,
          denialReason: 'Event berada di luar cakupan kontraktor atau area Leader.'
        };
      }

      // Leader receives full operational payload
      return {
        isPermitted: true,
        sanitizedPayload: {
          aggregateId: event.aggregate_id,
          eventType: event.event_type,
          ...event.payload
        }
      };
    }

    // Check 4: Installer Scope (Strict Firebase UID matching - NEVER phone alone)
    if (user.role === 'installer') {
      const matchInstallerUid = event.assigned_installer_id === user.uid;

      if (!matchInstallerUid) {
        return {
          isPermitted: false,
          sanitizedPayload: null,
          denialReason: 'Tiket tidak ditugaskan kepada Firebase UID teknisi ini.'
        };
      }

      // Installer receives assigned ticket payload
      return {
        isPermitted: true,
        sanitizedPayload: {
          aggregateId: event.aggregate_id,
          eventType: event.event_type,
          ...event.payload
        }
      };
    }

    return {
      isPermitted: false,
      sanitizedPayload: null,
      denialReason: 'Peran pengguna tidak dikenali atau tidak memiliki hak akses.'
    };
  }

  /**
   * Generates sanitized minimal payload for reassignment or deletion notices
   * to ensure no customer PII leaks to previously assigned staff
   */
  public generateMinimalRevocationEvent(
    aggregateId: string,
    reason: 'reassigned_to_another_contractor' | 'deleted_by_management' | 'access_revoked'
  ): {
    aggregate_id: string;
    event_type: 'TICKET_UNASSIGNED' | 'TICKET_ACCESS_REVOKED';
    payload: { woNumber: string; reason: string; revokedAt: string };
  } {
    return {
      aggregate_id: aggregateId,
      event_type: 'TICKET_UNASSIGNED',
      payload: {
        woNumber: aggregateId,
        reason:
          reason === 'deleted_by_management'
            ? 'Tiket telah dihapus oleh Management Data.'
            : reason === 'reassigned_to_another_contractor'
            ? 'Tiket dialihkan ke penugasan lain.'
            : 'Akses terhadap tiket telah dicabut.',
        revokedAt: new Date().toISOString()
      }
    };
  }
}

export const sandboxAccessController = SandboxAccessController.getInstance();
