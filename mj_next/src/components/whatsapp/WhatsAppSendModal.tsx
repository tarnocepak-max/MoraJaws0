import React, { useState, useEffect } from 'react';
import { Ticket, WhatsAppTemplate } from '../../types';
import { useApp } from '../../context/AppContext';
import { renderWhatsAppMessage, buildWhatsAppClickToChatUrl, normalizePhoneNumber, isValidPhoneNumber } from '../../services/whatsappService';
import {
  MessageSquare,
  Copy,
  ExternalLink,
  Check,
  AlertTriangle,
  X,
  Calendar,
  PhoneCall,
  Info
} from 'lucide-react';

interface WhatsAppSendModalProps {
  ticket: Ticket;
  isOpen: boolean;
  onClose: () => void;
}

export const WhatsAppSendModal: React.FC<WhatsAppSendModalProps> = ({ ticket, isOpen, onClose }) => {
  const { templates, recordWhatsAppOpened, recordWhatsAppConfirmed, recordWhatsAppReschedule, recordWhatsAppUnreachable } = useApp();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(() => {
    const defaultTpl = templates.find(t => t.isDefault) || templates[0];
    return defaultTpl ? defaultTpl.id : '';
  });

  const [messageText, setMessageText] = useState<string>('');
  const [missingVars, setMissingVars] = useState<string[]>([]);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [confirmNotes, setConfirmNotes] = useState('');
  const [showConfirmForm, setShowConfirmForm] = useState(false);
  const [showRescheduleForm, setShowRescheduleForm] = useState(false);
  const [rescheduleNotes, setRescheduleNotes] = useState('');
  const [showUnreachableConfirm, setShowUnreachableConfirm] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Update rendered message when template or ticket changes
  useEffect(() => {
    if (!ticket) return;
    const currentTpl = templates.find(t => t.id === selectedTemplateId) || templates[0];
    if (currentTpl) {
      const { renderedText, missingVariables } = renderWhatsAppMessage(currentTpl.messageBody, ticket);
      setMessageText(renderedText);
      setMissingVars(missingVariables);
    }
  }, [selectedTemplateId, ticket, templates]);

  if (!isOpen || !ticket) return null;

  const normalizedPhone = normalizePhoneNumber(ticket.customerPhone);
  const isPhoneValid = isValidPhoneNumber(ticket.customerPhone);
  const { url, error: urlError } = buildWhatsAppClickToChatUrl(ticket.customerPhone, messageText);

  const handleOpenWhatsApp = () => {
    if (!url) return;
    // Log event and update status to opened_in_whatsapp
    recordWhatsAppOpened(ticket.id, url, messageText);
    setStatusMessage('WhatsApp Click-to-Chat dibuka! Status diperbarui menjadi "Opened in WA".');
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleCopyUrl = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleVerifyConfirmation = () => {
    if (!confirmNotes.trim()) {
      setStatusMessage('Mohon cantumkan catatan verifikasi (misal: "Pelanggan membalas WA setuju jadwal").');
      return;
    }
    recordWhatsAppConfirmed(ticket.id, confirmNotes);
    setShowConfirmForm(false);
    setStatusMessage('Konfirmasi berhasil dicatat & diverifikasi.');
    setTimeout(() => {
      setStatusMessage(null);
      onClose();
    }, 1500);
  };

  const handleConfirmReschedule = () => {
    if (rescheduleNotes.trim()) {
      recordWhatsAppReschedule(ticket.id, rescheduleNotes.trim());
      setShowRescheduleForm(false);
      setRescheduleNotes('');
      onClose();
    }
  };

  const handleConfirmUnreachable = () => {
    recordWhatsAppUnreachable(ticket.id, 'Pelanggan tidak merespon chat atau nomor tidak aktif.');
    setShowUnreachableConfirm(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                WhatsApp Customer Confirmation
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                WO: <span className="font-mono font-medium">{ticket.woNumber}</span> · {ticket.customerName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {statusMessage && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 rounded border border-emerald-200 dark:border-emerald-800 flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Recipient Details & Phone Normalization */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-md border border-slate-200 dark:border-slate-700">
            <div>
              <span className="text-slate-500 text-[11px] block">Customer Contact</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{ticket.customerName}</span>
              <div className="font-mono text-slate-600 dark:text-slate-400 mt-0.5">
                {ticket.customerPhone || '(Belum ada nomor)'}
              </div>
            </div>
            <div>
              <span className="text-slate-500 text-[11px] block">Normalized ID WhatsApp (+62)</span>
              <span className={`font-mono font-medium ${isPhoneValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}`}>
                {normalizedPhone || 'Format tidak valid'}
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                {isPhoneValid ? 'Nomor valid siap dikirim via wa.me' : 'Periksa kembali nomor telepon pelanggan'}
              </span>
            </div>
          </div>

          {/* Template Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Pilih Template Pesan
            </label>
            <select
              value={selectedTemplateId}
              onChange={e => setSelectedTemplateId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
            >
              {templates.map(tpl => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name} ({tpl.category}) {tpl.isDefault ? '· [Default]' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Missing variables warning */}
          {missingVars.length > 0 && (
            <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Perhatian: Field placeholder tidak memiliki data di tiket ini</p>
                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                  Variabel kosong: <span className="font-mono">{missingVars.map(v => `{{${v}}}`).join(', ')}</span>. Sistem telah mengosongkannya agar tidak menampilkan "null" atau "undefined".
                </p>
              </div>
            </div>
          )}

          {/* Editable message editor */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Isi Pesan (Dapat diedit sebelum membuka WhatsApp)
              </label>
              <button
                onClick={handleCopyMessage}
                className="text-[11px] text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 flex items-center gap-1 font-medium"
              >
                {copiedMsg ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                {copiedMsg ? 'Tersalin' : 'Salin Pesan'}
              </button>
            </div>
            <textarea
              rows={8}
              value={messageText}
              onChange={e => setMessageText(e.target.value)}
              className="w-full p-3 font-mono text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 leading-relaxed"
            />
          </div>

          {/* Generated URL & Actions */}
          <div className="p-3 bg-slate-100 dark:bg-slate-800/80 rounded-md border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Generated Click-to-Chat URL
              </span>
              <button
                onClick={handleCopyUrl}
                disabled={!url}
                className="text-[11px] text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 flex items-center gap-1 font-medium disabled:opacity-50"
              >
                {copiedUrl ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                {copiedUrl ? 'URL Tersalin' : 'Salin URL'}
              </button>
            </div>
            <div className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded font-mono text-[11px] text-slate-600 dark:text-slate-300 truncate select-all">
              {url || urlError || 'Tidak dapat membuat URL (cek nomor telepon)'}
            </div>
          </div>

          {/* Clarification banner */}
          <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded text-blue-800 dark:text-blue-300 text-[11px] flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              Mekanisme Click-to-Chat membuka WhatsApp dengan template terisi. Pesan baru terkirim setelah pengguna menekan tombol kirim di WhatsApp. Status tidak otomatis menjadi "Confirmed" sampai ada konfirmasi nyata dari pelanggan.
            </div>
          </div>

          {/* Manual verification form toggle */}
          {showConfirmForm ? (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-md border border-emerald-200 dark:border-emerald-800 space-y-2">
              <h5 className="font-semibold text-emerald-900 dark:text-emerald-200 text-xs">
                Verifikasi Konfirmasi Pelanggan
              </h5>
              <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
                Hanya gunakan jika pelanggan telah membalas pesan dan mengonfirmasi kesediaan waktu kunjungan.
              </p>
              <input
                type="text"
                placeholder="Catatan bukti konfirmasi (misal: Chat dibalas jam 10:05 setuju slot)"
                value={confirmNotes}
                onChange={e => setConfirmNotes(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded text-slate-800 dark:text-slate-200"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleVerifyConfirmation}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium text-xs min-h-[36px]"
                >
                  Simpan Status Terkonfirmasi
                </button>
                <button
                  onClick={() => setShowConfirmForm(false)}
                  className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-xs min-h-[36px]"
                >
                  Batal
                </button>
              </div>
            </div>
          ) : showRescheduleForm ? (
            <div className="p-3 bg-purple-50 dark:bg-purple-950/40 rounded border border-purple-200 dark:border-purple-800 space-y-2">
              <span className="font-semibold text-purple-900 dark:text-purple-200 block text-xs">
                Catat Permintaan Reschedule Pelanggan:
              </span>
              <input
                type="text"
                placeholder="Alasan / Jadwal baru yang diinginkan pelanggan..."
                value={rescheduleNotes}
                onChange={e => setRescheduleNotes(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-purple-300 dark:border-purple-700 rounded bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleConfirmReschedule}
                  disabled={!rescheduleNotes.trim()}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white rounded font-medium text-xs min-h-[36px]"
                >
                  Simpan Jadwal Ulang
                </button>
                <button
                  onClick={() => setShowRescheduleForm(false)}
                  className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-xs min-h-[36px]"
                >
                  Batal
                </button>
              </div>
            </div>
          ) : showUnreachableConfirm ? (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 rounded border border-rose-200 dark:border-rose-800 space-y-2">
              <span className="font-semibold text-rose-900 dark:text-rose-200 block text-xs">
                Tandai Pelanggan Tidak Dapat Dihubungi (Unreachable)?
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleConfirmUnreachable}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded font-medium text-xs min-h-[36px]"
                >
                  Ya, Tandai Unreachable
                </button>
                <button
                  onClick={() => setShowUnreachableConfirm(false)}
                  className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-xs min-h-[36px]"
                >
                  Batal
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 gap-2">
              <span className="text-[11px] text-slate-500 font-medium">Tindakan Lanjutan Verifikasi:</span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setShowConfirmForm(true)}
                  className="px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800 rounded-lg min-h-[36px]"
                >
                  Mark as Confirmed...
                </button>
                <button
                  onClick={() => setShowRescheduleForm(true)}
                  className="px-3 py-1.5 text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 border border-purple-200 dark:border-purple-800 rounded-lg min-h-[36px]"
                >
                  Reschedule...
                </button>
                <button
                  onClick={() => setShowUnreachableConfirm(true)}
                  className="px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 border border-rose-200 dark:border-rose-800 rounded-lg min-h-[36px]"
                >
                  Unreachable
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between px-4 sm:px-6 py-3 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-100 dark:border-slate-800 gap-2.5 shrink-0">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors min-h-[40px] text-center"
          >
            Tutup
          </button>
          {url && isPhoneValid ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleOpenWhatsApp}
              className="w-full sm:w-auto px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm min-h-[40px]"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Buka WhatsApp Web / App</span>
            </a>
          ) : (
            <button
              disabled
              className="w-full sm:w-auto px-5 py-2 text-xs font-semibold text-white bg-slate-400 rounded-lg cursor-not-allowed flex items-center justify-center gap-2 min-h-[40px]"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Nomor Tidak Valid</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
