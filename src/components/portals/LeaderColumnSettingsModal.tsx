import React from 'react';
import { X, RotateCcw, Check, Eye, EyeOff, Sliders } from 'lucide-react';

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
  { id: 'clusterName', label: 'Cluster Name', visible: true, canHide: true },
  { id: 'streetName', label: 'Alamat / Jalan', visible: true, canHide: true },
  { id: 'appointmentDate', label: 'Appointment Date', visible: true, canHide: true },
  { id: 'slotTime', label: 'Slot Waktu', visible: true, canHide: true },
  { id: 'contractor', label: 'Kontraktor', visible: false, canHide: true },
  { id: 'installer', label: 'Teknisi / Installer', visible: true, canHide: false },
  { id: 'status', label: 'Status WO', visible: true, canHide: false },
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

  const visibleCount = columns.filter(c => c.visible).length;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden text-xs">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-lg">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Pengaturan Kolom Tabel WO
              </h3>
              <p className="text-[11px] text-slate-500">
                Pilih kolom yang ingin ditampilkan pada tabel Assign Data WO ({visibleCount} aktif)
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
        <div className="p-5 max-h-[60vh] overflow-y-auto space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 text-[11px]">
            <span className="text-slate-500 font-medium">Centang untuk menampilkan kolom:</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={showAll}
                className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
              >
                Tampilkan Semua
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={onReset}
                className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 hover:underline flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Default</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {columns.map(col => {
              const isLocked = col.canHide === false;
              return (
                <label
                  key={col.id}
                  className={`flex items-center justify-between p-2.5 rounded-xl border transition-colors cursor-pointer ${
                    col.visible
                      ? 'bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800 text-slate-900 dark:text-white font-medium'
                      : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={col.visible}
                      disabled={isLocked}
                      onChange={() => toggleColumn(col.id)}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 dark:border-slate-700 focus:ring-indigo-500"
                    />
                    <span>{col.label}</span>
                  </div>
                  {isLocked && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950 px-1.5 py-0.5 rounded">
                      Wajib
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Preferensi tampilan otomatis tersimpan di browser Anda
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors shadow-sm"
          >
            Terapkan & Simpan
          </button>
        </div>
      </div>
    </div>
  );
};
