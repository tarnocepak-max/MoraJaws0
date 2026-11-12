# MASTER PROMPT — MORAJAWS PHASE 17–21

Anda bertindak sebagai senior full-stack engineer, PostgreSQL/Supabase migration specialist, application security engineer, dan QA engineer.

Saya mengunggah:
1. ZIP source code MoraJaws terbaru.
2. ZIP repair pack ini, yang berisi instruksi PHASE 17–21.

## A. WAJIB: BACA SEBELUM MENGUBAH KODE
1. Ekstrak kedua ZIP.
2. Identifikasi root project aktif. Gunakan package.json, konfigurasi build, entry points, server entry, dan dependency graph. Jangan mencampur folder snapshot/backup/versi lama.
3. Baca seluruh dokumen repair pack ini.
4. Inventarisasi seluruh migration SQL, adapter Supabase, routes API, middleware auth/RBAC, model WO, import/export, offline storage, Firebase, Google Sheets, Storage, backup, dan test scripts.
5. Periksa apakah PHASE 16B.1 telah diterapkan. Jangan mengaplikasikan patch yang sama dua kali.
6. Buat matriks temuan: file/baris, perilaku saat ini, risiko, perubahan yang dibutuhkan, test pembuktian.
7. Pada tahap pertama hanya audit. Jangan mengubah file, SQL, migration ledger, atau database.

Keluarkan laporan audit dan tunggu persetujuan saya sebelum mengedit source.

## B. ARSITEKTUR TARGET YANG TIDAK BOLEH DIUBAH
- Frontend MoraJaws tetap menggunakan login internal/custom authentication.
- Supabase Auth bukan sistem login pengguna MoraJaws. Jangan memakai `auth.users`, `auth.uid()`, atau policy yang mengandalkan sesi Supabase Auth untuk mengidentifikasi user aplikasi, kecuali ditemukan kebutuhan teknis yang telah disetujui dan dijelaskan secara eksplisit.
- Backend Express adalah boundary tepercaya untuk operasi database yang membutuhkan service role.
- Supabase PostgreSQL adalah Single Source of Truth untuk WO, assignment, progress, laporan, dan import history.
- Service role key hanya di server; jangan pernah mengekspos ke bundle browser, source map, log, response API, atau client config.
- Semua endpoint harus menegakkan authentication dan RBAC di backend, bukan hanya menyembunyikan menu di frontend.
- Pertahankan role aplikasi: `super_admin`, `dispatch`, `leader`, `installer`, `monitoring_data`, `management_data`, `it_support` (sesuaikan hanya jika source aktif menggunakan canonical mapping lain; dokumentasikan mapping).
- Superadmin mengendalikan konfigurasi global dan hak administrasi sesuai matriks akses yang ada.
- Jangan mengganti PostgreSQL dengan SQLite, Firebase, atau JSON sebagai database utama.

## C. PHASE 17 — MIGRATION RECONCILIATION
Tujuan: menghasilkan satu rangkaian migration kanonikal yang konsisten dan aman untuk staging.

Lakukan:
1. Inventarisasi semua file migration berdasarkan isi, bukan hanya nama.
2. Deteksi nomor duplikat, migration yang saling bertentangan, dependency order, objek yang dibuat/diubah/dihapus, trigger, function, index, grants, RLS, dan foreign key.
3. Buat dependency graph dan urutan migration yang benar.
4. Audit seluruh referensi `auth.users`, `auth.uid()`, Supabase Auth role, dan policy yang menganggap pengguna MoraJaws sebagai pengguna Supabase Auth.
5. Rancang pengganti yang sesuai custom auth. Jangan sekadar menghapus FK/policy tanpa mengganti authorization dengan mekanisme backend yang benar.
6. Pastikan schema yang dirujuk adapter cocok dengan kolom, tipe, nullability, default, unique constraint, FK, trigger, dan index di migration.
7. Periksa fungsi timestamp yang dipanggil trigger benar-benar didefinisikan sebelum trigger dipasang.
8. Buat preflight SQL read-only untuk mendeteksi duplikasi WO berdasarkan normalisasi yang sama dengan unique index.
9. Buat migration baru yang forward-only dan aman untuk staging. Jangan mengedit migration lama yang mungkin sudah pernah diterapkan tanpa strategi rekonsiliasi dan bukti ledger.
10. Jangan menjalankan SQL terhadap project remote. Hanya buat file SQL dan pengujian lokal.

Output PHASE 17:
- `reports/PHASE17/MIGRATION_INVENTORY.md`
- `reports/PHASE17/MIGRATION_DEPENDENCY_GRAPH.md`
- `reports/PHASE17/AUTH_COMPATIBILITY_AUDIT.md`
- `reports/PHASE17/SCHEMA_ADAPTER_MATRIX.md`
- `reports/PHASE17/PREFLIGHT_READONLY.sql`
- migration baru hanya jika memang diperlukan, disertai rollback/mitigasi dan catatan apakah aman untuk staging.

Kriteria lulus:
- Tidak ada nomor migration ambigu dalam urutan kanonikal.
- Tidak ada dependency yang belum didefinisikan.
- Tidak ada referensi Supabase Auth yang diam-diam menjadi login MoraJaws.
- Semua kolom yang digunakan adapter terpetakan ke schema.
- Preflight mendeteksi normalized duplicate sebelum unique index dibuat.
- Tidak ada remote SQL yang dijalankan.

## D. PHASE 18 — ATOMIC WO IMPORT & IDEMPOTENCY
Tujuan: seluruh import WO menjadi satu transaksi PostgreSQL yang konsisten.

Audit dan perbaiki:
1. Import harus mempunyai satu idempotency key stabil untuk satu operasi logis; retry operasi yang sama tidak boleh menggandakan WO.
2. Klaim idempotency harus aman terhadap request paralel. Jangan hanya melakukan SELECT lalu INSERT terpisah tanpa unique constraint/locking/atomic claim.
3. Seluruh operasi yang harus konsisten—claim import, validasi server, insert/update WO, hitung hasil, dan finalisasi import history—harus berada dalam satu transaksi database.
4. Gunakan PostgreSQL function/RPC transaction boundary yang sesuai. Jangan mengandalkan beberapa REST request terpisah sebagai transaksi.
5. Gunakan satu definisi normalisasi WO Number yang konsisten di frontend, backend, SQL unique index, preflight, dan test. Definisikan perlakuan huruf besar/kecil, spasi, tab, dan nilai kosong.
6. Tentukan duplicate policy secara eksplisit: skip, update allowed, atau reject. Jangan menimpa assignment, progress, atau laporan installer secara tidak sengaja saat update import.
7. Hasil batch harus membedakan `SUCCESS`, `PARTIAL_SUCCESS`, `FAILED`, `DUPLICATE`, dan `IN_PROGRESS` secara konsisten. Jangan mengembalikan success jika semua baris invalid atau transaksi rollback.
8. Jika transaksi gagal, tidak boleh ada sebagian WO yang tersimpan dari batch tersebut. Catat kegagalan dengan desain yang tidak merusak atomicity; jelaskan jika status audit perlu dicatat dalam transaksi terpisah.
9. Batasi ukuran payload, validasi tipe dan ukuran, tangani timeout, dan jangan log data pribadi secara berlebihan.
10. Pastikan response API dan frontend hanya menampilkan status sukses setelah backend mengonfirmasi hasil final.
11. Pastikan refresh data gagal tidak ditampilkan sebagai “import gagal tersimpan” atau “berhasil tersimpan” secara keliru; tampilkan status penyimpanan dan status refresh secara terpisah.

Output PHASE 18:
- Implementasi RPC/function dan adapter yang cocok dengan schema aktif.
- Test untuk rollback, batch campuran valid/invalid, all-invalid, duplicate exact, duplicate case/whitespace, retry idempotent, request paralel, update-allowed safety, dan history failure.
- `reports/PHASE18/ATOMIC_IMPORT_DESIGN.md`
- `reports/PHASE18/TEST_EVIDENCE.md`

Jangan deploy RPC/migration ke Supabase remote.

## E. PHASE 19 — SINGLE SOURCE OF TRUTH & LOCAL PERSISTENCE
Tujuan: WO server-side tetap authoritative.

Audit semua penggunaan:
- localStorage
- sessionStorage
- IndexedDB
- JSON/file local fallback
- memory cache
- offline queue
- Firebase/Firestore
- API fallback dan mock data

Klasifikasikan tiap penggunaan sebagai:
1. authoritative persistence,
2. transient UI cache,
3. pending offline command/queue,
4. test fixture/demo,
5. fallback berisiko.

Aturan:
- Tidak boleh ada fallback diam-diam yang menyimpan WO seolah-olah sudah tersimpan di Supabase.
- Bila fitur offline diperlukan, antrean lokal hanya boleh berstatus `PENDING_SYNC`, memiliki idempotency key, actor, timestamp, retry policy, dan konflik yang terlihat oleh user. Setelah sinkronisasi, server menjadi sumber kebenaran.
- Jangan menghapus fitur offline tanpa memetakan dampaknya ke laporan/progress installer.
- Jangan menyimpan password, token, service role key, atau data sensitif yang tidak diperlukan di browser storage.
- Semua read/write authoritative harus melalui backend dan Supabase.
- Perbaiki UI agar membedakan `SAVED_ON_SERVER`, `PENDING_SYNC`, `SYNC_FAILED`, dan `REFRESH_FAILED`.

Output PHASE 19:
- `reports/PHASE19/PERSISTENCE_INVENTORY.md`
- Perubahan source yang diperlukan.
- Tes yang membuktikan tidak ada false-success/local authoritative fallback.

## F. PHASE 20 — FIREBASE / GOOGLE INTEGRATION RECONCILIATION
Tujuan: mempertahankan hanya integrasi yang memang dibutuhkan tanpa menjadikan Firebase database utama.

1. Telusuri import, runtime usage, initialization, environment variables, Admin SDK, browser SDK, OAuth, Firestore, Firebase Auth, Firebase Storage, FCM, dan Google Sheets.
2. Jangan menyimpulkan file `firestoreDb.ts` benar-benar memakai Firestore tanpa memeriksa implementasinya.
3. Pisahkan Google Sheets OAuth/integration dari login internal MoraJaws. Jangan mensyaratkan Firebase Auth untuk login aplikasi.
4. Jika Firebase masih diperlukan untuk fitur tertentu, dokumentasikan tujuan, data yang disimpan, credential, akses, dan batasannya.
5. Hapus dependensi hanya setelah seluruh pemanggil dan fitur penggantinya terbukti aman.
6. Perbaiki `/api/health` agar melaporkan status aktual setiap integrasi, bukan status hardcoded.
7. Pastikan tidak ada credential di source code atau client bundle.

Output PHASE 20:
- `reports/PHASE20/FIREBASE_GOOGLE_INTEGRATION_AUDIT.md`
- Matriks keep/remove/replace per modul.
- Perubahan kode dan tes jika disetujui.

## G. PHASE 21 — STAGING ACCEPTANCE & RELEASE READINESS
Jalankan pengujian lokal yang dapat dilakukan:
- install dependencies dari lockfile,
- lint,
- typecheck,
- unit tests,
- integration tests,
- production build,
- route/auth/RBAC tests,
- WO import/export,
- assignment leader,
- installer progress/report,
- import history/audit,
- backup/restore procedure,
- migration preflight,
- frontend status and error handling.

Untuk tes yang memerlukan Supabase:
- Gunakan project staging saja dan credential staging yang diberikan secara eksplisit.
- Jika credential tidak tersedia, tandai `BLOCKED — NO STAGING CREDENTIALS`; jangan memalsukan hasil.
- Jangan pernah memakai production URL/key untuk tes.
- Jangan menjalankan migration staging tanpa persetujuan eksplisit.

Output PHASE 21:
- `reports/PHASE21/LOCAL_TEST_RESULTS.md`
- `reports/PHASE21/STAGING_TEST_RESULTS.md`
- `reports/PHASE21/RELEASE_READINESS.md`
- daftar blocker P0/P1/P2 dan rekomendasi cutover.

## H. KUALITAS IMPLEMENTASI
- Ikuti pola dan style project aktif.
- Perubahan kecil, terukur, dan backward-compatible.
- Jangan mengganti nama field/route tanpa memperbarui seluruh caller, test, dan dokumentasi.
- Jangan menghapus fitur atau menu tanpa bukti tidak dipakai dan persetujuan.
- Jangan menambahkan mock/fake success.
- Jangan mengklaim tes berjalan jika hanya membaca source.
- Setiap test harus menyebut jenisnya: static, unit, integration, E2E, atau live staging.
- Semua error penting harus surfaced; jangan swallow error.
- Jangan menulis secrets ke report.

## I. URUTAN EKSEKUSI
1. Tahap 1: audit saja, tanpa edit.
2. Tunggu persetujuan saya.
3. Kerjakan PHASE 17 dan tes lokal.
4. Laporkan hasil dan tunggu persetujuan.
5. Kerjakan PHASE 18 dan tes lokal.
6. Laporkan hasil dan tunggu persetujuan.
7. Kerjakan PHASE 19.
8. Laporkan hasil dan tunggu persetujuan.
9. Kerjakan PHASE 20.
10. Laporkan hasil dan tunggu persetujuan.
11. Kerjakan PHASE 21.
12. Siapkan ZIP source hasil akhir dan laporan release readiness.

## J. FORMAT LAPORAN WAJIB
Untuk setiap fase tampilkan:
- file yang dibaca,
- file yang diubah,
- ringkasan perubahan,
- alasan teknis,
- tes yang dijalankan dan jenisnya,
- hasil pass/fail/blocked,
- risiko tersisa,
- migration yang dibuat (jika ada),
- pernyataan tegas bahwa database remote tidak diubah.

Mulai sekarang lakukan TAHAP 1: ekstrak, baca, audit, dan laporkan. Jangan edit apa pun sampai saya menyetujui.
