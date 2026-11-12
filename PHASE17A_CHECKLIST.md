# PHASE 17A Checklist — Audit Only

## Source identification
- [ ] Root project aktif teridentifikasi dengan bukti.
- [ ] Snapshot/backup lama tidak tercampur.
- [ ] Commit/hash source dicatat jika tersedia.

## Migration inventory
- [ ] Semua SQL migration ditemukan.
- [ ] SHA-256 tiap migration dicatat.
- [ ] Nomor duplikat dan isi duplikat ditemukan.
- [ ] Dependency graph disusun.
- [ ] DDL, DML, grants, RLS, policies, functions, triggers, indexes diinventarisasi.
- [ ] Destructive/non-idempotent migration ditandai.

## Custom auth
- [ ] `auth.users`, `auth.uid()`, `auth.role()` ditelusuri.
- [ ] FK dan policy berbasis Supabase Auth ditandai.
- [ ] Login internal MoraJaws dipastikan tidak bergantung Supabase Auth.
- [ ] Pengganti authorization dijelaskan; bukan sekadar menghapus RLS/FK.

## Schema parity
- [ ] Adapter, routes, dan services dipetakan ke tabel/kolom.
- [ ] Tipe, nullable, default, FK, index, unique cocok.
- [ ] Trigger function dan urutan dependency diverifikasi source-only.

## Work Orders
- [ ] Normalisasi WO Number dibandingkan frontend/backend/SQL.
- [ ] Unique index dan preflight duplicate diperiksa.
- [ ] Import history dan idempotency schema diperiksa.
- [ ] Assignment, progress, report, soft delete diperiksa.
- [ ] SQL preflight hanya SELECT/CTE/catalog reads.

## Safety
- [ ] Tidak ada remote database query.
- [ ] Tidak ada migration dijalankan.
- [ ] Tidak ada source atau SQL yang diubah.
- [ ] Tidak ada credential di laporan.
- [ ] Fakta, asumsi, dan blocked evidence dipisahkan.
