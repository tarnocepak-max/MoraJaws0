# PHASE 19 — Persistence & Offline Checklist

- [ ] Inventaris semua localStorage/sessionStorage/IndexedDB/JSON writes.
- [ ] Inventaris semua fallback data layer dan mock/demo fixtures.
- [ ] Tandai setiap sumber sebagai authoritative, cache, pending command, atau fixture.
- [ ] Pastikan WO tidak dianggap tersimpan server jika hanya tersimpan lokal.
- [ ] Bila offline queue dipertahankan, gunakan PENDING_SYNC, idempotency key, actor, timestamp, retry, conflict state.
- [ ] Pastikan sinkronisasi mengirim command ke backend dan server menjadi final authority.
- [ ] Jangan simpan secret/password/token dalam browser storage.
- [ ] UI membedakan server saved, pending sync, sync failed, refresh failed.
- [ ] Pastikan laporan dan progress installer tidak hilang akibat penghapusan offline feature.
