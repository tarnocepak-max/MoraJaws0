import React, { useState, useMemo } from 'react';
import { Ticket, ColumnConfig } from '../../types/index.ts';
import { useApp } from '../../context/AppContext';
import { useUIConfig } from '../../context/UIConfigContext';
import { StatusAgentBadge, StatusInstallerBadge, StatusWhatsAppBadge, StatusApprovalBadge } from '../common/Badge';
import { TicketMobileCard } from './TicketMobileCard';
import {
  Search,
  Filter,
  SlidersHorizontal,
  LayoutGrid,
  Download,
  Eye,
  MessageSquare,
  Archive,
  RotateCcw,
  CheckSquare,
  Square,
  ChevronDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MoreVertical,
  UserCheck,
  Smartphone,
  Monitor,
  Table as TableIcon,
  Trash2,
  Layers,
  ShieldAlert,
  Calendar,
  AlertTriangle,
  X,
  Lock,
  MessageCircle,
  MapPin,
  RefreshCw,
  Ticket as TicketIcon,
  Sparkles,
  CalendarCheck,
  ClockAlert
} from 'lucide-react';
import { useAnimation } from '../../context/AnimationContext';
import { useToast } from '../../context/ToastContext';
import { openCustomerAddressInGoogleMaps } from '../../services/mapsService';
import { ManagementDataDeleteModal } from '../portals/ManagementDataDeleteModal';
import {
  parseAppointmentDate,
  getJakartaDateString,
  getJakartaDateParts,
  getTicketAppointmentDate,
  formatAppointmentDateDisplay
} from '../../services/appointmentDateParser';
import {
  getTicketWODate,
  getJakartaDateRange,
  getTodayWORange,
  getLeaderWORange,
  classifyTicketWODateTag,
  getWODateTagLabel,
  formatIndonesianWODate,
  executeSuperadminDispatchSearch,
  CrossDateSearchResult
} from '../../services/woDateFilterEngine';
import { getNextSortDirection, sortDataArray, SortDirection } from '../../utils/tableSorting';

interface TicketsTableProps {
  onSelectTicket: (ticket: Ticket, defaultTab?: 'overview' | 'report' | 'chat' | 'history') => void;
  onOpenWhatsApp: (ticket: Ticket) => void;
}

export const TicketsTable: React.FC<TicketsTableProps> = ({ onSelectTicket, onOpenWhatsApp }) => {
  const { tickets, currentUser, archiveTicket, restoreTicket, assignTicketPersonnel, leadersList, installersList, bulkDeleteTickets, getTicketUnreadCount } = useApp();
  const { config, setColumnVisibility, applyPreset, isMobileView, updateAndroidSettings } = useUIConfig();
  const { triggerRefresh } = useAnimation();
  const { toast } = useToast();

  // Layout mode: 'cards' or 'table'
  const [layoutMode, setLayoutMode] = useState<'cards' | 'table' | 'auto'>('auto');

  const effectiveLayout: 'cards' | 'table' =
    layoutMode === 'auto'
      ? (isMobileView || config.device?.android?.layoutType === 'cards' ? 'cards' : 'table')
      : layoutMode;

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedArea, setSelectedArea] = useState('ALL');
  const [selectedAgentStatus, setSelectedAgentStatus] = useState('ALL');
  const [selectedInstallerStatus, setSelectedInstallerStatus] = useState('ALL');
  const [selectedWhatsAppStatus, setSelectedWhatsAppStatus] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedApprovalStatus, setSelectedApprovalStatus] = useState('ALL');
  const [showArchived, setShowArchived] = useState(false);

  // Requirement 1: Ticket indicators strictly calculate WO with Appointment Date = Today (Asia/Jakarta)
  const todayWIB = useMemo(() => getJakartaDateString(0), []);

  // Approval status counts across today's tickets
  const approvalCounts = useMemo(() => {
    let butuhApproval = 0;
    let approved = 0;
    let rejected = 0;
    let closed = 0;
    let totalToday = 0;
    tickets.forEach(t => {
      if (t.isArchived || t.isDeleted) return;
      const appDate = getTicketAppointmentDate(t);
      if (appDate !== todayWIB) return;
      totalToday++;
      if (t.approvalStatus === 'BUTUH APPROVAL') butuhApproval++;
      if (t.approvalStatus === 'APPROVED') approved++;
      if (t.approvalStatus === 'REJECTED') rejected++;
      if (t.statusWOAgent === 'Closed') closed++;
    });
    return { butuhApproval, approved, rejected, closed, totalToday };
  }, [tickets, todayWIB]);

  // Dynamic Ticket Categories from database
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    tickets.forEach(t => {
      if (t.ticketCategory && typeof t.ticketCategory === 'string' && t.ticketCategory.trim()) {
        cats.add(t.ticketCategory.trim());
      }
    });
    return Array.from(cats).sort();
  }, [tickets]);

  // Today's Date in Asia/Jakarta (WIB) with automatic midnight 00:00 rollover
  const [currentDateKey, setCurrentDateKey] = useState<string>(() => getTodayWORange());

  // Automatic midnight rollover listener (checks every 15 seconds)
  React.useEffect(() => {
    const timer = setInterval(() => {
      const liveToday = getTodayWORange();
      if (liveToday !== currentDateKey) {
        setCurrentDateKey(liveToday);
        triggerRefresh(undefined, 'PERGANTIAN HARI (00:00 WIB)', 'Memperbarui otomatis daftar Work Order hari ini');
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [currentDateKey, triggerRefresh]);

  // Leader tab: 'today' (Hari Ini) or 'tomorrow' (Besok)
  const [leaderDateTab, setLeaderDateTab] = useState<'today' | 'tomorrow'>('today');

  // Cross-date search for Superadmin and Dispatch (strictly by woNumber or idCustomer)
  const isCrossDateSearchEligible = currentUser.role === 'super_admin' || currentUser.role === 'dispatch';

  const crossDateSearchResults = useMemo(() => {
    if (isCrossDateSearchEligible && searchTerm.trim()) {
      return executeSuperadminDispatchSearch(searchTerm, tickets);
    }
    return { isSearchActive: false, results: [], resultTickets: [], crossDateCount: 0 };
  }, [isCrossDateSearchEligible, searchTerm, tickets]);

  const isCrossDateActive = crossDateSearchResults.isSearchActive;

  // Chat Unread Filter (Super Admin, Dispatch, Installer)
  const [filterUnreadChatOnly, setFilterUnreadChatOnly] = useState(false);

  // 3-State Sorting state (Requirement 3: asc -> desc -> null)
  const [sortField, setSortField] = useState<string>('updatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Multi-selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [bulkInstaller, setBulkInstaller] = useState('');
  const [ticketToDelete, setTicketToDelete] = useState<Ticket | null>(null);

  // Super Admin Bulk Delete State
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleteReason, setBulkDeleteReason] = useState('');
  const [bulkDeleteConfirmText, setBulkDeleteConfirmText] = useState('');
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);

  // Column manager popover
  const [showColManager, setShowColManager] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | 'ALL'>(config.ticketsTable.rowsPerPage || 10);

  // Active columns sorted by order
  const activeColumns = useMemo(() => {
    return [...config.ticketsTable.columns]
      .filter(col => col.visible)
      .sort((a, b) => a.order - b.order);
  }, [config.ticketsTable.columns]);

  // Unique areas (scoped for Leader and Installer)
  const areas = useMemo(() => {
    if ((currentUser.role === 'leader' || currentUser.role === 'installer') && currentUser.area) {
      return [currentUser.area];
    }
    const set = new Set(tickets.map(t => t.area).filter(Boolean));
    return Array.from(set);
  }, [tickets, currentUser.role, currentUser.area]);

  // Unique Ticket Categories for filtering & search
  const ticketCategories = useMemo(() => {
    const set = new Set(tickets.map(t => t.ticketCategory).filter(Boolean));
    return Array.from(set).sort();
  }, [tickets]);

  // Total unread chat count across tickets
  const totalUnreadAcrossTickets = useMemo(() => {
    return tickets.reduce((acc, t) => acc + (getTicketUnreadCount(t.id) > 0 ? 1 : 0), 0);
  }, [tickets, getTicketUnreadCount]);

  // Distinct Appointment Dates from tickets for quick chips
  const availableAppointmentDates = useMemo(() => {
    const set = new Set<string>();
    tickets.forEach(t => {
      const raw = t.appointmentDate;
      if (raw) {
        const parsed = parseAppointmentDate(raw);
        if (parsed.date) set.add(parsed.date);
      }
    });
    return Array.from(set).sort();
  }, [tickets]);

  // Leader counts for today and tomorrow WOs
  const { todayLeaderCount, tomorrowLeaderCount } = useMemo(() => {
    if (currentUser?.role !== 'leader') return { todayLeaderCount: 0, tomorrowLeaderCount: 0 };
    const todayStr = currentDateKey || getTodayWORange();
    const leaderDates = getLeaderWORange();

    const currentLeaderName = (currentUser.name || '').trim().toLowerCase();
    const currentLeaderArea = (currentUser.area || '').trim().toLowerCase();
    const currentLeaderContractor = (currentUser.contractor || '').trim().toLowerCase();

    let tCount = 0;
    let tmrCount = 0;

    (tickets || []).forEach(t => {
      if (!t || t.isArchived || t.isDeleted) return;
      const tLeader = (t.leaderName || '').trim().toLowerCase();
      if (tLeader && currentLeaderName && tLeader !== currentLeaderName) return;
      if (currentLeaderArea && t.area && t.area.trim().toLowerCase() !== currentLeaderArea) return;
      const tCont = (t.contactorName || t.contractorName || '').trim().toLowerCase();
      if (currentLeaderContractor && tCont && tCont !== currentLeaderContractor) return;

      const wDate = getTicketWODate(t);
      if (wDate === todayStr) tCount++;
      else if (wDate === leaderDates.tomorrow) tmrCount++;
    });

    return { todayLeaderCount: tCount, tomorrowLeaderCount: tmrCount };
  }, [tickets, currentUser, currentDateKey]);

  // Filtering based on strict WO Date rules per role
  const filteredTickets = useMemo(() => {
    const todayStr = currentDateKey || getTodayWORange();
    const leaderDates = getLeaderWORange();

    // 1. Cross-Date Search Active for Superadmin or Dispatch
    // Allows searching past, today, and future dates ONLY by woNumber or idCustomer
    if (isCrossDateActive) {
      return crossDateSearchResults.resultTickets.filter(t => {
        if (!t || t.isDeleted) return false;
        if (showArchived ? !t.isArchived : t.isArchived) return false;
        if (filterUnreadChatOnly && getTicketUnreadCount(t.id) === 0) return false;
        if (selectedArea !== 'ALL' && t.area !== selectedArea) return false;
        if (selectedAgentStatus !== 'ALL' && t.statusWOAgent !== selectedAgentStatus) return false;
        if (selectedInstallerStatus !== 'ALL' && t.statusWOInstaller !== selectedInstallerStatus) return false;
        if (selectedWhatsAppStatus !== 'ALL' && t.statusWhatsApp !== selectedWhatsAppStatus) return false;
        if (selectedCategory !== 'ALL' && t.ticketCategory !== selectedCategory) return false;
        return true;
      });
    }

    // 2. Default View: STRICT WO DATE per role (NOT Appointment Date)
    return (tickets || []).filter(t => {
      if (!t || t.isDeleted) return false;
      if (showArchived ? !t.isArchived : t.isArchived) return false;

      // Primary criteria: authentic Work Order Date
      const woDate = getTicketWODate(t);

      // A. Staff (management_data / general staff): ONLY today's WO
      if (currentUser?.role === 'management_data') {
        if (!woDate || woDate !== todayStr) return false;
      }
      // B. Super Admin & Dispatch: Default ONLY today's WO
      else if (currentUser?.role === 'super_admin' || currentUser?.role === 'dispatch') {
        if (!woDate || woDate !== todayStr) return false;
      }
      // C. Leader: Today's WO (main view) and Tomorrow's WO (via tab), NEVER yesterday
      else if (currentUser?.role === 'leader') {
        if (!woDate) return false;
        if (leaderDateTab === 'today' && woDate !== todayStr) return false;
        if (leaderDateTab === 'tomorrow' && woDate !== leaderDates.tomorrow) return false;

        // Leader contractor/area scoping
        const currentLeaderName = (currentUser.name || '').trim().toLowerCase();
        const currentLeaderArea = (currentUser.area || '').trim().toLowerCase();
        const currentLeaderContractor = (currentUser.contractor || '').trim().toLowerCase();

        const tLeader = (t.leaderName || '').trim().toLowerCase();
        if (tLeader && currentLeaderName && tLeader !== currentLeaderName) return false;

        if (currentLeaderArea) {
          const tArea = (t.area || '').trim().toLowerCase();
          if (tArea && tArea !== currentLeaderArea) return false;
        }

        if (currentLeaderContractor) {
          const tCont = (t.contactorName || t.contractorName || '').trim().toLowerCase();
          if (tCont && tCont !== currentLeaderContractor) return false;
        }
      }
      // D. Installer: ONLY today's WO assigned to this technician
      else if (currentUser?.role === 'installer') {
        if (!woDate || woDate !== todayStr) return false;

        const currentInstallerName = (currentUser.name || '').trim().toLowerCase();
        const currentInstallerPhone = (currentUser.phone || '').trim();
        const currentInstallerArea = (currentUser.area || '').trim().toLowerCase();

        const tInstaller = (t.installerName || '').trim().toLowerCase();
        const tContact = (t.installerContact || '').trim();
        const cleanMyName = currentInstallerName.replace(/\(.*?\)/g, '').trim();

        const isAssignedToMe =
          Boolean(tInstaller && (tInstaller === currentInstallerName || tInstaller === cleanMyName || tInstaller.includes(cleanMyName) || cleanMyName.includes(tInstaller))) ||
          Boolean(tContact && currentInstallerPhone && tContact.replace(/\D/g, '') === currentInstallerPhone.replace(/\D/g, ''));
        
        if (!isAssignedToMe) return false;

        if (currentInstallerArea) {
          const tArea = (t.area || '').trim().toLowerCase();
          if (tArea && tArea !== currentInstallerArea) return false;
        }
      }

      // Unread Chat Filter
      if (filterUnreadChatOnly && getTicketUnreadCount(t.id) === 0) return false;

      // Status filters
      if (selectedArea !== 'ALL' && t.area !== selectedArea) return false;
      if (selectedAgentStatus !== 'ALL' && t.statusWOAgent !== selectedAgentStatus) return false;
      if (selectedInstallerStatus !== 'ALL' && t.statusWOInstaller !== selectedInstallerStatus) return false;
      if (selectedWhatsAppStatus !== 'ALL' && t.statusWhatsApp !== selectedWhatsAppStatus) return false;
      if (selectedCategory !== 'ALL' && t.ticketCategory !== selectedCategory) return false;

      // Approval Status filter (Dispatch & Super Admin workflow)
      if (selectedApprovalStatus !== 'ALL') {
        if (selectedApprovalStatus === 'CLOSED') {
          if (t.statusWOAgent !== 'Closed') return false;
        } else if (t.approvalStatus !== selectedApprovalStatus) {
          return false;
        }
      }

      // Search term for non-cross-date searches (e.g. Staff, Leader, Installer)
      // Strictly scoped within their allowed date view
      if (searchTerm && typeof searchTerm === 'string' && searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const matchWo = (t.woNumber ? String(t.woNumber).toLowerCase() : '').includes(q);
        const matchCust = (t.customerName ? String(t.customerName).toLowerCase() : '').includes(q);
        const matchId = (t.idCustomer ? String(t.idCustomer).toLowerCase() : '').includes(q);
        const matchPhone = String(t.customerPhone || '').includes(q);
        const matchInstaller = (t.installerName ? String(t.installerName).toLowerCase() : '').includes(q);
        const matchCluster = (t.clusterName ? String(t.clusterName).toLowerCase() : '').includes(q);
        const matchCategory = (t.ticketCategory ? String(t.ticketCategory).toLowerCase() : '').includes(q);
        if (!matchWo && !matchCust && !matchId && !matchPhone && !matchInstaller && !matchCluster && !matchCategory) {
          return false;
        }
      }

      return true;
    });
  }, [
    tickets,
    showArchived,
    isCrossDateActive,
    crossDateSearchResults,
    currentDateKey,
    leaderDateTab,
    currentUser,
    filterUnreadChatOnly,
    getTicketUnreadCount,
    selectedArea,
    selectedAgentStatus,
    selectedInstallerStatus,
    selectedWhatsAppStatus,
    selectedCategory,
    selectedApprovalStatus,
    searchTerm
  ]);

  // Sorting with Natural Collation & 3-state support (Ascending -> Descending -> Unsorted)
  const sortedTickets = useMemo(() => {
    if (!sortDirection) return filteredTickets;
    return sortDataArray(filteredTickets, { column: sortField, direction: sortDirection }, (item, col) => {
      if (col === 'woNumber') return item.woNumber;
      if (col === 'date' || col === 'appointmentDate') return item.appointmentDate || '';
      if (col === 'statusWOInstaller') return item.statusWOInstaller;
      if (col === 'statusWOAgent') return item.statusWOAgent;
      if (col === 'slotTime') return item.slotTime;
      return (item as any)[col];
    });
  }, [filteredTickets, sortField, sortDirection]);

  const effectiveRowsPerPage = pageSize === 'ALL' ? (sortedTickets.length || 10) : pageSize;

  // Paginated rows
  const paginatedTickets = useMemo(() => {
    if (pageSize === 'ALL') return sortedTickets;
    const startIndex = (currentPage - 1) * effectiveRowsPerPage;
    return sortedTickets.slice(startIndex, startIndex + effectiveRowsPerPage);
  }, [sortedTickets, currentPage, effectiveRowsPerPage, pageSize]);

  const totalPages = pageSize === 'ALL' ? 1 : (Math.ceil(sortedTickets.length / effectiveRowsPerPage) || 1);

  const handleSort = (fieldKey: string) => {
    const nextDir = getNextSortDirection(sortField, sortDirection, fieldKey);
    setSortField(nextDir ? fieldKey : 'updatedAt');
    setSortDirection(nextDir);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === paginatedTickets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedTickets.map(t => t.id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApplyBulkAssign = () => {
    if (currentUser.role !== 'leader') {
      alert('Akses Ditolak: Hanya Leader yang berwenang menugaskan WO ke teknisi.');
      return;
    }
    if (!bulkInstaller) {
      alert('Pilih teknisi terlebih dahulu.');
      return;
    }
    selectedIds.forEach(id => {
      assignTicketPersonnel(id, currentUser.name, bulkInstaller);
    });
    setSelectedIds(new Set());
    setShowBulkAssign(false);
  };

  const handleExportCSV = () => {
    const headers = activeColumns.map(c => `"${c.label}"`).join(',');
    const rows = sortedTickets.map(t => {
      return activeColumns
        .map(col => {
          const val = (t as any)[col.key] || '';
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(',');
    });
    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Tickets_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Density styles
  const densityClass =
    config.ticketsTable.density === 'compact'
      ? 'py-1.5 px-3 text-xs'
      : config.ticketsTable.density === 'spacious'
      ? 'py-3.5 px-4 text-sm'
      : 'py-2.5 px-3.5 text-xs';

  return (
    <div className="space-y-4">
      {/* TICKET MYREPUBLIC Official Page Header */}
      <div className="bg-white dark:bg-[#1a0f30] rounded-2xl border-2 border-[#D8CCF3] dark:border-[#3B1D78] p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#5B35B1] text-white flex items-center justify-center font-bold shadow-xs shrink-0">
            <TicketIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-[#3B1D78] dark:text-purple-200">
                TICKET MYREPUBLIC
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E9E1FF] text-[#3B1D78] dark:bg-[#3B1D78] dark:text-[#E9E1FF] border border-[#D8CCF3] dark:border-[#5B35B1]">
                {filteredTickets.length} Work Order
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                Live Firestore Active
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Pusat pelacakan tiket gangguan, instalasi baru FTTH, penugasan teknisi, dan pemantauan pengerjaan lapangan MyRepublic.
            </p>
          </div>
        </div>
      </div>

      {/* Table Toolbar Area */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3">
        {/* Top Controls Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={
                isCrossDateSearchEligible
                  ? "Cari Nomor WO atau ID Pelanggan (Pencarian Lintas Tanggal)..."
                  : "Cari WO Hari Ini (Nomor WO atau ID Pelanggan)..."
              }
              value={searchTerm}
              onChange={e => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 font-medium"
            />
          </div>

          {/* Action buttons & Presets */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* View Presets Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 font-medium hidden sm:inline">Preset:</span>
              <select
                value={config.ticketsTable.activePresetId || ''}
                onChange={e => applyPreset(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-200 font-medium"
              >
                {config.ticketsTable.presets.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* View Layout Switcher (Table PC vs Kartu HP) */}
            <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800">
              <button
                onClick={() => setLayoutMode('table')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                  effectiveLayout === 'table'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Tampilan Tabel Grid (Optimal untuk PC / Laptop)"
              >
                <Monitor className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tabel PC</span>
              </button>
              <button
                onClick={() => setLayoutMode('cards')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                  effectiveLayout === 'cards'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Tampilan Kartu Nyaman (Optimal untuk Android / HP)"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Kartu HP</span>
              </button>
            </div>

            {/* MoraJaws Luxury Refresh Button */}
            <button
              onClick={async () => {
                await triggerRefresh(undefined, 'MEMPERBARUI WORK ORDER...', 'Menyelaraskan data tabel tiket dan jadwal appointment');
                toast.sync('Tabel Work Order berhasil diperbarui.');
              }}
              className="px-2.5 py-1.5 text-xs font-semibold text-[#D8B4FE] bg-[#35105E]/40 hover:bg-[#7135B5]/60 hover:text-white rounded-md border border-[#D8B4FE]/30 flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              title="Refresh tabel tiket & sinkronkan data"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>

            {/* Export CSV */}
            <button
              onClick={handleExportCSV}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export</span>
            </button>

            {/* Archive Filter Toggle */}
            <button
              onClick={() => {
                setShowArchived(!showArchived);
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors flex items-center gap-1.5 ${
                showArchived
                  ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              <span>{showArchived ? 'Viewing Archived' : 'Archived'}</span>
            </button>

            {/* Chat Unread Action Filter (Super Admin, Dispatch, Installer only) */}
            {['super_admin', 'dispatch', 'installer'].includes(currentUser.role) && (
              <button
                onClick={() => {
                  setFilterUnreadChatOnly(prev => !prev);
                  setCurrentPage(1);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all border ${
                  filterUnreadChatOnly
                    ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                    : totalUnreadAcrossTickets > 0
                    ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900/60 hover:bg-rose-100'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100'
                }`}
                title="Filter tiket dengan pesan live chat belum dibaca"
              >
                <MessageCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                <span>Chat Unread</span>
                {totalUnreadAcrossTickets > 0 && (
                  <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-bold ${
                    filterUnreadChatOnly ? 'bg-white text-rose-600' : 'bg-rose-600 text-white'
                  }`}>
                    {totalUnreadAcrossTickets}
                  </span>
                )}
              </button>
            )}

            {/* Column Visibility Manager Button (Posisi Kanan) */}
            <div className="relative ml-auto">
              <button
                onClick={() => setShowColManager(!showColManager)}
                className="px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-md border border-indigo-200 dark:border-indigo-800 flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                title="Atur Visibilitas Kolom Tabel"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Columns ({activeColumns.length})</span>
              </button>

              {/* Column manager dropdown */}
              {showColManager && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowColManager(false)} />
                  <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-3 z-50 text-xs">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-700">
                      <span className="font-semibold text-slate-900 dark:text-white">Setting Kolom Tabel</span>
                      <button
                        onClick={() => setShowColManager(false)}
                        className="text-slate-400 hover:text-slate-600 text-xs"
                      >
                        Tutup
                      </button>
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                      {config.ticketsTable.columns.map(col => (
                        <label
                          key={col.key}
                          className="flex items-center justify-between p-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded cursor-pointer"
                        >
                          <span className="text-slate-700 dark:text-slate-300">{col.label}</span>
                          <input
                            type="checkbox"
                            checked={col.visible}
                            onChange={e => setColumnVisibility(col.key, e.target.checked)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Cross-Date Search Banner (Super Admin & Dispatch) */}
        {isCrossDateActive && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-purple-50 dark:bg-[#2A174E] border border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-200 text-xs shadow-2xs">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
              <span>
                <strong>Mode Pencarian Lintas Tanggal Aktif:</strong> Ditemukan <strong>{filteredTickets.length}</strong> WO untuk kueri "{searchTerm}" (Hanya Nomor WO & ID Pelanggan).
                {crossDateSearchResults.crossDateCount > 0 && (
                  <span className="ml-1 text-purple-700 dark:text-purple-300">
                    ({crossDateSearchResults.crossDateCount} WO di luar tanggal hari ini)
                  </span>
                )}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setCurrentPage(1);
              }}
              className="px-2.5 py-1 bg-purple-200 dark:bg-purple-900/60 hover:bg-purple-300 dark:hover:bg-purple-800 text-purple-900 dark:text-purple-100 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors self-start sm:self-auto cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reset (Kembali ke Hari Ini)</span>
            </button>
          </div>
        )}

        {/* Leader Tab Switcher */}
        {currentUser.role === 'leader' && (
          <div className="flex items-center gap-2 p-2 bg-[#F2EBFE] dark:bg-[#251545] rounded-xl border border-[#D8CCF3] dark:border-[#4B238E] text-xs">
            <span className="text-[#5B35B1] dark:text-[#D8CCF3] px-2 text-[11px] font-bold">Periode WO Leader:</span>
            <button
              type="button"
              onClick={() => { setLeaderDateTab('today'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer font-bold ${
                leaderDateTab === 'today'
                  ? 'bg-[#5B35B1] text-white shadow-xs'
                  : 'text-[#5B35B1] dark:text-[#D8CCF3] hover:bg-[#E0D1FC] dark:hover:bg-[#3B1D78]'
              }`}
            >
              <CalendarCheck className="w-3.5 h-3.5" />
              <span>WO Hari Ini ({todayLeaderCount})</span>
            </button>
            <button
              type="button"
              onClick={() => { setLeaderDateTab('tomorrow'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer font-bold ${
                leaderDateTab === 'tomorrow'
                  ? 'bg-[#5B35B1] text-white shadow-xs'
                  : 'text-[#5B35B1] dark:text-[#D8CCF3] hover:bg-[#E0D1FC] dark:hover:bg-[#3B1D78]'
              }`}
            >
              <ClockAlert className="w-3.5 h-3.5" />
              <span>WO Besok ({tomorrowLeaderCount})</span>
            </button>
          </div>
        )}

        {/* Quick Workflow & Approval Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0 mr-1">
            Filter Alur:
          </span>
          <button
            type="button"
            onClick={() => { setSelectedApprovalStatus('ALL'); setCurrentPage(1); }}
            className={`px-3 py-1 rounded-lg font-bold shrink-0 transition-all cursor-pointer ${
              selectedApprovalStatus === 'ALL'
                ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            Semua ({approvalCounts.totalToday})
          </button>
          <button
            type="button"
            onClick={() => { setSelectedApprovalStatus('BUTUH APPROVAL'); setCurrentPage(1); }}
            className={`px-3 py-1 rounded-lg font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedApprovalStatus === 'BUTUH APPROVAL'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 hover:bg-amber-100'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping inline-block" />
            <span>Butuh Approval ({approvalCounts.butuhApproval})</span>
          </button>
          <button
            type="button"
            onClick={() => { setSelectedApprovalStatus('APPROVED'); setCurrentPage(1); }}
            className={`px-3 py-1 rounded-lg font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedApprovalStatus === 'APPROVED'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100'
            }`}
          >
            <span>✓ Approved ({approvalCounts.approved})</span>
          </button>
          <button
            type="button"
            onClick={() => { setSelectedApprovalStatus('REJECTED'); setCurrentPage(1); }}
            className={`px-3 py-1 rounded-lg font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedApprovalStatus === 'REJECTED'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-900 hover:bg-rose-100'
            }`}
          >
            <span>✕ Perlu Revisi ({approvalCounts.rejected})</span>
          </button>
          <button
            type="button"
            onClick={() => { setSelectedApprovalStatus('CLOSED'); setCurrentPage(1); }}
            className={`px-3 py-1 rounded-lg font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedApprovalStatus === 'CLOSED'
                ? 'bg-slate-700 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-slate-200'
            }`}
          >
            <span>🔒 Closed ({approvalCounts.closed})</span>
          </button>
        </div>

        {/* Filters Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          {/* Central Work Order Date Indicator */}
          <div className="col-span-2 sm:col-span-1 lg:col-span-2 bg-[#E9E1FF]/60 dark:bg-[#3B1D78]/30 p-2 rounded-md border border-[#D8CCF3] dark:border-[#5B35B1]/50">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-[#3B1D78] dark:text-[#E9E1FF] flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#5B35B1]" />
                <span>Tanggal WO Aktif:</span>
              </label>
              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-[#5B35B1] text-white">
                {isCrossDateActive
                  ? 'Lintas Tanggal'
                  : currentUser.role === 'leader'
                  ? (leaderDateTab === 'today' ? 'Hari Ini' : 'Besok')
                  : 'Hari Ini'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-1 text-xs">
              <span className="font-semibold text-slate-800 dark:text-white">
                {isCrossDateActive
                  ? `Hasil Pencarian (${filteredTickets.length} WO)`
                  : formatIndonesianWODate(currentUser.role === 'leader' && leaderDateTab === 'tomorrow' ? getLeaderWORange().tomorrow : currentDateKey)}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                WIB (Asia/Jakarta)
              </span>
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 mb-0.5">Area</label>
            <select
              value={selectedArea}
              onChange={e => {
                setSelectedArea(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-700 dark:text-slate-300"
            >
              <option value="ALL">All Areas</option>
              {areas.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 mb-0.5 font-semibold text-indigo-700 dark:text-indigo-400">
              Kategori Tiket
            </label>
            <select
              value={selectedCategory}
              onChange={e => {
                setSelectedCategory(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 rounded text-slate-800 dark:text-slate-200 font-medium"
            >
              <option value="ALL">Semua Kategori ({ticketCategories.length})</option>
              {ticketCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 mb-0.5">Status Installer</label>
            <select
              value={selectedInstallerStatus}
              onChange={e => {
                setSelectedInstallerStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-700 dark:text-slate-300"
            >
              <option value="ALL">All Status</option>
              <option value="Unassigned">Unassigned</option>
              <option value="Assigned">Assigned</option>
              <option value="En Route">En Route</option>
              <option value="On Site">On Site</option>
              <option value="Installed">Installed</option>
              <option value="Completed">Completed</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-amber-600 dark:text-amber-400 mb-0.5 font-bold">
              Status Approval
            </label>
            <select
              value={selectedApprovalStatus}
              onChange={e => {
                setSelectedApprovalStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2 py-1 text-xs bg-amber-50/60 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700/60 rounded text-slate-800 dark:text-slate-200 font-semibold"
            >
              <option value="ALL">Semua Approval</option>
              <option value="BUTUH APPROVAL">⚠️ Butuh Approval ({approvalCounts.butuhApproval})</option>
              <option value="APPROVED">✓ Approved ({approvalCounts.approved})</option>
              <option value="REJECTED">✕ Perlu Revisi ({approvalCounts.rejected})</option>
              <option value="CLOSED">🔒 Closed ({approvalCounts.closed})</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 mb-0.5">Status WO Agent</label>
            <select
              value={selectedAgentStatus}
              onChange={e => {
                setSelectedAgentStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-700 dark:text-slate-300"
            >
              <option value="ALL">All Agent Status</option>
              <option value="Pending">Pending</option>
              <option value="Assigned">Assigned</option>
              <option value="In Progress">In Progress</option>
              <option value="Resolved">Resolved</option>
            </select>
          </div>
        </div>

        {/* Bulk Action Bar when rows selected */}
        {selectedIds.size > 0 && (
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900 rounded-md flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-indigo-900 dark:text-indigo-200">
              {selectedIds.size} tiket terpilih
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {currentUser.role === 'leader' ? (
                <>
                  <select
                    value={bulkInstaller}
                    onChange={e => setBulkInstaller(e.target.value)}
                    className="px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 rounded text-slate-800 dark:text-slate-200"
                  >
                    <option value="">Pilih Teknisi...</option>
                    {installersList.map(inst => (
                      <option key={inst} value={inst}>{inst}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleApplyBulkAssign}
                    className="px-3 py-1 font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded cursor-pointer transition-colors shadow-2xs"
                  >
                    Assign Teknisi
                  </button>
                </>
              ) : currentUser.role !== 'super_admin' ? (
                <div className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-950/50 px-2.5 py-1 rounded border border-amber-200 dark:border-amber-800 flex items-center gap-1 font-medium">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                  <span>Hanya Leader yang dapat menugaskan WO ke teknisi</span>
                </div>
              ) : null}

              {/* Management Data Bulk Delete Button */}
              {currentUser.role === 'management_data' && (
                <button
                  onClick={() => {
                    setBulkDeleteReason('');
                    setBulkDeleteConfirmText('');
                    setBulkDeleteError(null);
                    setShowBulkDeleteModal(true);
                  }}
                  className="px-3 py-1 font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded cursor-pointer flex items-center gap-1.5 transition-colors shadow-2xs"
                  title="Hapus Semua WO Terpilih (Khusus Management Data)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus ({selectedIds.size}) WO</span>
                </button>
              )}

              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-2 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Dynamic Table or Mobile Cards */}
      {effectiveLayout === 'cards' ? (
        <div className="space-y-3">
          {/* Mobile Card Action Bar */}
          <div className="flex items-center justify-between px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
            <button
              onClick={handleSelectAll}
              className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300 hover:text-indigo-600 min-h-[36px]"
            >
              {selectedIds.size === paginatedTickets.length && paginatedTickets.length > 0 ? (
                <CheckSquare className="w-4 h-4 text-indigo-600" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>Pilih Semua Halaman ({paginatedTickets.length})</span>
            </button>
            <span className="text-[11px] text-slate-500 font-medium">
              Mode: Kartu Nyaman HP 📱
            </span>
          </div>

          {paginatedTickets.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 py-12 text-center text-slate-400 text-xs">
              Tidak ada tiket Work Order yang cocok dengan filter pencarian.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {paginatedTickets.map(ticket => (
                <TicketMobileCard
                  key={ticket.id}
                  ticket={ticket}
                  isSelected={selectedIds.has(ticket.id)}
                  onToggleSelect={handleToggleSelect}
                  onSelectTicket={onSelectTicket}
                  onOpenWhatsApp={onOpenWhatsApp}
                />
              ))}
            </div>
          )}

          {/* Pagination Bar for Cards */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-500 shadow-2xs">
            <div className="flex flex-wrap items-center gap-2">
              <span>
                Menampilkan <span className="font-semibold text-slate-700 dark:text-slate-300">{sortedTickets.length === 0 ? 0 : (currentPage - 1) * effectiveRowsPerPage + 1}</span> -{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-300">{Math.min(currentPage * effectiveRowsPerPage, sortedTickets.length)}</span> dari{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-300">{sortedTickets.length}</span> tiket
              </span>

              <div className="flex items-center gap-1.5 ml-1 pl-2 border-l border-slate-200 dark:border-slate-700">
                <select
                  value={pageSize === 'ALL' ? 'ALL' : String(pageSize)}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPageSize(val === 'ALL' ? 'ALL' : Number(val));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-700 dark:text-slate-200"
                >
                  <option value="10">10 / hal</option>
                  <option value="25">25 / hal</option>
                  <option value="50">50 / hal</option>
                  <option value="100">100 / hal</option>
                  <option value="ALL">Semua ({sortedTickets.length})</option>
                </select>
                {pageSize !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => {
                      setPageSize('ALL');
                      setCurrentPage(1);
                    }}
                    className="px-2 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded transition-colors"
                  >
                    Lihat Semua
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                disabled={currentPage === 1 || pageSize === 'ALL'}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 min-h-[36px]"
              >
                Sebelumnya
              </button>
              <span className="px-2 font-semibold text-slate-700 dark:text-slate-300">
                {pageSize === 'ALL' ? 'Semua' : `${currentPage} / ${totalPages || 1}`}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages || totalPages === 0 || pageSize === 'ALL'}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 min-h-[36px]"
              >
                Selanjutnya
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Dynamic PC Table Grid */
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto min-h-[300px]">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  {/* Select All Checkbox - Fixed sticky left-0 */}
                  <th className="py-2.5 px-3 w-10 text-center sticky left-0 bg-slate-50 dark:bg-slate-800 z-20 border-r border-slate-200 dark:border-slate-800">
                    <button onClick={handleSelectAll} className="text-slate-400 hover:text-slate-600">
                      {selectedIds.size === paginatedTickets.length && paginatedTickets.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-indigo-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>

                {/* Dynamically configured headers */}
                {activeColumns.map(col => {
                  const isSorted = sortField === col.key;
                  const isLeftSticky = col.sticky === 'left' || col.key === 'woNumber';
                  const isRightSticky = col.sticky === 'right' || col.key === 'actions';

                  return (
                    <th
                      key={col.key}
                      style={{ width: col.width ? `${col.width}px` : undefined }}
                      className={`py-2.5 px-3 whitespace-nowrap ${
                        col.sortable ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700' : ''
                      } ${
                        isLeftSticky
                          ? 'sticky left-10 bg-slate-50 dark:bg-slate-800 z-20 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]'
                          : ''
                      } ${
                        isRightSticky
                          ? 'sticky right-0 bg-slate-50 dark:bg-slate-800 z-20 border-l border-slate-200 dark:border-slate-800 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)]'
                          : ''
                      }`}
                      onClick={() => col.sortable && handleSort(col.key)}
                    >
                      <div
                        className="flex items-center gap-1.5"
                        title={col.sortable ? (isSorted && sortDirection ? `Urutan: ${sortDirection.toUpperCase()} (Klik untuk ubah)` : 'Klik untuk mengurutkan') : undefined}
                      >
                        <span>{col.label}</span>
                        {col.sortable && (
                          isSorted && sortDirection === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 text-indigo-600 font-bold shrink-0" />
                          ) : isSorted && sortDirection === 'desc' ? (
                            <ArrowDown className="w-3.5 h-3.5 text-indigo-600 font-bold shrink-0" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400 shrink-0" />
                          )
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-normal">
              {paginatedTickets.length === 0 ? (
                <tr>
                  <td colSpan={activeColumns.length + 1} className="py-12 text-center text-slate-400 text-xs">
                    Tidak ada tiket Work Order yang cocok dengan filter.
                  </td>
                </tr>
              ) : (
                paginatedTickets.map(ticket => {
                  const isSelected = selectedIds.has(ticket.id);
                  const stickyCellBg = isSelected
                    ? 'bg-indigo-50/95 dark:bg-indigo-950/90'
                    : 'bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800';

                  return (
                    <tr
                      key={ticket.id}
                      className={`group hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors ${
                        isSelected ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                      }`}
                    >
                      {/* Row Checkbox - Fixed sticky left-0 */}
                      <td className={`py-2 px-3 text-center sticky left-0 ${stickyCellBg} z-10 border-r border-slate-200 dark:border-slate-800 transition-colors`}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleSelect(ticket.id);
                          }}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-indigo-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* Render Cell Values by Key */}
                      {activeColumns.map(col => {
                        const rawVal = (ticket as any)[col.key];

                        if (col.key === 'actions') {
                          return (
                            <td
                              key={col.key}
                              className={`${densityClass} text-center whitespace-nowrap sticky right-0 ${stickyCellBg} z-10 border-l border-slate-200 dark:border-slate-800 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)] transition-colors`}
                            >
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectTicket(ticket);
                                  }}
                                  className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                                  title="View Detail"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                {/* Chat Action with Unread Badge (Super Admin, Dispatch, Installer only) */}
                                {['super_admin', 'dispatch', 'installer'].includes(currentUser.role) && (() => {
                                  const unread = getTicketUnreadCount(ticket.id);
                                  return (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onSelectTicket(ticket, 'chat');
                                      }}
                                      className={`relative p-1 rounded transition-colors ${
                                        unread > 0
                                          ? 'text-rose-600 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100'
                                          : 'text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/40'
                                      }`}
                                      title={unread > 0 ? `${unread} Chat Belum Dibaca - Buka Live Chat` : 'Buka Live Chat'}
                                    >
                                      <MessageCircle className="w-3.5 h-3.5" />
                                      {unread > 0 && (
                                        <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-0.5 bg-rose-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-xs">
                                          {unread > 9 ? '9+' : unread}
                                        </span>
                                      )}
                                    </button>
                                  );
                                })()}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenWhatsApp(ticket);
                                  }}
                                  className="p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded"
                                  title="WhatsApp Confirmation"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (ticket.isArchived) restoreTicket(ticket.id);
                                    else archiveTicket(ticket.id);
                                  }}
                                  className="p-1 text-slate-400 hover:text-slate-600 rounded"
                                  title={ticket.isArchived ? 'Restore' : 'Archive'}
                                >
                                  {ticket.isArchived ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                                </button>
                                {currentUser.role === 'management_data' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setTicketToDelete(ticket);
                                    }}
                                    className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition-colors"
                                    title="Hapus Work Order (Management Data Only)"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          );
                        }

                        if (col.key === 'woNumber') {
                          return (
                            <td
                              key={col.key}
                              className={`${densityClass} font-mono font-semibold text-indigo-600 dark:text-indigo-400 cursor-pointer hover:underline sticky left-10 bg-white dark:bg-slate-900 z-10 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectTicket(ticket);
                              }}
                            >
                              {ticket.woNumber}
                            </td>
                          );
                        }

                        if (col.key === 'statusWOAgent') {
                          return (
                            <td key={col.key} className={densityClass}>
                              <StatusAgentBadge status={ticket.statusWOAgent} />
                            </td>
                          );
                        }

                        if (col.key === 'statusWOInstaller') {
                          return (
                            <td key={col.key} className={densityClass}>
                              <div className="flex flex-col gap-1 items-start">
                                <StatusInstallerBadge status={ticket.statusWOInstaller} />
                                {ticket.approvalStatus && (
                                  <StatusApprovalBadge status={ticket.approvalStatus} />
                                )}
                              </div>
                            </td>
                          );
                        }

                        if (col.key === 'approvalStatus') {
                          return (
                            <td key={col.key} className={densityClass}>
                              <StatusApprovalBadge status={ticket.approvalStatus} />
                            </td>
                          );
                        }

                        if (col.key === 'statusWhatsApp') {
                          return (
                            <td key={col.key} className={densityClass}>
                              <StatusWhatsAppBadge status={ticket.statusWhatsApp} />
                            </td>
                          );
                        }

                        if (col.key === 'customerPhone') {
                          return (
                            <td key={col.key} className={`${densityClass} font-mono text-slate-600 dark:text-slate-300`}>
                              {ticket.customerPhone || '-'}
                            </td>
                          );
                        }

                        if (col.key === 'idCustomer') {
                          return (
                            <td key={col.key} className={`${densityClass} font-mono text-slate-600 dark:text-slate-300`}>
                              {ticket.idCustomer}
                            </td>
                          );
                        }

                        if (col.key === 'customerAddress' || col.key === 'streetName' || col.key === 'address') {
                          return (
                            <td key={col.key} className={`${densityClass} text-slate-700 dark:text-slate-300 max-w-xs`}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openCustomerAddressInGoogleMaps(ticket);
                                }}
                                className="group flex items-start gap-1.5 text-left text-slate-700 dark:text-slate-200 hover:text-purple-700 dark:hover:text-purple-300 transition-colors cursor-pointer w-full"
                                title="Klik untuk membuka lokasi pelanggan di Google Maps"
                              >
                                <MapPin className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                                <span className="truncate group-hover:underline font-normal text-xs">
                                  {rawVal || (ticket as any).customerAddress || ticket.streetName || '-'}
                                </span>
                              </button>
                            </td>
                          );
                        }

                        if (col.key === 'installerName') {
                          return (
                            <td key={col.key} className={densityClass}>
                              {ticket.installerName ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                  {ticket.installerName}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                  Belum Ditugaskan
                                </span>
                              )}
                            </td>
                          );
                        }

                        return (
                          <td
                            key={col.key}
                            className={`${densityClass} text-slate-700 dark:text-slate-300 ${
                              col.wrapText ? 'break-words max-w-xs' : 'whitespace-nowrap truncate max-w-xs'
                            }`}
                          >
                            {rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '' ? (
                              String(rawVal)
                            ) : (
                              <span className="text-slate-400 italic font-normal">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              Showing <span className="font-semibold text-slate-700 dark:text-slate-300">{sortedTickets.length === 0 ? 0 : (currentPage - 1) * effectiveRowsPerPage + 1}</span> to{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-300">{Math.min(currentPage * effectiveRowsPerPage, sortedTickets.length)}</span> of{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-300">{sortedTickets.length}</span> tickets
            </div>

            <div className="flex items-center gap-1.5 pl-3 border-l border-slate-200 dark:border-slate-700">
              <span className="text-[11px] text-slate-400">View:</span>
              <select
                value={pageSize === 'ALL' ? 'ALL' : String(pageSize)}
                onChange={(e) => {
                  const val = e.target.value;
                  setPageSize(val === 'ALL' ? 'ALL' : Number(val));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="10">10 per page</option>
                <option value="25">25 per page</option>
                <option value="50">50 per page</option>
                <option value="100">100 per page</option>
                <option value="ALL">All ({sortedTickets.length} tickets)</option>
              </select>

              {pageSize !== 'ALL' ? (
                <button
                  type="button"
                  onClick={() => {
                    setPageSize('ALL');
                    setCurrentPage(1);
                  }}
                  className="px-2.5 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded transition-colors border border-indigo-200 dark:border-indigo-800/60"
                >
                  Lihat Semua
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setPageSize(10);
                    setCurrentPage(1);
                  }}
                  className="px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors border border-slate-300 dark:border-slate-600"
                >
                  Batas 10
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
              disabled={currentPage === 1 || pageSize === 'ALL'}
              className="px-2.5 py-1 text-xs font-medium rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="px-2 font-medium text-slate-700 dark:text-slate-300">
              {pageSize === 'ALL' ? `Page 1 of 1 (All ${sortedTickets.length})` : `Page ${currentPage} of ${totalPages}`}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages || totalPages === 0 || pageSize === 'ALL'}
              className="px-2.5 py-1 text-xs font-medium rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Management Data Bulk Delete Confirmation Modal */}
      {showBulkDeleteModal && currentUser.role === 'management_data' && (
        <ManagementDataDeleteModal
          isOpen={showBulkDeleteModal}
          onClose={() => setShowBulkDeleteModal(false)}
          ticket={null}
          selectedTickets={paginatedTickets.filter(t => selectedIds.has(t.id))}
          onSuccess={() => {
            setSelectedIds(new Set());
            setShowBulkDeleteModal(false);
          }}
        />
      )}

      {/* Management Data Single Ticket Delete Confirmation Modal */}
      {ticketToDelete && currentUser.role === 'management_data' && (
        <ManagementDataDeleteModal
          isOpen={Boolean(ticketToDelete)}
          onClose={() => setTicketToDelete(null)}
          ticket={ticketToDelete}
          onSuccess={() => {
            setTicketToDelete(null);
          }}
        />
      )}
    </div>
  );
};
