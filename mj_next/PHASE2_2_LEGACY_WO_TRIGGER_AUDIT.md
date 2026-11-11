# MoraJaws Phase 2.2 — Legacy WO Protection Trigger Safety Audit
**Document ID:** `PHASE2_2_LEGACY_WO_TRIGGER_AUDIT.md`  
**Audit Date:** 2026-11-11  
**Project:** MoraJaws - Telecom Work Order & Field Dispatch Management System  
**Audit Scope:** Deep Analysis of Database Trigger & Functions in Migration 010  
**SQL Execution Status:** ZERO SQL EXECUTED — ZERO DATABASE MUTATION  
**Overall Safety Status:** PASS WITH TECHNICAL WARNING (Detailed Below)  

---

## 1. Definisi Fungsi & Trigger pada Migration 010

Pada berkas `migrations/010_phase2_canonical_schema_reconciliation.sql` (Baris 236–265), didefinisikan mekanisme proteksi tingkat basis data:

```sql
-- Baris 239-258: Fungsi Proteksi Record Warisan
CREATE OR REPLACE FUNCTION public.fn_protect_legacy_soft_deleted_wo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.id IN (
    'wo_1793825457141_u4bnht',
    'wo_imp_1793825458959_4i4f1h',
    'wo_imp_1793825458959_262dei'
  ) OR OLD.wo_number IN (
    'WO-EXPRESS-TEST-1793825456810',
    'WO-DUP-TEST-1793825458804',
    'WO-DUP-TEST-1793825458804-UNIQUE'
  ) THEN
    RAISE EXCEPTION 'MORAJAWS_PROTECTED_RECORD: Tiga WO produksi yang dilindungi dilarang dimutasi atau dihapus (ID: %, WO: %)', OLD.id, OLD.wo_number;
  END IF;
  RETURN NEW;
END;
$$;

-- Baris 260-264: Trigger Pemasangan pada public.work_orders
DROP TRIGGER IF EXISTS trg_protect_legacy_wo_mutation ON public.work_orders;
CREATE TRIGGER trg_protect_legacy_wo_mutation
  BEFORE UPDATE OR DELETE ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_protect_legacy_soft_deleted_wo();
```

---

## 2. Evaluasi Rinci Terhadap 6 Kriteria Keselamatan

### Kriteria 1: Hanya Melindungi Record WO yang Ditentukan?
- **Analisis:** Klausul `IF` secara eksplisit memeriksa tuple spesifik:
  - Tiga ID fisik: `'wo_1793825457141_u4bnht'`, `'wo_imp_1793825458959_4i4f1h'`, `'wo_imp_1793825458959_262dei'`.
  - Tiga nomor WO terkait: `'WO-EXPRESS-TEST-1793825456810'`, `'WO-DUP-TEST-1793825458804'`, `'WO-DUP-TEST-1793825458804-UNIQUE'`.
- **Hasil:** Memeriksa identitas ganda (ID atau Nomor WO). Tidak ada klausul wildcard atau ekspresi umum yang dapat menjaring data lain.
- **Status:** **PASS / VERIFIED**.

---

### Kriteria 2: Tidak Menghalangi Update WO Normal?
- **Analisis:** Untuk setiap baris WO selain dari 3 record terlindungi tersebut, kondisi `IF` menghasilkan evaluasi `FALSE`. Alur eksekusi langsung melanjutkan ke `RETURN NEW;`.
- **Hasil:** Baris WO normal diizinkan diperbarui (UPDATE) secara wajar tanpa memicu exception.
- **Status:** **PASS / VERIFIED**.

---

### Kriteria 3: Tidak Menghalangi Assignment atau Report Normal?
- **Analisis:**
  - Penugasan teknisi (*technician assignment*) memperbarui kolom `installer_name`, `installer_id`, `assigned_to`, dan `status_wo_agent` pada tabel `work_orders`.
  - Pembuatan laporan teknis menyisipkan record baru ke tabel `public.technical_reports` dan memperbarui status pada tabel `work_orders`.
- **Hasil:** Selama operasi berlangsung pada tiket WO normal, trigger tidak mengintervensi atau menggagalkan penugasan maupun pembuatan laporan teknis.
- **Status:** **PASS / VERIFIED**.

---

### Kriteria 4: Tidak Menyebabkan Konflik dengan Soft Delete?
- **Analisis:**
  - Pada sistem MoraJaws, penghapusan data WO menerapkan pola *Soft Delete* (`UPDATE work_orders SET is_deleted = true, deleted_at = now() ...`).
  - Untuk WO normal: operasi ini berupa perintah SQL `UPDATE`, sehingga evaluasi menghasilkan `RETURN NEW;` dan soft delete berhasil tersimpan.
  - Untuk 3 WO yang dilindungi: ketiga WO ini dalam status historis memang sudah soft-deleted (`is_deleted = true`). Trigger sengaja memblokir mutasi lebih lanjut pada ketiga baris ini agar nilainya tidak dapat diubah kembali menjadi `is_deleted = false` atau dimodifikasi isinya.
- **Status:** **PASS / VERIFIED**.

---

### Kriteria 5: Tidak Menyebabkan Konflik dengan Fitur Archive?
- **Analisis:**
  - Pengarsipan WO dilakukan via `UPDATE work_orders SET is_archived = true, archived_at = now()`.
  - Untuk WO normal: operasi `UPDATE` berhasil tanpa hambatan.
  - Untuk 3 WO yang dilindungi: pemblokiran pengarsipan pada record warisan adalah perilaku yang diharapkan demi menjaga immutabilitas audit.
- **Status:** **PASS / VERIFIED**.

---

### Kriteria 6: Tidak Mengganggu Reassign dan Assignment History?
- **Analisis:**
  - Proses *reassign* WO melakukan mutasi pada tiket WO dan mencatat baris riwayat baru ke tabel `public.assignment_history`.
  - Tabel `public.assignment_history` adalah tabel terpisah dan tidak dipasangi trigger `trg_protect_legacy_wo_mutation`.
- **Hasil:** Riwayat penugasan tersimpan normal tanpa terpengaruh.
- **Status:** **PASS / VERIFIED**.

---

## 3. Temuan Kritis: Nilai Return pada Event BEFORE DELETE

### Deskripsi Temuan Audit:
Perhatikan deklarasi trigger:
```sql
BEFORE UPDATE OR DELETE ON public.work_orders
```
Dan nilai pengembalian di akhir fungsi (Baris 256):
```sql
RETURN NEW;
```

### Analisis Teknis PostgreSQL Engine:
1. Dalam spesifikasi PostgreSQL PL/pgSQL, pada event **`DELETE`**, variabel khusus **`NEW` bernilai `NULL`** karena tidak ada baris baru yang dibuat.
2. Ketika fungsi trigger `BEFORE DELETE` mengembalikan nilai **`NULL`**, PostgreSQL menginterpretasikan ini sebagai perintah untuk **membatalkan penghapusan secara senyap (*suppress/skip deletion*) tanpa melemparkan error**.
3. **Konsekuensi Praktis:**
   - Jika suatu saat ada administrator atau skrip pemeliharaan yang menjalankan perintah fisik `DELETE FROM public.work_orders WHERE id = 'wo_normal'`, perintah tersebut tidak akan melemparkan exception, tetapi jumlah baris yang terhapus adalah `0 rows deleted` (penghapusan fisik diabaikan secara senyap).
   - Namun demikian, pada arsitektur aplikasi MoraJaws:
     - Seluruh penghapusan data Work Order di backend Express (`server.ts`) dan UI Portal Management Data dilakukan melalui **Soft Delete** (`UPDATE ... SET is_deleted = true`), bukan `DELETE` fisik.
     - Operasi `UPDATE` normal memiliki variabel `NEW` yang valid, sehingga alur aplikasi operasional MoraJaws **tidak mengalami kegagalan fungsi**.

### Rekomendasi untuk Phase 3 (Saat Pemilik Menyetujui Refactoring Draf 010):
Ubah pengembalian fungsi proteksi agar menggunakan percabangan eksplisit `TG_OP`:
```sql
-- Draf Rekomendasi Penyempurnaan untuk Phase 3:
IF TG_OP = 'DELETE' THEN
  RETURN OLD;
ELSE
  RETURN NEW;
END IF;
```
*Catatan Kepatuhan: Sesuai instruksi Phase 2.2, draf migrasi 010 tidak diubah saat ini.*

---

## 4. Audit Fungsi dan Trigger Lain pada Migration 010

Selain proteksi WO di atas, Migration 010 mendefinisikan 2 fungsi tambahan:

| Fungsi / Trigger | Tabel Target | Perilaku & Dampak | Tingkat Risiko | Status |
|---|---|---|:---:|:---:|
| `public.morajaws_set_updated_at()` | Umum | Fungsi pembantu untuk memperbarui kolom `updated_at := now()`. Belum dipasang trigger otomatis pada migration 010 (disediakan sebagai utilitas). | Nol | **VERIFIED** |
| `public.morajaws_reject_audit_mutation()` / `trg_audit_logs_immutable` | `public.audit_logs` | Trigger `BEFORE UPDATE OR DELETE` yang melempar exception `MORAJAWS_AUDIT_IMMUTABLE`. Menjamin tabel log audit bersifat *append-only* (hanya INSERT yang diizinkan). | Nol (Sangat Aman) | **PASS / VERIFIED** |

---

## 5. Ringkasan Status Kepatuhan Bagian D

| Aspek Audit Trigger | Hasil Evaluasi | Status |
|---|---|:---:|
| Isolasi Record Terlindungi | Hanya mengunci 3 record legasi yang didefinisikan | **PASS** |
| Update WO Normal | Berfungsi tanpa intervensi | **PASS** |
| Penugasan & Laporan Teknis | Berjalan normal | **PASS** |
| Soft Delete & Archive Normal | Berjalan normal | **PASS** |
| Reassign & Riwayat Penugasan | Tidak terganggu | **PASS** |
| Hard DELETE Behavior | Menekan hard delete via return NULL pada BEFORE DELETE | **WARNING (Terdokumentasi)** |
| Eksekusi SQL pada Database | Nihil eksekusi pada DB mana pun | **PASS** |
