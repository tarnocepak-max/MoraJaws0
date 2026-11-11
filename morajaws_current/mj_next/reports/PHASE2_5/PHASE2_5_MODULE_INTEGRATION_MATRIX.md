# PHASE 2.5 — Module Integration Matrix

| Module | Supabase/Express path | Static status | Live status |
|---|---|---|---|
| WO CRUD | `/api/supabase/work-orders*` | PASS | BLOCKED |
| WO import | `/api/supabase/work-orders/bulk-import` | PASS | BLOCKED |
| Assignment | assignment/reassignment API + RBAC middleware | PASS | BLOCKED |
| Contractors | `/api/supabase/contractors*` | PASS | BLOCKED |
| Coverage areas | `/api/supabase/coverage-areas*` | PASS | BLOCKED |
| Users | `/api/supabase/users*` | PASS | BLOCKED |
| Password reset | `/api/supabase/users/:id/reset-password` | PASS | BLOCKED |
| Templates | `/api/supabase/wa-templates*` | PASS | BLOCKED |
| App settings | `/api/supabase/settings/:key` | PASS | BLOCKED |
| Navigation | `app_settings.navigation_config` | PASS | BLOCKED |
| UI configuration | `app_settings.ui_configuration` | PASS | BLOCKED |
| Chat | ticket message API | PASS | BLOCKED |
| Technical reports | `/api/tickets/:id/report` / technical report DAL | PASS | BLOCKED |
| Storage | Supabase Storage service | PASS | BLOCKED |
| Google Sheets | Google Identity Services + Sheets API | PASS | BLOCKED |
| Internal authentication | `/api/auth/login`, refresh, logout | PASS | BLOCKED |
| Audit logs | Supabase-backed server audit | PASS | BLOCKED |
