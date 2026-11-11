# MoraJaws — Version Audit & Supabase Synchronization Repair
Date: 2026-11-12

## Verdict

**Before repair:** NOT fully synchronized with Supabase.

The version contained a Supabase backend/data-access layer, but the production frontend still had several browser-persistence paths and legacy Firestore/Firebase compatibility code. The most important issue was that operational state could be initialized from localStorage/IndexedDB and then mixed with server data, which violated the intended Single Source of Truth model.

**After repair:** the operational frontend path is changed to load authoritative data from the authenticated Express/Supabase path. Browser storage is no longer used as the initial source for WO, users, contractors, coverage areas, messages, templates, workflow rules, audit logs, or operational date. Offline ticket hydration into application state was removed.

Live database synchronization is **not declared fully verified** because this ZIP does not contain production/staging Supabase credentials and the dependency installation timed out in the analysis environment.

## Findings

### 1. Operational browser persistence
**Status: FIXED**

Removed operational initialization/persistence from `src/context/AppContext.tsx` for:
- users
- contractors
- coverage areas
- root causes
- work orders
- ticket messages
- WhatsApp templates
- workflow rules
- audit logs
- WhatsApp logs
- report categories
- chat categories
- hierarchical droplists
- operational date
- offline ticket hydration into main state

Authentication/session and UI-only preferences remain browser-persisted where appropriate.

### 2. Spoofable identity headers
**Status: FIXED**

`src/context/AppContext.tsx` no longer sends `x-user-id` / `x-username` from localStorage. Authorization is represented by the server-issued bearer session token.

### 3. Firestore compatibility writes
**Status: HARDENED**

`src/services/firestoreDb.ts` production-facing compatibility methods now use authenticated Express/Supabase endpoints and surface HTTP failures instead of silently treating failed writes as successful.

Updated areas include:
- work-order save/bulk save/delete/archive/restore
- chat message persistence
- template persistence
- user persistence
- ticket retrieval
- user lookup

Client-side audit writes remain intentionally disabled because audit records must originate from trusted server operations.

### 4. Incorrect WO delete permission in UI
**Status: FIXED**

`canDelete` is now aligned with the application's `management_data` + `delete_wo_data` permission instead of granting the WO delete UI capability to `super_admin`.

Backend authorization remains the authoritative control.

### 5. Weak default password creation
**Status: FIXED**

The installer/user creation paths no longer create accounts with the hardcoded `12345678` password.

The server now:
- generates a random temporary password,
- hashes it with bcrypt,
- marks the account `mustChangePassword`,
- returns the temporary password only in the authenticated creation response.

Password reset endpoints were similarly changed to generate a secure temporary password.

### 6. Google Sheets configuration
**Status: HARDENED**

Google Sheets configuration endpoints now use Supabase `app_settings` (`google_sheets_config`) as the persistent source in Supabase mode instead of relying on the local JSON database.

### 7. Global/operational settings
**Status: HARDENED**

Bootstrap now reads global settings from Supabase where available, and operational-date writes use the Supabase settings layer.

## Verification actually executed

### PASS
- Phase 16A.7 contractor/coverage API audit: **10/10 PASS**
- Phase 16A.5 Firestore settings replacement audit: **18/18 PASS**
- Phase 16A.6 security hardening audit: **21/21 PASS**
- Phase 16A.4 Supabase fail-closed audit: **18/18 PASS**

Total executed static/structural checks represented above: **67/67 PASS**.

### BLOCKED
- TypeScript full check: dependency/type installation unavailable; `tsc` reached the project configuration but reported missing `vite/client`.
- Full Vite production build: not executed because dependency installation timed out.
- Live Supabase connection: BLOCKED because no runtime Supabase credentials were supplied.
- Live PostgreSQL migration execution: BLOCKED for the same reason.
- Live CRUD/RLS/storage/realtime integration tests: BLOCKED without a staging/production database connection.

## Important remaining legacy surface

Firebase/Firestore source files and dependencies are still present as compatibility/legacy integration code. `isFirestoreActiveForEnvironment()` is hard-disabled, and the tested production path routes through Express/Supabase, but the repository has not yet been completely physically purged of Firebase-related source/dependencies.

Google Sheets integration also contains legacy Firebase-based Google sign-in helpers. This is separate from MoraJaws internal authentication, which remains custom MoraJaws authentication.

## Final status

**MIGRATION PARTIALLY COMPLETE**

The code is materially closer to the required Supabase Single Source of Truth architecture and the critical browser-persistence/security issues found in this version were repaired.

It must not yet be labeled `MIGRATION COMPLETE` until:
1. real Supabase credentials are supplied in a secure environment,
2. migrations are executed against staging,
3. live CRUD/RLS/storage/realtime tests pass,
4. dependencies install successfully,
5. production build and regression suite pass.
