# PHASE 18 — Atomic Import Acceptance Criteria

Sebuah implementasi dinyatakan lulus hanya jika bukti tes menunjukkan:

1. Import batch berhasil: seluruh row valid tersimpan dan history final konsisten.
2. Kesalahan di tengah transaksi: seluruh perubahan WO pada transaksi itu rollback.
3. Semua row invalid: hasil FAILED, tidak pernah SUCCESS.
4. Campuran valid/invalid mengikuti kebijakan yang terdokumentasi; status PARTIAL_SUCCESS hanya jika desain memang mengizinkan commit parsial. Jika strict atomic, seluruh batch ditolak.
5. Duplicate WO Number exact dan variasi case/whitespace terdeteksi dengan aturan normalisasi tunggal.
6. Retry dengan idempotency key sama tidak menggandakan row.
7. Dua request paralel dengan key sama tidak memproses operasi dua kali.
8. Duplicate conflict pada dua batch bersamaan tidak menghasilkan duplikasi.
9. Update import tidak menghapus technician assignment, installer progress, atau report.
10. Import history dan status hasil konsisten dengan commit/rollback.
11. Frontend tidak menampilkan saved-success sebelum server mengonfirmasi commit.
12. Semua hasil tes dikategorikan static/unit/integration/E2E/live staging.

Catatan desain:
- Tentukan apakah atomicity berlaku untuk seluruh batch atau per chunk. Untuk klaim “atomic import”, seluruh batch harus satu transaksi, bukan satu transaksi per chunk.
- Audit log kegagalan yang harus bertahan setelah rollback dapat ditulis melalui mekanisme terpisah setelah transaksi gagal; jelaskan konsekuensi dan jangan menyebutnya bagian dari transaksi yang rollback.
