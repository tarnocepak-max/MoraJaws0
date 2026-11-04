import React, { useState } from 'react';
import {
  X,
  RotateCcw,
  Check,
  Eye,
  EyeOff,
  Sliders,
  ArrowUp,
  ArrowDown,
  GripVertical
} from 'lucide-react';

export interface ColumnConfig {
  id: string;
  label: string;
  visible: boolean;
  canHide?: boolean; // Some core columns like WO Number and Action should not be hidden
}

export const DEFAULT_LEADER_COLUMNS: ColumnConfig[] = [
  { id: 'checkbox', label: 'Pilih (Checkbox)', visible: true, canHide: false },
  { id: 'woNumber', label: 'WO Number', visible: true, canHide: false },
  { id: 'date', label: 'Tanggal WO', visible: true, canHide: true },
  { id: 'idCustomer', label: 'Customer ID', visible: true, canHide: true },
  { id: 'customerName', label: 'Nama Pelanggan', visible: true, canHide: true },
  { id: 'customerPhone', label: 'Kontak Pelanggan', visible: true, canHide: true },
  { id: 'area', label: 'Area', visible: true, canHide: true },
  { id: 'clusterName', label: 'Cluster Name', visible: true, canHide: true },
  { id: 'streetName', label: 'Alamat / Jalan', visible: true, canHide: true },
  { id: 'appointmentDate', label: 'Appointment Date', visible: true, canHide: true },
  { id: 'slotTime', label: 'Slot Waktu', visible: true, canHide: true },
  { id: 'contractor', label: 'Kontraktor', visible: true, canHide: true },
  { id: 'installer', label: 'Teknisi / Installer', visible: true, canHide: false },
  { id: 'status', label: 'Status WO', visible: true, canHide: false },
  { id: 'workStatus', label: 'Status Pekerjaan', visible: true, canHide: true },
  { id: 'checkInAt', label: 'Waktu Check-in', visible: true, canHide: true },
  { id: 'checkOutAt', label: 'Waktu Check-out', visible: true, canHide: true },
  { id: 'workDuration', label: 'Durasi Kerja', visible: true, canHide: true },
  { id: 'progress', label: 'Progres Pekerjaan', visible: true, canHide: true },
  { id: 'lastUpdate', label: 'Update Terakhir', visible: true, canHide: true },
  { id: 'action', label: 'Action / Aksi', visible: true, canHide: false }
];

interface LeaderColumnSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  columns: ColumnConfig[];
  onChangeColumns: (columns: ColumnConfig[]) => void;
  onReset: () => void;
}

export const LeaderColumnSettingsModal: React.FC<LeaderColumnSettingsModalProps> = ({
  isOpen,
  onClose,
  columns,
  onChangeColumns,
  onReset
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  if (!isOpen) return null;

  const toggleColumn = (id: string) => {
    const next = columns.map(col => {
      if (col.id === id && col.canHide !== false) {
        return { ...col, visible: !col.visible };
      }
      return col;
    });
    onChangeColumns(next);
  };

  const showAll = () => {
    onChangeColumns(columns.map(c => ({ ...c, visible: true })));
  };

  const moveColumn = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= columns.length) return;

    const next = [...columns];
    const item = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = item;
    onChangeColumns(next);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const next = [...columns];
    const draggedItem = next[draggedIndex];
    next.splice(draggedIndex, 1);
    next.splice(index, 0, draggedItem);
    setDraggedIndex(index);
    onChangeColumns(next);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const visibleCount = columns.filter(c => c.visible).length;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden text-xs">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#5B35B1]/10 text-[#5B35B1] dark:text-purple-400 rounded-xl">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <span>Pengaturan & Urutan Kolom Tabel WO</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#E9E1FF] text-[#3B1D78] dark:bg-purple-950 dark:text-purple-300">
                  {visibleCount} dari {columns.length} Aktif
                </span>
              </h3>
              <p className="text-[11px] text-slate-500">
                Centang untuk menampilkan/menyembunyikan, dan geser atau gunakan tombol ↑ ↓ untuk mengatur posisi urutan kolom.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 max-h-[62vh] overflow-y-auto space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 text-[11px]">
            <span className="text-slate-500 font-medium">
              Daftar Kolom (Urut dari Kiri ke Kanan):
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={showAll}
                className="text-[#5B35B1] dark:text-purple-400 hover:underline font-semibold cursor-pointer"
              >
                Tampilkan Semua
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={onReset}
                className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Default</span>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            {columns.map((col, index) => {
              const isLocked = col.canHide === false;
              const isFirst = index === 0;
              const isLast = index === columns.length - 1;

              return (
                <div
                  key={col.id}
                  draggable
                  onDragStart={e => handleDragStart(e, index)}
                  onDragOver={e => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                    draggedIndex === index
                      ? 'opacity-40 border-dashed border-[#5B35B1]'
                      : col.visible
                      ? 'bg-slate-50/90 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium'
                      : 'bg-slate-100/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="cursor-grab text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1"
                      title="Tarik untuk memindahkan urutan kolom"
                    >
                      <GripVertical className="w-3.5 h-3.5" />
                    </span>

                    <span className="w-5 text-center font-mono text-[10px] text-slate-400 font-bold">
                      {index + 1}
                    </span>

                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={col.visible}
                        disabled={isLocked}
                        onChange={() => toggleColumn(col.id)}
                        className="w-4 h-4 text-[#5B35B1] rounded border-slate-300 dark:border-slate-700 focus:ring-[#5B35B1] cursor-pointer"
                      />
                      <span className={`text-xs ${col.visible ? 'font-semibold' : 'line-through text-slate-400'}`}>
                        {col.label}
                      </span>
                    </label>

                    {isLocked && (
                      <span className="text-[10px] text-amber-700 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-1.5 py-0.2 rounded">
                        Wajib
                      </span>
                    )}
                  </div>

                  {/* Move Up / Down Buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => moveColumn(index, 'up')}
                      disabled={isFirst}
                      className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                      title="Pindahkan kolom ke atas / kiri"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveColumn(index, 'down')}
                      disabled={isLast}
                      className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                      title="Pindahkan kolom ke bawah / kanan"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Urutan dan preferensi kolom tersimpan otomatis di profil Leader Anda
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[#5B35B1] hover:bg-[#3B1D78] text-white font-bold rounded-xl transition-colors shadow-sm cursor-pointer"
          >
            Terapkan & Simpan
          </button>
        </div>
      </div>
    </div>
  );
};
