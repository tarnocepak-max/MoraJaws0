import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Ticket } from '../../types';
import {
  Calendar as CalendarIcon,
  Clock,
  Filter,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  UserCheck,
  Building2,
  MapPin,
  CheckCircle2,
  CalendarDays,
  List,
  Eye,
  Phone,
  RotateCcw
} from 'lucide-react';
import {
  formatAppointmentDateDisplay,
  parseAppointmentDate,
  getJakartaDateString,
  getJakartaDateParts,
  getTicketAppointmentDate
} from '../../services/appointmentDateParser';
import { StatusInstallerBadge, StatusAgentBadge } from '../common/Badge';

interface ScheduleCalendarViewProps {
  onSelectTicket: (ticket: Ticket) => void;
  onOpenWhatsApp?: (ticket: Ticket) => void;
}

export const ScheduleCalendarView: React.FC<ScheduleCalendarViewProps> = ({
  onSelectTicket,
  onOpenWhatsApp
}) => {
  const { tickets, contractors, users, currentUser } = useApp();

  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month' | 'list'>('day');
  const [selectedDate, setSelectedDate] = useState<string>(() => getJakartaDateString(0));
  const [slotFilter, setSlotFilter] = useState('ALL');
  const [areaFilter, setAreaFilter] = useState('ALL');
  const [contractorFilter, setContractorFilter] = useState('ALL');
  const [installerFilter, setInstallerFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const STANDARD_SLOTS = [
    '09:00 - 11:00 WIB',
    '11:00 - 13:00 WIB',
    '13:00 - 15:00 WIB',
    '15:00 - 17:00 WIB'
  ];

  // Scoped tickets based on user role
  const scopedTickets = useMemo(() => {
    return (tickets || []).filter(t => {
      if (!t || t.isArchived || t.isDeleted) return false;
      if (currentUser?.role === 'super_admin' || currentUser?.role === 'dispatch') return true;
      if (currentUser?.role === 'leader') {
        const cName = (t.contactorName || t.contractorName || '').toLowerCase();
        return !currentUser.contractor || cName === (currentUser.contractor || '').toLowerCase();
      }
      if (currentUser?.role === 'installer') {
        return (t.installerName || '').toLowerCase() === (currentUser?.name || '').toLowerCase();
      }
      return true;
    });
  }, [tickets, currentUser]);

  // Unique areas
  const areas = useMemo(() => {
    const set = new Set<string>();
    scopedTickets.forEach(t => { if (t?.area) set.add(t.area); });
    return Array.from(set);
  }, [scopedTickets]);

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return (scopedTickets || []).filter(t => {
      if (!t) return false;
      if (slotFilter !== 'ALL' && !(t.slotTime || '').includes(slotFilter.slice(0, 5))) return false;
      if (areaFilter !== 'ALL' && t.area !== areaFilter) return false;
      if (contractorFilter !== 'ALL') {
        const c = t.contactorName || t.contractorName || '';
        if (c !== contractorFilter) return false;
      }
      if (installerFilter !== 'ALL') {
        if ((t.installerName || '') !== installerFilter) return false;
      }
      if (statusFilter !== 'ALL') {
        if (t.statusWOInstaller !== statusFilter && t.statusWOAgent !== statusFilter) return false;
      }
      if (searchQuery && typeof searchQuery === 'string' && searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const m1 = (t.woNumber ? String(t.woNumber).toLowerCase() : '').includes(q);
        const m2 = (t.customerName ? String(t.customerName).toLowerCase() : '').includes(q);
        const m3 = (t.idCustomer || t.customerId || '').toLowerCase().includes(q);
        const m4 = (t.installerName || '').toLowerCase().includes(q);
        if (!m1 && !m2 && !m3 && !m4) return false;
      }
      return true;
    });
  }, [scopedTickets, slotFilter, areaFilter, contractorFilter, installerFilter, statusFilter, searchQuery]);

  // Day view tickets (matching selectedDate)
  const dayTickets = useMemo(() => {
    return filteredTickets.filter(t => {
      const raw = t.appointmentDate || t.date || '';
      const parsed = parseAppointmentDate(raw);
      const d = parsed.date || (raw.length >= 10 ? raw.slice(0, 10) : raw.trim());
      return d === selectedDate;
    });
  }, [filteredTickets, selectedDate]);

  // Unscheduled tickets
  const unscheduledTickets = useMemo(() => {
    return filteredTickets.filter(t => {
      const parsed = parseAppointmentDate(t.appointmentDate);
      return parsed.isEmpty || !parsed.date;
    });
  }, [filteredTickets]);

  // Overdue tickets check
  const isOverdue = (t: Ticket): boolean => {
    const raw = t.appointmentDate || t.date || '';
    const parsed = parseAppointmentDate(raw);
    const d = parsed.date;
    if (!d) return false;
    const isCompleted = t.statusWOInstaller === 'Completed' || t.statusWOAgent === 'Closed' || t.statusWOAgent === 'Resolved';
    if (isCompleted) return false;
    return d < getJakartaDateString(0);
  };

  const handlePrevDay = () => {
    try {
      const cur = new Date(selectedDate);
      cur.setDate(cur.getDate() - 1);
      setSelectedDate(cur.toISOString().split('T')[0]);
    } catch {}
  };

  const handleNextDay = () => {
    try {
      const cur = new Date(selectedDate);
      cur.setDate(cur.getDate() + 1);
      setSelectedDate(cur.toISOString().split('T')[0]);
    } catch {}
  };

  return (
    <div className="space-y-5">
      {/* Top Banner */}
      <div className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#5B35B1] text-white flex items-center justify-center font-bold shadow-xs">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#3B1D78] dark:text-purple-200 flex items-center gap-2">
              <span>Jadwal Appointment & Manajemen Kalender Work Order</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E9E1FF] text-[#3B1D78] dark:bg-purple-900/60 dark:text-purple-200">
                WIB (Asia/Jakarta)
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Jadwal dihitung presisi berdasarkan Appointment Date resmi dari data impor. Tidak tertukar dengan tanggal upload atau tanggal lapor.
            </p>
          </div>
        </div>
        {/* View Switcher: Day, Week, Month, List */}
        <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('day')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              viewMode === 'day' ? 'bg-[#5B35B1] text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Harian
          </button>
          <button
            type="button"
            onClick={() => setViewMode('week')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              viewMode === 'week' ? 'bg-[#5B35B1] text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Mingguan
          </button>
          <button
            type="button"
            onClick={() => setViewMode('month')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              viewMode === 'month' ? 'bg-[#5B35B1] text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Bulanan
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              viewMode === 'list' ? 'bg-[#5B35B1] text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Daftar Agenda
          </button>
        </div>
      </div>

      {/* Date Navigation & Filters Toolbar */}
      <div className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 p-4 shadow-xs space-y-3 text-xs">
        {/* Navigation Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E9E1FF] dark:border-purple-900/40">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevDay}
              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
              title="Hari Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-3 py-1 bg-[#F5F1FF] dark:bg-[#251545] border border-[#D8CCF3] dark:border-purple-800 rounded-xl font-bold font-mono text-sm text-[#3B1D78] dark:text-purple-200">
              {formatAppointmentDateDisplay(selectedDate)}
            </div>
            <button
              type="button"
              onClick={handleNextDay}
              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
              title="Hari Berikutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(getJakartaDateString(0))}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg cursor-pointer transition-colors ${
                selectedDate === getJakartaDateString(0)
                  ? 'bg-[#5B35B1] text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              Hari Ini ({getJakartaDateParts(0).labelShort})
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(getJakartaDateString(1))}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg cursor-pointer transition-colors ${
                selectedDate === getJakartaDateString(1)
                  ? 'bg-[#5B35B1] text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              Besok ({getJakartaDateParts(1).labelShort})
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(getJakartaDateString(2))}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg cursor-pointer transition-colors ${
                selectedDate === getJakartaDateString(2)
                  ? 'bg-[#5B35B1] text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              Lusa ({getJakartaDateParts(2).labelShort})
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-mono">
              Total Tiket Jadwal Ini: <strong className="text-[#5B35B1] font-bold">{dayTickets.length}</strong> WO
            </span>
          </div>
        </div>

        {/* Filters Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          <div className="relative col-span-1 sm:col-span-2">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari WO, ID, Nama, Teknisi..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
            />
          </div>
          <select
            value={slotFilter}
            onChange={e => setSlotFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
          >
            <option value="ALL">Semua Slot Waktu</option>
            {STANDARD_SLOTS.map(slot => (
              <option key={slot} value={slot}>{slot}</option>
            ))}
          </select>
          <select
            value={areaFilter}
            onChange={e => setAreaFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
          >
            <option value="ALL">Semua Area</option>
            {areas.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <select
            value={contractorFilter}
            onChange={e => setContractorFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
          >
            <option value="ALL">Semua Kontraktor</option>
            {contractors.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
          >
            <option value="ALL">Semua Status</option>
            <option value="Assigned">Assigned</option>
            <option value="En Route">En Route</option>
            <option value="On Site">On Site</option>
            <option value="Completed">Completed</option>
            <option value="Pending Technical">Pending Technical</option>
          </select>
        </div>
      </div>

      {/* Date Difference Clarification Pill (Strict TAHAP 7 requirement) */}
      <div className="p-3 bg-purple-50 dark:bg-purple-950/40 rounded-xl border border-purple-200 dark:border-purple-800/80 text-[11px] text-purple-900 dark:text-purple-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-[#5B35B1] shrink-0" />
          <span>
            <strong>Pembedaan Tanggal:</strong> Kalender ini murni merefleksikan <strong>Appointment Date</strong> resmi pelanggan.
            Field Date Upload, Date Assign Agent, dan Tanggal Laporan dipertahankan sebagai atribut histori audit terpisah.
          </span>
        </div>
        {unscheduledTickets.length > 0 && (
          <span className="px-2.5 py-1 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 font-bold rounded-lg shrink-0">
            {unscheduledTickets.length} Belum Ada Jadwal
          </span>
        )}
      </div>

      {/* Main Schedule View Body */}
      {viewMode === 'day' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {STANDARD_SLOTS.map(slot => {
              const slotKey = slot.slice(0, 5);
              const slotTickets = dayTickets.filter(t => (t.slotTime || '').includes(slotKey));
              return (
                <div
                  key={slot}
                  className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 p-4 shadow-xs space-y-3 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between border-b border-[#E9E1FF] dark:border-purple-900/40 pb-2">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-[#3B1D78] dark:text-purple-200">
                      <Clock className="w-3.5 h-3.5 text-[#5B35B1]" />
                      <span>{slot}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E9E1FF] text-[#3B1D78] dark:bg-[#3B1D78] dark:text-white font-mono">
                      {slotTickets.length} WO
                    </span>
                  </div>

                  <div className="space-y-2 flex-1 overflow-y-auto max-h-96">
                    {slotTickets.length === 0 ? (
                      <div className="py-8 text-center text-slate-400 text-[11px] italic">
                        Tidak ada WO pada slot ini.
                      </div>
                    ) : (
                      slotTickets.map(t => {
                        const overdue = isOverdue(t);
                        return (
                          <div
                            key={t.id}
                            className={`p-3 rounded-xl border transition-all space-y-1.5 ${
                              overdue
                                ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-300 dark:border-rose-900'
                                : 'bg-[#F5F1FF]/60 dark:bg-[#251545]/40 border-[#D8CCF3] dark:border-purple-800/60'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span
                                onClick={() => onSelectTicket(t)}
                                className="font-mono font-bold text-xs text-[#5B35B1] dark:text-purple-300 hover:underline cursor-pointer"
                              >
                                {t.woNumber}
                              </span>
                              {overdue && (
                                <span className="px-1.5 py-0.2 bg-rose-600 text-white rounded text-[9.5px] font-bold">
                                  OVERDUE
                                </span>
                              )}
                            </div>
                            <div className="font-bold text-xs text-slate-900 dark:text-white truncate">
                              {t.customerName}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {t.clusterName || t.area}
                            </div>
                            <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 dark:border-slate-700/60 text-[10.5px]">
                              <span>Teknisi: <strong>{t.installerName || 'Unassigned'}</strong></span>
                              <StatusInstallerBadge status={t.statusWOInstaller} />
                            </div>
                            <div className="flex items-center justify-end gap-1 pt-1">
                              <button
                                type="button"
                                onClick={() => onSelectTicket(t)}
                                className="px-2 py-0.5 bg-white dark:bg-slate-800 text-[#5B35B1] rounded text-[10.5px] font-bold border border-slate-200 dark:border-slate-700"
                              >
                                Detail
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* List View / Agenda View */}
      {(viewMode === 'list' || viewMode === 'week' || viewMode === 'month') && (
        <div className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 p-5 shadow-xs space-y-3 text-xs">
          <div className="flex items-center justify-between pb-2 border-b">
            <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">
              Daftar Agenda Jadwal Appointment ({filteredTickets.length} WO)
            </span>
            <span className="text-slate-400 font-mono text-[11px]">Format Agenda Terstruktur</span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredTickets.map(t => {
              const overdue = isOverdue(t);
              const parsed = parseAppointmentDate(t.appointmentDate);
              return (
                <div key={t.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 p-2 rounded-xl transition-colors">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        onClick={() => onSelectTicket(t)}
                        className="font-mono font-bold text-xs text-[#5B35B1] hover:underline cursor-pointer"
                      >
                        {t.woNumber}
                      </span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{t.customerName}</span>
                      {overdue && (
                        <span className="px-2 py-0.5 bg-rose-600 text-white rounded text-[10px] font-bold">
                          Overdue
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                      <span>Appointment: <strong className="text-purple-700 dark:text-purple-300 font-medium">{formatAppointmentDateDisplay(t.appointmentDate)}</strong></span>
                      <span>Slot: <strong className="text-slate-800 dark:text-slate-200">{t.slotTime}</strong></span>
                      <span>Area: {t.area}</span>
                      <span>Mitra: {t.contactorName || t.contractorName}</span>
                      <span>Teknisi: <strong className="text-emerald-600">{t.installerName || 'Belum Di-assign'}</strong></span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    <StatusInstallerBadge status={t.statusWOInstaller} />
                    <button
                      type="button"
                      onClick={() => onSelectTicket(t)}
                      className="px-3 py-1 bg-[#5B35B1] hover:bg-[#3B1D78] text-white rounded-lg font-bold text-xs shadow-xs"
                    >
                      Buka WO
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
