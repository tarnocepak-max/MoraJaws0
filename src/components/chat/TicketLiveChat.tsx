import React, { useState, useRef, useEffect } from 'react';
import { Ticket, ChatAttachment } from '../../types/index.ts';
import { useApp } from '../../context/AppContext';
import {
  Send,
  Image as ImageIcon,
  X,
  User,
  Shield,
  Wrench,
  Maximize2,
  Clock,
  CheckCheck,
  AlertCircle,
  Building2,
  Sparkles
} from 'lucide-react';

interface TicketLiveChatProps {
  ticket: Ticket;
}

export const TicketLiveChat: React.FC<TicketLiveChatProps> = ({ ticket }) => {
  const { currentUser, getMessagesForTicket, sendTicketMessage, markTicketMessagesAsRead, toast } = useApp();
  const [inputText, setInputText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messages = getMessagesForTicket(ticket.id);

  // Auto mark messages as read when viewing chat
  useEffect(() => {
    markTicketMessagesAsRead(ticket.id);
  }, [ticket.id, messages.length, markTicketMessagesAsRead]);

  // Auto scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Handle image upload from camera or local file
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      if (!validTypes.includes(file.type)) {
        const msg = 'Format foto harus JPG, JPEG, PNG, atau WebP.';
        setErrorMessage(msg);
        toast.error(msg, 'Format Tidak Didukung');
        setTimeout(() => setErrorMessage(null), 4000);
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        const msg = `Ukuran file "${file.name}" melebihi batas maksimal 5MB.`;
        setErrorMessage(msg);
        toast.error(msg, 'File Terlalu Besar');
        setTimeout(() => setErrorMessage(null), 4000);
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
        toast.info(`Foto ${file.name} siap dikirim.`, 'Lampiran Ditambahkan');
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemovePendingAttachment = (id: string) => {
    setPendingAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleSendMessage = (textToSend?: string) => {
    const text = textToSend !== undefined ? textToSend : inputText;
    if (isSubmitting) return;
    if (!text.trim() && pendingAttachments.length === 0) return;

    setIsSubmitting(true);
    const result = sendTicketMessage(ticket.id, text.trim(), pendingAttachments);
    setIsSubmitting(false);

    if (result.success) {
      setInputText('');
      setPendingAttachments([]);
      setErrorMessage(null);
    } else {
      const err = result.error || 'Gagal mengirim pesan.';
      setErrorMessage(err);
      toast.error(err, 'Gagal Mengirim');
      setTimeout(() => setErrorMessage(null), 4000);
    }
  };

  const quickReplies = [
    'Teknisi sudah tiba di lokasi pelanggan.',
    'Pengecekan redaman FAT: -18 dBm (Bagus).',
    'Kendala redaman drop: LOS Red Light.',
    'Pemasangan ONT selesai, wifi aktif & stabil.',
    'Mohon verifikasi close ticket dari Dispatch.'
  ];

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'dispatch':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
            <Shield className="w-3 h-3 text-indigo-600" /> Dispatch Officer
          </span>
        );
      case 'installer':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <Wrench className="w-3 h-3 text-emerald-600" /> Teknisi Lapangan
          </span>
        );
      case 'leader':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <Building2 className="w-3 h-3 text-amber-600" /> Korlap Mitra
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            Super Admin
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col h-[560px] bg-slate-50 dark:bg-slate-900/60 overflow-hidden">
      {/* Chat Header Bar */}
      <div className="px-5 py-3.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 dark:text-white text-sm">
                Live Channel WO: {ticket.woNumber}
              </span>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Terhubung Real-Time</span>
              </div>
            </div>
            <div className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5">
              Pelanggan: <strong className="text-slate-700 dark:text-slate-300">{ticket.customerName}</strong> ({ticket.idCustomer}) · Teknisi: <strong className="text-slate-700 dark:text-slate-300">{ticket.installerName || 'Belum Ditugaskan'}</strong>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Total Percakapan:</span>
          <span className="px-2.5 py-0.5 bg-slate-100 dark:bg-slate-800 font-mono font-bold text-slate-800 dark:text-slate-200 rounded">
            {messages.length} Pesan
          </span>
        </div>
      </div>

      {/* Messages Stream - Large, Readable Typography */}
      <div className="flex-1 p-5 overflow-y-auto space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-xs">
              <Shield className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
              Belum Ada Percakapan pada Work Order Ini
            </h4>
            <p className="text-xs max-w-md text-slate-500 dark:text-slate-400 leading-relaxed">
              Mulai komunikasi antara <strong>Dispatch Officer</strong> dan <strong>Teknisi Lapangan</strong> ({ticket.installerName || 'Installer'}) untuk koordinasi penugasan, hasil redaman optik, atau kirim foto bukti pengerjaan.
            </p>
          </div>
        ) : (
          messages.map(msg => {
            const isMe = msg.senderId === currentUser.id || msg.senderRole === currentUser.role;
            const isDispatch = msg.senderRole === 'dispatch';
            const isInstaller = msg.senderRole === 'installer';

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1.5`}
              >
                {/* Sender badge & time */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200">{msg.senderName}</span>
                  {getRoleBadge(msg.senderRole)}
                  <span className="text-[11px] text-slate-400 font-mono">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Bubble Container */}
                <div
                  className={`max-w-[90%] sm:max-w-[75%] rounded-2xl p-4 shadow-xs space-y-2.5 ${
                    isMe
                      ? 'bg-indigo-600 text-white rounded-tr-xs'
                      : isInstaller
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-slate-900 dark:text-slate-100 border border-emerald-200 dark:border-emerald-800/70 rounded-tl-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-tl-xs'
                  }`}
                >
                  {msg.text && (
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words font-normal">
                      {msg.text}
                    </p>
                  )}

                  {/* Photo Attachments with Enlarged Thumbnails */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      {msg.attachments.map(att => (
                        <div
                          key={att.id}
                          onClick={() => setZoomImage(att.url)}
                          className="group relative cursor-pointer rounded-xl overflow-hidden border border-black/15 dark:border-white/15 bg-black/5"
                        >
                          <img
                            src={att.url}
                            alt={att.fileName}
                            className="w-full h-40 object-cover transition-transform duration-200 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1.5 text-xs font-semibold">
                            <Maximize2 className="w-4 h-4" />
                            <span>Perbesar Foto</span>
                          </div>
                          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 text-[11px] text-white font-medium truncate">
                            {att.fileName}
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

      {/* Error Alert */}
      {errorMessage && (
        <div className="mx-5 mb-2 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Leader is read-only in chat */}
      {currentUser.role === 'leader' ? (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/50 border-t border-amber-200 dark:border-amber-800 text-center text-xs text-amber-800 dark:text-amber-300 font-medium flex items-center justify-center gap-2 shrink-0">
          <Shield className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Mode Pantau: Leader hanya dapat membaca riwayat live chat (tidak dapat mengirim pesan).</span>
        </div>
      ) : (
        <>
          {/* Quick Reply Pills */}
          <div className="px-5 py-2 bg-slate-100/80 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto text-xs shrink-0">
            <span className="text-[10.5px] font-bold uppercase text-slate-400 shrink-0">Template Cepat:</span>
            {quickReplies.map((reply, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(reply)}
                className="whitespace-nowrap px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-medium transition-colors"
              >
                {reply}
              </button>
            ))}
          </div>

          {/* Pending Photo Upload Previews */}
          {pendingAttachments.length > 0 && (
            <div className="px-5 py-2.5 bg-indigo-50 dark:bg-indigo-950/80 border-t border-indigo-200 dark:border-indigo-900 flex items-center gap-3 overflow-x-auto shrink-0">
              {pendingAttachments.map(att => (
                <div key={att.id} className="relative group shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 border-indigo-500 shadow-sm">
                  <img src={att.url} alt={att.fileName} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemovePendingAttachment(att.id)}
                    className="absolute top-1 right-1 p-1 bg-rose-600 text-white rounded-full hover:bg-rose-700 transition-colors shadow-sm"
                    title="Hapus foto"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <span className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">
                {pendingAttachments.length} foto bukti siap dilampirkan & dikirim
              </span>
            </div>
          )}

          {/* Message Input Form */}
          <form
            onSubmit={e => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-3 shrink-0"
          >
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
              className="p-2.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-xl transition-colors shrink-0 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 text-xs font-semibold"
              title="Lampirkan Foto Bukti Lapangan"
            >
              <ImageIcon className="w-4 h-4 text-indigo-600" />
              <span className="hidden sm:inline">Upload Foto</span>
            </button>

            <input
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={`Tulis pesan live chat sebagai ${currentUser.name} (${currentUser.role})...`}
              className="flex-1 px-4 py-2.5 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />

            <button
              type="submit"
              disabled={isSubmitting || (!inputText.trim() && pendingAttachments.length === 0)}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors shrink-0 shadow-sm"
            >
              <Send className="w-4 h-4" />
              <span>Kirim</span>
            </button>
          </form>
        </>
      )}

      {/* Fullscreen Lightbox / Zoom Modal */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-70 bg-black/90 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setZoomImage(null)}
        >
          <div className="relative max-w-5xl max-h-[92vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setZoomImage(null)}
              className="absolute top-4 right-4 p-2 bg-black/70 text-white rounded-full hover:bg-rose-600 transition-colors z-10"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={zoomImage}
              alt="Bukti Lapangan Zoom"
              className="max-w-full max-h-[88vh] object-contain rounded-2xl shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
