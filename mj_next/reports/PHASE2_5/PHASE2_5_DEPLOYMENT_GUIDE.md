# PHASE 2.5 — Deployment Guide

## Required environment

Server-side:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NODE_ENV=production`
- appropriate CORS configuration

Google Sheets, only if the feature is enabled:

- `VITE_GOOGLE_OAUTH_CLIENT_ID`
- `VITE_GOOGLE_OAUTH_REDIRECT_URI`
- Google Cloud project/API configuration required by the integration

Do not configure Supabase Auth as the MoraJaws login system.

## Pre-deployment sequence

1. Back up the target PostgreSQL database.
2. Apply all migrations in the repository order, including `015_phase2_5_internal_auth_rls_lockdown.sql`.
3. Verify table, FK, index, trigger, function, and RLS catalog state.
4. Verify `service_role` can perform backend operations.
5. Verify `anon` and `authenticated` cannot bypass the internal-auth API path.
6. Install dependencies.
7. Run `npm run lint`.
8. Run `npm run build`.
9. Run the full integration/regression suite against staging.
10. Verify login, role scoping, WO CRUD/import, assignments, reports, chat, storage, settings, and Sheets integration.
11. Deploy backend and frontend together.
12. Monitor audit logs and database errors after deployment.

## Current readiness gate

**Do not deploy to production yet.** The live database and build gates are still BLOCKED in this execution environment.
