import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Ticket, TicketStatusWOInstaller, ProgressReportEntry, ChatAttachment } from '../../types/index.ts';
import { useApp } from '../../context/AppContext';
import { StatusInstallerBadge, StatusWhatsAppBadge, StatusAgentBadge, StatusApprovalBadge } from '../common/Badge';
import { buildWhatsAppClickToChatUrl } from '../../services/whatsappService';
import { openCustomerAddressInGoogleMaps } from '../../services/mapsService';
import { getSafePreviewUrl } from '../../services/storageCompatibility';
import {
  ArrowLeft,
  Phone,
  MessageSquare,
  MapPin,
  CheckCircle2,
  Navigation,
  Clock,
  Calendar,
  Building2,
  User,
  Wrench,
  Radio,
  Copy,
  Check,
  Send,
  Save,
  Camera,
  Maximize2,
  FileText,
  MessageCircle,
  Edit3,
  History,
  Paperclip,
  AlertCircle,
  X,
  Shield,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Info,
  Tag,
  Play
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useAnimation } from '../../context/AnimationContext';
import { useMoraJawsSound } from '../../context/SoundContext';

interface InstallerTicketFullviewProps {
  ticket: Ticket;
  onBack: () => void;
  onOpenWhatsApp: (ticket: Ticket) => void;
}

export const InstallerTicketFullview: React.FC<InstallerTicketFullviewProps> = ({
  ticket: initialTicket,
  onBack,
  onOpenWhatsApp
}) => {
  const {
    tickets,
    updateTicketStatus,
    startWorkOnTicket,
    saveProgressReport,
    rootCauseCategories,
    currentUser,
    getMessagesForTicket,
    sendTicketMessage,
    markTicketMessagesAsRead,
    reportDropdownCategories,
    isDropdownCategoriesLoading,
    hierarchicalStatuses,
    getReasonsForStatus,
    getRemarksForReason,
    chatCategories,
    setTicketChatCategory
  } = useApp();
  const { toast } = useToast();
  const { showGlobalError, startLoading, stopLoading } = useAnimation();
  const { playReportSavedSound, playErrorSound } = useMoraJawsSound();

  // Keep ticket state fresh from context whenever tickets update
  const activeTicket = useMemo(() => {
    return tickets.find(t => t.id === initialTicket.id) || initialTicket;
  }, [tickets, initialTicket]);

  // UI helpers
  const [copiedAddress, setCopiedAddress] = useState(false);

  // Success Confirmation Alert Modal State
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [savedReportSnapshot, setSavedReportSnapshot] = useState<{
    status: string;
    reason: string;
    rootCause: string;
    remarks: string;
  } | null>(null);

  // -------------------------------------------------------------
  // FORM REPORT STATE (Report Status Pembaruan)
  // Mapping 3 Tingkat:
  // Level 1: Report Status (Status WO)
  // Level 2: Reason Report (Reason WO)
  // Level 3: Rootcause (Remarks)
  // -------------------------------------------------------------
  const latestReport = activeTicket.progressReports?.[0];

  const [reportStatus, setReportStatus] = useState<string>(() => {
    return latestReport?.reportStatus || activeTicket.statusWOInstaller || '';
  });
  const [reportStatusId, setReportStatusId] = useState<string>(() => {
    return latestReport?.reportStatusId || activeTicket.reportStatusId || '';
  });

  const [reasonReport, setReasonReport] = useState<string>(() => {
    return latestReport?.reasonReport || '';
  });
  const [reasonReportId, setReasonReportId] = useState<string>(() => {
    return latestReport?.reasonReportId || activeTicket.reasonReportId || '';
  });

  const [rootCause, setRootCause] = useState<string>(() => {
    return latestReport?.rootCause || activeTicket.technicalReport?.rootCause || '';
  });
  const [rootcauseId, setRootcauseId] = useState<string>(() => {
    return latestReport?.rootcauseId || activeTicket.rootcauseId || '';
  });

  const [remarksReport, setRemarksReport] = useState<string>(() => {
    return latestReport?.remarksReport || activeTicket.remarksWOInstaller || activeTicket.technicalReport?.technicalDescription || '';
  });

  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // 1. Level 1: Status WO options (Active only)
  const availableStatusOptions = useMemo(() => {
    if (hierarchicalStatuses && hierarchicalStatuses.length > 0) {
      return hierarchicalStatuses
        .filter(s => s.active !== false && (s as any).isActive !== false)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    return [];
  }, [hierarchicalStatuses]);

  // Selected Status Object
  const selectedStatusObj = useMemo(() => {
    if (!reportStatus) return null;
    const norm = reportStatus.trim().toLowerCase();
    return (
      availableStatusOptions.find(
        s => s.id === reportStatusId || s.name.trim().toLowerCase() === norm || (s.code && s.code.trim().toLowerCase() === norm)
      ) || null
    );
  }, [availableStatusOptions, reportStatus, reportStatusId]);

  // 2. Level 2: Reason WO options (strictly child of chosen Report Status)
  const availableReasonOptions = useMemo(() => {
    if (!selectedStatusObj) return [];
    return (selectedStatusObj.reasons || [])
      .filter(r => r.active !== false && (r as any).isActive !== false)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [selectedStatusObj]);

  // Selected Reason Object
  const selectedReasonObj = useMemo(() => {
    if (!reasonReport || !selectedStatusObj) return null;
    const norm = reasonReport.trim().toLowerCase();
    return (
      availableReasonOptions.find(
        r => r.id === reasonReportId || r.name.trim().toLowerCase() === norm
      ) || null
    );
  }, [availableReasonOptions, reasonReport, reasonReportId, selectedStatusObj]);

  // 3. Level 3: Rootcause / Remarks options (strictly sub-child of chosen Reason Report)
  const availableRootcauseOptions = useMemo(() => {
    if (!selectedReasonObj) return [];
    return (selectedReasonObj.remarks || [])
      .filter(rm => rm.active !== false && (rm as any).isActive !== false)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [selectedReasonObj]);

  // Level 3 Remarks Templates for quick buttons
  const availableRemarksTemplates = useMemo(() => {
    return availableRootcauseOptions.map(rm => rm.text || rm.name);
  }, [availableRootcauseOptions]);

  // Cascading Change Handlers (Dependent 3-Tier Interaction Rules)
  // When Status changes -> Reason & Rootcause are automatically RESET
  const handleReportStatusChange = (newStatusName: string) => {
    setReportStatus(newStatusName);
    const matched = availableStatusOptions.find(
      s => s.name === newStatusName || s.id === newStatusName || (s.code && s.code === newStatusName)
    );
    setReportStatusId(matched?.id || '');

    // Reset Level 2 & Level 3
    setReasonReport('');
    setReasonReportId('');
    setRootCause('');
    setRootcauseId('');
    setReportError(null);
  };

  // When Reason changes -> Rootcause is automatically RESET
  const handleReasonReportChange = (newReasonName: string) => {
    setReasonReport(newReasonName);
    const matched = availableReasonOptions.find(
      r => r.name === newReasonName || r.id === newReasonName
    );
    setReasonReportId(matched?.id || '');

    // Reset Level 3
    setRootCause('');
    setRootcauseId('');
    setReportError(null);
  };

  // When Rootcause changes
  const handleRootcauseChange = (newRootcauseText: string) => {
    setRootCause(newRootcauseText);
    const matched = availableRootcauseOptions.find(
      rm => (rm.text || rm.name) === newRootcauseText || rm.name === newRootcauseText || rm.id === newRootcauseText
    );
    setRootcauseId(matched?.id || '');
    setReportError(null);

    // If remarksReport is empty, autofill with selected rootcause
    if (!remarksReport.trim()) {
      setRemarksReport(matched?.text || matched?.name || newRootcauseText);
    }
  };

  // Cancel report form edits
  const handleCancelReport = () => {
    const prevReport = activeTicket.progressReports?.[0];
    setReportStatus(prevReport?.reportStatus || activeTicket.statusWOInstaller || '');
    setReportStatusId(prevReport?.reportStatusId || activeTicket.reportStatusId || '');
    setReasonReport(prevReport?.reasonReport || '');
    setReasonReportId(prevReport?.reasonReportId || activeTicket.reasonReportId || '');
    setRootCause(prevReport?.rootCause || activeTicket.technicalReport?.rootCause || '');
    setRootcauseId(prevReport?.rootcauseId || activeTicket.rootcauseId || '');
    setRemarksReport(prevReport?.remarksReport || activeTicket.remarksWOInstaller || '');
    setReportError(null);
    toast.info('Perubahan formulir laporan dibatalkan.', 'Dibatalkan');
  };

  // Save report submission with strict Firestore write confirmation
  const handleSaveReport = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmittingReport) return;

    // 1. Validasi formulir 3 tingkat
    if (!reportStatus) {
      setReportError('Silakan pilih Report Status (Level 1).');
      return;
    }
    if (!reasonReport) {
      setReportError('Silakan pilih Reason Report (Level 2).');
      return;
    }
    if (!rootCause) {
      setReportError('Silakan pilih Rootcause (Level 3 - Remarks).');
      return;
    }
    if (!remarksReport.trim()) {
      setReportError('Remarks Report (catatan hasil penanganan teknisi) wajib diisi.');
      return;
    }

    setReportError(null);
    setIsSubmittingReport(true);
    startLoading({
      title: 'MENYIMPAN REPORT KE FIRESTORE...',
      subtitle: 'Memverifikasi relasi hierarki 3-tingkat dan menyimpan laporan ke database Cloud Firestore'
    });

    try {
      const res = await saveProgressReport(activeTicket.id, {
        reportStatus,
        reportStatusId,
        reasonReport,
        reasonReportId,
        rootCause,
        rootcauseId,
        remarksReport: remarksReport.trim()
      });

      if (res.success) {
        playReportSavedSound();
        setSavedReportSnapshot({
          status: reportStatus,
          reason: reasonReport,
          rootCause,
          remarks: remarksReport.trim()
        });
        setShowSuccessAlert(true);
        toast.success(
          `Laporan status "${reportStatus}" (Reason: ${reasonReport}) berhasil disimpan ke Cloud Firestore.`,
          'REPORT TERSIMPAN'
        );
      } else {
        playErrorSound();
        const errMsg = res.error || 'Gagal menyimpan laporan ke Cloud Firestore.';
        setReportError(errMsg);
        showGlobalError({
          errorCode: 'MJ-FS-002',
          module: 'Firestore',
          operation: 'Save Progress Report',
          description: 'Gagal menyimpan data laporan.',
          message: errMsg,
          technicalDetails: errMsg,
          severity: 'HIGH',
          onRetry: () => handleSaveReport()
        });
      }
    } catch (err: any) {
      playErrorSound();
      const errMsg = err?.message || 'Terjadi kesalahan sistem saat menyimpan laporan.';
      setReportError(errMsg);
      showGlobalError({
        errorCode: 'MJ-FS-002',
        module: 'Firestore',
        operation: 'Save Progress Report Exception',
        description: 'Terjadi kegagalan komunikasi dengan database Firestore.',
        message: errMsg,
        technicalDetails: errMsg,
        severity: 'HIGH',
        onRetry: () => handleSaveReport()
      });
    } finally {
      setIsSubmittingReport(false);
      stopLoading();
    }
  };

  // Navigasi konfirmasi teknisi ke Dashboard Installer
  const handleConfirmRedirect = () => {
    if (isRedirecting) return;
    setIsRedirecting(true);
    setShowSuccessAlert(false);
    // Redirect ke halaman Dashboard Installer
    onBack();
  };

  // -------------------------------------------------------------
  // HISTORY PROGRESS REPORTS LIST
  // -------------------------------------------------------------
  const progressHistory: ProgressReportEntry[] = useMemo(() => {
    const list = [...(activeTicket.progressReports || [])];

    // If there is an existing technical report or remarks not in progressReports, synthesize an entry
    if (activeTicket.technicalReport && !list.some(r => r.id === activeTicket.technicalReport?.id)) {
      list.push({
        id: activeTicket.technicalReport.id || 'rep-legacy',
        ticketId: activeTicket.id,
        timestamp: activeTicket.technicalReport.submittedAt || activeTicket.updatedAt || activeTicket.createdAt,
        submittedBy: activeTicket.technicalReport.submittedBy || activeTicket.installerName || 'Teknisi Lapangan',
        userRole: 'installer',
        reportStatus: activeTicket.statusWOInstaller || 'Completed',
        reasonReport: activeTicket.technicalReport.workResult || 'Laporan Teknis Awal',
        rootCause: activeTicket.technicalReport.rootCause || 'Redaman Fiber Tinggi',
        remarksReport:
          activeTicket.technicalReport.technicalDescription ||
          activeTicket.remarksWOInstaller ||
          activeTicket.technicalReport.correctiveAction ||
          'Pengerjaan telah dilaksanakan sesuai prosedur teknis.',
        installerName: activeTicket.installerName,
        appointmentDate: activeTicket.appointmentDate || activeTicket.date,
        slotTime: activeTicket.slotTime
      });
    }

    // Sort newest to oldest
    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [activeTicket]);

  // -------------------------------------------------------------
  // LIVE CHAT ROOM STATE & HANDLERS (Synchronized with Contact Center)
  // -------------------------------------------------------------
  const [chatCategory, setChatCategory] = useState<string>(() => {
    return activeTicket.chatCategory || (chatCategories[0]?.name || 'UNCLASSIFIED');
  });

  // Active chat categories from shared Firestore appSettings/chat_categories
  const activeChatCategories = useMemo(() => {
    return chatCategories.filter(c => c.active !== false && (c as any).isActive !== false);
  }, [chatCategories]);

  // Current category object to retrieve theme color
  const currentChatCategoryObj = useMemo(() => {
    return chatCategories.find(c => c.name === chatCategory || c.id === chatCategory) || null;
  }, [chatCategories, chatCategory]);

  const [chatInputText, setChatInputText] = useState('');
  const [chatAttachments, setChatAttachments] = useState<ChatAttachment[]>([]);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  const messages = getMessagesForTicket(activeTicket.id);

  // Sync category when activeTicket.chatCategory changes from Firestore
  useEffect(() => {
    if (activeTicket.chatCategory) {
      setChatCategory(activeTicket.chatCategory);
    }
  }, [activeTicket.chatCategory]);

  // Handle changing chat category synchronized to Firestore appSettings & ticket
  const handleChatCategorySelect = async (newCat: string) => {
    setChatCategory(newCat);
    await setTicketChatCategory(activeTicket.id, newCat);
    toast.success(`Kategori chat disinkronkan ke "${newCat}".`);
  };

  // Auto mark messages as read
  useEffect(() => {
    markTicketMessagesAsRead(activeTicket.id);
  }, [activeTicket.id, messages.length, markTicketMessagesAsRead]);

  // Auto scroll chat to bottom
  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Handle chat attachment
  const handleChatFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      if (!validTypes.includes(file.type)) {
        const msg = 'Format foto harus JPG, JPEG, PNG, atau WebP.';
        setChatError(msg);
        toast.error(msg, 'Format Tidak Didukung');
        setTimeout(() => setChatError(null), 4000);
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        const msg = `Ukuran file "${file.name}" melebihi batas 5MB.`;
        setChatError(msg);
        toast.error(msg, 'File Terlalu Besar');
        setTimeout(() => setChatError(null), 4000);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const attachment: ChatAttachment = {
          id: 'att-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          url: dataUrl,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type
        };
        setChatAttachments(prev => [...prev, attachment]);
        toast.info(`Foto "${file.name}" siap dikirim.`, 'Lampiran Ditambahkan');
      };
      reader.readAsDataURL(file);
    });

    if (chatFileInputRef.current) {
      chatFileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setChatAttachments(prev => prev.filter(a => a.id !== id));
  };

  // Handle sending chat message
  const handleSendChatMessage = (e?: React.FormEvent, directText?: string) => {
    if (e) e.preventDefault();
    if (isSendingChat) return;

    const text = directText !== undefined ? directText : chatInputText;
    if (!text.trim() && chatAttachments.length === 0) {
      return;
    }

    setIsSendingChat(true);
    setChatError(null);

    const res = sendTicketMessage(activeTicket.id, text.trim(), chatAttachments, chatCategory);
    setIsSendingChat(false);

    if (res.success) {
      setChatInputText('');
      setChatAttachments([]);
    } else {
      const err = res.error || 'Gagal mengirim pesan chat.';
      setChatError(err);
      toast.error(err, 'Chat Gagal');
      setTimeout(() => setChatError(null), 4000);
    }
  };

  // WhatsApp click-to-chat
  const waUrlObj = buildWhatsAppClickToChatUrl(
    activeTicket.customerPhone,
    `Halo ${activeTicket.customerName}, saya teknisi ${currentUser.name || 'MoraJaws'} terkait penanganan tiket WO ${activeTicket.woNumber} hari ini.`
  );

  const handleCopyAddress = () => {
    const fullAddr = `${activeTicket.streetName || activeTicket.address || ''}, ${activeTicket.clusterName || ''}, ${activeTicket.area || ''}`.trim();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(fullAddr);
      setCopiedAddress(true);
      toast.success('Alamat lengkap berhasil disalin ke clipboard.', 'Disalin');
      setTimeout(() => setCopiedAddress(false), 2000);
    }
  };

  const handleOpenMaps = () => {
    openCustomerAddressInGoogleMaps(activeTicket, () => {
      toast.warning('Alamat pelanggan belum tersedia untuk Google Maps.', 'Google Maps');
    });
  };

  // Quick Action: Otw Lokasi
  const handleOtwLokasi = () => {
    updateTicketStatus(activeTicket.id, undefined, 'En Route', `Teknisi ${currentUser.name} sedang berangkat menuju lokasi.`);
    toast.success('Status diubah menjadi En Route (Otw Lokasi).', 'Otw Lokasi');
    handleOpenMaps();
  };

  return (
    <div className="bg-[#F8F9FA] dark:bg-[#0D071B] min-h-screen -m-3 sm:-m-6 lg:-m-8 flex flex-col text-[#21183A] dark:text-[#F5F1FF]">
      {/* ============================================================== */}
      {/* TOP STICKY BAR: NAVIGATION & HEADER ACTIONS                   */}
      {/* ============================================================== */}
      <div className="sticky top-0 z-30 bg-white/95 dark:bg-[#150B27]/95 backdrop-blur-md border-b border-slate-200 dark:border-[#2D1754] px-4 sm:px-6 py-3 flex items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="p-2 -ml-1 rounded-xl text-[#3B1D78] dark:text-[#E9E1FF] hover:bg-[#E9E1FF] dark:hover:bg-[#2D1754] transition-colors flex items-center gap-1.5 text-xs font-bold shrink-0 cursor-pointer"
            title="Kembali ke Daftar WO"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Kembali ke Daftar</span>
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-extrabold text-sm sm:text-base text-[#3B1D78] dark:text-[#E9E1FF]">
                {activeTicket.woNumber}
              </span>
              <StatusInstallerBadge status={activeTicket.statusWOInstaller} />
              <StatusApprovalBadge status={activeTicket.approvalStatus} />
              <StatusAgentBadge status={activeTicket.statusWOAgent} />
              <StatusWhatsAppBadge status={activeTicket.statusWhatsApp} />
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
              Jadwal: <strong className="text-[#3B1D78] dark:text-white font-mono">{activeTicket.appointmentDate || activeTicket.date}</strong> · Slot: <strong className="text-[#5B35B1] dark:text-[#A78BFA] font-mono">{activeTicket.slotTime}</strong>
            </div>
          </div>
        </div>

        {/* Quick Header Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {!activeTicket.workStartedAt ? (
            <button
              type="button"
              onClick={async () => {
                await startWorkOnTicket(activeTicket.id);
              }}
              className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer animate-pulse"
              title="Mulai pengerjaan tiket WO ini sekarang"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>MULAI KERJAKAN</span>
            </button>
          ) : (
            <div className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 rounded-xl text-[11px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
              <Clock className="w-3 h-3 text-emerald-500" />
              <span>Dikerjakan: {activeTicket.workStartedAt ? new Date(activeTicket.workStartedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleOtwLokasi}
            className="px-3 py-1.5 bg-[#5B35B1] hover:bg-[#3B1D78] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            title="Update status En Route dan buka rute Google Maps"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Otw Lokasi</span>
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* MAIN CONTAINER: INFORMASI TICKET + TWO-COLUMN LAYOUT           */}
      {/* ============================================================== */}
      <div className="flex-1 p-3 sm:p-5 lg:p-6 max-w-7xl mx-auto w-full space-y-6 pb-20">

        {/* ============================================================ */}
        {/* SECTION A: INFORMASI TICKET (STAYS ON TOP)                   */}
        {/* ============================================================ */}
        <div className="bg-white dark:bg-[#150B27] rounded-2xl border border-slate-200 dark:border-[#2D1754] p-4 sm:p-5 shadow-xs space-y-4">
          {/* Card Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-[#2D1754]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-[#2D1754] text-[#5B35B1] dark:text-[#A78BFA] flex items-center justify-center font-bold">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Informasi Ticket Work Order</span>
                  <span className="text-xs px-2 py-0.5 rounded-md font-mono bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {activeTicket.ticketCategory || 'FTTH Service'}
                  </span>
                </h2>
                <div className="text-[11px] text-slate-500">
                  ID Tiket: <span className="font-mono font-semibold">{activeTicket.idCustomer || activeTicket.customerId || activeTicket.id}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Mitra Vendor:</span>
              <span className="font-bold text-[#3B1D78] dark:text-[#E9E1FF] px-2.5 py-0.5 bg-slate-100 dark:bg-[#20103A] rounded-lg border border-slate-200 dark:border-[#3B1D78]">
                {activeTicket.contactorName || activeTicket.contractorName || 'Mitra Kontraktor'}
              </span>
            </div>
          </div>

          {/* Grid Information Sections */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {/* Box 1: Informasi Pelanggan & Kontak (with WhatsApp button) */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#1B0E32] border border-slate-200 dark:border-[#2D1754] space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-[#5B35B1] dark:text-[#A78BFA]" />
                  <span>Pelanggan</span>
                </span>
                <span className="font-mono text-[10px] px-1.5 py-0.2 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                  ID: {activeTicket.idCustomer || activeTicket.customerId || '-'}
                </span>
              </div>

              <div>
                <div className="font-bold text-sm text-slate-900 dark:text-white">
                  {activeTicket.customerName || activeTicket.endUserName || '-'}
                </div>
              </div>

              {/* Phone and WhatsApp button right next to it */}
              <div className="pt-1 border-t border-slate-200/70 dark:border-[#2D1754] space-y-1.5">
                <div className="text-[10.5px] text-slate-500">Nomor Telepon:</div>
                <div className="flex items-center justify-between gap-1.5 flex-wrap">
                  <div className="flex items-center gap-1 font-mono font-bold text-slate-800 dark:text-slate-200">
                    <Phone className="w-3 h-3 text-[#5B35B1]" />
                    <span>{activeTicket.customerPhone || 'Tidak ada nomor'}</span>
                  </div>

                  {activeTicket.customerPhone ? (
                    <div className="flex items-center gap-1">
                      <a
                        href={`tel:${activeTicket.customerPhone}`}
                        className="p-1 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-300 rounded text-[11px] font-semibold border border-slate-200 dark:border-slate-700"
                        title="Telepon Langsung"
                      >
                        <Phone className="w-3 h-3 text-emerald-600" />
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          if (waUrlObj.url) {
                            window.open(waUrlObj.url, '_blank', 'noopener,noreferrer');
                          } else {
                            onOpenWhatsApp(activeTicket);
                          }
                        }}
                        className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                        title="Chat WhatsApp Pelanggan"
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span>WhatsApp</span>
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-400 italic">Kosong</span>
                  )}
                </div>
                {activeTicket.customerContact2 && (
                  <div className="text-[10.5px] text-slate-500 truncate">
                    Kontak Alt: {activeTicket.customerContact2}
                  </div>
                )}
              </div>
            </div>

            {/* Box 2: Jadwal & Penugasan Personel */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#1B0E32] border border-slate-200 dark:border-[#2D1754] space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#5B35B1] dark:text-[#A78BFA]" />
                <span>Jadwal & Personel</span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 text-[11px]">Appointment Date:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {activeTicket.appointmentDate || activeTicket.date || '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 text-[11px]">Slot Time:</span>
                  <span className="font-mono font-bold text-[#5B35B1] dark:text-[#A78BFA]">
                    {activeTicket.slotTime || '-'}
                  </span>
                </div>
              </div>

              <div className="pt-1.5 border-t border-slate-200/70 dark:border-[#2D1754] space-y-1 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Leader / Korlap:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[130px]">
                    {activeTicket.leaderName || activeTicket.corlapName || '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Teknisi Installer:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 truncate max-w-[130px]">
                    {activeTicket.installerName || 'Belum Ditugaskan'}
                  </span>
                </div>
              </div>
            </div>

            {/* Box 3: Lokasi & Alamat (Interactive Google Maps) */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#1B0E32] border border-slate-200 dark:border-[#2D1754] space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-rose-500" />
                  <span>Lokasi & Alamat</span>
                </span>
                <span className="text-[10px] text-slate-500 font-semibold">{activeTicket.area || '-'}</span>
              </div>

              <div>
                <div className="font-bold text-slate-800 dark:text-slate-200 truncate">
                  {activeTicket.clusterName || 'Non-Cluster'}
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2 mt-0.5">
                  {activeTicket.streetName || activeTicket.address || 'Alamat belum diisi'}
                </div>
                {activeTicket.streetAlternatif && (
                  <div className="text-[10.5px] text-amber-700 dark:text-amber-400 mt-0.5 truncate">
                    Patokan: {activeTicket.streetAlternatif}
                  </div>
                )}
              </div>

              <div className="pt-1.5 border-t border-slate-200/70 dark:border-[#2D1754] flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCopyAddress}
                  className="flex-1 py-1 px-2 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-300 rounded text-[11px] font-semibold border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1 cursor-pointer"
                >
                  {copiedAddress ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedAddress ? 'Tersalin' : 'Salin'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenMaps}
                  className="flex-1 py-1 px-2 bg-[#5B35B1] hover:bg-[#3B1D78] text-white rounded text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Navigation className="w-3 h-3" />
                  <span>Maps</span>
                </button>
              </div>
            </div>

            {/* Box 4: Infrastruktur Jaringan & Teknis */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#1B0E32] border border-slate-200 dark:border-[#2D1754] space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-[#5B35B1] dark:text-[#A78BFA]" />
                <span>Teknis Jaringan</span>
              </div>

              <div className="space-y-1 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Kode FDT:</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {activeTicket.fdtCode || '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">FAT & Port:</span>
                  <span className="font-mono font-bold text-[#5B35B1] dark:text-[#A78BFA]">
                    {activeTicket.fatCode || '-'}{activeTicket.fatPort ? ` (P${activeTicket.fatPort})` : ''}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">SN ONT:</span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[120px]">
                    {activeTicket.ontSerialNumber || activeTicket.technicalReport?.deviceSerialNumber || '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-200/70 dark:border-[#2D1754]">
                  <span className="text-slate-500">OPM Terakhir:</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {activeTicket.technicalReport?.opticalPowerDbm || '-'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* SECTION B: TWO-COLUMN LAYOUT (DESKTOP) / VERTICAL STACK (HP) */}
        {/* Left Column: Report Status Pembaruan & History Progress Report */}
        {/* Right Column: Live Chat Room                                 */}
        {/* ============================================================ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          {/* ========================================================== */}
          {/* KOLOM KIRI (Left Column ~46% on desktop: lg:col-span-5/6)   */}
          {/* 1. Report Status Pembaruan                                  */}
          {/* 2. History Progress Report                                  */}
          {/* ========================================================== */}
          <div className="lg:col-span-5 xl:col-span-6 space-y-6">

            {/* -------------------------------------------------------- */}
            {/* 1. KARTU: REPORT STATUS PEMBARUAN                        */}
            {/* -------------------------------------------------------- */}
            <div className="bg-white dark:bg-[#150B27] rounded-2xl border border-slate-200 dark:border-[#2D1754] p-5 shadow-xs space-y-4">
              {/* Card Title with Pencil Icon & Gold/Yellow Text */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#2D1754]">
                <div className="flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-amber-500 shrink-0" />
                  <h3 className="font-bold text-base text-amber-500 dark:text-amber-400">
                    Report Status Pembaruan
                  </h3>
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Formulir Progres Teknisi
                </span>
              </div>

              {/* Error Notice if any */}
              {reportError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{reportError}</span>
                </div>
              )}

              {/* Form Fields */}
              <form onSubmit={handleSaveReport} className="space-y-4 text-xs sm:text-sm">
                {/* 1. Report Status (Level 1 - Status WO) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block font-semibold text-slate-800 dark:text-slate-200">
                      Report Status <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono font-medium">
                      Level 1 – Status WO
                    </span>
                  </div>
                  <select
                    value={reportStatus}
                    onChange={e => handleReportStatusChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all text-xs sm:text-sm cursor-pointer"
                  >
                    <option value="">-- Pilih Report Status (Level 1) --</option>
                    {availableStatusOptions.map(st => (
                      <option key={st.id} value={st.name}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Reason Report (Level 2 - Reason WO, dependent on Level 1) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block font-semibold text-slate-800 dark:text-slate-200">
                      Reason Report <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono font-medium">
                      Level 2 – Reason WO
                    </span>
                  </div>
                  <select
                    value={reasonReport}
                    disabled={!reportStatus || availableReasonOptions.length === 0}
                    onChange={e => handleReasonReportChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {!reportStatus ? (
                      <option value="">-- Pilih Report Status Terlebih Dahulu --</option>
                    ) : availableReasonOptions.length === 0 ? (
                      <option value="">-- Tidak ada pilihan tersedia --</option>
                    ) : (
                      <>
                        <option value="">-- Pilih Reason Report (Level 2) --</option>
                        {availableReasonOptions.map(rs => (
                          <option key={rs.id} value={rs.name}>
                            {rs.name}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

                {/* 3. Rootcause (Level 3 - Remarks, dependent on Level 2) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block font-semibold text-slate-800 dark:text-slate-200">
                      Rootcause <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono font-medium">
                      Level 3 – Remarks
                    </span>
                  </div>
                  <select
                    value={rootCause}
                    disabled={!reasonReport || availableRootcauseOptions.length === 0}
                    onChange={e => handleRootcauseChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {!reasonReport ? (
                      <option value="">-- Pilih Reason Report Terlebih Dahulu --</option>
                    ) : availableRootcauseOptions.length === 0 ? (
                      <option value="">-- Tidak ada pilihan tersedia --</option>
                    ) : (
                      <>
                        <option value="">-- Pilih Rootcause (Level 3 - Remarks) --</option>
                        {availableRootcauseOptions.map(rm => (
                          <option key={rm.id} value={rm.text || rm.name}>
                            {rm.text || rm.name}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

                {/* 4. Remarks Report */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block font-semibold text-slate-800 dark:text-slate-200">
                      Remarks Report <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono font-normal">Level 3 (Template / Manual)</span>
                  </div>

                  {availableRemarksTemplates.length > 0 && (
                    <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] no-scrollbar">
                      <span className="text-slate-400 text-[10px] font-semibold shrink-0">Template:</span>
                      {availableRemarksTemplates.map((tpl, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setRemarksReport(tpl)}
                          className="px-2 py-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/80 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 whitespace-nowrap text-[10px] font-medium transition-colors cursor-pointer"
                          title="Klik untuk memilih template ini"
                        >
                          {tpl.length > 32 ? tpl.slice(0, 32) + '...' : tpl}
                        </button>
                      ))}
                    </div>
                  )}

                  <textarea
                    rows={3}
                    value={remarksReport}
                    onChange={e => setRemarksReport(e.target.value)}
                    placeholder="Tuliskan catatan detail hasil penanganan teknisi di lapangan..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all resize-none text-xs sm:text-sm"
                  />
                </div>

                {/* Buttons: Cancel (Red) & Save Report (Green) */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleCancelReport}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold rounded-xl text-xs sm:text-sm transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                    title="Batal perubahan formulir"
                  >
                    <X className="w-4 h-4" />
                    <span>Cancel</span>
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmittingReport}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-bold rounded-xl text-xs sm:text-sm transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                    title="Simpan Laporan Status"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSubmittingReport ? 'Menyimpan...' : 'Save Report'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* ========================================================== */}
          {/* KOLOM KANAN (Right Column ~54% on desktop: lg:col-span-7/6) */}
          {/* Live Chat Room                                             */}
          {/* ========================================================== */}
          <div className="lg:col-span-7 xl:col-span-6">
            <div className="bg-white dark:bg-[#150B27] rounded-2xl border border-slate-200 dark:border-[#2D1754] p-5 shadow-xs flex flex-col h-[740px]">
              
              {/* Header with Blue Chat Icon & Blue Title */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#2D1754] shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-blue-600 dark:text-blue-400">
                      Live Chat Room
                    </h3>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Koordinasi WO: <strong className="text-slate-700 dark:text-slate-300 font-mono">{activeTicket.woNumber}</strong>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {chatCategory && (
                    <span
                      className="px-2.5 py-1 rounded-full text-[11px] font-bold text-white shadow-2xs flex items-center gap-1.5"
                      style={{ backgroundColor: currentChatCategoryObj?.color || '#3B82F6' }}
                      title={`Kategori Chat: ${chatCategory}`}
                    >
                      <Tag className="w-3 h-3" />
                      <span>{chatCategory}</span>
                    </span>
                  )}
                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Real-Time Online</span>
                  </div>
                </div>
              </div>

              {/* Chat Conversation Area (Scrollable with message bubbles) */}
              <div className="flex-1 p-4 my-3 overflow-y-auto space-y-3.5 bg-slate-50/70 dark:bg-[#0D071B]/70 rounded-xl border border-slate-200/80 dark:border-[#2D1754]">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-2">
                    <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs">
                      <MessageCircle className="w-5 h-5" />
                    </div>
                    <h4 className="font-bold text-slate-700 dark:text-slate-300 text-xs sm:text-sm">
                      Belum Ada Pesan di Chat Room Ini
                    </h4>
                    <p className="text-xs max-w-sm text-slate-500 leading-relaxed">
                      Kirim pesan langsung kepada <strong>Dispatch Officer</strong> atau <strong>Korlap</strong> untuk koordinasi lokasi, port FAT, redaman OPM, atau approval pengerjaan.
                    </p>
                  </div>
                ) : (
                  messages.map(msg => {
                    const isMe = msg.senderId === currentUser.id || msg.senderRole === currentUser.role;
                    const formattedTime = new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    });

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1`}
                      >
                        {/* Sender Name & Timestamp */}
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            {isMe ? 'Anda' : msg.senderName}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {formattedTime}
                          </span>
                        </div>

                        {/* Chat Bubble */}
                        <div
                          className={`max-w-[85%] sm:max-w-[78%] rounded-2xl px-4 py-2.5 shadow-2xs space-y-1.5 text-xs sm:text-sm ${
                            isMe
                              ? 'bg-blue-600 text-white rounded-tr-xs'
                              : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-tl-xs'
                          }`}
                        >
                          {/* Text Message */}
                          {msg.text && (
                            <p className="leading-relaxed whitespace-pre-wrap break-words font-normal">
                              {msg.text}
                            </p>
                          )}

                          {/* Image Attachments with Thumbnail & Click-to-Zoom Link */}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                              {msg.attachments.map(att => (
                                <div
                                  key={att.id}
                                  className="group relative rounded-xl overflow-hidden border border-black/10 dark:border-white/10 bg-black/5"
                                >
                                  <img
                                    src={getSafePreviewUrl(att.url)}
                                    alt={att.fileName}
                                    className="w-full h-32 object-cover transition-transform group-hover:scale-105"
                                  />
                                  <div
                                    onClick={() => setZoomImage(att.url)}
                                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1 text-[11px] font-bold cursor-pointer"
                                  >
                                    <Maximize2 className="w-3.5 h-3.5" />
                                    <span>Lihat Gambar</span>
                                  </div>
                                  <div className="p-1 text-[10px] truncate bg-black/60 text-white text-center">
                                    <button
                                      type="button"
                                      onClick={() => setZoomImage(att.url)}
                                      className="underline hover:text-blue-200 cursor-pointer"
                                    >
                                      {att.fileName || 'Lihat Gambar'}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatMessagesEndRef} />
              </div>

              {/* Chat Error Alert */}
              {chatError && (
                <div className="mb-2 p-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-1.5 shrink-0">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{chatError}</span>
                </div>
              )}

              {/* Pending Attachments Preview */}
              {chatAttachments.length > 0 && (
                <div className="mb-2 p-2 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 rounded-xl flex items-center gap-2 overflow-x-auto shrink-0">
                  {chatAttachments.map(att => (
                    <div key={att.id} className="relative shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-blue-400 shadow-2xs">
                      <img src={att.url} alt={att.fileName} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(att.id)}
                        className="absolute top-0.5 right-0.5 p-0.5 bg-rose-600 text-white rounded-full hover:bg-rose-700 transition-colors"
                        title="Hapus lampiran"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <span className="text-[11px] text-blue-900 dark:text-blue-200 font-semibold">
                    {chatAttachments.length} foto siap dikirim
                  </span>
                </div>
              )}

              {/* Leader View-Only Warning (if leader) */}
              {currentUser.role === 'leader' ? (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl text-center text-xs text-amber-800 dark:text-amber-300 font-medium shrink-0">
                  Mode Pantau: Leader hanya dapat membaca riwayat percakapan.
                </div>
              ) : (
                /* Chat Input Controls: Category Dropdown + Message Input + Attach + Send (Blue) */
                <form onSubmit={handleSendChatMessage} className="space-y-2 shrink-0">
                  {/* Dropdown "Select Category Chat" - Synchronized with Contact Center */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        Category Chat (Sinkron Contact Center)
                      </label>
                      {currentChatCategoryObj && (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded font-bold text-white shadow-2xs"
                          style={{ backgroundColor: currentChatCategoryObj.color || '#3B82F6' }}
                        >
                          {currentChatCategoryObj.name}
                        </span>
                      )}
                    </div>
                    <select
                      value={chatCategory}
                      onChange={e => handleChatCategorySelect(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    >
                      {activeChatCategories.length > 0 ? (
                        activeChatCategories.map(cat => (
                          <option key={cat.id} value={cat.name}>
                            {cat.name}
                          </option>
                        ))
                      ) : (
                        <option value={chatCategory || 'UNCLASSIFIED'}>
                          {chatCategory || 'UNCLASSIFIED'}
                        </option>
                      )}
                    </select>
                  </div>

                  {/* Input row: Attachment button + Type Message... input + Blue Send button */}
                  <div className="flex items-center gap-2">
                    {/* Hidden file input */}
                    <input
                      type="file"
                      ref={chatFileInputRef}
                      onChange={handleChatFileSelect}
                      accept="image/jpeg,image/png,image/webp,image/jpg"
                      multiple
                      className="hidden"
                    />

                    {/* Attachment button */}
                    <button
                      type="button"
                      onClick={() => chatFileInputRef.current?.click()}
                      className="p-2.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 transition-colors shrink-0 cursor-pointer"
                      title="Lampirkan foto"
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>

                    {/* Input Type Message... */}
                    <input
                      type="text"
                      value={chatInputText}
                      onChange={e => setChatInputText(e.target.value)}
                      placeholder="Type Message..."
                      className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />

                    {/* Blue Send button with paper plane icon */}
                    <button
                      type="submit"
                      disabled={isSendingChat || (!chatInputText.trim() && chatAttachments.length === 0)}
                      className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl font-bold flex items-center justify-center transition-colors shrink-0 cursor-pointer shadow-xs"
                      title="Kirim pesan"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* SECTION C: HISTORY PROGRESS REPORT (PINDAH KE PALING BAWAH)  */}
        {/* ============================================================== */}
        <div className="bg-white dark:bg-[#150B27] rounded-2xl border border-slate-200 dark:border-[#2D1754] p-5 shadow-xs space-y-4">
          {/* Card Title with Green History Icon & Green Text */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#2D1754]">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <h3 className="font-bold text-base text-emerald-600 dark:text-emerald-400">
                History Progress Report
              </h3>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              {progressHistory.length} Catatan
            </span>
          </div>

          {/* Progress History Content (Sorted newest to oldest) */}
          {progressHistory.length === 0 ? (
            <div className="py-8 text-center text-slate-400 space-y-2">
              <Clock className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="text-xs">Belum ada riwayat laporan untuk tiket ini.</p>
              <p className="text-[11px] text-slate-500">
                Isi formulir Report Status Pembaruan di atas dan klik Save Report.
              </p>
            </div>
          ) : (
            <div className="space-y-3.5 max-h-[500px] overflow-y-auto pr-1">
              {progressHistory.map((item, idx) => {
                const formattedDate = new Date(item.timestamp).toLocaleString('id-ID', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return (
                  <div
                    key={item.id || idx}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#1B0E32] space-y-2 text-xs relative overflow-hidden"
                  >
                    {/* Top info: Date/Time, User/Technician, Status Badge */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/60 dark:border-[#2D1754]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-emerald-600" />
                          {formattedDate} WIB
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1">
                          <User className="w-3 h-3 text-[#5B35B1]" />
                          {item.submittedBy}
                        </span>
                      </div>

                      <span className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${
                        item.reportStatus === 'Completed' || item.reportStatus === 'Installed'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : item.reportStatus === 'Failed / Cancelled'
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}>
                        {item.reportStatus}
                      </span>
                    </div>

                    {/* Installer & Schedule info if available */}
                    {(item.installerName || item.appointmentDate) && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
                        <span>Installer: <strong className="text-slate-700 dark:text-slate-300">{item.installerName || activeTicket.installerName || '-'}</strong></span>
                        <span>·</span>
                        <span>Jadwal: <strong className="text-slate-700 dark:text-slate-300 font-mono">{item.appointmentDate || activeTicket.appointmentDate || activeTicket.date} ({item.slotTime || activeTicket.slotTime})</strong></span>
                      </div>
                    )}

                    {/* Reason & Rootcause */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                      <div className="p-2 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Reason Report</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                          {item.reasonReport}
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Rootcause</span>
                        <span className="font-bold text-purple-700 dark:text-purple-300 text-xs">
                          {item.rootCause}
                        </span>
                      </div>
                    </div>

                    {/* Remarks */}
                    {item.remarksReport && (
                      <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs leading-relaxed italic">
                        "{item.remarksReport}"
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ============================================================== */}
      {/* MORAJAWS SUCCESS ALERT MODAL WITH CONFIRMATION BUTTON           */}
      {/* ============================================================== */}
      {showSuccessAlert && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#160D29]/85 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            className="w-full max-w-md bg-[#160D29] rounded-3xl border border-[#D8B4FE]/50 p-6 sm:p-7 shadow-[0_0_50px_rgba(113,53,181,0.6)] relative overflow-hidden animate-in zoom-in-95 duration-200 text-center"
            style={{
              backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(113, 53, 181, 0.45) 0%, rgba(22, 13, 41, 0.98) 75%)'
            }}
          >
            {/* Top Gloss Highlight Sweep */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#D8B4FE] to-transparent" />

            {/* 3D Glossy Check Icon with Rotating Lilac Orbital Ring */}
            <div className="relative w-20 h-20 mx-auto mb-4 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-xl animate-pulse" />
              <svg className="absolute inset-0 w-full h-full animate-spin" style={{ animationDuration: '6s' }} viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="44"
                  fill="none"
                  stroke="#D8B4FE"
                  strokeWidth="2.5"
                  strokeDasharray="25 15"
                  strokeLinecap="round"
                  opacity="0.8"
                />
              </svg>
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#35105E] to-[#160D29] border border-[#D8B4FE]/60 flex items-center justify-center shadow-[0_0_20px_rgba(52,211,153,0.4)] relative z-10">
                <CheckCircle2 className="w-9 h-9 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
              </div>
            </div>

            {/* Badge Status */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase bg-[#35105E] text-[#D8B4FE] border border-[#D8B4FE]/40 mb-2 shadow-[0_0_12px_rgba(168,85,247,0.3)]">
              <Sparkles className="w-3.5 h-3.5 text-[#D8B4FE]" />
              <span>MORAJAWS SYSTEM</span>
            </div>

            {/* Title */}
            <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight uppercase">
              REPORT TERSIMPAN!
            </h3>

            <p className="text-xs sm:text-sm text-[#E9D5FF] mt-1.5 font-medium leading-relaxed">
              Laporan berhasil disimpan dan tiket WO kini berstatus <strong className="text-amber-300 font-bold">BUTUH APPROVAL</strong> (Menunggu pemeriksaan & persetujuan Dispatch).
            </p>

            {/* System Status Indicators */}
            <div className="grid grid-cols-2 gap-2 mt-3.5 mb-2">
              <div className="py-1.5 px-3 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 font-bold text-xs flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
                <Clock className="w-3.5 h-3.5" />
                <span>Status: BUTUH APPROVAL</span>
              </div>
              <div className="py-1.5 px-3 rounded-xl bg-[#7135B5]/25 border border-[#D8B4FE]/30 text-[#E9D5FF] font-bold text-xs flex items-center justify-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-[#D8B4FE]" />
                <span>Firestore Synced</span>
              </div>
            </div>

            {/* Snapshot Summary Box */}
            <div className="my-4 p-3.5 rounded-2xl bg-[#35105E]/40 border border-[#D8B4FE]/25 text-left text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[#D8B4FE]/70">No. Work Order:</span>
                <span className="font-mono font-bold text-white bg-[#35105E] px-2 py-0.5 rounded border border-[#D8B4FE]/30">
                  {activeTicket.woNumber}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#D8B4FE]/70">Approval Dispatch:</span>
                <span className="font-bold text-amber-300 bg-amber-500/20 px-2.5 py-0.5 rounded-md border border-amber-400/40 animate-pulse">
                  BUTUH APPROVAL
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#D8B4FE]/70">Report Status:</span>
                <span className="font-bold text-white bg-purple-500/25 text-[#E9D5FF] px-2.5 py-0.5 rounded-md border border-[#D8B4FE]/30">
                  {savedReportSnapshot?.status || reportStatus}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#D8B4FE]/70">Reason Report:</span>
                <span className="font-semibold text-[#E9D5FF] truncate max-w-[210px]" title={savedReportSnapshot?.reason || reasonReport}>
                  {savedReportSnapshot?.reason || reasonReport}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#D8B4FE]/70">Rootcause:</span>
                <span className="font-semibold text-[#E9D5FF] truncate max-w-[210px]" title={savedReportSnapshot?.rootCause || rootCause}>
                  {savedReportSnapshot?.rootCause || rootCause}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-[#D8B4FE]/15">
                <span className="text-[#D8B4FE]/70">Teknisi Pelapor:</span>
                <span className="font-bold text-white">{currentUser.name}</span>
              </div>
            </div>

            {/* Confirmation Button with specified Dark Purple Gloss & Lilac Luxury Design */}
            <button
              type="button"
              disabled={isRedirecting}
              onClick={handleConfirmRedirect}
              className="w-full py-3.5 px-5 bg-gradient-to-r from-[#7135B5] to-[#A855F7] hover:from-[#7E3CC7] hover:to-[#B666FE] text-white font-extrabold text-xs sm:text-sm tracking-wide rounded-[14px] shadow-[0_0_24px_rgba(168,85,247,0.55)] border border-[#E9D5FF]/40 flex items-center justify-center gap-2.5 transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed group relative overflow-hidden"
              title="Konfirmasi & Lanjut ke Dashboard Installer"
            >
              {/* Glossy sweep effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 pointer-events-none" />

              <CheckCircle2 className="w-5 h-5 text-white shrink-0 drop-shadow-[0_0_6px_rgba(255,255,255,0.8)]" />
              <span className="relative z-10">
                {isRedirecting ? 'MENGALIHKAN KE DASHBOARD...' : 'KONFIRMASI & LANJUT KE DASHBOARD'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* LIGHTBOX MODAL: FULLSIZE IMAGE VIEW                            */}
      {/* ============================================================== */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-70 bg-black/90 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setZoomImage(null)}
        >
          <div className="relative max-w-4xl max-h-[92vh]" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setZoomImage(null)}
              className="absolute top-3 right-3 p-2 bg-black/70 text-white rounded-full hover:bg-rose-600 transition-colors z-10 cursor-pointer"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={getSafePreviewUrl(zoomImage)}
              alt="Lampiran Bukti Lapangan"
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
