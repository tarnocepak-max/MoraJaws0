# MORAJAWS — PHASE 15A.6 SYSTEM FAILURE ANALYSIS
**Analisis Komprehensif Sistem**: Kegagalan Sinkronisasi, Endpoint, Adapter, dan Database  
**Status**: DIIDENTIFIKASI, DISINKRONISASI & DIPERBAIKI  

---

## 1. Analisis Kerentanan & Kegagalan Antar-Layer

### A. Inkonsistensi Endpoint Approval Mapping
- **Gejala**: Dokumentasi Phase 15A.1 mencantumkan endpoint `POST /api/auth/approve-mapping`, namun route tersebut belum didaftarkan di Express `server.ts`.
- **Dampak**: Super Admin tidak dapat melakukan otorisasi pemetaan akun staf secara programmatic melalui API ketika terjadi kasus `NEEDS_MAPPING`.
- **Solusi yang Diterapkan**: Menambahkan route `app.post('/api/auth/approve-mapping', requireSuperAdmin, ...)` yang memanggil fungsi `approveAuthUidMapping` di `server/supabaseAuthAdapter.ts`, dengan validasi format UUID dan verifikasi read-back.

### B. Masalah Race Condition Fixture DB pada Test Suite Phase 14C.3
- **Gejala**: Pengujian Google Sheets Config (`GET /api/integrations/google-sheets/config`) pada test suite 14C.3 gagal dengan `spreadsheetId=` kosong.
- **Akar Penyebab**: Fungsi `createExpressApp()` memanggil `loadDatabaseFromDisk()` secara synchronous pada awal inisialisasi, menimpa fixture in-memory `db.sheetsConfig` yang disiapkan sebelum pemanggilan fungsi pembuatan server.
- **Solusi yang Diterapkan**: Menata urutan inisialisasi pada `scripts/execute_phase14c3_endpoint_integration_test.ts` agar penugasan mock state dilakukan setelah pembuatan server Express selesai.

### C. Masalah Rekonsiliasi Bukti HTTP pada Test Suite Phase 14C.1
- **Gejala**: Test #66 pada Phase 14C.1 (Audit Secret Bundel Dist) tidak melakukan request HTTP over-the-wire, sehingga `evidenceCollector` mencatat record bukti dengan `url: '/no-execution'` dan `actual_status: 0`. Hal ini menyebabkan script rekonsiliasi integritas bukti melempar fatal error pelanggaran skema.
- **Solusi yang Diterapkan**: Menambahkan pemanggilan HTTP nyata `GET /api/health` sebelum audit dist pada Test #66, memastikan 100% dari 71 record bukti Phase 14C.1 memiliki bukti eksekusi HTTP riil di atas jaringan loopback.

### D. Penanganan Kesalahan Database Fail-Closed
- **Audit**: Memastikan bahwa ketika koneksi ke database Supabase terputus, backend tidak secara diam-diam beralih (silent fallback) ke database file JSON lokal di lingkungan produksi.
- **Bukti**: Seluruh endpoint penting (`/api/tickets/assign`, `/api/tickets/reassign`, `/api/tickets/:id/report`, `/api/users`, dll.) merespons dengan HTTP 503 `DATABASE_UNAVAILABLE` saat koneksi database gagal, memenuhi aturan keselamatan operasi fail-closed.

---

## 2. Status Work Order Terproteksi (Protected Work Orders)
Tiga record Work Order yang dilindungi mutlak:
1. `wo_1793825457141_u4bnht` (`WO-EXPRESS-TEST-1793825456810`)
2. `wo_imp_1793825458959_4i4f1h` (`WO-DUP-TEST-1793825458804`)
3. `wo_imp_1793825458959_262dei` (`WO-DUP-TEST-1793825458804-UNIQUE`)

**Hasil Verifikasi**:
- Status soft-deleted tetap dipertahankan.
- Setiap percobaan mutasi atau penghapusan melalui endpoint tiket maupun Supabase proxy diblokir keras dengan HTTP 403 `PROTECTED_PRODUCTION_RECORD`.
- Tidak ada penghapusan permanen atau perubahan data yang terjadi.
