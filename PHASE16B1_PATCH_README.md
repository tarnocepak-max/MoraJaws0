# MoraJaws PHASE 16B.1 patch bundle

This bundle contains only the files changed for Phase 16B.1 plus the remediation report.

## Apply locally

1. Check out the intended feature branch from the repository root.
2. Extract this bundle into the repository root, preserving paths and allowing the four source/test files to be replaced.
3. Review `git diff` before committing.
4. Run `node scripts/execute_phase16b_wo_import_test.mjs`.
5. Install the project's locked dependencies and run typecheck/build before merging.

No `.env`, credentials, database dump, `node_modules`, or migration deployment is included.

## Important

This is a Phase 16B.1 incremental patch, not a complete production-ready import pipeline. Atomic transaction/RPC, concurrency-safe idempotency, canonical database duplicate matching, live staging tests, and the remaining items in `reports/PHASE16B1_REMEDIATION_REPORT.md` are still open.
