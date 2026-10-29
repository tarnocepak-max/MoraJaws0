import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Ticket, User, Contractor, CoverageArea } from '../../types/index.ts';
import { parseAppointmentDate } from '../../services/appointmentDateParser';
import {
  Database,
  Server,
  Layers,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Clock,
  History,
  Archive,
  Copy,
  Trash2,
  RefreshCw,
  FileSpreadsheet,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Eye,
  Check,
  X,
  Edit,
  Building2,
  UserCheck,
  Wrench,
  Sparkles,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { StatusAgentBadge, StatusInstallerBadge } from '../common/Badge';

export type DatabaseSubmenu =
  | 'overview'
  | 'wo_database'
  | 'import_history'
  | 'duplicate_checker'
  | 'data_validation'
  | 'data_archive'
  | 'audit_log';

export const DatabaseManagementView: React.FC = () => {
  const {
    tickets,
    users,
    contractors,
    coverageAreas,
    auditLogs,
    currentUser,
    archiveTicket,
    restoreTicket,
    deleteTicket,
    updateTicket
  } = useApp();
  const { toast } = useToast();

  const [activeSubmenu, setActiveSubmenu] = useState<DatabaseSubmenu>('overview');
  const [searchWo, setSearchWo] = useState('');
  const [selectedContractor, setSelectedContractor] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedAppointmentDate, setSelectedAppointmentDate] = useState('');
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [editForm, setEditForm] = useState<Partial<Ticket>>({});

  // 1. Overview Calculations
  const totalWOs = tickets.length;
  const activeWOs = tickets.filter(t => !t.isArchived && t.statusWOAgent !== 'Closed' && t.statusWOInstaller !== 'Completed').length;
  const completedWOs = tickets.filter(t => t.statusWOInstaller === 'Completed' || t.statusWOAgent === 'Resolved' || t.statusWOAgent === 'Closed').length;
  const archivedWOs = tickets.filter(t => t.isArchived).length;
  const totalStaff = users.filter(u => !u.isArchived).length;
  const totalInstallers = users.filter(u => u.role === 'installer' && u.active && !u.isArchived).length;
  const totalLeaders = users.filter(u => u.role === 'leader' && u.active && !u.isArchived).length;
  const totalContractors = contractors.length;

  // Duplicate WO Detection
  const duplicatesMap = useMemo(() => {
    const map = new Map<string, Ticket[]>();
    tickets.forEach(t => {
      const key = (t.woNumber || '').trim().toUpperCase();
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return map;
  }, [tickets]);

  const duplicateGroups = useMemo(() => {
    return Array.from(duplicatesMap.entries()).filter(([_, list]) => list.length > 1);
  }, [duplicatesMap]);

  // Data Validation issues
  const validationIssues = useMemo(() => {
    const issues: {
      id: string;
      ticket: Ticket;
      type: 'missing_wo' | 'invalid_date' | 'missing_date' | 'missing_customer_id' | 'broken_installer' | 'broken_contractor' | 'inconsistent_status';
      message: string;
      field: string;
      recommendation: string;
    }[] = [];

    tickets.forEach(t => {
      if (!t.woNumber || !t.woNumber.trim()) {
        issues.push({
          id: `iss-wo-${t.id}`,
          ticket: t,
          type: 'missing_wo',
          message: 'Nomor Work Order kosong',
          field: 'woNumber',
          recommendation: 'Lengkapi nomor WO unik resmi'
        });
      }
      if (!t.appointmentDate || !t.appointmentDate.trim()) {
        issues.push({
          id: `iss-app-${t.id}`,
          ticket: t,
          type: 'missing_date',
          message: 'Jadwal Appointment Date belum terisi',
          field: 'appointmentDate',
          recommendation: 'Tetapkan tanggal jadwal kunjungan appointment'
        });
      } else if (isNaN(new Date(t.appointmentDate).getTime())) {
        issues.push({
          id: `iss-invdate-${t.id}`,
          ticket: t,
          type: 'invalid_date',
          message: `Format Appointment Date tidak valid: "${t.appointmentDate}"`,
          field: 'appointmentDate',
          recommendation: 'Format tanggal sesuai standar YYYY-MM-DD'
        });
      }
      if (!t.idCustomer && !t.customerId) {
        issues.push({
          id: `iss-cid-${t.id}`,
          ticket: t,
          type: 'missing_customer_id',
          message: 'Customer ID belum terisi',
          field: 'idCustomer',
          recommendation: 'Isi 7-digit ID Customer resmi pelanggan'
        });
      }
      if (t.installerName) {
        const found = users.some(u => u.role === 'installer' && u.name.toLowerCase().includes(t.installerName!.toLowerCase().trim()));
        if (!found) {
          issues.push({
            id: `iss-inst-${t.id}`,
            ticket: t,
            type: 'broken_installer',
            message: `Teknisi "${t.installerName}" tidak terdaftar di database staff aktif`,
            field: 'installerName',
            recommendation: 'Pilih teknisi yang terdaftar dalam kontraktor'
          });
        }
      }
    });

    return issues;
  }, [tickets, users]);

  // Filtered Master WO Database
  const filteredWODatabase = useMemo(() => {
    return tickets.filter(t => {
      if (searchWo.trim()) {
        const query = searchWo.toLowerCase().trim();
        const matchWo = (t.woNumber || '').toLowerCase().includes(query);
        const matchCust = (t.customerName || '').toLowerCase().includes(query);
        const matchCid = (t.idCustomer || t.customerId || '').toLowerCase().includes(query);
        if (!matchWo && !matchCust && !matchCid) return false;
      }
      if (selectedContractor !== 'all') {
        const cName = (t.contactorName || t.contractorName || '').toLowerCase();
        if (!cName.includes(selectedContractor.toLowerCase())) return false;
      }
      if (selectedStatus !== 'all') {
        if (t.statusWOInstaller !== selectedStatus && t.statusWOAgent !== selectedStatus) return false;
      }
      if (selectedAppointmentDate) {
        const raw = t.appointmentDate || t.date || '';
        const parsed = parseAppointmentDate(raw);
        const ticketDate = parsed.date || (raw.length >= 10 ? raw.slice(0, 10) : raw.trim());
        if (ticketDate !== selectedAppointmentDate && !ticketDate.startsWith(selectedAppointmentDate)) return false;
      }
      return true;
    });
  }, [tickets, searchWo, selectedContractor, selectedStatus, selectedAppointmentDate]);

  // Import history from auditLogs
  const importHistoryLogs = useMemo(() => {
    return auditLogs.filter(l => l.entity === 'import_batch' || l.action.toLowerCase().includes('import'));
  }, [auditLogs]);

  // Handlers for Data Edit
  const handleOpenEdit = (ticket: Ticket) => {
    setEditingTicket(ticket);
    setEditForm({
      customerName: ticket.customerName,
      customerPhone: ticket.customerPhone,
      appointmentDate: ticket.appointmentDate || ticket.date,
      slotTime: ticket.slotTime,
      contactorName: ticket.contactorName || ticket.contractorName,
      area: ticket.area,
      clusterName: ticket.clusterName,
      installerName: ticket.installerName
    });
  };

  const handleSaveEdit = () => {
    if (!editingTicket) return;
    const res = updateTicket(editingTicket.id, editForm, 'Pembaruan data via Database Management');
    if (res.success) {
      toast.success(`Tiket ${editingTicket.woNumber} berhasil diperbarui di database.`, 'Perubahan Tersimpan');
      setEditingTicket(null);
    } else {
      toast.error(res.error || 'Gagal memperbarui tiket.', 'Kesalahan');
    }
  };

  // Reconcile duplicate WOs
  const handleReconcileKeepFirst = (woKey: string) => {
    const list = duplicatesMap.get(woKey) || [];
    if (list.length <= 1) return;
    const [keep, ...removeList] = list;
    removeList.forEach(item => {
      deleteTicket(item.id, `Rekonsiliasi duplikasi WO ${woKey}. Menggabungkan ke ID ${keep.id}`);
    });
    toast.success(`Berhasil merekonsiliasi WO ${woKey}. 1 record utama dipertahankan.`, 'Rekonsiliasi Sukses');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 text-white shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-semibold mb-2">
            <Server className="w-3.5 h-3.5 text-indigo-400" />
            <span>Pusat Kontrol Database & Data Integrity</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">Database Management</h1>
          <p className="text-xs text-slate-300 mt-1 max-w-xl">
            Pengelolaan terpusat seluruh master data Work Order, pemeriksaan integritas data, anti-duplikasi, riwayat impor, dan arsip data aplikasi MoraJaws.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="px-3 py-1.5 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-bold flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-purple-400" />
            <span>Hak Akses: Super Agent</span>
          </span>
        </div>
      </div>

      {/* Submenu Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-200 dark:border-slate-800">
        {[
          { id: 'overview', label: 'Database Overview', icon: Database, badge: undefined },
          { id: 'wo_database', label: 'WO Master Database', icon: Layers, badge: totalWOs },
          { id: 'import_history', label: 'Import History', icon: History, badge: importHistoryLogs.length },
          { id: 'duplicate_checker', label: 'Duplicate Checker', icon: Copy, badge: duplicateGroups.length, badgeColor: 'rose' },
          { id: 'data_validation', label: 'Data Validation', icon: AlertTriangle, badge: validationIssues.length, badgeColor: 'amber' },
          { id: 'data_archive', label: 'Data Archive', icon: Archive, badge: archivedWOs },
          { id: 'audit_log', label: 'Database Audit Log', icon: ShieldCheck, badge: undefined }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeSubmenu === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubmenu(tab.id as DatabaseSubmenu)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shrink-0 transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : tab.badgeColor === 'rose'
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                    : tab.badgeColor === 'amber'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* SUBMENU 1: OVERVIEW */}
      {activeSubmenu === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3.5">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <div className="text-[11px] text-slate-500 font-semibold uppercase">Total Record WO</div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{totalWOs}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Master record di database</div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <div className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold uppercase">WO Aktif</div>
              <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">{activeWOs}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Dalam proses / antrean</div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase">WO Selesai</div>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{completedWOs}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Installed & Resolved</div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <div className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold uppercase">Perlu Pemeriksaan</div>
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{validationIssues.length}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Jadwal/Field tidak lengkap</div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <div className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold uppercase">Duplikasi Terdeteksi</div>
              <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">{duplicateGroups.length}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Grup nomor WO ganda</div>
            </div>
          </div>

          {/* Quick Staff & Infrastructure Distribution */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400">Akun Staff Terdaftar</span>
                <span className="text-xs font-bold text-indigo-600">{totalStaff} Akun</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <span className="flex items-center gap-1.5"><Wrench className="w-3.5 h-3.5 text-emerald-500" /> Teknisi Aktif</span>
                  <span className="font-bold">{totalInstallers}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-amber-500" /> Leader Mitra</span>
                  <span className="font-bold">{totalLeaders}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-purple-500" /> Super Admin & Dispatch</span>
                  <span className="font-bold">{totalStaff - totalInstallers - totalLeaders}</span>
                </div>
              </div>
            </div>

            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400">Kontraktor & Wilayah</span>
                <span className="text-xs font-bold text-indigo-600">{totalContractors} Mitra</span>
              </div>
              <div className="space-y-2 text-xs">
                {contractors.slice(0, 3).map(c => (
                  <div key={c.id} className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-between">
                    <span className="font-medium truncate max-w-[180px]">{c.name}</span>
                    <span className="font-mono text-[10px] text-slate-400">{c.code}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400">Status Integritas Data</span>
                <span className={`text-xs font-bold ${duplicateGroups.length === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {duplicateGroups.length === 0 ? 'Optimal' : 'Perlu Tindakan'}
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                {duplicateGroups.length === 0
                  ? 'Tidak ada duplikasi nomor WO terdeteksi dalam database. Sistem anti-duplikasi aktif menjaga 1 record per WO Number.'
                  : `Ditemukan ${duplicateGroups.length} grup nomor WO yang terduplikasi. Buka tab "Duplicate Checker" untuk rekonsiliasi.`}
              </p>
              <button
                onClick={() => setActiveSubmenu('duplicate_checker')}
                className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <span>Periksa Duplikasi Sekarang</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUBMENU 2: WO MASTER DATABASE */}
      {activeSubmenu === 'wo_database' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                value={searchWo}
                onChange={e => setSearchWo(e.target.value)}
                placeholder="Cari WO Number, Customer ID, Nama Pelanggan..."
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={selectedContractor}
                onChange={e => setSelectedContractor(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium"
              >
                <option value="all">Semua Kontraktor</option>
                {contractors.map((c, cIdx) => (
                  <option key={`db-contractor-${c.id || c.name}-${cIdx}`} value={c.name}>{c.name}</option>
                ))}
              </select>

              <select
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium"
              >
                <option value="all">Semua Status</option>
                <option value="Unassigned">Unassigned</option>
                <option value="Assigned">Assigned</option>
                <option value="En Route">En Route</option>
                <option value="On Site">On Site</option>
                <option value="Completed">Completed</option>
                <option value="Pending Technical">Pending Technical</option>
                <option value="Failed / Cancelled">Failed / Cancelled</option>
              </select>

              <input
                type="date"
                value={selectedAppointmentDate}
                onChange={e => setSelectedAppointmentDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium"
                title="Filter Appointment Date"
              />

              {(searchWo || selectedContractor !== 'all' || selectedStatus !== 'all' || selectedAppointmentDate) && (
                <button
                  onClick={() => {
                    setSearchWo('');
                    setSelectedContractor('all');
                    setSelectedStatus('all');
                    setSelectedAppointmentDate('');
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-3">WO Number</th>
                    <th className="p-3">Appointment Date</th>
                    <th className="p-3">Customer ID & Nama</th>
                    <th className="p-3">Area & Kontraktor</th>
                    <th className="p-3">Teknisi (Installer)</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Aksi Database</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredWODatabase.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        Tidak ada record WO yang sesuai dengan filter pencarian.
                      </td>
                    </tr>
                  ) : (
                    filteredWODatabase.slice(0, 50).map(ticket => (
                      <tr key={ticket.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="p-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {ticket.woNumber}
                        </td>
                        <td className="p-3">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {ticket.appointmentDate || <span className="text-rose-500 italic">Belum diset</span>}
                          </span>
                          <span className="block text-[10.5px] text-slate-400">{ticket.slotTime}</span>
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-900 dark:text-white">{ticket.customerName}</div>
                          <div className="font-mono text-[10.5px] text-slate-400">ID: {ticket.idCustomer || ticket.customerId || '-'}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">{ticket.area}</div>
                          <div className="text-[10.5px] text-slate-400 truncate max-w-[150px]">{ticket.contactorName || ticket.contractorName}</div>
                        </td>
                        <td className="p-3">
                          {ticket.installerName ? (
                            <span className="font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <UserCheck className="w-3.5 h-3.5" />
                              {ticket.installerName}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Belum di-assign</span>
                          )}
                        </td>
                        <td className="p-3">
                          <StatusInstallerBadge status={ticket.statusWOInstaller} />
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEdit(ticket)}
                              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300"
                              title="Koreksi Data Record"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            {ticket.isArchived ? (
                              <button
                                onClick={() => restoreTicket(ticket.id)}
                                className="px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold text-[10px]"
                                title="Pulihkan dari Arsip"
                              >
                                Pulihkan
                              </button>
                            ) : (
                              <button
                                onClick={() => archiveTicket(ticket.id)}
                                className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 hover:bg-amber-100"
                                title="Arsipkan Record WO"
                              >
                                <Archive className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {filteredWODatabase.length > 50 && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 text-center text-xs text-slate-500">
                Menampilkan 50 record pertama dari total {filteredWODatabase.length} record WO.
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBMENU 3: IMPORT HISTORY */}
      {activeSubmenu === 'import_history' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-1">
              Riwayat Impor & Batch Audit
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Daftar seluruh proses impor berkas WO yang pernah dieksekusi oleh Super Admin dan Dispatch.
            </p>

            <div className="space-y-3">
              {importHistoryLogs.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Belum ada log histori impor WO yang tercatat di sistem.
                </div>
              ) : (
                importHistoryLogs.map(log => (
                  <div key={log.id} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-start justify-between gap-3 text-xs">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                        <span>{log.action}</span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300 mt-1">{log.details}</p>
                      <div className="text-[10.5px] text-slate-400 mt-1.5 flex items-center gap-2">
                        <span>Oleh: <strong>{log.performedBy}</strong> ({log.userRole})</span>
                        <span>·</span>
                        <span>{new Date(log.timestamp).toLocaleString('id-ID')}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUBMENU 4: DUPLICATE CHECKER */}
      {activeSubmenu === 'duplicate_checker' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <Copy className="w-4 h-4 text-rose-600" />
                  <span>Pemeriksa Duplikasi WO Number (Duplicate Checker)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Memastikan aturan 1 WO Number = 1 Master Record aktif di database. Rekonsiliasi aman tanpa menghapus riwayat laporan teknisi.
                </p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                duplicateGroups.length === 0
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200'
              }`}>
                {duplicateGroups.length} Grup Duplikat
              </span>
            </div>

            {duplicateGroups.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
                <h4 className="font-bold text-sm text-emerald-900 dark:text-emerald-200">Database Bersih dari Duplikasi</h4>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                  Setiap nomor Work Order dalam database aktif adalah unik. Tidak ditemukan record ganda.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {duplicateGroups.map(([woKey, dupList]) => (
                  <div key={woKey} className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-600" />
                        <span className="font-mono font-black text-sm text-rose-900 dark:text-rose-200">
                          {woKey}
                        </span>
                        <span className="text-xs text-rose-600 font-semibold">
                          ({dupList.length} duplikasi ditemukan)
                        </span>
                      </div>
                      <button
                        onClick={() => handleReconcileKeepFirst(woKey)}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Rekonsiliasi (Pertahankan 1 Utama)</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {dupList.map((t, idx) => (
                        <div key={t.id} className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                            <span>Record #{idx + 1} (ID: {t.id})</span>
                            <span className="font-semibold text-slate-600 dark:text-slate-300">{t.dateUpload || t.date}</span>
                          </div>
                          <div className="font-bold text-slate-900 dark:text-white">{t.customerName}</div>
                          <div className="text-[11px] text-slate-500">Teknisi: {t.installerName || 'Unassigned'} · Vendor: {t.contactorName}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBMENU 5: DATA VALIDATION */}
      {activeSubmenu === 'data_validation' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Audit Kualitas Data (Data Validation)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Mendeteksi field kosong, format Appointment Date tidak valid, atau relasi teknisi tidak sinkron.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 text-xs font-bold">
                {validationIssues.length} Isu Terdeteksi
              </span>
            </div>

            {validationIssues.length === 0 ? (
              <div className="p-8 text-center text-emerald-600 font-bold text-xs">
                Seluruh data Work Order memenuhi standar validasi aplikasi.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {validationIssues.map(issue => (
                  <div key={issue.id} className="py-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {issue.ticket.woNumber || 'NO_WO_EMPTY'}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 text-[10px] font-semibold">
                          {issue.field}
                        </span>
                      </div>
                      <p className="text-slate-800 dark:text-slate-200 font-medium mt-1">{issue.message}</p>
                      <p className="text-slate-500 text-[11px]">Rekomendasi: {issue.recommendation}</p>
                    </div>
                    <button
                      onClick={() => handleOpenEdit(issue.ticket)}
                      className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold text-[11px] rounded-lg shrink-0"
                    >
                      Koreksi
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBMENU 6: DATA ARCHIVE */}
      {activeSubmenu === 'data_archive' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2 mb-1">
              <Archive className="w-4 h-4 text-slate-600" />
              <span>Arsip Data Work Order (Data Archive)</span>
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Menyimpan tiket lama yang sudah selesai atau dibatalkan tanpa menghapus data secara permanen.
            </p>

            {tickets.filter(t => t.isArchived).length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                Belum ada tiket WO yang diarsipkan di database.
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                {tickets.filter(t => t.isArchived).map(t => (
                  <div key={t.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 flex items-center justify-between">
                    <div>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">{t.woNumber}</span>
                      <span className="text-slate-500 ml-2">· {t.customerName} ({t.appointmentDate})</span>
                    </div>
                    <button
                      onClick={() => restoreTicket(t.id)}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs"
                    >
                      Pulihkan dari Arsip
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBMENU 7: DATABASE AUDIT LOG */}
      {activeSubmenu === 'audit_log' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2 mb-1">
              <ShieldCheck className="w-4 h-4 text-purple-600" />
              <span>Audit Trail Mutasi Database</span>
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Pencatatan real-time terhadap perubahan appointment date, impor WO, penugasan teknisi, dan aktivitas staf.
            </p>

            <div className="space-y-2 max-h-[500px] overflow-y-auto text-xs">
              {auditLogs.map(log => (
                <div key={log.id} className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">{log.action}</div>
                    <div className="text-slate-600 dark:text-slate-300 mt-0.5">{log.details}</div>
                    <div className="text-[10.5px] text-slate-400 mt-1">
                      Oleh: <strong>{log.performedBy}</strong> ({log.userRole}) · {new Date(log.timestamp).toLocaleString('id-ID')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal Edit Record WO */}
      {editingTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Koreksi Data WO: <span className="font-mono text-indigo-600">{editingTicket.woNumber}</span>
              </h3>
              <button onClick={() => setEditingTicket(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Nama Pelanggan</label>
                <input
                  type="text"
                  value={editForm.customerName || ''}
                  onChange={e => setEditForm({ ...editForm, customerName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Appointment Date</label>
                  <input
                    type="date"
                    value={editForm.appointmentDate || ''}
                    onChange={e => setEditForm({ ...editForm, appointmentDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Slot Waktu</label>
                  <input
                    type="text"
                    value={editForm.slotTime || ''}
                    onChange={e => setEditForm({ ...editForm, slotTime: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Kontraktor</label>
                <select
                  value={editForm.contactorName || ''}
                  onChange={e => setEditForm({ ...editForm, contactorName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  {contractors.map((c, cIdx) => (
                    <option key={`edit-contractor-${c.id || c.name}-${cIdx}`} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Teknisi (Installer)</label>
                <input
                  type="text"
                  value={editForm.installerName || ''}
                  onChange={e => setEditForm({ ...editForm, installerName: e.target.value })}
                  placeholder="Nama teknisi penugasan"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingTicket(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
