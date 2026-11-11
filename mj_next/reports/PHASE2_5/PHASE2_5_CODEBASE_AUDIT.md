# PHASE 2.5 — Codebase Audit

## Scope

Runtime and project structure were enumerated from the uploaded `mj_next` project. The audit covered frontend contexts/components/services, Express backend, Supabase adapter/client/storage modules, authentication, SQL migrations, configuration, scripts, and legacy Firebase integration points.

## Key findings

| Area | Finding | Remediation | Status |
|---|---|---|---|
| Frontend persistence | AppContext persisted operational state to localStorage and loaded it as state | Removed operational collection persistence; session/preferences remain client-side only | PASS |
| Firestore runtime | Legacy filename/module still contained Firebase SDK integration | Replaced with Supabase/Express compatibility DAL | PASS |
| Firebase frontend | `src/lib/firebase.ts` and Firebase imports existed in runtime graph | Removed runtime file/import graph | PASS |
| Firebase backend | Firebase Admin auth/compatibility route existed | Removed server import and Firebase login route | PASS |
| Supabase Auth | JWT fallback existed in server resolver | Removed fallback; internal session is authoritative | PASS |
| Google Sheets | Firebase Auth was coupled to Sheets OAuth | Replaced with Google Identity Services | PASS |
| Passwords | Client default hash and server default password existed | Server-generated bcrypt temporary password flow | PASS |
| Navigation/settings | Legacy Firestore naming and local cache existed | Backend Supabase app_settings persistence | PASS |
| Production fallback | Local JSON exists for development | Production remains fail-closed; local seeds disabled in production memory initialization | PASS / STATIC |

## Static search results

- Direct browser `@supabase/supabase-js` / `createClient()` usage: 0.
- Firebase SDK imports in production runtime graph: 0.
- AppContext operational localStorage persistence: 0.
- IndexedDB remains only as an offline/cache mechanism in `offlineDb.ts`; it is not used as the authoritative bootstrap source.
- Firebase packages moved out of production dependencies and retained only for archival/backup/test tooling.

## Remaining architectural debt

The repository still contains historical Firebase backup/test tooling and historical reports referring to Firestore. These are not part of the production runtime graph. They are retained to preserve migration evidence and backup tooling.
