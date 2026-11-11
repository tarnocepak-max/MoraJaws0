# MORAJAWS0 — PHASE 15A.1 SECURITY AUDIT & HARDENING REPORT
**Document ID**: MORAJAWS-SEC-PHASE15A1-001  
**Target System**: MoraJaws Production Auth & Session Subsystem (`server.ts`, `server/supabaseAuthAdapter.ts`)  
**Status**: COMPLETED & VERIFIED  
**Date**: November 2026  

---

## 1. Executive Summary

Dalam Phase 15A.1, tim arsitektur dan keamanan MoraJaws melakukan audit menyeluruh serta pengerasan keamanan (hardening) pada alur autentikasi, manajemen sesi, pemetaan identitas Supabase Auth UID, dan eliminasi jalur kredensial legacy.

Seluruh celah keamanan kritis yang teridentifikasi dalam audit Phase 15A telah diperbaiki:
1. **Local Authentication Production Leakage**: Akses token lokal dan Firebase token kini ditolak secara absolut pada mode produksi (`!isLocalJsonModeAllowed()`), menghentikan bypass autentikasi.
2. **Auto-linking Privilege Seizure**: Mekanisme auto-linking Supabase Auth UID saat login pertama telah dihapus seluruhnya. Setiap akun tanpa mapping terdaftar dikunci dengan status `NEEDS_MAPPING` dan mewajibkan persetujuan eksplisit dari Super Admin (`approveAuthUidMapping`).
3. **Session Revocation & Logout Failure Bypass**: Endpoint logout dan pencabutan sesi kini memberlakukan read-back verification terhadap `sessionVersion` di database otoritatif Supabase. Kesalahan database tidak lagi ditelan (`catch {}`), dan sistem menerapkan prinsip *fail-closed*.
4. **Production Password Hardening**: Pembuatan staff baru tidak lagi menyuntikkan `DEFAULT_HASH` ('12345678') pada mode produksi. Endpoint ganti password lokal diblokir (`LOCAL_PASSWORD_DISABLED`), dan reset password dialihkan ke alur email recovery Supabase Auth.
5. **Token Storage Architecture Evaluation**: Migrasi token storage ke HttpOnly/Secure/SameSite cookie dievaluasi secara mendalam. Ditemukan kendala arsitektural fatal pada lingkungan Google AI Studio iframe (cross-origin third-party cookie partitioning). Status migrasi cookie ditandai **BLOCKED** secara transparan dengan mitigasi kompensasi aktif.

---

## 2. Threat Modeling & Vulnerability Remediation Matrix

| Threat ID | Vulnerability Vector | Severity Before | Remediated In Phase 15A.1 | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **THREAT-01** | Local session token or Firebase JWT accepted in production via `resolveUserFromHeader()` | **CRITICAL** | Production mode rejects non-Supabase JWTs (`LOCAL_AUTH_DISABLED_PRODUCTION`) and Firebase tokens (`FIREBASE_AUTH_DISABLED_PRODUCTION`) with 401/403. | **PASS** (Scenario 2, 3) |
| **THREAT-02** | Automatic Auth UID assignment on first login enables account hijacking if email matches unlinked profile | **HIGH** | Auto-linking eliminated. Unlinked accounts return 403 `NEEDS_MAPPING`. Exact mismatch returns 403 `AUTH_UID_MISMATCH`. | **PASS** (Scenario 4, 5) |
| **THREAT-03** | Silent DB failure on logout/revocation leaving invalid token usable | **HIGH** | `sessionVersion` increment is awaited, strictly checked, read back from Supabase, and memory cache purged. Failures return 500/503. | **PASS** (Scenario 8, 9, 11) |
| **THREAT-04** | Default password hash (`12345678`) injected into new user profiles in production | **MEDIUM** | In production, `passwordHash` is set to `''`. Default hashes are completely disabled. | **PASS** (Scenario 12) |
| **THREAT-05** | Local password change endpoint (`/api/auth/change-password`) used in production | **MEDIUM** | Explicitly blocked with HTTP 400 `LOCAL_PASSWORD_DISABLED` when not in local JSON mode. | **PASS** (Scenario 12) |
| **THREAT-06** | Recursive RLS query causing infinite loop / DoS in PostgreSQL | **HIGH** | Draft Migration 005 redesigned with `SECURITY DEFINER` function `public.get_auth_user_role()` avoiding RLS recursion. | **PASS** (Static Audit) |

---

## 3. Deep Architectural Evaluation: Token Storage & Cookie Migration

### 3.1 Status: BLOCKED
Penyimpanan token saat ini tetap menggunakan in-memory state dengan sinkronisasi `localStorage` pada client React. Rencana migrasi penuh ke `HttpOnly; Secure; SameSite=Lax/Strict` cookie melalui Express backend ditandai **BLOCKED**.

### 3.2 Root Cause Analysis & Environmental Constraints
1. **Google AI Studio Iframe Context**:
   - Aplikasi MoraJaws beroperasi di dalam iframe preview pada domain Cloud Run / AI Studio (`*.usercontent.goog` atau sejenis).
   - Browser modern (Chrome, Safari, Firefox) memberlakukan *Third-Party Cookie Deprecation* dan *CHIPS (Cookies Having Independent Partitioned State)*.
   - Jika Express menyetel cookie `HttpOnly; Secure; SameSite=Strict` atau `SameSite=Lax`, browser memblokir pengiriman cookie tersebut dalam request iframe cross-origin, menyebabkan seluruh request API gagal dengan unauthenticated 401.
   - Menyetel `SameSite=None; Secure` membutuhkan konfigurasi domain terverifikasi dan tetap rentan diblokir oleh pelindung privasi browser mobile (misal Safari ITP pada iOS atau Android Chrome Third-Party Cookie blocking).
2. **Incomplete Client-Side Refactoring**:
   - Lebih dari 24 komponen UI dan service (`authService.ts`, `apiService.ts`, live chat hub, ticket adapters) mengirimkan `Authorization: Bearer <token>`.
   - Mengubah ke cookie-based authentication memerlukan refactor total pada seluruh pemanggilan `fetch` untuk menyertakan `credentials: 'include'` dan implementasi *Double-Submit CSRF Token* atau header kustom `X-CSRF-Token`.
   - Melakukan migrasi parsial tanpa menyelesaikan seluruh caller akan memutus koneksi aplikasi di perangkat Android owner.

### 3.3 Compensating Security Controls
Sebagai kompensasi selama status cookie BLOCKED:
- **Server-Side Session Versioning**: Setiap permintaan API memverifikasi `sessionVersion` user secara realtime terhadap PostgreSQL Supabase. Token yang dicuri dapat segera dimatikan dari jarak jauh melalui `/api/sessions/revoke`.
- **Short-Lived Access Tokens**: Token akses Supabase Auth memiliki masa berlaku terbatas (default 3600 detik / 1 jam).
- **CSRF Protection Guard**: Fungsi `validateCsrfProtection()` diterapkan pada backend Express untuk memeriksa kesesuaian `Origin`/`Host` dan memvalidasi keberadaan header anti-CSRF kustom (`Authorization`, `X-Requested-With`).
- **No Token Exposure in HTML/URL**: Token tidak pernah disuntikkan ke URL query parameter, markup HTML publik, atau log server.

---

## 4. Identity Mapping Security Architecture

### 4.1 Strict Identity Binding
Hubungan antara identitas Supabase Auth (`auth.users.id`) dan profil aplikasi MoraJaws (`public.users.id`) diatur dengan prinsip zero-trust:
1. `users.id` (UUID) adalah ID profil kanonikal aplikasi yang menjadi foreign key untuk tiket WO, log audit, riwayat chat, dan surat tugas.
2. `users.auth_user_id` (UUID nullable) adalah ID unik dari Supabase Auth (`sub` claim pada JWT).
3. **No Dynamic Auto-Binding**: Tidak ada mekanisme "temukan email yang sama lalu tautkan secara otomatis". Semua penautan wajib melalui verifikasi status Super Admin.

### 4.2 Super Admin Controlled Approval Flow
Prosedur penautan identitas dilakukan melalui:
```http
POST /api/auth/approve-mapping
Authorization: Bearer <super_admin_jwt>
Content-Type: application/json

{
  "profileId": "00000000-0000-4000-8000-000000000001",
  "authUserId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```
Validasi keamanan yang dijalankan:
- Pemanggil harus memiliki role `super_admin`.
- Format `profileId` dan `authUserId` divalidasi sebagai UUID v4.
- Profil tujuan harus aktif (`isActive === true`) dan tidak dihapus (`deletedAt === null`).
- `authUserId` belum pernah dipetakan ke profil manapun (1:1 uniqueness invariant).
- Write operation ke PostgreSQL Supabase divalidasi dengan **Read-Back Verification**. Jika nilai yang tersimpan tidak identik dengan `authUserId`, transaksi dibatalkan dengan status 500.

---

## 5. Fail-Closed Resilience Verification

Sistem autentikasi produksi telah diuji terhadap skenario kegagalan:
1. **Supabase Database Outage**:
   - Jika Supabase Auth API atau PostgreSQL tidak dapat dihubungi saat resolving token atau logging out, backend merespons dengan HTTP 503 `DATABASE_UNAVAILABLE`.
   - Backend **TIDAK PERNAH** kembali ke `morajaws_database.json` atau memvalidasi sesi lokal.
2. **Account Deactivation Invariant**:
   - Jika status staff diubah menjadi `isActive: false` atau `deletedAt: <timestamp>`, token aktif Supabase Auth yang masih valid secara kriptografis langsung ditolak pada request berikutnya dengan HTTP 403 `ACCOUNT_INACTIVE`.

---

## 6. Conclusion & Security Sign-Off

Phase 15A.1 telah berhasil menutup seluruh celah bypass autentikasi produksi, meniadakan auto-linking yang rentan pembajakan, memastikan auditability logout dan pencabutan sesi, serta menyajikan analisis transparan terkait status cookie storage.
Sistem autentikasi MoraJaws berada dalam kondisi **SECURE, HARDENED, and VERIFIED**.
