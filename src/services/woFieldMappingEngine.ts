import {
  CanonicalFieldConfig,
  Ticket,
  Contractor,
  CoverageArea,
  ParsedRowData,
  TextToTableResult,
  UserRole,
  WODistributionStatus,
  DetectedImportContractor,
  WOAssignmentHistory
} from '../types/index.ts';
import * as XLSX from 'xlsx';
import { parseAppointmentDate, formatAppointmentDateDisplay, DateParseResult } from './appointmentDateParser.ts';

/**
 * 46 Master Canonical Field Definitions covering BASE_DATA_WO (46 columns baseline)
 * and operational files such as data_wo_20261018.xlsx (45 columns).
 */
export const MASTER_CANONICAL_FIELDS: CanonicalFieldConfig[] = [
  // --- A. Core Identification & Work Order ---
  {
    canonicalField: 'workOrderNumber',
    displayLabel: 'WO Number',
    aliases: ['wo number', 'no wo', 'nomor wo', 'work order number', 'wonumber', 'no. wo', 'wo_number', 'wo id'],
    dataType: 'string',
    category: 'core',
    required: true,
    validationRules: ['required', 'unique_wo_number', 'official_wo_format'],
    sourceMapping: 'WO Number',
    normalizationRules: 'uppercase_trim',
    displayOrder: 1,
    visible: true,
    editableByRoles: ['super_admin']
  },
  {
    canonicalField: 'ticketNumber',
    displayLabel: 'Ticket Number',
    aliases: ['ticket number', 'ticket id', 'no ticket', 'nomor tiket', 'ticket_number', 'tck number'],
    dataType: 'string',
    category: 'core',
    required: false,
    validationRules: ['alphanumeric_or_empty'],
    sourceMapping: 'Ticket Number',
    normalizationRules: 'uppercase_trim',
    displayOrder: 2,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },
  {
    canonicalField: 'ticketDate',
    displayLabel: 'Date Report Agent',
    aliases: ['ticket date', 'date report agent', 'report date agent', 'tgl lapor agent'],
    dataType: 'date',
    category: 'metadata',
    required: false,
    validationRules: ['iso_or_slash_date'],
    sourceMapping: 'Date Report Agent',
    normalizationRules: 'normalize_date_iso',
    displayOrder: 3,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },
  {
    canonicalField: 'initialTicketCategory',
    displayLabel: 'Ticket Category',
    aliases: ['ticket category', 'kategori tiket', 'category', 'jenis tiket', 'jenis wo', 'tipe wo', 'tipe tiket', 'ticket_category'],
    dataType: 'string',
    category: 'core',
    required: false,
    validationRules: ['standard_category'],
    sourceMapping: 'Ticket Category',
    normalizationRules: 'trim',
    displayOrder: 4,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },
  {
    canonicalField: 'date',
    displayLabel: 'Date (Metadata)',
    aliases: ['date', 'tanggal', 'tgl'],
    dataType: 'date',
    category: 'metadata',
    required: false,
    validationRules: ['iso_or_slash_date'],
    sourceMapping: 'Date',
    normalizationRules: 'normalize_date_iso',
    displayOrder: 5,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },
  {
    canonicalField: 'appointmentDate',
    displayLabel: 'Appointment Date',
    aliases: ['appointment date', 'tgl appointment', 'tanggal janji', 'visit date', 'schedule date'],
    dataType: 'date',
    category: 'core',
    required: false,
    validationRules: ['iso_or_slash_date'],
    sourceMapping: 'Appointment Date',
    normalizationRules: 'normalize_date_iso',
    displayOrder: 6,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },
  {
    canonicalField: 'appointmentType',
    displayLabel: 'Appointment Type',
    aliases: ['appointment type', 'tipe appointment', 'jenis appointment', 'visit type'],
    dataType: 'string',
    category: 'core',
    required: false,
    validationRules: ['string'],
    sourceMapping: 'Appointment Type',
    normalizationRules: 'trim',
    displayOrder: 7,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },
  {
    canonicalField: 'slotTime',
    displayLabel: 'Slot Time',
    aliases: ['slot time', 'slot_time', 'waktu kunjungan', 'jadwal', 'slot', 'appointment time', 'jam kunjungan'],
    dataType: 'time_slot',
    category: 'core',
    required: false,
    validationRules: ['slot_format'],
    sourceMapping: 'Slot Time',
    normalizationRules: 'normalize_slot_time',
    displayOrder: 8,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },

  // --- B. Customer Identification & Contacts ---
  {
    canonicalField: 'customerId',
    displayLabel: 'Customer ID (7 Digits)',
    aliases: ['id customer', 'customer id', 'no pelanggan', 'id pelanggan', 'cust id', 'id_customer', 'customerid'],
    dataType: 'string',
    category: 'customer',
    required: true,
    validationRules: ['required', 'exact_7_digits'],
    sourceMapping: 'ID Customer',
    normalizationRules: 'keep_digits_string',
    displayOrder: 9,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },
  {
    canonicalField: 'endUserName',
    displayLabel: 'Customer Name',
    aliases: ['customer name', 'nama customer', 'nama pelanggan', 'end user name', 'customer_name', 'name', 'nama'],
    dataType: 'string',
    category: 'customer',
    required: true,
    validationRules: ['required', 'min_length_2'],
    sourceMapping: 'Customer Name',
    normalizationRules: 'title_case_trim',
    displayOrder: 10,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },
  {
    canonicalField: 'customerContact1',
    displayLabel: 'Customer Phone 1',
    aliases: ['customer phone', 'no hp', 'no telp', 'nomor telepon', 'customer_phone', 'phone', 'contact', 'telepon', 'mobile', 'customer phone 1', 'customer contact 1'],
    dataType: 'phone',
    category: 'customer',
    required: true,
    validationRules: ['required', 'valid_indonesian_phone'],
    sourceMapping: 'Customer Phone',
    normalizationRules: 'normalize_phone_id',
    displayOrder: 11,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },
  {
    canonicalField: 'customerContact2',
    displayLabel: 'Customer Phone 2',
    aliases: ['customer phone 2', 'customer phone2', 'customer contact 2', 'no hp 2', 'no telp 2', 'phone 2', 'phone2'],
    dataType: 'phone',
    category: 'customer',
    required: false,
    validationRules: ['valid_indonesian_phone_optional'],
    sourceMapping: 'Customer Phone2',
    normalizationRules: 'normalize_phone_id',
    displayOrder: 12,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },
  {
    canonicalField: 'customerContact3',
    displayLabel: 'Customer Phone 3',
    aliases: ['customer phone 3', 'customer phone3', 'customer contact 3', 'no hp 3', 'phone 3'],
    dataType: 'phone',
    category: 'customer',
    required: false,
    validationRules: ['valid_indonesian_phone_optional'],
    sourceMapping: 'Customer Phone3',
    normalizationRules: 'normalize_phone_id',
    displayOrder: 13,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },

  // --- C. Location & Geographics ---
  {
    canonicalField: 'area',
    displayLabel: 'Area / Coverage',
    aliases: ['area', 'wilayah', 'regional', 'kota', 'city', 'zone', 'region'],
    dataType: 'string',
    category: 'location',
    required: false,
    validationRules: ['string'],
    sourceMapping: 'Area',
    normalizationRules: 'title_case_trim',
    displayOrder: 14,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },
  {
    canonicalField: 'clusterName',
    displayLabel: 'Cluster / Complex',
    aliases: ['cluster name', 'cluster', 'nama cluster', 'perumahan', 'komplek', 'cluster_name'],
    dataType: 'string',
    category: 'location',
    required: false,
    validationRules: ['string'],
    sourceMapping: 'Cluster Name',
    normalizationRules: 'title_case_trim',
    displayOrder: 15,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },
  {
    canonicalField: 'streetName',
    displayLabel: 'Primary Street Address',
    aliases: ['street name', 'alamat', 'street', 'alamat pelanggan', 'address', 'street_name', 'jalan'],
    dataType: 'string',
    category: 'location',
    required: false,
    validationRules: ['string'],
    sourceMapping: 'Street Name',
    normalizationRules: 'trim',
    displayOrder: 16,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },
  {
    canonicalField: 'streetAlternatif',
    displayLabel: 'Street Alternatif / Patokan',
    aliases: ['street alternatif', 'alamat alternatif', 'patokan', 'landmark', 'alamat cadangan', 'street_alternatif'],
    dataType: 'string',
    category: 'location',
    required: false,
    validationRules: ['string'],
    sourceMapping: 'Street Alternatif',
    normalizationRules: 'trim',
    displayOrder: 17,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },

  // --- D. Network & Hardware Infrastructure ---
  {
    canonicalField: 'installationType',
    displayLabel: 'Installation Type',
    aliases: ['installation type', 'tipe instalasi', 'installation_type'],
    dataType: 'string',
    category: 'technical',
    required: false,
    validationRules: ['string'],
    sourceMapping: 'Installation Type',
    normalizationRules: 'trim',
    displayOrder: 18,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },
  {
    canonicalField: 'serviceType',
    displayLabel: 'Service Type',
    aliases: ['service type', 'layanan', 'tipe layanan', 'service_type'],
    dataType: 'string',
    category: 'technical',
    required: false,
    validationRules: ['string'],
    sourceMapping: 'Service Type',
    normalizationRules: 'trim',
    displayOrder: 19,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },
  {
    canonicalField: 'homepassType',
    displayLabel: 'Homepass Type',
    aliases: ['homepass type', 'tipe homepass', 'homepass_type'],
    dataType: 'string',
    category: 'technical',
    required: false,
    validationRules: ['string'],
    sourceMapping: 'Homepass Type',
    normalizationRules: 'trim',
    displayOrder: 20,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },
  {
    canonicalField: 'homepassDetailId',
    displayLabel: 'Homepass Detail ID',
    aliases: ['homepass detail id', 'id homepass', 'homepass_id'],
    dataType: 'string',
    category: 'technical',
    required: false,
    validationRules: ['string'],
    sourceMapping: 'Homepass Detail ID',
    normalizationRules: 'trim',
    displayOrder: 21,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },
  {
    canonicalField: 'oltCode',
    displayLabel: 'OLT Code',
    aliases: ['olt code', 'olt', 'kode olt', 'olt_code'],
    dataType: 'string',
    category: 'technical',
    required: false,
    validationRules: ['code_format'],
    sourceMapping: 'OLT Code',
    normalizationRules: 'uppercase_trim',
    displayOrder: 22,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },
  {
    canonicalField: 'fdtCode',
    displayLabel: 'FDT Code',
    aliases: ['fdt code', 'fdt', 'kode fdt', 'fdt_code'],
    dataType: 'string',
    category: 'technical',
    required: false,
    validationRules: ['code_format'],
    sourceMapping: 'FDT Code',
    normalizationRules: 'uppercase_trim',
    displayOrder: 23,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch', 'installer']
  },
  {
    canonicalField: 'fatCode',
    displayLabel: 'FAT Code',
    aliases: ['fat code', 'fat', 'kode fat', 'fat_code', 'odp code', 'odp'],
    dataType: 'string',
    category: 'technical',
    required: false,
    validationRules: ['code_format'],
    sourceMapping: 'FAT Code',
    normalizationRules: 'uppercase_trim',
    displayOrder: 24,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch', 'installer']
  },
  {
    canonicalField: 'plan',
    displayLabel: 'Subscription Plan',
    aliases: ['plan', 'paket', 'kecepatan', 'speed plan', 'paket langganan'],
    dataType: 'string',
    category: 'technical',
    required: false,
    validationRules: ['string'],
    sourceMapping: 'Plan',
    normalizationRules: 'trim',
    displayOrder: 25,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },
  {
    canonicalField: 'serviceAgingMaintenance',
    displayLabel: 'Service Aging Maintenance',
    aliases: ['service aging maintenance', 'aging', 'service aging'],
    dataType: 'string',
    category: 'technical',
    required: false,
    validationRules: ['string'],
    sourceMapping: 'Service Aging Maintenance',
    normalizationRules: 'trim',
    displayOrder: 26,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },
  {
    canonicalField: 'vendorName',
    displayLabel: 'Vendor Name (Hardware)',
    aliases: ['vendor name', 'hardware vendor', 'device vendor'],
    dataType: 'string',
    category: 'technical',
    required: false,
    validationRules: ['string'],
    sourceMapping: 'Vendor Name',
    normalizationRules: 'trim',
    displayOrder: 27,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },
  {
    canonicalField: 'router',
    displayLabel: 'Router Model',
    aliases: ['router', 'router type', 'tipe router', 'model router'],
    dataType: 'string',
    category: 'technical',
    required: false,
    validationRules: ['string'],
    sourceMapping: 'Router',
    normalizationRules: 'trim',
    displayOrder: 28,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch', 'installer']
  },
  {
    canonicalField: 'stb1Sn',
    displayLabel: 'STB 1 SN',
    aliases: ['stb1 sn', 'stb 1 sn', 'stb 1 serial', 'stb1_sn'],
    dataType: 'string',
    category: 'technical',
    required: false,
    validationRules: ['string'],
    sourceMapping: 'STB 1 SN',
    normalizationRules: 'uppercase_trim',
    displayOrder: 29,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch', 'installer']
  },
  {
    canonicalField: 'stb1Mac',
    displayLabel: 'STB 1 MAC',
    aliases: ['stb1 mac', 'stb 1 mac', 'stb1_mac'],
    dataType: 'string',
    category: 'technical',
    required: false,
    validationRules: ['string'],
    sourceMapping: 'STB 1 MAC',
    normalizationRules: 'uppercase_trim',
    displayOrder: 30,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch', 'installer']
  },
  {
    canonicalField: 'stb2Sn',
    displayLabel: 'STB 2 SN',
    aliases: ['stb2 sn', 'stb 2 sn', 'stb2_sn'],
    dataType: 'string',
    category: 'technical',
    required: false,
    validationRules: ['string'],
    sourceMapping: 'STB 2 SN',
    normalizationRules: 'uppercase_trim',
    displayOrder: 31,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch', 'installer']
  },
  {
    canonicalField: 'stb2Mac',
    displayLabel: 'STB 2 MAC',
    aliases: ['stb2 mac', 'stb 2 mac', 'stb2_mac'],
    dataType: 'string',
    category: 'technical',
    required: false,
    validationRules: ['string'],
    sourceMapping: 'STB 2 MAC',
    normalizationRules: 'uppercase_trim',
    displayOrder: 32,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch', 'installer']
  },
  {
    canonicalField: 'stb3Sn',
    displayLabel: 'STB 3 SN',
    aliases: ['stb3 sn', 'stb 3 sn', 'stb3_sn'],
    dataType: 'string',
    category: 'technical',
    required: false,
    validationRules: ['string'],
    sourceMapping: 'STB 3 SN',
    normalizationRules: 'uppercase_trim',
    displayOrder: 33,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch', 'installer']
  },
  {
    canonicalField: 'stb3Mac',
    displayLabel: 'STB 3 MAC',
    aliases: ['stb3 mac', 'stb 3 mac', 'stb3_mac'],
    dataType: 'string',
    category: 'technical',
    required: false,
    validationRules: ['string'],
    sourceMapping: 'STB 3 MAC',
    normalizationRules: 'uppercase_trim',
    displayOrder: 34,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch', 'installer']
  },
  {
    canonicalField: 'ontSerialNumber',
    displayLabel: 'ONT Serial Number',
    aliases: ['ont serial number', 'ont sn', 'sn ont', 'serial ont', 'ont_sn'],
    dataType: 'string',
    category: 'technical',
    required: false,
    validationRules: ['string'],
    sourceMapping: 'ONT Serial Number',
    normalizationRules: 'uppercase_trim',
    displayOrder: 35,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch', 'installer']
  },
  {
    canonicalField: 'ontMacAddress',
    displayLabel: 'ONT MAC Address',
    aliases: ['ont mac address', 'ont mac', 'mac ont', 'ont_mac'],
    dataType: 'string',
    category: 'technical',
    required: false,
    validationRules: ['string'],
    sourceMapping: 'ONT MAC Address',
    normalizationRules: 'uppercase_trim',
    displayOrder: 36,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch', 'installer']
  },
  {
    canonicalField: 'rgSerialNumber',
    displayLabel: 'RG Serial Number',
    aliases: ['rg serial number', 'rg sn', 'sn rg', 'rg_sn'],
    dataType: 'string',
    category: 'technical',
    required: false,
    validationRules: ['string'],
    sourceMapping: 'RG Serial Number',
    normalizationRules: 'uppercase_trim',
    displayOrder: 37,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch', 'installer']
  },
  {
    canonicalField: 'rgMacAddress',
    displayLabel: 'RG MAC Address',
    aliases: ['rg mac address', 'rg mac', 'mac rg', 'rg_mac'],
    dataType: 'string',
    category: 'technical',
    required: false,
    validationRules: ['string'],
    sourceMapping: 'RG MAC Address',
    normalizationRules: 'uppercase_trim',
    displayOrder: 38,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch', 'installer']
  },

  // --- E. Contractor, Leader, and Installer ---
  {
    canonicalField: 'contractorName',
    displayLabel: 'Contractor Vendor',
    aliases: ['contactor name', 'contractor name', 'nama kontraktor', 'kategori kontraktor', 'kategori vendor', 'kategori mitra', 'kat kontraktor', 'vendor', 'mitra', 'kontraktor', 'contractor', 'contactor'],
    dataType: 'string',
    category: 'assignment',
    required: false,
    validationRules: ['match_known_contractor'],
    sourceMapping: 'Contactor Name',
    normalizationRules: 'match_contractor_dictionary',
    displayOrder: 39,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },
  {
    canonicalField: 'corlapName',
    displayLabel: 'Leader / Korlap Name',
    aliases: ['corlap name', 'leader name', 'nama korlap', 'korlap', 'leader', 'nama leader'],
    dataType: 'string',
    category: 'assignment',
    required: false,
    validationRules: ['string'],
    sourceMapping: 'Corlap Name',
    normalizationRules: 'title_case_trim',
    displayOrder: 40,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },
  {
    canonicalField: 'corlapContact',
    displayLabel: 'Leader Contact',
    aliases: ['corlap contact', 'leader contact', 'no korlap', 'no hp korlap'],
    dataType: 'phone',
    category: 'assignment',
    required: false,
    validationRules: ['valid_indonesian_phone_optional'],
    sourceMapping: 'Corlap Contact',
    normalizationRules: 'normalize_phone_id',
    displayOrder: 41,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },
  {
    canonicalField: 'installerName',
    displayLabel: 'Assigned Installer / Teknisi',
    aliases: ['installer name', 'teknisi', 'nama teknisi', 'installer', 'petugas', 'installer_name', 'technician'],
    dataType: 'string',
    category: 'assignment',
    required: false,
    validationRules: ['string'],
    sourceMapping: 'Installer Name',
    normalizationRules: 'title_case_trim',
    displayOrder: 42,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },
  {
    canonicalField: 'installerContact',
    displayLabel: 'Installer Contact 1',
    aliases: ['installer contact', 'no teknisi', 'no hp teknisi', 'installer phone'],
    dataType: 'phone',
    category: 'assignment',
    required: false,
    validationRules: ['valid_indonesian_phone_optional'],
    sourceMapping: 'Installer Contact',
    normalizationRules: 'normalize_phone_id',
    displayOrder: 43,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },
  {
    canonicalField: 'installerContact2',
    displayLabel: 'Installer Contact 2',
    aliases: ['installer contact 2', 'no teknisi 2', 'installer phone 2'],
    dataType: 'phone',
    category: 'assignment',
    required: false,
    validationRules: ['valid_indonesian_phone_optional'],
    sourceMapping: 'Installer Contact 2',
    normalizationRules: 'normalize_phone_id',
    displayOrder: 44,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },
  {
    canonicalField: 'dateAssignAgent',
    displayLabel: 'Date Assign Agent',
    aliases: ['date assign agent', 'tgl assign agent', 'tanggal assign agent'],
    dataType: 'date',
    category: 'assignment',
    required: false,
    validationRules: ['string'],
    sourceMapping: 'Date Assign Agent',
    normalizationRules: 'trim',
    displayOrder: 45,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  },
  {
    canonicalField: 'dateAssignTechnician',
    displayLabel: 'Date Assign Teknisi',
    aliases: ['date assign teknisi', 'date assign technician', 'tgl assign teknisi'],
    dataType: 'date',
    category: 'assignment',
    required: false,
    validationRules: ['string'],
    sourceMapping: 'Date Assign Teknisi',
    normalizationRules: 'trim',
    displayOrder: 46,
    visible: true,
    editableByRoles: ['super_admin', 'dispatch']
  }
];

// -------------------------------------------------------------
// Validation Helpers (Strict Rules from Master Prompt)
// -------------------------------------------------------------

/**
 * Customer ID must be exactly 7 digits: ^[0-9]{7}$
 */
export function isValidCustomerId(id: string | null | undefined): boolean {
  if (!id) return false;
  const cleaned = String(id).trim();
  // Strip optional 'CUST-' or common prefix if formatted, but rule requires exactly 7 digits:
  // If it has digits, check if the numeric portion is 7 digits or standard 7-digit string
  return /^[0-9]{7}$/.test(cleaned);
}

/**
 * Work Order Number must be non-empty and match approved WO pattern (e.g. WO20267399330 or WO-2026-9101)
 */
export function isValidWoNumber(wo: string | null | undefined): boolean {
  if (!wo) return false;
  const cleaned = String(wo).trim();
  return /^(WO[-_]?[0-9A-Z]{4,20})$/i.test(cleaned);
}

export function normalizePhone(rawPhone: string | null | undefined): { normalized: string; valid: boolean } {
  if (!rawPhone) return { normalized: '', valid: false };
  let digits = String(rawPhone).replace(/\D/g, '');
  if (digits.startsWith('0')) {
    digits = '62' + digits.substring(1);
  } else if (digits.startsWith('8')) {
    digits = '62' + digits;
  } else if (!digits.startsWith('62') && digits.length >= 8) {
    digits = '62' + digits;
  }
  const valid = /^62[2-9]\d{7,12}$/.test(digits);
  return { normalized: digits, valid };
}

export function normalizeSlotTime(rawSlot: string | null | undefined): string {
  if (!rawSlot) return '';
  const clean = rawSlot.trim();
  if (/^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/.test(clean)) {
    return clean.includes('WIB') ? clean : `${clean} WIB`;
  }
  return clean;
}

export function normalizeDate(rawDate: string | null | undefined): string {
  if (!rawDate) return '';
  const parsed = parseAppointmentDate(rawDate);
  return parsed.date || '';
}

/**
 * Match a raw table header string against master canonical aliases
 */
export function matchHeaderToCanonical(
  rawHeader: string,
  configs: CanonicalFieldConfig[] = MASTER_CANONICAL_FIELDS
): CanonicalFieldConfig | null {
  if (!rawHeader) return null;
  const normalized = rawHeader.toLowerCase().trim().replace(/[_\s-]+/g, ' ');

  // 1. Direct canonicalField or sourceMapping check
  for (const cfg of configs) {
    if (
      cfg.canonicalField.toLowerCase() === normalized ||
      (cfg.sourceMapping && cfg.sourceMapping.toLowerCase() === normalized)
    ) {
      return cfg;
    }
  }

  // 2. Aliases exact match
  for (const cfg of configs) {
    for (const alias of cfg.aliases) {
      const normAlias = alias.toLowerCase().trim().replace(/[_\s-]+/g, ' ');
      if (normAlias === normalized) {
        return cfg;
      }
    }
  }

  return null;
}

/**
 * 8. WODistributionEngine:
 * Validates WO, Customer ID, matches Contractor, verifies coverage, checks schedule & personnel.
 * Records decision status & reason.
 */
export function runWODistributionEngine(
  ticket: Partial<Ticket>,
  contractors: Contractor[],
  coverageAreas: CoverageArea[],
  userRole: UserRole = 'dispatch'
): { ticket: Partial<Ticket>; status: WODistributionStatus; reason: string } {
  // Permission verification: Only Dispatch or Super Admin can distribute WO
  if (userRole !== 'super_admin' && userRole !== 'dispatch') {
    return {
      ticket,
      status: 'pending',
      reason: 'Akses Ditolak: Hanya Super Admin dan Dispatch yang berwenang mendistribusikan WO.'
    };
  }

  const result: Partial<Ticket> = { ...ticket };

  // Step 1: Validate WO Number
  if (!result.woNumber || !isValidWoNumber(result.woNumber)) {
    return {
      ticket: result,
      status: 'pending',
      reason: `Format nomor WO '${result.woNumber || ''}' tidak valid.`
    };
  }

  // Step 2: Validate Customer ID (Strict 7 digits)
  // Accept standard 7 digits, or if prefix 'CUST-', check suffix
  const custId = (result.idCustomer || result.customerId || '').trim();
  const digitsOnly = custId.replace(/\D/g, '');
  if (digitsOnly.length !== 7) {
    return {
      ticket: result,
      status: 'pending',
      reason: `Customer ID '${custId}' wajib tepat 7 digit angka.`
    };
  }

  // Step 3: Match Contractor against Master Contractors
  let matchedContractor: Contractor | undefined;
  const rawContractor = (result.contactorName || result.contractorName || '').trim();

  if (rawContractor) {
    matchedContractor = contractors.find(
      c => c.name.toLowerCase() === rawContractor.toLowerCase() ||
           c.code.toLowerCase() === rawContractor.toLowerCase() ||
           c.name.toLowerCase().includes(rawContractor.toLowerCase())
    );
  }

  if (!matchedContractor) {
    result.distributionStatus = 'unmapped_contractor';
    result.distributionNotes = `Kontraktor '${rawContractor || 'Kosong'}' tidak terdaftar di Master Kontraktor.`;
    return {
      ticket: result,
      status: 'unmapped_contractor',
      reason: result.distributionNotes
    };
  }

  // Step 4: Verify Coverage Area and Cluster
  const ticketArea = (result.area || '').trim().toLowerCase();
  const ticketCluster = (result.clusterName || '').trim().toLowerCase();

  const isAreaCovered = matchedContractor.coverageAreas.some(ca => ca.toLowerCase() === ticketArea);
  if (!isAreaCovered && ticketArea) {
    result.distributionStatus = 'coverage_mismatch';
    result.distributionNotes = `Area '${result.area}' berada di luar cakupan operasional kontraktor ${matchedContractor.name}.`;
    return {
      ticket: result,
      status: 'coverage_mismatch',
      reason: result.distributionNotes
    };
  }

  // Step 5: Validate Appointment Date & Slot Time
  // CRITICAL: Do NOT substitute "Date" as appointmentDate
  if (!result.appointmentDate) {
    result.distributionStatus = 'schedule_not_available';
    result.distributionNotes = 'Tanggal kunjungan (Appointment Date) belum ditentukan.';
    // Still bind contractor details so Leader can see and schedule it
    result.contactorName = matchedContractor.name;
    result.contractorName = matchedContractor.name;
    result.contractorId = matchedContractor.id;
    if (matchedContractor.leaderName && !result.leaderName) {
      result.leaderName = matchedContractor.leaderName;
      result.corlapName = matchedContractor.leaderName;
    }
    return {
      ticket: result,
      status: 'schedule_not_available',
      reason: result.distributionNotes
    };
  }

  // Step 6: Bind Contractor & Leader
  result.contactorName = matchedContractor.name;
  result.contractorName = matchedContractor.name;
  result.contractorId = matchedContractor.id;
  if (matchedContractor.leaderName && !result.leaderName) {
    result.leaderName = matchedContractor.leaderName;
    result.corlapName = matchedContractor.leaderName;
  }

  // Step 7: Check Installer assignment
  if (result.installerName && result.installerName.trim()) {
    result.statusWOInstaller = result.statusWOInstaller && result.statusWOInstaller !== 'Unassigned'
      ? result.statusWOInstaller
      : 'Assigned';
  } else {
    result.statusWOInstaller = 'Unassigned';
  }

  result.distributionStatus = 'distributed';
  result.distributionNotes = `Berhasil didistribusikan ke ${matchedContractor.name} (${matchedContractor.leaderName || 'Leader'}).`;

  return {
    ticket: result,
    status: 'distributed',
    reason: result.distributionNotes
  };
}

export function autoDistributeTicket(
  ticket: Partial<Ticket>,
  contractors: Contractor[],
  coverageAreas: CoverageArea[]
): Partial<Ticket> {
  const { ticket: res } = runWODistributionEngine(ticket, contractors, coverageAreas, 'dispatch');
  return res;
}

/**
 * Generate standard vendor acronym code (e.g. PT Mitra Jaringan Solusi -> MJS)
 */
export function generateContractorCode(name: string): string {
  if (!name) return 'VND';
  const clean = name.replace(/^(PT|CV|UD|PO|KOP|KOPERASI)\.?\s+/i, '').trim();
  const words = clean.split(/\s+/).filter(w => w.length > 0);
  if (words.length >= 2) {
    const letters = words.map(w => w[0]).join('').toUpperCase();
    return letters.slice(0, 5);
  }
  if (words.length === 1 && words[0].length >= 3) {
    return words[0].slice(0, 4).toUpperCase();
  }
  return clean.slice(0, 4).toUpperCase() || 'VND';
}

/**
 * Extract, reconcile, and dynamically recognize Contractor Categories from raw imported rows
 */
export function extractContractorsFromRawRows(
  rawRows: Record<string, string>[],
  headerToCanonicalMap: Record<string, CanonicalFieldConfig | null>,
  existingContractors: Contractor[] = [],
  existingCoverageAreas: CoverageArea[] = []
): {
  detectedContractors: DetectedImportContractor[];
  mergedContractors: Contractor[];
  mergedCoverageAreas: CoverageArea[];
  newCoverageAreaNames: string[];
} {
  const contractorMap = new Map<string, {
    rawName: string;
    areas: Set<string>;
    clusters: Set<string>;
    leaders: Set<string>;
    phones: Set<string>;
    count: number;
  }>();

  const allAreasDetected = new Set<string>();

  rawRows.forEach(row => {
    let contractorName = '';
    let area = '';
    let cluster = '';
    let leader = '';
    let phone = '';

    Object.entries(row).forEach(([rawH, val]) => {
      const v = val !== undefined && val !== null ? String(val).trim() : '';
      if (!v) return;
      const matched = headerToCanonicalMap[rawH];
      if (!matched) return;

      if (matched.canonicalField === 'contractorName') {
        contractorName = v;
      } else if (matched.canonicalField === 'area') {
        area = v;
      } else if (matched.canonicalField === 'clusterName') {
        cluster = v;
      } else if (matched.canonicalField === 'corlapName' || matched.canonicalField === 'leaderName') {
        leader = v;
      } else if (matched.canonicalField === 'corlapContact') {
        phone = v;
      }
    });

    if (area) allAreasDetected.add(area);

    if (contractorName) {
      const key = contractorName.toLowerCase().trim();
      if (!contractorMap.has(key)) {
        contractorMap.set(key, {
          rawName: contractorName,
          areas: new Set<string>(),
          clusters: new Set<string>(),
          leaders: new Set<string>(),
          phones: new Set<string>(),
          count: 0
        });
      }
      const entry = contractorMap.get(key)!;
      entry.count++;
      if (area) entry.areas.add(area);
      if (cluster) entry.clusters.add(cluster);
      if (leader) entry.leaders.add(leader);
      if (phone) entry.phones.add(phone);
    }
  });

  const detectedContractors: DetectedImportContractor[] = [];
  const mergedContractors: Contractor[] = [...existingContractors];

  contractorMap.forEach((data, key) => {
    // Check if contractor already registered in master data
    const existingIndex = mergedContractors.findIndex(
      c => c.name.toLowerCase() === key ||
           c.code.toLowerCase() === key ||
           c.name.toLowerCase().includes(key) ||
           key.includes(c.name.toLowerCase())
    );

    const areasList = Array.from(data.areas);
    const clustersList = Array.from(data.clusters);
    const leaderName = Array.from(data.leaders)[0] || '';
    const phone = Array.from(data.phones)[0] || '';

    if (existingIndex >= 0) {
      const existing = mergedContractors[existingIndex];
      // Merge coverage areas so coverage_mismatch doesn't block valid WOs
      const combinedAreas = Array.from(new Set([...existing.coverageAreas, ...areasList]));
      mergedContractors[existingIndex] = {
        ...existing,
        coverageAreas: combinedAreas,
        leaderName: existing.leaderName || leaderName || undefined,
        phone: existing.phone || phone || undefined
      };

      const existingDetected = detectedContractors.find(
        dc => (existing.id && dc.id === existing.id) ||
              dc.name.toLowerCase().trim() === existing.name.toLowerCase().trim()
      );
      if (existingDetected) {
        existingDetected.woCount += data.count;
        existingDetected.coverageAreas = Array.from(new Set([...existingDetected.coverageAreas, ...combinedAreas]));
        existingDetected.clusters = Array.from(new Set([...(existingDetected.clusters || []), ...clustersList]));
      } else {
        detectedContractors.push({
          id: existing.id,
          name: existing.name,
          code: existing.code,
          coverageAreas: combinedAreas,
          clusters: clustersList,
          leaderName: existing.leaderName || leaderName || undefined,
          phone: existing.phone || phone || undefined,
          email: existing.email,
          isNew: false,
          woCount: data.count
        });
      }
    } else {
      // Newly detected contractor from import! Register automatically if not already added
      const code = generateContractorCode(data.rawName);
      const alreadyDetected = detectedContractors.find(
        dc => dc.name.toLowerCase().trim() === data.rawName.toLowerCase().trim() ||
              (dc.code && dc.code.toLowerCase().trim() === code.toLowerCase().trim())
      );
      if (alreadyDetected) {
        alreadyDetected.woCount += data.count;
        alreadyDetected.coverageAreas = Array.from(new Set([...alreadyDetected.coverageAreas, ...areasList]));
        alreadyDetected.clusters = Array.from(new Set([...(alreadyDetected.clusters || []), ...clustersList]));
      } else {
        const newId = 'c-imp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
        const newContractor: Contractor = {
          id: newId,
          name: data.rawName,
          code,
          coverageAreas: areasList.length > 0 ? areasList : ['Jabodetabek'],
          leaderName: leaderName || undefined,
          phone: phone || undefined,
          email: `ops@${code.toLowerCase()}.morajaws.net`,
          active: true,
          createdAt: new Date().toISOString()
        };

        mergedContractors.push(newContractor);
        detectedContractors.push({
          id: newId,
          name: data.rawName,
          code,
          coverageAreas: newContractor.coverageAreas,
          clusters: clustersList,
          leaderName: leaderName || undefined,
          phone: phone || undefined,
          email: newContractor.email,
          isNew: true,
          woCount: data.count
        });
      }
    }
  });

  // Strict deduplication for detectedContractors
  const uniqueDetected: DetectedImportContractor[] = [];
  const seenDetectedIds = new Set<string>();
  const seenDetectedNames = new Set<string>();
  for (const dc of detectedContractors) {
    const idKey = (dc.id || '').trim();
    const nameKey = (dc.name || '').trim().toLowerCase();
    if (idKey && seenDetectedIds.has(idKey)) continue;
    if (nameKey && seenDetectedNames.has(nameKey)) continue;
    if (idKey) seenDetectedIds.add(idKey);
    if (nameKey) seenDetectedNames.add(nameKey);
    uniqueDetected.push(dc);
  }

  // Reconcile coverage areas
  const mergedCoverageAreas: CoverageArea[] = [...existingCoverageAreas];
  const newCoverageAreaNames: string[] = [];

  allAreasDetected.forEach(areaName => {
    const exists = mergedCoverageAreas.some(ca => ca.name.toLowerCase() === areaName.toLowerCase());
    if (!exists) {
      newCoverageAreaNames.push(areaName);
      mergedCoverageAreas.push({
        id: 'area-imp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
        name: areaName,
        clusters: [],
        active: true
      });
    }
  });

  return {
    detectedContractors: uniqueDetected,
    mergedContractors,
    mergedCoverageAreas,
    newCoverageAreaNames
  };
}

/**
 * Extract contractors and coverage areas from an array of Partial<Ticket> (used during bulkImportTickets)
 */
export function extractContractorsFromTickets(
  tickets: Partial<Ticket>[],
  existingContractors: Contractor[] = [],
  existingCoverageAreas: CoverageArea[] = []
): {
  newContractors: Contractor[];
  updatedContractors: Contractor[];
  newCoverageAreas: CoverageArea[];
} {
  const newContractors: Contractor[] = [];
  const updatedContractors: Contractor[] = [];
  const mergedContractorMap = new Map<string, Contractor>();

  existingContractors.forEach(c => {
    mergedContractorMap.set(c.name.toLowerCase().trim(), { ...c });
  });

  const existingAreaNames = new Set(existingCoverageAreas.map(a => a.name.toLowerCase().trim()));
  const newCoverageAreas: CoverageArea[] = [];

  tickets.forEach(t => {
    const rawT = t as Record<string, any>;
    const contractorName = (t.contactorName || t.contractorName || rawT.contractor || rawT['kategori kontraktor'] || rawT.vendor || rawT.mitra || '').trim();
    const area = (t.area || rawT.coverageArea || '').trim();
    const cluster = (t.clusterName || '').trim();
    const leader = (t.corlapName || t.leaderName || '').trim();
    const phone = (t.corlapContact || '').trim();

    if (area && !existingAreaNames.has(area.toLowerCase())) {
      existingAreaNames.add(area.toLowerCase());
      newCoverageAreas.push({
        id: 'area-imp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
        name: area,
        clusters: cluster ? [cluster] : [],
        active: true
      });
    }

    if (contractorName) {
      const key = contractorName.toLowerCase();
      let matchedContractor: Contractor | undefined;

      for (const [k, c] of mergedContractorMap.entries()) {
        if (k === key || c.code.toLowerCase() === key || k.includes(key) || key.includes(k)) {
          matchedContractor = c;
          break;
        }
      }

      if (matchedContractor) {
        let changed = false;
        if (area && !matchedContractor.coverageAreas.some(ca => ca.toLowerCase() === area.toLowerCase())) {
          matchedContractor.coverageAreas.push(area);
          changed = true;
        }
        if (!matchedContractor.leaderName && leader) {
          matchedContractor.leaderName = leader;
          changed = true;
        }
        if (!matchedContractor.phone && phone) {
          matchedContractor.phone = phone;
          changed = true;
        }
        if (changed && !updatedContractors.some(c => c.id === matchedContractor!.id)) {
          updatedContractors.push(matchedContractor);
        }
      } else {
        const code = generateContractorCode(contractorName);
        const newC: Contractor = {
          id: 'c-imp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
          name: contractorName,
          code,
          coverageAreas: area ? [area] : ['Jabodetabek'],
          leaderName: leader || undefined,
          phone: phone || undefined,
          email: `ops@${code.toLowerCase()}.morajaws.net`,
          active: true,
          createdAt: new Date().toISOString()
        };
        mergedContractorMap.set(key, newC);
        newContractors.push(newC);
      }
    }
  });

  // Deduplicate newContractors
  const uniqueNewContractors: Contractor[] = [];
  const seenNewIds = new Set<string>();
  const seenNewNames = new Set<string>();
  for (const c of newContractors) {
    const idKey = (c.id || '').trim();
    const nameKey = (c.name || '').trim().toLowerCase();
    if (idKey && seenNewIds.has(idKey)) continue;
    if (nameKey && seenNewNames.has(nameKey)) continue;
    if (idKey) seenNewIds.add(idKey);
    if (nameKey) seenNewNames.add(nameKey);
    uniqueNewContractors.push(c);
  }

  return {
    newContractors: uniqueNewContractors,
    updatedContractors,
    newCoverageAreas
  };
}

/**
 * WOFieldMappingEngine Main Processor:
 * Parses raw table rows (or Excel objects), preserves unmapped & unnamed columns in `additionalFields`,
 * validates WO format, uniqueness, and strict 7-digit Customer ID.
 */
export function processRawImportWithEngine(
  rawRows: Record<string, string>[],
  existingWoNumbers: Set<string>,
  contractors: Contractor[] = [],
  coverageAreas: CoverageArea[] = [],
  customConfigs: CanonicalFieldConfig[] = MASTER_CANONICAL_FIELDS,
  operatorRole: UserRole = 'dispatch'
): {
  parsedRows: ParsedRowData[];
  validCount: number;
  problematicCount: number;
  duplicateCount: number;
  unrecognizedHeaders: string[];
  detectedHeaders: string[];
  detectedContractors: DetectedImportContractor[];
  newCoverageAreas: string[];
} {
  if (rawRows.length === 0) {
    return {
      parsedRows: [],
      validCount: 0,
      problematicCount: 0,
      duplicateCount: 0,
      unrecognizedHeaders: [],
      detectedHeaders: [],
      detectedContractors: [],
      newCoverageAreas: []
    };
  }

  // Detect headers
  const detectedHeaders = Object.keys(rawRows[0]);
  const headerToCanonicalMap: Record<string, CanonicalFieldConfig | null> = {};
  const unrecognizedHeaders: string[] = [];

  detectedHeaders.forEach((rawH, idx) => {
    const isUnnamed = !rawH || rawH.trim() === '' || rawH.startsWith('__EMPTY');
    const headerLabel = isUnnamed ? `UNNAMED_COLUMN_${idx + 1}` : rawH;
    const match = matchHeaderToCanonical(headerLabel, customConfigs);
    headerToCanonicalMap[rawH] = match;
    if (!match && !isUnnamed) {
      unrecognizedHeaders.push(rawH);
    }
  });

  // Automatically extract & reconcile Contractor Categories from imported rows
  const {
    detectedContractors,
    mergedContractors,
    mergedCoverageAreas,
    newCoverageAreaNames
  } = extractContractorsFromRawRows(rawRows, headerToCanonicalMap, contractors, coverageAreas);

  const parsedRows: ParsedRowData[] = [];
  const seenWosInBatch = new Set<string>();
  let validCount = 0;
  let problematicCount = 0;
  let duplicateCount = 0;

  rawRows.forEach((row, rowIndex) => {
    const mapped: Partial<Ticket> = {
      additionalFields: {},
      unmappedHeaders: []
    };
    const unrecognizedColumns: string[] = [];
    const validationErrors: string[] = [];
    let rowAppointmentDateMeta: DateParseResult | undefined = undefined;

    // Map each cell
    Object.entries(row).forEach(([rawHeader, val], colIdx) => {
      const rawVal = val !== undefined && val !== null ? String(val).trim() : '';
      const matchedConfig = headerToCanonicalMap[rawHeader];
      const isUnnamed = !rawHeader || rawHeader.trim() === '' || rawHeader.startsWith('__EMPTY');
      const safeKey = isUnnamed ? `UNNAMED_COLUMN_${colIdx + 1}` : rawHeader;

      if (!matchedConfig) {
        // PRESERVE IN ADDITIONAL FIELDS WITHOUT LOSING
        mapped.additionalFields![safeKey] = rawVal;
        if (!isUnnamed) {
          unrecognizedColumns.push(rawHeader);
        }
        return;
      }

      // Map to canonical field
      switch (matchedConfig.canonicalField) {
        case 'workOrderNumber':
          mapped.woNumber = rawVal.toUpperCase();
          mapped.workOrderNumber = rawVal.toUpperCase();
          break;
        case 'ticketNumber':
          mapped.ticketNumber = rawVal.toUpperCase();
          break;
        case 'ticketDate':
          mapped.ticketDate = normalizeDate(rawVal);
          break;
        case 'initialTicketCategory':
          mapped.ticketCategory = rawVal;
          mapped.initialTicketCategory = rawVal;
          break;
        case 'date':
          mapped.date = normalizeDate(rawVal);
          break;
        case 'appointmentDate': {
          // Strictly parse from source WO Appointment Date without timezone shifts
          rowAppointmentDateMeta = parseAppointmentDate(rawVal);
          mapped.appointmentDate = rowAppointmentDateMeta.date || undefined;
          if (!rowAppointmentDateMeta.isValid && rowAppointmentDateMeta.error) {
            validationErrors.push(rowAppointmentDateMeta.error);
          }
          break;
        }
        case 'appointmentType':
          mapped.appointmentType = rawVal;
          break;
        case 'slotTime':
          mapped.slotTime = normalizeSlotTime(rawVal);
          break;
        case 'customerId':
          mapped.idCustomer = rawVal;
          mapped.customerId = rawVal;
          break;
        case 'endUserName':
          mapped.customerName = rawVal;
          mapped.endUserName = rawVal;
          break;
        case 'customerContact1': {
          const { normalized } = normalizePhone(rawVal);
          mapped.customerPhone = rawVal;
          mapped.customerContact1 = rawVal;
          mapped.customerPhoneNormalized = normalized;
          break;
        }
        case 'customerContact2':
          mapped.customerContact2 = rawVal;
          break;
        case 'customerContact3':
          mapped.customerContact3 = rawVal;
          break;
        case 'area':
          mapped.area = rawVal;
          break;
        case 'clusterName':
          mapped.clusterName = rawVal;
          break;
        case 'streetName':
          mapped.streetName = rawVal;
          break;
        case 'streetAlternatif':
          mapped.streetAlternatif = rawVal;
          break;
        case 'installationType':
          mapped.installationType = rawVal;
          break;
        case 'serviceType':
          mapped.serviceType = rawVal;
          break;
        case 'homepassType':
          mapped.homepassType = rawVal;
          break;
        case 'homepassDetailId':
          mapped.homepassDetailId = rawVal;
          break;
        case 'oltCode':
          mapped.oltCode = rawVal.toUpperCase();
          break;
        case 'fdtCode':
          mapped.fdtCode = rawVal.toUpperCase();
          break;
        case 'fatCode':
          mapped.fatCode = rawVal.toUpperCase();
          break;
        case 'plan':
          mapped.plan = rawVal;
          break;
        case 'serviceAgingMaintenance':
          mapped.serviceAgingMaintenance = rawVal;
          break;
        case 'vendorName':
          mapped.vendorName = rawVal;
          break;
        case 'router':
          mapped.router = rawVal;
          break;
        case 'stb1Sn':
          mapped.stb1Sn = rawVal.toUpperCase();
          break;
        case 'stb1Mac':
          mapped.stb1Mac = rawVal.toUpperCase();
          break;
        case 'stb2Sn':
          mapped.stb2Sn = rawVal.toUpperCase();
          break;
        case 'stb2Mac':
          mapped.stb2Mac = rawVal.toUpperCase();
          break;
        case 'stb3Sn':
          mapped.stb3Sn = rawVal.toUpperCase();
          break;
        case 'stb3Mac':
          mapped.stb3Mac = rawVal.toUpperCase();
          break;
        case 'ontSerialNumber':
          mapped.ontSerialNumber = rawVal.toUpperCase();
          break;
        case 'ontMacAddress':
          mapped.ontMacAddress = rawVal.toUpperCase();
          break;
        case 'rgSerialNumber':
          mapped.rgSerialNumber = rawVal.toUpperCase();
          break;
        case 'rgMacAddress':
          mapped.rgMacAddress = rawVal.toUpperCase();
          break;
        case 'contractorName':
          mapped.contactorName = rawVal;
          mapped.contractorName = rawVal;
          break;
        case 'corlapName':
          mapped.corlapName = rawVal;
          mapped.leaderName = rawVal;
          break;
        case 'corlapContact':
          mapped.corlapContact = rawVal;
          break;
        case 'installerName':
          mapped.installerName = rawVal;
          break;
        case 'installerContact':
          mapped.installerContact = rawVal;
          break;
        case 'installerContact2':
          mapped.installerContact2 = rawVal;
          break;
        case 'dateAssignAgent':
          mapped.dateAssignAgent = rawVal;
          break;
        case 'dateAssignTechnician':
          mapped.dateAssignTechnician = rawVal;
          break;
        default:
          mapped.additionalFields![matchedConfig.canonicalField] = rawVal;
          break;
      }
    });

    // Run WODistributionEngine with merged contractors (including dynamically recognized contractors)
    const distResult = runWODistributionEngine(mapped, mergedContractors, mergedCoverageAreas, operatorRole);
    Object.assign(mapped, distResult.ticket);

    // Validation 1: WO Number
    const woNum = (mapped.woNumber || '').trim().toUpperCase();
    let isDuplicate = false;

    if (!woNum) {
      validationErrors.push('Nomor Work Order (WO Number) wajib diisi.');
    } else if (!isValidWoNumber(woNum)) {
      validationErrors.push(`Format nomor WO '${woNum}' tidak valid (contoh resmi: WO20267399330).`);
    } else if (existingWoNumbers.has(woNum)) {
      isDuplicate = true;
      validationErrors.push(`Nomor WO ${woNum} sudah ada di database (duplikat).`);
    } else if (seenWosInBatch.has(woNum)) {
      isDuplicate = true;
      validationErrors.push(`Nomor WO ${woNum} duplikat dalam file impor.`);
    } else {
      seenWosInBatch.add(woNum);
    }

    // Validation 2: Customer ID (Strictly 7 Digits ^[0-9]{7}$)
    const custId = (mapped.idCustomer || mapped.customerId || '').trim();
    if (!custId) {
      validationErrors.push('Customer ID wajib diisi.');
    } else if (!/^[0-9]{7}$/.test(custId)) {
      validationErrors.push(`Customer ID '${custId}' harus tepat 7 digit angka (^[0-9]{7}$).`);
    }

    // Validation 3: Customer Name & Phone
    if (!mapped.customerName?.trim()) {
      validationErrors.push('Nama pelanggan (Customer Name) wajib diisi.');
    }

    if (!mapped.customerPhone?.trim()) {
      validationErrors.push('Nomor telepon pelanggan (Customer Phone) wajib diisi.');
    }

    const isValid = validationErrors.length === 0;

    if (isDuplicate) duplicateCount++;
    if (isValid) validCount++; else problematicCount++;

    parsedRows.push({
      rowIndex,
      raw: row,
      mapped,
      isValid,
      validationErrors,
      isDuplicate,
      unrecognizedColumns,
      appointmentDateMeta: rowAppointmentDateMeta
    });
  });

  return {
    parsedRows,
    validCount,
    problematicCount,
    duplicateCount,
    unrecognizedHeaders: Array.from(new Set(unrecognizedHeaders)),
    detectedHeaders,
    detectedContractors,
    newCoverageAreas: newCoverageAreaNames
  };
}

/**
 * Parse Excel Binary Buffer (.xlsx, .xls) into raw record rows
 * Smartly inspects sheet 'Data_WO', 'Sheet1', or the first non-empty sheet,
 * preserving strings and leading zeros.
 */
export function parseExcelWorkbook(buffer: ArrayBuffer | Uint8Array): Record<string, string>[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, raw: false });
  let targetSheetName = workbook.SheetNames[0];

  // Check priority sheet names
  if (workbook.SheetNames.includes('Data_WO')) {
    targetSheetName = 'Data_WO';
  } else if (workbook.SheetNames.includes('Sheet1')) {
    targetSheetName = 'Sheet1';
  } else if (workbook.SheetNames.includes('Work_Orders')) {
    targetSheetName = 'Work_Orders';
  }

  const worksheet = workbook.Sheets[targetSheetName];
  if (!worksheet) return [];

  const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
    raw: false
  });

  return rawJson.map(row => {
    const record: Record<string, string> = {};
    Object.entries(row).forEach(([k, v]) => {
      let strVal = '';
      if (v instanceof Date) {
        try {
          const y = v.getFullYear();
          const m = String(v.getMonth() + 1).padStart(2, '0');
          const d = String(v.getDate()).padStart(2, '0');
          strVal = `${y}-${m}-${d}`;
        } catch {
          strVal = String(v);
        }
      } else if (v !== undefined && v !== null) {
        strVal = String(v).trim();
      }
      record[k] = strVal;
    });
    return record;
  });
}

/**
 * Pure transactional reassign function:
 * Validates Leader scope, target installer, WO status, records append-only history,
 * updates active assignment, and protects all master WO data, customer information,
 * appointment date, reports, and chat history.
 */
export function reassignWOTechnician(
  ticket: Ticket,
  targetInstaller: { id: string; name: string; phone?: string; active: boolean; contractor?: string },
  leader: { id: string; name: string; role: string; contractor?: string; area?: string },
  reason: string
): { success: boolean; ticket?: Ticket; historyEntry?: WOAssignmentHistory; error?: string } {
  // 1. Check permissions
  if (leader.role !== 'leader' && leader.role !== 'super_admin') {
    return {
      success: false,
      error: 'Akses Ditolak: Hanya Leader / Korlap lapangan yang berwenang melakukan reassignment teknisi.'
    };
  }

  // 2. Validate current WO state
  if (!ticket.installerName || !ticket.installerName.trim()) {
    return {
      success: false,
      error: 'WO ini belum memiliki teknisi yang ditugaskan. Gunakan fitur "Assign WO" untuk penugasan awal.'
    };
  }

  if (ticket.statusWOInstaller === 'Completed' || ticket.statusWOAgent === 'Closed') {
    return {
      success: false,
      error: `WO ${ticket.woNumber} telah selesai atau ditutup. WO yang sudah selesai tidak dapat di-reassign.`
    };
  }

  // 3. Verify contractor scope for Leader
  if (leader.role === 'leader' && leader.contractor) {
    const leaderContr = leader.contractor.toLowerCase().trim();
    const woContr = (ticket.contactorName || ticket.contractorName || '').toLowerCase().trim();
    if (woContr && !woContr.includes(leaderContr) && !leaderContr.includes(woContr)) {
      return {
        success: false,
        error: `Akses Ditolak: WO ${ticket.woNumber} berada di bawah vendor ${ticket.contactorName || ticket.contractorName}, di luar cakupan Anda (${leader.contractor}).`
      };
    }
  }

  // 4. Validate target installer
  if (!targetInstaller.active) {
    return {
      success: false,
      error: `Teknisi ${targetInstaller.name} sedang tidak aktif di sistem.`
    };
  }

  if (leader.role === 'leader' && leader.contractor && targetInstaller.contractor) {
    const leaderContr = leader.contractor.toLowerCase().trim();
    const instContr = targetInstaller.contractor.toLowerCase().trim();
    if (!instContr.includes(leaderContr) && !leaderContr.includes(instContr)) {
      return {
        success: false,
        error: `Teknisi ${targetInstaller.name} terdaftar di vendor ${targetInstaller.contractor}, berbeda dengan vendor Anda (${leader.contractor}).`
      };
    }
  }

  const previousInstaller = ticket.installerName;
  if (previousInstaller.toLowerCase().trim() === targetInstaller.name.toLowerCase().trim()) {
    return {
      success: false,
      error: `Teknisi tujuan (${targetInstaller.name}) sama dengan teknisi yang saat ini memegang WO.`
    };
  }

  // 5. Validate reason
  if (!reason || reason.trim().length < 5) {
    return {
      success: false,
      error: 'Alasan reassign wajib diisi minimal 5 karakter untuk riwayat audit.'
    };
  }

  const now = new Date().toISOString();
  const historyEntry: WOAssignmentHistory = {
    id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    woNumber: ticket.woNumber,
    ticketId: ticket.id,
    previousInstallerName: previousInstaller,
    newInstallerName: targetInstaller.name,
    leaderName: leader.name,
    leaderId: leader.id,
    contractorName: leader.contractor || ticket.contactorName,
    timestamp: now,
    reason: reason.trim(),
    previousStatus: ticket.statusWOInstaller,
    newStatus: 'Assigned',
    sourceAction: 'reassign'
  };

  // 6. Mutate only assignment fields, preserving master data, reports, and chat
  const updatedTicket: Ticket = {
    ...ticket,
    // Active assignment updated atomically (old installer loses active assignment, new installer gains it)
    installerName: targetInstaller.name,
    installerContact: targetInstaller.phone || ticket.installerContact,
    reassignedAt: now,
    reassignedBy: leader.name,
    reassignmentReason: reason.trim(),
    statusWOInstaller: 'Assigned', // Reset field status to Assigned for the new installer
    assignmentHistory: [...(ticket.assignmentHistory || []), historyEntry],
    updatedAt: now,
    updatedBy: `${leader.name} (Reassign)`
  };

  return {
    success: true,
    ticket: updatedTicket,
    historyEntry
  };
}

