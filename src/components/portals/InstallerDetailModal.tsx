import React, { useState, useMemo } from 'react';
import { User, Ticket, TechnicalReport, AuditLog } from '../../types/index.ts';
import { StatusInstallerBadge, StatusAgentBadge } from '../common/Badge';
import {
  X,
  UserCheck,
  Phone,
  Mail,
  MapPin,
  Building2,
  CheckCircle2,
  Clock,
  RotateCcw,
  XCircle,
  FileText,
  Activity,
  Layers,
  Calendar,
  Wrench,
  Gauge,
  ArrowRight
} from 'lucide-react';

interface InstallerDetailModalProps {
  installer: User | null;
  isOpen: boolean;
  onClose: () => void;
  contractorTickets: Ticket[];
  onSelectTicket: (ticket: Ticket) => void;
  onQuickAssign?: (installerName: string) => void;
  maxDailyQuota: number;
}

export const InstallerDetailModal: React.FC<InstallerDetailModalProps> = ({
  installer,
  isOpen,
  onClose,
  contractorTickets,
  onSelectTicket,
  onQuickAssign,
  maxDailyQuota
}) => {
  const [activeTab, setActiveTab] = useState<
    'summary' | 'active_wo' | 'completed_wo' | 'pending_wo' | 'problem_wo' | 'reports' | 'activities'
  >('summary');

  if (!isOpen || !installer) return null;

  // Filter WO assigned to this installer
  const installerTickets = useMemo(() => {
    return contractorTickets.filter(
      t => t.installerName?.toLowerCase().trim() === installer.name.toLowerCase().trim()
    );
  }, [contractorTickets, installer.name]);

  // Subsets by operational status
  const activeWOs = installerTickets.filter(
    t => t.statusWOInstaller !== 'Completed' && t.statusWOInstaller !== 'Failed / Cancelled' && t.statusWOInstaller !== 'Installed'
  );

  const completedWOs = installerTickets.filter(
    t => t.statusWOInstaller === 'Completed' || t.statusWOInstaller === 'Installed' || t.statusWOAgent === 'Resolved' || t.statusWOAgent === 'Closed'
  );

  const pendingWOs = installerTickets.filter(
    t => t.statusWOInstaller === 'Pending Technical' || t.statusWhatsApp === 'reschedule_requested' || t.remarksWOInstaller?.toLowerCase().includes('reschedule')
  );

  const problemWOs = installerTickets.filter(
    t => t.statusWOInstaller === 'Failed / Cancelled' || t.statusWOAgent === 'Cancelled'
  );

  // Tickets that have technical reports
  const ticketsWithReports = installerTickets.filter(t => Boolean(t.technicalReport));

  // Completion calculation
  const totalAssigned = installerTickets.length;
  const completionRate = totalAssigned > 0 ? Math.round((completedWOs.length / totalAssigned) * 100) : 0;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden text-xs">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-base shadow-sm">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  {installer.name}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  Teknisi Lapangan
                </span>
                <span className={`w-2 h-2 rounded-full ${installer.active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              </div>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                @{installer.username} · {installer.contractor || 'Mitra Kontraktor'} · ID: {installer.id}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onQuickAssign && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onQuickAssign(installer.name);
                }}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors shadow-xs"
              >
                + Assign WO
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 7 Tab Navigation */}
        <div className="flex items-center gap-1 px-5 pt-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-semibold text-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab('summary')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'summary'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>1. Ringkasan</span>
          </button>

          <button
            onClick={() => setActiveTab('active_wo')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'active_wo'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            <span>2. WO Aktif ({activeWOs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('completed_wo')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'completed_wo'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>3. WO Selesai ({completedWOs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('pending_wo')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'pending_wo'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5 text-blue-500" />
            <span>4. Tertunda ({pendingWOs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('problem_wo')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'problem_wo'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <XCircle className="w-3.5 h-3.5 text-rose-500" />
            <span>5. Bermasalah ({problemWOs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'reports'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-purple-500" />
            <span>6. Laporan Teknis ({ticketsWithReports.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('activities')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'activities'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-indigo-500" />
            <span>7. Riwayat Aktivitas</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* TAB 1: SUMMARY */}
          {activeTab === 'summary' && (
            <div className="space-y-4">
              {/* Profile & KPI Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[11px] text-slate-500 block font-medium">Total Ditugaskan</span>
                  <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1">
                    {totalAssigned} <span className="text-xs font-normal text-slate-500">WO</span>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[11px] text-slate-500 block font-medium">WO Selesai</span>
                  <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                    {completedWOs.length} <span className="text-xs font-normal text-slate-500">WO</span>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[11px] text-slate-500 block font-medium">WO Aktif</span>
                  <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
                    {activeWOs.length} <span className="text-xs font-normal text-slate-500">WO</span>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[11px] text-slate-500 block font-medium">Rasio Selesai (KPI)</span>
                  <div className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400 mt-1">
                    {completionRate}%
                  </div>
                </div>
              </div>

              {/* Visual Progress Bar Card */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    Progres Keseluruhan Pekerjaan
                  </span>
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                    {completedWOs.length} dari {totalAssigned} WO Selesai ({completionRate}%)
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, completionRate)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span>Belum Mulai: {activeWOs.length}</span>
                  <span>Tertunda: {pendingWOs.length}</span>
                  <span>Bermasalah: {problemWOs.length}</span>
                  <span className="text-emerald-600 font-semibold">Tuntas: {completedWOs.length}</span>
                </div>
              </div>

              {/* Technician Identity Details */}
              <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                  Informasi Kontak & Akun
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-700 dark:text-slate-300">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>WhatsApp / Telp: <strong>{installer.phone || '-'}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span>Email: <strong>{installer.email || '-'}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>Mitra Kontraktor: <strong>{installer.contractor || '-'}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>Area Cakupan: <strong>{installer.area || 'Semua Area'}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-purple-500 shrink-0" />
                    <span>Batas Kuota Harian: <strong>{maxDailyQuota} WO / Hari</strong></span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ACTIVE WO */}
          {activeTab === 'active_wo' && (
            <div className="space-y-3">
              <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                Work Order Aktif (Belum Selesai)
              </h4>
              {activeWOs.length === 0 ? (
                <div className="p-6 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                  Tidak ada Work Order aktif saat ini. Teknisi siap menerima penugasan baru.
                </div>
              ) : (
                <div className="divide-y border rounded-xl overflow-hidden">
                  {activeWOs.map(t => (
                    <div
                      key={t.id}
                      onClick={() => onSelectTicket(t)}
                      className="p-3 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60 flex items-center justify-between cursor-pointer"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-indigo-600">{t.woNumber}</span>
                          <StatusInstallerBadge status={t.statusWOInstaller} />
                        </div>
                        <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">{t.customerName}</div>
                        <div className="text-[11px] text-slate-400">{t.slotTime} · {t.area} · {t.clusterName}</div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: COMPLETED WO */}
          {activeTab === 'completed_wo' && (
            <div className="space-y-3">
              <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                Daftar Work Order Selesai (Completed)
              </h4>
              {completedWOs.length === 0 ? (
                <div className="p-6 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                  Belum ada Work Order yang diselesaikan oleh teknisi ini.
                </div>
              ) : (
                <div className="divide-y border rounded-xl overflow-hidden">
                  {completedWOs.map(t => (
                    <div
                      key={t.id}
                      onClick={() => onSelectTicket(t)}
                      className="p-3 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60 flex items-center justify-between cursor-pointer"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-indigo-600">{t.woNumber}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            Selesai
                          </span>
                        </div>
                        <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">{t.customerName}</div>
                        <div className="text-[11px] text-slate-400">{t.slotTime} · {t.streetName}</div>
                      </div>
                      <span className="text-[11px] text-emerald-600 font-semibold font-mono">
                        {t.updatedAt?.slice(0, 10)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: PENDING WO */}
          {activeTab === 'pending_wo' && (
            <div className="space-y-3">
              <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                Work Order Tertunda / Reschedule
              </h4>
              {pendingWOs.length === 0 ? (
                <div className="p-6 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                  Tidak ada Work Order berstatus tertunda.
                </div>
              ) : (
                <div className="divide-y border rounded-xl overflow-hidden">
                  {pendingWOs.map(t => (
                    <div
                      key={t.id}
                      onClick={() => onSelectTicket(t)}
                      className="p-3 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60 flex items-center justify-between cursor-pointer"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-indigo-600">{t.woNumber}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                            Tertunda / Reschedule
                          </span>
                        </div>
                        <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">{t.customerName}</div>
                        <div className="text-[11px] text-slate-500">Catatan: {t.remarksWOInstaller || t.remarksAgent || 'Tidak ada catatan'}</div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: PROBLEM WO */}
          {activeTab === 'problem_wo' && (
            <div className="space-y-3">
              <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                Work Order Bermasalah / Dibatalkan (Failed / Cancelled)
              </h4>
              {problemWOs.length === 0 ? (
                <div className="p-6 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                  Tidak ada Work Order bermasalah atau batal.
                </div>
              ) : (
                <div className="divide-y border rounded-xl overflow-hidden">
                  {problemWOs.map(t => (
                    <div
                      key={t.id}
                      onClick={() => onSelectTicket(t)}
                      className="p-3 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60 flex items-center justify-between cursor-pointer"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-rose-600">{t.woNumber}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                            Bermasalah / Batal
                          </span>
                        </div>
                        <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">{t.customerName}</div>
                        <div className="text-[11px] text-slate-500">{t.remarksWOInstaller || t.remarksAgent || '-'}</div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: REPORTS */}
          {activeTab === 'reports' && (
            <div className="space-y-3">
              <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                Riwayat Laporan Teknis Lapangan
              </h4>
              {ticketsWithReports.length === 0 ? (
                <div className="p-6 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                  Belum ada laporan teknis yang disubmit oleh teknisi ini.
                </div>
              ) : (
                <div className="space-y-2">
                  {ticketsWithReports.map(t => {
                    const rep = t.technicalReport!;
                    return (
                      <div
                        key={t.id}
                        onClick={() => onSelectTicket(t)}
                        className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-400 cursor-pointer space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-indigo-600">{t.woNumber} — {t.customerName}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                            {rep.workResult}
                          </span>
                        </div>
                        <div className="text-slate-700 dark:text-slate-300 font-medium">
                          Root Cause: <strong className="text-purple-700 dark:text-purple-300">{rep.rootCause}</strong> ({rep.mainCategory})
                        </div>
                        {rep.opticalPowerDbm && (
                          <div className="text-[11px] text-emerald-600 font-mono">
                            Redaman OPM: {rep.opticalPowerDbm} dBm
                          </div>
                        )}
                        <div className="text-[11px] text-slate-500 italic">
                          "{rep.technicalDescription || rep.correctiveAction}"
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono pt-1 border-t">
                          Diserahkan: {rep.submittedAt?.slice(0, 16).replace('T', ' ')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 7: ACTIVITIES */}
          {activeTab === 'activities' && (
            <div className="space-y-3">
              <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                Riwayat Penugasan & Aktivitas Teknisi
              </h4>
              <div className="border rounded-xl divide-y p-3 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 space-y-2">
                {installerTickets.length === 0 ? (
                  <div className="p-4 text-center text-slate-400">Belum ada riwayat aktivitas penugasan.</div>
                ) : (
                  installerTickets.slice(0, 15).map(t => (
                    <div key={t.id} className="pt-2 text-xs flex items-center justify-between">
                      <div>
                        <span className="font-mono font-bold text-indigo-600">{t.woNumber}</span>: Penugasan untuk {t.customerName} ({t.slotTime})
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">{t.updatedAt?.slice(0, 10)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 flex items-center justify-between text-xs">
          <span className="text-slate-500 font-mono text-[11px]">
            Portal Monitoring Teknisi MoraJaws
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 font-semibold text-slate-800 dark:text-slate-200 rounded-lg transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
