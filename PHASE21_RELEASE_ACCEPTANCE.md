# PHASE 21 — Release Readiness Acceptance

## Local
- [ ] Clean dependency install from lockfile.
- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration tests.
- [ ] Production build.
- [ ] RBAC API tests.
- [ ] Custom login/session/reset-password tests.
- [ ] Import/export XLSX template tests.
- [ ] WO assignment and installer report tests.
- [ ] Backup/restore runbook reviewed.

## Staging (only with explicit staging credentials and approval)
- [ ] Migration preflight.
- [ ] Migration execution approved and logged.
- [ ] Database schema verification.
- [ ] Login and RBAC.
- [ ] Atomic import and concurrent idempotency.
- [ ] Duplicate normalization.
- [ ] Storage/upload tests.
- [ ] Backup/restore verification.
- [ ] Audit log verification.

## Release gate
Do not label production-ready if:
- Any P0/P1 issue remains.
- Build/typecheck is blocked.
- Live staging tests are not performed where required.
- Migration ledger is unknown.
- Official XLSX template parity is unverified.
- Secrets are exposed or auth/RBAC is bypassable.
