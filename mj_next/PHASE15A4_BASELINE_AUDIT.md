# MORAJAWS — PHASE 15A.4 BASELINE AUDIT

## 1. Project Overview & Architecture Target
- **Nama Aplikasi**: MoraJaws (Field Operations & Dispatching Management System)
- **Target Produksi**: React 19 + Vite (Frontend) -> Express 4.21 (Backend API Layer) -> Supabase PostgreSQL & Supabase Auth.
- **Prinsip Immutability**: 3 Work Order Terproteksi (`wo_1793825457141_u4bnht`, `wo_imp_1793825458959_4i4f1h`, `wo_imp_1793825458959_262dei`) tidak boleh dihapus, di-restore, atau dimutasi.
- **Konstitusi Keamanan**: Browser tidak boleh mengakses Supabase secara langsung; tidak ada credential server-role key atau token sensitif yang bocor ke bundle frontend atau localStorage.

## 2. Struktur Proyek & Entry Point
- **Frontend Entry Point**: `/index.html` -> `/src/main.tsx` -> `/src/App.tsx`
- **Backend Entry Point**: `/server.ts` (Express mounted dengan Vite middleware pada dev, serve static `dist/` pada production)
- **Kompilasi & Script package.json**:
  - `"dev": "tsx server.ts"`
  - `"start": "node server.ts"`
  - `"build": "vite build"`
  - `"lint": "tsc --noEmit"`
  - `"test:phase14c"`: Uji konsistensi dan integritas data Supabase vs Express
  - `"test:phase14c.1"`: Uji 27 endpoint inti, RBAC, dan audit boundary
  - `"test:phase14c.2"`: Uji 80 endpoint sisa, fail-closed, immutability, dan mitigasi keamanan

## 3. Hasil Audit Baseline Komponen & Modul
| Area | Status Baseline | Temuan Audit |
| :--- | :---: | :--- |
| **Frontend Startup** | TERDIAGNOSIS & DIPERBAIKI | Tidak adanya React Error Boundary menyebabkan uncaught exception saat render langsung merusak root React (layar putih/blank). Null-check pada `currentUser` di `MainLayout` sebelum login berisiko memicu TypeError. |
| **Error Boundary** | AKTIF | Dibuat `src/components/common/MoraJawsErrorBoundary.tsx` dengan UI glossy dark purple/lilac MoraJaws, penanganan insiden aman tanpa ekspos stack trace, serta tombol recovery. |
| **Backend Express** | STABIL | Express server berjalan normal pada port 3000, melayani request HTTP 200 OK untuk antarmuka publik dan API bootstrap. |
| **Supabase Auth Adapter** | TERVERIFIKASI | Adapter `server/supabaseAuthAdapter.ts` dan middleware auth `server.ts` menggunakan verifikasi JWT Supabase dan server session version. |
| **3 Protected WO Records** | AMAN | Ketiga record soft-deleted tetap terisolasi dan ditolak keras dari mutasi apapun (HTTP 403 `PROTECTED_RECORD`). |

## 4. File-File Kritis Teridentifikasi
1. `/server.ts`: Pusat routing Express, middleware auth/RBAC, dan adapter sinkronisasi.
2. `/src/main.tsx`: Entry point React, kini diproteksi dengan `<MoraJawsErrorBoundary>`.
3. `/src/App.tsx`: Layout utama dan routing role; diproteksi safe optional chaining dan error boundary ganda.
4. `/src/components/common/MoraJawsErrorBoundary.tsx`: Komponen error boundary darurat antarmuka.
5. `/scripts/execute_phase14c2_remaining_endpoint_test.ts`: Suite audit 80 endpoint keamanan & RBAC.
