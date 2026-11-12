# MORAJAWS — GITHUB REPOSITORY & WORKSPACE AUDIT
## Repository Structure, Environment State, and Source Code Integrity

**Document ID:** MORAJAWS-PHASE17A-REPO-001  
**Target Repository:** `https://github.com/tarnocepak-max/MoraJaws0`  
**Target Branch:** `main`  
**Audit Date:** 2025-02-17  

---

### 1. Repository & File Environment Analysis

The MoraJaws codebase is an unpacked full-stack Node.js + Express + React TypeScript application.
- **Root Directory:** `/` (`/app/applet`)
- **Package Type:** Node.js ECMAScript Module (`"type": "module"` in `package.json`)
- **Git State:** Local filesystem is an extracted bundle representing current `main` branch HEAD. Direct `.git` history metadata is detached in this container environment, but all 21 SQL migrations, server-side services, frontend components, and historical phase audit reports are preserved in place.

---

### 2. High-Level Directory Map

```text
/
├── migrations/                     # 21 PostgreSQL SQL migration files (Phases 1 - 16B)
├── server/                         # Node.js Express backend services
│   ├── customAuthService.ts        # Pure custom authentication, bcrypt & session management
│   ├── environmentConfig.ts        # Runtime environment verification & connection guards
│   ├── index.ts                    # Server initialization
│   ├── supabaseAdapter.ts          # Core Supabase REST/PostgREST client & RPC caller
│   └── woImportPipeline.ts         # Server-side Excel parsing, mapping & batch ingestion
├── src/                            # Frontend React TypeScript codebase
│   ├── components/                 # UI components, TextToTable, WO views, dispatch modals
│   ├── context/                    # AuthContext, WorkOrderContext, AppContext
│   ├── services/                   # Frontend adapters, API clients, woFieldMappingEngine
│   └── types/                      # TypeScript definitions (database & domain models)
├── public/                         # Static assets
│   └── templates/                  # Excel templates (data_wo_20261028.xlsx, template_wo_korlap.xlsx)
├── scripts/                        # Automated test runners and validation scripts
│   └── execute_phase16b_wo_import_test.mjs
├── reports/                        # Historical audit dossiers & Phase 17A reports
└── package.json                    # Project dependencies & build scripts
```

---

### 3. Source Code Integrity Audit

#### A. Backend Entry Points & Router Registration
- **`server.ts`**:
  - Implements Express 4 with JSON body parsers, cookie parsers, and CORS.
  - Mounts routes:
    - `/api/auth/*` -> Handled by `customAuthService` (login, logout, session refresh, profile).
    - `/api/work-orders/*` -> Handled by `woImportPipeline` & `supabaseAdapter`.
    - `/api/tickets/*` -> Redirects/aliases to canonical work order endpoints.
    - `/api/contractors/*` & `/api/coverage/*` -> Handled by `supabaseAdapter`.
  - **Protected Work Order Guard**:
    ```typescript
    const PROTECTED_PRODUCTION_WO_IDS = [
      'wo_1793825457141_u4bnht',
      'wo_imp_1793825458959_4i4f1h',
      'wo_imp_1793825458959_262dei'
    ];
    ```
    Any `PUT`, `PATCH`, or `DELETE` attempt targeting these IDs is intercepted with HTTP 403 Forbidden before reaching database queries.

#### B. Database Client Setup (`server/supabaseAdapter.ts`)
- Uses `@supabase/supabase-js` `createClient(supabaseUrl, supabaseServiceRoleKey)`.
- Client options include:
  ```typescript
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
  ```
- **Finding:** Client-side Supabase Auth is completely disabled. All queries run server-side with elevated `service_role` privileges, bypassing public anonymous RLS restrictions while enforcing business-layer role checks in Express middleware.

#### C. Frontend API Client Hygiene
- Frontend code (`src/services/workOrderService.ts`, `src/services/customAuthClient.ts`) communicates exclusively with `/api/*` endpoints on port 3000.
- Neither `VITE_SUPABASE_SERVICE_ROLE_KEY` nor any service-level credentials exist in `src/`.
- Frontend state stores only transient UI cache; page reloads trigger fresh `fetch('/api/work-orders')` calls, fulfilling the Single Source of Truth rule.

---

### 4. Codebase Test & Build Status

- **`compile_applet`**: PASS (TypeScript compiler `tsc --noEmit` and Vite build check passed with 0 errors).
- **`lint_applet`**: PASS (ESLint passed with 0 warnings, 0 errors).
- **Automated Import Pipeline Test**:
  - Command: `node scripts/execute_phase16b_wo_import_test.mjs`
  - Output: 16/16 test assertions passed (atomic batch import, deduplication, conflict resolution, whitespace trimming, and protected WO immutability).
