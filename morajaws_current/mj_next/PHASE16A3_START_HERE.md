# MoraJaws PHASE 16A.3 — Start Here

This ZIP is the next-stage audit package built from the latest uploaded `morajaws0 (5).zip`.

## What changed
- Added a detailed Firebase decommission and Supabase architecture audit.
- Added live Supabase metadata evidence gathered read-only.
- Added a gated checklist for later Firebase removal.
- Added a static audit script and package commands:
  - `npm run audit:phase16a3`
  - `npm run test:phase16a3`
- No application runtime source was changed in this audit phase.
- No production database/schema/data/configuration was changed.

## Important decision applied
MoraJaws login must remain the internal custom authentication system. Do not migrate login to Supabase Auth. The backend should validate MoraJaws access/refresh tokens and store session state in PostgreSQL tables (`users`, `auth_sessions`, `refresh_tokens`, `login_attempts`).

## Main report
Read `PHASE16A3_FIREBASE_DECOMMISSION_AUDIT.md` first, then:
1. `PHASE16A3_SUPABASE_LIVE_AUDIT.md`
2. `PHASE16A3_FIREBASE_REMOVAL_CHECKLIST.md`
3. `scripts/evidence/phase16a3_firebase_decommission_audit.json`

## Current verdict
Firebase removal is NOT READY. The next implementation stage is Phase 16A.4: replace the remaining Firestore feature paths with Supabase-backed Express APIs. Do not remove Firebase dependencies until that phase and the later auth/storage/release gates pass.
