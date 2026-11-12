# MORAJAWS — GOOGLE AI STUDIO REPAIR PACK
## PHASE 16B.1 reconciliation + PHASE 16B.2 atomic import hardening

Gunakan ZIP project MoraJaws yang saya upload sebagai SOURCE OF TRUTH. Paket ini adalah instruksi dan patch pendukung, bukan izin untuk mengubah database production.

### TUJUAN
Perbaiki alur import Work Order ke Supabase PostgreSQL agar konsisten, aman dari partial commit, idempotent, dan dapat diaudit.

### ATURAN WAJIB
1. Kerjakan hanya root project aktif. Abaikan snapshot/duplikat lama seperti `morajaws_current/`, `mj_next/`, dan folder snapshot lain.
2. Pertahankan custom login MoraJaws. Jangan migrasikan login ke Supabase Auth.
3. Supabase PostgreSQL tetap menjadi sumber utama data WO.
4. Jangan gunakan localStorage, sessionStorage, IndexedDB, JSON lokal, atau mock sebagai fallback penyimpanan permanen WO.
5. Jangan mengubah/menghapus data production, menjalankan SQL migration, deploy, atau mengubah konfigurasi production.
6. Jangan menampilkan kredensial/token. Jangan membuat credential palsu.
7. Jangan menghapus fitur lama yang tidak terkait. Pertahankan RBAC dan kontrak API yang sudah ada.
8. Jangan mengklaim berhasil jika hanya melakukan static test. Laporkan secara terpisah static test, unit test, integration test, dan live database test.
9. Jangan mengubah 3 WO soft-deleted yang dilindungi:
   - `wo_1793825457141_u4bnht`
   - `wo_imp_1793825458959_4i4f1h`
   - `wo_imp_1793825458959_262dei`

### LANGKAH 1 — REKONSILIASI PATCH PHASE 16B.1
Paket berisi `PHASE16B1.patch`. Periksa apakah perubahan patch sudah ada pada source project:
- Jika sudah identik/terpasang, jangan aplikasikan ulang.
- Jika belum, review diff lalu aplikasikan secara selektif.
- Jangan menimpa perubahan source yang lebih baru.
- Pastikan penanganan empty import, idempotency lookup error, import tracking writes, invalid row count, dan retry identity tetap terjaga.

### LANGKAH 2 — AUDIT ULANG ALUR IMPORT
Telusuri seluruh jalur:
- UI import → `AppContext` → Express route → `supabaseAdapter` → PostgreSQL.
- Semua endpoint import, bulk import, retry, update existing WO, import history, dan refresh UI.
- Validasi normalisasi WO Number antara frontend, backend, dan unique index SQL.
- Periksa apakah UI hanya menampilkan status SAVED setelah server mengonfirmasi hasil commit dan refresh berhasil.
- Pastikan kegagalan refresh tidak mengubah hasil commit menjadi klaim sukses palsu; tampilkan status commit dan refresh secara terpisah.

### LANGKAH 3 — PHASE 16B.2: ATOMIC DATABASE IMPORT
Masalah prioritas: adapter saat ini menulis batch melalui beberapa request REST/chunk dan fallback row-by-row. Kondisi ini berpotensi menyebabkan partial commit.

Rancang solusi transaksi PostgreSQL yang benar:
- Semua insert/update/duplicate accounting dan finalisasi import history untuk satu batch harus berada dalam satu transaksi database.
- Gunakan satu PostgreSQL RPC/function yang dipanggil backend, atau mekanisme transaksi server-side setara yang benar-benar atomic.
- Jangan berpura-pura bahwa beberapa request Supabase REST adalah satu transaksi.
- Tangani idempotency claim dan concurrent retry secara aman, dengan unique constraint/locking yang sesuai.
- Terapkan satu canonical normalizer WO Number yang sama dengan unique index:
  `lower(regexp_replace(btrim(wo_number), '\\s+', '', 'g'))`
- Jangan mengandalkan exact `.in('wo_number', ...)` atau `.eq('wo_number', ...)` untuk mendeteksi variasi huruf besar/kecil/spasi.
- Jika update existing WO diizinkan, jangan menimpa assignment teknisi, laporan installer, status penyelesaian, atau audit data yang tidak boleh diubah. Daftar kolom yang boleh diperbarui harus eksplisit dan diuji.
- Hasil function harus mengembalikan status dan jumlah inserted, updated, duplicate, invalid, serta failed secara konsisten.
- Jika satu batch gagal sebelum commit, seluruh perubahan batch dan history finalization harus rollback.
- Pastikan tidak ada status SUCCESS jika ada invalid/failed row yang menurut aturan bisnis menyebabkan batch tidak sukses. Definisikan SUCCESS, PARTIAL_SUCCESS, dan FAILED secara konsisten.
- Pastikan request yang sama di-retry mengembalikan hasil import yang sudah tersimpan, bukan mengimpor ulang.
- Pastikan dua request paralel dengan idempotency key sama tidak membuat dua batch.

Sebelum membuat migration/RPC, periksa seluruh migration dan schema yang ada. Cocokkan nama kolom, tipe data, constraint, trigger, dan function dengan kode aktual. Jangan menebak schema.

### LANGKAH 4 — LOCAL WO PERSISTENCE DAN FALLBACK
Audit seluruh penggunaan IndexedDB/offline queue/local JSON untuk data WO.
- Pisahkan cache UI sementara dari penyimpanan permanen.
- Jangan menghapus fitur offline secara membabi buta.
- Jika offline queue tetap dipertahankan, queue hanya boleh menyimpan operasi perubahan yang belum tersinkron sesuai kebijakan keamanan; jangan menjadikannya sumber utama atau menampilkan data seolah sudah tersimpan di server.
- Hapus/disable fallback JSON untuk operasi WO production; fail closed jika Supabase tidak tersedia.
- Audit juga import history dan report/progress update agar tidak menulis WO ke storage lokal permanen.

### LANGKAH 5 — TEST WAJIB
Buat test nyata untuk:
1. Batch valid seluruhnya.
2. Semua row invalid.
3. Campuran valid dan invalid.
4. Duplicate dalam file yang sama.
5. Duplicate dengan variasi kapitalisasi dan spasi.
6. Existing WO dengan update disabled.
7. Existing WO dengan update enabled, termasuk verifikasi kolom sensitif tidak tertimpa.
8. DB error di tengah batch → rollback total.
9. History write gagal → rollback total.
10. Retry idempotency key sama.
11. Dua request paralel dengan key sama.
12. Dua batch paralel yang memuat WO Number sama.
13. Supabase tidak tersedia → fail closed, tidak menulis ke JSON/IndexedDB.
14. Refresh UI gagal setelah commit → UI tidak mengklaim commit gagal atau sukses secara keliru.

Jika akses database/test environment tidak tersedia, buat integration test yang bisa dijalankan di staging, tetapi tandai LIVE DB VERIFICATION sebagai BLOCKED. Jangan membuat hasil test palsu.

### LANGKAH 6 — OUTPUT
Simpan:
- source code yang benar-benar diubah;
- migration/RPC baru jika diperlukan (hanya file, jangan deploy);
- test files;
- `reports/PHASE16B2_ATOMIC_IMPORT_REPORT.md`;
- `reports/PHASE16B2_CHANGED_FILES.md`;
- `reports/PHASE16B2_TEST_EVIDENCE.md`;
- ringkasan risiko dan langkah staging verification.

Laporan harus menyebutkan:
- file yang diubah;
- keputusan desain transaksi;
- status idempotency/concurrency;
- hasil test per kategori;
- test yang belum dapat dijalankan dan alasannya;
- apakah perubahan migration hanya dibuat sebagai file atau sudah diaplikasikan (default: BELUM diaplikasikan);
- konfirmasi bahwa production DB tidak disentuh.

### ACCEPTANCE GATE
Jangan menyatakan PHASE 16B.2 selesai jika:
- atomic rollback belum terbukti;
- concurrent idempotency belum diuji;
- normalisasi duplicate belum konsisten;
- masih ada fallback permanen WO lokal;
- test penting hanya berupa source-code string assertions;
- build/typecheck belum dapat dijalankan.

Kerjakan bertahap, gunakan diff kecil, dan jangan melakukan refactor luas yang tidak diperlukan. Jika ada ambiguitas schema, hentikan bagian tersebut dan laporkan bukti yang dibutuhkan, jangan menebak.
