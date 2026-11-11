import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const server = read('server.ts');
const context = read('src/context/AppContext.tsx');
const userView = read('src/components/users/UserManagementView.tsx');
const authService = read('src/services/authService.ts');
const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, status: 'PASS' }); }
  catch (error) { checks.push({ name, status: 'FAIL', error: String(error?.message || error) }); }
}
function routeBlock(start, end) {
  const a = server.indexOf(start);
  assert.notEqual(a, -1, `route not found: ${start}`);
  const b = server.indexOf(end, a + start.length);
  return server.slice(a, b === -1 ? server.length : b);
}

check('Legacy sync-profile endpoint requires authentication and blocks Superadmin Installer changes', () => {
  const b = routeBlock("app.post('/api/users/sync-profile'", "app.get('/api/users'");
  assert.match(b, /requireAuth/);
  assert.match(b, /SUPERADMIN_INSTALLER_PROFILE_EDIT_FORBIDDEN/);
});
check('Generic session revoke endpoint blocks Superadmin from Installer sessions', () => {
  const b = routeBlock("app.post('/api/sessions/revoke'", "app.get('/api/sessions/config'");
  assert.match(b, /async \(req: AuthenticatedRequest/);
  assert.match(b, /SUPERADMIN_INSTALLER_SESSION_REVOCATION_FORBIDDEN/);
});
check('POST /api/users blocks Superadmin Installer creation', () => {
  const b = routeBlock("app.post('/api/users',", "app.put('/api/users/:id'");
  assert.match(b, /role === 'installer' && req\.user!\.role !== 'leader'/);
  assert.match(b, /LEADER_ONLY_INSTALLER_CREATION/);
});
check('POST /api/users permits Leader-only Installer creation', () => {
  const b = routeBlock("app.post('/api/users',", "app.put('/api/users/:id'");
  assert.match(b, /req\.user!\.role === 'leader' && role !== 'installer'/);
});
check('Leader contractor scope is fail-closed', () => {
  const b = routeBlock("app.post('/api/users',", "app.put('/api/users/:id'");
  assert.match(b, /LEADER_CONTRACTOR_SCOPE_MISSING/);
  assert.match(b, /String\(req\.user!\.contractor \|\| ''\)\.trim\(\)/);
  assert.match(b, /String\(req\.user!\.area \|\| ''\)\.trim\(\)/);
});
check('Leader cannot override contractor using request body', () => {
  const b = routeBlock("app.post('/api/users',", "app.put('/api/users/:id'");
  assert.match(b, /req\.user!\.role === 'leader' \? String\(req\.user!\.contractor \|\| ''\)\.trim\(\) : contractor/);
});
check('Superadmin cannot edit Installer through /api/users/:id', () => {
  const b = routeBlock("app.put('/api/users/:id'", "app.post('/api/users/:id/toggle'");
  assert.match(b, /SUPERADMIN_INSTALLER_PROFILE_EDIT_FORBIDDEN/);
});
check('Superadmin cannot toggle Installer through legacy user endpoint', () => {
  const b = routeBlock("app.post('/api/users/:id/toggle'", "app.post('/api/users/:id/reset-password'");
  assert.match(b, /SUPERADMIN_INSTALLER_STATUS_FORBIDDEN/);
});
check('Superadmin cannot delete Installer through legacy user endpoint', () => {
  const b = routeBlock("app.delete('/api/users/:id'", "\/\/ --- Session Management Endpoints");
  assert.match(b, /SUPERADMIN_INSTALLER_DELETE_FORBIDDEN/);
});
check('Superadmin cannot create Installer through /api/admin/users', () => {
  const b = routeBlock("app.post('/api/admin/users'", "app.get('/api/admin/users'");
  assert.match(b, /SUPERADMIN_INSTALLER_CREATION_FORBIDDEN/);
});
check('Superadmin cannot edit Installer through /api/admin/users/:id', () => {
  const b = routeBlock("app.put('/api/admin/users/:id'", "app.patch('/api/admin/users/:id/status'");
  assert.match(b, /SUPERADMIN_INSTALLER_PROFILE_EDIT_FORBIDDEN/);
});
check('Superadmin cannot change Installer status through admin endpoint', () => {
  const b = routeBlock("app.patch('/api/admin/users/:id/status'", "app.post('/api/admin/users/:id/revoke-sessions'");
  assert.match(b, /SUPERADMIN_INSTALLER_STATUS_FORBIDDEN/);
});
check('Superadmin cannot separately revoke Installer sessions', () => {
  const b = routeBlock("app.post('/api/admin/users/:id/revoke-sessions'", "app.get('/api/auth/me'");
  assert.match(b, /SUPERADMIN_INSTALLER_SESSION_REVOCATION_FORBIDDEN/);
});
check('Superadmin cannot create Installer through /api/supabase/users', () => {
  const b = routeBlock("app.post('/api/supabase/users'", "app.patch('/api/supabase/users/:id'");
  assert.match(b, /INSTALLER_CREATION_AUTHORITY_VIOLATION/);
});
check('Superadmin cannot edit Installer through /api/supabase/users/:id', () => {
  const b = routeBlock("app.patch('/api/supabase/users/:id'", "app.delete('/api/supabase/users/:id'");
  assert.match(b, /SUPERADMIN_INSTALLER_PROFILE_EDIT_FORBIDDEN/);
});
check('Superadmin cannot delete Installer through /api/supabase/users/:id', () => {
  const b = routeBlock("app.delete('/api/supabase/users/:id'", "app.post('/api/supabase/users/:id/reset-password'");
  assert.match(b, /SUPERADMIN_INSTALLER_DELETE_FORBIDDEN/);
});
check('Superadmin reset password endpoint remains available', () => {
  assert.match(server, /app\.post\('\/api\/auth\/admin\/reset-password', requireSuperAdmin/);
  assert.match(server, /hashPasswordWithBcrypt\(newPassword\)/);
  assert.match(server, /revokeAllUserSessions\(targetUser\.id, req\.user!\.id\)/);
});
check('Installer registration in AppContext is Leader-only', () => {
  const b = context.slice(context.indexOf('const registerInstallerAccount'), context.indexOf('const toggleUserStatus'));
  assert.match(b, /currentUser\.role !== 'leader'/);
  assert.doesNotMatch(b, /currentUser\.role !== 'leader' && currentUser\.role !== 'super_admin'/);
});
check('Installer registration requires Leader contractor scope', () => {
  const b = context.slice(context.indexOf('const registerInstallerAccount'), context.indexOf('const toggleUserStatus'));
  assert.match(b, /LEADER|kontraktor/i);
  assert.match(b, /String\(currentUser\.contractor \|\| ''\)\.trim\(\)/);
  assert.doesNotMatch(b, /PT Mitra Jaringan Solusi/);
});
check('AppContext blocks Superadmin editing Installer', () => {
  assert.match(context, /currentUser\.role === 'super_admin' && \(targetUser\.role === 'installer' \|\| updates\.role === 'installer'\)/);
});
check('AppContext blocks Superadmin deleting Installer', () => {
  const b = context.slice(context.indexOf('const deleteUser'), context.indexOf('const updateUser'));
  assert.match(b, /target\.role === 'installer'/);
});
check('AppContext blocks Superadmin changing Installer status', () => {
  const b = context.slice(context.indexOf('const toggleUserStatus'), context.indexOf('const resetUserPassword'));
  assert.match(b, /targetUser\?\.role === 'installer'/);
});
check('Superadmin UI does not offer Installer role in create dropdown', () => {
  const createForm = userView.slice(userView.indexOf('value={createRole}'), userView.indexOf('{/* Contractor & Area fields'));
  assert.doesNotMatch(createForm, /<option value="installer">/);
});
check('Superadmin UI does not offer Installer role in edit dropdown', () => {
  const editForm = userView.slice(userView.indexOf('value={editRole}'), userView.indexOf('value={editContractor}'));
  assert.doesNotMatch(editForm, /<option value="installer">/);
});
check('Superadmin UI hides Installer edit controls', () => {
  assert.match(userView, /u\.role !== 'installer' && \(/);
  assert.match(userView, /Superadmin hanya dapat mereset password akun Installer/);
});
check('Superadmin UI keeps Installer password reset control', () => {
  assert.match(userView, /handleOpenResetModal\(u\)/);
});
check('User management service create endpoint remains server-routed', () => {
  assert.match(authService, /fetch\('\/api\/admin\/users'/);
});

const failed = checks.filter(x => x.status === 'FAIL');
const evidence = {
  phase: '2.4.5',
  title: 'Installer Account Authority & RBAC Hardening',
  executionType: 'static_source_assertions',
  databaseExecutionPerformed: false,
  supabaseDeploymentPerformed: false,
  total: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
  generatedAt: new Date().toISOString()
};
fs.mkdirSync(path.join(root, 'scripts/evidence'), { recursive: true });
fs.writeFileSync(path.join(root, 'scripts/evidence/phase2_4_5_rbac_test.json'), JSON.stringify(evidence, null, 2) + '\n');
for (const item of checks) console.log(`${item.status.padEnd(4)} ${item.name}${item.error ? ` — ${item.error}` : ''}`);
console.log(`\nPHASE 2.4.5 STATIC RBAC: ${evidence.passed}/${evidence.total} PASS; ${evidence.failed} FAIL`);
if (failed.length) process.exitCode = 1;
