import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  FileSpreadsheet,
  Layers,
  ArrowRight,
  ShieldCheck,
  Phone,
  Hash,
  Database,
  Info,
  ChevronDown,
  Sparkles
} from 'lucide-react';
import { ImportValidationReport, ImportParsedRow } from '../utils/woImportEngine';
import { SheetAnalysis } from '../utils/excelClient';

interface ImportReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: ImportValidationReport;
  onConfirmImport: (mode: 'merge' | 'replace') => void;
  isImporting?: boolean;
  onSelectSheet?: (sheetName: string) => void;
  onOpenColumnMapper?: () => void;
}

export const ImportReportModal: React.FC<ImportReportModalProps> = ({
  isOpen,
  onClose,
  report,
  onConfirmImport,
  isImporting = false,
  onSelectSheet,
  onOpenColumnMapper
}) => {
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [filterTab, setFilterTab] = useState<'all' | 'valid' | 'partial' | 'duplicate' | 'invalid'>('all');
  const [showReplaceWarning, setShowReplaceWarning] = useState(false);

  if (!isOpen || !report) return null;

  const filteredRows = report.parsedRows.filter(r => {
    if (filterTab === 'valid') return r.status === 'VALID';
    if (filterTab === 'partial') return r.status === 'PARSIAL';
    if (filterTab === 'duplicate') return r.status === 'DUPLIKAT';
    if (filterTab === 'invalid') return r.status === 'INVALID';
    return true;
  });

  const handleExecute = () => {
    if (!report.canCreateWOTickets) {
      alert('Tidak ada tiket WO valid untuk diimpor.');
      return;
    }
    if (importMode === 'replace' && !showReplaceWarning) {
      setShowReplaceWarning(true);
      return;
    }
    onConfirmImport(importMode);
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 select-none"
      onClick={e => {
        if (e.target === e.currentTarget && !isImporting) onClose();
      }}
    >
      <div className="bg-white dark:bg-[#160D29] border border-[#D8CCF3] dark:border-[#35105E] rounded-2xl shadow-2xl w-full max-w-5xl max-h-[calc(100dvh-1rem)] sm:max-h-[92dvh] flex flex-col min-h-0 min-w-0 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Sticky Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-purple-50 via-white to-purple-50 dark:from-[#210D44] dark:via-[#1A0E2E] dark:to-[#210D44] border-b border-[#D8CCF3] dark:border-[#35105E] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#5B35B1] text-white flex items-center justify-center font-bold shadow-xs shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold text-[#21183A] dark:text-[#F5F1FF] truncate">
                  Laporan Hasil Audit Import Work Order
                </h2>
                {report.isAgentIdOnly ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                    Data Parsial / Metadata
                  </span>
                ) : report.canCreateWOTickets ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Siap Import ({report.validWOCount} WO)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                    Tidak Ada WO Valid
                  </span>
                )}
              </div>
              <p className="text-xs text-[#756B8D] dark:text-[#D8CCF3] truncate">
                Sheet: <strong className="font-mono text-indigo-600 dark:text-indigo-400">{report.selectedSheet}</strong> • {report.totalRead} baris terbaca • {report.usedColumnsCount} kolom digunakan
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onOpenColumnMapper && (
              <button
                type="button"
                onClick={onOpenColumnMapper}
                className="hidden sm:flex px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 border border-indigo-200 dark:border-indigo-800 rounded-lg transition-colors cursor-pointer"
              >
                Atur Kolom
              </button>
            )}
            <button
              onClick={onClose}
              disabled={isImporting}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Multi-Sheet Selection Bar (If workbook has more than 1 sheet) */}
        {report.allSheets && report.allSheets.length > 1 && onSelectSheet && (
          <div className="px-5 py-2.5 bg-purple-50/70 dark:bg-[#1E1138] border-b border-[#D8CCF3] dark:border-[#35105E] flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-600 shrink-0" />
              <span className="font-semibold text-purple-900 dark:text-purple-200">
                Pilih Sheet Workbook ({report.allSheets.length} sheet):
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {report.allSheets.map(s => {
                const isSelected = s.sheetName === report.selectedSheet;
                return (
                  <button
                    key={s.sheetName}
                    type="button"
                    onClick={() => onSelectSheet(s.sheetName)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-[#5B35B1] text-white shadow-xs font-bold'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                    title={s.recommendationReason}
                  >
                    <span>{s.sheetName}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-purple-900 text-purple-100' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                      {s.rowCount} baris
                    </span>
                    {s.hasWoNumber && (
                      <span className="text-[10px] text-emerald-300 font-bold">★ WO</span>
                    )}
                    {s.isAgentIdOnly && (
                      <span className="text-[10px] text-amber-300 font-bold">(Agent ID)</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Scrollable Content Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4">
          
          {/* SPECIAL AGENT ID ONLY CALLOUT */}
          {report.isAgentIdOnly ? (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-800/80 space-y-3 animate-in fade-in">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shrink-0 shadow-sm">
                  <Info className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-amber-900 dark:text-amber-200 text-sm">
                    File Berisi Metadata Parsial (Hanya Kolom Agent ID)
                  </h3>
                  <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                    Sistem mendeteksi <strong>{report.totalRead} baris</strong> berisi nilai <strong>Agent ID</strong> ({report.agentIdSummary.uniqueCount} kode unik), namun <strong>tidak memiliki kolom WO Number dan Alamat Pelanggan</strong>. Sesuai aturan keselamatan sistem MoraJaws, <strong>0 tiket WO dibuat</strong> dan data WO lama tidak akan diubah atau dihapus.
                  </p>
                </div>
              </div>

              {/* Unique Agent IDs List Chips */}
              <div className="pt-2 border-t border-amber-200 dark:border-amber-900/60">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 block mb-2">
                  Daftar Kode Agent Terbaca ({report.agentIdSummary.uniqueCount} unik):
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 bg-white/70 dark:bg-slate-900/60 rounded-xl border border-amber-200 dark:border-amber-900">
                  {report.agentIdSummary.agentIds.slice(0, 30).map((agId, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 font-mono text-[11px] font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-100 rounded-md border border-amber-300 dark:border-amber-800"
                    >
                      {agId}
                    </span>
                  ))}
                  {report.agentIdSummary.agentIds.length > 30 && (
                    <span className="text-[11px] text-amber-700 dark:text-amber-400 px-2 py-0.5 font-semibold">
                      +{report.agentIdSummary.agentIds.length - 30} Agent ID lainnya
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Summary Message for standard files */
            <div className="p-3.5 rounded-xl bg-purple-50 dark:bg-[#1E1138] border border-purple-200 dark:border-purple-900 text-purple-900 dark:text-purple-200 text-xs flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
              <span>{report.summaryMessage}</span>
            </div>
          )}

          {/* 9 Metrics Dashboard Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3 text-xs">
            {/* 1. Baris Terbaca */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Total Baris</span>
              <span className="font-mono font-bold text-base text-slate-800 dark:text-slate-200">{report.totalRead}</span>
            </div>

            {/* 2. WO Valid */}
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
              <span className="text-emerald-700 dark:text-emerald-400 text-[11px] block font-semibold">WO Valid</span>
              <span className="font-mono font-bold text-base text-emerald-800 dark:text-emerald-300">{report.validWOCount}</span>
            </div>

            {/* 3. Data Parsial */}
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
              <span className="text-amber-700 dark:text-amber-400 text-[11px] block font-semibold">Data Parsial</span>
              <span className="font-mono font-bold text-base text-amber-800 dark:text-amber-300">{report.partialDataCount}</span>
            </div>

            {/* 4. Duplikat */}
            <div className="p-3 rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800">
              <span className="text-orange-700 dark:text-orange-400 text-[11px] block font-semibold">WO Duplikat</span>
              <span className="font-mono font-bold text-base text-orange-800 dark:text-orange-300">{report.duplicateCount}</span>
            </div>

            {/* 5. Baris Tidak Valid */}
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800">
              <span className="text-rose-700 dark:text-rose-400 text-[11px] block font-semibold">Baris Invalid</span>
              <span className="font-mono font-bold text-base text-rose-800 dark:text-rose-300">{report.invalidCount}</span>
            </div>

            {/* 6. Siap WhatsApp */}
            <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800">
              <span className="text-teal-700 dark:text-teal-400 text-[11px] block font-semibold">Siap WhatsApp</span>
              <span className="font-mono font-bold text-base text-teal-800 dark:text-teal-300">{report.readyForWhatsAppCount}</span>
            </div>

            {/* 7. Kolom Digunakan */}
            <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800">
              <span className="text-indigo-700 dark:text-indigo-400 text-[11px] block font-semibold">Kolom Digunakan</span>
              <span className="font-mono font-bold text-base text-indigo-800 dark:text-indigo-300">{report.usedColumnsCount} / {report.recognizedHeadersCount + report.ignoredColumnsCount}</span>
            </div>

            {/* 8. Kolom Diabaikan */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Kolom Diabaikan</span>
              <span className="font-mono font-bold text-base text-slate-800 dark:text-slate-200">{report.ignoredColumnsCount}</span>
            </div>

            {/* 9. Agent ID Ringkasan */}
            <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 col-span-2 sm:col-span-1">
              <span className="text-purple-700 dark:text-purple-400 text-[11px] block font-semibold">Agent ID Unik</span>
              <span className="font-mono font-bold text-base text-purple-800 dark:text-purple-300">{report.agentIdSummary.uniqueCount} ID</span>
            </div>
          </div>

          {/* Import Mode Selection (Only if WO tickets are available) */}
          {report.canCreateWOTickets && (
            <div className="p-4 rounded-xl border border-[#D8CCF3] dark:border-[#35105E] bg-slate-50/60 dark:bg-slate-900/60 space-y-2">
              <span className="font-bold text-slate-800 dark:text-slate-200 text-xs block">
                Pilih Mode Penggabungan Data:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                  importMode === 'merge'
                    ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}>
                  <input
                    type="radio"
                    name="importMode"
                    value="merge"
                    checked={importMode === 'merge'}
                    onChange={() => {
                      setImportMode('merge');
                      setShowReplaceWarning(false);
                    }}
                    className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <strong className="block text-slate-900 dark:text-slate-100 font-bold">Mode Gabung (Merge) - Rekomendasi</strong>
                    <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                      Menambahkan tiket WO baru tanpa menghapus tiket lama yang sudah ada di database.
                    </span>
                  </div>
                </label>

                <label className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                  importMode === 'replace'
                    ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/30'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}>
                  <input
                    type="radio"
                    name="importMode"
                    value="replace"
                    checked={importMode === 'replace'}
                    onChange={() => setImportMode('replace')}
                    className="mt-0.5 text-rose-600 focus:ring-rose-500"
                  />
                  <div>
                    <strong className="block text-rose-900 dark:text-rose-200 font-bold">Mode Ganti (Replace)</strong>
                    <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                      Mengganti dataset dengan data baru. Membutuhkan konfirmasi eksplisit tambahan.
                    </span>
                  </div>
                </label>
              </div>

              {showReplaceWarning && (
                <div className="p-3 bg-rose-100 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-800 rounded-xl text-rose-900 dark:text-rose-200 text-xs flex items-start gap-2 animate-in fade-in">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>Konfirmasi Proteksi:</strong> Anda memilih mode Ganti (Replace). Tiket yang sudah ada akan digantikan. Klik tombol "Konfirmasi Import" sekali lagi untuk melanjutkan.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Table Preview Filter Tabs */}
          <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 flex-wrap text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-300 mr-1">Preview Baris:</span>
              <button
                type="button"
                onClick={() => setFilterTab('all')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                  filterTab === 'all'
                    ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                Semua ({report.parsedRows.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('valid')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                  filterTab === 'valid'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                Valid ({report.validWOCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('partial')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                  filterTab === 'partial'
                    ? 'bg-amber-600 text-white'
                    : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
                }`}
              >
                Parsial ({report.partialDataCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('duplicate')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                  filterTab === 'duplicate'
                    ? 'bg-orange-600 text-white'
                    : 'bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300'
                }`}
              >
                Duplikat ({report.duplicateCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('invalid')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                  filterTab === 'invalid'
                    ? 'bg-rose-600 text-white'
                    : 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                }`}
              >
                Invalid ({report.invalidCount})
              </button>
            </div>
          </div>

          {/* Table Preview */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto max-h-60">
            <table className="w-full text-left text-xs divide-y divide-slate-200 dark:divide-slate-800 min-w-[650px]">
              <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 font-semibold sticky top-0 z-10">
                <tr>
                  <th className="py-2 px-3 w-12 text-center">#</th>
                  <th className="py-2 px-3 w-28">Status</th>
                  <th className="py-2 px-3">WO Number</th>
                  <th className="py-2 px-3">Pelanggan</th>
                  <th className="py-2 px-3">No HP</th>
                  <th className="py-2 px-3">Alamat / Koordinat</th>
                  <th className="py-2 px-3">Agent ID</th>
                  <th className="py-2 px-3">Catatan / Alasan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                {filteredRows.slice(0, 50).map(row => {
                  const t = row.ticket || {};
                  return (
                    <tr key={row.rowIndex} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-3 text-center text-slate-400">{row.rowIndex}</td>
                      <td className="py-2 px-3">
                        {row.status === 'VALID' && (
                          <span className="px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            VALID
                          </span>
                        )}
                        {row.status === 'PARSIAL' && (
                          <span className="px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                            PARSIAL
                          </span>
                        )}
                        {row.status === 'DUPLIKAT' && (
                          <span className="px-2 py-0.5 rounded-full font-bold bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300">
                            DUPLIKAT
                          </span>
                        )}
                        {row.status === 'INVALID' && (
                          <span className="px-2 py-0.5 rounded-full font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                            INVALID
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100">{t.woNumber || '-'}</td>
                      <td className="py-2 px-3 text-slate-700 dark:text-slate-300 font-sans">{t.customerName || '-'}</td>
                      <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{t.customerPhone || '-'}</td>
                      <td className="py-2 px-3 text-slate-600 dark:text-slate-400 font-sans">
                        {t.streetName || (t.latitude ? `${t.latitude}, ${t.longitude}` : '-')}
                      </td>
                      <td className="py-2 px-3 font-bold text-purple-700 dark:text-purple-300">{row.agentId || t.agentId || '-'}</td>
                      <td className="py-2 px-3 text-slate-500 font-sans">
                        {row.reasons.join('; ') || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredRows.length > 50 && (
            <p className="text-[11px] text-slate-400 text-center">
              Menampilkan 50 baris pertama dari total {filteredRows.length} baris pada tab ini.
            </p>
          )}
        </div>

        {/* Modal Sticky Footer */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-900 border-t border-[#D8CCF3] dark:border-[#35105E] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {report.canCreateWOTickets ? (
              <span>Siap memproses {report.validWOCount} tiket WO ke sistem routing.</span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400 font-semibold">
                Tidak ada tiket WO valid. Data WO existing tetap aman.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isImporting}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Tutup
            </button>

            {report.canCreateWOTickets ? (
              <button
                type="button"
                onClick={handleExecute}
                disabled={isImporting}
                className="px-5 py-2 bg-[#5B35B1] hover:bg-[#3B1D78] text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isImporting ? (
                  <span>Mengimpor...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Eksekusi Import ({report.validWOCount} WO)</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="px-5 py-2 bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-xl text-xs font-bold cursor-not-allowed"
                title="Tidak ada tiket WO valid untuk diimpor"
              >
                Import Dinonaktifkan (0 WO Valid)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
