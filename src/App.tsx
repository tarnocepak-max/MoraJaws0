import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { UIConfigProvider, useUIConfig } from './context/UIConfigContext';
import { ToastProvider } from './context/ToastContext';
import { AnimationProvider } from './context/AnimationContext';
import { OfflineSyncProvider } from './context/OfflineSyncContext';

import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { AndroidBottomNav } from './components/layout/AndroidBottomNav';

import { DashboardOverview } from './components/dashboard/DashboardOverview';
import { TicketsTable } from './components/tickets/TicketsTable';
import { FormSamedayView } from './components/sameday/FormSamedayView';
import { ReportDataWOView } from './components/reports/ReportDataWOView';
import { ScheduleCalendarView } from './components/schedule/ScheduleCalendarView';
import { LoginLogView } from './components/audit/LoginLogView';
import { SettingDroplistView } from './components/settings/SettingDroplistView';

import { LeaderPortal } from './components/portals/LeaderPortal';
import { LocationBasecampView } from './components/contractors/LocationBasecampView';
import { InstallerPortal } from './components/portals/InstallerPortal';
import { ContactCentreView } from './components/contact/ContactCentreView';
import { ManagementDataPortal } from './components/portals/ManagementDataPortal';

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

const MainLayout: React.FC = () => {
  const { currentUser, isLoggedIn, openOfflineSyncCenter } = useApp();
  const { config, setSidebarState, isMobileView } = useUIConfig();

  const [activeTab, setActiveTab] = useState<string>(() => {
    if (currentUser.role === 'installer') return 'installer_portal';
    if (currentUser.role === 'leader') return 'leader_portal';
    if (currentUser.role === 'management_data') return 'management_data_portal';
    if (currentUser.role === 'dispatch') return 'tickets';
    return 'dashboard';
  });

  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailDefaultTab, setDetailDefaultTab] = useState<'overview' | 'report' | 'chat' | 'history'>('overview');
  const [whatsAppTicket, setWhatsAppTicket] = useState<Ticket | null>(null);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);

  // Unauthenticated Staff Protection: Render dedicated Staff Login Portal
  if (!isLoggedIn) {
    return (
      <StaffLoginPortal
        onLoginSuccess={(role) => {
          if (role === 'installer') setActiveTab('installer_portal');
          else if (role === 'leader') setActiveTab('leader_portal');
          else if (role === 'management_data') setActiveTab('management_data_portal');
          else if (role === 'dispatch') setActiveTab('tickets');
          else setActiveTab('dashboard');
        }}
      />
    );
  }

  const handleOpenTicketDetail = (ticket: Ticket, defaultTab: 'overview' | 'report' | 'chat' | 'history' = 'overview') => {
    if (currentUser.role === 'installer' && activeTab === 'installer_portal') {
      // Installer uses the dedicated fullview experience inside InstallerPortal
      return;
    }
    setSelectedTicket(ticket);
    setDetailDefaultTab(defaultTab);
    setIsDetailModalOpen(true);
  };

  const handleOpenWhatsAppModal = (ticket: Ticket) => {
    setWhatsAppTicket(ticket);
    setIsWhatsAppModalOpen(true);
  };

  const isFullWidth = config.global.contentWidth === 'full';
  const currentSidebarState = config.global.sidebarState || (config.global.sidebarCollapsed ? 'minimized' : 'expanded');

  // Render view based on active tab with fallback
  const renderContent = () => {
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
      case 'login_logs':
        return <LoginLogView />;
      case 'setting_droplist':
        return <SettingDroplistView />;

      // Leader & Contractor Basecamp
      case 'leader_portal':
        return (
          <LeaderPortal
            onSelectTicket={handleOpenTicketDetail}
            onOpenWhatsApp={handleOpenWhatsAppModal}
          />
        );
      case 'location_basecamp':
      case 'contractors':
        return <LocationBasecampView />;

      // Technician Portal
      case 'installer_portal':
        return (
          <InstallerPortal
            onSelectTicket={handleOpenTicketDetail}
            onOpenWhatsApp={handleOpenWhatsAppModal}
          />
        );

      // Contact & Messaging
      case 'contact_centre':
        return <ContactCentreView />;

      // Data Operations & Sync
      case 'management_data_portal':
        return (
          <ManagementDataPortal
            onSelectTicket={handleOpenTicketDetail}
            onOpenWhatsApp={handleOpenWhatsAppModal}
          />
        );
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
      case 'audit_logs':
        return <AuditLogViewer />;
      case 'system_health':
        return <SystemHealthView />;
      case 'templates':
        return <TemplateBuilder />;
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

      default:
        return <DashboardOverview onNavigate={tab => setActiveTab(tab)} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F1FF] dark:bg-[#140827] text-[#21183A] dark:text-[#F5F1FF] transition-colors relative">
      {/* Top Header */}
      <Header activeTab={activeTab} onNavigate={tab => setActiveTab(tab)} />

      {/* Main Workspace Frame */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onNavigate={tab => setActiveTab(tab)}
          sidebarState={currentSidebarState}
          onChangeState={state => setSidebarState(state)}
        />

        {/* Floating Open Menu Button when sidebar is closed on desktop */}
        {currentSidebarState === 'closed' && !isDetailModalOpen && !isWhatsAppModalOpen && (
          <button
            onClick={() => setSidebarState('expanded')}
            className="hidden md:flex fixed bottom-6 left-6 z-30 items-center gap-2 px-3.5 py-2 bg-[#5B35B1] hover:bg-[#3B1D78] text-white text-xs font-semibold rounded-full shadow-lg transition-transform hover:scale-105 cursor-pointer"
            title="Buka Menu Navigasi"
          >
            <Menu className="w-4 h-4" />
            <span>Buka Menu</span>
          </button>
        )}

        {/* Content Viewport with mobile bottom navigation spacing */}
        <main
          className={`flex-1 overflow-y-auto p-3 sm:p-6 lg:p-8 ${
            isMobileView && config.device?.android?.showBottomNavigation !== false ? 'pb-24' : ''
          }`}
        >
          <div
            className={
              isFullWidth || (config.device?.mode === 'pc' && config.device?.pc?.wideScreenFullWidth)
                ? 'w-full'
                : 'max-w-7xl mx-auto'
            }
          >
            {renderContent()}
          </div>
        </main>
      </div>

      {/* Android / Mobile Bottom Ergonomic Navigation */}
      {isMobileView && config.device?.android?.showBottomNavigation !== false && (
        <AndroidBottomNav
          activeTab={activeTab}
          onNavigate={tab => {
            setActiveTab(tab);
            if (currentSidebarState === 'expanded') {
              setSidebarState('closed');
            }
          }}
          isMenuOpen={currentSidebarState === 'expanded'}
          onToggleMenu={() => {
            setSidebarState(currentSidebarState === 'expanded' ? 'closed' : 'expanded');
          }}
        />
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
          <AppProvider>
            <UIConfigProvider>
              <MainLayout />
            </UIConfigProvider>
          </AppProvider>
        </OfflineSyncProvider>
      </AnimationProvider>
    </ToastProvider>
  );
}
