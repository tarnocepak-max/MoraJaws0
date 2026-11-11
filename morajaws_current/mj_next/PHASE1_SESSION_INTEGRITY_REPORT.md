# MoraJaws Phase 1 Session Integrity Report: PostgreSQL-Authoritative Session Lifecycle

**Date:** 2026-11-10  
**Target Architecture:** Supabase PostgreSQL (`public.users`, `public.auth_sessions`, `public.refresh_tokens`)  
**Engine:** `server/customAuthService.ts`  
**Security Level:** Zero-Trust Server Authoritative, Cryptographic Token Hashing, Anti-Replay Rotation  

---

## 1. Arsitektur Integritas Sesi Tiga Lapis (Three-Tier Integrity)

Integritas sesi MoraJaws Fase 1 dirancang dengan sinkronisasi ketat antara tiga entitas basis data:

```
+-------------------------------------------------------------+
|                        public.users                         |
|  - id (text, PK)                                            |
|  - session_version (integer, authoritative counter)         |
|  - password_hash (text, bcrypt / PBKDF2 upgrade)            |
|  - account_status (text: active | locked | inactive)        |
+-------------------------------------------------------------+
                               |
               +---------------+---------------+
               |                               | 1:N
               v                               v
+-------------------------------+   +-------------------------------+
|     public.auth_sessions      |   |     public.refresh_tokens     |
| - id (text, PK)               |   | - id (text, PK)               |
| - user_id (text, FK)          |   | - user_id (text, FK)          |
| - session_id_hash (SHA-256)   |   | - session_id (text, FK)       |
| - token_hash (SHA-256)        |   | - token_hash (SHA-256, UNIQUE)|
| - session_version (integer)   |   | - session_version (integer)   |
| - expires_at (timestamptz)    |   | - expires_at (timestamptz)    |
| - revoked_at (timestamptz)    |   | - revoked_at (timestamptz)    |
| - last_activity_at (tstz)     |   | - replaced_by_token_hash (hex)|
+-------------------------------+   +-------------------------------+
```

### 1.1. Invarian Sesi (Session Invariants)
1. **Authoritative Master Stamp:** Nilai `public.users.session_version` adalah sumber kebenaran tunggal (*authoritative source of truth*). Setiap kali sesi diterbitkan, nilai versi ini disematkan pada token, record `auth_sessions`, dan record `refresh_tokens`.
2. **Kriptografi Token:**
   - **Access Token:** Format `mora_at_v{version}_{crypto.randomBytes(32).toString('hex')}` (256-bit entropy).
   - **Refresh Token:** Format `mora_rt_v{version}_{crypto.randomBytes(48).toString('hex')}` (384-bit entropy).
3. **Penyimpanan Berbasis Hash (Blind Indexing):**
   - Nilai token mentah (`raw token`) **tidak pernah disimpan di database**.
   - Kolom `session_id_hash` dan `token_hash` menyimpan nilai `crypto.createHash('sha256').update(token.trim()).digest('hex')`.
   - Pencurian database tidak akan mengekspos token sesi aktif.

---

## 2. Siklus Hidup Sesi (Session Lifecycle)

### 2.1. Alur Penerbitan Sesi (Login Flow)
1. **Identifikasi Pengguna:** Pengguna dicari di `public.users` via `findUserInSupabaseDetailed(identifier)`.
2. **Verifikasi Kredensial:** Kata sandi diverifikasi via `verifyUserPasswordEx()`. Jika cocok menggunakan format warisan PBKDF2, secara otomatis di-upgrade ke hash bcrypt (10 rounds).
3. **Pembuatan Token:** Dibuat token akses dan refresh token baru dengan versi `currentVersion = users.session_version`.
4. **Penyimpanan Transaksional Atomik (`persistNewAuthSession`):**
   - Masukkan record sesi ke `public.auth_sessions` dengan `session_version = currentVersion`.
   - Masukkan record token ke `public.refresh_tokens` dengan `session_version = currentVersion`.
   - **Kompensasi Atomik:** Jika insert ke `refresh_tokens` gagal, sistem mengeksekusi penghapusan kompensasi (`DELETE FROM auth_sessions WHERE id = sessionId`), membatalkan seluruh proses login, dan mengembalikan error tanpa membocorkan sesi.

### 2.2. Alur Validasi Sesi (`verifyAccessToken`)
Setiap kali permintaan HTTP masuk dengan header `Authorization: Bearer <token>`:
1. Hitung SHA-256 hash dari token masuk: `tokenHash = hashToken(token)`.
2. Cari sesi aktif di `public.auth_sessions` (`session_id_hash = tokenHash OR token_hash = tokenHash`).
3. Evaluasi Penolakan Sesi:
   - Jika record sesi tidak ditemukan -> tolak dengan `SESSION_NOT_FOUND` (401).
   - Jika `revoked_at` IS NOT NULL -> tolak dengan `SESSION_REVOKED` (401).
   - Jika `expires_at < now()` -> tolak dengan `TOKEN_EXPIRED` (401).
4. Ambil record pengguna authoritative dari `public.users`.
   - Jika `is_deleted = true` -> cabut sesi di DB, tolak dengan `ACCOUNT_DELETED` (403).
   - Jika `active = false` atau `account_status <> 'active'` -> cabut sesi di DB, tolak dengan `ACCOUNT_DISABLED` (403).
5. **Verifikasi Versi Sesi (Session Version Enforcement):**
   - Bandingkan versi pada token (`mora_at_v{v}_...`) dan versi pada `auth_sessions.session_version` dengan `users.session_version`.
   - Jika terdapat perbedaan nilai versi, sesi seketika ditandai `revoked_at = now()` di PostgreSQL dan ditolak dengan `SESSION_REVOKED`.
6. Jika seluruh kriteria terpenuhi: perbarui `last_activity_at = now()` di PostgreSQL dan izinkan permintaan.

---

## 3. Protokol Rotasi Refresh Token (Anti-Replay Mechanism)

Rotasi refresh token pada `rotateRefreshToken()` menerapkan proteksi anti-replay mutlak:

```
[Klien Mengirim Refresh Token RT_1]
               |
               v
   Cari di public.refresh_tokens WHERE token_hash = hash(RT_1)
               |
       +-------+-------+
       |               |
 [revoked_at != NULL] [revoked_at == NULL]
       |               |
       v               v
 REPLAY TERDETEKSI!  Periksa Expiry & session_version
 Tolak seketika        |
 (REFRESH_REVOKED)     +---> Buat RT_2 & AT_2 (versi terbaru)
                             |
                             +---> Langkah A: Update RT_1 set revoked_at = now, 
                             |                replaced_by_token_hash = hash(RT_2)
                             |
                             +---> Langkah B: Insert RT_2 ke refresh_tokens
                             |                (Jika gagal -> Rollback Langkah A)
                             |
                             +---> Langkah C: Update auth_sessions dengan hash AT_2
                                              (Jika gagal -> Rollback Langkah B & A)
```

Jika terjadi upaya penggunaan kembali (*replay attack*) terhadap token yang telah dirotasi (`RT_1`), basis data langsung mendeteksinya karena `revoked_at` telah terisi, dan menolak permintaan tanpa menerbitkan token baru.

---

## 4. Mekanisme Pencabutan Masal (Revocation & Password Reset)

Ketika pengguna melakukan **Pergantian Kata Sandi Mandiri**, **Reset Kata Sandi oleh Superadmin**, atau Superadmin mengeksekusi **Revoke Sessions**:

1. **Kenaikan Versi Sesi Pengguna:**
   ```sql
   UPDATE public.users
   SET session_version = session_version + 1,
       updated_at = now()
   WHERE id = $user_id;
   ```
2. **Pencabutan Seluruh Sesi Aktif:**
   ```sql
   UPDATE public.auth_sessions
   SET revoked_at = now()
   WHERE user_id = $user_id AND revoked_at IS NULL;
   ```
3. **Pencabutan Seluruh Refresh Token Aktif:**
   ```sql
   UPDATE public.refresh_tokens
   SET revoked_at = now()
   WHERE user_id = $user_id AND revoked_at IS NULL;
   ```
4. **Dampak Langsung:**
   - Semua token lama (pada perangkat mana pun) langsung gagal pada validasi berikutnya karena `session_version` pada token tidak lagi cocok dengan `users.session_version`, dan record sesi telah berstatus `revoked_at`.
   - Klien dipaksa melakukan login ulang menggunakan kredensial baru.

---

## 5. Ringkasan Keamanan Phase 1

- **Penyimpanan Token:** Kriptografis SHA-256 (Raw token nihil di basis data).
- **Fail-Closed Mode Produksi:** Ditegakkan 100% tanpa fallback lokal `LOCAL_AUTH_SESSIONS`.
- **Konsistensi Transaksional:** Kompensasi atomik menjamin tidak ada sesi yatim (*orphaned sessions*).
- **Proteksi Replay:** Refresh token satu kali pakai dengan rantai pencatatan `replaced_by_token_hash`.
