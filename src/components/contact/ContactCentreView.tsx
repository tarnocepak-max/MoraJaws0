import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Ticket, TicketMessage, ChatAttachment, UserRole } from '../../types';
import {
  MessageSquare,
  Search,
  Send,
  Image as ImageIcon,
  User,
  Shield,
  Wrench,
  Building2,
  CheckCheck,
  Clock,
  Phone,
  Maximize2,
  X,
  AlertCircle,
  Filter,
  CheckCircle2,
  Radio,
  FileText
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

export const ContactCentreView: React.FC = () => {
  const {
    tickets,
    currentUser,
    ticketMessages,
    sendTicketMessage,
    markTicketMessagesAsRead,
    getMessagesForTicket,
    getTicketUnreadCount
  } = useApp();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState<'all' | 'dispatch_leader' | 'leader_installer'>('all');
  const [selectedTicketId, setSelectedTicketId] = useState<string>('');
  const [inputText, setInputText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Available tickets for current user role
  const availableTickets = useMemo(() => {
    return (tickets || []).filter(t => {
      if (!t || t.isArchived || t.isDeleted) return false;
      if (currentUser?.role === 'super_admin' || currentUser?.role === 'dispatch') return true;
      if (currentUser?.role === 'leader') {
        const cName = (t.contactorName || t.contractorName || '').toLowerCase();
        return !currentUser.contractor || cName === (currentUser.contractor || '').toLowerCase();
      }
      if (currentUser?.role === 'installer') {
        return (t.installerName || '').toLowerCase() === (currentUser?.name || '').toLowerCase();
      }
      return true;
    });
  }, [tickets, currentUser]);

  // Filtered ticket list for conversation drawer
  const conversationList = useMemo(() => {
    return (availableTickets || []).filter(t => {
      if (!t) return false;
      if (searchQuery && typeof searchQuery === 'string' && searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchWo = (t.woNumber ? String(t.woNumber).toLowerCase() : '').includes(q);
        const matchCust = (t.customerName ? String(t.customerName).toLowerCase() : '').includes(q);
        const matchCid = (t.idCustomer || t.customerId || '').toLowerCase().includes(q);
        const matchPhone = (t.customerPhone || '').includes(q);
        if (!matchWo && !matchCust && !matchCid && !matchPhone) return false;
      }
      return true;
    });
  }, [availableTickets, searchQuery]);

  // Set default selected ticket if none selected
  useEffect(() => {
    if (!selectedTicketId && conversationList.length > 0) {
      setSelectedTicketId(conversationList[0].id);
    }
  }, [conversationList, selectedTicketId]);

  const activeTicket = useMemo(() => {
    return tickets.find(t => t.id === selectedTicketId) || conversationList[0] || null;
  }, [tickets, selectedTicketId, conversationList]);

  const activeMessages = useMemo(() => {
    if (!activeTicket) return [];
    return getMessagesForTicket(activeTicket.id);
  }, [activeTicket, getMessagesForTicket, ticketMessages]);

  // Auto mark read
  useEffect(() => {
    if (activeTicket) {
      markTicketMessagesAsRead(activeTicket.id);
    }
  }, [activeTicket?.id, activeMessages.length, markTicketMessagesAsRead]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach(file => {
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      if (!validTypes.includes(file.type)) {
        toast.error('Format lampiran harus JPG, PNG, atau WebP.', 'Format Ditolak');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`Ukuran file "${file.name}" melebihi batas 5MB.`, 'Ukuran File Terlalu Besar');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const attachment: ChatAttachment = {
          id: 'att-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
          url: dataUrl,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type
        };
        setPendingAttachments(prev => [...prev, attachment]);
        toast.info(`Foto "${file.name}" siap dilampirkan.`, 'Foto Dipilih');
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeTicket || isSubmitting) return;
    if (!inputText.trim() && pendingAttachments.length === 0) return;

    setIsSubmitting(true);
    const res = sendTicketMessage(activeTicket.id, inputText.trim(), pendingAttachments);
    setIsSubmitting(false);

    if (res.success) {
      setInputText('');
      setPendingAttachments([]);
      setErrorMessage(null);
    } else {
      setErrorMessage(res.error || 'Gagal mengirim pesan.');
      toast.error(res.error || 'Gagal mengirim pesan.', 'Error');
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'dispatch':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
            <Shield className="w-2.5 h-2.5" /> Dispatch
          </span>
        );
      case 'installer':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <Wrench className="w-2.5 h-2.5" /> Installer
          </span>
        );
      case 'leader':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <Building2 className="w-2.5 h-2.5" /> Leader
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
            Admin
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#5B35B1] text-white flex items-center justify-center font-bold shadow-xs">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#3B1D78] dark:text-purple-200 flex items-center gap-2">
              <span>Contact Centre & Multi-Channel Work Order Chat</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Database Connected
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Komunikasi langsung berbasis Work Order antara Dispatch, Koordinator Lapangan (Leader), dan Teknisi (Installer).
            </p>
          </div>
        </div>
      </div>

      {/* Main 2-Panel Chat Workspace */}
      <div className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 shadow-xs overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[620px]">
        {/* Left Panel: Conversation List by WO */}
        <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-[#E9E1FF] dark:border-purple-900/50 flex flex-col bg-[#F5F1FF]/40 dark:bg-[#201138]/40">
          {/* Search Bar */}
          <div className="p-3 border-b border-[#E9E1FF] dark:border-purple-900/50 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari WO, ID, Nama, No. HP..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-[#D8CCF3] dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-[#5B35B1]"
              />
            </div>
            <div className="text-[11px] text-slate-500 flex items-center justify-between font-mono">
              <span>Tersedia: {conversationList.length} Percakapan</span>
            </div>
          </div>

          {/* List of WO Channels */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#E9E1FF] dark:divide-purple-900/30">
            {conversationList.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Tidak ada tiket Work Order yang sesuai.
              </div>
            ) : (
              conversationList.map(t => {
                const isSelected = t.id === activeTicket?.id;
                const unread = getTicketUnreadCount(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTicketId(t.id)}
                    className={`w-full text-left p-3.5 transition-all flex items-start gap-2.5 cursor-pointer ${
                      isSelected
                        ? 'bg-[#E9E1FF] dark:bg-[#3B1D78]/70 border-l-4 border-[#5B35B1]'
                        : 'hover:bg-white/60 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 font-mono font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                      WO
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono font-bold text-xs text-[#3B1D78] dark:text-purple-300 truncate">
                          {t.woNumber}
                        </span>
                        {unread > 0 && (
                          <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-rose-600 text-white">
                            {unread} baru
                          </span>
                        )}
                      </div>
                      <div className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate mt-0.5">
                        {t.customerName}
                      </div>
                      <div className="text-[10.5px] text-slate-400 truncate mt-0.5">
                        Teknisi: {t.installerName || <span className="italic">Belum Di-assign</span>}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel: Chat Message Thread */}
        <div className="lg:col-span-8 flex flex-col justify-between bg-white dark:bg-[#1A0E2E]">
          {activeTicket ? (
            <>
              {/* Channel Header Bar */}
              <div className="px-5 py-3.5 border-b border-[#E9E1FF] dark:border-purple-900/50 bg-[#F5F1FF]/60 dark:bg-[#201138]/60 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#5B35B1] text-white flex items-center justify-center font-mono font-bold text-xs shadow-xs">
                    WO
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs sm:text-sm text-[#3B1D78] dark:text-purple-200">
                        {activeTicket.woNumber}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        (ID: {activeTicket.idCustomer || activeTicket.customerId})
                      </span>
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Pelanggan: <strong className="text-slate-700 dark:text-slate-300">{activeTicket.customerName}</strong>   Teknisi: <strong className="text-emerald-600 dark:text-emerald-400">{activeTicket.installerName || 'Unassigned'}</strong>
                    </div>
                  </div>
                </div>
                <div className="text-xs text-slate-400 font-mono hidden sm:block">
                  {activeMessages.length} Pesan
                </div>
              </div>

              {/* Chat Messages Stream */}
              <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-3.5 max-h-[460px]">
                {activeMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400 space-y-2">
                    <MessageSquare className="w-10 h-10 text-slate-300 dark:text-slate-700" />
                    <div className="font-bold text-xs text-slate-700 dark:text-slate-300">
                      Belum Ada Pesan di Channel WO Ini
                    </div>
                    <p className="text-[11px] text-slate-500 max-w-sm">
                      Mulai koordinasi antara Dispatch, Leader, dan Teknisi Lapangan. Unggah foto redaman atau info kendala fisik.
                    </p>
                  </div>
                ) : (
                  activeMessages.map(msg => {
                    const isMe = msg.senderId === currentUser.id || msg.senderRole === currentUser.role;
                    const isInstaller = msg.senderRole === 'installer';
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1`}
                      >
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="font-bold text-slate-800 dark:text-slate-200">{msg.senderName}</span>
                          {getRoleBadge(msg.senderRole)}
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div
                          className={`max-w-[85%] sm:max-w-[70%] rounded-2xl p-3.5 shadow-2xs space-y-2 ${
                            isMe
                              ? 'bg-[#5B35B1] text-white rounded-tr-xs'
                              : isInstaller
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-slate-900 dark:text-white border border-emerald-200 dark:border-emerald-800 rounded-tl-xs'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-tl-xs'
                          }`}
                        >
                          {msg.text && (
                            <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">
                              {msg.text}
                            </p>
                          )}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                              {msg.attachments.map(att => (
                                <div
                                  key={att.id}
                                  onClick={() => setZoomImage(att.url)}
                                  className="group relative cursor-pointer rounded-xl overflow-hidden border border-black/15 bg-black/5"
                                >
                                  <img
                                    src={att.url}
                                    alt={att.fileName}
                                    className="w-full h-32 object-cover group-hover:scale-105 transition-transform"
                                  />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1 text-xs">
                                    <Maximize2 className="w-3.5 h-3.5" />
                                    <span>Perbesar</span>
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
                <div ref={messagesEndRef} />
              </div>

              {/* Pending Attachments Preview */}
              {pendingAttachments.length > 0 && (
                <div className="px-5 py-2 bg-indigo-50 dark:bg-indigo-950/70 border-t border-indigo-200 dark:border-indigo-900 flex items-center gap-2 overflow-x-auto shrink-0">
                  {pendingAttachments.map(att => (
                    <div key={att.id} className="relative w-16 h-16 rounded-lg overflow-hidden border border-indigo-400 shrink-0">
                      <img src={att.url} alt={att.fileName} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setPendingAttachments(prev => prev.filter(a => a.id !== att.id))}
                        className="absolute top-1 right-1 p-0.5 bg-rose-600 text-white rounded-full text-[9px]"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <span className="text-xs text-indigo-700 dark:text-indigo-300 font-semibold">
                    {pendingAttachments.length} foto siap dikirim
                  </span>
                </div>
              )}

              {/* Input Form */}
              <form onSubmit={handleSendMessage} className="p-3 sm:p-4 border-t border-[#E9E1FF] dark:border-purple-900/50 flex items-center gap-2 shrink-0 bg-white dark:bg-[#1A0E2E]">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/jpeg,image/png,image/webp,image/jpg"
                  multiple
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 text-slate-500 hover:text-[#5B35B1] hover:bg-[#E9E1FF] dark:hover:bg-slate-800 rounded-xl transition-colors shrink-0 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                  title="Lampirkan foto bukti pengerjaan / OPM"
                >
                  <ImageIcon className="w-4 h-4 text-[#5B35B1]" />
                  <span className="hidden sm:inline">Foto</span>
                </button>
                <input
                  type="text"
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  placeholder={`Tulis pesan untuk WO ${activeTicket.woNumber} sebagai ${currentUser.name}...`}
                  className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#5B35B1]"
                />
                <button
                  type="submit"
                  disabled={isSubmitting || (!inputText.trim() && pendingAttachments.length === 0)}
                  className="px-5 py-2.5 bg-[#5B35B1] hover:bg-[#3B1D78] disabled:opacity-40 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors shrink-0 shadow-sm cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>Kirim</span>
                </button>
              </form>
            </>
          ) : (
            <div className="h-full flex items-center justify-center p-8 text-center text-slate-400">
              Pilih salah satu Work Order pada panel kiri untuk membuka channel percakapan.
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Zoom Modal */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-70 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setZoomImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setZoomImage(null)}
              className="absolute top-3 right-3 p-2 bg-black/70 text-white rounded-full hover:bg-rose-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={zoomImage}
              alt="Bukti Foto Zoom"
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
