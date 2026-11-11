# MORAJAWS PHASE 16A.4 — SUPABASE AUTHORITATIVE DATA ACCESS & FAIL-CLOSED REMEDIATION

**Status:** Implemented code remediation + static verification. Not production-cutover approved.  
**Baseline:** User-uploaded `morajaws0 (6).zip`.  
**Scope:** Backend read/write routing for core Work Order, assignment, report, chat, and deletion endpoints.  
**Production impact:** Zero database mutations. No SQL migration was executed.

## 1. Executive result

This phase fixes a high-risk split-brain condition: when Supabase mode was enabled, several routes could still read or write the in-memory/local JSON store if a Supabase operation failed or if local JSON mode was also permitted. Some successful Supabase writes could also continue into a local JSON write path.

The affected core routes now fail closed in Supabase mode. A Supabase error is returned to the caller; it is not hidden by reading local JSON. A successful Supabase mutation returns immediately and does not continue into a local JSON mutation.

## 2. Code changes

Updated `server.ts`:

- `GET /api/work-orders`: returns 503 when the Supabase read fails; local JSON is used only when Supabase mode is not active and local mode is explicitly allowed.
- `GET /api/work-orders/:id` and `GET /api/tickets/:id`: no local lookup after a Supabase-mode failure or not-found result.
- `PUT/PATCH /api/tickets/:id`: Supabase lookup/update is authoritative; local persistence is explicitly restricted to non-Supabase local mode.
- `POST /api/tickets/assign`: batch assignment reports Supabase success/failure directly; local assignment runs only in non-Supabase local mode.
- `POST /api/tickets/reassign`: local fallback is restricted to non-Supabase local mode.
- `POST /api/work-orders/:id/assign` and `POST /api/work-orders/:id/reassign`: successful Supabase writes return immediately; local fallback cannot execute in Supabase mode.
- `GET /api/reports`: Supabase read failure returns 503 rather than reading `db.tickets`.
- `GET /api/tickets/:id/messages`: verifies leader scope and messages through Supabase; Supabase lookup/query failures return 503 rather than reading local ticket/message arrays.
- `DELETE /api/tickets/:id`: Supabase deletion success returns immediately; local JSON mutation is explicitly non-Supabase-only. Protected production WO IDs remain blocked.

Updated `MORAJAWS_PHASE16A_MIGRATION_PLAN.md`:

- Corrected the architecture plan to preserve MoraJaws Custom Authentication.
- Removed the contradictory instruction to create/link accounts in `auth.users`.
- Clarified that Supabase Auth must not be used; Express validates internal credentials/sessions in PostgreSQL tables.

Added:
- `scripts/execute_phase16a4_supabase_fail_closed_test.mjs`
- `scripts/evidence/phase16a4_*`
- `PHASE16A4_START_HERE.md`
- `PHASE16A4_IMPLEMENTATION_REPORT.md`
- `PHASE16A4_LIVE_SUPABASE_AUDIT.md`
- `PHASE16A4_NEXT_PHASE_CHECKLIST.md`

## 3. Verification evidence

| Check | Result |
|---|---:|
| Static fail-closed assertions | 18/18 PASS |
| TypeScript transpile syntax check (`server.ts`) | 1/1 PASS |
| `npm run lint` | BLOCKED |
| `npm run build` | BLOCKED |
| Supabase production mutation | 0 |

`npm run lint` could not complete because the archive has no installed dependencies and TypeScript cannot resolve `vite/client` (`TS2688`). `npm run build` could not complete because the Vite executable is not installed/usable (`vite: Permission denied`). These are environment/dependency blockers, not a passing build. Full typecheck, build, and authenticated runtime tests remain required after dependencies are installed in a clean environment.

The 18/18 suite is a static source assertion suite. It verifies code structure and fail-closed guards; it is not a live API test. The existing PHASE 2.4.5 RBAC static regression suite was also rerun: 27/27 PASS.

## 4. Fresh read-only Supabase production audit

The connected Supabase project was inspected read-only.

| Item | Live result |
|---|---:|
| Public tables | 21 |
| Tables with RLS enabled | 21 |
| Public RLS policies | 0 |
| Work Orders | 17 |
| Users | 4 |
| Auth sessions | 23 |
| Refresh tokens | 23 |
| Login attempts | 52 |
| Attachments rows | 0 |
| Migration ledger entries | 3 |

The live migration ledger contains:
- `20261104200712_lock_public_schema_to_express_backend`
- `20261104200723_restrict_public_schema_usage_to_backend`
- `20261111153915_add_missing_foreign_key_indexes`

Additional live-schema findings:
- `public.users.firebase_uid` still exists (unique, nullable).
- `public.attachments.storage_provider` still defaults to `firebase_storage`.
- The private bucket `morajaws-reports` exists.
- The public schema is intended to be accessed through the Express backend; earlier grant inspection showed `anon` and `authenticated` do not have `USAGE` on `public`, while `service_role` does.
- RLS being enabled with zero policies is not itself proof of public exposure when direct public-role schema access is revoked. Do not add generic `auth.uid()` policies: this application uses custom authentication, not Supabase Auth.

No schema/data change was made during this audit.

**Important migration-file conflict:** `migrations/005_add_auth_user_id_to_users.sql` is a draft that adds an FK to `auth.users`. It contradicts the owner requirement for MoraJaws Custom Authentication. It is not in the live migration ledger and MUST NOT be deployed. The local `migrations/` directory contains more migration files than the three entries recorded live; reconcile every file against the live ledger before any future deployment.

## 5. Firebase decommission is NOT complete

A source scan found Firebase/Firestore references in 44 active source files under `src/` and `server/` (964 textual matches, including imports, compatibility code, comments, and identifiers). This is an inventory count, not a count of runtime Firebase requests.

Highest-priority remaining files include:
- `src/context/AppContext.tsx`
- `src/services/firestoreDb.ts`
- `src/lib/firebase.ts`
- `src/context/NavigationContext.tsx`
- `src/services/navigationFirestore.ts`
- `src/context/UIConfigContext.tsx`
- `src/components/settings/DroplistManagementView.tsx`
- `src/services/storageCompatibility.ts`
- `server/firebaseAdmin.ts`
- `src/components/uiBuilder/UIConfigurationBuilder.tsx`

The source still includes Firebase dependencies and a Firebase Admin module. The `.env.example` still lists Firebase environment variable names. These have deliberately NOT been deleted in this phase because the application still contains Firebase-backed feature paths and migration dependencies.

## 6. Required next phase

**PHASE 16A.5 — Firebase Feature-Path Replacement (Firestore → Supabase Express APIs)**

Before removing Firebase SDKs:
1. Build a feature-by-feature call graph for Firestore reads/writes, including app settings, navigation, UI config, dropdown categories, user profiles, and WO/chat attachments.
2. Implement/verify Supabase Express endpoints and repository methods for every required feature.
3. Migrate React contexts and components away from Firestore, preserving existing UI and RBAC.
4. Verify no active frontend or backend imports reference `firebase` / `firebase-admin`.
5. Run a clean install, full `tsc --noEmit`, production build, route integration tests, and feature regression tests.
6. Only then proceed to Firebase Auth/Storage cleanup and dependency removal in a later gated phase.

Do not remove `firebase`, `firebase-admin`, `firebaseAdmin.ts`, or legacy backup data until all call sites are replaced and verified.

## 7. Safety and approval gates

- No production DDL/DML was executed.
- No migration was deployed.
- No Firebase project/resource was deleted or disabled.
- No credentials or secret values were added to the ZIP.
- Do not deploy Migration 014 or any new migration as part of this phase.
- Keep the three protected soft-deleted production WO records unchanged.
- Production cutover requires clean build/typecheck, runtime integration tests, backup/hash verification, reconciliation, rollback rehearsal, and explicit owner approval.
