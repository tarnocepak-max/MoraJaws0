import React from 'react';
import { useApp } from '../../context/AppContext';
import { useUIConfig } from '../../context/UIConfigContext';
import { MoraJawsLogo } from '../common/MoraJawsLogo';
import {
  LayoutDashboard,
  FileSpreadsheet,
  Ticket as TicketIcon,
  Users2,
  Wrench,
  MessageSquareQuote,
  GitBranch,
  Sliders,
  History,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
  Minus,
  X,
  Maximize2,
  Users,
  RefreshCw,
  Database,
  Server,
  KeyRound,
  LogOut,
  Zap,
  Radio,
  BarChart3,
  Calendar,
  ListFilter,
  Activity,
  MessageSquare,
  ShieldCheck,
  Building2,
  UserCheck,
  RotateCcw
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
  sidebarState: 'expanded' | 'minimized' | 'closed';
  onChangeState: (state: 'expanded' | 'minimized' | 'closed') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onNavigate,
  sidebarState,
  onChangeState
}) => {
  const { currentUser, tickets, googleSheetsConfig, logout, setIsSessionModalOpen } = useApp();
  const { isMobileView, config, navigationItems, menuCategories } = useUIConfig();

  if (sidebarState === 'closed') {
    return null;
  }

  const isMinimized = sidebarState === 'minimized';
  const totalActiveTickets = tickets.filter(t => !t.isArchived).length;
  const unassignedCount = tickets.filter(t => !t.installerName && !t.isArchived).length;

  // Base catalog of navigation metadata
  const itemCatalog: Record<
    string,
    {
      label: string;
      icon: any;
      roles: string[];
      highlight?: boolean;
      badge?: string | number;
      badgeColor?: string;
    }
  > = {
    // Dispatch Management Group
    tickets: {
      label: 'TICKET MYREPUBLIC',
      icon: TicketIcon,
      badge: totalActiveTickets,
      roles: ['super_admin', 'dispatch']
    },
    form_sameday: {
      label: 'Form Sameday',
      icon: Zap,
      badge: 'Express',
      badgeColor: 'amber',
      roles: ['dispatch']
    },
    report_data_wo: {
      label: 'Report Data WO',
      icon: BarChart3,
      roles: ['super_admin', 'dispatch']
    },
    schedule: {
      label: 'Schedule',
      icon: Calendar,
      roles: ['super_admin', 'dispatch', 'leader']
    },
    login_logs: {
      label: 'Login Log',
      icon: KeyRound,
      roles: ['super_admin', 'dispatch', 'it_support']
    },
    setting_droplist: {
      label: 'Setting Droplist',
      icon: ListFilter,
      roles: ['super_admin', 'dispatch', 'it_support']
    },

    // Menu Leader Group
    leader_portal: {
      label: 'Dashboard Leader',
      icon: Users2,
      badge: unassignedCount > 0 ? `${unassignedCount} unassigned` : undefined,
      badgeColor: 'amber',
      roles: ['super_admin', 'leader']
    },
    location_basecamp: {
      label: 'Kontraktor & Basecamp',
      icon: Building2,
      roles: ['super_admin', 'leader']
    },

    // Portal Teknisi Group
    installer_portal: {
      label: 'Tugas Saya & Laporan',
      icon: Wrench,
      roles: ['super_admin', 'leader', 'installer']
    },

    // Menu Tambahan Group
    dashboard: {
      label: 'Dashboard Monitoring',
      icon: LayoutDashboard,
      roles: ['super_admin', 'dispatch', 'leader', 'management_data']
    },
    contact_centre: {
      label: 'Contact Centre',
      icon: MessageSquare,
      roles: ['super_admin', 'dispatch', 'leader', 'installer']
    },
    management_data_portal: {
      label: 'Management Data Portal',
      icon: Database,
      highlight: true,
      roles: ['super_admin', 'management_data']
    },
    database_sync: {
      label: 'Monitoring Sinkronisasi',
      icon: RefreshCw,
      badge: 'Live',
      badgeColor: 'emerald',
      roles: ['super_admin', 'management_data']
    },
    database_management: {
      label: 'Database Application',
      icon: Server,
      roles: ['super_admin', 'management_data']
    },
    import: {
      label: 'Import Data WO',
      icon: FileSpreadsheet,
      roles: ['super_admin', 'dispatch', 'management_data']
    },
    sheets_sync: {
      label: 'Google Sheets Sync',
      icon: RefreshCw,
      badge: googleSheetsConfig.enabled ? 'Auto' : undefined,
      badgeColor: 'emerald',
      roles: ['super_admin']
    },
    users: {
      label: 'Management User',
      icon: Users,
      roles: ['super_admin']
    },
    management_role: {
      label: 'Management Role',
      icon: ShieldCheck,
      roles: ['super_admin']
    },
    settings: {
      label: 'Field Mapping',
      icon: FileSpreadsheet,
      roles: ['super_admin', 'it_support']
    },
    ui_builder: {
      label: 'UI Configuration Builder',
      icon: Sliders,
      highlight: true,
      roles: ['super_admin', 'it_support']
    },
    audit_logs: {
      label: 'Audit Log & History',
      icon: History,
      roles: ['super_admin', 'it_support']
    },
    system_health: {
      label: 'System Health',
      icon: Activity,
      badge: 'Healthy',
      badgeColor: 'emerald',
      roles: ['super_admin', 'it_support']
    },
    templates: {
      label: 'WhatsApp Templates',
      icon: MessageSquareQuote,
      roles: ['super_admin', 'dispatch', 'leader']
    },
    workflows: {
      label: 'Workflow Automation',
      icon: GitBranch,
      roles: ['super_admin', 'dispatch']
    },
    offline_sync: {
      label: 'Sinkronisasi Offline',
      icon: Database,
      roles: ['super_admin', 'dispatch', 'leader', 'installer']
    }
  };

  // Merge dynamic navigationItems with itemCatalog and filter by user role and visibility
  const sortedNavItems = [...navigationItems].sort((a, b) => a.order - b.order);

  // Group items by category
  const categoriesToRender = (menuCategories && menuCategories.length > 0)
    ? menuCategories
    : ['Dispatch Management', 'Menu Leader', 'Portal Teknisi', 'Menu Tambahan'];

  const handleItemClick = (id: string) => {
    onNavigate(id);
    if (isMobileView || (typeof window !== 'undefined' && window.innerWidth < 768)) {
      if (config.device?.android?.autoCloseSidebarOnNavigate !== false) {
        onChangeState('closed');
      }
    }
  };

  return (
    <>
      {/* Mobile Backdrop when open on mobile */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-45 md:hidden"
        onClick={() => onChangeState('closed')}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 md:relative md:inset-auto md:z-auto bg-[#F5F1FF] dark:bg-[#160D29] border-r border-[#D8CCF3] dark:border-[#35105E] transition-all duration-200 flex flex-col shrink-0 shadow-2xl md:shadow-none h-full ${
          isMinimized ? 'w-16' : 'w-64'
        }`}
      >
      {/* Top Header of Sidebar: Menu title with Minimize (-) and Close (X) buttons */}
      <div className="px-3 py-2.5 border-b border-[#D8CCF3] dark:border-[#35105E] flex items-center justify-between text-xs">
        {!isMinimized ? (
          <>
            <div className="flex items-center gap-2">
              <MoraJawsLogo size="xs" animated={false} />
              <span className="font-bold text-[#756B8D] dark:text-[#D8B4FE] uppercase tracking-wider text-[11px]">
                Menu Navigasi
              </span>
            </div>
            <div className="flex items-center gap-1">
              {/* Minimize Button */}
              <button
                onClick={() => onChangeState('minimized')}
                className="p-1 text-[#756B8D] hover:text-[#21183A] dark:hover:text-white hover:bg-[#E9E1FF]/60 dark:hover:bg-[#3B1D78] rounded transition-colors cursor-pointer"
                title="Minimize Menu (Kecilkan ke Ikon)"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              {/* Close Button */}
              <button
                onClick={() => onChangeState('closed')}
                className="p-1 text-[#756B8D] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition-colors cursor-pointer"
                title="Tutup Menu (Sembunyikan Penuh)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        ) : (
          <div className="w-full flex items-center justify-center gap-1">
            {/* Expand Button */}
            <button
              onClick={() => onChangeState('expanded')}
              className="p-1 text-[#756B8D] hover:text-[#5B35B1] hover:bg-[#E9E1FF]/60 dark:hover:bg-[#3B1D78] rounded transition-colors cursor-pointer"
              title="Perbesar Menu (Expand)"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            {/* Close Button */}
            <button
              onClick={() => onChangeState('closed')}
              className="p-1 text-[#756B8D] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition-colors cursor-pointer"
              title="Tutup Menu"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Navigation items list grouped by category */}
      <div className="flex-1 py-2 px-2 space-y-3 overflow-y-auto">
        {categoriesToRender.map(category => {
          const categoryItems = sortedNavItems.filter(item => {
            const catalog = itemCatalog[item.id];
            if (!catalog) return false;
            if (!item.visible) return false;
            if (!catalog.roles.includes(currentUser.role)) return false;
            return item.category === category;
          });

          if (categoryItems.length === 0) return null;

          return (
            <div key={category} className="space-y-1">
              {!isMinimized ? (
                <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-bold text-[#8064D9] dark:text-[#b19cf0] uppercase tracking-wider">
                  {category}
                </div>
              ) : (
                <div className="my-1 border-t border-[#D8CCF3]/70 dark:border-[#3B1D78]" />
              )}

              {categoryItems.map(item => {
                const catalog = itemCatalog[item.id] || { label: item.label, icon: TicketIcon, roles: [] };
                const Icon = catalog.icon;
                const isActive = activeTab === item.id;
                const rawLabel = item.label || catalog.label;
                const label = (item.id === 'leader_portal' && (rawLabel === 'Dashboard Area' || !rawLabel)) ? 'Dashboard Leader' : rawLabel;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item.id)}
                    title={isMinimized ? label : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#3B1D78] text-white shadow-md shadow-[#3B1D78]/25'
                        : catalog.highlight
                        ? 'text-[#5B35B1] dark:text-[#E9E1FF] bg-[#E9E1FF]/80 dark:bg-[#3B1D78]/50 hover:bg-[#E9E1FF]'
                        : 'text-[#756B8D] dark:text-[#D8CCF3] hover:text-[#21183A] dark:hover:text-white hover:bg-[#E9E1FF]/50 dark:hover:bg-[#3B1D78]/40'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {!isMinimized && (
                      <div className="flex-1 flex items-center justify-between text-left truncate">
                        <span className="truncate">{label}</span>
                        {catalog.badge !== undefined && (
                          <span
                            className={`ml-2 px-1.5 py-0.2 text-[10px] font-bold rounded-full ${
                              isActive
                                ? 'bg-[#5B35B1] text-white'
                                : catalog.badgeColor === 'amber'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-[#E9E1FF] text-[#3B1D78] dark:bg-[#3B1D78] dark:text-[#E9E1FF]'
                            }`}
                          >
                            {catalog.badge}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Footer controls */}
      <div className="p-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
        {!isMinimized ? (
          <div className="flex items-center justify-between px-1">
            <div className="text-[11px] text-slate-400 truncate">
              Role: <span className="font-semibold text-slate-700 dark:text-slate-300 capitalize">{currentUser.role.replace('_', ' ')}</span>
            </div>
            <div className="flex items-center gap-1">
              {/* Quick toggle between minimized & expanded */}
              <button
                onClick={() => onChangeState(isMinimized ? 'expanded' : 'minimized')}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                title={isMinimized ? 'Expand Menu' : 'Minimize Menu'}
              >
                {isMinimized ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={() => onChangeState('expanded')}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
              title="Expand Menu"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {currentUser.role === 'super_admin' && (
          <button
            onClick={() => setIsSessionModalOpen(true)}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-xs font-semibold transition-colors cursor-pointer ${
              isMinimized ? 'justify-center' : ''
            }`}
            title="Kelola Sesi Staf Aktif & Idle Timeout"
          >
            <KeyRound className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
            {!isMinimized && <span className="truncate">Manajemen Sesi Staf</span>}
          </button>
        )}

        {/* Dedicated Logout Action */}
        <button
          onClick={logout}
          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold transition-colors ${
            isMinimized ? 'justify-center' : ''
          }`}
          title="Keluar / Logout dari Aplikasi"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!isMinimized && <span>Keluar / Logout</span>}
        </button>
      </div>
    </aside>
    </>
  );
};
