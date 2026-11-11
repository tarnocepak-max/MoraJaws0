# MORAJAWS — PHASE 15A.4 CHANGED FILES

## Daftar File yang Diubah atau Ditambahkan Beserta Rasionya

### 1. `src/components/common/MoraJawsErrorBoundary.tsx` [FILE BARU]
- **Tujuan**: Mencegah crash fatal / blank screen pada frontend React jika terjadi runtime render exception.
- **Fitur**: UI glossy dark purple & lilac khas MoraJaws, ID Insiden acak untuk pelaporan, tombol "Muat Ulang Aplikasi" dan "Bersihkan Sesi", serta sanitasi error tanpa mengekspos credential atau token ke layar.

### 2. `src/main.tsx` [DIUBAH]
- **Tujuan**: Membungkus root `<App />` dengan `<MoraJawsErrorBoundary>` sehingga kegagalan mount atau runtime exception tidak pernah merusak halaman web pengguna.

### 3. `src/App.tsx` [DIUBAH]
- **Tujuan**:
  - Membungkus `<MainLayout />` di dalam `App` dengan `<MoraJawsErrorBoundary>`.
  - Mengamankan logika `isInstaller = Boolean(isLoggedIn && currentUser?.role === 'installer')` agar rule installer tidak dievaluasi saat pengguna belum login.
  - Memperbaiki `getInitialActiveTab`, `leaderUnassignedCount`, `installerPendingCount`, dan `installerUnreadChatCount` dengan pengecekan `if (!isLoggedIn) return 0` dan safe optional chaining pada `currentUser`.

### 4. `server.ts` [DIUBAH]
- **Tujuan**:
  - Menyelaraskan `/api/auth/change-password` agar validasi kata sandi default `12345678` diperiksa sebelum pengecekan hash kata sandi lama.
  - Menambahkan pengecekan Supabase pada `/api/storage/refresh-signed-url` dan `/api/storage/download` untuk menegakkan isolasi otorisasi kontraktor di mode produksi Supabase.
  - Menambahkan middleware `requireRealtimeSandboxEnabled` dan `requireSandboxEnabled` yang menolak akses ke fitur laboratorium saat fitur flag bernilai false di produksi (HTTP 403 `FEATURE_DISABLED` & `SANDBOX_DISABLED`).
  - Menyelaraskan render template WhatsApp pada `/api/whatsapp/preview` agar mengembalikan `{ success: true, ... }` dengan normalisasi variabel camelCase dan snake_case.

### 5. `scripts/execute_phase14c2_remaining_endpoint_test.ts` [DIUBAH]
- **Tujuan**:
  - Memperbaiki urutan inisialisasi sesi (`setupTestAuthSessions`) agar dieksekusi setelah `createExpressApp` aktif.
  - Menambahkan mock record user dan mock work order lengkap untuk pengujian loopback Test 6 dan Test 53 sehingga 80/80 test lulus sempurna.
