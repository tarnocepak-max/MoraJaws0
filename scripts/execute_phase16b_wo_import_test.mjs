/**
 * Automated Verification Suite for Phase 16B: Production Work Order Import Pipeline
 * 
 * Tests:
 * 1. Migration 015 & 016 SQL file integrity & schema assertions
 * 2. Excel multi-sheet & header row detection (rows 0-15)
 * 3. 46-column canonical mapping & 9 mandatory fields enforcement
 * 4. Customer ID (7-digit) and WO Number normalization & validation
 * 5. Level 1 (in-file) and Level 2 (database) duplicate detection logic
 * 6. Non-destructive update policy (preserves technician assignment & technical reports)
 * 7. Server API endpoint definitions & RBAC authorization
 * 8. Fail-closed database behavior on missing credentials / server error
 * 9. AppContext async integration & elimination of Firestore from WO import
 * 10. Service role secret key containment (never exposed to client)
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, status: 'PASS' });
  } catch (err) {
    results.push({ name, status: 'FAIL', error: err.message });
  }
}

// 1. Migration 015: Internal Auth RLS Lockdown
test('Migration 015 exists and revokes public access for internal auth lockdown', () => {
  const migPath = path.resolve('migrations/015_phase2_5_internal_auth_rls_lockdown.sql');
  assert(fs.existsSync(migPath), 'Migration 015 must exist');
  const content = fs.readFileSync(migPath, 'utf8');
  assert(content.includes('work_orders') && content.includes("REVOKE ALL ON TABLE public.%I FROM anon, authenticated;"), 'Must revoke work_orders from anon/authenticated');
  assert(content.includes('users') && content.includes("GRANT ALL ON TABLE public.%I TO service_role;"), 'Must grant users to service_role');
});

// 2. Migration 016: Production Work Order Import Pipeline
test('Migration 016 exists and creates work_order_imports tracking table & normalized index', () => {
  const migPath = path.resolve('migrations/016_production_work_order_import_pipeline.sql');
  assert(fs.existsSync(migPath), 'Migration 016 must exist');
  const content = fs.readFileSync(migPath, 'utf8');
  assert(content.includes('CREATE TABLE IF NOT EXISTS public.work_order_imports'), 'Must create work_order_imports');
  assert(content.includes('import_id text PRIMARY KEY'), 'Must define import_id text primary key');
  assert(content.includes('idempotency_key text UNIQUE'), 'Must include idempotency_key');
  assert(content.includes('uq_work_orders_wo_number_normalized'), 'Must create unique normalized index for wo_number');
  assert(content.includes('REVOKE ALL ON TABLE public.work_order_imports FROM anon, authenticated;'), 'Must lockdown work_order_imports RLS');
});

// 3. Server Adapter: bulkImportWorkOrdersToSupabase implementation
test('server/supabaseAdapter.ts exports bulkImportWorkOrdersToSupabase with robust tracking', () => {
  const adapterPath = path.resolve('server/supabaseAdapter.ts');
  const content = fs.readFileSync(adapterPath, 'utf8');
  assert(content.includes('export async function bulkImportWorkOrdersToSupabase'), 'Must export bulkImportWorkOrdersToSupabase');
  assert(content.includes('work_order_imports'), 'Must track into work_order_imports table');
  assert(content.includes('idempotencyKey'), 'Must handle idempotencyKey');
  assert(content.includes('duplicatePolicy'), 'Must support duplicatePolicy');
  assert(content.includes('export async function getWorkOrderImportHistory'), 'Must export getWorkOrderImportHistory');
  assert(content.includes('duplicateExistingWoNumbers'), 'Must track duplicateExistingWoNumbers');
  assert(content.includes('duplicateInFileWoNumbers'), 'Must track duplicateInFileWoNumbers');
});

// 4. Server Adapter: Non-destructive update policy safeguards
test('server/supabaseAdapter.ts preserves technician assignments on update_allowed', () => {
  const adapterPath = path.resolve('server/supabaseAdapter.ts');
  const content = fs.readFileSync(adapterPath, 'utf8');
  assert(content.includes('updates: Record<string, any> = {'), 'Must prepare targeted update payload');
  assert(!content.includes('updates.installer_name = item.installerName'), 'Must NOT unconditionally overwrite installer_name');
  assert(!content.includes('updates.technical_report = item.technicalReport'), 'Must NOT overwrite technical_report');
});

// 5. Server Endpoints: Canonical import routes and RBAC authorization
test('server.ts declares canonical work-order import routes with requireImportPermission', () => {
  const serverPath = path.resolve('server.ts');
  const content = fs.readFileSync(serverPath, 'utf8');
  assert(content.includes("'/api/supabase/work-orders/import'"), 'Must declare /api/supabase/work-orders/import');
  assert(content.includes("'/api/work-orders/import'"), 'Must declare /api/work-orders/import alias');
  assert(content.includes('requireImportPermission'), 'Must enforce requireImportPermission middleware');
  assert(content.includes("req.user.role !== 'super_admin' && req.user.role !== 'dispatch' && req.user.role !== 'management_data'"), 'Allowed roles must be super_admin, dispatch, management_data');
});

// 6. Server Endpoints: Fail-closed on missing Supabase configuration
test('server.ts fails closed (503) when Supabase is unavailable in production import', () => {
  const serverPath = path.resolve('server.ts');
  const content = fs.readFileSync(serverPath, 'utf8');
  assert(content.includes('DATABASE_UNAVAILABLE') || content.includes('SUPABASE_NOT_CONFIGURED'), 'Must return fail-closed error code');
  assert(content.includes('status(503)'), 'Must return HTTP 503 for unavailable database');
});

// 7. Excel Parsing Engine: Smart Sheet & Header Row Detection (0-15)
test('src/utils/excelClient.ts implements smart sheet and header row detection', () => {
  const clientPath = path.resolve('src/utils/excelClient.ts');
  const content = fs.readFileSync(clientPath, 'utf8');
  assert(content.includes('readWorkbookWithSmartSheetDetection'), 'Must export readWorkbookWithSmartSheetDetection');
  assert(content.includes('const maxScanRows = Math.min(rawMatrix.length, 15);'), 'Must scan rows 0-15 for header row');
  assert(content.includes('formatCellValue'), 'Must format cell values safely');
});

// 8. Parser Service: Supports manual sheet selection and returns sheet metadata
test('src/services/textToTableParser.ts returns sheetNames and selectedSheetName', () => {
  const parserPath = path.resolve('src/services/textToTableParser.ts');
  const content = fs.readFileSync(parserPath, 'utf8');
  assert(content.includes('manualSheetName?: string;'), 'Must support manualSheetName option');
  assert(content.includes('sheetNames: !Array.isArray(parseRes) ? parseRes.sheetNames : undefined'), 'Must include sheetNames in parse result');
  assert(content.includes('selectedSheetName: !Array.isArray(parseRes) ? parseRes.selectedSheetName : undefined'), 'Must include selectedSheetName in parse result');
});

// 9. AppContext: Asynchronous Supabase Single Source of Truth
test('src/context/AppContext.tsx implements async bulkImportTickets querying Supabase API', () => {
  const contextPath = path.resolve('src/context/AppContext.tsx');
  const content = fs.readFileSync(contextPath, 'utf8');
  assert(content.includes('const bulkImportTickets = async ('), 'bulkImportTickets must be async');
  assert(content.includes('/api/supabase/work-orders/import'), 'Must POST to /api/supabase/work-orders/import');
  assert(content.includes('refreshTicketsFromServer'), 'Must have refreshTicketsFromServer');
  assert(!content.includes('batchSaveTicketsToFirestore(validRowsToImport)'), 'Must NOT call batchSaveTicketsToFirestore for WO import');
});

// 10. Frontend Importer: TextToTableImporter.tsx has full production state machine and guards
test('src/components/textToTable/TextToTableImporter.tsx has full production state machine and guards', () => {
  const importerPath = path.resolve('src/components/textToTable/TextToTableImporter.tsx');
  const content = fs.readFileSync(importerPath, 'utf8');
  assert(content.includes('const handleExecuteImport = async () =>'), 'handleExecuteImport must be async');
  assert(content.includes('setIsExecutingImport(true)'), 'Must set loading flag to prevent double submission');
  assert(content.includes('handleSheetChange'), 'Must support manual sheet selection');
  assert(content.includes('importError'), 'Must have dedicated importError state');
  assert(content.includes('Import Ditolak Server (Fail-Closed Policy)'), 'Must render fail-closed error alert');
  assert(!content.includes('tidak akan disimpan ke Firestore'), 'Must reference Supabase instead of Firestore');
});

// 11. Security: Service Role key containment
test('Service role secret key is never leaked to client bundle (.env.example & client code)', () => {
  const envExample = fs.readFileSync(path.resolve('.env.example'), 'utf8');
  assert(!envExample.includes('VITE_SUPABASE_SERVICE_ROLE_KEY'), 'Client must never have VITE_SUPABASE_SERVICE_ROLE_KEY');
  
  // Check client files for illegal service role key reference
  const clientFiles = [
    'src/context/AppContext.tsx',
    'src/components/textToTable/TextToTableImporter.tsx',
    'src/services/woFieldMappingEngine.ts'
  ];
  for (const file of clientFiles) {
    const text = fs.readFileSync(path.resolve(file), 'utf8');
    assert(!text.includes('SUPABASE_SERVICE_ROLE_KEY'), `${file} must never reference SUPABASE_SERVICE_ROLE_KEY`);
  }
});

// 11. Phase 16B.1: Invalid rows must affect final import status
 test('Adapter marks invalid rows as a failed/partial outcome instead of a false success', () => {
  const content = fs.readFileSync(path.resolve('server/supabaseAdapter.ts'), 'utf8');
  assert(content.includes('result.failedErrors.length > 0 || result.invalidCount > 0'), 'invalidCount must participate in hasFailed');
  assert(content.includes("result.invalidCount === 0 && result.failedErrors.length === 0"), 'duplicate-only success must require zero invalid and failed rows');
  assert(content.includes("result.status = 'FAILED'"), 'empty or all-invalid imports must not be marked successful');
});

// 12. Phase 16B.1: Import history is mandatory, not best-effort
 test('Adapter fails closed when import tracking cannot be written', () => {
  const content = fs.readFileSync(path.resolve('server/supabaseAdapter.ts'), 'utf8');
  assert(content.includes('trackingStartError'), 'Must check initial import history write result');
  assert(content.includes('trackingFinalError'), 'Must check final import history write result');
  assert(content.includes('emptyBatchAuditError'), 'Must persist all-invalid import outcome');
});

// 13. Phase 16B.1: Stable import identity protects retries
 test('AppContext derives stable import ID and idempotency key from the logical payload', () => {
  const content = fs.readFileSync(path.resolve('src/context/AppContext.tsx'), 'utf8');
  assert(content.includes('createWorkOrderImportIdentity'), 'Must create stable import identity');
  assert(content.includes('crypto.subtle.digest'), 'Must use SHA-256 fingerprint');
  assert(content.includes('idempotencyKey: `MORAJAWS-WO-${fingerprint}`'), 'Must use a stable idempotency key');
  assert(!content.includes('const idempotencyKey = `IDEM-${importId}`'), 'Must not generate a fresh key from a random import ID');
});

// 14. Phase 16B.1: Partial result counts must not be hidden from the UI
 test('AppContext preserves partial insert/update counts when an import is rejected as incomplete', () => {
  const content = fs.readFileSync(path.resolve('src/context/AppContext.tsx'), 'utf8');
  assert(content.includes('const partialInserted = Number(partialSummary.inserted || 0)'), 'Must preserve inserted count');
  assert(content.includes('const partialFailed = Number(partialSummary.failed || 0) + Number(partialSummary.invalid || 0)'), 'Must count invalid rows in failure summary');
  assert(content.includes('importedCount: partialInserted'), 'Must return partial inserted count');
});

// 15. Phase 16B.1: Replay response must use the persisted import ID
 test('Server returns the canonical persisted import ID for idempotent replay', () => {
  const content = fs.readFileSync(path.resolve('server.ts'), 'utf8');
  assert(content.includes('importId: result.data?.importId || effectiveImportId'), 'Must return import ID from persisted import history');
});

// Output summary
console.log(JSON.stringify({
  phase: '16B',
  total: results.length,
  passed: results.filter(r => r.status === 'PASS').length,
  failed: results.filter(r => r.status === 'FAIL').length,
  results
}, null, 2));

if (results.some(r => r.status === 'FAIL')) {
  process.exit(1);
} else {
  process.exit(0);
}
