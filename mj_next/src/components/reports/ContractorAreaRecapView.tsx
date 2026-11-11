import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Ticket } from '../../types';
import {
  Building2,
  MapPin,
  Calendar,
  Search,
  RotateCcw,
  Download,
  Printer,
  Layers,
  CheckCircle2,
  Clock,
  XCircle,
  UserCheck,
  AlertTriangle,
  FileSpreadsheet,
  TrendingUp,
  Filter
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { parseAppointmentDate, getJakartaDateString, getTicketAppointmentDate } from '../../services/appointmentDateParser';
import { useToast } from '../../context/ToastContext';

interface ContractorRowData {
  contractorName: string;
  totalWO: number;
  assign: number;
  unassign: number;
  complete: number;
  uncomplete: number;
  cancel: number;
}

interface AreaGroupData {
  areaName: string;
  contractors: ContractorRowData[];
  subtotal: ContractorRowData;
}

export const ContractorAreaRecapView: React.FC = () => {
  const { tickets, contractorsList, areasList, currentUser } = useApp();
  const { toast } = useToast();

  const isLeader = currentUser?.role === 'leader';
  const leaderContractor = currentUser?.contractor || '';
  const leaderArea = currentUser?.area || '';

  const todayWIB = getJakartaDateString(0);

  // Filters: Default to leader contractor & area if leader role
  const [selectedArea, setSelectedArea] = useState<string>(() => (isLeader && leaderArea ? leaderArea : 'ALL'));
  const [selectedContractor, setSelectedContractor] = useState<string>(() => (isLeader && leaderContractor ? leaderContractor : 'ALL'));
  const [startDate, setStartDate] = useState<string>(todayWIB);
  const [endDate, setEndDate] = useState<string>(todayWIB);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Handle Reset Filter
  const handleResetFilter = () => {
    setSelectedArea(isLeader && leaderArea ? leaderArea : 'ALL');
    setSelectedContractor(isLeader && leaderContractor ? leaderContractor : 'ALL');
    setStartDate(todayWIB);
    setEndDate(todayWIB);
    setSearchQuery('');
    toast.info('Filter dikembalikan ke pengaturan default (Hari ini WIB).', 'Filter Direset');
  };

  // Base list of active, non-deleted tickets
  const activeTickets = useMemo(() => {
    return tickets.filter(t => !t.isArchived && !t.isDeleted);
  }, [tickets]);

  // Filtered tickets based on appointment date range
  const filteredTickets = useMemo(() => {
    return activeTickets.filter(t => {
      // 1. Strict Appointment Date filter in Asia/Jakarta WIB
      const ticketApptDate = getTicketAppointmentDate(t);
      if (!ticketApptDate) return false;

      if (startDate && ticketApptDate < startDate) return false;
      if (endDate && ticketApptDate > endDate) return false;

      // 2. Area Filter
      const ticketArea = (t.area || '').trim() || 'Belum Ditentukan';
      if (selectedArea !== 'ALL' && ticketArea.toLowerCase() !== selectedArea.toLowerCase()) {
        return false;
      }

      // 3. Contractor Filter
      const ticketContractor = (t.contactorName || t.contractorName || (t as any).contractor || (t as any).vendorName || '').trim() || 'Belum Ditentukan';
      if (selectedContractor !== 'ALL' && ticketContractor.toLowerCase() !== selectedContractor.toLowerCase()) {
        return false;
      }

      // 4. Search query (area or contractor name)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchArea = ticketArea.toLowerCase().includes(q);
        const matchContractor = ticketContractor.toLowerCase().includes(q);
        const matchWo = String(t.woNumber ?? '').toLowerCase().includes(q);
        if (!matchArea && !matchContractor && !matchWo) return false;
      }

      return true;
    });
  }, [activeTickets, startDate, endDate, selectedArea, selectedContractor, searchQuery]);

  // Helper to categorize ticket operational status
  const classifyTicketStatus = (t: Ticket): { isAssign: boolean; isComplete: boolean; isCancel: boolean; isUncomplete: boolean } => {
    const isAssign = Boolean(t.installerName && t.installerName.trim());

    const isCancel =
      t.statusWOInstaller === 'Failed / Cancelled' ||
      t.statusWOAgent === 'Cancelled' ||
      (t as any).statusWOInstaller === 'Cancel' ||
      (t as any).statusWOAgent === 'Cancel' ||
      t.statusWhatsApp === 'cancelled';

    const isComplete =
      !isCancel &&
      (t.statusWOInstaller === 'Completed' ||
        t.statusWOInstaller === 'Installed' ||
        t.statusWOAgent === 'Resolved' ||
        t.statusWOAgent === 'Closed');

    const isUncomplete = !isCancel && !isComplete;

    return {
      isAssign,
      isComplete,
      isCancel,
      isUncomplete
    };
  };

  // Grouped data: Area (Tingkat 1) -> Contractor (Tingkat 2)
  const groupedData = useMemo(() => {
    const areaMap = new Map<string, Map<string, ContractorRowData>>();

    // Avoid double counting by processing each unique ticket exactly once
    const processedTicketIds = new Set<string>();

    filteredTickets.forEach(t => {
      if (processedTicketIds.has(t.id)) return;
      processedTicketIds.add(t.id);

      const areaKey = (t.area || '').trim() || 'Belum Ditentukan';
      const contractorKey = (t.contactorName || t.contractorName || (t as any).contractor || (t as any).vendorName || '').trim() || 'Belum Ditentukan';

      if (!areaMap.has(areaKey)) {
        areaMap.set(areaKey, new Map<string, ContractorRowData>());
      }
      const contractorsInArea = areaMap.get(areaKey)!;

      if (!contractorsInArea.has(contractorKey)) {
        contractorsInArea.set(contractorKey, {
          contractorName: contractorKey,
          totalWO: 0,
          assign: 0,
          unassign: 0,
          complete: 0,
          uncomplete: 0,
          cancel: 0
        });
      }

      const row = contractorsInArea.get(contractorKey)!;
      const { isAssign, isComplete, isCancel, isUncomplete } = classifyTicketStatus(t);

      row.totalWO += 1;
      if (isAssign) row.assign += 1;
      else row.unassign += 1;

      if (isComplete) row.complete += 1;
      else if (isCancel) row.cancel += 1;
      else if (isUncomplete) row.uncomplete += 1;
    });

    // Build structured output with subtotals
    const result: AreaGroupData[] = [];

    Array.from(areaMap.entries())
      .sort(([a], [b]) => {
        if (a === 'Belum Ditentukan') return 1;
        if (b === 'Belum Ditentukan') return -1;
        return a.localeCompare(b);
      })
      .forEach(([areaName, contractorsInArea]) => {
        const contractors = Array.from(contractorsInArea.values()).sort((a, b) =>
          a.contractorName.localeCompare(b.contractorName)
        );

        const subtotal: ContractorRowData = {
          contractorName: `Subtotal ${areaName}`,
          totalWO: 0,
          assign: 0,
          unassign: 0,
          complete: 0,
          uncomplete: 0,
          cancel: 0
        };

        contractors.forEach(c => {
          subtotal.totalWO += c.totalWO;
          subtotal.assign += c.assign;
          subtotal.unassign += c.unassign;
          subtotal.complete += c.complete;
          subtotal.uncomplete += c.uncomplete;
          subtotal.cancel += c.cancel;
        });

        result.push({
          areaName,
          contractors,
          subtotal
        });
      });

    return result;
  }, [filteredTickets]);

  // Grand Total calculation
  const grandTotal = useMemo<ContractorRowData>(() => {
    const total: ContractorRowData = {
      contractorName: 'GRAND TOTAL',
      totalWO: 0,
      assign: 0,
      unassign: 0,
      complete: 0,
      uncomplete: 0,
      cancel: 0
    };

    groupedData.forEach(group => {
      total.totalWO += group.subtotal.totalWO;
      total.assign += group.subtotal.assign;
      total.unassign += group.subtotal.unassign;
      total.complete += group.subtotal.complete;
      total.uncomplete += group.subtotal.uncomplete;
      total.cancel += group.subtotal.cancel;
    });

    return total;
  }, [groupedData]);

  // List of available areas and contractors from dataset
  const availableAreas = useMemo(() => {
    const set = new Set<string>();
    activeTickets.forEach(t => {
      const a = (t.area || '').trim();
      if (a) set.add(a);
    });
    areasList.forEach(a => set.add(a));
    return Array.from(set).sort();
  }, [activeTickets, areasList]);

  const availableContractors = useMemo(() => {
    const set = new Set<string>();
    activeTickets.forEach(t => {
      const c = (t.contactorName || t.contractorName || (t as any).contractor || (t as any).vendorName || '').trim();
      if (c) set.add(c);
    });
    contractorsList.forEach(c => set.add(c));
    return Array.from(set).sort();
  }, [activeTickets, contractorsList]);

  // Export to Excel (.xlsx)
  const handleExportExcel = () => {
    try {
      const rows: any[] = [];

      // Metadata Header
      rows.push(['REKAP TOTAL WORK ORDER PER KONTRAKTOR BERDASARKAN AREA']);
      rows.push([`Rentang Tanggal Appointment: ${startDate || 'Semua'} s/d ${endDate || 'Semua'} (WIB)`]);
      rows.push([`Waktu Unduh: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`]);
      rows.push([]);

      // Table Header
      rows.push([
        'Area',
        'Nama Kontraktor',
        'Total WO',
        'Assign',
        'Unassign',
        'Complete',
        'Uncomplete',
        'Cancel'
      ]);

      // Data Rows
      groupedData.forEach(group => {
        group.contractors.forEach((c, idx) => {
          rows.push([
            idx === 0 ? group.areaName : '', // Show area name on first row of area
            c.contractorName,
            c.totalWO,
            c.assign,
            c.unassign,
            c.complete,
            c.uncomplete,
            c.cancel
          ]);
        });

        // Area Subtotal Row
        rows.push([
          `TOTAL ${group.areaName.toUpperCase()}`,
          '-',
          group.subtotal.totalWO,
          group.subtotal.assign,
          group.subtotal.unassign,
          group.subtotal.complete,
          group.subtotal.uncomplete,
          group.subtotal.cancel
        ]);
        rows.push([]); // blank row separator
      });

      // Grand Total Row
      rows.push([
        'GRAND TOTAL KESELURUHAN',
        '-',
        grandTotal.totalWO,
        grandTotal.assign,
        grandTotal.unassign,
        grandTotal.complete,
        grandTotal.uncomplete,
        grandTotal.cancel
      ]);

      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap WO Area & Kontraktor');

      const fileName = `Rekap_WO_Area_Kontraktor_${startDate || 'all'}_sd_${endDate || 'all'}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      toast.success(`Berkas Excel berhasil diunduh: ${fileName}`, 'Ekspor Sukses');
    } catch (err: any) {
      console.error('Export Excel failed:', err);
      toast.error('Gagal mengekspor data ke Excel.', 'Ekspor Gagal');
    }
  };

  // Print / PDF
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#1E0F3D] via-[#35105E] to-[#4C1D95] rounded-2xl p-5 text-white shadow-lg border border-[#7135B5]/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-[#5B35B1]/50 border border-[#D8B4FE]/40 flex items-center justify-center text-[#D8B4FE] shadow-inner">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  <span>REKAP TOTAL WO PER KONTRAKTOR BERDASARKAN AREA</span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#A855F7]/30 border border-[#D8B4FE]/40 text-[#E9D5FF]">
                    Area & Contractor Recap
                  </span>
                </h1>
                <p className="text-xs text-[#D8B4FE]/90">
                  Laporan rekapitulasi progres pekerjaan bertingkat: Area (Tingkat 1) dan Kontraktor (Tingkat 2) berbasis Appointment Date WIB.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
              title="Unduh format spreadsheet Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Ekspor Excel (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#5B35B1] hover:bg-[#3B1D78] text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
              title="Cetak atau Simpan sebagai PDF"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak / PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* 6 Metric Cards Overview (Grand Total Snapshot) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total WO */}
        <div className="bg-white dark:bg-[#1A0E2E] rounded-xl border border-slate-200 dark:border-purple-900/40 p-3.5 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10.5px] font-medium text-slate-500 uppercase tracking-wider block truncate">Total WO</span>
            <span className="text-lg font-bold font-mono text-slate-900 dark:text-white leading-none">{grandTotal.totalWO}</span>
          </div>
        </div>

        {/* Assign */}
        <div className="bg-white dark:bg-[#1A0E2E] rounded-xl border border-slate-200 dark:border-purple-900/40 p-3.5 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10.5px] font-medium text-slate-500 uppercase tracking-wider block truncate">Assign</span>
            <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400 leading-none">{grandTotal.assign}</span>
          </div>
        </div>

        {/* Unassign */}
        <div className="bg-white dark:bg-[#1A0E2E] rounded-xl border border-slate-200 dark:border-purple-900/40 p-3.5 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10.5px] font-medium text-slate-500 uppercase tracking-wider block truncate">Unassign</span>
            <span className="text-lg font-bold font-mono text-amber-600 dark:text-amber-400 leading-none">{grandTotal.unassign}</span>
          </div>
        </div>

        {/* Complete */}
        <div className="bg-white dark:bg-[#1A0E2E] rounded-xl border border-slate-200 dark:border-purple-900/40 p-3.5 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-teal-100 dark:bg-teal-950 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10.5px] font-medium text-slate-500 uppercase tracking-wider block truncate">Complete</span>
            <span className="text-lg font-bold font-mono text-teal-600 dark:text-teal-400 leading-none">{grandTotal.complete}</span>
          </div>
        </div>

        {/* Uncomplete */}
        <div className="bg-white dark:bg-[#1A0E2E] rounded-xl border border-slate-200 dark:border-purple-900/40 p-3.5 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10.5px] font-medium text-slate-500 uppercase tracking-wider block truncate">Uncomplete</span>
            <span className="text-lg font-bold font-mono text-blue-600 dark:text-blue-400 leading-none">{grandTotal.uncomplete}</span>
          </div>
        </div>

        {/* Cancel */}
        <div className="bg-white dark:bg-[#1A0E2E] rounded-xl border border-slate-200 dark:border-purple-900/40 p-3.5 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <XCircle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10.5px] font-medium text-slate-500 uppercase tracking-wider block truncate">Cancel</span>
            <span className="text-lg font-bold font-mono text-rose-600 dark:text-rose-400 leading-none">{grandTotal.cancel}</span>
          </div>
        </div>
      </div>

      {/* Filter Toolbar (7.B) */}
      <div className="bg-white dark:bg-[#1A0E2E] rounded-2xl border border-slate-200 dark:border-purple-900/50 p-4 shadow-xs space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300">
          <Filter className="w-4 h-4 text-[#7135B5]" />
          <span>Filter & Pencarian Laporan Rekap</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {/* 1. Filter Area */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Pilih Area
            </label>
            <select
              value={selectedArea}
              onChange={e => setSelectedArea(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            >
              <option value="ALL">Semua Area ({availableAreas.length})</option>
              {availableAreas.map(area => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Filter Kontraktor */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Pilih Kontraktor
            </label>
            <select
              value={selectedContractor}
              onChange={e => setSelectedContractor(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            >
              <option value="ALL">Semua Kontraktor ({availableContractors.length})</option>
              {availableContractors.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Start Date Appointment */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Tgl Appointment Mulai (WIB)
            </label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
            />
          </div>

          {/* 4. End Date Appointment */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Tgl Appointment Akhir (WIB)
            </label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
            />
          </div>

          {/* 5. Pencarian & Tombol Reset */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Pencarian Teks
            </label>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari area, kontraktor..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
              <button
                type="button"
                onClick={handleResetFilter}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition-colors shrink-0 flex items-center gap-1 font-semibold"
                title="Reset filter ke default"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            </div>
          </div>
        </div>

        {/* Info Banner Filter Aktif */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-[11px] text-slate-500 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              Menampilkan <strong>{filteredTickets.length}</strong> tiket aktif dalam rentang Appointment Date:{' '}
              <strong className="text-purple-700 dark:text-purple-300">{startDate || 'Awal'}</strong> s/d{' '}
              <strong className="text-purple-700 dark:text-purple-300">{endDate || 'Akhir'}</strong>
            </span>
          </div>
          <div>
            <span>Terbagi dalam <strong>{groupedData.length}</strong> Area kerja operasional</span>
          </div>
        </div>
      </div>

      {/* Main Table: Hierarchical by Area -> Contractor */}
      <div className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 shadow-sm overflow-hidden">
        {groupedData.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-purple-50 dark:bg-purple-950/60 text-[#7135B5] flex items-center justify-center">
              <Layers className="w-7 h-7" />
            </div>
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
              Tidak Ada Data Work Order Sesuai Filter
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Tidak ditemukan tiket WO dengan Appointment Date pada rentang {startDate} s/d {endDate} untuk kriteria filter yang dipilih.
            </p>
            <button
              type="button"
              onClick={handleResetFilter}
              className="px-4 py-2 bg-[#5B35B1] hover:bg-[#3B1D78] text-white text-xs font-bold rounded-xl transition-all"
            >
              Kembalikan ke Hari Ini
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gradient-to-r from-[#21183A] to-[#35105E] text-white font-bold border-b border-[#35105E]">
                  <th className="py-3 px-4 w-12 text-center">No</th>
                  <th className="py-3 px-4">Nama Kontraktor</th>
                  <th className="py-3 px-3 text-right">Total WO</th>
                  <th className="py-3 px-3 text-right text-emerald-300">Assign</th>
                  <th className="py-3 px-3 text-right text-amber-300">Unassign</th>
                  <th className="py-3 px-3 text-right text-teal-300">Complete</th>
                  <th className="py-3 px-3 text-right text-blue-300">Uncomplete</th>
                  <th className="py-3 px-3 text-right text-rose-300">Cancel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {groupedData.map((group, groupIdx) => (
                  <React.Fragment key={group.areaName}>
                    {/* AREA HEADER (Tingkat 1 - Pengelompokan Utama) */}
                    <tr className="bg-[#F3E8FF] dark:bg-[#2C184D] border-t-2 border-b border-[#D8B4FE] dark:border-purple-800/80">
                      <td colSpan={8} className="py-2.5 px-4 font-bold text-xs text-[#4C1D95] dark:text-[#E9D5FF]">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-[#7135B5] shrink-0" />
                            <span className="tracking-wide uppercase font-extrabold text-[12.5px]">
                              AREA: {group.areaName}
                            </span>
                            {group.areaName === 'Belum Ditentukan' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-normal">
                                Perlu Penyesuaian Data
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-mono text-[#5B35B1] dark:text-[#D8B4FE]">
                            {group.contractors.length} Kontraktor | {group.subtotal.totalWO} WO
                          </span>
                        </div>
                      </td>
                    </tr>

                    {/* KONTRAKTOR ROWS (Tingkat 2 - Rincian di dalam Area) */}
                    {group.contractors.map((c, cIdx) => (
                      <tr
                        key={`${group.areaName}-${c.contractorName}`}
                        className="hover:bg-slate-50 dark:hover:bg-purple-950/20 transition-colors"
                      >
                        <td className="py-2.5 px-4 text-center font-mono text-slate-400 text-[11px]">
                          {cIdx + 1}
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{c.contractorName}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {c.totalWO}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {c.assign}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                          {c.unassign}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-teal-600 dark:text-teal-400">
                          {c.complete}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                          {c.uncomplete}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                          {c.cancel}
                        </td>
                      </tr>
                    ))}

                    {/* SUB-TOTAL ROW PER AREA */}
                    <tr className="bg-[#FAF5FF] dark:bg-[#1E1136] font-bold border-b border-t border-[#D8CCF3] dark:border-purple-900/60 text-slate-900 dark:text-white">
                      <td colSpan={2} className="py-2 px-4 text-right uppercase text-[11px] text-[#5B35B1] dark:text-[#D8B4FE]">
                        Subtotal {group.areaName}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-extrabold text-[#5B35B1] dark:text-[#D8B4FE]">
                        {group.subtotal.totalWO}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {group.subtotal.assign}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                        {group.subtotal.unassign}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-teal-600 dark:text-teal-400">
                        {group.subtotal.complete}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                        {group.subtotal.uncomplete}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                        {group.subtotal.cancel}
                      </td>
                    </tr>
                  </React.Fragment>
                ))}

                {/* GRAND TOTAL ROW KESELURUHAN (Bagian Paling Bawah) */}
                <tr className="bg-gradient-to-r from-[#1E0F3D] to-[#35105E] text-white font-extrabold border-t-2 border-[#A855F7] text-sm">
                  <td colSpan={2} className="py-3 px-4 text-right uppercase tracking-wider text-xs">
                    GRAND TOTAL KESELURUHAN
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-white text-base">
                    {grandTotal.totalWO}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-emerald-300">
                    {grandTotal.assign}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-amber-300">
                    {grandTotal.unassign}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-teal-300">
                    {grandTotal.complete}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-blue-300">
                    {grandTotal.uncomplete}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-rose-300">
                    {grandTotal.cancel}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
