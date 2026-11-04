import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Ticket } from '../../types/index.ts';
import {
  Trash2,
  AlertTriangle,
  X,
  CheckCircle2,
  Database,
  Lock,
  Building2,
  Calendar,
  MapPin,
  UserCheck
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface ManagementDataDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: Ticket | null;
  selectedTickets?: Ticket[];
  onSuccess?: () => void;
}

export const ManagementDataDeleteModal: React.FC<ManagementDataDeleteModalProps> = ({
  isOpen,
  onClose,
  ticket,
  selectedTickets = [],
  onSuccess
}) => {
  const { currentUser, deleteTicket, bulkDeleteTickets } = useApp();
  const { toast } = useToast();

  const [reason, setReason] = useState('');
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const isManagementData = currentUser.role === 'management_data';
  const isBulk = selectedTickets.length > 0 && !ticket;
  const targetCount = isBulk ? selectedTickets.length : 1;

  const handleExecuteDelete = async () => {
    setError(null);

    if (!isManagementData) {
      setError('Akses ditolak: Wewenang Hapus WO dibatasi secara KHUSUS hanya untuk role Management Data.');
      return;
    }

    if (!reason.trim() || reason.trim().length < 5) {
      setError('Alasan penghapusan wajib diisi minimal 5 karakter (contoh: Duplikasi data terkonfirmasi).');
      return;
    }

    if (confirmPhrase.trim().toUpperCase() !== 'HAPUS') {
      setError('Ketik frase konfirmasi "HAPUS" dengan benar untuk melanjutkan.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (isBulk) {
        const ids = selectedTickets.map(t => t.id);
        const res = await bulkDeleteTickets(ids, reason.trim());
        if (res.success) {
          toast.success(`Berhasil menghapus ${res.count || ids.length} Work Order.`, 'Hapus WO Berhasil');
          onSuccess?.();
          onClose();
        } else {
          setError(res.error || 'Gagal menghapus daftar Work Order.');
        }
      } else if (ticket) {
        const res = await deleteTicket(ticket.id, reason.trim(), false);
        if (res.success) {
          toast.success(`Work Order ${ticket.woNumber} berhasil dihapus.`, 'Hapus WO Berhasil');
          onSuccess?.();
          onClose();
        } else {
          setError(res.error || 'Gagal menghapus Work Order.');
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Terjadi kesalahan sistem saat menghapus WO.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center bg-slate-950/75 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-rose-200 dark:border-rose-900/80 w-full max-w-lg overflow-hidden">
        {/* Header with Security Badge */}
        <div className="px-5 py-4 bg-rose-50 dark:bg-rose-950/60 border-b border-rose-200 dark:border-rose-900/60 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-200 dark:bg-rose-900 text-rose-900 dark:text-rose-200">
                  Otoritas Khusus Management Data
                </span>
                <span className="text-xs text-rose-700 dark:text-rose-400 font-medium">
                  Konfirmasi Penghapusan
                </span>
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base mt-0.5">
                {isBulk ? `Hapus ${targetCount} Work Order Terpilih` : `Hapus Work Order ${ticket?.woNumber || ''}`}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-4 text-xs">
          {!isManagementData ? (
            <div className="p-4 rounded-xl bg-rose-100 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 space-y-2">
              <div className="font-bold flex items-center gap-1.5">
                <Lock className="w-4 h-4" />
                <span>Akses Penghapusan Ditolak</span>
              </div>
              <p className="text-[11.5px] leading-relaxed">
                Akun Anda ({currentUser.name} — role <span className="capitalize font-semibold">{currentUser.role}</span>) tidak memiliki wewenang untuk menghapus WO. Berdasarkan Konstitusi Keamanan MoraJaws, hak hapus WO dibatasi secara KHUSUS hanya untuk role <strong>Management Data</strong>.
              </p>
            </div>
          ) : (
            <>
              {/* Target Details Card */}
              {ticket && (
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Informasi Work Order yang akan dihapus:
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10.5px]">WO Number:</span>
                      <span className="font-bold font-mono text-[#5B35B1] dark:text-[#B19CF0] text-sm">
                        {ticket.woNumber}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10.5px]">Customer ID:</span>
                      <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                        {ticket.idCustomer || ticket.customerId || '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10.5px]">Nama Pelanggan:</span>
                      <span className="font-semibold text-slate-900 dark:text-white truncate block">
                        {ticket.customerName}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10.5px]">Kontak:</span>
                      <span className="font-mono text-slate-700 dark:text-slate-300">
                        {ticket.customerPhone || '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10.5px]">Area / Kontraktor:</span>
                      <span className="text-slate-700 dark:text-slate-300">
                        {ticket.area} · {ticket.contactorName || ticket.contractorName || '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10.5px]">Appointment Date:</span>
                      <span className="font-mono text-slate-800 dark:text-slate-200 font-semibold">
                        {ticket.appointmentDate || ticket.date || '-'} ({ticket.slotTime || '-'})
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {isBulk && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/60 rounded-xl border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200">
                  <div className="font-bold flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Konfirmasi Penghapusan Massal</span>
                  </div>
                  <p className="text-[11.5px]">
                    Anda akan menghapus <strong>{selectedTickets.length} Work Order</strong> secara bersamaan. Data akan ditandai soft delete dan dicatat dalam audit log.
                  </p>
                </div>
              )}

              {/* Protocol Note */}
              <div className="p-3 bg-slate-100 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 flex items-start gap-2.5 text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Sistem menerapkan <strong>Soft Delete</strong> aman: WO akan disembunyikan dari operasional lapangan dan monitoring, data histori dipertahankan, serta dicatat dalam Audit Log resmi.
                </span>
              </div>

              {/* Mandatory Reason Input */}
              <div className="space-y-1">
                <label className="font-bold text-slate-800 dark:text-slate-200 block">
                  Alasan Penghapusan <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Contoh: Duplikasi data terkonfirmasi dari file WO sebelumnya..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              {/* Confirmation Phrase Input */}
              <div className="space-y-1">
                <label className="font-bold text-slate-800 dark:text-slate-200 block">
                  Ketik <span className="font-mono text-rose-600 font-bold">HAPUS</span> untuk mengonfirmasi: <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={confirmPhrase}
                  onChange={e => setConfirmPhrase(e.target.value)}
                  placeholder="Ketik HAPUS..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono font-bold text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              {error && (
                <div className="p-2.5 bg-rose-50 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Actions */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 rounded-xl font-semibold text-xs text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
          >
            Batal
          </button>
          {isManagementData && (
            <button
              type="button"
              onClick={handleExecuteDelete}
              disabled={isSubmitting || !reason.trim() || confirmPhrase.trim().toUpperCase() !== 'HAPUS'}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Memproses...' : 'Konfirmasi Hapus WO'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
