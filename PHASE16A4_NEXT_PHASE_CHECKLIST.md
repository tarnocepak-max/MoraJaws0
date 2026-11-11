# PHASE 16A.4 — NEXT PHASE CHECKLIST

## Phase 16A.5 — Firestore feature-path replacement
- [ ] Inventory each Firestore collection, document shape, query, listener, write, delete, and transaction.
- [ ] Map each feature to an existing Supabase table or a reviewed additive schema proposal.
- [ ] Implement server-side Express APIs for navigation configuration.
- [ ] Implement server-side Express APIs for UI/global configuration and user preferences.
- [ ] Implement server-side Express APIs for droplist/report categories.
- [ ] Replace `AppContext.tsx` and `firestoreDb.ts` call sites with backend repository methods.
- [ ] Replace navigation and UI configuration Firestore call sites.
- [ ] Replace profile/config and other Firestore call sites.
- [ ] Preserve role visibility, contractor/area scoping, and audit events.
- [ ] Add regression tests for create/read/update/delete/listener/reconnect behavior.
- [ ] Verify frontend bundle contains no Firebase SDK or secret.
- [ ] Verify no runtime import of `firebase` or `firebase-admin` remains.

## Phase 16A.6 — Attachment migration
- [ ] Inventory Firebase Storage object paths and references in WO/report/chat/user profile data.
- [ ] Verify object ownership, MIME, size, and authorization.
- [ ] Migrate to private `morajaws-reports` bucket using signed URLs or authenticated proxy.
- [ ] Update `attachments.storage_provider` only after every object has been verified in Supabase Storage.
- [ ] Verify image/PDF/XLSX preview, download, and chat attachment flows.

## Phase 16A.7 — Firebase removal
- [ ] Remove Firebase Auth transitional token validation only after custom-auth tests pass.
- [ ] Remove Firebase initialization and all Firebase imports.
- [ ] Remove `firebase` and `firebase-admin` dependencies and obsolete environment variables.
- [ ] Keep archival backup files until retention and restore requirements are satisfied.
- [ ] Clean install, typecheck, production build, security tests, and end-to-end regression all pass.

## Production cutover gate
- [ ] Full verified backup and SHA-256 manifest.
- [ ] Record counts and data reconciliation.
- [ ] Custom login/session/reset/revoke test matrix passes.
- [ ] All protected soft-deleted WO records remain byte-for-byte/logically unchanged.
- [ ] Rollback rehearsal succeeds.
- [ ] Owner explicitly approves production migration window.
