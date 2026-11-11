import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Ticket, TicketMessage, ChatAttachment, UserRole, ChatCategoryConfig } from '../../types';
import {
  MessageSquare,
  Search,
  Send,
  Image as ImageIcon,
  User,
  Shield,
  Wrench,
  Building2,
  CheckCheck,
  Clock,
  Phone,
  Maximize2,
  X,
  AlertCircle,
  Filter,
  CheckCircle2,
  Radio,
  FileText,
  ChevronDown,
  ChevronRight,
  Tag,
  Settings,
  Plus,
  Trash2,
  Edit2,
  ArrowUp,
  ArrowDown,
  Layers,
  Inbox,
  AlertTriangle
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

export const ContactCentreView: React.FC = () => {
  const {
    tickets,
    currentUser,
    ticketMessages,
    sendTicketMessage,
    markTicketMessagesAsRead,
    getMessagesForTicket,
    getTicketUnreadCount,
    chatCategories,
    addChatCategory,
    updateChatCategory,
    deleteChatCategory,
    toggleChatCategoryActive,
    setTicketChatCategory
  } = useApp();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all'); // 'all', 'all_unread', or categoryId
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [selectedTicketId, setSelectedTicketId] = useState<string>('');
  const [inputText, setInputText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Settings Modal State for Admin/Superadmin
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ChatCategoryConfig | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#5B35B1');
  const [newCatDesc, setNewCatDesc] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const canManageCategories = currentUser?.role === 'super_admin' || currentUser?.role === 'dispatch';

  // 1A. Available tickets for current user role - STRICT INSTALLER ASSIGNMENT FILTER
  const availableTickets = useMemo(() => {
    return (tickets || []).filter(t => {
      if (!t || t.isArchived || t.isDeleted) return false;

      // Requirement 1A: Strictly only tickets that have an assignment to an installer
      const hasInstallerAssignment = Boolean(
        (t.installerName && t.installerName.trim() && t.installerName.toLowerCase() !== 'unassigned') ||
        (t.installerId && t.installerId.trim()) ||
        (t.assignedToUid && t.assignedToUid.trim())
      );
      if (!hasInstallerAssignment) return false;

      // Role scoped access rules
      if (currentUser?.role === 'leader') {
        const cName = (t.contactorName || t.contractorName || '').toLowerCase().trim();
        const leaderContr = (currentUser.contractor || '').toLowerCase().trim();
        const matchContr = !leaderContr || cName === leaderContr || cName.includes(leaderContr) || leaderContr.includes(cName);

        const aName = (t.area || '').toLowerCase().trim();
        const leaderArea = (currentUser.area || '').toLowerCase().trim();
        const matchArea = !leaderArea || aName === leaderArea || aName.includes(leaderArea) || leaderArea.includes(aName);

        return matchContr && matchArea;
      }
      if (currentUser?.role === 'installer') {
        const myUid = String(currentUser?.id || '').trim();
        return Boolean(myUid && String(t.installerUserId || '').trim() === myUid);
      }
      return true;
    });
  }, [tickets, currentUser]);

  // Search filter across customer name, WO, ID, phone, AND chat message text
  const searchFilteredTickets = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return availableTickets;

    return availableTickets.filter(t => {
      const matchWo = (t.woNumber ? String(t.woNumber).toLowerCase() : '').includes(q);
      const matchCust = (t.customerName ? String(t.customerName).toLowerCase() : '').includes(q);
      const matchCid = (t.idCustomer || t.customerId || '').toLowerCase().includes(q);
      const matchPhone = (t.customerPhone || '').includes(q);

      // Search inside chat message text for this ticket
      const messages = getMessagesForTicket(t.id);
      const matchMessage = messages.some(m => (m.text || '').toLowerCase().includes(q));

      return matchWo || matchCust || matchCid || matchPhone || matchMessage;
    });
  }, [availableTickets, searchQuery, getMessagesForTicket, ticketMessages]);

  // Group tickets by Chat Category
  const groupedTickets = useMemo(() => {
    const activeCats = (chatCategories || []).filter(c => c.isActive !== false && (c as any).active !== false);
    const groups: {
      category: ChatCategoryConfig;
      tickets: Ticket[];
      unreadCount: number;
    }[] = [];

    // Map of active categories
    activeCats.forEach(cat => {
      const catTickets = searchFilteredTickets.filter(t => {
        const tCat = (t.chatCategory || '').trim().toUpperCase();
        return tCat === cat.id.toUpperCase() || tCat === cat.name.toUpperCase();
      });
      const unreadTotal = catTickets.reduce((acc, t) => acc + getTicketUnreadCount(t.id), 0);
      groups.push({
        category: cat,
        tickets: catTickets,
        unreadCount: unreadTotal
      });
    });

    // Unclassified tickets (empty or unknown category)
    const activeCatKeys = new Set(activeCats.flatMap(c => [c.id.toUpperCase(), c.name.toUpperCase()]));
    const unclassifiedTickets = searchFilteredTickets.filter(t => {
      const tCat = (t.chatCategory || '').trim().toUpperCase();
      return !tCat || !activeCatKeys.has(tCat);
    });
    const unclassifiedUnread = unclassifiedTickets.reduce((acc, t) => acc + getTicketUnreadCount(t.id), 0);

    const unclassifiedCategory: ChatCategoryConfig = {
      id: 'UNCLASSIFIED',
      name: 'UNCLASSIFIED',
      description: 'Chat tanpa kategori yang ditentukan',
      color: '#64748B',
      order: 999,
      active: true,
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z'
    };

    if (unclassifiedTickets.length > 0 || groups.length === 0) {
      groups.push({
        category: unclassifiedCategory,
        tickets: unclassifiedTickets,
        unreadCount: unclassifiedUnread
      });
    }

    return groups;
  }, [chatCategories, searchFilteredTickets, getTicketUnreadCount]);

  // Overall unread count across all assigned tickets
  const totalUnreadCount = useMemo(() => {
    return availableTickets.reduce((acc, t) => acc + getTicketUnreadCount(t.id), 0);
  }, [availableTickets, getTicketUnreadCount, ticketMessages]);

  // All unread tickets list
  const allUnreadTickets = useMemo(() => {
    return searchFilteredTickets.filter(t => getTicketUnreadCount(t.id) > 0);
  }, [searchFilteredTickets, getTicketUnreadCount, ticketMessages]);

  // Flattened conversation list based on active filter
  const conversationList = useMemo(() => {
    if (activeCategoryFilter === 'all_unread') {
      return allUnreadTickets;
    }
    if (activeCategoryFilter !== 'all') {
      const group = groupedTickets.find(g => g.category.id === activeCategoryFilter);
      return group ? group.tickets : [];
    }
    return searchFilteredTickets;
  }, [activeCategoryFilter, allUnreadTickets, groupedTickets, searchFilteredTickets]);

  // Auto-select first ticket if current selection is invalid
  useEffect(() => {
    if (!selectedTicketId && conversationList.length > 0) {
      setSelectedTicketId(conversationList[0].id);
    } else if (selectedTicketId && !availableTickets.some(t => t.id === selectedTicketId) && conversationList.length > 0) {
      setSelectedTicketId(conversationList[0].id);
    }
  }, [conversationList, selectedTicketId, availableTickets]);

  const activeTicket = useMemo(() => {
    return tickets.find(t => t.id === selectedTicketId) || conversationList[0] || null;
  }, [tickets, selectedTicketId, conversationList]);

  const activeMessages = useMemo(() => {
    if (!activeTicket) return [];
    return getMessagesForTicket(activeTicket.id);
  }, [activeTicket, getMessagesForTicket, ticketMessages]);

  // Auto mark read when opening an active ticket
  useEffect(() => {
    if (activeTicket) {
      markTicketMessagesAsRead(activeTicket.id);
    }
  }, [activeTicket?.id, activeMessages.length, markTicketMessagesAsRead]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length]);

  const toggleGroupCollapse = (catId: string) => {
    setCollapsedCategories(prev => ({
      ...prev,
      [catId]: !prev[catId]
    }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach(file => {
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      if (!validTypes.includes(file.type)) {
        toast.error('Format lampiran harus JPG, PNG, atau WebP.', 'Format Ditolak');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`Ukuran file "${file.name}" melebihi batas 5MB.`, 'Ukuran File Terlalu Besar');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const attachment: ChatAttachment = {
          id: 'att-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
          url: dataUrl,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type
        };
        setPendingAttachments(prev => [...prev, attachment]);
        toast.info(`Foto "${file.name}" siap dilampirkan.`, 'Foto Dipilih');
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeTicket || isSubmitting) return;

    // Requirement 4: Leader role is strictly read-only monitoring; cannot send messages
    if (currentUser?.role === 'leader') {
      toast.error('Akses Ditolak: Role Leader hanya berfungsi sebagai pemantauan percakapan (Read-Only).', 'Akses Dibatasi');
      return;
    }

    if (!inputText.trim() && pendingAttachments.length === 0) return;

    setIsSubmitting(true);
    const res = sendTicketMessage(activeTicket.id, inputText.trim(), pendingAttachments);
    setIsSubmitting(false);

    if (res.success) {
      setInputText('');
      setPendingAttachments([]);
      setErrorMessage(null);
    } else {
      setErrorMessage(res.error || 'Gagal mengirim pesan.');
      toast.error(res.error || 'Gagal mengirim pesan.', 'Error');
    }
  };

  const handleCategoryChangeForActiveTicket = (categoryName: string) => {
    if (!activeTicket) return;
    setTicketChatCategory(activeTicket.id, categoryName);
    toast.success(`Kategori chat berhasil diperbarui menjadi "${categoryName}".`, 'Kategori Diperbarui');
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'dispatch':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
            <Shield className="w-2.5 h-2.5" /> Dispatch
          </span>
        );
      case 'installer':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <Wrench className="w-2.5 h-2.5" /> Installer
          </span>
        );
      case 'leader':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <Building2 className="w-2.5 h-2.5" /> Leader
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
            Admin
          </span>
        );
    }
  };

  const renderTicketItem = (t: Ticket) => {
    const isSelected = t.id === activeTicket?.id;
    const unread = getTicketUnreadCount(t.id);
    const catConfig = (chatCategories || []).find(
      c => c.name.toUpperCase() === (t.chatCategory || '').toUpperCase() || c.id.toUpperCase() === (t.chatCategory || '').toUpperCase()
    );

    return (
      <button
        key={t.id}
        type="button"
        onClick={() => setSelectedTicketId(t.id)}
        className={`w-full text-left p-3.5 transition-all flex items-start gap-2.5 cursor-pointer ${
          isSelected
            ? 'bg-[#E9E1FF] dark:bg-[#3B1D78]/70 border-l-4 border-[#5B35B1]'
            : 'hover:bg-white/60 dark:hover:bg-slate-800/40'
        }`}
      >
        <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 font-mono font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
          WO
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="font-mono font-bold text-xs text-[#3B1D78] dark:text-purple-300 truncate">
              {t.woNumber}
            </span>
            {unread > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-rose-600 text-white animate-pulse">
                {unread} baru
              </span>
            )}
          </div>
          <div className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate mt-0.5">
            {t.customerName}
          </div>
          <div className="text-[10.5px] text-slate-500 truncate mt-0.5 flex items-center justify-between">
            <span>Teknisi: <strong className="text-emerald-700 dark:text-emerald-400">{t.installerName}</strong></span>
            {catConfig && (
              <span
                className="text-[9px] px-1.5 py-0.2 rounded font-semibold text-white ml-1 shrink-0"
                style={{ backgroundColor: catConfig.color || '#5B35B1' }}
              >
                {catConfig.name}
              </span>
            )}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#5B35B1] text-white flex items-center justify-center font-bold shadow-xs">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#3B1D78] dark:text-purple-200 flex items-center gap-2">
              <span>Contact Centre & Multi-Channel Work Order Chat</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Installer Assigned Only
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Komunikasi langsung berbasis Work Order ter-assign teknisi antara Dispatch, Leader, dan Installer.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canManageCategories && (
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="px-3 py-1.5 rounded-xl border border-[#D8CCF3] dark:border-purple-800 text-xs font-semibold text-[#5B35B1] dark:text-purple-300 hover:bg-[#F5F1FF] dark:hover:bg-purple-950/60 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Kelola Kategori Chat</span>
            </button>
          )}
        </div>
      </div>

      {/* Main 2-Panel Chat Workspace */}
      <div className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 shadow-xs overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[640px]">
        {/* Left Panel: Conversation List with Sticky Search & Unread Grouping */}
        <div className="lg:col-span-5 xl:col-span-4 border-b lg:border-b-0 lg:border-r border-[#E9E1FF] dark:border-purple-900/50 flex flex-col bg-[#F5F1FF]/40 dark:bg-[#201138]/40 h-[640px] max-h-[80vh]">
          {/* STICKY SEARCH BAR - Never scrolls off (Requirement 1B) */}
          <div className="sticky top-0 z-20 bg-[#F5F1FF] dark:bg-[#1f103b] p-3 border-b border-[#E9E1FF] dark:border-purple-900/50 shadow-xs space-y-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari WO, ID, Nama, No. HP, Pesan..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-8 py-1.5 bg-white dark:bg-slate-900 border border-[#D8CCF3] dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#5B35B1]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-[11px] no-scrollbar">
              <button
                type="button"
                onClick={() => setActiveCategoryFilter('all')}
                className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  activeCategoryFilter === 'all'
                    ? 'bg-[#5B35B1] text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-[#E9E1FF]'
                }`}
              >
                Semua ({searchFilteredTickets.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveCategoryFilter('all_unread')}
                className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap flex items-center gap-1 transition-colors cursor-pointer ${
                  activeCategoryFilter === 'all_unread'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50'
                }`}
              >
                <span>ALL UNREAD</span>
                {totalUnreadCount > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                    activeCategoryFilter === 'all_unread' ? 'bg-white text-rose-600' : 'bg-rose-600 text-white'
                  }`}>
                    {totalUnreadCount}
                  </span>
                )}
              </button>

              {/* Dynamic Category Filter Pills */}
              {groupedTickets.map(group => {
                const isSelected = activeCategoryFilter === group.category.id;
                return (
                  <button
                    key={group.category.id}
                    type="button"
                    onClick={() => setActiveCategoryFilter(isSelected ? 'all' : group.category.id)}
                    className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#5B35B1] text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-[#E9E1FF]'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: group.category.color || '#5B35B1' }}
                    />
                    <span>{group.category.name}</span>
                    <span className="text-[10px] opacity-75 font-mono">({group.tickets.length})</span>
                    {group.unreadCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-rose-600 text-white">
                        {group.unreadCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Independently Scrollable Conversation List with Unread Category Accordion */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#E9E1FF] dark:divide-purple-900/30">
            {activeCategoryFilter === 'all_unread' ? (
              // ALL UNREAD View
              allUnreadTickets.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 space-y-1">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                  <div className="font-semibold text-slate-600 dark:text-slate-300">Semua Pesan Sudah Dibaca</div>
                  <p className="text-[11px]">Tidak ada chat tiket yang belum dibaca saat ini.</p>
                </div>
              ) : (
                allUnreadTickets.map(t => renderTicketItem(t))
              )
            ) : activeCategoryFilter !== 'all' ? (
              // Specific Filter View
              conversationList.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  Tidak ada tiket dalam kategori ini.
                </div>
              ) : (
                conversationList.map(t => renderTicketItem(t))
              )
            ) : (
              // Hierarchical Unread Grouping View (Requirement 1C)
              groupedTickets.map(group => {
                const isCollapsed = Boolean(collapsedCategories[group.category.id]);
                if (group.tickets.length === 0 && searchQuery) return null;

                return (
                  <div key={group.category.id} className="bg-transparent">
                    {/* Category Header Accordion Button */}
                    <button
                      type="button"
                      onClick={() => toggleGroupCollapse(group.category.id)}
                      className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-[#E9E1FF]/40 dark:hover:bg-purple-900/30 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isCollapsed ? (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: group.category.color || '#5B35B1' }}
                        />
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                          {group.category.name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          ({group.tickets.length})
                        </span>
                      </div>

                      {group.unreadCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white shadow-2xs">
                          {group.unreadCount} Unread
                        </span>
                      )}
                    </button>

                    {/* Collapsible Ticket Items */}
                    {!isCollapsed && (
                      <div className="divide-y divide-[#E9E1FF]/60 dark:divide-purple-900/20 bg-white/40 dark:bg-slate-900/20">
                        {group.tickets.length === 0 ? (
                          <div className="py-2.5 px-8 text-[11px] text-slate-400 italic">
                            Tidak ada tiket aktif dalam kategori ini
                          </div>
                        ) : (
                          group.tickets.map(t => renderTicketItem(t))
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {searchFilteredTickets.length === 0 && (
              <div className="p-8 text-center text-xs text-slate-400 space-y-2">
                <AlertCircle className="w-6 h-6 text-slate-300 dark:text-slate-600 mx-auto" />
                <div>Tidak ada tiket Work Order yang sesuai dengan pencarian atau filter.</div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Chat Message Thread */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col justify-between bg-white dark:bg-[#1A0E2E] h-[640px] max-h-[80vh]">
          {activeTicket ? (
            <>
              {/* Channel Header Bar with Full WO Information & Category */}
              <div className="px-4 sm:px-5 py-3 border-b border-[#E9E1FF] dark:border-purple-900/50 bg-[#F5F1FF]/60 dark:bg-[#201138]/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[#5B35B1] text-white flex items-center justify-center font-mono font-bold text-xs shadow-xs shrink-0 mt-0.5">
                    WO
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-xs sm:text-sm text-[#3B1D78] dark:text-purple-200">
                        {activeTicket.woNumber}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        (ID: {activeTicket.idCustomer || activeTicket.customerId || '-'})
                      </span>
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span>Pelanggan: <strong className="text-slate-900 dark:text-white">{activeTicket.customerName}</strong></span>
                      <span>Teknisi: <strong className="text-emerald-600 dark:text-emerald-400">{activeTicket.installerName || 'Unassigned'}</strong></span>
                      <span>Area: <strong className="text-purple-700 dark:text-purple-300">{activeTicket.area || '-'}</strong></span>
                      <span>Mitra: <strong className="text-indigo-700 dark:text-indigo-300">{activeTicket.contactorName || activeTicket.contractorName || '-'}</strong></span>
                      <span className="text-slate-400 font-mono text-[10.5px]">
                        Pesan Terakhir: <strong className="text-slate-600 dark:text-slate-300">{activeTicket.lastMessageAt ? (new Date(activeTicket.lastMessageAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB') : (activeMessages.length > 0 ? new Date(activeMessages[activeMessages.length - 1].timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB' : '-')}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Category & Message Count */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-[#D8CCF3] dark:border-slate-700 px-2 py-1 rounded-xl text-xs shadow-2xs">
                    <Tag className="w-3.5 h-3.5 text-[#5B35B1]" />
                    {currentUser?.role === 'leader' ? (
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {activeTicket.chatCategory || 'UNCLASSIFIED'}
                      </span>
                    ) : (
                      <select
                        value={activeTicket.chatCategory || 'UNCLASSIFIED'}
                        onChange={e => handleCategoryChangeForActiveTicket(e.target.value)}
                        className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
                        title="Ubah Kategori Percakapan Tiket"
                      >
                        <option value="UNCLASSIFIED">UNCLASSIFIED</option>
                        {(chatCategories || []).map(cat => (
                          <option key={cat.id} value={cat.name}>
                            {cat.name} {!cat.isActive ? '(Nonaktif)' : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 font-mono hidden sm:block">
                    {activeMessages.length} Pesan
                  </div>
                </div>
              </div>

              {/* Chat Messages Stream */}
              <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-3.5">
                {activeMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400 space-y-2">
                    <MessageSquare className="w-10 h-10 text-slate-300 dark:text-slate-700" />
                    <div className="font-bold text-xs text-slate-700 dark:text-slate-300">
                      Belum Ada Pesan di Channel WO Ini
                    </div>
                    <p className="text-[11px] text-slate-500 max-w-sm">
                      Mulai koordinasi antara Dispatch, Leader, dan Teknisi Lapangan. Unggah foto redaman atau info kendala fisik.
                    </p>
                  </div>
                ) : (
                  activeMessages.map(msg => {
                    const isMe = msg.senderId === currentUser?.id || msg.senderRole === currentUser?.role;
                    const isInstaller = msg.senderRole === 'installer';
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1`}
                      >
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="font-bold text-slate-800 dark:text-slate-200">{msg.senderName}</span>
                          {getRoleBadge(msg.senderRole)}
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div
                          className={`max-w-[85%] sm:max-w-[70%] rounded-2xl p-3.5 shadow-2xs space-y-2 ${
                            isMe
                              ? 'bg-[#5B35B1] text-white rounded-tr-xs'
                              : isInstaller
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-slate-900 dark:text-white border border-emerald-200 dark:border-emerald-800 rounded-tl-xs'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-tl-xs'
                          }`}
                        >
                          {msg.text && (
                            <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">
                              {msg.text}
                            </p>
                          )}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                              {msg.attachments.map(att => (
                                <div
                                  key={att.id}
                                  onClick={() => setZoomImage(att.url)}
                                  className="group relative cursor-pointer rounded-xl overflow-hidden border border-black/15 bg-black/5"
                                >
                                  <img
                                    src={att.url}
                                    alt={att.fileName}
                                    className="w-full h-32 object-cover group-hover:scale-105 transition-transform"
                                  />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1 text-xs">
                                    <Maximize2 className="w-3.5 h-3.5" />
                                    <span>Perbesar</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Pending Attachments Preview */}
              {pendingAttachments.length > 0 && (
                <div className="px-5 py-2 bg-indigo-50 dark:bg-indigo-950/70 border-t border-indigo-200 dark:border-indigo-900 flex items-center gap-2 overflow-x-auto shrink-0">
                  {pendingAttachments.map(att => (
                    <div key={att.id} className="relative w-16 h-16 rounded-lg overflow-hidden border border-indigo-400 shrink-0">
                      <img src={att.url} alt={att.fileName} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setPendingAttachments(prev => prev.filter(a => a.id !== att.id))}
                        className="absolute top-1 right-1 p-0.5 bg-rose-600 text-white rounded-full text-[9px]"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <span className="text-xs text-indigo-700 dark:text-indigo-300 font-semibold">
                    {pendingAttachments.length} foto siap dikirim
                  </span>
                </div>
              )}

              {/* Leader Read-Only Monitoring Banner vs Input Form for Dispatch/Installer */}
              {currentUser?.role === 'leader' ? (
                <div className="p-3.5 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-[#21123D] dark:to-[#180E2B] border-t border-[#D8CCF3] dark:border-purple-900/60 flex items-center justify-between gap-3 text-xs shrink-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[#5B35B1]/15 text-[#5B35B1] dark:text-purple-300 flex items-center justify-center shrink-0">
                      <Shield className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-[#3B1D78] dark:text-purple-200 flex items-center gap-2 flex-wrap">
                        <span>Mode Pantau: Leader (Read-Only)</span>
                        <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          Hanya Pantau Percakapan
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-xl">
                        Leader memantau percakapan untuk area {currentUser.area || activeTicket.area || '-'} & mitra {currentUser.contractor || activeTicket.contactorName || activeTicket.contractorName || '-'}. Pengiriman pesan dibatasi untuk Dispatch dan Teknisi Lapangan.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 font-bold">
                      Live Monitor
                    </span>
                  </div>
                </div>
              ) : (
                /* Input Form for Dispatch, Superadmin, Installer */
                <form onSubmit={handleSendMessage} className="p-3 sm:p-4 border-t border-[#E9E1FF] dark:border-purple-900/50 flex items-center gap-2 shrink-0 bg-white dark:bg-[#1A0E2E]">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept="image/jpeg,image/png,image/webp,image/jpg"
                    multiple
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2.5 text-slate-500 hover:text-[#5B35B1] hover:bg-[#E9E1FF] dark:hover:bg-slate-800 rounded-xl transition-colors shrink-0 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                    title="Lampirkan foto bukti pengerjaan / OPM"
                  >
                    <ImageIcon className="w-4 h-4 text-[#5B35B1]" />
                    <span className="hidden sm:inline">Foto</span>
                  </button>
                  <input
                    type="text"
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    placeholder={`Tulis pesan untuk WO ${activeTicket.woNumber} sebagai ${currentUser?.name}...`}
                    className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#5B35B1]"
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting || (!inputText.trim() && pendingAttachments.length === 0)}
                    className="px-5 py-2.5 bg-[#5B35B1] hover:bg-[#3B1D78] disabled:opacity-40 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors shrink-0 shadow-sm cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    <span>Kirim</span>
                  </button>
                </form>
              )}
            </>
          ) : (
            <div className="h-full flex items-center justify-center p-8 text-center text-slate-400">
              Pilih salah satu Work Order pada panel kiri untuk membuka channel percakapan.
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Zoom Modal */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-70 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setZoomImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setZoomImage(null)}
              className="absolute top-3 right-3 p-2 bg-black/70 text-white rounded-full hover:bg-rose-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={zoomImage}
              alt="Bukti Foto Zoom"
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* Admin Chat Category Management Modal (Requirement 1D) */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1A0E2E] border-2 border-[#D8CCF3] dark:border-purple-900 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-[#E9E1FF] dark:border-purple-900/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#5B35B1] text-white flex items-center justify-center font-bold">
                  <Tag className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#3B1D78] dark:text-purple-200">
                    Pengaturan Kategori Chat (Contact Center)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Kelola kategori percakapan untuk pengelompokan unread chat dan alur komunikasi operasional.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsSettingsOpen(false);
                  setEditingCategory(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
              {/* Add / Edit Form */}
              <div className="bg-[#F5F1FF] dark:bg-[#201138]/60 p-4 rounded-xl border border-[#D8CCF3] dark:border-purple-900/60 space-y-3">
                <div className="text-xs font-bold text-[#3B1D78] dark:text-purple-200 flex items-center gap-2">
                  <Plus className="w-3.5 h-3.5" />
                  <span>{editingCategory ? 'Edit Kategori Chat' : 'Tambah Kategori Baru'}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="sm:col-span-2">
                    <label className="text-[10.5px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      Nama Kategori
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: ESCALATION, COMPLAINT..."
                      value={newCatName}
                      onChange={e => setNewCatName(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10.5px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      Warna Indikator
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={newCatColor}
                        onChange={e => setNewCatColor(e.target.value)}
                        className="w-8 h-8 rounded border border-slate-300 cursor-pointer"
                      />
                      <span className="text-xs font-mono">{newCatColor}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[10.5px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    Deskripsi Operasional (Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="Keterangan alur penanganan tiket..."
                    value={newCatDesc}
                    onChange={e => setNewCatDesc(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  {editingCategory && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCategory(null);
                        setNewCatName('');
                        setNewCatDesc('');
                        setNewCatColor('#5B35B1');
                      }}
                      className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg"
                    >
                      Batal Edit
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (!newCatName.trim()) {
                        toast.error('Nama kategori tidak boleh kosong', 'Validasi Gagal');
                        return;
                      }
                      if (editingCategory) {
                        updateChatCategory(editingCategory.id, {
                          name: newCatName.trim().toUpperCase(),
                          color: newCatColor,
                          description: newCatDesc.trim()
                        });
                        toast.success('Kategori berhasil diperbarui', 'Sukses');
                        setEditingCategory(null);
                      } else {
                        addChatCategory({
                          name: newCatName.trim().toUpperCase(),
                          color: newCatColor,
                          description: newCatDesc.trim(),
                          order: (chatCategories?.length || 0) + 1,
                          active: true,
                          isActive: true
                        });
                        toast.success('Kategori baru berhasil ditambahkan', 'Sukses');
                      }
                      setNewCatName('');
                      setNewCatDesc('');
                      setNewCatColor('#5B35B1');
                    }}
                    className="px-4 py-1.5 bg-[#5B35B1] hover:bg-[#3B1D78] text-white text-xs font-bold rounded-lg shadow-xs"
                  >
                    {editingCategory ? 'Simpan Perubahan' : 'Tambahkan Kategori'}
                  </button>
                </div>
              </div>

              {/* Category List Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="p-3 w-10">Warna</th>
                      <th className="p-3">Nama Kategori</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {(chatCategories || []).map(cat => {
                      const usageCount = tickets.filter(
                        t => (t.chatCategory || '').toUpperCase() === cat.name.toUpperCase()
                      ).length;

                      return (
                        <tr key={cat.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="p-3">
                            <span
                              className="inline-block w-4 h-4 rounded-full shadow-2xs"
                              style={{ backgroundColor: cat.color }}
                            />
                          </td>
                          <td className="p-3">
                            <div className="font-bold text-slate-800 dark:text-slate-200">{cat.name}</div>
                            {cat.description && (
                              <div className="text-[10.5px] text-slate-500">{cat.description}</div>
                            )}
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                              Digunakan pada {usageCount} tiket
                            </div>
                          </td>
                          <td className="p-3">
                            <button
                              type="button"
                              onClick={() => toggleChatCategoryActive(cat.id)}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer ${
                                cat.isActive
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                              }`}
                            >
                              {cat.isActive ? 'Aktif' : 'Nonaktif'}
                            </button>
                          </td>
                          <td className="p-3 text-right space-x-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCategory(cat);
                                setNewCatName(cat.name);
                                setNewCatColor(cat.color);
                                setNewCatDesc(cat.description || '');
                              }}
                              className="p-1 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded"
                              title="Edit Kategori"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                deleteChatCategory(cat.id);
                                toast.info(`Kategori ${cat.name} dihapus. Tiket terkait dipindahkan ke UNCLASSIFIED.`, 'Dihapus');
                              }}
                              className="p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 rounded cursor-pointer"
                              title="Hapus Kategori"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 border-t border-[#E9E1FF] dark:border-purple-900/60 bg-slate-50 dark:bg-slate-900 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsSettingsOpen(false);
                  setEditingCategory(null);
                }}
                className="px-4 py-2 bg-[#5B35B1] text-white text-xs font-bold rounded-xl hover:bg-[#3B1D78]"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
