# MORAJAWS PHASE 2.4.1 — AUTH REFRESH TOKEN TEST REPORT
**Document Version:** 1.0.0  
**Phase:** Phase 2.4.1  
**Service:** `/server/customAuthService.ts`  
**Database Tables:** `public.users`, `public.auth_sessions`, `public.refresh_tokens`, `public.login_attempts`  
**Status:** **15/15 SCENARIOS PASSED (100%)**

---

## 1. Authentication Architecture & Security Rules

1. **Password Hashing:** Passwords are hashed using `bcryptjs` with salt round >= 10 (`$2a$` or `$2b$`).
2. **Transparent Auto-Upgrade:** Passwords stored under legacy formats (e.g. FNV-1a or PBKDF2) verify cleanly on first login and trigger background rehashing to bcrypt (`needsRehash: true`).
3. **Session Store:** Active sessions are persisted to `public.auth_sessions`. Raw tokens are never stored in the database; tokens are SHA-256 hashed prior to storage and lookup (`hashToken()`).
4. **Refresh Token Rotation:** Every refresh operation invalidates the existing refresh token, records `replaced_by_token_hash`, and issues a new access/refresh pair.
5. **Replay Attack Detection:** Presenting an already rotated or revoked refresh token immediately revokes all family sessions and returns an error.
6. **Authoritative Session Versioning:** Each user record has an integer `session_version`. Incrementing this version instantly invalidates all issued access and refresh tokens.

---

## 2. 15 Test Scenarios & Verification Evidence

| Test ID | Test Scenario | Expected Outcome | Actual Outcome | Status |
| :--- | :--- | :--- | :--- | :--- |
| **AUTH-01** | Login with valid credentials | HTTP 200, returns access token, refresh token, user profile | Authenticated as `budi_installer` with tokens | **PASS** |
| **AUTH-02** | Login with wrong password | HTTP 401, rejected | Rejected with `INVALID_CREDENTIALS` | **PASS** |
| **AUTH-03** | Inactive user login attempt | HTTP 403, account deactivated | Rejected with `ACCOUNT_INACTIVE` | **PASS** |
| **AUTH-04** | Bcrypt hashing standard | Password hash format starts with `$2a$` or `$2b$` | Verified format `$2a$10$...` | **PASS** |
| **AUTH-05** | Legacy password auto-upgrade | Validates legacy hash and returns `needsRehash: true` | `valid: true, needsRehash: true` | **PASS** |
| **AUTH-06** | Valid refresh token rotation | Successfully rotates token, issues new refresh token | Issued new token pair cleanly | **PASS** |
| **AUTH-07** | Replay attack on rotated token | Reused old refresh token is strictly rejected | Rejected with `TOKEN_REVOKED` | **PASS** |
| **AUTH-08** | Access token validation | Valid access token successfully authenticates request | Verified session with user profile | **PASS** |
| **AUTH-09** | Revocation after logout | Revoked session token rejected on subsequent requests | Rejected with `SESSION_REVOKED` | **PASS** |
| **AUTH-10** | Session version incrementation | Password reset / revoke all invalidates all tokens | Token rejected with `SESSION_REVOKED` | **PASS** |
| **AUTH-11** | Session version mismatch | Tokens with version mismatch rejected | Rejected with `SESSION_REVOKED` | **PASS** |
| **AUTH-12** | Foreign session refresh token | Unregistered session token rejected | Rejected with `TOKEN_NOT_FOUND` | **PASS** |
| **AUTH-13** | Concurrent refresh token race | Concurrent refresh safely handles race without store corruption | Handled safely, single rotation wins | **PASS** |
| **AUTH-14** | Malformed token rejection | Garbage token format rejected | Rejected with `INVALID_TOKEN` | **PASS** |
| **AUTH-15** | Superadmin `rays` preservation | Account exists, active, super_admin role intact | Account intact (`rayhanafirzanx@gmail.com`) | **PASS** |

---

## 3. Account Safety Audit: Superadmin `rays`

- **Username:** `rays`
- **Email:** `rayhanafirzanx@gmail.com`
- **Role:** `super_admin`
- **Status:** Active
- **Audit Result:** During the entire execution of Phase 2.4.1, account `rays` was never modified, altered, deleted, or reset.
