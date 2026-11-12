# MoraJaws PHASE 17A — Migration Reconciliation

Paket ini hanya untuk audit dan rekonsiliasi migration/database schema MoraJaws.
**Tidak termasuk inisialisasi staging, deployment migration, atau perubahan database remote.**

## File
- `GOOGLE_AI_STUDIO_PROMPT_PHASE17A.md` — prompt utama untuk Google AI Studio.
- `PHASE17A_CHECKLIST.md` — checklist audit.
- `PHASE17A_REPORT_TEMPLATE.md` — format laporan wajib.

## Cara menggunakan
1. Upload ZIP source code MoraJaws terbaru ke Google AI Studio.
2. Upload ZIP ini.
3. Salin seluruh `GOOGLE_AI_STUDIO_PROMPT_PHASE17A.md` ke chat Google AI Studio.
4. Minta AI melakukan audit dan menghasilkan laporan.
5. Tahap ini tidak boleh mengedit source atau menjalankan SQL. Hasilnya menjadi dasar persetujuan fase implementasi berikutnya.

## Batasan keselamatan
- Jangan konek atau menjalankan query ke Supabase remote.
- Jangan deploy migration.
- Jangan mengubah migration ledger.
- Jangan mengedit file migration lama.
- Jangan membuat migration baru pada tahap audit ini.
- Jangan menyentuh data production.
- Jangan menjalankan DROP, TRUNCATE, DELETE, ALTER, CREATE, GRANT, REVOKE, atau operasi tulis lainnya.
