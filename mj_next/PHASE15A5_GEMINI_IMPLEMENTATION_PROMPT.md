# MORAJAWS0 — PHASE 15A.5
# RUNTIME ACCEPTANCE, ANDROID/PWA COMPATIBILITY & DEPLOYMENT READINESS

## MANDAT

Kerjakan langsung pada source project MoraJaws0 yang diunggah. Ini UPDATE project existing, bukan rebuild. Phase 15A.4 melaporkan build dan 161 automated tests PASS, tetapi bukti itu belum membuktikan aplikasi berjalan benar di HP Android atau deployment host sebenarnya.

Prioritas phase ini adalah membuktikan aplikasi dapat dijalankan secara konsisten dari development sampai production-like runtime, menguji alur pengguna Android, dan memperbaiki hanya masalah yang terbukti.

## 1. BASELINE DAN PERLINDUNGAN

1. Catat commit/versi/struktur source yang diterima.
2. Baca seluruh laporan PHASE15A4_* dan bandingkan dengan source aktual. Jangan memperlakukan laporan sebagai kebenaran otomatis.
3. Jangan menghapus fitur, menu, halaman, role, workflow, atau konfigurasi yang masih digunakan.
4. Jangan melakukan operasi database: tidak ada DDL, migration, DROP, TRUNCATE, DELETE, reset, import, restore, atau perubahan RLS/GRANT production.
5. Jangan membuat/mengubah akun atau WO production.
6. Jangan menaruh credential asli di ZIP, log, frontend, atau test fixture. Gunakan .env.example dan dummy fixture.
7. Pertahankan Express sebagai satu-satunya jalur akses Supabase dari aplikasi browser.

## 2. RUNTIME ENTRYPOINT — WAJIB DIVERIFIKASI

Periksa `package.json`, `server.ts`, tsconfig, Vite config, build output, dan cara platform menjalankan aplikasi.

Khusus:
- `dev` harus menjalankan development server dengan benar.
- `build` harus menghasilkan `dist` yang valid.
- `start` harus menjalankan backend production dari artefak/runtime yang benar.
- Jangan mengasumsikan `node server.ts` valid pada versi Node yang digunakan. Verifikasi runtime aktual; pilih strategi yang kompatibel (misalnya compile server ke JS atau gunakan runner yang memang tersedia di production).
- Pastikan Express melayani `dist` dan API route tidak tertimpa SPA fallback.
- Pastikan asset path, React Router fallback, MIME type, cache header, dan deep-link refresh bekerja.
- Pastikan port diambil dari `process.env.PORT` dengan fallback aman.
- Pastikan bind host sesuai platform hosting.
- Pastikan startup tidak gagal hanya karena credential optional untuk fitur yang tidak digunakan; tetapi dependency wajib harus fail-closed dan memberi error server-side yang aman.
- Health endpoint tidak boleh membocorkan konfigurasi, token, stack trace, atau secret.

Tambahkan smoke test yang benar-benar menjalankan production start process, lalu melakukan HTTP request ke:
- `/`
- asset JS/CSS utama
- satu deep link frontend
- `/api/bootstrap` tanpa sesi
- satu endpoint API yang wajib autentikasi (pastikan ditolak dengan status yang benar)

## 3. ANDROID / PWA ACCEPTANCE

Periksa manifest, service worker (jika ada), viewport, safe-area, installability, icon, offline behavior, dan update lifecycle.

Perbaiki hanya temuan nyata:
- Tidak boleh ada horizontal overflow pada viewport Android umum.
- Login form dan dialog tidak boleh tertutup keyboard.
- Bottom navigation tidak menutupi tombol/form.
- Safe-area inset diterapkan jika dibutuhkan.
- Tap target memadai dan tidak ada interaksi yang bergantung pada hover.
- Refresh halaman pada deep link tidak menghasilkan 404.
- PWA update tidak boleh membuat cache HTML dan JS dari versi berbeda.
- Logout harus membersihkan state/cache privat yang relevan tanpa menghapus data aplikasi yang sah.
- Offline state harus menjelaskan bahwa data terbaru memerlukan koneksi; jangan menampilkan data lokal usang sebagai data authoritative.
- Jangan menyimpan access/refresh token dalam cache service worker atau Cache Storage.

Jika tidak tersedia browser/device Android nyata, tandai pengujian visual/device sebagai NOT TESTED, jangan mengklaim PASS.

## 4. AUTH & SESSION ACCEPTANCE

Periksa alur aktual di frontend dan backend:
- Login Supabase.
- Pemulihan sesi setelah reload.
- Refresh token/session.
- Logout dan session revocation.
- Change password.
- Akun nonaktif.
- Auth UID belum terpetakan / mismatch.
- Error jaringan dan Supabase outage.
- Session expired saat pengguna sedang membuka halaman.

Jangan menambahkan bypass atau fallback Firebase/local password di production.

Status cookie:
- Jika masih Bearer + localStorage, nyatakan PARTIAL. Jangan klaim full HttpOnly cookie.
- Jangan melakukan migrasi cookie setengah jadi.
- Jangan menghapus flow lama sebelum pengganti lengkap dan teruji.
- Jika melanjutkan cookie, semua request API, CSRF, refresh, logout, cookie flags, origin validation, dan session restoration harus konsisten.

## 5. ROLE & WORKFLOW REGRESSION

Uji keenam role yang digunakan project:
- super_admin
- dispatch
- leader
- installer
- management_data
- it_support

Uji server-side authorization, bukan hanya tampilan menu. Pastikan tidak ada privilege escalation melalui API langsung.

Pertahankan workflow:
- Dashboard Monitoring
- Work Order Management / Ticket MyRepublic
- Import Data WO
- Assign / Reassign WO
- Jadwal & Kalender
- Report, approval, dan close ticket
- Contractor / Area
- Installer management
- Live Chat Center
- WhatsApp
- Management User
- Pusat Setup
- Audit Log dan monitoring
- seluruh menu mobile dan desktop

Jangan memakai data customer asli untuk test. Gunakan fixture sintetis dan isolated test environment.

## 6. AUTOMATED TESTS DAN EVIDENCE

Jalankan dari source project:
- dependency install/check sesuai lockfile
- TypeScript check
- Vite build
- existing Phase 14C / 15A test suites yang relevan
- production start smoke test
- API auth/RBAC regression
- static scan frontend bundle untuk secret/token
- static scan browser storage usage
- static scan service worker/cache usage

Tambahkan test baru bila diperlukan. Jangan sekadar mengedit expected result agar test PASS.

Setiap hasil harus berlabel:
- PASS = command dijalankan dan berhasil.
- FAIL = dijalankan dan gagal.
- BLOCKED = terhalang prasyarat eksternal.
- NOT TESTED = belum dijalankan.

Lampirkan command, exit code, waktu, dan ringkasan output yang relevan. Jangan sertakan credential atau data pribadi.

## 7. DEPLOYMENT CONFIGURATION

Periksa `.env.example` dan dokumentasi konfigurasi:
- Daftar environment variable yang wajib dan optional.
- Validasi startup untuk env wajib.
- Tidak ada secret di VITE_ variables atau frontend bundle.
- CORS allowlist dan trusted origins.
- HTTPS/cookie behavior sesuai environment.
- PORT dan host binding.
- Production start command.
- Static build path.
- Logging aman dan tidak mencatat token/password.

Jangan mengisi nilai credential asli. Jangan deploy atau mengubah hosting tanpa izin.

## 8. ACCEPTANCE GATE

Phase 15A.5 boleh dinyatakan selesai hanya jika:
1. Production build berhasil.
2. Production start benar-benar berhasil pada runtime yang ditentukan.
3. Smoke HTTP check berhasil.
4. API bootstrap publik aman dan endpoint privat menolak request anonim.
5. Role/RBAC regression lulus.
6. Tidak ada secret di frontend bundle.
7. Tidak ada token sensitif di localStorage/Cache Storage jika target arsitektur sudah cookie.
8. Fitur existing tidak hilang.
9. Tidak ada perubahan database production.
10. Pengujian device yang tidak tersedia dinyatakan NOT TESTED.

Jika startup host nyata atau Android device tidak tersedia, status phase harus PARTIALLY COMPLETED, bukan COMPLETE.

## 9. OUTPUT WAJIB

Hasilkan ZIP lengkap source project, bukan hanya patch.

Tambahkan laporan:
- PHASE15A5_RUNTIME_ACCEPTANCE_REPORT.md
- PHASE15A5_ANDROID_PWA_COMPATIBILITY_REPORT.md
- PHASE15A5_AUTH_SESSION_ACCEPTANCE_REPORT.md
- PHASE15A5_ROLE_REGRESSION_REPORT.md
- PHASE15A5_DEPLOYMENT_READINESS_REPORT.md
- PHASE15A5_CHANGED_FILES.md
- PHASE15A5_REMAINING_ISSUES.md

Sertakan:
- penyebab dan perbaikan setiap error yang ditemukan
- command yang benar-benar dijalankan
- PASS/FAIL/BLOCKED/NOT TESTED
- cara menjalankan development dan production
- langkah manual Android yang masih harus dilakukan
- ZIP final lengkap

## INSTRUKSI AKHIR

Jangan hanya membuat laporan. Perbaiki kode yang terbukti bermasalah. Jangan mengarang hasil tes. Jangan mengubah database, akun, WO, atau production deployment. Pertahankan seluruh aplikasi MoraJaws.

Jika semua pemeriksaan lokal lulus tetapi pengujian Android nyata belum tersedia, berikan ZIP dan nyatakan batasan itu dengan jelas.
