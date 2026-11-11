# PHASE 16A.4 — LIVE SUPABASE READ-ONLY AUDIT

Project: `wiahuupjgpadxqiiarzi` (project identifier only; no credentials included)  
Audit type: Read-only metadata and aggregate counts.  
No INSERT, UPDATE, DELETE, DDL, or migration was executed.

| Metric | Result |
|---|---:|
| Public base tables | 21 |
| RLS enabled | 21 |
| Public policies | 0 |
| Work Orders | 17 |
| Users | 4 |
| Auth sessions | 23 |
| Refresh tokens | 23 |
| Login attempts | 52 |
| Attachments | 0 |
| Migration ledger entries | 3 |

## Migration ledger
- `20261104200712_lock_public_schema_to_express_backend`
- `20261104200723_restrict_public_schema_usage_to_backend`
- `20261111153915_add_missing_foreign_key_indexes`

## Compatibility findings
- `public.users.firebase_uid` remains present.
- `public.attachments.storage_provider` default remains `firebase_storage`.
- Private Storage bucket `morajaws-reports` exists.
- RLS is enabled on all 21 public tables; there are currently no public policies.
- Backend-only schema access is intentional for the custom-auth architecture. Do not grant `anon`/`authenticated` direct access or add `auth.uid()` policies as a shortcut.

## Decision
The live database has the basic custom-auth/session tables, but still carries Firebase-era schema markers. Remove or repurpose those markers only after all runtime code paths and stored file references have been inventoried and migrated. This phase made no database changes.
