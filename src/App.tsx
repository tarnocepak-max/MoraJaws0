import React, { useState, useMemo, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { UIConfigProvider, useUIConfig } from './context/UIConfigContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { AnimationProvider } from './context/AnimationContext';
import { OfflineSyncProvider } from './context/OfflineSyncContext';
import { MoraJawsSoundProvider } from './context/SoundContext';

import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { AndroidBottomNav } from './components/layout/AndroidBottomNav';
import { LeaderBottomNav, LeaderTabType } from './components/layout/LeaderBottomNav';
import { InstallerBottomNav } from './components/layout/InstallerBottomNav';
import { SetupHubView } from './components/setup/SetupHubView';

import { DashboardOverview } from './components/dashboard/DashboardOverview';
import { TicketsTable } from './components/tickets/TicketsTable';
import { FormSamedayView } from './components/sameday/FormSamedayView';
import { ReportDataWOView } from './components/reports/ReportDataWOView';
import { ScheduleCalendarView } from './components/schedule/ScheduleCalendarView';
import { LoginLogView } from './components/audit/LoginLogView';
import { SettingDroplistView } from './components/settings/SettingDroplistView';
import { DroplistManagementView } from './components/settings/DroplistManagementView';
import { SoundSettingsView } from './components/settings/SoundSettingsView';

import { LeaderPortal } from './components/portals/LeaderPortal';
import { LeaderProgressDashboardView } from './components/portals/LeaderProgressDashboardView';
import { ContractorAreaRecapView } from './components/reports/ContractorAreaRecapView';
import { LocationBasecampView } from './components/contractors/LocationBasecampView';
import { InstallerPortal, classifyInstallerStatus } from './components/portals/InstallerPortal';
import { InstallerDashboardView } from './components/portals/InstallerDashboardView';
import { InstallerWhatsAppCenter } from './components/whatsapp/InstallerWhatsAppCenter';
import { ContactCentreView } from './components/contact/ContactCentreView';
import { ManagementDataPortal } from './components/portals/ManagementDataPortal';
import { NavigationConfigView } from './components/setup/NavigationConfigView';

import { DatabaseSyncMonitoringView } from './components/database/DatabaseSyncMonitoringView';
import { DatabaseManagementView } from './components/database/DatabaseManagementView';
import { TextToTableImporter } from './components/textToTable/TextToTableImporter';
import { GoogleSheetsSyncView } from './components/sheets/GoogleSheetsSyncView';

import { UserManagementView } from './components/users/UserManagementView';
import { ManagementRoleView } from './components/users/ManagementRoleView';
import { SystemSettings } from './components/settings/SystemSettings';
import { UIConfigurationBuilder } from './components/uiBuilder/UIConfigurationBuilder';
import { AuditLogViewer } from './components/audit/AuditLogViewer';
import { SystemHealthView } from './components/settings/SystemHealthView';
import { TemplateBuilder } from './components/whatsapp/TemplateBuilder';
import { WorkflowManager } from './components/workflows/WorkflowManager';

import { StaffLoginPortal } from './components/auth/StaffLoginPortal';
import { SessionManagementModal } from './components/settings/SessionManagementModal';
import { OfflineSyncModal } from './components/offline/OfflineSyncModal';
import { OfflineBanner } from './components/offline/OfflineBanner';
import { TicketDetailModal } from './components/tickets/TicketDetailModal';
import { WhatsAppSendModal } from './components/whatsapp/WhatsAppSendModal';

import { Ticket } from './types';
import { Menu, Database } from 'lucide-react';
import { MoraJawsErrorBoundary } from './components/common/MoraJawsErrorBoundary';

const MainLayout: React.FC = () => {
  const { currentUser, isLoggedIn, tickets, openOfflineSyncCenter, getTicketUnreadCount } = useApp();
  const { config, setSidebarState, isMobileView } = useUIConfig();
  const { toast } = useToast();

  const isInstaller = Boolean(isLoggedIn && currentUser?.role === 'installer');

  const installerAllowedTabs = useMemo(
    () => [
      'installer_dashboard',
      'installer_portal',
      'installer_tasks',
      'installer_progress',
      'installer_history',
      'installer_whatsapp',
      'whatsapp',
      'installer_chat',
      'live_chat',
      'contact_centre'
    ],
    []
  );

  // Initial active tab resolution: URL hash > localStorage > Role Default
  const getInitialActiveTab = (): string => {
    if (!isLoggedIn) return 'dashboard';
    const role = currentUser?.role;
    try {
      const hash = window.location.hash.replace('#', '').trim();
      const saved = localStorage.getItem(`morajaws_active_tab_${currentUser?.id || role}`);

      if (isInstaller) {
        if (hash && installerAllowedTabs.includes(hash)) return hash;
        if (saved && installerAllowedTabs.includes(saved)) return saved;
        return 'installer_dashboard';
      }

      if (hash) return hash;
      if (saved) return saved;
    } catch (e) {}

    if (role === 'installer') return 'installer_dashboard';
    if (role === 'leader') return 'wo_assignment';
    if (role === 'management_data') return 'management_data_portal';
    if (role === 'dispatch') return 'tickets';
    return 'dashboard';
  };

  const [activeTab, setActiveTab] = useState<string>(getInitialActiveTab);

  // Security guard: Force redirect installer away from global dashboard, tickets, or admin settings
  useEffect(() => {
    if (isInstaller && !installerAllowedTabs.includes(activeTab)) {
      setActiveTab('installer_dashboard');
      try {
        localStorage.setItem(`morajaws_active_tab_${currentUser.id || currentUser.role}`, 'installer_dashboard');
        window.history.replaceState({ tab: 'installer_dashboard' }, '', '#installer_dashboard');
      } catch (e) {}
    }
  }, [isInstaller, activeTab, installerAllowedTabs, currentUser]);

  const getInitialLeaderSubTab = (): LeaderTabType => {
    if (['wo_assignment', 'progress_dashboard', 'contractor_recap', 'quota_settings'].includes(activeTab)) {
      return activeTab as LeaderTabType;
    }
    return 'wo_assignment';
  };

  const [leaderSubTab, setLeaderSubTab] = useState<LeaderTabType>(getInitialLeaderSubTab);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailDefaultTab, setDetailDefaultTab] = useState<'overview' | 'report' | 'chat' | 'history'>('overview');
  const [whatsAppTicket, setWhatsAppTicket] = useState<Ticket | null>(null);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);

  // Central Navigation Dispatcher: updates activeTab, leaderSubTab, localStorage, and history state
  const navigateTo = (tab: string, pushHistory = true) => {
    let targetTab = tab;
    // Strict isolation: map any disallowed tabs back to installer_dashboard
    if (isInstaller && !installerAllowedTabs.includes(tab)) {
      targetTab = 'installer_dashboard';
    }

    setActiveTab(targetTab);
    if (['wo_assignment', 'progress_dashboard', 'contractor_recap', 'quota_settings'].includes(targetTab)) {
      setLeaderSubTab(targetTab as LeaderTabType);
    }
    try {
      localStorage.setItem(`morajaws_active_tab_${currentUser.id || currentUser.role}`, targetTab);
    } catch (e) {}
    if (pushHistory) {
      if (window.location.hash !== `#${targetTab}`) {
        window.history.pushState({ tab: targetTab }, '', `#${targetTab}`);
      }
    }
  };

  // Browser Back/Forward history navigation listener
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const hash = window.location.hash.replace('#', '').trim();
      let targetTab = e.state?.tab || hash;
      if (targetTab) {
        if (isInstaller && !installerAllowedTabs.includes(targetTab)) {
          targetTab = 'installer_dashboard';
        }
        setActiveTab(targetTab);
        if (['wo_assignment', 'progress_dashboard', 'contractor_recap', 'quota_settings'].includes(targetTab)) {
          setLeaderSubTab(targetTab as LeaderTabType);
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isInstaller, installerAllowedTabs]);

  // Compute active tab for Leader Bottom Navigation
  const activeLeaderBottomTab: LeaderTabType = useMemo(() => {
    if (activeTab === 'progress_dashboard') return 'progress_dashboard';
    if (activeTab === 'contractor_recap' || activeTab === 'rekap_laporan' || activeTab === 'report_installer') return 'contractor_recap';
    if (activeTab === 'quota_settings') return 'quota_settings';
    if (activeTab === 'wo_assignment') return 'wo_assignment';
    if (['wo_assignment', 'progress_dashboard', 'contractor_recap', 'quota_settings'].includes(leaderSubTab)) {
      return leaderSubTab;
    }
    return 'wo_assignment';
  }, [activeTab, leaderSubTab]);

  // Scoped unassigned tickets count for Leader's contractor
  const leaderUnassignedCount = useMemo(() => {
    if (!isLoggedIn || currentUser?.role !== 'leader') return 0;
    const myContractor = String(currentUser?.contractor || '').toLowerCase().trim();
    return tickets.filter(t => {
      if (t.isArchived || t.isDeleted) return false;
      if (t.installerName) return false;
      if (!myContractor) return true;
      const tContractor = String(t.contactorName || t.contractorName || '').toLowerCase().trim();
      return (tContractor && myContractor && (tContractor.includes(myContractor) || myContractor.includes(tContractor)));
    }).length;
  }, [isLoggedIn, tickets, currentUser]);

  // Helper matching for logged-in technician
  const isInstallerMatch = (ticketInstaller: string | undefined, installerName: string) => {
    if (!ticketInstaller || !ticketInstaller.trim()) return false;
    const tInst = String(ticketInstaller).toLowerCase().trim();
    const effInst = String(installerName).toLowerCase().trim();
    if (!tInst || !effInst) return false;
    if (tInst === effInst) return true;
    if (tInst.includes(effInst) || effInst.includes(tInst)) return true;
    const cleanEff = effInst.replace(/\(.*?\)/g, '').trim();
    if (cleanEff && (tInst.includes(cleanEff) || cleanEff.includes(tInst))) return true;
    return false;
  };

  // Scoped pending tickets count for logged-in Installer
  const installerPendingCount = useMemo(() => {
    if (!isLoggedIn || !isInstaller) return 0;
    const myName = (currentUser?.name || '').toLowerCase().trim();
    const myId = currentUser?.id || '';
    const myUsername = (currentUser?.username || '').toLowerCase().trim();

    return tickets.filter(t => {
      if (t.isArchived || t.isDeleted) return false;
      const assigned = (myId && t.assignedTo === myId) || (myUsername && t.assignedTo === myUsername);
      const tInst = (t.installerName || '').toLowerCase().trim();
      const nameMatch =
        (myName && (tInst === myName || isInstallerMatch(t.installerName, myName))) ||
        (myUsername && (tInst === myUsername || isInstallerMatch(t.installerName, myUsername)));
      if (!assigned && !nameMatch) return false;

      const cat = classifyInstallerStatus(t);
      return cat === 'pending';
    }).length;
  }, [isLoggedIn, isInstaller, tickets, currentUser]);

  // Scoped unread chat count for logged-in Installer
  const installerUnreadChatCount = useMemo(() => {
    if (!isLoggedIn || !isInstaller) return 0;
    const myName = (currentUser?.name || '').toLowerCase().trim();
    const myId = currentUser?.id || '';
    const myUsername = (currentUser?.username || '').toLowerCase().trim();

    return tickets.reduce((total, t) => {
      if (t.isArchived || t.isDeleted) return total;
      const assigned = (myId && t.assignedTo === myId) || (myUsername && t.assignedTo === myUsername);
      const tInst = (t.installerName || '').toLowerCase().trim();
      const nameMatch =
        (myName && (tInst === myName || isInstallerMatch(t.installerName, myName))) ||
        (myUsername && (tInst === myUsername || isInstallerMatch(t.installerName, myUsername)));
      if (!assigned && !nameMatch) return total;

      return total + (getTicketUnreadCount(t.id) > 0 ? 1 : 0);
    }, 0);
  }, [isLoggedIn, isInstaller, tickets, currentUser, getTicketUnreadCount]);

  // Unauthenticated Staff Protection: Render dedicated Staff Login Portal
  if (!isLoggedIn) {
    return (
      <StaffLoginPortal
        onLoginSuccess={(role) => {
          if (role === 'installer') navigateTo('installer_dashboard');
          else if (role === 'leader') navigateTo('wo_assignment');
          else if (role === 'management_data') navigateTo('management_data_portal');
          else if (role === 'dispatch') navigateTo('tickets');
          else navigateTo('dashboard');
        }}
      />
    );
  }

  const handleOpenTicketDetail = (ticket: Ticket, defaultTab: 'overview' | 'report' | 'chat' | 'history' = 'overview') => {
    if (isInstaller) {
      const myName = (currentUser.name || '').toLowerCase().trim();
      const myId = currentUser.id || '';
      const myUsername = (currentUser.username || '').toLowerCase().trim();
      const tInst = (ticket.installerName || '').toLowerCase().trim();
      const isMine =
        (myId && ticket.assignedTo === myId) ||
        (myUsername && (ticket.assignedTo === myUsername || (ticket.assignedTo && ticket.assignedTo.toLowerCase() === myUsername))) ||
        (myName && (tInst === myName || isInstallerMatch(ticket.installerName, myName))) ||
        (myUsername && (tInst === myUsername || isInstallerMatch(ticket.installerName, myUsername)));

      if (!isMine) {
        toast.error('Akses ditolak: Anda hanya dapat mengakses tiket yang ditugaskan kepada Anda.');
        return;
      }

      if (activeTab === 'installer_portal' || activeTab === 'installer_tasks') {
        // Installer uses the dedicated fullview experience inside InstallerPortal
        return;
      }
    }
    setSelectedTicket(ticket);
    setDetailDefaultTab(defaultTab);
    setIsDetailModalOpen(true);
  };

  const handleOpenWhatsAppModal = (ticket: Ticket) => {
    if (isInstaller) {
      const myName = (currentUser.name || '').toLowerCase().trim();
      const myId = currentUser.id || '';
      const myUsername = (currentUser.username || '').toLowerCase().trim();
      const tInst = (ticket.installerName || '').toLowerCase().trim();
      const isMine =
        (myId && ticket.assignedTo === myId) ||
        (myUsername && (ticket.assignedTo === myUsername || (ticket.assignedTo && ticket.assignedTo.toLowerCase() === myUsername))) ||
        (myName && (tInst === myName || isInstallerMatch(ticket.installerName, myName))) ||
        (myUsername && (tInst === myUsername || isInstallerMatch(ticket.installerName, myUsername)));

      if (!isMine) {
        toast.error('Akses ditolak: Tiket ini bukan milik Anda.');
        return;
      }
    }
    setWhatsAppTicket(ticket);
    setIsWhatsAppModalOpen(true);
  };

  const isFullWidth = config.global.contentWidth === 'full';
  const currentSidebarState = config.global.sidebarState || (config.global.sidebarCollapsed ? 'minimized' : 'expanded');

  // Render view based on active tab with fallback
  const renderContent = () => {
    // EXCLUSIVE INSTALLER VIEWPORT (Dashboard, Tugas Saya, WhatsApp, Live Chat Center)
    if (isInstaller) {
      switch (activeTab) {
        case 'installer_dashboard':
          return (
            <InstallerDashboardView
              onNavigateTab={(tab) => navigateTo(tab)}
              onSelectTicket={handleOpenTicketDetail}
              onOpenWhatsApp={handleOpenWhatsAppModal}
            />
          );
        case 'installer_portal':
        case 'installer_tasks':
        case 'installer_progress':
        case 'installer_history':
          return (
            <InstallerPortal
              initialFilter={activeTab === 'installer_tasks' ? 'pending' : activeTab === 'installer_history' ? 'done' : 'all'}
              onSelectTicket={handleOpenTicketDetail}
              onOpenWhatsApp={handleOpenWhatsAppModal}
            />
          );
        case 'installer_whatsapp':
        case 'whatsapp':
          return (
            <InstallerWhatsAppCenter
              onOpenWhatsAppModal={handleOpenWhatsAppModal}
              onSelectTicket={handleOpenTicketDetail}
            />
          );
        case 'installer_chat':
        case 'live_chat':
        case 'contact_centre':
          return <ContactCentreView />;
        default:
          return (
            <InstallerDashboardView
              onNavigateTab={(tab) => navigateTo(tab)}
              onSelectTicket={handleOpenTicketDetail}
              onOpenWhatsApp={handleOpenWhatsAppModal}
            />
          );
      }
    }

    switch (activeTab) {
      // Dispatch Management
      case 'dashboard':
        return <DashboardOverview onNavigate={tab => setActiveTab(tab)} />;
      case 'tickets':
        return (
          <TicketsTable
            onSelectTicket={handleOpenTicketDetail}
            onOpenWhatsApp={handleOpenWhatsAppModal}
          />
        );
      case 'form_sameday':
        // WO Same Day is strictly exclusive to Dispatch role
        if (currentUser.role !== 'dispatch') {
          return <DashboardOverview onNavigate={tab => setActiveTab(tab)} />;
        }
        return <FormSamedayView />;
      case 'report_data_wo':
        return <ReportDataWOView />;
      case 'schedule':
        return (
          <ScheduleCalendarView
            onSelectTicket={handleOpenTicketDetail}
            onOpenWhatsApp={handleOpenWhatsAppModal}
          />
        );
      case 'login_logs': {
        const canAccessLoginLogs = currentUser.role === 'super_admin' || currentUser.role === 'it_support';
        if (!canAccessLoginLogs) {
          const redirectTarget = isInstaller
            ? 'installer_dashboard'
            : currentUser.role === 'leader'
            ? 'leader_portal'
            : currentUser.role === 'management_data'
            ? 'management_data_portal'
            : currentUser.role === 'dispatch'
            ? 'tickets'
            : 'dashboard';
          setTimeout(() => {
            setActiveTab(redirectTarget);
          }, 1500);
          return (
            <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border-2 border-rose-300 dark:border-rose-900 shadow-md max-w-lg mx-auto my-12 space-y-3">
              <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto font-bold text-lg">
                ✕
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Akses Ditolak: Khusus Super Admin & IT Support
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Log aktivitas login dilindungi dan hanya dapat diakses oleh Super Admin dan IT Support. Role Anda ({currentUser.role}) tidak memiliki izin. Mengalihkan...
              </p>
            </div>
          );
        }
        return <LoginLogView />;
      }
      case 'setting_droplist':
        return <SettingDroplistView />;

      // Leader & Contractor Basecamp (WO CONTRACTOR)
      case 'leader_portal':
        return (
          <LeaderPortal
            onSelectTicket={handleOpenTicketDetail}
            onOpenWhatsApp={handleOpenWhatsAppModal}
            activeLeaderTab={leaderSubTab}
            onLeaderTabChange={tab => navigateTo(tab)}
          />
        );
      case 'wo_assignment':
        return (
          <LeaderPortal
            onSelectTicket={handleOpenTicketDetail}
            onOpenWhatsApp={handleOpenWhatsAppModal}
            activeLeaderTab="wo_assignment"
            onLeaderTabChange={tab => navigateTo(tab)}
          />
        );
      case 'progress_dashboard':
        return (
          <LeaderProgressDashboardView
            onSelectTicket={handleOpenTicketDetail}
            onOpenWhatsApp={handleOpenWhatsAppModal}
          />
        );
      case 'installer_mgmt':
        return (
          <LeaderPortal
            onSelectTicket={handleOpenTicketDetail}
            onOpenWhatsApp={handleOpenWhatsAppModal}
            activeLeaderTab="installer_mgmt"
            onLeaderTabChange={tab => navigateTo(tab)}
          />
        );
      case 'quota_settings':
        return (
          <LeaderPortal
            onSelectTicket={handleOpenTicketDetail}
            onOpenWhatsApp={handleOpenWhatsAppModal}
            activeLeaderTab="quota_settings"
            onLeaderTabChange={tab => navigateTo(tab)}
          />
        );
      case 'contractor_recap':
      case 'rekap_laporan':
      case 'report_installer':
        return <ContractorAreaRecapView />;
      case 'location_basecamp':
      case 'contractors':
        return <LocationBasecampView />;

      // Technician Portal (TASK INSTALLER) - Protected (Bagian 3: Only Superadmin and Installer)
      case 'installer_portal':
      case 'installer_tasks':
      case 'installer_progress':
      case 'installer_history': {
        if (currentUser.role === 'dispatch' || currentUser.role === 'leader') {
          // Direct URL / Routing rejection and auto-redirect to respective dashboard
          const targetTab = currentUser.role === 'dispatch' ? 'tickets' : 'leader_portal';
          setTimeout(() => {
            setActiveTab(targetTab);
          }, 0);
          return (
            <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-rose-200 dark:border-rose-900 shadow-sm max-w-lg mx-auto my-12 space-y-3">
              <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto font-bold text-lg">
                ✕
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Akses Ditolak: Modul Khusus Installer
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sesuai Konstitusi Keamanan MoraJaws (Bagian 3), role <strong>{currentUser.role}</strong> tidak memiliki izin mengakses modul Installer. Anda dialihkan kembali ke Dashboard.
              </p>
            </div>
          );
        }

        return (
          <InstallerPortal
            initialFilter={activeTab === 'installer_tasks' ? 'pending' : activeTab === 'installer_history' ? 'done' : 'all'}
            onSelectTicket={handleOpenTicketDetail}
            onOpenWhatsApp={handleOpenWhatsAppModal}
          />
        );
      }

      // Contact & Messaging
      case 'contact_centre':
        return <ContactCentreView />;

      // Data Operations & Sync
      case 'management_data_portal': {
        const canAccessManagementData = currentUser.role === 'super_admin' || currentUser.role === 'management_data';
        if (!canAccessManagementData) {
          const redirectTarget = isInstaller
            ? 'installer_dashboard'
            : currentUser.role === 'leader'
            ? 'leader_portal'
            : currentUser.role === 'dispatch'
            ? 'tickets'
            : 'dashboard';
          setTimeout(() => {
            setActiveTab(redirectTarget);
          }, 1500);
          return (
            <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border-2 border-rose-300 dark:border-rose-900 shadow-md max-w-lg mx-auto my-12 space-y-3">
              <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto font-bold text-lg">
                ✕
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Akses Ditolak: Khusus Management Data & Super Admin
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Portal Management Data dilindungi dan hanya dapat diakses oleh Management Data dan Super Admin. Role Anda ({currentUser.role}) tidak memiliki izin. Mengalihkan...
              </p>
            </div>
          );
        }
        return (
          <ManagementDataPortal
            onSelectTicket={handleOpenTicketDetail}
            onOpenWhatsApp={handleOpenWhatsAppModal}
          />
        );
      }
      case 'database_sync':
        return <DatabaseSyncMonitoringView />;
      case 'database_management':
        return <DatabaseManagementView />;
      case 'import':
      case 'import_excel':
        return <TextToTableImporter onImportSuccess={() => setActiveTab('tickets')} />;
      case 'sheets_sync':
        return currentUser.role === 'super_admin' ? (
          <GoogleSheetsSyncView />
        ) : (
          <DashboardOverview onNavigate={tab => setActiveTab(tab)} />
        );

      // System, Roles, Users & Config
      case 'users':
        return <UserManagementView />;
      case 'management_role':
        return <ManagementRoleView />;
      case 'settings':
        return <SystemSettings />;
      case 'ui_builder':
        return <UIConfigurationBuilder />;
      case 'audit_logs': {
        const canAccessAudit = currentUser.role === 'super_admin' || currentUser.role === 'it_support';
        if (!canAccessAudit) {
          const redirectTarget = isInstaller
            ? 'installer_dashboard'
            : currentUser.role === 'leader'
            ? 'leader_portal'
            : currentUser.role === 'management_data'
            ? 'management_data_portal'
            : currentUser.role === 'dispatch'
            ? 'tickets'
            : 'dashboard';
          setTimeout(() => {
            setActiveTab(redirectTarget);
          }, 1500);
          return (
            <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border-2 border-rose-300 dark:border-rose-900 shadow-md max-w-lg mx-auto my-12 space-y-3">
              <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto font-bold text-lg">
                ✕
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Akses Ditolak: Otoritas Audit Log Dibatasi
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Audit Log dilindungi dan hanya dapat diakses oleh Super Admin dan IT Support (Read-Only). Role Anda ({currentUser.role}) tidak memiliki izin. Mengalihkan...
              </p>
            </div>
          );
        }
        return <AuditLogViewer />;
      }
      case 'system_health':
        return <SystemHealthView />;
      case 'templates': {
        const canAccessTemplates = currentUser.role === 'super_admin' || currentUser.role === 'dispatch';
        if (!canAccessTemplates) {
          const redirectTarget = isInstaller
            ? 'installer_dashboard'
            : currentUser.role === 'leader'
            ? 'leader_portal'
            : currentUser.role === 'management_data'
            ? 'management_data_portal'
            : 'dashboard';
          setTimeout(() => {
            setActiveTab(redirectTarget);
          }, 1500);
          return (
            <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border-2 border-rose-300 dark:border-rose-900 shadow-md max-w-lg mx-auto my-12 space-y-3">
              <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto font-bold text-lg">
                ✕
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Akses Ditolak: Khusus Superadmin & Dispatch
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Menu Template WhatsApp dilindungi dan hanya dapat diakses oleh Superadmin dan Dispatch. Role Anda ({currentUser.role}) tidak memiliki izin. Mengalihkan ke dashboard...
              </p>
            </div>
          );
        }
        return <TemplateBuilder />;
      }
      case 'workflows':
        return <WorkflowManager />;
      case 'offline_sync':
        return (
          <div className="p-8 bg-white dark:bg-[#1a0f30] rounded-2xl shadow-sm border border-[#D8CCF3] dark:border-[#3B1D78] text-center space-y-4 max-w-2xl mx-auto">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-inner">
              <Database className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#21183A] dark:text-[#F5F1FF]">Pusat Sinkronisasi Database Offline</h2>
              <p className="text-xs text-[#756B8D] dark:text-[#D8CCF3] mt-1">
                Sistem penyimpanan lokal IndexedDB dan antrean mutasi data saat berada di area tanpa sinyal internet.
              </p>
            </div>
            <div className="pt-2">
              <button
                onClick={openOfflineSyncCenter}
                className="px-6 py-2.5 bg-[#5B35B1] hover:bg-[#3B1D78] text-white font-bold text-xs rounded-xl shadow-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                Buka Panel Kontrol Sinkronisasi
              </button>
            </div>
          </div>
        );

      case 'setup':
        return <SetupHubView onNavigateTab={tab => setActiveTab(tab)} />;

      case 'nav_config':
        return <NavigationConfigView />;
      case 'sound_settings':
        return <SoundSettingsView />;
      case 'droplist_management':
      case 'setting_droplist_status':
      case 'setting_droplist_reason':
      case 'setting_droplist_rootcause':
        return <DroplistManagementView />;

      default:
        return <DashboardOverview onNavigate={tab => setActiveTab(tab)} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F1FF] dark:bg-[#140827] text-[#21183A] dark:text-[#F5F1FF] transition-colors relative">
      {/* Top Header */}
      <Header activeTab={activeTab} onNavigate={tab => navigateTo(tab)} />

      {/* Main Workspace Frame */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar: STRICTLY NOT RENDERED FOR INSTALLER */}
        {!isInstaller && (
          <Sidebar
            activeTab={activeTab}
            onNavigate={tab => navigateTo(tab)}
            sidebarState={currentSidebarState}
            onChangeState={state => setSidebarState(state)}
          />
        )}

        {/* Floating Open Menu Button when sidebar is closed on desktop */}
        {!isInstaller && currentSidebarState === 'closed' && !isDetailModalOpen && !isWhatsAppModalOpen && (
          <button
            onClick={() => setSidebarState('expanded')}
            className="hidden md:flex fixed bottom-6 left-6 z-30 items-center gap-2 px-3.5 py-2 bg-[#5B35B1] hover:bg-[#3B1D78] text-white text-xs font-semibold rounded-full shadow-lg transition-transform hover:scale-105 cursor-pointer"
            title="Buka Menu Navigasi"
          >
            <Menu className="w-4 h-4" />
            <span>Buka Menu</span>
          </button>
        )}

        {/* Content Viewport with responsive bottom navigation spacing */}
        <main
          className={`flex-1 overflow-y-auto p-3 sm:p-6 lg:p-8 ${
            isInstaller
              ? 'pb-28 sm:pb-24 w-full'
              : currentUser.role === 'leader'
              ? 'pb-24 sm:pb-20'
              : isMobileView && config.device?.android?.showBottomNavigation !== false
              ? 'pb-24'
              : ''
          }`}
        >
          <div
            className={
              isInstaller || isFullWidth || (config.device?.mode === 'pc' && config.device?.pc?.wideScreenFullWidth)
                ? 'w-full'
                : 'max-w-7xl mx-auto'
            }
          >
            {renderContent()}
          </div>
        </main>
      </div>

      {/* Bottom Ergonomic Navigation:
          - Dedicated 4-item Bar for Installer (Responsive across mobile, tablet, and desktop)
          - Dedicated 5-item Bar for Leader
          - Standard Android Bottom Navigation for other roles on mobile
      */}
      {isInstaller ? (
        <InstallerBottomNav
          activeTab={activeTab}
          onTabChange={tab => navigateTo(tab)}
          pendingTasksCount={installerPendingCount}
          unreadMessagesCount={installerUnreadChatCount}
        />
      ) : currentUser.role === 'leader' ? (
        <LeaderBottomNav
          activeTab={activeLeaderBottomTab}
          onTabChange={tab => {
            navigateTo(tab);
          }}
          unassignedCount={leaderUnassignedCount}
        />
      ) : (
        isMobileView && config.device?.android?.showBottomNavigation !== false && (
          <AndroidBottomNav
            activeTab={activeTab}
            onNavigate={tab => {
              navigateTo(tab);
              if (currentSidebarState === 'expanded') {
                setSidebarState('closed');
              }
            }}
            isMenuOpen={currentSidebarState === 'expanded'}
            onToggleMenu={() => {
              setSidebarState(currentSidebarState === 'expanded' ? 'closed' : 'expanded');
            }}
          />
        )
      )}

      {/* Modals & Offline Alerts */}
      <SessionManagementModal />
      <OfflineSyncModal />
      <OfflineBanner />

      <TicketDetailModal
        ticket={selectedTicket}
        isOpen={isDetailModalOpen}
        defaultTab={detailDefaultTab}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedTicket(null);
        }}
        onApprovedAndClosed={() => {
          setIsDetailModalOpen(false);
          setSelectedTicket(null);
          if (currentUser.role === 'dispatch') {
            navigateTo('dashboard');
          }
        }}
        onOpenWhatsApp={ticket => {
          setIsDetailModalOpen(false);
          handleOpenWhatsAppModal(ticket);
        }}
      />

      {whatsAppTicket && (
        <WhatsAppSendModal
          ticket={whatsAppTicket}
          isOpen={isWhatsAppModalOpen}
          onClose={() => {
            setIsWhatsAppModalOpen(false);
            setWhatsAppTicket(null);
          }}
        />
      )}
    </div>
  );
};

export default function App() {
  return (
    <ToastProvider>
      <AnimationProvider>
        <OfflineSyncProvider>
          <MoraJawsSoundProvider>
            <AppProvider>
              <UIConfigProvider>
                <MoraJawsErrorBoundary fallbackTitle="Kendala Antarmuka MoraJaws">
                  <MainLayout />
                </MoraJawsErrorBoundary>
              </UIConfigProvider>
            </AppProvider>
          </MoraJawsSoundProvider>
        </OfflineSyncProvider>
      </AnimationProvider>
    </ToastProvider>
  );
}
