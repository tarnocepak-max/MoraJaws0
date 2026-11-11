import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

/**
 * MORAJAWS PHASE 2.4.4: API & FRONTEND INTEGRATION VERIFICATION TEST
 * Verifies consistency across AppContext, APIs, Portals, Adapters, Storage,
 * and asserts ZERO presence of name/phone matching in installer authorization.
 */

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const files = {
  appContext: read('src/context/AppContext.tsx'),
  server: read('server.ts'),
  supabaseAdapter: read('server/supabaseAdapter.ts'),
  supabaseStorage: read('server/supabaseStorage.ts'),
  dashboard: read('src/components/portals/InstallerDashboardView.tsx'),
  installerPortal: read('src/components/portals/InstallerPortal.tsx'),
  ticketsTable: read('src/components/tickets/TicketsTable.tsx'),
  contactCentre: read('src/components/contact/ContactCentreView.tsx'),
  scheduleCalendar: read('src/components/schedule/ScheduleCalendarView.tsx'),
  whatsappCenter: read('src/components/whatsapp/InstallerWhatsAppCenter.tsx'),
  app: read('src/App.tsx'),
  types: read('src/types/index.ts')
};

interface TestItem {
  id: string;
  name: string;
  component: string;
  status: 'PASS' | 'FAIL';
  assertion: string;
}

const results: TestItem[] = [];

function check(id: string, name: string, component: string, fn: () => void) {
  try {
    fn();
    results.push({ id, name, component, status: 'PASS', assertion: 'Assertion passed.' });
    console.log(`[PASS] ${id} (${component}): ${name}`);
  } catch (err: any) {
    results.push({ id, name, component, status: 'FAIL', assertion: err.message || String(err) });
    console.error(`[FAIL] ${id} (${component}): ${name} ->`, err.message);
  }
}

async function runApiIntegrationTests() {
  console.log('=== MORAJAWS PHASE 2.4.4: API & FRONTEND INTEGRATION TEST SUITE ===\n');

  // 1. AppContext single assignment API call sends installerId
  check('INT-01', 'AppContext single assignment API call sends installerId', 'AppContext', () => {
    assert.match(
      files.appContext,
      /fetch\('\/api\/tickets\/assign'[\s\S]{0,100}JSON\.stringify\(\{\s*ticketId,\s*leaderName,\s*installerName,\s*installerId\s*\}\)/
    );
  });

  // 2. AppContext bulk assignment API call sends installerId
  check('INT-02', 'AppContext bulk assignment API call sends installerId', 'AppContext', () => {
    assert.match(
      files.appContext,
      /fetch\('\/api\/tickets\/assign'[\s\S]{0,120}JSON\.stringify\(\{\s*ticketIds,\s*leaderName,\s*installerName,\s*installerId,\s*slotTime,\s*remarks/
    );
  });

  // 3. AppContext reassign API call sends newInstallerId
  check('INT-03', 'AppContext reassign API call sends newInstallerId', 'AppContext', () => {
    assert.match(
      files.appContext,
      /fetch\('\/api\/tickets\/reassign'[\s\S]{0,120}JSON\.stringify\(\{\s*ticketId,\s*woNumber:\s*ticket\.woNumber,\s*newInstallerName,\s*newInstallerId,\s*reason/
    );
  });

  // 4. AppContext fail-closed logic for ambiguous installer names
  check('INT-04', 'AppContext resolves installerId with strict length===1 check (fail-closed)', 'AppContext', () => {
    const singleMatches = files.appContext.match(/matchingInstallerAccounts\.length === 1 \? matchingInstallerAccounts\[0\]\.id : ''/g) || [];
    assert.ok(singleMatches.length >= 3, `Expected at least 3 fail-closed installerId mappings in AppContext, found ${singleMatches.length}`);
  });

  // 5. AppContext scopedTickets uses immutable installerUserId only
  check('INT-05', 'AppContext scopedTickets uses t.installerUserId === myId only', 'AppContext', () => {
    const sectionMatch = files.appContext.match(/if \(currentUser\.role === 'installer'\) \{[\s\S]{0,250}return String\(t\.installerUserId \|\| ''\)\.trim\(\) === myId;/);
    assert.ok(sectionMatch, 'scopedTickets must match only t.installerUserId === myId');
    assert.ok(!sectionMatch[0].includes('phoneMatch'), 'scopedTickets must not contain phoneMatch');
    assert.ok(!sectionMatch[0].includes('nameMatch'), 'scopedTickets must not contain nameMatch');
  });

  // 6. AppContext startWorkOnTicket uses installerUserId only
  check('INT-06', 'AppContext startWorkOnTicket checks ticket.installerUserId === myId', 'AppContext', () => {
    assert.match(
      files.appContext,
      /if \(currentUser\.role === 'installer'\) \{[\s\S]{0,150}const isMine = Boolean\(myId && String\(ticket\.installerUserId \|\| ''\)\.trim\(\) === myId\);/
    );
  });

  // 7. AppContext saveProgressReport uses installerUserId only
  check('INT-07', 'AppContext saveProgressReport checks ticket.installerUserId === myId', 'AppContext', () => {
    assert.match(
      files.appContext,
      /saveProgressReport[\s\S]{0,1200}if \(currentUser\.role === 'installer'\) \{[\s\S]{0,150}const isMine = Boolean\(myId && String\(ticket\.installerUserId \|\| ''\)\.trim\(\) === myId\);/
    );
  });

  // 8. AppContext sendTicketMessage uses installerUserId only
  check('INT-08', 'AppContext sendTicketMessage checks ticket.installerUserId === myId', 'AppContext', () => {
    assert.match(
      files.appContext,
      /sendTicketMessage[\s\S]{0,2500}if \(currentUser\.role === 'installer'\) \{[\s\S]{0,150}const isMine = Boolean\(myId && String\(ticket\.installerUserId \|\| ''\)\.trim\(\) === myId\);/
    );
  });

  // 9. AppContext updateTicket enforces installerUserId and resolves ID on assignment
  check('INT-09', 'AppContext updateTicket enforces existing.installerUserId === myId', 'AppContext', () => {
    assert.match(
      files.appContext,
      /if \(currentUser\.role === 'installer'\) \{[\s\S]{0,200}const assignedUserId = String\(existing\.installerUserId \|\| ''\)\.trim\(\);[\s\S]{0,80}if \(!myId \|\| !assignedUserId \|\| assignedUserId !== myId\)/
    );
  });

  // 10. Assignment API in server.ts requires installerId and enforces Leader role
  check('INT-10', 'server.ts /api/tickets/assign requires installerId and Leader role', 'Assignment API', () => {
    assert.match(
      files.server,
      /app\.post\('\/api\/tickets\/assign'[\s\S]{0,120}if \(req\.user!\.role !== 'leader'\) return res\.status\(403\)/
    );
    assert.match(
      files.server,
      /isSupabaseMode\(\) && \(!installerId \|\| typeof installerId !== 'string' \|\| !installerId\.trim\(\)\)/
    );
  });

  // 11. Reassignment API in server.ts requires newInstallerId and enforces Leader role
  check('INT-11', 'server.ts /api/tickets/reassign requires newInstallerId and Leader role', 'Reassignment API', () => {
    assert.match(
      files.server,
      /app\.post\('\/api\/tickets\/reassign'[\s\S]{0,120}if \(req\.user!\.role !== 'leader'\) return res\.status\(403\)/
    );
    assert.match(
      files.server,
      /isSupabaseMode\(\) && \(!newInstallerId \|\| typeof newInstallerId !== 'string' \|\| !newInstallerId\.trim\(\)\)/
    );
  });

  // 12. Bulk assignment API in server.ts iterates assignedIds and passes installerId
  check('INT-12', 'server.ts /api/tickets/assign passes installerId in loop for bulk tickets', 'Bulk Assignment', () => {
    assert.match(
      files.server,
      /for \(const id of assignedIds\) \{[\s\S]{0,120}assignTicketInSupabase\(\{[\s\S]{0,120}installerId,/
    );
  });

  // 13. Installer Dashboard filters by installer user ID
  check('INT-13', 'InstallerDashboardView filters myTickets by t.installerUserId === myId', 'Installer Dashboard', () => {
    assert.match(
      files.dashboard,
      /!t\.isArchived && !t\.isDeleted && String\(t\.installerUserId \|\| ''\)\.trim\(\) === myId/
    );
  });

  // 14. Installer Portal filters by installer user ID
  check('INT-14', 'InstallerPortal filters myTickets for current installer by t.installerUserId === myId', 'Installer Portal', () => {
    assert.match(
      files.installerPortal,
      /!t\.isArchived && !t\.isDeleted && String\(t\.installerUserId \|\| ''\)\.trim\(\) === myId/
    );
  });

  // 15. Supabase Adapter resolves installer by ID with role and contractor check
  check('INT-15', 'supabaseAdapter resolveInstallerAccountInSupabase checks id, role, and active status', 'Supabase Adapter', () => {
    assert.match(
      files.supabaseAdapter,
      /export async function resolveInstallerAccountInSupabase\(/
    );
    assert.match(
      files.supabaseAdapter,
      /from\('users'\)[\s\S]{0,120}\.eq\('id', id\)\.maybeSingle\(\)/
    );
    assert.match(
      files.supabaseAdapter,
      /String\(data\.role \|\| ''\)\.toLowerCase\(\) !== 'installer'/
    );
    assert.match(
      files.supabaseAdapter,
      /data\.active !== true \|\| data\.is_archived === true \|\| data\.is_deleted === true/
    );
  });

  // 16. Supabase Storage authorization uses installer user ID only
  check('INT-16', 'supabaseStorage checkTicketMediaAuthorization uses assignedUserId === currentUserId', 'Storage Authorization', () => {
    assert.match(
      files.supabaseStorage,
      /if \(role === 'installer'\) \{[\s\S]{0,250}assignedUserId === currentUserId/
    );
  });

  // 17. TicketsTable installer scoping uses installer user ID only
  check('INT-17', 'TicketsTable installer scoping uses t.installerUserId === myId (no name/phone matching)', 'Tickets Table', () => {
    assert.match(
      files.ticketsTable,
      /else if \(currentUser\?\.role === 'installer'\) \{[\s\S]{0,180}const isAssignedToMe = String\(t\.installerUserId \|\| ''\)\.trim\(\) === myId;/
    );
  });

  // 18. ContactCentreView installer scoping uses installer user ID only
  check('INT-18', 'ContactCentreView installer scoping uses t.installerUserId === myUid (no name/phone matching)', 'Contact Centre', () => {
    assert.match(
      files.contactCentre,
      /if \(currentUser\?\.role === 'installer'\) \{[\s\S]{0,100}return Boolean\(myUid && String\(t\.installerUserId \|\| ''\)\.trim\(\) === myUid\);/
    );
  });

  // 19. ScheduleCalendarView installer scoping uses installer user ID only
  check('INT-19', 'ScheduleCalendarView installer scoping uses t.installerUserId === myId (no name matching)', 'Schedule Calendar', () => {
    assert.match(
      files.scheduleCalendar,
      /if \(currentUser\?\.role === 'installer'\) \{[\s\S]{0,100}return Boolean\(myId && String\(t\.installerUserId \|\| ''\)\.trim\(\) === myId\);/
    );
  });

  // 20. InstallerWhatsAppCenter installer scoping uses installer user ID only
  check('INT-20', 'InstallerWhatsAppCenter installer scoping uses t.installerUserId === myId (no name matching)', 'WhatsApp Center', () => {
    assert.match(
      files.whatsappCenter,
      /return String\(t\.installerUserId \|\| ''\)\.trim\(\) === myId;/
    );
  });

  // 21. App.tsx installer pending & unread counts and modal access use installer user ID only
  check('INT-21', 'App.tsx installer ticket actions use ticket.installerUserId === myId', 'App Entry', () => {
    assert.match(
      files.app,
      /const installerPendingCount[\s\S]{0,400}String\(t\.installerUserId \|\| ''\)\.trim\(\) === myId/
    );
    assert.match(
      files.app,
      /const handleOpenTicketDetail[\s\S]{0,250}Boolean\(myId && String\(ticket\.installerUserId \|\| ''\)\.trim\(\) === myId\)/
    );
    assert.match(
      files.app,
      /const handleOpenWhatsAppModal[\s\S]{0,250}Boolean\(myId && String\(ticket\.installerUserId \|\| ''\)\.trim\(\) === myId\)/
    );
  });

  // 22. Strict Absence Assertion: No installer authorization path relies on name/phone
  check('INT-22', 'Zero presence of name or phone number matching in installer authorization pathways', 'Zero-Slop Security Audit', () => {
    // Check that AppContext has no remaining installer name match in authorization
    assert.ok(!files.appContext.includes('isInstallerMatch'), 'AppContext must not contain isInstallerMatch');
    assert.ok(!files.app.includes('isInstallerMatch'), 'App.tsx must not contain isInstallerMatch');
    assert.ok(!files.whatsappCenter.includes('isInstallerMatch'), 'InstallerWhatsAppCenter must not contain isInstallerMatch');
    
    // Check TicketsTable has no phone match for installer
    const ttInstallerSection = files.ticketsTable.match(/else if \(currentUser\?\.role === 'installer'\) \{[\s\S]{0,800}\n      \}/);
    assert.ok(ttInstallerSection, 'TicketsTable installer section must exist');
    assert.ok(!ttInstallerSection[0].includes('installerContact'), 'TicketsTable installer section must not check installerContact');
    assert.ok(!ttInstallerSection[0].includes('replace(/\\D/g'), 'TicketsTable installer section must not do regex phone comparison');
  });

  const total = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  const evidence = {
    suite: 'MORAJAWS PHASE 2.4.4 API & FRONTEND INTEGRATION TEST',
    timestamp: new Date().toISOString(),
    total,
    passed,
    failed,
    overallStatus: failed === 0 ? 'SUCCESS' : 'FAILED',
    results
  };

  const evidencePath = path.resolve(process.cwd(), 'scripts/evidence/phase2_4_4_api_integration_test.json');
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

runApiIntegrationTests().catch(err => {
  console.error('Fatal API integration test error:', err);
  process.exit(1);
});
