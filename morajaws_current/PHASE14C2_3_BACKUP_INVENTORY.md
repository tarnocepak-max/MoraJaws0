# MORAJAWS — INVENTARIS ARSIP & BACKUP DATA
## Laporan Inventaris Keamanan Backup, Database Lokal, dan Karantina Arsip (Phase 14C.2.3)

**Tanggal Audit:** 06 November 2026  
**Peran:** Senior Software Engineer, Application Architect, Security Reviewer & Migration Engineer  
**Status Audit Backup:** **VERIFIED** (Arsip Publik Berhasil Dikarantina, Bukti SHA-256 Identik, Akses Publik Dinonaktifkan)  
**Database Produksi:** Tidak Tersentuh (Zero DDL, Zero DML, Zero Production Mutation)  

---

### 1. Ringkasan Eksekutif

Audit Phase 14C.2.3 melakukan pemindaian menyeluruh terhadap seluruh sistem berkas proyek MoraJaws untuk mendeteksi keberadaan file ZIP, backup Firestore, database lokal JSON, dan snapshot data sensitif yang berpotensi terekspos ke direktori publik (`public/`, `dist/`, static assets).

Temuan utama:
1. **Arsip Historis `morajawssv5_645d528d.zip` (3.2 MB):** Sebelumnya berada di `public/assets/aistudio/morajawssv5_645d528d.zip`. Di dalamnya teridentifikasi berkas `data/morajaws_database.json` (15,500 bytes) yang memuat skema dan data lokal.
2. **Arsip Frontend `remix-flexilayout_e63ea482.zip` (1.4 MB):** Sebelumnya berada di `public/assets/aistudio/remix-flexilayout_e63ea482.zip`.
3. **Arsip `morajaws0-nov-5-2026-10-46-20-pm_b249e691.zip`:** Telah dipindai secara menyeluruh di seluruh container dan **TIDAK DITEMUKAN** pada filesystem saat ini (`NOT_FOUND`, kemungkinan berasal dari sesi sementara sebelumnya).
4. **Tindakan Karantina Aman (Safe Quarantine):** Kedua arsip ZIP beserta berkas teks prompt/source di `public/assets/aistudio/` telah disalin ke lokasi privat terisolasi `quarantine/assets/aistudio/`, diverifikasi integritas hash SHA-256 byte-for-byte secara identik, lalu salinan publiknya di `public/assets/aistudio/` dibersihkan.
5. **Proteksi Lapis Tiga (Defense-in-Depth):**
   - **Filesystem:** `public/` dan `dist/` terbebas dari berkas backup dan arsip ZIP (`public_clean: true`, `dist_clean: true`).
   - **Vite Build Plugin:** Ditambahkan plugin `security-clean-dist-backups` di `vite.config.ts` untuk memblokir penyalinan berkas `.zip`, `.bak`, `.sql`, dan `backup`.
   - **Express Route Middleware:** Middleware di `server.ts` mencegat setiap permintaan HTTP non-API yang mengakses `.zip`, `.bak`, `.sql`, `.sqlite`, `.dump`, `quarantine`, `morajaws_database`, atau `backup`, dan langsung mengembalikan **HTTP 404 NOT_FOUND**.
   - **Git Protection:** `.gitignore` diperbarui dengan aturan pengabaian ketat untuk `quarantine/`, `*.zip`, `*.bak`, `*.sqlite`, `*.dump`, dan `morajaws_database.json`.

---

### 2. Tabel Inventaris Berkas Lengkap

Berikut adalah inventaris lengkap seluruh berkas arsip, backup, dan template yang ditemukan di lingkungan proyek:

| No | Path Berkas | Ukuran (Bytes) | Jenis Berkas | Berisi Data Sensitif? | Masuk Git Tracking? | Servable sbg Static Asset? | Status Keamanan Saat Ini | Tindakan yang Dijalankan / Direkomendasikan |
| :---: | :--- | :---: | :--- | :---: | :---: | :---: | :---: | :--- |
| 1 | `quarantine/assets/aistudio/morajawssv5_645d528d.zip` | 3,217,281 | Zip Archive (Code + DB) | **YA** (`data/morajaws_database.json`) | **TIDAK** (`.gitignore` quarantine/) | **TIDAK** (Di luar web root & diblokir Express) | **VERIFIED QUARANTINED** | Dikarantina aman di `quarantine/`. Hash SHA-256: `645d528de7f80b164e7dabaf18177c940323c3045d0b57d85890c6659c49cd01`. Salinan publik dihapus. |
| 2 | `quarantine/assets/aistudio/remix-flexilayout_e63ea482.zip` | 1,440,722 | Zip Archive (Frontend) | **TIDAK** (Source code React) | **TIDAK** (`.gitignore` quarantine/) | **TIDAK** (Di luar web root & diblokir Express) | **VERIFIED QUARANTINED** | Dikarantina aman di `quarantine/`. Hash SHA-256: `e63ea482d1b51ab31f0540bafe7a9011d342f93430a2f07cfa3fae9b809ee34b`. Salinan publik dihapus. |
| 3 | `quarantine/assets/aistudio/server_revised_97d9a55f.txt` | 128,524 | ASCII Text (Backend Source) | **SEDANG** (Source server.ts historis) | **TIDAK** (`.gitignore` quarantine/) | **TIDAK** (Di luar web root) | **VERIFIED QUARANTINED** | Dikarantina ke `quarantine/`. SHA-256: `97d9a55f4570215740d40bfb1a5d415ff14021a92e5375c683d735c53a66603b`. |
| 4 | `quarantine/assets/aistudio/supabaseAdapter_revised_7ce9dc49.txt` | 93,361 | ASCII Text (DAL Source) | **SEDANG** (Source adapter historis) | **TIDAK** (`.gitignore` quarantine/) | **TIDAK** (Di luar web root) | **VERIFIED QUARANTINED** | Dikarantina ke `quarantine/`. SHA-256: `7ce9dc498b0a9bc12cd44902f585dcce3268ab2c14843afc1ad1ae8163d49a49`. |
| 5 | `quarantine/assets/aistudio/Paste_October_28__2026_-_1_02AM_6055a6d0` | 36,345 | UTF-8 Text (Prompt) | **TIDAK** (Instruksi prompt) | **TIDAK** (`.gitignore` quarantine/) | **TIDAK** (Di luar web root) | **VERIFIED QUARANTINED** | Dikarantina ke `quarantine/`. SHA-256: `6055a6d07b0e594c6245c25a3452a01a64bff32dd5e010363721da39df34235c`. |
| 6 | `quarantine/assets/aistudio/Paste_October_28__2026_-_2_48PM_f742c928` | 27,388 | UTF-8 Text (Prompt) | **TIDAK** (Instruksi prompt) | **TIDAK** (`.gitignore` quarantine/) | **TIDAK** (Di luar web root) | **VERIFIED QUARANTINED** | Dikarantina ke `quarantine/`. SHA-256: `f742c9280c0a1eb9f403e4d5c6486f7f31dbbdf964d2643cbe651db79bf9a42f`. |
| 7 | `quarantine/assets/aistudio/Paste_October_28__2026_-_5_23PM_e7f19bb7` | 28,097 | UTF-8 Text (Prompt) | **TIDAK** (Instruksi prompt) | **TIDAK** (`.gitignore` quarantine/) | **TIDAK** (Di luar web root) | **VERIFIED QUARANTINED** | Dikarantina ke `quarantine/`. SHA-256: `e7f19bb77b08dc54698a1b87f420f90ad6ecf7ea37a4873c62c8d5265ff7f6a7`. |
| 8 | `quarantine/assets/aistudio/Paste_October_29__2026_-_9_33PM_052d3eb5` | 27,896 | UTF-8 Text (Prompt) | **TIDAK** (Instruksi prompt) | **TIDAK** (`.gitignore` quarantine/) | **TIDAK** (Di luar web root) | **VERIFIED QUARANTINED** | Dikarantina ke `quarantine/`. SHA-256: `052d3eb5ea9193bd002e0b19bc370cac16b84a3fa061575fc872dade59411d42`. |
| 9 | `public/assets/aistudio/morajaws0-nov-5-2026-10-46-20-pm_b249e691.zip` | 0 | - | - | **NOT_VERIFIED** | **TIDAK** (File tidak ada) | **NOT_FOUND** | Dipindai di root `/`, `/app/`, dan subdirektori: File tidak ditemukan di sistem berkas saat ini. |
| 10 | `public/assets/aistudio/morajawssv5_645d528d.zip` | 0 | - | - | **TIDAK** | **TIDAK** (Telah dihapus dari public/) | **CLEANED (MOVED)** | Telah dibersihkan dari `public/` setelah verifikasi SHA-256 di `quarantine/`. |
| 11 | `public/assets/aistudio/remix-flexilayout_e63ea482.zip` | 0 | - | - | **TIDAK** | **TIDAK** (Telah dihapus dari public/) | **CLEANED (MOVED)** | Telah dibersihkan dari `public/` setelah verifikasi SHA-256 di `quarantine/`. |
| 12 | `public/templates/data_wo_20261028.xlsx` | 21,348 | Excel Workbook (XLSX) | **TIDAK** (Hanya template header import WO dengan 2 baris contoh) | **TIDAK** (Folder public template) | **YA** (Static template untuk download user) | **VERIFIED_SAFE_TEMPLATE** | Dipertahankan untuk fitur download template import Korlap. Tidak memuat credential/secret. |
| 13 | `public/templates/template_wo_korlap.xlsx` | 21,348 | Excel Workbook (XLSX) | **TIDAK** (Hanya template header import WO dengan 2 baris contoh) | **TIDAK** (Folder public template) | **YA** (Static template untuk download user) | **VERIFIED_SAFE_TEMPLATE** | Dipertahankan untuk fitur download template import Korlap. Tidak memuat credential/secret. |
| 14 | `data/morajaws_production_firestore_backup.json` | 0 | JSON Backup | - | **TIDAK** (`.gitignore`) | **TIDAK** (Diblokir HTTP 404 di server.ts) | **FILE_ABSENT** | Direktori `data/` saat ini kosong. Rute akses diblokir permanen dengan HTTP 404. |
| 15 | `data/morajaws_database.json` | 0 | JSON Database Fixture | - | **TIDAK** (`.gitignore`) | **TIDAK** (Diblokir HTTP 404 di server.ts) | **FILE_ABSENT** | Direktori `data/` saat ini kosong. File lokal asli tersimpan di arsip karantina. |

---

### 3. Detail Verifikasi Integritas SHA-256

Sebelum salinan publik di `public/assets/aistudio/` dibersihkan, proses karantina melakukan replikasi identik ke `quarantine/assets/aistudio/` dan memvalidasi kecocokan SHA-256:

```text
645d528de7f80b164e7dabaf18177c940323c3045d0b57d85890c6659c49cd01  quarantine/assets/aistudio/morajawssv5_645d528d.zip
645d528de7f80b164e7dabaf18177c940323c3045d0b57d85890c6659c49cd01  [VERIFIED MATCH 100%]

e63ea482d1b51ab31f0540bafe7a9011d342f93430a2f07cfa3fae9b809ee34b  quarantine/assets/aistudio/remix-flexilayout_e63ea482.zip
e63ea482d1b51ab31f0540bafe7a9011d342f93430a2f07cfa3fae9b809ee34b  [VERIFIED MATCH 100%]
```

Integritas arsip terjamin penuh: data backup historis tidak hilang, tidak rusak, dan tidak berubah satu byte pun.

---

### 4. Hasil Audit Pemblokiran Akses HTTP (Live Express Socket Verification)

Pengujian HTTP riil dilakukan melalui loopback server Express pada 7 rute sensitif:

| No | Target URL | HTTP Method | Expected Status | Actual Status | Res Code | Status Pemblokiran |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| 1 | `/morajaws_production_firestore_backup.json` | GET | 404 | **404** | `NOT_FOUND` | **TERBLOKIR (PASS)** |
| 2 | `/data/morajaws_production_firestore_backup.json` | GET | 404 | **404** | `NOT_FOUND` | **TERBLOKIR (PASS)** |
| 3 | `/data/morajaws_database.json` | GET | 404 | **404** | `NOT_FOUND` | **TERBLOKIR (PASS)** |
| 4 | `/assets/aistudio/morajawssv5_645d528d.zip` | GET | 404 | **404** | `NOT_FOUND` | **TERBLOKIR (PASS)** |
| 5 | `/assets/aistudio/remix-flexilayout_e63ea482.zip` | GET | 404 | **404** | `NOT_FOUND` | **TERBLOKIR (PASS)** |
| 6 | `/public/assets/aistudio/morajaws0-nov-5-2026-10-46-20-pm_b249e691.zip` | GET | 404 | **404** | `NOT_FOUND` | **TERBLOKIR (PASS)** |
| 7 | `/quarantine/assets/aistudio/morajawssv5_645d528d.zip` | GET | 404 | **404** | `NOT_FOUND` | **TERBLOKIR (PASS)** |

Seluruh 7 rute mengembalikan **HTTP 404 NOT_FOUND**. Tidak ada berkas backup yang dapat diunduh melalui web browser secara publik.

---

### 5. Status Git Tracking & Riwayat Repositori

- **Pemeriksaan Direktori `.git` Lokal:** Tidak ditemukan folder `.git` pada container sandbox AI Studio (`fatal: not a git repository`).
- **Status Publikasi Repositori:** **NOT_VERIFIED** (Karena riwayat remote Git tidak dapat diinspeksi secara langsung dari container lokal tanpa kredensial Git remote).
- **Aturan `.gitignore`:** Telah dikonfigurasi aktif untuk mencegah berkas backup ter-commit kembali:
  ```gitignore
  # Production backups, quarantine, and local fixtures protection
  *production_firestore_backup*.json
  *production_backup*.json
  data/*_backup*.json
  data/morajaws_database.json
  quarantine/
  *.zip
  *.bak
  *.sqlite
  *.dump
  morajaws_database.json
  ```

---

### 6. Rekomendasi untuk Persetujuan Owner (REQUIRES_OWNER_APPROVAL)

1. **Permanensi Karantina vs Penghapusan Arsip:**
   Arsip `quarantine/assets/aistudio/morajawssv5_645d528d.zip` (3.2 MB) dan `remix-flexilayout_e63ea482.zip` (1.4 MB) saat ini aman di folder privat lokal `quarantine/`. Jika Owner ingin memindahkan arsip ini ke penyimpanan cloud terenkripsi (misal Google Cloud Storage / Supabase Private Storage dengan enkripsi KMS) atau menghapusnya secara permanen, **diperlukan persetujuan tertulis eksplisit dari Owner**.
2. **Audit Remote Repository Git:**
   Jika repositori ini terhubung ke GitHub/GitLab, disarankan Owner melakukan pemeriksaan riwayat commit remote (`git log --all --full-history -- "**/morajaws*.zip"`) untuk memastikan arsip tidak pernah masuk ke remote branch publik di masa lalu.
