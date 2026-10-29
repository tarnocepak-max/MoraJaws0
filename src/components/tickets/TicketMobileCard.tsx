import React from 'react';
import { Ticket } from '../../types/index.ts';
import { useUIConfig } from '../../context/UIConfigContext';
import { useApp } from '../../context/AppContext';
import { StatusAgentBadge, StatusInstallerBadge, StatusWhatsAppBadge } from '../common/Badge';
import {
  MessageSquare,
  MessageCircle,
  Eye,
  Phone,
  Clock,
  MapPin,
  User,
  Wrench,
  CheckSquare,
  Square,
  Calendar,
  Layers,
  ExternalLink
} from 'lucide-react';
import { openCustomerAddressInGoogleMaps } from '../../services/mapsService';

interface TicketMobileCardProps {
  ticket: Ticket;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onSelectTicket: (ticket: Ticket, defaultTab?: 'overview' | 'report' | 'chat' | 'history') => void;
  onOpenWhatsApp: (ticket: Ticket) => void;
}

export const TicketMobileCard: React.FC<TicketMobileCardProps> = ({
  ticket,
  isSelected,
  onToggleSelect,
  onSelectTicket,
  onOpenWhatsApp
}) => {
  const { config } = useUIConfig();
  const { currentUser, getTicketUnreadCount } = useApp();
  const androidConfig = config.device?.android || {
    touchTargetSize: 'comfortable',
    cardDensity: 'comfortable',
    showQuickCall: true,
    showQuickWhatsApp: true,
    showQuickDetail: true,
    highContrastBadges: true
  };

  const isComfortableTouch = androidConfig.touchTargetSize !== 'compact';
  const densityPadding =
    androidConfig.cardDensity === 'spacious'
      ? 'p-4 gap-3'
      : androidConfig.cardDensity === 'compact'
      ? 'p-2.5 gap-2'
      : 'p-3.5 gap-2.5';

  return (
    <div
      className={`rounded-2xl border-2 transition-all duration-150 flex flex-col bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden ${
        isSelected
          ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/20 dark:bg-indigo-950/20'
          : 'border-slate-300 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-600'
      } ${densityPadding}`}
    >
      {/* Top Bar: Checkbox + WO Number + Slot Time Badge */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => onToggleSelect(ticket.id)}
            className="p-1 -m-1 text-slate-400 hover:text-indigo-600 focus:outline-none min-w-[36px] min-h-[36px] flex items-center justify-center shrink-0"
            aria-label="Select ticket"
          >
            {isSelected ? (
              <CheckSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            ) : (
              <Square className="w-5 h-5" />
            )}
          </button>

          <button
            onClick={() => onSelectTicket(ticket)}
            className="text-left font-mono font-bold text-sm text-indigo-600 dark:text-indigo-400 hover:underline truncate"
            title="Buka Detail Tiket"
          >
            {ticket.woNumber}
          </button>
        </div>

        {/* Slot Time & Category */}
        <div className="flex items-center gap-1.5 shrink-0">
          {ticket.slotTime && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50 text-[11px] font-semibold">
              <Clock className="w-3 h-3" />
              <span>{ticket.slotTime}</span>
            </span>
          )}
          {ticket.ticketCategory && (
            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-medium uppercase">
              {ticket.ticketCategory}
            </span>
          )}
        </div>
      </div>

      {/* Customer & Location Details */}
      <div className="flex flex-col gap-2 text-xs">
        {/* Customer Information Section */}
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white text-sm">
                <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{ticket.customerName}</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate ml-5">
                Customer ID: <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{ticket.idCustomer}</span>
              </p>
            </div>

            {ticket.area && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[11px] shrink-0 font-semibold border border-indigo-200 dark:border-indigo-800/60">
                <MapPin className="w-3 h-3 text-indigo-600" />
                <span>{ticket.area}</span>
              </div>
            )}
          </div>

          {/* Nomor Telepon [Tombol WhatsApp] Right Beside */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
            <div className="flex items-center gap-1.5 font-mono text-slate-800 dark:text-slate-200">
              <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="font-semibold">{ticket.customerPhone || 'Tidak ada nomor'}</span>
            </div>

            {ticket.customerPhone && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenWhatsApp(ticket);
                }}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors shrink-0 cursor-pointer"
                title="Buka WhatsApp Pelanggan"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </button>
            )}
          </div>
        </div>

        {/* Address & Location with Google Maps Interactive Click */}
        {(ticket.streetName || ticket.clusterName || ticket.area) && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              openCustomerAddressInGoogleMaps(ticket);
            }}
            className="group cursor-pointer p-2.5 rounded-xl border border-[#D8CCF3] dark:border-[#3B1D78] bg-[#F5F1FF]/80 dark:bg-[#251247]/60 hover:bg-[#E9E1FF] dark:hover:bg-[#3B1D78]/60 transition-all shadow-2xs"
            title="Klik alamat untuk membuka Google Maps"
          >
            <div className="flex items-start justify-between gap-1.5">
              <div className="flex items-start gap-1.5 min-w-0 flex-1">
                <MapPin className="w-3.5 h-3.5 text-[#5B35B1] dark:text-[#8064D9] shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#756B8D] dark:text-[#D8CCF3]">
                    Alamat & Lokasi
                  </div>
                  <div className="font-bold text-[#3B1D78] dark:text-[#E9E1FF] text-[11.5px] truncate mt-0.5">
                    {ticket.clusterName ? `[${ticket.clusterName}] ` : ''}{ticket.streetName || ticket.area || 'Alamat Pelanggan'}
                  </div>
                  {ticket.streetAlternatif && (
                    <div className="text-[10.5px] text-[#756B8D] dark:text-[#D8CCF3] truncate mt-0.5">
                      Patokan: {ticket.streetAlternatif}
                    </div>
                  )}
                </div>
              </div>
              <span className="text-[10px] text-[#5B35B1] dark:text-[#E9E1FF] font-bold bg-white/80 dark:bg-[#1b0d3a] px-2 py-0.5 rounded-md border border-[#D8CCF3] dark:border-[#3B1D78] shrink-0 flex items-center gap-1 shadow-2xs">
                <span>Maps</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </span>
            </div>
            <div className="text-[9.5px] text-[#8064D9] dark:text-[#D8CCF3] font-medium mt-1 pl-5">
              Klik alamat untuk membuka Google Maps ↗
            </div>
          </div>
        )}

        {/* Appointment Date & Slot Time Schedule */}
        <div className="flex items-center justify-between text-xs pt-1">
          <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
            <Calendar className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span className="text-[11px] text-slate-500">Appointment Date:</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">{ticket.appointmentDate || ticket.date}</span>
          </div>
          {ticket.slotTime && (
            <span className="font-mono text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
              {ticket.slotTime}
            </span>
          )}
        </div>

        {/* Assigned Installer Info */}
        <div className="flex items-center justify-between text-xs pt-1">
          <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
            <Wrench className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] text-slate-500">Teknisi:</span>
            {ticket.installerName ? (
              <span className="font-semibold text-slate-900 dark:text-white">{ticket.installerName}</span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400 font-semibold italic text-[11px]">
                Belum Ditugaskan
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 text-[11px] text-slate-400">
            <Calendar className="w-3 h-3" />
            <span>{ticket.date}</span>
          </div>
        </div>

        {/* Status Badges Group */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <StatusWhatsAppBadge status={ticket.statusWhatsApp} />
          <StatusInstallerBadge status={ticket.statusWOInstaller} />
          <StatusAgentBadge status={ticket.statusWOAgent} />
        </div>
      </div>

      {/* Bottom Action Dock: Responsive [Chat] [Telepon] on Row 1, [Detail WO] on Row 2 (No duplicate WhatsApp URL) */}
      <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-[#D8CCF3] dark:border-[#3B1D78] mt-1">
        {/* Chat Action with Unread Badge */}
        {(() => {
          const unread = getTicketUnreadCount(ticket.id);
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectTicket(ticket, 'chat');
              }}
              className={`flex items-center justify-center gap-1.5 px-3 rounded-xl font-bold border transition-colors cursor-pointer shadow-2xs ${
                unread > 0
                  ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-900'
                  : 'bg-[#E9E1FF] dark:bg-[#3B1D78]/60 text-[#3B1D78] dark:text-[#E9E1FF] border-[#D8CCF3] dark:border-[#5B35B1] hover:bg-[#D8CCF3]'
              } ${isComfortableTouch ? 'py-2.5 text-xs min-h-[44px]' : 'py-1.5 text-[11px]'}`}
              title={unread > 0 ? `${unread} Chat Belum Dibaca` : 'Buka Live Chat'}
            >
              <MessageCircle className="w-4 h-4 shrink-0 text-[#5B35B1] dark:text-[#E9E1FF]" />
              <span>Chat</span>
              {unread > 0 && (
                <span className="px-1.5 py-0.2 bg-rose-600 text-white text-[10px] font-bold rounded-full">
                  {unread}
                </span>
              )}
            </button>
          );
        })()}

        {/* Call Customer Direct Action (Phone Call) */}
        {ticket.customerPhone ? (
          <a
            href={`tel:${ticket.customerPhone}`}
            onClick={(e) => e.stopPropagation()}
            className={`flex items-center justify-center gap-1.5 px-3 rounded-xl font-bold bg-[#E9E1FF] dark:bg-[#3B1D78]/60 text-[#3B1D78] dark:text-[#E9E1FF] border border-[#D8CCF3] dark:border-[#5B35B1] hover:bg-[#D8CCF3] transition-colors cursor-pointer shadow-2xs ${
              isComfortableTouch ? 'py-2.5 text-xs min-h-[44px]' : 'py-1.5 text-[11px]'
            }`}
            title={`Telepon ${ticket.customerPhone}`}
          >
            <Phone className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Panggil</span>
          </a>
        ) : (
          <div className="flex items-center justify-center text-slate-400 text-xs py-2 bg-slate-100 dark:bg-slate-800 rounded-xl">
            Telepon -
          </div>
        )}

        {/* View / Edit Detail Action (Spans full width across 2 columns for comfortable touch) */}
        <button
          type="button"
          onClick={() => onSelectTicket(ticket, 'overview')}
          className={`col-span-2 flex items-center justify-center gap-1.5 rounded-xl font-bold text-white bg-[#3B1D78] hover:bg-[#5B35B1] active:bg-[#291456] transition-all shadow-md shadow-[#3B1D78]/20 cursor-pointer ${
            isComfortableTouch ? 'py-2.5 text-xs min-h-[44px]' : 'py-2 text-[11px]'
          }`}
          title="Buka Detail & Penugasan WO"
        >
          <Eye className="w-4 h-4 shrink-0" />
          <span>Detail WO</span>
        </button>
      </div>
    </div>
  );
};
