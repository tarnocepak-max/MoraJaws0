# MORAJAWS — UNVERIFIED ITEMS & BLOCKER DOSSIER
## Explicit Accounting of Unverified Live Objects and Production Blockers

**Document ID:** MORAJAWS-PHASE17A-BLOCKED-001  
**Audit Date:** 2025-02-17  
**Policy Mandate:** No assumptions of live database state; explicit marking of unverified remote elements.  

---

### 1. Statement of Verification Boundaries

During the Phase 17A Audit, all source code, TypeScript adapters, local SQL migration files, cryptographic hashes, template engines, and automated test runners were audited directly within the repository environment.

However, **direct network connection to remote Supabase instances was intentionally blocked** due to the absence of remote service credentials in the repository files. As a result, the live database states for:
- **Production:** `wiahuupjgpadxqiiarzi`
- **Staging:** `lvytgqsvxntnvlohmrxi`

are formally categorized as **UNVERIFIED**.

---

### 2. Comprehensive Inventory of Unverified Remote Items

| Item # | Target Database Object / State | Target Instance | Reason for Unverified Status | Required Resolution |
| :---: | :--- | :---: | :--- | :--- |
| **U-01** | Actual list of applied migrations in DB | Production (`wiahuupjgpadxqiiarzi`) | Missing DB connection credentials | Run `PREFLIGHT_READONLY.sql` Query #1 |
| **U-02** | Actual list of applied migrations in DB | Staging (`lvytgqsvxntnvlohmrxi`) | Missing DB connection credentials | Run `PREFLIGHT_READONLY.sql` Query #1 |
| **U-03** | Existence of `uq_work_orders_wo_number_normalized` | Production & Staging | Missing DB connection credentials | Run `PREFLIGHT_READONLY.sql` Query #4 |
| **U-04** | Status of RLS Policies on `work_orders`, `users` | Production & Staging | Missing DB connection credentials | Run `PREFLIGHT_READONLY.sql` Query #6 & #7 |
| **U-05** | Presence of trigger `fn_protect_legacy_soft_deleted_wo` | Production & Staging | Missing DB connection credentials | Run `PREFLIGHT_READONLY.sql` Query #8 & #9 |
| **U-06** | State of 3 protected records (`wo_1793825457141_u4bnht`, `wo_imp_1793825458959_4i4f1h`, `wo_imp_1793825458959_262dei`) | Production & Staging | Missing DB connection credentials | Run `PREFLIGHT_READONLY.sql` Query #10 |
| **U-07** | Foreign keys targeting `auth.users` vs `public.users` | Production & Staging | Missing DB connection credentials | Run `PREFLIGHT_READONLY.sql` Query #5 |
| **U-08** | Presence and signature of `fn_submit_technical_report_atomic` | Production & Staging | Missing DB connection credentials | Run `PREFLIGHT_READONLY.sql` Query #8 |

---

### 3. Immediate Action Plan for Unblocking

To transition the above items from **UNVERIFIED** to **VERIFIED**:
1. Authorized database administrator connects to the Supabase SQL Editor for Production (`wiahuupjgpadxqiiarzi`) and Staging (`lvytgqsvxntnvlohmrxi`).
2. Paste and execute the contents of `/reports/PHASE17A_FINAL/PREFLIGHT_READONLY.sql`.
3. Export the query result set (JSON or CSV).
4. Supply the verification outputs to the audit team to validate 100% parity before initiating Phase 17B.
