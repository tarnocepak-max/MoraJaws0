# MoraJaws PHASE 16A.7 — Contractor & Coverage API Migration

## Objective
Replace contractor and coverage-area Firestore mutation paths and restore initial application snapshots through authenticated Express APIs while Firestore remains archive-only.

## Changes
- `saveContractorToFirestore`, `deleteContractorFromFirestore`, `saveCoverageAreaToFirestore`, and `deleteCoverageAreaFromFirestore` now call authenticated Express endpoints; these functions no longer invoke Firestore document writes.
- Added a shared authenticated API helper using `getAuthHeaders()`, `credentials: 'include'`, JSON parsing, and explicit non-2xx / unsuccessful-response errors.
- When Firestore is inactive, `subscribeToMoraJawsFirestore` now loads initial snapshots for work orders, contractors, coverage areas, and safe user records through:
  - `GET /api/work-orders`
  - `GET /api/contractors`
  - `GET /api/coverage-areas`
  - `GET /api/users`
- Existing Express role checks remain authoritative. Contractor/coverage create and update are restricted to Super Admin/Dispatch; delete remains Super Admin-only.
- `AppContext` now invokes the API snapshot loader before attaching the work-order SSE stream, and reconciles the current internal session against the safe user snapshot (inactive/deleted accounts are logged out).
- The API snapshot is one-shot, not realtime. Cross-session propagation for contractor/coverage/user changes remains future work.

## Validation
- PHASE 16A.7 static assertions: 10/10 PASS.
- PHASE 16A.6 security checks: 21/21 PASS.
- PHASE 16A.4 fail-closed regression: PASS.
- PHASE 16A.5 settings regression: PASS.
- PHASE 2.4.5 RBAC regression: 27/27 PASS.
- TypeScript transpile-only syntax check for modified `src/services/firestoreDb.ts`: 0 diagnostics.
- Full typecheck and Vite build remain BLOCKED due missing local dependencies.

## Limitations / Next
- No live API/browser integration test was run.
- Existing server route implementations still support local JSON only when `isLocalJsonModeAllowed()` explicitly permits it; production Supabase errors must remain fail-closed.
- Firestore package imports and remaining feature paths are intentionally retained until all data domains are migrated and tested.
- Continue with custom-auth user/profile and user-management data paths, then chat/audit and WhatsApp templates, then Storage attachments and final Firebase removal.
