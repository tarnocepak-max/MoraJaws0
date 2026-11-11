import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const protectedScripts = [
  'scripts/audit_supabase_db_schema.ts',
  'scripts/execute_phase3_real_sandbox_test.ts',
  'scripts/execute_phase4_adapter_integration_test.ts',
  'scripts/execute_phase5_feature_integration_test.ts',
  'scripts/execute_phase6_database_integration_test.ts',
  'scripts/test_phase6_rls_security.ts',
  'scripts/test_realtime_sandbox.ts'
];

const results = [];
function check(name, fn) {
  try { fn(); results.push({ name, status: 'PASS' }); }
  catch (error) { results.push({ name, status: 'FAIL', error: error?.message || String(error) }); }
}

for (const relative of protectedScripts) {
  check(`${relative}: uses explicit dotenv loading`, () => {
    const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    assert.match(source, /import\s+['"]dotenv\/config['"];/);
  });
  check(`${relative}: does not inspect another process environment`, () => {
    const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    assert.doesNotMatch(source, /readFileSync\s*\(\s*`\/proc\/|readdirSync\s*\(\s*['"]\/proc['"]|\/proc\//);
  });
}

check('all scripts/server source: no direct proc environ scraping', () => {
  const dirs = ['scripts', 'server'];
  const violations = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) {
        const source = fs.readFileSync(full, 'utf8');
        if (/readFileSync\s*\(\s*`\/proc\/\$\{[^}]+\}\/environ`/.test(source) ||
            /readdirSync\s*\(\s*['"]\/proc['"]/.test(source)) {
          violations.push(path.relative(ROOT, full));
        }
      }
    }
  }
  for (const dir of dirs) if (fs.existsSync(path.join(ROOT, dir))) walk(path.join(ROOT, dir));
  assert.deepEqual(violations, []);
});

const server = fs.readFileSync(path.join(ROOT, 'server.ts'), 'utf8');
const routeCases = [
  { name: 'GET work-order detail', start: "app.get(['/api/work-orders/:id', '/api/tickets/:id']", end: "app.post(['/api/work-orders/:id/assign'" },
  { name: 'POST work-order assign', start: "app.post(['/api/work-orders/:id/assign'", end: "app.post(['/api/work-orders/:id/reassign'" },
  { name: 'POST work-order reassign', start: "app.post(['/api/work-orders/:id/reassign'", end: "app.get(['/api/work-orders/:id/technical-report'" },
  { name: 'GET reports', start: "app.get('/api/reports'", end: '// Legacy sync check & run' },
  { name: 'GET ticket messages', start: "app.get('/api/tickets/:id/messages'", end: "app.post('/api/tickets/:id/messages'" },
  { name: 'DELETE ticket', start: "app.delete('/api/tickets/:id'", end: '// Bulk Delete Work Orders' }
];
for (const route of routeCases) {
  check(`${route.name}: Supabase-first and local-only fallback guard`, () => {
    const start = server.indexOf(route.start);
    assert.notEqual(start, -1, `route start not found: ${route.start}`);
    const end = server.indexOf(route.end, start + route.start.length);
    assert.notEqual(end, -1, `route end not found: ${route.end}`);
    const body = server.slice(start, end);
    assert.match(body, /isSupabaseMode\(\)/, 'missing Supabase mode branch');
    assert.match(body, /isLocalJsonModeAllowed\(\)/, 'missing explicit local JSON gate');
    assert.match(body, /503/, 'missing unavailable/fail-closed response');
  });
}

const failed = results.filter(item => item.status !== 'PASS');
console.log(JSON.stringify({ phase: '16A.6', total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length) process.exit(1);
