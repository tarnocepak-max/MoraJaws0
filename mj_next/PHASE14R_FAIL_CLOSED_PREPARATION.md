# PHASE 14R — FAIL-CLOSED PREPARATION NOTES

This ZIP contains a narrow safety patch based on the audit findings in the uploaded project.

## Applied changes
- Removed cross-process `/proc/<pid>/environ` scraping from the seven affected scripts. They now use only the current Node process environment and report missing credentials as blocked.
- Changed alternate-email matching from substring matching to exact matching against comma/semicolon-separated entries.
- Added explicit HTTP 503 fail-closed guards in Supabase mode to six endpoints that were confirmed to access local JSON directly: WO detail, assign, reassign, reports, ticket message history, and WO delete. This intentionally prevents silent local JSON fallback; these routes are temporarily unavailable in Supabase mode until a proper Supabase DAL implementation is completed and tested.
- Added `npm run test:phase14r:static`, a static source check only.

## Important architecture discrepancy to resolve
The audited source still describes Firebase Authentication as the primary authentication system and local persistent JSON as the primary database in `/api/health`. This conflicts with the intended target architecture (Supabase Auth + Supabase PostgreSQL, Express as the only Supabase access layer). Do not claim the migration architecture is complete. AI Studio must inspect and report this discrepancy before changing authentication or database adapters.

## Not done
- No database/schema/data changes.
- No account creation/deletion.
- No production migration or deployment.
- No claim of build/runtime success.
- No full Supabase DAL implementation for the six guarded endpoints.

## Required next work
Implement proper Supabase DAL reads/writes for the six guarded endpoints, preserve RBAC and existing response contracts, then add mock-based integration tests proving: (1) Supabase success uses DAL; (2) Supabase failure returns 503; (3) no JSON mutation/save occurs in Supabase mode; (4) local JSON is used only under an explicitly enabled non-production local mode. Reconcile Auth architecture separately and do not switch production auth without approval.
