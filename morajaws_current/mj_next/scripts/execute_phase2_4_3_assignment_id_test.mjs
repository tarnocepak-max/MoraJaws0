import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const adapter = read('server/supabaseAdapter.ts');
const server = read('server.ts');
const context = read('src/context/AppContext.tsx');
const types = read('src/types/index.ts');
const storage = read('server/supabaseStorage.ts');
const dashboard = read('src/components/portals/InstallerDashboardView.tsx');
const portal = read('src/components/portals/InstallerPortal.tsx');
const checks = [];
function check(name, fn) { fn(); checks.push({ name, status: 'PASS' }); }

check('Ticket type includes installerUserId', () => assert.match(types, /installerUserId\?: string;/));
check('WO insert mapping persists installer_user_id', () => assert.match(adapter, /installer_user_id:\s*ticket\.installerUserId\s*\|\|\s*null/));
check('WO read mapping restores installerUserId', () => assert.match(adapter, /installerUserId:\s*row\.installer_user_id\s*\|\|\s*payload\.installerUserId/));
check('Partial update mapping persists installer_user_id', () => assert.match(adapter, /updateRow\.installer_user_id\s*=\s*updates\.installerUserId/));
check('Installer account is looked up by immutable user ID', () => assert.match(adapter, /from\('users'\)[\s\S]{0,180}\.eq\('id',\s*id\)/));
check('Installer role is checked server-side', () => assert.match(adapter, /data\.role[\s\S]{0,80}!==\s*'installer'/));
check('Inactive, archived and deleted accounts are rejected', () => assert.match(adapter, /data\.active\s*!==\s*true\s*\|\|\s*data\.is_archived\s*===\s*true\s*\|\|\s*data\.is_deleted\s*===\s*true/));
check('Leader contractor scope is fail-closed', () => assert.match(adapter, /else if \(expectedName && \(!actualName \|\| expectedName !== actualName\)\)/));
check('Initial assignment requires installerId', () => assert.match(adapter, /if \(!installerId \|\| !String\(installerId\)\.trim\(\)\)/));
check('Reassignment requires new installer ID', () => assert.match(adapter, /const targetInstallerId = String\(options\.newInstallerId \|\| options\.installerId \|\| ''\)\.trim\(\)/));
check('Assignment endpoint requires ID in Supabase mode', () => assert.match(server, /const \{ ticketId, ticketIds, woNumber, installerName, installerId[\s\S]{0,250}isSupabaseMode\(\) && \(!installerId/));
check('Single WO assignment endpoint requires ID in Supabase mode', () => assert.match(server, /const \{ installerName, installerId, slotTime[\s\S]{0,180}isSupabaseMode\(\) && \(!installerId/));
check('Bulk UI sends installerId', () => assert.match(context, /ticketIds,\s*leaderName,\s*installerName,\s*installerId,\s*slotTime/));
check('Single UI assignment sends installerId', () => assert.match(context, /ticketId,\s*leaderName,\s*installerName,\s*installerId/));
check('Reassign UI sends newInstallerId', () => assert.match(context, /newInstallerName,\s*newInstallerId,\s*reason/));
check('Single WO reassign endpoint requires ID in Supabase mode', () => assert.match(server, /const \{ newInstallerName, newInstallerId, reason \}[\s\S]{0,200}isSupabaseMode\(\) && \(!newInstallerId/));
check('Batch reassign endpoint passes newInstallerId to adapter', () => assert.match(server, /newInstallerName: newInstallerName\.trim\(\),\s*newInstallerId,/));
check('Reassign rollback restores previous installer ID', () => assert.match(adapter, /installerUserId: targetTicket\.installerUserId \|\| null/));
check('Assignment history records installer user ID in payload', () => assert.match(adapter, /payload:\s*\{\s*installerUserId:\s*resolvedInstaller\.id\s*\}/));
check('Initial assignment endpoints enforce Leader-only role', () => assert.equal((server.match(/Hanya Leader yang berwenang menugaskan WO kepada Installer/g) || []).length, 2));
check('Reassignment endpoints enforce Leader-only role', () => assert.equal((server.match(/Hanya Leader yang berwenang melakukan reassign Installer/g) || []).length, 2));
check('Backend installer access uses installerUserId only', () => assert.match(server, /const assignedUserId = String\(ticket\.installerUserId \|\| ''\)\.trim\(\);[\s\S]{0,120}assignedUserId === user\.id\.trim\(\)/));
check('Storage access removes installer name and phone authorization', () => assert.match(storage, /const assignedUserId = String\(ticket\.installerUserId \|\| ''\)\.trim\(\);[\s\S]{0,180}assignedUserId === currentUserId/));
check('Installer dashboard filters by user ID', () => assert.match(dashboard, /String\(t\.installerUserId \|\| ''\)\.trim\(\) === myId/));
check('Installer portal filters current installer by user ID', () => assert.match(portal, /String\(t\.installerUserId \|\| ''\)\.trim\(\) === myId/));

const evidence = {
  phase: '2.4.3',
  title: 'Backend Assignment and Installer ID Alignment',
  executedAt: new Date().toISOString(),
  mode: 'STATIC_SOURCE_ACCEPTANCE_ONLY',
  supabaseDeploymentPerformed: false,
  supabaseDataModified: false,
  total: checks.length,
  passed: checks.length,
  failed: 0,
  checks
};
fs.mkdirSync(path.join(root, 'scripts/evidence'), { recursive: true });
fs.writeFileSync(path.join(root, 'scripts/evidence/phase2_4_3_assignment_id_evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
