import React, { useState } from 'react';
import {
  Search,
  Filter,
  X,
  RotateCcw,
  SlidersHorizontal,
  ChevronDown,
  Building2,
  MapPin,
  CheckCircle,
  Clock,
  Sparkles
} from 'lucide-react';

interface SidebarFiltersProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  selectedAgentStatus: string;
  onAgentStatusChange: (status: string) => void;
  selectedInstallerStatus: string;
  onInstallerStatusChange: (status: string) => void;
  selectedArea: string;
  onAreaChange: (area: string) => void;
  selectedContractor?: string;
  onContractorChange?: (contractor: string) => void;
  availableAreas?: string[];
  availableContractors?: string[];
  onResetFilters: () => void;
  isMobileDrawer?: boolean;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  totalFilteredCount?: number;
}

export const SidebarFilters: React.FC<SidebarFiltersProps> = ({
  searchTerm,
  onSearchChange,
  selectedAgentStatus,
  onAgentStatusChange,
  selectedInstallerStatus,
  onInstallerStatusChange,
  selectedArea,
  onAreaChange,
  selectedContractor = 'ALL',
  onContractorChange,
  availableAreas = [],
  availableContractors = [],
  onResetFilters,
  isMobileDrawer = false,
  isOpenMobile = false,
  onCloseMobile,
  totalFilteredCount
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const hasActiveFilters =
    searchTerm.trim().length > 0 ||
    selectedAgentStatus !== 'ALL' ||
    selectedInstallerStatus !== 'ALL' ||
    selectedArea !== 'ALL' ||
    selectedContractor !== 'ALL';

  const content = (
    <div className="space-y-4 text-xs">
      {/* Search Bar */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Pencarian Cepat
        </label>
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="No WO, Nama, HP, Cluster..."
            className="w-full pl-8 pr-7 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 text-xs focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
          {searchTerm && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Status Agent Filter */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Status WO Agent
        </label>
        <select
          value={selectedAgentStatus}
          onChange={e => onAgentStatusChange(e.target.value)}
          className="w-full py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
        >
          <option value="ALL">Semua Status Agent</option>
          <option value="Pending">Pending</option>
          <option value="Assigned">Assigned</option>
          <option value="In Progress">In Progress</option>
          <option value="Resolved">Resolved</option>
          <option value="Cancelled">Cancelled</option>
          <option value="Closed">Closed</option>
        </select>
      </div>

      {/* Status Installer Filter */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Status WO Installer
        </label>
        <select
          value={selectedInstallerStatus}
          onChange={e => onInstallerStatusChange(e.target.value)}
          className="w-full py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
        >
          <option value="ALL">Semua Status Installer</option>
          <option value="Unassigned">Unassigned (Belum Ditugaskan)</option>
          <option value="Assigned">Assigned (Ditugaskan)</option>
          <option value="En Route">En Route (Menuju Lokasi)</option>
          <option value="On Site">On Site (Di Lokasi)</option>
          <option value="In Progress">In Progress</option>
          <option value="Completed">Completed (Selesai)</option>
          <option value="Failed / Cancelled">Gagal / Dibatalkan</option>
        </select>
      </div>

      {/* Area Coverage Filter */}
      {availableAreas.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-indigo-500" />
            <span>Wilayah / Area</span>
          </label>
          <select
            value={selectedArea}
            onChange={e => onAreaChange(e.target.value)}
            className="w-full py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
          >
            <option value="ALL">Semua Wilayah</option>
            {availableAreas.map(a => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Contractor / Vendor Filter */}
      {availableContractors.length > 0 && onContractorChange && (
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-indigo-500" />
            <span>Vendor / Kontraktor</span>
          </label>
          <select
            value={selectedContractor}
            onChange={e => onContractorChange(e.target.value)}
            className="w-full py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
          >
            <option value="ALL">Semua Mitra Kontraktor</option>
            {availableContractors.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Reset Button */}
      {hasActiveFilters && (
        <div className="pt-2">
          <button
            type="button"
            onClick={onResetFilters}
            className="w-full py-2 px-3 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900/60 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Semua Filter</span>
          </button>
        </div>
      )}

      {totalFilteredCount !== undefined && (
        <div className="text-center pt-1 text-[11px] text-slate-400 font-mono">
          Hasil: {totalFilteredCount} WO ditemukan
        </div>
      )}
    </div>
  );

  // If mobile drawer mode
  if (isMobileDrawer) {
    if (!isOpenMobile) return null;
    return (
      <div className="fixed inset-0 z-[95] bg-slate-950/70 backdrop-blur-xs flex justify-end animate-in fade-in">
        <div className="w-80 max-w-[calc(100vw-2rem)] h-full bg-white dark:bg-[#160D29] border-l border-[#D8CCF3] dark:border-[#35105E] shadow-2xl flex flex-col p-4 overflow-y-auto">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-4">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
              <span className="font-bold text-sm text-slate-800 dark:text-slate-100">Filter Tiket WO</span>
            </div>
            <button
              onClick={onCloseMobile}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {content}
        </div>
      </div>
    );
  }

  // Desktop Card Mode
  return (
    <div className="bg-white dark:bg-[#1a0f30] rounded-2xl border-2 border-[#D8CCF3] dark:border-[#3B1D78] p-4 shadow-xs space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-[#5B35B1] dark:text-purple-400" />
          <h3 className="font-bold text-xs uppercase tracking-wider text-[#3B1D78] dark:text-purple-200">
            Filter & Pencarian
          </h3>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-slate-400 hover:text-slate-600 p-1"
        >
          <ChevronDown className={`w-4 h-4 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {isExpanded && content}
    </div>
  );
};
