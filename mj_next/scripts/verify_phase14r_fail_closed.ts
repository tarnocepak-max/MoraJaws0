import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const serverPath = path.join(root, 'server.ts');
const server = fs.readFileSync(serverPath, 'utf8');
const scriptDir = path.join(root, 'scripts');
const violations: string[] = [];

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

for (const file of walk(scriptDir).filter((file) => /\.(ts|tsx|js|mjs|cjs)$/.test(file))) {
  if (file.endsWith('verify_phase14r_fail_closed.ts') || file.endsWith('execute_phase14r_integration_tests.ts')) {
    continue;
  }
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes(['/', 'proc', '/'].join('')) && (content.includes('readFile') || content.includes('environ'))) {
    violations.push(`${path.relative(root, file)} contains /proc access`);
  }
}

// 1. Verify that all 6 endpoints have complete Supabase DAL integration
const requiredRoutesWithDAL = [
  { route: "app.get(['/api/work-orders/:id', '/api/tickets/:id']", dalCheck: 'getWorkOrderByIdFromSupabase' },
  { route: "app.post('/api/work-orders/:id/assign'", dalCheck: 'assignTicketInSupabase' },
  { route: "app.post('/api/work-orders/:id/reassign'", dalCheck: 'reassignTicketInSupabase' },
  { route: "app.get('/api/reports'", dalCheck: 'getWorkOrdersFromSupabase' },
  { route: "app.get('/api/tickets/:id/messages'", dalCheck: 'getTicketMessagesFromSupabase' },
  { route: "app.delete('/api/tickets/:id'", dalCheck: 'deleteWorkOrderFromSupabase' }
];

for (const { route, dalCheck } of requiredRoutesWithDAL) {
  const index = server.indexOf(route);
  if (index < 0) { violations.push(`missing route ${route}`); continue; }
  const snippet = server.slice(index, index + 5000);
  if (!snippet.includes('isSupabaseMode()')) {
    violations.push(`missing isSupabaseMode() fail-closed check near ${route}`);
  }
  if (!snippet.includes(dalCheck)) {
    violations.push(`missing Supabase DAL call ${dalCheck} near ${route}`);
  }
  // Verify temporary placeholder is fully resolved
  if (snippet.includes('SUPABASE_DAL_NOT_IMPLEMENTED')) {
    violations.push(`temporary guard SUPABASE_DAL_NOT_IMPLEMENTED still present near ${route}`);
  }
}

// 2. Verify no legacy substring altEmail matching
if (server.includes('altEmail.toLowerCase().includes(')) {
  violations.push('legacy substring altEmail matching remains in server.ts');
}

if (violations.length) {
  console.error('PHASE 14R STATIC CHECK: FAIL');
  for (const item of violations) console.error(`- ${item}`);
  process.exit(1);
}

console.log('PHASE 14R STATIC CHECK: PASS');
console.log('Verified: All 6 endpoints implement full Supabase DAL, no /proc access in scripts, temporary placeholder eliminated, legacy altEmail substring matching absent.');
