# PHASE 15A.5 — BASELINE NOTES

Basis: `morajaws0-nov-7-2026-7-19-45-pm.zip` (252 entries; ZIP integrity check passed).

Laporan Phase 15A.4 di dalam basis menyatakan:
- `npm run build`: PASS.
- `npm run lint`: PASS (tsc --noEmit).
- Test suites 15 + 66 + 80 = 161 PASS.
- React Error Boundary ditambahkan pada root.
- `App.tsx` diberi guard untuk state belum login.
- Express dev server dan `/api/bootstrap` dilaporkan HTTP 200.
- Cookie migration masih PARTIAL: frontend masih memakai Authorization Bearer; full HttpOnly cookie belum selesai.
- Android/device real-world testing belum dibuktikan.

Poin yang harus diperiksa ulang:
1. `package.json` menetapkan `start: node server.ts`. Verifikasi apakah ini didukung oleh versi Node dan host target; jangan menganggap otomatis valid.
2. Laporan 15A.4 menyebut lima role pada satu bagian, tetapi enam role pada bagian lain. Source dan matriks permission harus menjadi acuan, lalu laporkan perbedaan.
3. Klaim 161 PASS harus direproduksi; jangan hanya mengutip laporan.
4. `PHASE15A4_SECURITY_VALIDATION_REPORT.md` menyebut status cookie partial. Jangan menyebut full cookie session telah selesai.
5. Build lokal tidak sama dengan pengujian browser Android atau deployment host.

Tidak ada database atau akun yang diperiksa atau diubah dalam pembuatan paket handoff ini.
