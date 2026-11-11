# PHASE 2.5 — Remaining Issues

## BLOCKED

1. Apply migration 015 to a staging Supabase database.
2. Run live schema/catalog reconciliation against staging.
3. Run all role/RLS integration tests using the actual internal-auth backend.
4. Install project dependencies and execute Vite build/lint.
5. Execute Storage upload/download/signed URL tests.
6. Execute Google Sheets synchronization with a configured OAuth client.
7. Execute LiveChat persistence and refresh/reload tests.
8. Execute full regression suite.
9. Verify production environment variables and service-role key handling in deployment infrastructure.

## Non-blocking historical artifacts

- `firebase-applet-config.json`, `server/firebaseAdmin.ts`, Firebase backup/export scripts, and historical phase reports remain in the repository for migration evidence/backup tooling. They are not imported by the production runtime graph and Firebase packages are no longer production dependencies.
