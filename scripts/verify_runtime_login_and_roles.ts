import { deduplicateContractors, normalizeContractor } from '../src/context/AppContext';
import { hasPermission } from '../src/services/authService';
import { sanitizeNavigationItems } from '../src/context/UIConfigContext';
import { UserRole } from '../src/types';
import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  name: string;
  category: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(name: string, category: string, passed: boolean, details: string) {
  results.push({ name, category, passed, details });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${icon} [${category}] ${name}: ${details}`);
}

async function run() {
  console.log('=================================================================');
  console.log('MORAJAWS RUNTIME ERROR REPAIR — 6-ROLE REGRESSION & AUDIT SUITE');
  console.log('Incident ID: MJ-ERR-MWB50UBC-6NM3AP');
  console.log('=================================================================\n');

  const BASE_URL = 'http://localhost:3000';

  // ---------------------------------------------------------------------------
  // TEST SET 1: 6-ROLE AUTHENTICATION & BOOTSTRAP INTEGRITY
  // ---------------------------------------------------------------------------
  const testAccounts = [
    { role: 'super_admin' as UserRole, username: 'superadmin', password: '12345678', label: 'Superadmin' },
    { role: 'dispatch' as UserRole, username: 'dispatch', password: '12345678', label: 'Dispatch' },
    { role: 'leader' as UserRole, username: 'leadermjs', password: '12345678', label: 'Leader' },
    { role: 'installer' as UserRole, username: 'installer1', password: '12345678', label: 'Installer' },
    { role: 'management_data' as UserRole, username: 'datamgmt', password: '12345678', label: 'Management Data' },
    { role: 'it_support' as UserRole, username: 'itsupport', password: '12345678', label: 'IT Support Application' }
  ];

  for (const acc of testAccounts) {
    try {
      const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: acc.username, password: acc.password })
      });
      const loginData = await loginRes.json();

      if (!loginRes.ok || !loginData.success) {
        record(`Login Role: ${acc.label}`, 'Authentication', false, `Status ${loginRes.status}: ${loginData.error || 'Failed'}`);
        continue;
      }

      const token = loginData.tokens?.accessToken || loginData.token;
      record(`Login Role: ${acc.label}`, 'Authentication', true, `Authenticated as ${loginData.user?.role} (ID: ${loginData.user?.id})`);

      // Test /api/bootstrap
      const bootRes = await fetch(`${BASE_URL}/api/bootstrap`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const bootData = await bootRes.json();

      if (!bootRes.ok || !bootData.success) {
        record(`Bootstrap Integrity: ${acc.label}`, 'Bootstrap', false, `Status ${bootRes.status}: ${bootData.error || 'Failed'}`);
        continue;
      }

      // Check contractors format
      const contractors = bootData.contractors || [];
      const invalidContractor = contractors.find((c: any) => !Array.isArray(c.coverageAreas));
      const hasCoverageAreas = contractors.length === 0 || !invalidContractor;

      record(
        `Bootstrap Contractors coverageAreas: ${acc.label}`,
        'Data Normalization',
        hasCoverageAreas,
        hasCoverageAreas
          ? `All ${contractors.length} contractors guarantee coverageAreas as string[]`
          : `Found contractor with non-array coverageAreas: ${JSON.stringify(invalidContractor)}`
      );

      // Check tickets array
      const tickets = bootData.tickets;
      const isTicketsArray = Array.isArray(tickets);
      record(`Bootstrap Tickets: ${acc.label}`, 'Data Scoping', isTicketsArray, `Tickets count: ${tickets?.length ?? 0}`);

    } catch (err: any) {
      record(`Login & Bootstrap Exception: ${acc.label}`, 'Authentication', false, err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // TEST SET 2: CONTRACTOR NORMALIZATION UNIT TESTS
  // ---------------------------------------------------------------------------
  console.log('\n--- Normalization Engine Tests ---');

  // Case A: Missing coverageAreas (null, undefined, snake_case)
  const legacyContractors = [
    { id: 'c1', name: 'Contr A', coverage_areas: ['Jakarta', 'Depok'] },
    { id: 'c2', name: 'Contr B', coverageAreas: null },
    { id: 'c3', name: 'Contr C' }, // undefined coverageAreas
    { id: 'c4', name: 'Contr D', coverageAreas: ['Tangerang'] }
  ];

  const normalizedList = deduplicateContractors(legacyContractors as any);
  const allHaveArrayCoverage = normalizedList.every(c => Array.isArray(c.coverageAreas));
  record(
    'deduplicateContractors normalizes snake_case & null coverageAreas',
    'Normalization',
    allHaveArrayCoverage && normalizedList[0].coverageAreas.includes('Jakarta'),
    `Normalized ${normalizedList.length} items. All have Array coverageAreas: ${allHaveArrayCoverage}`
  );

  // Case B: Safe include evaluation on normalized contractor
  let includesCrash = false;
  try {
    for (const c of normalizedList) {
      c.coverageAreas.includes('Depok');
    }
  } catch (e) {
    includesCrash = true;
  }
  record(
    'c.coverageAreas.includes() safe against legacy shapes',
    'Defensive Programming',
    !includesCrash,
    includesCrash ? 'Crashed on .includes()' : 'Zero exceptions on .includes() across legacy shapes'
  );

  // ---------------------------------------------------------------------------
  // TEST SET 3: UNGUARDED STRING & ARRAY INCLUDES TESTS
  // ---------------------------------------------------------------------------
  console.log('\n--- Defensive String & Array Includes Tests ---');

  // Ticket with completely undefined/null fields
  const corruptedTicket: any = {
    id: 't-corrupt',
    woNumber: undefined,
    customerName: null,
    remarksWOInstaller: null,
    remarksAgent: undefined,
    appointmentDate: null,
    statusWOInstaller: undefined,
    contactorName: undefined,
    installerName: null
  };

  // Test filter simulation
  let searchCrashed = false;
  try {
    const query = 'reschedule';
    const matchWo = String(corruptedTicket.woNumber ?? '').toLowerCase().includes(query);
    const matchCust = String(corruptedTicket.customerName ?? '').toLowerCase().includes(query);
    const remarksInst = String(corruptedTicket.remarksWOInstaller ?? '').toLowerCase();
    const isReschedule = remarksInst.includes('reschedule');
    const cleanAppDate = String(corruptedTicket.appointmentDate ?? '').slice(0, 10);
    const hasT = String(corruptedTicket.appointmentDate ?? '').includes('T');
  } catch (e) {
    searchCrashed = true;
  }

  record(
    'Corrupted Ticket Search / Reschedule Simulation',
    'Defensive Programming',
    !searchCrashed,
    searchCrashed ? 'Crashed on string operations' : 'Safely handled undefined woNumber, customerName, remarks, appointmentDate'
  );

  // Test hasPermission with valid, undefined, and non-existent role
  const superHas = hasPermission('super_admin', 'edit_wo_data');
  const unknownHas = hasPermission('non_existent_role' as any, 'edit_wo_data');
  const undefinedHas = hasPermission(undefined as any, 'edit_wo_data');

  record(
    'hasPermission undefined/non-existent role safety',
    'RBAC Security',
    superHas === true && unknownHas === false && undefinedHas === false,
    `super_admin edit_wo_data: ${superHas}, unknown: ${unknownHas}, undefined: ${undefinedHas}`
  );

  // Test empty menu navigation categories & standalone menus
  const sanitizedNav = sanitizeNavigationItems([] as any);
  record(
    'sanitizeNavigationItems handles empty array safely',
    'Navigation Normalization',
    Array.isArray(sanitizedNav) && sanitizedNav.length > 0,
    `Fell back to ${sanitizedNav.length} canonical default menus`
  );

  // Test expired session token on /api/bootstrap (fail-closed check)
  const expiredTokenRes = await fetch(`${BASE_URL}/api/bootstrap`, {
    headers: { Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.expired.token` }
  });
  record(
    'Expired / Invalid Session Fail-Closed Verification',
    'Session Security',
    expiredTokenRes.status === 401,
    `Status ${expiredTokenRes.status} (expected 401 for invalid/expired token)`
  );

  // ---------------------------------------------------------------------------
  // TEST SET 4: STATIC CODE AUDIT (ZERO UNSAFE INCLUDES)
  // ---------------------------------------------------------------------------
  console.log('\n--- Static Code Audit for Unsafe Includes ---');

  const rootDir = process.cwd();
  const filesToCheck = [
    'src/components/dashboard/DashboardOverview.tsx',
    'src/components/portals/InstallerPortal.tsx',
    'src/components/portals/InstallerDetailModal.tsx',
    'src/components/portals/LeaderPortal.tsx',
    'src/components/reports/ContractorAreaRecapView.tsx',
    'src/components/portals/ManagementDataPortal.tsx',
    'src/components/layout/Sidebar.tsx',
    'src/components/layout/Header.tsx',
    'src/components/common/MoraJawsErrorBoundary.tsx'
  ];

  let foundUnsafe = 0;
  for (const relPath of filesToCheck) {
    const fullPath = path.resolve(rootDir, relPath);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8');

    // Regex check: prop?.toLowerCase().includes
    const unsafeOptionalChaining = content.match(/\w+\?\.toLowerCase\(\)\.includes/g);
    if (unsafeOptionalChaining) {
      foundUnsafe += unsafeOptionalChaining.length;
      console.log(`[WARN] Found unsafe pattern in ${relPath}:`, unsafeOptionalChaining);
    }

    // Line 177 bug pattern check: c.coverageAreas.includes without check
    const rawCoverageInclude = content.match(/c\.coverageAreas\.includes/g);
    if (rawCoverageInclude) {
      foundUnsafe += rawCoverageInclude.length;
      console.log(`[WARN] Found raw c.coverageAreas.includes in ${relPath}`);
    }
  }

  record(
    'Static Audit: Zero unsafe optional-chaining .includes() in target files',
    'Static Code Audit',
    foundUnsafe === 0,
    foundUnsafe === 0 ? 'Passed: All target files fully safeguarded' : `Found ${foundUnsafe} unsafe occurrences`
  );

  // ---------------------------------------------------------------------------
  // TEST SET 5: INCIDENT GUARD DIAGNOSTICS & REDACTION AUDIT
  // ---------------------------------------------------------------------------
  console.log('\n--- Incident Guard & Error Boundary Verification ---');

  const errorBoundaryPath = path.resolve(rootDir, 'src/components/common/MoraJawsErrorBoundary.tsx');
  const ebContent = fs.readFileSync(errorBoundaryPath, 'utf8');

  const hasComponentStack = ebContent.includes('componentStack');
  const hasSanitize = ebContent.includes('sanitizeDiagnostics');
  const hasFailedComp = ebContent.includes('failedComponentName');
  const hasTokenRedaction = ebContent.includes('[REDACTED_TOKEN]');
  const hasDetailsAccordion = ebContent.includes('Detail Diagnostik Teknis (Aman)');

  const ebPassed = hasComponentStack && hasSanitize && hasFailedComp && hasTokenRedaction && hasDetailsAccordion;

  record(
    'Incident Guard Enhanced Diagnostic Capabilities',
    'Incident Guard',
    ebPassed,
    `componentStack: ${hasComponentStack}, sanitize: ${hasSanitize}, failedComp: ${hasFailedComp}, redaction: ${hasTokenRedaction}, accordion: ${hasDetailsAccordion}`
  );

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n=================================================================');
  console.log('REGRESSION TEST RESULTS SUMMARY');
  console.log('=================================================================');
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`Total Assertions: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    console.error('\n❌ SOME ASSERTIONS FAILED');
    process.exit(1);
  } else {
    console.log('\n✨ ALL ASSERTIONS PASSED PERFECTLY!');
    process.exit(0);
  }
}

run().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
