# PHASE 2.5 — Supabase Schema Audit

## Migration inventory

20 SQL migration files are present after adding `015_phase2_5_internal_auth_rls_lockdown.sql`.

Static inventory before the new migration: 19 migration files, with repeated historical numbering (`006_*`, `007_*`). This is not changed automatically because renumbering applied migrations can break migration history.

## Core tables identified

`roles`, `contractors`, `coverage_areas`, `users`, `work_orders`, `assignment_history`, `ticket_messages`, `technical_reports`, `wa_templates`, `app_settings`, `user_preferences`, `session_config`, `user_sessions`, `attachments`, `audit_logs`, `integration_configs`, `sync_history`, `system_error_logs`, `auth_sessions`, `refresh_tokens`, `login_attempts`, and `report_categories`.

## Security finding

Historical migrations contain RLS policies written for Supabase Auth (`auth.uid()`) because earlier phases contemplated Supabase Auth. The application architecture requested for Phase 2.5 does **not** use Supabase Auth.

A final migration was therefore added:

`migrations/015_phase2_5_internal_auth_rls_lockdown.sql`

It:

- revokes table privileges from `anon` and `authenticated`;
- grants table privileges to `service_role`;
- revokes execution of sensitive `SECURITY DEFINER` helpers from browser roles;
- preserves service-role execution for the Express backend.

This makes the browser incapable of bypassing MoraJaws internal authentication through direct Supabase PostgREST access.

## Not verified remotely

No live PostgreSQL/Supabase connection was available in the uploaded project environment. Therefore migration execution, catalog introspection, FK verification against the actual database, and live RLS behavior remain **BLOCKED** pending a staging/production connection.
