# PHASE 17 — Migration Reconciliation Checklist

## Inventory
- [ ] Daftar seluruh migration SQL dan checksum.
- [ ] Temukan nomor duplikat dan nama yang tidak konsisten.
- [ ] Bedakan migration yang sudah diterapkan dari yang hanya ada di repo; jangan menebak ledger.
- [ ] Petakan tabel, kolom, constraint, index, trigger, function, policy, grants.
- [ ] Petakan urutan dependency.

## Custom authentication
- [ ] Cari `auth.users`, `auth.uid()`, `auth.role()`, Supabase Auth client/server.
- [ ] Pastikan login MoraJaws tidak membutuhkan Supabase Auth.
- [ ] Pastikan backend memvalidasi session internal dan role dari sumber terpercaya.
- [ ] Jangan menghapus RLS atau grants tanpa desain pengganti yang aman.

## Schema parity
- [ ] Cocokkan semua kolom adapter dengan migration schema.
- [ ] Cocokkan tipe, nullability, default, FK, unique, index.
- [ ] Cocokkan nama function trigger.
- [ ] Preflight normalized duplicate WO.
- [ ] Jangan deploy migration remote.
