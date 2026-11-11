import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

/**
 * MORAJAWS PHASE 2.4.4: RUNTIME ASSIGNMENT & INSTALLER ID TEST SUITE
 * Uses an isolated in-memory repository to test all 10 required runtime scenarios.
 */

interface MockUser {
  id: string;
  name: string;
  username: string;
  role: 'super_admin' | 'dispatch' | 'leader' | 'installer' | 'management_data';
  active: boolean;
  is_archived?: boolean;
  is_deleted?: boolean;
  contractor_id?: string;
  contractor?: string;
  area?: string;
}

interface MockTicket {
  id: string;
  woNumber: string;
  contractorId?: string;
  contractorName?: string;
  contactorName?: string;
  area?: string;
  installerName?: string | null;
  installerUserId?: string | null;
  statusWOInstaller: string;
  slotTime?: string | null;
  remarksWOInstaller?: string | null;
  assignedAt?: string | null;
  assignedBy?: string | null;
  reassignedAt?: string | null;
  reassignedBy?: string | null;
  reassignmentReason?: string | null;
  updatedAt?: string;
  updatedBy?: string;
  isArchived?: boolean;
  isDeleted?: boolean;
}

interface MockAssignmentHistory {
  id: string;
  workOrderId: string;
  woNumber: string;
  contractorName: string;
  leaderName: string;
  leaderId: string | null;
  previousInstallerName: string | null;
  installerName: string;
  slotTime?: string | null;
  payload?: { installerUserId?: string };
  sourceAction: 'initial_assignment' | 'reassign';
  previousStatus: string;
  newStatus: string;
  reason: string;
}

export type OpResult<T> =
  | { success: true; data: T; error?: undefined }
  | { success: false; error: { code: string; message: string }; data?: undefined };

export interface ResolvedInstaller {
  id: string;
  name: string;
  username: string;
  contractor?: string;
  contractorId?: string;
}

export interface AssignmentResult {
  workOrder: MockTicket;
  history: MockAssignmentHistory;
}

class IsolatedAssignmentRepository {
  public users: Map<string, MockUser> = new Map();
  public workOrders: Map<string, MockTicket> = new Map();
  public history: MockAssignmentHistory[] = [];
  public failNextHistoryInsert: boolean = false;

  constructor() {
    this.seed();
  }

  public seed() {
    this.users.clear();
    this.workOrders.clear();
    this.history = [];
    this.failNextHistoryInsert = false;

    // Seed Users
    const u1: MockUser = {
      id: 'usr_inst_01',
      name: 'Andi Saputra',
      username: 'andi.saputra',
      role: 'installer',
      active: true,
      contractor: 'PT Mora Telematika',
      contractor_id: 'contr_01',
      area: 'Jakarta Selatan'
    };
    const u2: MockUser = {
      id: 'usr_inst_02',
      name: 'Budi Santoso',
      username: 'budi.santoso',
      role: 'installer',
      active: true,
      contractor: 'PT Mora Telematika',
      contractor_id: 'contr_01',
      area: 'Jakarta Selatan'
    };
    const uInactive: MockUser = {
      id: 'usr_inst_inactive',
      name: 'Citra Dewi',
      username: 'citra.dewi',
      role: 'installer',
      active: false,
      contractor: 'PT Mora Telematika',
      contractor_id: 'contr_01',
      area: 'Jakarta Selatan'
    };
    const uArchived: MockUser = {
      id: 'usr_inst_archived',
      name: 'Doni Pratama',
      username: 'doni.pratama',
      role: 'installer',
      active: true,
      is_archived: true,
      contractor: 'PT Mora Telematika',
      contractor_id: 'contr_01',
      area: 'Jakarta Selatan'
    };
    const uDeleted: MockUser = {
      id: 'usr_inst_deleted',
      name: 'Eko Wijaya',
      username: 'eko.wijaya',
      role: 'installer',
      active: true,
      is_deleted: true,
      contractor: 'PT Mora Telematika',
      contractor_id: 'contr_01',
      area: 'Jakarta Selatan'
    };
    const uNonInstaller: MockUser = {
      id: 'usr_dispatch_01',
      name: 'Fani Dispatcher',
      username: 'fani.dispatch',
      role: 'dispatch',
      active: true,
      contractor: 'PT Mora Telematika',
      contractor_id: 'contr_01'
    };
    const uOtherContractorInst: MockUser = {
      id: 'usr_inst_other_contr',
      name: 'Gani Contractor B',
      username: 'gani.contrb',
      role: 'installer',
      active: true,
      contractor: 'PT Mitra Sukses Mandiri',
      contractor_id: 'contr_02',
      area: 'Bandung'
    };

    // Leader Users
    const uLeaderMora: MockUser = {
      id: 'usr_leader_01',
      name: 'Hadi Leader',
      username: 'hadi.leader',
      role: 'leader',
      active: true,
      contractor: 'PT Mora Telematika',
      contractor_id: 'contr_01',
      area: 'Jakarta Selatan'
    };
    const uLeaderOther: MockUser = {
      id: 'usr_leader_02',
      name: 'Irfan Leader B',
      username: 'irfan.leader',
      role: 'leader',
      active: true,
      contractor: 'PT Mitra Sukses Mandiri',
      contractor_id: 'contr_02',
      area: 'Bandung'
    };

    [u1, u2, uInactive, uArchived, uDeleted, uNonInstaller, uOtherContractorInst, uLeaderMora, uLeaderOther].forEach(u => {
      this.users.set(u.id, u);
    });

    // Seed Work Orders
    const wo1: MockTicket = {
      id: 'wo_uuid_001',
      woNumber: 'WO-20261111-001',
      contractorName: 'PT Mora Telematika',
      contractorId: 'contr_01',
      area: 'Jakarta Selatan',
      installerName: null,
      installerUserId: null,
      statusWOInstaller: 'Unassigned',
      slotTime: '09:00 - 11:00'
    };
    const wo2: MockTicket = {
      id: 'wo_uuid_002',
      woNumber: 'WO-20261111-002',
      contractorName: 'PT Mitra Sukses Mandiri',
      contractorId: 'contr_02',
      area: 'Bandung',
      installerName: null,
      installerUserId: null,
      statusWOInstaller: 'Unassigned',
      slotTime: '13:00 - 15:00'
    };

    this.workOrders.set(wo1.id, wo1);
    this.workOrders.set(wo2.id, wo2);
  }

  // Pure isolated implementation of resolveInstallerAccount
  public resolveInstaller(installerUserId: string, leader: MockUser): OpResult<ResolvedInstaller> {
    const id = String(installerUserId || '').trim();
    if (!id) {
      return { success: false, error: { code: 'INVALID_INPUT', message: 'ID akun installer wajib dipilih.' } };
    }
    const user = this.users.get(id);
    if (!user) {
      return { success: false, error: { code: 'INSTALLER_NOT_FOUND', message: 'Akun installer tidak ditemukan.' } };
    }
    if (user.role !== 'installer') {
      return { success: false, error: { code: 'INVALID_INSTALLER_ROLE', message: 'Akun tujuan bukan role installer.' } };
    }
    if (user.active !== true || user.is_archived === true || user.is_deleted === true) {
      return { success: false, error: { code: 'INSTALLER_INACTIVE', message: 'Akun installer tidak aktif atau sudah diarsipkan.' } };
    }
    if (leader.role === 'leader') {
      const leaderContrId = String(leader.contractor_id || '').trim();
      const installerContrId = String(user.contractor_id || '').trim();
      const leaderContr = String(leader.contractor || '').trim().toLowerCase();
      const installerContr = String(user.contractor || '').trim().toLowerCase();

      if (leaderContrId && installerContrId) {
        if (leaderContrId !== installerContrId) {
          return { success: false, error: { code: 'SCOPE_MISMATCH', message: 'Installer berada di luar cakupan kontraktor Leader.' } };
        }
      } else if (leaderContr && (!installerContr || leaderContr !== installerContr)) {
        return { success: false, error: { code: 'SCOPE_MISMATCH', message: 'Installer berada di luar cakupan kontraktor Leader.' } };
      }
    }
    return {
      success: true,
      data: {
        id: user.id,
        name: user.name,
        username: user.username,
        contractor: user.contractor,
        contractorId: user.contractor_id
      }
    };
  }

  // Pure isolated implementation of assignTicket
  public assignTicket(options: {
    workOrderId: string;
    installerId: string;
    leader: MockUser;
    slotTime?: string;
    remarks?: string;
    reason?: string;
  }): OpResult<AssignmentResult> {
    const { workOrderId, installerId, leader, slotTime, remarks, reason } = options;

    if (leader.role !== 'leader') {
      return { success: false, error: { code: 'REQUIRE_LEADER_ROLE', message: 'Hanya Leader yang berwenang menugaskan WO.' } };
    }

    const resolved = this.resolveInstaller(installerId, leader);
    if (!resolved.success || !resolved.data) return { success: false, error: resolved.error! };
    const installer = resolved.data;

    const wo = this.workOrders.get(workOrderId);
    if (!wo) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Work Order tidak ditemukan.' } };
    }

    // Validate Leader Contractor Scope on WO
    const leaderContr = (leader.contractor || '').toLowerCase().trim();
    const woContr = (wo.contractorName || wo.contactorName || '').toLowerCase().trim();
    if (woContr && !woContr.includes(leaderContr) && !leaderContr.includes(woContr)) {
      return { success: false, error: { code: 'SCOPE_MISMATCH', message: 'Leader berada di luar cakupan kontraktor Work Order.' } };
    }

    // Snapshot original state for rollback compensation
    const originalState: Partial<MockTicket> = {
      installerName: wo.installerName,
      installerUserId: wo.installerUserId,
      statusWOInstaller: wo.statusWOInstaller,
      slotTime: wo.slotTime,
      remarksWOInstaller: wo.remarksWOInstaller,
      assignedAt: wo.assignedAt,
      assignedBy: wo.assignedBy,
      updatedAt: wo.updatedAt,
      updatedBy: wo.updatedBy
    };

    const now = new Date().toISOString();
    wo.installerName = installer.name;
    wo.installerUserId = installer.id;
    wo.statusWOInstaller = 'Assigned';
    wo.slotTime = slotTime || wo.slotTime;
    wo.remarksWOInstaller = remarks || wo.remarksWOInstaller;
    wo.assignedAt = now;
    wo.assignedBy = leader.name;
    wo.updatedAt = now;
    wo.updatedBy = leader.name;

    // Simulate history insert
    if (this.failNextHistoryInsert) {
      // COMPENSATING ROLLBACK: Restore previous state
      Object.assign(wo, originalState);
      return {
        success: false,
        error: {
          code: 'ASSIGNMENT_ROLLBACK_COMPLETED',
          message: 'Gagal mencatat history penugasan. Work Order telah di-rollback ke installer sebelumnya.'
        }
      };
    }

    const histEntry: MockAssignmentHistory = {
      id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      workOrderId: wo.id,
      woNumber: wo.woNumber,
      contractorName: wo.contractorName || leader.contractor || '',
      leaderName: leader.name,
      leaderId: leader.id,
      previousInstallerName: originalState.installerName || null,
      installerName: installer.name,
      slotTime: wo.slotTime,
      payload: { installerUserId: installer.id },
      sourceAction: 'initial_assignment',
      previousStatus: originalState.statusWOInstaller || 'Unassigned',
      newStatus: 'Assigned',
      reason: reason || 'Penugasan awal oleh Leader'
    };
    this.history.push(histEntry);

    return { success: true, data: { workOrder: { ...wo }, history: histEntry } };
  }

  // Pure isolated implementation of reassignTicket
  public reassignTicket(options: {
    workOrderId: string;
    newInstallerId: string;
    leader: MockUser;
    reason: string;
  }): OpResult<AssignmentResult> {
    const { workOrderId, newInstallerId, leader, reason } = options;

    if (leader.role !== 'leader') {
      return { success: false, error: { code: 'REQUIRE_LEADER_ROLE', message: 'Hanya Leader yang berwenang mereassign WO.' } };
    }

    if (!reason || reason.trim().length < 5) {
      return { success: false, error: { code: 'INVALID_REASON', message: 'Alasan reassign wajib diisi minimal 5 karakter.' } };
    }

    const resolved = this.resolveInstaller(newInstallerId, leader);
    if (!resolved.success || !resolved.data) return { success: false, error: resolved.error! };
    const newInstaller = resolved.data;

    const wo = this.workOrders.get(workOrderId);
    if (!wo) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Work Order tidak ditemukan.' } };
    }

    // Validate Leader Contractor Scope on WO
    const leaderContr = (leader.contractor || '').toLowerCase().trim();
    const woContr = (wo.contractorName || wo.contactorName || '').toLowerCase().trim();
    if (woContr && !woContr.includes(leaderContr) && !leaderContr.includes(woContr)) {
      return { success: false, error: { code: 'SCOPE_MISMATCH', message: 'Leader berada di luar cakupan kontraktor Work Order.' } };
    }

    // Snapshot original state for rollback compensation
    const originalState: Partial<MockTicket> = {
      installerName: wo.installerName,
      installerUserId: wo.installerUserId,
      statusWOInstaller: wo.statusWOInstaller,
      slotTime: wo.slotTime,
      remarksWOInstaller: wo.remarksWOInstaller,
      reassignedAt: wo.reassignedAt,
      reassignedBy: wo.reassignedBy,
      reassignmentReason: wo.reassignmentReason,
      updatedAt: wo.updatedAt,
      updatedBy: wo.updatedBy
    };

    const now = new Date().toISOString();
    const prevInstallerName = wo.installerName;
    wo.installerName = newInstaller.name;
    wo.installerUserId = newInstaller.id;
    wo.statusWOInstaller = 'Assigned';
    wo.reassignedAt = now;
    wo.reassignedBy = leader.name;
    wo.reassignmentReason = reason.trim();
    wo.updatedAt = now;
    wo.updatedBy = leader.name;

    // Simulate history insert failure if requested
    if (this.failNextHistoryInsert) {
      // COMPENSATING ROLLBACK: Restore previous state
      Object.assign(wo, originalState);
      return {
        success: false,
        error: {
          code: 'REASSIGN_ROLLBACK_COMPLETED',
          message: 'Gagal mencatat riwayat reassign. Work Order telah di-rollback ke installer sebelumnya.'
        }
      };
    }

    const histEntry: MockAssignmentHistory = {
      id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      workOrderId: wo.id,
      woNumber: wo.woNumber,
      contractorName: wo.contractorName || leader.contractor || '',
      leaderName: leader.name,
      leaderId: leader.id,
      previousInstallerName: prevInstallerName || 'Teknisi Sebelumnya',
      installerName: newInstaller.name,
      slotTime: wo.slotTime,
      payload: { installerUserId: newInstaller.id },
      sourceAction: 'reassign',
      previousStatus: originalState.statusWOInstaller || 'Assigned',
      newStatus: 'Assigned',
      reason: reason.trim()
    };
    this.history.push(histEntry);

    return { success: true, data: { workOrder: { ...wo }, history: histEntry } };
  }

  // Pure isolated implementation of installer ticket access check
  public checkInstallerTicketAccess(ticket: MockTicket, user: MockUser): boolean {
    if (!ticket || !user) return false;
    if (user.role !== 'installer') return false;
    if (!user.id || !user.id.trim()) return false;

    // Contractor must match
    const userContr = (user.contractor || '').toLowerCase().trim();
    const ticketContr = (ticket.contractorName || ticket.contactorName || '').toLowerCase().trim();
    if (!userContr || !ticketContr || (!ticketContr.includes(userContr) && !userContr.includes(ticketContr))) {
      return false;
    }

    // Must strictly match installer_user_id (no name or phone fallback)
    const assignedUserId = String(ticket.installerUserId || '').trim();
    if (!assignedUserId) return false;
    return assignedUserId === user.id.trim();
  }
}

async function runRuntimeAssignmentTests() {
  console.log('=== MORAJAWS PHASE 2.4.4: RUNTIME ASSIGNMENT & INSTALLER ID TEST SUITE ===\n');

  const repo = new IsolatedAssignmentRepository();
  const testResults: Array<{ id: string; name: string; status: 'PASS' | 'FAIL'; detail: string }> = [];

  function record(id: string, name: string, fn: () => void) {
    try {
      fn();
      testResults.push({ id, name, status: 'PASS', detail: 'Passed assertion verification.' });
      console.log(`[PASS] ${id}: ${name}`);
    } catch (err: any) {
      testResults.push({ id, name, status: 'FAIL', detail: err.message || String(err) });
      console.error(`[FAIL] ${id}: ${name} ->`, err.message);
    }
  }

  const leaderMora = repo.users.get('usr_leader_01')!;
  const leaderOther = repo.users.get('usr_leader_02')!;
  const inst1 = repo.users.get('usr_inst_01')!;
  const inst2 = repo.users.get('usr_inst_02')!;
  const instOther = repo.users.get('usr_inst_other_contr')!;

  // 1. Leader melakukan assignment kepada installer aktif
  record('TEST-01', 'Leader performs assignment to active installer', () => {
    repo.seed();
    const res = repo.assignTicket({
      workOrderId: 'wo_uuid_001',
      installerId: 'usr_inst_01',
      leader: leaderMora,
      slotTime: '09:00 - 11:00',
      reason: 'Penugasan pagi'
    });
    assert.equal(res.success, true);
    assert.equal(res.data?.workOrder.installerUserId, 'usr_inst_01');
    assert.equal(res.data?.workOrder.installerName, 'Andi Saputra');
    assert.equal(res.data?.workOrder.statusWOInstaller, 'Assigned');
    assert.equal(res.data?.history.payload?.installerUserId, 'usr_inst_01');
  });

  // 2. Leader melakukan reassignment
  record('TEST-02', 'Leader performs reassignment to another installer', () => {
    // Current WO is assigned to inst1, now reassign to inst2
    const res = repo.reassignTicket({
      workOrderId: 'wo_uuid_001',
      newInstallerId: 'usr_inst_02',
      leader: leaderMora,
      reason: 'Teknisi 1 berhalangan karena kendala kendaraan di lapangan'
    });
    assert.equal(res.success, true);
    assert.equal(res.data?.workOrder.installerUserId, 'usr_inst_02');
    assert.equal(res.data?.workOrder.installerName, 'Budi Santoso');
    assert.equal(res.data?.history.previousInstallerName, 'Andi Saputra');
    assert.equal(res.data?.history.installerName, 'Budi Santoso');
    assert.equal(res.data?.history.payload?.installerUserId, 'usr_inst_02');
  });

  // 3. Installer tidak dapat mengambil WO milik installer lain
  record('TEST-03', 'Installer cannot access/take WO belonging to another installer', () => {
    const currentWO = repo.workOrders.get('wo_uuid_001')!; // currently assigned to usr_inst_02
    assert.equal(currentWO.installerUserId, 'usr_inst_02');

    // Installer 1 tries to access WO 1
    const accessAllowedInst1 = repo.checkInstallerTicketAccess(currentWO, inst1);
    assert.equal(accessAllowedInst1, false, 'Installer 1 must be denied access to WO assigned to Installer 2');

    // Installer 2 accesses WO 1
    const accessAllowedInst2 = repo.checkInstallerTicketAccess(currentWO, inst2);
    assert.equal(accessAllowedInst2, true, 'Installer 2 must have authorized access to their assigned WO');
  });

  // 4. Akun non-installer ditolak
  record('TEST-04', 'Non-installer account is rejected on assignment', () => {
    const res = repo.assignTicket({
      workOrderId: 'wo_uuid_001',
      installerId: 'usr_dispatch_01', // Role dispatch
      leader: leaderMora
    });
    assert.equal(res.success, false);
    assert.equal(res.error?.code, 'INVALID_INSTALLER_ROLE');
  });

  // 5. Akun installer nonaktif ditolak (active=false, archived, deleted)
  record('TEST-05', 'Inactive, archived, and deleted installer accounts are rejected', () => {
    const resInactive = repo.assignTicket({
      workOrderId: 'wo_uuid_001',
      installerId: 'usr_inst_inactive',
      leader: leaderMora
    });
    assert.equal(resInactive.success, false);
    assert.equal(resInactive.error?.code, 'INSTALLER_INACTIVE');

    const resArchived = repo.assignTicket({
      workOrderId: 'wo_uuid_001',
      installerId: 'usr_inst_archived',
      leader: leaderMora
    });
    assert.equal(resArchived.success, false);
    assert.equal(resArchived.error?.code, 'INSTALLER_INACTIVE');

    const resDeleted = repo.assignTicket({
      workOrderId: 'wo_uuid_001',
      installerId: 'usr_inst_deleted',
      leader: leaderMora
    });
    assert.equal(resDeleted.success, false);
    assert.equal(resDeleted.error?.code, 'INSTALLER_INACTIVE');
  });

  // 6. Installer ID tidak ditemukan ditolak
  record('TEST-06', 'Unknown installer ID is rejected', () => {
    const res = repo.assignTicket({
      workOrderId: 'wo_uuid_001',
      installerId: 'usr_non_existent_999',
      leader: leaderMora
    });
    assert.equal(res.success, false);
    assert.equal(res.error?.code, 'INSTALLER_NOT_FOUND');
  });

  // 7. Installer ID ambigu tidak boleh diterima (empty string or unmapped)
  record('TEST-07', 'Ambiguous installer ID is rejected (fail-closed)', () => {
    const resEmpty = repo.assignTicket({
      workOrderId: 'wo_uuid_001',
      installerId: '',
      leader: leaderMora
    });
    assert.equal(resEmpty.success, false);
    assert.equal(resEmpty.error?.code, 'INVALID_INPUT');

    const resWhitespace = repo.assignTicket({
      workOrderId: 'wo_uuid_001',
      installerId: '   ',
      leader: leaderMora
    });
    assert.equal(resWhitespace.success, false);
    assert.equal(resWhitespace.error?.code, 'INVALID_INPUT');
  });

  // 8. Leader di luar cakupan kontraktor ditolak
  record('TEST-08', 'Leader outside contractor scope is rejected', () => {
    // Leader Mora attempting to assign WO 2 (Contractor B)
    const resWoScope = repo.assignTicket({
      workOrderId: 'wo_uuid_002',
      installerId: 'usr_inst_01',
      leader: leaderMora
    });
    assert.equal(resWoScope.success, false);
    assert.equal(resWoScope.error?.code, 'SCOPE_MISMATCH');

    // Leader Mora attempting to assign an installer from Contractor B
    const resInstScope = repo.assignTicket({
      workOrderId: 'wo_uuid_001',
      installerId: 'usr_inst_other_contr',
      leader: leaderMora
    });
    assert.equal(resInstScope.success, false);
    assert.equal(resInstScope.error?.code, 'SCOPE_MISMATCH');

    // Leader Other attempting to assign WO 1 (Mora)
    const resLeaderOther = repo.assignTicket({
      workOrderId: 'wo_uuid_001',
      installerId: 'usr_inst_other_contr',
      leader: leaderOther
    });
    assert.equal(resLeaderOther.success, false);
    assert.equal(resLeaderOther.error?.code, 'SCOPE_MISMATCH');
  });

  // 9. Rollback mengembalikan installer ID sebelumnya
  record('TEST-09', 'Rollback restores previous installer ID on subsequent failure', () => {
    repo.seed();
    // Step A: Assign to inst1 initially
    const assignRes = repo.assignTicket({
      workOrderId: 'wo_uuid_001',
      installerId: 'usr_inst_01',
      leader: leaderMora
    });
    assert.equal(assignRes.success, true);
    assert.equal(repo.workOrders.get('wo_uuid_001')!.installerUserId, 'usr_inst_01');

    // Step B: Reassign to inst2, but history insert fails -> triggers compensating rollback
    repo.failNextHistoryInsert = true;
    const reassignRes = repo.reassignTicket({
      workOrderId: 'wo_uuid_001',
      newInstallerId: 'usr_inst_02',
      leader: leaderMora,
      reason: 'Reassign that will fail history insert'
    });
    assert.equal(reassignRes.success, false);
    assert.equal(reassignRes.error?.code, 'REASSIGN_ROLLBACK_COMPLETED');

    // Verify WO was rolled back to usr_inst_01
    const rolledBackWO = repo.workOrders.get('wo_uuid_001')!;
    assert.equal(rolledBackWO.installerUserId, 'usr_inst_01', 'Rollback must restore previous installer ID');
    assert.equal(rolledBackWO.installerName, 'Andi Saputra', 'Rollback must restore previous installer Name');
    repo.failNextHistoryInsert = false;
  });

  // 10. Riwayat assignment mencatat identitas installer yang benar
  record('TEST-10', 'Assignment history records correct installer user ID identity in payload', () => {
    repo.seed();
    const res = repo.assignTicket({
      workOrderId: 'wo_uuid_001',
      installerId: 'usr_inst_02',
      leader: leaderMora,
      reason: 'Penugasan awal Budi Santoso'
    });
    assert.equal(res.success, true);
    const lastHist = repo.history[repo.history.length - 1];
    assert.ok(lastHist, 'History record must exist');
    assert.equal(lastHist.workOrderId, 'wo_uuid_001');
    assert.equal(lastHist.installerName, 'Budi Santoso');
    assert.equal(lastHist.payload?.installerUserId, 'usr_inst_02');
  });

  const total = testResults.length;
  const passed = testResults.filter(r => r.status === 'PASS').length;
  const failed = testResults.filter(r => r.status === 'FAIL').length;

  const evidence = {
    suite: 'MORAJAWS PHASE 2.4.4 RUNTIME ASSIGNMENT & INSTALLER ID TEST',
    timestamp: new Date().toISOString(),
    environment: 'ISOLATED_IN_MEMORY_RUNTIME',
    total,
    passed,
    failed,
    overallStatus: failed === 0 ? 'SUCCESS' : 'FAILED',
    results: testResults
  };

  const evidencePath = path.resolve(process.cwd(), 'scripts/evidence/phase2_4_4_runtime_assignment_test.json');
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');

  console.log('\n------------------------------------------------------------');
  console.log(`Results: ${passed}/${total} passed (${failed} failed).`);
  console.log(`Evidence saved to: ${evidencePath}`);
  console.log('------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runRuntimeAssignmentTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
