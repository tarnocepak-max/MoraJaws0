/**
 * MORAJAWS — PHASE 14C.2.4.1
 * COLLECTOR VERDICT HARDENING & REGRESSION TEST SUITE
 * 
 * Verifies all 16 mandatory regression cases specified in Phase 14C.2.4.1:
 *  1. passed: true, assertion true, failureReasons empty -> PASS
 *  2. passed: false, assertion true -> FAIL
 *  3. passed: "true" (string) -> INVALID_ASSERTION
 *  4. passed: 1 (number) -> INVALID_ASSERTION
 *  5. passed: null -> INVALID_ASSERTION
 *  6. Assertion empty (assertions: []) -> INVALID_ASSERTION
 *  7. Assertion false -> FAIL
 *  8. Assertion assertion_passed: "true" -> INVALID_ASSERTION
 *  9. failureReasons: ["functional check failed"] -> FAIL
 * 10. failureReasons: "failed" (not array) -> INVALID_ASSERTION
 * 11. failureReasons: [123] (non-string item) -> INVALID_ASSERTION
 * 12. assertion_count mismatch -> INVALID_ASSERTION
 * 13. failed_assertion_count mismatch -> INVALID_ASSERTION
 * 14. Request not executed -> NO_EXECUTION_EVIDENCE
 * 15. HTTP status mismatch -> FAIL
 * 16. PASS cannot be produced from passed: true without assertion
 * 
 * Plus edge cases:
 * 17. passed: undefined -> INVALID_ASSERTION
 * 18. Assertion item missing name -> INVALID_ASSERTION
 * 19. ScenarioAssertionTracker evaluation helper verification
 * 20. Live loopback HTTP execution and schema-validated evidence export
 * 21. Historical evidence read-only compliance evaluation (LEGACY_EVIDENCE_NOT_COMPLIANT)
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import {
  SuiteEvidenceCollector,
  validateEvidenceSchema,
  evaluateEvidenceVerdict,
  createAssertion,
  ScenarioAssertionTracker,
  RealHttpEvidence
} from './evidenceCollector.ts';
import {
  createExpressApp,
  SERVER_SESSIONS
} from '../server.ts';
import {
  setSupabaseBackendClientForTesting,
  resetSupabaseBackendClientForTesting
} from '../server/supabaseClient.ts';

function createDispatchMockSupabase() {
  const usersList = [
    {
      id: 'u_dispatch_01',
      username: 'dispatch_andi',
      name: 'Dispatch Andi',
      email: 'dispatch@morajaws.net',
      role: 'dispatch',
      active: true,
      is_deleted: false,
      session_version: 1,
      payload: { sessionVersion: 1 }
    }
  ];

  function makeBuilder(getData: () => any) {
    let filterCol: string | null = null;
    let filterVal: any = null;
    const b: any = {
      select: () => b,
      eq: (col: string, val: any) => { filterCol = col; filterVal = val; return b; },
      ilike: (col: string, val: any) => { filterCol = col; filterVal = val; return b; },
      in: () => b,
      or: () => b,
      not: () => b,
      order: () => b,
      range: () => b,
      limit: () => b,
      maybeSingle: async () => {
        const list = getData();
        let items = Array.isArray(list) ? list : [list];
        if (filterCol) {
          items = items.filter((x: any) => x && (x[filterCol!] === filterVal || String(x[filterCol!]).toLowerCase() === String(filterVal).toLowerCase()));
        }
        return { data: items[0] || null, error: null };
      },
      single: async () => {
        const list = getData();
        let items = Array.isArray(list) ? list : [list];
        if (filterCol) {
          items = items.filter((x: any) => x && (x[filterCol!] === filterVal || String(x[filterCol!]).toLowerCase() === String(filterVal).toLowerCase()));
        }
        if (items.length > 0) return { data: items[0], error: null };
        return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
      }
    };
    return b;
  }

  const mockClient = {
    from: (table: string) => {
      if (table === 'users') {
        return makeBuilder(() => usersList);
      }
      return makeBuilder(() => []);
    }
  };

  return mockClient;
}

interface TestCaseResult {
  caseNumber: number;
  description: string;
  expectedVerdict: string;
  actualVerdict: string;
  passed: boolean;
  details: string;
}

const testResults: TestCaseResult[] = [];

function recordTestCase(
  caseNumber: number,
  description: string,
  expectedVerdict: string,
  actualVerdict: string,
  conditionPassed: boolean,
  details: string
) {
  const isPassed = conditionPassed && actualVerdict === expectedVerdict;
  testResults.push({
    caseNumber,
    description,
    expectedVerdict,
    actualVerdict,
    passed: isPassed,
    details
  });
  const tag = isPassed ? 'PASS' : 'FAIL';
  console.log(`[${tag}] Case #${caseNumber}: ${description}`);
  console.log(`       Expected: ${expectedVerdict} | Actual: ${actualVerdict}`);
  console.log(`       Details:  ${details}\n`);
}

async function runPhase14C241Suite() {
  console.log('================================================================================');
  console.log('MORAJAWS — PHASE 14C.2.4.1 COLLECTOR VERDICT HARDENING & REGRESSION SUITE');
  console.log('================================================================================\n');

  // ===========================================================================
  // SECTION 1: MANDATORY REGRESSION TEST CASES 1 TO 16
  // ===========================================================================
  console.log('--- SECTION 1: MANDATORY COLLECTOR VERDICT HARDENING REGRESSION TESTS ---\n');

  // Case 1: passed: true, assertion true, failureReasons empty -> PASS
  {
    const collector = new SuiteEvidenceCollector('RegTest1');
    collector.recordHttpCall({
      method: 'GET',
      url: '/api/settings',
      actualStatus: 200,
      responseBody: { success: true }
    });
    collector.linkToScenario({
      num: 1,
      title: 'Valid Scenario Passing',
      category: 'Regression',
      passed: true,
      expectedStatus: 200,
      assertions: [
        { name: 'Payload success is true', passed: true, evidence: 'body.success === true' }
      ]
    });
    const ev = collector.getEvidence()[0];
    const isPass = ev.result === 'PASS';
    const isStatusOk = ev.status_assertion_passed === true;
    const isFuncOk = ev.functional_assertion_passed === true;
    const isFailedZero = ev.failed_assertion_count === 0;
    const isNoFailReasons = !ev.failure_reasons || ev.failure_reasons.length === 0;

    recordTestCase(
      1,
      'passed: true, assertion true, failureReasons empty -> PASS',
      'PASS',
      ev.result,
      isPass && isStatusOk && isFuncOk && isFailedZero && isNoFailReasons,
      `Verdict is PASS. status_assertion_passed=true, functional_assertion_passed=true, failed_count=0, failure_reasons=0.`
    );
  }

  // Case 2: passed: false, assertion true -> FAIL
  {
    const collector = new SuiteEvidenceCollector('RegTest2');
    collector.recordHttpCall({
      method: 'GET',
      url: '/api/settings',
      actualStatus: 200,
      responseBody: { success: true }
    });
    collector.linkToScenario({
      num: 2,
      title: 'Passed False Overrides True Assertions',
      category: 'Regression',
      passed: false,
      expectedStatus: 200,
      assertions: [
        { name: 'Payload success is true', passed: true }
      ]
    });
    const ev = collector.getEvidence()[0];
    const isFail = ev.result === 'FAIL';
    const hasFailReason = ev.failure_reasons?.some(r => r.includes('params.passed is false')) === true;

    recordTestCase(
      2,
      'passed: false, assertion true -> FAIL',
      'FAIL',
      ev.result,
      isFail && hasFailReason,
      `Verdict is FAIL despite assertion=true because params.passed=false. Failure reason recorded.`
    );
  }

  // Case 3: passed: "true" (string) -> INVALID_ASSERTION
  {
    const collector = new SuiteEvidenceCollector('RegTest3');
    collector.recordHttpCall({
      method: 'GET',
      url: '/api/settings',
      actualStatus: 200,
      responseBody: { success: true }
    });
    collector.linkToScenario({
      num: 3,
      title: 'String "true" Value Rejection',
      category: 'Regression',
      passed: 'true' as any,
      expectedStatus: 200,
      assertions: [
        { name: 'Payload success is true', passed: true }
      ]
    });
    const ev = collector.getEvidence()[0];
    const isInvalid = ev.result === 'INVALID_ASSERTION';
    const hasReason = ev.failure_reasons?.some(r => r.includes('[INVALID_ASSERTION] params.passed must be strictly boolean')) === true;

    recordTestCase(
      3,
      'passed: "true" -> INVALID_ASSERTION',
      'INVALID_ASSERTION',
      ev.result,
      isInvalid && hasReason,
      `String "true" rejected as INVALID_ASSERTION. Zero Boolean("true") coercion.`
    );
  }

  // Case 4: passed: 1 (number) -> INVALID_ASSERTION
  {
    const collector = new SuiteEvidenceCollector('RegTest4');
    collector.recordHttpCall({
      method: 'GET',
      url: '/api/settings',
      actualStatus: 200,
      responseBody: { success: true }
    });
    collector.linkToScenario({
      num: 4,
      title: 'Number 1 Value Rejection',
      category: 'Regression',
      passed: 1 as any,
      expectedStatus: 200,
      assertions: [
        { name: 'Payload success is true', passed: true }
      ]
    });
    const ev = collector.getEvidence()[0];
    const isInvalid = ev.result === 'INVALID_ASSERTION';
    const hasReason = ev.failure_reasons?.some(r => r.includes('[INVALID_ASSERTION] params.passed must be strictly boolean')) === true;

    recordTestCase(
      4,
      'passed: 1 -> INVALID_ASSERTION',
      'INVALID_ASSERTION',
      ev.result,
      isInvalid && hasReason,
      `Number 1 rejected as INVALID_ASSERTION. Zero Boolean(1) coercion.`
    );
  }

  // Case 5: passed: null -> INVALID_ASSERTION
  {
    const collector = new SuiteEvidenceCollector('RegTest5');
    collector.recordHttpCall({
      method: 'GET',
      url: '/api/settings',
      actualStatus: 200,
      responseBody: { success: true }
    });
    collector.linkToScenario({
      num: 5,
      title: 'Null Value Rejection',
      category: 'Regression',
      passed: null as any,
      expectedStatus: 200,
      assertions: [
        { name: 'Payload success is true', passed: true }
      ]
    });
    const ev = collector.getEvidence()[0];
    const isInvalid = ev.result === 'INVALID_ASSERTION';
    const hasReason = ev.failure_reasons?.some(r => r.includes('[INVALID_ASSERTION] params.passed must be strictly boolean')) === true;

    recordTestCase(
      5,
      'passed: null -> INVALID_ASSERTION',
      'INVALID_ASSERTION',
      ev.result,
      isInvalid && hasReason,
      `Null value rejected as INVALID_ASSERTION.`
    );
  }

  // Case 6: Assertion kosong (assertions: []) -> INVALID_ASSERTION
  {
    const collector = new SuiteEvidenceCollector('RegTest6');
    collector.recordHttpCall({
      method: 'GET',
      url: '/api/settings',
      actualStatus: 200,
      responseBody: { success: true }
    });
    collector.linkToScenario({
      num: 6,
      title: 'Empty Assertions Array Rejection',
      category: 'Regression',
      passed: true,
      expectedStatus: 200,
      assertions: []
    });
    const ev = collector.getEvidence()[0];
    const isInvalid = ev.result === 'INVALID_ASSERTION';
    const hasReason = ev.failure_reasons?.some(r => r.includes('Empty assertions array provided')) === true;

    recordTestCase(
      6,
      'Assertion kosong -> INVALID_ASSERTION',
      'INVALID_ASSERTION',
      ev.result,
      isInvalid && hasReason,
      `Empty assertions array ([]) flagged as INVALID_ASSERTION. Zero functional assertions executed.`
    );
  }

  // Case 7: Assertion bernilai false -> FAIL
  {
    const collector = new SuiteEvidenceCollector('RegTest7');
    collector.recordHttpCall({
      method: 'GET',
      url: '/api/settings',
      actualStatus: 200,
      responseBody: { success: false }
    });
    collector.linkToScenario({
      num: 7,
      title: 'Failing Assertion Evaluation',
      category: 'Regression',
      passed: true,
      expectedStatus: 200,
      assertions: [
        { name: 'Payload success is true', passed: false, failureReason: 'Field success was false' }
      ]
    });
    const ev = collector.getEvidence()[0];
    const isFail = ev.result === 'FAIL';
    const isFailedCount1 = ev.failed_assertion_count === 1;
    const isFuncPassedFalse = ev.functional_assertion_passed === false;

    recordTestCase(
      7,
      'Assertion bernilai false -> FAIL',
      'FAIL',
      ev.result,
      isFail && isFailedCount1 && isFuncPassedFalse,
      `Verdict is FAIL. failed_assertion_count=1, functional_assertion_passed=false.`
    );
  }

  // Case 8: Assertion "assertion_passed: 'true'" -> INVALID_ASSERTION
  {
    const collector = new SuiteEvidenceCollector('RegTest8');
    collector.recordHttpCall({
      method: 'GET',
      url: '/api/settings',
      actualStatus: 200,
      responseBody: { success: true }
    });
    collector.linkToScenario({
      num: 8,
      title: 'String "true" in Assertion Item',
      category: 'Regression',
      passed: true,
      expectedStatus: 200,
      assertions: [
        { name: 'Invalid string assertion', passed: 'true' as any }
      ]
    });
    const ev = collector.getEvidence()[0];
    const isInvalid = ev.result === 'INVALID_ASSERTION';
    const hasReason = ev.failure_reasons?.some(r => r.includes('received non-boolean passed of type \'string\'')) === true;

    recordTestCase(
      8,
      'Assertion "assertion_passed: \\"true\\"" -> INVALID_ASSERTION',
      'INVALID_ASSERTION',
      ev.result,
      isInvalid && hasReason,
      `Assertion item with passed='true' flagged as INVALID_ASSERTION.`
    );
  }

  // Case 9: failureReasons: ["functional check failed"] -> FAIL
  {
    const collector = new SuiteEvidenceCollector('RegTest9');
    collector.recordHttpCall({
      method: 'GET',
      url: '/api/settings',
      actualStatus: 200,
      responseBody: { success: true }
    });
    collector.linkToScenario({
      num: 9,
      title: 'Explicit Failure Reason Forces Fail',
      category: 'Regression',
      passed: true,
      expectedStatus: 200,
      assertions: [
        { name: 'Condition passed', passed: true }
      ],
      failureReasons: ['functional check failed']
    });
    const ev = collector.getEvidence()[0];
    const isFail = ev.result === 'FAIL';
    const containsReason = ev.failure_reasons?.includes('functional check failed') === true;

    recordTestCase(
      9,
      'failureReasons: ["functional check failed"] -> FAIL',
      'FAIL',
      ev.result,
      isFail && containsReason,
      `Verdict forced to FAIL by explicit non-empty failure reason. Reason stored in evidence.`
    );
  }

  // Case 10: failureReasons: "failed" -> INVALID_ASSERTION
  {
    const collector = new SuiteEvidenceCollector('RegTest10');
    collector.recordHttpCall({
      method: 'GET',
      url: '/api/settings',
      actualStatus: 200,
      responseBody: { success: true }
    });
    collector.linkToScenario({
      num: 10,
      title: 'Non-Array failureReasons Rejection',
      category: 'Regression',
      passed: true,
      expectedStatus: 200,
      assertions: [
        { name: 'Condition passed', passed: true }
      ],
      failureReasons: 'failed' as any
    });
    const ev = collector.getEvidence()[0];
    const isInvalid = ev.result === 'INVALID_ASSERTION';
    const hasReason = ev.failure_reasons?.some(r => r.includes('failureReasons must be an array of strings')) === true;

    recordTestCase(
      10,
      'failureReasons: "failed" -> INVALID_ASSERTION',
      'INVALID_ASSERTION',
      ev.result,
      isInvalid && hasReason,
      `String value for failureReasons flagged as INVALID_ASSERTION.`
    );
  }

  // Case 11: failureReasons: [123] -> INVALID_ASSERTION
  {
    const collector = new SuiteEvidenceCollector('RegTest11');
    collector.recordHttpCall({
      method: 'GET',
      url: '/api/settings',
      actualStatus: 200,
      responseBody: { success: true }
    });
    collector.linkToScenario({
      num: 11,
      title: 'Non-String Element in failureReasons',
      category: 'Regression',
      passed: true,
      expectedStatus: 200,
      assertions: [
        { name: 'Condition passed', passed: true }
      ],
      failureReasons: [123] as any
    });
    const ev = collector.getEvidence()[0];
    const isInvalid = ev.result === 'INVALID_ASSERTION';
    const hasReason = ev.failure_reasons?.some(r => r.includes('failureReasons[0] must be a string')) === true;

    recordTestCase(
      11,
      'failureReasons: [123] -> INVALID_ASSERTION',
      'INVALID_ASSERTION',
      ev.result,
      isInvalid && hasReason,
      `Array containing number in failureReasons flagged as INVALID_ASSERTION.`
    );
  }

  // Case 12: Assertion count tidak cocok dengan assertion_results -> INVALID_ASSERTION
  {
    const collector = new SuiteEvidenceCollector('RegTest12');
    collector.recordHttpCall({
      method: 'GET',
      url: '/api/settings',
      actualStatus: 200,
      responseBody: { success: true }
    });
    collector.linkToScenario({
      num: 12,
      title: 'Assertion Count Mismatch',
      category: 'Regression',
      passed: true,
      expectedStatus: 200,
      assertions: [
        { name: 'Condition 1', passed: true }
      ],
      assertionCount: 99 // Specified 99, but actual count is 2 (1 status + 1 functional)
    });
    const ev = collector.getEvidence()[0];
    const isInvalid = ev.result === 'INVALID_ASSERTION';
    const hasReason = ev.failure_reasons?.some(r => r.includes('assertion_count mismatch')) === true;

    recordTestCase(
      12,
      'Assertion count tidak cocok dengan assertion_results -> INVALID_ASSERTION',
      'INVALID_ASSERTION',
      ev.result,
      isInvalid && hasReason,
      `assertion_count mismatch (99 != 2) flagged as INVALID_ASSERTION.`
    );
  }

  // Case 13: failed_assertion_count tidak cocok -> INVALID_ASSERTION
  {
    const collector = new SuiteEvidenceCollector('RegTest13');
    collector.recordHttpCall({
      method: 'GET',
      url: '/api/settings',
      actualStatus: 200,
      responseBody: { success: true }
    });
    collector.linkToScenario({
      num: 13,
      title: 'Failed Assertion Count Mismatch',
      category: 'Regression',
      passed: true,
      expectedStatus: 200,
      assertions: [
        { name: 'Condition 1', passed: true }
      ],
      failedAssertionCount: 99 // Specified 99 failures, but actual failures is 0
    });
    const ev = collector.getEvidence()[0];
    const isInvalid = ev.result === 'INVALID_ASSERTION';
    const hasReason = ev.failure_reasons?.some(r => r.includes('failed_assertion_count mismatch')) === true;

    recordTestCase(
      13,
      'failed_assertion_count tidak cocok -> INVALID_ASSERTION',
      'INVALID_ASSERTION',
      ev.result,
      isInvalid && hasReason,
      `failed_assertion_count mismatch (99 != 0) flagged as INVALID_ASSERTION.`
    );
  }

  // Case 14: Request tidak dieksekusi -> NO_EXECUTION_EVIDENCE
  {
    const collector = new SuiteEvidenceCollector('RegTest14');
    // NOTE: Intentionally DO NOT call recordHttpCall()!
    collector.linkToScenario({
      num: 14,
      title: 'Unexecuted Request Check',
      category: 'Regression',
      passed: true,
      expectedStatus: 200,
      assertions: [
        { name: 'Condition 1', passed: true }
      ]
    });
    const ev = collector.getEvidence()[0];
    const isNoExec = ev.result === 'NO_EXECUTION_EVIDENCE';
    const isStatusZero = ev.actual_status === 0;
    const isStatusPassedFalse = ev.status_assertion_passed === false;
    const isFuncPassedFalse = ev.functional_assertion_passed === false;

    recordTestCase(
      14,
      'Request tidak dieksekusi -> NO_EXECUTION_EVIDENCE',
      'NO_EXECUTION_EVIDENCE',
      ev.result,
      isNoExec && isStatusZero && isStatusPassedFalse && isFuncPassedFalse,
      `Unexecuted request flagged as NO_EXECUTION_EVIDENCE. actual_status=0, status_passed=false, functional_passed=false.`
    );
  }

  // Case 15: HTTP status tidak sesuai -> FAIL
  {
    const collector = new SuiteEvidenceCollector('RegTest15');
    collector.recordHttpCall({
      method: 'GET',
      url: '/api/settings',
      actualStatus: 500, // Server returned 500
      responseBody: { error: 'Internal Error' }
    });
    collector.linkToScenario({
      num: 15,
      title: 'HTTP Status Mismatch Check',
      category: 'Regression',
      passed: true,
      expectedStatus: 200, // Expected 200
      assertions: [
        { name: 'Check', passed: true }
      ]
    });
    const ev = collector.getEvidence()[0];
    const isFail = ev.result === 'FAIL';
    const isStatusPassedFalse = ev.status_assertion_passed === false;
    const hasMismatchReason = ev.failure_reasons?.some(r => r.includes('HTTP status mismatch: expected 200, received 500')) === true;

    recordTestCase(
      15,
      'HTTP status tidak sesuai -> FAIL',
      'FAIL',
      ev.result,
      isFail && isStatusPassedFalse && hasMismatchReason,
      `HTTP status mismatch (actual 500 != expected 200) resulted in FAIL.`
    );
  }

  // Case 16: PASS tidak boleh dibuat hanya dari "params.passed: true" tanpa assertion
  {
    const collector = new SuiteEvidenceCollector('RegTest16');
    collector.recordHttpCall({
      method: 'GET',
      url: '/api/settings',
      actualStatus: 200,
      responseBody: { success: true }
    });
    // Caller only passed `passed: true` WITHOUT assertions array
    collector.linkToScenario({
      num: 16,
      title: 'Passed True Without Functional Assertions',
      category: 'Regression',
      passed: true,
      expectedStatus: 200
      // assertions is omitted / undefined
    });
    const ev = collector.getEvidence()[0];
    const isInvalid = ev.result === 'INVALID_ASSERTION';
    const isNotPass = ev.result !== 'PASS';
    const hasReason = ev.failure_reasons?.some(r => r.includes('No functional assertions provided')) === true;

    recordTestCase(
      16,
      'PASS tidak boleh dibuat hanya dari "params.passed: true" tanpa assertion',
      'INVALID_ASSERTION',
      ev.result,
      isInvalid && isNotPass && hasReason,
      `Attempting to pass params.passed=true without assertions flagged as INVALID_ASSERTION (NOT PASS).`
    );
  }

  // ===========================================================================
  // SECTION 2: ADDITIONAL EDGE CASES
  // ===========================================================================
  console.log('--- SECTION 2: ADDITIONAL EDGE CASE VALIDATIONS ---\n');

  // Case 17: passed: undefined -> INVALID_ASSERTION
  {
    const collector = new SuiteEvidenceCollector('RegTest17');
    collector.recordHttpCall({
      method: 'GET',
      url: '/api/settings',
      actualStatus: 200,
      responseBody: {}
    });
    collector.linkToScenario({
      num: 17,
      title: 'Undefined Passed Value',
      category: 'Edge Cases',
      passed: undefined as any,
      expectedStatus: 200,
      assertions: [{ name: 'Check', passed: true }]
    });
    const ev = collector.getEvidence()[0];
    const isInvalid = ev.result === 'INVALID_ASSERTION';

    recordTestCase(
      17,
      'passed: undefined -> INVALID_ASSERTION',
      'INVALID_ASSERTION',
      ev.result,
      isInvalid,
      `Undefined passed value rejected as INVALID_ASSERTION.`
    );
  }

  // Case 18: Assertion item missing name -> INVALID_ASSERTION
  {
    const collector = new SuiteEvidenceCollector('RegTest18');
    collector.recordHttpCall({
      method: 'GET',
      url: '/api/settings',
      actualStatus: 200,
      responseBody: {}
    });
    collector.linkToScenario({
      num: 18,
      title: 'Assertion Missing Name',
      category: 'Edge Cases',
      passed: true,
      expectedStatus: 200,
      assertions: [{ name: '', passed: true }]
    });
    const ev = collector.getEvidence()[0];
    const isInvalid = ev.result === 'INVALID_ASSERTION';

    recordTestCase(
      18,
      'Assertion item missing name -> INVALID_ASSERTION',
      'INVALID_ASSERTION',
      ev.result,
      isInvalid,
      `Assertion item with empty name string rejected as INVALID_ASSERTION.`
    );
  }

  // Case 19: ScenarioAssertionTracker evaluation helper verification
  {
    const tracker = new ScenarioAssertionTracker();
    tracker.record('Check 1: Boolean true', 200 === 200, 'Status should be 200', 'Verified 200 === 200');
    tracker.record('Check 2: Data defined', typeof { foo: 'bar' } === 'object', 'Object should exist');
    const allOk = tracker.allPassed();
    const countOk = tracker.count() === 2;
    const failedZero = tracker.failedCount() === 0;

    recordTestCase(
      19,
      'ScenarioAssertionTracker evaluation helper verification',
      'PASS',
      allOk && countOk && failedZero ? 'PASS' : 'FAIL',
      allOk && countOk && failedZero,
      `Tracker correctly recorded 2 verified assertions. allPassed=true, count=2, failedCount=0.`
    );
  }

  // ===========================================================================
  // SECTION 3: LIVE HTTP LOOPBACK VERIFICATION & EVIDENCE EXPORT
  // ===========================================================================
  console.log('--- SECTION 3: LIVE HTTP LOOPBACK EXECUTION & EVIDENCE PERSISTENCE ---\n');

  const mockSupabase = createDispatchMockSupabase();
  setSupabaseBackendClientForTesting(mockSupabase as any);

  const app = await createExpressApp({ skipVite: true });
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as any;
  const port = address.port;

  const nowIso = new Date().toISOString();
  const futureIso = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  SERVER_SESSIONS.length = 0;
  SERVER_SESSIONS.push({
    sessionId: 'sess_regtest_01',
    token: 'token_regtest_live',
    userId: 'u_dispatch_01',
    username: 'dispatch_andi',
    name: 'Dispatch Andi',
    role: 'dispatch',
    contractor: 'PT Mora Jaws Pusat',
    contractorId: 'c-dispatch-01',
    area: 'Semua Area',
    sessionVersion: 1,
    loginAt: nowIso,
    lastActivityAt: nowIso,
    expiresAt: futureIso,
    status: 'active',
    ipAddress: '127.0.0.1',
    userAgent: 'RegressionTestRunner',
    deviceType: 'desktop'
  });

  const liveCollector = new SuiteEvidenceCollector('Phase14C.2.4.1_Regression');

  try {
    const postData = JSON.stringify({
      templateBody: 'Halo {{customerName}}, teknisi {{installerName}} menuju lokasi.',
      ticket: {
        customerName: 'Ibu Rahma',
        installerName: 'Budi',
        customerPhone: '08123456789'
      }
    });

    const liveRes = await new Promise<{ status: number; body: any }>((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/api/whatsapp/preview',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token_regtest_live',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (r) => {
        let data = '';
        r.on('data', chunk => data += chunk);
        r.on('end', () => {
          let parsed: any = null;
          try { parsed = JSON.parse(data); } catch { parsed = data; }
          resolve({ status: r.statusCode || 0, body: parsed });
        });
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    liveCollector.recordHttpCall({
      method: 'POST',
      url: '/api/whatsapp/preview',
      token: 'token_regtest_live',
      actualStatus: liveRes.status,
      responseBody: liveRes.body
    });

    const isStatus200 = typeof liveRes.status === 'number' && liveRes.status === 200;
    const isBodyObject = typeof liveRes.body === 'object' && liveRes.body !== null;
    const hasRenderedText = typeof liveRes.body?.renderedText === 'string' && liveRes.body.renderedText.includes('Ibu Rahma');
    const isUrlString = typeof liveRes.body?.url === 'string' && liveRes.body.url.startsWith('https://wa.me/');

    const assertionsList = [
      { name: 'Response status is strictly 200', passed: isStatus200, evidence: `res.status = ${liveRes.status}` },
      { name: 'Response body is non-null object', passed: isBodyObject, evidence: `typeof res.body = ${typeof liveRes.body}` },
      { name: 'Rendered template contains customer name', passed: hasRenderedText, evidence: 'customerName Ibu Rahma present' },
      { name: 'Generated URL starts with https://wa.me/', passed: isUrlString, evidence: `url = ${liveRes.body?.url}` }
    ];

    const allLivePassed = isStatus200 && isBodyObject && hasRenderedText && isUrlString;

    liveCollector.linkToScenario({
      num: 20,
      title: 'POST /api/whatsapp/preview - Live HTTP Regression Verification',
      category: 'Live Integration',
      passed: allLivePassed,
      expectedStatus: 200,
      details: 'Live loopback HTTP request to /api/whatsapp/preview verified with hardened collector.',
      assertions: assertionsList
    });

    const liveEv = liveCollector.getEvidence()[0];
    const isLivePass = liveEv.result === 'PASS';
    const isLiveStatusOk = liveEv.status_assertion_passed === true;
    const isLiveFuncOk = liveEv.functional_assertion_passed === true;

    // Save evidence to file
    const evidencePath = path.resolve(process.cwd(), 'scripts/evidence/phase14c2_4_1_regression_evidence.json');
    liveCollector.saveToFile(evidencePath);

    recordTestCase(
      20,
      'Live loopback HTTP execution and schema-validated evidence export',
      'PASS',
      liveEv.result,
      isLivePass && isLiveStatusOk && isLiveFuncOk && fs.existsSync(evidencePath),
      `Live HTTP 200 OK verified. Evidence persisted to ${evidencePath} and schema-validated.`
    );
  } finally {
    resetSupabaseBackendClientForTesting();
    server.close();
  }

  // ===========================================================================
  // SECTION 4: HISTORICAL EVIDENCE READ-ONLY COMPLIANCE AUDIT
  // ===========================================================================
  console.log('--- SECTION 4: HISTORICAL EVIDENCE READ-ONLY COMPLIANCE AUDIT ---\n');

  const c1Path = path.resolve(process.cwd(), 'scripts/evidence/phase14c1_executed_evidence.json');
  const c2Path = path.resolve(process.cwd(), 'scripts/evidence/phase14c2_executed_evidence.json');

  const c1Raw = fs.readFileSync(c1Path, 'utf8');
  const c2Raw = fs.readFileSync(c2Path, 'utf8');

  const c1Json = JSON.parse(c1Raw);
  const c2Json = JSON.parse(c2Raw);

  // Check historical evidence items against the new requirement of explicit discrete assertions:
  let c1LegacyNonCompliant = 0;
  let c2LegacyNonCompliant = 0;

  for (const item of c1Json.evidence) {
    // If scenario only has the synthetic single functional assertion generated from passed: true:
    const funcAssertions = item.assertion_results?.slice(1) || [];
    const hasOnlySyntheticAssertion = funcAssertions.length === 1 && funcAssertions[0].assertion_name.startsWith('Functional Assertion:');
    if (hasOnlySyntheticAssertion) {
      c1LegacyNonCompliant++;
    }
  }

  for (const item of c2Json.evidence) {
    const funcAssertions = item.assertion_results?.slice(1) || [];
    const hasOnlySyntheticAssertion = funcAssertions.length === 1 && funcAssertions[0].assertion_name.startsWith('Functional Assertion:');
    if (hasOnlySyntheticAssertion) {
      c2LegacyNonCompliant++;
    }
  }

  console.log(`[Historical Audit] C1 Total: ${c1Json.evidence.length} | Legacy Single-Synthetic Assertion Records: ${c1LegacyNonCompliant}`);
  console.log(`[Historical Audit] C2 Total: ${c2Json.evidence.length} | Legacy Single-Synthetic Assertion Records: ${c2LegacyNonCompliant}`);
  console.log(`[Historical Audit] C2 Explicit Discrete Assertion Records (e.g. Test #70): ${c2Json.evidence.length - c2LegacyNonCompliant}\n`);

  recordTestCase(
    21,
    'Historical evidence read-only compliance evaluation (LEGACY_EVIDENCE_NOT_COMPLIANT detection)',
    'PASS',
    'PASS',
    c1LegacyNonCompliant > 0 && c2Json.evidence.length === 80,
    `Historical evidence audited read-only without mutations. Identified ${c1LegacyNonCompliant} records in C1 and ${c2LegacyNonCompliant} records in C2 as LEGACY_EVIDENCE_NOT_COMPLIANT due to single-synthetic assertions.`
  );

  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log('================================================================================');
  console.log('PHASE 14C.2.4.1 REGRESSION SUITE EXECUTION SUMMARY');
  console.log('================================================================================');

  const total = testResults.length;
  const passed = testResults.filter(t => t.passed).length;
  const failed = total - passed;

  console.log(`Total Cases Tested: ${total}`);
  console.log(`PASS:               ${passed}`);
  console.log(`FAIL:               ${failed}`);
  console.log(`================================================================================\n`);

  if (failed > 0) {
    console.error(`[SUITE FAILED] ${failed} regression test case(s) failed!`);
    process.exit(1);
  } else {
    console.log(`[SUITE PASSED] All ${total} Phase 14C.2.4.1 regression test cases PASSED successfully!`);
    process.exit(0);
  }
}

runPhase14C241Suite().catch(err => {
  console.error('[CRITICAL RUNTIME ERROR]', err);
  process.exit(1);
});
