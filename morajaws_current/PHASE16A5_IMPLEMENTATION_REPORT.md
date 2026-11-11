# PHASE 16A.5 Implementation Report

## Objective
Replace the first group of active Firestore feature paths—application configuration, UI builder configuration, navigation, and droplist configuration—with the existing authenticated Express-to-Supabase settings API.

## Architecture after this patch
React UI → authenticated Express API → `public.app_settings` via the server-side Supabase adapter.

The browser does not receive a Supabase service-role key and does not use Supabase Auth. Custom MoraJaws authentication remains authoritative.

## Modified files
- `src/services/firestoreDb.ts`
- `src/services/navigationFirestore.ts`
- `package.json`
- `scripts/execute_phase16a5_firestore_settings_replacement_test.mjs`
- `scripts/evidence/*`
- `PHASE16A5_START_HERE.md`
- `PHASE16A5_IMPLEMENTATION_REPORT.md`
- `PHASE16A5_NEXT_PHASE_CHECKLIST.md`

## Technical details
The existing Express routes `GET/POST /api/supabase/settings/:key` are reused. Reads and writes carry MoraJaws authentication headers and cookies. The client throws on non-2xx or unsuccessful responses. Navigation and settings no longer silently report success after failed writes.

The `global` settings record is read and merged before a write to avoid unintentionally dropping unrelated settings keys. This is a client-side read/merge/write and should later be upgraded to an atomic server-side merge operation to avoid concurrent-write races.

## Validation results
| Check | Result |
|---|---:|
| PHASE 16A.5 static assertions | 18/18 PASS |
| PHASE 16A.4 regression | 18/18 PASS |
| PHASE 2.4.5 RBAC regression | 27/27 PASS |
| TypeScript syntax transpilation | 2/2 PASS |
| Full typecheck | BLOCKED: missing `vite/client` types |
| Production build | BLOCKED: Vite executable unavailable |

## Database safety
No SQL files were executed. No schema, policy, RLS, role, user, ticket, or other production database data was modified. No migration was deployed.

## Remaining work
Continue with feature-by-feature migration of contractors/coverage, users/custom auth, WO and assignment paths, chat, audit logs, reports, storage, error logging, and legacy Firebase modules. Keep Firebase dependencies until all imports and active runtime paths are replaced and verified.
