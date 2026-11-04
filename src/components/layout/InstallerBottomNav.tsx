import React from 'react';
import { LayoutDashboard, ClipboardList, MessageSquare, MessageCircle } from 'lucide-react';

interface InstallerBottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  pendingTasksCount?: number;
  unreadMessagesCount?: number;
}

export const InstallerBottomNav: React.FC<InstallerBottomNavProps> = ({
  activeTab,
  onTabChange,
  pendingTasksCount = 0,
  unreadMessagesCount = 0
}) => {
  // Determine canonical active item
  const isDashboardActive = activeTab === 'installer_dashboard';
  const isTasksActive =
    activeTab === 'installer_portal' ||
    activeTab === 'installer_tasks' ||
    activeTab === 'installer_progress' ||
    activeTab === 'installer_history';
  const isWhatsAppActive = activeTab === 'installer_whatsapp' || activeTab === 'whatsapp';
  const isLiveChatActive =
    activeTab === 'installer_chat' || activeTab === 'contact_centre' || activeTab === 'live_chat';

  const tabs = [
    {
      id: 'installer_dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      isActive: isDashboardActive,
      badge: undefined,
      badgeColor: ''
    },
    {
      id: 'installer_tasks',
      label: 'Tugas Saya',
      icon: ClipboardList,
      isActive: isTasksActive,
      badge: pendingTasksCount > 0 ? pendingTasksCount : undefined,
      badgeColor: 'bg-amber-500 text-white font-bold'
    },
    {
      id: 'installer_whatsapp',
      label: 'WhatsApp',
      icon: MessageSquare,
      isActive: isWhatsAppActive,
      badge: undefined,
      badgeColor: 'bg-emerald-600 text-white'
    },
    {
      id: 'installer_chat',
      label: 'Live Chat Center',
      icon: MessageCircle,
      isActive: isLiveChatActive,
      badge: unreadMessagesCount > 0 ? unreadMessagesCount : undefined,
      badgeColor: 'bg-indigo-600 text-white font-bold'
    }
  ];

  return (
    <nav
      aria-label="Navigasi Bawah Teknisi"
      className="fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-[#160D29]/95 backdrop-blur-md border-t border-[#D8CCF3] dark:border-[#35105E] shadow-[0_-4px_24px_rgba(0,0,0,0.12)] pb-[env(safe-area-inset-bottom,0px)] transition-colors select-none"
    >
      <div className="max-w-3xl mx-auto grid grid-cols-4 items-center px-1 sm:px-4">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.isActive;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`relative flex flex-col items-center justify-center py-2 px-1 min-h-[60px] sm:min-h-[64px] transition-all cursor-pointer group ${
                isActive
                  ? 'text-[#5B35B1] dark:text-[#C084FC]'
                  : 'text-[#756B8D] dark:text-slate-400 hover:text-[#5B35B1] dark:hover:text-purple-300'
              }`}
            >
              {/* Top Accent Active Pill Indicator */}
              {isActive && (
                <div className="absolute top-0 inset-x-3 sm:inset-x-8 h-1 bg-gradient-to-r from-[#5B35B1] to-[#8064D9] dark:from-[#A855F7] dark:to-[#C084FC] rounded-b-full shadow-[0_0_12px_rgba(91,53,177,0.55)]" />
              )}

              {/* Icon Container with subtle active pill glow */}
              <div
                className={`relative p-1.5 sm:p-2 rounded-xl transition-all ${
                  isActive
                    ? 'bg-[#EFE9FA] dark:bg-[#2C184D] text-[#5B35B1] dark:text-[#C084FC] scale-105 shadow-2xs'
                    : 'text-[#756B8D] dark:text-slate-400 group-hover:scale-105 group-hover:text-[#5B35B1] dark:group-hover:text-purple-300'
                }`}
              >
                <Icon
                  className={`w-5 h-5 sm:w-5.5 sm:h-5.5 ${
                    isActive ? 'text-[#5B35B1] dark:text-[#C084FC]' : 'text-[#756B8D] dark:text-slate-400'
                  }`}
                />

                {/* Badge Indicator for Tasks / Unread Chat */}
                {tab.badge !== undefined && (
                  <span
                    className={`absolute -top-1 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] rounded-full shadow-xs ${tab.badgeColor}`}
                  >
                    {typeof tab.badge === 'number' && tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                )}
              </div>

              {/* Menu Label */}
              <span
                className={`mt-1 text-[10.5px] sm:text-xs tracking-tight truncate max-w-[85px] sm:max-w-none text-center ${
                  isActive
                    ? 'font-bold text-[#5B35B1] dark:text-[#C084FC]'
                    : 'font-medium text-[#756B8D] dark:text-slate-400'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
