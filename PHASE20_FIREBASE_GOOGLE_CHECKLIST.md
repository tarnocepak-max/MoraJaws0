# PHASE 20 — Firebase & Google Integration Checklist

- [ ] Telusuri seluruh Firebase SDK dan Admin SDK imports.
- [ ] Cari seluruh runtime call sites, bukan hanya nama file.
- [ ] Periksa Firebase Auth, Firestore, Storage, FCM, OAuth, Google Sheets.
- [ ] Pisahkan login internal MoraJaws dari OAuth Google Sheets.
- [ ] Tentukan keep/remove/replace per integrasi beserta dependensi.
- [ ] Pastikan Supabase PostgreSQL tetap database utama untuk WO.
- [ ] Perbaiki health endpoint agar status integrasi aktual.
- [ ] Periksa frontend bundle dan source map agar tidak mengandung service role key.
- [ ] Jangan menghapus integrasi yang masih dipakai sebelum pengganti diuji.
