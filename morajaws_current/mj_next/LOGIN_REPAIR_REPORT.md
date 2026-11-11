# MORAJAWS0 — LOGIN REPAIR REPORT (BASED ON LATEST UPLOAD)

## Source
`morajaws0 (1).zip` — 256 entries; archive integrity passed before editing.

## Confirmed source-level findings
1. The login UI calls `POST /api/auth/supabase-login` with `{ identifier, password }`.
2. Backend resolves the staff profile, then calls Supabase Auth `signInWithPassword`.
3. The previous adapter converted every Supabase Auth sign-in failure into `auth/wrong-password`. This incorrectly presented provider/network/confirmation errors as credential mismatch.
4. The adapter selected only `authoritativeUser.email`; if the primary email was empty while `altEmail` was populated, it attempted to use the username/identifier as the Supabase Auth email.
5. The backend rate limiter could count profile mapping/configuration errors as bad-password attempts, potentially locking an account even when the password was not the cause.
6. Auth UID mapping is intentionally strict: unmapped profiles return `NEEDS_MAPPING`; this repair does NOT auto-map an Auth UID.

## Changes made
- `server/supabaseAuthAdapter.ts`
  - Uses primary email, then registered `altEmail`.
  - Returns a specific safe error when no valid Auth email exists.
  - Distinguishes invalid credentials, unconfirmed email, disabled/banned account, provider/network outage, and other provider errors.
  - Does not expose provider internals or credentials.
- `server.ts`
  - Maps configuration/provider errors to HTTP 503.
  - Maps mapping/profile conflicts to HTTP 409.
  - Counts only genuine invalid credential/provider failures toward bad-login throttling; profile mapping/configuration errors no longer consume password attempts.
- `src/context/AppContext.tsx`
  - Gives distinct actionable user-facing messages for `NEEDS_MAPPING`, `AUTH_UID_MISMATCH`, missing auth email, unconfirmed email, and provider outage.

## Important boundaries
- No Supabase credentials or real account credentials were available in the ZIP.
- No live Supabase login could be attempted.
- No account, Auth UID mapping, password, database row, WO, migration, or production configuration was changed.
- This repair cannot make an actually incorrect password valid. If Supabase returns `AUTH_INVALID_CREDENTIALS`, the account email/password must be verified by the account owner/admin using the official Supabase Auth account-management process.
- Full HttpOnly cookie migration remains incomplete in this source: current frontend still uses Bearer token/localStorage. This ZIP does not claim otherwise.

## Verification status
- ZIP input integrity: PASS.
- Static source assertions for the three intended fixes: PASS.
- Node runtime available: Node v22.16.0.
- Dependency install / TypeScript build / runtime tests: BLOCKED because this ZIP has no `node_modules` and no lockfile; dependencies were not installed in this environment.
- Live Supabase authentication: NOT TESTED (no authorized credentials or connected project access).

## Next manual validation
1. Upload this ZIP to the same Google AI Studio project and replace the old source with the full ZIP.
2. Build and run in the target environment.
3. Try the same staff username/email and password once.
4. If it fails, capture only the visible error code/message and HTTP status. Do not share passwords, access tokens, refresh tokens, or service-role keys.
5. If result is `NEEDS_MAPPING`, Super Admin must verify the staff profile and approve the Auth UID mapping. Do not bypass this check.
6. If result is `AUTH_INVALID_CREDENTIALS`, verify the Supabase Auth email and password through the authorized account owner/admin; do not modify the staff profile passwordHash as a workaround.
