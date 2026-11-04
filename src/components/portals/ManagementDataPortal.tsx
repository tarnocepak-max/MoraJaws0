import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Ticket } from '../../types/index.ts';
import {
  Database,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Search,
  Filter,
  ShieldCheck,
  AlertCircle,
  Clock,
  Sparkles,
  Download,
  Calendar,
  Layers,
  ArrowRight,
  Eye,
  Check,
  X,
  FileCheck,
  BarChart3,
  Building2,
  RefreshCw,
  Trash2
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { parseAppointmentDate, formatAppointmentDateDisplay, getOperationalTodayDate, matchesScheduleDateFilter, ScheduleDateFilterMode } from '../../services/appointmentDateParser';
import { StatusAgentBadge, StatusInstallerBadge } from '../common/Badge';
import { ManagementDataDeleteModal } from './ManagementDataDeleteModal';
import { downloadProductionBackup } from '../../services/backupDownloadService';

interface ManagementDataPortalProps {
  onSelectTicket?: (ticket: Ticket, defaultTab?: 'overview' | 'report' | 'chat' | 'history') => void;
  onOpenWhatsApp?: (ticket: Ticket) => void;
}

export const ManagementDataPortal: React.FC<ManagementDataPortalProps> = ({
  onSelectTicket,
  onOpenWhatsApp
}) => {
  const {
    tickets,
    contractors,
    currentUser,
    headerMappings,
    canonicalFields,
    updateTicket
  } = useApp();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<'dashboard' | 'wo_data' | 'import_validation' | 'quality_monitoring'>('dashboard');

  // Search & Filter state for WO Data tab
  const [searchWo, setSearchWo] = useState('');
  const [searchCustomerId, setSearchCustomerId] = useState('');
  const [searchCustomerName, setSearchCustomerName] = useState('');
  const [selectedContractor, setSelectedContractor] = useState('ALL');
  const [selectedArea, setSelectedArea] = useState('ALL');
  const [dateFilterMode, setDateFilterMode] = useState<ScheduleDateFilterMode>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Selected ticket for quality review
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  // WO Selection for Deletion (Requirement 5: Management Data Exclusive)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [ticketToDelete, setTicketToDelete] = useState<Ticket | null>(null);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [isDownloadingBackup, setIsDownloadingBackup] = useState(false);

  const handleDownloadBackup = async () => {
    setIsDownloadingBackup(true);
    try {
      const res = await downloadProductionBackup();
      if (res.success) {
        toast.success(`Backup database (${res.size?.toLocaleString()} bytes) berhasil diverifikasi dan diunduh.`);
      } else {
        toast.error(res.error || 'Gagal mengunduh file backup database');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Terjadi kesalahan saat mengunduh backup');
    } finally {
      setIsDownloadingBackup(false);
    }
  };

  // Operational Date from system
  const operationalDate = getOperationalTodayDate();

  // Metrics computation for Dashboard Data
  const metrics = useMemo(() => {
    const activeTickets = tickets.filter(t => !t.isDeleted);
    let total = activeTickets.length;
    let validCount = 0;
    let problematicCount = 0;
    let duplicateCount = 0;
    let missingAppointmentDateCount = 0;
    let awaitingValidationCount = 0;

    const seenWo = new Set<string>();

    activeTickets.forEach(t => {
      let isProblematic = false;

      // 1. Check WO uniqueness
      const wo = (t.woNumber || '').trim().toUpperCase();
      if (seenWo.has(wo)) {
        duplicateCount++;
        isProblematic = true;
      } else {
        seenWo.add(wo);
      }

      // 2. Check Customer ID 7 digit
      const cid = (t.idCustomer || t.customerId || '').trim();
      const isValidCid = /^[0-9]{7}$/.test(cid);
      if (!isValidCid) {
        isProblematic = true;
      }

      // 3. Check Appointment Date
      const appDateRes = parseAppointmentDate(t.appointmentDate);
      if (appDateRes.isEmpty || !appDateRes.date) {
        missingAppointmentDateCount++;
      } else if (!appDateRes.isValid) {
        isProblematic = true;
      }

      // 4. Contractor mapping
      if (!t.contactorName && !t.contractorName) {
        isProblematic = true;
      }

      if (isProblematic) {
        problematicCount++;
      } else {
        validCount++;
      }

      if (t.statusWOAgent === 'Pending' || t.statusWOInstaller === 'Unassigned') {
        awaitingValidationCount++;
      }
    });

    return {
      total,
      validCount,
      problematicCount,
      duplicateCount,
      missingAppointmentDateCount,
      awaitingValidationCount
    };
  }, [tickets]);

  // Filtered tickets in Data WO tab
  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      if (t.isArchived || t.isDeleted) return false;

      if (searchWo && !t.woNumber.toLowerCase().includes(searchWo.toLowerCase().trim())) {
        return false;
      }

      if (searchCustomerId) {
        const cid = (t.idCustomer || t.customerId || '').toLowerCase();
        if (!cid.includes(searchCustomerId.toLowerCase().trim())) return false;
      }

      if (searchCustomerName && !t.customerName.toLowerCase().includes(searchCustomerName.toLowerCase().trim())) {
        return false;
      }

      if (selectedContractor !== 'ALL') {
        const contr = (t.contactorName || t.contractorName || '').toLowerCase();
        if (!contr.includes(selectedContractor.toLowerCase())) return false;
      }

      if (selectedArea !== 'ALL' && t.area !== selectedArea) {
        return false;
      }

      // Schedule appointment date filter
      if (dateFilterMode !== 'all') {
        const matches = matchesScheduleDateFilter(
          t.appointmentDate,
          dateFilterMode,
          operationalDate,
          { start: customStartDate, end: customEndDate }
        );
        if (!matches) return false;
      }

      return true;
    });
  }, [tickets, searchWo, searchCustomerId, searchCustomerName, selectedContractor, selectedArea, dateFilterMode, operationalDate, customStartDate, customEndDate]);

  // Unique areas
  const areas = useMemo(() => {
    const set = new Set<string>();
    tickets.forEach(t => { if (t.area) set.add(t.area); });
    return Array.from(set);
  }, [tickets]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white dark:bg-[#1E1138] rounded-2xl border border-[#D8CCF3] dark:border-[#3B1D78] p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#E9E1FF] dark:bg-[#3B1D78]/60 border border-[#D8CCF3] dark:border-[#5B35B1]/50 rounded-full text-[#3B1D78] dark:text-[#E9E1FF] text-xs font-semibold mb-2">
            <ShieldCheck className="w-3.5 h-3.5 text-[#5B35B1]" />
            <span>Portal Khusus Role Management Data</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#21183A] dark:text-white tracking-tight flex items-center gap-2">
            <FileCheck className="w-6 h-6 text-[#5B35B1] dark:text-[#B19CF0]" />
            <span>Manajemen & Validasi Data Operasional</span>
          </h2>
          <p className="text-xs sm:text-sm text-[#756B8D] dark:text-[#D8CCF3] mt-1 max-w-2xl">
            Pusat kendali kualitas data, validasi ID 7-digit, audit duplikasi, verifikasi jadwal appointment, dan audit impor Work Order.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {(currentUser.role === 'super_admin' || currentUser.role === 'management_data') && (
            <button
              type="button"
              onClick={handleDownloadBackup}
              disabled={isDownloadingBackup}
              className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-md border border-emerald-400/50 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 hover:scale-[1.02] active:scale-95 shrink-0"
              title="Unduh berkas morajaws_production_firestore_backup.json"
            >
              {isDownloadingBackup ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Mengunduh Backup...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 text-white" />
                  <span>Download Backup Database</span>
                </>
              )}
            </button>
          )}

          {/* Tab Switcher */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-white dark:bg-[#3B1D78] text-[#5B35B1] dark:text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Dashboard Data
            </button>
          <button
            type="button"
            onClick={() => setActiveTab('wo_data')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'wo_data'
                ? 'bg-white dark:bg-[#3B1D78] text-[#5B35B1] dark:text-white shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Data WO ({filteredTickets.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('import_validation')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'import_validation'
                ? 'bg-white dark:bg-[#3B1D78] text-[#5B35B1] dark:text-white shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Import & Validasi
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('quality_monitoring')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'quality_monitoring'
                ? 'bg-white dark:bg-[#3B1D78] text-[#5B35B1] dark:text-white shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Kualitas Data
          </button>
        </div>
      </div>
    </div>

      {/* 1. TAB: DASHBOARD DATA */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
            <div className="p-4 bg-white dark:bg-[#1E1138] rounded-2xl border border-[#D8CCF3] dark:border-[#3B1D78] shadow-xs">
              <div className="text-[11px] font-bold text-[#756B8D] dark:text-[#D8CCF3] uppercase">Total WO</div>
              <div className="text-2xl font-extrabold text-[#21183A] dark:text-white mt-1">{metrics.total}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Seluruh master record</div>
            </div>

            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800 shadow-xs">
              <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 uppercase">Data Valid</div>
              <div className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-300 mt-1">{metrics.validCount}</div>
              <div className="text-[10px] text-emerald-600/80 mt-0.5">Sesuai aturan data</div>
            </div>

            <div className="p-4 bg-amber-50 dark:bg-amber-950/40 rounded-2xl border border-amber-200 dark:border-amber-800 shadow-xs">
              <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300 uppercase">Bermasalah</div>
              <div className="text-2xl font-extrabold text-amber-700 dark:text-amber-300 mt-1">{metrics.problematicCount}</div>
              <div className="text-[10px] text-amber-600/80 mt-0.5">Perlu koreksi staf</div>
            </div>

            <div className="p-4 bg-rose-50 dark:bg-rose-950/40 rounded-2xl border border-rose-200 dark:border-rose-800 shadow-xs">
              <div className="text-[11px] font-bold text-rose-700 dark:text-rose-300 uppercase">Duplikat WO</div>
              <div className="text-2xl font-extrabold text-rose-700 dark:text-rose-300 mt-1">{metrics.duplicateCount}</div>
              <div className="text-[10px] text-rose-600/80 mt-0.5">Nomor WO ganda</div>
            </div>

            <div className="p-4 bg-purple-50 dark:bg-purple-950/40 rounded-2xl border border-purple-200 dark:border-purple-800 shadow-xs">
              <div className="text-[11px] font-bold text-purple-700 dark:text-purple-300 uppercase">Tanpa Jadwal</div>
              <div className="text-2xl font-extrabold text-purple-700 dark:text-purple-300 mt-1">{metrics.missingAppointmentDateCount}</div>
              <div className="text-[10px] text-purple-600/80 mt-0.5">Appointment kosong</div>
            </div>

            <div className="p-4 bg-blue-50 dark:bg-blue-950/40 rounded-2xl border border-blue-200 dark:border-blue-800 shadow-xs">
              <div className="text-[11px] font-bold text-blue-700 dark:text-blue-300 uppercase">Menunggu Validasi</div>
              <div className="text-2xl font-extrabold text-blue-700 dark:text-blue-300 mt-1">{metrics.awaitingValidationCount}</div>
              <div className="text-[10px] text-blue-600/80 mt-0.5">Pending penugasan</div>
            </div>
          </div>

          {/* Quick Quality Summary & Instructions */}
          <div className="bg-white dark:bg-[#1E1138] rounded-2xl border border-[#D8CCF3] dark:border-[#3B1D78] p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-[#21183A] dark:text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#5B35B1]" />
              <span>Standar Kebijakan Integritas Data MoraJaws</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="font-bold text-indigo-600 dark:text-indigo-400">1. Customer ID 7 Digit Murni</div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  Customer ID wajib tepat 7 digit numerik tanpa pembulatan ilmiah, prefix, atau sufiks.
                </p>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="font-bold text-indigo-600 dark:text-indigo-400">2. Appointment Date Presisi</div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  Tidak pernah mengasumsikan hari ini atau tanggal upload bila kosong. Format ditampilkan dalam zona waktu Indonesia (WIB).
                </p>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="font-bold text-indigo-600 dark:text-indigo-400">3. WO Number Unik (Zero Duplicate)</div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  Satu nomor WO merepresentasikan satu pekerjaan tunggal. Duplikasi tidak diizinkan menimpa tanpa persetujuan khusus.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. TAB: DATA WO */}
      {activeTab === 'wo_data' && (
        <div className="bg-white dark:bg-[#1E1138] rounded-2xl border border-[#D8CCF3] dark:border-[#3B1D78] p-6 shadow-xs space-y-4">
          {/* Search Filters Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari WO Number..."
                value={searchWo}
                onChange={e => setSearchWo(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="Cari Customer ID (7 digit)..."
                value={searchCustomerId}
                onChange={e => setSearchCustomerId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="Cari Nama Pelanggan..."
                value={searchCustomerName}
                onChange={e => setSearchCustomerName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>

            <select
              value={selectedContractor}
              onChange={e => setSelectedContractor(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
            >
              <option value="ALL">Semua Mitra Kontraktor</option>
              {contractors.map((c, cIdx) => (
                <option key={`mgmt-contractor-${c.id || c.name}-${cIdx}`} value={c.name}>{c.name}</option>
              ))}
            </select>

            <select
              value={dateFilterMode}
              onChange={e => setDateFilterMode(e.target.value as ScheduleDateFilterMode)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium"
            >
              <option value="all">Semua Tanggal Appointment</option>
              <option value="today">Hari Ini ({operationalDate})</option>
              <option value="previous">Sebelumnya (Lewat)</option>
              <option value="upcoming">Mendatang</option>
              <option value="custom">Rentang Tanggal Khusus</option>
            </select>
          </div>

          {/* Custom Date Range if mode is custom */}
          {dateFilterMode === 'custom' && (
            <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
              <Calendar className="w-4 h-4 text-[#5B35B1]" />
              <div className="flex items-center gap-2">
                <span>Mulai:</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={e => setCustomStartDate(e.target.value)}
                  className="px-2 py-1 bg-white dark:bg-slate-800 border rounded-lg"
                />
              </div>
              <div className="flex items-center gap-2">
                <span>Sampai:</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={e => setCustomEndDate(e.target.value)}
                  className="px-2 py-1 bg-white dark:bg-slate-800 border rounded-lg"
                />
              </div>
            </div>
          )}

          {/* Bulk Action Bar for Management Data Deletion */}
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs">
              <span className="font-bold text-rose-800 dark:text-rose-200">
                {selectedIds.size} Work Order terpilih untuk tindakan penghapusan
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsBulkDeleteModalOpen(true)}
                  className="px-3.5 py-1.5 font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus {selectedIds.size} WO Terpilih</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="px-2.5 py-1 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white rounded-lg cursor-pointer"
                >
                  Batal
                </button>
              </div>
            </div>
          )}

          {/* Table */}
          {filteredTickets.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 space-y-1">
              <Database className="w-7 h-7 mx-auto text-slate-300 dark:text-slate-700" />
              <div className="font-semibold text-slate-600 dark:text-slate-400">Tidak ada data WO yang cocok dengan kriteria filter.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-[#756B8D] dark:text-[#D8CCF3] uppercase tracking-wider bg-slate-50/50 dark:bg-slate-900/30">
                    <th className="py-2.5 px-3 w-8 text-center">
                      <input
                        type="checkbox"
                        checked={filteredTickets.length > 0 && selectedIds.size === filteredTickets.length}
                        onChange={e => {
                          if (e.target.checked) setSelectedIds(new Set(filteredTickets.map(t => t.id)));
                          else setSelectedIds(new Set());
                        }}
                        className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                      />
                    </th>
                    <th className="py-2.5 px-3">WO Number</th>
                    <th className="py-2.5 px-3">Customer ID</th>
                    <th className="py-2.5 px-3">Nama Pelanggan</th>
                    <th className="py-2.5 px-3">Appointment Date</th>
                    <th className="py-2.5 px-3">Slot Time</th>
                    <th className="py-2.5 px-3">Kontraktor</th>
                    <th className="py-2.5 px-3">Area</th>
                    <th className="py-2.5 px-3">Status Agent</th>
                    <th className="py-2.5 px-3">Status Lapangan</th>
                    <th className="py-2.5 px-3 text-center">Integritas</th>
                    <th className="py-2.5 px-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans text-xs">
                  {filteredTickets.map(t => {
                    const cid = (t.idCustomer || t.customerId || '').trim();
                    const isCid7 = /^[0-9]{7}$/.test(cid);
                    const appDateParsed = parseAppointmentDate(t.appointmentDate);

                    return (
                      <tr key={t.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(t.id)}
                            onChange={() => {
                              setSelectedIds(prev => {
                                const next = new Set(prev);
                                if (next.has(t.id)) next.delete(t.id);
                                else next.add(t.id);
                                return next;
                              });
                            }}
                            className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                          />
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-[#5B35B1] dark:text-[#B19CF0]">
                          {t.woNumber}
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          <span className={isCid7 ? 'text-slate-800 dark:text-slate-200' : 'text-rose-600 font-bold'}>
                            {cid || '-'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                          {t.customerName}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {appDateParsed.date ? (
                            <span className="text-slate-800 dark:text-slate-200 font-medium">
                              {formatAppointmentDateDisplay(appDateParsed.date)}
                            </span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400 text-[11px] italic">
                              Tanggal belum tersedia
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                          {t.slotTime || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                          {t.contactorName || t.contractorName || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">
                          {t.area || '-'}
                        </td>
                        <td className="py-2.5 px-3">
                          <StatusAgentBadge status={t.statusWOAgent} />
                        </td>
                        <td className="py-2.5 px-3">
                          <StatusInstallerBadge status={t.statusWOInstaller} />
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {isCid7 && appDateParsed.isValid ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Valid</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Review</span>
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => setTicketToDelete(t)}
                            className="px-2 py-1 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white dark:bg-rose-950/50 dark:hover:bg-rose-600 dark:text-rose-300 dark:hover:text-white rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1 font-semibold text-[11px]"
                            title="Hapus Work Order (Khusus Role Management Data)"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Hapus</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 3. TAB: IMPORT & VALIDASI */}
      {activeTab === 'import_validation' && (
        <div className="bg-white dark:bg-[#1E1138] rounded-2xl border border-[#D8CCF3] dark:border-[#3B1D78] p-6 shadow-xs space-y-4">
          <div className="border-b border-[#E9E1FF] dark:border-[#3B1D78]/60 pb-3">
            <h3 className="text-sm font-bold text-[#21183A] dark:text-white flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-[#5B35B1]" />
              <span>Pemeriksaan Mapping Header & Kolom Terdaftar</span>
            </h3>
            <p className="text-xs text-[#756B8D] dark:text-[#D8CCF3] mt-0.5">
              Daftar canonical field standard MoraJaws ({canonicalFields.length} field) yang digunakan untuk memvalidasi setiap baris impor.
            </p>
          </div>

          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0 uppercase font-bold text-slate-500 text-[10.5px]">
                <tr>
                  <th className="py-2 px-3">Field Canonical</th>
                  <th className="py-2 px-3">Display Label</th>
                  <th className="py-2 px-3">Kategori</th>
                  <th className="py-2 px-3">Tipe Data</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Alias Dikenali</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {canonicalFields.map(f => (
                  <tr key={f.canonicalField} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-3 font-mono font-bold text-[#5B35B1]">{f.canonicalField}</td>
                    <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">{f.displayLabel}</td>
                    <td className="py-2 px-3 capitalize text-slate-500">{f.category}</td>
                    <td className="py-2 px-3 font-mono text-slate-500">{f.dataType}</td>
                    <td className="py-2 px-3">
                      {f.required ? (
                        <span className="px-1.5 py-0.5 bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 rounded text-[10px] font-bold">Wajib</span>
                      ) : (
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 rounded text-[10px]">Opsional</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-[11px] text-slate-500 max-w-xs truncate">
                      {f.aliases.join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. TAB: MONITORING KUALITAS DATA */}
      {activeTab === 'quality_monitoring' && (
        <div className="bg-white dark:bg-[#1E1138] rounded-2xl border border-[#D8CCF3] dark:border-[#3B1D78] p-6 shadow-xs space-y-4">
          <div className="border-b border-[#E9E1FF] dark:border-[#3B1D78]/60 pb-3">
            <h3 className="text-sm font-bold text-[#21183A] dark:text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Antrean Peninjauan Data Bermasalah ({metrics.problematicCount})</span>
            </h3>
            <p className="text-xs text-[#756B8D] dark:text-[#D8CCF3] mt-0.5">
              Daftar tiket yang terdeteksi memiliki ketidaklengkapan field, nomor Customer ID non-7 digit, atau tanggal appointment bermasalah.
            </p>
          </div>

          {metrics.problematicCount === 0 ? (
            <div className="p-8 text-center text-xs text-emerald-600 dark:text-emerald-400 space-y-1">
              <CheckCircle2 className="w-8 h-8 mx-auto" />
              <div className="font-bold text-sm">Semua Data Memenuhi Standar Kualitas!</div>
              <div className="text-slate-500 text-xs">Tidak ada anomali duplikasi atau format tidak valid yang terdeteksi.</div>
            </div>
          ) : (
            <div className="space-y-3">
              {tickets.filter(t => {
                const isCid7 = /^[0-9]{7}$/.test((t.idCustomer || t.customerId || '').trim());
                const appDate = parseAppointmentDate(t.appointmentDate);
                return !isCid7 || (!appDate.isEmpty && !appDate.isValid);
              }).map(t => {
                const cid = (t.idCustomer || t.customerId || '').trim();
                const isCid7 = /^[0-9]{7}$/.test(cid);
                const appDate = parseAppointmentDate(t.appointmentDate);

                return (
                  <div key={t.id} className="p-4 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-mono font-bold text-slate-900 dark:text-white">
                        <span>{t.woNumber}</span>
                        <span className="text-slate-400">·</span>
                        <span className="font-sans font-semibold text-slate-700 dark:text-slate-300">{t.customerName}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                        <span>ID Customer: <strong className={isCid7 ? 'text-emerald-600' : 'text-rose-600 font-bold'}>{cid || 'KOSONG'}</strong> ({isCid7 ? 'Valid' : 'Bukan 7 digit'})</span>
                        <span>Appointment Date: <strong className="text-slate-700 dark:text-slate-300">{t.appointmentDate || 'Belum diisi'}</strong> {appDate.error && `(${appDate.error})`}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isCid7 && cid.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            // Extract first 7 digits
                            const digits = cid.replace(/\D/g, '').slice(0, 7).padStart(7, '0');
                            updateTicket(t.id, { idCustomer: digits, customerId: digits });
                            toast.success(`Customer ID diperbaiki menjadi ${digits}`, 'ID Disesuaikan');
                          }}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs"
                        >
                          Auto-Fix 7 Digit
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Management Data Single Ticket Delete Confirmation Modal */}
      {ticketToDelete && (
        <ManagementDataDeleteModal
          isOpen={Boolean(ticketToDelete)}
          onClose={() => setTicketToDelete(null)}
          ticket={ticketToDelete}
          onSuccess={() => setTicketToDelete(null)}
        />
      )}

      {/* Management Data Bulk Delete Confirmation Modal */}
      {isBulkDeleteModalOpen && (
        <ManagementDataDeleteModal
          isOpen={isBulkDeleteModalOpen}
          onClose={() => setIsBulkDeleteModalOpen(false)}
          ticket={null}
          selectedTickets={filteredTickets.filter(t => selectedIds.has(t.id))}
          onSuccess={() => {
            setSelectedIds(new Set());
            setIsBulkDeleteModalOpen(false);
          }}
        />
      )}
    </div>
  );
};
