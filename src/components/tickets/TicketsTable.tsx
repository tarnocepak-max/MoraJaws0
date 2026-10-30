import React, { useState, useMemo } from 'react';
import { Ticket, ColumnConfig } from '../../types/index.ts';
import { useApp } from '../../context/AppContext';
import { useUIConfig } from '../../context/UIConfigContext';
import { StatusAgentBadge, StatusInstallerBadge, StatusWhatsAppBadge } from '../common/Badge';
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
  Ticket as TicketIcon
} from 'lucide-react';
import { useAnimation } from '../../context/AnimationContext';
import { useToast } from '../../context/ToastContext';
import { openCustomerAddressInGoogleMaps } from '../../services/mapsService';
import { SuperAdminDeleteModal } from '../common/SuperAdminDeleteModal';
import {
  parseAppointmentDate,
  getJakartaDateString,
  getJakartaDateParts,
  getTicketAppointmentDate,
  formatAppointmentDateDisplay
} from '../../services/appointmentDateParser';

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
  const [showArchived, setShowArchived] = useState(false);

  // Appointment Date Filter (Default to All so all imported Work Orders are visible)
  const [selectedAppointmentDate, setSelectedAppointmentDate] = useState<string>('');
  const [quickDatePreset, setQuickDatePreset] = useState<'all' | 'today' | 'tomorrow' | 'upcoming' | 'past' | 'invalid' | 'custom'>('all');

  // Chat Unread Filter (Super Admin, Dispatch, Installer)
  const [filterUnreadChatOnly, setFilterUnreadChatOnly] = useState(false);

  // Sorting state
  const [sortField, setSortField] = useState<string>('updatedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

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
      const raw = t.appointmentDate || t.date;
      if (raw) {
        const parsed = parseAppointmentDate(raw);
        if (parsed.date) set.add(parsed.date);
      }
    });
    return Array.from(set).sort();
  }, [tickets]);

  // Filtering
  const filteredTickets = useMemo(() => {
    return (tickets || []).filter(t => {
      if (!t) return false;

      // Archive filter
      if (showArchived ? !t.isArchived : t.isArchived) return false;

      // Role-based scoping: Leader
      // Leader tidak dapat melihat keseluruhan WO leader lain dan area yang berbeda
      if (currentUser?.role === 'leader') {
        const currentLeaderName = (currentUser.name || '').trim().toLowerCase();
        const currentLeaderArea = (currentUser.area || '').trim().toLowerCase();
        const currentLeaderContractor = (currentUser.contractor || '').trim().toLowerCase();

        // Blokir jika WO sudah ditugaskan ke leader lain
        const tLeader = (t.leaderName || '').trim().toLowerCase();
        if (tLeader && currentLeaderName && tLeader !== currentLeaderName) {
          return false;
        }
        // Blokir jika area tiket berbeda dengan area Leader
        if (currentLeaderArea) {
          const tArea = (t.area || '').trim().toLowerCase();
          if (tArea && tArea !== currentLeaderArea) {
            return false;
          }
        }
        // Blokir jika kontraktor tiket berbeda dengan kontraktor Leader
        if (currentLeaderContractor) {
          const tCont = (t.contactorName || t.contractorName || '').trim().toLowerCase();
          if (tCont && tCont !== currentLeaderContractor) {
            return false;
          }
        }
      }

      // Role-based scoping: Teknisi (Installer)
      // Teknisi tidak dapat melihat keseluruhan WO leader/teknisi lain dan area yang berbeda
      if (currentUser?.role === 'installer') {
        const currentInstallerName = (currentUser.name || '').trim().toLowerCase();
        const currentInstallerPhone = (currentUser.phone || '').trim();
        const currentInstallerArea = (currentUser.area || '').trim().toLowerCase();

        const tInstaller = (t.installerName || '').trim().toLowerCase();
        const tContact = (t.installerContact || '').trim();

        const isAssignedToMe =
          (tInstaller && currentInstallerName && tInstaller === currentInstallerName) ||
          (tContact && currentInstallerPhone && tContact === currentInstallerPhone);
        if (!isAssignedToMe) {
          return false;
        }
        // Blokir jika area tiket berbeda dengan area Teknisi
        if (currentInstallerArea) {
          const tArea = (t.area || '').trim().toLowerCase();
          if (tArea && tArea !== currentInstallerArea) {
            return false;
          }
        }
      }

      // Unread Chat Filter (jika tombol aktif)
      if (filterUnreadChatOnly) {
        if (getTicketUnreadCount(t.id) === 0) return false;
      }

      // Status filters
      if (selectedArea !== 'ALL' && t.area !== selectedArea) return false;
      if (selectedAgentStatus !== 'ALL' && t.statusWOAgent !== selectedAgentStatus) return false;
      if (selectedInstallerStatus !== 'ALL' && t.statusWOInstaller !== selectedInstallerStatus) return false;
      if (selectedWhatsAppStatus !== 'ALL' && t.statusWhatsApp !== selectedWhatsAppStatus) return false;
      if (selectedCategory !== 'ALL' && t.ticketCategory !== selectedCategory) return false;

      // Appointment Date filter (Strict Asia/Jakarta WIB calendar date comparison)
      if (quickDatePreset !== 'all' || selectedAppointmentDate) {
        const todayStr = getJakartaDateString(0);
        const tomorrowStr = getJakartaDateString(1);
        const ticketDate = getTicketAppointmentDate(t);

        if (quickDatePreset === 'today') {
          if (!ticketDate || ticketDate !== todayStr) return false;
        } else if (quickDatePreset === 'tomorrow') {
          if (!ticketDate || ticketDate !== tomorrowStr) return false;
        } else if (quickDatePreset === 'upcoming') {
          if (!ticketDate || ticketDate <= tomorrowStr) return false;
        } else if (quickDatePreset === 'past') {
          if (!ticketDate || ticketDate >= todayStr) return false;
        } else if (quickDatePreset === 'invalid') {
          // Empty or unparseable date
          if (ticketDate) return false;
        } else if (selectedAppointmentDate) {
          if (!ticketDate || (ticketDate !== selectedAppointmentDate && !ticketDate.startsWith(selectedAppointmentDate))) return false;
        }
      }

      // Search term match across key identifiers including ticketCategory
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
    selectedArea,
    selectedAgentStatus,
    selectedInstallerStatus,
    selectedWhatsAppStatus,
    selectedCategory,
    searchTerm,
    quickDatePreset,
    selectedAppointmentDate,
    currentUser.role,
    currentUser.name,
    currentUser.area,
    currentUser.contractor,
    currentUser.phone,
    filterUnreadChatOnly,
    getTicketUnreadCount
  ]);

  // Sorting
  const sortedTickets = useMemo(() => {
    return [...filteredTickets].sort((a, b) => {
      let aVal = (a as any)[sortField] || '';
      let bVal = (b as any)[sortField] || '';

      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
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
    if (sortField === fieldKey) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(fieldKey);
      setSortDirection('asc');
    }
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
              placeholder="Cari WO, ID, Nama, Kategori Tiket, Kontak, Teknisi..."
              value={searchTerm}
              onChange={e => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
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

        {/* Filters Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          {/* Universal Appointment Date Filter for All Roles */}
          <div className="col-span-2 sm:col-span-1 lg:col-span-2 bg-indigo-50/70 dark:bg-indigo-950/40 p-1.5 rounded-md border border-indigo-200 dark:border-indigo-800/80">
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-[11px] font-semibold text-indigo-900 dark:text-indigo-200 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                <span>Appointment Date</span>
              </label>
              {(selectedAppointmentDate || quickDatePreset !== 'all') && (
                <button
                  onClick={() => {
                    setSelectedAppointmentDate('');
                    setQuickDatePreset('all');
                    setCurrentPage(1);
                  }}
                  className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              <select
                value={quickDatePreset}
                onChange={e => {
                  const val = e.target.value as any;
                  setQuickDatePreset(val);
                  if (val === 'today') {
                    setSelectedAppointmentDate(getJakartaDateString(0));
                  } else if (val === 'tomorrow') {
                    setSelectedAppointmentDate(getJakartaDateString(1));
                  } else if (val === 'all') {
                    setSelectedAppointmentDate('');
                  }
                  setCurrentPage(1);
                }}
                className="w-full px-2 py-1 text-xs bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-700 rounded text-slate-800 dark:text-slate-200 font-semibold cursor-pointer"
              >
                <option value="all">Semua Jadwal</option>
                <option value="today">Hari Ini ({getJakartaDateParts(0).labelShort})</option>
                <option value="tomorrow">Besok ({getJakartaDateParts(1).labelShort})</option>
                <option value="upcoming">Jadwal Mendatang</option>
                <option value="past">Jadwal Sebelumnya</option>
                <option value="invalid">Jadwal Belum Valid</option>
                <option value="custom">Pilih Tanggal...</option>
              </select>
              <input
                type="date"
                value={selectedAppointmentDate}
                onChange={e => {
                  setSelectedAppointmentDate(e.target.value);
                  setQuickDatePreset(e.target.value ? 'custom' : 'all');
                  setCurrentPage(1);
                }}
                className="w-full px-2 py-1 text-xs bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-700 rounded text-slate-800 dark:text-slate-200 font-medium"
                title="Pilih tanggal appointment tertentu"
              />
            </div>
            {/* Quick date chips if available */}
            {availableAppointmentDates.length > 0 && (
              <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                <span className="text-[10px] text-slate-500 font-medium">Jadwal:</span>
                {availableAppointmentDates.slice(0, 4).map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setSelectedAppointmentDate(d);
                      setQuickDatePreset('custom');
                      setCurrentPage(1);
                    }}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-all cursor-pointer ${
                      selectedAppointmentDate === d
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
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
            <label className="block text-[11px] text-slate-500 mb-0.5">WhatsApp Confirmation</label>
            <select
              value={selectedWhatsAppStatus}
              onChange={e => {
                setSelectedWhatsAppStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-700 dark:text-slate-300"
            >
              <option value="ALL">All WA Status</option>
              <option value="not_prepared">Not Prepared</option>
              <option value="ready">Ready</option>
              <option value="opened_in_whatsapp">Opened in WA</option>
              <option value="confirmed">Confirmed</option>
              <option value="reschedule_requested">Reschedule Needed</option>
              <option value="unreachable">Unreachable</option>
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

              {/* Super Admin Bulk Delete Button */}
              {currentUser.role === 'super_admin' && (
                <button
                  onClick={() => {
                    setBulkDeleteReason('');
                    setBulkDeleteConfirmText('');
                    setBulkDeleteError(null);
                    setShowBulkDeleteModal(true);
                  }}
                  className="px-3 py-1 font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded cursor-pointer flex items-center gap-1.5 transition-colors shadow-2xs"
                  title="Hapus Semua WO Terpilih (Khusus Super Admin)"
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
                      <div className="flex items-center gap-1.5">
                        <span>{col.label}</span>
                        {col.sortable && (
                          <ArrowUpDown className={`w-3 h-3 ${isSorted ? 'text-indigo-600' : 'text-slate-400'}`} />
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
                                {currentUser.role === 'super_admin' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setTicketToDelete(ticket);
                                    }}
                                    className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition-colors"
                                    title="Hapus Work Order (Super Admin Only)"
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
                              <StatusInstallerBadge status={ticket.statusWOInstaller} />
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

      {/* Super Admin Bulk Delete Confirmation Modal */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-rose-200 dark:border-rose-900/60 overflow-hidden">
            {/* Header */}
            <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border-b border-rose-200 dark:border-rose-900 flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 font-bold text-sm">
                <Trash2 className="w-5 h-5 text-rose-600" />
                <span>Konfirmasi Hapus Massal Work Order ({selectedIds.size} Tiket)</span>
              </div>
              <button
                onClick={() => setShowBulkDeleteModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-2 text-amber-800 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Tindakan Khusus Super Admin:</p>
                  <p className="text-[11px] mt-0.5">
                    Anda akan menghapus sebanyak <span className="font-bold underline">{selectedIds.size} tiket Work Order</span> yang telah dipilih. Tindakan ini dicatat dalam log audit resmi dan tidak dapat diurungkan.
                  </p>
                </div>
              </div>

              {bulkDeleteError && (
                <div className="p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded text-rose-700 dark:text-rose-300 font-medium">
                  {bulkDeleteError}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  Alasan Penghapusan Massal <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={bulkDeleteReason}
                  onChange={e => setBulkDeleteReason(e.target.value)}
                  placeholder="Contoh: Pembersihan data WO duplikat uji coba lapangan..."
                  rows={2}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  Ketik <span className="font-mono text-rose-600 dark:text-rose-400 font-bold">HAPUS WO</span> untuk konfirmasi:
                </label>
                <input
                  type="text"
                  value={bulkDeleteConfirmText}
                  onChange={e => setBulkDeleteConfirmText(e.target.value)}
                  placeholder="HAPUS WO"
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-rose-500 uppercase"
                />
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBulkDeleteModal(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!bulkDeleteReason.trim() || bulkDeleteReason.trim().length < 5) {
                    setBulkDeleteError('Alasan penghapusan minimal 5 karakter.');
                    return;
                  }
                  if (bulkDeleteConfirmText.trim().toUpperCase() !== 'HAPUS WO') {
                    setBulkDeleteError('Ketik "HAPUS WO" untuk melanjutkan.');
                    return;
                  }
                  const res = bulkDeleteTickets(Array.from(selectedIds), bulkDeleteReason.trim());
                  if (res.success) {
                    setSelectedIds(new Set());
                    setShowBulkDeleteModal(false);
                  } else {
                    setBulkDeleteError(res.error || 'Gagal menghapus tiket.');
                  }
                }}
                disabled={bulkDeleteConfirmText.trim().toUpperCase() !== 'HAPUS WO' || bulkDeleteReason.trim().length < 5}
                className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-40 rounded-lg cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus {selectedIds.size} Work Order</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {ticketToDelete && (
        <SuperAdminDeleteModal
          isOpen={Boolean(ticketToDelete)}
          onClose={() => setTicketToDelete(null)}
          targetType="ticket"
          targetId={ticketToDelete.id}
          targetLabel={`WO: ${ticketToDelete.woNumber} (ID Pelanggan: ${ticketToDelete.idCustomer})`}
          targetDetails={[
            { label: 'Pelanggan', value: ticketToDelete.customerName },
            { label: 'Area / Cluster', value: `${ticketToDelete.area || '-'} / ${ticketToDelete.clusterName || '-'}` },
            { label: 'Mitra Kontraktor', value: ticketToDelete.contactorName || '-' },
            { label: 'Status WO', value: `${ticketToDelete.statusWOAgent} / ${ticketToDelete.statusWOInstaller}` }
          ]}
          onSuccess={() => {
            setTicketToDelete(null);
          }}
        />
      )}
    </div>
  );
};
