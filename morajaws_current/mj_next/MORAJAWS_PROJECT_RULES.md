# MORAJAWS_PROJECT_RULES.md
## Dokumen aturan proyek — MoraJaws

Dokumen ini adalah referensi wajib untuk AI coding assistant yang mengerjakan repository MoraJaws.

### A. Identitas proyek
MoraJaws adalah aplikasi operasional Work Order (WO) dengan beberapa role pengguna, portal Leader/Installer, pengelolaan WO, laporan, chat, WhatsApp, konfigurasi, dan monitoring.

Aplikasi yang sudah ada harus dipertahankan. Perubahan dilakukan bertahap, terukur, dan berdasarkan kode aktual di repository.

### B. Arsitektur target
```text
React/Vite Frontend
        |
        | HTTPS + Bearer token
        v
Express Backend / API
        |
        | server-side credentials only
        v
Supabase
  - PostgreSQL: satu-satunya database produksi
  - Auth: autentikasi produksi
  - Storage: file bila diperlukan
  - Realtime: opsional sesuai kebutuhan
```

Ketentuan:
- Browser tidak boleh mengakses Supabase secara langsung.
- Express adalah satu-satunya access layer ke Supabase.
- Firestore adalah arsip/backup selama transisi, bukan database produksi final.
- Firebase Auth adalah sistem lama yang hanya boleh dipakai untuk kompatibilitas transisi.
- JSON lokal hanya untuk development/testing; tidak boleh menjadi fallback produksi.
- Tidak boleh ada dua database produksi aktif.

### C. Aturan perubahan
1. Audit repository terkini sebelum mengubah kode.
2. Telusuri alur UI → API → repository → database.
3. Ubah sesedikit mungkin file dan area yang diperlukan.
4. Jangan rebuild atau mengganti stack.
5. Jangan menghapus fitur, menu, role, permission, workflow, atau desain tanpa instruksi eksplisit.
6. Jangan menganggap adapter atau endpoint yang belum dipakai sebagai integrasi selesai.
7. Jangan membuat endpoint atau repository duplikat.
8. Dokumentasikan semua perubahan.

### D. Keamanan
- Secret hanya berada di environment server/secret manager.
- Tidak ada service-role key di frontend, `VITE_*`, localStorage, sessionStorage, atau response API.
- Semua endpoint privat memvalidasi token dan RBAC di backend.
- Validasi status akun, session, contractor/area scope, serta kepemilikan resource.
- Gunakan HTTPS di production.
- Login memiliki rate limit dan error handling aman.
- Jangan mencatat password, token, atau secret di log.

### E. Migrasi dan perlindungan data
Tanpa persetujuan eksplisit, AI tidak boleh:
- menjalankan DDL/schema migration di production;
- mengubah RLS, grants, policies, indexes, triggers, atau permissions;
- melakukan insert/update/delete/truncate/seed/import ke production;
- memigrasikan akun, password, atau WO demo ke production;
- menghapus backup Firestore/JSON atau file migrasi;
- melakukan deployment production atau mengubah environment variables production.

Boleh menyiapkan rencana, SQL, dry-run, validasi, dan rollback untuk ditinjau, tetapi jangan mengeksekusinya tanpa persetujuan.

Tiga WO soft-deleted berikut dilindungi dan tidak boleh dimutasi:
- `wo_1793825457141_u4bnht` — `WO-EXPRESS-TEST-1793825456810`
- `wo_imp_1793825458959_4i4f1h` — `WO-DUP-TEST-1793825458804`
- `wo_imp_1793825458959_262dei` — `WO-DUP-TEST-1793825458804-UNIQUE`

### F. Aturan autentikasi final
- Supabase Auth melalui Express adalah target autentikasi produksi.
- Username login (bila didukung) diselesaikan di backend ke email kanonis.
- Profil, role, contractor, area, dan status akun dibaca dari database authoritative.
- Uji access token, refresh, expiry, logout, revocation, dan session version.
- Tidak ada fallback Firebase Auth/JSON pada production.
- Jangan membuat akun/password default production.
- Akun demo belum boleh dimigrasikan otomatis.

### G. Aturan bisnis WO
- `appointmentDate` adalah tanggal appointment kanonis.
- Zona waktu bisnis: `Asia/Jakarta`.
- Jangan menggunakan fallback `date` generik untuk menentukan visibilitas appointment.
- Superadmin/Dispatch dapat mencari WO lintas tanggal hanya sesuai fitur/izin yang berlaku.
- Leader/Installer dibatasi ke WO hari ini sesuai aturan bisnis yang berlaku.
- Leader dibatasi contractor/area terdaftar.
- Installer hanya melihat tiket yang ditugaskan kepadanya.
- Installer tidak memiliki sidebar; bottom navigation: Dashboard (Tugasnya), Tugas Saya, WhatsApp, Live Chat Center.
- Import wajib memvalidasi customer ID, WO number, street name, cluster name, FAT, FDT, customer phone, contractor name, dan area.
- Baris invalid ditolak, bukan dilengkapi dengan data rekaan.
- WO duplikat dilaporkan; tidak dihapus otomatis.

### H. Audit dan pengujian
- Audit log kritis harus ditunggu hasil persist-nya sebelum aksi dinyatakan berhasil.
- Health check harus menguji koneksi nyata backend ke Supabase.
- Kegagalan Supabase pada production harus fail-closed; tidak boleh fallback ke JSON.
- Test harus menguji perilaku nyata, bukan hanya nama variabel/string.
- Status pengujian: PASS, FAIL, NOT VERIFIED.
- Jalankan hanya script yang benar-benar tersedia di package.json.
- Jangan jalankan test destruktif di production.
- Laporkan perintah yang dijalankan dan hasilnya.

### I. Format laporan fase
Setiap fase wajib melaporkan:
1. Tujuan.
2. Temuan audit awal.
3. Implementasi.
4. File yang diubah.
5. Perubahan alur data/API.
6. Dampak keamanan.
7. Hasil test.
8. Hasil lint/build.
9. Risiko tersisa.
10. Rekomendasi fase berikutnya.

Jangan melanjutkan fase berikutnya secara otomatis.

### J. Prinsip utama
**Satu database produksi: Supabase PostgreSQL. Satu sistem autentikasi produksi: Supabase Auth. Satu jalur akses: Express Backend.**

Jangan mengklaim migrasi, build, deployment, atau pengujian berhasil tanpa bukti.
