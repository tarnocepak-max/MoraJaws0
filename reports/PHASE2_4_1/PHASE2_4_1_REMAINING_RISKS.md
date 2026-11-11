# MORAJAWS PHASE 2.4.1 — REMAINING RISKS & RECOMMENDATIONS
**Document Version:** 1.0.0  
**Phase:** Phase 2.4.1  
**Date:** 2026-11-11  

---

## 1. Remaining Technical Risks & Mitigation Status

| Risk Area | Risk Level | Description | Current Mitigation / Recommendation |
| :--- | :--- | :--- | :--- |
| **Remote Supabase Cutover Migration** | **MEDIUM** | Migrations 012 and 013 have only been executed against the local disposable PGlite environment to respect strict rules forbidding remote production/staging mutations. | When authorized by the user for remote cutover, apply migrations `012` and `013` to Supabase PostgreSQL using database administrator privileges. Preflight checks and idempotent functions prevent duplication. |
| **Legacy Firestore Deprecation** | **LOW** | While `saveTechnicalReport()` has eliminated all dual-writes, legacy read-only fallback or listeners may still exist in older sub-views (e.g. legacy historical tickets). | In upcoming phases, conduct a full codebase grep for `saveTicketToFirestore` and replace remaining non-technical report mutations with dedicated Express endpoints. |
| **Client Bundle Size** | **LOW** | Production bundle JS is ~3.9 MB uncompressed (778 kB gzipped) due to bundled UI libraries, Lucide icons, and PGlite dependencies. | Consider dynamic `import()` code-splitting for heavy analytical views or standalone reports when optimizing performance in future maintenance phases. |

---

## 2. Stop Checkpoint & Phase 3 Gate

**CRITICAL MANDATE ENFORCED:**  
In accordance with user instructions:
- Phase 2.4.1 is **100% complete**.
- All 12 required reports have been generated.
- **NO further actions, refactoring, or Phase 3 migrations will be initiated** until full audit review is conducted and explicit approval is provided by the user.
