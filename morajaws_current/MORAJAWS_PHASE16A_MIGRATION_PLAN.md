# MORAJAWS — RENCANA AKSI MIGRASI SUPABASE (PHASE 16A)
**Status**: DRAF RENCANA / USULAN TEKNIS (BELUM DIEKSEKUSI KE PRODUKSI)  
**Target Arsitektur**: React SPA → Express Backend (Satu-satunya Akses Layer) → Supabase PostgreSQL + Supabase Storage  
**Prinsip Keamanan**: Fail-Closed, Zero Production Mutation Tanpa Izin, Immutability 3 Protected WO.

---

## 1. TUJUAN DAN RUANG LINGKUP MIGRASI
Rencana ini mengatur transisi terstruktur dan terisolasi dari sistem penyimpanan data lama (Firebase Firestore / file JSON lokal) menuju basis data relasional **Supabase PostgreSQL**. Autentikasi tetap menggunakan **Custom Authentication MoraJaws** yang berjalan di Express dan menyimpan identitas/sesi di tabel PostgreSQL. Supabase Auth tidak digunakan.

### Batasan Kritis (Safety Guardrails):
1. **Tidak Ada Rebuild**: Seluruh kode frontend, navigasi 3 accordion, visual identity ungu-gelap (purple gloss/lilac), dan alur bisnis MoraJaws tetap utuh.
2. **Tidak Ada Eksekusi DDL/DML Produksi pada Fase 16A**: Rencana ini adalah panduan bertahap yang memerlukan persetujuan eksplisit pemilik sebelum tiap tahap eksekusi.
3. **Proteksi 3 Work Order Soft-Deleted**:
   - `wo_1793825457141_u4bnht` (`WO-EXPRESS-TEST-1793825456810`)
   - `wo_imp_1793825458959_4i4f1h` (`WO-DUP-TEST-1793825458804`)
   - `wo_imp_1793825458959_262dei` (`WO-DUP-TEST-1793825458804-UNIQUE`)
   Ketiga record ini dilarang keras diubah, dipulihkan, atau di-hard delete.
4. **Isolasi Penuh Browser**: Browser tidak pernah mengimpor `@supabase/supabase-js`, tidak menyimpan Supabase token di `localStorage`/`sessionStorage`, dan hanya berkomunikasi via cookie HttpOnly dengan Express API.

---

## 2. TAHAP 1: BACKUP PENUH & INVENTARISASI DATA SUMBER (PRE-MIGRATION)
Sebelum melakukan migrasi data apapun:
1. **Ekspor Firestore & Database JSON**:
   - Eksekusi script pencadangan snapshot terisolasi: `npx tsx scripts/export_firestore_production_backup.ts`.
   - Simpan hash SHA-256 dari seluruh file backup sumber (`morajaws_database.json`, backup JSON).
2. **Pencatatan Baseline Record Counts**:
   - Menghitung jumlah aktual record per entitas:
     - Users / Staff: 10 akun (termasuk demo/staging)
     - Work Orders: 8 tiket (termasuk 3 protected soft-deleted)
     - Contractors: 3 mitra
     - Coverage Areas: 3 area
     - App Settings: `global_config`, `navigation_config`, `report_dropdown_categories`
     - Audit Logs & Sessions.

---

## 3. TAHAP 2: VALIDASI, SANITASI, DAN NORMALISASI DATA
Data dari legacy sistem harus divalidasi ketat sebelum dimasukkan ke PostgreSQL:
1. **Normalisasi Format Nomor WO**:
   - Seluruh `wo_number` dinormalisasi menggunakan algoritma kanonikal `normalizeWoNumber` (menghapus spasi ganda, trim, huruf kapital).
   - **Deteksi Duplikasi**: Jika ditemukan duplikasi nomor WO pada data mentah, record duplikat **tidak boleh dihapus secara otomatis**, melainkan dicatat ke dalam `import_conflicts.log` untuk ditinjau oleh operator data.
2. **Penetapan appointmentDate**:
   - Seluruh tanggal janji temu dipastikan mengacu pada kolom kanonikal `appointment_date` dalam zona waktu `Asia/Jakarta` (WIB) tanpa konversi UTC yang menggeser tanggal kalender.
3. **Penyelarasan Foreign Key**:
   - Memastikan setiap `contractor_id` pada tabel `work_orders` dan `users` merujuk ke ID yang valid di tabel `contractors`.
   - Mengisi fallback `contr_mora_01` jika WO lama tidak memiliki ID kontraktor yang valid.

---

## 4. TAHAP 3: REKONSILIASI CUSTOM AUTH MORAJAWS KE POSTGRESQL
Autentikasi aplikasi tetap merupakan sistem internal MoraJaws. Jangan membuat, menghubungkan, atau mewajibkan akun pada `auth.users`.

1. **Identitas Akun Staf di `public.users`**:
   - Pertahankan ID internal user yang sudah dipakai relasi `work_orders`, `assignment_history`, dan audit.
   - Pastikan username/email kanonikal memiliki unique constraint sesuai aturan aplikasi.
   - Password hanya disimpan sebagai hash bcrypt/algoritma password hash yang sudah disetujui; tidak pernah menyimpan plaintext atau mengembalikan hash ke frontend.
2. **Sesi Internal di PostgreSQL**:
   - Gunakan tabel `public.auth_sessions`, `public.refresh_tokens`, `public.user_sessions`, dan `public.login_attempts` sesuai implementasi/migration yang benar-benar tersedia.
   - Validasi access token, refresh token, expiry, session version, status akun, dan role dilakukan oleh Express.
   - Reset password dan deactivation harus mencabut sesi/token terkait secara atomik atau melalui urutan operasi yang dapat diverifikasi.
3. **Tidak Menggunakan Supabase Auth**:
   - Jangan memanggil `supabase.auth.admin.createUser`, `supabase.auth.signInWithPassword`, atau `supabase.auth.getUser`.
   - Jangan menambahkan foreign key ke `auth.users` atau mewajibkan `auth_user_id` untuk login internal.
   - `SUPABASE_SERVICE_ROLE_KEY` hanya digunakan server-side oleh Express untuk akses PostgreSQL/Storage; bukan sebagai token autentikasi pengguna.
4. **Verifikasi Keamanan**:
   - Uji login valid/invalid, lockout/rate limit, refresh rotation, logout, reset password, revoke-all-sessions, inactive user, dan RBAC untuk seluruh role.
   - Pastikan cookie HttpOnly/Secure/SameSite sesuai environment dan token tidak disimpan di localStorage/sessionStorage.

---
## 5. TAHAP 4: MIGRASI WORK ORDERS, ASSIGNMENTS, DAN CHAT HISTORY
1. **Batch Upsert Work Orders**:
   - Memasukkan data WO secara bertahap (batch size 50 record) via `client.from('work_orders').upsert(...)`.
   - Memastikan kolom `is_deleted`, `deleted_at`, `deleted_by`, `deletion_reason` dipertahankan persis sesuai status legacy.
   - Mengaktifkan trigger proteksi `fn_protect_legacy_soft_deleted_wo` sebelum migrasi agar 3 WO terlindungi tidak dapat terdistorsi.
2. **Migrasi Riwayat Penugasan (Assignment History)**:
   - Memasukkan riwayat ke `public.assignment_history` dengan relasi `work_order_id` yang valid.
3. **Migrasi Percakapan (Ticket Messages)**:
   - Memasukkan pesan ke `public.ticket_messages` dengan metadata waktu dan pengirim yang utuh.
4. **Migrasi Pengaturan Aplikasi (App Settings & Droplists)**:
   - Memasukkan konfigurasi navigasi (`navigation_config`) dengan 3 accordion aktif.
   - Memasukkan kategori laporan hierarkis (`report_dropdown_categories`).
   - Memasukkan konfigurasi visual tema ungu gelap (`global_config`).

---

## 6. TAHAP 5: VERIFIKASI INTEGRITAS, RECORD COUNTS & RECONCILIATION
Setelah proses pengisian selesai, sistem verifikasi otomatis dijalankan:
1. **Pemeriksaan Jumlah Record (Row Count Verification)**:
   - Membandingkan jumlah baris di Supabase PostgreSQL dengan baseline source:
     `SELECT count(*) FROM public.work_orders;` vs `COUNT(source.work_orders)`.
2. **Verifikasi Integritas Relasi**:
   - Memastikan tidak ada orphaned records:
     `SELECT count(*) FROM public.work_orders WHERE contractor_id NOT IN (SELECT id FROM public.contractors);` (Harus 0).
3. **Verifikasi Status 3 WO Terlindungi**:
   - Memastikan ketiga WO berada pada status `is_deleted = true` dan nilai kolomnya identik dengan nilai audit awal.
4. **Pengujian Fail-Closed**:
   - Memverifikasi endpoint Express mengembalikan HTTP 503 saat koneksi Supabase diputus buatan (menjamin tidak ada silent fallback ke data lokal).

---

## 7. TAHAP 6: PROSEDUR ROLLBACK (RECOVERY PLAN)
Jika terjadi kegagalan atau inkonsistensi data selama pengujian staging:
1. **Pemulihan Database PostgreSQL**:
   - Jika migrasi perlu dibatalkan sebelum cutover final:
     - Jalankan script kompensasi pembersihan data staging.
     - Pulihkan snapshot staging dari cadangan pra-migrasi.
2. **Pemulihan Autentikasi**:
   - Hapus user pengujian di `auth.users` via `supabase.auth.admin.deleteUser(uid)`.
3. **Zero Impact on Production**:
   - Karena seluruh tahapan dilakukan di lingkungan staging terisolasi atau di bawah skrip pengujian terkontrol, lingkungan produksi tidak mengalami gangguan sama sekali.

---

## 8. CHECKPOINT PERSETUJUAN PEMILIK (OWNER APPROVAL GATE)
Eksekusi migrasi data produksi **HANYA DAPAT DILAKUKAN** setelah Pemilik Aplikasi meninjau dan menyetujui:
1. Hasil audit autentikasi, entitas, dan endpoint (Phase 16A Audit Report).
2. Draf skema SQL usulan (`migrations/006_phase16a_schema_alignment_and_droplists.sql`).
3. Jadwal jendela pemeliharaan (maintenance window) yang disepakati untuk migrasi data.
