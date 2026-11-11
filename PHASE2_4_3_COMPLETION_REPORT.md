# MORAJAWS PHASE 2.4.3 — BACKEND ASSIGNMENT & INSTALLER ID ALIGNMENT

## Status
- Source patch: applied to this ZIP only.
- Static acceptance: 25/25 PASS.
- TypeScript syntax transpilation: 7/7 files PASS (zero syntax diagnostics).
- Supabase deployment: NOT PERFORMED.
- Supabase data/schema modification: NOT PERFORMED.
- Full npm build/typecheck: NOT COMPLETED because this extracted ZIP has no installed node_modules; the existing `tsc --noEmit` check stops at missing `vite/client` type definitions. This is an environment/dependency limitation, not a passing build.

## Changes
1. Added `installerUserId` to the application Ticket type and Supabase row read/write/update mapping (`installer_user_id`).
2. Added `resolveInstallerAccountInSupabase()` which resolves the account by `users.id`, verifies role `installer`, active state, non-archived/non-deleted state, and Leader contractor scope. Installer display names are canonicalized from the database; names are not authorization identifiers.
3. Initial assignment and reassignment adapters require an installer account ID. Both persist the account ID on `work_orders.installer_user_id` and retain the ID in assignment-history JSON payload.
4. API endpoints for single/bulk assignment and reassignment require `installerId` / `newInstallerId` when running in Supabase mode.
5. Technician assignment and reassignment endpoints enforce the business rule that only the Leader role may assign an installer.
6. AppContext sends account IDs. If the UI's selected display name maps to zero or multiple active installer accounts, it sends no ID and the backend rejects the request (fail-closed).
7. Installer work-order authorization now compares only `ticket.installerUserId === user.id`. Name, username, phone, and legacy UID matching no longer grant access.
8. Installer dashboard and installer portal current-user ticket filtering use the immutable installer user ID.
9. Rollback snapshots for assignment/reassignment preserve the previous installer user ID.

## Files changed
- `server.ts`
- `server/supabaseAdapter.ts`
- `server/supabaseStorage.ts`
- `src/context/AppContext.tsx`
- `src/types/index.ts`
- `src/components/portals/InstallerDashboardView.tsx`
- `src/components/portals/InstallerPortal.tsx`
- `package.json`
- `scripts/execute_phase2_4_3_assignment_id_test.mjs`
- `scripts/check_phase2_4_3_syntax.mjs`
- `scripts/evidence/phase2_4_3_assignment_id_evidence.json`
- `scripts/evidence/phase2_4_3_syntax_evidence.json`
- `migrations/014_phase2_4_2_schema_and_installer_identity.sql` (pending migration draft; not executed)

## Deployment dependency / warning
The active Supabase schema inspected earlier does not yet contain `work_orders.installer_user_id`. This code expects migration 014 to be reviewed and deployed first. Do not deploy this application patch against the current live schema before that migration is approved and applied. The migration is included as a draft only.

## Test scope
The 25 acceptance assertions are source-level checks for ID propagation, role/account validation, contractor scope, endpoint enforcement, rollback, and ID-only installer access. Syntax evidence uses TypeScript `transpileModule` on seven changed TS/TSX source files. Neither test proves a successful live Supabase transaction or a full application build.

## No-deployment confirmation
No `apply_migration`, SQL write, table alteration, row update, Supabase RPC deployment, or Supabase data mutation was performed during PHASE 2.4.3.
