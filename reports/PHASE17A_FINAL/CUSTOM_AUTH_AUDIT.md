# MORAJAWS — CUSTOM AUTHENTICATION ARCHITECTURE AUDIT
## Internal Authentication, Session Security, and Supabase Auth Decoupling

**Document ID:** MORAJAWS-PHASE17A-AUTH-001  
**Audit Date:** 2025-02-17  
**Architecture Mandate:** Custom Internal Authentication (Zero reliance on Supabase Auth or Firebase Auth for login authority)  

---

### 1. Architectural Compliance Verification

| Checkpoint | Requirement | Actual Implementation | Verdict |
| :--- | :--- | :--- | :---: |
| **Login Authority** | Internal MoraJaws database (`public.users`) | `server/customAuthService.ts` authenticates against `public.users` using bcrypt password hashing. | 🟢 PASS |
| **Supabase Auth Usage** | Strictly forbidden for app login | `@supabase/supabase-js` `auth.signInWithPassword()` is **never** invoked on client or server. | 🟢 PASS |
| **Firebase Auth Usage** | Strictly forbidden for login authority | No Firebase Auth login SDK or token verification used for app login. | 🟢 PASS |
| **Session Persistence** | Database table `public.auth_sessions` | Managed via `auth_sessions` table with SHA-256 hashed refresh tokens. | 🟢 PASS |
| **Credential Storage** | Salted bcrypt hashes | Passwords hashed with bcrypt (rounds >= 10); plaintext passwords never stored. | 🟢 PASS |
| **Role Verification** | Backend-enforced authorization | Express middlewares verify role claims before serving protected routes. | 🟢 PASS |

---

### 2. Deep Dive: Backend Custom Auth Implementation

#### A. Database Schema (`public.users` & `public.auth_sessions`)
From `migrations/006_custom_authentication_schema.sql` and `009_auth_sessions_and_token_rotation.sql`:
- **`public.users`**:
  - `id` (UUID, PK)
  - `username` (VARCHAR, UNIQUE, NOT NULL)
  - `password_hash` (TEXT, NOT NULL)
  - `role` (VARCHAR, CHECK: `SUPERADMIN`, `DISPATCH`, `LEADER`, `INSTALLER`, `MONITORING_DATA`, `IT_SUPPORT`)
  - `is_active` (BOOLEAN, DEFAULT TRUE)
- **`public.auth_sessions`**:
  - `id` (UUID, PK)
  - `user_id` (UUID, FK -> `users(id)`)
  - `refresh_token_hash` (TEXT, UNIQUE, NOT NULL)
  - `expires_at` (TIMESTAMPTZ, NOT NULL)
  - `revoked_at` (TIMESTAMPTZ)

#### B. Session Lifecycle & Token Rotation
In `server/customAuthService.ts`:
1. **Login:**
   - User posts `username` and `password` to `/api/auth/login`.
   - Backend queries `public.users` via `supabaseAdapter.getServiceRoleClient()`.
   - `bcrypt.compare(password, user.password_hash)` validates credentials.
   - Generates:
     - `accessToken` (Short-lived JWT, signed with internal secret, 15m expiration).
     - `refreshToken` (Cryptographic random string, 7-day expiration).
   - Hashes `refreshToken` with SHA-256 and calls `fn_create_auth_session_atomic` in database.
   - Sets secure HTTP-only cookies and returns sanitized user object (excluding `password_hash`).
2. **Token Refresh:**
   - Client sends refresh token cookie to `/api/auth/refresh`.
   - Backend hashes incoming token and executes atomic rotation RPC (`fn_rotate_refresh_token_atomic`).
   - If token was already revoked, triggers reuse-detection cascade to revoke all sessions for that user.
3. **Logout:**
   - Invalidates session in `auth_sessions` by setting `revoked_at = NOW()`.
   - Clears client cookies.

---

### 3. Decoupling from Supabase Auth (`auth.users`)

Historical migration files (`005_fix_auth_users_foreign_keys.sql` and `006_phase16a...`) initially attempted to create foreign keys pointing to Supabase internal schema `auth.users(id)`.
This was completely severed and corrected in:
- `010_complete_custom_auth_cutover.sql`
- `015_phase2_5_internal_auth_rls_lockdown.sql`

**Key Security Hardening (`015_phase2_5_internal_auth_rls_lockdown.sql`):**
```sql
-- Revoke all direct permissions from anon and authenticated roles
REVOKE ALL ON TABLE public.users FROM anon, authenticated;
REVOKE ALL ON TABLE public.auth_sessions FROM anon, authenticated;
REVOKE ALL ON TABLE public.work_orders FROM anon, authenticated;

-- Grant access ONLY to service_role (used by server/supabaseAdapter.ts)
GRANT ALL ON TABLE public.users TO service_role;
GRANT ALL ON TABLE public.auth_sessions TO service_role;
GRANT ALL ON TABLE public.work_orders TO service_role;
```
This architecture guarantees that even if a malicious user extracts the frontend `VITE_SUPABASE_ANON_KEY`, they cannot read or write to `users`, `auth_sessions`, or `work_orders` directly. All data access must pass through the Node.js backend.

---

### 4. Role Hierarchy & Access Matrix

| Role | Work Order View | Import Work Orders | Assign Technicians | Submit Tech Reports | Manage Users |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **SUPERADMIN** | Full (All Areas) | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **DISPATCH** | Full (Assigned Areas) | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| **LEADER** | Area Scope | ❌ No | ✅ Team Only | ✅ Review/Approve | ❌ No |
| **INSTALLER** | Assigned Only | ❌ No | ❌ No | ✅ Submit Only | ❌ No |
| **MONITORING_DATA** | Read-Only (All Areas) | ❌ No | ❌ No | ❌ No | ❌ No |
| **IT_SUPPORT** | System / Logs Scope | ❌ No | ❌ No | ❌ No | ✅ Read Only |

**Verdict:** Custom authentication design is robust, secure, and completely compliant with MoraJaws architectural guidelines.
