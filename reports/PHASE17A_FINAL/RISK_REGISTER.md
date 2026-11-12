# MORAJAWS — RISK REGISTER & BLOCKER INVENTORY
## Risk Assessment, Severity Matrix, and Pre-Deployment Blockers

**Document ID:** MORAJAWS-PHASE17A-RISK-001  
**Audit Date:** 2025-02-17  

---

### 1. Risk Severity Matrix

| Risk ID | Category | Description | Severity | Likelihood | Impact Score | Status |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| **RSK-01** | Migration Collision | Migration prefix `007` has 5 competing files (including a dangerous table-dropping rollback script). | 🔴 CRITICAL | HIGH | 9.8 / 10 | **BLOCKER** |
| **RSK-02** | Migration Duplication | `001` and `002` are byte-for-byte identical (duplicate SHA-256). Prefix `006` has 2 conflicting files. | 🔴 CRITICAL | HIGH | 9.5 / 10 | **BLOCKER** |
| **RSK-03** | Remote DB Unverified | Production (`wiahuupjgpadxqiiarzi`) and Staging (`lvytgqsvxntnvlohmrxi`) cannot be verified over network due to missing credentials in audit container. | 🟠 HIGH | MEDIUM | 8.5 / 10 | **BLOCKER** |
| **RSK-04** | Missing Binary Templates | `BASE_DATA_WO.xlsx`, `INSTALLER_WO.xlsx`, and `ASSIGNED_TEKNISI.xlsx` do not exist as physical files in `public/templates/`. | 🟡 MEDIUM | LOW | 6.0 / 10 | ADVISORY |
| **RSK-05** | Supabase Auth Drift | Legacy migrations `005` and `006_phase16a` reference `auth.users(id)`. If run out of order, breaks custom auth. | 🔴 CRITICAL | MEDIUM | 9.0 / 10 | **BLOCKER** |
| **RSK-06** | Accidental Mutation of Protected WOs | Risk of modifying historical soft-deleted records (`wo_1793825457141_u4bnht`, etc.) during migration or batch import. | 🔴 CRITICAL | LOW | 9.9 / 10 | MITIGATED (Guard in place) |

---

### 2. Deep-Dive on Critical Blockers

#### Blocker #1: Automated Migration Runner Catastrophe (RSK-01 & RSK-02)
- **Problem:** If a standard CI/CD migration tool (e.g. Supabase CLI, Flyway, Liquibase, or custom bash script) iterates through `/migrations/*.sql` alphabetically:
  1. `001` runs.
  2. `002` runs and fails with `relation already exists` unless fully idempotent.
  3. `006_custom_authentication_schema.sql` runs, followed by `006_phase16a_schema_alignment_and_droplists.sql` which attempts to add conflicting columns.
  4. `007_phase16a2_rollback_plan.sql` runs and **DROPS public tables**, destroying data.
- **Remediation Requirement:**
  Phase 17B must establish a linearized, single-digit/three-digit sequential chain without duplicates, moving rollback and audit scripts out of the active migration folder.

#### Blocker #2: Remote Production State Unknown (RSK-03)
- **Problem:** We cannot attest to what schema objects currently exist in live Production (`wiahuupjgpadxqiiarzi`). If tables were created manually via dashboard, running migrations could fail or corrupt data.
- **Remediation Requirement:**
  Authorized DBA must execute `PREFLIGHT_READONLY.sql` against Production and Staging before any Phase 17B code or schema changes are applied.

#### Blocker #3: Legacy `auth.users` Foreign Key Traps (RSK-05)
- **Problem:** Migrations `005` and `006_phase16a` contain `REFERENCES auth.users(id)`. MoraJaws custom auth uses `public.users(id)`. Attempting to link to `auth.users` fails if Supabase Auth is empty or disabled.
- **Remediation Requirement:**
  Phase 17B must supersede or sanitize `005` and `006_phase16a` so that all foreign keys target `public.users(id)` exclusively.

---

### 3. Acceptance Gate for Phase 17B
The Phase 17B migration execution may **ONLY** proceed if:
1. The user explicitly reviews and approves the findings in this audit dossier.
2. `PREFLIGHT_READONLY.sql` is run on `wiahuupjgpadxqiiarzi` and `lvytgqsvxntnvlohmrxi`, returning clean evidence.
3. The migration file naming structure is linearized with zero duplicates.
