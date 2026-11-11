import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Ticket } from '../../types';
import {
  formatAppointmentDateDisplay,
  getTicketAppointmentDate,
  getJakartaDateString
} from '../../services/appointmentDateParser';
import {
  formatJakartaTimestamp,
  formatJakartaTimeOnly,
  formatWorkDuration,
  getTicketWorkStatus
} from '../../services/workSessionService';
import {
  Inbox,
  UserCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
  ChevronDown,
  ChevronRight,
  Eye,
  MessageSquare,
  FileSpreadsheet,
  Printer,
  Copy,
  Download,
  Filter,
  Sliders,
  Calendar,
  Layers,
  ArrowUpDown,
  ExternalLink,
  MapPin,
  Sparkles,
  Building2,
  Timer
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { openCustomerAddressInGoogleMaps } from '../../services/mapsService';

interface LeaderProgressDashboardViewProps {
  onSelectTicket: (ticket: Ticket) => void;
  onOpenWhatsApp?: (ticket: Ticket) => void;
}

type StatCategoryFilter = 'all' | 'unassign' | 'assign' | 'untouch' | 'complete' | 'uncomplete' | 'cancel';

export const LeaderProgressDashboardView: React.FC<LeaderProgressDashboardViewProps> = ({
  onSelectTicket,
  onOpenWhatsApp
}) => {
  const { tickets, currentUser, contractorsList } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<StatCategoryFilter>('all');
  const [sortField, setSortField] = useState<string>('woNumber');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [expandedRowIds, setExpandedRowIds] = useState<Record<string, boolean>>({});
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [copySuccess, setCopySuccess] = useState(false);

  // Timezone Asia/Jakarta reference: auto-updating every 30 seconds
  const [todayJakarta, setTodayJakarta] = useState(() => getJakartaDateString(0));
  useEffect(() => {
    const timer = setInterval(() => {
      const nowToday = getJakartaDateString(0);
      setTodayJakarta(prev => (prev !== nowToday ? nowToday : prev));
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const tomorrowJakarta = getJakartaDateString(1);
  const leaderContractor = currentUser?.contractor || (contractorsList?.[0] || 'PT Mitra Jaringan Solusi');

  // Date Filter State: Default 'today', with options for 'tomorrow' and 'all'
  const [dateFilterType, setDateFilterType] = useState<'today' | 'tomorrow' | 'all'>('today');

  // Filter contractor tickets & Appointment Date (strictly scoped to Leader's contractor AND area)
  const baseLeaderTickets = useMemo(() => {
    return tickets.filter(t => {
      if (t.isArchived || t.isDeleted) return false;

      // Contractor & Area check for leader role
      if (currentUser.role === 'leader') {
        const ticketContr = (t.contactorName || t.contractorName || '').toLowerCase().trim();
        const myContr = (leaderContractor || '').toLowerCase().trim();
        if (myContr && !ticketContr.includes(myContr) && !myContr.includes(ticketContr)) {
          return false;
        }

        if (currentUser.area && currentUser.area.trim()) {
          const myArea = currentUser.area.toLowerCase().trim();
          const ticketArea = (t.area || '').toLowerCase().trim();
          if (ticketArea && !ticketArea.includes(myArea) && !myArea.includes(ticketArea)) {
            return false;
          }
        }
      }

      // Appointment Date in Asia/Jakarta
      if (dateFilterType === 'all') return true;
      const appDate = getTicketAppointmentDate(t);
      if (dateFilterType === 'today') return Boolean(appDate && appDate === todayJakarta);
      if (dateFilterType === 'tomorrow') return Boolean(appDate && appDate === tomorrowJakarta);
      return true;
    });
  }, [tickets, currentUser, leaderContractor, todayJakarta, tomorrowJakarta, dateFilterType]);

  // Categorize ticket into one of the 6 photo categories
  const getTicketCategory = (t: Ticket): 'unassign' | 'assign' | 'untouch' | 'complete' | 'uncomplete' | 'cancel' => {
    const installerStatus = (t.statusWOInstaller || '').toLowerCase();
    const agentStatus = (t.statusWOAgent || '').toLowerCase();
    const hasInstaller = Boolean(t.installerName && t.installerName.trim());

    if (installerStatus.includes('cancel') || agentStatus.includes('cancel')) {
      return 'cancel';
    }
    if (installerStatus.includes('complete') || installerStatus.includes('selesai') || agentStatus.includes('complete')) {
      return 'complete';
    }
    if (installerStatus.includes('uncomplete') || installerStatus.includes('pending') || installerStatus.includes('kendala') || agentStatus.includes('uncomplete')) {
      return 'uncomplete';
    }
    if (!hasInstaller || installerStatus.includes('unassign') || installerStatus === 'draft') {
      return 'unassign';
    }
    if (installerStatus.includes('untouch') || installerStatus.includes('assigned') || installerStatus === 'assigned') {
      // If assigned but untouched / waiting
      return 'untouch';
    }
    return 'assign';
  };

  // 6 Live Stat Cards Metrics: Strictly calculate tickets with Appointment Date = Today (Asia/Jakarta)
  const statCounts = useMemo(() => {
    let unassign = 0;
    let assign = 0;
    let untouch = 0;
    let complete = 0;
    let uncomplete = 0;
    let cancel = 0;

    // Filter tickets scoped to Leader where appointmentDate === todayJakarta
    const todayTickets = tickets.filter(t => {
      if (t.isArchived || t.isDeleted) return false;
      if (currentUser.role === 'leader') {
        const ticketContr = (t.contactorName || t.contractorName || '').toLowerCase().trim();
        const myContr = (leaderContractor || '').toLowerCase().trim();
        if (myContr && !ticketContr.includes(myContr) && !myContr.includes(ticketContr)) {
          return false;
        }
        if (currentUser.area && currentUser.area.trim()) {
          const myArea = currentUser.area.toLowerCase().trim();
          const ticketArea = (t.area || '').toLowerCase().trim();
          if (ticketArea && !ticketArea.includes(myArea) && !myArea.includes(ticketArea)) {
            return false;
          }
        }
      }
      return getTicketAppointmentDate(t) === todayJakarta;
    });

    todayTickets.forEach(t => {
      const cat = getTicketCategory(t);
      if (cat === 'unassign') unassign++;
      else if (cat === 'assign') assign++;
      else if (cat === 'untouch') untouch++;
      else if (cat === 'complete') complete++;
      else if (cat === 'uncomplete') uncomplete++;
      else if (cat === 'cancel') cancel++;
    });

    return {
      unassign,
      assign,
      untouch,
      complete,
      uncomplete,
      cancel,
      total: todayTickets.length
    };
  }, [tickets, currentUser, leaderContractor, todayJakarta]);

  // Filtered & Searched Tickets
  const displayTickets = useMemo(() => {
    return baseLeaderTickets.filter(t => {
      // Category filter
      if (selectedCategory !== 'all') {
        const cat = getTicketCategory(t);
        if (cat !== selectedCategory) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const wo = (t.woNumber || '').toLowerCase();
        const cid = (t.idCustomer || '').toLowerCase();
        const cname = (t.customerName || '').toLowerCase();
        const inst = (t.installerName || '').toLowerCase();
        const addr = (t.address || '').toLowerCase();
        const cluster = ((t as any).cluster || (t as any).clusterName || '').toLowerCase();
        return (
          wo.includes(q) ||
          cid.includes(q) ||
          cname.includes(q) ||
          inst.includes(q) ||
          addr.includes(q) ||
          cluster.includes(q)
        );
      }

      return true;
    }).sort((a, b) => {
      let valA: any = '';
      let valB: any = '';
      if (sortField === 'installerName') {
        valA = a.installerName || '';
        valB = b.installerName || '';
      } else if (sortField === 'idCustomer') {
        valA = a.idCustomer || '';
        valB = b.idCustomer || '';
      } else if (sortField === 'woNumber') {
        valA = a.woNumber || '';
        valB = b.woNumber || '';
      } else if (sortField === 'area') {
        valA = a.area || '';
        valB = b.area || '';
      } else if (sortField === 'contractor') {
        valA = a.contactorName || a.contractorName || '';
        valB = b.contactorName || b.contractorName || '';
      } else if (sortField === 'checkInAt') {
        valA = a.checkInAt || '';
        valB = b.checkInAt || '';
      } else if (sortField === 'checkOutAt') {
        valA = a.checkOutAt || '';
        valB = b.checkOutAt || '';
      } else if (sortField === 'workDuration') {
        valA = a.workDurationMinutes || 0;
        valB = b.workDurationMinutes || 0;
      } else if (sortField === 'workStatus') {
        valA = getTicketWorkStatus(a).status;
        valB = getTicketWorkStatus(b).status;
      } else {
        valA = String((a as any)[sortField] || '').toLowerCase();
        valB = String((b as any)[sortField] || '').toLowerCase();
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      valA = String(valA).toLowerCase();
      valB = String(valB).toLowerCase();
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [baseLeaderTickets, selectedCategory, searchQuery, sortField, sortOrder]);

  // Pagination
  const totalPages = rowsPerPage === -1 ? 1 : Math.max(1, Math.ceil(displayTickets.length / rowsPerPage));
  const paginatedTickets = useMemo(() => {
    if (rowsPerPage === -1) return displayTickets;
    const start = (currentPage - 1) * rowsPerPage;
    return displayTickets.slice(start, start + rowsPerPage);
  }, [displayTickets, currentPage, rowsPerPage]);

  const toggleRowExpand = (id: string) => {
    setExpandedRowIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Export functions
  const handleCopy = () => {
    const textRows = displayTickets.map(t =>
      `${t.idCustomer || '-'}\t${t.woNumber}\t${t.appointmentDate || '-'}\t${t.installerName || '-'}\t${t.statusWOInstaller || '-'}`
    );
    const header = 'ID Customer\tWO Number\tDate WO\tInstaller\tStatus Installer';
    navigator.clipboard.writeText([header, ...textRows].join('\n')).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  const handleExportCSV = () => {
    const csvRows = [
      ['ID Customer', 'WO Number', 'Date WO', 'Installer', 'Slot Time', 'WO Agent', 'WO Reason Agent', 'WO Installer', 'WO Reason Installer', 'WO Remarks Installer']
    ];
    displayTickets.forEach(t => {
      csvRows.push([
        t.idCustomer || '',
        t.woNumber || '',
        t.appointmentDate || '',
        t.installerName || '',
        t.slotTime || '',
        t.statusWOAgent || '',
        (t as any).reasonWOAgent || '',
        t.statusWOInstaller || '',
        (t as any).reasonWOInstaller || '',
        t.remarksWOInstaller || ''
      ]);
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map(e => e.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Leader_Progress_WO_${todayJakarta}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = () => {
    const data = displayTickets.map(t => ({
      'ID Customer': t.idCustomer || '-',
      'WO Number': t.woNumber,
      'Date WO': t.appointmentDate || '-',
      'Installer': t.installerName || 'Unassigned',
      'Slot Time': t.slotTime || '-',
      'WO Agent': t.statusWOAgent || '-',
      'WO Reason Agent': (t as any).reasonWOAgent || '-',
      'WO Installer': t.statusWOInstaller || '-',
      'WO Reason Installer': (t as any).reasonWOInstaller || '-',
      'WO Remarks Installer': t.remarksWOInstaller || '-'
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Progress WO');
    XLSX.writeFile(workbook, `Leader_Progress_WO_${todayJakarta}.xlsx`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#1A0E2E] via-[#35105E] to-[#4C1D95] rounded-2xl p-5 text-white shadow-lg border border-[#7135B5]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-[#D8B4FE] shadow-inner shrink-0">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-black tracking-tight text-white">
                DASHBOARD PROGRESS WO
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-mono font-bold bg-[#A855F7]/30 border border-[#D8B4FE]/40 text-[#E9D5FF]">
                Live Realtime SLA
              </span>
            </div>
            <p className="text-xs text-[#D8B4FE]/90 mt-0.5">
              Mitra: <strong className="text-white">{leaderContractor}</strong> • Jadwal Hari Ini: <span className="font-mono text-white underline">{formatAppointmentDateDisplay(todayJakarta)}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1 bg-white/10 p-1 rounded-xl border border-white/20 text-xs">
            <button
              type="button"
              onClick={() => { setDateFilterType('today'); setCurrentPage(1); }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                dateFilterType === 'today'
                  ? 'bg-white text-[#35105E] shadow-xs'
                  : 'text-purple-200 hover:text-white hover:bg-white/10'
              }`}
            >
              Hari Ini
            </button>
            <button
              type="button"
              onClick={() => { setDateFilterType('tomorrow'); setCurrentPage(1); }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                dateFilterType === 'tomorrow'
                  ? 'bg-white text-[#35105E] shadow-xs'
                  : 'text-purple-200 hover:text-white hover:bg-white/10'
              }`}
            >
              Besok
            </button>
            <button
              type="button"
              onClick={() => { setDateFilterType('all'); setCurrentPage(1); }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                dateFilterType === 'all'
                  ? 'bg-white text-[#35105E] shadow-xs'
                  : 'text-purple-200 hover:text-white hover:bg-white/10'
              }`}
            >
              Semua
            </button>
          </div>

          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-white text-[#35105E] shadow-md'
                : 'bg-white/10 text-purple-200 hover:bg-white/20'
            }`}
          >
            Semua Status ({statCounts.total})
          </button>
        </div>
      </div>

      {/* 6 STATISTIK CARDS (Referensi Foto 1 & 3) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Card 1: WO Unassign */}
        <button
          type="button"
          onClick={() => setSelectedCategory(selectedCategory === 'unassign' ? 'all' : 'unassign')}
          className={`p-3.5 rounded-2xl border transition-all text-left flex flex-col justify-between cursor-pointer ${
            selectedCategory === 'unassign'
              ? 'ring-2 ring-amber-500 shadow-md bg-amber-50/90 dark:bg-amber-950/50 border-amber-400'
              : 'bg-white dark:bg-[#1A0E2E] border-slate-200 dark:border-purple-900/60 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-600 flex items-center justify-center">
              <Inbox className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Baru
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
              {statCounts.unassign}
            </div>
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
              WO Unassign
            </div>
          </div>
        </button>

        {/* Card 2: WO Assign */}
        <button
          type="button"
          onClick={() => setSelectedCategory(selectedCategory === 'assign' ? 'all' : 'assign')}
          className={`p-3.5 rounded-2xl border transition-all text-left flex flex-col justify-between cursor-pointer ${
            selectedCategory === 'assign'
              ? 'ring-2 ring-indigo-500 shadow-md bg-indigo-50/90 dark:bg-indigo-950/50 border-indigo-400'
              : 'bg-white dark:bg-[#1A0E2E] border-slate-200 dark:border-purple-900/60 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Terdistribusi
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
              {statCounts.assign}
            </div>
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
              WO Assign
            </div>
          </div>
        </button>

        {/* Card 3: Untouch */}
        <button
          type="button"
          onClick={() => setSelectedCategory(selectedCategory === 'untouch' ? 'all' : 'untouch')}
          className={`p-3.5 rounded-2xl border transition-all text-left flex flex-col justify-between cursor-pointer ${
            selectedCategory === 'untouch'
              ? 'ring-2 ring-purple-500 shadow-md bg-purple-50/90 dark:bg-purple-950/50 border-purple-400'
              : 'bg-white dark:bg-[#1A0E2E] border-slate-200 dark:border-purple-900/60 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
              Antrean
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-purple-600 dark:text-purple-400 font-mono">
              {statCounts.untouch}
            </div>
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Untouch
            </div>
          </div>
        </button>

        {/* Card 4: Complete */}
        <button
          type="button"
          onClick={() => setSelectedCategory(selectedCategory === 'complete' ? 'all' : 'complete')}
          className={`p-3.5 rounded-2xl border transition-all text-left flex flex-col justify-between cursor-pointer ${
            selectedCategory === 'complete'
              ? 'ring-2 ring-emerald-500 shadow-md bg-emerald-50/90 dark:bg-emerald-950/50 border-emerald-400'
              : 'bg-white dark:bg-[#1A0E2E] border-slate-200 dark:border-purple-900/60 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Selesai
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
              {statCounts.complete}
            </div>
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Complete
            </div>
          </div>
        </button>

        {/* Card 5: Uncomplete */}
        <button
          type="button"
          onClick={() => setSelectedCategory(selectedCategory === 'uncomplete' ? 'all' : 'uncomplete')}
          className={`p-3.5 rounded-2xl border transition-all text-left flex flex-col justify-between cursor-pointer ${
            selectedCategory === 'uncomplete'
              ? 'ring-2 ring-rose-500 shadow-md bg-rose-50/90 dark:bg-rose-950/50 border-rose-400'
              : 'bg-white dark:bg-[#1A0E2E] border-slate-200 dark:border-purple-900/60 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              Kendala
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono">
              {statCounts.uncomplete}
            </div>
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Uncomplete
            </div>
          </div>
        </button>

        {/* Card 6: Cancel */}
        <button
          type="button"
          onClick={() => setSelectedCategory(selectedCategory === 'cancel' ? 'all' : 'cancel')}
          className={`p-3.5 rounded-2xl border transition-all text-left flex flex-col justify-between cursor-pointer ${
            selectedCategory === 'cancel'
              ? 'ring-2 ring-slate-500 shadow-md bg-slate-100 dark:bg-slate-800 border-slate-400'
              : 'bg-white dark:bg-[#1A0E2E] border-slate-200 dark:border-purple-900/60 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center">
              <XCircle className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Batal
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-slate-600 dark:text-slate-400 font-mono">
              {statCounts.cancel}
            </div>
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Cancel
            </div>
          </div>
        </button>
      </div>

      {/* TABEL PROGRESS WO (Referensi Foto 1 & 3) */}
      <div className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 shadow-xs overflow-hidden">
        {/* Table Toolbar */}
        <div className="p-4 border-b border-slate-200 dark:border-purple-900/40 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari ID Customer, WO, Teknisi, Alamat..."
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-purple-900/60 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#5B35B1]"
            />
          </div>

          {/* Tools & Export Buttons */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Rows Per Page */}
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-purple-900/60">
              <span className="text-slate-500">Tampil:</span>
              <select
                value={rowsPerPage}
                onChange={e => {
                  setRowsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-transparent font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={-1}>Semua ({displayTickets.length})</option>
              </select>
            </div>

            {/* Export Toolbar */}
            <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-purple-900/60">
              <button
                type="button"
                onClick={handleCopy}
                className="px-2 py-1 text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg flex items-center gap-1 font-semibold transition-all"
                title="Salin Data ke Clipboard"
              >
                <Copy className="w-3.5 h-3.5 text-indigo-500" />
                <span>{copySuccess ? 'Disalin!' : 'Copy'}</span>
              </button>
              <button
                type="button"
                onClick={handleExportCSV}
                className="px-2 py-1 text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg flex items-center gap-1 font-semibold transition-all"
                title="Export CSV"
              >
                <Download className="w-3.5 h-3.5 text-blue-500" />
                <span>CSV</span>
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                className="px-2 py-1 text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg flex items-center gap-1 font-semibold transition-all"
                title="Export Excel (.xlsx)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Excel</span>
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="px-2 py-1 text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg flex items-center gap-1 font-semibold transition-all"
                title="Cetak Tabel"
              >
                <Printer className="w-3.5 h-3.5 text-slate-600" />
                <span>Print</span>
              </button>
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-[#F5F1FF] dark:bg-[#251545] text-[#3B1D78] dark:text-purple-200 uppercase font-black text-[10.5px] tracking-wider border-b border-slate-200 dark:border-purple-900/60">
              <tr>
                <th className="py-3 px-2 w-8 text-center">#</th>
                <th
                  onClick={() => handleSort('installerName')}
                  className="py-3 px-3 font-black cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/40 select-none min-w-[130px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Nama Installer</span>
                    <ArrowUpDown className="w-3 h-3 text-purple-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('woNumber')}
                  className="py-3 px-3 font-black cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/40 select-none min-w-[120px]"
                >
                  <div className="flex items-center gap-1">
                    <span>WO Number</span>
                    <ArrowUpDown className="w-3 h-3 text-purple-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('idCustomer')}
                  className="py-3 px-3 font-black cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/40 select-none min-w-[110px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Customer ID</span>
                    <ArrowUpDown className="w-3 h-3 text-purple-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('area')}
                  className="py-3 px-3 font-black cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/40 select-none min-w-[90px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Area</span>
                    <ArrowUpDown className="w-3 h-3 text-purple-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('contractor')}
                  className="py-3 px-3 font-black cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/40 select-none min-w-[130px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Contractor</span>
                    <ArrowUpDown className="w-3 h-3 text-purple-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('checkInAt')}
                  className="py-3 px-3 font-black cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/40 select-none min-w-[120px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Waktu Check-in</span>
                    <ArrowUpDown className="w-3 h-3 text-purple-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('checkOutAt')}
                  className="py-3 px-3 font-black cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/40 select-none min-w-[120px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Waktu Check-out</span>
                    <ArrowUpDown className="w-3 h-3 text-purple-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('workDuration')}
                  className="py-3 px-3 font-black cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/40 select-none min-w-[110px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Durasi Kerja</span>
                    <ArrowUpDown className="w-3 h-3 text-purple-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('workStatus')}
                  className="py-3 px-3 text-center font-black cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/40 select-none min-w-[120px]"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Status Pekerjaan</span>
                    <ArrowUpDown className="w-3 h-3 text-purple-400" />
                  </div>
                </th>
                <th className="py-3 px-3 text-right font-black min-w-[80px]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-purple-900/30">
              {paginatedTickets.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400 text-xs">
                    Tidak ada Work Order yang sesuai dengan filter atau pencarian aktif.
                  </td>
                </tr>
              ) : (
                paginatedTickets.map((t, idx) => {
                  const isExpanded = !!expandedRowIds[t.id];
                  const workStatus = getTicketWorkStatus(t);
                  const contractorName = t.contractorName || t.contactorName || leaderContractor || '-';

                  return (
                    <React.Fragment key={t.id}>
                      {/* Main Row */}
                      <tr className={`hover:bg-purple-50/50 dark:hover:bg-purple-950/30 transition-colors ${
                        isExpanded ? 'bg-purple-50/70 dark:bg-[#251545]/50 font-medium' : ''
                      }`}>
                        {/* 1. Expand Toggle Button */}
                        <td className="py-3 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => toggleRowExpand(t.id)}
                            className="p-1 rounded-lg text-slate-400 hover:text-[#5B35B1] hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors cursor-pointer"
                            title={isExpanded ? 'Tutup Rincian' : 'Buka Rincian'}
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-[#5B35B1] rotate-0 transition-transform" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-400 transition-transform" />
                            )}
                          </button>
                        </td>

                        {/* 2. Nama Installer */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                            <UserCheck className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            <span className="truncate max-w-[130px]">{t.installerName || 'Belum Di-assign'}</span>
                          </div>
                          {t.installerContact && (
                            <div className="text-[10px] text-slate-400 font-mono">
                              {t.installerContact}
                            </div>
                          )}
                        </td>

                        {/* 3. WO Number */}
                        <td className="py-3 px-3">
                          <div className="font-mono font-black text-[#5B35B1] dark:text-purple-300">
                            {t.woNumber}
                          </div>
                          <div className="text-[10.5px] text-slate-500 truncate max-w-[150px]">
                            {t.customerName}
                          </div>
                        </td>

                        {/* 4. Customer ID */}
                        <td className="py-3 px-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                          {t.idCustomer || '-'}
                        </td>

                        {/* 5. Area */}
                        <td className="py-3 px-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                            {t.area || '-'}
                          </span>
                        </td>

                        {/* 6. Contractor */}
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-300 text-[11px] font-medium">
                          <div className="truncate max-w-[130px]" title={contractorName}>
                            {contractorName}
                          </div>
                        </td>

                        {/* 7. Waktu Check-in */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          {t.checkInAt ? (
                            <div className="flex items-center gap-1 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                              <Clock className="w-3 h-3 text-emerald-500 shrink-0" />
                              <span>{formatJakartaTimeOnly(t.checkInAt)}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px]">-</span>
                          )}
                        </td>

                        {/* 8. Waktu Check-out */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          {t.checkOutAt ? (
                            <div className="flex items-center gap-1 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                              <CheckCircle2 className="w-3 h-3 text-blue-500 shrink-0" />
                              <span>{formatJakartaTimeOnly(t.checkOutAt)}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px]">-</span>
                          )}
                        </td>

                        {/* 9. Durasi Kerja */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1 font-medium text-[11px] text-slate-700 dark:text-slate-300">
                            <Timer className="w-3 h-3 text-purple-500 shrink-0" />
                            <span>{workStatus.durationFormatted}</span>
                          </div>
                        </td>

                        {/* 10. Status Pekerjaan (Belum Check-in / Sedang Dikerjakan / Selesai) */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            workStatus.status === 'Selesai'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : workStatus.status === 'Sedang Dikerjakan'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 animate-pulse'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}>
                            {workStatus.status}
                          </span>
                        </td>

                        {/* 11. Action Buttons */}
                        <td className="py-3 px-3 text-right space-x-1 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onSelectTicket(t)}
                            className="px-2.5 py-1 bg-[#5B35B1] hover:bg-[#3B1D78] text-white font-bold rounded-lg text-xs shadow-xs transition-all cursor-pointer inline-flex items-center gap-1"
                            title="Buka Lembar Kerja WO"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Detail</span>
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Additional Details (Strictly matching requirement) */}
                      {isExpanded && (
                        <tr className="bg-[#FAF8FF] dark:bg-[#1E1238] border-b border-purple-200 dark:border-purple-900/60">
                          <td colSpan={11} className="p-4 sm:p-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                              {/* Item 1: Installer */}
                              <div className="p-3 bg-white dark:bg-[#150A26] rounded-xl border border-purple-100 dark:border-purple-900/50 space-y-1">
                                <div className="text-[10px] uppercase font-bold text-slate-400">
                                  Installer
                                </div>
                                <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                                  <UserCheck className="w-3.5 h-3.5 text-indigo-500" />
                                  <span>{t.installerName || 'Belum Di-assign'}</span>
                                </div>
                                {t.installerContact && (
                                  <div className="text-[11px] text-slate-500 font-mono">
                                    Telp: {t.installerContact}
                                  </div>
                                )}
                              </div>

                              {/* Item 2: Slot Time */}
                              <div className="p-3 bg-white dark:bg-[#150A26] rounded-xl border border-purple-100 dark:border-purple-900/50 space-y-1">
                                <div className="text-[10px] uppercase font-bold text-slate-400">
                                  Slot Time
                                </div>
                                <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                                  <span>{t.slotTime || (t as any).timeSlot || '09:00 - 12:00'}</span>
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  Area: {t.area || '-'}
                                </div>
                              </div>

                              {/* Item 3: WO Agent & Reason Agent */}
                              <div className="p-3 bg-white dark:bg-[#150A26] rounded-xl border border-purple-100 dark:border-purple-900/50 space-y-1">
                                <div className="text-[10px] uppercase font-bold text-slate-400">
                                  WO Agent & Reason
                                </div>
                                <div className="font-semibold text-slate-800 dark:text-slate-200">
                                  Status: <strong className="text-[#5B35B1] dark:text-purple-300">{t.statusWOAgent || '-'}</strong>
                                </div>
                                <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                                  Reason: {(t as any).reasonWOAgent || '-'}
                                </div>
                              </div>

                              {/* Item 4: WO Installer, Reason & Remarks Installer */}
                              <div className="p-3 bg-white dark:bg-[#150A26] rounded-xl border border-purple-100 dark:border-purple-900/50 space-y-1">
                                <div className="text-[10px] uppercase font-bold text-slate-400">
                                  WO Installer & Remarks
                                </div>
                                <div className="font-semibold text-slate-800 dark:text-slate-200">
                                  Status: <strong className="text-emerald-600">{t.statusWOInstaller || '-'}</strong>
                                </div>
                                <div className="text-[11px] text-slate-600 dark:text-slate-400">
                                  Reason: {(t as any).reasonWOInstaller || '-'}
                                </div>
                                <div className="text-[11px] text-slate-600 dark:text-slate-400 italic">
                                  Remarks: {t.remarksWOInstaller || '-'}
                                </div>
                              </div>
                            </div>

                            {/* Additional Address, Maps & Quick Contact Row */}
                            <div className="mt-3 pt-3 border-t border-purple-100 dark:border-purple-900/40 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                              <div className="text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-1.5 flex-1">
                                <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                                <span className="line-clamp-2">{t.address || 'Alamat tidak tersedia'}</span>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => openCustomerAddressInGoogleMaps(t)}
                                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-lg flex items-center gap-1 cursor-pointer"
                                >
                                  <ExternalLink className="w-3 h-3 text-rose-500" />
                                  <span>Google Maps</span>
                                </button>

                                {onOpenWhatsApp && (
                                  <button
                                    type="button"
                                    onClick={() => onOpenWhatsApp(t)}
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg flex items-center gap-1 shadow-xs cursor-pointer"
                                  >
                                    <MessageSquare className="w-3 h-3" />
                                    <span>Kirim WA</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => onSelectTicket(t)}
                                  className="px-3 py-1 bg-[#5B35B1] hover:bg-[#3B1D78] text-white font-bold rounded-lg shadow-xs cursor-pointer"
                                >
                                  Detail Lengkap
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination */}
        <div className="p-4 border-t border-slate-200 dark:border-purple-900/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-slate-500">
            Menampilkan <strong className="font-bold text-slate-800 dark:text-slate-200">{paginatedTickets.length}</strong> dari{' '}
            <strong className="font-bold text-slate-800 dark:text-slate-200">{displayTickets.length}</strong> Work Order
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-slate-50 dark:bg-slate-800 border rounded-lg font-semibold disabled:opacity-40"
              >
                Sebelumnya
              </button>
              <span className="px-3 py-1 font-mono font-bold text-[#5B35B1]">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-slate-50 dark:bg-slate-800 border rounded-lg font-semibold disabled:opacity-40"
              >
                Selanjutnya
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
