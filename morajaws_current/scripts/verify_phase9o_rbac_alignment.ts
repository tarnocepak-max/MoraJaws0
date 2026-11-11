import { ROLE_PERMISSIONS, hasPermission } from '../src/services/authService.ts';
import { DEFAULT_NAVIGATION_CONFIG } from '../src/constants/defaultNavigationConfig.ts';

async function runRbacVerification() {
  console.log('===============================================================');
  console.log('   PHASE 9O-RBAC ALIGNMENT VERIFICATION TEST SUITE (ISOLATED)  ');
  console.log('===============================================================');

  let passed = 0;
  let failed = 0;

  function assert(desc: string, condition: boolean) {
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`);
      failed++;
    }
  }

  // -------------------------------------------------------------------------
  // 1. Audit Logs Permissions Verification
  // -------------------------------------------------------------------------
  console.log('\n--- 1. Audit Logs Permissions ---');
  assert('super_admin HAS view_audit_logs', hasPermission('super_admin', 'view_audit_logs'));
  assert('it_support HAS view_audit_logs', hasPermission('it_support', 'view_audit_logs'));
  assert('dispatch DOES NOT have view_audit_logs', !hasPermission('dispatch', 'view_audit_logs'));
  assert('leader DOES NOT have view_audit_logs', !hasPermission('leader', 'view_audit_logs'));
  assert('installer DOES NOT have view_audit_logs', !hasPermission('installer', 'view_audit_logs'));
  assert('management_data DOES NOT have view_audit_logs', !hasPermission('management_data', 'view_audit_logs'));

  const loginLogNav = DEFAULT_NAVIGATION_CONFIG.submenuItems.find(s => s.id === 'login_logs');
  assert('login_logs nav submenu exists', Boolean(loginLogNav));
  assert('login_logs nav allows super_admin', Boolean(loginLogNav?.roles?.includes('super_admin')));
  assert('login_logs nav allows it_support', Boolean(loginLogNav?.roles?.includes('it_support')));
  assert('login_logs nav DENIES dispatch', !loginLogNav?.roles?.includes('dispatch'));

  // -------------------------------------------------------------------------
  // 2. Work Order Deletion Permissions Verification
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Work Order Deletion Permissions ---');
  assert('management_data HAS delete_wo_data', hasPermission('management_data', 'delete_wo_data'));
  assert('super_admin DOES NOT have delete_wo_data', !hasPermission('super_admin', 'delete_wo_data'));
  assert('super_admin DOES NOT have permanent_delete', !hasPermission('super_admin', 'permanent_delete'));
  assert('super_admin DOES NOT have delete_customer_data', !hasPermission('super_admin', 'delete_customer_data'));
  assert('dispatch DOES NOT have delete_wo_data', !hasPermission('dispatch', 'delete_wo_data'));
  assert('leader DOES NOT have delete_wo_data', !hasPermission('leader', 'delete_wo_data'));
  assert('installer DOES NOT have delete_wo_data', !hasPermission('installer', 'delete_wo_data'));
  assert('it_support DOES NOT have delete_wo_data', !hasPermission('it_support', 'delete_wo_data'));

  // -------------------------------------------------------------------------
  // 3. WhatsApp Templates Permissions Verification
  // -------------------------------------------------------------------------
  console.log('\n--- 3. WhatsApp Templates Permissions ---');
  assert('super_admin HAS manage_whatsapp_templates', hasPermission('super_admin', 'manage_whatsapp_templates'));
  assert('dispatch HAS manage_whatsapp_templates', hasPermission('dispatch', 'manage_whatsapp_templates'));
  assert('leader DOES NOT have manage_whatsapp_templates', !hasPermission('leader', 'manage_whatsapp_templates'));
  assert('installer DOES NOT have manage_whatsapp_templates', !hasPermission('installer', 'manage_whatsapp_templates'));
  assert('management_data DOES NOT have manage_whatsapp_templates', !hasPermission('management_data', 'manage_whatsapp_templates'));
  assert('it_support DOES NOT have manage_whatsapp_templates', !hasPermission('it_support', 'manage_whatsapp_templates'));

  const templateNav = DEFAULT_NAVIGATION_CONFIG.submenuItems.find(s => s.id === 'templates');
  assert('templates nav submenu exists', Boolean(templateNav));
  assert('templates nav allows super_admin', Boolean(templateNav?.roles?.includes('super_admin')));
  assert('templates nav allows dispatch', Boolean(templateNav?.roles?.includes('dispatch')));
  assert('templates nav DENIES leader', !templateNav?.roles?.includes('leader'));

  // -------------------------------------------------------------------------
  // 4. HTTP API Endpoint Guards Verification (Server Runtime)
  // -------------------------------------------------------------------------
  console.log('\n--- 4. HTTP Endpoint Security (Local Server at port 3000) ---');
  try {
    // Unauthenticated GET /api/audit-logs
    const auditRes = await fetch('http://localhost:3000/api/audit-logs');
    assert('GET /api/audit-logs rejects unauthenticated with 401', auditRes.status === 401);

    // Unauthenticated POST /api/whatsapp/preview
    const previewRes = await fetch('http://localhost:3000/api/whatsapp/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateBody: 'Test {{customer_name}}', ticket: { customerPhone: '0812' } })
    });
    assert('POST /api/whatsapp/preview rejects unauthenticated with 401', previewRes.status === 401);

    // Unauthenticated DELETE /api/tickets/mock_id
    const deleteRes = await fetch('http://localhost:3000/api/tickets/mock_id', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Test Reason' })
    });
    assert('DELETE /api/tickets/:id rejects unauthenticated with 401', deleteRes.status === 401);

    // Unauthenticated POST /api/tickets/bulk-delete
    const bulkDeleteRes = await fetch('http://localhost:3000/api/tickets/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketIds: ['t1'], reason: 'Test Reason' })
    });
    assert('POST /api/tickets/bulk-delete rejects unauthenticated with 401', bulkDeleteRes.status === 401);

    // Unauthenticated POST /api/tickets/purge-by-date
    const purgeRes = await fetch('http://localhost:3000/api/tickets/purge-by-date', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ importDate: '2026-11-01', reason: 'Test Reason' })
    });
    assert('POST /api/tickets/purge-by-date rejects unauthenticated with 401', purgeRes.status === 401);

  } catch (err: any) {
    console.error('Failed to run HTTP test:', err?.message || err);
  }

  console.log('\n===============================================================');
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runRbacVerification().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
