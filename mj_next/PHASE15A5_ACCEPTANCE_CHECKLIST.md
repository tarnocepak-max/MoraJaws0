# PHASE 15A.5 — ACCEPTANCE CHECKLIST

- [ ] Reproduksi baseline build dari source ZIP.
- [ ] Reproduksi TypeScript check.
- [ ] Verifikasi production start command pada versi Node/runtime target.
- [ ] Smoke test HTTP `/` dan asset utama.
- [ ] Smoke test deep-link refresh.
- [ ] `/api/bootstrap` anonim mengembalikan payload aman.
- [ ] Endpoint privat menolak request anonim.
- [ ] Login, reload/session restore, refresh, logout.
- [ ] Change password melalui Supabase Auth.
- [ ] Enam role dan server-side RBAC.
- [ ] Android viewport, keyboard, safe-area, bottom navigation.
- [ ] PWA cache/update/offline jika PWA digunakan.
- [ ] Frontend bundle bebas secret.
- [ ] Tidak ada token sensitif di localStorage/Cache Storage sesuai target arsitektur.
- [ ] Semua fitur existing tetap tersedia.
- [ ] Tidak ada perubahan database/akun/WO production.
- [ ] ZIP lengkap dapat dibuka kembali dan integritas arsip lulus.

Status tiap butir wajib: PASS / FAIL / BLOCKED / NOT TESTED.
