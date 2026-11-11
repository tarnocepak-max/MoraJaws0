# MORAJAWS PHASE 2.4.1 — API FAIL-CLOSED MATRIX
**Document Version:** 1.0.0  
**Phase:** Phase 2.4.1  
**Target Environment:** Express API Server  
**Status:** **AUDITED & VERIFIED PASS**

---

## 1. Fail-Closed Architectural Standard

In compliance with the project security constitution:
1. When PostgreSQL (or Supabase remote backend) is unavailable, endpoints requiring persistent database access must **fail closed** immediately with HTTP 503 `DATABASE_UNAVAILABLE`.
2. Under **no circumstances** may production endpoints fall back to:
   - `db.users` or `db.tickets`
   - In-memory data structures
   - Local JSON files
   - Mock database adapters
   - Dummy records
   - Firebase / Firestore as an alternative operational database
3. Database connection errors must never be masked as HTTP 404 (Not Found).

---

## 2. API Endpoint Fail-Closed Audit Matrix

| Endpoint | Method | Fail-Closed Trigger | Expected Response | Observed Response | Verification Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/supabase/users` | `GET` | Database offline / client null | `HTTP 503 DATABASE_UNAVAILABLE` | `HTTP 503 DATABASE_UNAVAILABLE` | **PASS (FAIL-01)** |
| `/api/supabase/work-orders/:id` | `GET` | Database offline / client null | `HTTP 503 DATABASE_UNAVAILABLE` | `HTTP 503 DATABASE_UNAVAILABLE` | **PASS (FAIL-02)** |
| `/api/tickets/:id/report` | `POST` | Database offline / client null | `HTTP 503 DATABASE_UNAVAILABLE` | `HTTP 503 DATABASE_UNAVAILABLE` | **PASS (FAIL-03)** |
| `/api/work-orders/:id/report` | `POST` | Database offline / client null | `HTTP 503 DATABASE_UNAVAILABLE` | `HTTP 503 DATABASE_UNAVAILABLE` | **PASS (FAIL-03)** |
| `/api/tickets/:id/assign` | `POST` | Database offline / client null | `HTTP 503 DATABASE_UNAVAILABLE` | `HTTP 503 DATABASE_UNAVAILABLE` | **PASS** |
| `/api/tickets/:id/approve` | `POST` | Database offline / client null | `HTTP 503 DATABASE_UNAVAILABLE` | `HTTP 503 DATABASE_UNAVAILABLE` | **PASS** |
| `/api/auth/refresh` | `POST` | Database offline / client null | `HTTP 503 DATABASE_UNAVAILABLE` | `HTTP 503 DATABASE_UNAVAILABLE` | **PASS** |
| `/api/auth/logout` | `POST` | Database offline / client null | `HTTP 503 DATABASE_UNAVAILABLE` | `HTTP 503 DATABASE_UNAVAILABLE` | **PASS** |

---

## 3. Specific Route Code Audits

### A. `GET /api/supabase/users`
- Verified: Calls `getUsersFromSupabase()`. If database client is absent or query throws, returns HTTP 503 `DATABASE_UNAVAILABLE`.
- Fall-through to local JSON or `db.users` is gated strictly by `isLocalJsonModeAllowed()`, which evaluates to `false` in production (`NODE_ENV === 'production'`).

### B. `GET /api/supabase/work-orders/:id`
- Verified: If `!isSupabaseMode()`, route immediately returns:
  ```json
  {
    "success": false,
    "error": "Database Supabase tidak tersedia.",
    "code": "DATABASE_UNAVAILABLE"
  }
  ```
  Status: HTTP 503. False HTTP 404 is completely eliminated.

### C. `POST /api/tickets/:id/report`
- Verified: If `!isSupabaseMode() && !isLocalJsonModeAllowed()`, route immediately returns:
  ```json
  {
    "success": false,
    "error": "Database authoritative Supabase tidak tersedia.",
    "code": "DATABASE_UNAVAILABLE"
  }
  ```
  Status: HTTP 503. Zero fallback to memory or Firestore.
