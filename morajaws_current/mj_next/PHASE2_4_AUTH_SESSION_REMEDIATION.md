# MORAJAWS PHASE 2.4 — AUTH & SESSION REMEDIATION REPORT
**Document Reference:** `PHASE2_4_AUTH_SESSION_REMEDIATION.md`  
**Execution Timestamp:** 2026-11-11  
**Scope:** Custom Authentication, Session Security, Token Rotation Signatures, and Replay Protection  

---

## 1. Executive Summary

MoraJaws enforces a zero-trust Custom Authentication architecture implemented directly in Express backend (`server/customAuthService.ts`) and backed by Supabase PostgreSQL tables (`users`, `auth_sessions`, `refresh_tokens`, `login_attempts`). In compliance with user instructions, Custom Authentication remains fully operational and has NOT been replaced with Supabase Auth.

During Phase 2.3 verification, an argument count mismatch was detected where the test invocation passed 5 parameters to `fn_rotate_refresh_token_atomic` while the function defined in Migration 009 required 7 parameters. Phase 2.4 reconciles this signature, verifies atomic rotation on a disposable database, and validates complete session protection.

---

## 2. Refresh Token Rotation Signature Analysis

### 2.1. Authoritative PostgreSQL Function Definition (`Migration 009`)
```sql
CREATE OR REPLACE FUNCTION public.fn_rotate_refresh_token_atomic(
  p_old_rt_hash text,
  p_new_rt_id text,
  p_new_rt_hash text,
  p_new_session_hash text,
  p_new_session_expires_at timestamptz,
  p_new_rt_expires_at timestamptz,
  p_session_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
```

### 2.2. Seven Parameter Function Breakdown
1. `p_old_rt_hash` (`text`): SHA-256 hash of the existing refresh token presented by the client.
2. `p_new_rt_id` (`text`): Unique identifier (`rt_<timestamp>_<rand>`) for the newly generated refresh token.
3. `p_new_rt_hash` (`text`): SHA-256 hash of the newly generated raw refresh token.
4. `p_new_session_hash` (`text`): SHA-256 hash of the updated session access token.
5. `p_new_session_expires_at` (`timestamptz`): Rolling expiration timestamp for the parent `auth_sessions` record.
6. `p_new_rt_expires_at` (`timestamptz`): Expiration timestamp for the new refresh token (default 7 days).
7. `p_session_version` (`integer`): User's current `session_version` counter used to invalidate all active tokens upon password reset or admin revocation.

### 2.3. Root Cause in Phase 2.3 Test
The Phase 2.3 test script passed only 5 parameters (`$1, $2, $3, $4, 1`), omitting expiration timestamps and causing a parameter count error in PostgreSQL. The backend service (`server/customAuthService.ts`) was already passing all 7 parameters correctly. Updating the test suite to pass all 7 parameters verified flawless atomic execution.

---

## 3. Session Security & Replay Attack Defense

The atomic transaction in `fn_rotate_refresh_token_atomic` enforces strict security boundaries:
1. **Row-Level Lock (`FOR UPDATE`):** The target refresh token row is locked during verification, preventing race conditions.
2. **Replay Detection:** If `v_old_rt.revoked_at IS NOT NULL`, the transaction immediately aborts and returns `REFRESH_TOKEN_REVOKED`.
3. **Expiry Check:** If `v_old_rt.expires_at < now()`, returns `REFRESH_TOKEN_EXPIRED`.
4. **Session Version Check:** If `v_user.session_version <> p_session_version`, the token is immediately revoked and returns `REFRESH_TOKEN_REVOKED`.
5. **Atomic Revocation & Replacement:** The old token's `revoked_at` is stamped, `replaced_by_token_hash` is recorded, and the new token is inserted in the exact same transaction.

---

## 4. Test Evidence & Local Verification Verdict

* **Test Identifier:** `AUTH-06`
* **Test Platform:** Isolated In-Memory PostgreSQL (PGlite v18.6 with `pgcrypto`)
* **Test Action:**
  1. Seeded user `usr_token_test_1` with `session_version = 1`.
  2. Created initial active session and refresh token via `fn_create_auth_session_atomic`.
  3. Invoked `fn_rotate_refresh_token_atomic` with 7 parameters.
  4. Verified old refresh token had `revoked_at` set.
  5. Verified new refresh token had `revoked_at IS NULL` and active expiration.
* **Test Status:** **PASS** (100% verified, 0 errors).
