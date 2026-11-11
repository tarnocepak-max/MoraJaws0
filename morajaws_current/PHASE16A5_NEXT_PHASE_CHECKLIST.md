# PHASE 16A.5 → PHASE 16A.6 Checklist

- [x] Move UI configuration read/write to Express settings API.
- [x] Move canonical navigation read/write to Express settings API.
- [x] Move general and hierarchical droplists to Express settings API.
- [x] Move report dropdown and chat category settings to Express settings API.
- [x] Disable Firestore listener activation through the shared environment guard.
- [x] Add static regression tests and evidence.
- [ ] Implement atomic server-side merge for `global` app settings.
- [ ] Add realtime propagation for settings across active staff sessions.
- [x] Migrate contractor and coverage CRUD away from Firestore (PHASE 16A.7).
- [ ] Migrate remaining user/profile compatibility methods to the custom-auth Express APIs (initial safe user snapshot now uses Express in PHASE 16A.7).
- [ ] Migrate remaining WO/ticket and assignment compatibility functions.
- [ ] Migrate chat and trusted server-side audit logging.
- [ ] Migrate WhatsApp template CRUD and validate role gates.
- [ ] Migrate storage attachments to Supabase Storage and verify existing-file strategy.
- [ ] Remove Firebase Admin/client imports only after every feature path is replaced.
- [ ] Re-run complete typecheck, build, RBAC, API integration, and live staging tests.
- [ ] Review production backup/restore before any Firebase resource retirement.

## Explicit safety constraints
- Do not use Supabase Auth; retain custom MoraJaws login.
- Do not deploy Migration 005 or Migration 014 without separate SQL review and explicit approval.
- Do not delete the three protected soft-deleted WO test records.
- Do not remove Firebase historical backups until retention and restore procedures are verified.
