# MORAJAWS PHASE 2.4.5
## Installer Account Authority & RBAC Hardening

**Status: PATCH APPLIED — STATIC RBAC TESTS PASS — FULL BUILD/TYPECHECK BLOCKED BY MISSING DEPENDENCIES**

This patch was applied directly to the latest uploaded MoraJaws ZIP workspace. It does not deploy SQL, run migrations, connect to Supabase for writes, or alter production data.

## 1. Authority rules implemented

### Superadmin
- Cannot create Installer accounts.
- Cannot edit Installer profile/identity fields or change another account into the Installer role.
- Cannot change Installer active/locked status.
- Cannot delete Installer accounts.
- Cannot use standalone session-revocation endpoints against Installer accounts. Password reset remains the supported operation and revokes sessions as part of that flow.
- Can reset an Installer password through the existing authenticated Superadmin reset-password endpoint. The endpoint hashes the submitted password with `hashPasswordWithBcrypt`, increments session version, revokes existing sessions, and records an audit event. Audit metadata does not include the password or password hash.

### Leader / Korlap
- Is the only role allowed to create Installer accounts.
- Must have both contractor and area scope populated on the authenticated Leader account.
- The backend takes contractor and area from the authenticated Leader identity, not from client-supplied contractor/area fields.
- Other roles cannot create Installer accounts.

### Existing Leader edit/delete behavior
The patch does not add new Leader edit/delete powers. Existing Leader management behavior was preserved where already present. The request only explicitly assigns Installer creation to Leader and restricts Superadmin's Installer management authority.

## 2. Files changed

- `server.ts`
  - Hardened `/api/users`, `/api/admin/users`, and `/api/supabase/users` create routes.
  - Blocked Superadmin edits, status changes, deletion, and standalone session revocation for Installer targets across legacy and alternate API routes.
  - Added authentication and Superadmin Installer protection to legacy `/api/users/sync-profile` local-mode endpoint.
  - Kept Superadmin password reset route available; it hashes password, bumps session version, revokes sessions, and audits the action.
  - Restricted Leader Installer creation to the authenticated Leader contractor and area scope.
- `src/context/AppContext.tsx`
  - Installer registration is Leader-only and fails closed when contractor or area scope is missing.
  - Blocks Superadmin from Installer profile edit, status toggle, and deletion in client state actions.
- `src/components/users/UserManagementView.tsx`
  - Removed Installer from Superadmin create/edit role dropdowns.
  - Hides edit/status/delete/session controls for Installer rows while retaining Reset Password.
  - Updated explanatory UI copy.
- `package.json`
  - Added `test:phase2.4.5` runner.
- `scripts/execute_phase2_4_5_rbac_test.mjs`
  - Added source-level RBAC regression assertions.
- `scripts/evidence/*`
  - Captured test output, static assertions, syntax transpilation, and blocked build/typecheck attempts.

## 3. Test evidence

### Static RBAC source assertions
Command: `npm run test:phase2.4.5`

**27/27 PASS, 0 FAIL.** Checks cover:
- Installer creation restrictions on all identified create endpoints.
- Leader contractor and area scope fail-closed behavior.
- Superadmin profile/status/delete/session-revoke restrictions across alternate endpoints.
- Superadmin reset-password route remains available and uses bcrypt hashing plus session revocation.
- AppContext guards and UserManagement UI restrictions.

Evidence: `scripts/evidence/phase2_4_5_rbac_test.json` and `scripts/evidence/phase2_4_5_test_output.log`.

### TypeScript syntax transpilation
A TypeScript transpilation-only parser check was run on:
- `server.ts`
- `src/context/AppContext.tsx`
- `src/components/users/UserManagementView.tsx`

**3/3 PASS, no syntax diagnostics.** This is not a full typecheck.

Evidence: `scripts/evidence/phase2_4_5_typescript_syntax.json`.

### Full typecheck and production build
- `tsc --noEmit`: BLOCKED (exit 2) because `vite/client` type definitions are unavailable in this ZIP workspace; `node_modules` is absent.
- `npm run build`: BLOCKED (exit 127) because `vite` is not installed in this ZIP workspace; `node_modules` is absent.

Evidence:
- `scripts/evidence/phase2_4_5_typecheck_attempt.log`
- `scripts/evidence/phase2_4_5_typecheck_exit_code.txt`
- `scripts/evidence/phase2_4_5_build_attempt.log`
- `scripts/evidence/phase2_4_5_build_exit_code.txt`

Do not interpret the static checks as proof of full application build or live API runtime behavior.

## 4. Supabase and deployment status

- No Supabase SQL executed.
- No migration deployed.
- No production data changed.
- Migration 014 remains a draft and still requires a separate schema review and explicit approval before deployment.

## 5. Remaining limitations / next verification

1. Install dependencies using the project's committed lockfile in Google AI Studio or another build environment.
2. Run full `npm run lint` and `npm run build`.
3. Run authenticated HTTP integration tests against an isolated test database/mock server, not production.
4. Verify that the live Supabase custom-login user records carry reliable `contractor` and `area` fields for Leader scope.
5. Review remaining legacy Firestore paths separately; this phase only hardens the account authority paths identified above.

**Conclusion:** The source patch is applied and the static RBAC regression suite passes. PHASE 2.4.5 is not declared fully production-ready because full build/typecheck and authenticated runtime integration could not be executed in this workspace. No Supabase deployment was performed.
