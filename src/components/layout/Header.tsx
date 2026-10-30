import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useUIConfig } from '../../context/UIConfigContext';
import { UserRole } from '../../types/index.ts';
import {
  Truck,
  Sun,
  Moon,
  ShieldCheck,
  ChevronDown,
  Bell,
  CheckCircle,
  Smartphone,
  Monitor,
  Sparkles,
  Sliders,
  Building2,
  UserCheck,
  Wrench,
  Shield,
  Layers,
  Lock,
  Wifi,
  WifiOff,
  Database,
  RefreshCw,
  LogOut,
  MapPin,
  Users2
} from 'lucide-react';
import { useOfflineSync } from '../../context/OfflineSyncContext';
import { MoraJawsLogo } from '../common/MoraJawsLogo';
import { useAnimation } from '../../context/AnimationContext';
import { useToast } from '../../context/ToastContext';

interface HeaderProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, onNavigate }) => {
  const { currentUser, tickets, logout, contractorsList, areasList, firestoreStatus } = useApp();
  const { config, setGlobalTheme, setDeviceMode, applyDevicePreset } = useUIConfig();
  const { isOnline, isSyncing, pendingCount, setIsOfflineModalOpen, isSimulatedOffline } = useOfflineSync();
  const { triggerRefresh } = useAnimation();
  const { toast } = useToast();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false);

  const handleGlobalRefresh = async () => {
    await triggerRefresh(async () => {
      // Simulate or trigger active synchronization
      await new Promise(r => setTimeout(r, 600));
    }, 'SINKRONISASI MORAJAWS...', 'Menyelaraskan data Work Order, Schedule & Status');
    toast.sync('Sinkronisasi database berhasil.');
  };

  const activeContractor = currentUser.contractor || (contractorsList?.[0] || 'PT Mitra Jaringan Solusi');
  const activeArea = currentUser.area || (areasList?.[0] || 'Jakarta Selatan');

  const pendingConfirmations = tickets.filter(t => t.statusWhatsApp === 'opened_in_whatsapp' || t.statusWhatsApp === 'awaiting_confirmation').length;
  const unassignedCount = tickets.filter(t => !t.installerName && !t.isArchived).length;
  const currentDeviceMode = config.device?.mode || 'auto';

  const toggleTheme = () => {
    const nextMode = config.global.themeMode === 'dark' ? 'light' : 'dark';
    setGlobalTheme({ themeMode: nextMode });
  };

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case 'super_admin':
        return <ShieldCheck className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />;
      case 'dispatch':
        return <Shield className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />;
      case 'leader':
        return <Building2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />;
      case 'installer':
        return <Wrench className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />;
      case 'management_data':
        return <Database className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />;
    }
  };

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6 py-3 bg-white/95 dark:bg-[#160D29]/95 backdrop-blur-md border-b border-[#D8CCF3] dark:border-[#35105E] transition-colors shadow-2xs">
      {/* Zone 1: Menu toggle & Brand wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={() => {
            const current = config.global.sidebarState || 'expanded';
            if (current === 'closed') {
              setGlobalTheme({ sidebarState: 'expanded', sidebarCollapsed: false });
            } else if (current === 'expanded') {
              setGlobalTheme({ sidebarState: 'minimized', sidebarCollapsed: true });
            } else {
              setGlobalTheme({ sidebarState: 'expanded', sidebarCollapsed: false });
            }
          }}
          className="p-1.5 text-[#3B1D78] hover:text-[#5B35B1] dark:text-[#E9D5FF] dark:hover:text-white hover:bg-[#E9E1FF]/50 dark:hover:bg-[#35105E]/50 rounded-lg transition-colors cursor-pointer"
          title="Buka / Minimize Sidebar"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Custom MoraJaws 3D Glossy Logo */}
        <div className="hover:scale-105 transition-transform duration-200">
          <MoraJawsLogo size="sm" animated={false} />
        </div>
        <div className="flex flex-col">
          <span className="text-base font-bold tracking-tight text-[#21183A] dark:text-[#FFFFFF] whitespace-nowrap">
            {config.global.appName || 'MoraJaws'}
          </span>
          {activeTab === 'leader_portal' ? (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-300 font-semibold truncate max-w-[220px] sm:max-w-xs">
              <span className="truncate">{activeContractor}</span>
              <span className="text-amber-400">•</span>
              <span className="truncate">Area: {activeArea}</span>
            </div>
          ) : (
            <span className="text-[10.5px] text-[#756B8D] dark:text-[#D8CCF3] font-medium hidden sm:inline">
              Dispatch & Work Order Operations
            </span>
          )}
        </div>
      </div>

      {/* Zone 2: Navigation Links */}
      <nav className="hidden lg:flex items-center gap-5 text-xs font-semibold text-[#756B8D] dark:text-[#D8CCF3]">
        <button
          onClick={() => onNavigate('dashboard')}
          className={`hover:text-[#5B35B1] dark:hover:text-[#E9E1FF] transition-colors whitespace-nowrap pb-1 cursor-pointer ${
            activeTab === 'dashboard' ? 'text-[#5B35B1] dark:text-[#E9E1FF] border-b-2 border-[#5B35B1] dark:border-[#8064D9] font-bold' : ''
          }`}
        >
          Dashboard
        </button>
        <button
          onClick={() => onNavigate('tickets')}
          className={`hover:text-[#5B35B1] dark:hover:text-[#E9E1FF] transition-colors whitespace-nowrap pb-1 cursor-pointer ${
            activeTab === 'tickets' ? 'text-[#5B35B1] dark:text-[#E9E1FF] border-b-2 border-[#5B35B1] dark:border-[#8064D9] font-bold' : ''
          }`}
        >
          Ticket MyRepublic ({tickets.filter(t => !t.isArchived).length})
        </button>

        {(currentUser.role === 'super_admin' || currentUser.role === 'leader') && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('leader_portal')}
              className={`hover:text-[#5B35B1] dark:hover:text-[#E9E1FF] transition-colors whitespace-nowrap pb-1 cursor-pointer ${
                activeTab === 'leader_portal' ? 'text-[#5B35B1] dark:text-[#E9E1FF] border-b-2 border-[#5B35B1] dark:border-[#8064D9] font-bold' : ''
              }`}
            >
              Dashboard Leader
            </button>
            {activeTab === 'leader_portal' && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700/80 shadow-2xs">
                <span className="flex items-center gap-1 font-bold text-amber-900 dark:text-amber-100">
                  <Building2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>{activeContractor}</span>
                </span>
                <span className="text-amber-300 dark:text-amber-700 font-light">•</span>
                <span className="flex items-center gap-1 font-medium text-amber-800 dark:text-amber-300">
                  <MapPin className="w-3.5 h-3.5 text-amber-500" />
                  <span>Area: {activeArea}</span>
                </span>
              </div>
            )}
          </div>
        )}

        {(currentUser.role === 'super_admin' || currentUser.role === 'installer') && (
          <button
            onClick={() => onNavigate('installer_portal')}
            className={`hover:text-[#5B35B1] dark:hover:text-[#E9E1FF] transition-colors whitespace-nowrap pb-1 cursor-pointer ${
              activeTab === 'installer_portal' ? 'text-[#5B35B1] dark:text-[#E9E1FF] border-b-2 border-[#5B35B1] dark:border-[#8064D9] font-bold' : ''
            }`}
          >
            Portal Teknisi
          </button>
        )}

        {currentUser.role === 'super_admin' && (
          <button
            onClick={() => onNavigate('sheets_sync')}
            className={`hover:text-[#5B35B1] dark:hover:text-[#E9E1FF] transition-colors whitespace-nowrap pb-1 flex items-center gap-1 cursor-pointer ${
              activeTab === 'sheets_sync' ? 'text-[#5B35B1] dark:text-[#E9E1FF] border-b-2 border-[#5B35B1] dark:border-[#8064D9] font-bold' : ''
            }`}
          >
            <span>Google Sheets</span>
          </button>
        )}

        {currentUser.role === 'super_admin' && (
          <button
            onClick={() => onNavigate('users')}
            className={`hover:text-[#5B35B1] dark:hover:text-[#E9E1FF] transition-colors whitespace-nowrap pb-1 cursor-pointer ${
              activeTab === 'users' ? 'text-[#5B35B1] dark:text-[#E9E1FF] border-b-2 border-[#5B35B1] dark:border-[#8064D9] font-bold' : ''
            }`}
          >
            Manajemen Akun
          </button>
        )}
      </nav>

      {/* Zone 3: Actions & Profile switcher */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Global MoraJaws Refresh Button */}
        <button
          type="button"
          onClick={handleGlobalRefresh}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-[#D8B4FE]/40 bg-[#35105E]/40 hover:bg-[#7135B5]/60 text-[#D8B4FE] hover:text-white shadow-[0_0_12px_rgba(113,53,181,0.2)] transition-all hover:scale-105 active:scale-95 cursor-pointer"
          title="Sinkronisasi & Refresh Data MoraJaws"
        >
          <RefreshCw className="w-3.5 h-3.5 text-[#D8B4FE]" />
          <span className="hidden md:inline font-bold">Refresh</span>
        </button>

        {/* Offline Sync & Connectivity Badge Button */}
        <button
          type="button"
          onClick={() => setIsOfflineModalOpen(true)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
            !isOnline
              ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
              : pendingCount > 0
              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800'
              : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
          }`}
          title="Klik untuk membuka Pusat Sinkronisasi Database Offline"
        >
          {!isOnline ? (
            <>
              <WifiOff className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
              <span className="hidden sm:inline">{isSimulatedOffline ? 'Simulasi' : 'Offline'}</span>
            </>
          ) : isSyncing ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />
              <span className="hidden sm:inline">Syncing...</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="hidden sm:inline">Online</span>
            </>
          )}

          {pendingCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white">
              {pendingCount}
            </span>
          )}
        </button>

        {/* Cloud Firestore Live Status Badge */}
        <div
          className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
            firestoreStatus === 'connected'
              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800/80'
              : firestoreStatus === 'connecting'
              ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800 animate-pulse'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800'
          }`}
          title="Cloud Firestore Real-time Database (Project: sonic-ripple-cxtlg)"
        >
          <Database className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span className="font-bold">
            {firestoreStatus === 'connected'
              ? 'Firestore Live'
              : firestoreStatus === 'connecting'
              ? 'Connecting...'
              : 'Firestore Offline'}
          </span>
        </div>

        {/* Device Mode Switcher (Auto / PC / Android) */}
        <div className="relative">
          <button
            onClick={() => {
              setDeviceMenuOpen(!deviceMenuOpen);
              setUserMenuOpen(false);
              setNotifOpen(false);
            }}
            className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              currentDeviceMode === 'android'
                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                : currentDeviceMode === 'pc'
                ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
            }`}
            title="Pilih Profil Tampilan UI (Android vs PC)"
          >
            {currentDeviceMode === 'android' ? (
              <Smartphone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : currentDeviceMode === 'pc' ? (
              <Monitor className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            )}
            <span className="hidden sm:inline capitalize">
              {currentDeviceMode === 'android' ? 'Android' : currentDeviceMode === 'pc' ? 'PC' : 'Auto UI'}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {deviceMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setDeviceMenuOpen(false)} />
              <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1.5 z-50 text-xs">
                <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                  <span className="font-semibold text-slate-900 dark:text-white">Profil Tata Letak</span>
                  <button
                    onClick={() => {
                      setDeviceMenuOpen(false);
                      onNavigate('ui_builder');
                    }}
                    className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold hover:underline flex items-center gap-1"
                  >
                    <Sliders className="w-3 h-3" />
                    <span>Setting UI</span>
                  </button>
                </div>

                <div className="p-1 space-y-1">
                  <button
                    onClick={() => {
                      applyDevicePreset('comfortable_android');
                      setDeviceMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg flex items-start gap-2.5 transition-colors ${
                      currentDeviceMode === 'android'
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 font-semibold'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-semibold">Mode Android / Layar Sentuh</div>
                      <div className="text-[11px] text-slate-400">Kartu jempol nyaman, tombol sentuh besar & dock navigasi bawah.</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      applyDevicePreset('high_productivity_pc');
                      setDeviceMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg flex items-start gap-2.5 transition-colors ${
                      currentDeviceMode === 'pc'
                        ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-200 font-semibold'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <Monitor className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-semibold">Mode PC / Desktop</div>
                      <div className="text-[11px] text-slate-400">Grid multi-kolom padat, kolom WO & aksi sticky, monitor lebar.</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      applyDevicePreset('auto');
                      setDeviceMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg flex items-start gap-2.5 transition-colors ${
                      currentDeviceMode === 'auto'
                        ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-200 font-semibold'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <Sparkles className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-semibold">Otomatis (Adaptif Lebar Layar)</div>
                      <div className="text-[11px] text-slate-400">Menyesuaikan responsif sesuai resolusi perangkat saat dibuka.</div>
                    </div>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Theme mode toggle */}
        <button
          onClick={toggleTheme}
          aria-label="Toggle Dark Mode"
          className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {config.global.themeMode === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* User Account / Role Switcher */}
        <div className="relative">
          <button
            onClick={() => {
              setUserMenuOpen(!userMenuOpen);
              setNotifOpen(false);
              setDeviceMenuOpen(false);
            }}
            className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors border border-slate-200 dark:border-slate-700"
          >
            {getRoleIcon(currentUser.role)}
            <div className="text-left hidden sm:block">
              <div className="font-bold leading-tight">{currentUser.name}</div>
              <div className="text-[10px] text-slate-400 capitalize font-normal">
                {currentUser.role.replace('_', ' ')} {currentUser.contractor ? `· ${currentUser.contractor.split(' ')[1] || ''}` : ''}
              </div>
            </div>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1.5 z-50 text-xs">
                <div className="px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-700">
                  <div className="font-bold text-slate-900 dark:text-white text-xs">{currentUser.name}</div>
                  <div className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400">@{currentUser.username}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 space-y-0.5">
                    <div>
                      Peran: <span className="font-semibold capitalize text-slate-700 dark:text-slate-300">{currentUser.role.replace('_', ' ')}</span>
                    </div>
                    {currentUser.contractor && (
                      <div className="text-amber-600 dark:text-amber-400">
                        Vendor: {currentUser.contractor}
                      </div>
                    )}
                    {currentUser.area && (
                      <div className="text-slate-500">
                        Wilayah: {currentUser.area}
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-1.5 flex flex-col gap-1">
                  {currentUser.role === 'super_admin' && (
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        onNavigate('users');
                      }}
                      className="w-full text-left py-1.5 px-2.5 rounded text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60 flex items-center justify-between"
                    >
                      <span>Manajemen Akun & Pengguna</span>
                      <span>&rarr;</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      logout();
                    }}
                    className="w-full text-center py-2 px-2 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer mt-1"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Keluar / Logout dari Sistem</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
