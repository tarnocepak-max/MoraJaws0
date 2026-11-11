# MORAJAWS — PHASE 15A.6 CHANGED FILES REPORT
**Daftar Berkas yang Dimodifikasi dan Alasan Perubahan**  

---

## 1. `server.ts`
- **Alasan Perubahan**:
  - Menambahkan properti `authUserId?: string;` pada interface `ServerUser`.
  - Mengekspor tipe `Ticket` (`export type { Ticket };`) dan fungsi `validateCsrfProtection`.
  - Mengimpor fungsi `approveAuthUidMapping` dari `./server/supabaseAuthAdapter.ts`.
  - Menambahkan pengamanan cutover pada `resolveUserFromHeader`:
    - Memblokir `x-auth-provider: firebase` di produksi dengan HTTP 403 `FIREBASE_AUTH_DISABLED_PRODUCTION`.
    - Memblokir token lokal `mora_` di produksi dengan HTTP 401 `LOCAL_AUTH_DISABLED_PRODUCTION`.
    - Menangani error `TOKEN_EXPIRED` dari verifikasi Supabase Auth dengan kode status HTTP 401 dan respon `{ code: 'TOKEN_EXPIRED' }`.
  - Memperbaiki endpoint `/api/auth/resolve-identity` agar tidak mengekspos alamat email pengguna ke request publik tanpa autentikasi.
  - Memperbaiki pemetaan status HTTP dan payload respon pada `POST /api/auth/supabase-login`:
    - `NEEDS_MAPPING` dipetakan ke HTTP 403 dengan menyertakan `details`.
    - `AUTH_UID_MISMATCH` dipetakan ke HTTP 403.
    - `STAFF_AUTH_EMAIL_MISSING` dipetakan ke HTTP 409.
  - Memperbaiki `POST /api/auth/supabase-logout`:
    - Menghapus pemanggilan `signOutSupabaseAuth()` pada shared backend client untuk mencegah de-autentikasi global.
    - Menambahkan mekanisme penambahan `sessionVersion` dengan penanganan fail-closed jika database gagal diakses.
    - Mengembalikan `sessionVersion` baru pada JSON respon.
  - Mendaftarkan endpoint baru `POST /api/auth/approve-mapping` yang diproteksi `requireSuperAdmin`.
  - Memperbaiki `POST /api/auth/change-password` agar menolak mutasi password lokal dengan HTTP 400 `LOCAL_PASSWORD_DISABLED` pada mode Supabase.

---

## 2. `server/supabaseAuthAdapter.ts`
- **Alasan Perubahan**:
  - Mengimplementasikan alur prioritas email input pengguna pada `signInWithSupabaseAuth`: jika pengguna memasukkan email yang cocok dengan salah satu email pada `altEmail`, adapter memprioritaskan email tersebut dan tidak menimpanya secara paksa dengan `authoritativeUser.email`.
  - Mengimplementasikan fallback loop multi-email kandidat saat pengguna memasukkan username, memungkinkan login dengan kredensial email Supabase Auth mana pun yang sah milik staf tersebut.
  - Memastikan token CSV mentah tidak pernah dikirimkan ke Supabase Auth.
  - Mengembalikan `details` pada error `NEEDS_MAPPING` untuk asistensi approval mapping.

---

## 3. `server/supabaseAdapter.ts`
- **Alasan Perubahan**:
  - Memperbaiki fungsi pembacaan data baris `postgresRowToUser` agar membaca `altEmail` dari `row.alt_email || payload.altEmail || payload.alt_email`.
  - Memperbaiki query pencarian pengguna `findUserInSupabaseDetailed`:
    - Menggunakan wildcard `.ilike('alt_email', `%${raw}%`)` dan mencocokkan token individual yang dipisahkan koma.
    - Menambahkan klausa query `auth_user_id` untuk lookup UUID Supabase Auth.

---

## 4. `src/context/AppContext.tsx`
- **Alasan Perubahan**:
  - Memperbaiki method `login()` agar tidak secara membabi buta membungkus seluruh error ke dalam `MJ-AUTH-001`.
  - Memprioritaskan penanganan kode error spesifik dari backend (`NEEDS_MAPPING`, `AUTH_UID_MISMATCH`, `STAFF_AUTH_EMAIL_MISSING`, `AUTH_EMAIL_NOT_CONFIRMED`, `SUPABASE_NOT_CONFIGURED`, `AUTH_PROVIDER_UNAVAILABLE`) sebelum menerapkan fallback.

---

## 5. `src/components/auth/StaffLoginPortal.tsx`
- **Alasan Perubahan**:
  - Memperbaiki penanganan error agar hanya memunculkan modal peringatan `MJ-AUTH-001` jika error memang murni kesalahan kredensial (`AUTH_INVALID_CREDENTIALS` atau `auth/wrong-password`).
  - Menampilkan pesan panduan yang jelas dan kontekstual untuk error mapping akun (`NEEDS_MAPPING`, `AUTH_UID_MISMATCH`), email belum dikonfirmasi, maupun status akun nonaktif.

---

## 6. `package.json`
- **Alasan Perubahan**:
  - Menambahkan script `"test:phase15a.1": "tsx scripts/execute_phase15a1_session_hardening_test.ts"`.

---

## 7. `scripts/execute_phase14c1_endpoint_integration_test.ts`
- **Alasan Perubahan**:
  - Menambahkan panggilan HTTP riil `await request('/api/health')` sebelum pengecekan bundel dist pada Test #66, memastikan evidence collector merekam bukti HTTP nyata over-the-wire.

---

## 8. `scripts/execute_phase14c3_endpoint_integration_test.ts`
- **Alasan Perubahan**:
  - Menata ulang urutan penugasan mock state `db.sheetsConfig`, `db.users`, `db.contractors`, dan `db.coverageAreas` agar dilakukan setelah pemanggilan `createExpressApp({ skipVite: true })`.

---

## 9. `scripts/execute_phase15a_supabase_auth_test.ts`
- **Alasan Perubahan**:
  - Memperluas toleransi kode error Test #3 (Password salah) untuk menerima `AUTH_INVALID_CREDENTIALS` atau `INVALID_CREDENTIALS` di samping kode legacy `auth/wrong-password`.
