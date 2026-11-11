# MORAJAWS PHASE 2.4.1 — RBAC PERMISSION MATRIX
**Document Version:** 1.0.0  
**Phase:** Phase 2.4.1  
**Target Architecture:** Role-Based Access Control (RBAC)  
**Status:** **7/7 REAL HTTP SCENARIOS PASSED (100%)**

---

## 1. System Role Taxonomy

MoraJaws defines 6 distinct operational roles:
1. `super_admin`: Highest administrative privileges (user management, global system configuration, all data access, system logs).
2. `dispatch`: Operational routing, technician assignment, appointment scheduling, report approval.
3. `leader`: Contractor/team supervisor, technician assignment within their contractor & area.
4. `installer`: Field technician, execution of assigned work orders, progress check-ins, technical report submissions.
5. `management_data`: Data governance, import/export, work order soft/hard deletions, report auditing.
6. `it_support`: Read-only access to audit logs, system telemetry, technical inspection.

---

## 2. Real HTTP Endpoint Access Evaluation Matrix

| Endpoint | Method | Role Tested | Required Permission | HTTP Status | Evaluation Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/admin/users` | `GET` | `super_admin` | Super Admin Only | `200 OK` | **PASS (RBAC-01)** |
| `/api/admin/users` | `GET` | `dispatch` | Super Admin Only | `403 Forbidden` | **PASS (RBAC-02)** |
| `/api/work-orders/:id/assign` | `POST` | `leader` | Leader / Super Admin (Contractor Match) | `200 OK` | **PASS (RBAC-03)** |
| `/api/work-orders/:id/assign` | `POST` | `installer` | Leader / Super Admin Only | `403 Forbidden` | **PASS (RBAC-04)** |
| `/api/tickets/:id` | `DELETE` | `management_data` | Management Data / Super Admin | `200 OK` | **PASS (RBAC-05)** |
| `/api/tickets/:id` | `DELETE` | `installer` | Management Data / Super Admin | `403 Forbidden` | **PASS (RBAC-06)** |
| `/api/tickets/:id` (Protected Legacy) | `DELETE` | `management_data` | Immutable Legacy Record Protection | `403 Forbidden` | **PASS (RBAC-07)** |
| `/api/tickets/:id/report` (Assigned) | `POST` | `installer` | Assigned Installer / Authorized Staff | `200 OK` | **PASS (API-01)** |
| `/api/tickets/:id/report` (Unassigned) | `POST` | `installer` | Scoped to Assigned Technician | `403 Forbidden` | **PASS (ATOM-05)** |

---

## 3. Scope Scoping & Technician Ownership Rules

1. **Installer Work Order Access:**
   - Field technicians can only submit reports for work orders where `installer_name` matches their authenticated name/ID and contractor matches.
   - Unassigned technicians attempting to submit a report receive HTTP 403 `FORBIDDEN_SCOPE`.
2. **Leader Delegation:**
   - Leaders can only assign technicians within their designated `contractor` and `area`.
3. **Protected Work Orders:**
   - Pre-cutover legacy records are permanently immutable. Any `DELETE` request against a protected ID is rejected by both Express middleware and the PostgreSQL database trigger.
