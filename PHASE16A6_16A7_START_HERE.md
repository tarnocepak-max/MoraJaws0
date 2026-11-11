# MoraJaws — PHASE 16A.6 + 16A.7 Start Here

This ZIP contains the next incremental migration patch from the user's uploaded `morajaws0 (8).zip`.

1. PHASE 16A.6 removes `/proc/<pid>/environ` scraping from seven test scripts and adds 21 security/static checks.
2. PHASE 16A.7 routes contractor and coverage CRUD through authenticated Express APIs; AppContext loads initial work-order, contractor, coverage, and safe user snapshots from Express when Firestore is disabled.

## Run
- `npm run test:phase16a6`
- `npm run test:phase16a7`
- `npm run test:phase16a4`
- `npm run test:phase16a5`
- `npm run test:phase2.4.5`

## Important
- Custom MoraJaws authentication remains in place; do not introduce Supabase Auth.
- No production database writes or SQL migrations were performed.
- Firebase is not fully removed.
- No live integration/browser tests, full typecheck, or production build could be completed without installing the project's dependencies.
