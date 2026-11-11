# MORAJAWS0 — PHASE 15A.1 IDENTITY MAPPING INTEGRITY REPORT
**Document ID**: MORAJAWS-MAP-PHASE15A1-003  
**Target Subsystem**: Identity & Profile Association (`server/supabaseAuthAdapter.ts`, `server.ts`)  
**Status**: APPROVED & IMPLEMENTED  
**Date**: November 2026  

---

## 1. Executive Summary

Dalam Phase 15A.1, mekanisme penautan identitas antara pengguna Supabase Auth (`auth.users.id`) dan profil staf MoraJaws (`public.users.id`) telah dirombak total dari model otomatis (*auto-linking*) menjadi model terkontrol berbasis persetujuan (*supervised approval*).

Langkah pengerasan ini memastikan bahwa:
1. Tidak ada akun staf yang dapat ditautkan secara sepihak hanya karena kesamaan email.
2. Identitas kanonikal `profile.id` tidak pernah diubah atau diganti oleh `authUserId`.
3. Penautan identitas wajib melalui verifikasi baca ulang (*read-back verification*) ke database PostgreSQL Supabase.
4. Hubungan antara `auth.users.id` dan `public.users.id` dijamin unik 1:1 (*bijective invariant*).

---

## 2. Mengapa Auto-Linking Dihapus?

Pada implementasi awal Phase 15A, `signInWithSupabaseAuth()` menerapkan logika otomatis:
```typescript
// IMPLEMENTASI LAMA (RENTAN & DIHAPUS):
if (!profile.authUserId) {
  await updateAuthUserId(profile.id, authUser.id);
  profile.authUserId = authUser.id;
}
```

### Celah Keamanan yang Timbul:
1. **Risiko Account Takeover (Pembajakan Akun)**:
   Jika seorang pengguna mendaftar akun Supabase Auth dengan email staf yang belum tertaut, login pertama yang berhasil akan langsung mengunci profil staf tersebut ke Auth UID milik pendaftar tanpa validasi manual dari Super Admin.
2. **Ketiadaan Audit Trail**:
   Penautan otomatis terjadi di latar belakang tanpa adanya pencatatan log persetujuan administratif, menyulitkan investigasi keamanan.
3. **Integritas Profil Staf Existing**:
   Staf operasional MoraJaws (Dispatcher, Korlap, Teknisi) memiliki riwayat penugasan WO yang panjang. Penautan otomatis rentan menimbulkan salah sasaran profil jika terdapat typo email pada akun auth baru.

---

## 3. Ketentuan Desain Identitas MoraJaws

### 3.1 Preservasi `profile.id`
`profile.id` (UUID format `00000000-0000-4000-8000-...` atau `USR-...`) adalah primary key kanonikal tabel `users` yang dirujuk oleh puluhan relasi foreign key:
- Tabel `work_orders`: kolom `created_by`, `updated_by`, `assigned_to`
- Tabel `ticket_live_chats`: kolom `sender_id`
- Tabel `audit_logs`: kolom `user_id`
- Tabel `login_logs`: kolom `user_id`
- Tabel `wo_assignment_logs`: kolom `assigned_by`

**Aturan Mutlak**: `profile.id` **TIDAK BOLEH** diubah untuk menyamakan dengan `auth.users.id`. `auth.users.id` disimpan secara terpisah pada kolom `auth_user_id`.

### 3.2 Siklus Hidup Mapping Identitas:
```
[User Login via Supabase Auth]
         │
         ▼
[Ambil Profil Staf berdasarkan Email/Username]
         │
    ┌────┴──────────────────────────┐
    ▼                               ▼
[authUserId sudah ada?]         [authUserId kosong]
    │                               │
    ├─ Cocok dengan Token UID ──► SUKSES (HTTP 200)
    │                               │
    └─ Beda dengan Token UID ──► GAGAL: 403 AUTH_UID_MISMATCH
                                    │
                                    ▼
                         GAGAL: 403 NEEDS_MAPPING
                         (Memerlukan Approval Super Admin)
```

---

## 4. Mekanisme Persetujuan Terkontrol (Controlled Approval)

Untuk menautkan akun staf yang belum memiliki mapping, Phase 15A.1 memperkenalkan fungsi dan endpoint terproteksi:

### 4.1 Fungsi Backend: `approveAuthUidMapping()`
Lokasi: `server/supabaseAuthAdapter.ts`

```typescript
export async function approveAuthUidMapping(params: {
  approverId: string;
  approverRole: string;
  profileId: string;
  authUserId: string;
}): Promise<UserProfile>
```

Validasi yang dijalankan secara ketat:
1. **Otorisasi**: Memverifikasi `approverRole === 'super_admin'`.
2. **Format UUID**: Memvalidasi `profileId` dan `authUserId` sesuai regex UUID v4.
3. **Pemeriksaan Profil**: Memastikan profil ada, berstatus aktif (`isActive === true`), dan tidak dihapus (`deletedAt === null`).
4. **Pemeriksaan Invarian 1:1**:
   - Jika profil sudah memiliki `authUserId` yang berbeda, operasi ditolak (`PROFILE_ALREADY_MAPPED`).
   - Melakukan query ke Supabase untuk memastikan `authUserId` belum pernah digunakan oleh staf lain (`AUTH_UID_ALREADY_ASSIGNED`).
5. **Persistensi Database**:
   Mengirimkan perintah update ke Supabase:
   ```sql
   UPDATE public.users 
   SET auth_user_id = $1, updated_at = NOW() 
   WHERE id = $2;
   ```
6. **Read-Back Verification**:
   Segera setelah update, adapter mengeksekusi query SELECT ulang dari Supabase:
   ```sql
   SELECT id, auth_user_id FROM public.users WHERE id = $1;
   ```
   Jika hasil read-back `auth_user_id !== params.authUserId`, transaksi dibatalkan dengan melempar error `MAPPING_PERSISTENCE_VERIFICATION_FAILED`. Error database tidak pernah ditelan.

### 4.2 Endpoint HTTP: `POST /api/auth/approve-mapping`
Lokasi: `server.ts`

- **Hak Akses**: Terproteksi oleh middleware `requireSuperAdmin`.
- **Request Body**:
  ```json
  {
    "profileId": "00000000-0000-4000-8000-000000000002",
    "authUserId": "e4f5a6b7-c8d9-0123-4567-89abcdef0123"
  }
  ```
- **Respons Sukses (HTTP 200)**:
  Mengembalikan profil staf terverifikasi dengan `authUserId` yang telah terikat permanen dan `profile.id` yang tetap utuh.

---

## 5. Rencana Fase Berikutnya untuk Onboarding Staf

Mekanisme ini menyediakan fondasi yang aman untuk migrasi staf secara bertahap:
1. Admin mendaftarkan akun staf di Supabase Auth (via Dashboard atau Admin API di masa mendatang).
2. Staf belum dapat langsung login sampai Super Admin mengonfirmasi kecocokan profil melalui endpoint approval.
3. Tidak ada modifikasi manual ke database remote tanpa melalui protokol validasi kode.
