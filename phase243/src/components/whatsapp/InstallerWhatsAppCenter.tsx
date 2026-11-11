import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Ticket } from '../../types/index.ts';
import { StatusInstallerBadge, StatusWhatsAppBadge } from '../common/Badge';
import {
  MessageSquare,
  Search,
  Phone,
  Send,
  Calendar,
  MapPin,
  CheckCircle2,
  Clock,
  RotateCcw,
  ExternalLink,
  Wrench,
  AlertCircle,
  Copy,
  Check
} from 'lucide-react';
import { normalizePhoneNumber, buildWhatsAppClickToChatUrl, renderWhatsAppMessage } from '../../services/whatsappService';
import { useToast } from '../../context/ToastContext';

interface InstallerWhatsAppCenterProps {
  onOpenWhatsAppModal: (ticket: Ticket) => void;
  onSelectTicket: (ticket: Ticket) => void;
}

export const InstallerWhatsAppCenter: React.FC<InstallerWhatsAppCenterProps> = ({
  onOpenWhatsAppModal,
  onSelectTicket
}) => {
  const { currentUser, tickets, templates } = useApp();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unconfirmed' | 'confirmed' | 'reschedule'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Helper matching for logged-in technician
  const isInstallerMatch = (ticketInstaller: string | undefined, installerName: string) => {
    if (!ticketInstaller || !ticketInstaller.trim()) return false;
    const tInst = ticketInstaller.toLowerCase().trim();
    const effInst = installerName.toLowerCase().trim();
    if (tInst === effInst) return true;
    if (tInst.includes(effInst) || effInst.includes(tInst)) return true;
    const cleanEff = effInst.replace(/\(.*?\)/g, '').trim();
    if (cleanEff && (tInst.includes(cleanEff) || cleanEff.includes(tInst))) return true;
    return false;
  };

  // Strictly tickets assigned to current installer
  const myTickets = useMemo(() => {
    const myName = currentUser.name || '';
    const myUsername = currentUser.username || '';
    const myId = currentUser.id || '';

    return (tickets || []).filter(t => {
      if (t.isArchived || t.isDeleted) return false;
      if (!t.installerName) return false;

      if (t.assignedTo && (t.assignedTo === myId || t.assignedTo === myUsername)) return true;
      if (myName && isInstallerMatch(t.installerName, myName)) return true;
      if (myUsername && isInstallerMatch(t.installerName, myUsername)) return true;

      return false;
    });
  }, [tickets, currentUser]);

  const filteredTickets = useMemo(() => {
    return myTickets.filter(t => {
      if (statusFilter === 'unconfirmed') {
        if (t.statusWhatsApp === 'confirmed') return false;
      } else if (statusFilter === 'confirmed') {
        if (t.statusWhatsApp !== 'confirmed') return false;
      } else if (statusFilter === 'reschedule') {
        if (t.statusWhatsApp !== 'reschedule_requested') return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchWO = (t.woNumber || '').toLowerCase().includes(q);
        const matchCust = (t.customerName || '').toLowerCase().includes(q);
        const matchPhone = (t.customerPhone || '').includes(q);
        const matchArea = (t.area || '').toLowerCase().includes(q);
        const matchStreet = (t.streetName || '').toLowerCase().includes(q);
        return matchWO || matchCust || matchPhone || matchArea || matchStreet;
      }

      return true;
    });
  }, [myTickets, statusFilter, searchQuery]);

  const handleDirectWA = (ticket: Ticket) => {
    const defaultTpl = templates.find(tpl => tpl.isDefault) || templates[0];
    const templateBody = defaultTpl ? defaultTpl.messageBody : 'Halo {{customer_name}}, kami dari teknisi {{contractor_name}} konfirmasi kedatangan untuk WO {{wo_number}}.';
    const { renderedText } = renderWhatsAppMessage(templateBody, ticket);
    const { url } = buildWhatsAppClickToChatUrl(ticket.customerPhone, renderedText);

    if (url) {
      window.open(url, '_blank');
    } else {
      onOpenWhatsAppModal(ticket);
    }
  };

  const handleCopyPhone = (e: React.MouseEvent, phone: string, ticketId: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(normalizePhoneNumber(phone));
    setCopiedId(ticketId);
    toast.success('Nomor WhatsApp disalin!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-5">
      {/* Top Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-emerald-700 via-teal-700 to-emerald-800 text-white p-5 sm:p-6 shadow-md relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/20">
              <MessageSquare className="w-6 h-6 text-emerald-200" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight">
                Pusat Komunikasi WhatsApp Teknisi
              </h2>
              <p className="text-xs text-emerald-100/90 mt-0.5">
                Konfirmasi jadwal pelanggan, notifikasi teknisi menuju lokasi, dan template pesan resmi.
              </p>
            </div>
          </div>
          <div className="px-3.5 py-1.5 rounded-xl bg-white/20 backdrop-blur-md text-xs font-bold text-white shrink-0 self-start sm:self-auto border border-white/25">
            {myTickets.length} Tiket Pelanggan
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white dark:bg-[#1E1135] rounded-2xl border border-[#D8CCF3] dark:border-[#3B1D78] p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Status Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-purple-950/60 text-[#756B8D] dark:text-purple-300 hover:bg-slate-200'
              }`}
            >
              Semua ({myTickets.length})
            </button>
            <button
              onClick={() => setStatusFilter('unconfirmed')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'unconfirmed'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-purple-950/60 text-[#756B8D] dark:text-purple-300 hover:bg-slate-200'
              }`}
            >
              Perlu Konfirmasi
            </button>
            <button
              onClick={() => setStatusFilter('confirmed')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'confirmed'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-purple-950/60 text-[#756B8D] dark:text-purple-300 hover:bg-slate-200'
              }`}
            >
              Terkonfirmasi
            </button>
            <button
              onClick={() => setStatusFilter('reschedule')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'reschedule'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-purple-950/60 text-[#756B8D] dark:text-purple-300 hover:bg-slate-200'
              }`}
            >
              Reschedule
            </button>
          </div>

          {/* Search */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Cari nama, WO, atau telp..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-purple-900/50 bg-slate-50 dark:bg-[#160D29] text-[#21183A] dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Ticket List for WhatsApp */}
      {filteredTickets.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-white dark:bg-[#1E1135] border border-[#D8CCF3] dark:border-[#3B1D78] space-y-2">
          <MessageSquare className="w-10 h-10 text-slate-400 mx-auto" />
          <h4 className="text-sm font-bold text-[#21183A] dark:text-white">
            Tidak Ada Work Order yang Cocok
          </h4>
          <p className="text-xs text-[#756B8D] dark:text-slate-400">
            Tidak ditemukan tiket pelanggan sesuai filter yang dipilih.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredTickets.map(ticket => (
            <div
              key={ticket.id}
              className="bg-white dark:bg-[#1E1135] rounded-2xl border border-[#D8CCF3] dark:border-[#3B1D78] p-4 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-extrabold text-[#5B35B1] dark:text-purple-300">
                      {ticket.woNumber || ticket.ticketNumber || 'WO-Unknown'}
                    </span>
                    <StatusWhatsAppBadge status={ticket.statusWhatsApp} />
                  </div>
                  <h3 className="font-bold text-sm text-[#21183A] dark:text-white mt-1">
                    {ticket.customerName || 'Nama Pelanggan'}
                  </h3>
                  <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 mt-0.5">
                    <Phone className="w-3.5 h-3.5" />
                    <span>{ticket.customerPhone || 'Tidak ada nomor telepon'}</span>
                    {ticket.customerPhone && (
                      <button
                        onClick={(e) => handleCopyPhone(e, ticket.customerPhone, ticket.id)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-0.5"
                        title="Salin nomor"
                      >
                        {copiedId === ticket.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>

                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 shrink-0">
                  {ticket.slotTime || 'Hari ini'}
                </span>
              </div>

              <div className="text-xs text-[#756B8D] dark:text-slate-400 flex items-start gap-1.5 bg-slate-50 dark:bg-[#160D29] p-2.5 rounded-xl border border-slate-100 dark:border-purple-900/30">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span className="line-clamp-2">
                  {ticket.streetName || ticket.clusterName || ticket.area || 'Alamat tidak tersedia'}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-purple-900/30">
                <button
                  onClick={() => onSelectTicket(ticket)}
                  className="px-3 py-1.5 text-xs font-bold text-[#5B35B1] dark:text-purple-300 hover:underline cursor-pointer"
                >
                  Lihat Detail WO
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onOpenWhatsAppModal(ticket)}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-purple-950/70 hover:bg-slate-200 dark:hover:bg-purple-900 text-xs font-bold text-[#21183A] dark:text-white transition-all cursor-pointer"
                  >
                    Pilih Template
                  </button>

                  <button
                    onClick={() => handleDirectWA(ticket)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Kirim WA</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
