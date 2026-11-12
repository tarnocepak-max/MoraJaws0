# MoraJaws — PHASE 17–21 Google AI Studio Repair Pack

## Tujuan
Paket ini berisi instruksi kerja untuk mengaudit dan memperbaiki source code MoraJaws agar siap menjalani migrasi Supabase secara aman. Paket ini **bukan** bukti bahwa migrasi telah berhasil dan **tidak** berisi migration SQL yang boleh langsung dijalankan di production.

## File yang harus diunggah ke Google AI Studio
1. ZIP source code MoraJaws paling baru.
2. `MoraJaws_PHASE17_21_Google_AI_Studio_Repair_Pack.zip` ini.

## Cara menjalankan
1. Upload kedua ZIP.
2. Kirim isi `GOOGLE_AI_STUDIO_MASTER_PROMPT.md` ke Google AI Studio.
3. Minta AI membaca dan mengekstrak seluruh file terlebih dahulu.
4. Tahap audit harus selesai dan dilaporkan sebelum perubahan kode.
5. Setelah laporan disetujui, jalankan fase satu per satu. Jangan meminta semua fase dikerjakan sekaligus jika konteks/kredit terbatas.

## Aturan keselamatan
- Jangan deploy migration, menjalankan SQL ke database remote, atau mengubah data production.
- Jangan membuat credential, akun, token, atau hasil tes palsu.
- Jangan mengubah custom login MoraJaws menjadi Supabase Auth.
- Supabase PostgreSQL tetap menjadi sumber data utama untuk data WO.
- `SUPABASE_SERVICE_ROLE_KEY` hanya boleh berada di backend/server environment.
- Jangan menimpa source project dengan snapshot/backup duplikat. Temukan root project aktif dari package.json, entry points, dan dependency graph.
- Jangan menghapus fitur yang sudah berjalan hanya untuk membuat tes lulus.
- Pertahankan tiga record soft-deleted yang dilindungi jika ditemukan:
  - `wo_1793825457141_u4bnht`
  - `wo_imp_1793825458959_4i4f1h`
  - `wo_imp_1793825458959_262dei`
- Jangan mengklaim siap production hanya berdasarkan static tests.
