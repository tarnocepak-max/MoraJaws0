/**
 * MORAJAWS — EVIDENCE COLLECTOR MODULE
 * 
 * Captures real HTTP request/response metrics during test suite execution.
 * Enforces strict integrity rules:
 * - actual_status is ALWAYS read from real HTTP response (res.status or res.statusCode)
 * - actual_status is NEVER copied from expected_status
 * - result is dynamically evaluated: actual_status === expected_status ? 'PASS' : 'FAIL'
 * - Every evidence record includes suite, scenario, method, url, source_line,
 *   timestamps, test_run_id, and environment identifier.
 */

import fs from 'fs';
import path from 'path';

export interface RealHttpEvidence {
  suite: string;
  test_scenario: string;
  scenario_number?: number;
  category?: string;
  method: string;
  url: string;
  source_line: number;
  token_role: string | null;
  expected_status: number;
  actual_status: number;
  result: 'PASS' | 'FAIL';
  timestamp: string;
  test_run_id: string;
  environment: string;
  response_code?: string;
  response_summary?: string;
}

interface PendingHttpCall {
  method: string;
  url: string;
  source_line: number;
  token_role: string | null;
  actual_status: number;
  response_body: any;
  timestamp: string;
}

export class SuiteEvidenceCollector {
  private suiteName: string;
  private testRunId: string;
  private environment: string;
  private pendingCalls: PendingHttpCall[] = [];
  private completedEvidence: RealHttpEvidence[] = [];

  constructor(suiteName: string, environment = 'isolated_mock_staging_loopback') {
    this.suiteName = suiteName;
    this.environment = environment;
    this.testRunId = `run_${suiteName.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  getTestRunId(): string {
    return this.testRunId;
  }

  /**
   * Called immediately when a real HTTP response is received over the wire.
   */
  recordHttpCall(params: {
    method: string;
    url: string;
    token?: string | null;
    actualStatus: number;
    responseBody: any;
    callerStack?: string;
  }) {
    let sourceLine = 0;
    if (params.callerStack) {
      const match = params.callerStack.match(/:(\d+):\d+/);
      if (match) {
        sourceLine = parseInt(match[1], 10);
      }
    }

    let tokenRole: string | null = null;
    if (params.token) {
      const tok = params.token.toLowerCase();
      if (tok.includes('superadmin')) tokenRole = 'super_admin';
      else if (tok.includes('dispatch')) tokenRole = 'dispatch';
      else if (tok.includes('leader')) tokenRole = 'leader';
      else if (tok.includes('installer')) tokenRole = 'installer';
      else if (tok.includes('mgmt')) tokenRole = 'management_data';
      else if (tok.includes('itsupport')) tokenRole = 'it_support';
      else tokenRole = 'authenticated';
    }

    this.pendingCalls.push({
      method: params.method.toUpperCase(),
      url: params.url,
      source_line: sourceLine,
      token_role: tokenRole,
      actual_status: params.actualStatus,
      response_body: params.responseBody,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Called by recordTest to bind recently executed HTTP call(s) to a test scenario.
   */
  linkToScenario(params: {
    num: number;
    title: string;
    category: string;
    expectedStatus?: number;
    details?: string;
  }) {
    if (this.pendingCalls.length === 0) {
      // Non-HTTP scenario (e.g. dist file secret scan)
      return;
    }

    const callsToLink = [...this.pendingCalls];
    this.pendingCalls = [];

    // Precise expected status map for known test scenarios
    const c1ExpectedMap: Record<number, number | number[]> = {
      1: 200, 2: 500, 3: 400, 4: 403, 5: 200, 6: 500, 7: 400, 8: 403,
      9: 200, 10: 503, 11: 404, 12: 403, 13: 200, 14: 503, 15: 404, 16: 403,
      17: 200, 18: 503, 19: 400, 20: 403, 21: [200, 201], 22: 503, 23: 400, 24: 403,
      25: [200, 200], 26: 503, 27: 404, 28: 403, 29: 200, 30: 503, 31: 404, 32: 403,
      33: 200, 34: 503, 35: 404, 36: 403, 37: [200, 200], 38: 503, 39: 400, 40: 403,
      41: [200, 200], 42: 503, 43: 400, 44: 403, 45: [200, 200], 46: 503, 47: 400, 48: 403,
      49: 200, 50: 503, 51: 400, 52: 401, 53: 401, 54: 401, 55: 401, 56: 403,
      57: 403, 58: 403, 59: 403, 60: 403, 61: 403, 62: 403, 63: 403, 64: 403,
      65: 403
    };

    const c2ExpectedMap: Record<number, number> = {
      1: 200, 2: 503, 3: 400, 4: 400, 5: 401, 6: 200, 7: 400, 8: 400, 9: 400, 10: 401,
      11: 200, 12: 401, 13: 403, 14: 200, 15: 503, 16: 401, 17: 403, 18: 400, 19: 403, 20: 400,
      21: 200, 22: 403, 23: 400, 24: 401, 25: 403, 26: 403, 27: 403, 28: 400, 29: 401, 30: 403,
      31: 200, 32: 403, 33: 403, 34: 200, 35: 401, 36: 403, 37: 200, 38: 403, 39: 403, 40: 200,
      41: 401, 42: 200, 43: 403, 44: 400, 45: 403, 46: 403, 47: 200, 48: 200, 49: 401, 50: 415,
      51: 200, 52: 400, 53: 403, 54: 400, 55: 200, 56: 403, 57: 403, 58: 403, 59: 403, 60: 403,
      61: 403, 62: 403, 63: 401, 64: 403, 65: 403, 66: 403, 67: 403, 68: 401, 69: 403, 70: 200,
      71: 403, 72: 200, 73: 503, 74: 405, 75: 200, 76: 200, 77: 403, 78: 403, 79: 200, 80: 503
    };

    for (let i = 0; i < callsToLink.length; i++) {
      const call = callsToLink[i];
      let expectedStatus = params.expectedStatus;

      if (!expectedStatus) {
        if (this.suiteName === 'Phase14C.1') {
          const mapped = c1ExpectedMap[params.num];
          if (Array.isArray(mapped)) {
            expectedStatus = mapped[i] !== undefined ? mapped[i] : mapped[0];
          } else if (typeof mapped === 'number') {
            expectedStatus = mapped;
          }
        } else if (this.suiteName === 'Phase14C.2') {
          const mapped = c2ExpectedMap[params.num];
          if (typeof mapped === 'number') {
            expectedStatus = mapped;
          }
        }
      }

      // Final fallback if not in map
      if (!expectedStatus) {
        const text = `${params.title} ${params.details || ''}`;
        if (text.includes('400') || text.includes('Rejected (HTTP 400)')) expectedStatus = 400;
        else if (text.includes('401') || text.includes('Unauthenticated Rejected (HTTP 401)')) expectedStatus = 401;
        else if (text.includes('403') || text.includes('Forbidden (HTTP 403)')) expectedStatus = 403;
        else if (text.includes('404') || text.includes('Not Found')) expectedStatus = 404;
        else if (text.includes('405') || text.includes('Blocked (HTTP 405)')) expectedStatus = 405;
        else if (text.includes('415') || text.includes('Rejected (HTTP 415)')) expectedStatus = 415;
        else if (text.includes('500') || text.includes('HTTP 500')) expectedStatus = 500;
        else if (text.includes('503') || text.includes('Fail-Closed (HTTP 503)')) expectedStatus = 503;
        else expectedStatus = 200;
      }

      let responseCode: string | undefined = undefined;
      let summary: string | undefined = undefined;

      if (call.response_body && typeof call.response_body === 'object') {
        responseCode = call.response_body.code || call.response_body.error?.code ||
          (typeof call.response_body.error === 'string' ? call.response_body.error : undefined);
        if (call.response_body.message) summary = String(call.response_body.message);
      }

      const result: 'PASS' | 'FAIL' = call.actual_status === expectedStatus ? 'PASS' : 'FAIL';

      this.completedEvidence.push({
        suite: this.suiteName,
        test_scenario: params.title,
        scenario_number: params.num,
        category: params.category,
        method: call.method,
        url: call.url,
        source_line: call.source_line,
        token_role: call.token_role,
        expected_status: expectedStatus,
        actual_status: call.actual_status, // REAL STATUS READ FROM HTTP RESPONSE!
        result,
        timestamp: call.timestamp,
        test_run_id: this.testRunId,
        environment: this.environment,
        response_code: responseCode,
        response_summary: summary
      });
    }
  }

  getEvidence(): RealHttpEvidence[] {
    return this.completedEvidence;
  }

  saveToFile(filePath: string) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const output = {
      suite: this.suiteName,
      test_run_id: this.testRunId,
      environment: this.environment,
      generated_at: new Date().toISOString(),
      total_http_calls_executed: this.completedEvidence.length,
      all_passed: this.completedEvidence.every(e => e.result === 'PASS'),
      evidence: this.completedEvidence
    };
    fs.writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`[EvidenceCollector] Wrote ${this.completedEvidence.length} real HTTP evidence records to ${filePath}`);
    return output;
  }
}
