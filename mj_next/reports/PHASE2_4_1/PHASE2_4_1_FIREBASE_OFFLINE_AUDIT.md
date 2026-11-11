# MORAJAWS PHASE 2.4.1 — FIREBASE & OFFLINE SYNC AUDIT
**Document Version:** 1.0.0  
**Phase:** Phase 2.4.1  
**Target:** Client-Side Synchronization & Storage Integrity  
**Status:** **AUDITED & VERIFIED PASS**

---

## 1. Single Source of Truth & Zero Dual-Write

A primary objective of Phase 2.4.1 is ensuring that PostgreSQL is the sole, authoritative database for MoraJaws production operations, with Firestore deprecated for transactional storage and dual-writes eliminated.

### Code Audit in `src/context/AppContext.tsx`
- **Previous Implementation:** `saveTechnicalReport()` contained a secondary call to `saveTicketToFirestore(updatedTicket)` alongside local state updates.
- **Remediated Implementation:** The secondary `saveTicketToFirestore` call was completely removed from `saveTechnicalReport()`.
- **Authoritative Flow:**
  1. The client dispatches a single HTTP `POST` request to `/api/tickets/:id/report`.
  2. The Express server executes `submitTechnicalReportAtomic()` via PostgreSQL RPC `fn_submit_technical_report_atomic`.
  3. The client receives the confirmed JSON response from PostgreSQL before updating UI state to `SAVED`.

---

## 2. Sync Status Lifecycle & UI Representation

The UI strictly adheres to a 4-state lifecycle for technical reporting:

| State | Condition | UI Indication |
| :--- | :--- | :--- |
| **`SYNCING`** | Request dispatched to Express backend, awaiting database commit | Blue spinning indicator |
| **`SAVED`** | PostgreSQL confirms atomic transaction commit via HTTP 200 | Green banner: "Laporan Tersimpan di Database PostgreSQL" |
| **`PENDING_SYNC`** | Network disconnected; report enqueued to local IndexedDB queue | Amber warning banner: "Tersimpan di Antrean Offline (PENDING_SYNC). Akan dikirim ke PostgreSQL saat online." |
| **`ERROR`** | Server rejected request (HTTP 4xx/5xx) or database unavailable (HTTP 503) | Red alert banner with explicit error details |

---

## 3. IndexedDB Offline Queue & Replay Protocol

- **Queue Mechanism:** IndexedDB store `app_sync_queue` managed by `src/lib/offlineQueue.ts`.
- **Enqueueing:** When offline (`!navigator.onLine`), `saveTechnicalReport()` invokes `enqueueChange(...)` with `action: 'REPORT'`.
- **Replay Execution:**
  - Upon network reconnection (`window.addEventListener('online')`), `flushOfflineQueue()` triggers registered handlers.
  - The handler in `AppContext.tsx` replays the report by issuing a real HTTP `POST` to `/api/tickets/:id/report`.
  - Database idempotency in `fn_submit_technical_report_atomic` guarantees that replaying an already-processed report updates the record without creating duplicate entries or throwing primary key collisions.
  - Upon successful HTTP 200 confirmation, the queue item is deleted and sync status transitions to `SAVED`.
