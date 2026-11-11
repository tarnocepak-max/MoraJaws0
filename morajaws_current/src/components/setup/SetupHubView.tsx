import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Sliders,
  Users,
  Shield,
  List,
  MessageSquare,
  Volume2,
  LayoutTemplate,
  Database,
  GitBranch,
  Activity,
  Server,
  FileSpreadsheet,
  Lock,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  FolderTree,
  Building2
} from 'lucide-react';

// Sub-components
import { SystemSettings } from '../settings/SystemSettings';
import { UserManagementView } from '../users/UserManagementView';
import { ManagementRoleView } from '../users/ManagementRoleView';
import { DroplistManagementView } from '../settings/DroplistManagementView';
import { TemplateBuilder } from '../whatsapp/TemplateBuilder';
import { SoundSettingsView } from '../settings/SoundSettingsView';
import { UIConfigurationBuilder } from '../uiBuilder/UIConfigurationBuilder';
import { DatabaseManagementView } from '../database/DatabaseManagementView';
import { DatabaseSyncMonitoringView } from '../database/DatabaseSyncMonitoringView';
import { GoogleSheetsSyncView } from '../sheets/GoogleSheetsSyncView';
import { WorkflowManager } from '../workflows/WorkflowManager';
import { SystemHealthView } from '../settings/SystemHealthView';
import { AuditLogViewer } from '../audit/AuditLogViewer';
import { LoginLogView } from '../audit/LoginLogView';
import { NavigationConfigView } from './NavigationConfigView';

export type SetupTabKey =
  | 'master_data'
  | 'general'
  | 'nav_config'
  | 'users'
  | 'roles'
  | 'droplists'
  | 'whatsapp'
  | 'sound'
  | 'ui_builder'
  | 'database'
  | 'workflows'
  | 'health_logs';

interface SetupHubViewProps {
  initialTab?: SetupTabKey;
  onNavigateTab?: (tab: string) => void;
}

export const SetupHubView: React.FC<SetupHubViewProps> = ({
  initialTab = 'master_data',
  onNavigateTab
}) => {
  const { currentUser } = useApp();
  const [activeTab, setActiveTab] = useState<SetupTabKey>(initialTab);
  const [dbSubTab, setDbSubTab] = useState<'management' | 'monitoring' | 'sheets'>('management');
  const [logSubTab, setLogSubTab] = useState<'health' | 'audit' | 'login'>('health');

  const userRole = currentUser?.role || 'installer';

  // Check role-based tab access
  const isSuperadmin = userRole === 'super_admin';
  const isDispatch = userRole === 'dispatch';
  const isManagement = userRole === 'management_data';
  const isLeader = userRole === 'leader';

  const accessibleTabs = useMemo(() => {
    const tabs: { key: SetupTabKey; label: string; icon: React.ElementType; badge?: string }[] = [];

    // 1. Konfigurasi Master Data (Super Admin & Management Data)
    if (isSuperadmin || isManagement) {
      tabs.push({ key: 'master_data', label: 'Konfigurasi Master Data', icon: Building2 });
    }

    // 2. Pengaturan Aplikasi
    tabs.push({ key: 'general', label: 'Pengaturan Aplikasi', icon: Sliders });

    // 3. Menu Navigation Config (Superadmin full edit, others view)
    tabs.push({ key: 'nav_config', label: 'Konfigurasi Menu Navigasi', icon: FolderTree, badge: 'Nav' });

    // 4. Users & Roles (Superadmin only)
    if (isSuperadmin) {
      tabs.push({ key: 'users', label: 'Manajemen Pengguna', icon: Users });
      tabs.push({ key: 'roles', label: 'Role & Otoritas', icon: Shield });
    }

    // 5. Kategori Report (Superadmin, Dispatch, Management Data)
    if (isSuperadmin || isDispatch || isManagement) {
      tabs.push({ key: 'droplists', label: 'Kategori Report', icon: List });
    }

    // 6. WhatsApp Templates (Superadmin & Dispatch ONLY - Requirement 5)
    if (isSuperadmin || isDispatch) {
      tabs.push({ key: 'whatsapp', label: 'Template WhatsApp', icon: MessageSquare });
    }

    // 7. Sound / Audio Settings (All roles)
    tabs.push({ key: 'sound', label: 'Notifikasi & Audio', icon: Volume2 });

    // 8. UI Configuration / Columns
    tabs.push({ key: 'ui_builder', label: 'Kolom & Tampilan UI', icon: LayoutTemplate });

    // 9. Database & Sync (Superadmin & Management Data)
    if (isSuperadmin || isManagement) {
      tabs.push({ key: 'database', label: 'Database & Sinkronisasi', icon: Database, badge: 'Sync' });
    }

    // 10. Workflows (Superadmin & Dispatch)
    if (isSuperadmin || isDispatch) {
      tabs.push({ key: 'workflows', label: 'Workflows & Otomasi', icon: GitBranch });
    }

    // 11. System Health & Logs (Superadmin only)
    if (isSuperadmin) {
      tabs.push({ key: 'health_logs', label: 'Kesehatan & Log', icon: Activity });
    }

    return tabs;
  }, [isSuperadmin, isDispatch, isManagement, isLeader]);

  // Ensure active tab is allowed, otherwise fallback to first accessible
  const currentTab = accessibleTabs.some(t => t.key === activeTab) ? activeTab : (accessibleTabs[0]?.key || 'general');

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-[#1E0F3D] via-[#35105E] to-[#4C1D95] rounded-2xl p-5 text-white shadow-lg border border-[#7135B5]/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-[#5B35B1]/50 border border-[#D8B4FE]/40 flex items-center justify-center text-[#D8B4FE] shadow-inner">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  <span>SETUP TERPUSAT MORAJAWS</span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#A855F7]/30 border border-[#D8B4FE]/40 text-[#E9D5FF]">
                    Central Config
                  </span>
                </h1>
                <p className="text-xs text-[#D8B4FE]/90">
                  Konsol pusat konfigurasi aplikasi, pengguna, otoritas, droplist, notifikasi, integrasi database, dan audit trail.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto bg-black/25 px-3 py-1.5 rounded-xl border border-white/10 text-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-slate-300">Hak Akses:</span>
            <span className="font-bold font-mono uppercase text-[#E9D5FF]">
              {currentUser?.role?.replace('_', ' ')}
            </span>
          </div>
        </div>

        {/* Tab Navigation Ribbon */}
        <div className="mt-5 pt-3 border-t border-white/10 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          {accessibleTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-white text-[#35105E] font-bold shadow-md transform -translate-y-0.5'
                    : 'text-purple-200 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#5B35B1]' : 'text-purple-300'}`} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                    isActive ? 'bg-[#5B35B1] text-white' : 'bg-purple-800 text-purple-200'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Tab Content View */}
      <div className="transition-all">
        {/* 1. Konfigurasi Master Data */}
        {currentTab === 'master_data' && (
          <div className="space-y-4">
            <SystemSettings defaultTab="contractors" />
          </div>
        )}

        {/* 2. Pengaturan Aplikasi */}
        {currentTab === 'general' && (
          <div className="space-y-4">
            <SystemSettings defaultTab="branding" />
          </div>
        )}

        {/* 1B. Konfigurasi Menu Navigasi */}
        {currentTab === 'nav_config' && (
          <div className="space-y-4">
            <NavigationConfigView />
          </div>
        )}

        {/* 2. Manajemen Pengguna */}
        {currentTab === 'users' && isSuperadmin && (
          <div className="space-y-4">
            <UserManagementView />
          </div>
        )}

        {/* 3. Role & Otoritas */}
        {currentTab === 'roles' && isSuperadmin && (
          <div className="space-y-4">
            <ManagementRoleView />
          </div>
        )}

        {/* 4. Droplist Management */}
        {currentTab === 'droplists' && (
          <div className="space-y-4">
            <DroplistManagementView />
          </div>
        )}

        {/* 5. Template WhatsApp */}
        {currentTab === 'whatsapp' && (
          <div className="space-y-4">
            <TemplateBuilder />
          </div>
        )}

        {/* 6. Notifikasi & Audio */}
        {currentTab === 'sound' && (
          <div className="space-y-4">
            <SoundSettingsView />
          </div>
        )}

        {/* 7. Kolom & Tampilan UI */}
        {currentTab === 'ui_builder' && (
          <div className="space-y-4">
            <UIConfigurationBuilder />
          </div>
        )}

        {/* 8. Database & Sinkronisasi */}
        {currentTab === 'database' && (isSuperadmin || isManagement) && (
          <div className="space-y-4">
            {/* Sub-tab Switcher for Database */}
            <div className="flex items-center gap-2 p-1.5 bg-slate-100 dark:bg-[#1A0E2E] rounded-xl border border-slate-200 dark:border-purple-900/60 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setDbSubTab('management')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  dbSubTab === 'management'
                    ? 'bg-[#5B35B1] text-white shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span>Firestore & Backup</span>
              </button>
              <button
                type="button"
                onClick={() => setDbSubTab('monitoring')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  dbSubTab === 'monitoring'
                    ? 'bg-[#5B35B1] text-white shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Server className="w-3.5 h-3.5" />
                <span>Monitoring Realtime Sync</span>
              </button>
              <button
                type="button"
                onClick={() => setDbSubTab('sheets')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  dbSubTab === 'sheets'
                    ? 'bg-[#5B35B1] text-white shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                <span>Google Sheets Live Sync</span>
              </button>
            </div>

            {dbSubTab === 'management' && <DatabaseManagementView />}
            {dbSubTab === 'monitoring' && <DatabaseSyncMonitoringView />}
            {dbSubTab === 'sheets' && <GoogleSheetsSyncView />}
          </div>
        )}

        {/* 9. Workflows & Otomasi */}
        {currentTab === 'workflows' && (isSuperadmin || isDispatch) && (
          <div className="space-y-4">
            <WorkflowManager />
          </div>
        )}

        {/* 10. Kesehatan & Log Sistem */}
        {currentTab === 'health_logs' && isSuperadmin && (
          <div className="space-y-4">
            {/* Sub-tab Switcher for Logs */}
            <div className="flex items-center gap-2 p-1.5 bg-slate-100 dark:bg-[#1A0E2E] rounded-xl border border-slate-200 dark:border-purple-900/60 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setLogSubTab('health')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  logSubTab === 'health'
                    ? 'bg-[#5B35B1] text-white shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Status Kesehatan Sistem</span>
              </button>
              <button
                type="button"
                onClick={() => setLogSubTab('audit')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  logSubTab === 'audit'
                    ? 'bg-[#5B35B1] text-white shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Audit Trail Log</span>
              </button>
              <button
                type="button"
                onClick={() => setLogSubTab('login')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  logSubTab === 'login'
                    ? 'bg-[#5B35B1] text-white shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Riwayat Sesi & Login</span>
              </button>
            </div>

            {logSubTab === 'health' && <SystemHealthView />}
            {logSubTab === 'audit' && <AuditLogViewer />}
            {logSubTab === 'login' && <LoginLogView />}
          </div>
        )}
      </div>
    </div>
  );
};
