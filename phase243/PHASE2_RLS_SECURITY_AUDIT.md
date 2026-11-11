# MoraJaws Phase 2 — Row Level Security (RLS) & Access Control Audit
**Document ID:** `PHASE2_RLS_SECURITY_AUDIT.md`  
**Execution Date:** 2026-11-11  
**Project:** MoraJaws - Telecom Work Order & Field Dispatch Management System  
**Audit Scope:** Row Level Security (RLS) Policies, PostgreSQL Permissions (`GRANT` / `REVOKE`), Custom Authentication Access Paths, and Defense-in-Depth Gateway Security  

---

## 1. Security Architecture & Threat Model

MoraJaws employs a **Single-Gatekeeper Express API Architecture**:

```text
┌───────────────────────────────────────────────┐
│              Browser Client (Vite)            │
│  - Never has SUPABASE_SERVICE_ROLE_KEY        │
│  - Never connects directly to Supabase PostgREST │
│  - Communicates via HTTPS Bearer Access Token │
└──────────────────────┬────────────────────────┘
                       │ HTTPS Authorization: Bearer mora_at_v{v}_{hex}
                       ▼
┌───────────────────────────────────────────────┐
│             Express API Gateway               │
│  - Validates session_version against users    │
│  - Validates cryptographic SHA-256 token hash │
│  - Enforces RBAC permissions per endpoint     │
│  - Applies rate limiting & brute-force guards │
└──────────────────────┬────────────────────────┘
                       │ SUPABASE_SERVICE_ROLE_KEY (Server-side ONLY)
                       ▼
┌───────────────────────────────────────────────┐
│          Supabase PostgreSQL Database         │
│  - RLS ENABLED on all 19+ tables              │
│  - Direct 'anon' access: REVOKED (0% access)  │
│  - Direct 'authenticated' access: REVOKED     │
│  - 'service_role' access: AUTHORIZED ONLY     │
└───────────────────────────────────────────────┘
```

### 1.1. Custom Authentication vs. Supabase Auth Context
In standard Supabase applications, frontend clients send Supabase Auth JWTs directly to PostgREST, and RLS policies evaluate `auth.uid()`. 

**In MoraJaws, this model is NOT used.**
1. MoraJaws uses **Custom Authentication** (hardened in Phase 1) with bcrypt password hashing, authoritative `session_version` invalidation, rotating refresh tokens, and rate-limited login endpoints.
2. The browser **never** receives a Supabase Auth UID session token.
3. Therefore, policies relying on `auth.uid()` cannot identify the user from direct browser connections.
4. If direct client access were enabled, malicious actors could forge queries or exploit anonymous read gaps.
5. **Architectural Invariant:** Browser access to Supabase PostgreSQL is completely blocked. Express is the sole authorized gateway.

---

## 2. Table-by-Table RLS Status & Policy Audit

| Table Name | RLS Status | Anon Access | Authenticated Direct Access | Service Role Policy | RLS Policy Details |
|:---|:---:|:---:|:---:|:---:|:---|
| `roles` | **ENABLED** | **DENIED** | **DENIED** | `roles_service_role_all` | Deny-by-default for browser roles. Full access granted exclusively to backend service_role. |
| `contractors` | **ENABLED** | **DENIED** | **DENIED** | `contractors_service_role_all` | Deny-by-default for browser roles. |
| `coverage_areas` | **ENABLED** | **DENIED** | **DENIED** | `coverage_areas_service_role_all`| Deny-by-default for browser roles. |
| `users` | **ENABLED** | **DENIED** | **DENIED** | `users_service_role_all` | Deny-by-default. Staff password hashes and session counters completely inaccessible to browser. |
| `work_orders` | **ENABLED** | **DENIED** | **DENIED** | `work_orders_service_role_all` | Deny-by-default. Customer PII, addresses, phone numbers protected against public scraping. |
| `assignment_history` | **ENABLED** | **DENIED** | **DENIED** | `assignment_history_service_role_all`| Append-only ledger; UPDATE and DELETE revoked for all non-service roles. |
| `ticket_messages` | **ENABLED** | **DENIED** | **DENIED** | `ticket_messages_service_role_all`| Live chat messages protected against unauthenticated reads. |
| `technical_reports` | **ENABLED** | **DENIED** | **DENIED** | `technical_reports_service_role_all`| OPM readings and field reports protected. |
| `wa_templates` | **ENABLED** | **DENIED** | **DENIED** | `wa_templates_service_role_all` | WhatsApp templates protected against unauthorized modification. |
| `app_settings` | **ENABLED** | **DENIED** | **DENIED** | `app_settings_service_role_all` | Navigation configs and system settings protected. |
| `user_preferences` | **ENABLED** | **DENIED** | **DENIED** | `user_preferences_service_role_all`| User preferences isolated. |
| `session_config` | **ENABLED** | **DENIED** | **DENIED** | `session_config_service_role_all` | Session timeout parameters protected. |
| `user_sessions` | **ENABLED** | **DENIED** | **DENIED** | `user_sessions_service_role_all` | Legacy session metadata protected. |
| `attachments` | **ENABLED** | **DENIED** | **DENIED** | `attachments_service_role_all` | Storage metadata protected. |
| `audit_logs` | **ENABLED** | **DENIED** | **DENIED** | `audit_logs_service_role_all` | **Immutable:** Trigger `trg_audit_logs_immutable` prohibits UPDATE/DELETE. |
| `integration_configs`| **ENABLED**| **DENIED** | **DENIED** | `integration_configs_service_role_all`| Secrets and API configs protected. |
| `sync_history` | **ENABLED** | **DENIED** | **DENIED** | `sync_history_service_role_all` | Sync history protected. |
| `system_error_logs` | **ENABLED**| **DENIED** | **DENIED** | `system_error_logs_service_role_all`| System telemetry protected. |
| `report_categories` | **ENABLED**| **DENIED** | **DENIED** | `report_categories_service_role_all`| Droplist categories protected. |
| `auth_sessions` | **ENABLED** | **DENIED** | **DENIED** | `auth_sessions_service_role_all` | Active hashed access tokens protected. |
| `refresh_tokens` | **ENABLED** | **DENIED** | **DENIED** | `refresh_tokens_service_role_all`| Rotating refresh token hashes protected. |
| `login_attempts` | **ENABLED** | **DENIED** | **DENIED** | `login_attempts_service_role_all`| Brute-force telemetry protected. |

---

## 3. Defense-in-Depth Verification & Gateway Authorization

Because RLS on Supabase PostgreSQL blocks 100% of direct client connections, operational security is enforced by the Express Backend. The backend audit verified that every private route passes through strict authentication and authorization middleware:

### 3.1. Authentication Middleware (`requireAuth`)
- Inspects `Authorization: Bearer <token>`.
- Token format: `mora_at_v{version}_{randomHex}`.
- Computes SHA-256 hash of token and queries `public.auth_sessions`.
- Verifies session is not expired (`expires_at > now()`) and not revoked (`revoked_at IS NULL`).
- Fetches authoritative staff profile from `public.users` and verifies:
  1. `user.active === true`
  2. `user.is_deleted === false`
  3. `user.account_status === 'active'`
  4. `user.session_version === session.session_version` (Immediate revocation on password reset).

### 3.2. Role-Based Access Control (RBAC) Gates
- **`requireSuperAdmin`**: Restricted to `role === 'super_admin'` (User creation, contractor editing, system settings, password reset).
- **`requireLeaderOrAdminForAssignment`**: Restricted to `super_admin`, `dispatch`, and `leader` scoped to contractor.
- **`requireManagementData`**: Restricted to `super_admin`, `management_data`, and `dispatch`.
- **`requireAuditLogViewer`**: Restricted to `super_admin`, `management_data`, and `it_support`.
- **`requireTemplateManager`**: Restricted to `super_admin`, `management_data`, and `dispatch`.

### 3.3. Scoping & Multi-Tenancy Invariants
- **Leaders:** Scoped strictly to their affiliated contractor (`contractor_id`) and assigned coverage areas.
- **Installers:** Cannot access the full management sidebar or global work order table. Restricted to tickets assigned to their name/ID via bottom navigation (`InstallerBottomNav.tsx`).
- **Super Admin:** Global administrative access with audit logging.

---

## 4. Audit Findings & Remediations

1. **Service Role Key Seclusion:**
   - **Finding:** The `SUPABASE_SERVICE_ROLE_KEY` is referenced exclusively in server-side files (`server/supabaseClient.ts`, `server/environmentConfig.ts`, `server/supabaseStorage.ts`).
   - **Verification:** Pemindaian kode sumber membuktikan tidak ada pemanggilan `SUPABASE_SERVICE_ROLE_KEY` pada frontend (`src/`), tidak ada ekspos ke `VITE_*` prefix, dan tidak ada penyimpanan di `localStorage` atau HTTP headers client.
2. **Denial of Anonymous Access:**
   - **Finding:** Historical migration 005 and 006-draft contained draft policies granting `SELECT ON TABLE public.users TO authenticated`.
   - **Remediation in Migration 010:** Explicitly executed `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;` ensuring direct PostgREST scraping is mathematically blocked regardless of token presence.
3. **Audit Log & Telemetry Immutability:**
   - **Finding:** Audit logs must be tamper-proof even against authorized database operators.
   - **Verification:** PL/pgSQL trigger `trg_audit_logs_immutable` enforces that any `UPDATE` or `DELETE` statement executed on `public.audit_logs` throws an uncatchable exception: `"audit_logs is append-only; UPDATE and DELETE are prohibited"`.
