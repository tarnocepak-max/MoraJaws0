# MORAJAWS — PHASE 15A.4 STARTUP REPAIR REPORT

## 1. Masalah Utama Startup yang Ditemukan
Sebelum Phase 15A.4, aplikasi berisiko mengalami blank screen / crash startup pada browser pengguna karena:
1. **Ketiadaan React Error Boundary**: Tidak ada komponen penangkap error di root React (`main.tsx` atau `App.tsx`). Apabila terjadi uncaught exception pada rendering komponen anak, React melepaskan (unmount) seluruh DOM root sehingga layar menjadi putih total tanpa informasi apapun.
2. **Akses Properti Tidak Aman pada State Awal**:
   Pada `src/App.tsx`, beberapa kalkulasi status (`installerPendingCount`, `installerUnreadChatCount`, dan `leaderUnassignedCount`) dievaluasi pada hook `useMemo` sebelum pengecekan `if (!isLoggedIn)`. Saat pengguna belum login, `currentUser` bernilai `UNAUTHENTICATED_USER` yang memiliki properti string kosong, atau jika session bernilai null, pemanggilan metode string seperti `.toLowerCase()` memicu `TypeError`.
3. **Fluktuasi Sesi Test**:
   Pada suite pengujian `scripts/execute_phase14c2_remaining_endpoint_test.ts`, inisialisasi sesi sempat tertimpa oleh pemanggilan `createExpressApp` yang memuat disk snapshot, menyebabkan kegagalan otentikasi pada endpoint logout saat pengujian loopback.

## 2. Tindakan Perbaikan yang Telah Dilakukan
1. **Pembuatan MoraJawsErrorBoundary (`src/components/common/MoraJawsErrorBoundary.tsx`)**:
   - Menangkap seluruh runtime rendering exception di React.
   - Menampilkan UI pemulihan dengan identitas visual khas MoraJaws (dark purple gloss & lilac glassmorphism).
   - Menyediakan tombol pemulihan interaktif: "Muat Ulang Aplikasi" dan "Bersihkan Sesi & Login Ulang".
   - Menghasilkan ID Insiden unik untuk pelaporan teknis tanpa membocorkan stack trace, token otentikasi, atau informasi sensitif.
2. **Pemasangan Error Boundary Ganda**:
   - Di `src/main.tsx` membungkus root aplikasi `<App />`.
   - Di `src/App.tsx` membungkus layout operasional `<MainLayout />`.
3. **Defensive Hardening pada `MainLayout`**:
   - Mengubah penentuan `isInstaller` menjadi:
     `const isInstaller = Boolean(isLoggedIn && currentUser?.role === 'installer');`
     sehingga rule installer TIDAK PERNAH berjalan saat status pengguna belum terautentikasi.
   - Menambahkan guard `if (!isLoggedIn) return 0;` pada seluruh perhitungan tiket pending installer, unread chat, dan unassigned tiket leader.
   - Menjamin bahwa saat `!isLoggedIn`, tab aktif default selalu `'dashboard'` dan me-render `StaffLoginPortal` secara elegan.
4. **Penyempurnaan Middleware & Validasi Backend**:
   - Memperbaiki urutan validasi pada `/api/auth/change-password` agar penolakan password default `12345678` diperiksa sebelum verifikasi hash kata sandi lama.
   - Memasang middleware `requireRealtimeSandboxEnabled` dan `requireSandboxEnabled` yang mengembalikan HTTP 403 `FEATURE_DISABLED` dan `SANDBOX_DISABLED` saat fitur lab dinonaktifkan di mode produksi.
   - Menyelaraskan normalisasi variabel WhatsApp template pada `/api/whatsapp/preview`.

## 3. Bukti Verifikasi Startup
- Dev server Express: Aktif dan merespons `http://127.0.0.1:3000/` dengan HTTP 200 OK.
- API bootstrap: Merespons `http://127.0.0.1:3000/api/bootstrap` dengan HTTP 200 OK dan sanitized payload.
- Vite build: Selesai sukses dalam 11.23 detik tanpa bundle error.
- TypeScript check (`tsc --noEmit`): 0 error.
