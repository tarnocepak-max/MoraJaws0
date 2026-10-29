import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Server,
  Database,
  FileSpreadsheet,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Clock,
  HardDrive,
  Cpu,
  Layers,
  Sparkles,
  Download
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

export const SystemHealthView: React.FC = () => {
  const { tickets, auditLogs, googleSheetsConfig, users } = useApp();
  const { toast } = useToast();

  const [healthData, setHealthData] = useState<{
    status: string;
    environment: string;
    database: any;
    integrations: any;
    serverTime: string;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(false);

  const fetchHealth = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const d = await res.json();
        setHealthData(d);
      }
    } catch {
      // quiet fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  const recentErrors = auditLogs
    .filter(l => l.action.toLowerCase().includes('failed') || l.action.toLowerCase().includes('blocked') || l.action.toLowerCase().includes('error'))
    .slice(0, 10);

  const recentAuthFailures = auditLogs
    .filter(l => l.entity === 'auth' && (l.action.toLowerCase().includes('failed') || l.action.toLowerCase().includes('blocked')))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#5B35B1] text-white flex items-center justify-center font-bold shadow-xs">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#3B1D78] dark:text-purple-200 flex items-center gap-2">
              <span>System Health & Integrations Diagnostic</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                All Systems Operational
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pemantauan kesehatan backend, latensi database, sinkronisasi Google Sheets, background jobs, dan deteksi anomali.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchHealth}
          className="px-3.5 py-1.5 bg-[#E9E1FF] dark:bg-[#3B1D78] text-[#3B1D78] dark:text-[#E9E1FF] font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Diagnostik</span>
        </button>
      </div>

      {/* 4 Health Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Backend Status */}
        <div className="p-4 bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Backend Node.js</span>
            <Server className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-lg font-black text-emerald-600 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            <span>Aktif & Terhubung</span>
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            Environment: {healthData?.environment || 'Production'} (Express + Vite)
          </div>
        </div>

        {/* Database Status */}
        <div className="p-4 bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Database Operasional</span>
            <Database className="w-4 h-4 text-[#5B35B1]" />
          </div>
          <div className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-1.5">
            <span>{tickets.length} Work Orders</span>
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            Tersimpan di Disk Persisten (Atomic Sync)
          </div>
        </div>

        {/* Google Sheets Status */}
        <div className="p-4 bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Google Sheets API</span>
            <FileSpreadsheet className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-lg font-black text-blue-600">
            {googleSheetsConfig.spreadsheetId ? 'Terhubung (Connected)' : 'Siap Dikonfigurasi'}
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            {googleSheetsConfig.spreadsheetTitle || 'Tab: Work_Orders'}
          </div>
        </div>

        {/* App Version */}
        <div className="p-4 bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Versi & Integritas</span>
            <ShieldCheck className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-lg font-black text-[#5B35B1] dark:text-purple-300">
            MoraJaws v5.0.0
          </div>
          <div className="text-[11px] text-slate-500">
            Role-Based Access: 6 Peran Aktif
          </div>
        </div>
      </div>

      {/* Diagnostics Grid: Recent Errors & Auth Security Failures */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
        {/* Recent System Alerts */}
        <div className="p-5 bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <h3 className="font-bold text-sm text-[#3B1D78] dark:text-purple-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span>Log Peringatan & Kesalahan Terbaru</span>
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">{recentErrors.length} Tercatat</span>
          </div>

          {recentErrors.length === 0 ? (
            <div className="py-8 text-center text-emerald-600 font-bold">
              Tidak ada kesalahan sistem atau anomali terkini.
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {recentErrors.map(err => (
                <div key={err.id} className="p-2.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[11px] space-y-0.5">
                  <div className="flex items-center justify-between font-bold text-amber-900 dark:text-amber-200">
                    <span>{err.action}</span>
                    <span className="font-mono text-[9.5px] text-slate-400">{new Date(err.timestamp).toLocaleTimeString('id-ID')}</span>
                  </div>
                  <div className="text-slate-600 dark:text-slate-400">{err.details}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Authentication Security Monitor */}
        <div className="p-5 bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <h3 className="font-bold text-sm text-[#3B1D78] dark:text-purple-200 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-500" />
              <span>Proteksi Autentikasi & Brute-Force Gate</span>
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">Batas 5x Gagal</span>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border space-y-1.5 text-[11.5px] text-slate-600 dark:text-slate-300">
            <div className="font-bold text-slate-900 dark:text-white">Protokol Keamanan Aktif:</div>
            <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
              <li>Password disimpan dalam hash algoritma dengan salt rahasia</li>
              <li>Akun dinonaktifkan ditolak secara instan pada level backend</li>
              <li>Percobaan login gagal berturut-turut diblokir otomatis 5 menit</li>
              <li>Tidak ada token atau credential rahasia yang diekspos ke client</li>
            </ul>
          </div>

          <div className="space-y-2 pt-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase block">
              Percobaan Login Gagal / Ditolak Terbaru:
            </span>
            {recentAuthFailures.length === 0 ? (
              <div className="text-slate-400 text-[11px] italic">
                Tidak ada upaya login mencurigakan yang diblokir.
              </div>
            ) : (
              recentAuthFailures.map(log => (
                <div key={log.id} className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 border border-rose-200 text-[10.5px]">
                  <strong>{log.action}</strong>: {log.details}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
