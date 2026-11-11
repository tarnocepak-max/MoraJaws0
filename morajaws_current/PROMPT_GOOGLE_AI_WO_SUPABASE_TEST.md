# PROMPT GOOGLE AI — MoraJaws WO Import Supabase-Only

Anda adalah senior full-stack engineer yang melanjutkan source code MoraJaws yang sudah ada. Jangan rebuild aplikasi dan jangan mengganti framework, UI, internal authentication, atau arsitektur utama.

## Tujuan
Perbaiki dan verifikasi alur Import Work Order agar benar-benar menggunakan Supabase PostgreSQL sebagai Single Source of Truth.

## Aturan wajib
1. Pertahankan internal authentication MoraJaws. Jangan gunakan Supabase Auth.
2. Jangan gunakan localStorage, sessionStorage, IndexedDB, JSON file, mock data, Firestore, atau endpoint legacy sebagai persistence WO production.
3. Browser hanya memanggil backend MoraJaws.
4. Backend melakukan operasi sensitif ke Supabase menggunakan credential server-side.
5. `SUPABASE_SERVICE_ROLE_KEY` tidak boleh masuk bundle frontend.
6. Jangan membuat credential palsu.
7. Jangan menghapus data production.
8. Jangan mengubah template resmi WO.

## Flow target
Upload file -> Parse -> Header mapping -> Validation -> Duplicate check -> Preview -> Confirm -> Backend authenticated request -> Supabase duplicate check -> Supabase PostgreSQL INSERT -> verify response -> update React state -> success toast.

Jika INSERT Supabase gagal, jangan update state UI dan jangan tampilkan pesan sukses.

## File yang wajib diperiksa
- `src/context/AppContext.tsx`
- `src/components/textToTable/TextToTableImporter.tsx`
- `src/services/supabaseDb.ts`
- `src/services/firestoreDb.ts` hanya sebagai compatibility layer; jangan menjadikan Firestore database.
- `server/supabaseAdapter.ts`
- route backend untuk `/api/supabase/work-orders/bulk-import`
- database migrations yang mendefinisikan `work_orders`
- environment configuration

## Implementasi yang diharapkan
- `bulkImportTickets()` harus async.
- Persistence harus selesai sebelum `setTickets()` untuk data import dijalankan.
- Gunakan `/api/supabase/work-orders/bulk-import` sebagai jalur resmi.
- Hapus/stop penggunaan `/api/tickets/bulk-import` untuk import WO production.
- Duplicate WO harus ditolak berdasarkan data Supabase dan unique constraint database.
- Response import harus membedakan imported, duplicate, invalid, failed.
- UI hanya menampilkan success jika backend mengembalikan success yang benar.
- Tambahkan loading state selama import.
- Tambahkan error state yang tidak menampilkan data dummy.

## Acceptance test
1. Import 1 WO baru -> row muncul di Supabase.
2. Refresh -> WO tetap muncul.
3. Logout/login -> WO tetap muncul.
4. Import WO yang sama -> duplicate ditolak.
5. Import file dengan duplicate internal -> duplicate ditolak.
6. Import WO invalid -> invalid row dilaporkan.
7. Simulasikan Supabase failure -> UI tidak menganggap sukses dan tidak meng-hydrate data gagal.
8. Installer/Leader tidak boleh import.
9. Dispatch/Superadmin dapat import sesuai permission.
10. Tidak ada service role key di frontend build.

## Output
Berikan:
- file yang diubah;
- alasan perubahan;
- diff penting;
- hasil test yang benar-benar dijalankan;
- PASS/FAIL/BLOCKED;
- jangan mengklaim test yang tidak dijalankan.
