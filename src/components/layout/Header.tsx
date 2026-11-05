import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useUIConfig } from '../../context/UIConfigContext';
import { UserRole } from '../../types/index.ts';
import {
  Truck,
  ShieldCheck,
  ChevronDown,
  Bell,
  CheckCircle,
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
import { useMoraJawsSound } from '../../context/SoundContext';

interface HeaderProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, onNavigate }) => {
  const {
    currentUser,
    tickets,
    logout,
    contractorsList,
    areasList,
    firestoreStatus,
    syncStatus,
    lastSyncTime,
    refreshFirestoreData
  } = useApp();
  const { config, setGlobalTheme, setDeviceMode, applyDevicePreset } = useUIConfig();
  const { isOnline, isSyncing, pendingCount, setIsOfflineModalOpen, isSimulatedOffline } = useOfflineSync();
  const { triggerRefresh } = useAnimation();
  const { toast } = useToast();
  const { playSyncSound } = useMoraJawsSound();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleGlobalRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      playSyncSound();
      await triggerRefresh(async () => {
        await refreshFirestoreData();
      }, 'SINKRONISASI REAL-TIME CLOUD...', 'Menyelaraskan data Work Order, Statistik, Jadwal, dan Konfigurasi');
      toast.success('Sinkronisasi dan Refresh Berhasil');
    } catch (err) {
      console.error('Refresh error:', err);
      toast.error('Gagal memperbarui data dari server');
    } finally {
      setIsRefreshing(false);
    }
  };

  const activeContractor = currentUser.contractor || (contractorsList?.[0] || 'PT Mitra Jaringan Solusi');
  const activeArea = currentUser.area || (areasList?.[0] || 'Jakarta Selatan');

  // Requirement 1: Ticket indicators strictly calculate WO with Appointment Date = Today (Asia/Jakarta)
  const todayWIB = React.useMemo(() => {
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

  const todayTickets = React.useMemo(() => {
    return tickets.filter(t => {
      if (t.isArchived || t.isDeleted) return false;
      const raw = t.appointmentDate;
      if (!raw) return false;
      const clean = String(raw).slice(0, 10);
      return clean === todayWIB || (raw.includes('T') && raw.split('T')[0] === todayWIB);
    });
  }, [tickets, todayWIB]);

  const pendingConfirmations = todayTickets.filter(t => t.statusWhatsApp === 'opened_in_whatsapp' || t.statusWhatsApp === 'awaiting_confirmation').length;
  const unassignedCount = todayTickets.filter(t => !t.installerName).length;

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
        {currentUser.role !== 'installer' && (
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
        )}

        {/* Custom MoraJaws 3D Glossy Logo */}
        <div className="hover:scale-105 transition-transform duration-200">
          <MoraJawsLogo size="sm" animated={false} />
        </div>
        <div className="flex flex-col">
          <span className="text-base font-bold tracking-tight text-[#21183A] dark:text-[#FFFFFF] whitespace-nowrap">
            {config.global.appName || 'MoraJaws'}
          </span>
          {currentUser.role === 'installer' ? (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold truncate max-w-[220px] sm:max-w-xs">
              <span className="truncate">{currentUser.name}</span>
              <span className="text-emerald-400">•</span>
              <span className="truncate">{currentUser.contractor || 'Teknisi Lapangan'}</span>
            </div>
          ) : activeTab === 'leader_portal' ? (
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

      {/* Zone 2: Navigation Links (Excluded for Installer: strictly uses Bottom Navigation) */}
      {currentUser.role !== 'installer' && (
        <nav className="hidden lg:flex items-center gap-5 text-xs font-semibold text-[#756B8D] dark:text-[#D8CCF3]">
          <button
            onClick={() => onNavigate('dashboard')}
            className={`hover:text-[#5B35B1] dark:hover:text-[#E9E1FF] transition-colors whitespace-nowrap pb-1 cursor-pointer ${
              activeTab === 'dashboard' ? 'text-[#5B35B1] dark:text-[#E9E1FF] border-b-2 border-[#5B35B1] dark:border-[#8064D9] font-bold' : ''
            }`}
          >
            Dashboard
          </button>
          {(currentUser.role === 'super_admin' || currentUser.role === 'dispatch') && (
            <button
              onClick={() => onNavigate('tickets')}
              className={`hover:text-[#5B35B1] dark:hover:text-[#E9E1FF] transition-colors whitespace-nowrap pb-1 cursor-pointer ${
                activeTab === 'tickets' ? 'text-[#5B35B1] dark:text-[#E9E1FF] border-b-2 border-[#5B35B1] dark:border-[#8064D9] font-bold' : ''
              }`}
            >
              Work Order Management
            </button>
          )}

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

          <button
            onClick={() => onNavigate('setup')}
            className={`hover:text-[#5B35B1] dark:hover:text-[#E9E1FF] transition-colors whitespace-nowrap pb-1 cursor-pointer ${
              activeTab === 'setup' ? 'text-[#5B35B1] dark:text-[#E9E1FF] border-b-2 border-[#5B35B1] dark:border-[#8064D9] font-bold' : ''
            }`}
          >
            Setup
          </button>
        </nav>
      )}

      {/* Zone 3: Actions & Profile switcher */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Global MoraJaws Refresh Button (Requirement 6) */}
        <button
          type="button"
          onClick={handleGlobalRefresh}
          disabled={isRefreshing}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border-2 border-[#D8B4FE] bg-gradient-to-r from-[#5B35B1] via-[#7135B5] to-[#8064D9] hover:from-[#4C1D95] hover:to-[#6D28D9] text-white shadow-[0_0_16px_rgba(216,180,254,0.45)] transition-all cursor-pointer ${
            isRefreshing ? 'opacity-70 cursor-not-allowed scale-95' : 'hover:scale-105 active:scale-95'
          }`}
          title="Sinkronisasi & Refresh"
        >
          <RefreshCw className={`w-4 h-4 text-white ${isRefreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline font-bold tracking-wide">
            {isRefreshing ? 'Menyinkronkan...' : 'Sinkronisasi'}
          </span>
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

        {/* Cloud Firestore Live Status Badge (Requirement F: 5 Lifecycle States) */}
        <div
          className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-help ${
            syncStatus === 'SAVED'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800/80'
              : syncStatus === 'SYNCING'
              ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800 animate-pulse'
              : syncStatus === 'LOADING'
              ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800'
              : syncStatus === 'OFFLINE'
              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800'
          }`}
          title={`Cloud Firestore Status: ${syncStatus}${lastSyncTime ? ` | Terakhir sinkron: ${new Date(lastSyncTime).toLocaleTimeString('id-ID')}` : ''}`}
        >
          {syncStatus === 'SAVED' && (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
              <span className="font-bold">Cloud Live</span>
            </>
          )}
          {syncStatus === 'SYNCING' && (
            <>
              <RefreshCw className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 animate-spin" />
              <span className="font-bold">Menyimpan...</span>
            </>
          )}
          {syncStatus === 'LOADING' && (
            <>
              <RefreshCw className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 animate-spin" />
              <span className="font-bold">Memuat...</span>
            </>
          )}
          {syncStatus === 'OFFLINE' && (
            <>
              <WifiOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span className="font-bold">Offline</span>
            </>
          )}
          {syncStatus === 'ERROR' && (
            <>
              <Database className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
              <span className="font-bold">Sync Error</span>
            </>
          )}
        </div>

        {/* User Account / Role Switcher */}
        <div className="relative">
          <button
            onClick={() => {
              setUserMenuOpen(!userMenuOpen);
              setNotifOpen(false);
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
