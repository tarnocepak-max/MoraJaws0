# MoraJaws0 — Phase 15A.2 Security Hardening (Targeted Patch)

## Scope completed in this ZIP
- Supabase Auth login now returns `NEEDS_MAPPING` for every staff profile with a missing `authUserId`; a coincidental match between staff ID and Auth UID no longer bypasses explicit approval.
- Auth UID mapping now fails closed when the authoritative staff directory cannot be read, before checking 1:1 uniqueness. Existing read-back verification remains in place.
- Removed the unscoped `client.auth.signOut()` call from the shared backend client logout path. Logout relies on the already implemented authoritative `sessionVersion` increment plus read-back verification, which is checked during token verification.
- Disabled the legacy `passwordHash` change-password path in Supabase mode. It returns `SUPABASE_PASSWORD_CHANGE_NOT_IMPLEMENTED` instead of changing a local hash and falsely implying the Supabase Auth password changed. Use the Supabase Auth recovery flow until a per-user password update flow is implemented.
- Added `npm run test:phase15a.2` static guard checks.

## Explicitly NOT completed / production blockers
- Frontend still stores the auth session/access token in `localStorage` and sends Bearer tokens. This patch does NOT migrate all API calls to HttpOnly Secure SameSite cookies.
- Refresh token is still sent through the browser request body.
- A safe per-user in-session Supabase password update flow is not implemented; the legacy change-password route is intentionally blocked in Supabase mode.
- No real Supabase staging login, refresh, logout, or password test was performed.
- No SQL migration was executed; no Supabase data, Auth users, WO records, or production settings were changed.

## Deployment status
**NOT PRODUCTION READY.** This is a targeted code hardening patch, not a production release. Do not deploy until cookie/session architecture and real staging verification are completed.

## Validation
Static guard script added. Runtime/build/test execution is not claimed in this artifact. Run `npm run test:phase15a.2` and `npm run lint` in a controlled development environment.
