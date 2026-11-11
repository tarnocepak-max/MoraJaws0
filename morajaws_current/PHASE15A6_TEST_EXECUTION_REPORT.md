# MORAJAWS — PHASE 15A.6 TEST EXECUTION REPORT
**Tanggal Eksekusi**: 7 November 2026  
**Lingkungan**: Linux Node.js v22.13.0, Express 4.21.2, Vite 6.1.0  
**Status Keseluruhan**: 100% PASS  

---

## 1. Ringkasan Eksekusi Test Suite

| Perintah Eksekusi | Deskripsi Test Suite | Jumlah Kasus | Lulus (PASS) | Gagal (FAIL) | Status |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `npm run lint` | TypeScript Type Check (`tsc --noEmit`) | Seluruh Berkas | Lulus | 0 | **PASS** |
| `npm run build` | Vite Production Bundle Build | 1695 Modul | Lulus | 0 | **PASS** |
| `npm run test:phase14c` | Behavioral & Remediation Consistency | 15 | 15 | 0 | **PASS** |
| `npm run test:phase14c.1` | Endpoint Integration & Security | 66 (71 HTTP Calls) | 66 | 0 | **PASS** |
| `npm run test:phase14c.2` | Remaining Endpoints Verification | 80 (80 HTTP Calls) | 80 | 0 | **PASS** |
| `npm run test:phase14c.2.1` | Coverage Reconciliation Audit | 133 Route / 225 Calls | 133 | 0 | **PASS** |
| `npm run test:phase14c.2.4` | Assertion Integrity & Quarantine Audit | 14 | 14 | 0 | **PASS** |
| `npm run test:phase14c.2.4.1` | Collector Verdict Hardening & Regression | 21 | 21 | 0 | **PASS** |
| `npm run test:phase14c.3` | Extended Endpoint Integration | 74 (74 HTTP Calls) | 74 | 0 | **PASS** |
| `npm run test:phase15a` | Supabase Auth Migration & Login Repair | 18 (38 HTTP Calls) | 18 | 0 | **PASS** |
| `npm run test:phase15a.1` | Session Hardening & Identity Mapping | 17 (17 HTTP Calls) | 17 | 0 | **PASS** |
| `npm run test:phase15a.2` | Static Security & Cutover Guard Check | 6 | 6 | 0 | **PASS** |

**Total Pengujian**: Lebih dari 300 skenario pengetesan dieksekusi secara nyata tanpa satupun kegagalan.

---

## 2. Rincian Pengujian Utama Autentikasi Phase 15A & 15A.1

### Phase 15A: Supabase Auth Staff Migration & Login Repair
- **Test #1**: Login username valid (`superadmin`) → HTTP 200 **[PASS]**
- **Test #2**: Login email valid (`dispatch@morajaws.net`) → HTTP 200 **[PASS]**
- **Test #3**: Password salah → HTTP 401 `auth/wrong-password` **[PASS]**
- **Test #4**: Username tidak ditemukan → HTTP 404 `auth/user-not-found` **[PASS]**
- **Test #5**: Akun tidak aktif → HTTP 403 `ACCOUNT_DISABLED` **[PASS]**
- **Test #6**: Profil staff tidak ditemukan → HTTP 404 `auth/user-not-found` **[PASS]**
- **Test #7**: Auth UID mismatch → HTTP 403 `AUTH_UID_MISMATCH` **[PASS]**
- **Test #8**: Token rusak / tampered → HTTP 401 **[PASS]**
- **Test #9**: Token kedaluwarsa → HTTP 401 **[PASS]**
- **Test #10**: Refresh token → HTTP 200 **[PASS]**
- **Test #11**: Logout sesi → HTTP 200 **[PASS]**
- **Test #12**: Session revocation → HTTP 200 **[PASS]**
- **Test #13**: Login seluruh 6 role staf → HTTP 200 **[PASS]**
- **Test #14**: Penegakan otorisasi per role (Super Admin vs Leader vs Installer) → **[PASS]**
- **Test #15**: Isolasi penugasan tiket Teknisi → HTTP 403 **[PASS]**
- **Test #16**: Isolasi area kontraktor Korlap/Leader → HTTP 403 **[PASS]**
- **Test #17**: Penolakan token Firebase pada mode produksi → HTTP 403 **[PASS]**
- **Test #18**: Pencegahan kebocoran secret, password hash, dan email pada endpoint publik → **[PASS]**

### Phase 15A.1: Session Hardening & Identity Mapping
- **Test #1**: Token Supabase valid diverifikasi → HTTP 200 **[PASS]**
- **Test #2**: Header Firebase ditolak di produksi → HTTP 403 `FIREBASE_AUTH_DISABLED_PRODUCTION` **[PASS]**
- **Test #3**: Token sesi lokal ditolak di produksi → HTTP 401 `LOCAL_AUTH_DISABLED_PRODUCTION` **[PASS]**
- **Test #4**: Auth UID mismatch diblokir → HTTP 403 `AUTH_UID_MISMATCH` **[PASS]**
- **Test #5**: Akun belum dipetakan ditandai `NEEDS_MAPPING` (tanpa auto-link) → HTTP 403 **[PASS]**
- **Test #6**: Kegagalan penyimpanan mapping ditangani fail-closed → HTTP 500 **[PASS]**
- **Test #7**: Mapping disetujui Super Admin & diverifikasi read-back → HTTP 200 **[PASS]**
- **Test #8**: Logout menaikkan `sessionVersion` dan diverifikasi di database → HTTP 200 **[PASS]**
- **Test #9**: Kegagalan update `sessionVersion` saat logout ditolak fail-closed → HTTP 500 **[PASS]**
- **Test #10**: Refresh token memperbarui session tokens → HTTP 200 **[PASS]**
- **Test #11**: Token lama ditolak setelah revokasi sesi lintas perangkat → HTTP 401 `SESSION_REVOKED` **[PASS]**
- **Test #12**: Percobaan ganti password lokal diblokir di produksi → HTTP 400 `LOCAL_PASSWORD_DISABLED` **[PASS]**
- **Test #13**: Status penyimpanan sesi dan evaluasi HttpOnly Cookie → Terverifikasi **[PASS]**
- **Test #14**: Proteksi CSRF memblokir request tidak sah → **[PASS]**
- **Test #15**: Token kedaluwarsa mengembalikan kode eksplisit → HTTP 401 `TOKEN_EXPIRED` **[PASS]**
- **Test #16**: Akun staf nonaktif diblokir → HTTP 403 `ACCOUNT_DISABLED` **[PASS]**
- **Test #17**: Integritas matriks RBAC seluruh role terjaga utuh → **[PASS]**
