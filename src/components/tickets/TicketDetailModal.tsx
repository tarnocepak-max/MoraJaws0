import React, { useState, useRef } from 'react';
import { Ticket } from '../../types/index.ts';
import { useApp } from '../../context/AppContext';
import { StatusAgentBadge, StatusInstallerBadge, StatusWhatsAppBadge } from '../common/Badge';
import { TicketLiveChat } from '../chat/TicketLiveChat';
import { TechnicalReportForm } from './TechnicalReportForm';
import {
  X,
  MessageSquare,
  Edit2,
  Check,
  Archive,
  RotateCcw,
  Trash2,
  Phone,
  MapPin,
  Clock,
  Calendar,
  Building2,
  Wrench,
  User,
  ShieldCheck,
  CheckCircle2,
  ArrowDown,
  ExternalLink,
  Layers,
  Cpu,
  Wifi,
  FileText,
  AlertCircle
} from 'lucide-react';
import { SuperAdminDeleteModal } from '../common/SuperAdminDeleteModal';
import { formatAppointmentDateDisplay } from '../../services/appointmentDateParser';
import { History } from 'lucide-react';

interface TicketDetailModalProps {
  ticket: Ticket | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenWhatsApp: (ticket: Ticket) => void;
  defaultTab?: 'overview' | 'report' | 'chat' | 'history';
}

export const TicketDetailModal: React.FC<TicketDetailModalProps> = ({
  ticket,
  isOpen,
  onClose,
  onOpenWhatsApp,
  defaultTab = 'overview'
}) => {
  const {
    currentUser,
    updateTicket,
    assignTicketPersonnel,
    closeTicket,
    reopenTicket,
    archiveTicket,
    restoreTicket,
    leadersList,
    installersList
  } = useApp();

  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<Ticket>>({});
  const [selectedLeader, setSelectedLeader] = useState('');
  const [selectedInstaller, setSelectedInstaller] = useState('');

  // Close ticket modal state
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeNotes, setCloseNotes] = useState('');
  const [closeError, setCloseError] = useState<string | null>(null);

  // Reopen ticket modal state
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  // Delete confirm state (Super Admin guard)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Show report editor modal/drawer
  const [showReportEditor, setShowReportEditor] = useState(false);

  const chatSectionRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isOpen && defaultTab === 'chat') {
      const timer = setTimeout(() => {
        chatSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen, defaultTab, ticket?.id]);

  if (!isOpen || !ticket) return null;

  const scrollToChat = () => {
    chatSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleStartEdit = () => {
    setEditFormData({ ...ticket });
    setSelectedLeader(ticket.leaderName || '');
    setSelectedInstaller(ticket.installerName || '');
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    const updates: Partial<Ticket> = {
      ...editFormData,
      leaderName: selectedLeader
    };
    if (currentUser.role === 'leader') {
      updates.installerName = selectedInstaller;
    }
    const res = updateTicket(ticket.id, updates, 'Manual ticket detail edit');
    if (res && !res.success && res.error) {
      alert(res.error);
      return;
    }
    setIsEditing(false);
  };

  const handleArchive = () => {
    if (ticket.isArchived) {
      restoreTicket(ticket.id);
    } else {
      archiveTicket(ticket.id);
    }
  };

  const handleConfirmCloseTicket = () => {
    setCloseError(null);
    const result = closeTicket(ticket.id, closeNotes);
    if (result.success) {
      setShowCloseModal(false);
      setCloseNotes('');
    } else {
      setCloseError(result.error || 'Gagal menutup tiket.');
    }
  };

  const handleConfirmReopen = () => {
    if (reopenReason.trim()) {
      reopenTicket(ticket.id, reopenReason.trim());
      setShowReopenModal(false);
      setReopenReason('');
    }
  };

  // Helper: Strictly verify if a field has real, non-empty data
  const hasValue = (val: any): boolean => {
    if (val === undefined || val === null) return false;
    const str = String(val).trim();
    return str !== '' && str !== '-' && str !== 'null' && str !== 'undefined';
  };

  const canCloseTicket = (currentUser.role === 'dispatch' || currentUser.role === 'super_admin') && ticket.statusWOAgent !== 'Closed';
  const isTicketClosed = ticket.statusWOAgent === 'Closed';

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/80 p-2 sm:p-4 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-7xl h-[95vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* ============================================================ */}
        {/* SIMPLE, CLEAN TOP BAR                                        */}
        {/* ============================================================ */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono font-bold text-lg text-indigo-600 dark:text-indigo-400">
              {ticket.woNumber}
            </span>
            <span className="px-2 py-0.5 rounded-md font-mono text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              ID Cust: {ticket.idCustomer}
            </span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
              {ticket.customerName}
            </span>
            <div className="flex items-center gap-1.5 ml-1">
              <StatusAgentBadge status={ticket.statusWOAgent} />
              <StatusInstallerBadge status={ticket.statusWOInstaller} />
              <StatusWhatsAppBadge status={ticket.statusWhatsApp} />
            </div>
            {ticket.isArchived && (
              <span className="text-[11px] px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded font-medium">
                Archived
              </span>
            )}
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Quick scroll to live chat */}
            <button
              onClick={scrollToChat}
              className="px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 rounded-lg border border-indigo-200 dark:border-indigo-800 flex items-center gap-1.5 transition-colors"
              title="Gulir langsung ke kolom Live Chat di bawah"
            >
              <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
              <span>Live Chat</span>
              <ArrowDown className="w-3 h-3" />
            </button>

            {/* WhatsApp */}
            <button
              onClick={() => onOpenWhatsApp(ticket)}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-1.5 shadow-2xs transition-colors"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </button>

            {/* Close Ticket Action */}
            {canCloseTicket && (
              <button
                onClick={() => setShowCloseModal(true)}
                className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg flex items-center gap-1.5 shadow-2xs transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Close Ticket</span>
              </button>
            )}

            {isTicketClosed && (currentUser.role === 'dispatch' || currentUser.role === 'super_admin') && (
              <button
                onClick={() => setShowReopenModal(true)}
                className="px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800 rounded-lg flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reopen</span>
              </button>
            )}

            {/* Edit / Save */}
            {!isTicketClosed && (
              isEditing ? (
                <button
                  onClick={handleSaveEdit}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Simpan</span>
                </button>
              ) : (
                <button
                  onClick={handleStartEdit}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg flex items-center gap-1.5"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit Data</span>
                </button>
              )
            )}

            {isEditing && (
              <button
                onClick={() => setIsEditing(false)}
                className="px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Batal
              </button>
            )}

            {/* Archive */}
            <button
              onClick={handleArchive}
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              title={ticket.isArchived ? 'Restore Ticket' : 'Arsipkan Ticket'}
            >
              <Archive className="w-4 h-4" />
            </button>

            {/* Super Admin Delete */}
            {currentUser.role === 'super_admin' && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:text-white hover:bg-rose-600 dark:hover:bg-rose-600 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-900 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="Hapus Work Order (Super Admin Only)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Hapus WO</span>
              </button>
            )}

            {/* Close Modal button */}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg ml-1"
              aria-label="Tutup Dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Close Ticket Modal Banner */}
        {showCloseModal && (
          <div className="p-4 bg-indigo-50 dark:bg-indigo-950/80 border-b border-indigo-200 dark:border-indigo-900 text-xs space-y-3 shrink-0">
            <div className="font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-indigo-600" />
              <span>Verifikasi & Penyelesaian Resmi Tiket (Close Ticket WO: {ticket.woNumber})</span>
            </div>
            {closeError && (
              <div className="p-2 rounded bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-medium">
                {closeError}
              </div>
            )}
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <input
                type="text"
                placeholder="Catatan penutupan (contoh: Redaman -18 dBm baik, internet aktif, pelanggan puas)..."
                value={closeNotes}
                onChange={e => setCloseNotes(e.target.value)}
                className="w-full sm:flex-1 px-3 py-2 border border-indigo-300 dark:border-indigo-800 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs"
              />
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setShowCloseModal(false)}
                  className="px-3 py-2 bg-slate-200 dark:bg-slate-800 rounded-lg font-medium text-xs"
                >
                  Batal
                </button>
                <button
                  onClick={handleConfirmCloseTicket}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs"
                >
                  Konfirmasi Close Ticket
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reopen Ticket Banner */}
        {showReopenModal && (
          <div className="p-4 bg-amber-50 dark:bg-amber-950/80 border-b border-amber-200 dark:border-amber-900 text-xs space-y-3 shrink-0">
            <div className="font-bold text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
              <RotateCcw className="w-4 h-4 text-amber-600" />
              <span>Buka Kembali Tiket (Reopen Work Order)</span>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <input
                type="text"
                placeholder="Alasan reopen (contoh: keluhan ulang pelanggan, redaman drop kembali)..."
                value={reopenReason}
                onChange={e => setReopenReason(e.target.value)}
                className="w-full sm:flex-1 px-3 py-2 border border-amber-300 dark:border-amber-800 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs"
              />
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setShowReopenModal(false)}
                  className="px-3 py-2 bg-slate-200 dark:bg-slate-800 rounded-lg font-medium text-xs"
                >
                  Batal
                </button>
                <button
                  onClick={handleConfirmReopen}
                  disabled={!reopenReason.trim()}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white rounded-lg font-bold text-xs"
                >
                  Buka Kembali
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* CONTINUOUS SCROLLABLE FULL BODY                              */}
        {/* ============================================================ */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 text-xs">
          
          {/* SECTION 1: HIGHLIGHT SUMMARY CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Customer & Location */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 space-y-2">
              <div className="flex items-center justify-between text-slate-400 font-bold uppercase tracking-wider text-[10.5px]">
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-indigo-500" />
                  Data Pelanggan
                </span>
                <span className="font-mono text-indigo-600 dark:text-indigo-400">ID: {ticket.idCustomer}</span>
              </div>
              <div className="font-bold text-sm text-slate-900 dark:text-white">
                {ticket.customerName}
              </div>
              <div className="flex items-center justify-between gap-2 font-mono text-xs text-slate-700 dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <span>{ticket.customerPhone || '-'}</span>
                  {ticket.customerPhone && (
                    <a
                      href={`tel:${ticket.customerPhone}`}
                      className="p-1 rounded bg-slate-200 dark:bg-slate-700 hover:text-indigo-600"
                      title="Telepon Pelanggan"
                    >
                      <Phone className="w-3 h-3" />
                    </a>
                  )}
                </div>
                {ticket.customerPhone && (
                  <button
                    type="button"
                    onClick={() => onOpenWhatsApp(ticket)}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-2xs transition-colors shrink-0 cursor-pointer"
                    title="Buka WhatsApp Pelanggan"
                  >
                    <MessageSquare className="w-3 h-3" />
                    <span>WhatsApp</span>
                  </button>
                )}
              </div>
              {(ticket.address || ticket.streetName || ticket.clusterName) && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-[11.5px] text-slate-600 dark:text-slate-400">
                  <div className="flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                    <div>
                      {ticket.clusterName && <span className="font-semibold text-slate-800 dark:text-slate-200">[{ticket.clusterName}] </span>}
                      <span>{ticket.address || ticket.streetName}</span>
                      {ticket.city && <span className="block text-[11px] text-slate-400">{ticket.city} {ticket.postalCode || ''}</span>}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Schedule & Appointment */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 space-y-2">
              <div className="text-slate-400 font-bold uppercase tracking-wider text-[10.5px] flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-500" />
                Jadwal Kunjungan & Slot
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-bold text-xs flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{ticket.slotTime || 'Belum Ditentukan'}</span>
                </span>
                {ticket.ticketCategory && (
                  <span className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[11px] uppercase">
                    {ticket.ticketCategory}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400 pt-1 space-y-1">
                <div>Tanggal Appointment: <strong className="text-purple-700 dark:text-purple-300 font-semibold">{formatAppointmentDateDisplay(ticket.appointmentDate)}</strong></div>
                {hasValue(ticket.appointmentType) && <div>Tipe Janji Temu: <span className="font-medium text-slate-700 dark:text-slate-300">{ticket.appointmentType}</span></div>}
                <div>Tanggal Upload: <span className="font-mono text-slate-500">{ticket.dateUpload || ticket.createdAt?.slice(0, 10)}</span></div>
              </div>
            </div>

            {/* Contractor & Assigned Team */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 space-y-2">
              <div className="text-slate-400 font-bold uppercase tracking-wider text-[10.5px] flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-emerald-500" />
                Mitra Kontraktor & Tim
              </div>
              <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>{ticket.contactorName || 'Mitra Belum Ditentukan'}</span>
              </div>
              <div className="pt-1 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Teknisi (Installer):</span>
                  {isEditing ? (
                    currentUser.role === 'leader' ? (
                      <select
                        value={selectedInstaller}
                        onChange={e => setSelectedInstaller(e.target.value)}
                        className="px-2 py-1 text-xs bg-white dark:bg-slate-800 border rounded font-semibold text-slate-800 dark:text-slate-200"
                      >
                        <option value="">-- Belum Ditugaskan --</option>
                        {installersList.map(inst => (
                          <option key={inst} value={inst}>{inst}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="text-right">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {ticket.installerName || 'Belum Ditugaskan'}
                        </span>
                        <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                          Hanya Leader yang berwenang menugaskan teknisi
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {ticket.installerName || <em className="text-amber-600 dark:text-amber-400 font-normal">Belum Ditugaskan</em>}
                      </span>
                      {currentUser.role === 'leader' && (
                        <select
                          value={ticket.installerName || ''}
                          onChange={e => {
                            if (e.target.value !== ticket.installerName) {
                              assignTicketPersonnel(ticket.id, currentUser.name, e.target.value);
                            }
                          }}
                          className="px-2 py-0.5 text-[11px] bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 rounded font-semibold text-indigo-700 dark:text-indigo-300 cursor-pointer"
                          title="Tugaskan Teknisi (Wewenang Khusus Leader)"
                        >
                          <option value="">-- Pilih Teknisi --</option>
                          {installersList.map(inst => (
                            <option key={inst} value={inst}>{inst}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Koordinator (Korlap):</span>
                  {isEditing && (currentUser.role === 'super_admin' || currentUser.role === 'dispatch') ? (
                    <select
                      value={selectedLeader}
                      onChange={e => setSelectedLeader(e.target.value)}
                      className="px-2 py-1 text-xs bg-white dark:bg-slate-800 border rounded font-semibold"
                    >
                      <option value="">-- Belum Ditugaskan --</option>
                      {leadersList.map(lead => (
                        <option key={lead} value={lead}>{lead}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-right">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {ticket.leaderName || '-'}
                      </span>
                      {isEditing && (
                        <div className="text-[10px] text-slate-400">
                          (Wewenang Super Admin & Dispatch)
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {hasValue(ticket.distributionStatus) && (
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-800">
                    <span className="text-slate-400">Status Distribusi:</span>
                    <span className="font-semibold capitalize text-indigo-600 dark:text-indigo-400">
                      {ticket.distributionStatus?.replace(/_/g, ' ')}
                    </span>
                  </div>
                )}

                {/* Assignment History Timeline */}
                {ticket.assignmentHistory && ticket.assignmentHistory.length > 0 && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-slate-500 font-semibold text-[10.5px]">
                      <History className="w-3 h-3 text-amber-500" />
                      <span>Riwayat Reassign Penugasan ({ticket.assignmentHistory.length}):</span>
                    </div>
                    <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                      {ticket.assignmentHistory.map((h, i) => (
                        <div key={i} className="p-2 rounded bg-slate-100 dark:bg-slate-800 text-[10px] space-y-0.5">
                          <div className="flex items-center justify-between font-semibold">
                            <span>{h.previousInstaller || 'Unassigned'} &rarr; <span className="text-emerald-600 dark:text-emerald-400">{h.assignedInstaller}</span></span>
                            <span className="font-mono text-slate-400 text-[9px]">{new Date(h.timestamp).toLocaleString('id-ID')}</span>
                          </div>
                          <div className="text-slate-500 italic">"{h.reason}"</div>
                          <div className="text-slate-400 text-[9px]">Oleh: {h.performedBy} ({h.performedByRole})</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 2: CLEAN POPULATED FIELDS (STRICTLY OMIT EMPTY DATA) */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-white dark:bg-slate-900 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-indigo-500" />
                <span>Informasi Rinci Work Order (Hanya Menampilkan Data Terisi)</span>
              </h4>
              <span className="text-[11px] text-slate-400">
                Kolom kosong disembunyikan otomatis
              </span>
            </div>

            {/* Grid of populated canonical fields */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {hasValue(ticket.ticketNumber) && (
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10.5px] text-slate-400">No Ticket</div>
                  <div className="font-mono font-semibold text-slate-800 dark:text-slate-200">{ticket.ticketNumber}</div>
                </div>
              )}
              {hasValue(ticket.area) && (
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10.5px] text-slate-400">Area</div>
                  <div className="font-medium text-slate-800 dark:text-slate-200">{ticket.area}</div>
                </div>
              )}
              {hasValue(ticket.clusterName) && (
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10.5px] text-slate-400">Cluster</div>
                  <div className="font-medium text-slate-800 dark:text-slate-200">{ticket.clusterName}</div>
                </div>
              )}
              {hasValue(ticket.installationType) && (
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10.5px] text-slate-400">Tipe Instalasi</div>
                  <div className="font-medium text-slate-800 dark:text-slate-200">{ticket.installationType}</div>
                </div>
              )}
              {hasValue(ticket.serviceType) && (
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10.5px] text-slate-400">Tipe Layanan</div>
                  <div className="font-medium text-slate-800 dark:text-slate-200">{ticket.serviceType}</div>
                </div>
              )}
              {hasValue(ticket.homepassType) && (
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10.5px] text-slate-400">Tipe Homepass</div>
                  <div className="font-medium text-slate-800 dark:text-slate-200">{ticket.homepassType}</div>
                </div>
              )}
              {hasValue(ticket.homepassDetailId) && (
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10.5px] text-slate-400">Homepass ID</div>
                  <div className="font-mono text-slate-800 dark:text-slate-200">{ticket.homepassDetailId}</div>
                </div>
              )}
              {hasValue(ticket.oltCode) && (
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10.5px] text-slate-400">Kode OLT</div>
                  <div className="font-mono font-semibold text-slate-800 dark:text-slate-200">{ticket.oltCode}</div>
                </div>
              )}
              {hasValue(ticket.fdtCode) && (
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10.5px] text-slate-400">Kode FDT</div>
                  <div className="font-mono font-semibold text-slate-800 dark:text-slate-200">{ticket.fdtCode}</div>
                </div>
              )}
              {hasValue(ticket.fatCode) && (
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10.5px] text-slate-400">Kode FAT</div>
                  <div className="font-mono font-semibold text-slate-800 dark:text-slate-200">{ticket.fatCode}</div>
                </div>
              )}
              {hasValue(ticket.fatPort) && (
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10.5px] text-slate-400">Port FAT</div>
                  <div className="font-mono font-semibold text-slate-800 dark:text-slate-200">{ticket.fatPort}</div>
                </div>
              )}
              {hasValue(ticket.dropcoreLength) && (
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10.5px] text-slate-400">Panjang Dropcore</div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">{ticket.dropcoreLength} Meter</div>
                </div>
              )}
              {hasValue(ticket.ontBrand) && (
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10.5px] text-slate-400">Brand ONT</div>
                  <div className="font-medium text-slate-800 dark:text-slate-200">{ticket.ontBrand} {ticket.ontModel || ''}</div>
                </div>
              )}
              {hasValue(ticket.ontSerialNumber) && (
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10.5px] text-slate-400">SN ONT</div>
                  <div className="font-mono text-slate-800 dark:text-slate-200">{ticket.ontSerialNumber}</div>
                </div>
              )}
              {hasValue(ticket.ontMacAddress) && (
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10.5px] text-slate-400">MAC ONT</div>
                  <div className="font-mono text-slate-800 dark:text-slate-200">{ticket.ontMacAddress}</div>
                </div>
              )}
              {hasValue(ticket.routerBrand) && (
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10.5px] text-slate-400">Router Brand/Model</div>
                  <div className="font-medium text-slate-800 dark:text-slate-200">{ticket.routerBrand} {ticket.routerModel || ''}</div>
                </div>
              )}
              {hasValue(ticket.routerSerialNumber) && (
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10.5px] text-slate-400">SN Router</div>
                  <div className="font-mono text-slate-800 dark:text-slate-200">{ticket.routerSerialNumber}</div>
                </div>
              )}
              {hasValue(ticket.stb1Sn) && (
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10.5px] text-slate-400">STB 1 SN</div>
                  <div className="font-mono text-slate-800 dark:text-slate-200">{ticket.stb1Sn}</div>
                </div>
              )}
              {hasValue(ticket.customerContact2) && (
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10.5px] text-slate-400">Telepon 2</div>
                  <div className="font-mono text-slate-800 dark:text-slate-200">{ticket.customerContact2}</div>
                </div>
              )}
              {hasValue(ticket.agentId) && (
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10.5px] text-slate-400">Agent ID</div>
                  <div className="font-mono text-slate-800 dark:text-slate-200">{ticket.agentId}</div>
                </div>
              )}
              {hasValue(ticket.fileName) && (
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10.5px] text-slate-400">File Sumber</div>
                  <div className="truncate font-mono text-[11px] text-slate-700 dark:text-slate-300">{ticket.fileName}</div>
                </div>
              )}
            </div>

            {/* Remarks / Notes (Only if populated) */}
            {(hasValue(ticket.remarksAgent) || hasValue(ticket.remarksWOInstaller) || hasValue(ticket.remarks)) && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {hasValue(ticket.remarksAgent) && (
                  <div className="p-3 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40">
                    <span className="font-bold text-indigo-900 dark:text-indigo-300 block mb-1">Catatan Dispatch (Remarks Agent):</span>
                    <p className="text-slate-700 dark:text-slate-300">{ticket.remarksAgent}</p>
                  </div>
                )}
                {hasValue(ticket.remarksWOInstaller) && (
                  <div className="p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40">
                    <span className="font-bold text-emerald-900 dark:text-emerald-300 block mb-1">Catatan Teknisi Lapangan:</span>
                    <p className="text-slate-700 dark:text-slate-300">{ticket.remarksWOInstaller}</p>
                  </div>
                )}
                {hasValue(ticket.remarks) && !ticket.remarksAgent && (
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <span className="font-bold text-slate-800 dark:text-slate-200 block mb-1">Catatan Umum:</span>
                    <p className="text-slate-600 dark:text-slate-300">{ticket.remarks}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SECTION 3: TECHNICAL REPORT SUMMARY (If filled or accessible) */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-white dark:bg-slate-900 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-emerald-600" />
                <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                  Laporan Hasil Pengerjaan Teknisi (Technical Report)
                </h4>
              </div>
              <button
                onClick={() => setShowReportEditor(!showReportEditor)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 transition-colors"
              >
                {showReportEditor ? 'Sembunyikan Form Edit' : (ticket.technicalReport ? 'Ubah Laporan Teknis' : '+ Input Laporan Teknis')}
              </button>
            </div>

            {ticket.technicalReport ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border">
                  <div className="text-[10.5px] text-slate-400">Redaman Optik (Rx)</div>
                  <div className="font-mono font-bold text-sm text-indigo-600 dark:text-indigo-400">
                    {ticket.technicalReport.opticalPowerRx} dBm
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border">
                  <div className="text-[10.5px] text-slate-400">Hasil Pekerjaan</div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    {ticket.technicalReport.workResult}
                  </div>
                </div>
                {ticket.technicalReport.rootCauseCategory && (
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border">
                    <div className="text-[10.5px] text-slate-400">Katalog Root Cause</div>
                    <div className="font-semibold text-amber-700 dark:text-amber-300">
                      {ticket.technicalReport.rootCauseCategory} - {ticket.technicalReport.rootCauseSubCategory || ''}
                    </div>
                  </div>
                )}
                {ticket.technicalReport.photos && ticket.technicalReport.photos.length > 0 && (
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border">
                    <div className="text-[10.5px] text-slate-400">Foto Bukti Terupload</div>
                    <div className="font-bold text-emerald-600 dark:text-emerald-400">
                      {ticket.technicalReport.photos.length} Foto
                    </div>
                  </div>
                )}
              </div>
            ) : (
              !showReportEditor && (
                <div className="py-3 text-slate-400 text-xs italic">
                  Belum ada laporan teknis yang disimpan. Klik tombol di atas untuk mengisi data redaman, root cause, dan foto pengerjaan.
                </div>
              )
            )}

            {showReportEditor && (
              <div className="pt-2">
                <TechnicalReportForm ticket={ticket} />
              </div>
            )}
          </div>

          {/* ============================================================ */}
          {/* SECTION 4: DOMINANT, LARGE LIVE CHAT AT BOTTOM               */}
          {/* ============================================================ */}
          <div ref={chatSectionRef} className="pt-2 space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Live Chat Komunikasi Dispatch & Teknisi</span>
                  <span className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950">
                    WO: {ticket.woNumber}
                  </span>
                </h3>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Kolom percakapan diperbesar untuk mempermudah koordinasi & membaca pesan
              </div>
            </div>

            {/* Large Chat Container */}
            <div className="rounded-2xl border-2 border-indigo-200 dark:border-indigo-900/80 shadow-md overflow-hidden bg-white dark:bg-slate-900">
              <TicketLiveChat ticket={ticket} />
            </div>
          </div>

        </div>

        {/* ============================================================ */}
        {/* SIMPLE FOOTER                                                */}
        {/* ============================================================ */}
        <div className="px-5 py-2.5 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-400 flex items-center justify-between shrink-0">
          <div>
            WO ID: <span className="font-mono">{ticket.id}</span> · Terakhir Diperbarui: {new Date(ticket.updatedAt).toLocaleTimeString()}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors text-xs"
          >
            Tutup Dialog
          </button>
        </div>
      </div>

      {/* Super Admin Delete Modal Guard */}
      {showDeleteConfirm && (
        <SuperAdminDeleteModal
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          targetType="ticket"
          targetId={ticket.id}
          targetLabel={`WO: ${ticket.woNumber} (ID Pelanggan: ${ticket.idCustomer})`}
          targetDetails={[
            { label: 'Pelanggan', value: ticket.customerName },
            { label: 'Area / Cluster', value: `${ticket.area || '-'} / ${ticket.clusterName || '-'}` },
            { label: 'Mitra Kontraktor', value: ticket.contactorName || '-' },
            { label: 'Status', value: `${ticket.statusWOAgent} / ${ticket.statusWOInstaller}` }
          ]}
          onSuccess={() => {
            setShowDeleteConfirm(false);
            onClose();
          }}
        />
      )}
    </div>
  );
};
