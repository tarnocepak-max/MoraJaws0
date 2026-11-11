# PHASE 16A.3 — SUPABASE LIVE METADATA EVIDENCE

**Project ref:** `wiahuupjgpadxqiiarzi`  
**Date:** 2026-11-12 Asia/Jakarta  
**Access mode:** read-only metadata inspection and SELECT statements only.

## Evidence summary

- `public` schema contains 21 base tables; all 21 have RLS enabled.
- `pg_policies` returned no policies for `public`.
- `has_schema_privilege`: `anon=false`, `authenticated=false`, `service_role=true` for `public` USAGE.
- `information_schema.role_table_grants` showed grants for `service_role` and `postgres`; no `anon` or `authenticated` public table grants were returned.
- Storage bucket `morajaws-reports` exists and is private (`public=false`). No Storage policies were returned from `pg_policies` for `storage`.
- Live migration history returned exactly these three entries:
  - `20261104200712 lock_public_schema_to_express_backend`
  - `20261104200723 restrict_public_schema_usage_to_backend`
  - `20261111153915 add_missing_foreign_key_indexes`
- Security advisor returned 21 informational `rls_enabled_no_policy` findings, one for each public table.

## Interpretation and caveats

The observed access model is consistent with Express-only access using a privileged backend client: public API roles cannot use the `public` schema, while `service_role` can. In this model, Express route authentication and authorization are essential because the service-role key bypasses ordinary RLS enforcement. Every route must derive identity and role from the verified MoraJaws custom session and authoritative `public.users` row.

Do not enable broad `anon` or `authenticated` grants, and do not create generic `auth.uid()` policies for this app's custom login. The absence of Storage policies also requires backend-only access to remain true: Express must authorize the user and resource before upload, download, or signed URL creation.

The metadata tool response reports live row estimates/counts for selected tables (e.g. `users=4`, `work_orders=17`, `contractors=3`, `audit_logs=682`, `auth_sessions=23`, `refresh_tokens=23`, `login_attempts=52`). These values are point-in-time and should not be treated as a migration baseline without a separately approved snapshot and reconciliation query.

No SQL statement in this phase changed schema, grants, policies, data, indexes, functions, triggers, Storage objects or project settings.
