# PHASE 16A.3 — FIREBASE REMOVAL CHECKLIST

This checklist is a gate for the later implementation phases. It is not authorization to perform production changes.

## A. Application data paths
- [ ] Every Firestore read/write in `firestoreDb.ts` has a verified Express/Supabase replacement.
- [ ] AppContext uses only Supabase APIs for WO, users, contractors, areas, messages, audit logs and categories.
- [ ] NavigationContext reads/writes the canonical `app_settings` record through Express.
- [ ] UIConfigContext reads/writes the same canonical settings contract; no duplicate config storage path.
- [ ] DroplistManagementView uses Supabase APIs for general, hierarchical, chat and report categories.
- [ ] Error logging uses `system_error_logs` and is non-blocking.
- [ ] Production startup never seeds demo/sample data.
- [ ] Offline cache is treated as a cache/queue only, never a competing production database.

## B. Authentication
- [ ] `/api/auth/login`, `/refresh`, `/logout` and password recovery use MoraJaws custom auth only.
- [ ] Firebase ID tokens are rejected/removed from all active paths.
- [ ] Supabase Auth JWT fallback is removed from protected middleware.
- [ ] `public.users.password_hash`, `auth_sessions`, `refresh_tokens`, `login_attempts`, `session_version` remain authoritative.
- [ ] Reset password, deactivation and logout revoke sessions and invalidate old tokens.
- [ ] RBAC, contractor/area scope and installer assignment checks run server-side.

## C. Storage and backup
- [ ] Existing Firebase Storage objects inventoried with path, owner, MIME, bytes, hash and references.
- [ ] All needed objects copied to private `morajaws-reports` bucket or retained in a documented archive.
- [ ] `attachments` metadata references the new provider/path and signed URL lifecycle is tested.
- [ ] No Firebase Storage URL is required by current UI or API.
- [ ] Backup download uses only MoraJaws custom token.
- [ ] Historical Firestore backup is retained outside runtime source and its SHA-256 is verified.

## D. Build/dependency/config
- [ ] No runtime import from `firebase` or `firebase-admin` remains.
- [ ] No Firebase SDK is included in production browser bundle.
- [ ] `package.json` and lockfile remove Firebase packages together.
- [ ] Firebase config/rules/blueprint archived then removed from active app source.
- [ ] Firebase environment variables removed from deployment secrets only after zero-reference verification.
- [ ] Supabase production/staging URL and secret-key isolation verified at startup.
- [ ] Service-role/secret key never appears in frontend, source maps, logs or API responses.

## E. Release gate
- [ ] Clean dependency install succeeds.
- [ ] Typecheck and production build pass.
- [ ] All existing tests pass or are explicitly reconciled.
- [ ] New runtime API tests cover each entity and all role boundaries.
- [ ] Realtime SSE reconnect/event authorization tests pass.
- [ ] Storage upload/download/authorization tests pass.
- [ ] Staging end-to-end test passes against a staging project.
- [ ] Owner approves production cutover and rollback plan.
- [ ] Owner separately approves Firebase project/data deletion after retention window.
