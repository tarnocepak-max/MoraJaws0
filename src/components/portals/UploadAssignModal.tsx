import React, { useState } from 'react';
import { Ticket, User } from '../../types/index.ts';
import { Upload, FileUp, X, CheckCircle2, AlertTriangle, FileSpreadsheet, Check } from 'lucide-react';
import * as XLSX from 'xlsx';

interface UploadAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  contractorTickets: Ticket[];
  myInstallers: User[];
  onExecuteBulkAssign: (assignments: { ticketId: string; installerName: string; slotTime?: string }[]) => void;
}

export const UploadAssignModal: React.FC<UploadAssignModalProps> = ({
  isOpen,
  onClose,
  contractorTickets,
  myInstallers,
  onExecuteBulkAssign
}) => {
  const [pasteData, setPasteData] = useState('');
  const [parsedRows, setParsedRows] = useState<{
    woNumber: string;
    installerName: string;
    slotTime?: string;
    isValid: boolean;
    ticketId?: string;
    error?: string;
  }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const installerNamesMap = new Map<string, string>();
  myInstallers.forEach(inst => {
    installerNamesMap.set(inst.name.toLowerCase().trim(), inst.name);
    installerNamesMap.set(inst.username.toLowerCase().trim(), inst.name);
  });

  const ticketsByWo = new Map<string, Ticket>();
  contractorTickets.forEach(t => {
    ticketsByWo.set(t.woNumber.toUpperCase().trim(), t);
  });

  const parseLines = (rawText: string) => {
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    const results: typeof parsedRows = [];

    lines.forEach(line => {
      // Split by tab, comma, semicolon, or pipe
      const parts = line.split(/[\t,|;]+/).map(p => p.trim());
      if (parts.length < 2) return;

      const woCandidate = parts[0].toUpperCase();
      const installerCandidate = parts[1].toLowerCase();
      const slotCandidate = parts[2] || undefined;

      // Skip header lines
      if (woCandidate.includes('WO') && (installerCandidate.includes('INSTALLER') || installerCandidate.includes('TEKNISI'))) {
        return;
      }

      const matchedTicket = ticketsByWo.get(woCandidate);
      const matchedInstaller = installerNamesMap.get(installerCandidate);

      if (!matchedTicket) {
        results.push({
          woNumber: parts[0],
          installerName: parts[1],
          slotTime: slotCandidate,
          isValid: false,
          error: 'Nomor WO tidak ditemukan pada kontraktor ini.'
        });
      } else if (!matchedInstaller) {
        results.push({
          woNumber: parts[0],
          installerName: parts[1],
          slotTime: slotCandidate,
          isValid: false,
          error: 'Teknisi tidak terdaftar di tim kontraktor Anda.'
        });
      } else {
        results.push({
          woNumber: matchedTicket.woNumber,
          installerName: matchedInstaller,
          slotTime: slotCandidate || matchedTicket.slotTime,
          isValid: true,
          ticketId: matchedTicket.id
        });
      }
    });

    setParsedRows(results);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        const lines = rawJson
          .map(row => (Array.isArray(row) ? row.join('\t') : ''))
          .filter(Boolean)
          .join('\n');

        setPasteData(lines);
        parseLines(lines);
      } catch (err) {
        console.warn('Failed parsing spreadsheet', err);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleConfirm = () => {
    const validOnes = parsedRows.filter(r => r.isValid && r.ticketId);
    if (validOnes.length === 0) return;

    setIsProcessing(true);
    onExecuteBulkAssign(
      validOnes.map(r => ({
        ticketId: r.ticketId!,
        installerName: r.installerName,
        slotTime: r.slotTime
      }))
    );
    setIsProcessing(false);
    onClose();
  };

  const validCount = parsedRows.filter(r => r.isValid).length;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden text-xs">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 rounded-lg">
              <FileUp className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Upload & Batch Assign Work Order
              </h3>
              <p className="text-[11px] text-slate-500">
                Unggah berkas Excel/CSV atau tempel teks pemetaan (WO Number | Nama Teknisi)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 max-h-[65vh] overflow-y-auto space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <label className="flex-1 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 rounded-xl p-4 text-center cursor-pointer bg-slate-50/50 dark:bg-slate-800/30 transition-colors">
              <FileSpreadsheet className="w-6 h-6 text-indigo-500 mx-auto mb-1" />
              <span className="font-semibold text-slate-800 dark:text-slate-200 block text-xs">
                Klik untuk unggah Excel (.xlsx, .csv)
              </span>
              <span className="text-[10px] text-slate-400">
                Format kolom: [WO Number], [Nama Teknisi], [Slot Waktu (Opsional)]
              </span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Atau Tempel / Salin Teks Pemetaan (Clipboard Paste):
            </label>
            <textarea
              rows={4}
              placeholder={`Contoh:\nWO20267399330\tAndi Saputra\t09:00 - 11:00 WIB\nWO20267399331\tDedi Kurniawan`}
              value={pasteData}
              onChange={e => {
                setPasteData(e.target.value);
                parseLines(e.target.value);
              }}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-[11px] text-slate-800 dark:text-slate-200"
            />
          </div>

          {parsedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  Hasil Pemindaian ({validCount} Valid dari {parsedRows.length} baris):
                </span>
                <span className="text-emerald-600 font-semibold">{validCount} Siap Di-assign</span>
              </div>

              <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl divide-y">
                {parsedRows.map((r, idx) => (
                  <div
                    key={idx}
                    className={`p-2 flex items-center justify-between text-xs ${
                      r.isValid
                        ? 'bg-emerald-50/30 dark:bg-emerald-950/20 text-slate-800 dark:text-slate-200'
                        : 'bg-rose-50/50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {r.isValid ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      )}
                      <span className="font-mono font-bold">{r.woNumber}</span>
                      <span>➔</span>
                      <span className="font-medium">{r.installerName}</span>
                      {r.slotTime && <span className="text-slate-400 font-mono text-[10px]">({r.slotTime})</span>}
                    </div>
                    {r.error && <span className="text-[10px] text-rose-600">{r.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-slate-600 hover:text-slate-900 font-medium"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={validCount === 0 || isProcessing}
            className={`px-5 py-2 rounded-xl font-bold text-white transition-all shadow-sm ${
              validCount === 0 || isProcessing
                ? 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed opacity-60'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {isProcessing ? 'Memproses...' : `Tugaskan ${validCount} WO Sekarang`}
          </button>
        </div>
      </div>
    </div>
  );
};
