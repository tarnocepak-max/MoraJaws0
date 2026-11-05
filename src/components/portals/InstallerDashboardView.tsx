import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import { Ticket, TicketStatusWOInstaller } from '../../types/index.ts';
import { classifyInstallerStatus } from './InstallerPortal';
import { StatusInstallerBadge, StatusWhatsAppBadge, StatusApprovalBadge } from '../common/Badge';
import { InstallerTicketFullview } from './InstallerTicketFullview';
import {
  Wrench,
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar,
  MapPin,
  Phone,
  MessageSquare,
  ArrowRight,
  Bell,
  Sparkles,
  Layers,
  ChevronRight,
  TrendingUp,
  UserCheck,
  Building2,
  Navigation,
  Play
} from 'lucide-react';

interface InstallerDashboardViewProps {
  onNavigateTab: (tab: string, filter?: string) => void;
  onSelectTicket: (ticket: Ticket) => void;
  onOpenWhatsApp: (ticket: Ticket) => void;
}

export const InstallerDashboardView: React.FC<InstallerDashboardViewProps> = ({
  onNavigateTab,
  onSelectTicket,
  onOpenWhatsApp
}) => {
  const { currentUser, tickets, updateTicketStatus, startWorkOnTicket } = useApp();
  const { toast } = useToast();
  const [fullviewTicket, setFullviewTicket] = useState<Ticket | null>(null);

  // Helper matching for logged-in technician
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

  // Strictly filter tickets to current logged-in installer
  const myTickets = useMemo(() => {
    const myName = currentUser.name || '';
    const myUsername = currentUser.username || '';
    const myId = currentUser.id || '';

    return (tickets || []).filter(t => {
      if (t.isArchived || t.isDeleted) return false;
      if (!t.installerName) return false;

      // Primary check: assignedTo id matching
      if (t.assignedTo && (t.assignedTo === myId || t.assignedTo === myUsername)) return true;

      // Secondary check: name matching
      if (myName && isInstallerMatch(t.installerName, myName)) return true;
      if (myUsername && isInstallerMatch(t.installerName, myUsername)) return true;

      return false;
    });
  }, [tickets, currentUser]);

  // Realtime synced ticket for fullview mode
  const activeFullviewTicket = useMemo(() => {
    if (!fullviewTicket) return null;
    return (tickets || []).find(t => t.id === fullviewTicket.id) || fullviewTicket;
  }, [tickets, fullviewTicket]);

  // Breakdown KPI counters
  const stats = useMemo(() => {
    let belumDikerjakan = 0;
    let sedangDikerjakan = 0;
    let butuhApproval = 0;
    let selesai = 0;
    let rescheduleOrCancel = 0;

    myTickets.forEach(t => {
      if (t.approvalStatus === 'BUTUH APPROVAL') {
        butuhApproval++;
      }

      const cat = classifyInstallerStatus(t);
      if (cat === 'done' || t.approvalStatus === 'APPROVED' || t.statusWOAgent === 'Closed') {
        selesai++;
      } else if (cat === 'reschedule' || cat === 'cancel') {
        rescheduleOrCancel++;
      } else {
        // Pending category: separate into "Sedang Dikerjakan" vs "Belum Dikerjakan"
        const s = (t.statusWOInstaller || '').toLowerCase();
        if (t.workStartedAt || s === 'on site' || s === 'en route' || s.includes('progress') || s.includes('working')) {
          sedangDikerjakan++;
        } else {
          belumDikerjakan++;
        }
      }
    });

    return {
      total: myTickets.length,
      belumDikerjakan,
      sedangDikerjakan,
      butuhApproval,
      selesai,
      rescheduleOrCancel
    };
  }, [myTickets]);

  // Daftar tugas terbaru (sorted by appointment date)
  const recentTickets = useMemo(() => {
    return [...myTickets]
      .sort((a, b) => {
        const dateA = a.appointmentDate || '';
        const dateB = b.appointmentDate || '';
        return dateB.localeCompare(dateA);
      })
      .slice(0, 6);
  }, [myTickets]);

  // Notifikasi penugasan dari Leader (tickets assigned that are still pending/new)
  const leaderNotifications = useMemo(() => {
    return myTickets.filter(t => {
      const cat = classifyInstallerStatus(t);
      return cat === 'pending';
    }).slice(0, 4);
  }, [myTickets]);

  // MULAI KERJAKAN: Membuka tiket WO, mengubah status internal menjadi On Site/In Progress, dan mencatat waktu mulai
  const handleStartWork = async (e: React.MouseEvent, ticket: Ticket) => {
    e.stopPropagation();
    try {
      const res = await startWorkOnTicket(ticket.id);
      if (res.success && res.ticket) {
        setFullviewTicket(res.ticket);
        toast.success(`Tiket WO ${ticket.woNumber} dibuka dan status pengerjaan telah dimulai.`, 'Mulai Dikerjakan');
      } else if (!res.success && res.error) {
        toast.error(res.error, 'Gagal Memulai Pengerjaan');
      } else {
        setFullviewTicket(ticket);
      }
    } catch {
      setFullviewTicket(ticket);
    }
  };

  const handleOpenTicketFullview = (ticket: Ticket) => {
    setFullviewTicket(ticket);
  };

  const todayStr = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date());

  // Render Fullview Modal/Page if an active ticket is selected
  if (activeFullviewTicket) {
    return (
      <InstallerTicketFullview
        ticket={activeFullviewTicket}
        onBack={() => setFullviewTicket(null)}
        onOpenWhatsApp={onOpenWhatsApp}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Header Card - Installer Identity & Welcome */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#4A2695] via-[#5B35B1] to-[#7B46D1] text-white p-5 sm:p-7 shadow-lg">
        {/* Decorative background glow */}
        <div className="absolute -right-12 -top-12 w-48 h-48 bg-purple-400/20 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute right-24 -bottom-16 w-36 h-36 bg-indigo-300/15 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-13 h-13 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center shrink-0 shadow-inner">
              <Wrench className="w-6 h-6 text-yellow-300" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 uppercase tracking-wider">
                  Teknisi Lapangan
                </span>
                <span className="text-xs text-purple-200 font-medium">
                  {todayStr}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight mt-1">
                Halo, {currentUser.name}
              </h1>
              <div className="flex flex-wrap items-center gap-3 text-xs text-purple-100/90 mt-1">
                <span className="flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-purple-300" />
                  <span>{currentUser.contractor || 'Mitra Lapangan'}</span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-purple-300" />
                  <span>Area: {currentUser.area || 'Seluruh Area'}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 sm:pt-0">
            <button
              onClick={() => onNavigateTab('installer_tasks')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-[#5B35B1] font-bold text-xs shadow-md hover:bg-purple-50 transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              <span>Buka Tugas Saya</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. 5 Primary Operational Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Card 1: Total WO yang di-assign */}
        <div
          onClick={() => onNavigateTab('installer_tasks', 'all')}
          className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#1E1135] border border-[#D8CCF3] dark:border-[#3B1D78] shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#756B8D] dark:text-purple-300">
              Total Ditugaskan
            </span>
            <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Layers className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-[#21183A] dark:text-white">
              {stats.total}
            </div>
            <p className="text-[11px] text-[#756B8D] dark:text-slate-400 mt-0.5">
              Work Order assigned ke Anda
            </p>
          </div>
        </div>

        {/* Card 2: WO Belum Dikerjakan */}
        <div
          onClick={() => onNavigateTab('installer_tasks', 'pending')}
          className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#1E1135] border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Belum Dikerjakan
            </span>
            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Clock className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-800 dark:text-slate-200">
              {stats.belumDikerjakan}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Menunggu mulai dikerjakan
            </p>
          </div>
        </div>

        {/* Card 3: WO Sedang Dikerjakan */}
        <div
          onClick={() => onNavigateTab('installer_tasks', 'pending')}
          className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#1E1135] border border-indigo-200 dark:border-indigo-900/50 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400">
              Sedang Dikerjakan
            </span>
            <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <TrendingUp className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-indigo-700 dark:text-indigo-400">
              {stats.sedangDikerjakan}
            </div>
            <p className="text-[11px] text-indigo-600/80 dark:text-indigo-300/80 mt-0.5">
              Status On Site / In Progress
            </p>
          </div>
        </div>

        {/* Card 4: BUTUH APPROVAL (Laporan tersimpan menunggu Dispatch) */}
        <div
          onClick={() => onNavigateTab('installer_tasks', 'butuh_approval')}
          className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50/50 dark:from-amber-950/40 dark:to-[#1E1135] border-2 border-amber-400/80 dark:border-amber-600/70 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between relative overflow-hidden"
        >
          {stats.butuhApproval > 0 && (
            <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
            </span>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
              <span>Butuh Approval</span>
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-200/70 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 flex items-center justify-center group-hover:scale-110 transition-transform">
              <AlertCircle className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-amber-800 dark:text-amber-300">
              {stats.butuhApproval}
            </div>
            <p className="text-[11px] text-amber-700/90 dark:text-amber-400/90 mt-0.5 font-medium">
              Menunggu verifikasi Dispatch
            </p>
          </div>
        </div>

        {/* Card 5: WO Selesai Resmi */}
        <div
          onClick={() => onNavigateTab('installer_tasks', 'done')}
          className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#1E1135] border border-emerald-200 dark:border-emerald-900/50 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
              WO Selesai (Done)
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <CheckCircle2 className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-700 dark:text-emerald-400">
              {stats.selesai}
            </div>
            <p className="text-[11px] text-emerald-600/80 dark:text-emerald-300/80 mt-0.5">
              Telah disetujui / Closed
            </p>
          </div>
        </div>
      </div>

      {/* 3. Section: Notifikasi Penugasan dari Leader */}
      {leaderNotifications.length > 0 && (
        <div className="rounded-2xl bg-amber-50/80 dark:bg-[#251838] border border-amber-300/80 dark:border-amber-900/60 p-4 sm:p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-200 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 flex items-center justify-center">
                <Bell className="w-4 h-4 animate-bounce" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-amber-950 dark:text-amber-200">
                  Notifikasi Penugasan dari Leader
                </h3>
                <p className="text-[11px] text-amber-800 dark:text-amber-300/80">
                  Ada {leaderNotifications.length} tugas baru yang menunggu pengerjaan Anda
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigateTab('installer_tasks', 'pending')}
              className="text-xs font-bold text-amber-800 dark:text-amber-300 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Lihat Semua</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
            {leaderNotifications.map(t => (
              <div
                key={t.id}
                onClick={() => handleOpenTicketFullview(t)}
                className="bg-white dark:bg-[#1E1135] rounded-xl p-3 border border-amber-200 dark:border-amber-900/40 shadow-2xs hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-xs font-extrabold text-[#5B35B1] dark:text-purple-300">
                        {t.woNumber || t.ticketNumber || 'WO-Unknown'}
                      </span>
                      {t.approvalStatus && (
                        <StatusApprovalBadge status={t.approvalStatus} />
                      )}
                    </div>
                    <h4 className="font-bold text-xs text-[#21183A] dark:text-white truncate max-w-[200px] mt-0.5">
                      {t.customerName || 'Pelanggan'}
                    </h4>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 shrink-0">
                    {t.slotTime || 'Hari ini'}
                  </span>
                </div>

                <div className="text-[11px] text-[#756B8D] dark:text-slate-400 flex items-center gap-1.5 truncate">
                  <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="truncate">{t.streetName || t.clusterName || t.area || 'Alamat Lokasi'}</span>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-purple-900/30">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenWhatsApp(t);
                    }}
                    className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Konfirmasi WA</span>
                  </button>

                  <button
                    onClick={(e) => handleStartWork(e, t)}
                    className="px-2.5 py-1 rounded-lg bg-[#5B35B1] hover:bg-[#4C1D95] text-white text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
                  >
                    <span>{t.workStartedAt || t.statusWOInstaller === 'On Site' || t.statusWOInstaller === 'En Route' ? 'Lanjutkan' : 'Mulai Kerjakan'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Section: Daftar Tugas Terbaru */}
      <div className="rounded-2xl bg-white dark:bg-[#1E1135] border border-[#D8CCF3] dark:border-[#3B1D78] p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#21183A] dark:text-white">
                Daftar Tugas Terbaru
              </h2>
              <p className="text-[11px] text-[#756B8D] dark:text-slate-400">
                Work Order terbaru yang ditugaskan khusus untuk akun Anda
              </p>
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('installer_tasks')}
            className="text-xs font-bold text-[#5B35B1] dark:text-purple-300 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Buka Semua ({myTickets.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentTickets.length === 0 ? (
          <div className="p-8 text-center rounded-xl bg-slate-50 dark:bg-[#160D29] border border-slate-200 dark:border-purple-900/40 space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <h4 className="text-sm font-bold text-[#21183A] dark:text-white">
              Tidak Ada Tugas Menunggu
            </h4>
            <p className="text-xs text-[#756B8D] dark:text-slate-400 max-w-sm mx-auto">
              Saat ini belum ada Work Order yang di-assign kepada Anda. Hubungi Leader jika memerlukan penugasan tiket baru.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-purple-900/30">
            {recentTickets.map((t) => {
              const statusCat = classifyInstallerStatus(t);

              return (
                <div
                  key={t.id}
                  onClick={() => handleOpenTicketFullview(t)}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 dark:hover:bg-purple-950/30 px-2 rounded-xl transition-colors cursor-pointer"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[#F5F1FF] dark:bg-[#2A1647] text-[#5B35B1] dark:text-purple-300 flex items-center justify-center shrink-0 mt-0.5">
                      <Wrench className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-extrabold text-[#5B35B1] dark:text-purple-300">
                          {t.woNumber || t.ticketNumber || 'WO-Unknown'}
                        </span>
                        <StatusInstallerBadge status={t.statusWOInstaller} />
                        <StatusApprovalBadge status={t.approvalStatus} />
                        {t.ticketCategory && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-purple-900/40 text-[#756B8D] dark:text-purple-200">
                            {t.ticketCategory}
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-xs text-[#21183A] dark:text-white truncate mt-0.5">
                        {t.customerName || 'Nama Pelanggan'}
                      </h4>
                      <p className="text-[11px] text-[#756B8D] dark:text-slate-400 truncate mt-0.5 flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{t.streetName || t.clusterName || t.area || 'Alamat'}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenWhatsApp(t);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100 transition-colors flex items-center gap-1 cursor-pointer"
                      title="Kirim WhatsApp"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="hidden sm:inline">WhatsApp</span>
                    </button>

                    {!t.workStartedAt && (t.statusWOInstaller === 'Assigned' || !t.statusWOInstaller) ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartWork(e, t);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#7C3AED] to-[#5B35B1] hover:from-[#6D28D9] hover:to-[#4C1D95] text-white text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-purple-500/20 active:scale-95"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Mulai Kerjakan</span>
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenTicketFullview(t);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#5B35B1] hover:bg-[#4C1D95] text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                      >
                        <span>Buka</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Quick Shortcut Grid for Installer */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={() => onNavigateTab('installer_tasks')}
          className="p-4 rounded-xl bg-white dark:bg-[#1E1135] border border-[#D8CCF3] dark:border-[#3B1D78] shadow-2xs hover:shadow-sm text-left transition-all cursor-pointer group flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/70 text-[#5B35B1] dark:text-purple-300 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#21183A] dark:text-white">Tugas Saya</h4>
            <p className="text-[11px] text-[#756B8D] dark:text-slate-400">Lihat semua daftar WO</p>
          </div>
        </button>

        <button
          onClick={() => onNavigateTab('installer_whatsapp')}
          className="p-4 rounded-xl bg-white dark:bg-[#1E1135] border border-emerald-200 dark:border-emerald-900/50 shadow-2xs hover:shadow-sm text-left transition-all cursor-pointer group flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Pusat WhatsApp</h4>
            <p className="text-[11px] text-[#756B8D] dark:text-slate-400">Hubungi pelanggan WO</p>
          </div>
        </button>

        <button
          onClick={() => onNavigateTab('installer_chat')}
          className="p-4 rounded-xl bg-white dark:bg-[#1E1135] border border-indigo-200 dark:border-indigo-900/50 shadow-2xs hover:shadow-sm text-left transition-all cursor-pointer group flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <Phone className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-indigo-800 dark:text-indigo-300">Live Chat Center</h4>
            <p className="text-[11px] text-[#756B8D] dark:text-slate-400">Koordinasi dengan Dispatch</p>
          </div>
        </button>
      </div>
    </div>
  );
};
