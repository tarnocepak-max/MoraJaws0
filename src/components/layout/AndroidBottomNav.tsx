import React from 'react';
import { useApp } from '../../context/AppContext';
import { useUIConfig } from '../../context/UIConfigContext';
import {
  LayoutDashboard,
  Ticket as TicketIcon,
  FileSpreadsheet,
  MessageSquareQuote,
  Menu,
  Sliders,
  X
} from 'lucide-react';

interface AndroidBottomNavProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
  onToggleMenu: () => void;
  isMenuOpen: boolean;
}

export const AndroidBottomNav: React.FC<AndroidBottomNavProps> = ({
  activeTab,
  onNavigate,
  onToggleMenu,
  isMenuOpen
}) => {
  const { tickets, currentUser } = useApp();
  const { config } = useUIConfig();

  const totalActiveTickets = tickets.filter(t => !t.isArchived).length;
  const isSuperOrDispatch = currentUser.role === 'super_admin' || currentUser.role === 'dispatch';

  const touchSizeClass = 
    config.device?.android?.touchTargetSize === 'large'
      ? 'h-16 py-2.5 text-[11px]'
      : config.device?.android?.touchTargetSize === 'compact'
      ? 'h-13 py-1 text-[10px]'
      : 'h-14 py-1.5 text-[10.5px]';

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="fixed bottom-0 inset-x-0 z-35 bg-white/95 dark:bg-[#1a0f30]/95 backdrop-blur-md border-t border-[#D8CCF3] dark:border-[#3B1D78] shadow-[0_-4px_20px_rgba(59,29,120,0.08)] md:hidden transition-all duration-200"
    >
      <div className={`flex items-center justify-around px-2 ${touchSizeClass}`}>
        {/* Tab 1: Dashboard */}
        <button
          onClick={() => onNavigate('dashboard')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors min-w-[56px] min-h-[44px] cursor-pointer ${
            activeTab === 'dashboard'
              ? 'text-[#3B1D78] dark:text-[#E9E1FF] font-bold'
              : 'text-[#756B8D] dark:text-[#D8CCF3] hover:text-[#5B35B1]'
          }`}
        >
          <LayoutDashboard className="w-5 h-5 shrink-0" />
          <span className="truncate">Dashboard</span>
        </button>

        {/* Tab 2: Tickets with Badge */}
        <button
          onClick={() => onNavigate('tickets')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors min-w-[56px] min-h-[44px] relative cursor-pointer ${
            activeTab === 'tickets'
              ? 'text-[#3B1D78] dark:text-[#E9E1FF] font-bold'
              : 'text-[#756B8D] dark:text-[#D8CCF3] hover:text-[#5B35B1]'
          }`}
        >
          <div className="relative">
            <TicketIcon className="w-5 h-5 shrink-0" />
            {totalActiveTickets > 0 && (
              <span className="absolute -top-1.5 -right-2 px-1 py-0.2 min-w-[16px] text-center bg-[#5B35B1] text-white rounded-full text-[9px] font-bold leading-tight shadow-xs">
                {totalActiveTickets > 99 ? '99+' : totalActiveTickets}
              </span>
            )}
          </div>
          <span className="truncate">Ticket MyRep</span>
        </button>

        {/* Tab 3: Text To Table (or Leader/Teknisi depending on role) */}
        {isSuperOrDispatch ? (
          <button
            onClick={() => onNavigate('import')}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors min-w-[56px] min-h-[44px] cursor-pointer ${
              activeTab === 'import'
                ? 'text-[#3B1D78] dark:text-[#E9E1FF] font-bold'
                : 'text-[#756B8D] dark:text-[#D8CCF3] hover:text-[#5B35B1]'
            }`}
          >
            <FileSpreadsheet className="w-5 h-5 shrink-0" />
            <span className="truncate">Import WO</span>
          </button>
        ) : currentUser.role === 'leader' ? (
          <button
            onClick={() => onNavigate('leader_portal')}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors min-w-[56px] min-h-[44px] cursor-pointer ${
              activeTab === 'leader_portal'
                ? 'text-[#3B1D78] dark:text-[#E9E1FF] font-bold'
                : 'text-[#756B8D] dark:text-[#D8CCF3] hover:text-[#5B35B1]'
            }`}
          >
            <TicketIcon className="w-5 h-5 shrink-0" />
            <span className="truncate">Dashboard Leader</span>
          </button>
        ) : (
          <button
            onClick={() => onNavigate('installer_portal')}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors min-w-[56px] min-h-[44px] cursor-pointer ${
              activeTab === 'installer_portal'
                ? 'text-[#3B1D78] dark:text-[#E9E1FF] font-bold'
                : 'text-[#756B8D] dark:text-[#D8CCF3] hover:text-[#5B35B1]'
            }`}
          >
            <TicketIcon className="w-5 h-5 shrink-0" />
            <span className="truncate">Tugas Saya</span>
          </button>
        )}

        {/* Tab 4: WhatsApp Templates */}
        <button
          onClick={() => onNavigate('templates')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors min-w-[56px] min-h-[44px] cursor-pointer ${
            activeTab === 'templates'
              ? 'text-[#3B1D78] dark:text-[#E9E1FF] font-bold'
              : 'text-[#756B8D] dark:text-[#D8CCF3] hover:text-[#5B35B1]'
          }`}
        >
          <MessageSquareQuote className="w-5 h-5 shrink-0" />
          <span className="truncate">WhatsApp</span>
        </button>

        {/* Tab 5: Menu Drawer Toggle */}
        <button
          onClick={onToggleMenu}
          className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors min-w-[56px] min-h-[44px] cursor-pointer ${
            isMenuOpen
              ? 'text-rose-600 dark:text-rose-400 font-bold'
              : 'text-[#756B8D] dark:text-[#D8CCF3] hover:text-[#5B35B1]'
          }`}
        >
          {isMenuOpen ? <X className="w-5 h-5 shrink-0" /> : <Menu className="w-5 h-5 shrink-0" />}
          <span className="truncate">{isMenuOpen ? 'Tutup' : 'Menu'}</span>
        </button>
      </div>
    </nav>
  );
};
