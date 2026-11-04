import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Ticket } from '../../types';
import {
  FileSpreadsheet,
  Download,
  Filter,
  Search,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RotateCcw,
  Building2,
  Wrench,
  MapPin,
  Calendar,
  Layers,
  FileText,
  Copy,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Archive,
  AlertCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useToast } from '../../context/ToastContext';
import { formatAppointmentDateDisplay, parseAppointmentDate, getJakartaDateString } from '../../services/appointmentDateParser';
import { StatusAgentBadge, StatusInstallerBadge } from '../common/Badge';
import { SortableColumnHeader } from '../common/SortableColumnHeader';
import {
  SortState,
  getNextSortDirection,
  sortDataArray,
  compareTableValues,
  compareNaturalWoNumbers
} from '../../utils/tableSorting';

interface ColumnFilters {
  woNumber: string;
  customerId: string;
  customerName: string;
  area: string;
  appointmentDate: string;
  slotTime: string;
  contractor: string;
  installer: string;
  statusInstaller: string;
  remarks: string;
}

const initialFilters: ColumnFilters = {
  woNumber: '',
  customerId: '',
  customerName: '',
  area: '',
  appointmentDate: '',
  slotTime: '',
  contractor: '',
  installer: '',
  statusInstaller: '',
  remarks: ''
};

export const ReportDataWOView: React.FC = () => {
  const { tickets, contractors, users, auditLogs } = useApp();
  const { toast } = useToast();

  const [reportType, setReportType] = useState<
    | 'all_wo'
    | 'wo_agent'
    | 'wo_installer'
    | 'pending'
    | 'completed'
    | 'overdue'
    | 'reassign_history'
    | 'contractor_sla'
    | 'root_cause'
    | 'incomplete_data'
  >('all_wo');

  const [contractorFilter, setContractorFilter] = useState('ALL');
  const [areaFilter, setAreaFilter] = useState('ALL');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Feature 2: Individual Column Filters
  const [colFilters, setColFilters] = useState<ColumnFilters>(initialFilters);

  // Feature 3: Global 3-State Sorting
  const [sortState, setSortState] = useState<SortState>({
    column: 'woNumber',
    direction: 'asc'
  });

  // Pagination
  const [pageSize, setPageSize] = useState<number | 'ALL'>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Overdue calculation (past appointment date and not completed/closed/resolved)
  const isOverdue = (t: Ticket): boolean => {
    const raw = t.appointmentDate || t.date || '';
    const parsed = parseAppointmentDate(raw);
    if (!parsed.date) return false;
    const isFinished = t.statusWOInstaller === 'Completed' || t.statusWOAgent === 'Closed' || t.statusWOAgent === 'Resolved';
    if (isFinished) return false;
    return parsed.date < getJakartaDateString(0);
  };

  // Base list
  const activeTickets = useMemo(() => tickets.filter(t => !t.isArchived && !t.isDeleted), [tickets]);

  // Report-specific data subset
  const reportData = useMemo(() => {
    return activeTickets.filter(t => {
      // 1. Report Type Filter
      if (reportType === 'wo_agent') {
        if (!t.agentId && !t.remarksAgent) return false;
      } else if (reportType === 'wo_installer') {
        if (!t.installerName) return false;
      } else if (reportType === 'pending') {
        if (t.statusWOInstaller !== 'Pending Technical' && t.statusWOAgent !== 'Pending') return false;
      } else if (reportType === 'completed') {
        if (t.statusWOInstaller !== 'Completed' && t.statusWOAgent !== 'Closed' && t.statusWOAgent !== 'Resolved') return false;
      } else if (reportType === 'overdue') {
        if (!isOverdue(t)) return false;
      } else if (reportType === 'reassign_history') {
        if (!t.assignmentHistory || t.assignmentHistory.length === 0) return false;
      } else if (reportType === 'root_cause') {
        if (!t.technicalReport?.rootCause) return false;
      } else if (reportType === 'incomplete_data') {
        const isCid7 = /^[0-9]{7}$/.test((t.idCustomer || t.customerId || '').trim());
        const hasAppDate = Boolean(t.appointmentDate && t.appointmentDate.trim());
        const hasPhone = Boolean(t.customerPhone && t.customerPhone.trim());
        if (isCid7 && hasAppDate && hasPhone) return false;
      }

      // 2. Global Filters
      if (contractorFilter !== 'ALL') {
        const c = t.contactorName || t.contractorName || '';
        if (c !== contractorFilter) return false;
      }
      if (areaFilter !== 'ALL' && t.area !== areaFilter) return false;

      // 3. Date Range
      const d = t.appointmentDate || t.date || '';
      if (dateStart && d < dateStart) return false;
      if (dateEnd && d > dateEnd) return false;

      // 4. Global Search query
      if (searchQuery && typeof searchQuery === 'string' && searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const m1 = (t.woNumber ? String(t.woNumber).toLowerCase() : '').includes(q);
        const m2 = (t.customerName ? String(t.customerName).toLowerCase() : '').includes(q);
        const m3 = (t.idCustomer || t.customerId || '').toLowerCase().includes(q);
        const m4 = (t.installerName || '').toLowerCase().includes(q);
        if (!m1 && !m2 && !m3 && !m4) return false;
      }

      // 5. Individual Column Filters (AND logic)
      if (colFilters.woNumber.trim()) {
        const q = colFilters.woNumber.toLowerCase().trim();
        if (!(t.woNumber ? String(t.woNumber).toLowerCase() : '').includes(q)) return false;
      }
      if (colFilters.customerId.trim()) {
        const q = colFilters.customerId.toLowerCase().trim();
        const cid = (t.idCustomer || t.customerId || '').toLowerCase();
        if (!cid.includes(q)) return false;
      }
      if (colFilters.customerName.trim()) {
        const q = colFilters.customerName.toLowerCase().trim();
        if (!(t.customerName ? String(t.customerName).toLowerCase() : '').includes(q)) return false;
      }
      if (colFilters.area.trim()) {
        const q = colFilters.area.toLowerCase().trim();
        if (!(t.area || '').toLowerCase().includes(q)) return false;
      }
      if (colFilters.appointmentDate.trim()) {
        const q = colFilters.appointmentDate.toLowerCase().trim();
        const d = (t.appointmentDate || t.date || '').toLowerCase();
        if (!d.includes(q)) return false;
      }
      if (colFilters.slotTime.trim()) {
        const q = colFilters.slotTime.toLowerCase().trim();
        if (!(t.slotTime || '').toLowerCase().includes(q)) return false;
      }
      if (colFilters.contractor.trim()) {
        const q = colFilters.contractor.toLowerCase().trim();
        const c = (t.contactorName || t.contractorName || '').toLowerCase();
        if (!c.includes(q)) return false;
      }
      if (colFilters.installer.trim()) {
        const q = colFilters.installer.toLowerCase().trim();
        if (!(t.installerName || '').toLowerCase().includes(q)) return false;
      }
      if (colFilters.statusInstaller.trim()) {
        const q = colFilters.statusInstaller.toLowerCase().trim();
        if (!(t.statusWOInstaller || '').toLowerCase().includes(q)) return false;
      }
      if (colFilters.remarks.trim()) {
        const q = colFilters.remarks.toLowerCase().trim();
        const r = (t.technicalReport?.rootCause || t.remarksWOInstaller || t.remarksAgent || '').toLowerCase();
        if (!r.includes(q)) return false;
      }

      return true;
    });
  }, [
    activeTickets,
    reportType,
    contractorFilter,
    areaFilter,
    dateStart,
    dateEnd,
    searchQuery,
    colFilters
  ]);

  // Handle 3-state sort column click
  const handleSort = (columnKey: string) => {
    setSortState(prev => {
      const nextDir = getNextSortDirection(prev.column, prev.direction, columnKey);
      return {
        column: nextDir ? columnKey : null,
        direction: nextDir
      };
    });
    setCurrentPage(1);
  };

  // Sort reportData based on sortState
  const sortedReportData = useMemo(() => {
    return sortDataArray(reportData, sortState, (item: Ticket, col: string) => {
      switch (col) {
        case 'woNumber':
          return item.woNumber;
        case 'customerId':
          return item.idCustomer || item.customerId || '';
        case 'customerName':
          return item.customerName || '';
        case 'area':
          return item.area || '';
        case 'appointmentDate':
          return item.appointmentDate || item.date || '';
        case 'slotTime':
          return item.slotTime || '';
        case 'contractor':
          return item.contactorName || item.contractorName || '';
        case 'installer':
          return item.installerName || '';
        case 'statusInstaller':
          return item.statusWOInstaller || '';
        case 'remarks':
          return item.technicalReport?.rootCause || item.remarksWOInstaller || item.remarksAgent || '';
        default:
          return (item as any)[col];
      }
    });
  }, [reportData, sortState]);

  // Paginated Data
  const paginatedData = useMemo(() => {
    if (pageSize === 'ALL') return sortedReportData;
    const startIdx = (currentPage - 1) * pageSize;
    return sortedReportData.slice(startIdx, startIdx + pageSize);
  }, [sortedReportData, currentPage, pageSize]);

  const totalPages = useMemo(() => {
    if (pageSize === 'ALL') return 1;
    return Math.max(1, Math.ceil(sortedReportData.length / pageSize));
  }, [sortedReportData.length, pageSize]);

  // Reset all filters
  const handleResetFilters = () => {
    setColFilters(initialFilters);
    setSearchQuery('');
    setContractorFilter('ALL');
    setAreaFilter('ALL');
    setDateStart('');
    setDateEnd('');
    setSortState({ column: null, direction: null });
    setCurrentPage(1);
    toast.info('Semua filter kolom dan pencarian telah di-reset.', 'Filter Dikosongkan');
  };

  // Copy Data to Clipboard (TSV)
  const handleCopyData = async () => {
    if (sortedReportData.length === 0) {
      toast.warning('Tidak ada data untuk disalin.', 'Data Kosong');
      return;
    }
    const header = [
      'No',
      'WO Number',
      'Customer ID',
      'Customer Name',
      'Phone',
      'Appointment Date',
      'Slot Time',
      'Area',
      'Contractor',
      'Installer',
      'Status Installer',
      'Remarks / Root Cause'
    ].join('\t');

    const rows = sortedReportData.map((t, idx) =>
      [
        idx + 1,
        t.woNumber || '',
        t.idCustomer || t.customerId || '',
        t.customerName || '',
        t.customerPhone || '',
        t.appointmentDate || t.date || '',
        t.slotTime || '',
        t.area || '',
        t.contactorName || t.contractorName || '',
        t.installerName || '',
        t.statusWOInstaller || '',
        t.technicalReport?.rootCause || t.remarksWOInstaller || t.remarksAgent || ''
      ].join('\t')
    );

    const tsvText = [header, ...rows].join('\n');
    try {
      await navigator.clipboard.writeText(tsvText);
      toast.success(`${sortedReportData.length} baris data berhasil disalin ke clipboard!`, 'Salin Berhasil');
    } catch (err) {
      toast.error('Gagal menyalin data ke clipboard browser.', 'Gagal Salin');
    }
  };

  // Export to Excel (Current Filtered View)
  const handleExportExcel = () => {
    if (sortedReportData.length === 0) {
      toast.warning('Tidak ada data pada laporan ini untuk diekspor.', 'Data Kosong');
      return;
    }
    const rows = sortedReportData.map((t, idx) => ({
      'No': idx + 1,
      'WO Number': t.woNumber,
      'Customer ID': t.idCustomer || t.customerId,
      'Customer Name': t.customerName,
      'Phone': t.customerPhone,
      'Appointment Date': t.appointmentDate || t.date,
      'Slot Time': t.slotTime,
      'Area': t.area,
      'Cluster': t.clusterName,
      'Contractor': t.contactorName || t.contractorName,
      'Leader': t.leaderName,
      'Installer': t.installerName,
      'Status Agent': t.statusWOAgent,
      'Status Installer': t.statusWOInstaller,
      'Root Cause': t.technicalReport?.rootCause || '-',
      'Work Result': t.technicalReport?.workResult || '-',
      'Remarks': t.remarksWOInstaller || t.remarksAgent || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Laporan_WO');
    const fileName = `MoraJaws_Laporan_${reportType}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success(`Laporan ${sortedReportData.length} baris berhasil diekspor ke Excel.`, 'Ekspor Berhasil');
  };

  // Export ALL Work Orders in Database
  const handleExportAllWO = () => {
    if (activeTickets.length === 0) {
      toast.warning('Database Work Order kosong.', 'Data Kosong');
      return;
    }
    const rows = activeTickets.map((t, idx) => ({
      'No': idx + 1,
      'WO Number': t.woNumber,
      'Customer ID': t.idCustomer || t.customerId,
      'Customer Name': t.customerName,
      'Phone': t.customerPhone,
      'Appointment Date': t.appointmentDate || t.date,
      'Slot Time': t.slotTime,
      'Area': t.area,
      'Cluster': t.clusterName,
      'Contractor': t.contactorName || t.contractorName,
      'Leader': t.leaderName,
      'Installer': t.installerName,
      'Status Agent': t.statusWOAgent,
      'Status Installer': t.statusWOInstaller,
      'Root Cause': t.technicalReport?.rootCause || '-',
      'Work Result': t.technicalReport?.workResult || '-',
      'Remarks': t.remarksWOInstaller || t.remarksAgent || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Semua_Master_WO');
    const fileName = `MoraJaws_ALL_WO_MASTER_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success(`Seluruh ${activeTickets.length} Work Order berhasil diunduh.`, 'Download All WO Selesai');
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (sortedReportData.length === 0) return;
    const rows = sortedReportData.map(t => ({
      'WO Number': t.woNumber,
      'Customer ID': t.idCustomer || t.customerId,
      'Customer Name': t.customerName,
      'Phone': t.customerPhone,
      'Appointment Date': t.appointmentDate || t.date,
      'Slot Time': t.slotTime,
      'Area': t.area,
      'Contractor': t.contactorName || t.contractorName,
      'Installer': t.installerName,
      'Status': t.statusWOInstaller
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MoraJaws_Laporan_${reportType}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Laporan CSV berhasil diunduh.', 'Ekspor CSV');
  };

  const hasActiveFilters = Boolean(
    searchQuery ||
    contractorFilter !== 'ALL' ||
    areaFilter !== 'ALL' ||
    dateStart ||
    dateEnd ||
    Object.values(colFilters).some(v => Boolean(v.trim()))
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#5B35B1] text-white flex items-center justify-center font-bold shadow-xs">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#3B1D78] dark:text-purple-200 flex items-center gap-2">
              <span>Pusat Laporan & Rekapitulasi Data Work Order</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E9E1FF] text-[#3B1D78] dark:bg-purple-900/60 dark:text-purple-200">
                Individual Column Search & Global Sorting
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              DataTable interaktif dengan pencarian mandiri per-kolom, pengurutan 3-state, dan ekspor multi-format.
            </p>
          </div>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={handleCopyData}
            className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer text-slate-700 dark:text-slate-200"
            title="Salin data tabel yang tampil ke clipboard (TSV format)"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Salin Data</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Ekspor XLSX</span>
          </button>

          <button
            type="button"
            onClick={handleExportAllWO}
            className="px-3.5 py-1.5 bg-[#5B35B1] hover:bg-[#3B1D78] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            title="Download seluruh Work Order master tanpa terpengaruh filter"
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Download All WO</span>
          </button>
        </div>
      </div>

      {/* Report Types Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-[#D8CCF3] dark:border-purple-900/60 text-xs font-semibold no-scrollbar">
        {[
          { id: 'all_wo', label: 'Semua WO', count: activeTickets.length },
          { id: 'completed', label: 'WO Selesai', count: activeTickets.filter(t => t.statusWOInstaller === 'Completed' || t.statusWOAgent === 'Closed').length },
          { id: 'pending', label: 'Pending / Reschedule', count: activeTickets.filter(t => t.statusWOInstaller === 'Pending Technical' || t.statusWOAgent === 'Pending').length },
          { id: 'overdue', label: 'Overdue (Terlewat)', count: activeTickets.filter(isOverdue).length },
          { id: 'wo_installer', label: 'Kinerja Teknisi', count: activeTickets.filter(t => Boolean(t.installerName)).length },
          { id: 'reassign_history', label: 'Riwayat Reassign', count: activeTickets.filter(t => t.assignmentHistory && t.assignmentHistory.length > 0).length },
          { id: 'root_cause', label: 'Laporan Root Cause', count: activeTickets.filter(t => Boolean(t.technicalReport?.rootCause)).length },
          { id: 'incomplete_data', label: 'Data Tidak Lengkap', count: activeTickets.filter(t => !/^[0-9]{7}$/.test((t.idCustomer || '').trim()) || !t.appointmentDate).length }
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setReportType(tab.id as any);
              setCurrentPage(1);
            }}
            className={`px-3.5 py-2 rounded-t-xl border-b-2 flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
              reportType === tab.id
                ? 'border-[#5B35B1] bg-white dark:bg-[#1A0E2E] text-[#3B1D78] dark:text-purple-300 font-bold shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>{tab.label}</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Global Filters Toolbar & Reset */}
      <div className="p-4 bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 flex-1 min-w-[280px]">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari Global (WO, Pelanggan, ID, Teknisi)..."
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-[#D8CCF3] dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#5B35B1]"
            />
          </div>
          <select
            value={contractorFilter}
            onChange={e => {
              setContractorFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-[#D8CCF3] dark:border-slate-700 rounded-xl"
          >
            <option value="ALL">Semua Mitra Kontraktor</option>
            {contractors.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400">Dari:</span>
            <input
              type="date"
              value={dateStart}
              onChange={e => {
                setDateStart(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-[#D8CCF3] dark:border-slate-700 rounded-lg text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400">Sampai:</span>
            <input
              type="date"
              value={dateEnd}
              onChange={e => {
                setDateEnd(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-[#D8CCF3] dark:border-slate-700 rounded-lg text-xs"
            />
          </div>
        </div>

        {/* Reset Filter Button */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleResetFilters}
            className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 dark:hover:bg-rose-900 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Semua Filter</span>
          </button>
        )}
      </div>

      {/* Interactive Data Table with Individual Column Search (Requirement 2 & 3) */}
      <div className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 shadow-xs overflow-hidden">
        <div className="px-5 py-3 border-b flex flex-wrap items-center justify-between text-xs gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800 dark:text-slate-200">
              Hasil Laporan: {sortedReportData.length} Work Order
            </span>
            {hasActiveFilters && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-[#5B35B1] dark:bg-purple-950 dark:text-purple-300">
                Filter Aktif
              </span>
            )}
            {sortState.column && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                Sorted by {sortState.column} ({sortState.direction})
              </span>
            )}
          </div>

          {/* Page size selector */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-[11px]">Tampilkan:</span>
            <select
              value={pageSize}
              onChange={e => {
                const val = e.target.value === 'ALL' ? 'ALL' : Number(e.target.value);
                setPageSize(val);
                setCurrentPage(1);
              }}
              className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value="ALL">Semua</option>
            </select>
            <span className="text-slate-400 text-[11px]">baris</span>
          </div>
        </div>

        {sortedReportData.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-2">
            <AlertCircle className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
            <div className="font-semibold text-slate-600 dark:text-slate-300">
              Tidak ada data yang sesuai dengan kombinasi filter dan pencarian.
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="mt-2 px-3 py-1 bg-[#5B35B1] text-white rounded-lg text-xs font-semibold"
              >
                Kosongkan Filter
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[560px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#F5F1FF] dark:bg-[#251545] text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase sticky top-0 z-10 shadow-xs">
                {/* Header Row with 3-State Sorting (Feature 3) */}
                <tr className="border-b border-[#D8CCF3] dark:border-purple-900/50">
                  <th className="py-2.5 px-3 w-12 text-center">No</th>
                  <th className="py-2.5 px-3 min-w-[130px]">
                    <SortableColumnHeader
                      label="WO Number"
                      columnKey="woNumber"
                      currentSortColumn={sortState.column}
                      currentDirection={sortState.direction}
                      dataType="wo_number"
                      onSort={handleSort}
                    />
                  </th>
                  <th className="py-2.5 px-3 min-w-[110px]">
                    <SortableColumnHeader
                      label="Customer ID"
                      columnKey="customerId"
                      currentSortColumn={sortState.column}
                      currentDirection={sortState.direction}
                      dataType="number"
                      onSort={handleSort}
                    />
                  </th>
                  <th className="py-2.5 px-3 min-w-[150px]">
                    <SortableColumnHeader
                      label="Nama Pelanggan"
                      columnKey="customerName"
                      currentSortColumn={sortState.column}
                      currentDirection={sortState.direction}
                      dataType="text"
                      onSort={handleSort}
                    />
                  </th>
                  <th className="py-2.5 px-3 min-w-[110px]">
                    <SortableColumnHeader
                      label="Area"
                      columnKey="area"
                      currentSortColumn={sortState.column}
                      currentDirection={sortState.direction}
                      dataType="text"
                      onSort={handleSort}
                    />
                  </th>
                  <th className="py-2.5 px-3 min-w-[130px]">
                    <SortableColumnHeader
                      label="Appointment"
                      columnKey="appointmentDate"
                      currentSortColumn={sortState.column}
                      currentDirection={sortState.direction}
                      dataType="date"
                      onSort={handleSort}
                    />
                  </th>
                  <th className="py-2.5 px-3 min-w-[100px]">
                    <SortableColumnHeader
                      label="Slot Time"
                      columnKey="slotTime"
                      currentSortColumn={sortState.column}
                      currentDirection={sortState.direction}
                      dataType="time_slot"
                      onSort={handleSort}
                    />
                  </th>
                  <th className="py-2.5 px-3 min-w-[120px]">
                    <SortableColumnHeader
                      label="Kontraktor"
                      columnKey="contractor"
                      currentSortColumn={sortState.column}
                      currentDirection={sortState.direction}
                      dataType="text"
                      onSort={handleSort}
                    />
                  </th>
                  <th className="py-2.5 px-3 min-w-[130px]">
                    <SortableColumnHeader
                      label="Teknisi"
                      columnKey="installer"
                      currentSortColumn={sortState.column}
                      currentDirection={sortState.direction}
                      dataType="text"
                      onSort={handleSort}
                    />
                  </th>
                  <th className="py-2.5 px-3 min-w-[130px]">
                    <SortableColumnHeader
                      label="Status Installer"
                      columnKey="statusInstaller"
                      currentSortColumn={sortState.column}
                      currentDirection={sortState.direction}
                      dataType="status"
                      onSort={handleSort}
                    />
                  </th>
                  <th className="py-2.5 px-3 min-w-[140px]">
                    <SortableColumnHeader
                      label="Catatan / Root Cause"
                      columnKey="remarks"
                      currentSortColumn={sortState.column}
                      currentDirection={sortState.direction}
                      dataType="text"
                      onSort={handleSort}
                    />
                  </th>
                </tr>

                {/* Individual Column Search Row (Feature 2) */}
                <tr className="bg-[#EFE9FC] dark:bg-[#1E1136] border-b border-[#D8CCF3] dark:border-purple-900/60">
                  <td className="p-1.5 text-center">
                    <Search className="w-3.5 h-3.5 text-slate-400 mx-auto" />
                  </td>
                  <td className="p-1.5">
                    <input
                      type="text"
                      placeholder="Cari WO..."
                      value={colFilters.woNumber}
                      onChange={e => {
                        setColFilters(prev => ({ ...prev, woNumber: e.target.value }));
                        setCurrentPage(1);
                      }}
                      className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-[#5B35B1]"
                    />
                  </td>
                  <td className="p-1.5">
                    <input
                      type="text"
                      placeholder="Cari ID..."
                      value={colFilters.customerId}
                      onChange={e => {
                        setColFilters(prev => ({ ...prev, customerId: e.target.value }));
                        setCurrentPage(1);
                      }}
                      className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-[#5B35B1]"
                    />
                  </td>
                  <td className="p-1.5">
                    <input
                      type="text"
                      placeholder="Cari Nama..."
                      value={colFilters.customerName}
                      onChange={e => {
                        setColFilters(prev => ({ ...prev, customerName: e.target.value }));
                        setCurrentPage(1);
                      }}
                      className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-[11px] focus:outline-none focus:ring-1 focus:ring-[#5B35B1]"
                    />
                  </td>
                  <td className="p-1.5">
                    <input
                      type="text"
                      placeholder="Cari Area..."
                      value={colFilters.area}
                      onChange={e => {
                        setColFilters(prev => ({ ...prev, area: e.target.value }));
                        setCurrentPage(1);
                      }}
                      className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-[11px] focus:outline-none focus:ring-1 focus:ring-[#5B35B1]"
                    />
                  </td>
                  <td className="p-1.5">
                    <input
                      type="text"
                      placeholder="YYYY-MM-DD..."
                      value={colFilters.appointmentDate}
                      onChange={e => {
                        setColFilters(prev => ({ ...prev, appointmentDate: e.target.value }));
                        setCurrentPage(1);
                      }}
                      className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-[#5B35B1]"
                    />
                  </td>
                  <td className="p-1.5">
                    <input
                      type="text"
                      placeholder="Slot..."
                      value={colFilters.slotTime}
                      onChange={e => {
                        setColFilters(prev => ({ ...prev, slotTime: e.target.value }));
                        setCurrentPage(1);
                      }}
                      className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-[11px] focus:outline-none focus:ring-1 focus:ring-[#5B35B1]"
                    />
                  </td>
                  <td className="p-1.5">
                    <input
                      type="text"
                      placeholder="Kontraktor..."
                      value={colFilters.contractor}
                      onChange={e => {
                        setColFilters(prev => ({ ...prev, contractor: e.target.value }));
                        setCurrentPage(1);
                      }}
                      className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-[11px] focus:outline-none focus:ring-1 focus:ring-[#5B35B1]"
                    />
                  </td>
                  <td className="p-1.5">
                    <input
                      type="text"
                      placeholder="Teknisi..."
                      value={colFilters.installer}
                      onChange={e => {
                        setColFilters(prev => ({ ...prev, installer: e.target.value }));
                        setCurrentPage(1);
                      }}
                      className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-[11px] focus:outline-none focus:ring-1 focus:ring-[#5B35B1]"
                    />
                  </td>
                  <td className="p-1.5">
                    <input
                      type="text"
                      placeholder="Status..."
                      value={colFilters.statusInstaller}
                      onChange={e => {
                        setColFilters(prev => ({ ...prev, statusInstaller: e.target.value }));
                        setCurrentPage(1);
                      }}
                      className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-[11px] focus:outline-none focus:ring-1 focus:ring-[#5B35B1]"
                    />
                  </td>
                  <td className="p-1.5">
                    <input
                      type="text"
                      placeholder="Root cause / remarks..."
                      value={colFilters.remarks}
                      onChange={e => {
                        setColFilters(prev => ({ ...prev, remarks: e.target.value }));
                        setCurrentPage(1);
                      }}
                      className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-[11px] focus:outline-none focus:ring-1 focus:ring-[#5B35B1]"
                    />
                  </td>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginatedData.map((t, idx) => {
                  const globalIdx = pageSize === 'ALL' ? idx + 1 : (currentPage - 1) * pageSize + idx + 1;
                  return (
                    <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-slate-400 text-center">{globalIdx}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-[#5B35B1] dark:text-purple-300">{t.woNumber}</td>
                      <td className="py-2.5 px-3 font-mono">{t.idCustomer || t.customerId || '-'}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">{t.customerName}</td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{t.area || '-'}</td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-purple-700 dark:text-purple-300 font-medium">
                        {t.appointmentDate || t.date || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{t.slotTime || '-'}</td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">{t.contactorName || t.contractorName || '-'}</td>
                      <td className="py-2.5 px-3 font-medium text-emerald-600 dark:text-emerald-400">
                        {t.installerName || <span className="text-slate-400 italic">Belum Di-assign</span>}
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusInstallerBadge status={t.statusWOInstaller} />
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate" title={t.technicalReport?.rootCause || t.remarksWOInstaller || t.remarksAgent || ''}>
                        {t.technicalReport?.rootCause || t.remarksWOInstaller || t.remarksAgent || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Toolbar */}
        {sortedReportData.length > 0 && pageSize !== 'ALL' && (
          <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-[#F5F1FF]/40 dark:bg-[#201138]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="text-slate-500">
              Menampilkan {Math.min(sortedReportData.length, (currentPage - 1) * pageSize + 1)} -{' '}
              {Math.min(sortedReportData.length, currentPage * pageSize)} dari{' '}
              <strong className="text-slate-800 dark:text-slate-200">{sortedReportData.length}</strong> data Work Order
            </div>

            <div className="flex items-center gap-1.5 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 hover:bg-white dark:hover:bg-slate-800 flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>

              <span className="px-3 py-1 font-mono text-slate-700 dark:text-slate-300 font-semibold">
                Halaman {currentPage} / {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 hover:bg-white dark:hover:bg-slate-800 flex items-center gap-1 cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
