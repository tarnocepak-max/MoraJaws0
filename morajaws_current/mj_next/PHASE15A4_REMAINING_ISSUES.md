# MORAJAWS — PHASE 15A.4 REMAINING ISSUES & KNOWN RISKS

## 1. Status Sisa Isu & Mitigasi
| No | Isu / Catatan Teknis | Tingkat Risiko | Status Saat Ini | Mitigasi / Rekomendasi |
| :---: | :--- | :---: | :---: | :--- |
| 1 | **Transisi Cookie HttpOnly Murni** | Rendah | Backend Ready / Partial | Backend Express telah siap dengan verifikasi token & sessionVersion. Frontend saat ini mengirim token via `Authorization: Bearer`. Transisi total ke pure cookie HttpOnly tanpa Bearer dapat dijadwalkan pada fase terpisah setelah uji regresi PWA Android selesai. |
| 2 | **Supabase Production Latency** | Sedang | Mitigasi Aktif | Koneksi backend ke Supabase di internet publik bergantung pada jaringan host. Telah diterapkan fail-closed terstandarisasi (HTTP 503) sehingga sistem tidak menyajikan data lokal usang atau membingungkan teknisi di lapangan. |
| 3 | **Proteksi 3 Work Order Terproteksi** | Nol (Aman) | Terverifikasi 100% | Ketiga tiket soft-deleted dilindungi oleh guard hardcoded `PROTECTED_PRODUCTION_WO_IDS` yang menolak mutasi, restore, archive, dan penghapusan massal. |
| 4 | **Pencegahan Blank Screen** | Nol (Aman) | Terverifikasi 100% | React Error Boundary ganda (`main.tsx` dan `App.tsx`) aktif melindungi pohon rendering dari segala uncaught exception. |

## 2. Rekomendasi Fase Selanjutnya (Phase 15A.5)
- Pengujian interaktif antarmuka langsung oleh Owner/User pada browser ponsel Android.
- Persiapan checklist deployment akhir dan verifikasi sinkronisasi Google Sheets operasional.
- Jangan menjalankan DDL, migrasi skema, atau pembersihan data produksi tanpa izin eksplisit bertahap dari Owner.
