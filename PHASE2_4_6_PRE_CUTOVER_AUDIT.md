# MORAJAWS PHASE 2.4.6
## Supabase Single Source of Truth — Pre-Cutover Audit

**Status: READ-ONLY SOURCE AUDIT COMPLETE — CUTOVER BLOCKED BY LEGACY PERSISTENCE PATHS**

### 1. Objective

Prepare the next Supabase database transition without changing the live database, deploying migrations, deleting legacy services, or risking existing operational data. The intended architecture remains:

- Supabase PostgreSQL is the only authoritative operational database.
- MoraJaws uses its own internal username/password session system; Supabase Auth is not the login provider.
- Google Sheets and Firebase/Firestore are not operational databases or authentication providers for the target architecture.
- Google Maps and WhatsApp integrations may remain as external services where already required.

### 2. Audit method and scope

The audit scans project source files under `src/` and `server/`, plus `server.ts` and `package.json`. It excludes archived prompt assets and generated reports from the source inventory. It records matching lines and counts for Firebase/Firestore, Google Sheets, Supabase, and local fallback terms.

This is a static source inventory. A text occurrence is not automatically proof that the code path executes at runtime. Each listed call site must be classified as active, disabled, compatibility-only, dead code, or UI-only during the implementation phase.

### 3. Findings

The audit scanned **124 source/config files** and found:

| Area | Files with matches | Text occurrences | Assessment |
|---|---:|---:|---|
| Firebase / Firestore | 40 | 751 | Blocking; legacy integration is still present in application source |
| Google Sheets | 15 | 342 | Blocking; old configuration, UI, and integration surfaces remain |
| Supabase | 27 | 1,653 | Supabase adapter and API implementation are present |

Firebase packages still exist in `package.json`:
- `firebase`
- `firebase-admin`

Critical source findings:
1. `src/context/AppContext.tsx` still imports `src/lib/firebase` and many write/read helpers from `src/services/firestoreDb.ts`.
2. `AppContext.tsx` still exposes Firestore connectivity/loading state and invokes Firestore persistence helpers for work orders, users, contractors, coverage areas, reports, categories, audit logs, and settings.
3. Firebase sign-in compatibility remains represented in client context (`loginWithFirebase`) even though that method currently returns an error directing users to internal MoraJaws login.
4. `server.ts` still imports Firebase Admin helpers, exposes Firebase compatibility/health information, contains a legacy Firebase login route, and retains `firebaseUid` compatibility fields.
5. Google Sheets configuration, sync service, UI, navigation labels, and related types remain in the source tree. These must be removed or redesigned only after confirming which screens and import workflows are still needed. Excel/CSV/text import must remain available; it must not be confused with Google Sheets integration.
6. `firebase` and `firebase-admin` dependencies must not be removed until all imports and runtime dependencies are eliminated and build/tests pass.

Detailed line-level inventories are stored in:
- `scripts/evidence/phase2_4_6_pre_cutover_audit.json`
- `scripts/evidence/phase2_4_6_pre_cutover_audit_output.log`

### 4. Cutover readiness verdict

**NOT READY FOR REMOTE DATABASE CUTOVER.** The audit intentionally reports blockers rather than pretending the target architecture is complete. The presence of Supabase adapters does not establish that every UI operation reads and writes Supabase as the sole source of truth.

Do not:
- execute Migration 014 or any other pending migration;
- run a production cutover;
- delete Firestore data or Firebase project resources;
- remove Firebase dependencies before replacing all active imports/call sites;
- delete Google Sheets screens before preserving required text/Excel/CSV import workflows;
- enable a dual-write mode as a substitute for a single source of truth.

### 5. Required implementation sequence

1. Build a domain-by-domain persistence matrix for WO, assignments, installer reports, users, roles, contractors, coverage areas, chat, attachments, audit logs, templates, droplists, navigation, and global settings.
2. For every `AppContext` Firestore operation, identify its existing Supabase API/adapter equivalent. Where none exists, implement and test the Supabase endpoint before switching the caller.
3. Switch reads and writes one domain at a time, preserving authorization, validation, audit logging, soft-delete semantics, and error handling. No silent local/Firestore fallback may report success when Supabase has not committed.
4. Replace Firestore real-time subscriptions with the agreed Supabase Realtime or explicit refresh strategy, and test reconnect/offline behavior.
5. Remove Firebase Authentication compatibility only after verifying that all login/session flows use internal MoraJaws authentication.
6. Remove Google Sheets synchronization/configuration surfaces while preserving manual Excel/CSV/TXT/JSON import and export workflows.
7. Remove Firebase packages and dead services only after repository-wide import checks, typecheck, build, and runtime integration tests pass.
8. Separately review Migration 014 and the live schema. Deployment requires explicit approval; this phase does not authorize it.
9. Perform direct Supabase verification on an isolated/staging environment before any production cutover.

### 6. Test evidence

Command:

```bash
npm run audit:phase2.4.6
```

The audit completed successfully and generated the JSON inventory. Its result is **NOT READY** because the expected legacy blockers were detected. This is a successful audit execution, not a passing cutover-readiness test.

Full application build/typecheck was not attempted because the ZIP workspace has no installed `node_modules`. No credentials were read or printed.

### 7. Database and deployment safety

- No Supabase connection was opened by the audit.
- No SQL was executed.
- No migration was deployed.
- No production or staging data was read or changed.
- Migration 014 remains an unapproved draft.

**Conclusion:** PHASE 2.4.6 pre-cutover source audit is complete. MoraJaws is not yet ready for the remote database cutover. The next implementation must replace the remaining Firestore and Google Sheets runtime paths with Supabase-backed operations while retaining the custom MoraJaws login system.
