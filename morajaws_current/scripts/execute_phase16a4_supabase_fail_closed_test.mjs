import fs from 'node:fs';

const source = fs.readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const checks = [];
const check = (name, condition) => checks.push({ name, passed: Boolean(condition) });
const section = (start, end) => {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  return a >= 0 && b > a ? source.slice(a, b) : '';
};

const workOrders = section("app.get('/api/work-orders'", "app.get(['/api/work-orders/:id'");
check('GET work-orders fails closed when Supabase read fails',
  workOrders.includes("return res.status(503)") && !/else if\s*\(!isLocalJsonModeAllowed\(\)\)/.test(workOrders));
check('GET work-orders reads JSON only when Supabase mode is not active',
  workOrders.includes("else if (isLocalJsonModeAllowed())") && workOrders.includes("tickets = db.tickets"));

const getOne = section("app.get(['/api/work-orders/:id'", "app.post(['/api/work-orders/:id/assign'");
check('GET single work order never falls back to JSON in Supabase mode',
  getOne.includes("else if (isLocalJsonModeAllowed())") && !getOne.includes("if (!ticket) {\n      ticket = db.tickets"));
check('GET single work order returns 503 on Supabase failure', getOne.includes("else if (!supaRes.success)") && getOne.includes("DATABASE_UNAVAILABLE"));

const update = section("const handleUpdateTicket =", "app.put('/api/tickets/:id'");
check('PUT/PATCH update returns Supabase result directly', update.includes("return res.json({ success: true, ticket: updatedTicket })"));
check('PUT/PATCH local persistence is explicitly non-Supabase only', update.includes("if (!isSupabaseMode() && isLocalJsonModeAllowed())"));
check('PUT/PATCH cannot fallback to local ticket after Supabase lookup', update.includes("!currentTicket && !isSupabaseMode() && isLocalJsonModeAllowed()"));

const bulkAssign = section("app.post('/api/tickets/assign'", "app.post('/api/tickets/reassign'");
check('Bulk assignment returns Supabase outcome even if local mode flag is enabled', bulkAssign.includes("if (results.length === 0 && errors.length > 0)") && bulkAssign.includes("return res.json({\n          success: true"));
check('Bulk assignment local write is non-Supabase only', bulkAssign.includes("if (!isSupabaseMode() && isLocalJsonModeAllowed())"));

const bulkReassign = section("app.post('/api/tickets/reassign'", "app.post(['/api/tickets/:id/report'");
check('Reassignment local write is non-Supabase only', bulkReassign.includes("if (!isSupabaseMode() && isLocalJsonModeAllowed())"));

const assignOne = section("app.post(['/api/work-orders/:id/assign'", "app.post(['/api/work-orders/:id/reassign'");
check('Single assignment returns immediately after Supabase success', assignOne.includes("return res.json({\n          success: true") && assignOne.includes("if (!isSupabaseMode() && isLocalJsonModeAllowed())"));

const reassignOne = section("app.post(['/api/work-orders/:id/reassign'", "// Dedicated Technical Report Endpoints");
check('Single reassignment returns immediately after Supabase success', reassignOne.includes("return res.json({\n          success: true") && reassignOne.includes("if (!isSupabaseMode() && isLocalJsonModeAllowed())"));

const reports = section("app.get('/api/reports'", "// Legacy sync check & run");
check('Reports endpoint fails closed on Supabase error', reports.includes("return res.status(503)") && !reports.includes("else if (!isLocalJsonModeAllowed())"));
check('Reports endpoint local data source is non-Supabase only', reports.includes("else if (isLocalJsonModeAllowed())"));

const messages = section("app.get('/api/tickets/:id/messages'", "app.post('/api/tickets/:id/messages'");
check('Chat endpoint returns 503 on Supabase lookup/query failure', messages.includes("return res.status(503)") && messages.includes("DATABASE_UNAVAILABLE"));
check('Chat endpoint local read is guarded by local-only mode', messages.includes("if (!isLocalJsonModeAllowed())") && messages.includes("db.ticketMessages.filter"));

const deletion = section("app.delete('/api/tickets/:id'", "// Bulk Delete Work Orders");
check('Delete endpoint returns after Supabase deletion success', deletion.includes("return res.json({ success: true, message: `Work Order ${target.woNumber} berhasil dihapus.` })"));
check('Delete endpoint cannot mutate local JSON in Supabase mode', deletion.includes("if (!isSupabaseMode() && isLocalJsonModeAllowed())"));

const failed = checks.filter(x => !x.passed);
console.log(JSON.stringify({ suite: 'PHASE16A4_SUPABASE_FAIL_CLOSED', total: checks.length, passed: checks.length-failed.length, failed: failed.length, checks }, null, 2));
if (failed.length) process.exit(1);
