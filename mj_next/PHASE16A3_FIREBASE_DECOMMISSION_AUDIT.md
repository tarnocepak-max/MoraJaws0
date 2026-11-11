# MORAJAWS — PHASE 16A.3
## Firebase Decommission & Supabase Single-Source-of-Truth Audit

**Status:** AUDIT COMPLETE / IMPLEMENTATION NOT STARTED  
**Baseline:** Uploaded `morajaws0 (5).zip`  
**Audit date:** 2026-11-12 (Asia/Jakarta)  
**Production mutation:** NONE — read-only inspection only  
**Target:** React/Vite → Express API → Supabase PostgreSQL + Supabase Storage; internal MoraJaws custom login (NOT Supabase Auth)

---

## 1. Executive conclusion

Firebase cannot yet be removed safely from this codebase. It is not merely a package/config residue: the browser bundle still imports Firebase modules through application contexts and services, and backend compatibility code still exposes Firebase-specific health/auth behavior. Several production paths are already intended to use Supabase, but the migration is incomplete and there are still Firestore-only settings/droplist flows.

**The safe next action is a controlled code migration, not immediate deletion of Firebase packages.** This phase is an audit and removal blueprint only. It does not change production code paths, database schema, data, environment variables, Firebase projects, or backups.

The user's explicit architecture requirement is applied here: **MoraJaws internal username/email + password login remains custom-authenticated by Express using bcrypt/password hashes in `public.users`, with session and refresh-token records in PostgreSQL. Supabase Auth is not part of the target login design.** This overrides contradictory older project notes in the ZIP that describe Supabase Auth as the production identity provider.

## 2. Confirmed code-level Firebase dependency map

| Layer / file | Current behavior | Required replacement before deletion |
|---|---|---|
| `src/lib/firebase.ts` | Initializes Firebase App, Firestore and Firebase Auth on frontend import; exposes ping/connection/error helpers | Remove from runtime graph; health and DB probe must use Express `/api/health` / `/api/supabase/status` only |
| `src/services/firestoreDb.ts` | Large Firestore data-access module: live listeners and writes for WO, contractors, coverage areas, messages, audit logs, templates, users, app settings, user preferences, droplists and report categories | Replace every live operation with a typed call to existing Express `/api/supabase/*` endpoints or add a single non-duplicated backend endpoint where coverage is missing |
| `src/context/AppContext.tsx` | Imports Firestore services and Firebase Auth; contains production branch that subscribes to Supabase SSE but retains Firestore dev branch, seeding, refresh and audit listeners; also imports Google Sheets service | Remove Firestore lifecycle, seeding and Firebase logout; route all data refresh and mutations through Supabase repository/API; keep internal login flow |
| `src/services/navigationFirestore.ts` | Direct Firestore read/write/onSnapshot for navigation configuration | Persist navigation under `app_settings` through existing Express settings API; use SSE or explicit refresh for updates |
| `src/context/NavigationContext.tsx` | Loads navigation from Firestore and automatically seeds defaults when absent | Load from Supabase settings; default values may remain local defaults, but do not silently seed production without a deliberate owner action |
| `src/context/UIConfigContext.tsx` | Firestore cloud load/save/subscription for UI configuration and navigation | Move to the same canonical settings API; avoid maintaining a second settings persistence implementation |
| `src/components/settings/DroplistManagementView.tsx` | Directly imports Firestore save/subscribe methods for droplists | Add/confirm backend API for general + hierarchical droplists and report categories, then use it exclusively |
| `src/services/errorSystem.ts` | Logs system errors to Firestore `system_error_logs` | Use existing Supabase `system_error_logs` adapter/endpoint; ensure logging is best-effort and never leaks secrets |
| `src/services/backupDownloadService.ts` | Primarily uses MoraJaws token but still falls back to `auth.currentUser.getIdToken()` | Remove Firebase token fallback; preserve the controlled backup download endpoint and archival JSON artifact |
| `server/firebaseAdmin.ts` | Firebase Admin SDK initialization and Firebase ID-token verification | Remove after all Firebase auth verification/compatibility routes and health references are removed; retain only independent backup artifacts, not SDK |
| `server.ts` | Imports Firebase Admin; exposes Firebase health/config fields and legacy Firebase login route/compatibility identity fields | Remove Firebase middleware/types/route/health metadata after proving no supported client requires them |
| `server/sandbox/*` | Sandbox-only simulation names and test cases reference Firestore journals / Firebase UID | Decide whether sandbox simulation is still required; if retained, make it provider-neutral and ensure it never calls Firebase production |
| `firebase-applet-config.json`, `firestore.rules`, `firebase-blueprint.json` | Firebase project config, security rules and legacy blueprint | Archive outside runtime source after data/backup retention review; then remove from application build/repository if no references remain |
| `package.json` | `firebase` and `firebase-admin` are runtime dependencies | Remove only after static import graph and production build prove zero imports |

### Critical distinction
`isFirestoreActiveForEnvironment()` disables Firestore behavior in production, but this does **not** mean Firebase is removed. Static imports remain in the module graph, `src/lib/firebase.ts` initializes Firebase when imported, and UI contexts still contain Firestore code paths. A production feature flag is not a decommission.

## 3. Authentication architecture — mandatory correction

### Desired internal login flow
1. Browser submits identifier + password to `POST /api/auth/login`.
2. Express `customAuthService.loginWithCustomAuth()` resolves the staff profile from Supabase PostgreSQL `public.users`.
3. Password is verified against `password_hash` (bcrypt; legacy hashes are rehashed only through the approved code path).
4. Express persists `auth_sessions`, `refresh_tokens`, and `login_attempts`; raw token values are not stored in PostgreSQL.
5. Browser receives MoraJaws access/refresh tokens and calls protected Express APIs.
6. Every protected request validates token hash/session state, expiry, revocation, and `session_version`; role/contractor/area are loaded from authoritative staff profile.
7. Logout/reset/deactivation revokes sessions and increments version where required.

### Conflicting/obsolete auth code to retire
- `server.ts` imports `signInWithSupabaseAuth`, `verifySupabaseAuthToken`, `refreshSupabaseAuthSession`, `signOutSupabaseAuth`, `resetSupabaseAuthPassword`, and `approveAuthUidMapping` from `server/supabaseAuthAdapter.ts`.
- `resolveUserFromHeader()` first validates custom MoraJaws tokens but then accepts a JWT-shaped token via `verifySupabaseAuthToken()` as a fallback. This is incompatible with the user's explicit requirement that login not use Supabase Auth.
- Firebase token route/identity fields remain in server source and health output even though the frontend's `loginWithFirebase()` now rejects Firebase login.

**Required change in a later implementation phase:** keep custom-auth token validation as the only production authentication mechanism. Remove the Supabase Auth JWT fallback and Firebase token path; do not remove the `auth_sessions`, `refresh_tokens`, `login_attempts`, `password_hash`, or `session_version` PostgreSQL mechanisms. The `auth` in those table names refers to MoraJaws custom session management, not Supabase Auth.

## 4. Supabase backend configuration review

### Current backend client
`server/supabaseClient.ts` creates a server-only singleton using `@supabase/supabase-js`. It requires `SUPABASE_URL` plus a service-role/secret key and disables persisted auth sessions/automatic refresh. The frontend module `src/services/supabaseClient.ts` is a status/proxy client only and returns `null` for a direct browser Supabase client.

### Environment variables found in `.env.example`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `SUPABASE_STORAGE_ENABLED`
- Firebase variables: `FIREBASE_API_KEY`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_PROJECT_ID`
- `GOOGLE_CLOUD_PROJECT_ID`, `GOOGLE_OAUTH_ACCESS_TOKEN`, `CORS_ALLOWED_ORIGINS`, `ENABLE_SSE_SANDBOX`, `SANDBOX_SUPER_ADMIN_EMAILS`

No actual `.env` file was found in the uploaded project. No credential values were copied into the report. `SUPABASE_ANON_KEY` is not required for the current service-role-only backend data-access model; it should not be added to frontend code. Keep the service-role/secret key exclusively in server secret storage.

### Configuration risks to address
1. `server/supabaseClient.ts` resolves a generic `SUPABASE_URL` and service key independently of the more elaborate `server/environmentConfig.ts`; verify that environment isolation is consistent across all startup paths.
2. `.env.example` does not document the staging/production split implemented in `environmentConfig.ts` (e.g. `STAGING_*` / `PRODUCTION_*`). It should be aligned before any deployment.
3. `SUPABASE_STORAGE_ENABLED` is optional in the example; file uploads must fail closed when the bucket/config is missing, not silently fall back to Firebase Storage or Base64.
4. No Firebase configuration should remain in the production environment after the final cutover, but remove it only after the app has zero Firebase imports and all existing files have a retention/relocation decision.

## 5. Live Supabase read-only verification

Project inspected: `wiahuupjgpadxqiiarzi` (`https://wiahuupjgpadxqiiarzi.supabase.co`). Only metadata/SELECT queries and Supabase read-only project tools were used.

| Item | Observed result |
|---|---|
| Public tables | 21 |
| RLS | Enabled on all 21 public tables |
| Public RLS policies | 0 |
| `anon` schema USAGE | false |
| `authenticated` schema USAGE | false |
| `service_role` schema USAGE | true |
| Public table grants | service_role + postgres; no anon/authenticated grants observed |
| Storage buckets | `morajaws-reports` exists and is private |
| Storage policies | 0 policies observed in `storage` schema |
| Live migration history | 3 entries: `lock_public_schema_to_express_backend`, `restrict_public_schema_usage_to_backend`, `add_missing_foreign_key_indexes` |
| Security advisor | 21 `rls_enabled_no_policy` informational findings |

### Interpretation
The absence of public RLS policies is not automatically a public data leak in this architecture because the live metadata also shows no `public` schema USAGE for `anon` or `authenticated`, and no public table grants for those roles. The Express backend uses the privileged server-side service-role client. Therefore backend authorization is the primary row-level gate; it must be rigorously tested for every endpoint and must never trust browser-supplied role, user ID, contractor, or area values.

Do not add blanket `auth.uid()` policies: the target app login is custom MoraJaws auth and does not issue Supabase Auth user JWTs. Do not expose the public schema or grant `anon`/`authenticated` access merely to silence the advisor. If the access model changes in the future, design policies for the actual custom-auth boundary first.

The private `morajaws-reports` bucket is present, but no `storage` policies were observed. With backend-only access this can be valid if Express uses the service-role client and enforces authorization before issuing upload/download/signed URLs. Verify every storage endpoint and object path authorization before moving attachments.

## 6. Data model and feature coverage

Existing PostgreSQL tables include core entities and security/session structures: `users`, `roles`, `work_orders`, `contractors`, `coverage_areas`, `assignment_history`, `ticket_messages`, `technical_reports`, `wa_templates`, `app_settings`, `user_preferences`, `attachments`, `audit_logs`, `system_error_logs`, `auth_sessions`, `refresh_tokens`, `login_attempts`, `user_sessions`, `session_config`, `integration_configs`, and `sync_history`.

Existing Express/Supabase route families include work orders (list/detail/create/update/soft-delete/archive/restore/bulk import), users, contractors, coverage areas, app settings, audit logs, realtime SSE, assignment/reassignment and technical reports. `src/services/supabaseDb.ts` already wraps many operations through Express.

### Coverage gaps / areas requiring route-by-route proof
- Ticket message CRUD and real-time chat must be reconciled to `ticket_messages` and the existing API; don't assume an adapter alone means UI has switched.
- Navigation and UI configuration need one canonical `app_settings` persistence contract.
- General droplists, hierarchical droplists, chat categories and report dropdown categories need explicit Supabase CRUD/read contracts; some currently still use Firestore functions.
- Attachments must use `morajaws-reports` private bucket and `attachments` metadata; legacy Firebase URLs need a migration/retention strategy before URL classification is removed.
- Audit/error logs must write to `audit_logs` / `system_error_logs`, not Firestore; preserve current `event_at` vs `created_at` schema names.
- Realtime: current UI production branch subscribes to Express SSE; verify reconnect, role filtering, event types, deletion, and no missed events. Supabase docs recommend Broadcast for scalable secure realtime; Postgres Changes is simpler but each event is authorized per subscriber. Keep the current server SSE abstraction unless a measured design decision changes it.
- Work order operations that still touch `db.tickets` directly must be closed before local JSON is removed; this audit did not approve replacing those paths by blind endpoint redirects.

## 7. Recommended target request flow

```text
React UI / contexts
    |
    | HTTPS + MoraJaws custom access token
    v
Express route + authentication middleware
    |
    | customAuthService validates session/version in PostgreSQL
    | backend RBAC + contractor/area + assignment scope
    v
Supabase server client (service_role/secret only)
    |
    +--> PostgreSQL tables / RPC transactions
    +--> private Storage bucket: morajaws-reports
    +--> server-side realtime fanout / SSE
```

Browser must not import `firebase`, `firebase-admin`, or `@supabase/supabase-js`; it must not receive Supabase service-role/secret keys. All user data reads/writes and Storage operations pass through Express.

## 8. Safe phased decommission sequence

### Phase 16A.4 — Replace Firestore feature paths with Supabase APIs
- Implement one canonical settings repository/API for navigation, UI config, general/hierarchical droplists, report/chat categories.
- Replace `AppContext` Firestore reads/writes/seeding/listeners with existing Supabase repository/API.
- Replace `NavigationContext`, `UIConfigContext`, `DroplistManagementView` and `errorSystem` Firestore calls.
- Replace Firestore realtime listeners with authenticated SSE subscriptions, with correct event types and role scoping.
- Remove Firebase token fallback from backup download service.
- Keep UI behavior and role rules unchanged.

### Phase 16A.5 — Remove legacy authentication paths
- Keep only `POST /api/auth/login`, `/refresh`, `/logout`, password reset/recovery, and custom token/session middleware.
- Remove Firebase login/token verification and Supabase Auth JWT verification/fallback from production middleware.
- Remove Firebase Admin health/config response fields and `firebase-admin` import.
- Ensure custom session tests cover all roles, revocation, refresh replay, password reset, deactivation, and database outage.

### Phase 16A.6 — Storage migration and compatibility closure
- Inventory every existing attachment URL/object path and storage provider metadata.
- Migrate or deliberately archive existing Firebase Storage objects; verify object count, byte size, hash, MIME, metadata and access scope.
- Ensure all new upload/download operations use the private Supabase bucket and Express authorization.
- Update `attachments.storage_provider` defaults/legacy records only under an approved migration plan.

### Phase 16A.7 — Remove Firebase source and packages
- Confirm zero runtime imports/references in `src/`, `server.ts`, and server runtime modules.
- Remove `firebase`, `firebase-admin`, `firebase-applet-config.json`, `firestore.rules`, `firebase-blueprint.json`, Firebase-only service modules and environment variables only when no active reference remains.
- Keep historical backup files outside the runtime source and preserve their SHA-256 evidence.
- Run clean install, lockfile update, lint, build, test suite, browser bundle scan, API integration and staging smoke tests.

### Phase 16A.8 — Production cutover approval
- Verify production Supabase config, schema/migration parity, data reconciliation, role boundaries, backups and rollback plan.
- Execute production cutover only after explicit owner approval.
- Do not delete the Firebase project/data until a separate owner approval and retention window have been completed.

## 9. Hard blockers before deleting Firebase

1. Direct Firestore imports remain in browser modules.
2. AppContext has a Firestore initialization/seed/listener branch.
3. Navigation and UI config contexts still use Firestore persistence.
4. Droplist management and error logging still import Firestore modules.
5. Backup download service still contains Firebase ID-token fallback.
6. Backend still imports Firebase Admin and reports Firebase compatibility state.
7. `server.ts` still has Firebase login/identity compatibility code.
8. Supabase Auth JWT fallback remains in `resolveUserFromHeader()` even though the requested final design is custom MoraJaws login.
9. Attachment schema default is still `firebase_storage`; legacy Firebase Storage URLs are still recognized.
10. `package.json` still includes both Firebase packages.
11. Google Sheets UI/service is present and coupled to Firebase Auth. Project context says Google Sheets is no longer part of MoraJaws; remove this integration separately and completely, but do not confuse Google Maps/WhatsApp integrations with Firebase dependencies.
12. Supabase endpoint coverage for all Firestore collections must be proven before deleting `firestoreDb.ts`.

## 10. Verification performed in this phase

- ZIP integrity check: PASS (`unzip -t`).
- Existing Phase 2.4.6 static audit: 7 checks emitted; verdict `NOT_READY_FIREBASE_OR_SHEETS_PATHS_REMAIN`.
- Existing Phase 2.4.6 verifier: 9/9 PASS (verifies the audit evidence, not production readiness).
- Supabase project inspection: read-only; 21 public tables, RLS enabled on all, no public policies, no anon/authenticated schema usage, private bucket present, 3 live migrations.
- No production SQL write, migration deployment, data mutation, key rotation, Firebase export/deletion, or deployment performed.

## 11. Final verdict

<code>FIREBASE_REMOVAL: NOT READY</code>  
<code>SUPABASE_BACKEND: PARTIALLY INTEGRATED / SERVER-ONLY ACCESS MODEL</code>  
<code>MORAJAWS_CUSTOM_LOGIN: TARGET AUTHORITY</code>  
<code>SUPABASE_AUTH: MUST NOT BE USED FOR LOGIN</code>  
<code>PRODUCTION_MUTATION: NONE</code>

The next implementation should begin with Phase 16A.4, replacing the remaining Firestore feature paths with Supabase-backed Express APIs. Firebase packages and config must remain until all hard blockers are closed and a clean build proves zero runtime dependency.
