import { Ticket } from '../types/index.ts';
import { SheetAnalysis, normalizeHeaderString } from './excelClient.ts';

export interface ColumnMappingConfig {
  canonicalKey: keyof Ticket | string;
  label: string;
  category: 'core' | 'customer' | 'location' | 'technical' | 'mitra' | 'metadata';
  requiredForWO: boolean;
  aliases: string[];
}

export const CANONICAL_FIELD_DEFINITIONS: ColumnMappingConfig[] = [
  {
    canonicalKey: 'woNumber',
    label: 'WO Number',
    category: 'core',
    requiredForWO: true,
    aliases: ['wo number', 'no wo', 'nomor wo', 'wo_number', 'wonumber', 'no. wo', 'work order number', 'wo id', 'id wo', 'nomor order']
  },
  {
    canonicalKey: 'ticketNumber',
    label: 'Ticket Number',
    category: 'core',
    requiredForWO: false,
    aliases: ['ticket number', 'no ticket', 'nomor tiket', 'ticket_number', 'ticket id']
  },
  {
    canonicalKey: 'idCustomer',
    label: 'ID Customer',
    category: 'customer',
    requiredForWO: false,
    aliases: ['id customer', 'customer id', 'no pelanggan', 'id pelanggan', 'cust id', 'id_customer', 'customerid']
  },
  {
    canonicalKey: 'customerName',
    label: 'Nama Pelanggan',
    category: 'customer',
    requiredForWO: false,
    aliases: ['customer name', 'nama customer', 'nama pelanggan', 'end user name', 'customer_name', 'name', 'nama', 'cust name']
  },
  {
    canonicalKey: 'customerPhone',
    label: 'No HP Pelanggan',
    category: 'customer',
    requiredForWO: false,
    aliases: ['customer phone', 'no hp', 'nomor hp', 'no telp', 'nomor telepon', 'phone', 'telepon', 'mobile', 'contact', 'customer_phone', 'customer contact 1']
  },
  {
    canonicalKey: 'customerContact2',
    label: 'No HP Alternatif',
    category: 'customer',
    requiredForWO: false,
    aliases: ['customer phone 2', 'customer phone2', 'no hp 2', 'phone 2', 'customer contact 2']
  },
  {
    canonicalKey: 'streetName',
    label: 'Alamat / Street Name',
    category: 'location',
    requiredForWO: false,
    aliases: ['street name', 'alamat', 'alamat pelanggan', 'street', 'address', 'jalan', 'alamat lengkap', 'street_name']
  },
  {
    canonicalKey: 'streetAlternatif',
    label: 'Patokan / Alamat Cadangan',
    category: 'location',
    requiredForWO: false,
    aliases: ['street alternatif', 'patokan', 'landmark', 'alamat alternatif', 'street_alternatif']
  },
  {
    canonicalKey: 'latitude',
    label: 'Latitude',
    category: 'location',
    requiredForWO: false,
    aliases: ['latitude', 'lat', 'lintang', 'koordinat lat', 'koordinat latitude', 'latitude pelanggan']
  },
  {
    canonicalKey: 'longitude',
    label: 'Longitude',
    category: 'location',
    requiredForWO: false,
    aliases: ['longitude', 'long', 'lng', 'bujur', 'koordinat long', 'koordinat longitude', 'longitude pelanggan']
  },
  {
    canonicalKey: 'area',
    label: 'Area / Wilayah',
    category: 'location',
    requiredForWO: false,
    aliases: ['area', 'wilayah', 'regional', 'kota', 'city', 'zone', 'region']
  },
  {
    canonicalKey: 'clusterName',
    label: 'Cluster / Komplek',
    category: 'location',
    requiredForWO: false,
    aliases: ['cluster name', 'cluster', 'nama cluster', 'komplek', 'perumahan', 'cluster_name']
  },
  {
    canonicalKey: 'appointmentDate',
    label: 'Appointment Date',
    category: 'core',
    requiredForWO: false,
    aliases: ['appointment date', 'tgl appointment', 'tanggal appointment', 'tgl janji', 'tanggal janji', 'visit date', 'schedule date', 'tgl kunjungan']
  },
  {
    canonicalKey: 'slotTime',
    label: 'Slot Time',
    category: 'core',
    requiredForWO: false,
    aliases: ['slot time', 'slot_time', 'waktu kunjungan', 'jadwal', 'slot', 'jam kunjungan']
  },
  {
    canonicalKey: 'ticketCategory',
    label: 'Kategori Tiket',
    category: 'core',
    requiredForWO: false,
    aliases: ['ticket category', 'kategori tiket', 'category', 'jenis tiket', 'jenis wo', 'tipe wo']
  },
  {
    canonicalKey: 'contactorName',
    label: 'Vendor / Kontraktor',
    category: 'mitra',
    requiredForWO: false,
    aliases: ['contactor name', 'contractor name', 'kontraktor', 'vendor', 'mitra', 'nama vendor', 'contractor']
  },
  {
    canonicalKey: 'installerName',
    label: 'Teknisi / Installer',
    category: 'mitra',
    requiredForWO: false,
    aliases: ['installer name', 'teknisi', 'installer', 'nama teknisi', 'nama installer', 'assigned to']
  },
  {
    canonicalKey: 'agentId',
    label: 'Agent ID',
    category: 'metadata',
    requiredForWO: false,
    aliases: ['agent id', 'agentid', 'agent_id', 'id agent', 'agent', 'kode agent', 'agent code']
  },
  {
    canonicalKey: 'fdtCode',
    label: 'FDT Code',
    category: 'technical',
    requiredForWO: false,
    aliases: ['fdt code', 'fdt', 'kode fdt', 'fdt_code']
  },
  {
    canonicalKey: 'fatCode',
    label: 'FAT Code',
    category: 'technical',
    requiredForWO: false,
    aliases: ['fat code', 'fat', 'kode fat', 'fat_code']
  }
];

export interface ImportParsedRow {
  rowIndex: number;
  raw: Record<string, string>;
  ticket?: Partial<Ticket>;
  isValidWO: boolean;
  isPartialData: boolean;
  isDuplicate: boolean;
  readyForWhatsApp: boolean;
  status: 'VALID' | 'PARSIAL' | 'DUPLIKAT' | 'INVALID';
  reasons: string[];
  agentId?: string;
}

export interface AgentIdSummary {
  count: number;
  uniqueCount: number;
  agentIds: string[];
  isAgentIdOnly: boolean;
}

export interface ImportValidationReport {
  totalRead: number;
  selectedSheet: string;
  allSheets: SheetAnalysis[];
  recognizedHeadersCount: number;
  usedColumnsCount: number;
  ignoredColumnsCount: number;
  validWOCount: number;
  partialDataCount: number;
  duplicateCount: number;
  invalidCount: number;
  readyForWhatsAppCount: number;
  agentIdSummary: AgentIdSummary;
  parsedRows: ImportParsedRow[];
  isAgentIdOnly: boolean;
  canCreateWOTickets: boolean;
  summaryMessage: string;
  headerMappings: Record<string, string>;
}

/**
 * Normalizes Indonesian phone number and validates for WhatsApp.
 */
export function validateAndNormalizePhone(rawPhone: string): { isValid: boolean; normalized: string } {
  if (!rawPhone) return { isValid: false, normalized: '' };
  let cleaned = String(rawPhone).replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+62')) {
    cleaned = '0' + cleaned.slice(3);
  } else if (cleaned.startsWith('62')) {
    cleaned = '0' + cleaned.slice(2);
  }

  // Indonesian mobile phones start with 08 and are 10 to 14 digits
  const isValid = /^08\d{8,12}$/.test(cleaned);
  return { isValid, normalized: cleaned };
}

/**
 * Validates coordinate pair (latitude, longitude)
 */
export function validateCoordinates(latRaw?: any, lngRaw?: any): { isValid: boolean; lat?: number; lng?: number } {
  if (latRaw === undefined || lngRaw === undefined || latRaw === '' || lngRaw === '') {
    return { isValid: false };
  }
  const lat = typeof latRaw === 'number' ? latRaw : parseFloat(String(latRaw).replace(',', '.'));
  const lng = typeof lngRaw === 'number' ? lngRaw : parseFloat(String(lngRaw).replace(',', '.'));

  if (isNaN(lat) || isNaN(lng)) return { isValid: false };

  // Latitude must be -90 to +90, Longitude -180 to +180
  // For Indonesia, latitude is roughly -11 to +6, longitude roughly 95 to 141
  if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && (lat !== 0 || lng !== 0)) {
    return { isValid: true, lat, lng };
  }
  return { isValid: false };
}

/**
 * Automatically creates column mapping preventing one column from mapping to multiple fields.
 */
export function buildHeaderMapping(
  rawHeaders: string[],
  customOverrides?: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  const mappedCanonicalKeys = new Set<string>();

  // 1. Apply custom overrides first
  if (customOverrides) {
    Object.entries(customOverrides).forEach(([rawH, canonKey]) => {
      if (canonKey && canonKey !== '__IGNORE__') {
        result[rawH] = canonKey;
        mappedCanonicalKeys.add(canonKey);
      }
    });
  }

  // 2. Map remaining headers automatically using exact & normalized aliases
  rawHeaders.forEach(rawH => {
    if (result[rawH]) return; // already mapped

    const normH = normalizeHeaderString(rawH);
    if (!normH || normH.startsWith('unnamed column')) return;

    for (const def of CANONICAL_FIELD_DEFINITIONS) {
      if (mappedCanonicalKeys.has(def.canonicalKey)) continue; // prevent duplicate mapping

      const isMatch = def.aliases.some(alias => {
        const normAlias = normalizeHeaderString(alias);
        return normH === normAlias || normH === normAlias.replace(/\s+/g, '');
      });

      if (isMatch) {
        result[rawH] = def.canonicalKey;
        mappedCanonicalKeys.add(def.canonicalKey);
        break;
      }
    }
  });

  return result;
}

/**
 * Evaluates and validates imported rows:
 * - WO Number and (Address OR Coordinates) required for routing tickets
 * - Phone required for WhatsApp
 * - Isolated handling for Agent ID: if file has only Agent ID, read all rows without creating fake tickets
 */
export function processImportRows(
  records: Record<string, string>[],
  headers: string[],
  sheetName: string,
  existingWoSet: Set<string> = new Set(),
  allSheets: SheetAnalysis[] = [],
  customMapping?: Record<string, string>
): ImportValidationReport {
  const headerMappings = buildHeaderMapping(headers, customMapping);

  const mappedFieldCount = Object.keys(headerMappings).length;
  const usedCanonicalKeys = new Set(Object.values(headerMappings));
  const ignoredColumnsCount = Math.max(0, headers.length - mappedFieldCount);

  // Check which canonical keys are present
  const hasWoNumberCol = usedCanonicalKeys.has('woNumber');
  const hasStreetCol = usedCanonicalKeys.has('streetName');
  const hasLatCol = usedCanonicalKeys.has('latitude');
  const hasLongCol = usedCanonicalKeys.has('longitude');
  const hasCustomerNameCol = usedCanonicalKeys.has('customerName');
  const hasAgentIdCol = usedCanonicalKeys.has('agentId');

  const allFoundAgentIds: string[] = [];
  const parsedRows: ImportParsedRow[] = [];
  const seenWosInCurrentBatch = new Set<string>();

  let validWOCount = 0;
  let partialDataCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;
  let readyForWhatsAppCount = 0;

  records.forEach((row, idx) => {
    const reasons: string[] = [];
    const partialTicket: Partial<Ticket> = {
      additionalFields: {},
      unmappedHeaders: []
    };

    let extractedAgentId = '';

    // Map columns
    Object.entries(row).forEach(([rawH, rawVal]) => {
      const canonKey = headerMappings[rawH];
      const val = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : '';

      if (!canonKey) {
        if (partialTicket.additionalFields) {
          partialTicket.additionalFields[rawH] = val;
        }
        return;
      }

      switch (canonKey) {
        case 'woNumber':
          partialTicket.woNumber = val.toUpperCase();
          break;
        case 'ticketNumber':
          partialTicket.ticketNumber = val.toUpperCase();
          break;
        case 'idCustomer':
          partialTicket.idCustomer = val;
          break;
        case 'customerName':
          partialTicket.customerName = val;
          break;
        case 'customerPhone':
          partialTicket.customerPhone = val;
          break;
        case 'customerContact2':
          partialTicket.customerContact2 = val;
          break;
        case 'streetName':
          partialTicket.streetName = val;
          break;
        case 'streetAlternatif':
          partialTicket.streetAlternatif = val;
          break;
        case 'latitude':
          if (val) partialTicket.latitude = parseFloat(val.replace(',', '.')) || undefined;
          break;
        case 'longitude':
          if (val) partialTicket.longitude = parseFloat(val.replace(',', '.')) || undefined;
          break;
        case 'area':
          partialTicket.area = val;
          break;
        case 'clusterName':
          partialTicket.clusterName = val;
          break;
        case 'appointmentDate':
          partialTicket.appointmentDate = val;
          partialTicket.date = val;
          break;
        case 'slotTime':
          partialTicket.slotTime = val;
          break;
        case 'ticketCategory':
          partialTicket.ticketCategory = val;
          break;
        case 'contactorName':
          partialTicket.contactorName = val;
          partialTicket.contractorName = val;
          break;
        case 'installerName':
          partialTicket.installerName = val;
          break;
        case 'agentId':
          partialTicket.agentId = val;
          extractedAgentId = val;
          break;
        case 'fdtCode':
          partialTicket.fdtCode = val.toUpperCase();
          break;
        case 'fatCode':
          partialTicket.fatCode = val.toUpperCase();
          break;
        default:
          if (partialTicket.additionalFields) {
            partialTicket.additionalFields[canonKey] = val;
          }
          break;
      }
    });

    if (extractedAgentId) {
      allFoundAgentIds.push(extractedAgentId);
    }

    // Validation rules
    const woNum = (partialTicket.woNumber || '').trim();
    const street = (partialTicket.streetName || '').trim();
    const coordCheck = validateCoordinates(partialTicket.latitude, partialTicket.longitude);
    const hasAddressOrCoords = street.length > 0 || coordCheck.isValid;

    const phoneCheck = validateAndNormalizePhone(partialTicket.customerPhone || '');
    if (phoneCheck.isValid) {
      partialTicket.customerPhoneNormalized = phoneCheck.normalized;
    }
    const isReadyForWa = phoneCheck.isValid;
    if (isReadyForWa) readyForWhatsAppCount++;

    // Check duplicate
    const isDuplicate = woNum ? (existingWoSet.has(woNum) || seenWosInCurrentBatch.has(woNum)) : false;
    if (woNum) seenWosInCurrentBatch.add(woNum);

    // Is it a valid WO ticket?
    // Rule: Must have WO Number AND (Address OR valid Lat/Lng)
    const isValidWO = Boolean(woNum && hasAddressOrCoords && !isDuplicate);

    let status: 'VALID' | 'PARSIAL' | 'DUPLIKAT' | 'INVALID' = 'INVALID';

    if (isDuplicate) {
      status = 'DUPLIKAT';
      duplicateCount++;
      reasons.push(`Nomor WO '${woNum}' sudah ada di database atau duplikat dalam file.`);
    } else if (isValidWO) {
      status = 'VALID';
      validWOCount++;
    } else if (extractedAgentId && !woNum && !hasAddressOrCoords) {
      status = 'PARSIAL';
      partialDataCount++;
      reasons.push('Data Parsial: Hanya memiliki nilai Agent ID.');
    } else if (woNum && !hasAddressOrCoords) {
      status = 'PARSIAL';
      partialDataCount++;
      reasons.push('Data Parsial: Memiliki WO Number tetapi belum memiliki alamat jalan atau koordinat.');
    } else {
      status = 'INVALID';
      invalidCount++;
      if (!woNum) reasons.push('Nomor WO kosong.');
      if (!hasAddressOrCoords) reasons.push('Alamat pelanggan (Street Name) atau pasangan koordinat (Lat/Long) tidak ada.');
    }

    parsedRows.push({
      rowIndex: idx + 1,
      raw: row,
      ticket: partialTicket,
      isValidWO,
      isPartialData: status === 'PARSIAL',
      isDuplicate,
      readyForWhatsApp: isReadyForWa,
      status,
      reasons,
      agentId: extractedAgentId || undefined
    });
  });

  const uniqueAgentIds = Array.from(new Set(allFoundAgentIds.filter(Boolean)));
  const isAgentIdOnly = hasAgentIdCol && !hasWoNumberCol && !hasStreetCol && !hasCustomerNameCol;

  const agentIdSummary: AgentIdSummary = {
    count: allFoundAgentIds.length,
    uniqueCount: uniqueAgentIds.length,
    agentIds: uniqueAgentIds,
    isAgentIdOnly
  };

  const canCreateWOTickets = validWOCount > 0;

  let summaryMessage = '';
  if (isAgentIdOnly) {
    summaryMessage = `File berhasil dibaca (${records.length} baris), tetapi HANYA berisi kolom Agent ID (${uniqueAgentIds.length} ID unik). File ditandai sebagai Data Parsial / Metadata. 0 tiket WO dibuat. Dataset WO existing tidak berubah.`;
  } else if (validWOCount > 0) {
    summaryMessage = `Berhasil membaca ${records.length} baris dari sheet '${sheetName}'. Ditemukan ${validWOCount} WO valid yang siap diimpor.`;
  } else {
    summaryMessage = `File berhasil dibaca (${records.length} baris), namun tidak ditemukan WO valid yang memenuhi syarat (WO Number + Alamat/Koordinat).`;
  }

  return {
    totalRead: records.length,
    selectedSheet: sheetName,
    allSheets,
    recognizedHeadersCount: mappedFieldCount,
    usedColumnsCount: usedCanonicalKeys.size,
    ignoredColumnsCount,
    validWOCount,
    partialDataCount,
    duplicateCount,
    invalidCount,
    readyForWhatsAppCount,
    agentIdSummary,
    parsedRows,
    isAgentIdOnly,
    canCreateWOTickets,
    summaryMessage,
    headerMappings
  };
}
