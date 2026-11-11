# MORAJAWS — RENCANA REMEDIASI & ROADMAP LANJUTAN
## Rencana Aksi Remediasi Keamanan, Pengelolaan Arsip Karantina & Pengujian Cakupan Endpoint (Phase 14C.2.3)

**Tanggal:** 06 November 2026  
**Peran:** Senior Software Engineer, Application Architect, Security Reviewer & Migration Engineer  
**Status Implementasi:** **Phase 14C.2.3 Selesai** (Implementasi Karantina & Penegakan Asersi Berhasil)  
**Database Produksi:** Tidak Tersentuh (Zero DDL, Zero DML, Zero Production Writes)  

---

### 1. Status Tindakan yang Telah Selesai (Completed Actions)

Dalam Phase 14C.2.3, tindakan mitigasi langsung telah selesai diimplementasikan:
1. **Karantina Berkas Arsip Publik:**
   - Berkas `morajawssv5_645d528d.zip` (3.2 MB) dan `remix-flexilayout_e63ea482.zip` (1.4 MB) beserta prompt/source text di `public/assets/aistudio/` telah disalin ke `quarantine/assets/aistudio/`.
   - Hash SHA-256 diverifikasi identik 100% sebelum penghapusan salinan publik.
   - Salinan publik di `public/assets/aistudio/` telah dibersihkan.
2. **Proteksi Build Vite:**
   - Plugin `security-clean-dist-backups` ditambahkan pada `vite.config.ts`.
   - Hasil build `dist/` terverifikasi bebas total dari berkas `.zip`, `.bak`, `.sql`, dan backup JSON.
3. **Proteksi Middleware Express:**
   - Middleware pemblokiran ditambahkan pada `server.ts` sebelum serving static asset untuk mengembalikan **HTTP 404 NOT_FOUND** pada seluruh permintaan non-API terhadap berkas `.zip`, `.bak`, `.sql`, `.sqlite`, `.dump`, `quarantine`, `morajaws_database`, dan `backup`.
4. **Penguatan `.gitignore`:**
   - Menambahkan aturan abaikan untuk `quarantine/`, `*.zip`, `*.bak`, `*.sqlite`, `*.dump`, dan `morajaws_database.json`.
5. **Integritas Asersi Pengujian (Dual Assertion):**
   - Modul `scripts/evidenceCollector.ts` mewajibkan status assertion DAN functional assertion berhasil agar menghasilkan verdict `PASS`.
   - Suite `scripts/execute_phase14c1_endpoint_integration_test.ts` dan `scripts/execute_phase14c2_remaining_endpoint_test.ts` memancarkan asersi ganda.
6. **Rekonsiliasi Inventaris Endpoint:**
   - Mengadopsi 5 status kanonis (`HTTP_VERIFIED_PASS`: 72, `INTERNAL_ONLY`: 22, `NOT_TESTED`: 38, `HTTP_VERIFIED_FAIL`: 0, `NO_EXECUTION_EVIDENCE`: 0).
   - Sinkronisasi presisi antara 150 panggilan HTTP riil dan 132 rute unik di `all_endpoints_audit.json`.

---

### 2. Matriks Keputusan & Persetujuan Owner (REQUIRES_OWNER_APPROVAL)

Tindakan berikut berada di luar batasan otomatis AI assistant dan memerlukan keputusan resmi dari Owner:

| No | Tindakan yang Diusulkan | Alasan / Nilai Tambah | Risiko yang Perlu Dipertimbangkan | Status Persetujuan |
| :---: | :--- | :--- | :--- | :---: |
| 1 | **Pemindahan Arsip Karantina ke Penyimpanan Eksternal Aman** | Memindahkan berkas `quarantine/assets/aistudio/*.zip` ke Google Cloud Storage Bucket / Supabase Storage privat terenkripsi (AES-256) agar container bersih total. | Jika dihapus tanpa backup eksternal, riwayat snapshot lokal versi v5 akan hilang. | **REQUIRES_OWNER_APPROVAL** |
| 2 | **Pembersihan Riwayat Git Remote (Bila Diperlukan)** | Memeriksa apakah commit remote di masa lalu memuat file zip, lalu membersihkannya dengan `git filter-repo`. | Memerlukan force push pada branch remote yang dapat mengganggu collaborator lain. | **REQUIRES_OWNER_APPROVAL** |
| 3 | **Pelaksanaan Phase 14C.3 (Pengujian 60 Endpoint Tersisa)** | Menuliskan skenario uji loopback HTTP terisolasi untuk 22 endpoint `INTERNAL_ONLY` dan 38 endpoint `NOT_TESTED` (Google Sheets, Master CRUD, Storage). | Memerlukan fixture mock baru untuk Google Sheets API dan Storage Adapter. Tidak menyentuh produksi. | **RECOMMENDED FOR NEXT PHASE** |

---

### 3. Roadmap Rinci Menuju Fase Berikutnya

#### Langkah 1: Peninjauan Hasil Phase 14C.2.3 oleh Owner
- Owner meninjau dokumen audit (`PHASE14C2_3_SECURITY_AUDIT_REPORT.md`, `PHASE14C2_3_BACKUP_INVENTORY.md`, `PHASE14C2_3_EVIDENCE_INTEGRITY_REPORT.md`).
- Owner memutuskan retensi berkas arsip di `quarantine/`.

#### Langkah 2: Persiapan Fase 14C.3 — *Full Endpoint HTTP Integration Coverage* (Jika Disetujui)
- Target: Meningkatkan cakupan `HTTP_VERIFIED_PASS` dari 72 endpoint (54.5%) menuju 132 endpoint (100%).
- Lingkup pengujian Fase 14C.3:
  1. **Google Sheets Endpoints:** Uji integrasi mock untuk sync sheets, format kolom, status service.
  2. **Storage Adapter Endpoints:** Uji signed URL refresh, validasi MIME, dan download handling.
  3. **Master Data CRUD:** Uji rute internal CRUD yang saat ini berstatus `INTERNAL_ONLY`.
  4. **Strict Isolation:** Tetap menggunakan Express loopback port 0 dan mock Supabase terisolasi.

#### Langkah 3: Gerbang Persetujuan Migrasi Produksi (Production Gate)
- Sesuai `MORAJAWS_PROJECT_RULES.md`, **TIDAK ADA MIGRASI ATAU DEPLOYMENT PRODUKSI** yang dijalankan tanpa perintah langsung dan persetujuan bertahap dari Owner.
