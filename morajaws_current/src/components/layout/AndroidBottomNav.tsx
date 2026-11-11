import React from 'react';
import { useApp } from '../../context/AppContext';
import { useUIConfig } from '../../context/UIConfigContext';
import {
  LayoutDashboard,
  Ticket as TicketIcon,
  FileSpreadsheet,
  MessageSquareQuote,
  Menu,
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
      className="fixed bottom-0 inset-x-0 z-35 bg-[#FFFFFF] border-t border-[#E9E1F0] shadow-[0_-4px_20px_rgba(0,0,0,0.06)] md:hidden transition-all duration-200"
    >
      <div className={`flex items-center justify-around px-2 ${touchSizeClass}`}>
        {/* Tab 1: Dashboard */}
        <button
          onClick={() => onNavigate('dashboard')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all min-w-[56px] min-h-[44px] rounded-xl cursor-pointer relative ${
            activeTab === 'dashboard'
              ? 'bg-[#F3EDFA] text-[#6F35A5] font-bold'
              : 'text-[#8B8495] hover:text-[#6F35A5] hover:bg-[#F9F6FC]'
          }`}
        >
          {activeTab === 'dashboard' && (
            <div className="absolute top-0.5 inset-x-3 h-0.5 bg-[#8B4BC1] rounded-full" />
          )}
          <LayoutDashboard className={`w-5 h-5 shrink-0 ${activeTab === 'dashboard' ? 'text-[#6F35A5]' : 'text-[#8B8495]'}`} />
          <span className={`truncate text-[10px] ${activeTab === 'dashboard' ? 'text-[#6F35A5] font-bold' : 'text-[#8B8495]'}`}>
            Dashboard
          </span>
        </button>

        {/* Tab 2: Tickets with Badge */}
        <button
          onClick={() => onNavigate('tickets')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all min-w-[56px] min-h-[44px] relative rounded-xl cursor-pointer ${
            activeTab === 'tickets'
              ? 'bg-[#F3EDFA] text-[#6F35A5] font-bold'
              : 'text-[#8B8495] hover:text-[#6F35A5] hover:bg-[#F9F6FC]'
          }`}
        >
          {activeTab === 'tickets' && (
            <div className="absolute top-0.5 inset-x-3 h-0.5 bg-[#8B4BC1] rounded-full" />
          )}
          <div className="relative">
            <TicketIcon className={`w-5 h-5 shrink-0 ${activeTab === 'tickets' ? 'text-[#6F35A5]' : 'text-[#8B8495]'}`} />
            {totalActiveTickets > 0 && (
              <span className="absolute -top-1.5 -right-2 px-1 py-0.2 min-w-[16px] text-center bg-rose-500 text-white rounded-full text-[9px] font-bold leading-tight shadow-xs">
                {totalActiveTickets > 99 ? '99+' : totalActiveTickets}
              </span>
            )}
          </div>
          <span className={`truncate text-[10px] ${activeTab === 'tickets' ? 'text-[#6F35A5] font-bold' : 'text-[#8B8495]'}`}>
            Tiket WO
          </span>
        </button>

        {/* Tab 3: Text To Table (or Leader/Teknisi depending on role) */}
        {isSuperOrDispatch ? (
          <button
            onClick={() => onNavigate('import')}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all min-w-[56px] min-h-[44px] rounded-xl cursor-pointer relative ${
              activeTab === 'import'
                ? 'bg-[#F3EDFA] text-[#6F35A5] font-bold'
                : 'text-[#8B8495] hover:text-[#6F35A5] hover:bg-[#F9F6FC]'
            }`}
          >
            {activeTab === 'import' && (
              <div className="absolute top-0.5 inset-x-3 h-0.5 bg-[#8B4BC1] rounded-full" />
            )}
            <FileSpreadsheet className={`w-5 h-5 shrink-0 ${activeTab === 'import' ? 'text-[#6F35A5]' : 'text-[#8B8495]'}`} />
            <span className={`truncate text-[10px] ${activeTab === 'import' ? 'text-[#6F35A5] font-bold' : 'text-[#8B8495]'}`}>
              Import WO
            </span>
          </button>
        ) : currentUser.role === 'leader' ? (
          <button
            onClick={() => onNavigate('leader_portal')}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all min-w-[56px] min-h-[44px] rounded-xl cursor-pointer relative ${
              activeTab === 'leader_portal'
                ? 'bg-[#F3EDFA] text-[#6F35A5] font-bold'
                : 'text-[#8B8495] hover:text-[#6F35A5] hover:bg-[#F9F6FC]'
            }`}
          >
            {activeTab === 'leader_portal' && (
              <div className="absolute top-0.5 inset-x-3 h-0.5 bg-[#8B4BC1] rounded-full" />
            )}
            <TicketIcon className={`w-5 h-5 shrink-0 ${activeTab === 'leader_portal' ? 'text-[#6F35A5]' : 'text-[#8B8495]'}`} />
            <span className={`truncate text-[10px] ${activeTab === 'leader_portal' ? 'text-[#6F35A5] font-bold' : 'text-[#8B8495]'}`}>
              Dashboard
            </span>
          </button>
        ) : (
          <button
            onClick={() => onNavigate('installer_portal')}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all min-w-[56px] min-h-[44px] rounded-xl cursor-pointer relative ${
              activeTab === 'installer_portal'
                ? 'bg-[#F3EDFA] text-[#6F35A5] font-bold'
                : 'text-[#8B8495] hover:text-[#6F35A5] hover:bg-[#F9F6FC]'
            }`}
          >
            {activeTab === 'installer_portal' && (
              <div className="absolute top-0.5 inset-x-3 h-0.5 bg-[#8B4BC1] rounded-full" />
            )}
            <TicketIcon className={`w-5 h-5 shrink-0 ${activeTab === 'installer_portal' ? 'text-[#6F35A5]' : 'text-[#8B8495]'}`} />
            <span className={`truncate text-[10px] ${activeTab === 'installer_portal' ? 'text-[#6F35A5] font-bold' : 'text-[#8B8495]'}`}>
              Tugas Saya
            </span>
          </button>
        )}

        {/* Tab 4: REPORT DATA WO (SUPERADMIN & DISPATCH) */}
        {isSuperOrDispatch ? (
          <button
            onClick={() => onNavigate('report_data_wo')}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all min-w-[56px] min-h-[44px] rounded-xl cursor-pointer relative ${
              activeTab === 'report_data_wo'
                ? 'bg-[#F3EDFA] text-[#6F35A5] font-bold'
                : 'text-[#8B8495] hover:text-[#6F35A5] hover:bg-[#F9F6FC]'
            }`}
          >
            {activeTab === 'report_data_wo' && (
              <div className="absolute top-0.5 inset-x-3 h-0.5 bg-[#8B4BC1] rounded-full" />
            )}
            <FileSpreadsheet className={`w-5 h-5 shrink-0 ${activeTab === 'report_data_wo' ? 'text-[#6F35A5]' : 'text-[#8B8495]'}`} />
            <span className={`truncate text-[9.5px] font-semibold ${activeTab === 'report_data_wo' ? 'text-[#6F35A5] font-bold' : 'text-[#8B8495]'}`}>
              REPORT DATA WO
            </span>
          </button>
        ) : (
          <button
            onClick={() => onNavigate('contact_centre')}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all min-w-[56px] min-h-[44px] rounded-xl cursor-pointer relative ${
              activeTab === 'contact_centre'
                ? 'bg-[#F3EDFA] text-[#6F35A5] font-bold'
                : 'text-[#8B8495] hover:text-[#6F35A5] hover:bg-[#F9F6FC]'
            }`}
          >
            {activeTab === 'contact_centre' && (
              <div className="absolute top-0.5 inset-x-3 h-0.5 bg-[#8B4BC1] rounded-full" />
            )}
            <MessageSquareQuote className={`w-5 h-5 shrink-0 ${activeTab === 'contact_centre' ? 'text-[#6F35A5]' : 'text-[#8B8495]'}`} />
            <span className={`truncate text-[10px] ${activeTab === 'contact_centre' ? 'text-[#6F35A5] font-bold' : 'text-[#8B8495]'}`}>
              Chat WO
            </span>
          </button>
        )}

        {/* Tab 5: Menu Drawer Toggle */}
        <button
          onClick={onToggleMenu}
          className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all min-w-[56px] min-h-[44px] rounded-xl cursor-pointer relative ${
            isMenuOpen
              ? 'bg-rose-50 text-rose-600 font-bold border border-rose-200'
              : 'text-[#8B8495] hover:text-[#6F35A5] hover:bg-[#F9F6FC]'
          }`}
        >
          {isMenuOpen ? <X className="w-5 h-5 shrink-0" /> : <Menu className="w-5 h-5 shrink-0" />}
          <span className="truncate text-[10px]">{isMenuOpen ? 'Tutup' : 'Menu'}</span>
        </button>
      </div>
    </nav>
  );
};
