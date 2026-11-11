# MORAJAWS — PHASE 15A.4 REGRESSION TEST REPORT

## 1. Ringkasan Eksekusi Pengujian Otomatis
Seluruh script pengujian yang terdaftar di `package.json` telah dieksekusi secara nyata melalui terminal bash, bukan simulasi atau klaim palsu.

| Script Perintah | Kategori Uji | Jumlah Test | Hasil | Exit Code |
| :--- | :--- | :---: | :---: | :---: |
| `npm run test:phase14c` | Konsistensi Adapter & Skema Database | 15 / 15 | **PASS** (100%) | 0 |
| `npm run test:phase14c.1` | Integrasi 27 Endpoint Inti & RBAC | 66 / 66 | **PASS** (100%) | 0 |
| `npm run test:phase14c.2` | Audit 80 Endpoint Sisa, Fail-Closed & Immutability | 80 / 80 | **PASS** (100%) | 0 |
| **Total Pengujian** | **Semua Endpoint & Keamanan Backend** | **161 / 161** | **PASS** (100%) | **0** |

## 2. Rincian Kategori Test pada Phase 14C.2 (80 Test)
1. **Category 1: Authentication & Sessions (Test 1 - 9)**:
   - Test 1: Bootstrap unauthenticated sanitized response -> **PASS**
   - Test 2: Bootstrap database failure fail-closed (HTTP 503) -> **PASS**
   - Test 3: Supabase login input validation (HTTP 400) -> **PASS**
   - Test 4: Supabase refresh input validation (HTTP 400) -> **PASS**
   - Test 5: Supabase logout unauthenticated rejected (HTTP 401) -> **PASS**
   - Test 6: Supabase logout authenticated revokes session (HTTP 200) -> **PASS**
   - Test 7: Supabase reset password input validation (HTTP 400) -> **PASS**
   - Test 8: Change password short password rejected (HTTP 400) -> **PASS**
   - Test 9: Change password default password rejected (HTTP 400 `CANNOT_USE_DEFAULT_PASSWORD`) -> **PASS**
2. **Category 2: Work Orders & Search (Test 10 - 24)**:
   - Seluruh endpoint pencarian, sameday, bulk delete, purge date, batch date, dan penugasan work order terverifikasi dengan RBAC ketat -> **PASS** (15/15)
3. **Category 3: Sessions & Admin (Test 25 - 38)**:
   - Sesi pengguna, pencabutan token, konfigurasi timeout, download backup admin, dan operational date terproteksi otorisasi Super Admin -> **PASS** (14/14)
4. **Category 4: Google Sheets & Sync (Test 39 - 48)**:
   - Konfigurasi Google Sheets dibatasi Super Admin; sinkronisasi internal dispatch diizinkan; installer dilarang keras -> **PASS** (10/10)
5. **Category 5: Storage & Attachments (Test 49 - 55)**:
   - Validasi MIME executable berbahaya (HTTP 415), verifikasi magic bytes EXE palsu (HTTP 400), isolasi signed URL lintas kontraktor (HTTP 403), dan pembacaan config zero-secrets -> **PASS** (7/7)
6. **Category 6: Supabase Proxy Endpoints (Test 56 - 62)**:
   - Proteksi pengarsipan dan pemulihan WO terproteksi (HTTP 403 `PROTECTED_RECORD`), pembatasan import massal untuk leader (HTTP 403), dan pembatasan reset password -> **PASS** (7/7)
7. **Category 7: Sandbox & Realtime Internal Endpoints (Test 63 - 67)**:
   - Endpoint lab internal SSE Stream, Publish Sandbox, Journal Mutate, dan Chaos Suite terkunci aman (HTTP 403 `FEATURE_DISABLED` & `SANDBOX_DISABLED`) di lingkungan produksi -> **PASS** (5/5)
8. **Category 8: Communication & Audit (Test 68 - 80)**:
   - WhatsApp preview rendering, Audit log role scoping, Audit log HTTP write block (HTTP 405), Chat isolation lintas kontraktor (HTTP 403), Leader read-only chat lock (HTTP 403), Installer progress check-in, dan fail-closed saat DB down -> **PASS** (13/13)

## 3. Hasil Build & Linter
- `npm run build` (`vite build`): **PASS** (dist berhasil dikompilasi).
- `npm run lint` (`tsc --noEmit`): **PASS** (0 error kompilasi TypeScript).
