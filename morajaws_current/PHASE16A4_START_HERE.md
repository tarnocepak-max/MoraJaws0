# PHASE 16A.4 — START HERE

This package is the patched MoraJaws project based on the uploaded `morajaws0 (6).zip`.

## What changed
- Core Work Order reads, updates, assignments, reassignments, reports, chat-message reads, and delete operations now fail closed when Supabase mode is active.
- Supabase success returns immediately instead of continuing into a local JSON write.
- Local JSON paths remain available only for explicit non-Supabase local mode.
- Migration plan corrected to preserve MoraJaws Custom Authentication; Supabase Auth is not used.
- Added 18 static fail-closed assertions and evidence.

## Read in this order
1. `PHASE16A4_IMPLEMENTATION_REPORT.md`
2. `PHASE16A4_LIVE_SUPABASE_AUDIT.md`
3. `PHASE16A4_NEXT_PHASE_CHECKLIST.md`
4. `MORAJAWS_PHASE16A_MIGRATION_PLAN.md`

## Important
Firebase has NOT been removed. Forty-four active source files still contain Firebase/Firestore references. Removing SDK dependencies now would break features. Continue with Phase 16A.5 to replace Firestore-backed feature paths with Supabase-backed Express APIs.

No production schema/data mutation occurred. Build and full typecheck are blocked by missing/incomplete dependencies in this archive; see `scripts/evidence/`.
