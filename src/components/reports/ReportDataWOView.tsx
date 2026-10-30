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
  FileText
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useToast } from '../../context/ToastContext';
import { formatAppointmentDateDisplay, parseAppointmentDate, getJakartaDateString } from '../../services/appointmentDateParser';
import { StatusAgentBadge, StatusInstallerBadge } from '../common/Badge';

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
        // Only with agent remarks or assigned agent
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

      // 4. Search query
      if (searchQuery && typeof searchQuery === 'string' && searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const m1 = (t.woNumber ? String(t.woNumber).toLowerCase() : '').includes(q);
        const m2 = (t.customerName ? String(t.customerName).toLowerCase() : '').includes(q);
        const m3 = (t.idCustomer || t.customerId || '').toLowerCase().includes(q);
        const m4 = (t.installerName || '').toLowerCase().includes(q);
        if (!m1 && !m2 && !m3 && !m4) return false;
      }

      return true;
    });
  }, [activeTickets, reportType, contractorFilter, areaFilter, dateStart, dateEnd, searchQuery]);

  // Export to Excel
  const handleExportExcel = () => {
    if (reportData.length === 0) {
      toast.warning('Tidak ada data pada laporan ini untuk diekspor.', 'Data Kosong');
      return;
    }
    const rows = reportData.map((t, idx) => ({
      'No': idx + 1,
      'WO Number': t.woNumber,
      'Customer ID': t.idCustomer,
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
    toast.success(`Laporan ${reportData.length} baris berhasil diekspor ke Excel.`, 'Ekspor Berhasil');
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (reportData.length === 0) return;
    const rows = reportData.map(t => ({
      'WO Number': t.woNumber,
      'Customer ID': t.idCustomer,
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
                Data Database Aktual
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Semua angka dihitung langsung dari master record database operasional tanpa data dummy.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Ekspor Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Report Types Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-[#D8CCF3] dark:border-purple-900/60 text-xs font-semibold">
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
            onClick={() => setReportType(tab.id as any)}
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

      {/* Filters Toolbar */}
      <div className="p-4 bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 shadow-xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari WO, Pelanggan, ID, Teknisi..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded-xl"
          />
        </div>
        <select
          value={contractorFilter}
          onChange={e => setContractorFilter(e.target.value)}
          className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded-xl"
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
            onChange={e => setDateStart(e.target.value)}
            className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-800 border rounded-lg"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-400">Sampai:</span>
          <input
            type="date"
            value={dateEnd}
            onChange={e => setDateEnd(e.target.value)}
            className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-800 border rounded-lg"
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b flex items-center justify-between text-xs">
          <span className="font-bold text-slate-800 dark:text-slate-200">
            Hasil Laporan: {reportData.length} Work Order
          </span>
          <span className="text-slate-400 font-mono text-[11px]">Formula Metrik Konsisten</span>
        </div>

        {reportData.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            Tidak ada data yang sesuai dengan filter laporan ini.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#F5F1FF] dark:bg-[#251545] text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase sticky top-0">
                <tr>
                  <th className="py-2.5 px-3">No</th>
                  <th className="py-2.5 px-3">WO Number</th>
                  <th className="py-2.5 px-3">Customer ID</th>
                  <th className="py-2.5 px-3">Nama Pelanggan</th>
                  <th className="py-2.5 px-3">Appointment Date</th>
                  <th className="py-2.5 px-3">Slot Time</th>
                  <th className="py-2.5 px-3">Kontraktor</th>
                  <th className="py-2.5 px-3">Teknisi</th>
                  <th className="py-2.5 px-3">Status Installer</th>
                  <th className="py-2.5 px-3">Catatan / Root Cause</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {reportData.map((t, idx) => (
                  <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 font-mono text-slate-400">{idx + 1}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-[#5B35B1]">{t.woNumber}</td>
                    <td className="py-2.5 px-3 font-mono">{t.idCustomer || '-'}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">{t.customerName}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-purple-700 dark:text-purple-300 font-medium">
                      {t.appointmentDate || t.date || '-'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{t.slotTime}</td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">{t.contactorName || t.contractorName}</td>
                    <td className="py-2.5 px-3 font-medium text-emerald-600">{t.installerName || <span className="text-slate-400 italic">Belum Di-assign</span>}</td>
                    <td className="py-2.5 px-3"><StatusInstallerBadge status={t.statusWOInstaller} /></td>
                    <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate">
                      {t.technicalReport?.rootCause || t.remarksWOInstaller || t.remarksAgent || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
