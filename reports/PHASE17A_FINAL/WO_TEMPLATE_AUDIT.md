# MORAJAWS — WORK ORDER TEMPLATE & ASSET PARITY AUDIT
## Physical Spreadsheet Inventory, Schema Aliases, and Template Mapping Engine

**Document ID:** MORAJAWS-PHASE17A-TMPL-001  
**Audit Date:** 2025-02-17  
**Scope:** `public/templates/`, `src/services/woFieldMappingEngine.ts`, and Importer Components  

---

### 1. Physical Template Assets Inventory

Inspection of the `public/templates/` directory in the repository:
```text
/public/templates/
├── data_wo_20261028.xlsx       (Size: 42,476 bytes)
└── template_wo_korlap.xlsx     (Size: 11,830 bytes)
```

#### Discrepancy & Gap Analysis:
The system requirements and user instructions reference five standard templates:
1. `BASE_DATA_WO.xlsx`
2. `INSTALLER_WO.xlsx`
3. `ASSIGNED_TEKNISI.xlsx`
4. `template_wo_korlap.xlsx` (Present)
5. `data_wo_20261028.xlsx` (Present)

**Finding:**
`BASE_DATA_WO.xlsx`, `INSTALLER_WO.xlsx`, and `ASSIGNED_TEKNISI.xlsx` **do not exist as physical binary `.xlsx` files** in `/public/templates/`.
However:
- Their complete column schemas, canonical field mappings, sample values, and auto-generation algorithms **are fully codified** in TypeScript within `src/services/woFieldMappingEngine.ts` and `src/components/textToTable/TextToTableImporter.tsx`.
- The frontend includes in-browser template generators that allow users to download valid `.xlsx` templates on demand using the `xlsx` (SheetJS) library.

---

### 2. Codified Template Definitions in `woFieldMappingEngine.ts`

#### A. Preset: `BASE_DATA_WO`
- **Purpose:** Full master Work Order data from dispatch or external CRM.
- **Header Columns:**
  `NO_WO`, `NO_TIKET`, `NAMA_PELANGGAN`, `NO_TELP`, `ALAMAT`, `CLUSTER`, `KODE_FAT`, `PORT_FAT`, `SLOT_PORT`, `PAKET`, `TANGGAL_JANJI`, `SLOT_WAKTU`, `KONTRAKTOR`, `AREA_COVERAGE`
- **Canonical Mapping:**
  - `NO_WO` -> `wo_number` (Required)
  - `NAMA_PELANGGAN` -> `customer_name` (Required)
  - `ALAMAT` -> `address` (Required)
  - `NO_TELP` -> `customer_phone`
  - `KODE_FAT` -> `fat_code`
  - `PORT_FAT` -> `fat_port`

#### B. Preset: `INSTALLER_WO`
- **Purpose:** Field technician assignment and execution tracking.
- **Header Columns:**
  `ID_WO`, `NO_WO`, `NAMA_PELANGGAN`, `ALAMAT`, `TEKNISI`, `STATUS`, `KETERANGAN`, `SN_MODEM`, `SN_STB`
- **Canonical Mapping:**
  - `NO_WO` -> `wo_number`
  - `TEKNISI` -> `assigned_technician_name`
  - `STATUS` -> `status`
  - `SN_MODEM` -> `modem_sn`

#### C. Preset: `ASSIGNED_TEKNISI`
- **Purpose:** Team Leader / Korlap dispatch schedule.
- **Header Columns:**
  `NO_WO`, `ID_TEKNISI`, `NAMA_TEKNISI`, `ID_LEADER`, `NAMA_LEADER`, `AREA`, `TANGGAL_TUGAS`
- **Canonical Mapping:**
  - `NO_WO` -> `wo_number`
  - `ID_TEKNISI` -> `assigned_technician_id`
  - `NAMA_TEKNISI` -> `assigned_technician_name`
  - `ID_LEADER` -> `assigned_leader_id`

#### D. Preset: `template_wo_korlap.xlsx` (Physical File)
- **Sheet Name:** `Sheet1`
- **Columns:** Standard Indonesian dispatch header format matching Korlap field workflows.

---

### 3. Normalization & Fuzzy Alias Heuristics

The engine `woFieldMappingEngine.ts` resolves common human naming variations automatically:
- `wo_number` matches: `['no wo', 'nomor wo', 'wo #', 'work order', 'wo_number', 'nowo', 'no.wo']`
- `customer_name` matches: `['nama', 'nama pelanggan', 'customer', 'customer name', 'nama cust']`
- `customer_phone` matches: `['no telp', 'no hp', 'telepon', 'phone', 'contact', 'no handphone']`
- `address` matches: `['alamat', 'address', 'alamat pelanggan', 'lokasi']`
- `fat_code` matches: `['fat', 'kode fat', 'fat code', 'id fat', 'odp']`

---

### 4. Parity Action Items for Phase 17B
1. **Binary Asset Generation:** To eliminate user confusion between code definitions and physical download links, Phase 17B should generate physical binary `.xlsx` files for `BASE_DATA_WO.xlsx`, `INSTALLER_WO.xlsx`, and `ASSIGNED_TEKNISI.xlsx` and place them directly in `/public/templates/`.
2. **Template Validation Test:** Add automated test script to parse the physical files and ensure 100% round-trip compatibility with the import engine.
