# MoraJaws — PHASE 16B.1 Remediation Report

Date: 2026-11-12
Baseline: root project from `morajaws0 (9).zip`, cross-checked against GitHub `main` for the principal Phase 16B files.
Scope: application-code hardening only. No Supabase migration was added or deployed. No production database was accessed or modified.

## Changes made

1. **Correct import outcome classification**
   - Invalid rows now count as a failed condition when determining final status.
   - A duplicate-only batch is successful only when there are no invalid or failed rows.
   - Empty input and all-invalid batches are no longer reported as successful.

2. **Fail-closed import history writes**
   - Initial `work_order_imports` write errors stop the import before any `work_orders` write.
   - Final import-history write errors are returned to the caller rather than silently ignored.
   - All-invalid batches attempt to persist their FAILED outcome in import history.

3. **Stable client import identity**
   - The client derives an import ID and idempotency key from a SHA-256 fingerprint of the logical payload, file name, sheet name, and duplicate policy.
   - A repeated submission of the same payload can be recognized by the backend.
   - This fingerprint is an idempotency identifier only; it is not an authentication secret.

4. **Accurate partial-result reporting**
   - The UI retains inserted, updated, duplicate, invalid, and failed counts when the API returns a partial outcome.
   - A refresh failure is distinguished from a failed database import.
   - The API replay response uses the persisted import ID returned by the adapter.

5. **Regression assertions**
   - Added five source-level assertions for the Phase 16B.1 behavior.

## Files changed

- `server/supabaseAdapter.ts`
- `server.ts`
- `src/context/AppContext.tsx`
- `scripts/execute_phase16b_wo_import_test.mjs`

## Verification

- `node scripts/execute_phase16b_wo_import_test.mjs`: **16/16 PASS**.
- `node --check scripts/execute_phase16b_wo_import_test.mjs`: PASS.
- `tsc --noEmit`: BLOCKED because dependencies are not installed and `vite/client` type definitions are missing (`TS2688`).
- Production build: NOT RUN; project dependencies are absent in this workspace.
- Supabase runtime/integration tests: NOT RUN; no database credentials or approved staging connection were provided.

The 16 checks are source-level assertions. They do not prove transactional behavior, runtime API behavior, or live database compatibility.

## Remaining blockers before Phase 16B can be called complete

1. **Atomicity:** current adapter still inserts work orders in multiple REST requests. A failure midway can leave a partially committed batch. Phase 16B.2 must move the batch operation into a PostgreSQL transaction/RPC.
2. **Concurrency:** idempotency lookup and creation are not yet one atomic claim operation. Concurrent submissions can race. The unique WO index limits duplicate rows but does not make the whole batch atomic.
3. **Canonical duplicate matching:** application normalization and the SQL unique-index expression need a single shared implementation. Current pre-check queries are not sufficient for all case/whitespace variants.
4. **Existing normalized duplicates:** migration 016 needs a read-only preflight for collisions before any future deployment attempt.
5. **Trigger dependency:** migration 016 references `public.morajaws_set_updated_at()`; its existence and signature must be verified against the target database.
6. **Local persistence/fallback:** legacy IndexedDB/offline ticket persistence and explicitly enabled local JSON fallback remain elsewhere in the codebase and require a separately scoped removal/reconciliation phase.
7. **Templates:** the uploaded ZIP does not contain all four official XLSX templates (`BASE_DATA_WO.xlsx`, `WO_KORLAP.xlsx`, `INSTALLER_WO.xlsx`, `ASSIGNED_TEKNISI.xlsx`). Full template-parity validation remains blocked.

## Safety

- No migration was deployed.
- No production database was modified.
- No protected soft-deleted WO records were changed.
- No secrets or environment files are included in this patch bundle.
- GitHub branch creation was denied by the connected GitHub integration with HTTP 403 (`Resource not accessible by integration`). Therefore these changes have **not** been pushed to GitHub.

## Next phase

Proceed to PHASE 16B.2 only after designing and testing a transactional RPC against an isolated staging database with schema preflight. Do not deploy migrations 015/016/017 to production without explicit approval and verified backup/preflight evidence.
