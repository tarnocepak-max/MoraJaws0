import React from 'react';
import { UserCheck, BarChart3, FileText, Sliders, UserPlus } from 'lucide-react';

export type LeaderTabType =
  | 'wo_assignment'
  | 'progress_dashboard'
  | 'installer_mgmt'
  | 'contractor_recap'
  | 'quota_settings';

interface LeaderBottomNavProps {
  activeTab: LeaderTabType;
  onTabChange: (tab: LeaderTabType) => void;
  unassignedCount?: number;
  installersCount?: number;
}

export const LeaderBottomNav: React.FC<LeaderBottomNavProps> = ({
  activeTab,
  onTabChange,
  unassignedCount = 0,
  installersCount = 0
}) => {
  const tabs = [
    {
      id: 'wo_assignment' as LeaderTabType,
      label: 'ASSIGN WO',
      shortLabel: 'Assign WO',
      icon: UserCheck,
      badge: unassignedCount > 0 ? unassignedCount : undefined,
      badgeColor: 'bg-[#6D28D9] text-white font-bold'
    },
    {
      id: 'progress_dashboard' as LeaderTabType,
      label: 'DASHBOARD PROGRESS',
      shortLabel: 'Progress',
      icon: BarChart3,
      badge: 'Live',
      badgeColor: 'bg-[#4C1D95] text-white font-bold'
    },
    {
      id: 'installer_mgmt' as LeaderTabType,
      label: 'TEKNISI',
      shortLabel: 'Teknisi',
      icon: UserPlus,
      badge: installersCount > 0 ? installersCount : undefined,
      badgeColor: 'bg-emerald-600 text-white font-bold'
    },
    {
      id: 'contractor_recap' as LeaderTabType,
      label: 'REKAP TOTAL WO',
      shortLabel: 'Rekap WO',
      icon: FileText
    },
    {
      id: 'quota_settings' as LeaderTabType,
      label: 'KUOTA & KOLOM',
      shortLabel: 'Kuota',
      icon: Sliders
    }
  ];

  return (
    <nav
      aria-label="Navigasi Utama Leader"
      className="fixed bottom-0 inset-x-0 z-40 bg-white dark:bg-[#1A0E2E] border-t border-[#E9E1F0] dark:border-purple-900/60 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] pb-[env(safe-area-inset-bottom,0px)] transition-colors"
    >
      <div className="max-w-5xl mx-auto grid grid-cols-5 items-center">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`relative flex flex-col items-center justify-center py-2 px-1 sm:px-2 min-h-[58px] transition-all cursor-pointer group select-none ${
                isActive
                  ? 'text-[#6F35A5] dark:text-[#C084FC]'
                  : 'text-[#8B8495] dark:text-slate-400 hover:text-[#6F35A5] dark:hover:text-purple-300'
              }`}
            >
              {/* Active Indicator Bar on top */}
              {isActive && (
                <div className="absolute top-0 inset-x-3 sm:inset-x-6 h-1 bg-[#8B4BC1] dark:bg-[#A855F7] rounded-b-full shadow-[0_0_10px_rgba(139,75,193,0.45)]" />
              )}

              {/* Icon Container with subtle background badge */}
              <div
                className={`relative p-1.5 rounded-xl transition-all ${
                  isActive
                    ? 'bg-[#F3EDFA] dark:bg-[#2A1647] text-[#6F35A5] dark:text-[#C084FC] scale-105 shadow-xs'
                    : 'text-[#8B8495] dark:text-slate-400 group-hover:scale-105 group-hover:text-[#6F35A5] dark:group-hover:text-purple-300'
                }`}
              >
                <Icon className={`w-5 h-5 sm:w-5.5 sm:h-5.5 ${isActive ? 'text-[#6F35A5] dark:text-[#C084FC]' : 'text-[#8B8495] dark:text-slate-400'}`} />

                {/* Badge Indicator */}
                {tab.badge !== undefined && (
                  <span
                    className={`absolute -top-1.5 -right-2 px-1.5 py-0.2 rounded-full text-[9px] font-mono leading-tight shadow-xs ${
                      tab.badgeColor || 'bg-[#6F35A5] text-white'
                    }`}
                  >
                    {typeof tab.badge === 'number' && tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                )}
              </div>

              {/* Label */}
              <span
                className={`text-[10px] sm:text-[11px] font-bold tracking-tight text-center mt-1 leading-tight line-clamp-1 uppercase ${
                  isActive
                    ? 'text-[#6F35A5] dark:text-[#C084FC] font-extrabold'
                    : 'text-[#8B8495] dark:text-slate-400'
                }`}
              >
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
