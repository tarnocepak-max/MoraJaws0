import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Ticket, TicketStatusWOInstaller, ProgressReportEntry, ChatAttachment } from '../../types/index.ts';
import { useApp } from '../../context/AppContext';
import { StatusInstallerBadge, StatusWhatsAppBadge, StatusAgentBadge } from '../common/Badge';
import { buildWhatsAppClickToChatUrl } from '../../services/whatsappService';
import { openCustomerAddressInGoogleMaps } from '../../services/mapsService';
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
  Info
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

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
    saveProgressReport,
    rootCauseCategories,
    currentUser,
    getMessagesForTicket,
    sendTicketMessage,
    markTicketMessagesAsRead
  } = useApp();
  const { toast } = useToast();

  // Keep ticket state fresh from context whenever tickets update
  const activeTicket = useMemo(() => {
    return tickets.find(t => t.id === initialTicket.id) || initialTicket;
  }, [tickets, initialTicket]);

  // UI helpers
  const [copiedAddress, setCopiedAddress] = useState(false);

  // -------------------------------------------------------------
  // FORM REPORT STATE (Report Status Pembaruan)
  // -------------------------------------------------------------
  const [reportStatus, setReportStatus] = useState<string>(() => {
    return activeTicket.statusWOInstaller || 'En Route';
  });

  const [reasonReport, setReasonReport] = useState<string>(() => {
    if (activeTicket.statusWOInstaller === 'Completed') return 'Instalasi Selesai Sesuai Standar';
    if (activeTicket.statusWOInstaller === 'Pending Technical') return 'Kendala Redaman Tinggi / LOS';
    if (activeTicket.statusWOInstaller === 'Failed / Cancelled') return 'Pelanggan Meminta Reschedule';
    return 'Pengerjaan Lapangan Sedang Berlangsung';
  });

  const [rootCause, setRootCause] = useState<string>(() => {
    return (
      activeTicket.technicalReport?.rootCause ||
      rootCauseCategories[0]?.items[0] ||
      'Fiber Optic Putus'
    );
  });

  const [remarksReport, setRemarksReport] = useState<string>(() => {
    return activeTicket.remarksWOInstaller || activeTicket.technicalReport?.technicalDescription || '';
  });

  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Synchronize reason choices when report status changes
  const handleReportStatusChange = (newStatus: string) => {
    setReportStatus(newStatus);
    if (newStatus === 'Completed' || newStatus === 'Installed') {
      setReasonReport('Instalasi Selesai Sesuai Standar');
    } else if (newStatus === 'En Route') {
      setReasonReport('Teknisi Meluncur Menuju Lokasi');
    } else if (newStatus === 'On Site') {
      setReasonReport('Tiba di Lokasi dan Pengecekan Fisik');
    } else if (newStatus === 'Pending Technical') {
      setReasonReport('Kendala Redaman Tinggi / LOS');
    } else if (newStatus === 'Failed / Cancelled') {
      setReasonReport('Pelanggan Tidak di Tempat / Lokasi');
    }
  };

  // Cancel report form edits
  const handleCancelReport = () => {
    setReportStatus(activeTicket.statusWOInstaller || 'En Route');
    setReasonReport('Pengerjaan Lapangan Sedang Berlangsung');
    setRootCause(activeTicket.technicalReport?.rootCause || rootCauseCategories[0]?.items[0] || 'Fiber Optic Putus');
    setRemarksReport(activeTicket.remarksWOInstaller || '');
    setReportError(null);
    toast.info('Perubahan formulir laporan dibatalkan.', 'Dibatalkan');
  };

  // Save report submission
  const handleSaveReport = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmittingReport) return;

    if (!reportStatus) {
      setReportError('Silakan pilih Report Status.');
      return;
    }
    if (!reasonReport) {
      setReportError('Silakan pilih Reason Report.');
      return;
    }
    if (!rootCause) {
      setReportError('Silakan pilih Rootcause.');
      return;
    }
    if (!remarksReport.trim()) {
      setReportError('Remarks Report (catatan hasil penanganan) wajib diisi.');
      return;
    }

    setReportError(null);
    setIsSubmittingReport(true);

    try {
      const res = saveProgressReport(activeTicket.id, {
        reportStatus,
        reasonReport,
        rootCause,
        remarksReport: remarksReport.trim()
      });

      if (res.success) {
        toast.success(
          `Laporan status "${reportStatus}" berhasil disimpan dan dicatat ke riwayat.`,
          'Laporan Berhasil Disimpan'
        );
      } else {
        setReportError(res.error || 'Gagal menyimpan laporan.');
        toast.error(res.error || 'Gagal menyimpan laporan.', 'Gagal');
      }
    } catch (err: any) {
      const msg = err?.message || 'Terjadi kesalahan sistem saat menyimpan laporan.';
      setReportError(msg);
      toast.error(msg, 'Kesalahan');
    } finally {
      setIsSubmittingReport(false);
    }
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
  // LIVE CHAT ROOM STATE & HANDLERS
  // -------------------------------------------------------------
  const [chatCategory, setChatCategory] = useState<string>('Umum / Koordinasi');
  const [chatInputText, setChatInputText] = useState('');
  const [chatAttachments, setChatAttachments] = useState<ChatAttachment[]>([]);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  const messages = getMessagesForTicket(activeTicket.id);

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
  const handleSendChatMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSendingChat) return;

    if (!chatInputText.trim() && chatAttachments.length === 0) {
      return;
    }

    setIsSendingChat(true);
    setChatError(null);

    // Prefix category if selected and not default "Umum"
    const textToSend = chatCategory && chatCategory !== 'Umum / Koordinasi'
      ? `[${chatCategory}] ${chatInputText.trim()}`
      : chatInputText.trim();

    const res = sendTicketMessage(activeTicket.id, textToSend, chatAttachments, chatCategory);
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
              <StatusAgentBadge status={activeTicket.statusWOAgent} />
              <StatusWhatsAppBadge status={activeTicket.statusWhatsApp} />
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
              Jadwal: <strong className="text-[#3B1D78] dark:text-white font-mono">{activeTicket.appointmentDate || activeTicket.date}</strong> · Slot: <strong className="text-[#5B35B1] dark:text-[#A78BFA] font-mono">{activeTicket.slotTime}</strong>
            </div>
          </div>
        </div>

        {/* Quick Header Action */}
        <div className="flex items-center gap-2 shrink-0">
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
                {/* 1. Report Status */}
                <div>
                  <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                    Report Status <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={reportStatus}
                    onChange={e => handleReportStatusChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all text-xs sm:text-sm"
                  >
                    <option value="En Route">En Route (Otw Lokasi)</option>
                    <option value="On Site">On Site (Tiba di Lokasi)</option>
                    <option value="Completed">Completed (Selesai Pengerjaan)</option>
                    <option value="Installed">Installed (Perangkat Terpasang)</option>
                    <option value="Pending Technical">Pending Technical (Tertunda Kendala Teknis)</option>
                    <option value="Failed / Cancelled">Failed / Cancelled (Gagal / Batal)</option>
                    <option value="Assigned">Assigned (Ditugaskan)</option>
                  </select>
                </div>

                {/* 2. Reason Report */}
                <div>
                  <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                    Reason Report <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={reasonReport}
                    onChange={e => setReasonReport(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all text-xs sm:text-sm"
                  >
                    <option value="Instalasi Selesai Sesuai Standar">Instalasi Selesai Sesuai Standar</option>
                    <option value="Redaman Optik Baik (-16 s/d -24 dBm)">Redaman Optik Baik (-16 s/d -24 dBm)</option>
                    <option value="Perangkat ONT / Router Aktif Normal">Perangkat ONT / Router Aktif Normal</option>
                    <option value="Selesai Berhasil Diperbaiki">Selesai Berhasil Diperbaiki</option>
                    <option value="Kendala Redaman Tinggi / LOS">Kendala Redaman Tinggi / LOS</option>
                    <option value="Kabel Dropcore Putus / Terjepit">Kabel Dropcore Putus / Terjepit</option>
                    <option value="FAT / ODP Penuh atau Rusak">FAT / ODP Penuh atau Rusak</option>
                    <option value="Pelanggan Meminta Reschedule">Pelanggan Meminta Reschedule</option>
                    <option value="Pelanggan Tidak di Tempat">Pelanggan Tidak di Tempat</option>
                    <option value="Akses Rumah / Lokasi Terkendala">Akses Rumah / Lokasi Terkendala</option>
                    <option value="Menunggu Material / Tim Tambahan">Menunggu Material / Tim Tambahan</option>
                    <option value="Pengerjaan Lapangan Sedang Berlangsung">Pengerjaan Lapangan Sedang Berlangsung</option>
                    <option value="Lainnya (Lihat Catatan Remarks)">Lainnya (Lihat Catatan Remarks)</option>
                  </select>
                </div>

                {/* 3. Rootcause */}
                <div>
                  <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                    Rootcause <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={rootCause}
                    onChange={e => setRootCause(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all text-xs sm:text-sm"
                  >
                    {rootCauseCategories.map(cat => (
                      <optgroup key={cat.id} label={cat.name}>
                        {cat.items.map(item => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    <optgroup label="Penyebab Lainnya">
                      <option value="Kendala Teknis Lapangan Lainnya">Kendala Teknis Lapangan Lainnya</option>
                    </optgroup>
                  </select>
                </div>

                {/* 4. Remarks Report */}
                <div>
                  <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                    Remarks Report <span className="text-rose-500">*</span>
                  </label>
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

                <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Real-Time Online</span>
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
                                    src={att.url}
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
                  {/* Dropdown "Select Category Chat" */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Select Category Chat
                    </label>
                    <select
                      value={chatCategory}
                      onChange={e => setChatCategory(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    >
                      <option value="Umum / Koordinasi">Umum / Koordinasi</option>
                      <option value="Update Kendala Lapangan">Update Kendala Lapangan</option>
                      <option value="Konfirmasi Redaman OPM & FAT">Konfirmasi Redaman OPM & FAT</option>
                      <option value="Konfirmasi Kedatangan / Pelanggan">Konfirmasi Kedatangan / Pelanggan</option>
                      <option value="Permohonan Approval Dispatch">Permohonan Approval Dispatch</option>
                      <option value="Laporan Pekerjaan Selesai">Laporan Pekerjaan Selesai</option>
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
              src={zoomImage}
              alt="Lampiran Bukti Lapangan"
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
