# MoraJaws — Alur Konfigurasi & Uji Upload WO ke Supabase

## Tujuan
Memastikan upload Work Order (WO) baru benar-benar tersimpan di Supabase PostgreSQL dan UI hanya menampilkan hasil import setelah write ke Supabase berhasil.

## Arsitektur yang diwajibkan
Browser/UI -> Internal MoraJaws Auth -> Express Backend -> Supabase PostgreSQL

Supabase adalah Single Source of Truth. Browser localStorage/IndexedDB tidak boleh menjadi sumber permanen WO.

## Environment backend
Isi environment variable di backend/deployment, bukan di frontend:

- SUPABASE_URL=https://<project-ref>.supabase.co
- SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

Jangan commit nilai sebenarnya ke Git dan jangan expose service role key ke browser.

Frontend hanya menggunakan session/token internal MoraJaws dan memanggil endpoint `/api/supabase/*`.

## Urutan uji WO demo
1. Jalankan backend MoraJaws.
2. Pastikan backend berhasil membuat Supabase client.
3. Login dengan Super Admin atau Dispatch.
4. Buka Import Data WO.
5. Upload `BASE_DATA_WO.xlsx` atau file demo dengan 1–5 WO.
6. Jalankan Parse.
7. Periksa mapping header dan preview.
8. Pastikan nomor WO tidak kosong.
9. Pastikan tidak ada duplicate dalam file.
10. Klik Import/Confirm.
11. Backend melakukan duplicate check ke `work_orders` Supabase.
12. Backend melakukan INSERT batch ke `work_orders`.
13. Hanya setelah response sukses, UI meng-update state lokal.
14. Refresh browser.
15. WO harus tetap ada karena dibaca kembali dari Supabase.
16. Buka Supabase Table Editor dan verifikasi row yang sama.

## Uji duplicate
Upload kembali WO Number yang sama.

Expected:
- Tidak membuat row kedua.
- UI melaporkan duplicate.
- Tidak ada data dummy/local fallback.

## Uji failure
Matikan/ubah koneksi Supabase secara aman di environment staging.

Expected:
- Import gagal.
- UI tidak menampilkan WO sebagai berhasil tersimpan.
- State tidak di-hydrate dengan data import yang gagal.
- Error ditampilkan secara jelas.

## Uji persistence
Setelah import sukses:
- refresh halaman;
- logout/login;
- buka halaman WO lagi.

Expected: WO tetap tersedia dari Supabase.

## Uji permission
- Installer: tidak boleh import.
- Leader: tidak boleh import.
- Dispatch: boleh import sesuai permission.
- Superadmin: boleh import.

## Catatan penting
Endpoint legacy `/api/tickets/bulk-import` tidak boleh digunakan sebagai jalur persistence WO. Jalur resmi adalah `/api/supabase/work-orders/bulk-import`.
