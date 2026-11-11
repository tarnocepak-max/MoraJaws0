import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const source = fs.readFileSync(path.join(root, 'src/services/firestoreDb.ts'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const appContext = fs.readFileSync(path.join(root, 'src/context/AppContext.tsx'), 'utf8');
const results = [];
function check(name, fn) {
  try { fn(); results.push({ name, status: 'PASS' }); }
  catch (error) { results.push({ name, status: 'FAIL', error: error?.message || String(error) }); }
}
function functionBody(name, nextName) {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} not found`);
  const end = source.indexOf(`export async function ${nextName}`, start + 1);
  return source.slice(start, end < 0 ? source.length : end);
}
for (const [name,next] of [
  ['saveContractorToFirestore','deleteContractorFromFirestore'],
  ['deleteContractorFromFirestore','saveCoverageAreaToFirestore'],
  ['saveCoverageAreaToFirestore','deleteCoverageAreaFromFirestore'],
  ['deleteCoverageAreaFromFirestore','sendChatMessageToFirestore']
]) {
  check(`${name}: routes through authenticated Express API, no Firestore SDK write`, () => {
    const body = functionBody(name,next);
    assert.match(body, /requestAuthenticatedApi/);
    assert.doesNotMatch(body, /\b(doc|setDoc|updateDoc|deleteDoc)\s*\(/);
    assert.doesNotMatch(body, /COLLECTIONS\.(CONTRACTORS|COVERAGE_AREAS)/);
  });
}
check('Authenticated API helper sends cookies and app auth headers', () => {
  assert.match(source, /credentials:\s*'include'/);
  assert.match(source, /getAuthHeaders\(\)/);
  assert.match(source, /if \(!response\.ok \|\| payload\?\.success === false\)/);
});
check('Firestore-disabled subscription hydrates WO, contractors, coverage, and users through API', () => {
  const start = source.indexOf('export function subscribeToMoraJawsFirestore');
  const end = source.indexOf('// 1. Tickets Real-Time Listener', start);
  const body = source.slice(start, end);
  for (const endpoint of ['/api/work-orders','/api/contractors','/api/coverage-areas','/api/users']) {
    assert.ok(body.includes(endpoint), `missing ${endpoint}`);
  }
  assert.match(body, /callbacks\.onTicketsChange/);
  assert.match(body, /callbacks\.onContractorsChange/);
  assert.match(body, /callbacks\.onCoverageAreasChange/);
  assert.match(body, /callbacks\.onUsersChange/);
});
check('Contractor endpoints exist with expected methods', () => {
  for (const route of ["app.get('/api/contractors'","app.post('/api/contractors'","app.put('/api/contractors/:id'","app.delete('/api/contractors/:id'"]) assert.ok(server.includes(route),route);
});
check('Coverage endpoints exist with expected methods', () => {
  for (const route of ["app.get('/api/coverage-areas'","app.post('/api/coverage-areas'","app.put('/api/coverage-areas/:id'","app.delete('/api/coverage-areas/:id'"]) assert.ok(server.includes(route),route);
});
check('Production AppContext hydrates initial API snapshots before subscribing to realtime SSE', () => {
  const start = appContext.indexOf("if (!isFirestoreActiveForEnvironment())");
  const end = appContext.indexOf("      setFirestoreLoading(true);\n      setFirestoreStatus('connecting');", start + 1);
  const body = appContext.slice(start, end);
  assert.match(body, /subscribeToMoraJawsFirestore/);
  assert.match(body, /onContractorsChange/);
  assert.match(body, /onCoverageAreasChange/);
  assert.match(body, /onUsersChange/);
  assert.match(body, /morajaws_auth_session/);
  assert.match(body, /matchingUser\.active === false/);
  assert.match(body, /setCurrentUser\(matchingUser\)/);
  assert.match(body, /onTicketsChange/);
  assert.match(body, /subscribeToChanges/);
  assert.match(body, /unsubApiSnapshots\(\)/);
});
check('AppContext no longer performs a Firestore health write', () => {
  assert.doesNotMatch(appContext, /pingFirestore\s*\(/);
  assert.doesNotMatch(appContext, /pingFirestore\s*,/);
});
const failed = results.filter(item => item.status !== 'PASS');
console.log(JSON.stringify({ phase:'16A.7', total:results.length, passed:results.length-failed.length, failed:failed.length, results }, null, 2));
if (failed.length) process.exit(1);
