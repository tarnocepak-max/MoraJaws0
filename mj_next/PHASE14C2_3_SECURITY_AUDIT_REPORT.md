# MORAJAWS — LAPORAN RESMI AUDIT KEAMANAN FASE 14C.2.3
## Remediasi Arsip Backup Publik, Integritas Static Assets & Analisis Kerentanan (Phase 14C.2.3)

**Tanggal Audit:** 06 November 2026  
**Peran:** Senior Software Engineer, Application Architect, Security Reviewer & Migration Engineer  
**Status Audit Keamanan:** **PASS** (Zero Public Secret Leakage, Zero Public Backup Assets, Fail-Closed Enforced)  
**Database Produksi:** Tidak Tersentuh (Zero DDL, Zero DML, Zero Migration)  
**Lingkungan Pengujian:** Isolated Local Mock Staging & Loopback HTTP Socket  

---

### 1. Tujuan & Ruang Lingkup Audit Keamanan

Audit Keamanan Fase 14C.2.3 berfokus pada:
1. **Pemindaian Direktori Publik & Aset Statis:** Memeriksa `public/`, `dist/`, `.aistudio/`, dan rute Express untuk memastikan tidak ada berkas ZIP, cadangan JSON Firestore, fixture database lokal, atau source map yang dapat diunduh tanpa otorisasi.
2. **Karantina Berkas Sensitif:** Mengamankan berkas `morajawssv5_645d528d.zip` (3.2 MB) yang memuat `data/morajaws_database.json`, memverifikasi SHA-256 byte-for-byte, dan memindahkannya ke lokasi privat.
3. **Pemeriksaan Bundel Frontend Vite (`dist/`):** Memverifikasi bahwa build produksi Vite (`npm run build`) tidak menyalin berkas arsip atau database lokal, serta bebas total dari `SUPABASE_SERVICE_ROLE_KEY`, connection string PostgreSQL, JWT secret, dan password hash.
4. **Pemblokiran Jalur HTTP Express:** Memastikan middleware Express secara ketat menolak permintaan berkas `.zip`, `.bak`, `.sql`, `*backup*`, `/assets/aistudio/`, dan `/quarantine/` dengan status **HTTP 404 NOT_FOUND**.
5. **Evaluasi Keamanan Tiga Protected Work Order:**
   - `wo_1793825457141_u4bnht` (`WO-EXPRESS-TEST-1793825456810`)
   - `wo_imp_1793825458959_4i4f1h` (`WO-DUP-TEST-1793825458804`)
   - `wo_imp_1793825458959_262dei` (`WO-DUP-TEST-1793825458804-UNIQUE`)
6. **Evaluasi Batas Tenant Cross-Contractor:** Memastikan Leader Kontraktor A tidak dapat memanipulasi atau membaca WO Kontraktor B.

---

### 2. Klasifikasi Hasil Audit

Sesuai aturan sistem MoraJaws, hasil diklasifikasikan secara tegas:
- **VERIFIED:** Telah diuji dan diverifikasi secara nyata dengan bukti eksekusi langsung.
- **NOT_VERIFIED:** Tidak dapat diverifikasi secara independen dari sandbox lokal saat ini.
- **NOT_TESTED:** Endpoint atau skenario yang belum dijalankan melalui pengujian HTTP.
- **REQUIRES_OWNER_APPROVAL:** Tindakan yang memerlukan izin tertulis dari Owner.

---

### 3. Hasil Pemindaian Statis & Aset Sensitif

| Area Inspeksi | Status Temuan | Bukti / Catatan Verifikasi | Status Audit |
| :--- | :---: | :--- | :---: |
| **Folder `public/assets/aistudio/`** | **BERSIH** | Seluruh 2 file ZIP, 4 file paste prompt, dan 2 file source text telah dikarantina ke `quarantine/`. Folder publik kini hanya berisi `.gitkeep`. | **VERIFIED** |
| **Folder `dist/` (Hasil Vite Build)** | **BERSIH** | Build output `dist/` hanya memuat: `index.html`, `index-*.css`, `index-*.js`, `.gitkeep`, dan 2 file template XLSX. Zero file `.zip` atau backup JSON. | **VERIFIED** |
| **Folder `data/`** | **BERSIH** | Direktori `data/` kosong (`total 0`). Tidak ada database lokal atau backup JSON aktif di container. | **VERIFIED** |
| **Kredensial Hardcoded di Source Code** | **BERSIH** | Pemindaian regex membuktikan tidak ada secret key, service role key, atau database password yang di-hardcode di `src/` maupun `server.ts`. | **VERIFIED** |
| **Environment Variable `.env.example`** | **BERSIH** | Berkas `.env.example` hanya memuat nama variabel kosong tanpa credential (`CORS_ALLOWED_ORIGINS=`, `SUPABASE_SERVICE_ROLE_KEY=`, dst.). | **VERIFIED** |
| **Direct Client Supabase di Frontend** | **BERSIH** | `src/services/supabaseClient.ts` hanya membaca `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`. Tidak ada `SERVICE_ROLE_KEY` di browser. | **VERIFIED** |
| **Source Maps Publik (`*.map`)** | **BERSIH** | `vite build` tidak menghasilkan file `.map` di direktori `dist/` (`find dist -name "*.map"` = 0). | **VERIFIED** |
| **Git Tracking & Remote History** | **NOT_VERIFIED** | Container sandbox AI Studio tidak memiliki direktori `.git` lokal (`fatal: not a git repository`). Riwayat commit remote di GitHub tidak dapat diverifikasi dari container ini. | **NOT_VERIFIED** |
| **Arsip Legacy `morajaws0-nov-5-2026-10-46-20-pm_b249e691.zip`** | **TIDAK ADA** | Pemindaian root `/` hingga kedalaman maksimal membuktikan berkas dengan hash/nama ini tidak ada di sistem berkas saat ini (`NOT_FOUND`). | **VERIFIED** |

---

### 4. Bukti Uji Keamanan Rute HTTP (Loopback Socket)

Server pengujian loopback Express dijalankan pada ephemeral port untuk memvalidasi proteksi middleware:

#### A. Pengujian Pemblokiran Rute Backup & Karantina:
1. `GET /morajaws_production_firestore_backup.json` -> **HTTP 404 NOT_FOUND** (Diblokir).
2. `GET /data/morajaws_production_firestore_backup.json` -> **HTTP 404 NOT_FOUND** (Diblokir).
3. `GET /data/morajaws_database.json` -> **HTTP 404 NOT_FOUND** (Diblokir).
4. `GET /assets/aistudio/morajawssv5_645d528d.zip` -> **HTTP 404 NOT_FOUND** (Diblokir).
5. `GET /assets/aistudio/remix-flexilayout_e63ea482.zip` -> **HTTP 404 NOT_FOUND** (Diblokir).
6. `GET /public/assets/aistudio/morajaws0-nov-5-2026-10-46-20-pm_b249e691.zip` -> **HTTP 404 NOT_FOUND** (Diblokir).
7. `GET /quarantine/assets/aistudio/morajawssv5_645d528d.zip` -> **HTTP 404 NOT_FOUND** (Diblokir).
- **Status Verdict:** **PASS (VERIFIED)** — Seluruh 7 percobaan akses terhadap berkas backup dan arsip zip ditolak tegas dengan HTTP 404.

#### B. Pengujian Batas Tenant Cross-Contractor:
- **Skenario:** Leader Hendra (`u_leader_01`, Kontraktor: `PT Mitra Jaringan Solusi`) mencoba menugaskan teknisi pada WO `wo_contractor_b_999` milik mitra lain (`PT Jaringan Luar Wilayah`, ID `c-luar-99`).
- **Endpoint:** `POST /api/tickets/assign`
- **Respons Server:** **HTTP 403 Forbidden**
- **Kode Error:** `SCOPE_MISMATCH`
- **Pesan:** *"Akses Ditolak: Anda hanya dapat menugaskan Work Order dalam cakupan mitra kontraktor Anda (PT Mitra Jaringan Solusi)."*
- **Status Verdict:** **PASS (VERIFIED)**

#### C. Pengujian Imutabilitas 3 Protected Work Orders:
- **Objek Uji:**
  1. `wo_1793825457141_u4bnht`
  2. `wo_imp_1793825458959_4i4f1h`
  3. `wo_imp_1793825458959_262dei`
- **Prosedur:** Serialisasi snapshot memori state mock sebelum pengujian (`snapshotBefore`). Mengirimkan 6 mutasi HTTP riil (`POST /api/tickets/assign` dan `POST /api/tickets/reassign` terhadap ketiga ID). Serialisasi snapshot memori setelah pengujian (`snapshotAfter`).
- **Hasil Respons:** Seluruh 6 mutasi ditolak server dengan **HTTP 403 Forbidden** (`code: 'PROTECTED_PRODUCTION_RECORD'`).
- **Perbandingan Snapshot:** `snapshotBefore === snapshotAfter` bernilai **true** (100% identik).
- **Status Verdict:** **PASS (VERIFIED)**

---

### 5. Analisis Risiko Tersisa & Rekomendasi Persetujuan Owner

#### A. Risiko yang Terkelola (Resolved):
- Risiko pengunduhan arsip backup melalui web server: **TERSELESAIKAN** (Arsip dipindahkan ke `quarantine/`, dihapus dari `public/`, dan Express memblokir seluruh rute ekstensi `.zip`/backup).
- Risiko Vite build menyalin file zip ke `dist/`: **TERSELESAIKAN** (Folder publik bersih dan plugin Vite build mengamankan output).
- Risiko false PASS pada pengujian: **TERSELESAIKAN** (Integritas asersi ganda status + fungsional ditegakkan di `evidenceCollector.ts`).

#### B. Perubahan yang Memerlukan Persetujuan Owner (REQUIRES_OWNER_APPROVAL):
1. **Penghapusan Permanen Berkas Karantina:**
   Berkas `quarantine/assets/aistudio/morajawssv5_645d528d.zip` (3.2 MB) dan `remix-flexilayout_e63ea482.zip` (1.4 MB) disimpan aman di folder lokal privat `quarantine/`. Jika Owner ingin memusnahkan atau memindahkan berkas ini ke cold storage di luar server, **wajib menunggu izin eksplisit dari Owner**.
2. **Pembersihan Riwayat Git Remote (Bila Diperlukan):**
   Jika di repositori GitHub/GitLab remote pernah terdapat commit historis yang memuat file zip tersebut, proses rewrite history (`git filter-repo` / BFG) berpotensi destruktif dan **wajib mendapatkan persetujuan eksplisit Owner**.
3. **Pengujian 60 Endpoint yang Belum Teruji via HTTP:**
   Sebanyak 22 endpoint teruji melalui DAL adapter internal Supabase, dan 38 endpoint belum memiliki skenario HTTP loopback. Pembuatan skenario pengujian baru direkomendasikan pada fase berikutnya.
