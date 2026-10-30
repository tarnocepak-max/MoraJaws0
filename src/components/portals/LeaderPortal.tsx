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
import {
  LeaderColumnSettingsModal,
  DEFAULT_LEADER_COLUMNS,
  ColumnConfig
} from './LeaderColumnSettingsModal';
import { InstallerDetailModal } from './InstallerDetailModal';
import { UploadAssignModal } from './UploadAssignModal';

interface LeaderPortalProps {
  onSelectTicket: (ticket: Ticket) => void;
  onOpenWhatsApp?: (ticket: Ticket) => void;
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

export const LeaderPortal: React.FC<LeaderPortalProps> = ({ onSelectTicket }) => {
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

  // Navigation tab in portal: Dedicated tabs for Assign WO, Pendaftaran Akun Teknisi, and Dashboard Progress WO
  const [activeTab, setActiveTab] = useState<'wo_assignment' | 'installer_mgmt' | 'progress_dashboard' | 'quota_settings'>('wo_assignment');

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
        const map = new Map(parsed.map(c => [c.id, c.visible]));
        return DEFAULT_LEADER_COLUMNS.map(c => ({
          ...c,
          visible: map.has(c.id) ? !!map.get(c.id) : c.visible
        }));
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
  const [dateFilterType, setDateFilterType] = useState<'all' | 'today' | 'tomorrow' | 'custom'>('all');
  const [customDateStart, setCustomDateStart] = useState<string>('');
  const [customDateEnd, setCustomDateEnd] = useState<string>('');

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
      t.remarksWOInstaller?.toLowerCase().includes('reschedule') ||
      t.remarksAgent?.toLowerCase().includes('reschedule')
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
        const rawDate = t.appointmentDate || t.date;
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

  // 10 ACCURATE SUMMARY METRICS (Based directly on database values)
  const summaryMetrics = useMemo(() => {
    let unassigned = 0;
    let assigned = 0;
    let waiting = 0;
    let inProgress = 0;
    let completed = 0;
    let pending = 0;
    let problem = 0;

    contractorTickets.forEach(t => {
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

    // Installers with 0 active tickets assigned
    const installerActiveTicketsMap = new Map<string, number>();
    contractorTickets.forEach(t => {
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
      total: contractorTickets.length,
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

  // INSTALLER PROGRESS MONITORING ROWS (Section 4 & 5)
  const installerProgressRows = useMemo(() => {
    return myInstallers.map(inst => {
      const instTickets = contractorTickets.filter(
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

      // Date Range Filter (Strict Asia/Jakarta WIB calendar date comparison)
      const ticketDate = getTicketAppointmentDate(t);
      const todayStr = getJakartaDateString(0);
      const tmrStr = getJakartaDateString(1);

      if (dateFilterType === 'today') {
        if (!ticketDate || ticketDate !== todayStr) return false;
      } else if (dateFilterType === 'tomorrow') {
        if (!ticketDate || ticketDate !== tmrStr) return false;
      } else if (dateFilterType === 'custom') {
        if (!ticketDate) return false;
        if (customDateStart && ticketDate < customDateStart) return false;
        if (customDateEnd && ticketDate > customDateEnd) return false;
      }

      // Search query filter (WO Number, Customer ID, Customer Name, Phone, Installer, Cluster, Street)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchWo = t.woNumber.toLowerCase().includes(q);
        const matchCustId = (t.idCustomer || '').toLowerCase().includes(q);
        const matchCustName = (t.customerName || '').toLowerCase().includes(q);
        const matchPhone = (t.customerPhone || '').toLowerCase().includes(q);
        const matchInst = (t.installerName || '').toLowerCase().includes(q);
        const matchCluster = (t.clusterName || '').toLowerCase().includes(q);
        const matchStreet = (t.streetName || '').toLowerCase().includes(q);
        const matchArea = (t.area || '').toLowerCase().includes(q);

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
    dateFilterType,
    customDateStart,
    customDateEnd,
    searchQuery
  ]);

  // Paginated Rows
  const totalPages = rowsPerPage === -1 ? 1 : Math.max(1, Math.ceil(filteredTickets.length / rowsPerPage));
  const paginatedTickets = useMemo(() => {
    if (rowsPerPage === -1) return filteredTickets;
    const start = (currentPage - 1) * rowsPerPage;
    return filteredTickets.slice(start, start + rowsPerPage);
  }, [filteredTickets, currentPage, rowsPerPage]);

  // Checkbox selection helpers
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedTicketIds(filteredTickets.map(t => t.id));
    } else {
      setSelectedTicketIds([]);
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
      appointmentDate: ticket.appointmentDate || ticket.date,
      appointment_date: ticket.appointmentDate || ticket.date,
      street_alternatif: ticket.streetAlternatif || 'Tidak ada patokan khusus'
    };

    if (template) {
      const res = renderWhatsAppMessage(template.messageBody, ticketDataWithExtras);
      return res.renderedText;
    }

    return `Halo Rekan Teknisi ${installer.name},\n\nAda penugasan Work Order baru untuk Anda dari Korlap (${currentUser.name} - ${leaderContractor}):\n\n📌 Detail Work Order:\n- No. WO: ${ticket.woNumber}\n- Kategori: ${ticket.ticketCategory}\n- Tanggal Kunjungan: ${ticket.appointmentDate || ticket.date}\n- Slot Waktu: ${ticket.slotTime}\n\n📍 Lokasi Pelanggan:\n- Nama: ${ticket.customerName}\n- No. Kontak: ${ticket.customerPhone}\n- Alamat: ${ticket.streetName || '-'}\n- Patokan: ${ticket.streetAlternatif || '-'}\n- Cluster: ${ticket.clusterName || '-'}\n- Area: ${ticket.area}\n\n🔧 Data Jaringan:\n- OLT/FDT: ${ticket.fdtCode || '-'}\n- FAT Code: ${ticket.fatCode || '-'}\n\nHarap segera konfirmasi penerimaan tugas melalui Portal Teknisi Lapangan.\nTerima kasih, selamat bertugas!`;
  };

  // Single Ticket Assignment
  const handleAssignTicket = (ticket: Ticket, installerName: string, slotTime?: string, bypassWarning = false) => {
    if (!installerName) return;

    const installerUser = myInstallers.find(
      u => u.name.toLowerCase().trim() === installerName.toLowerCase().trim()
    );

    const targetDate = ticket.appointmentDate || ticket.date || scheduleDate;
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
    if (filteredTickets.length === 0) return;
    const headers = ['WO Number', 'Tanggal', 'Customer ID', 'Customer Name', 'Phone', 'Slot', 'Cluster', 'Street', 'Teknisi', 'Status'];
    const rows = filteredTickets.map(t => [
      t.woNumber,
      t.appointmentDate || t.date,
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
    toast.success(`${filteredTickets.length} baris data berhasil disalin ke clipboard (TSV format).`, 'Data Disalin');
  };

  const handleExportCSV = () => {
    if (filteredTickets.length === 0) return;
    const worksheet = XLSX.utils.json_to_sheet(
      filteredTickets.map(t => ({
        'WO Number': t.woNumber,
        'Tanggal WO': t.date,
        'Appointment Date': t.appointmentDate || t.date,
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
    if (filteredTickets.length === 0) return;
    const worksheet = XLSX.utils.json_to_sheet(
      filteredTickets.map(t => ({
        'WO Number': t.woNumber,
        'Tanggal WO': t.date,
        'Appointment Date': t.appointmentDate || t.date,
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

  // Check if column is visible
  const isColVisible = (id: string) => {
    const col = tableColumns.find(c => c.id === id);
    return col ? col.visible : true;
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
      triggerNotice('success', `Teknisi ${instName} berhasil didaftarkan ke ${leaderContractor}! Password default: 12345678`);
      setInstName('');
      setInstUsername('');
      setInstPhone('');
      setInstEmail('');
    } else {
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
                  Dashboard Leader
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
      {/* TABS NAVIGATION UTAMA PORTAL LEADER                          */}
      {/* 1. Assign WO                                                */}
      {/* 2. Pendaftaran Akun Teknisi                                  */}
      {/* 3. Dashboard Progress WO                                     */}
      {/* 4. Pengaturan Kuota & Kolom                                  */}
      {/* ============================================================ */}
      <div className="flex flex-wrap items-center gap-2 border-b-2 border-[#D8CCF3] dark:border-purple-900/60 pb-1 text-xs font-semibold">
        {/* TAB 1: ASSIGN WO */}
        <button
          type="button"
          onClick={() => setActiveTab('wo_assignment')}
          className={`px-4 py-2.5 rounded-t-xl border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'wo_assignment'
              ? 'border-[#5B35B1] bg-[#F5F1FF] dark:bg-[#251545] text-[#3B1D78] dark:text-purple-300 font-bold shadow-xs'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-[#5B35B1] hover:bg-[#F5F1FF]/60 dark:hover:bg-purple-950/40'
          }`}
        >
          <UserCheck className="w-4 h-4 text-[#5B35B1] dark:text-purple-300" />
          <span>Assign WO</span>
          {summaryMetrics.unassigned > 0 ? (
            <span className="px-2 py-0.5 rounded-full text-[10.5px] bg-amber-500 text-white font-mono font-bold animate-pulse">
              {summaryMetrics.unassigned} Belum Di-assign
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded-full text-[10.5px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-mono">
              Semua Ditugaskan
            </span>
          )}
        </button>

        {/* TAB 2: PENDAFTARAN AKUN TEKNISI */}
        <button
          type="button"
          onClick={() => setActiveTab('installer_mgmt')}
          className={`px-4 py-2.5 rounded-t-xl border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'installer_mgmt'
              ? 'border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold shadow-xs'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-emerald-700 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/30'
          }`}
        >
          <UserPlus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Pendaftaran Akun Teknisi</span>
          <span className="px-2 py-0.5 rounded-full text-[10.5px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono font-bold">
            {myInstallers.length} Teknisi
          </span>
        </button>

        {/* TAB 3: DASHBOARD PROGRESS WO */}
        <button
          type="button"
          onClick={() => setActiveTab('progress_dashboard')}
          className={`px-4 py-2.5 rounded-t-xl border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'progress_dashboard'
              ? 'border-[#5B35B1] bg-[#F5F1FF] dark:bg-[#251545] text-[#3B1D78] dark:text-purple-300 font-bold shadow-xs'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-[#5B35B1] hover:bg-[#F5F1FF]/60 dark:hover:bg-purple-950/40'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-[#5B35B1] dark:text-purple-300" />
          <span>Dashboard Progress WO</span>
          <span className="px-2 py-0.5 rounded-full text-[10.5px] bg-[#E9E1FF] dark:bg-purple-900/60 text-[#3B1D78] dark:text-purple-200 font-mono font-bold">
            Live SLA
          </span>
        </button>

        {/* TAB 4: PENGATURAN KUOTA & KOLOM */}
        <button
          type="button"
          onClick={() => setActiveTab('quota_settings')}
          className={`px-4 py-2.5 rounded-t-xl border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'quota_settings'
              ? 'border-purple-600 bg-purple-50/80 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold shadow-xs'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-purple-700 hover:bg-purple-50/40'
          }`}
        >
          <Sliders className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          <span>Pengaturan Kuota & Kolom</span>
        </button>
      </div>

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

          <div className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 shadow-xs space-y-4 p-4 sm:p-5">
              {/* Header Susunan WO Leader & Tombol Aksi Penugasan */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold shadow-xs shrink-0">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                      <span>Susunan Work Order Leader</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#E9E1FF] dark:bg-purple-900/60 text-[#3B1D78] dark:text-purple-200">
                        {filteredTickets.length} WO
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Kelola daftar penugasan WO teknisi mitra {leaderContractor}
                    </p>
                  </div>
                </div>

                {/* Tombol Aksi: Upload Assign WO & Assign Data WO */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsUploadAssignModalOpen(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 rounded-xl transition-all shadow-xs cursor-pointer"
                    title="Unggah berkas Excel/CSV untuk penugasan massal"
                  >
                    <FileUp className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Upload Assign WO</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (selectedTicketIds.length === 0 && summaryMetrics.unassigned > 0) {
                        // Pick first unassigned ticket by default
                        const firstUn = contractorTickets.find(t => !t.installerName);
                        if (firstUn) setSelectedTicketIds([firstUn.id]);
                      }
                      setIsBulkAssignModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>Assign Data WO {selectedTicketIds.length > 0 && `(${selectedTicketIds.length})`}</span>
                  </button>
                </div>
              </div>

              {/* 7A. TOOLBAR 3 BAGIAN (KIRI, TENGAH, KANAN) */}
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800 text-xs">
                {/* Bagian Kiri: Rows Selector & Counts */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">Tampilkan:</span>
                    <select
                      value={rowsPerPage}
                      onChange={e => {
                        setRowsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-medium text-xs"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={-1}>Semua ({filteredTickets.length})</option>
                    </select>
                  </div>

                  <span className="text-slate-300 dark:text-slate-700">|</span>

                  <span className="font-mono text-slate-600 dark:text-slate-300">
                    Total: <strong className="font-bold text-slate-900 dark:text-white">{filteredTickets.length}</strong> WO
                  </span>

                  {selectedTicketIds.length > 0 && (
                    <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-md font-bold font-mono">
                      {selectedTicketIds.length} Dipilih
                    </span>
                  )}
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

                  {(statusFilter !== 'all' || selectedInstallerFilter !== 'ALL' || searchQuery) && (
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter('all');
                        setSelectedInstallerFilter('ALL');
                        setSearchQuery('');
                        setDateFilterType('all');
                        setCurrentPage(1);
                      }}
                      className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 border rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Reset seluruh filter"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
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
                          <div className="text-[11px] font-medium text-purple-700 dark:text-purple-300">{t.slotTime} · {t.appointmentDate || t.date}</div>
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
                    <thead className="bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase sticky top-0 z-10">
                      <tr>
                        {isColVisible('checkbox') && (
                          <th className="py-2.5 px-3 text-center w-8">
                            <input
                              type="checkbox"
                              checked={
                                filteredTickets.length > 0 &&
                                selectedTicketIds.length === filteredTickets.length
                              }
                              onChange={handleSelectAll}
                              className="w-4 h-4 text-indigo-600 rounded border-slate-300 dark:border-slate-700"
                            />
                          </th>
                        )}
                        {isColVisible('woNumber') && <th className="py-2.5 px-3">WO Number</th>}
                        {isColVisible('date') && <th className="py-2.5 px-3">Tanggal WO</th>}
                        {isColVisible('idCustomer') && <th className="py-2.5 px-3">Customer ID</th>}
                        {isColVisible('customerName') && <th className="py-2.5 px-3">Nama Pelanggan</th>}
                        {isColVisible('customerPhone') && <th className="py-2.5 px-3">Kontak</th>}
                        {isColVisible('clusterName') && <th className="py-2.5 px-3">Cluster</th>}
                        {isColVisible('streetName') && <th className="py-2.5 px-3 min-w-[180px]">Alamat / Street Name</th>}
                        {isColVisible('appointmentDate') && <th className="py-2.5 px-3">Appointment</th>}
                        {isColVisible('slotTime') && <th className="py-2.5 px-3 whitespace-nowrap">Slot Time</th>}
                        {isColVisible('contractor') && <th className="py-2.5 px-3">Kontraktor</th>}
                        {isColVisible('installer') && <th className="py-2.5 px-3 min-w-[170px]">Teknisi / Installer</th>}
                        {isColVisible('status') && <th className="py-2.5 px-3">Status WO</th>}
                        {isColVisible('progress') && <th className="py-2.5 px-3 min-w-[130px]">Progress</th>}
                        {isColVisible('lastUpdate') && <th className="py-2.5 px-3">Update</th>}
                        {isColVisible('action') && <th className="py-2.5 px-3 text-center min-w-[120px]">Action</th>}
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
                              {/* 1. Checkbox */}
                              {isColVisible('checkbox') && (
                                <td className="py-2.5 px-3 text-center">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => handleToggleSelectTicket(t.id)}
                                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 dark:border-slate-700"
                                  />
                                </td>
                              )}

                              {/* 2. WO Number */}
                              {isColVisible('woNumber') && (
                                <td className="py-2.5 px-3 font-mono font-semibold">
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => toggleRowExpansion(t.id)}
                                      className="text-slate-400 hover:text-slate-700 p-0.5"
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
                              )}

                              {/* 3. Tanggal WO */}
                              {isColVisible('date') && (
                                <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">
                                  {t.date || '-'}
                                </td>
                              )}

                              {/* 4. Customer ID */}
                              {isColVisible('idCustomer') && (
                                <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-300">
                                  {t.idCustomer}
                                </td>
                              )}

                              {/* 5. Customer Name */}
                              {isColVisible('customerName') && (
                                <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white">
                                  {t.customerName}
                                </td>
                              )}

                              {/* 6. Customer Phone */}
                              {isColVisible('customerPhone') && (
                                <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                  {t.customerPhone}
                                </td>
                              )}

                              {/* 7. Cluster Name */}
                              {isColVisible('clusterName') && (
                                <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                                  {t.clusterName || '-'}
                                </td>
                              )}

                              {/* 8. Street Name / Alamat */}
                              {isColVisible('streetName') && (
                                <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 max-w-xs">
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
                              )}

                              {/* 9. Appointment Date */}
                              {isColVisible('appointmentDate') && (
                                <td className="py-2.5 px-3 font-mono whitespace-nowrap text-slate-700 dark:text-slate-300">
                                  {t.appointmentDate || t.date || '-'}
                                </td>
                              )}

                              {/* 10. Slot Time */}
                              {isColVisible('slotTime') && (
                                <td className="py-2.5 px-3 font-medium whitespace-nowrap text-slate-800 dark:text-slate-200">
                                  {t.slotTime}
                                </td>
                              )}

                              {/* 11. Contractor */}
                              {isColVisible('contractor') && (
                                <td className="py-2.5 px-3 text-slate-500">
                                  {t.contactorName}
                                </td>
                              )}

                              {/* 12. Installer Quick Dropdown */}
                              {isColVisible('installer') && (
                                <td className="py-2.5 px-3">
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
                                      const targetDate = t.appointmentDate || t.date || scheduleDate;
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
                              )}

                              {/* 13. Status WO */}
                              {isColVisible('status') && (
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <StatusInstallerBadge status={t.statusWOInstaller} />
                                </td>
                              )}

                              {/* 14. Progress Bar Mini */}
                              {isColVisible('progress') && (
                                <td className="py-2.5 px-3 align-middle">
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
                              )}

                              {/* 15. Last Update */}
                              {isColVisible('lastUpdate') && (
                                <td className="py-2.5 px-3 font-mono text-[10.5px] text-slate-400 whitespace-nowrap">
                                  {t.updatedAt?.slice(5, 16).replace('T', ' ') || '-'}
                                </td>
                              )}

                              {/* 16. Actions */}
                              {isColVisible('action') && (
                                <td className="py-2.5 px-3 text-center">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => onSelectTicket(t)}
                                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded text-slate-700 dark:text-slate-200 font-semibold text-xs"
                                    >
                                      Detail
                                    </button>

                                    {t.installerName && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleOpenReassignModal(t)}
                                          className="px-2 py-1 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 rounded font-semibold text-xs flex items-center gap-1 transition-colors"
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
                                          className="p-1 bg-emerald-50 dark:bg-emerald-950 text-emerald-600 hover:bg-emerald-100 rounded"
                                          title="Kirim pesan WhatsApp penugasan ke teknisi"
                                        >
                                          <Phone className="w-3.5 h-3.5" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              )}
                            </tr>

                            {/* 7C. EXPANDABLE ROW (Detailed View on Row Expansion) */}
                            {isExpanded && (
                              <tr className="bg-slate-50/80 dark:bg-slate-800/40">
                                <td colSpan={tableColumns.filter(c => c.visible).length} className="p-4">
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
      {/* TAB 3: DASHBOARD PROGRESS WO & REALTIME SLA                  */}
      {/* ============================================================ */}
      {activeTab === 'progress_dashboard' && (
        <div className="space-y-6">
          {/* Header Dashboard Progress */}
          <div className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#3B1D78] dark:text-purple-200 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#5B35B1]" />
                <span>Dashboard Progress WO & Pemantauan SLA Lapangan</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Pantau metrik kecepatan penyelesaian penugasan WO, kendala lapangan, beban harian teknisi, dan matriks jadwal.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('unassigned');
                  setActiveTab('wo_assignment');
                }}
                className="px-3.5 py-1.5 bg-[#5B35B1] hover:bg-[#3B1D78] text-white font-bold rounded-xl text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Buka Penugasan WO</span>
              </button>
            </div>
          </div>

          {/* 10 KARTU METRIK INTERAKTIF */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 sm:gap-3">
            {/* 1. Total WO */}
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setActiveTab('wo_assignment');
              }}
              className={`p-3 sm:p-3.5 rounded-xl border-2 text-left transition-all relative overflow-hidden flex flex-col justify-between cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-[#3B1D78] text-white border-[#3B1D78] shadow-md ring-2 ring-[#5B35B1]/50'
                  : 'bg-white dark:bg-[#1A0E2E] border-[#D8CCF3] dark:border-purple-900/60 hover:border-[#5B35B1] hover:shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-semibold ${statusFilter === 'all' ? 'text-purple-200' : 'text-slate-500'}`}>
                  1. Total WO
                </span>
                <Layers className={`w-3.5 h-3.5 ${statusFilter === 'all' ? 'text-purple-300' : 'text-[#5B35B1]'}`} />
              </div>
              <div className="mt-1.5 text-2xl font-black font-mono">
                {summaryMetrics.total}
              </div>
              <div className="mt-1 text-[10px] text-slate-400 font-medium">
                Semua Data Mitra
              </div>
            </button>

            {/* 2. WO Belum Di-assign */}
            <button
              type="button"
              onClick={() => {
                setStatusFilter('unassigned');
                setActiveTab('wo_assignment');
              }}
              className={`p-3 sm:p-3.5 rounded-xl border-2 text-left transition-all relative overflow-hidden flex flex-col justify-between cursor-pointer ${
                statusFilter === 'unassigned'
                  ? 'bg-amber-500 text-white border-amber-600 shadow-md ring-2 ring-amber-500/50'
                  : 'bg-white dark:bg-[#1A0E2E] border-amber-200 dark:border-amber-900/50 hover:border-amber-400 hover:shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-bold ${statusFilter === 'unassigned' ? 'text-amber-100' : 'text-amber-600 dark:text-amber-400'}`}>
                  2. Belum Di-assign
                </span>
                <Clock className={`w-3.5 h-3.5 ${statusFilter === 'unassigned' ? 'text-white' : 'text-amber-500'}`} />
              </div>
              <div className={`mt-1.5 text-2xl font-black font-mono ${statusFilter === 'unassigned' ? 'text-white' : 'text-amber-600 dark:text-amber-400'}`}>
                {summaryMetrics.unassigned}
              </div>
              <div className={`mt-1 text-[10px] font-medium ${statusFilter === 'unassigned' ? 'text-amber-100' : 'text-slate-400'}`}>
                Klik untuk Assign Langsung
              </div>
            </button>

            {/* 3. WO Sudah Di-assign */}
            <button
              type="button"
              onClick={() => {
                setStatusFilter('assigned');
                setActiveTab('wo_assignment');
              }}
              className={`p-3 sm:p-3.5 rounded-xl border-2 text-left transition-all relative overflow-hidden flex flex-col justify-between cursor-pointer ${
                statusFilter === 'assigned'
                  ? 'bg-[#5B35B1] text-white border-[#3B1D78] shadow-md ring-2 ring-[#5B35B1]/50'
                  : 'bg-white dark:bg-[#1A0E2E] border-[#D8CCF3] dark:border-purple-900/60 hover:border-[#5B35B1] hover:shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-bold ${statusFilter === 'assigned' ? 'text-purple-100' : 'text-[#5B35B1] dark:text-purple-300'}`}>
                  3. Sudah Di-assign
                </span>
                <UserCheck className={`w-3.5 h-3.5 ${statusFilter === 'assigned' ? 'text-white' : 'text-[#5B35B1]'}`} />
              </div>
              <div className={`mt-1.5 text-2xl font-black font-mono ${statusFilter === 'assigned' ? 'text-white' : 'text-[#5B35B1] dark:text-purple-300'}`}>
                {summaryMetrics.assigned}
              </div>
              <div className={`mt-1 text-[10px] font-medium ${statusFilter === 'assigned' ? 'text-purple-100' : 'text-slate-400'}`}>
                {summaryMetrics.total > 0 ? `${Math.round((summaryMetrics.assigned / summaryMetrics.total) * 100)}% dari Total` : '0%'}
              </div>
            </button>

            {/* 4. WO Menunggu Pengerjaan */}
            <button
              type="button"
              onClick={() => {
                setStatusFilter('waiting');
                setActiveTab('wo_assignment');
              }}
              className={`p-3 sm:p-3.5 rounded-xl border-2 text-left transition-all relative overflow-hidden flex flex-col justify-between cursor-pointer ${
                statusFilter === 'waiting'
                  ? 'bg-slate-700 text-white border-slate-800 shadow-md ring-2 ring-slate-500/50'
                  : 'bg-white dark:bg-[#1A0E2E] border-slate-200 dark:border-slate-800 hover:border-slate-400 hover:shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-semibold ${statusFilter === 'waiting' ? 'text-slate-200' : 'text-slate-600 dark:text-slate-400'}`}>
                  4. Menunggu
                </span>
                <Clock className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div className={`mt-1.5 text-2xl font-black font-mono ${statusFilter === 'waiting' ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                {summaryMetrics.waiting}
              </div>
              <div className={`mt-1 text-[10px] font-medium ${statusFilter === 'waiting' ? 'text-slate-300' : 'text-slate-400'}`}>
                Belum Mulai Berangkat
              </div>
            </button>

            {/* 5. WO Sedang Dikerjakan */}
            <button
              type="button"
              onClick={() => {
                setStatusFilter('in_progress');
                setActiveTab('wo_assignment');
              }}
              className={`p-3 sm:p-3.5 rounded-xl border-2 text-left transition-all relative overflow-hidden flex flex-col justify-between cursor-pointer ${
                statusFilter === 'in_progress'
                  ? 'bg-blue-600 text-white border-blue-700 shadow-md ring-2 ring-blue-500/50'
                  : 'bg-white dark:bg-[#1A0E2E] border-blue-200 dark:border-blue-900/50 hover:border-blue-400 hover:shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-bold ${statusFilter === 'in_progress' ? 'text-blue-100' : 'text-blue-600 dark:text-blue-400'}`}>
                  5. Sedang Dikerjakan
                </span>
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
              </div>
              <div className={`mt-1.5 text-2xl font-black font-mono ${statusFilter === 'in_progress' ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`}>
                {summaryMetrics.inProgress}
              </div>
              <div className={`mt-1 text-[10px] font-medium ${statusFilter === 'in_progress' ? 'text-blue-100' : 'text-slate-400'}`}>
                En Route / On Site
              </div>
            </button>

            {/* 6. WO Selesai */}
            <button
              type="button"
              onClick={() => {
                setStatusFilter('completed');
                setActiveTab('wo_assignment');
              }}
              className={`p-3 sm:p-3.5 rounded-xl border-2 text-left transition-all relative overflow-hidden flex flex-col justify-between cursor-pointer ${
                statusFilter === 'completed'
                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-md ring-2 ring-emerald-500/50'
                  : 'bg-white dark:bg-[#1A0E2E] border-emerald-200 dark:border-emerald-900/50 hover:border-emerald-400 hover:shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-bold ${statusFilter === 'completed' ? 'text-emerald-100' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  6. WO Selesai
                </span>
                <CheckCircle2 className={`w-3.5 h-3.5 ${statusFilter === 'completed' ? 'text-white' : 'text-emerald-500'}`} />
              </div>
              <div className={`mt-1.5 text-2xl font-black font-mono ${statusFilter === 'completed' ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {summaryMetrics.completed}
              </div>
              <div className={`mt-1 text-[10px] font-semibold ${statusFilter === 'completed' ? 'text-emerald-100' : 'text-emerald-600'}`}>
                {summaryMetrics.total > 0 ? `${Math.round((summaryMetrics.completed / summaryMetrics.total) * 100)}% Rasio Tuntas` : '0%'}
              </div>
            </button>

            {/* 7. WO Tertunda */}
            <button
              type="button"
              onClick={() => {
                setStatusFilter('pending');
                setActiveTab('wo_assignment');
              }}
              className={`p-3 sm:p-3.5 rounded-xl border-2 text-left transition-all relative overflow-hidden flex flex-col justify-between cursor-pointer ${
                statusFilter === 'pending'
                  ? 'bg-amber-600 text-white border-amber-700 shadow-md ring-2 ring-amber-500/50'
                  : 'bg-white dark:bg-[#1A0E2E] border-slate-200 dark:border-slate-800 hover:border-amber-400 hover:shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-bold ${statusFilter === 'pending' ? 'text-amber-100' : 'text-amber-600 dark:text-amber-400'}`}>
                  7. WO Tertunda
                </span>
                <RotateCcw className={`w-3.5 h-3.5 ${statusFilter === 'pending' ? 'text-white' : 'text-amber-500'}`} />
              </div>
              <div className={`mt-1.5 text-2xl font-black font-mono ${statusFilter === 'pending' ? 'text-white' : 'text-amber-600 dark:text-amber-400'}`}>
                {summaryMetrics.pending}
              </div>
              <div className={`mt-1 text-[10px] font-medium ${statusFilter === 'pending' ? 'text-amber-100' : 'text-slate-400'}`}>
                Reschedule / Pending
              </div>
            </button>

            {/* 8. WO Bermasalah */}
            <button
              type="button"
              onClick={() => {
                setStatusFilter('problem');
                setActiveTab('wo_assignment');
              }}
              className={`p-3 sm:p-3.5 rounded-xl border-2 text-left transition-all relative overflow-hidden flex flex-col justify-between cursor-pointer ${
                statusFilter === 'problem'
                  ? 'bg-rose-600 text-white border-rose-700 shadow-md ring-2 ring-rose-500/50'
                  : 'bg-white dark:bg-[#1A0E2E] border-rose-200 dark:border-rose-900/50 hover:border-rose-400 hover:shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-bold ${statusFilter === 'problem' ? 'text-rose-100' : 'text-rose-600 dark:text-rose-400'}`}>
                  8. WO Bermasalah
                </span>
                <XCircle className={`w-3.5 h-3.5 ${statusFilter === 'problem' ? 'text-white' : 'text-rose-500'}`} />
              </div>
              <div className={`mt-1.5 text-2xl font-black font-mono ${statusFilter === 'problem' ? 'text-white' : 'text-rose-600 dark:text-rose-400'}`}>
                {summaryMetrics.problem}
              </div>
              <div className={`mt-1 text-[10px] font-medium ${statusFilter === 'problem' ? 'text-rose-100' : 'text-slate-400'}`}>
                Gagal / Batal
              </div>
            </button>

            {/* 9. Total Installer */}
            <div className="p-3 sm:p-3.5 rounded-xl border-2 bg-white dark:bg-[#1A0E2E] border-[#D8CCF3] dark:border-purple-900/60 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#3B1D78] dark:text-purple-300">
                  9. Total Installer
                </span>
                <Users2 className="w-3.5 h-3.5 text-[#5B35B1]" />
              </div>
              <div className="mt-1.5 text-2xl font-black font-mono text-slate-900 dark:text-white">
                {summaryMetrics.activeInstallers}
              </div>
              <div className="mt-1 text-[10px] text-slate-400 font-medium">
                Akun Terdaftar
              </div>
            </div>

            {/* 10. Installer Tanpa WO */}
            <div
              className={`p-3 sm:p-3.5 rounded-xl border-2 flex flex-col justify-between ${
                summaryMetrics.idleInstallers > 0
                  ? 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800'
                  : 'bg-white dark:bg-[#1A0E2E] border-[#D8CCF3] dark:border-purple-900/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                  10. Installer Tanpa WO
                </span>
                <UserCheck className="w-3.5 h-3.5 text-amber-500" />
              </div>
              <div className="mt-1.5 text-2xl font-black font-mono text-amber-700 dark:text-amber-400">
                {summaryMetrics.idleInstallers}
              </div>
              <div className="mt-1 text-[10px] text-slate-400 font-medium">
                Kapasitas Bebas
              </div>
            </div>
          </div>

          {/* Kotak Perhatian Leader & Korlap */}
          {(summaryMetrics.unassigned > 0 || summaryMetrics.problem > 0) && (
            <div className="p-4 rounded-xl border-2 border-amber-300 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
              <div className="flex items-start sm:items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 rounded-lg shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-amber-950 dark:text-amber-200">
                    Perlu Perhatian Operasional Leader & Korlap
                  </h4>
                  <p className="text-amber-800 dark:text-amber-300 text-[11px] mt-0.5">
                    Terdapat <strong className="font-mono">{summaryMetrics.unassigned} WO belum ditugaskan</strong> dan <strong className="font-mono">{summaryMetrics.problem} WO bermasalah/batal</strong> yang membutuhkan tindak lanjut operasional.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('unassigned');
                    setActiveTab('wo_assignment');
                  }}
                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-xs transition-colors text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Tugaskan WO Belum Di-assign ({summaryMetrics.unassigned})</span>
                </button>
              </div>
            </div>
          )}

          {/* TABEL EVALUASI & BEBAN KERJA TEKNISI */}
          <div className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E9E1FF] dark:border-purple-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#F5F1FF]/60 dark:bg-[#251545]/40">
              <div>
                <h3 className="font-bold text-xs text-[#3B1D78] dark:text-purple-200">
                  Tabel Evaluasi & Beban Kerja Teknisi ({myInstallers.length} Teknisi Terdaftar)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Progress (%) = Jumlah WO Selesai / Total WO yang Ditugaskan × 100%.
                </p>
              </div>

              <div className="text-xs text-slate-500 font-mono">
                Batas Kuota: <strong className="text-[#5B35B1] font-bold">{quotaSettings.defaultMaxDailyQuota} WO/Hari</strong>
              </div>
            </div>

            {myInstallers.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                Belum ada teknisi yang terdaftar di bawah kontraktor {leaderContractor}. Silakan tambahkan pada tab "Pendaftaran Akun Teknisi".
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#F5F1FF] dark:bg-[#251545] text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase">
                    <tr>
                      <th className="py-3 px-3 text-center w-10">No</th>
                      <th className="py-3 px-3 min-w-[170px]">Installer / Teknisi</th>
                      <th className="py-3 px-3">Kontraktor</th>
                      <th className="py-3 px-3 text-center font-mono">Total WO</th>
                      <th className="py-3 px-3 text-center text-slate-600 font-mono">Belum Mulai</th>
                      <th className="py-3 px-3 text-center text-blue-600 font-mono">Proses</th>
                      <th className="py-3 px-3 text-center text-emerald-600 font-mono">Selesai</th>
                      <th className="py-3 px-3 text-center text-amber-600 font-mono">Tertunda</th>
                      <th className="py-3 px-3 min-w-[200px]">Progress Visual</th>
                      <th className="py-3 px-3 text-center min-w-[140px]">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {installerProgressRows.map((row, idx) => {
                      const isIdle = row.totalWO === 0;
                      return (
                        <tr key={row.installer.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                          <td className="py-3 px-3 text-center font-mono text-slate-400">{idx + 1}</td>
                          <td className="py-3 px-3">
                            <div
                              onClick={() => setSelectedInstallerForDetail(row.installer)}
                              className="font-bold text-slate-900 dark:text-white hover:text-[#5B35B1] cursor-pointer flex items-center gap-1.5"
                            >
                              <span>{row.installer.name}</span>
                              <span className={`w-2 h-2 rounded-full ${row.installer.active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                            </div>
                            <div className="text-[11px] font-mono text-slate-400">@{row.installer.username}</div>
                            {row.installer.phone && (
                              <div className="text-[10.5px] text-emerald-600 font-mono mt-0.5 flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                <span>{row.installer.phone}</span>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-slate-600 dark:text-slate-400">{leaderContractor}</td>
                          <td className="py-3 px-3 text-center font-mono font-bold text-slate-900 dark:text-white">
                            {row.totalWO}
                          </td>
                          <td className="py-3 px-3 text-center font-mono text-slate-600 dark:text-slate-400">
                            {row.notStarted}
                          </td>
                          <td className="py-3 px-3 text-center font-mono font-bold text-blue-600 dark:text-blue-400">
                            {row.inProgress}
                          </td>
                          <td className="py-3 px-3 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {row.finished}
                          </td>
                          <td className="py-3 px-3 text-center font-mono text-amber-600 dark:text-amber-400">
                            {row.pending}
                          </td>
                          <td className="py-3 px-3 align-middle">
                            {isIdle ? (
                              <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500">
                                Belum Ada Tugas
                              </span>
                            ) : (
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                                    {row.finished} dari {row.totalWO} WO selesai
                                  </span>
                                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                    {row.progressPercent}%
                                  </span>
                                </div>
                                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-500 ${
                                      row.progressPercent === 100
                                        ? 'bg-emerald-500'
                                        : row.progressPercent > 50
                                        ? 'bg-blue-500'
                                        : row.progressPercent > 0
                                        ? 'bg-amber-500'
                                        : 'bg-slate-400'
                                    }`}
                                    style={{ width: `${Math.min(100, row.progressPercent)}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setSelectedInstallerForDetail(row.installer)}
                                className="px-2.5 py-1 bg-[#F5F1FF] text-[#5B35B1] hover:bg-[#E9E1FF] font-semibold rounded-lg text-xs cursor-pointer"
                              >
                                Detail
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setBulkTargetInstaller(row.installer.name);
                                  setIsBulkAssignModalOpen(true);
                                }}
                                className="px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold rounded-lg text-xs cursor-pointer"
                              >
                                + Assign
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* MATRIKS JADWAL & KAPASITAS TEKNISI */}
          <div className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E9E1FF] dark:border-purple-900/40">
              <div>
                <h4 className="font-bold text-[#3B1D78] dark:text-purple-200 text-xs flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#5B35B1]" />
                  <span>Jadwal Harian & Utilisasi Beban Teknisi ({leaderContractor})</span>
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Batas kuota harian: <strong className="text-[#5B35B1]">{quotaSettings.defaultMaxDailyQuota} WO/teknisi</strong>. Klik slot kosong untuk langsung menugaskan WO.
                </p>
              </div>

              {/* Date Filter */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500 font-medium">Tanggal Operasi:</span>
                <button
                  type="button"
                  onClick={() => setScheduleDate(getJakartaDateString(0))}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    scheduleDate === getJakartaDateString(0)
                      ? 'bg-[#5B35B1] text-white font-bold'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Hari Ini ({getJakartaDateParts(0).labelShort})
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleDate(getJakartaDateString(1))}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    scheduleDate === getJakartaDateString(1)
                      ? 'bg-[#5B35B1] text-white font-bold'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Besok ({getJakartaDateParts(1).labelShort})
                </button>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={e => setScheduleDate(e.target.value)}
                  className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200"
                />
              </div>
            </div>

            {/* Timetable Matrix */}
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#F5F1FF] dark:bg-[#251545] text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase">
                  <tr>
                    <th className="py-3 px-3 min-w-[160px]">Teknisi Lapangan</th>
                    {STANDARD_SLOTS.map(slot => (
                      <th key={slot} className="py-3 px-3 min-w-[190px] text-center border-l border-slate-200 dark:border-slate-700">
                        {slot}
                      </th>
                    ))}
                    <th className="py-3 px-3 min-w-[120px] text-center border-l border-slate-200 dark:border-slate-700">
                      Beban / Kuota
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {myInstallers.map(inst => {
                    const instDateTickets = contractorTickets.filter(
                      t => t.installerName === inst.name && (t.date === scheduleDate || t.appointmentDate === scheduleDate)
                    );
                    const maxQuota = getMaxQuotaForInstaller(inst.name);
                    const isQuotaFull = instDateTickets.length >= maxQuota;

                    return (
                      <tr key={inst.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-3 font-medium text-slate-900 dark:text-white">
                          <div className="font-bold text-xs">{inst.name}</div>
                          <div className="text-[11px] font-mono text-slate-400">@{inst.username}</div>
                          {inst.phone && (
                            <div className="text-[10.5px] text-emerald-600 font-mono mt-0.5 flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              <span>{inst.phone}</span>
                            </div>
                          )}
                        </td>

                        {STANDARD_SLOTS.map(slot => {
                          const slotKey = slot.substring(0, 5);
                          const slotTickets = instDateTickets.filter(
                            t => (t.slotTime || '').includes(slotKey)
                          );

                          return (
                            <td key={slot} className="py-2.5 px-3 border-l border-slate-200 dark:border-slate-700 align-top">
                              {slotTickets.length === 0 ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedSlotForAssign({ installer: inst.name, slot })}
                                  disabled={isQuotaFull}
                                  className={`w-full h-full min-h-[58px] p-2 rounded-lg border border-dashed flex flex-col items-center justify-center gap-1 transition-colors text-[11px] cursor-pointer ${
                                    isQuotaFull
                                      ? 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 text-slate-400 cursor-not-allowed'
                                      : 'border-[#D8CCF3] dark:border-slate-700 hover:border-[#5B35B1] hover:bg-[#F5F1FF]/60 dark:hover:bg-purple-950/30 text-slate-400 hover:text-[#5B35B1]'
                                  }`}
                                >
                                  {isQuotaFull ? (
                                    <span className="text-[10px] text-rose-500 font-semibold">Kuota Penuh</span>
                                  ) : (
                                    <>
                                      <span className="font-semibold text-emerald-600 text-[10.5px] flex items-center gap-1">
                                        <Check className="w-3 h-3" /> Slot Bebas
                                      </span>
                                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                        <Plus className="w-2.5 h-2.5" /> Tugaskan WO
                                      </span>
                                    </>
                                  )}
                                </button>
                              ) : (
                                <div className="space-y-1.5">
                                  {slotTickets.map(t => (
                                    <div
                                      key={t.id}
                                      className="p-2 rounded-lg bg-[#F5F1FF] dark:bg-purple-950/60 border border-[#D8CCF3] dark:border-purple-800 text-xs space-y-1 shadow-2xs"
                                    >
                                      <div className="flex items-center justify-between">
                                        <span
                                          onClick={() => onSelectTicket(t)}
                                          className="font-mono font-bold text-[#5B35B1] dark:text-purple-300 hover:underline cursor-pointer"
                                        >
                                          {t.woNumber}
                                        </span>
                                        <StatusInstallerBadge status={t.statusWOInstaller} />
                                      </div>
                                      <div className="font-medium text-slate-800 dark:text-slate-200 truncate">{t.customerName}</div>
                                      <div className="text-[10px] text-slate-500 truncate">{t.clusterName || t.area}</div>
                                      <div className="flex items-center justify-between pt-1 border-t border-[#E9E1FF] dark:border-purple-900 text-[10px]">
                                        <button
                                          type="button"
                                          onClick={() => onSelectTicket(t)}
                                          className="text-[#5B35B1] dark:text-purple-400 font-semibold hover:underline cursor-pointer"
                                        >
                                          Detail
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
                                          className="text-emerald-600 font-semibold hover:underline flex items-center gap-0.5 cursor-pointer"
                                        >
                                          <Phone className="w-2.5 h-2.5" />
                                          <span>WA</span>
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          );
                        })}

                        <td className="py-3 px-3 text-center border-l border-slate-200 dark:border-slate-700 align-middle">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold ${
                              instDateTickets.length >= maxQuota
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                : instDateTickets.length > 0
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            {instDateTickets.length} / {maxQuota} WO
                          </span>
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
      {/* TAB 3: MANAJEMEN TIM TEKNISI                                 */}
      {/* ============================================================ */}
      {activeTab === 'installer_mgmt' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Add Installer Form */}
          <div className="lg:col-span-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4 text-xs h-fit">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold">
                <UserPlus className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                  Tambah Akun Installer Baru
                </h4>
                <p className="text-[11px] text-slate-500">
                  Kontraktor otomatis terikat: <strong className="text-emerald-600">{leaderContractor}</strong>
                </p>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-400 flex items-start gap-2">
              <Shield className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <span>
                <strong>Otoritas Terbatas:</strong> Sebagai Leader, Anda hanya berwenang membuat dan mengelola akun <strong>Installer (Teknisi)</strong> pada mitra kontraktor ini.
              </span>
            </div>

            <form onSubmit={handleAddInstaller} className="space-y-3">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Nama Lengkap Teknisi <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Budi Santoso"
                  value={instName}
                  onChange={e => setInstName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Username Unik <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: budi.santoso"
                  value={instUsername}
                  onChange={e => setInstUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono text-slate-800 dark:text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Nomor Telepon / WhatsApp <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="Contoh: 081234567890"
                  value={instPhone}
                  onChange={e => setInstPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Alamat Email (Opsional)
                </label>
                <input
                  type="email"
                  placeholder="teknisi@mitra.com"
                  value={instEmail}
                  onChange={e => setInstEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm transition-all"
              >
                Daftarkan Teknisi
              </button>
            </form>
          </div>

          {/* List of Installers */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <h4 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-2">
                <Users2 className="w-4 h-4 text-emerald-600" />
                <span>Daftar Tim Teknisi Aktif ({myInstallers.length})</span>
              </h4>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                <input
                  type="text"
                  placeholder="Cari nama / username..."
                  value={installerSearch}
                  onChange={e => setInstallerSearch(e.target.value)}
                  className="pl-8 pr-3 py-1 bg-slate-50 dark:bg-slate-800 border rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="divide-y border rounded-xl overflow-hidden">
              {myInstallers
                .filter(u =>
                  u.name.toLowerCase().includes(installerSearch.toLowerCase()) ||
                  u.username.toLowerCase().includes(installerSearch.toLowerCase())
                )
                .map(inst => {
                  const instTickets = contractorTickets.filter(t => t.installerName === inst.name);
                  return (
                    <div
                      key={inst.id}
                      className="p-3.5 bg-white dark:bg-slate-900 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <span>{inst.name}</span>
                          <span className="font-mono text-slate-400 font-normal">@{inst.username}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          WhatsApp: {inst.phone || '-'} · Area: {inst.area || 'Semua'}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-indigo-600 text-[11px]">
                          {instTickets.length} WO Ditugaskan
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedInstallerForDetail(inst)}
                          className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 rounded-lg font-semibold text-xs"
                        >
                          Detail 7 Tab
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 4: PENGATURAN KUOTA BEBAN TEKNISI                        */}
      {/* ============================================================ */}
      {activeTab === 'quota_settings' && (
        <div className="max-w-2xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-5 text-xs">
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
                  className="w-4 h-4 text-indigo-600 rounded"
                />
              </label>
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
                        {firstTicket?.appointmentDate || firstTicket?.date || scheduleDate}
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
