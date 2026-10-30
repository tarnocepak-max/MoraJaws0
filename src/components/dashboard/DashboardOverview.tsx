import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Ticket } from '../../types';
import {
  parseAppointmentDate,
  getJakartaDateString,
  getJakartaDateParts,
  getTicketAppointmentDate,
  formatAppointmentDateDisplay
} from '../../services/appointmentDateParser';
import {
  Ticket as TicketIcon,
  Clock,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  Users,
  ArrowRight,
  TrendingUp,
  MapPin,
  Building2,
  Search,
  Filter,
  Layers,
  ShieldCheck,
  Wrench,
  Check,
  Calendar
} from 'lucide-react';

interface DashboardOverviewProps {
  onNavigate: (tab: string) => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({ onNavigate }) => {
  const { tickets, contractors, coverageAreas, users, currentUser, scopedTickets } = useApp();

  const [contractorSearch, setContractorSearch] = useState('');
  const [selectedAreaFilter, setSelectedAreaFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');
  const [activeTab, setActiveTab] = useState<'contractors' | 'coverage_areas'>('contractors');

  // Schedule Appointment Date Filtering (Asia/Jakarta WIB standard)
  const [scheduleDateFilter, setScheduleDateFilter] = useState<string>(() => getJakartaDateString(0));
  const [scheduleFilterMode, setScheduleFilterMode] = useState<'selected_date' | 'all'>('all');
  const [currentTimeKey, setCurrentTimeKey] = useState<string>(() => getJakartaDateString(0));

  // Auto-rollover at midnight WIB
  useEffect(() => {
    const timer = setInterval(() => {
      const liveToday = getJakartaDateString(0);
      if (liveToday !== currentTimeKey) {
        setCurrentTimeKey(liveToday);
        setScheduleDateFilter(prev => (prev === currentTimeKey ? liveToday : prev));
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [currentTimeKey]);

  // Role Scoping: Leader and Installer dashboard is strictly scoped to their contractor or area
  const isRoleRestricted = currentUser.role === 'leader' || currentUser.role === 'installer';
  const effectiveTickets = isRoleRestricted ? scopedTickets : tickets;
  const activeTickets = effectiveTickets.filter(t => !t.isArchived && !t.isDeleted);

  // Filtered tickets based on role and scheduled appointment date
  const displayTickets: Ticket[] = useMemo<Ticket[]>(() => {
    if (scheduleFilterMode === 'selected_date') {
      return activeTickets.filter((t: Ticket) => {
        const ticketDate = getTicketAppointmentDate(t);
        // Work Order tanpa tanggal jadwal harus ditangani dengan aman dan tidak boleh dianggap memiliki jadwal hari ini
        if (!ticketDate) return false;
        return ticketDate === scheduleDateFilter;
      });
    }
    return activeTickets;
  }, [activeTickets, scheduleFilterMode, scheduleDateFilter]);

  const userContractor = (currentUser.contractor || '').toLowerCase().trim();
  const userArea = (currentUser.area || '').toLowerCase().trim();

  // Scope contractors list if role is leader or installer
  const visibleContractors = isRoleRestricted && userContractor
    ? contractors.filter(c => {
        if (!c) return false;
        const cName = (c.name || '').toLowerCase().trim();
        const cCode = (c.code || '').toLowerCase().trim();
        return cName === userContractor || cName.includes(userContractor) || userContractor.includes(cName) || cCode === userContractor;
      })
    : contractors;

  // Scope coverage areas list if role is leader or installer
  const visibleCoverageAreas = isRoleRestricted
    ? coverageAreas.filter(a => {
        if (!a) return false;
        const aName = (a.name || '').toLowerCase().trim();
        const matchesUserArea = userArea && (aName === userArea || aName.includes(userArea) || userArea.includes(aName));
        const matchedContractorObj = contractors.find(c => {
          if (!c) return false;
          const cName = (c.name || '').toLowerCase().trim();
          return cName === userContractor || cName.includes(userContractor) || userContractor.includes(cName);
        });
        const inContractorCoverage = matchedContractorObj?.coverageAreas?.some(ca => (ca || '').toLowerCase().trim() === aName);
        return matchesUserArea || inContractorCoverage;
      })
    : coverageAreas;

  // Core KPI counts (calculated from displayTickets respecting schedule appointment date for superadmin)
  const totalWos = displayTickets.length;
  const unassignedCount = displayTickets.filter(t => !t.installerName).length;
  const assignedCount = displayTickets.filter(t => Boolean(t.installerName) && t.statusWOInstaller === 'Assigned').length;
  const inProgressCount = displayTickets.filter(t => t.statusWOInstaller === 'En Route' || t.statusWOInstaller === 'On Site').length;
  const awaitingDispatchCount = displayTickets.filter(t => t.statusWOInstaller === 'Completed' && t.statusWOAgent !== 'Closed').length;
  const closedCount = displayTickets.filter(t => t.statusWOAgent === 'Closed').length;
  const pendingFailedCount = displayTickets.filter(
    t => t.statusWOInstaller === 'Pending Technical' || t.statusWOInstaller === 'Failed / Cancelled' || t.statusWOAgent === 'Cancelled'
  ).length;

  const totalInstallers = isRoleRestricted
    ? users.filter(u => u.role === 'installer' && u.active && (
        (userContractor && u.contractor && (u.contractor.toLowerCase().includes(userContractor) || userContractor.includes(u.contractor.toLowerCase()))) ||
        (userArea && u.area && (u.area.toLowerCase().includes(userArea) || userArea.includes(u.area.toLowerCase())))
      )).length
    : users.filter(u => u.role === 'installer' && u.active).length;

  const totalLeaders = isRoleRestricted
    ? users.filter(u => u.role === 'leader' && u.active && (
        (userContractor && u.contractor && (u.contractor.toLowerCase().includes(userContractor) || userContractor.includes(u.contractor.toLowerCase()))) ||
        (userArea && u.area && (u.area.toLowerCase().includes(userArea) || userArea.includes(u.area.toLowerCase())))
      )).length
    : users.filter(u => u.role === 'leader' && u.active).length;

  // Contractor Breakdown Table calculation (scoped & schedule appointment date filtered)
  const contractorRows = visibleContractors.map(contractor => {
    const cTickets = displayTickets.filter(t => (t.contactorName || t.contractorName) === contractor.name);
    const unassigned = cTickets.filter(t => !t.installerName).length;
    const inProgress = cTickets.filter(t => ['Assigned', 'En Route', 'On Site'].includes(t.statusWOInstaller)).length;
    const completed = cTickets.filter(t => t.statusWOInstaller === 'Completed' || t.statusWOAgent === 'Closed').length;
    const pendingFailed = cTickets.filter(t => ['Pending Technical', 'Failed / Cancelled'].includes(t.statusWOInstaller)).length;
    const activeInstCount = users.filter(u => u.role === 'installer' && u.contractor === contractor.name && u.active).length;
    const completionRate = cTickets.length > 0 ? Math.round((completed / cTickets.length) * 100) : 0;

    return {
      contractor,
      total: cTickets.length,
      unassigned,
      inProgress,
      completed,
      pendingFailed,
      activeInstallers: activeInstCount,
      completionRate
    };
  });

  const filteredContractorRows = contractorRows.filter(row => {
    const searchLow = (contractorSearch || '').toLowerCase();
    const matchesSearch = (row.contractor?.name || '').toLowerCase().includes(searchLow) ||
      (row.contractor?.code || '').toLowerCase().includes(searchLow) ||
      (row.contractor?.leaderName && row.contractor.leaderName.toLowerCase().includes(searchLow));

    const matchesArea = selectedAreaFilter === 'ALL' || (row.contractor?.coverageAreas || []).includes(selectedAreaFilter);
    return matchesSearch && matchesArea;
  });

  // Coverage Area Breakdown calculation (scoped & schedule appointment date filtered)
  const areaRows = visibleCoverageAreas.map(area => {
    const aTickets = displayTickets.filter(t => t.area === area.name);
    const completed = aTickets.filter(t => t.statusWOInstaller === 'Completed' || t.statusWOAgent === 'Closed').length;
    const active = aTickets.filter(t => ['Assigned', 'En Route', 'On Site'].includes(t.statusWOInstaller)).length;
    const pending = aTickets.filter(t => !t.installerName || ['Pending Technical', 'Failed / Cancelled'].includes(t.statusWOInstaller)).length;

    // Associated contractors
    const assocContractors = visibleContractors.filter(c => c.coverageAreas.includes(area.name));

    return {
      area,
      total: aTickets.length,
      completed,
      active,
      pending,
      contractors: assocContractors
    };
  });

  return (
    <div className="space-y-6">
      {/* Top Welcome & Summary Header */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-slate-900 dark:text-white">
              {isRoleRestricted
                ? `Dashboard Monitoring — ${currentUser.role === 'leader' ? 'Leader / Korlap' : 'Teknisi / Installer'}`
                : 'MoraJaws — Contractor Performance & Coverage Overview'}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              Live Backlog
            </span>
            {isRoleRestricted && (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1">
                <Check className="w-3 h-3" />
                <span>Terfilter Sesuai Hak Akses</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isRoleRestricted ? (
              <span>
                Menampilkan data Work Order khusus kontraktor <strong>{currentUser.contractor || 'Tidak ditentukan'}</strong>
                {currentUser.area ? <> dan area <strong>{currentUser.area}</strong></> : null}.
              </span>
            ) : (
              'Monitoring sentral total seluruh Work Order, performa SLA kontraktor mitra, dan distribusi kapasitas coverage area.'
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {currentUser.role === 'super_admin' && (
            <button
              onClick={() => onNavigate('settings')}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Kelola Master Kontraktor</span>
            </button>
          )}

          <button
            onClick={() => onNavigate('tickets')}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <span>{isRoleRestricted ? 'Lihat Tiket WO Saya' : 'Semua Tiket WO'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Super Admin Schedule Appointment Date Filter Bar */}
      {currentUser.role === 'super_admin' && (
        <div className="bg-white dark:bg-[#1a0f30] rounded-2xl border-2 border-[#D8CCF3] dark:border-[#3B1D78] p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#5B35B1] text-white flex items-center justify-center font-bold shadow-xs shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-[#3B1D78] dark:text-[#E9E1FF] flex items-center gap-2">
                <span>Filter Schedule Appointment Date</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#E9E1FF] text-[#3B1D78] dark:bg-[#3B1D78] dark:text-[#E9E1FF] border border-[#D8CCF3] dark:border-[#5B35B1]">
                  {scheduleFilterMode === 'selected_date' ? formatAppointmentDateDisplay(scheduleDateFilter) : 'Semua Tanggal'}
                </span>
              </div>
              <p className="text-[11px] text-[#756B8D] dark:text-[#D8CCF3] mt-0.5">
                {scheduleFilterMode === 'selected_date'
                  ? `Akun Super Admin menampilkan ${displayTickets.length} Work Order sesuai jadwal appointment ${formatAppointmentDateDisplay(scheduleDateFilter)}.`
                  : `Menampilkan seluruh ${displayTickets.length} Work Order aktif dari database (tanpa filter tanggal).`}
              </p>
            </div>
          </div>

          {(() => {
            const todayWib = getJakartaDateString(0);
            const tomorrowWib = getJakartaDateString(1);
            const todayParts = getJakartaDateParts(0);
            const tomorrowParts = getJakartaDateParts(1);

            return (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setScheduleDateFilter(todayWib);
                    setScheduleFilterMode('selected_date');
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    scheduleFilterMode === 'selected_date' && scheduleDateFilter === todayWib
                      ? 'bg-[#3B1D78] text-white shadow-xs'
                      : 'bg-[#F5F1FF] text-[#3B1D78] dark:bg-[#251247] dark:text-[#E9E1FF] border border-[#D8CCF3] dark:border-[#3B1D78] hover:bg-[#E9E1FF]'
                  }`}
                >
                  Hari Ini ({todayParts.labelShort})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setScheduleDateFilter(tomorrowWib);
                    setScheduleFilterMode('selected_date');
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    scheduleFilterMode === 'selected_date' && scheduleDateFilter === tomorrowWib
                      ? 'bg-[#3B1D78] text-white shadow-xs'
                      : 'bg-[#F5F1FF] text-[#3B1D78] dark:bg-[#251247] dark:text-[#E9E1FF] border border-[#D8CCF3] dark:border-[#3B1D78] hover:bg-[#E9E1FF]'
                  }`}
                >
                  Besok ({tomorrowParts.labelShort})
                </button>
                <div className="flex items-center gap-1.5 bg-[#F5F1FF] dark:bg-[#251247] px-2.5 py-1 rounded-xl border border-[#D8CCF3] dark:border-[#3B1D78]">
                  <span className="text-[10.5px] text-[#756B8D] font-medium">Pilih:</span>
                  <input
                    type="date"
                    value={scheduleDateFilter}
                    onChange={e => {
                      if (e.target.value) {
                        setScheduleDateFilter(e.target.value);
                        setScheduleFilterMode('selected_date');
                      }
                    }}
                    className="bg-transparent text-xs font-bold font-mono text-[#3B1D78] dark:text-[#E9E1FF] focus:outline-none cursor-pointer"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setScheduleFilterMode(prev => prev === 'all' ? 'selected_date' : 'all')}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    scheduleFilterMode === 'all'
                      ? 'bg-[#5B35B1] text-white border-[#5B35B1] shadow-xs'
                      : 'text-[#756B8D] dark:text-[#D8CCF3] border-[#D8CCF3] dark:border-[#3B1D78] hover:bg-[#E9E1FF]/50'
                  }`}
                >
                  {scheduleFilterMode === 'all' ? 'Aktifkan Filter Jadwal' : 'Semua Tanggal'}
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* Primary KPI Grid (10 Metrik Utama Bagian G.1) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* Total Work Orders */}
        <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
            <span className="text-[11px] font-semibold">Total Seluruh WO</span>
            <TicketIcon className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {totalWos}
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Akumulasi aktif unik</span>
        </div>

        {/* Belum Ditugaskan */}
        <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
            <span className="text-[11px] font-semibold">Belum Ditugaskan</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 tabular-nums">
            {unassignedCount}
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Menunggu Korlap</span>
        </div>

        {/* Sudah Ditugaskan */}
        <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
            <span className="text-[11px] font-semibold">Sudah Ditugaskan</span>
            <Users className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400 tabular-nums">
            {assignedCount}
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Teknisi assigned</span>
        </div>

        {/* Sedang Dikerjakan */}
        <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
            <span className="text-[11px] font-semibold">Sedang Dikerjakan</span>
            <Wrench className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-sky-600 dark:text-sky-400 tabular-nums">
            {inProgressCount}
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">En Route / On Site</span>
        </div>

        {/* Menunggu Close Dispatch */}
        <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
            <span className="text-[11px] font-semibold">Menunggu Close</span>
            <ShieldCheck className="w-4 h-4 text-teal-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-teal-600 dark:text-teal-400 tabular-nums">
            {awaitingDispatchCount}
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Selesai Teknisi</span>
        </div>

        {/* WO Selesai Resmi / Closed */}
        <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
            <span className="text-[11px] font-semibold">Resmi Ditutup (Closed)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
            {closedCount}
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Disetujui Dispatch</span>
        </div>

        {/* Gagal / Tertunda */}
        <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
            <span className="text-[11px] font-semibold">Tertunda / Kendala</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400 tabular-nums">
            {pendingFailedCount}
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Perlu eskalasi</span>
        </div>

        {/* Total Installer Aktif */}
        <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
            <span className="text-[11px] font-semibold">Installer Aktif</span>
            <Wrench className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {totalInstallers}
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Teknisi lapangan</span>
        </div>

        {/* Total Leader Aktif */}
        <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
            <span className="text-[11px] font-semibold">Leader / Korlap Aktif</span>
            <Users className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {totalLeaders}
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Koordinator mitra</span>
        </div>

        {/* Total Kontraktor */}
        <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
            <span className="text-[11px] font-semibold">{isRoleRestricted ? 'Kontraktor Saya' : 'Vendor Kontraktor'}</span>
            <Building2 className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-purple-600 dark:text-purple-400 tabular-nums">
            {visibleContractors.length}
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">{isRoleRestricted ? 'Mitra Anda' : 'Mitra terdaftar'}</span>
        </div>
      </div>

      {/* Tabs Switcher for Table Views */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 text-xs font-medium pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('contractors')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'contractors'
                ? 'bg-[#5B35B1] text-white font-bold shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 hover:text-purple-700'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Rekap Total WO per Kontraktor ({visibleContractors.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('coverage_areas')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'coverage_areas'
                ? 'bg-[#5B35B1] text-white font-bold shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 hover:text-purple-700'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Distribusi Beban Coverage Area ({visibleCoverageAreas.length})</span>
          </button>
        </div>

        {activeTab === 'contractors' && (
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Cari kontraktor / leader..."
                value={contractorSearch}
                onChange={e => setContractorSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
              />
            </div>

            <select
              value={selectedAreaFilter}
              onChange={e => setSelectedAreaFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium"
            >
              <option value="ALL">Semua Area</option>
              {visibleCoverageAreas.map(a => (
                <option key={a.id} value={a.name}>{a.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* VIEW A: CONTRACTOR PERFORMANCE TABLE */}
      {activeTab === 'contractors' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-4 text-xs">
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase">
                <tr>
                  <th className="py-2.5 px-3">Nama Kontraktor</th>
                  <th className="py-2.5 px-3">Leader / Korlap</th>
                  <th className="py-2.5 px-3">Coverage Area</th>
                  <th className="py-2.5 px-3 text-right">Total WO</th>
                  <th className="py-2.5 px-3 text-right">Belum Ditugaskan</th>
                  <th className="py-2.5 px-3 text-right">Dalam Pengerjaan</th>
                  <th className="py-2.5 px-3 text-right">Selesai</th>
                  <th className="py-2.5 px-3 text-right">Kendala</th>
                  <th className="py-2.5 px-3 text-center">Teknisi Aktif</th>
                  <th className="py-2.5 px-3 text-center">Tingkat SLA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredContractorRows.map(row => (
                  <tr key={row.contractor.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>{row.contractor.name}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {row.contractor.code}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">{row.contractor.email || row.contractor.phone || '-'}</div>
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200">
                      {row.contractor.leaderName || 'Belum Ditetapkan'}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap gap-1">
                        {row.contractor.coverageAreas.map(area => (
                          <span key={area} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-700 dark:text-slate-300">
                            {area}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {row.total}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-amber-600 dark:text-amber-400 font-semibold">
                      {row.unassigned}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-sky-600 dark:text-sky-400 font-semibold">
                      {row.inProgress}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                      {row.completed}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-rose-600 dark:text-rose-400 font-semibold">
                      {row.pendingFailed}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-semibold">
                      {row.activeInstallers} Teknisi
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-16 bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full rounded-full"
                            style={{ width: `${row.completionRate}%` }}
                          />
                        </div>
                        <span className="font-mono font-bold text-[11px] text-slate-700 dark:text-slate-300 w-8 text-right">
                          {row.completionRate}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW B: COVERAGE AREA WORKLOADS */}
      {activeTab === 'coverage_areas' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {areaRows.map(row => (
              <div
                key={row.area.id}
                className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-3 text-xs"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h5 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span>{row.area.name}</span>
                    </h5>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      {row.area.clusters.length} Cluster Layanan
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    {row.total} WO
                  </span>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>Penyelesaian Area</span>
                    <span className="font-mono font-semibold">
                      {row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden flex">
                    <div
                      className="bg-emerald-500 h-full"
                      style={{ width: `${row.total > 0 ? (row.completed / row.total) * 100 : 0}%` }}
                      title="Selesai"
                    />
                    <div
                      className="bg-sky-500 h-full"
                      style={{ width: `${row.total > 0 ? (row.active / row.total) * 100 : 0}%` }}
                      title="Dalam Pengerjaan"
                    />
                    <div
                      className="bg-amber-500 h-full"
                      style={{ width: `${row.total > 0 ? (row.pending / row.total) * 100 : 0}%` }}
                      title="Antrean / Tertunda"
                    />
                  </div>
                </div>

                {/* Status Breakdown Chips */}
                <div className="grid grid-cols-3 gap-2 text-center text-[11px] pt-1">
                  <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <span className="text-slate-400 block text-[10px]">Selesai</span>
                    <span className="font-mono font-bold text-emerald-600">{row.completed}</span>
                  </div>
                  <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <span className="text-slate-400 block text-[10px]">Pengerjaan</span>
                    <span className="font-mono font-bold text-sky-600">{row.active}</span>
                  </div>
                  <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <span className="text-slate-400 block text-[10px]">Antrean</span>
                    <span className="font-mono font-bold text-amber-600">{row.pending}</span>
                  </div>
                </div>

                {/* Covered Clusters preview */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[10.5px] text-slate-400 uppercase font-semibold block mb-1">Cluster:</span>
                  <div className="flex flex-wrap gap-1">
                    {row.area.clusters.map(cluster => (
                      <span key={cluster} className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-400">
                        {cluster}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Assigned Contractors */}
                <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1">
                  <span>Kontraktor:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {row.contractors.map(c => c.code).join(', ') || 'Belum ada'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
