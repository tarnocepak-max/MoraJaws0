import {
  insertSystemErrorLogToSupabase,
  getSystemErrorLogByIdFromSupabase,
  deleteSystemErrorLogFromSupabase,
  sanitizeSensitiveData
} from '../server/supabaseAdapter.ts';

async function runPhase7Verification() {
  console.log('================================================================');
  console.log('MORAJAWS — PHASE 7 SYSTEM ERROR LOG ADAPTER ALIGNMENT TEST');
  console.log('================================================================\n');

  const testId = 'WO-SANDBOX-ERROR-001';

  // 1. Test Sanitization Function in Isolation
  console.log('--- TEST 1: Sensitive Data Sanitization ---');
  const rawData = {
    apiKey: 'AIzaSyD-secret-key-12345',
    password: 'super_secret_password',
    bearerToken: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz',
    authorization: 'Basic dXNlcjpwYXNz',
    nested: {
      clientSecret: 'secret_token_abc',
      safeParam: 'public_value_ok'
    },
    regularField: 'Allowed telemetry metadata'
  };

  const sanitized = sanitizeSensitiveData(rawData);
  console.log('Raw data keys:', Object.keys(rawData));
  console.log('Sanitized output:', JSON.stringify(sanitized, null, 2));

  const sanitizationPass =
    sanitized.password === '[REDACTED]' &&
    sanitized.apiKey === '[REDACTED]' &&
    sanitized.bearerToken === '[REDACTED]' &&
    sanitized.nested.clientSecret === '[REDACTED]' &&
    sanitized.nested.safeParam === 'public_value_ok' &&
    sanitized.regularField === 'Allowed telemetry metadata';

  console.log('Sanitization Test Pass:', sanitizationPass ? 'YES [OK]' : 'NO [FAIL]');
  if (!sanitizationPass) throw new Error('Sanitization failed');

  // 2. Test Insertion with Sandbox Identity WO-SANDBOX-ERROR-001
  console.log('\n--- TEST 2: Insert Error Log (WO-SANDBOX-ERROR-001) ---');
  const testPayload = {
    id: testId,
    error_code: 'ERR_SANDBOX_PHASE7_TEST',
    severity: 'HIGH' as const,
    message: 'Phase 7 alignment verification test record for system error logs',
    stack_trace: 'Error: simulated stack\n    at verifyPhase7 (/scripts/verify_phase7_error_log.ts:32:11)',
    // Legacy mapping parameters:
    module: 'work-orders',
    operation: 'POST /api/work-orders/WO-SANDBOX-ERROR-001/sync',
    status: 'RESOLVED' as const,
    technical_details: 'Simulated connection interruption during offline queue playback',
    firebase_error_code: 'firestore/unavailable',
    user_id: 'sandbox_user_korlap_001',
    request_id: 'req_phase7_sandbox_001',
    // Sensitive payload to be sanitized:
    payload: {
      password: 'mypassword123',
      service_role_key: 'sbp_dummy_token_999',
      wo_number: testId,
      subzone: 'AREA-KORLAP-01'
    }
  };

  const insertSuccess = await insertSystemErrorLogToSupabase(testPayload);
  console.log('Insert Result:', insertSuccess ? 'SUCCESS [OK]' : 'FAILED [ERROR]');
  if (!insertSuccess) throw new Error('Insertion failed');

  // 3. Test Read-Back Verification
  console.log('\n--- TEST 3: Read-Back Verification from Supabase ---');
  const record = await getSystemErrorLogByIdFromSupabase(testId);
  console.log('Read-back Record from remote Supabase:');
  console.log(JSON.stringify(record, null, 2));

  if (!record) {
    throw new Error('Failed to retrieve record by ID: ' + testId);
  }

  const assertions = [
    { label: 'ID matches', pass: record.id === testId },
    { label: 'error_code matches', pass: record.error_code === 'ERR_SANDBOX_PHASE7_TEST' },
    { label: 'source mapped from module', pass: record.source === 'work-orders' },
    { label: 'endpoint mapped from operation', pass: record.endpoint === '/api/work-orders/WO-SANDBOX-ERROR-001/sync' },
    { label: 'http_method extracted', pass: record.http_method === 'POST' },
    { label: 'is_resolved mapped from status=RESOLVED', pass: record.is_resolved === true },
    { label: 'technical_details in metadata', pass: record.metadata?.technical_details === 'Simulated connection interruption during offline queue playback' },
    { label: 'firebase_error_code in metadata', pass: record.metadata?.firebase_error_code === 'firestore/unavailable' },
    { label: 'password redacted in metadata', pass: record.metadata?.password === '[REDACTED]' },
    { label: 'service_role_key redacted in metadata', pass: record.metadata?.service_role_key === '[REDACTED]' },
    { label: 'safe data preserved in metadata', pass: record.metadata?.wo_number === testId }
  ];

  console.log('\nAssertion Results:');
  let allPassed = true;
  for (const a of assertions) {
    console.log(`  - ${a.label}: ${a.pass ? 'PASS [OK]' : 'FAIL [X]'}`);
    if (!a.pass) allPassed = false;
  }

  if (!allPassed) {
    throw new Error('Some assertions failed during read-back verification');
  }

  // 4. Test Safe Failure Handling (Application Flow Protection)
  console.log('\n--- TEST 4: Safe Error Handling (No Throw / No App Crash) ---');
  try {
    // Calling with null/undefined required values or unusual structure should not throw
    const safeResult = await insertSystemErrorLogToSupabase({
      error_code: '',
      message: ''
    } as any);
    console.log('Safe handler returned boolean without throwing uncaught exception:', typeof safeResult === 'boolean');
  } catch (err: any) {
    console.error('FAILED: Error thrown outside handler!', err);
    throw err;
  }

  // 5. Cleanup Test Record
  console.log('\n--- TEST 5: Clean Up Sandbox Record ---');
  const deleteSuccess = await deleteSystemErrorLogFromSupabase(testId);
  console.log('Delete Result:', deleteSuccess ? 'SUCCESS [CLEANED]' : 'FAILED [ERROR]');

  const verifyDeleted = await getSystemErrorLogByIdFromSupabase(testId);
  console.log('Verification after delete (should be null):', verifyDeleted === null ? 'CONFIRMED NULL [OK]' : 'STILL EXISTS [X]');

  console.log('\n================================================================');
  console.log('PHASE 7 ALIGNMENT VERIFICATION COMPLETED SUCCESSFULLY!');
  console.log('================================================================');
}

runPhase7Verification().catch((err) => {
  console.error('Verification failed with error:', err);
  process.exit(1);
});
