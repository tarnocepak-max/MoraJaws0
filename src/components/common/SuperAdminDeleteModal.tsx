import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  ShieldAlert,
  AlertTriangle,
  Trash2,
  Archive,
  X,
  CheckCircle2,
  Lock
} from 'lucide-react';

export type DeleteTargetType = 'ticket' | 'customer' | 'user';

interface SuperAdminDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: DeleteTargetType;
  targetId: string;
  targetLabel: string;
  targetDetails?: { label: string; value: string }[];
  onSuccess?: () => void;
}

export const SuperAdminDeleteModal: React.FC<SuperAdminDeleteModalProps> = ({
  isOpen,
  onClose,
  targetType,
  targetId,
  targetLabel,
  targetDetails = [],
  onSuccess
}) => {
  const { currentUser, deleteTicket, deleteCustomerData, deleteUser } = useApp();

  const [deleteMode, setDeleteMode] = useState<'soft' | 'permanent'>('soft');
  const [reason, setReason] = useState('');
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const isSuperAdmin = currentUser.role === 'super_admin';
  const REQUIRED_PHRASE = deleteMode === 'permanent' ? 'HAPUS PERMANEN' : 'HAPUS';

  const handleExecuteDelete = () => {
    setError(null);

    if (!isSuperAdmin) {
      setError('Akses ditolak: Hanya peran Super Admin yang memiliki wewenang menghapus data atau akun.');
      return;
    }

    if (!reason.trim() || reason.trim().length < 5) {
      setError('Alasan penghapusan wajib diisi minimal 5 karakter (contoh: Duplikasi data terkonfirmasi).');
      return;
    }

    if (confirmPhrase.trim().toUpperCase() !== REQUIRED_PHRASE) {
      setError(`Ketik frase konfirmasi "${REQUIRED_PHRASE}" dengan benar untuk melanjutkan.`);
      return;
    }

    setIsSubmitting(true);
    const permanent = deleteMode === 'permanent';

    let res: { success: boolean; error?: string } = { success: false };

    if (targetType === 'ticket') {
      res = deleteTicket(targetId, reason.trim(), permanent);
    } else if (targetType === 'customer') {
      res = deleteCustomerData(targetId, reason.trim());
    } else if (targetType === 'user') {
      res = deleteUser(targetId, reason.trim(), permanent);
    }

    setIsSubmitting(false);

    if (res.success) {
      onSuccess?.();
      onClose();
    } else {
      setError(res.error || 'Gagal menghapus data.');
    }
  };

  const getTargetTitle = () => {
    switch (targetType) {
      case 'ticket':
        return 'Work Order';
      case 'customer':
        return 'Data Pelanggan';
      case 'user':
        return 'Akun Pengguna';
    }
  };

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center bg-slate-950/70 p-3 sm:p-4 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-rose-200 dark:border-rose-900/80 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header with Security Badge */}
        <div className="px-5 py-4 bg-rose-50 dark:bg-rose-950/60 border-b border-rose-200 dark:border-rose-900/60 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-200 dark:bg-rose-900 text-rose-900 dark:text-rose-200">
                  Super Admin Guard
                </span>
                <span className="text-xs text-rose-700 dark:text-rose-400 font-medium">
                  Protokol Keamanan Ketat
                </span>
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base mt-0.5">
                Konfirmasi Penghapusan {getTargetTitle()}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-4 text-xs">
          {!isSuperAdmin ? (
            <div className="p-4 rounded-xl bg-rose-100 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 space-y-2">
              <div className="font-bold flex items-center gap-1.5">
                <Lock className="w-4 h-4" />
                <span>Akses Penghapusan Ditolak</span>
              </div>
              <p className="text-[11.5px] leading-relaxed">
                Akun Anda ({currentUser.name} — role <span className="capitalize font-semibold">{currentUser.role}</span>) tidak memiliki wewenang untuk menghapus data atau akun. Berdasarkan Konstitusi Keamanan MoraJaws, hak hapus data dibatasi secara mutlak hanya untuk <strong>Super Admin</strong>.
              </p>
            </div>
          ) : (
            <>
              {/* Target Details Card */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Target yang akan dihapus:
                </div>
                <div className="font-bold font-mono text-sm text-slate-900 dark:text-white">
                  {targetLabel}
                </div>
                {targetDetails.length > 0 && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700/80 grid grid-cols-2 gap-2 text-[11px]">
                    {targetDetails.map((d, i) => (
                      <div key={i}>
                        <span className="text-slate-400">{d.label}:</span>{' '}
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{d.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Mode Selection: Soft Delete vs Permanent */}
              <div>
                <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  Metode Penghapusan:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteMode('soft')}
                    className={`p-2.5 rounded-xl border text-left flex items-start gap-2 transition-all ${
                      deleteMode === 'soft'
                        ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-200 ring-2 ring-indigo-500/30'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Archive className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-bold">Soft Delete (Direkomendasikan)</div>
                      <div className="text-[10.5px] text-slate-500 dark:text-slate-400">
                        Data diarsipkan & disembunyikan. Riwayat dan jejak audit tetap utuh untuk audit berkala.
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeleteMode('permanent')}
                    className={`p-2.5 rounded-xl border text-left flex items-start gap-2 transition-all ${
                      deleteMode === 'permanent'
                        ? 'border-rose-600 bg-rose-50/80 dark:bg-rose-950/50 text-rose-900 dark:text-rose-200 ring-2 ring-rose-500/30'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Trash2 className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-bold">Permanent Delete</div>
                      <div className="text-[10.5px] text-slate-500 dark:text-slate-400">
                        Data dihapus dari database. Wajib menyertakan alasan formal & jejak audit tetap dicatat.
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Mandatory Reason */}
              <div>
                <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  Alasan Penghapusan (Wajib diisi untuk Audit Log) <span className="text-rose-500">*</span>:
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Jelaskan alasan penghapusan (misal: Duplikasi WO terkonfirmasi saat import, pembatalan pelanggan resmi)..."
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500 text-xs"
                />
              </div>

              {/* Explicit Confirmation Input */}
              <div>
                <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  Ketik <strong className="font-mono text-rose-600 dark:text-rose-400">{REQUIRED_PHRASE}</strong> untuk konfirmasi:
                </label>
                <input
                  type="text"
                  placeholder={`Ketik "${REQUIRED_PHRASE}" di sini...`}
                  value={confirmPhrase}
                  onChange={e => setConfirmPhrase(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono uppercase text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              {error && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 font-medium text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-400 font-medium">
            Operator: <span className="font-semibold text-slate-700 dark:text-slate-300">{currentUser.name}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-colors"
            >
              Batal
            </button>

            {isSuperAdmin && (
              <button
                type="button"
                onClick={handleExecuteDelete}
                disabled={isSubmitting || confirmPhrase.trim().toUpperCase() !== REQUIRED_PHRASE || !reason.trim()}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Memproses...' : deleteMode === 'permanent' ? 'Hapus Permanen' : 'Eksekusi Soft Delete'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
