# MORAJAWS — DATABASE SECURITY & ACCESS CONTROL AUDIT
## Row Level Security, Role Grants, Credential Isolation, and Attack Surface Review

**Document ID:** MORAJAWS-PHASE17A-SEC-001  
**Audit Date:** 2025-02-17  
**Scope:** RLS Policies, Database Roles (`anon`, `authenticated`, `service_role`), Credential Hygiene  

---

### 1. Security Architecture Summary

MoraJaws enforces a **Fail-Closed, Backend-Mediated Security Architecture**:
1. **Frontend Isolation:** The client browser is considered an untrusted environment. It only receives public frontend keys (or zero Supabase keys, communicating solely with `/api/*` on port 3000).
2. **Key Protection:** `SUPABASE_SERVICE_ROLE_KEY` is restricted strictly to server-side runtime memory. It is never injected into Vite environment variables (`VITE_*`) or sent in HTTP headers to clients.
3. **Database Lockdown:** Public schemas are locked down via PostgreSQL Row Level Security (RLS) and object-level permissions, preventing direct queries by `anon` or `authenticated` roles.

---

### 2. Row Level Security & Table Grants (`015_phase2_5_internal_auth_rls_lockdown.sql`)

```sql
-- Security Policy Lockdown Matrix
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coverage_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technical_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Deny all direct operations to anon and authenticated
DROP POLICY IF EXISTS "Public deny all" ON public.work_orders;
CREATE POLICY "Public deny all" ON public.work_orders FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "Users deny all" ON public.users;
CREATE POLICY "Users deny all" ON public.users FOR ALL TO anon, authenticated USING (false);

-- Grant FULL access strictly to service_role
GRANT ALL ON TABLE public.work_orders TO service_role;
GRANT ALL ON TABLE public.users TO service_role;
GRANT ALL ON TABLE public.auth_sessions TO service_role;
GRANT ALL ON TABLE public.contractors TO service_role;
GRANT ALL ON TABLE public.coverage_areas TO service_role;
GRANT ALL ON TABLE public.technical_reports TO service_role;
GRANT ALL ON TABLE public.audit_logs TO service_role;
```

#### Evaluation:
- **Defense in Depth:** Even if an attacker accesses the public Supabase REST endpoint directly using the anon key, all table queries return `401 Unauthorized` or empty arrays `[]`.
- **Custom Auth Compatibility:** Because the backend uses `service_role`, it bypasses RLS policies and can perform necessary queries while enforcing fine-grained user permissions in Express middleware.

---

### 3. Credential & Environment Variable Audit

We scanned the entire codebase for credential leaks and key misconfigurations:
1. **Frontend Search:**
   - Command: `grep -rn "SUPABASE_SERVICE_ROLE_KEY" src/`
   - Result: 0 matches found. The frontend codebase is clean of service role credentials.
2. **Backend Search:**
   - `server/environmentConfig.ts` reads `process.env.SUPABASE_SERVICE_ROLE_KEY`.
   - If missing, it provides clear startup warnings rather than crashing silently.
3. **Local `.env` Check:**
   - `.env` contains placeholders and dummy fallbacks for development.
   - Live production keys are correctly omitted from version control.

---

### 4. Vulnerability & Threat Assessment

| Threat Vector | Mitigation in Codebase | Status |
| :--- | :--- | :---: |
| **SQL Injection** | All dynamic values passed via parameterized queries or Supabase PostgREST builder. No string concatenation in SQL execution. | 🟢 PROTECTED |
| **Bypass of Custom Auth** | Direct Supabase Auth endpoints disabled; `auth.users` decoupled; all logins routed through bcrypt comparator. | 🟢 PROTECTED |
| **Mutation of Protected WOs** | Application blocklist + database BEFORE UPDATE trigger `fn_protect_legacy_soft_deleted_wo()`. | 🟢 PROTECTED |
| **Session Hijacking / Replay** | SHA-256 hashed refresh tokens with automatic reuse detection; revocations tracked in `auth_sessions`. | 🟢 PROTECTED |
| **Denial of Service via Batch Import** | Batch sizes capped at 100 rows per request; memory streaming in Excel parser. | 🟢 PROTECTED |
| **Uncontrolled Migration DDL** | Migration files currently suffer from number collisions; needs Phase 17B reconciliation before deployment. | ⚠️ ELEVATED RISK |
