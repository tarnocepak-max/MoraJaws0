import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Ticket, User, TicketStatusWOInstaller } from '../../types/index.ts';
import { StatusAgentBadge, StatusInstallerBadge, StatusWhatsAppBadge } from '../common/Badge';
import { renderWhatsAppMessage, buildWhatsAppClickToChatUrl, isValidPhoneNumber } from '../../services/whatsappService';
import {
  formatAppointmentDateDisplay,
  parseAppointmentDate,
  getJakartaDateString,
  getJakartaDateParts,
  getTicketAppointmentDate
} from '../../services/appointmentDateParser';
import {
  getTicketWorkStatus,
  formatJakartaTimestamp,
  formatJakartaTimeOnly,
  formatWorkDuration
} from '../../services/workSessionService';
import {
  Users2,
  CheckCircle2,
  UserCheck,
  MessageSquare,
  Clock,
  UserPlus,
  KeyRound,
  Shield,
  Building2,
  Phone,
  AlertCircle,
  Check,
  Lock,
  Search,
  Calendar,
  BarChart3,
  Plus,
  Sliders,
  Gauge,
  Send,
  RotateCcw,
  XCircle,
  ExternalLink,
  Layers,
  Filter,
  X,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  FileSpreadsheet,
  Printer,
  Copy,
  Download,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  Activity,
  ArrowRight,
  Smartphone,
  Table,
  FileUp,
  MapPin,
  ArrowRightLeft,
  History
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { openCustomerAddressInGoogleMaps } from '../../services/mapsService';
import { SortableColumnHeader } from '../common/SortableColumnHeader';
import {
  SortState,
  getNextSortDirection,
  sortDataArray
} from '../../utils/tableSorting';
import {
  LeaderColumnSettingsModal,
  DEFAULT_LEADER_COLUMNS,
  ColumnConfig
} from './LeaderColumnSettingsModal';
import { InstallerDetailModal } from './InstallerDetailModal';
import { UploadAssignModal } from './UploadAssignModal';
import { LeaderProgressDashboardView } from './LeaderProgressDashboardView';
import { ContractorAreaRecapView } from '../reports/ContractorAreaRecapView';

interface LeaderPortalProps {
  onSelectTicket: (ticket: Ticket) => void;
  onOpenWhatsApp?: (ticket: Ticket) => void;
  activeLeaderTab?: 'dashboard' | 'wo_assignment' | 'progress_dashboard' | 'installer_mgmt' | 'quota_settings' | 'contractor_recap';
  onLeaderTabChange?: (tab: 'dashboard' | 'wo_assignment' | 'progress_dashboard' | 'installer_mgmt' | 'quota_settings' | 'contractor_recap') => void;
}

interface QuotaSettings {
  defaultMaxDailyQuota: number;
  enforceStrictLimit: boolean;
  customInstallerLimits: Record<string, number>;
}

const DEFAULT_QUOTA_SETTINGS: QuotaSettings = {
  defaultMaxDailyQuota: 4,
  enforceStrictLimit: true,
  customInstallerLimits: {}
};

export type LeaderStatusFilter =
  | 'all'
  | 'unassigned'
  | 'assigned'
  | 'waiting'
  | 'in_progress'
  | 'completed'
  | 'pending'
  | 'problem'
  | 'idle_installers';

export const LeaderPortal: React.FC<LeaderPortalProps> = ({
  onSelectTicket,
  onOpenWhatsApp,
  activeLeaderTab,
  onLeaderTabChange
}) => {
  const {
    tickets,
    assignTicketPersonnel,
    reassignTicketPersonnel,
    bulkAssignPersonnel,
    currentUser,
    users,
    registerInstallerAccount,
    templates,
    auditLogs,
    toast,
    contractorsList,
    areasList
  } = useApp();

  // Navigation tab in portal: Dedicated tabs for Dashboard Leader, Assign WO, Pendaftaran Akun Teknisi, Dashboard Progress WO, Quota, and Rekap Area
  const [internalTab, setInternalTab] = useState<'dashboard' | 'wo_assignment' | 'installer_mgmt' | 'progress_dashboard' | 'quota_settings' | 'contractor_recap'>(
    activeLeaderTab || 'wo_assignment'
  );
  const activeTab = activeLeaderTab || internalTab;

  useEffect(() => {
    if (activeLeaderTab) {
      setInternalTab(activeLeaderTab);
    }
  }, [activeLeaderTab]);

  const setActiveTab = (tab: 'dashboard' | 'wo_assignment' | 'installer_mgmt' | 'progress_dashboard' | 'quota_settings' | 'contractor_recap') => {
    setInternalTab(tab);
    if (onLeaderTabChange) onLeaderTabChange(tab);
  };

  // Sub-view in Monitoring tab: 'installer_summary' (table of installers) vs 'wo_detail' (table of work orders)
  const [monitoringView, setMonitoringView] = useState<'installer_summary' | 'wo_detail'>('installer_summary');

  // Mobile layout preference for WO table: 'table' vs 'cards'
  const [mobileLayoutMode, setMobileLayoutMode] = useState<'table' | 'cards'>('table');

  // Last refreshed timestamp
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>(() => new Date().toISOString());

  // Date schedule for timetable matrix (default today Asia/Jakarta WIB, not hardcoded sample)
  const [scheduleDate, setScheduleDate] = useState(() => getJakartaDateString(0));
  const [selectedSlotForAssign, setSelectedSlotForAssign] = useState<{ installer: string; slot: string } | null>(null);

  const STANDARD_SLOTS = [
    '09:00 - 11:00 WIB',
    '11:00 - 13:00 WIB',
    '13:00 - 15:00 WIB',
    '15:00 - 17:00 WIB'
  ];

  // Leader contractor & area
  const leaderContractor = currentUser.contractor || '';
  const leaderArea = currentUser.area || '';
  const displayContractor = leaderContractor || (contractorsList?.[0] || 'PT Mitra Jaringan Solusi');
  const displayArea = leaderArea || (areasList?.[0] || 'Jakarta Selatan');

  // Persistent Quota Settings
  const QUOTA_STORAGE_KEY = `morajaws_leader_quota_${(leaderContractor || 'default').replace(/\s+/g, '_').toLowerCase()}`;
  const [quotaSettings, setQuotaSettings] = useState<QuotaSettings>(() => {
    try {
      const saved = localStorage.getItem(QUOTA_STORAGE_KEY);
      if (saved) return { ...DEFAULT_QUOTA_SETTINGS, ...JSON.parse(saved) };
    } catch (e) {}
    return DEFAULT_QUOTA_SETTINGS;
  });

  const saveQuotaSettings = (updates: Partial<QuotaSettings>) => {
    const next = { ...quotaSettings, ...updates };
    setQuotaSettings(next);
    try {
      localStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify(next));
    } catch (e) {}
    triggerNotice('success', 'Pengaturan batas kuota teknisi berhasil disimpan!');
    toast.success('Pengaturan batas kuota penugasan teknisi berhasil disimpan.', 'Kuota Diperbarui');
  };

  // Persistent Column Settings
  const COLUMN_STORAGE_KEY = `morajaws_leader_columns_${currentUser.id || 'default'}`;
  const [tableColumns, setTableColumns] = useState<ColumnConfig[]>(() => {
    try {
      const saved = localStorage.getItem(COLUMN_STORAGE_KEY);
      if (saved) {
        const parsed: ColumnConfig[] = JSON.parse(saved);
        const orderedCols: ColumnConfig[] = [];
        parsed.forEach(c => {
          const def = DEFAULT_LEADER_COLUMNS.find(d => d.id === c.id);
          if (def) {
            orderedCols.push({ ...def, visible: c.visible });
          }
        });
        DEFAULT_LEADER_COLUMNS.forEach(def => {
          if (!orderedCols.some(c => c.id === def.id)) {
            orderedCols.push(def);
          }
        });
        return orderedCols;
      }
    } catch (e) {}
    return DEFAULT_LEADER_COLUMNS;
  });

  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);

  const handleSaveColumns = (newCols: ColumnConfig[]) => {
    setTableColumns(newCols);
    try {
      localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(newCols));
    } catch (e) {}
  };

  const handleResetColumns = () => {
    setTableColumns(DEFAULT_LEADER_COLUMNS);
    try {
      localStorage.removeItem(COLUMN_STORAGE_KEY);
    } catch (e) {}
    toast.info('Pengaturan kolom dikembalikan ke default.', 'Kolom Direset');
  };

  // Installer creation state
  const [instName, setInstName] = useState('');
  const [instUsername, setInstUsername] = useState('');
  const [instPhone, setInstPhone] = useState('');
  const [instEmail, setInstEmail] = useState('');
  const [installerSearch, setInstallerSearch] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  // Table Filters & Search
  const [statusFilter, setStatusFilter] = useState<LeaderStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInstallerFilter, setSelectedInstallerFilter] = useState<string>('ALL');
  
  // Date Range Filter for Assign WO (Strict Asia/Jakarta Appointment Date - Default Today)
  const todayWIB = getJakartaDateString(0);
  const [dateFilterType, setDateFilterTypeState] = useState<'all' | 'today' | 'tomorrow' | 'custom'>('today');
  const [customDateStart, setCustomDateStart] = useState<string>(todayWIB);
  const [customDateEnd, setCustomDateEnd] = useState<string>(todayWIB);
  const [appliedDateStart, setAppliedDateStart] = useState<string>(todayWIB);
  const [appliedDateEnd, setAppliedDateEnd] = useState<string>(todayWIB);

  const setDateFilterType = (type: 'all' | 'today' | 'tomorrow' | 'custom') => {
    setDateFilterTypeState(type);
    if (type === 'all') {
      setAppliedDateStart('');
      setAppliedDateEnd('');
    } else if (type === 'today') {
      const today = getJakartaDateString(0);
      setAppliedDateStart(today);
      setAppliedDateEnd(today);
    } else if (type === 'tomorrow') {
      const tomorrow = getJakartaDateString(1);
      setAppliedDateStart(tomorrow);
      setAppliedDateEnd(tomorrow);
    } else if (type === 'custom') {
      setAppliedDateStart(customDateStart);
      setAppliedDateEnd(customDateEnd);
    }
  };

  useEffect(() => {
    if (dateFilterType === 'custom') {
      setAppliedDateStart(customDateStart);
      setAppliedDateEnd(customDateEnd);
    }
  }, [dateFilterType, customDateStart, customDateEnd]);

  // Pagination & Rows per page
  const [rowsPerPage, setRowsPerPage] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Selected WOs for bulk operations
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);

  // Expanded rows map
  const [expandedRowIds, setExpandedRowIds] = useState<Record<string, boolean>>({});

  // Modals state
  const [selectedInstallerForDetail, setSelectedInstallerForDetail] = useState<User | null>(null);
  const [isUploadAssignModalOpen, setIsUploadAssignModalOpen] = useState(false);
  const [isBulkAssignModalOpen, setIsBulkAssignModalOpen] = useState(false);
  const [bulkTargetInstaller, setBulkTargetInstaller] = useState<string>('');
  const [bulkSlotTime, setBulkSlotTime] = useState<string>('');

  // Post-Assignment WhatsApp Notification Modal State
  const [assignmentNoticeModal, setAssignmentNoticeModal] = useState<{
    ticket: Ticket;
    installer: User;
    renderedMessage: string;
    targetPhone: string;
  } | null>(null);

  // Quota Warning Confirmation Modal State
  const [quotaWarningModal, setQuotaWarningModal] = useState<{
    ticket: Ticket;
    installerName: string;
    currentCount: number;
    maxLimit: number;
    slotTime?: string;
  } | null>(null);

  // Reassign WO Modal State (Full Audit & Transactional Handoff)
  const [reassignModalState, setReassignModalState] = useState<{
    isOpen: boolean;
    ticket: Ticket | null;
    targetInstaller: string;
    reason: string;
    isSubmitting: boolean;
    step: 'form' | 'confirm';
  }>({
    isOpen: false,
    ticket: null,
    targetInstaller: '',
    reason: '',
    isSubmitting: false,
    step: 'form'
  });

  const handleOpenReassignModal = (ticket: Ticket) => {
    if (!ticket.installerName) {
      toast.warning('Tiket ini belum memiliki teknisi. Silakan gunakan menu Assign WO untuk penugasan awal.', 'Belum Di-assign');
      return;
    }
    if (ticket.statusWOInstaller === 'Completed' || ticket.statusWOAgent === 'Closed') {
      toast.error('Tiket yang sudah berstatus Selesai (Completed) atau Ditutup (Closed) tidak dapat dialihkan / reassign.', 'Reassign Ditolak');
      return;
    }
    setReassignModalState({
      isOpen: true,
      ticket,
      targetInstaller: '',
      reason: '',
      isSubmitting: false,
      step: 'form'
    });
  };

  const handleExecuteReassign = async () => {
    if (!reassignModalState.ticket) return;
    if (!reassignModalState.targetInstaller) {
      toast.error('Pilih teknisi baru yang akan menerima tugas WO.', 'Pilih Teknisi');
      return;
    }
    if (!reassignModalState.reason || reassignModalState.reason.trim().length < 5) {
      toast.error('Mohon masukkan alasan reassign yang jelas (minimal 5 karakter).', 'Alasan Diperlukan');
      return;
    }

    setReassignModalState(prev => ({ ...prev, isSubmitting: true }));
    const result = reassignTicketPersonnel(
      reassignModalState.ticket.id,
      reassignModalState.targetInstaller,
      reassignModalState.reason.trim()
    );
    setReassignModalState(prev => ({ ...prev, isSubmitting: false }));

    if (result.success) {
      setReassignModalState({
        isOpen: false,
        ticket: null,
        targetInstaller: '',
        reason: '',
        isSubmitting: false,
        step: 'form'
      });
    }
  };

  // Scoped tickets for this Leader's contractor
  const contractorTickets = useMemo(() => {
    return currentUser.role === 'super_admin'
      ? tickets.filter(t => !t.isArchived && !t.isDeleted)
      : tickets.filter(t => {
          if (t.isArchived || t.isDeleted) return false;
          const cName = t.contactorName || t.contractorName || '';
          return !leaderContractor || cName.toLowerCase() === leaderContractor.toLowerCase();
        });
  }, [tickets, currentUser.role, leaderContractor]);

  // Installers belonging to this contractor
  const myInstallers = useMemo(() => {
    return users.filter(
      u => u.role === 'installer' && (currentUser.role === 'super_admin' || u.contractor === leaderContractor)
    );
  }, [users, currentUser.role, leaderContractor]);

  const triggerNotice = (type: 'success' | 'error' | 'warning', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 4500);
  };

  // Refresh handler
  const handleRefresh = () => {
    setLastRefreshedAt(new Date().toISOString());
    toast.success('Data Portal Leader berhasil diperbarui dari database.', 'Data Diperbarui');
  };

  // Operational Status Classification Helper
  const classifyTicketOperational = (t: Ticket): {
    category: 'unassigned' | 'waiting' | 'in_progress' | 'completed' | 'pending' | 'problem';
    label: string;
    progressPercent: number;
    color: string;
  } => {
    // 1. Unassigned
    if (!t.installerName) {
      return { category: 'unassigned', label: 'Belum Di-assign', progressPercent: 0, color: 'text-slate-500' };
    }

    // 2. Problem / Cancelled
    if (
      t.statusWOInstaller === 'Failed / Cancelled' ||
      t.statusWOAgent === 'Cancelled' ||
      t.statusWhatsApp === 'cancelled'
    ) {
      return { category: 'problem', label: 'Bermasalah / Batal', progressPercent: 10, color: 'text-rose-600' };
    }

    // 3. Completed
    if (
      t.statusWOInstaller === 'Completed' ||
      t.statusWOInstaller === 'Installed' ||
      t.statusWOAgent === 'Resolved' ||
      t.statusWOAgent === 'Closed'
    ) {
      return { category: 'completed', label: 'Selesai', progressPercent: 100, color: 'text-emerald-600' };
    }

    // 4. Pending / Reschedule / On Hold
    if (
      t.statusWOInstaller === 'Pending Technical' ||
      t.statusWhatsApp === 'reschedule_requested' ||
      String(t.remarksWOInstaller ?? '').toLowerCase().includes('reschedule') ||
      String(t.remarksAgent ?? '').toLowerCase().includes('reschedule')
    ) {
      return { category: 'pending', label: 'Tertunda / Reschedule', progressPercent: 40, color: 'text-amber-600' };
    }

    // 5. In Progress (En Route, On Site)
    if (
      t.statusWOInstaller === 'En Route' ||
      t.statusWOInstaller === 'On Site' ||
      t.statusWOAgent === 'In Progress'
    ) {
      return { category: 'in_progress', label: 'Sedang Dikerjakan', progressPercent: 65, color: 'text-blue-600' };
    }

    // 6. Waiting / Belum Dimulai (Assigned but not yet departed)
    return { category: 'waiting', label: 'Menunggu Pengerjaan', progressPercent: 20, color: 'text-slate-600' };
  };

  // Get Installer Work Order Count for a specific target date
  const getInstallerWOCountForDate = (installerName: string, targetDate?: string): number => {
    return contractorTickets.filter(t => {
      if (t.installerName?.toLowerCase().trim() !== installerName.toLowerCase().trim()) return false;
      if (targetDate) {
        const rawDate = t.appointmentDate;
        const parsed = parseAppointmentDate(rawDate);
        const tDate = parsed.date || (rawDate ? String(rawDate).slice(0, 10) : '');
        return tDate === targetDate;
      }
      return t.statusWOInstaller !== 'Completed' && t.statusWOInstaller !== 'Failed / Cancelled';
    }).length;
  };

  // Maximum quota limit for technician
  const getMaxQuotaForInstaller = (installerName: string): number => {
    return quotaSettings.customInstallerLimits[installerName] || quotaSettings.defaultMaxDailyQuota;
  };

  // 10 ACCURATE SUMMARY METRICS (Requirement 1: Strictly counts WO with appointment date = today in Asia/Jakarta WIB)
  const summaryMetrics = useMemo(() => {
    let unassigned = 0;
    let assigned = 0;
    let waiting = 0;
    let inProgress = 0;
    let completed = 0;
    let pending = 0;
    let problem = 0;

    const todayDateStr = getJakartaDateString(0);
    const todayContractorTickets = contractorTickets.filter(t => getTicketAppointmentDate(t) === todayDateStr);

    todayContractorTickets.forEach(t => {
      const { category } = classifyTicketOperational(t);
      if (category === 'unassigned') {
        unassigned++;
      } else {
        assigned++;
        if (category === 'waiting') waiting++;
        else if (category === 'in_progress') inProgress++;
        else if (category === 'completed') completed++;
        else if (category === 'pending') pending++;
        else if (category === 'problem') problem++;
      }
    });

    const activeInstallers = myInstallers.filter(u => u.active).length;

    // Installers with 0 active tickets assigned for today
    const installerActiveTicketsMap = new Map<string, number>();
    todayContractorTickets.forEach(t => {
      if (t.installerName && t.statusWOInstaller !== 'Completed' && t.statusWOInstaller !== 'Failed / Cancelled') {
        const key = t.installerName.toLowerCase().trim();
        installerActiveTicketsMap.set(key, (installerActiveTicketsMap.get(key) || 0) + 1);
      }
    });

    const idleInstallers = myInstallers.filter(u => {
      const count = installerActiveTicketsMap.get(u.name.toLowerCase().trim()) || 0;
      return count === 0;
    }).length;

    return {
      total: todayContractorTickets.length,
      unassigned,
      assigned,
      waiting,
      inProgress,
      completed,
      pending,
      problem,
      activeInstallers,
      idleInstallers
    };
  }, [contractorTickets, myInstallers]);

  // INSTALLER PROGRESS MONITORING ROWS (Section 4 & 5 - strictly counts appointment date today)
  const installerProgressRows = useMemo(() => {
    const todayDateStr = getJakartaDateString(0);
    const todayContractorTickets = contractorTickets.filter(t => getTicketAppointmentDate(t) === todayDateStr);

    return myInstallers.map(inst => {
      const instTickets = todayContractorTickets.filter(
        t => t.installerName?.toLowerCase().trim() === inst.name.toLowerCase().trim()
      );

      let notStarted = 0;
      let inProgress = 0;
      let finished = 0;
      let pending = 0;

      instTickets.forEach(t => {
        const { category } = classifyTicketOperational(t);
        if (category === 'waiting') notStarted++;
        else if (category === 'in_progress') inProgress++;
        else if (category === 'completed') finished++;
        else if (category === 'pending' || category === 'problem') pending++;
      });

      const total = instTickets.length;
      const progressPercent = total > 0 ? Math.round((finished / total) * 100) : 0;
      const maxQuota = getMaxQuotaForInstaller(inst.name);

      return {
        installer: inst,
        totalWO: total,
        notStarted,
        inProgress,
        finished,
        pending,
        progressPercent,
        maxQuota
      };
    });
  }, [myInstallers, contractorTickets, quotaSettings]);

  // FILTERED WORK ORDERS FOR DETAIL TABLE (Section 6, 7 & 8)
  const filteredTickets = useMemo(() => {
    return contractorTickets.filter(t => {
      const { category } = classifyTicketOperational(t);

      // Status filter
      if (statusFilter === 'unassigned' && t.installerName) return false;
      if (statusFilter === 'assigned' && !t.installerName) return false;
      if (statusFilter === 'waiting' && category !== 'waiting') return false;
      if (statusFilter === 'in_progress' && category !== 'in_progress') return false;
      if (statusFilter === 'completed' && category !== 'completed') return false;
      if (statusFilter === 'pending' && category !== 'pending') return false;
      if (statusFilter === 'problem' && category !== 'problem') return false;

      // Installer dropdown filter
      if (selectedInstallerFilter !== 'ALL') {
        if ((t.installerName || '').toLowerCase().trim() !== selectedInstallerFilter.toLowerCase().trim()) {
          return false;
        }
      }

      // Date Range Filter (Strict Asia/Jakarta Appointment Date - Default Today or Applied Range)
      const ticketDate = getTicketAppointmentDate(t);
      if (!ticketDate) return false;
      if (appliedDateStart && ticketDate < appliedDateStart) return false;
      if (appliedDateEnd && ticketDate > appliedDateEnd) return false;

      // Search query filter (WO Number, Customer ID, Customer Name, Phone, Installer, Cluster, Street)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchWo = String(t.woNumber ?? '').toLowerCase().includes(q);
        const matchCustId = String(t.idCustomer || '').toLowerCase().includes(q);
        const matchCustName = String(t.customerName || '').toLowerCase().includes(q);
        const matchPhone = String(t.customerPhone || '').toLowerCase().includes(q);
        const matchInst = String(t.installerName || '').toLowerCase().includes(q);
        const matchCluster = String(t.clusterName || '').toLowerCase().includes(q);
        const matchStreet = String(t.streetName || '').toLowerCase().includes(q);
        const matchArea = String(t.area || '').toLowerCase().includes(q);

        if (!matchWo && !matchCustId && !matchCustName && !matchPhone && !matchInst && !matchCluster && !matchStreet && !matchArea) {
          return false;
        }
      }

      return true;
    });
  }, [
    contractorTickets,
    statusFilter,
    selectedInstallerFilter,
    appliedDateStart,
    appliedDateEnd,
    searchQuery
  ]);

  // Sorting State for Leader Assign WO Table
  const [sortState, setSortState] = useState<SortState>({
    column: null,
    direction: null
  });

  const handleSort = (columnKey: string) => {
    setSortState(prev => {
      const nextDir = getNextSortDirection(prev.column, prev.direction, columnKey);
      return {
        column: nextDir ? columnKey : null,
        direction: nextDir
      };
    });
    setCurrentPage(1);
  };

  // Sorted Work Orders
  const sortedTickets = useMemo(() => {
    if (!sortState.column || !sortState.direction) {
      return filteredTickets;
    }

    return sortDataArray(filteredTickets, sortState, (t: Ticket, col: string) => {
      switch (col) {
        case 'woNumber':
          return t.woNumber || '';
        case 'date':
          return t.date || '';
        case 'idCustomer':
          return t.idCustomer || t.customerId || '';
        case 'customerName':
          return t.customerName || '';
        case 'customerPhone':
          return t.customerPhone || '';
        case 'area':
          return t.area || '';
        case 'clusterName':
          return t.clusterName || '';
        case 'streetName':
          return t.streetName || t.clusterName || '';
        case 'appointmentDate':
          return getTicketAppointmentDate(t) || t.appointmentDate || '';
        case 'slotTime':
          return t.slotTime || '';
        case 'contractor':
          return t.contactorName || t.contractorName || '';
        case 'installer':
          return t.installerName || '';
        case 'status': {
          const { label } = classifyTicketOperational(t);
          return label || t.statusWOInstaller || '';
        }
        case 'workStatus': {
          const ws = getTicketWorkStatus(t);
          return ws.status;
        }
        case 'checkInAt':
          return t.checkInAt || '';
        case 'checkOutAt':
          return t.checkOutAt || '';
        case 'workDuration':
          return t.workDurationMinutes || 0;
        case 'progress': {
          const { progressPercent } = classifyTicketOperational(t);
          return progressPercent;
        }
        case 'lastUpdate':
          return t.updatedAt || t.dateUpload || t.createdAt || '';
        default:
          return (t as any)[col] || '';
      }
    });
  }, [filteredTickets, sortState]);

  // Paginated Rows
  const totalPages = rowsPerPage === -1 ? 1 : Math.max(1, Math.ceil(sortedTickets.length / rowsPerPage));
  const paginatedTickets = useMemo(() => {
    if (rowsPerPage === -1) return sortedTickets;
    const start = (currentPage - 1) * rowsPerPage;
    return sortedTickets.slice(start, start + rowsPerPage);
  }, [sortedTickets, currentPage, rowsPerPage]);

  // Checkbox selection helpers (Realtime "Selected Data: N")
  const isAllPageSelected =
    paginatedTickets.length > 0 &&
    paginatedTickets.every(t => selectedTicketIds.includes(t.id));

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const pageIds = paginatedTickets.map(t => t.id);
      setSelectedTicketIds(prev => Array.from(new Set([...prev, ...pageIds])));
    } else {
      const pageIdSet = new Set(paginatedTickets.map(t => t.id));
      setSelectedTicketIds(prev => prev.filter(id => !pageIdSet.has(id)));
    }
  };

  const handleToggleSelectTicket = (id: string) => {
    setSelectedTicketIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const toggleRowExpansion = (id: string) => {
    setExpandedRowIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Format Helper for Dates
  const formatDisplayTime = (isoString?: string | null) => {
    if (!isoString) return '-';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) + ' WIB';
    } catch {
      return isoString;
    }
  };

  // Build WhatsApp Message for Installer
  const buildInstallerAssignmentMessage = (ticket: Ticket, installer: User): string => {
    const template = templates.find(
      t => t.id === 'tpl_installer_assignment' || t.category === 'Penugasan Teknisi Lapangan'
    );

    const ticketDataWithExtras: any = {
      ...ticket,
      installerName: installer.name,
      installerContact: installer.phone || '',
      installerPhone: installer.phone || '',
      leaderName: currentUser.name,
      contractorName: leaderContractor,
      contactorName: leaderContractor,
      appointmentDate: ticket.appointmentDate || '',
      appointment_date: ticket.appointmentDate || '',
      street_alternatif: ticket.streetAlternatif || 'Tidak ada patokan khusus'
    };

    if (template) {
      const res = renderWhatsAppMessage(template.messageBody, ticketDataWithExtras);
      return res.renderedText;
    }

    return `Halo Rekan Teknisi ${installer.name},\n\nAda penugasan Work Order baru untuk Anda dari Korlap (${currentUser.name} - ${leaderContractor}):\n\n📌 Detail Work Order:\n- No. WO: ${ticket.woNumber}\n- Kategori: ${ticket.ticketCategory}\n- Tanggal Kunjungan: ${ticket.appointmentDate || 'Belum Ditentukan'}\n- Slot Waktu: ${ticket.slotTime}\n\n📍 Lokasi Pelanggan:\n- Nama: ${ticket.customerName}\n- No. Kontak: ${ticket.customerPhone}\n- Alamat: ${ticket.streetName || '-'}\n- Patokan: ${ticket.streetAlternatif || '-'}\n- Cluster: ${ticket.clusterName || '-'}\n- Area: ${ticket.area}\n\n🔧 Data Jaringan:\n- OLT/FDT: ${ticket.fdtCode || '-'}\n- FAT Code: ${ticket.fatCode || '-'}\n\nHarap segera konfirmasi penerimaan tugas melalui Portal Teknisi Lapangan.\nTerima kasih, selamat bertugas!`;
  };

  // Single Ticket Assignment
  const handleAssignTicket = (ticket: Ticket, installerName: string, slotTime?: string, bypassWarning = false) => {
    if (!installerName) return;

    const installerUser = myInstallers.find(
      u => u.name.toLowerCase().trim() === installerName.toLowerCase().trim()
    );

    const targetDate = ticket.appointmentDate || scheduleDate;
    const currentCount = getInstallerWOCountForDate(installerName, targetDate);
    const maxLimit = getMaxQuotaForInstaller(installerName);

    if (currentCount >= maxLimit && !bypassWarning) {
      if (quotaSettings.enforceStrictLimit) {
        const quotaErrMsg = `Batas Kuota Tercapai: Teknisi ${installerName} sudah memiliki ${currentCount} WO pada tanggal ${targetDate} (Batas Kuota: ${maxLimit} WO).`;
        triggerNotice('error', quotaErrMsg);
        toast.error(quotaErrMsg, 'Batas Kuota Tercapai');
        return;
      } else {
        toast.warning(`Teknisi ${installerName} melampaui kuota harian (${currentCount}/${maxLimit} WO).`, 'Peringatan Kuota');
        setQuotaWarningModal({
          ticket,
          installerName,
          currentCount,
          maxLimit,
          slotTime
        });
        return;
      }
    }

    assignTicketPersonnel(ticket.id, currentUser.name, installerName);

    triggerNotice(
      'success',
      `WO ${ticket.woNumber} berhasil ditugaskan ke teknisi ${installerName}!`
    );

    if (installerUser) {
      const msg = buildInstallerAssignmentMessage(ticket, installerUser);
      setAssignmentNoticeModal({
        ticket,
        installer: installerUser,
        renderedMessage: msg,
        targetPhone: installerUser.phone || ''
      });
    }
  };

  // Bulk Assign Confirmation Execution
  const handleExecuteBulkAssignModal = () => {
    if (!bulkTargetInstaller) {
      toast.error('Pilih teknisi tujuan penugasan.', 'Validasi Gagal');
      return;
    }

    if (selectedTicketIds.length === 0) {
      toast.error('Tidak ada Work Order yang dipilih.', 'Validasi Gagal');
      return;
    }

    const res = bulkAssignPersonnel(selectedTicketIds, currentUser.name, bulkTargetInstaller, bulkSlotTime || undefined);
    if (res.success) {
      toast.success(`Berhasil menugaskan ${res.count} Work Order ke teknisi ${bulkTargetInstaller}.`, 'Penugasan Sukses');
      setSelectedTicketIds([]);
      setIsBulkAssignModalOpen(false);

      const targetInst = myInstallers.find(u => u.name === bulkTargetInstaller);
      if (targetInst && selectedTicketIds.length === 1) {
        const t = contractorTickets.find(item => item.id === selectedTicketIds[0]);
        if (t) {
          const msg = buildInstallerAssignmentMessage(t, targetInst);
          setAssignmentNoticeModal({
            ticket: t,
            installer: targetInst,
            renderedMessage: msg,
            targetPhone: targetInst.phone || ''
          });
        }
      }
    }
  };

  // Export handlers (Copy, CSV, Excel, Print)
  const handleExportCopy = () => {
    if (sortedTickets.length === 0) return;
    const headers = ['WO Number', 'Tanggal', 'Customer ID', 'Customer Name', 'Phone', 'Slot', 'Cluster', 'Street', 'Teknisi', 'Status'];
    const rows = sortedTickets.map(t => [
      t.woNumber,
      t.appointmentDate || '-',
      t.idCustomer,
      t.customerName,
      t.customerPhone,
      t.slotTime,
      t.clusterName || '-',
      t.streetName || '-',
      t.installerName || 'Unassigned',
      t.statusWOInstaller
    ]);
    const tsv = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
    navigator.clipboard.writeText(tsv);
    toast.success(`${sortedTickets.length} baris data berhasil disalin ke clipboard (TSV format).`, 'Data Disalin');
  };

  const handleExportCSV = () => {
    if (sortedTickets.length === 0) return;
    const worksheet = XLSX.utils.json_to_sheet(
      sortedTickets.map(t => ({
        'WO Number': t.woNumber,
        'Tanggal WO': t.appointmentDate || '',
        'Appointment Date': t.appointmentDate || '',
        'Customer ID': t.idCustomer,
        'Customer Name': t.customerName,
        'Customer Phone': t.customerPhone,
        'Area': t.area,
        'Cluster Name': t.clusterName || '',
        'Street Name': t.streetName || '',
        'Slot Time': t.slotTime,
        'Ticket Category': t.ticketCategory,
        'Teknisi': t.installerName || 'Unassigned',
        'Status Installer': t.statusWOInstaller,
        'Status Agent': t.statusWOAgent
      }))
    );
    const csvOutput = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `assign_data_wo_${leaderContractor.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Berkas CSV berhasil diunduh.', 'Ekspor CSV');
  };

  const handleExportExcel = () => {
    if (sortedTickets.length === 0) return;
    const worksheet = XLSX.utils.json_to_sheet(
      sortedTickets.map(t => ({
        'WO Number': t.woNumber,
        'Tanggal WO': t.appointmentDate || '',
        'Appointment Date': t.appointmentDate || '',
        'Customer ID': t.idCustomer,
        'Customer Name': t.customerName,
        'Customer Phone': t.customerPhone,
        'Area': t.area,
        'Cluster Name': t.clusterName || '',
        'Street Name': t.streetName || '',
        'Slot Time': t.slotTime,
        'Ticket Category': t.ticketCategory,
        'Teknisi': t.installerName || 'Unassigned',
        'Status Installer': t.statusWOInstaller,
        'Status Agent': t.statusWOAgent,
        'Remarks': t.remarksWOInstaller || ''
      }))
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Assign WO Data');
    XLSX.writeFile(
      workbook,
      `Assign_Data_WO_${leaderContractor.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
    toast.success('Berkas Excel (.xlsx) berhasil diunduh.', 'Ekspor Excel');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = () => {
    window.print();
  };

  const handleApplyDateSearch = () => {
    setAppliedDateStart(customDateStart);
    setAppliedDateEnd(customDateEnd);
    setCurrentPage(1);
    toast.info(`Menampilkan Work Order tanggal ${customDateStart} s/d ${customDateEnd}.`, 'Filter Tanggal');
  };

  const handleResetDateToday = () => {
    setCustomDateStart(todayWIB);
    setCustomDateEnd(todayWIB);
    setAppliedDateStart(todayWIB);
    setAppliedDateEnd(todayWIB);
    setCurrentPage(1);
    toast.info(`Menampilkan Work Order hari ini (${todayWIB}).`, 'Filter Hari Ini');
  };

  // Check if column is visible and get ordered visible columns
  const isColVisible = (id: string) => {
    const col = tableColumns.find(c => c.id === id);
    return col ? col.visible : true;
  };
  const visibleColumns = useMemo(() => tableColumns.filter(c => c.visible), [tableColumns]);

  const renderHeaderCell = (col: ColumnConfig) => {
    switch (col.id) {
      case 'checkbox':
        return (
          <th key={col.id} className="py-2.5 px-3 text-center w-8">
            <input
              type="checkbox"
              checked={
                sortedTickets.length > 0 &&
                selectedTicketIds.length === sortedTickets.length
              }
              onChange={handleSelectAll}
              className="w-4 h-4 text-indigo-600 rounded border-slate-300 dark:border-slate-700 cursor-pointer"
            />
          </th>
        );
      case 'woNumber':
        return (
          <th key={col.id} className="py-2.5 px-3 min-w-[130px]">
            <SortableColumnHeader
              label="WO Number"
              columnKey="woNumber"
              currentSortColumn={sortState.column}
              currentDirection={sortState.direction}
              dataType="wo_number"
              onSort={handleSort}
            />
          </th>
        );
      case 'date':
        return (
          <th key={col.id} className="py-2.5 px-3 min-w-[120px]">
            <SortableColumnHeader
              label="Tanggal WO"
              columnKey="date"
              currentSortColumn={sortState.column}
              currentDirection={sortState.direction}
              dataType="date"
              onSort={handleSort}
            />
          </th>
        );
      case 'idCustomer':
        return (
          <th key={col.id} className="py-2.5 px-3 min-w-[110px]">
            <SortableColumnHeader
              label="Customer ID"
              columnKey="idCustomer"
              currentSortColumn={sortState.column}
              currentDirection={sortState.direction}
              dataType="number"
              onSort={handleSort}
            />
          </th>
        );
      case 'customerName':
        return (
          <th key={col.id} className="py-2.5 px-3 min-w-[150px]">
            <SortableColumnHeader
              label="Nama Pelanggan"
              columnKey="customerName"
              currentSortColumn={sortState.column}
              currentDirection={sortState.direction}
              dataType="text"
              onSort={handleSort}
            />
          </th>
        );
      case 'customerPhone':
        return (
          <th key={col.id} className="py-2.5 px-3 min-w-[120px]">
            <SortableColumnHeader
              label="Kontak"
              columnKey="customerPhone"
              currentSortColumn={sortState.column}
              currentDirection={sortState.direction}
              dataType="text"
              onSort={handleSort}
            />
          </th>
        );
      case 'area':
        return (
          <th key={col.id} className="py-2.5 px-3 min-w-[100px]">
            <SortableColumnHeader
              label="Area"
              columnKey="area"
              currentSortColumn={sortState.column}
              currentDirection={sortState.direction}
              dataType="text"
              onSort={handleSort}
            />
          </th>
        );
      case 'clusterName':
        return (
          <th key={col.id} className="py-2.5 px-3 min-w-[130px]">
            <SortableColumnHeader
              label="Cluster"
              columnKey="clusterName"
              currentSortColumn={sortState.column}
              currentDirection={sortState.direction}
              dataType="text"
              onSort={handleSort}
            />
          </th>
        );
      case 'streetName':
        return (
          <th key={col.id} className="py-2.5 px-3 min-w-[180px]">
            <SortableColumnHeader
              label="Alamat / Street Name"
              columnKey="streetName"
              currentSortColumn={sortState.column}
              currentDirection={sortState.direction}
              dataType="text"
              onSort={handleSort}
            />
          </th>
        );
      case 'appointmentDate':
        return (
          <th key={col.id} className="py-2.5 px-3 min-w-[130px]">
            <SortableColumnHeader
              label="Appointment"
              columnKey="appointmentDate"
              currentSortColumn={sortState.column}
              currentDirection={sortState.direction}
              dataType="date"
              onSort={handleSort}
            />
          </th>
        );
      case 'slotTime':
        return (
          <th key={col.id} className="py-2.5 px-3 min-w-[120px] whitespace-nowrap">
            <SortableColumnHeader
              label="Slot Time"
              columnKey="slotTime"
              currentSortColumn={sortState.column}
              currentDirection={sortState.direction}
              dataType="time_slot"
              onSort={handleSort}
            />
          </th>
        );
      case 'contractor':
        return (
          <th key={col.id} className="py-2.5 px-3 min-w-[130px]">
            <SortableColumnHeader
              label="Kontraktor"
              columnKey="contractor"
              currentSortColumn={sortState.column}
              currentDirection={sortState.direction}
              dataType="text"
              onSort={handleSort}
            />
          </th>
        );
      case 'installer':
        return (
          <th key={col.id} className="py-2.5 px-3 min-w-[170px]">
            <SortableColumnHeader
              label="Teknisi / Installer"
              columnKey="installer"
              currentSortColumn={sortState.column}
              currentDirection={sortState.direction}
              dataType="text"
              onSort={handleSort}
            />
          </th>
        );
      case 'status':
        return (
          <th key={col.id} className="py-2.5 px-3 min-w-[130px]">
            <SortableColumnHeader
              label="Status WO"
              columnKey="status"
              currentSortColumn={sortState.column}
              currentDirection={sortState.direction}
              dataType="status"
              onSort={handleSort}
            />
          </th>
        );
      case 'workStatus':
        return (
          <th key={col.id} className="py-2.5 px-3 min-w-[120px] text-center">
            <SortableColumnHeader
              label="Status Kerja"
              columnKey="workStatus"
              currentSortColumn={sortState.column}
              currentDirection={sortState.direction}
              dataType="text"
              onSort={handleSort}
            />
          </th>
        );
      case 'checkInAt':
        return (
          <th key={col.id} className="py-2.5 px-3 min-w-[120px]">
            <SortableColumnHeader
              label="Check-in"
              columnKey="checkInAt"
              currentSortColumn={sortState.column}
              currentDirection={sortState.direction}
              dataType="date"
              onSort={handleSort}
            />
          </th>
        );
      case 'checkOutAt':
        return (
          <th key={col.id} className="py-2.5 px-3 min-w-[120px]">
            <SortableColumnHeader
              label="Check-out"
              columnKey="checkOutAt"
              currentSortColumn={sortState.column}
              currentDirection={sortState.direction}
              dataType="date"
              onSort={handleSort}
            />
          </th>
        );
      case 'workDuration':
        return (
          <th key={col.id} className="py-2.5 px-3 min-w-[110px]">
            <SortableColumnHeader
              label="Durasi Kerja"
              columnKey="workDuration"
              currentSortColumn={sortState.column}
              currentDirection={sortState.direction}
              dataType="number"
              onSort={handleSort}
            />
          </th>
        );
      case 'progress':
        return (
          <th key={col.id} className="py-2.5 px-3 min-w-[130px]">
            <SortableColumnHeader
              label="Progress"
              columnKey="progress"
              currentSortColumn={sortState.column}
              currentDirection={sortState.direction}
              dataType="number"
              onSort={handleSort}
            />
          </th>
        );
      case 'lastUpdate':
        return (
          <th key={col.id} className="py-2.5 px-3 min-w-[120px]">
            <SortableColumnHeader
              label="Update"
              columnKey="lastUpdate"
              currentSortColumn={sortState.column}
              currentDirection={sortState.direction}
              dataType="date"
              onSort={handleSort}
            />
          </th>
        );
      case 'action':
        return (
          <th key={col.id} className="py-2.5 px-3 text-center min-w-[120px]">
            Action
          </th>
        );
      default:
        return (
          <th key={col.id} className="py-2.5 px-3 min-w-[100px]">
            {col.label}
          </th>
        );
    }
  };

  const renderBodyCell = (
    col: ColumnConfig,
    t: Ticket,
    isSelected: boolean,
    isExpanded: boolean,
    label: string,
    progressPercent: number
  ) => {
    switch (col.id) {
      case 'checkbox':
        return (
          <td key={col.id} className="py-2.5 px-3 text-center">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => handleToggleSelectTicket(t.id)}
              className="w-4 h-4 text-indigo-600 rounded border-slate-300 dark:border-slate-700"
            />
          </td>
        );
      case 'woNumber':
        return (
          <td key={col.id} className="py-2.5 px-3 font-mono font-semibold">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => toggleRowExpansion(t.id)}
                className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                title="Buka / Tutup Rincian Alamat & Teknis"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-indigo-600" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>
              <span
                onClick={() => onSelectTicket(t)}
                className="text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                {t.woNumber}
              </span>
            </div>
          </td>
        );
      case 'date':
        return (
          <td key={col.id} className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">
            {t.date || '-'}
          </td>
        );
      case 'idCustomer':
        return (
          <td key={col.id} className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-300">
            {t.idCustomer}
          </td>
        );
      case 'customerName':
        return (
          <td key={col.id} className="py-2.5 px-3 font-medium text-slate-900 dark:text-white">
            {t.customerName}
          </td>
        );
      case 'customerPhone':
        return (
          <td key={col.id} className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
            {t.customerPhone}
          </td>
        );
      case 'area':
        return (
          <td key={col.id} className="py-2.5 px-3">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-semibold bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
              {t.area || '-'}
            </span>
          </td>
        );
      case 'clusterName':
        return (
          <td key={col.id} className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
            {t.clusterName || '-'}
          </td>
        );
      case 'streetName':
        return (
          <td key={col.id} className="py-2.5 px-3 text-slate-600 dark:text-slate-400 max-w-xs">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openCustomerAddressInGoogleMaps(t);
              }}
              className="flex items-center gap-1.5 text-left text-slate-700 dark:text-slate-200 hover:text-purple-700 dark:hover:text-purple-300 transition-colors group cursor-pointer max-w-full"
              title="Klik untuk membuka lokasi di Google Maps"
            >
              <MapPin className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0 group-hover:scale-110 transition-transform" />
              <span className="truncate group-hover:underline">{t.streetName || t.clusterName || '-'}</span>
            </button>
          </td>
        );
      case 'appointmentDate':
        return (
          <td key={col.id} className="py-2.5 px-3 font-mono whitespace-nowrap text-slate-700 dark:text-slate-300">
            {t.appointmentDate || '-'}
          </td>
        );
      case 'slotTime':
        return (
          <td key={col.id} className="py-2.5 px-3 font-medium whitespace-nowrap text-slate-800 dark:text-slate-200">
            {t.slotTime}
          </td>
        );
      case 'contractor':
        return (
          <td key={col.id} className="py-2.5 px-3 text-slate-500">
            {t.contactorName || t.contractorName || '-'}
          </td>
        );
      case 'installer':
        return (
          <td key={col.id} className="py-2.5 px-3">
            <select
              value={t.installerName || ''}
              onChange={e => {
                if (e.target.value !== t.installerName) {
                  handleAssignTicket(t, e.target.value, t.slotTime);
                }
              }}
              className={`w-full px-2 py-1 text-xs rounded-lg border font-medium ${
                t.installerName
                  ? 'bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700'
                  : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800 font-bold'
              }`}
            >
              <option value="">{t.installerName ? 'Ganti Teknisi...' : 'Pilih Teknisi...'}</option>
              {myInstallers.map(inst => {
                const targetDate = t.appointmentDate || scheduleDate;
                const currentCount = getInstallerWOCountForDate(inst.name, targetDate);
                const maxLimit = getMaxQuotaForInstaller(inst.name);
                return (
                  <option key={inst.id} value={inst.name}>
                    {inst.name} ({currentCount}/{maxLimit} WO)
                  </option>
                );
              })}
            </select>
          </td>
        );
      case 'status':
        return (
          <td key={col.id} className="py-2.5 px-3 whitespace-nowrap">
            <StatusInstallerBadge status={t.statusWOInstaller} />
          </td>
        );
      case 'workStatus': {
        const ws = getTicketWorkStatus(t);
        return (
          <td key={col.id} className="py-2.5 px-3 text-center whitespace-nowrap">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
              ws.status === 'Selesai'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                : ws.status === 'Sedang Dikerjakan'
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}>
              {ws.status}
            </span>
          </td>
        );
      }
      case 'checkInAt':
        return (
          <td key={col.id} className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300 whitespace-nowrap">
            {t.checkInAt ? formatJakartaTimeOnly(t.checkInAt) : '-'}
          </td>
        );
      case 'checkOutAt':
        return (
          <td key={col.id} className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300 whitespace-nowrap">
            {t.checkOutAt ? formatJakartaTimeOnly(t.checkOutAt) : '-'}
          </td>
        );
      case 'workDuration':
        return (
          <td key={col.id} className="py-2.5 px-3 text-[11px] font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
            {getTicketWorkStatus(t).durationFormatted}
          </td>
        );
      case 'progress':
        return (
          <td key={col.id} className="py-2.5 px-3 align-middle">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-semibold text-slate-600 dark:text-slate-400">{label}</span>
                <span className="font-mono font-bold">{progressPercent}%</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    progressPercent === 100
                      ? 'bg-emerald-500'
                      : progressPercent > 50
                      ? 'bg-blue-500'
                      : progressPercent > 0
                      ? 'bg-amber-500'
                      : 'bg-slate-300'
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </td>
        );
      case 'lastUpdate':
        return (
          <td key={col.id} className="py-2.5 px-3 font-mono text-[10.5px] text-slate-400 whitespace-nowrap">
            {t.updatedAt?.slice(5, 16).replace('T', ' ') || '-'}
          </td>
        );
      case 'action':
        return (
          <td key={col.id} className="py-2.5 px-3 text-center">
            <div className="flex items-center justify-center gap-1.5">
              <button
                type="button"
                onClick={() => onSelectTicket(t)}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded text-slate-700 dark:text-slate-200 font-semibold text-xs cursor-pointer"
              >
                Detail
              </button>

              {t.installerName && (
                <>
                  <button
                    type="button"
                    onClick={() => handleOpenReassignModal(t)}
                    className="px-2 py-1 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 rounded font-semibold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                    title="Reassign / Alihkan penugasan WO ke teknisi lain"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reassign</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const instUser = myInstallers.find(u => u.name === t.installerName);
                      if (instUser) {
                        const msg = buildInstallerAssignmentMessage(t, instUser);
                        setAssignmentNoticeModal({
                          ticket: t,
                          installer: instUser,
                          renderedMessage: msg,
                          targetPhone: instUser.phone || ''
                        });
                      }
                    }}
                    className="p-1 bg-emerald-50 dark:bg-emerald-950 text-emerald-600 hover:bg-emerald-100 rounded cursor-pointer"
                    title="Kirim pesan WhatsApp penugasan ke teknisi"
                  >
                    <Phone className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </td>
        );
      default:
        return (
          <td key={col.id} className="py-2.5 px-3">
            {String((t as any)[col.id] || '-')}
          </td>
        );
    }
  };

  // Add technician submit
  const handleAddInstaller = (e: React.FormEvent) => {
    e.preventDefault();
    if (!instName.trim() || !instUsername.trim() || !instPhone.trim()) {
      triggerNotice('error', 'Nama lengkap, username, dan nomor telepon WhatsApp wajib diisi.');
      return;
    }

    const res = registerInstallerAccount({
      name: instName,
      username: instUsername,
      phone: instPhone,
      email: instEmail
    });

    if (res.success) {
      toast.success('BERHASIL – Akun Installer berhasil dibuat.', 'Pendaftaran Sukses');
      triggerNotice('success', `Teknisi ${instName} berhasil didaftarkan ke ${displayContractor}! Password default: 12345678`);
      setInstName('');
      setInstUsername('');
      setInstPhone('');
      setInstEmail('');
    } else {
      toast.error(res.error || 'Gagal menambahkan installer.', 'Pendaftaran Gagal');
      triggerNotice('error', res.error || 'Gagal menambahkan installer.');
    }
  };

  return (
    <div className="space-y-5">
      {/* ============================================================ */}
      {/* 1. HEADER HALAMAN                                            */}
      {/* ============================================================ */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-md">
              <Users2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Portal & Dashboard Leader
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  {displayContractor}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  Area: {displayArea}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-500 dark:text-slate-400">
                <span>Koordinator: <strong className="text-slate-800 dark:text-slate-200">{currentUser.name}</strong></span>
                <span>•</span>
                <span className="font-mono text-[11px]">Terakhir diperbarui: {formatDisplayTime(lastRefreshedAt)}</span>
              </div>
            </div>
          </div>

          {/* Top Header Refresh Action */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRefresh}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl transition-all shadow-xs cursor-pointer"
              title="Perbarui data terbaru dari database"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Refresh Data</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation Ribbon for Leader */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('wo_assignment')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'wo_assignment'
                ? 'bg-[#5B35B1] text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Assign Work Order</span>
            {summaryMetrics.unassigned > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-500 text-white font-black">
                {summaryMetrics.unassigned}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('progress_dashboard')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'progress_dashboard'
                ? 'bg-[#5B35B1] text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Dashboard Progress WO</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('installer_mgmt')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'installer_mgmt'
                ? 'bg-[#5B35B1] text-white shadow-xs'
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
            }`}
          >
            <UserPlus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Kelola & Tambah Teknisi</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-emerald-600 text-white font-bold">
              {myInstallers.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('contractor_recap')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'contractor_recap'
                ? 'bg-[#5B35B1] text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Rekap Total WO</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('quota_settings')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'quota_settings'
                ? 'bg-[#5B35B1] text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Pengaturan Kuota</span>
          </button>
        </div>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div
          className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs shadow-xs transition-all ${
            notice.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : notice.type === 'warning'
              ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
              : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
          }`}
        >
          {notice.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
          {notice.type === 'warning' && <AlertTriangle className="w-4 h-4 shrink-0" />}
          {notice.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
          <span className="font-medium">{notice.text}</span>
        </div>
      )}

      {/* ============================================================ */}
      {/* DASHBOARD LEADER VIEW (BAGIAN 3.2: 10 KPI, SLA, BEBAN TEKNISI)*/}
      {/* ============================================================ */}
      {activeTab === 'dashboard' && (
        <div className="space-y-5">
          {/* 10 ACCURATE SUMMARY METRIC CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            {/* 1. Total WO */}
            <div className="bg-white dark:bg-[#1A0E2E] p-4 rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 dark:text-purple-300">
                <span className="text-xs font-semibold">Total WO Masuk</span>
                <Layers className="w-4 h-4 text-[#5B35B1]" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-black font-mono text-[#21183A] dark:text-white">
                  {summaryMetrics.total}
                </span>
                <span className="text-[10px] text-slate-400">Total WO</span>
              </div>
            </div>

            {/* 2. Belum Di-assign (HIGHLIGHT) */}
            <div
              onClick={() => setActiveTab('wo_assignment')}
              className={`p-4 rounded-2xl border-2 shadow-xs flex flex-col justify-between cursor-pointer transition-transform hover:scale-[1.02] ${
                summaryMetrics.unassigned > 0
                  ? 'bg-amber-500/10 border-amber-500/60 text-amber-900 dark:text-amber-200 animate-pulse'
                  : 'bg-white dark:bg-[#1A0E2E] border-[#D8CCF3] dark:border-purple-900/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400">Belum Di-assign</span>
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-black font-mono text-amber-600 dark:text-amber-300">
                  {summaryMetrics.unassigned}
                </span>
                <span className="text-[10px] font-bold text-amber-600 underline">Tugaskan Sekarang →</span>
              </div>
            </div>

            {/* 3. Sudah Di-assign */}
            <div className="bg-white dark:bg-[#1A0E2E] p-4 rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 dark:text-purple-300">
                <span className="text-xs font-semibold">Sudah Di-assign</span>
                <UserCheck className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-black font-mono text-indigo-600 dark:text-indigo-300">
                  {summaryMetrics.assigned}
                </span>
                <span className="text-[10px] text-slate-400">
                  {summaryMetrics.total > 0 ? Math.round((summaryMetrics.assigned / summaryMetrics.total) * 100) : 0}%
                </span>
              </div>
            </div>

            {/* 4. Menunggu Pengerjaan */}
            <div className="bg-white dark:bg-[#1A0E2E] p-4 rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 dark:text-purple-300">
                <span className="text-xs font-semibold">Menunggu</span>
                <Clock className="w-4 h-4 text-slate-500" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-black font-mono text-slate-700 dark:text-slate-300">
                  {summaryMetrics.waiting}
                </span>
                <span className="text-[10px] text-slate-400">Antrean</span>
              </div>
            </div>

            {/* 5. Sedang Dikerjakan */}
            <div className="bg-white dark:bg-[#1A0E2E] p-4 rounded-2xl border-2 border-blue-300 dark:border-blue-900/60 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-blue-600 dark:text-blue-400">
                <span className="text-xs font-semibold">Sedang Dikerjakan</span>
                <Activity className="w-4 h-4 text-blue-500" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-black font-mono text-blue-600 dark:text-blue-300">
                  {summaryMetrics.inProgress}
                </span>
                <span className="text-[10px] text-blue-400">On Site / En Route</span>
              </div>
            </div>

            {/* 6. Selesai (Completed) */}
            <div className="bg-white dark:bg-[#1A0E2E] p-4 rounded-2xl border-2 border-emerald-300 dark:border-emerald-900/60 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                <span className="text-xs font-semibold">Selesai (Completed)</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-300">
                  {summaryMetrics.completed}
                </span>
                <span className="text-[10px] text-emerald-500 font-bold">
                  {summaryMetrics.total > 0 ? Math.round((summaryMetrics.completed / summaryMetrics.total) * 100) : 0}% Rate
                </span>
              </div>
            </div>

            {/* 7. Tertunda / Pending */}
            <div className="bg-white dark:bg-[#1A0E2E] p-4 rounded-2xl border-2 border-amber-300 dark:border-amber-900/60 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
                <span className="text-xs font-semibold">Tertunda / Reschedule</span>
                <RotateCcw className="w-4 h-4 text-amber-500" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-black font-mono text-amber-600 dark:text-amber-300">
                  {summaryMetrics.pending}
                </span>
                <span className="text-[10px] text-amber-400">Pending</span>
              </div>
            </div>

            {/* 8. Bermasalah / Batal */}
            <div className="bg-white dark:bg-[#1A0E2E] p-4 rounded-2xl border-2 border-rose-300 dark:border-rose-900/60 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-rose-600 dark:text-rose-400">
                <span className="text-xs font-semibold">Bermasalah / Batal</span>
                <XCircle className="w-4 h-4 text-rose-500" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-black font-mono text-rose-600 dark:text-rose-300">
                  {summaryMetrics.problem}
                </span>
                <span className="text-[10px] text-rose-400">Kendala</span>
              </div>
            </div>

            {/* 9. Teknisi Aktif */}
            <div className="bg-white dark:bg-[#1A0E2E] p-4 rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 dark:text-purple-300">
                <span className="text-xs font-semibold">Teknisi Aktif</span>
                <Users2 className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-300">
                  {summaryMetrics.activeInstallers}
                </span>
                <span className="text-[10px] text-slate-400">Mengerjakan</span>
              </div>
            </div>

            {/* 10. Teknisi Siaga / Idle */}
            <div className="bg-white dark:bg-[#1A0E2E] p-4 rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 dark:text-purple-300">
                <span className="text-xs font-semibold">Teknisi Siaga / Idle</span>
                <UserPlus className="w-4 h-4 text-amber-500" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-black font-mono text-amber-600 dark:text-amber-300">
                  {summaryMetrics.idleInstallers}
                </span>
                <span className="text-[10px] text-slate-400">Siap Ditugaskan</span>
              </div>
            </div>
          </div>

          {/* SLA PROGRESS BAR & BREAKDOWN */}
          <div className="bg-white dark:bg-[#1A0E2E] p-5 rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-sm text-[#21183A] dark:text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-[#5B35B1]" />
                  <span>SLA & Progres Penyelesaian Work Order</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Tingkat penyelesaian instalasi harian mitra kontraktor {displayContractor}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black font-mono text-[#5B35B1] dark:text-purple-300">
                  {summaryMetrics.total > 0 ? Math.round((summaryMetrics.completed / summaryMetrics.total) * 100) : 0}%
                </span>
                <span className="text-xs text-slate-400">Terselesaikan</span>
              </div>
            </div>

            {/* Multi-segment Progress Bar */}
            <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
              <div
                style={{ width: `${summaryMetrics.total > 0 ? (summaryMetrics.completed / summaryMetrics.total) * 100 : 0}%` }}
                className="bg-emerald-500 transition-all duration-500"
                title={`Selesai: ${summaryMetrics.completed}`}
              />
              <div
                style={{ width: `${summaryMetrics.total > 0 ? (summaryMetrics.inProgress / summaryMetrics.total) * 100 : 0}%` }}
                className="bg-blue-500 transition-all duration-500"
                title={`Sedang Dikerjakan: ${summaryMetrics.inProgress}`}
              />
              <div
                style={{ width: `${summaryMetrics.total > 0 ? (summaryMetrics.waiting / summaryMetrics.total) * 100 : 0}%` }}
                className="bg-slate-400 transition-all duration-500"
                title={`Menunggu: ${summaryMetrics.waiting}`}
              />
              <div
                style={{ width: `${summaryMetrics.total > 0 ? (summaryMetrics.pending / summaryMetrics.total) * 100 : 0}%` }}
                className="bg-amber-500 transition-all duration-500"
                title={`Pending: ${summaryMetrics.pending}`}
              />
              <div
                style={{ width: `${summaryMetrics.total > 0 ? (summaryMetrics.problem / summaryMetrics.total) * 100 : 0}%` }}
                className="bg-rose-500 transition-all duration-500"
                title={`Bermasalah: ${summaryMetrics.problem}`}
              />
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 text-xs pt-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-slate-600 dark:text-slate-300">Selesai ({summaryMetrics.completed})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span className="text-slate-600 dark:text-slate-300">Sedang Dikerjakan ({summaryMetrics.inProgress})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                <span className="text-slate-600 dark:text-slate-300">Menunggu ({summaryMetrics.waiting})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="text-slate-600 dark:text-slate-300">Pending ({summaryMetrics.pending})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span className="text-slate-600 dark:text-slate-300">Bermasalah ({summaryMetrics.problem})</span>
              </div>
            </div>
          </div>

          {/* DAFTAR BEBAN KERJA TEKNISI */}
          <div className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 shadow-xs p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-sm text-[#21183A] dark:text-white flex items-center gap-2">
                  <Users2 className="w-4 h-4 text-[#5B35B1]" />
                  <span>Daftar Beban Kerja & Status Teknisi Mitra</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#E9E1FF] dark:bg-purple-900/60 text-[#3B1D78] dark:text-purple-200">
                    {myInstallers.length} Teknisi Terdaftar
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pemantauan real-time kapasitas pengerjaan dan kuota harian teknisi
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('wo_assignment')}
                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#5B35B1] hover:bg-[#3B1D78] rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  Buka Menu Assign WO →
                </button>
              </div>
            </div>

            {/* Table of Installers */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#F5F1FF] dark:bg-[#251545] text-slate-700 dark:text-purple-200 uppercase font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Teknisi</th>
                    <th className="py-2.5 px-3">Kontak WhatsApp</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-center">WO Aktif</th>
                    <th className="py-2.5 px-3 text-center">Beban / Kuota</th>
                    <th className="py-2.5 px-3 text-center">Progres Selesai</th>
                    <th className="py-2.5 px-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {installerProgressRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-400">
                        Belum ada teknisi yang terdaftar untuk kontraktor ini. Silakan tambahkan akun teknisi melalui menu Pendaftaran Akun Teknisi.
                      </td>
                    </tr>
                  ) : (
                    installerProgressRows.map(row => {
                      const isActive = row.inProgress > 0 || row.notStarted > 0;
                      return (
                        <tr key={row.installer.id} className="hover:bg-slate-50 dark:hover:bg-purple-950/20 transition-colors">
                          <td className="py-3 px-3 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-600 flex items-center justify-center font-bold text-xs shrink-0">
                              {row.installer.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div>{row.installer.name}</div>
                              <div className="text-[10px] text-slate-400 font-normal">@{row.installer.username}</div>
                            </div>
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-300">
                            {row.installer.phone || '-'}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {isActive ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300">
                                Aktif ({row.inProgress > 0 ? 'Sedang di Lokasi' : 'Siap Menuju'})
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300">
                                Siaga (Idle)
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center font-mono font-bold text-slate-800 dark:text-slate-200">
                            {row.totalWO}
                          </td>
                          <td className="py-3 px-3 text-center font-mono">
                            <span className={row.totalWO >= row.maxQuota ? 'text-rose-600 font-bold' : 'text-slate-700 dark:text-slate-300'}>
                              {row.totalWO} / {row.maxQuota} WO
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-16 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  style={{ width: `${row.progressPercent}%` }}
                                  className="h-full bg-emerald-500 rounded-full"
                                />
                              </div>
                              <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300 font-semibold">
                                {row.progressPercent}%
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedInstallerForDetail(row.installer)}
                              className="px-2.5 py-1 text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950 hover:bg-purple-100 rounded-lg border border-purple-200 dark:border-purple-800 transition-colors cursor-pointer"
                            >
                              Lihat Detail
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 1: MENU KHUSUS ASSIGN WO                                 */}
      {/* ============================================================ */}
      {activeTab === 'wo_assignment' && (
        <div className="space-y-4">
          {/* Quick Status Filter Ribbon for WO Assignment */}
          <div className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 p-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E9E1FF] dark:border-purple-900/40">
              <div>
                <h3 className="font-bold text-sm text-[#3B1D78] dark:text-purple-200 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-[#5B35B1]" />
                  <span>Menu Penugasan & Reassign Work Order (Leader)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tugaskan WO kepada teknisi mitra lapangan, atur slot waktu pelaksanaan, dan pantau status pengerjaan.
                </p>
              </div>

              {/* Status Ribbon Fast Filter */}
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span>Filter Status:</span>
                <span className="font-mono font-bold text-[#5B35B1]">
                  {statusFilter === 'all'
                    ? 'Semua'
                    : statusFilter === 'unassigned'
                    ? 'Belum Di-assign'
                    : statusFilter === 'assigned'
                    ? 'Sudah Di-assign'
                    : statusFilter}
                </span>
              </div>
            </div>

            {/* Quick Status Ribbon Chips */}
            <div className="flex flex-wrap gap-1.5 sm:gap-2 pt-3">
              <button
                type="button"
                onClick={() => { setStatusFilter('all'); setCurrentPage(1); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-[#3B1D78] text-white shadow-xs font-bold'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                <span>Semua Data</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/20">
                  {summaryMetrics.total}
                </span>
              </button>

              <button
                type="button"
                onClick={() => { setStatusFilter('unassigned'); setCurrentPage(1); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  statusFilter === 'unassigned'
                    ? 'bg-amber-500 text-white shadow-xs font-bold'
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Belum Di-assign</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-600 text-white font-bold">
                  {summaryMetrics.unassigned}
                </span>
              </button>

              <button
                type="button"
                onClick={() => { setStatusFilter('assigned'); setCurrentPage(1); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  statusFilter === 'assigned'
                    ? 'bg-[#5B35B1] text-white shadow-xs font-bold'
                    : 'bg-[#F5F1FF] dark:bg-purple-950/40 text-[#3B1D78] dark:text-purple-300 border border-[#D8CCF3] dark:border-purple-800 hover:bg-[#E9E1FF]'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Sudah Di-assign</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-indigo-200 dark:bg-indigo-900/60 text-indigo-900 dark:text-indigo-200">
                  {summaryMetrics.assigned}
                </span>
              </button>

              <button
                type="button"
                onClick={() => { setStatusFilter('waiting'); setCurrentPage(1); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  statusFilter === 'waiting'
                    ? 'bg-slate-700 text-white shadow-xs font-bold'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                <span>Menunggu</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-200 dark:bg-slate-700">
                  {summaryMetrics.waiting}
                </span>
              </button>

              <button
                type="button"
                onClick={() => { setStatusFilter('in_progress'); setCurrentPage(1); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  statusFilter === 'in_progress'
                    ? 'bg-blue-600 text-white shadow-xs font-bold'
                    : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span>Sedang Dikerjakan</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200">
                  {summaryMetrics.inProgress}
                </span>
              </button>

              <button
                type="button"
                onClick={() => { setStatusFilter('completed'); setCurrentPage(1); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  statusFilter === 'completed'
                    ? 'bg-emerald-600 text-white shadow-xs font-bold'
                    : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>WO Selesai</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                  {summaryMetrics.completed}
                </span>
              </button>

              <button
                type="button"
                onClick={() => { setStatusFilter('pending'); setCurrentPage(1); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  statusFilter === 'pending'
                    ? 'bg-amber-600 text-white shadow-xs font-bold'
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Tertunda</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-100 text-amber-800">
                  {summaryMetrics.pending}
                </span>
              </button>

              <button
                type="button"
                onClick={() => { setStatusFilter('problem'); setCurrentPage(1); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  statusFilter === 'problem'
                    ? 'bg-rose-600 text-white shadow-xs font-bold'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 hover:bg-rose-100'
                }`}
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Bermasalah</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-rose-100 text-rose-800">
                  {summaryMetrics.problem}
                </span>
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#EC91C0] dark:border-[#A80F62]/60 shadow-xs space-y-4 p-4 sm:p-5">
              {/* Header Susunan Assign Data WO Leader & Tombol Aksi Penugasan */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-[#FCE4F1] dark:bg-[#A80F62]/40 text-[#D81B83] dark:text-[#EC91C0] flex items-center justify-center font-bold shadow-xs shrink-0 border border-[#EC91C0]/60">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                      <span>Assign Data WO</span>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#FCE4F1] text-[#A80F62] border border-[#EC91C0]">
                        {filteredTickets.length} WO
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Kelola daftar penugasan WO teknisi mitra {leaderContractor}
                    </p>
                  </div>
                </div>

                {/* Tombol Aksi: Upload Assign WO (Magenta Theme) */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsUploadAssignModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-[#D81B83] hover:bg-[#C21875] text-white border border-[#EC91C0] rounded-xl transition-all shadow-sm cursor-pointer hover:scale-[1.02] active:scale-95"
                    title="Unggah berkas Excel/CSV untuk penugasan massal"
                  >
                    <FileUp className="w-4 h-4 text-white" />
                    <span>Upload Assign WO</span>
                  </button>
                </div>
              </div>

              {/* 7A. TOOLBAR 3 BAGIAN (KIRI, TENGAH, KANAN) */}
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800 text-xs">
                {/* Bagian Kiri: Rows Selector & Selected Data Counter */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 font-medium">Show Entries:</span>
                    <select
                      value={rowsPerPage}
                      onChange={e => {
                        setRowsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-medium text-xs focus:ring-1 focus:ring-[#D81B83]"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={-1}>All ({filteredTickets.length})</option>
                    </select>
                  </div>

                  <span className="text-slate-300 dark:text-slate-700">|</span>

                  <span className="font-mono text-slate-600 dark:text-slate-300 text-xs">
                    Total: <strong className="font-bold text-slate-900 dark:text-white">{filteredTickets.length}</strong> WO
                  </span>

                  {selectedTicketIds.length > 0 && (
                    <span className="px-2.5 py-1 bg-[#FCE4F1] dark:bg-[#A80F62]/40 text-[#A80F62] dark:text-[#FCE4F1] border border-[#EC91C0] rounded-xl font-bold font-mono text-xs shadow-xs animate-in zoom-in-95 duration-100">
                      Selected Data: {selectedTicketIds.length}
                    </span>
                  )}
                </div>

                {/* Date Filter Bar: "Select WO Date", Start Date, End Date, tombol Cari (Magenta) */}
                <div className="flex flex-wrap items-center gap-2 p-2 bg-[#FCE4F1]/40 dark:bg-[#251545] rounded-xl border border-[#EC91C0]/60 text-xs">
                  <div className="flex items-center gap-1 text-[11px] font-bold text-[#A80F62] dark:text-pink-300 shrink-0">
                    <Calendar className="w-3.5 h-3.5 text-[#D81B83]" />
                    <span>Select WO Date:</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => { setDateFilterType('all'); setCurrentPage(1); }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                        dateFilterType === 'all'
                          ? 'bg-[#D81B83] text-white shadow-xs font-bold'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDateFilterType('today'); setCurrentPage(1); }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                        dateFilterType === 'today'
                          ? 'bg-[#D81B83] text-white shadow-xs font-bold'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDateFilterType('tomorrow'); setCurrentPage(1); }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                        dateFilterType === 'tomorrow'
                          ? 'bg-[#D81B83] text-white shadow-xs font-bold'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Tomorrow
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDateFilterType('custom'); setCurrentPage(1); }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                        dateFilterType === 'custom'
                          ? 'bg-[#D81B83] text-white shadow-xs font-bold'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Range
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 pl-1">
                    <input
                      type="date"
                      value={customDateStart}
                      onChange={e => { setCustomDateStart(e.target.value); setDateFilterType('custom'); }}
                      placeholder="Start Date"
                      className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-[11px] font-mono focus:ring-1 focus:ring-[#D81B83]"
                      title="Start Date"
                    />
                    <span className="text-slate-400 text-[11px]">s/d</span>
                    <input
                      type="date"
                      value={customDateEnd}
                      onChange={e => { setCustomDateEnd(e.target.value); setDateFilterType('custom'); }}
                      placeholder="End Date"
                      className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-[11px] font-mono focus:ring-1 focus:ring-[#D81B83]"
                      title="End Date"
                    />
                    <button
                      type="button"
                      onClick={() => { setDateFilterType('custom'); setCurrentPage(1); }}
                      className="px-3 py-1 bg-[#D81B83] hover:bg-[#C21875] text-white font-bold text-[11px] rounded-lg shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                      title="Cari berdasarkan tanggal WO"
                    >
                      <Search className="w-3 h-3" />
                      <span>Cari</span>
                    </button>
                  </div>
                </div>

                {/* Bagian Tengah: Search & Filters */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 max-w-2xl">
                  {/* Search Bar */}
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Cari WO, ID, Nama, Telp, Cluster, Alamat..."
                      value={searchQuery}
                      onChange={e => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200"
                    />
                  </div>

                  {/* Status Filter Dropdown */}
                  <select
                    value={statusFilter}
                    onChange={e => {
                      setStatusFilter(e.target.value as LeaderStatusFilter);
                      setCurrentPage(1);
                    }}
                    className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium"
                  >
                    <option value="all">Semua Status WO</option>
                    <option value="unassigned">Belum Di-assign ({summaryMetrics.unassigned})</option>
                    <option value="assigned">Sudah Di-assign ({summaryMetrics.assigned})</option>
                    <option value="waiting">Menunggu ({summaryMetrics.waiting})</option>
                    <option value="in_progress">Sedang Dikerjakan ({summaryMetrics.inProgress})</option>
                    <option value="completed">Selesai ({summaryMetrics.completed})</option>
                    <option value="pending">Tertunda ({summaryMetrics.pending})</option>
                    <option value="problem">Bermasalah / Batal ({summaryMetrics.problem})</option>
                  </select>

                  {/* Installer Filter Dropdown */}
                  <select
                    value={selectedInstallerFilter}
                    onChange={e => {
                      setSelectedInstallerFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium"
                  >
                    <option value="ALL">Semua Teknisi</option>
                    {myInstallers.map(inst => (
                      <option key={inst.id} value={inst.name}>{inst.name}</option>
                    ))}
                  </select>

                  {(statusFilter !== 'all' || selectedInstallerFilter !== 'ALL' || searchQuery || Boolean(sortState.column)) && (
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter('all');
                        setSelectedInstallerFilter('ALL');
                        setSearchQuery('');
                        setDateFilterType('all');
                        setSortState({ column: null, direction: null });
                        setCurrentPage(1);
                      }}
                      className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 border rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Reset seluruh filter dan pengurutan kolom"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {sortState.column && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800/60 rounded-lg text-[11px] text-[#5B35B1] dark:text-[#D8B4FE] font-medium animate-in fade-in">
                      <span>Urut: <strong>{tableColumns.find(c => c.id === sortState.column)?.label || sortState.column}</strong> ({sortState.direction === 'asc' ? 'A-Z ↑' : 'Z-A ↓'})</span>
                      <button
                        type="button"
                        onClick={() => setSortState({ column: null, direction: null })}
                        className="hover:text-rose-600 dark:hover:text-rose-400 p-0.5 rounded cursor-pointer transition-colors"
                        title="Hapus urutan kolom"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                </div>

                {/* Bagian Kanan: Export & Column Customizer */}
                <div className="flex flex-wrap items-center gap-1.5 self-end sm:self-auto">
                  {/* Export Group */}
                  <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-0.5">
                    <button
                      type="button"
                      onClick={handleExportCopy}
                      className="px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded flex items-center gap-1"
                      title="Salin ke Clipboard"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportCSV}
                      className="px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded flex items-center gap-1"
                      title="Unduh CSV"
                    >
                      <Download className="w-3 h-3" />
                      <span>CSV</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportExcel}
                      className="px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded flex items-center gap-1"
                      title="Unduh Excel (.xlsx)"
                    >
                      <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                      <span>Excel</span>
                    </button>
                    <button
                      type="button"
                      onClick={handlePrint}
                      className="px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded flex items-center gap-1"
                      title="Cetak Tabel / PDF"
                    >
                      <Printer className="w-3 h-3" />
                      <span>Print</span>
                    </button>
                  </div>

                  {/* Pengaturan Kolom Button */}
                  <button
                    type="button"
                    onClick={() => setIsColumnModalOpen(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 rounded-lg font-semibold text-slate-700 dark:text-slate-300 text-xs"
                    title="Pengaturan Tampilan Kolom"
                  >
                    <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Kolom</span>
                  </button>

                  {/* Mobile Layout Switcher: Table vs Cards */}
                  <div className="flex sm:hidden border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setMobileLayoutMode('table')}
                      className={`p-1.5 ${mobileLayoutMode === 'table' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600'}`}
                      title="Tampilan Tabel"
                    >
                      <Table className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMobileLayoutMode('cards')}
                      className={`p-1.5 ${mobileLayoutMode === 'cards' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600'}`}
                      title="Tampilan Kartu"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* ============================================================ */}
              {/* AREA SEBELUM TABEL WO: INDIKATOR CHECKLIST & TOMBOL ASSIGN   */}
              {/* ============================================================ */}
              {selectedTicketIds.length > 0 && (
                <div className="sticky top-2 z-25 flex flex-wrap items-center justify-between gap-3 p-3.5 bg-gradient-to-r from-[#210D44] via-[#35105E] to-[#4C1D95] rounded-2xl border-2 border-[#D8B4FE]/60 shadow-xl text-white animate-in fade-in slide-in-from-top-2 duration-150 backdrop-blur-xs">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-500/25 border border-emerald-400/70 text-emerald-300 font-bold text-xs shadow-xs">
                      <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
                      <span>[✓ {selectedTicketIds.length} WO Dipilih]</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedTicketIds([])}
                      className="text-xs text-[#D8B4FE] hover:text-white underline cursor-pointer transition-colors"
                    >
                      Batalkan Pilihan
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsBulkAssignModalOpen(true)}
                      className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#7135B5] to-[#A855F7] hover:from-[#5B35B1] hover:to-[#9333EA] text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg border border-[#D8B4FE]/50 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
                    >
                      <UserCheck className="w-4 h-4 text-[#E9D5FF]" />
                      <span>ASSIGN DATA WO ({selectedTicketIds.length})</span>
                    </button>
                  </div>
                </div>
              )}

              {/* TABLE CONTAINER / MOBILE CARDS */}
              {filteredTickets.length === 0 ? (
                <div className="p-10 text-center text-slate-400 text-xs">
                  Tidak ada Work Order yang sesuai dengan filter dan pencarian aktif.
                </div>
              ) : mobileLayoutMode === 'cards' ? (
                /* SMARTPHONE CARD VIEW */
                <div className="space-y-3 sm:hidden">
                  {paginatedTickets.map(t => {
                    const { label, progressPercent, color } = classifyTicketOperational(t);
                    const isSelected = selectedTicketIds.includes(t.id);

                    return (
                      <div
                        key={t.id}
                        className={`p-3.5 rounded-xl border transition-all ${
                          isSelected
                            ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-500'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectTicket(t.id)}
                              className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                            />
                            <span
                              onClick={() => onSelectTicket(t)}
                              className="font-mono font-bold text-indigo-600 hover:underline cursor-pointer"
                            >
                              {t.woNumber}
                            </span>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            label === 'Selesai' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {label}
                          </span>
                        </div>

                        <div className="mt-2 space-y-1 text-xs">
                          <div className="font-semibold text-slate-900 dark:text-white">{t.customerName}</div>
                          <div className="text-[11px] text-slate-500 font-mono">{t.customerPhone} · ID: {t.idCustomer}</div>
                          <button
                            type="button"
                            onClick={() => openCustomerAddressInGoogleMaps(t)}
                            className="flex items-center gap-1 text-[11px] text-purple-700 dark:text-purple-300 hover:underline text-left group cursor-pointer"
                            title="Buka alamat di Google Maps"
                          >
                            <MapPin className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0 group-hover:scale-110 transition-transform" />
                            <span className="truncate">{t.streetName || t.clusterName || t.area}</span>
                          </button>
                          <div className="text-[11px] font-medium text-purple-700 dark:text-purple-300">{t.slotTime} · {t.appointmentDate || 'Tanggal Belum Ada'}</div>
                        </div>

                        {/* Progress Bar mini */}
                        <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                            <span>Teknisi: <strong>{t.installerName || 'Belum Di-assign'}</strong></span>
                            <span>{progressPercent}%</span>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-emerald-500 h-full rounded-full"
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 gap-2">
                          {t.installerName ? (
                            <button
                              type="button"
                              onClick={() => handleOpenReassignModal(t)}
                              className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors"
                              title="Alihkan tugas WO ke teknisi lain (Reassign)"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Reassign WO</span>
                            </button>
                          ) : (
                            <select
                              value={t.installerName || ''}
                              onChange={e => {
                                if (e.target.value) handleAssignTicket(t, e.target.value, t.slotTime);
                              }}
                              className="px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border rounded-lg max-w-[140px]"
                            >
                              <option value="">Pilih Teknisi...</option>
                              {myInstallers.map(inst => (
                                <option key={inst.id} value={inst.name}>{inst.name}</option>
                              ))}
                            </select>
                          )}

                          <button
                            type="button"
                            onClick={() => onSelectTicket(t)}
                            className="px-3 py-1 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 rounded-lg font-bold text-xs"
                          >
                            Detail
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* DESKTOP & TABLET STRUCTURED TABLE */
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[#D81B83] text-white text-[11px] font-bold uppercase sticky top-0 z-10 border-b-2 border-[#A80F62] shadow-sm [&_button]:text-white [&_button:hover]:text-[#FCE4F1] [&_svg]:text-white/90">
                      <tr>
                        {visibleColumns.map(col => renderHeaderCell(col))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {paginatedTickets.map(t => {
                        const { label, progressPercent, color } = classifyTicketOperational(t);
                        const isSelected = selectedTicketIds.includes(t.id);
                        const isExpanded = !!expandedRowIds[t.id];

                        return (
                          <React.Fragment key={t.id}>
                            <tr
                              className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50 ${
                                isSelected ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                              }`}
                            >
                              {visibleColumns.map(col =>
                                renderBodyCell(col, t, isSelected, isExpanded, label, progressPercent)
                              )}
                            </tr>

                            {/* 7C. EXPANDABLE ROW (Detailed View on Row Expansion) */}
                            {isExpanded && (
                              <tr className="bg-slate-50/80 dark:bg-slate-800/40">
                                <td colSpan={visibleColumns.length} className="p-4">
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                    <div className="space-y-1.5">
                                      <span className="font-bold text-slate-800 dark:text-slate-200 block">
                                        📍 Detail Lokasi & Alamat Pelanggan
                                      </span>
                                      <div className="text-slate-600 dark:text-slate-400">
                                        <strong>Alamat Lengkap:</strong> {t.streetName || '-'}
                                      </div>
                                      <div className="text-slate-600 dark:text-slate-400">
                                        <strong>Patokan / Alternatif:</strong> {t.streetAlternatif || 'Tidak ada'}
                                      </div>
                                      <div className="text-slate-600 dark:text-slate-400">
                                        <strong>Area & Cluster:</strong> {t.area} · {t.clusterName || '-'}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => openCustomerAddressInGoogleMaps(t)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 mt-1 text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 dark:hover:bg-purple-900/60 rounded-lg border border-purple-200 dark:border-purple-800 transition-colors cursor-pointer"
                                        title="Buka rute dan lokasi di Google Maps"
                                      >
                                        <MapPin className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                                        <span>Buka di Google Maps</span>
                                      </button>
                                    </div>

                                    <div className="space-y-1 font-mono text-[11px]">
                                      <span className="font-bold text-slate-800 dark:text-slate-200 block font-sans text-xs">
                                        🔧 Data Jaringan & Perangkat
                                      </span>
                                      <div>OLT / FDT Code: <strong>{t.fdtCode || '-'}</strong></div>
                                      <div>FAT Code: <strong>{t.fatCode || '-'}</strong></div>
                                      <div>Kategori: <strong>{t.ticketCategory}</strong></div>
                                      <div>ONT Brand/Model: <strong>{t.ontBrand || '-'} / {t.ontModel || '-'}</strong></div>
                                    </div>

                                    <div className="space-y-1.5">
                                      <span className="font-bold text-slate-800 dark:text-slate-200 block text-xs">
                                        📋 Catatan & Status Pekerjaan
                                      </span>
                                      <div className="p-2 rounded bg-white dark:bg-slate-900 border text-slate-600 dark:text-slate-300 text-[11px]">
                                        {t.remarksWOInstaller || t.remarksAgent || 'Belum ada catatan khusus pada tiket ini.'}
                                      </div>
                                      {t.technicalReport && (
                                        <div className="text-[11px] text-emerald-600 font-semibold">
                                          Laporan Teknisi: {t.technicalReport.workResult} ({t.technicalReport.rootCause})
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* PAGINATION BAR */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-slate-500 font-medium">
                <div>
                  Menampilkan{' '}
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {filteredTickets.length > 0 ? (rowsPerPage === -1 ? 1 : (currentPage - 1) * rowsPerPage + 1) : 0}
                  </span>{' '}
                  sampai{' '}
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {rowsPerPage === -1 ? filteredTickets.length : Math.min(currentPage * rowsPerPage, filteredTickets.length)}
                  </span>{' '}
                  dari <span className="font-bold text-slate-800 dark:text-slate-200">{filteredTickets.length}</span> baris
                </div>

                {rowsPerPage !== -1 && totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      className="px-2.5 py-1 rounded-lg border bg-white dark:bg-slate-800 disabled:opacity-40"
                    >
                      Sebelumnya
                    </button>
                    <span className="px-2 font-mono">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      className="px-2.5 py-1 rounded-lg border bg-white dark:bg-slate-800 disabled:opacity-40"
                    >
                      Selanjutnya
                    </button>
                  </div>
                )}
              </div>
            </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 2: DASHBOARD PROGRESS WO                                 */}
      {/* ============================================================ */}
      {activeTab === 'progress_dashboard' && (
        <LeaderProgressDashboardView
          onSelectTicket={onSelectTicket}
          onOpenWhatsApp={onOpenWhatsApp}
        />
      )}

      {/* ============================================================ */}
      {/* TAB 3: PENDAFTARAN AKUN TEKNISI (BAGIAN 3.1 & 3.2)           */}
      {/* ============================================================ */}
      {activeTab === 'installer_mgmt' && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center font-bold shadow-xs">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#21183A] dark:text-white">
                  Pendaftaran Akun Teknisi Mitra
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Daftarkan teknisi baru di bawah naungan kontraktor <strong>{displayContractor}</strong>.
                </p>
              </div>
            </div>

            <form onSubmit={handleAddInstaller} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Lengkap Teknisi *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Budi Santoso"
                  value={instName}
                  onChange={e => setInstName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Username Login *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: budi_mjs"
                  value={instUsername}
                  onChange={e => setInstUsername(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  No. Telepon WhatsApp *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: 08123456789"
                  value={instPhone}
                  onChange={e => setInstPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Email (Opsional)
                </label>
                <input
                  type="email"
                  placeholder="budi@mitra.com"
                  value={instEmail}
                  onChange={e => setInstEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div className="sm:col-span-2 lg:col-span-4 flex items-center justify-between pt-2">
                <span className="text-[11px] text-slate-400">
                  Password awal default adalah <code className="font-mono font-bold text-purple-600 bg-purple-50 dark:bg-purple-950 px-1.5 py-0.5 rounded">12345678</code>
                </span>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Daftarkan Akun Teknisi</span>
                </button>
              </div>
            </form>
          </div>

          {/* List of Registered Installers */}
          <div className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-sm text-[#21183A] dark:text-white">
                  Daftar Teknisi Terdaftar ({myInstallers.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Semua teknisi aktif di bawah naungan kontraktor {displayContractor}
                </p>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari teknisi..."
                  value={installerSearch}
                  onChange={e => setInstallerSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#F5F1FF] dark:bg-[#251545] text-slate-700 dark:text-purple-200 uppercase font-semibold">
                  <tr>
                    <th className="py-2 px-3">Nama</th>
                    <th className="py-2 px-3">Username</th>
                    <th className="py-2 px-3">No. WhatsApp</th>
                    <th className="py-2 px-3">Area</th>
                    <th className="py-2 px-3 text-center">Beban WO</th>
                    <th className="py-2 px-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {myInstallers
                    .filter(u => !installerSearch || u.name.toLowerCase().includes(installerSearch.toLowerCase()) || u.username.toLowerCase().includes(installerSearch.toLowerCase()))
                    .map(u => {
                      const woCount = contractorTickets.filter(t => t.installerName?.toLowerCase().trim() === u.name.toLowerCase().trim() && t.statusWOInstaller !== 'Completed').length;
                      return (
                        <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-purple-950/20">
                          <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">{u.name}</td>
                          <td className="py-2.5 px-3 font-mono text-purple-700 dark:text-purple-300">@{u.username}</td>
                          <td className="py-2.5 px-3 font-mono">{u.phone || '-'}</td>
                          <td className="py-2.5 px-3">{u.area || displayArea}</td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold">{woCount} WO</td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedInstallerForDetail(u)}
                              className="px-2.5 py-1 text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950 hover:bg-purple-100 rounded-lg border border-purple-200 dark:border-purple-800 cursor-pointer"
                            >
                              Detail
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB: REKAPITULASI AREA & KONTRAKTOR                          */}
      {/* ============================================================ */}
      {activeTab === 'contractor_recap' && (
        <ContractorAreaRecapView />
      )}
      {/* ============================================================ */}
      {/* TAB 4: PENGATURAN KUOTA & KOLOM VISIBILITAS                  */}
      {/* ============================================================ */}
      {activeTab === 'quota_settings' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
          {/* Card 1: Batas Kuota Beban Teknisi */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="p-2.5 bg-purple-100 dark:bg-purple-950 text-purple-600 rounded-xl">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Pengaturan Batas Kuota Beban Teknisi
                </h3>
                <p className="text-[11px] text-slate-500">
                  Kontrol limit maksimal penugasan Work Order per hari untuk teknisi di bawah {leaderContractor}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Batas Default Maksimal WO per Hari:
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={quotaSettings.defaultMaxDailyQuota}
                    onChange={e => saveQuotaSettings({ defaultMaxDailyQuota: Number(e.target.value) })}
                    className="w-24 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded-lg font-mono font-bold text-sm"
                  />
                  <span className="text-slate-500">WO per hari per teknisi</span>
                </div>
              </div>

              <div className="pt-3 border-t">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">
                      Mode Pembatasan Ketat (Strict Limit Enforcement)
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      Jika aktif: sistem akan menolak penugasan jika kuota teknisi telah penuh. Jika mati: sistem memberikan pop-up peringatan konfirmasi.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={quotaSettings.enforceStrictLimit}
                    onChange={e => saveQuotaSettings({ enforceStrictLimit: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Card 2: Pengaturan Kolom Visibilitas Tabel */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="p-2.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-600 rounded-xl">
                <Table className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Pengaturan Kolom Visibilitas Tabel
                </h3>
                <p className="text-[11px] text-slate-500">
                  Kustomisasi kolom yang tampil pada tabel Assign WO dan Dashboard Leader
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                Pilih kolom mana saja yang ingin Anda tampilkan atau sembunyikan sesuai alur kerja lapangan: ID Customer, WO Number, Alamat, Status, Teknisi, Slot Waktu, Kontak, dan Tanggal WO.
              </p>

              <button
                type="button"
                onClick={() => setIsColumnModalOpen(true)}
                className="w-full py-2.5 px-4 bg-[#5B35B1] hover:bg-[#3B1D78] text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                <Sliders className="w-4 h-4" />
                <span>Buka Pengaturan Kolom Tabel</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 1: BULK / MANUAL ASSIGN WO MODAL                      */}
      {/* ============================================================ */}
      {isBulkAssignModalOpen && (() => {
        const modalTargetTickets = contractorTickets.filter(t => selectedTicketIds.includes(t.id));
        const firstTicket = modalTargetTickets[0];
        const isSingle = modalTargetTickets.length === 1;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn">
            <div className="bg-white dark:bg-[#1A0E2E] w-full max-w-lg rounded-2xl shadow-2xl border-2 border-[#D8CCF3] dark:border-purple-800 flex flex-col overflow-hidden text-xs max-h-[92vh]">
              {/* Header */}
              <div className="px-5 py-4 border-b border-[#D8CCF3] dark:border-purple-800 flex items-center justify-between bg-[#F5F1FF] dark:bg-[#251545]">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-[#E9E1FF] dark:bg-purple-900/60 text-[#3B1D78] dark:text-purple-300 rounded-xl border border-[#D8CCF3]">
                    <UserCheck className="w-5 h-5 text-[#5B35B1] dark:text-purple-300" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-[#21183A] dark:text-white">
                      Penugasan Work Order ke Teknisi
                    </h3>
                    <p className="text-[11px] text-purple-700 dark:text-purple-300 font-medium">
                      Otorisasi Khusus Leader / Korlap ({selectedTicketIds.length} WO Dipilih)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsBulkAssignModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 space-y-4 overflow-y-auto">
                {/* 8 Requirements Panel */}
                <div className="p-3.5 bg-[#F5F1FF] dark:bg-[#21113B] rounded-xl border border-[#D8CCF3] dark:border-purple-800 space-y-2 text-xs">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#5B35B1] dark:text-purple-300 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    <span>Rincian Tiket Work Order</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-slate-700 dark:text-slate-300">
                    {/* 1. WO Number */}
                    <div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">1. Nomor WO:</span>
                      <span className="font-mono font-bold text-[#3B1D78] dark:text-purple-300 break-all">
                        {isSingle ? firstTicket?.woNumber : `${modalTargetTickets.length} Tiket (${modalTargetTickets.slice(0, 3).map(t => t.woNumber).join(', ')}${modalTargetTickets.length > 3 ? '...' : ''})`}
                      </span>
                    </div>

                    {/* 2. Customer Name */}
                    <div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">2. Nama Pelanggan:</span>
                      <span className="font-semibold text-slate-900 dark:text-white truncate block">
                        {isSingle ? firstTicket?.customerName || '-' : `${modalTargetTickets.length} Pelanggan`}
                      </span>
                    </div>

                    {/* 3. Appointment Date */}
                    <div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">3. Appointment Date:</span>
                      <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                        {firstTicket?.appointmentDate || scheduleDate}
                      </span>
                    </div>

                    {/* 4. Slot Time */}
                    <div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">4. Slot Time:</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {bulkSlotTime || firstTicket?.slotTime || 'Standar Operasional'}
                      </span>
                    </div>

                    {/* 5. Kontraktor */}
                    <div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">5. Kontraktor:</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {firstTicket?.contactorName || firstTicket?.contractorName || leaderContractor}
                      </span>
                    </div>

                    {/* 6. Area */}
                    <div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">6. Area / Coverage:</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {firstTicket?.area || leaderArea}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 7. Eligible Installer Dropdown */}
                <div>
                  <label className="block font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                    7. Pilih Teknisi Tujuan Penugasan <span className="text-rose-500">*</span>:
                  </label>
                  <select
                    value={bulkTargetInstaller}
                    onChange={e => setBulkTargetInstaller(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border-2 border-[#D8CCF3] dark:border-purple-800 rounded-xl font-medium text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#5B35B1] min-h-[44px]"
                  >
                    <option value="">Pilih teknisi aktif...</option>
                    {myInstallers.map(inst => {
                      const currentCount = getInstallerWOCountForDate(inst.name, scheduleDate);
                      const maxLimit = getMaxQuotaForInstaller(inst.name);
                      const isFull = currentCount >= maxLimit;
                      return (
                        <option key={inst.id} value={inst.name}>
                          {inst.name} ({currentCount}/{maxLimit} WO){isFull ? ' - KUOTA PENUH' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Slot Time Modifier (Optional) */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Ubah Slot Waktu Penugasan (Opsional):
                  </label>
                  <select
                    value={bulkSlotTime}
                    onChange={e => setBulkSlotTime(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 min-h-[40px]"
                  >
                    <option value="">Pertahankan slot waktu asli masing-masing tiket</option>
                    {STANDARD_SLOTS.map(slot => (
                      <option key={slot} value={slot}>{slot}</option>
                    ))}
                  </select>
                </div>

                <div className="p-3 bg-[#F5F1FF] dark:bg-purple-950/40 rounded-xl border border-[#D8CCF3] dark:border-purple-900 text-[11px] text-purple-900 dark:text-purple-200">
                  Sistem MoraJaws memvalidasi batas beban kerja teknisi ({quotaSettings.defaultMaxDailyQuota} WO/hari). Penugasan hanya dapat dilakukan oleh Leader/Korlap terdaftar.
                </div>
              </div>

              {/* 8. Confirm & Cancel Buttons (Responsive Layout & min 44px touch targets) */}
              <div className="px-5 py-3.5 border-t border-[#D8CCF3] dark:border-purple-800 bg-[#F5F1FF] dark:bg-[#251545] flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsBulkAssignModalOpen(false)}
                  className="min-h-[44px] px-4 py-2.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-semibold transition-colors flex items-center justify-center cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={!bulkTargetInstaller}
                  onClick={handleExecuteBulkAssignModal}
                  className="min-h-[44px] px-5 py-2.5 bg-[#5B35B1] hover:bg-[#3B1D78] text-white font-bold rounded-xl disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Konfirmasi Penugasan</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ============================================================ */}
      {/* MODAL 2: WHATSAPP ASSIGNMENT CONFIRMATION MODAL             */}
      {/* ============================================================ */}
      {assignmentNoticeModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn text-xs">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/40">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Konfirmasi WhatsApp Penugasan Teknisi
                </h3>
              </div>
              <button onClick={() => setAssignmentNoticeModal(null)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <p className="text-slate-600 dark:text-slate-400 text-[11px]">
                Penugasan WO <strong className="font-mono text-indigo-600">{assignmentNoticeModal.ticket.woNumber}</strong> berhasil disimpan di sistem. Kirimkan pesan rincian tugas langsung ke WhatsApp teknisi <strong>{assignmentNoticeModal.installer.name}</strong>:
              </p>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nomor Telepon Teknisi:
                </label>
                <input
                  type="text"
                  value={assignmentNoticeModal.targetPhone}
                  onChange={e => setAssignmentNoticeModal({ ...assignmentNoticeModal, targetPhone: e.target.value })}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded-lg font-mono text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Pratinjau Pesan Penugasan:
                </label>
                <textarea
                  rows={6}
                  value={assignmentNoticeModal.renderedMessage}
                  onChange={e => setAssignmentNoticeModal({ ...assignmentNoticeModal, renderedMessage: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border rounded-xl font-mono text-[11px]"
                />
              </div>
            </div>

            <div className="px-5 py-3 border-t bg-slate-50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setAssignmentNoticeModal(null)}
                className="px-4 py-1.5 text-slate-600"
              >
                Lewati / Selesai
              </button>
              <button
                type="button"
                onClick={() => {
                  const res = buildWhatsAppClickToChatUrl(
                    assignmentNoticeModal.targetPhone,
                    assignmentNoticeModal.renderedMessage
                  );
                  window.open(res.url, '_blank');
                  toast.success('Pesan WhatsApp dibuka di tab baru.', 'WhatsApp Terkirim');
                  setAssignmentNoticeModal(null);
                }}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-sm"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Kirim via WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 3: QUOTA WARNING MODAL                                */}
      {/* ============================================================ */}
      {quotaWarningModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn text-xs">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Peringatan Batas Kuota Harian
                </h3>
                <p className="text-[11px] text-slate-500">
                  Teknisi {quotaWarningModal.installerName} telah mencapai batas beban kerja
                </p>
              </div>
            </div>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-[11px] space-y-1">
              <div>Jumlah WO saat ini: <strong>{quotaWarningModal.currentCount} WO</strong></div>
              <div>Batas Kuota: <strong>{quotaWarningModal.maxLimit} WO / hari</strong></div>
              <div>Apakah Anda yakin ingin tetap menugaskan WO {quotaWarningModal.ticket.woNumber} kepada teknisi ini?</div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setQuotaWarningModal(null)}
                className="px-4 py-2 border rounded-xl text-slate-600"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  const { ticket, installerName, slotTime } = quotaWarningModal;
                  setQuotaWarningModal(null);
                  handleAssignTicket(ticket, installerName, slotTime, true);
                }}
                className="px-4 py-2 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700"
              >
                Tetap Tugaskan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 4: INSTALLER DETAIL 7 TAB MODAL                        */}
      {/* ============================================================ */}
      <InstallerDetailModal
        installer={selectedInstallerForDetail}
        isOpen={Boolean(selectedInstallerForDetail)}
        onClose={() => setSelectedInstallerForDetail(null)}
        contractorTickets={contractorTickets}
        onSelectTicket={onSelectTicket}
        maxDailyQuota={selectedInstallerForDetail ? getMaxQuotaForInstaller(selectedInstallerForDetail.name) : quotaSettings.defaultMaxDailyQuota}
        onQuickAssign={installerName => {
          setBulkTargetInstaller(installerName);
          setIsBulkAssignModalOpen(true);
        }}
      />

      {/* ============================================================ */}
      {/* MODAL 5: COLUMN SETTINGS MODAL                              */}
      {/* ============================================================ */}
      <LeaderColumnSettingsModal
        isOpen={isColumnModalOpen}
        onClose={() => setIsColumnModalOpen(false)}
        columns={tableColumns}
        onChangeColumns={handleSaveColumns}
        onReset={handleResetColumns}
      />

      {/* ============================================================ */}
      {/* MODAL 6: UPLOAD ASSIGN WO MODAL                             */}
      {/* ============================================================ */}
      <UploadAssignModal
        isOpen={isUploadAssignModalOpen}
        onClose={() => setIsUploadAssignModalOpen(false)}
        contractorTickets={contractorTickets}
        myInstallers={myInstallers}
        onExecuteBulkAssign={assignments => {
          assignments.forEach(a => {
            assignTicketPersonnel(a.ticketId, currentUser.name, a.installerName);
          });
          toast.success(`Berhasil memproses penugasan untuk ${assignments.length} Work Order.`, 'Upload Assign Sukses');
        }}
      />

      {/* ============================================================ */}
      {/* MODAL 7: REASSIGN WO MODAL (LEADER ONLY)                     */}
      {/* ============================================================ */}
      {reassignModalState.isOpen && reassignModalState.ticket && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-xs">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-amber-600 via-amber-700 to-orange-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm tracking-tight">Reassign Work Order</h3>
                  <p className="text-[11px] text-amber-100">
                    Alihkan penugasan teknisi dengan validasi wilayah & pencatatan riwayat
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReassignModalState(prev => ({ ...prev, isOpen: false }))}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* WO Master Details Card */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-sm">
                    {reassignModalState.ticket.woNumber}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10.5px] font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                    {reassignModalState.ticket.ticketCategory}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-200 dark:border-slate-700">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Nama Pelanggan</span>
                    <strong className="text-slate-800 dark:text-slate-200">{reassignModalState.ticket.customerName}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Customer ID (7 Digit)</span>
                    <strong className="font-mono text-slate-800 dark:text-slate-200">{reassignModalState.ticket.idCustomer || '-'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Kontraktor & Area</span>
                    <span className="text-slate-700 dark:text-slate-300">
                      {reassignModalState.ticket.contactorName || reassignModalState.ticket.contractorName || '-'} ({reassignModalState.ticket.area || '-'})
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Appointment Date (WO Sumber)</span>
                    <strong className="text-purple-700 dark:text-purple-300 font-medium">
                      {formatAppointmentDateDisplay(reassignModalState.ticket.appointmentDate)} {reassignModalState.ticket.slotTime ? `(${reassignModalState.ticket.slotTime})` : ''}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Technician Handoff Selector */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl border border-rose-200 bg-rose-50/50 dark:bg-rose-950/20 dark:border-rose-900/40">
                    <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider block mb-1">
                      Teknisi Saat Ini (Lama)
                    </span>
                    <div className="font-bold text-sm text-slate-900 dark:text-white">
                      {reassignModalState.ticket.installerName || 'Belum Ditugaskan'}
                    </div>
                    <div className="text-[10.5px] text-slate-500 mt-0.5">
                      Status: {reassignModalState.ticket.statusWOInstaller || 'Unassigned'}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900/40">
                    <label className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block mb-1">
                      Pilih Teknisi Baru (Tujuan) *
                    </label>
                    <select
                      value={reassignModalState.targetInstaller}
                      onChange={e => setReassignModalState(prev => ({ ...prev, targetInstaller: e.target.value }))}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-lg font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">-- Pilih Teknisi Tujuan --</option>
                      {myInstallers
                        .filter(inst => inst.name !== reassignModalState.ticket?.installerName && inst.active && !inst.isArchived)
                        .map(inst => (
                          <option key={inst.id} value={inst.name}>
                            {inst.name} {inst.phone ? `(${inst.phone})` : ''}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {/* Reason Input */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Alasan Reassign / Pengalihan Tugas *
                  </label>
                  <textarea
                    rows={2}
                    value={reassignModalState.reason}
                    onChange={e => setReassignModalState(prev => ({ ...prev, reason: e.target.value }))}
                    placeholder="Contoh: Kendala armada teknisi di lapangan / pemerataan kuota harian / kendala jarak tempuh..."
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  />
                  <span className="text-[10.5px] text-slate-400">
                    Alasan ini akan dicatat ke dalam audit log dan riwayat penugasan resmi (append-only history).
                  </span>
                </div>

                {/* Assignment History Display */}
                {reassignModalState.ticket.assignmentHistory && reassignModalState.ticket.assignmentHistory.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 font-semibold text-[11px] mb-1.5">
                      <History className="w-3.5 h-3.5" />
                      <span>Riwayat Penugasan Sebelumnya ({reassignModalState.ticket.assignmentHistory.length}):</span>
                    </div>
                    <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                      {reassignModalState.ticket.assignmentHistory.map((h, idx) => (
                        <div key={idx} className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800/80 text-[10.5px] text-slate-600 dark:text-slate-400">
                          <div className="flex items-center justify-between font-medium">
                            <span className="text-slate-800 dark:text-slate-200">
                              {h.previousInstaller || 'Unassigned'} &rarr; <strong>{h.assignedInstaller}</strong>
                            </span>
                            <span className="text-slate-400 font-mono text-[9.5px]">
                              {new Date(h.timestamp).toLocaleString('id-ID')}
                            </span>
                          </div>
                          <div className="text-slate-500 italic mt-0.5">
                            "{h.reason}" &mdash; oleh {h.performedBy} ({h.performedByRole})
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setReassignModalState(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                Batal
              </button>

              <button
                type="button"
                disabled={reassignModalState.isSubmitting || !reassignModalState.targetInstaller || !reassignModalState.reason.trim()}
                onClick={handleExecuteReassign}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${reassignModalState.isSubmitting ? 'animate-spin' : ''}`} />
                <span>{reassignModalState.isSubmitting ? 'Memproses Reassign...' : 'Konfirmasi & Alihkan WO'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
