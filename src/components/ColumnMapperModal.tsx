import React, { useState } from 'react';
import { X, Check, Sliders, ArrowRight, Info, AlertCircle } from 'lucide-react';
import { CANONICAL_FIELD_DEFINITIONS } from '../utils/woImportEngine';

interface ColumnMapperModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawHeaders: string[];
  currentMappings: Record<string, string>;
  sampleRow?: Record<string, string>;
  onSaveMappings: (newMappings: Record<string, string>) => void;
}

export const ColumnMapperModal: React.FC<ColumnMapperModalProps> = ({
  isOpen,
  onClose,
  rawHeaders,
  currentMappings,
  sampleRow = {},
  onSaveMappings
}) => {
  const [mappings, setMappings] = useState<Record<string, string>>({ ...currentMappings });

  if (!isOpen) return null;

  const handleSelectField = (rawHeader: string, canonicalKey: string) => {
    setMappings(prev => {
      const next = { ...prev };
      if (!canonicalKey || canonicalKey === '__IGNORE__') {
        delete next[rawHeader];
      } else {
        // Prevent duplicate mapping: remove canonicalKey from other headers
        Object.keys(next).forEach(k => {
          if (next[k] === canonicalKey && k !== rawHeader) {
            delete next[k];
          }
        });
        next[rawHeader] = canonicalKey;
      }
      return next;
    });
  };

  const handleSave = () => {
    onSaveMappings(mappings);
    onClose();
  };

  const handleResetToAuto = () => {
    // Clear custom overrides to re-trigger auto mapping
    setMappings({});
  };

  const mappedCount = Object.keys(mappings).length;
  const unmappedCount = Math.max(0, rawHeaders.length - mappedCount);

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 select-none"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-[#160D29] border border-[#D8CCF3] dark:border-[#35105E] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[calc(100dvh-1rem)] sm:max-h-[90dvh] flex flex-col min-h-0 min-w-0 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Sticky Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-purple-50 via-white to-purple-50 dark:from-[#210D44] dark:via-[#1A0E2E] dark:to-[#210D44] border-b border-[#D8CCF3] dark:border-[#35105E] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5B35B1] text-white flex items-center justify-center font-bold shadow-xs shrink-0">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[#21183A] dark:text-[#F5F1FF]">
                Konfigurasi Pemetaan Kolom (Column Mapper)
              </h2>
              <p className="text-xs text-[#756B8D] dark:text-[#D8CCF3] flex items-center gap-2">
                <span>Total {rawHeaders.length} kolom terdeteksi</span>
                <span>•</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{mappedCount} Dipetakan</span>
                <span>•</span>
                <span className="text-amber-600 dark:text-amber-400">{unmappedCount} Diabaikan / Opsional</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Tutup Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informational Guidance Banner */}
        <div className="px-5 py-2.5 bg-indigo-50/70 dark:bg-indigo-950/40 border-b border-indigo-100 dark:border-indigo-900/60 flex items-center gap-2 text-xs text-indigo-900 dark:text-indigo-200 shrink-0">
          <Info className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>
            Satu kolom hanya dapat dipetakan ke 1 field kanonis. Kolom yang diabaikan tetap disimpan aman dalam <em>additionalFields</em> tanpa membuat data palsu.
          </span>
        </div>

        {/* Scrollable Table Area */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 divide-y divide-slate-100 dark:divide-slate-800">
          <div className="grid grid-cols-12 gap-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-2">
            <div className="col-span-4 sm:col-span-4">Kolom Header File</div>
            <div className="col-span-4 sm:col-span-4">Contoh Nilai (Baris 1)</div>
            <div className="col-span-4 sm:col-span-4">Target Field MoraJaws</div>
          </div>

          <div className="space-y-2 pt-2">
            {rawHeaders.map((rawH, idx) => {
              const currentCanonical = mappings[rawH] || '';
              const matchedDef = CANONICAL_FIELD_DEFINITIONS.find(d => d.canonicalKey === currentCanonical);
              const sampleVal = sampleRow[rawH] || '-';

              return (
                <div
                  key={`${rawH}-${idx}`}
                  className="grid grid-cols-12 gap-3 items-center p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700/60 text-xs"
                >
                  {/* Raw Header Name */}
                  <div className="col-span-4 sm:col-span-4 min-w-0">
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200 truncate block" title={rawH}>
                      {rawH}
                    </span>
                    {matchedDef?.requiredForWO && (
                      <span className="text-[10px] text-rose-500 font-semibold">Wajib untuk WO</span>
                    )}
                  </div>

                  {/* Sample Value */}
                  <div className="col-span-4 sm:col-span-4 min-w-0">
                    <span className="font-mono text-slate-500 dark:text-slate-400 truncate block bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded-md text-[11px]" title={sampleVal}>
                      {sampleVal}
                    </span>
                  </div>

                  {/* Field Selector */}
                  <div className="col-span-4 sm:col-span-4">
                    <select
                      value={currentCanonical || '__IGNORE__'}
                      onChange={e => handleSelectField(rawH, e.target.value)}
                      className={`w-full py-1.5 px-2.5 rounded-lg border text-xs font-medium transition-colors focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer ${
                        currentCanonical
                          ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      <option value="__IGNORE__">-- Abaikan Kolom Ini --</option>
                      <optgroup label="Kolom Inti Work Order">
                        {CANONICAL_FIELD_DEFINITIONS.filter(d => d.category === 'core').map(d => (
                          <option key={d.canonicalKey} value={d.canonicalKey}>
                            {d.label} {d.requiredForWO ? '(*Wajib)' : ''}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Pelanggan & Kontak">
                        {CANONICAL_FIELD_DEFINITIONS.filter(d => d.category === 'customer').map(d => (
                          <option key={d.canonicalKey} value={d.canonicalKey}>
                            {d.label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Lokasi & Geografis">
                        {CANONICAL_FIELD_DEFINITIONS.filter(d => d.category === 'location').map(d => (
                          <option key={d.canonicalKey} value={d.canonicalKey}>
                            {d.label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Mitra & Penugasan">
                        {CANONICAL_FIELD_DEFINITIONS.filter(d => d.category === 'mitra').map(d => (
                          <option key={d.canonicalKey} value={d.canonicalKey}>
                            {d.label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Teknis & Jaringan">
                        {CANONICAL_FIELD_DEFINITIONS.filter(d => d.category === 'technical').map(d => (
                          <option key={d.canonicalKey} value={d.canonicalKey}>
                            {d.label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Metadata & Agent">
                        {CANONICAL_FIELD_DEFINITIONS.filter(d => d.category === 'metadata').map(d => (
                          <option key={d.canonicalKey} value={d.canonicalKey}>
                            {d.label}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Sticky Footer */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-900 border-t border-[#D8CCF3] dark:border-[#35105E] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={handleResetToAuto}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
          >
            Reset ke Pemetaan Otomatis
          </button>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 bg-[#5B35B1] hover:bg-[#3B1D78] text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Terapkan Pemetaan</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
