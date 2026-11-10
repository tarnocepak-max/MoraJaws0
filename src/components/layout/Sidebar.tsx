import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useUIConfig } from '../../context/UIConfigContext';
import { MoraJawsLogo } from '../common/MoraJawsLogo';
import {
  LayoutDashboard,
  FileSpreadsheet,
  Ticket as TicketIcon,
  Users2,
  MessageSquareQuote,
  Sliders,
  History,
  ChevronDown,
  X,
  RefreshCw,
  Database,
  KeyRound,
  LogOut,
  Calendar,
  Activity,
  MessageSquare,
  ShieldCheck,
  Building2,
  FileText,
  UserCheck,
  BarChart3,
  UserPlus,
  SlidersHorizontal,
  FolderTree,
  Bell,
  Settings as SettingsIcon,
  CheckCircle2,
  ListOrdered,
  Wrench,
  Layers,
  MapPin,
  HelpCircle,
  Folder
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
  sidebarState: 'expanded' | 'minimized' | 'closed';
  onChangeState: (state: 'expanded' | 'minimized' | 'closed') => void;
}

export const ICON_REGISTRY: Record<string, React.ElementType> = {
  LayoutDashboard,
  FileSpreadsheet,
  Ticket: TicketIcon,
  TicketIcon,
  Users2,
  MessageSquareQuote,
  Sliders,
  History,
  RefreshCw,
  Database,
  KeyRound,
  LogOut,
  Calendar,
  Activity,
  MessageSquare,
  ShieldCheck,
  Building2,
  FileText,
  UserCheck,
  BarChart3,
  UserPlus,
  SlidersHorizontal,
  FolderTree,
  Bell,
  Settings: SettingsIcon,
  CheckCircle2,
  ListOrdered,
  Wrench,
  Layers,
  MapPin,
  HelpCircle,
  Folder
};

export const resolveNavIcon = (iconName?: string): React.ElementType => {
  if (!iconName) return Folder;
  return ICON_REGISTRY[iconName] || Folder;
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onNavigate,
  sidebarState,
  onChangeState
}) => {
  const { currentUser, tickets, logout, setIsSessionModalOpen } = useApp();
  const {
    isMobileView,
    config,
    navCategories,
    standaloneMenus,
    submenuItems,
    accordionSettings
  } = useUIConfig();

  // Requirement 1: Ticket indicators strictly calculate WO with Appointment Date = Today (Asia/Jakarta)
  const todayWIB = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
    } catch {
      return new Date().toISOString().split('T')[0];
    }
  }, []);

  const todayActiveTickets = useMemo(() => {
    return tickets.filter(t => {
      if (t.isArchived || t.isDeleted) return false;
      const raw = t.appointmentDate;
      if (!raw) return false;
      const clean = String(raw).slice(0, 10);
      return clean === todayWIB || (String(raw).includes('T') && String(raw).split('T')[0] === todayWIB);
    });
  }, [tickets, todayWIB]);

  const totalActiveTickets = todayActiveTickets.length;
  const unassignedCount = todayActiveTickets.filter(t => !t.installerName).length;
  const userRole = currentUser?.role || 'installer';
  const isInstaller = userRole === 'installer';

  // =========================================================================
  // 1. STANDALONE MENUS (Menu Mandiri tanpa accordion, tanpa kategori induk)
  // Untuk Installer: Hanya Dashboard Installer & Tugas Saya
  // Untuk Non-Installer: 7 Menu Mandiri yang dapat dikonfigurasi
  // =========================================================================
  const filteredStandaloneMenus = useMemo(() => {
    if (isInstaller) {
      return [
        {
          id: 'installer_portal',
          label: 'Dashboard Installer',
          icon: 'LayoutDashboard',
          order: 1,
          visible: true,
          roles: ['installer']
        },
        {
          id: 'installer_tasks',
          label: 'Tugas Saya',
          icon: 'CheckCircle2',
          order: 2,
          visible: true,
          roles: ['installer']
        }
      ];
    }

    const list = Array.isArray(standaloneMenus) ? standaloneMenus : [];
    return [...list]
      .filter(item => {
        if (item.visible === false) return false;
        if (item.id === 'templates' && userRole !== 'super_admin' && userRole !== 'dispatch') return false;
        if (Array.isArray(item.roles) && item.roles.length > 0 && !item.roles.includes(userRole)) return false;
        return true;
      })
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [isInstaller, standaloneMenus, userRole]);

  // =========================================================================
  // 2. KATEGORI ACCORDION (3 Kategori Utama: Contractor & Area, Installer, Menu Tambahan)
  // Khusus Non-Installer (Installer hanya memiliki 2 menu mandiri)
  // Submenu difilter berdasarkan role & izin akses. Kategori tanpa submenu disembunyikan.
  // =========================================================================
  const filteredCategoriesWithSubmenus = useMemo(() => {
    if (isInstaller) return [];

    const categories = Array.isArray(navCategories) ? navCategories : [];
    const allSubmenus = Array.isArray(submenuItems) ? submenuItems : [];
    const isDispatchOrLeader = userRole === 'dispatch' || userRole === 'leader';

    return [...categories]
      .filter(cat => {
        if (cat.isActive === false) return false;
        // Role DISPATCH dan LEADER tidak boleh melihat kategori installer (Hanya super_admin & installer)
        if ((userRole === 'dispatch' || userRole === 'leader') && 
            (cat.id === 'cat_installer' || cat.id === 'installer' || (cat.name && String(cat.name).toLowerCase().includes('installer')))) {
          return false;
        }
        return true;
      })
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(cat => {
        const matchingSubmenus = allSubmenus
          .filter(sub => {
            if (sub.categoryId !== cat.id) return false;
            if (sub.visible === false) return false;
            // Role DISPATCH tidak boleh melihat pendaftaran/menu installer
            if (userRole === 'dispatch' && (sub.categoryId === 'installer' || sub.id === 'report_installer' || sub.id === 'installer_mgmt')) {
              return false;
            }
            // Role LEADER tidak boleh melihat report installer, hanya pendaftaran akun teknisi
            if (userRole === 'leader' && sub.id === 'report_installer') {
              return false;
            }
            // Requirement 5: WhatsApp Templates strictly for super_admin and dispatch only
            if (sub.id === 'templates' && userRole !== 'super_admin' && userRole !== 'dispatch') {
              return false;
            }
            if (Array.isArray(sub.roles) && sub.roles.length > 0 && !sub.roles.includes(userRole)) return false;
            return true;
          })
          .sort((a, b) => (a.order || 0) - (b.order || 0));

        return {
          ...cat,
          submenus: matchingSubmenus
        };
      })
      .filter(cat => cat.submenus.length > 0); // Sembunyikan kategori jika tidak ada submenu yang dapat diakses
  }, [isInstaller, navCategories, submenuItems, userRole]);

  // =========================================================================
  // 3. ACCORDION STATE
  // Mendukung multi-submenu collapse (beberapa kategori terbuka bersamaan)
  // Kategori dibuka/ditutup secara independen tanpa menutup kategori lain
  // =========================================================================
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    filteredCategoriesWithSubmenus.forEach(cat => {
      // Default: check if activeTab is within this category
      const hasActive = cat.submenus.some(
        sub =>
          sub.id === activeTab ||
          (sub.id === 'contractor_recap' && activeTab === 'rekap_laporan') ||
          (sub.id === 'setup' && ['setup', 'ui_builder', 'workflows', 'database_sync', 'sheets_sync'].includes(activeTab))
      );
      initial[cat.id] = hasActive || cat.mode === 'static';
    });
    return initial;
  });

  // Ensure active category expands when activeTab navigates into it
  useEffect(() => {
    filteredCategoriesWithSubmenus.forEach(cat => {
      const hasActive = cat.submenus.some(
        sub =>
          sub.id === activeTab ||
          (sub.id === 'contractor_recap' && activeTab === 'rekap_laporan') ||
          (sub.id === 'setup' && ['setup', 'ui_builder', 'workflows', 'database_sync', 'sheets_sync'].includes(activeTab))
      );
      if (hasActive) {
        setOpenGroups(prev => ({
          ...prev,
          [cat.id]: true
        }));
      }
    });
  }, [activeTab, filteredCategoriesWithSubmenus]);

  // Toggle category independent expand/collapse
  const toggleGroup = (groupId: string, mode?: 'accordion' | 'static') => {
    if (mode === 'static') return; // Static mode stays open
    setOpenGroups(prev => {
      const isCurrentlyOpen = !!prev[groupId];
      const allowMultiple = accordionSettings?.allowMultipleOpenGroups !== false;

      if (allowMultiple) {
        // Multi-open mode: keep existing states, toggle clicked category
        return {
          ...prev,
          [groupId]: !isCurrentlyOpen
        };
      } else {
        // Single-open mode
        const next: Record<string, boolean> = {};
        // Keep static categories open
        filteredCategoriesWithSubmenus.forEach(c => {
          if (c.mode === 'static') next[c.id] = true;
        });
        next[groupId] = !isCurrentlyOpen;
        return next;
      }
    });
  };

  const handleItemClick = (id: string) => {
    onNavigate(id);
    if (isMobileView || (typeof window !== 'undefined' && window.innerWidth < 768)) {
      if (config?.device?.android?.autoCloseSidebarOnNavigate !== false) {
        onChangeState('closed');
      }
    }
  };

  // Helper for dynamic badge calculation
  const getItemBadge = (itemId: string, defaultBadge?: string | number) => {
    if (itemId === 'wo_assignment' && unassignedCount > 0) {
      return { text: `${unassignedCount} Belum`, color: 'amber' as const };
    }
    if (itemId === 'tickets' && totalActiveTickets > 0) {
      return { text: totalActiveTickets, color: 'purple' as const };
    }
    if (itemId === 'progress_dashboard') {
      return { text: 'Live', color: 'purple' as const };
    }
    if (itemId === 'system_health') {
      return { text: 'OK', color: 'emerald' as const };
    }
    if (itemId === 'setup') {
      return { text: 'Hub', color: 'purple' as const };
    }
    if (defaultBadge !== undefined) {
      return { text: defaultBadge, color: 'purple' as const };
    }
    return null;
  };

  // KHUSUS ROLE INSTALLER: Sidebar HILANG SEPENUHNYA (Bottom Navigation ONLY)
  if (sidebarState === 'closed' || isInstaller) {
    return null;
  }

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      <div
        className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs z-45 md:hidden animate-fadeIn"
        onClick={() => onChangeState('closed')}
      />

      {/* Sidebar Main Frame: Dark Purple Gloss Theme */}
      <aside
        className="fixed inset-y-0 left-0 z-50 md:relative md:inset-auto md:z-auto bg-[#160D29] text-slate-200 border-r border-[#35105E] transition-all duration-300 ease-in-out flex flex-col shrink-0 shadow-2xl md:shadow-none h-full w-64 select-none"
      >
        {/* Top Header with MoraJaws Logo */}
        <div className="px-4 py-3.5 border-b border-[#35105E] flex items-center justify-between bg-[#110A21]">
          <div className="flex items-center gap-2.5">
            <MoraJawsLogo size="xs" animated={false} />
            <div className="flex flex-col">
              <span className="font-extrabold text-[#D8B4FE] uppercase tracking-wider text-[11px] leading-tight">
                Menu Navigasi
              </span>
              <span className="text-[9.5px] text-purple-400 font-medium">
                MoraJaws Operations
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChangeState('closed')}
            className="p-1.5 text-purple-300 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
            title="Tutup Menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Navigation Body */}
        <div className="flex-1 py-3 px-2.5 space-y-2 overflow-y-auto scrollbar-thin">
          {/* ============================================================ */}
          {/* A. MENU MANDIRI (TANPA KATEGORI INDUK, TANPA ACCORDION)      */}
          {/* Langsung di bagian atas tanpa label header "MENU UTAMA"      */}
          {/* ============================================================ */}
          <div className="space-y-1">
            {filteredStandaloneMenus.map(item => {
              const Icon = resolveNavIcon(item.icon);
              const isActive =
                activeTab === item.id ||
                (item.id === 'tickets' && (activeTab === 'tickets' || activeTab === 'wo_management')) ||
                (item.id === 'installer_portal' && (activeTab === 'installer_portal' || activeTab === 'installer_dashboard'));

              const badgeInfo = getItemBadge(item.id, item.badge);

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleItemClick(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-r from-[#5B35B1] to-[#7135B5] text-white font-bold shadow-md shadow-[#5B35B1]/40 border-l-4 border-l-[#D8B4FE] border-y border-r border-[#D8B4FE]/30'
                      : 'text-purple-200 hover:text-white hover:bg-[#35105E]/50 border-l-4 border-l-transparent'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#D8B4FE]' : 'text-purple-300'}`} />
                  <div className="flex-1 flex items-center justify-between text-left truncate">
                    <span className="truncate">{item.label}</span>
                    {badgeInfo && (
                      <span
                        className={`ml-2 px-1.5 py-0.2 text-[9.5px] font-bold rounded-full ${
                          isActive
                            ? 'bg-white text-[#35105E]'
                            : badgeInfo.color === 'amber'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-[#5B35B1] text-purple-100'
                        }`}
                      >
                        {badgeInfo.text}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* ============================================================ */}
          {/* B. PEMISAH RAPI (JIKA MEMILIKI KATEGORI ACCORDION)           */}
          {/* Tanpa judul "KATEGORI MENU" per spesifikasi                  */}
          {/* ============================================================ */}
          {filteredCategoriesWithSubmenus.length > 0 && (
            <div className="my-2.5 border-t border-[#35105E]/60" />
          )}

          {/* ============================================================ */}
          {/* C. KATEGORI ACCORDION SUBMENU (Contractor & Area, Installer, Menu Tambahan) */}
          {/* ============================================================ */}
          {filteredCategoriesWithSubmenus.map(cat => {
            const CatIcon = resolveNavIcon(cat.icon);
            const isAccordionMode = cat.mode !== 'static';
            const isOpen = isAccordionMode ? !!openGroups[cat.id] : true;
            const hasActiveChild = cat.submenus.some(
              sub =>
                activeTab === sub.id ||
                (sub.id === 'contractor_recap' && activeTab === 'rekap_laporan') ||
                (sub.id === 'setup' && ['setup', 'ui_builder', 'workflows', 'database_sync', 'sheets_sync'].includes(activeTab))
            );

            return (
              <div
                key={cat.id}
                className={`rounded-xl transition-all duration-200 ${
                  hasActiveChild
                    ? 'bg-[#251545]/70 border border-[#7135B5]/40 shadow-xs'
                    : 'bg-[#1C1133]/40 border border-[#35105E]/40'
                }`}
              >
                {/* Category Header Button */}
                {isAccordionMode ? (
                  <button
                    type="button"
                    onClick={() => toggleGroup(cat.id, 'accordion')}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-purple-200 hover:text-white hover:bg-[#35105E]/60 rounded-xl transition-colors cursor-pointer group"
                    aria-expanded={isOpen}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <CatIcon className={`w-4 h-4 shrink-0 ${hasActiveChild ? 'text-[#D8B4FE]' : 'text-purple-400 group-hover:text-purple-300'}`} />
                      <span className="tracking-wide uppercase text-[11px] font-bold truncate">
                        {cat.name}
                      </span>
                    </div>
                    <ChevronDown
                      className={`w-3.5 h-3.5 shrink-0 text-purple-400 transition-transform duration-300 ease-in-out ${
                        isOpen ? 'rotate-180 text-[#D8B4FE]' : 'rotate-0 text-purple-400 group-hover:text-purple-300'
                      }`}
                    />
                  </button>
                ) : (
                  <div className="w-full flex items-center justify-between px-3 py-2 text-xs font-extrabold text-purple-300 border-b border-[#35105E]/40">
                    <div className="flex items-center gap-2.5 truncate">
                      <CatIcon className={`w-4 h-4 shrink-0 ${hasActiveChild ? 'text-[#D8B4FE]' : 'text-purple-400'}`} />
                      <span className="tracking-wider uppercase text-[11px] truncate">{cat.name}</span>
                    </div>
                  </div>
                )}

                {/* Submenu Items with smooth collapse animation */}
                {isOpen && (
                  <div className="space-y-1 pl-1.5 pr-1 py-1.5 animate-fadeIn">
                    {cat.submenus.map(item => {
                      const SubIcon = resolveNavIcon(item.icon);
                      const isActive =
                        activeTab === item.id ||
                        (item.id === 'contractor_recap' && activeTab === 'rekap_laporan') ||
                        (item.id === 'setup' &&
                          ['ui_builder', 'workflows', 'database_sync', 'sheets_sync'].includes(activeTab));

                      const badgeInfo = getItemBadge(item.id, item.badge);

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleItemClick(item.id)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                            isActive
                              ? 'bg-gradient-to-r from-[#5B35B1] to-[#7135B5] text-white font-bold shadow-md shadow-[#5B35B1]/40 border-l-4 border-l-[#D8B4FE] border-y border-r border-[#D8B4FE]/30'
                              : item.highlight
                              ? 'text-[#E9D5FF] bg-[#35105E]/80 hover:bg-[#5B35B1]/50 border-l-4 border-l-transparent'
                              : 'text-purple-200 hover:text-white hover:bg-[#35105E]/50 border-l-4 border-l-transparent'
                          }`}
                        >
                          <SubIcon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#D8B4FE]' : 'text-purple-300'}`} />
                          <div className="flex-1 flex items-center justify-between text-left truncate">
                            <span className="truncate">{item.label}</span>
                            {badgeInfo && (
                              <span
                                className={`ml-2 px-1.5 py-0.2 text-[9.5px] font-bold rounded-full ${
                                  isActive
                                    ? 'bg-white text-[#35105E]'
                                    : badgeInfo.color === 'amber'
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                    : badgeInfo.color === 'emerald'
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                    : 'bg-[#5B35B1] text-purple-100'
                                }`}
                              >
                                {badgeInfo.text}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer: User Role Information & Logout */}
        <div className="p-3 border-t border-[#35105E] bg-[#100921] space-y-2 shrink-0">
          <div className="flex items-center justify-between px-2 text-[11px] text-purple-300">
            <span className="truncate">
              Role: <strong className="text-white capitalize">{userRole.replace('_', ' ')}</strong>
            </span>
            <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-[#35105E] text-[#D8B4FE] border border-[#7135B5]/40 uppercase tracking-wider">
              {currentUser?.username || 'user'}
            </span>
          </div>

          {userRole === 'super_admin' && (
            <button
              type="button"
              onClick={() => setIsSessionModalOpen(true)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-purple-200 hover:text-white hover:bg-[#35105E] text-xs font-semibold transition-colors cursor-pointer"
              title="Kelola Sesi Staf Aktif"
            >
              <KeyRound className="w-3.5 h-3.5 shrink-0 text-[#D8B4FE]" />
              <span className="truncate">Sesi Staf Aktif</span>
            </button>
          )}

          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-rose-400 hover:text-rose-200 hover:bg-rose-950/40 text-xs font-semibold transition-colors cursor-pointer"
            title="Keluar / Logout"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span>Keluar / Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
};
