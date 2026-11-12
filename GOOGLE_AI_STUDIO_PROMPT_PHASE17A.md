# PROMPT GOOGLE AI STUDIO — MORAJAWS PHASE 17A
## DATABASE SCHEMA & MIGRATION RECONCILIATION AUDIT — AUDIT ONLY

Anda bertindak sebagai Senior PostgreSQL/Supabase Database Architect, Migration Engineer, dan Application Security Reviewer.

Saya mengunggah:
1. ZIP source code MoraJaws terbaru dari GitHub.
2. ZIP instruksi PHASE 17A ini.

Tujuan PHASE 17A adalah melakukan audit mendalam dan menyusun satu rencana rekonsiliasi migration yang aman. Tahap ini **HANYA AUDIT DAN DOKUMENTASI**. Jangan mengubah source code, file SQL, migration ledger, maupun database apa pun.

---

## 1. ARSITEKTUR TARGET — WAJIB DIPERTAHANKAN

- Database utama MoraJaws: Supabase PostgreSQL.
- Backend: Express.js sebagai trusted server boundary.
- Login aplikasi: custom/internal authentication MoraJaws.
- Jangan mengubah login menjadi Supabase Auth.
- Jangan menjadikan `auth.users`, `auth.uid()`, atau Supabase Auth sebagai identitas utama user MoraJaws.
- `SUPABASE_SERVICE_ROLE_KEY` hanya boleh digunakan di backend/server environment dan tidak boleh masuk frontend, browser bundle, source map, atau response API.
- Backend wajib menerapkan authentication dan RBAC berdasarkan session internal MoraJaws.
- Jangan mengganti database utama dengan SQLite, Firebase, Firestore, IndexedDB, atau JSON.
- Jangan mengasumsikan migration dalam repository sudah pernah dijalankan pada project Supabase remote.

## 2. IDENTIFIKASI SOURCE PROJECT AKTIF

1. Ekstrak ZIP source.
2. Temukan root project aktif berdasarkan `package.json`, entry points, konfigurasi build, server entry, dependency graph, dan import graph.
3. Identifikasi folder snapshot, backup, generated output, atau versi lama. Jangan mencampur file dari snapshot berbeda.
4. Catat commit/hash source bila tersedia.
5. Jika terdapat beberapa kandidat root, jelaskan bukti dan pilih satu root aktif. Jangan menggabungkan source dari beberapa folder.

## 3. INVENTARISASI SELURUH MIGRATION

Cari seluruh file SQL migration di repository, termasuk subfolder dan file SQL yang berisi perubahan schema walaupun namanya tidak memakai format migration.

Untuk setiap file catat:
- path dan nama file;
- nomor/urutan migration;
- checksum SHA-256;
- objek yang dibuat/diubah/dihapus;
- tabel dan kolom;
- tipe data, nullability, default;
- primary key, foreign key, unique constraint;
- index;
- function dan procedure;
- trigger;
- RLS enable/disable;
- policy;
- GRANT/REVOKE;
- dependency ke migration atau objek sebelumnya;
- potensi destructive operation;
- indikasi idempotency atau tidak.

Deteksi:
- nomor migration duplikat;
- file bernama sama dengan isi berbeda;
- migration yang saling bertentangan;
- migration yang mengasumsikan tabel/function belum tentu ada;
- perubahan yang mengulang atau membatalkan migration sebelumnya;
- migration yang tidak aman jika dijalankan ulang;
- perbedaan antara dokumentasi dan isi SQL sebenarnya.

Jangan menyimpulkan migration sudah diterapkan hanya karena file ada di repository.

## 4. AUDIT CUSTOM AUTH COMPATIBILITY

Telusuri seluruh source dan SQL untuk:
- `auth.users`
- `auth.uid()`
- `auth.role()`
- Supabase Auth client/server
- FK ke `auth.users`
- policy yang mengandalkan `authenticated` atau `auth.uid()`
- JWT claims Supabase Auth
- `firebase_uid` atau identitas eksternal lain yang masih menjadi authority.

Buat matriks:
| Referensi | File/SQL | Tujuan saat ini | Konflik dengan custom auth | Rekomendasi |

Periksa khusus apakah migration membuat ketergantungan login internal MoraJaws pada Supabase Auth. Jangan sekadar menghapus foreign key atau policy; jelaskan mekanisme backend/RBAC yang seharusnya menggantikannya.

## 5. SCHEMA VS APPLICATION ADAPTER RECONCILIATION

Audit seluruh pemakaian database di:
- `server/supabaseAdapter.ts`
- seluruh backend routes/controllers/services
- authentication/session/RBAC middleware
- repository/data access layer
- frontend API clients
- import WO, update WO, assignment, installer progress, technical report, audit log, user, role, contractor, coverage area, settings, storage metadata.

Buat matriks per tabel:
| Table | Kolom yang dipakai source | Definisi migration | Tipe cocok? | Nullable/default cocok? | FK/index/constraint | Temuan |

Pastikan nama kolom, tipe, default, nullability, relasi, unique constraints, dan trigger sesuai dengan query yang digunakan aplikasi.

Periksa fungsi trigger seperti `morajaws_set_updated_at()`:
- apakah didefinisikan;
- migration mana yang mendefinisikannya;
- apakah dibuat sebelum trigger memanggilnya;
- apakah signature dan schema-qualified name cocok.

Jangan mengarang schema live. Jika hanya bisa melihat source migration, tandai sebagai `SOURCE-ONLY — NOT VERIFIED AGAINST REMOTE DATABASE`.

## 6. AUDIT KHUSUS WORK ORDER

Periksa:
- tabel `work_orders`;
- `wo_number`;
- normalisasi nomor WO;
- unique index;
- kolom import batch;
- import history;
- duplicate policy;
- kolom assignment teknisi/leader;
- progress dan technical report;
- soft delete;
- protected soft-deleted records.

Normalisasi WO Number harus dibandingkan secara konsisten antara:
- frontend validator;
- backend adapter;
- SQL unique index;
- duplicate preflight;
- import tests.

Periksa migration 016 dan dependensinya. Verifikasi secara source-only:
- apakah tabel `work_order_imports` dibuat;
- apakah unique idempotency key tersedia;
- apakah unique normalized WO index bisa gagal jika data lama memiliki duplikasi;
- apakah trigger function tersedia pada urutan yang tepat;
- apakah terdapat RPC transaksi atomic atau hanya REST request terpisah.

Buat SQL PREFLIGHT yang bersifat READ-ONLY untuk mendeteksi:
- normalized duplicate WO Number;
- blank/null WO Number;
- orphan foreign keys jika relevan;
- constraint/index yang mungkin gagal dibuat;
- objek yang diperlukan migration namun belum didefinisikan dalam urutan migration.

SQL preflight hanya boleh berupa SELECT/CTE dan query katalog PostgreSQL. Dilarang mengandung DDL atau DML.

## 7. MIGRATION LEDGER DAN REMOTE DATABASE

Jangan mengakses Supabase remote dalam PHASE 17A ini.

Jika source berisi hasil ekspor/backup/ledger lokal, audit sebagai bukti lokal dan beri label sumbernya. Jangan menganggapnya sebagai kondisi remote terkini.

Catat secara eksplisit:
- fakta yang terbukti dari repository;
- fakta yang hanya asumsi/dokumentasi;
- hal yang membutuhkan pemeriksaan remote read-only di fase terpisah;
- hal yang belum bisa diverifikasi karena tidak ada credential atau akses.

Jangan membuat klaim bahwa migration tertentu sudah diterapkan pada production tanpa bukti migration ledger dari project yang benar.

## 8. HASIL WAJIB

Buat folder `reports/PHASE17A/` dengan file:

1. `EXECUTIVE_SUMMARY.md`
   - status risiko;
   - blocker P0/P1/P2;
   - keputusan teknis;
   - rekomendasi urutan tindakan.

2. `MIGRATION_INVENTORY.md`
   - semua migration, nomor, checksum, objek, dan risiko.

3. `MIGRATION_DEPENDENCY_GRAPH.md`
   - dependency graph;
   - urutan kanonikal yang disarankan;
   - migration konflik/duplikat.

4. `CUSTOM_AUTH_COMPATIBILITY.md`
   - seluruh referensi Supabase Auth/Firebase identity;
   - konflik dan desain pengganti yang direkomendasikan.

5. `SCHEMA_ADAPTER_MATRIX.md`
   - perbandingan source adapter/routes dengan schema SQL.

6. `WORK_ORDER_SCHEMA_AUDIT.md`
   - normalisasi WO, unique index, import history, assignment, report, soft delete.

7. `PREFLIGHT_READONLY.sql`
   - SELECT-only; tidak boleh ada statement yang mengubah database.

8. `UNVERIFIED_AND_BLOCKED.md`
   - semua hal yang tidak dapat dibuktikan tanpa akses remote atau test runtime.

9. `PHASE17A_RECOMMENDED_PLAN.md`
   - urutan implementasi yang direkomendasikan setelah audit;
   - risiko;
   - prasyarat;
   - strategi rollback/mitigasi konseptual;
   - tidak menjalankan tindakan tersebut.

## 9. ATURAN KERAS

- Jangan mengedit source code.
- Jangan mengedit, menghapus, memindahkan, atau menamai ulang migration SQL.
- Jangan membuat migration baru.
- Jangan menjalankan SQL ke database remote.
- Jangan menjalankan migration.
- Jangan mengubah migration ledger.
- Jangan melakukan INSERT, UPDATE, DELETE, UPSERT, ALTER, CREATE, DROP, TRUNCATE, GRANT, REVOKE, atau operasi tulis.
- Jangan menampilkan secrets, tokens, passwords, private keys, atau connection strings dalam laporan.
- Jangan membuat credential atau hasil tes palsu.
- Jangan menyebut migration “applied” tanpa bukti ledger project yang tepat.
- Jangan menyatakan production-ready hanya berdasarkan static source audit.

## 10. FORMAT KESIMPULAN

Gunakan salah satu:
- `PASS — READY FOR IMPLEMENTATION PLANNING`
- `BLOCKED — MISSING EVIDENCE`
- `FAIL — MIGRATION CONFLICTS REQUIRE RESOLUTION`

Berikan alasan yang dapat ditelusuri ke file dan baris/statement.

Mulai sekarang lakukan PHASE 17A saja. Ekstrak, inventarisasi, audit, dan buat seluruh laporan. Setelah selesai, berhenti dan tunggu persetujuan saya. Jangan melanjutkan PHASE 17B atau fase lainnya.
