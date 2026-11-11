# MoraJaws PHASE 16A.5 — Firestore Settings & Navigation Replacement

## Status
Targeted replacement patch prepared from the verified PHASE 16A.4 ZIP baseline.

## What changed
- Firestore runtime activation is disabled by `isFirestoreActiveForEnvironment()` for all environments.
- Canonical navigation service now uses authenticated Express `/api/supabase/settings/navigation_config` endpoints only. No Firestore import or fallback remains in `src/services/navigationFirestore.ts`.
- Added authenticated client helpers for `GET` and `POST /api/supabase/settings/:key`.
- Migrated UI configuration, global application settings, per-user preferences, canonical navigation document, navigation settings, general droplists, hierarchical droplists, report dropdown categories, and chat category settings to `public.app_settings` through Express.
- Settings write failures now throw errors rather than returning false success.
- Settings mutations preserve existing keys when merging the legacy `global` configuration record.
- Firestore-style subscription methods for migrated settings now perform one initial Supabase read. They are not realtime subscriptions.

## Data keys used
`global`, `user_preferences.<userId>`, `ui_configuration`, `navigation`, `navigation_config`, `general_droplists`, `hierarchical_droplists`, `report_dropdown_categories`, `chat_categories`.

## Important limitations
- This is NOT complete Firebase/Firestore decommissioning.
- Remaining Firestore-dependent features include WO/ticket operations, contractor/coverage mutations, user/profile compatibility operations, chat/audit compatibility paths, backup/error compatibility, and legacy Firebase modules. Inventory: 23 source files and approximately 880 textual Firebase/Firestore references under `src/` and `server/` (includes comments, type names, compatibility code, and imports; not runtime call counts).
- The generic settings endpoint is request/response only. The migrated settings subscriptions provide a one-time initial snapshot; cross-client realtime propagation is not implemented in this phase.
- No Firebase package/dependency, Firebase project, Firestore collection, Firebase Admin service, or historical backup was deleted.
- No Supabase SQL migration was added or deployed. No live Supabase data was read or changed during this phase.
- Custom MoraJaws login remains unchanged. Supabase Auth is not introduced.

## Verification
- `test:phase16a5`: 18/18 static assertions PASS.
- `test:phase16a4`: 18/18 static assertions PASS.
- `test:phase2.4.5`: 27/27 RBAC regression assertions PASS.
- TypeScript transpile syntax: 2/2 modified service files PASS.
- `npm run lint`: BLOCKED (`TS2688`, missing `vite/client` type definitions because dependencies are not installed).
- `npm run build`: BLOCKED (`vite: not found`; dependencies are not installed).
- No browser/runtime integration test was possible in this environment.
