import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Ticket, TicketStatusWOInstaller, TechnicalReport } from '../../types/index.ts';
import { StatusInstallerBadge, StatusWhatsAppBadge, StatusAgentBadge } from '../common/Badge';
import { TicketLiveChat } from '../chat/TicketLiveChat';
import { TechnicalReportForm } from '../tickets/TechnicalReportForm';
import { InstallerTicketFullview } from './InstallerTicketFullview';
import {
  Wrench,
  Phone,
  MessageSquare,
  MapPin,
  CheckCircle2,
  Navigation,
  FileText,
  AlertTriangle,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Building2,
  UserCheck,
  Radio,
  Wifi,
  Camera,
  Calendar,
  RotateCcw,
  XCircle,
  Filter,
  Search,
  Eye,
  Check,
  X,
  Layers,
  ArrowRight,
  ShieldAlert,
  Sparkles
} from 'lucide-react';

export type StatusFilterCategory = 'all' | 'done' | 'pending' | 'reschedule' | 'cancel';

interface InstallerPortalProps {
  onSelectTicket?: (ticket: Ticket, defaultTab?: 'overview' | 'report' | 'chat' | 'history') => void;
  onOpenWhatsApp: (ticket: Ticket) => void;
}

/**
 * Categorizes a ticket into one of the four operational buckets:
 * - Done (Selesai)
 * - Pending (Menunggu / Dalam Proses)
 * - Reschedule (Jadwal Ulang)
 * - Cancel (Dibatalkan)
 */
export const classifyInstallerStatus = (ticket: Ticket): 'done' | 'pending' | 'reschedule' | 'cancel' => {
  // 1. Cancel check
  const isCancel =
    ticket.statusWOInstaller === 'Failed / Cancelled' ||
    ticket.statusWOAgent === 'Cancelled' ||
    ticket.statusWhatsApp === 'cancelled' ||
    (ticket as any).statusWOInstaller === 'Cancel' ||
    (ticket as any).statusWOAgent === 'Cancel';

  if (isCancel) return 'cancel';

  // 2. Reschedule check
  const isReschedule =
    ticket.statusWhatsApp === 'reschedule_requested' ||
    (ticket.statusWOInstaller === 'Pending Technical' &&
      (ticket.remarksWOInstaller?.toLowerCase().includes('reschedule') ||
        ticket.remarksAgent?.toLowerCase().includes('reschedule'))) ||
    ticket.remarksAgent?.toLowerCase().includes('reschedule') ||
    ticket.remarksWOInstaller?.toLowerCase().includes('reschedule') ||
    ticket.appointmentType?.toLowerCase().includes('reschedule') ||
    ticket.ticketCategory?.toLowerCase().includes('reschedule') ||
    (ticket as any).statusWOInstaller === 'Reschedule';

  if (isReschedule) return 'reschedule';

  // 3. Done check
  const isDone =
    ticket.statusWOInstaller === 'Completed' ||
    ticket.statusWOInstaller === 'Installed' ||
    ticket.statusWOAgent === 'Resolved' ||
    ticket.statusWOAgent === 'Closed';

  if (isDone) return 'done';

  // 4. Default: Pending / Active
  return 'pending';
};

export const InstallerPortal: React.FC<InstallerPortalProps> = ({ onSelectTicket, onOpenWhatsApp }) => {
  const {
    tickets,
    updateTicketStatus,
    currentUser,
    users
  } = useApp();

  // Active installer identification
  const myInstallers = users.filter(u => u.role === 'installer');
  const [selectedInstallerName, setSelectedInstallerName] = useState<string>(
    currentUser.role === 'installer' ? currentUser.name : (myInstallers[0]?.name || 'Andi Saputra')
  );

  const effectiveInstallerName = currentUser.role === 'installer' ? currentUser.name : selectedInstallerName;

  // Flexible matching for technician name (handles "Andi Saputra" vs "Andi Saputra (Teknisi MJS)")
  const isInstallerMatch = (ticketInstaller: string | undefined, installerName: string) => {
    if (!ticketInstaller || !ticketInstaller.trim()) return false;
    const tInst = ticketInstaller.toLowerCase().trim();
    const effInst = installerName.toLowerCase().trim();
    if (tInst === effInst) return true;
    if (tInst.includes(effInst) || effInst.includes(tInst)) return true;
    const cleanEff = effInst.replace(/\(.*?\)/g, '').trim();
    if (cleanEff && (tInst.includes(cleanEff) || cleanEff.includes(tInst))) return true;
    return false;
  };

  // Filter tickets for this technician: ONLY work orders assigned to their account!
  const myTickets = useMemo(() => {
    return tickets.filter(
      t => !t.isArchived && !t.isDeleted && Boolean(t.installerName) && isInstallerMatch(t.installerName, effectiveInstallerName)
    );
  }, [tickets, effectiveInstallerName]);

  // Status Filter State
  const [statusFilter, setStatusFilter] = useState<StatusFilterCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Fullview ticket state for technician
  const [fullviewTicket, setFullviewTicket] = useState<Ticket | null>(null);

  // Ticket Detail Modal State
  const [detailTicket, setDetailTicket] = useState<Ticket | null>(null);
  const [detailModalTab, setDetailModalTab] = useState<'details' | 'chat'>('details');

  // Quick Live Chat Modal State
  const [chatModalTicket, setChatModalTicket] = useState<Ticket | null>(null);

  // Status counts
  const counts = useMemo(() => {
    let done = 0;
    let pending = 0;
    let reschedule = 0;
    let cancel = 0;

    myTickets.forEach(t => {
      const cat = classifyInstallerStatus(t);
      if (cat === 'done') done++;
      else if (cat === 'pending') pending++;
      else if (cat === 'reschedule') reschedule++;
      else if (cat === 'cancel') cancel++;
    });

    return {
      all: myTickets.length,
      done,
      pending,
      reschedule,
      cancel
    };
  }, [myTickets]);

  // Filtered tickets based on active status filter & search
  const filteredTickets = useMemo(() => {
    return myTickets.filter(t => {
      // Status filter
      if (statusFilter !== 'all') {
        const cat = classifyInstallerStatus(t);
        if (cat !== statusFilter) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchWO = t.woNumber?.toLowerCase().includes(query);
        const matchCust = t.customerName?.toLowerCase().includes(query);
        const matchCustId = (t.idCustomer || t.customerId || '').toLowerCase().includes(query);
        const matchPhone = (t.customerPhone || '').includes(query);
        const matchAddr = (t.streetName || '').toLowerCase().includes(query);
        const matchCluster = (t.clusterName || '').toLowerCase().includes(query);
        const matchArea = (t.area || '').toLowerCase().includes(query);
        return matchWO || matchCust || matchCustId || matchPhone || matchAddr || matchCluster || matchArea;
      }

      return true;
    });
  }, [myTickets, statusFilter, searchQuery]);

  // Quick progression handler
  const handleQuickStatus = (ticketId: string, status: TicketStatusWOInstaller, remark: string) => {
    updateTicketStatus(ticketId, undefined, status, remark);
    if (detailTicket && detailTicket.id === ticketId) {
      setDetailTicket(prev => prev ? { ...prev, statusWOInstaller: status } : null);
    }
  };

  // Open ticket detail handler (Opens Fullview for installer)
  const handleOpenTicket = (ticket: Ticket) => {
    setFullviewTicket(ticket);
  };

  // Open chat modal handler
  const handleOpenChat = (ticket: Ticket) => {
    setChatModalTicket(ticket);
  };

  // Dedicated Fullview Experience for Installer
  if (fullviewTicket) {
    return (
      <InstallerTicketFullview
        ticket={fullviewTicket}
        onBack={() => setFullviewTicket(null)}
        onOpenWhatsApp={onOpenWhatsApp}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* ============================================================ */}
      {/* 1. TOP HEADER BANNER & TECHNICIAN SELECTOR                   */}
      {/* ============================================================ */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Portal Teknisi Lapangan (Installer)
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                  {effectiveInstallerName}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Monitoring Work Order, pembaruan status pengerjaan, dan Live Chat koordinasi langsung dengan Dispatch.
              </p>
            </div>
          </div>

          {/* Role Preview Selector (for Super Admin / Dispatch / Leader viewing) */}
          {currentUser.role !== 'installer' && (
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/80 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Pilih Teknisi:
              </span>
              <select
                value={selectedInstallerName}
                onChange={e => setSelectedInstallerName(e.target.value)}
                className="px-2.5 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md font-medium text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-teal-500"
              >
                {myInstallers.map(inst => (
                  <option key={inst.id} value={inst.name}>
                    {inst.name} ({inst.contractor || 'Mitra'})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. STATUS KPI COUNTERS: DONE, PENDING, RESCHEDULE, CANCEL    */}
      {/* ============================================================ */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Total Card */}
        <button
          onClick={() => setStatusFilter('all')}
          className={`p-4 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
            statusFilter === 'all'
              ? 'bg-slate-900 text-white border-slate-900 dark:bg-indigo-950 dark:border-indigo-700 shadow-md ring-2 ring-indigo-500/50'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold ${statusFilter === 'all' ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>
              Semua WO
            </span>
            <Layers className={`w-4 h-4 ${statusFilter === 'all' ? 'text-indigo-400' : 'text-slate-400'}`} />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono">
              {counts.all}
            </span>
            <span className={`text-[11px] font-medium ${statusFilter === 'all' ? 'text-slate-300' : 'text-slate-400'}`}>
              Tiket Ditugaskan
            </span>
          </div>
          {statusFilter === 'all' && (
            <div className="mt-2 text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span> Filter Aktif
            </div>
          )}
        </button>

        {/* 1. DONE (Selesai) */}
        <button
          onClick={() => setStatusFilter('done')}
          className={`p-4 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
            statusFilter === 'done'
              ? 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-500 shadow-md ring-2 ring-emerald-500/50'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-800 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Done (Selesai)</span>
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-700 dark:text-emerald-300">
              {counts.done}
            </span>
            <span className="text-[11px] font-medium text-emerald-600/80 dark:text-emerald-400/80">
              WO Selesai
            </span>
          </div>
          {statusFilter === 'done' && (
            <div className="mt-2 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> Filter Aktif
            </div>
          )}
        </button>

        {/* 2. PENDING (Menunggu / Dalam Proses) */}
        <button
          onClick={() => setStatusFilter('pending')}
          className={`p-4 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
            statusFilter === 'pending'
              ? 'bg-amber-50 dark:bg-amber-950/80 border-amber-500 shadow-md ring-2 ring-amber-500/50'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-800 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Pending (Proses)</span>
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-amber-700 dark:text-amber-300">
              {counts.pending}
            </span>
            <span className="text-[11px] font-medium text-amber-600/80 dark:text-amber-400/80">
              Perlu Pengerjaan
            </span>
          </div>
          {statusFilter === 'pending' && (
            <div className="mt-2 text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span> Filter Aktif
            </div>
          )}
        </button>

        {/* 3. RESCHEDULE (Jadwal Ulang) */}
        <button
          onClick={() => setStatusFilter('reschedule')}
          className={`p-4 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
            statusFilter === 'reschedule'
              ? 'bg-blue-50 dark:bg-blue-950/80 border-blue-500 shadow-md ring-2 ring-blue-500/50'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-800 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
              <RotateCcw className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Reschedule</span>
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-blue-700 dark:text-blue-300">
              {counts.reschedule}
            </span>
            <span className="text-[11px] font-medium text-blue-600/80 dark:text-blue-400/80">
              Jadwal Ulang
            </span>
          </div>
          {statusFilter === 'reschedule' && (
            <div className="mt-2 text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span> Filter Aktif
            </div>
          )}
        </button>

        {/* 4. CANCEL (Dibatalkan) */}
        <button
          onClick={() => setStatusFilter('cancel')}
          className={`p-4 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
            statusFilter === 'cancel'
              ? 'bg-rose-50 dark:bg-rose-950/80 border-rose-500 shadow-md ring-2 ring-rose-500/50'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-800 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
              <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              <span>Cancel</span>
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-rose-700 dark:text-rose-300">
              {counts.cancel}
            </span>
            <span className="text-[11px] font-medium text-rose-600/80 dark:text-rose-400/80">
              Dibatalkan
            </span>
          </div>
          {statusFilter === 'cancel' && (
            <div className="mt-2 text-[10px] font-bold text-rose-700 dark:text-rose-300 uppercase tracking-wider flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span> Filter Aktif
            </div>
          )}
        </button>
      </div>

      {/* ============================================================ */}
      {/* 3. SEARCH & ACTIVE FILTER BAR                                */}
      {/* ============================================================ */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Cari nomor WO, nama pelanggan, cluster, atau telepon..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-500 font-medium text-[11px] mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3" /> Filter:
          </span>
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
              statusFilter === 'all'
                ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            Semua ({counts.all})
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
              statusFilter === 'pending'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300'
            }`}
          >
            Pending ({counts.pending})
          </button>
          <button
            onClick={() => setStatusFilter('done')}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
              statusFilter === 'done'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300'
            }`}
          >
            Done ({counts.done})
          </button>
          <button
            onClick={() => setStatusFilter('reschedule')}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
              statusFilter === 'reschedule'
                ? 'bg-blue-600 text-white'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300'
            }`}
          >
            Reschedule ({counts.reschedule})
          </button>
          <button
            onClick={() => setStatusFilter('cancel')}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
              statusFilter === 'cancel'
                ? 'bg-rose-600 text-white'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/60 dark:text-rose-300'
            }`}
          >
            Cancel ({counts.cancel})
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 4. WORK ORDERS LIST WITH PROMINENT MAIN DETAILS              */}
      {/* ============================================================ */}
      {filteredTickets.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 space-y-3">
          <Wrench className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600" />
          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Tidak Ada Work Order yang Sesuai
          </h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {myTickets.length === 0
              ? `Belum ada tiket yang ditugaskan kepada teknisi ${effectiveInstallerName}. Hubungi Koordinator Lapangan (Leader) untuk jadwal penugasan.`
              : `Tidak ditemukan tiket dengan status "${statusFilter}" atau kata kunci pencarian tersebut.`}
          </p>
          {(statusFilter !== 'all' || searchQuery) && (
            <button
              onClick={() => {
                setStatusFilter('all');
                setSearchQuery('');
              }}
              className="px-3.5 py-1.5 text-xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 rounded-lg border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100"
            >
              Reset Filter & Tampilkan Semua WO
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Daftar Work Order ({filteredTickets.length} Tiket)
            </span>
            <span className="text-[11px] text-slate-500">
              Klik <strong>"Buka Tiket"</strong> untuk rincian lengkap & Live Chat koordinasi
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {filteredTickets.map(ticket => {
              const statusCat = classifyInstallerStatus(ticket);

              return (
                <div
                  key={ticket.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-slate-300 dark:border-slate-700 hover:border-teal-500 dark:hover:border-teal-500 p-5 shadow-sm hover:shadow-md transition-all space-y-4 relative"
                >
                  {/* Card Header: WO Number, Badges, Category */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800 rounded-lg font-mono font-extrabold text-sm text-indigo-700 dark:text-indigo-300">
                        {ticket.woNumber}
                      </span>
                      <span className="px-2 py-0.5 rounded font-mono text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        ID Cust: {ticket.idCustomer || ticket.customerId || '-'}
                      </span>
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {ticket.ticketCategory || ticket.appointmentType || 'New Installation'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <StatusInstallerBadge status={ticket.statusWOInstaller} />
                      <StatusAgentBadge status={ticket.statusWOAgent} />
                      <StatusWhatsAppBadge status={ticket.statusWhatsApp} />
                    </div>
                  </div>

                  {/* Primary Details Grid (Clear, Legible, High-Contrast) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                    {/* Column 1: Customer Identity & Contact with WhatsApp next to phone */}
                    <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 block">
                        Pelanggan & Kontak
                      </span>
                      <div className="font-bold text-slate-900 dark:text-white text-sm">
                        {ticket.customerName}
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <div className="flex items-center gap-1.5 font-mono text-slate-700 dark:text-slate-300">
                          <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="font-semibold">{ticket.customerPhone || '-'}</span>
                        </div>
                        {ticket.customerPhone && (
                          <button
                            type="button"
                            onClick={() => onOpenWhatsApp(ticket)}
                            className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[10.5px] font-bold flex items-center gap-1 shadow-2xs shrink-0 transition-colors cursor-pointer"
                            title="Chat WhatsApp Pelanggan"
                          >
                            <MessageSquare className="w-3 h-3" />
                            <span>WA</span>
                          </button>
                        )}
                      </div>
                      {ticket.customerContact2 && (
                        <div className="text-[11px] text-slate-400">
                          Alt: {ticket.customerContact2}
                        </div>
                      )}
                    </div>

                    {/* Column 2: Address & Landmarks */}
                    <div className="space-y-1.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 block">
                        Alamat & Lokasi
                      </span>
                      <div className="flex items-start gap-1.5 text-slate-800 dark:text-slate-200">
                        <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-semibold">{ticket.clusterName || ticket.area}</div>
                          <div className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2">
                            {ticket.streetName || 'Alamat belum terisi'}
                          </div>
                        </div>
                      </div>
                      {ticket.streetAlternatif && (
                        <div className="text-[10.5px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-900/60">
                          Patokan: {ticket.streetAlternatif}
                        </div>
                      )}
                    </div>

                    {/* Column 3: Scheduled Date & Slot Time */}
                    <div className="space-y-1.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 block">
                        Jadwal Janji Temu
                      </span>
                      <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
                        <Calendar className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span className="font-semibold">
                          {ticket.appointmentDate || ticket.date || 'Tanggal Belum Ada'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-400">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span className="font-bold text-xs">
                          {ticket.slotTime || '09:00 - 11:00 WIB'}
                        </span>
                      </div>
                      <div className="text-[10.5px] text-slate-500">
                        Vendor: <strong className="text-slate-700 dark:text-slate-300">{ticket.contactorName || 'Mitra'}</strong>
                      </div>
                    </div>

                    {/* Column 4: Network & Hardware Info */}
                    <div className="space-y-1.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 block">
                        Infrastruktur OLT / FAT
                      </span>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Kode FDT:</span>
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                          {ticket.fdtCode || '-'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Kode FAT:</span>
                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {ticket.fatCode || '-'}
                        </span>
                      </div>
                      {ticket.technicalReport?.opticalPowerDbm && (
                        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200 dark:border-slate-700">
                          <span className="text-slate-400">Redaman OPM:</span>
                          <span className="font-mono font-bold text-emerald-600">
                            {ticket.technicalReport.opticalPowerDbm} dBm
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Remarks / Notes (if any) */}
                  {(ticket.remarksWOInstaller || ticket.remarksAgent) && (
                    <div className="p-2.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 text-[11px] text-amber-900 dark:text-amber-200 space-y-0.5">
                      {ticket.remarksWOInstaller && (
                        <div>
                          <strong>Catatan Teknisi:</strong> {ticket.remarksWOInstaller}
                        </div>
                      )}
                      {ticket.remarksAgent && (
                        <div className="text-amber-800 dark:text-amber-300">
                          <strong>Catatan Dispatch:</strong> {ticket.remarksAgent}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Bar: Open Ticket (Detailed view), Live Chat Button, WhatsApp, and Quick Statuses */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                    {/* Quick status progression buttons for field technician */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {ticket.statusWOInstaller === 'Assigned' && (
                        <button
                          onClick={() => handleQuickStatus(ticket.id, 'En Route', 'Teknisi berangkat menuju lokasi pelanggan')}
                          className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs transition-colors"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          <span>Otw Lokasi</span>
                        </button>
                      )}

                      {ticket.statusWOInstaller === 'En Route' && (
                        <button
                          onClick={() => handleQuickStatus(ticket.id, 'On Site', 'Teknisi tiba di lokasi pelanggan')}
                          className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs transition-colors"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          <span>Tiba di Lokasi</span>
                        </button>
                      )}

                      {ticket.statusWOInstaller === 'On Site' && (
                        <button
                          onClick={() => handleOpenTicket(ticket)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Isi Laporan / Selesai</span>
                        </button>
                      )}

                      {ticket.statusWOInstaller === 'Completed' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-xs font-bold rounded-lg">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Selesai Terverifikasi</span>
                        </span>
                      )}
                    </div>

                    {/* Primary Action Buttons: Clean responsive arrangement with zero overlaps */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Tombol Live Chat */}
                      <button
                        onClick={() => handleOpenChat(ticket)}
                        className="px-3.5 py-1.5 bg-[#5B35B1] hover:bg-[#3B1D78] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-2xs hover:shadow-xs transition-all cursor-pointer"
                        title="Buka Live Chat koordinasi dengan Dispatch untuk tiket ini"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Live Chat</span>
                      </button>

                      {/* Tombol "Buka Tiket" / "Open Ticket" */}
                      <button
                        onClick={() => handleOpenTicket(ticket)}
                        className="px-3.5 py-1.5 bg-[#3B1D78] hover:bg-[#5B35B1] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                        title="Buka rincian lengkap tiket dan formulir teknis"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Buka Tiket</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 5. DEDICATED TICKET DETAIL MODAL WITH PROMINENT LIVE CHAT    */}
      {/* ============================================================ */}
      {detailTicket && (
        <div className="fixed inset-0 z-60 bg-black/75 flex items-center justify-center p-2 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-slate-50 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-mono font-bold text-base text-indigo-600 dark:text-indigo-400">
                  {detailTicket.woNumber}
                </span>
                <span className="px-2 py-0.5 rounded font-mono text-xs font-semibold bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                  ID: {detailTicket.idCustomer || detailTicket.customerId}
                </span>
                <span className="font-bold text-slate-900 dark:text-white text-sm">
                  {detailTicket.customerName}
                </span>
                <StatusInstallerBadge status={detailTicket.statusWOInstaller} />
              </div>

              {/* Action Buttons in Modal Header: LIVE CHAT, WHATSAPP, CLOSE */}
              <div className="flex items-center gap-2">
                {/* Live Chat Tab Switcher Button */}
                <button
                  onClick={() => setDetailModalTab(prev => prev === 'chat' ? 'details' : 'chat')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors shadow-xs ${
                    detailModalTab === 'chat'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                  }`}
                  title="Buka panel Live Chat untuk koordinasi instan"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{detailModalTab === 'chat' ? 'Kembali ke Rincian' : 'Buka Live Chat'}</span>
                </button>

                {/* WhatsApp */}
                <button
                  onClick={() => onOpenWhatsApp(detailTicket)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </button>

                {/* Close Modal Button */}
                <button
                  onClick={() => setDetailTicket(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ml-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Switch between Details and Live Chat */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs">
              {detailModalTab === 'chat' ? (
                /* LIVE CHAT VIEW */
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                        Live Chat Koordinasi WO {detailTicket.woNumber}
                      </h4>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      Pesan terhubung langsung dengan Dispatch dan Korlap Leader
                    </span>
                  </div>

                  <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 overflow-hidden shadow-xs">
                    <TicketLiveChat ticket={detailTicket} />
                  </div>
                </div>
              ) : (
                /* FULL TICKET DETAILS VIEW (7 Sections) */
                <div className="space-y-5">
                  {/* Banner Live Chat CTA */}
                  <div className="p-3 bg-indigo-50 dark:bg-indigo-950/60 rounded-xl border border-indigo-200 dark:border-indigo-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 text-indigo-900 dark:text-indigo-200">
                      <MessageSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <div>
                        <span className="font-bold block">Butuh bantuan koordinasi atau approval Dispatch?</span>
                        <span className="text-[11px] text-indigo-700 dark:text-indigo-300">
                          Gunakan fitur Live Chat untuk konfirmasi kendala lapangan, OPM, atau nomor port FAT.
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setDetailModalTab('chat')}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs shrink-0 flex items-center justify-center gap-1.5 shadow-2xs"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Buka Live Chat Sekarang</span>
                    </button>
                  </div>

                  {/* Section 1 & 2: Primary WO & Customer Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Data Utama WO */}
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-2.5">
                      <h5 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5 border-b pb-2 border-slate-200 dark:border-slate-700">
                        <FileText className="w-3.5 h-3.5 text-indigo-600" />
                        <span>1. Data Utama Work Order</span>
                      </h5>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <span className="text-slate-400 block">Nomor WO:</span>
                          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{detailTicket.woNumber}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">ID Pelanggan:</span>
                          <span className="font-mono font-semibold">{detailTicket.idCustomer || detailTicket.customerId}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Kategori WO:</span>
                          <span className="font-medium">{detailTicket.ticketCategory || 'New Installation'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Mitra Kontraktor:</span>
                          <span className="font-medium">{detailTicket.contactorName || 'Mitra'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Data Pelanggan & Alamat */}
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-2.5">
                      <h5 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5 border-b pb-2 border-slate-200 dark:border-slate-700">
                        <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                        <span>2. Data Pelanggan & Lokasi</span>
                      </h5>
                      <div className="space-y-1.5 text-[11px]">
                        <div>
                          <span className="text-slate-400 block">Nama Lengkap:</span>
                          <span className="font-bold text-slate-900 dark:text-white">{detailTicket.customerName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">Telepon / WhatsApp:</span>
                          <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">{detailTicket.customerPhone}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Alamat Pemasangan:</span>
                          <span className="text-slate-700 dark:text-slate-300 font-medium">{detailTicket.streetName}</span>
                        </div>
                        {detailTicket.streetAlternatif && (
                          <div>
                            <span className="text-slate-400 block">Patokan:</span>
                            <span className="text-amber-700 dark:text-amber-400">{detailTicket.streetAlternatif}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Section 3 & 4: Schedule & Network */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Data Jadwal */}
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-2.5">
                      <h5 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5 border-b pb-2 border-slate-200 dark:border-slate-700">
                        <Clock className="w-3.5 h-3.5 text-blue-600" />
                        <span>3. Jadwal Kunjungan (Appointment)</span>
                      </h5>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <span className="text-slate-400 block">Tanggal Janji:</span>
                          <span className="font-semibold">{detailTicket.appointmentDate || detailTicket.date}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Slot Waktu:</span>
                          <span className="font-bold text-indigo-600 dark:text-indigo-400">{detailTicket.slotTime || '09:00 - 11:00 WIB'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Status Konfirmasi WA:</span>
                          <StatusWhatsAppBadge status={detailTicket.statusWhatsApp} />
                        </div>
                        <div>
                          <span className="text-slate-400 block">Status Lapangan:</span>
                          <StatusInstallerBadge status={detailTicket.statusWOInstaller} />
                        </div>
                      </div>
                    </div>

                    {/* Data Jaringan & Hardware */}
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-2.5">
                      <h5 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5 border-b pb-2 border-slate-200 dark:border-slate-700">
                        <Radio className="w-3.5 h-3.5 text-amber-600" />
                        <span>4. Data Jaringan OLT / FDT / FAT</span>
                      </h5>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <span className="text-slate-400 block">Kode FDT:</span>
                          <span className="font-mono font-semibold">{detailTicket.fdtCode || '-'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Kode FAT:</span>
                          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{detailTicket.fatCode || '-'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Cluster:</span>
                          <span className="font-medium">{detailTicket.clusterName || '-'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Area / Regional:</span>
                          <span className="font-medium">{detailTicket.area || '-'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section 6: Formulir Laporan Teknis */}
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                    <h5 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5 border-b pb-2 border-slate-200 dark:border-slate-700">
                      <Wifi className="w-3.5 h-3.5 text-teal-600" />
                      <span>5. Laporan Teknis Lapangan (Optical Power OPM & Root Cause)</span>
                    </h5>
                    <TechnicalReportForm ticket={detailTicket} />
                  </div>

                  {/* Section 7: Bukti Foto Before & After */}
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                    <h5 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5 border-b pb-2 border-slate-200 dark:border-slate-700">
                      <Camera className="w-3.5 h-3.5 text-indigo-600" />
                      <span>6. Bukti Foto Pengerjaan (Before & After)</span>
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-3 border rounded-lg bg-slate-50 dark:bg-slate-800/40 text-center space-y-2">
                        <span className="font-semibold text-slate-700 dark:text-slate-300 block text-xs">
                          Foto Sebelum Pengerjaan (Before)
                        </span>
                        {detailTicket.technicalReport?.photoBeforeUrl ? (
                          <div className="relative rounded-lg overflow-hidden border aspect-video bg-black/5">
                            <img
                              src={detailTicket.technicalReport.photoBeforeUrl}
                              alt="Foto Before"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="aspect-video rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-slate-400">
                            <Camera className="w-6 h-6 mb-1 opacity-50" />
                            <span className="text-[11px]">Belum ada foto before</span>
                          </div>
                        )}
                      </div>

                      <div className="p-3 border rounded-lg bg-slate-50 dark:bg-slate-800/40 text-center space-y-2">
                        <span className="font-semibold text-slate-700 dark:text-slate-300 block text-xs">
                          Foto Sesudah Selesai (After)
                        </span>
                        {detailTicket.technicalReport?.photoAfterUrl ? (
                          <div className="relative rounded-lg overflow-hidden border aspect-video bg-black/5">
                            <img
                              src={detailTicket.technicalReport.photoAfterUrl}
                              alt="Foto After"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="aspect-video rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-slate-400">
                            <Camera className="w-6 h-6 mb-1 opacity-50" />
                            <span className="text-[11px]">Belum ada foto after</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/90 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
              <div className="text-[11px] text-slate-500">
                Teknisi: <strong className="text-slate-700 dark:text-slate-300">{detailTicket.installerName || effectiveInstallerName}</strong>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDetailModalTab(prev => prev === 'chat' ? 'details' : 'chat')}
                  className="px-3 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-1.5 shadow-2xs"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{detailModalTab === 'chat' ? 'Kembali ke Rincian' : 'Buka Live Chat'}</span>
                </button>
                <button
                  onClick={() => setDetailTicket(null)}
                  className="px-4 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 6. STANDALONE QUICK LIVE CHAT MODAL (DIRECT FROM CARD)       */}
      {/* ============================================================ */}
      {chatModalTicket && (
        <div className="fixed inset-0 z-60 bg-black/75 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-2xl w-full flex flex-col overflow-hidden max-h-[88vh]">
            <div className="px-5 py-3.5 bg-indigo-600 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <MessageSquare className="w-5 h-5 text-indigo-200" />
                <div>
                  <h4 className="font-bold text-sm">
                    Live Chat: {chatModalTicket.woNumber}
                  </h4>
                  <p className="text-[11px] text-indigo-100">
                    Pelanggan: {chatModalTicket.customerName} ({chatModalTicket.area})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setChatModalTicket(null)}
                className="p-1 text-white/80 hover:text-white rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto">
              <TicketLiveChat ticket={chatModalTicket} />
            </div>

            <div className="px-5 py-2.5 bg-slate-50 dark:bg-slate-800 border-t flex items-center justify-between text-xs text-slate-500">
              <span>Koordinasi cepat dengan Dispatch & Leader</span>
              <button
                onClick={() => setChatModalTicket(null)}
                className="px-3 py-1 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded font-medium text-xs hover:bg-slate-300"
              >
                Tutup Chat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
