# MORAJAWS — PHASE 15A.6 REMAINING ISSUES & KNOWN LIMITATIONS
**Tanggal Tinjauan**: 7 November 2026  
**Status**: DIVERIFIKASI & TERKONTROL  

---

## 1. Daftar Risiko & Limitasi yang Diketahui

### A. Kredensial Produksi Supabase Auth di Lingkungan Live
- **Kondisi**:
  Pengujian otomatis pada test suite menggunakan backend loopback dengan Supabase Mock Client dan simulasi auth directory.
- **Keterbatasan**:
  Login nyata terhadap instance cloud remote Supabase bergantung pada ketersediaan `SUPABASE_URL`, `SUPABASE_ANON_KEY`, serta pendaftaran pengguna di Supabase Auth project yang bersangkutan.
- **Tindakan yang Diperlukan**:
  Pemilik aplikasi (Super Admin) memastikan akun staf terdaftar pada project Supabase Auth yang aktif dengan email utama atau alternatif yang terdaftar di profil staf MoraJaws.

### B. Evaluasi HttpOnly Cookie di Lingkungan AI Studio Preview
- **Kondisi**:
  Penggunaan cookie HttpOnly pada browser cross-origin dalam frame AI Studio Build diblokir oleh kebijakan keamanan modern (Third-Party Cookie Deprecation & SameSite=None constraints).
- **Status Penanganan**:
  Penyimpanan access token dan refresh token di `localStorage` dengan Authorization header Bearer tetap dipertahankan sebagai pendekatan resmi yang aman dan kompatibel.

### C. Pembatasan Migrasi Data Produksi Otomatis
- **Kondisi**:
  Sesuai aturan keamanan MoraJaws (`MORAJAWS_PROJECT_RULES.md` Bagian 5), tidak ada migrasi data otomatis, penyalinan akun demo, atau eksekusi DDL remote yang dijalankan tanpa persetujuan eksplisit.
- **Status Penanganan**:
  Data akun dan tiket operasional pada file local JSON tetap berfungsi sebagai staging/fixture terisolasi, dan tiga Work Order terproteksi (`wo_1793825457141_u4bnht`, `wo_imp_1793825458959_4i4f1h`, `wo_imp_1793825458959_262dei`) tetap terlindungi dari mutasi.

---

## 2. Rencana Pemantauan Pasca-Perbaikan
1. Mengamati log audit backend saat pengguna pertama kali login dengan email alternatif (`rayhanafirzanx@gmail.com`).
2. Memverifikasi bahwa antarmuka login menampilkan notifikasi instruksi yang jelas jika staf baru belum dipetakan (`NEEDS_MAPPING`).
3. Menguji fungsionalitas refresh token secara berkala saat durasi sesi mendekati masa kedaluwarsa.
