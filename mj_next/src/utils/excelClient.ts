import * as XLSX from 'xlsx';

export interface SheetAnalysis {
  sheetName: string;
  rowCount: number;
  headerRowIndex: number;
  headers: string[];
  score: number;
  hasWoNumber: boolean;
  hasAddressOrCoords: boolean;
  hasCustomerName: boolean;
  hasCustomerPhone: boolean;
  hasClusterOrArea: boolean;
  hasAppointmentDate: boolean;
  hasAgentId: boolean;
  isAgentIdOnly: boolean;
  isSummaryOrNote: boolean;
  isEmpty: boolean;
  keyColumnsFound: string[];
  sampleRows: Record<string, string>[];
  recommendationReason: string;
}

export interface WorkbookAnalysisResult {
  sheetNames: string[];
  selectedSheetName: string;
  selectedSheetAnalysis: SheetAnalysis;
  allSheets: SheetAnalysis[];
  isManualSelection: boolean;
  records: Record<string, string>[];
}

// Normalized aliases dictionary for header detection
const HEADER_KEYWORD_MAP: Record<string, string[]> = {
  woNumber: [
    'wo number', 'no wo', 'nomor wo', 'wo_number', 'wonumber', 'no. wo',
    'work order number', 'wo id', 'id wo', 'nomor order'
  ],
  address: [
    'street name', 'alamat', 'alamat pelanggan', 'street', 'address', 'jalan',
    'alamat lengkap', 'street_name', 'street alternatif', 'patokan'
  ],
  latitude: [
    'latitude', 'lat', 'lintang', 'koordinat lat', 'koordinat latitude', 'latitude pelanggan'
  ],
  longitude: [
    'longitude', 'long', 'lng', 'bujur', 'koordinat long', 'koordinat longitude', 'longitude pelanggan'
  ],
  customerName: [
    'customer name', 'nama customer', 'nama pelanggan', 'end user name', 'customer_name',
    'name', 'nama', 'cust name', 'pelanggan'
  ],
  customerPhone: [
    'customer phone', 'no hp', 'nomor hp', 'no telp', 'nomor telepon', 'phone',
    'telepon', 'mobile', 'contact', 'customer_phone', 'customer contact 1', 'cust phone'
  ],
  cluster: [
    'cluster name', 'cluster', 'nama cluster', 'komplek', 'perumahan', 'cluster_name'
  ],
  area: [
    'area', 'wilayah', 'regional', 'kota', 'city', 'zone', 'region'
  ],
  appointmentDate: [
    'appointment date', 'tgl appointment', 'tanggal appointment', 'tgl janji',
    'tanggal janji', 'visit date', 'schedule date', 'tgl kunjungan', 'jadwal'
  ],
  customerId: [
    'id customer', 'customer id', 'no pelanggan', 'id pelanggan', 'cust id', 'id_customer', 'customerid'
  ],
  agentId: [
    'agent id', 'agentid', 'agent_id', 'id agent', 'agent', 'kode agent', 'agent code'
  ],
  contractor: [
    'contactor name', 'contractor name', 'kontraktor', 'vendor', 'mitra', 'nama vendor'
  ],
  installer: [
    'installer name', 'teknisi', 'installer', 'nama teknisi', 'nama installer'
  ],
  ticketCategory: [
    'ticket category', 'kategori tiket', 'category', 'jenis tiket', 'jenis wo', 'tipe wo'
  ]
};

/**
 * Normalizes header string by removing special characters, excessive spaces, and lowering case.
 */
export function normalizeHeaderString(raw: string): string {
  if (!raw) return '';
  return String(raw)
    .toLowerCase()
    .trim()
    .replace(/[_\-\.]+/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Checks if a candidate header matches any of the keyword aliases.
 */
function headerMatchesKeywords(candidate: string, keywords: string[]): boolean {
  const norm = normalizeHeaderString(candidate);
  if (!norm) return false;
  return keywords.some(kw => {
    const normKw = normalizeHeaderString(kw);
    return norm === normKw || norm.includes(normKw) || normKw.includes(norm);
  });
}

/**
 * Clean cell value to string preserving leading zeros and dates.
 */
function formatCellValue(v: any): string {
  if (v === undefined || v === null) return '';
  if (v instanceof Date) {
    try {
      const y = v.getFullYear();
      const m = String(v.getMonth() + 1).padStart(2, '0');
      const d = String(v.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    } catch {
      return String(v);
    }
  }
  return String(v).trim();
}

/**
 * Inspects a single worksheet and calculates its score based on MoraJaws rules:
 * - WO Number is top priority (+1000)
 * - Address or (Lat and Long) (+500)
 * - Customer Name (+300)
 * - Customer Phone (+250)
 * - Cluster / Area (+200)
 * - Appointment Date (+150)
 * - Agent ID (+10)
 * Keberadaan Agent ID saja TIDAK BOLEH mengalahkan sheet yang memiliki WO Number dan Alamat.
 */
export function analyzeWorksheet(sheetName: string, worksheet: XLSX.WorkSheet): SheetAnalysis {
  if (!worksheet || !worksheet['!ref']) {
    return {
      sheetName,
      rowCount: 0,
      headerRowIndex: -1,
      headers: [],
      score: -10000,
      hasWoNumber: false,
      hasAddressOrCoords: false,
      hasCustomerName: false,
      hasCustomerPhone: false,
      hasClusterOrArea: false,
      hasAppointmentDate: false,
      hasAgentId: false,
      isAgentIdOnly: false,
      isSummaryOrNote: false,
      isEmpty: true,
      keyColumnsFound: [],
      sampleRows: [],
      recommendationReason: 'Sheet kosong tidak memiliki data.'
    };
  }

  // Convert raw 2D array of rows
  const rawMatrix: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: false
  });

  if (!rawMatrix || rawMatrix.length === 0) {
    return {
      sheetName,
      rowCount: 0,
      headerRowIndex: -1,
      headers: [],
      score: -10000,
      hasWoNumber: false,
      hasAddressOrCoords: false,
      hasCustomerName: false,
      hasCustomerPhone: false,
      hasClusterOrArea: false,
      hasAppointmentDate: false,
      hasAgentId: false,
      isAgentIdOnly: false,
      isSummaryOrNote: false,
      isEmpty: true,
      keyColumnsFound: [],
      sampleRows: [],
      recommendationReason: 'Sheet kosong tidak memiliki baris.'
    };
  }

  // Scan first 15 rows to find the actual header row
  let bestHeaderIndex = 0;
  let highestHeaderMatches = -1;
  const maxScanRows = Math.min(rawMatrix.length, 15);

  for (let r = 0; r < maxScanRows; r++) {
    const row = rawMatrix[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    let matches = 0;
    row.forEach(cell => {
      const cellStr = formatCellValue(cell);
      if (!cellStr) return;
      for (const key in HEADER_KEYWORD_MAP) {
        if (headerMatchesKeywords(cellStr, HEADER_KEYWORD_MAP[key])) {
          matches++;
          break;
        }
      }
    });

    if (matches > highestHeaderMatches) {
      highestHeaderMatches = matches;
      bestHeaderIndex = r;
    }
  }

  const rawHeadersRow = rawMatrix[bestHeaderIndex] || [];
  const headers: string[] = rawHeadersRow.map((cell: any, idx: number) => {
    const val = formatCellValue(cell);
    return val || `Unnamed_Column_${idx + 1}`;
  });

  // Evaluate column presence
  const hasWoNumber = headers.some(h => headerMatchesKeywords(h, HEADER_KEYWORD_MAP.woNumber));
  const hasStreet = headers.some(h => headerMatchesKeywords(h, HEADER_KEYWORD_MAP.address));
  const hasLat = headers.some(h => headerMatchesKeywords(h, HEADER_KEYWORD_MAP.latitude));
  const hasLong = headers.some(h => headerMatchesKeywords(h, HEADER_KEYWORD_MAP.longitude));
  const hasAddressOrCoords = hasStreet || (hasLat && hasLong);
  const hasCustomerName = headers.some(h => headerMatchesKeywords(h, HEADER_KEYWORD_MAP.customerName));
  const hasCustomerPhone = headers.some(h => headerMatchesKeywords(h, HEADER_KEYWORD_MAP.customerPhone));
  const hasClusterOrArea = headers.some(h =>
    headerMatchesKeywords(h, HEADER_KEYWORD_MAP.cluster) ||
    headerMatchesKeywords(h, HEADER_KEYWORD_MAP.area)
  );
  const hasAppointmentDate = headers.some(h => headerMatchesKeywords(h, HEADER_KEYWORD_MAP.appointmentDate));
  const hasCustomerId = headers.some(h => headerMatchesKeywords(h, HEADER_KEYWORD_MAP.customerId));
  const hasAgentId = headers.some(h => headerMatchesKeywords(h, HEADER_KEYWORD_MAP.agentId));
  const hasContractor = headers.some(h => headerMatchesKeywords(h, HEADER_KEYWORD_MAP.contractor));
  const hasInstaller = headers.some(h => headerMatchesKeywords(h, HEADER_KEYWORD_MAP.installer));
  const hasTicketCategory = headers.some(h => headerMatchesKeywords(h, HEADER_KEYWORD_MAP.ticketCategory));

  const keyColumnsFound: string[] = [];
  if (hasWoNumber) keyColumnsFound.push('WO Number');
  if (hasStreet) keyColumnsFound.push('Alamat/Street');
  if (hasLat && hasLong) keyColumnsFound.push('Koordinat (Lat/Long)');
  if (hasCustomerName) keyColumnsFound.push('Nama Pelanggan');
  if (hasCustomerPhone) keyColumnsFound.push('No HP');
  if (hasClusterOrArea) keyColumnsFound.push('Cluster/Area');
  if (hasAppointmentDate) keyColumnsFound.push('Appointment Date');
  if (hasCustomerId) keyColumnsFound.push('ID Customer');
  if (hasAgentId) keyColumnsFound.push('Agent ID');
  if (hasContractor) keyColumnsFound.push('Kontraktor');
  if (hasInstaller) keyColumnsFound.push('Teknisi');
  if (hasTicketCategory) keyColumnsFound.push('Kategori Tiket');

  // Total data rows below header
  const dataRowsCount = Math.max(0, rawMatrix.length - (bestHeaderIndex + 1));

  // Determine if sheet is summary / notes
  const lowerSheetName = sheetName.toLowerCase().trim();
  const summaryKeywords = ['summary', 'rekap', 'ringkasan', 'catatan', 'note', 'legend', 'keterangan', 'metadata', 'info'];
  const isSummaryOrNote = summaryKeywords.some(k => lowerSheetName.includes(k)) && !hasWoNumber;

  // Determine if it is Agent ID only
  const isAgentIdOnly = hasAgentId && !hasWoNumber && !hasAddressOrCoords && !hasCustomerName;

  // Calculate score
  let score = 0;
  if (hasWoNumber) score += 1000;
  if (hasAddressOrCoords) score += 500;
  if (hasCustomerName) score += 300;
  if (hasCustomerPhone) score += 250;
  if (hasClusterOrArea) score += 200;
  if (hasAppointmentDate) score += 150;
  if (hasCustomerId) score += 100;
  if (hasContractor) score += 80;
  if (hasInstaller) score += 50;
  if (hasTicketCategory) score += 50;

  // Agent ID gives minimal score (10 pts) so it NEVER defeats WO sheets
  if (hasAgentId) score += 10;

  // Small bonus for non-empty row count (max 50 pts)
  score += Math.min(dataRowsCount, 50);

  // Penalties
  if (dataRowsCount === 0) score -= 5000;
  if (isSummaryOrNote) score -= 800;

  let recommendationReason = '';
  if (hasWoNumber && hasAddressOrCoords) {
    recommendationReason = 'Rekomendasi Utama: Memiliki kolom WO Number dan Alamat/Koordinat lengkap untuk tiket routing.';
  } else if (hasWoNumber) {
    recommendationReason = 'Memiliki WO Number tetapi belum memiliki alamat/koordinat lengkap.';
  } else if (isAgentIdOnly) {
    recommendationReason = 'Data Parsial: Hanya memiliki kolom Agent ID tanpa WO Number dan Alamat pelanggan.';
  } else if (isSummaryOrNote) {
    recommendationReason = 'Sheet ringkasan / catatan tanpa data tiket WO.';
  } else {
    recommendationReason = 'Sheet tidak memiliki kolom Work Order standar.';
  }

  // Extract sample rows
  const sampleRows: Record<string, string>[] = [];
  const sampleLimit = Math.min(rawMatrix.length, bestHeaderIndex + 1 + 5);
  for (let r = bestHeaderIndex + 1; r < sampleLimit; r++) {
    const row = rawMatrix[r];
    if (!Array.isArray(row)) continue;
    const rowObj: Record<string, string> = {};
    headers.forEach((h, colIdx) => {
      rowObj[h] = formatCellValue(row[colIdx]);
    });
    sampleRows.push(rowObj);
  }

  return {
    sheetName,
    rowCount: dataRowsCount,
    headerRowIndex: bestHeaderIndex,
    headers,
    score,
    hasWoNumber,
    hasAddressOrCoords,
    hasCustomerName,
    hasCustomerPhone,
    hasClusterOrArea,
    hasAppointmentDate,
    hasAgentId,
    isAgentIdOnly,
    isSummaryOrNote,
    isEmpty: dataRowsCount === 0,
    keyColumnsFound,
    sampleRows,
    recommendationReason
  };
}

/**
 * Extracts raw records from a specific worksheet using its detected header row.
 */
export function extractRowsFromSheet(
  worksheet: XLSX.WorkSheet,
  analysis: SheetAnalysis
): Record<string, string>[] {
  if (!worksheet || analysis.isEmpty) return [];

  const rawMatrix: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: false
  });

  const headerRowIdx = analysis.headerRowIndex;
  const headers = analysis.headers;
  const records: Record<string, string>[] = [];

  for (let r = headerRowIdx + 1; r < rawMatrix.length; r++) {
    const row = rawMatrix[r];
    if (!Array.isArray(row)) continue;

    // Check if entire row is empty
    const hasAnyValue = row.some(cell => cell !== undefined && cell !== null && String(cell).trim() !== '');
    if (!hasAnyValue) continue;

    const rowObj: Record<string, string> = {};
    headers.forEach((h, colIdx) => {
      rowObj[h] = formatCellValue(row[colIdx]);
    });
    records.push(rowObj);
  }

  return records;
}

/**
 * Reads workbook buffer (XLSX, XLS, CSV) and performs smart multi-sheet analysis:
 * - Inspects all sheets
 * - Scores them deterministically
 * - Honors manualSheetName if provided by user!
 * - Automatically chooses the highest scoring WO sheet if not manually specified.
 */
export function readWorkbookWithSmartSheetDetection(
  fileBuffer: ArrayBuffer | Uint8Array | Buffer,
  manualSheetName?: string
): WorkbookAnalysisResult {
  const workbook = XLSX.read(fileBuffer, {
    type: Buffer.isBuffer(fileBuffer) ? 'buffer' : 'array',
    cellDates: true,
    raw: false
  });

  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length === 0) {
    throw new Error('Workbook tidak memiliki sheet yang dapat dibaca.');
  }

  const allSheets: SheetAnalysis[] = sheetNames.map(name => {
    return analyzeWorksheet(name, workbook.Sheets[name]);
  });

  let selectedSheetName = sheetNames[0];
  let isManualSelection = false;

  // 1. Honor manual selection if valid
  if (manualSheetName && sheetNames.includes(manualSheetName)) {
    selectedSheetName = manualSheetName;
    isManualSelection = true;
  } else {
    // 2. Sort by score descending to pick the best sheet
    // Do NOT automatically pick 'Data_WO' just by name!
    const sorted = [...allSheets].sort((a, b) => b.score - a.score);
    selectedSheetName = sorted[0].sheetName;
  }

  const selectedAnalysis = allSheets.find(s => s.sheetName === selectedSheetName) || allSheets[0];
  const worksheet = workbook.Sheets[selectedSheetName];
  const records = extractRowsFromSheet(worksheet, selectedAnalysis);

  return {
    sheetNames,
    selectedSheetName,
    selectedSheetAnalysis: selectedAnalysis,
    allSheets,
    isManualSelection,
    records
  };
}
