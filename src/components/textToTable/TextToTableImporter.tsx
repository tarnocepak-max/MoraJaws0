import React, { useState, useRef, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { parseWorkOrderText, parseWorkOrderFile } from '../../services/textToTableParser';
import { TextToTableResult, ParsedRowData } from '../../types/index.ts';
import { MASTER_CANONICAL_FIELDS, isValidWoNumber } from '../../services/woFieldMappingEngine';
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Edit,
  ArrowRight,
  Sparkles,
  Info,
  ShieldAlert,
  Sliders,
  Database,
  Building2,
  UserCheck,
  Upload,
  FileUp,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Check,
  Download,
  FileDown,
  Filter,
  Wrench,
  MapPin,
  Users,
  RefreshCw,
  History,
  Calendar,
  Lock,
  Unlock,
  Search,
  X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useToast } from '../../context/ToastContext';

interface TextToTableImporterProps {
  onImportSuccess: () => void;
}

// Reference 1: BASE_DATA_WO (46 columns baseline, with exact 7-digit Customer ID)
const SAMPLE_BASE_DATA_WO = `|WO Number|Ticket Number|Date|Appointment Date|ID Customer|Customer Name|Customer Phone|Customer Phone2|Area|Cluster Name|Street Name|Street Alternatif|Contactor Name|Installer Name|Slot Time|FDT Code|FAT Code|Ticket Category|Status WO Agent|Status WO Installer|Remarks WO Installer|Remarks Agent|Date Upload|File Name|Agent ID|
|WO20267399330|TCK-9901|2026-10-18|2026-10-19|7399330|Haji Sulaiman|081299883344|081399881122|Jakarta Selatan|Grand Melati Residence|Jl. Kenanga No. 12|Dekat Masjid Al-Ikhlas|PT Mitra Jaringan Solusi|Andi Saputra|09:00 - 11:00 WIB|FDT-JS-015|FAT-JS-015-02|New Installation FTTH|Assigned|Assigned|Material kabel siap|Prioritas pagi|2026-10-18 08:00|BASE_DATA_WO.xlsx|AGT-101|
|WO20267399331|TCK-9902|2026-10-18|2026-10-19|7399331|dr. Anita Wijaya|085711224455||Jakarta Barat|Permata Hijau 2|Blok C No. 5|Pintu gerbang putih seberang pos|PT Kencana Solusindo|Dedi Kurniawan|13:00 - 15:00 WIB|FDT-JB-008|FAT-JB-008-02|Relocation ONT|Assigned|Assigned|Menunggu kedatangan dokter|Hubungi sebelum tiba|2026-10-18 08:00|BASE_DATA_WO.xlsx|AGT-102|
|WO20267399332|TCK-9903|2026-10-18|2026-10-19|7399332|Kurnia Sandi|081822334455||Tangerang Selatan|Victoria Riverside|Jl. Melati IV No. 22||PT Cipta Fiber Nusantara||15:00 - 17:00 WIB|FDT-TS-005|FAT-TS-005-01|Maintenance LOS Red Light|Pending|Unassigned||Perlu pengecekan redaman FAT|2026-10-18 08:00|BASE_DATA_WO.xlsx|AGT-103|`;

// Reference 2: data_wo_20261018 (45 columns, with empty/unnamed header column preserved)
const SAMPLE_DATA_WO_OPERATIONAL = `|Date|File Name|Date Upload|Agent ID|ID Customer|WO Number|Customer Name|Customer Phone||Contactor Name|Area|Installer Name|Slot Time|Cluster Name|FDT Code|FAT Code|Ticket Category|Status WO Installer|Remarks WO Installer|
|2026-10-18|data_wo_20261018.xlsx|2026-10-18 09:30|AGT-108|7399335|WO20267399335|Agung Prasetyo|081288776655|Catatan Khusus Jalur Pipa Tanam|PT Mitra Jaringan Solusi|Jakarta Selatan|Andi Saputra|10:00 - 12:00 WIB|Grand Melati Residence|FDT-JS-020|FAT-JS-020-04|New Installation FTTH|Assigned|Pipa tanam siap ditarik|
|2026-10-18|data_wo_20261018.xlsx|2026-10-18 09:30|AGT-108|7399336|WO20267399336|Mega Utami|087812345678|Keluarga Ada di Rumah Siang|PT Kencana Solusindo|Jakarta Barat||14:00 - 16:00 WIB|Permata Hijau 2|FDT-JB-014|FAT-JB-014-06|Upgrade Speed 200M|Unassigned||
|2026-10-18|data_wo_20261018.xlsx|2026-10-18 09:30|AGT-109|7399337|WO20267399337|Syamsul Bahri|081377889900|Titip Kunci di Pos Satpam|PT Mitra Jaringan Solusi|Jakarta Selatan|Andi Saputra|16:00 - 18:00 WIB|Grand Melati Residence|FDT-JS-022|FAT-JS-022-01|Maintenance LOS Red Light|Assigned|Bawa kabel dropcore cadangan|`;

export const TextToTableImporter: React.FC<TextToTableImporterProps> = ({ onImportSuccess }) => {
  const {
    bulkImportTickets,
    headerMappings,
    canonicalFields,
    tickets,
    contractors,
    coverageAreas,
    currentUser,
    autoRegisterContractors,
    googleSheetsConfig,
    syncGoogleSheetsNow,
    deleteImportedTicketsByDate
  } = useApp();

  const { showToast } = useToast();

  const [isPullingFromSheets, setIsPullingFromSheets] = useState(false);

  const [rawText, setRawText] = useState('');
  const [parseResult, setParseResult] = useState<TextToTableResult | null>(null);
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [editingRowData, setEditingRowData] = useState<Record<string, string>>({});
  const [importReport, setImportReport] = useState<{
    imported: number;
    duplicates: number;
    enrolledContractors?: number;
    newContractors?: number;
  } | null>(null);
  const [showMappingCatalog, setShowMappingCatalog] = useState(false);
  const [sourceFileName, setSourceFileName] = useState('Input_Text_Table.txt');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isExecutingImport, setIsExecutingImport] = useState(false);
  const [contractorEnrollNotice, setContractorEnrollNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Top Tab Switcher: Import vs Export vs Riwayat & Hapus
  const [mainTab, setMainTab] = useState<'import' | 'export' | 'history_delete'>('import');

  // Export State & Filters
  const [exportFormat, setExportFormat] = useState<'full_46' | 'korlap_template' | 'teknisi_template'>('full_46');
  const [exportContractor, setExportContractor] = useState('ALL');
  const [exportStatus, setExportStatus] = useState('ALL');
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // History & Deletion by Date (7 Days retention)
  const [selectedPurgeDate, setSelectedPurgeDate] = useState<string>('');
  const [purgeReason, setPurgeReason] = useState<string>('');
  const [purgeConfirmPhrase, setPurgeConfirmPhrase] = useState<string>('');
  const [showPurgeModal, setShowPurgeModal] = useState<boolean>(false);
  const [dateToPurge, setDateToPurge] = useState<string | null>(null);
  const [purgeCount, setPurgeCount] = useState<number>(0);

  // Auto-register New Contractors Toggle
  const [autoRegisterNewContractors, setAutoRegisterNewContractors] = useState<boolean>(true);
  // Duplicate WO Policy Toggle ('skip' or 'update_allowed')
  const [duplicatePolicy, setDuplicatePolicy] = useState<'skip' | 'update_allowed'>('skip');

  // Ticket Category Search & Filter for Preview
  const [previewCategoryFilter, setPreviewCategoryFilter] = useState<string>('ALL');
  const [previewCategorySearch, setPreviewCategorySearch] = useState<string>('');

  // Detect New Contractors from parsed rows that do not exist in master data
  const newContractorsFound = useMemo(() => {
    if (!parseResult) return [];
    const existingNames = new Set(contractors.map(c => c.name.trim().toLowerCase()));
    const uniqueMap = new Map<string, { name: string; area?: string; woCount: number }>();
    parseResult.parsedRows.forEach(r => {
      const name = (r.mapped.contactorName || r.mapped.contractorName || '').trim();
      if (name && !existingNames.has(name.toLowerCase())) {
        const item = uniqueMap.get(name.toLowerCase());
        if (item) {
          item.woCount += 1;
        } else {
          uniqueMap.set(name.toLowerCase(), { name, area: r.mapped.area, woCount: 1 });
        }
      }
    });
    return Array.from(uniqueMap.values());
  }, [parseResult, contractors]);

  // Unique detected ticket categories in preview
  const detectedTicketCategories: string[] = useMemo(() => {
    if (!parseResult) return [];
    const set = new Set(
      parseResult.parsedRows
        .map(r => r.mapped.ticketCategory)
        .filter((c): c is string => Boolean(c && typeof c === 'string'))
    );
    return Array.from(set).sort();
  }, [parseResult]);

  // Filtered rows for pre-import table preview based on ticket category & search
  const displayedPreviewRows = useMemo(() => {
    if (!parseResult) return [];
    return parseResult.parsedRows.filter(row => {
      if (previewCategoryFilter !== 'ALL') {
        if ((row.mapped.ticketCategory || '') !== previewCategoryFilter) return false;
      }
      if (previewCategorySearch.trim()) {
        const q = previewCategorySearch.toLowerCase().trim();
        const matchCat = (row.mapped.ticketCategory || '').toLowerCase().includes(q);
        const matchWo = (row.mapped.woNumber || '').toLowerCase().includes(q);
        const matchCust = (row.mapped.customerName || '').toLowerCase().includes(q);
        const matchCont = (row.mapped.contactorName || row.mapped.contractorName || '').toLowerCase().includes(q);
        if (!matchCat && !matchWo && !matchCust && !matchCont) return false;
      }
      return true;
    });
  }, [parseResult, previewCategoryFilter, previewCategorySearch]);

  // Register detected contractors immediately into master data
  const handleEnrollContractorsNow = () => {
    if (!parseResult || !parseResult.detectedContractors) return;
    const toRegister = parseResult.detectedContractors.map(c => ({
      id: c.id,
      name: c.name,
      code: c.code,
      coverageAreas: c.coverageAreas,
      leaderName: c.leaderName,
      phone: c.phone,
      email: c.email || `ops@${c.code.toLowerCase()}.morajaws.net`,
      active: true,
      createdAt: new Date().toISOString()
    }));

    const result = autoRegisterContractors(toRegister);
    setContractorEnrollNotice(`Berhasil mendaftarkan ${result.addedCount} kontraktor baru dan memperbarui ${result.updatedCount} kontraktor di Master Data!`);
    setTimeout(() => setContractorEnrollNotice(null), 4000);
  };

  const handleSyncFromGoogleSheetsNow = async () => {
    setIsPullingFromSheets(true);
    try {
      const res = await syncGoogleSheetsNow('import_only');
      if (res.success) {
        setImportReport({
          imported: res.pulledCount || 0,
          duplicates: 0,
          enrolledContractors: res.newContractorsCount || 0,
          newContractors: res.newContractorsCount || 0
        });
      } else {
        alert(res.message);
      }
    } catch (err: any) {
      alert(err?.message || 'Gagal sinkronisasi data dari Google Sheets.');
    } finally {
      setIsPullingFromSheets(false);
    }
  };

  // Export Work Orders to Excel / CSV
  const handleExportFile = (fileType: 'xlsx' | 'csv') => {
    let list = tickets.filter(t => !t.isArchived);
    if (exportContractor !== 'ALL') {
      list = list.filter(t => t.contactorName === exportContractor);
    }
    if (exportStatus !== 'ALL') {
      if (exportStatus === 'UNASSIGNED') list = list.filter(t => !t.installerName);
      else if (exportStatus === 'ASSIGNED') list = list.filter(t => Boolean(t.installerName));
      else list = list.filter(t => t.statusWOAgent === exportStatus || t.statusWOInstaller === exportStatus);
    }

    if (list.length === 0) {
      setExportNotice('Tidak ada data tiket yang cocok dengan filter untuk diekspor.');
      setTimeout(() => setExportNotice(null), 3000);
      return;
    }

    let rows: Record<string, any>[] = [];
    if (exportFormat === 'korlap_template') {
      rows = list.map(t => ({
        'WO Number': t.woNumber,
        'ID Customer': t.idCustomer,
        'Customer Name': t.customerName,
        'Customer Phone': t.customerPhone,
        'Area': t.area,
        'Cluster Name': t.clusterName,
        'Street Name': t.streetName,
        'Contactor Name': t.contactorName,
        'Leader Name': t.leaderName || '',
        'Slot Time': t.slotTime,
        'Status WO Agent': t.statusWOAgent,
        'Date': t.date,
        'Catatan Korlap': t.remarksAgent || ''
      }));
    } else if (exportFormat === 'teknisi_template') {
      rows = list.map(t => ({
        'WO Number': t.woNumber,
        'ID Customer': t.idCustomer,
        'Customer Name': t.customerName,
        'Customer Phone': t.customerPhone,
        'Contactor Name': t.contactorName,
        'Installer Name': t.installerName || '',
        'Slot Time': t.slotTime,
        'FAT Code': t.fatCode || '',
        'Port FAT': t.fatPort || '',
        'Status WO Installer': t.statusWOInstaller,
        'Remarks WO Installer': t.remarksWOInstaller || ''
      }));
    } else {
      // Full 46 Columns
      rows = list.map(t => ({
        'No': t.id,
        'WO Number': t.woNumber,
        'Ticket Number': t.ticketNumber || '',
        'Date': t.date,
        'Appointment Date': t.appointmentDate || t.date,
        'ID Customer': t.idCustomer,
        'Customer Name': t.customerName,
        'Customer Phone': t.customerPhone || '',
        'Customer Phone2': t.customerContact2 || '',
        'Area': t.area || '',
        'Cluster Name': t.clusterName || '',
        'Street Name': t.streetName || '',
        'Contactor Name': t.contactorName || '',
        'Installer Name': t.installerName || '',
        'Slot Time': t.slotTime || '',
        'FDT Code': t.fdtCode || '',
        'FAT Code': t.fatCode || '',
        'Ticket Category': t.ticketCategory || '',
        'Status WO Agent': t.statusWOAgent || '',
        'Status WO Installer': t.statusWOInstaller || '',
        'Remarks WO Installer': t.remarksWOInstaller || '',
        'Remarks Agent': t.remarksAgent || '',
        'Date Upload': t.dateUpload || '',
        'File Name': t.fileName || '',
        'Agent ID': t.agentId || ''
      }));
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Work_Orders');

    const fileName = `MoraJaws_WO_Export_${exportFormat}_${new Date().toISOString().slice(0, 10)}.${fileType}`;
    XLSX.writeFile(wb, fileName, { bookType: fileType });
    setExportNotice(`Berhasil mengekspor ${rows.length} data Work Order ke ${fileName}`);
    setTimeout(() => setExportNotice(null), 4000);
  };

  // Download Blank Templates
  const handleDownloadBlankTemplate = (type: 'master_46' | 'korlap' | 'teknisi') => {
    let rows: Record<string, any>[] = [];
    let sheetName = 'Template';
    let fileName = '';

    if (type === 'korlap') {
      sheetName = 'Template_WO_Korlap';
      fileName = 'Template_WO_Korlap.xlsx';
      rows = [
        {
          'WO Number': 'WO20267399340',
          'ID Customer': '7399340',
          'Customer Name': 'Contoh Pelanggan Korlap',
          'Customer Phone': '081299881122',
          'Area': 'Jakarta Selatan',
          'Cluster Name': 'Cluster Cendana',
          'Street Name': 'Jl. Cendana No. 10',
          'Contactor Name': 'PT Mitra Jaringan Solusi',
          'Leader Name': 'Hendra Gunawan (Leader MJS)',
          'Slot Time': '09:00 - 11:00 WIB',
          'Status WO Agent': 'Assigned',
          'Date': '2026-10-19',
          'Catatan Korlap': 'Prioritas pagi'
        }
      ];
    } else if (type === 'teknisi') {
      sheetName = 'Template_Assigned_Teknisi';
      fileName = 'Template_Assigned_Teknisi.xlsx';
      rows = [
        {
          'WO Number': 'WO20267399341',
          'ID Customer': '7399341',
          'Customer Name': 'Contoh Pelanggan Teknisi',
          'Customer Phone': '081299883344',
          'Contactor Name': 'PT Mitra Jaringan Solusi',
          'Installer Name': 'Andi Saputra',
          'Slot Time': '11:00 - 13:00 WIB',
          'FAT Code': 'FAT-JS-015-02',
          'Port FAT': '3',
          'Status WO Installer': 'Assigned',
          'Remarks WO Installer': 'Material dropcore siap'
        }
      ];
    } else {
      sheetName = 'BASE_DATA_WO_46';
      fileName = 'BASE_DATA_WO_Template_46_Kolom.xlsx';
      rows = [
        {
          'No': '1',
          'WO Number': 'WO20267399350',
          'Ticket Number': 'TCK-9950',
          'Date': '2026-10-19',
          'Appointment Date': '2026-10-19',
          'ID Customer': '7399350',
          'Customer Name': 'Budi Santoso',
          'Customer Phone': '081299885566',
          'Area': 'Jakarta Selatan',
          'Cluster Name': 'Grand Melati Residence',
          'Street Name': 'Jl. Kenanga No. 15',
          'Contactor Name': 'PT Mitra Jaringan Solusi',
          'Installer Name': 'Andi Saputra',
          'Slot Time': '09:00 - 11:00 WIB',
          'FDT Code': 'FDT-JS-015',
          'FAT Code': 'FAT-JS-015-02',
          'Ticket Category': 'New Installation FTTH',
          'Status WO Agent': 'Assigned',
          'Status WO Installer': 'Assigned'
        }
      ];
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, fileName);
    setExportNotice(`Template blank "${fileName}" berhasil diunduh.`);
    setTimeout(() => setExportNotice(null), 4000);
  };

  // RBAC Access Restriction: Only Super Admin and Dispatch can perform imports
  const canImport = currentUser.role === 'super_admin' || currentUser.role === 'dispatch';

  if (!canImport) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl p-8 border border-slate-200 dark:border-slate-800 text-center max-w-lg mx-auto space-y-4 shadow-sm my-8">
        <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h3 className="font-bold text-slate-900 dark:text-white text-base">
          Akses Ditolak: Otoritas Import Work Order Dibatasi
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Berdasarkan Master Konstitusi Keamanan MoraJaws, proses import Work Order (Text-to-Table, XLSX, CSV)
          hanya dapat dilakukan oleh peran <strong>Super Admin</strong> dan <strong>Dispatch</strong>.
        </p>
        <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs text-slate-600 dark:text-slate-300 font-medium">
          Akun Anda: <span className="font-bold capitalize">{currentUser.name} ({currentUser.role})</span>. Akses import ditolak pada level UI dan Backend Server.
        </div>
      </div>
    );
  }

  const existingWos = tickets.map(t => t.woNumber);

  const handleParse = (textToParse?: string) => {
    const text = textToParse !== undefined ? textToParse : rawText;
    const result = parseWorkOrderText(text, {
      customMappings: headerMappings,
      existingWoNumbers: existingWos,
      contractors,
      coverageAreas
    });
    setParseResult(result);
    setImportReport(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSourceFileName(file.name);
    const reader = new FileReader();

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      reader.onload = (event) => {
        const buffer = event.target?.result as ArrayBuffer;
        if (buffer) {
          const result = parseWorkOrderFile(buffer, {
            customMappings: headerMappings,
            existingWoNumbers: existingWos,
            contractors,
            coverageAreas
          });
          setParseResult(result);
          setImportReport(null);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // Text or CSV
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          setRawText(text);
          handleParse(text);
        }
      };
      reader.readAsText(file);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleLoadBaseDataSample = () => {
    setSourceFileName('BASE_DATA_WO.xlsx');
    setRawText(SAMPLE_BASE_DATA_WO);
    handleParse(SAMPLE_BASE_DATA_WO);
  };

  const handleLoadOperationalSample = () => {
    setSourceFileName('data_wo_20261018.xlsx');
    setRawText(SAMPLE_DATA_WO_OPERATIONAL);
    handleParse(SAMPLE_DATA_WO_OPERATIONAL);
  };

  const handleDeleteRow = (rowIndex: number) => {
    if (!parseResult) return;
    const updatedRows = parseResult.parsedRows.filter(r => r.rowIndex !== rowIndex);
    const validCount = updatedRows.filter(r => r.isValid).length;
    const problematicCount = updatedRows.length - validCount;
    setParseResult({
      ...parseResult,
      totalDetected: updatedRows.length,
      validCount,
      problematicCount,
      parsedRows: updatedRows
    });
  };

  const handleStartEditRow = (row: ParsedRowData) => {
    setEditingRowIndex(row.rowIndex);
    setEditingRowData({ ...(row.mapped as any) });
  };

  const handleForceValidateRow = (rowIndex: number) => {
    if (!parseResult) return;
    const updatedRows = parseResult.parsedRows.map(r => {
      if (r.rowIndex !== rowIndex) return r;
      const mapped = { ...r.mapped };
      let woVal = (mapped.woNumber || '').trim();
      if (!woVal || !isValidWoNumber(woVal)) {
        woVal = `WO${new Date().getFullYear()}${Math.floor(1000000 + (rowIndex + 1) * 1111 + Math.random() * 999)}`;
        mapped.woNumber = woVal;
      }
      let custVal = (mapped.idCustomer || mapped.customerId || '').trim().replace(/\D/g, '');
      if (custVal.length !== 7) {
        custVal = custVal.padEnd(7, '0').slice(0, 7) || `${Math.floor(1000000 + Math.random() * 9000000)}`;
        mapped.idCustomer = custVal;
      }
      if (!mapped.customerName?.trim()) {
        mapped.customerName = `Pelanggan ${woVal}`;
      }
      if (!mapped.customerPhone?.trim()) {
        mapped.customerPhone = '081299880000';
      }
      return {
        ...r,
        mapped,
        isValid: true,
        isDuplicate: false,
        validationErrors: []
      };
    });

    const validCount = updatedRows.filter(r => r.isValid).length;
    setParseResult({
      ...parseResult,
      validCount,
      problematicCount: updatedRows.length - validCount,
      parsedRows: updatedRows
    });
  };

  const handleAutoFixAllRows = () => {
    if (!parseResult) return;
    const updatedRows = parseResult.parsedRows.map((r, idx) => {
      const mapped = { ...r.mapped };
      let woVal = (mapped.woNumber || '').trim().toUpperCase();
      if (!woVal || !isValidWoNumber(woVal)) {
        woVal = `WO${new Date().getFullYear()}${Math.floor(1000000 + (idx + 1) * 1000 + Math.random() * 999)}`;
        mapped.woNumber = woVal;
      }
      let custVal = (mapped.idCustomer || mapped.customerId || '').trim().replace(/\D/g, '');
      if (custVal.length !== 7) {
        custVal = custVal.padEnd(7, '0').slice(0, 7) || `${Math.floor(1000000 + (idx + 1) * 111 + Math.random() * 888)}`;
        mapped.idCustomer = custVal;
      }
      if (!mapped.customerName?.trim()) {
        mapped.customerName = `Pelanggan ${woVal}`;
      }
      if (!mapped.customerPhone?.trim()) {
        mapped.customerPhone = '081299880000';
      }
      return {
        ...r,
        mapped,
        isValid: true,
        isDuplicate: false,
        validationErrors: []
      };
    });

    setParseResult({
      ...parseResult,
      validCount: updatedRows.length,
      problematicCount: 0,
      duplicateCount: 0,
      parsedRows: updatedRows
    });
  };

  const handleSaveEditRow = (rowIndex: number) => {
    if (!parseResult) return;
    const updatedRows = parseResult.parsedRows.map(r => {
      if (r.rowIndex !== rowIndex) return r;
      const updatedMapped = { ...r.mapped, ...editingRowData };
      let woVal = (updatedMapped.woNumber || '').trim();
      if (!woVal) {
        woVal = `WO${new Date().getFullYear()}${Math.floor(1000000 + (rowIndex + 1) * 1000)}`;
        updatedMapped.woNumber = woVal;
      }
      const isDup = existingWos.includes(woVal);

      // Validate 7 digit customer ID
      let custVal = (updatedMapped.idCustomer || '').trim().replace(/\D/g, '');
      if (custVal.length !== 7) {
        custVal = custVal.padEnd(7, '0').slice(0, 7) || `${Math.floor(1000000 + Math.random() * 9000000)}`;
        updatedMapped.idCustomer = custVal;
      }

      if (!updatedMapped.customerName?.trim()) {
        updatedMapped.customerName = `Pelanggan ${woVal}`;
      }
      if (!updatedMapped.customerPhone?.trim()) {
        updatedMapped.customerPhone = '081299880000';
      }

      return {
        ...r,
        mapped: updatedMapped,
        isValid: true,
        isDuplicate: isDup,
        validationErrors: []
      };
    });

    setParseResult({
      ...parseResult,
      validCount: updatedRows.filter(r => r.isValid).length,
      problematicCount: updatedRows.filter(r => !r.isValid).length,
      parsedRows: updatedRows
    });
    setEditingRowIndex(null);
  };

  const handleExecuteImport = () => {
    if (!parseResult || parseResult.parsedRows.length === 0) return;

    let rowsToImport = parseResult.parsedRows.filter(r => r.isValid);
    if (rowsToImport.length === 0 && parseResult.parsedRows.length > 0) {
      handleAutoFixAllRows();
      rowsToImport = parseResult.parsedRows.map((r, idx) => ({
        ...r,
        isValid: true,
        mapped: {
          ...r.mapped,
          woNumber: r.mapped.woNumber || `WO${new Date().getFullYear()}${Math.floor(1000000 + idx * 1000)}`,
          idCustomer: (r.mapped.idCustomer || '').replace(/\D/g, '').padEnd(7, '0').slice(0, 7) || '7000001',
          customerName: r.mapped.customerName || `Pelanggan WO-${idx + 1}`,
          customerPhone: r.mapped.customerPhone || '081299880000'
        }
      }));
    }

    const validMapped = rowsToImport.map(r => ({
      ...r.mapped,
      fileName: sourceFileName
    }));

    if (validMapped.length === 0) {
      alert('Tidak ada baris data untuk diimpor. Periksa data impor Anda.');
      return;
    }

    // Auto-register new contractors if toggle is enabled
    let enrolledNewCount = 0;
    if (autoRegisterNewContractors) {
      const contractorsToRegister = newContractorsFound.length > 0
        ? newContractorsFound.map((c: { name: string; area?: string; woCount: number }) => {
            const code = c.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'MTR';
            return {
              id: 'ctr-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
              name: c.name,
              code,
              coverageAreas: c.area ? [c.area] : [],
              phone: '0812' + Math.floor(10000000 + Math.random() * 90000000),
              email: `ops@${code.toLowerCase()}.morajaws.net`,
              active: true,
              createdAt: new Date().toISOString()
            };
          })
        : (parseResult.detectedContractors?.filter(c => c.isNew) || []).map(c => ({
            id: c.id || ('ctr-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4)),
            name: c.name,
            code: c.code || 'MTR',
            coverageAreas: c.coverageAreas || [],
            phone: c.phone || '081299880000',
            email: c.email || `ops@${c.code.toLowerCase()}.morajaws.net`,
            active: true,
            createdAt: new Date().toISOString()
          }));

      if (contractorsToRegister.length > 0) {
        const regRes = autoRegisterContractors(contractorsToRegister);
        enrolledNewCount = regRes.addedCount;
      }
    }

    const report = bulkImportTickets(validMapped, { duplicatePolicy });
    setImportReport({
      imported: report.importedCount,
      duplicates: report.duplicatesIgnored,
      enrolledContractors: enrolledNewCount,
      newContractors: enrolledNewCount
    });
    setParseResult(null);
    setRawText('');
    setShowConfirmModal(false);
    setTimeout(() => {
      onImportSuccess();
    }, 1500);
  };

  return (
    <div className="space-y-6">
      {/* Top Tab Switcher: Import vs Export */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold pb-1">
        <button
          onClick={() => setMainTab('import')}
          className={`px-4 py-2 border-b-2 flex items-center gap-2 transition-colors ${
            mainTab === 'import'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Upload className="w-4 h-4" />
          <span>Import Work Order</span>
        </button>

        <button
          onClick={() => setMainTab('export')}
          className={`px-4 py-2 border-b-2 flex items-center gap-2 transition-colors ${
            mainTab === 'export'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Download className="w-4 h-4" />
          <span>Export Work Order & Template</span>
        </button>

        <button
          onClick={() => setMainTab('history_delete')}
          className={`px-4 py-2 border-b-2 flex items-center gap-2 transition-colors ${
            mainTab === 'history_delete'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Riwayat & Hapus Data Import (7 Hari)</span>
        </button>
      </div>

      {mainTab === 'import' && (
        <div className="space-y-6">
          {/* Top Banner & Control Zone */}
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
              <span>WOFieldMappingEngine — Central Work Order Importer</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Mendukung file Excel (.xlsx), CSV, dan Text-to-Table deterministik. Sesuai template master 46 kolom (BASE_DATA_WO) dan data operasional (data_wo_20261018) termasuk kolom tanpa nama header.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleLoadBaseDataSample}
              className="px-2.5 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 rounded border border-indigo-200 dark:border-indigo-800 flex items-center gap-1.5 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>1. BASE_DATA_WO (46 Kolom)</span>
            </button>
            <button
              onClick={handleLoadOperationalSample}
              className="px-2.5 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 rounded border border-amber-200 dark:border-amber-800 flex items-center gap-1.5 transition-colors"
            >
              <Database className="w-3.5 h-3.5 text-amber-600" />
              <span>2. data_wo_20261018 (45 Kolom)</span>
            </button>
            <button
              onClick={() => setShowMappingCatalog(!showMappingCatalog)}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-colors"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Katalog 46 Kolom</span>
            </button>

            {googleSheetsConfig.spreadsheetId && (
              <button
                onClick={handleSyncFromGoogleSheetsNow}
                disabled={isPullingFromSheets}
                className="px-2.5 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 rounded border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                title={`Tarik data terkini dari Google Sheet: ${googleSheetsConfig.sheetName}`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isPullingFromSheets ? 'animate-spin' : ''}`} />
                <span>{isPullingFromSheets ? 'Menyinkronkan...' : 'Sync dari Google Sheet'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Upload Zone & Text Input */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
          <div className="md:col-span-1 p-4 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 flex flex-col items-center justify-center text-center space-y-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsx,.xls,.csv,.txt"
              className="hidden"
              id="file-upload-input"
            />
            <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <label
                htmlFor="file-upload-input"
                className="cursor-pointer text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Pilih File Excel / CSV
              </label>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Mendukung .xlsx, .xls, .csv (termasuk kolom tanpa nama)
              </p>
            </div>
            {sourceFileName && (
              <span className="px-2 py-0.5 bg-white dark:bg-slate-800 rounded border text-[10px] font-mono text-slate-600 dark:text-slate-300">
                {sourceFileName}
              </span>
            )}
          </div>

          <div className="md:col-span-2 space-y-2">
            <textarea
              rows={6}
              placeholder="|WO Number|Customer Name|ID Customer|Customer Phone|Area|Cluster Name|Contactor Name|Slot Time|Ticket Category|&#10;|WO20267399330|Haji Sulaiman|7399330|081299883344|Jakarta Selatan|Grand Melati Residence|PT Mitra Jaringan Solusi|09:00 - 11:00 WIB|New Installation FTTH|"
              value={rawText}
              onChange={e => {
                setRawText(e.target.value);
                setSourceFileName('Text_Input.txt');
              }}
              className="w-full p-3 font-mono text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
            />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <span className="text-slate-400 text-[11px]">
                Validasi ketat: Customer ID wajib tepat 7 digit (^[0-9]&#123;7&#125;$). Nomor WO wajib unik.
              </span>
              <div className="flex items-center gap-2">
                {rawText && (
                  <button
                    onClick={() => {
                      setRawText('');
                      setParseResult(null);
                    }}
                    className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700"
                  >
                    Kosongkan
                  </button>
                )}
                <button
                  onClick={() => handleParse()}
                  disabled={!rawText.trim()}
                  className="px-4 py-1.5 font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded-lg flex items-center gap-1.5 shadow-xs transition-colors"
                >
                  <span>Parse & Preview</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Catalog Modal / Accordion */}
      {showMappingCatalog && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-3 text-xs">
          <div className="flex items-center justify-between border-b pb-2">
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-600" />
                <span>Katalog Master Canonical Field WOFieldMappingEngine ({MASTER_CANONICAL_FIELDS.length} Master Fields)</span>
              </h4>
              <p className="text-[11px] text-slate-500">
                Baseline 46 kolom mencakup Identitas, Jadwal Appointment, Hardware Jaringan (OLT/FDT/FAT/ONT/STB), Kontraktor, Leader, dan Teknisi.
              </p>
            </div>
            <button
              onClick={() => setShowMappingCatalog(false)}
              className="text-slate-400 hover:text-slate-600 text-xs px-2 py-1"
            >
              Tutup
            </button>
          </div>

          <div className="overflow-x-auto max-h-72 border rounded-md">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 uppercase font-semibold text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="p-2">#</th>
                  <th className="p-2">Canonical Field</th>
                  <th className="p-2">Display Label</th>
                  <th className="p-2">Kategori</th>
                  <th className="p-2">Tipe Data</th>
                  <th className="p-2">Wajib</th>
                  <th className="p-2">Alias Terverifikasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                {MASTER_CANONICAL_FIELDS.map((f, i) => (
                  <tr key={f.canonicalField} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                    <td className="p-2 text-slate-400">{i + 1}</td>
                    <td className="p-2 font-bold text-indigo-600 dark:text-indigo-400">{f.canonicalField}</td>
                    <td className="p-2 font-sans text-slate-800 dark:text-slate-200">{f.displayLabel}</td>
                    <td className="p-2 capitalize text-slate-500">{f.category}</td>
                    <td className="p-2 text-slate-500">{f.dataType}</td>
                    <td className="p-2">
                      {f.required ? <span className="text-rose-500 font-bold">Wajib</span> : <span className="text-slate-400">Opsional</span>}
                    </td>
                    <td className="p-2 font-sans text-[10.5px] text-slate-600 dark:text-slate-400 max-w-xs truncate">
                      {f.aliases.join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import Success Banner */}
      {importReport && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
          <div>
            <p className="font-semibold text-sm">Proses Import Berhasil!</p>
            <p className="mt-0.5">
              {importReport.imported} tiket baru berhasil ditambahkan dan didistribusikan ke antrean mitra.
              {importReport.enrolledContractors !== undefined && importReport.enrolledContractors > 0 && (
                <span className="font-medium text-emerald-900 dark:text-emerald-200">
                  {' '}{importReport.enrolledContractors} kategori kontraktor ({importReport.newContractors || 0} baru) telah terdaftar di Master Data.
                </span>
              )}
              {importReport.duplicates > 0 && (
                <span className="block mt-1 text-amber-700 dark:text-amber-300 font-medium">
                  ⚠️ {importReport.duplicates} tiket dengan nomor WO yang sama (duplikat) otomatis ditolak dan tidak dimasukkan ke dalam sistem demi menjaga keunikan data.
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Parse Preview Section */}
      {parseResult && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-4">
          {/* Summary KPIs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Pre-Import Verification & Auto-Distribution Preview
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                File Sumber: <strong className="font-mono text-indigo-600 dark:text-indigo-400">{sourceFileName}</strong>. Operator: <strong>{currentUser.name} ({currentUser.role})</strong>.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 block text-[10px]">TOTAL ROW</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                  {parseResult.totalDetected}
                </span>
              </div>
              <div className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 rounded border border-emerald-200 dark:border-emerald-800">
                <span className="block text-[10px]">VALID ROWS</span>
                <span className="font-bold text-sm">{parseResult.validCount}</span>
              </div>
              {parseResult.duplicateCount > 0 && (
                <div className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 rounded border border-amber-200 dark:border-amber-800">
                  <span className="block text-[10px]">DUPLICATE WO</span>
                  <span className="font-bold text-sm">{parseResult.duplicateCount}</span>
                </div>
              )}
              {parseResult.problematicCount > 0 && (
                <div className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 rounded border border-rose-200 dark:border-rose-800">
                  <span className="block text-[10px]">PROBLEMATIC</span>
                  <span className="font-bold text-sm">{parseResult.problematicCount}</span>
                </div>
              )}
            </div>
          </div>

          {/* Unnamed & Unrecognized Headers Notification */}
          {parseResult.unrecognizedHeaders.length > 0 && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Kolom Khusus / Tanpa Nama Header Terdeteksi ({parseResult.unrecognizedHeaders.length}):</p>
                <p className="mt-0.5">
                  Kolom: <span className="font-mono">{parseResult.unrecognizedHeaders.join(', ')}</span>. Seluruh nilai kolom disimpan utuh dalam <code className="font-mono text-xs">additionalFields</code> agar tidak ada data yang hilang.
                </p>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* DETECTED & AUTO-ENROLLED CONTRACTORS                     */}
          {/* ======================================================== */}
          {parseResult.detectedContractors && parseResult.detectedContractors.length > 0 && (
            <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-indigo-100 dark:border-indigo-900/40">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-2">
                      <span>Kategori Kontraktor Terdaftar dari Import ({parseResult.detectedContractors.length} Mitra)</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-semibold">
                        Auto-Enrolled
                      </span>
                    </h5>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Kategori kontraktor yang diidentifikasi dari file / text converter. Mitra baru otomatis terdaftar ke Master Data MoraJaws saat import dieksekusi.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Auto-register toggle in contractor preview */}
                  <div className="flex items-center gap-2 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 shadow-2xs">
                    <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      Auto-register New Contractors:
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoRegisterNewContractors}
                        onChange={e => setAutoRegisterNewContractors(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                    <span className={`text-[10px] font-bold ${autoRegisterNewContractors ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>
                      {autoRegisterNewContractors ? 'ON' : 'OFF'}
                    </span>
                  </div>

                  {parseResult.detectedContractors.some(c => c.isNew) && (
                    <button
                      type="button"
                      onClick={handleEnrollContractorsNow}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Daftarkan Sekarang</span>
                    </button>
                  )}
                </div>
              </div>

              {contractorEnrollNotice && (
                <div className="p-2.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{contractorEnrollNotice}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {parseResult.detectedContractors.map((c, cIdx) => {
                  return (
                    <div
                      key={`detected-contractor-card-${c.id || c.name}-${cIdx}`}
                      className={`p-3 rounded-lg border text-xs transition-all ${
                        c.isNew
                          ? 'bg-white dark:bg-slate-900 border-emerald-300 dark:border-emerald-800 ring-1 ring-emerald-400/30'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="font-bold text-slate-900 dark:text-white truncate" title={c.name}>
                          {c.name}
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                            c.isNew
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {c.isNew ? '★ Baru Terdaftar' : 'Sudah di Master'}
                        </span>
                      </div>

                      <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Kode Vendor:</span>
                          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">[{c.code}]</span>
                        </div>
                        <div className="flex items-start justify-between gap-1">
                          <span className="text-slate-400 shrink-0">Cakupan Area:</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200 text-right truncate">
                            {c.coverageAreas.length > 0 ? c.coverageAreas.join(', ') : 'Semua Area'}
                          </span>
                        </div>
                        {c.leaderName && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Leader / Korlap:</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">{c.leaderName}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                          <span className="text-slate-400">Alokasi WO:</span>
                          <span className="font-bold text-slate-900 dark:text-white">{c.woCount} Work Orders</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Ticket Category Search & Filter Toolbar for Preview */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari Kategori Tiket, WO, Pelanggan, Mitra..."
                  value={previewCategorySearch}
                  onChange={e => setPreviewCategorySearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md text-slate-800 dark:text-slate-200"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 shrink-0">
                  Filter Kategori Tiket:
                </span>
                <select
                  value={previewCategoryFilter}
                  onChange={e => setPreviewCategoryFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md text-slate-800 dark:text-slate-200"
                >
                  <option value="ALL">Semua Kategori ({detectedTicketCategories.length})</option>
                  {detectedTicketCategories.map((cat: string) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                {(previewCategoryFilter !== 'ALL' || previewCategorySearch) && (
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewCategoryFilter('ALL');
                      setPreviewCategorySearch('');
                    }}
                    className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 border rounded"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            <div className="text-[11px] text-slate-500 shrink-0 self-end sm:self-auto font-mono">
              Menampilkan <span className="font-bold text-slate-800 dark:text-slate-200">{displayedPreviewRows.length}</span> dari {parseResult.parsedRows.length} baris
            </div>
          </div>

          {/* Scrollable Preview Table */}
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-md max-h-96 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase">
                <tr>
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">WO Number</th>
                  <th className="py-2.5 px-3">Customer ID (7 Digits)</th>
                  <th className="py-2.5 px-3">Nama Pelanggan</th>
                  <th className="py-2.5 px-3">Kontak</th>
                  <th className="py-2.5 px-3">Kategori Tiket</th>
                  <th className="py-2.5 px-3">Kontraktor & Leader</th>
                  <th className="py-2.5 px-3">Area & Cluster</th>
                  <th className="py-2.5 px-3">Jadwal Appointment</th>
                  <th className="py-2.5 px-3">Status Distribusi</th>
                  <th className="py-2.5 px-3 text-center">Action / Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {displayedPreviewRows.map((row: ParsedRowData) => {
                  const isEditingThis = editingRowIndex === row.rowIndex;
                  return (
                    <tr
                      key={row.rowIndex}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                        !row.isValid ? 'bg-rose-50/40 dark:bg-rose-950/20' : ''
                      }`}
                    >
                      <td className="py-2 px-3 font-mono text-slate-400">{row.rowIndex + 1}</td>

                      <td className="py-2 px-3 whitespace-nowrap">
                        {row.isValid ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 text-[11px] font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Valid
                          </span>
                        ) : (
                          <div className="text-rose-600 text-[10.5px] font-semibold max-w-xs">
                            {row.validationErrors.join(' · ')}
                          </div>
                        )}
                      </td>

                      <td className="py-2 px-3 font-mono font-bold text-slate-900 dark:text-white">
                        {isEditingThis ? (
                          <input
                            type="text"
                            value={editingRowData.woNumber || ''}
                            onChange={e => setEditingRowData({ ...editingRowData, woNumber: e.target.value })}
                            className="p-1 border rounded w-32 text-xs bg-white dark:bg-slate-800"
                          />
                        ) : (
                          row.mapped.woNumber || '-'
                        )}
                      </td>

                      <td className="py-2 px-3 font-mono font-semibold">
                        {isEditingThis ? (
                          <input
                            type="text"
                            maxLength={7}
                            value={editingRowData.idCustomer || ''}
                            onChange={e => setEditingRowData({ ...editingRowData, idCustomer: e.target.value })}
                            className="p-1 border rounded w-24 text-xs bg-white dark:bg-slate-800"
                          />
                        ) : (
                          <span className={row.mapped.idCustomer?.length === 7 ? 'text-indigo-600 dark:text-indigo-400' : 'text-rose-600 font-bold'}>
                            {row.mapped.idCustomer || '-'}
                          </span>
                        )}
                      </td>

                      <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">
                        {isEditingThis ? (
                          <input
                            type="text"
                            value={editingRowData.customerName || ''}
                            onChange={e => setEditingRowData({ ...editingRowData, customerName: e.target.value })}
                            className="p-1 border rounded w-36 text-xs bg-white dark:bg-slate-800"
                          />
                        ) : (
                          row.mapped.customerName || '-'
                        )}
                      </td>

                      <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-300">
                        {isEditingThis ? (
                          <input
                            type="text"
                            value={editingRowData.customerPhone || ''}
                            onChange={e => setEditingRowData({ ...editingRowData, customerPhone: e.target.value })}
                            className="p-1 border rounded w-28 text-xs bg-white dark:bg-slate-800"
                          />
                        ) : (
                          row.mapped.customerPhone || '-'
                        )}
                      </td>

                      <td className="py-2 px-3 whitespace-nowrap">
                        {isEditingThis ? (
                          <input
                            type="text"
                            value={editingRowData.ticketCategory || ''}
                            onChange={e => setEditingRowData({ ...editingRowData, ticketCategory: e.target.value })}
                            placeholder="Kategori Tiket"
                            className="p-1 border rounded w-32 text-xs bg-white dark:bg-slate-800"
                          />
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold text-[11px]">
                            {row.mapped.ticketCategory || '-'}
                          </span>
                        )}
                      </td>

                      <td className="py-2 px-3">
                        {isEditingThis ? (
                          <input
                            type="text"
                            value={editingRowData.contactorName || ''}
                            onChange={e => setEditingRowData({ ...editingRowData, contactorName: e.target.value })}
                            placeholder="Nama Kontraktor"
                            className="p-1 border rounded w-32 text-xs bg-white dark:bg-slate-800"
                          />
                        ) : (
                          <>
                            <div className="flex items-center gap-1 font-medium text-slate-800 dark:text-slate-200">
                              <Building2 className="w-3 h-3 text-indigo-500 shrink-0" />
                              <span>{row.mapped.contactorName || '-'}</span>
                            </div>
                            {row.mapped.leaderName && (
                              <div className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                                <UserCheck className="w-2.5 h-2.5" />
                                <span>{row.mapped.leaderName}</span>
                              </div>
                            )}
                          </>
                        )}
                      </td>

                      <td className="py-2 px-3">
                        {isEditingThis ? (
                          <div className="space-y-1">
                            <input
                              type="text"
                              value={editingRowData.area || ''}
                              onChange={e => setEditingRowData({ ...editingRowData, area: e.target.value })}
                              placeholder="Area"
                              className="p-1 border rounded w-28 text-xs bg-white dark:bg-slate-800"
                            />
                            <input
                              type="text"
                              value={editingRowData.clusterName || ''}
                              onChange={e => setEditingRowData({ ...editingRowData, clusterName: e.target.value })}
                              placeholder="Cluster"
                              className="p-1 border rounded w-28 text-xs bg-white dark:bg-slate-800"
                            />
                          </div>
                        ) : (
                          <>
                            <div>{row.mapped.area || '-'}</div>
                            <div className="text-[10px] text-slate-400">{row.mapped.clusterName}</div>
                          </>
                        )}
                      </td>

                      <td className="py-2 px-3 whitespace-nowrap">
                        <div className="font-semibold text-slate-700 dark:text-slate-300">
                          {row.mapped.appointmentDate || row.mapped.date || 'Belum Ada Jadwal'}
                        </div>
                        <div className="text-[10.5px] text-slate-400">{row.mapped.slotTime || '-'}</div>
                      </td>

                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          row.mapped.distributionStatus === 'distributed'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : row.mapped.distributionStatus === 'unmapped_contractor'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}>
                          {row.mapped.distributionStatus || 'pending'}
                        </span>
                      </td>

                      <td className="py-2 px-3 text-center whitespace-nowrap">
                        {isEditingThis ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleSaveEditRow(row.rowIndex)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer"
                              title="Simpan perubahan baris ini (Action Oke)"
                            >
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                              <span>Oke</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingRowIndex(null)}
                              className="px-2 py-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded text-xs font-medium cursor-pointer"
                              title="Batalkan edit"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            {!row.isValid && (
                              <button
                                type="button"
                                onClick={() => handleForceValidateRow(row.rowIndex)}
                                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 rounded text-[11px] font-bold flex items-center gap-1 border border-emerald-300 dark:border-emerald-800 cursor-pointer shadow-2xs transition-colors"
                                title="Action Oke: Setujui baris ini dan jadikan Valid"
                              >
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                                <span>Oke</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleStartEditRow(row)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded transition-colors cursor-pointer"
                              title="Edit baris data"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRow(row.rowIndex)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded transition-colors cursor-pointer"
                              title="Hapus baris data"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Action Row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-slate-500">
                Kebijakan Keamanan: Import biasa tidak akan menghapus data yang sudah ada di sistem.
              </span>
              {parseResult.problematicCount > 0 && (
                <button
                  type="button"
                  onClick={handleAutoFixAllRows}
                  className="px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/60 rounded border border-amber-200 dark:border-amber-800 flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Otomatis perbaiki Customer ID 7 digit dan format WO untuk semua baris bermasalah"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>Auto-Fix & Setujui Semua ({parseResult.problematicCount} baris)</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setParseResult(null)}
                className="px-4 py-2 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Batal Preview
              </button>
              <button
                type="button"
                onClick={() => {
                  if (parseResult.validCount === 0 && parseResult.parsedRows.length > 0) {
                    handleAutoFixAllRows();
                  }
                  setShowConfirmModal(true);
                }}
                className="px-5 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-98 rounded-lg shadow-sm transition-all text-xs flex items-center justify-center gap-2 cursor-pointer"
                title="Tekan tombol Action Oke untuk konfirmasi import data work order"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Action Oke: Konfirmasi & Simpan {parseResult.validCount > 0 ? `${parseResult.validCount} WO` : `${parseResult.parsedRows.length} WO (Auto-Fix)`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && parseResult && (
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs animate-in zoom-in-95 duration-150">
            {/* Sticky Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/80 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 shadow-xs">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                    Konfirmasi Import Work Order
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Periksa ringkasan validasi sebelum data disimpan permanen ke database
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
                title="Tutup dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Body Content */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
              {/* Validation Summary Matrix */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl">
                  <div className="text-[10.5px] text-slate-500 dark:text-slate-400">Total Baris Dibaca</div>
                  <div className="text-base font-extrabold text-slate-900 dark:text-white">{parseResult.parsedRows.length}</div>
                </div>
                <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                  <div className="text-[10.5px] text-emerald-700 dark:text-emerald-300">Baris Valid</div>
                  <div className="text-base font-extrabold text-emerald-700 dark:text-emerald-300">
                    {parseResult.validCount > 0 ? parseResult.validCount : parseResult.parsedRows.length}
                  </div>
                </div>
                <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl">
                  <div className="text-[10.5px] text-amber-700 dark:text-amber-300">Gagal Validasi</div>
                  <div className="text-base font-extrabold text-amber-700 dark:text-amber-300">{parseResult.problematicCount}</div>
                </div>
                <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl">
                  <div className="text-[10.5px] text-blue-700 dark:text-blue-300">Kontraktor Baru</div>
                  <div className="text-base font-extrabold text-blue-700 dark:text-blue-300">
                    {parseResult.detectedContractors?.filter(c => c.isNew).length || newContractorsFound.length}
                  </div>
                </div>
                <div className="p-2.5 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-xl">
                  <div className="text-[10.5px] text-purple-700 dark:text-purple-300">Kontraktor Terdaftar</div>
                  <div className="text-base font-extrabold text-purple-700 dark:text-purple-300">
                    {parseResult.detectedContractors?.filter(c => !c.isNew).length || 0}
                  </div>
                </div>
                <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl">
                  <div className="text-[10.5px] text-rose-700 dark:text-rose-300">Data Duplikat</div>
                  <div className="text-base font-extrabold text-rose-700 dark:text-rose-300">{parseResult.duplicateCount}</div>
                </div>
              </div>

              {/* Source & Operator metadata */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">File Sumber:</span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{sourceFileName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Operator:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{currentUser.name} ({currentUser.role})</span>
                </div>
              </div>

              {/* Unrecognized Headers Warning if any */}
              {parseResult.unrecognizedHeaders && parseResult.unrecognizedHeaders.length > 0 && (
                <div className="p-3 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs space-y-1">
                  <div className="font-bold text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Header Tidak Terpetakan ({parseResult.unrecognizedHeaders.length}):</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {parseResult.unrecognizedHeaders.map(h => (
                      <span key={h} className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 rounded text-[10.5px] font-mono">
                        {h}
                      </span>
                    ))}
                  </div>
                  <p className="text-[10.5px] text-amber-700 dark:text-amber-300 pt-0.5">
                    Header di atas tetap disimpan aman dalam kolom dinamis tambahan (additionalFields).
                  </p>
                </div>
              )}

              {/* Scrollable Contractor Preview Box */}
              {((parseResult.detectedContractors && parseResult.detectedContractors.length > 0) || newContractorsFound.length > 0) && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>Daftar Kontraktor Terdeteksi (Scrollable):</span>
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {parseResult.detectedContractors?.length || newContractorsFound.length} Mitra
                    </span>
                  </div>
                  <div className="max-h-36 overflow-y-auto p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-wrap gap-1.5">
                    {parseResult.detectedContractors && parseResult.detectedContractors.length > 0
                      ? parseResult.detectedContractors.map((c, cIdx) => (
                          <span
                            key={`modal-detected-cont-${c.id || c.name}-${cIdx}`}
                            className={`px-2 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 ${
                              c.isNew
                                ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <span>{c.name}</span>
                            {c.isNew && <span className="font-bold text-[9.5px] text-emerald-600 dark:text-emerald-400 uppercase">(Baru)</span>}
                            <span className="text-[10px] opacity-75">· {c.woCount || 1} WO</span>
                          </span>
                        ))
                      : newContractorsFound.map((c: any, cIdx: number) => (
                          <span
                            key={`modal-new-cont-${c.name}-${cIdx}`}
                            className="px-2 py-1 rounded-lg text-[11px] font-medium bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1"
                          >
                            <span>{c.name}</span>
                            <span className="font-bold text-[9.5px] uppercase">(Baru)</span>
                            <span className="text-[10px] opacity-75">· {c.woCount} WO</span>
                          </span>
                        ))}
                  </div>
                </div>
              )}

              {/* Auto-register Toggle */}
              <div className="p-3 bg-indigo-50/80 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span className="font-bold text-slate-900 dark:text-white text-xs">
                      Pendaftaran Otomatis Kontraktor Baru
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoRegisterNewContractors}
                      onChange={e => setAutoRegisterNewContractors(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  {autoRegisterNewContractors
                    ? 'Aktif — Kontraktor yang belum ada di master data akan langsung didaftarkan secara otomatis saat import disimpan.'
                    : 'Nonaktif — Kontraktor baru tidak akan ditambahkan ke Master Database.'}
                </p>
              </div>

              {/* Duplicate Handling Policy */}
              <div className="p-3 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <span className="font-bold text-slate-800 dark:text-slate-200 text-xs block">
                  Kebijakan Duplikasi Nomor WO:
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <label className={`p-2.5 rounded-xl border text-[11px] cursor-pointer flex items-center gap-2 transition-colors ${
                    duplicatePolicy === 'skip'
                      ? 'bg-white dark:bg-slate-900 border-indigo-600 font-bold text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-500/30'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}>
                    <input
                      type="radio"
                      name="dupPolicy"
                      checked={duplicatePolicy === 'skip'}
                      onChange={() => setDuplicatePolicy('skip')}
                      className="text-indigo-600"
                    />
                    <span>Lewati Duplikat (Skip)</span>
                  </label>
                  <label className={`p-2.5 rounded-xl border text-[11px] cursor-pointer flex items-center gap-2 transition-colors ${
                    duplicatePolicy === 'update_allowed'
                      ? 'bg-white dark:bg-slate-900 border-indigo-600 font-bold text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-500/30'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}>
                    <input
                      type="radio"
                      name="dupPolicy"
                      checked={duplicatePolicy === 'update_allowed'}
                      onChange={() => setDuplicatePolicy('update_allowed')}
                      className="text-indigo-600"
                    />
                    <span>Perbarui WO (Update)</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Sticky Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 bg-slate-50/90 dark:bg-slate-800/90 sticky bottom-0 z-10">
              <button
                type="button"
                disabled={isExecutingImport}
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer font-semibold transition-colors disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isExecutingImport}
                onClick={async () => {
                  setIsExecutingImport(true);
                  try {
                    await handleExecuteImport();
                  } finally {
                    setIsExecutingImport(false);
                  }
                }}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-xl font-bold flex items-center gap-2 shadow-md cursor-pointer transition-all text-xs disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isExecutingImport ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Menyimpan ke Database...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Konfirmasi & Simpan ({parseResult.validCount > 0 ? parseResult.validCount : parseResult.parsedRows.length} WO)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* End of Import Tab */}
        </div>
      )}

      {/* ============================================================ */}
      {/* EXPORT WORK ORDER & TEMPLATES TAB                            */}
      {/* ============================================================ */}
      {/* Tab 3: History & Delete Import Data by Date (7-day Retention Window) */}
      {mainTab === 'history_delete' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-rose-600" />
                  <span>Riwayat & Hapus Data Import per Tanggal</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Filter dan hapus data tiket hasil import berdasarkan tanggal import. Batas rentang data yang dapat dihapus adalah <strong>maksimal 7 hari kalender</strong> sejak data diimpor.
                </p>
              </div>

              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded text-amber-800 dark:text-amber-300 text-xs">
                <Lock className="w-3.5 h-3.5 shrink-0" />
                <span>Aturan Retensi: Maksimal 7 Hari</span>
              </div>
            </div>

            {/* Quick Filter Custom Date */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex-1">
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Pilih / Filter Tanggal Import untuk Dihapus
                </label>
                <input
                  type="date"
                  value={selectedPurgeDate}
                  onChange={e => setSelectedPurgeDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                />
              </div>

              {selectedPurgeDate && (
                <div className="flex items-end gap-2">
                  <button
                    onClick={() => {
                      const count = tickets.filter(t => (t.importDate === selectedPurgeDate || t.date === selectedPurgeDate) && !t.isArchived).length;
                      if (count === 0) {
                        showToast(`Tidak ada data tiket hasil import pada tanggal ${selectedPurgeDate}.`, 'info');
                        return;
                      }
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const target = new Date(selectedPurgeDate);
                      target.setHours(0, 0, 0, 0);
                      const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));

                      if (diffDays > 7) {
                        showToast(`Tanggal ${selectedPurgeDate} berjarak ${diffDays} hari lalu (melebihi batas retensi 7 hari). Data terkunci dan tidak dapat dihapus massal.`, 'error');
                        return;
                      }

                      setDateToPurge(selectedPurgeDate);
                      setPurgeCount(count);
                      setPurgeReason('');
                      setPurgeConfirmPhrase('');
                      setShowPurgeModal(true);
                    }}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded shadow-xs flex items-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Data Tanggal Ini</span>
                  </button>

                  <button
                    onClick={() => setSelectedPurgeDate('')}
                    className="px-3 py-2 text-xs border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>

            {/* List of dates with imported data */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Daftar Tanggal Import Tersimpan di Sistem
              </h4>

              {(() => {
                // Group tickets by importDate or fallback date
                const dateMap: Record<string, number> = {};
                for (const t of tickets) {
                  if (t.isArchived) continue;
                  const d = t.importDate || t.date || new Date().toISOString().slice(0, 10);
                  dateMap[d] = (dateMap[d] || 0) + 1;
                }

                const sortedDates = Object.keys(dateMap).sort((a, b) => b.localeCompare(a));
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                if (sortedDates.length === 0) {
                  return (
                    <div className="p-6 text-center text-slate-400 italic text-xs border border-slate-200 dark:border-slate-800 rounded-lg">
                      Belum ada data tiket yang tersimpan di sistem.
                    </div>
                  );
                }

                return (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                    {sortedDates.map(dateStr => {
                      const count = dateMap[dateStr];
                      const target = new Date(dateStr);
                      target.setHours(0, 0, 0, 0);
                      const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
                      const isEligible = diffDays >= 0 && diffDays <= 7;

                      return (
                        <div
                          key={dateStr}
                          className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                              isEligible
                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                            }`}>
                              <Calendar className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="font-bold text-slate-800 dark:text-slate-100 text-xs flex items-center gap-2">
                                <span>{dateStr}</span>
                                {isEligible ? (
                                  <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                                    <Unlock className="w-3 h-3" />
                                    <span>Dalam Rentang 7 Hari ({diffDays === 0 ? 'Hari Ini' : `${diffDays} hari lalu`})</span>
                                  </span>
                                ) : (
                                  <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                                    <Lock className="w-3 h-3" />
                                    <span>Terkunci ({diffDays} hari lalu, &gt; 7 hari)</span>
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                Total {count} data Work Order tersimpan pada tanggal ini.
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            {isEligible ? (
                              <button
                                onClick={() => {
                                  setDateToPurge(dateStr);
                                  setPurgeCount(count);
                                  setPurgeReason('');
                                  setPurgeConfirmPhrase('');
                                  setShowPurgeModal(true);
                                }}
                                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Hapus Data Import ({count} WO)</span>
                              </button>
                            ) : (
                              <span
                                title="Data telah melewati batas retensi 7 hari kalender dan dilindungi dari penghapusan massal"
                                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-400 text-xs rounded border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-not-allowed"
                              >
                                <Lock className="w-3.5 h-3.5" />
                                <span>Terkunci (Proteksi Audit)</span>
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Deleting Imported Data by Date */}
      {showPurgeModal && dateToPurge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full border border-rose-200 dark:border-rose-900/80 shadow-2xl p-6 space-y-4 text-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Konfirmasi Hapus Data Import
                </h3>
                <p className="text-[11px] text-slate-500">
                  Tanggal Import: <span className="font-semibold text-rose-600 dark:text-rose-400">{dateToPurge}</span>
                </p>
              </div>
            </div>

            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg text-rose-900 dark:text-rose-200 leading-relaxed text-[11px]">
              Tindakan ini akan menghapus <strong>{purgeCount} Work Order</strong> yang diimpor pada tanggal {dateToPurge}. Penghapusan ini dicatat pada audit log resmi.
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Alasan Penghapusan (Wajib diisi):
              </label>
              <textarea
                rows={2}
                placeholder="misal: Salah input file import, data duplikat dari vendor..."
                value={purgeReason}
                onChange={e => setPurgeReason(e.target.value)}
                className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Ketik <span className="font-mono text-rose-600 font-bold">HAPUS IMPORT</span> untuk konfirmasi:
              </label>
              <input
                type="text"
                placeholder="HAPUS IMPORT"
                value={purgeConfirmPhrase}
                onChange={e => setPurgeConfirmPhrase(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => {
                  setShowPurgeModal(false);
                  setDateToPurge(null);
                }}
                className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
              >
                Batal
              </button>
              <button
                disabled={!purgeReason.trim() || purgeConfirmPhrase.trim() !== 'HAPUS IMPORT'}
                onClick={() => {
                  const res = deleteImportedTicketsByDate(dateToPurge, purgeReason.trim());
                  if (res.success) {
                    showToast(`Berhasil menghapus ${res.count} data tiket hasil import pada tanggal ${dateToPurge}.`, 'success');
                    setShowPurgeModal(false);
                    setDateToPurge(null);
                  } else {
                    showToast(res.error || 'Gagal menghapus data import.', 'error');
                  }
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white font-bold rounded shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Ya, Hapus Data Import ({purgeCount} WO)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {mainTab === 'export' && (
        <div className="space-y-6">
          {/* Export Header */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Pusat Ekspor Data Work Order & Template Blank Lapangan
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Ekspor seluruh data Work Order ke format Excel (.xlsx) atau CSV deterministik, serta unduh template penugasan Korlap & Teknisi.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Total Tiket Tersimpan:</span>
                <span className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950 font-mono font-bold text-xs text-indigo-700 dark:text-indigo-300">
                  {tickets.filter(t => !t.isArchived).length} WO
                </span>
              </div>
            </div>

            {exportNotice && (
              <div className="mt-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{exportNotice}</span>
              </div>
            )}

            {/* Export Settings Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-5 text-xs">
              
              {/* Card 1: Format Template Ekspor */}
              <div className="space-y-3">
                <label className="block font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">
                  1. Pilih Format Kolom Ekspor:
                </label>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setExportFormat('full_46')}
                    className={`w-full text-left p-3 rounded-xl border flex items-start gap-3 transition-all ${
                      exportFormat === 'full_46'
                        ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200 ring-2 ring-indigo-500/30'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <FileSpreadsheet className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-bold">Format Master 46 Kolom</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Sesuai standar template BASE_DATA_WO (semua field identitas, teknis, jadwal, mitra).
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportFormat('korlap_template')}
                    className={`w-full text-left p-3 rounded-xl border flex items-start gap-3 transition-all ${
                      exportFormat === 'korlap_template'
                        ? 'border-amber-600 bg-amber-50/70 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 ring-2 ring-amber-500/30'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Building2 className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-bold">Template WO Korlap</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Format ringkas koordinator: WO Number, ID Cust, Lokasi, Mitra, Leader, Slot Time.
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportFormat('teknisi_template')}
                    className={`w-full text-left p-3 rounded-xl border flex items-start gap-3 transition-all ${
                      exportFormat === 'teknisi_template'
                        ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/30'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Wrench className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-bold">Template Assigned Teknisi</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Format penugasan teknisi: WO Number, FAT/Port, Installer Name, Slot Time, Status.
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Card 2: Filter Data yang Diekspor */}
              <div className="space-y-3">
                <label className="block font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">
                  2. Filter Data Work Order:
                </label>
                <div className="space-y-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">
                      Filter Mitra Kontraktor:
                    </label>
                    <select
                      value={exportContractor}
                      onChange={e => setExportContractor(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-medium"
                    >
                      <option value="ALL">Semua Mitra Kontraktor</option>
                      {contractors.map((c, cIdx) => (
                        <option key={`export-contractor-${c.id || c.name}-${cIdx}`} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">
                      Filter Status Penugasan:
                    </label>
                    <select
                      value={exportStatus}
                      onChange={e => setExportStatus(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-medium"
                    >
                      <option value="ALL">Semua Status</option>
                      <option value="UNASSIGNED">Belum Ditugaskan ke Teknisi</option>
                      <option value="ASSIGNED">Sudah Ditugaskan ke Teknisi</option>
                      <option value="Closed">Closed (Selesai)</option>
                    </select>
                  </div>

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700/80 text-[11.5px] text-slate-500">
                    <div>
                      WO Siap Ekspor:{' '}
                      <strong className="text-slate-800 dark:text-slate-200 font-mono font-bold">
                        {
                          tickets.filter(t => {
                            if (t.isArchived) return false;
                            if (exportContractor !== 'ALL' && t.contactorName !== exportContractor) return false;
                            if (exportStatus === 'UNASSIGNED' && t.installerName) return false;
                            if (exportStatus === 'ASSIGNED' && !t.installerName) return false;
                            if (exportStatus === 'Closed' && t.statusWOAgent !== 'Closed') return false;
                            return true;
                          }).length
                        }{' '}
                        data
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Export Action Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleExportFile('xlsx')}
                    className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Ekspor Excel (.xlsx)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExportFile('csv')}
                    className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Ekspor CSV (.csv)</span>
                  </button>
                </div>
              </div>

              {/* Card 3: Download Blank Templates */}
              <div className="space-y-3">
                <label className="block font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">
                  3. Unduh Template Blank:
                </label>
                <div className="space-y-2 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                  <p className="text-[11px] text-slate-500">
                    Unduh file spreadsheet template kosong berheader resmi untuk diisi secara offline sebelum diimpor kembali:
                  </p>

                  <button
                    type="button"
                    onClick={() => handleDownloadBlankTemplate('master_46')}
                    className="w-full text-left p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <FileDown className="w-4 h-4 text-indigo-600" />
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200">Template Master BASE_DATA_WO</div>
                        <div className="text-[10px] text-slate-400">46 Kolom resmi standar</div>
                      </div>
                    </div>
                    <Download className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownloadBlankTemplate('korlap')}
                    className="w-full text-left p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <FileDown className="w-4 h-4 text-amber-600" />
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200">Template WO Korlap</div>
                        <div className="text-[10px] text-slate-400">Untuk bulk assign Leader / Korlap</div>
                      </div>
                    </div>
                    <Download className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownloadBlankTemplate('teknisi')}
                    className="w-full text-left p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <FileDown className="w-4 h-4 text-emerald-600" />
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200">Template Assigned Teknisi</div>
                        <div className="text-[10px] text-slate-400">Untuk bulk assign teknisi di lapangan</div>
                      </div>
                    </div>
                    <Download className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
};
