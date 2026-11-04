import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useUIConfig } from '../../context/UIConfigContext';
import { useToast } from '../../context/ToastContext';
import { NavCategoryConfig, StandaloneMenuItem, NavSubmenuItem } from '../../types';
import {
  FolderTree,
  Save,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  Cloud,
  Edit2,
  Check,
  X,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  Layers,
  Eye,
  LayoutDashboard,
  Building2,
  Wrench,
  MessageSquare,
  FileSpreadsheet,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  SlidersHorizontal,
  Smartphone,
  Calendar,
  Ticket as TicketIcon,
  Zap,
  UserCheck,
  BarChart3,
  UserPlus,
  History,
  KeyRound,
  Activity,
  Bell,
  Settings as SettingsIcon,
  Database,
  Users2,
  ListOrdered,
  Plus,
  Trash2,
  GripVertical,
  ToggleLeft,
  ToggleRight,
  Folder,
  FileText,
  RefreshCw
} from 'lucide-react';

const AVAILABLE_ICONS: { name: string; label: string; component: React.ElementType }[] = [
  { name: 'LayoutDashboard', label: 'Dashboard', component: LayoutDashboard },
  { name: 'Ticket', label: 'Tiket', component: TicketIcon },
  { name: 'FileSpreadsheet', label: 'Spreadsheet', component: FileSpreadsheet },
  { name: 'MessageSquare', label: 'Pesan', component: MessageSquare },
  { name: 'Calendar', label: 'Kalender', component: Calendar },
  { name: 'Users2', label: 'Pengguna', component: Users2 },
  { name: 'Building2', label: 'Kontraktor', component: Building2 },
  { name: 'Wrench', label: 'Teknisi / Alat', component: Wrench },
  { name: 'Sliders', label: 'Setup / Kontrol', component: Sliders },
  { name: 'UserCheck', label: 'Penugasan', component: UserCheck },
  { name: 'BarChart3', label: 'Grafik Progress', component: BarChart3 },
  { name: 'FileText', label: 'Laporan Teks', component: FileText },
  { name: 'SlidersHorizontal', label: 'Pengaturan Kuota', component: SlidersHorizontal },
  { name: 'UserPlus', label: 'Tambah User', component: UserPlus },
  { name: 'FolderTree', label: 'Folder Pohon', component: FolderTree },
  { name: 'ShieldCheck', label: 'Keamanan / Role', component: ShieldCheck },
  { name: 'ListOrdered', label: 'Daftar Kategori', component: ListOrdered },
  { name: 'Activity', label: 'Kesehatan Sistem', component: Activity },
  { name: 'Bell', label: 'Notifikasi', component: Bell },
  { name: 'History', label: 'Audit Trail', component: History },
  { name: 'KeyRound', label: 'Sesi / Kunci', component: KeyRound },
  { name: 'Settings', label: 'Pengaturan', component: SettingsIcon },
  { name: 'RefreshCw', label: 'Sinkronisasi', component: RefreshCw },
  { name: 'Database', label: 'Database', component: Database },
  { name: 'CheckCircle2', label: 'Selesai / Tugas', component: CheckCircle2 }
];

export const getIconComp = (iconName?: string): React.ElementType => {
  const match = AVAILABLE_ICONS.find(i => i.name === iconName);
  return match ? match.component : Folder;
};

export const NavigationConfigView: React.FC = () => {
  const { currentUser, addAuditLog } = useApp();
  const {
    navCategories,
    standaloneMenus,
    submenuItems,
    accordionSettings,
    addCategory,
    updateCategory,
    deleteCategory,
    moveCategoryItem,
    reorderCategories,
    toggleCategoryActive,
    setCategoryAccordionMode,
    addSubmenu,
    updateSubmenu,
    deleteSubmenu,
    moveSubmenu,
    reorderSubmenus,
    moveSubmenuToCategory,
    toggleSubmenuActive,
    updateStandaloneMenu,
    moveStandaloneMenu,
    reorderStandaloneMenus,
    toggleStandaloneMenuActive,
    deleteStandaloneMenu,
    setAllowMultipleOpenGroups,
    saveNavigationConfig,
    resetNavigationConfig,
    isCloudSyncing,
    lastCloudSyncTime,
    cloudSyncStatus
  } = useUIConfig();
  const { toast } = useToast();

  const isSuperadmin = currentUser?.role === 'super_admin';

  // Active section tab in configuration
  const [activeConfigTab, setActiveConfigTab] = useState<'categories' | 'standalone' | 'submenus'>('categories');

  // Saving & Resetting status
  const [isSaving, setIsSaving] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Category Edit / Add State
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryDraftName, setCategoryDraftName] = useState('');
  const [categoryDraftIcon, setCategoryDraftIcon] = useState('Building2');
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('Building2');
  const [newCategoryMode, setNewCategoryMode] = useState<'accordion' | 'static'>('accordion');

  // Delete Category Modal State
  const [deletingCategory, setDeletingCategory] = useState<NavCategoryConfig | null>(null);
  const [deleteSubmenuAction, setDeleteSubmenuAction] = useState<'move' | 'disable'>('move');
  const [deleteTargetCategoryId, setDeleteTargetCategoryId] = useState<string>('menu_tambahan');

  // Submenu Edit / Add State
  const [editingSubmenuId, setEditingSubmenuId] = useState<string | null>(null);
  const [submenuDraftLabel, setSubmenuDraftLabel] = useState('');
  const [submenuDraftIcon, setSubmenuDraftIcon] = useState('');
  const [submenuDraftCategory, setSubmenuDraftCategory] = useState('');
  const [showAddSubmenuModal, setShowAddSubmenuModal] = useState(false);
  const [newSubmenuLabel, setNewSubmenuLabel] = useState('');
  const [newSubmenuIcon, setNewSubmenuIcon] = useState('FileText');
  const [newSubmenuCategoryId, setNewSubmenuCategoryId] = useState('contractor_area');
  const [newSubmenuRoles, setNewSubmenuRoles] = useState<string[]>(['super_admin', 'dispatch', 'leader']);

  // Standalone Menu Edit State
  const [editingStandaloneId, setEditingStandaloneId] = useState<string | null>(null);
  const [standaloneDraftLabel, setStandaloneDraftLabel] = useState('');
  const [standaloneDraftIcon, setStandaloneDraftIcon] = useState('');

  // Drag and drop state
  const [draggedItem, setDraggedItem] = useState<{
    type: 'category' | 'standalone' | 'submenu';
    id: string;
    sourceCategoryId?: string;
  } | null>(null);

  // Live Preview Modal
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewRole, setPreviewRole] = useState<'super_admin' | 'dispatch' | 'leader' | 'installer'>('super_admin');
  const [previewOpenGroups, setPreviewOpenGroups] = useState<Record<string, boolean>>({
    contractor_area: true,
    installer: false,
    menu_tambahan: true
  });

  // Filtered categories and standalone menus
  const sortedCategories = useMemo(() => {
    return [...(navCategories || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [navCategories]);

  const sortedStandaloneMenus = useMemo(() => {
    return [...(standaloneMenus || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [standaloneMenus]);

  // Grouped submenus
  const submenusByCategory = useMemo(() => {
    const map = new Map<string, NavSubmenuItem[]>();
    (sortedCategories || []).forEach(cat => map.set(cat.id, []));
    (submenuItems || []).forEach(sub => {
      const list = map.get(sub.categoryId) || [];
      list.push(sub);
      map.set(sub.categoryId, list);
    });
    // Sort items within each category
    map.forEach((items, catId) => {
      items.sort((a, b) => (a.order || 0) - (b.order || 0));
    });
    return map;
  }, [sortedCategories, submenuItems]);

  // Handle Save to Firestore
  const handleSaveToCloud = async () => {
    if (!isSuperadmin) {
      toast.error('Hanya Super Admin yang dapat menyimpan konfigurasi navigasi.');
      return;
    }
    setIsSaving(true);
    try {
      const result = await saveNavigationConfig(currentUser?.name || currentUser?.username || 'Super Admin');
      if (result.success) {
        toast.success(
          'Konfigurasi navigasi MoraJaws berhasil disimpan secara permanen di Firebase Cloud Firestore (appSettings/navigation).',
          'Tersimpan Permanen'
        );
        addAuditLog(
          'update_navigation_config',
          'ui_config',
          'navigation',
          'Memperbarui konfigurasi sistem navigasi di Cloud Firestore (appSettings/navigation)'
        );
      } else {
        toast.error(`Gagal menyimpan ke Firestore: ${result.error}`, 'Error Penyimpanan');
      }
    } catch (err: any) {
      toast.error(`Terjadi kesalahan: ${err.message || err}`, 'Gagal Simpan');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Reset to Defaults
  const handleConfirmReset = async () => {
    setIsSaving(true);
    try {
      const res = await resetNavigationConfig(currentUser?.name || currentUser?.username || 'Super Admin');
      if (res.success) {
        toast.success('Konfigurasi navigasi telah dikembalikan ke default canonical MoraJaws.', 'Reset Berhasil');
        setShowResetConfirm(false);
      } else {
        toast.error(`Gagal reset: ${res.error}`, 'Error Reset');
      }
    } catch (err: any) {
      toast.error(`Kesalahan saat reset: ${err.message}`, 'Gagal Reset');
    } finally {
      setIsSaving(false);
    }
  };

  // Drag and Drop handlers
  const handleDragStart = (type: 'category' | 'standalone' | 'submenu', id: string, sourceCategoryId?: string) => {
    setDraggedItem({ type, id, sourceCategoryId });
  };

  const handleDropCategory = (targetIndex: number) => {
    if (!draggedItem || draggedItem.type !== 'category') return;
    const sourceIndex = sortedCategories.findIndex(c => c.id === draggedItem.id);
    if (sourceIndex !== -1 && sourceIndex !== targetIndex) {
      reorderCategories(sourceIndex, targetIndex);
      toast.info('Urutan kategori diperbarui.');
    }
    setDraggedItem(null);
  };

  const handleDropStandalone = (targetIndex: number) => {
    if (!draggedItem || draggedItem.type !== 'standalone') return;
    const sourceIndex = sortedStandaloneMenus.findIndex(m => m.id === draggedItem.id);
    if (sourceIndex !== -1 && sourceIndex !== targetIndex) {
      reorderStandaloneMenus(sourceIndex, targetIndex);
      toast.info('Urutan menu mandiri diperbarui.');
    }
    setDraggedItem(null);
  };

  const handleDropSubmenu = (targetCategoryId: string, targetIndex: number) => {
    if (!draggedItem || draggedItem.type !== 'submenu') return;
    const { id: submenuId, sourceCategoryId } = draggedItem;

    if (sourceCategoryId === targetCategoryId) {
      // Reorder within same category
      const catSubmenus = submenusByCategory.get(targetCategoryId) || [];
      const sourceIndex = catSubmenus.findIndex(s => s.id === submenuId);
      if (sourceIndex !== -1 && sourceIndex !== targetIndex) {
        reorderSubmenus(targetCategoryId, sourceIndex, targetIndex);
        toast.info('Urutan submenu diperbarui.');
      }
    } else {
      // Move to another category
      moveSubmenuToCategory(submenuId, targetCategoryId);
      toast.success(`Submenu dipindahkan ke kategori "${targetCategoryId}".`);
    }
    setDraggedItem(null);
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* ================================================================ */}
      {/* TOP HEADER & ACTION BAR                                          */}
      {/* ================================================================ */}
      <div className="bg-[#160D29] border border-[#35105E] rounded-2xl p-5 md:p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start md:items-center gap-3.5">
          <div className="p-3 bg-gradient-to-br from-[#7135B5] to-[#5B35B1] rounded-xl text-white shadow-md shadow-[#5B35B1]/30">
            <FolderTree className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-wide">
                Konfigurasi Menu Navigasi
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#35105E] text-[#D8B4FE] border border-[#7135B5]/40 uppercase">
                Dynamic Engine
              </span>
            </div>
            <p className="text-xs text-purple-300 mt-0.5">
              Kelola Accordion Submenu, Menu Mandiri, dan urutan tampilan MoraJaws dengan integrasi Cloud Firestore.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Live Preview Button */}
          <button
            type="button"
            onClick={() => setShowPreviewModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#261547] text-[#D8B4FE] hover:bg-[#35105E] border border-[#7135B5]/40 transition-all cursor-pointer shadow-sm"
          >
            <Eye className="w-4 h-4 text-purple-300" />
            <span>Pratinjau Navigasi</span>
          </button>

          {/* Reset to Default */}
          {isSuperadmin && (
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              disabled={isSaving}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#261547] text-rose-300 hover:text-rose-100 hover:bg-rose-950/40 border border-rose-500/30 transition-all cursor-pointer shadow-sm"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset Default</span>
            </button>
          )}

          {/* Save to Firestore */}
          {isSuperadmin && (
            <button
              type="button"
              onClick={handleSaveToCloud}
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-[#7135B5] to-[#5B35B1] text-white hover:from-[#8B4BC1] hover:to-[#7135B5] shadow-lg shadow-[#5B35B1]/40 border border-[#D8B4FE]/40 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Menyimpan ke Cloud...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Simpan Konfigurasi</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* FIRESTORE SYNC STATUS & ACCORDION BEHAVIOR SETTINGS               */}
      {/* ================================================================ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Firestore Status Card */}
        <div className="bg-[#1C1133] border border-[#35105E] rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${cloudSyncStatus === 'synced' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-purple-500/20 text-purple-300'}`}>
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-purple-300 font-medium">Firebase Firestore</p>
              <p className="text-xs font-bold text-white">
                {cloudSyncStatus === 'synced' ? 'Tersinkronisasi Realtime' : 'Terkoneksi (appSettings/navigation)'}
              </p>
            </div>
          </div>
          {lastCloudSyncTime && (
            <span className="text-[10px] text-purple-400">
              {new Date(lastCloudSyncTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        {/* Multi-Accordion Behavior Toggle */}
        <div className="md:col-span-2 bg-[#1C1133] border border-[#35105E] rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#D8B4FE]" />
              Mendukung Multi-Submenu Collapse (Beberapa Kategori Terbuka Bersamaan)
            </p>
            <p className="text-[11px] text-purple-300 mt-0.5">
              Ketika diaktifkan, membuka satu kategori accordion tidak akan menutup kategori lain secara otomatis.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAllowMultipleOpenGroups(!accordionSettings.allowMultipleOpenGroups)}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              accordionSettings.allowMultipleOpenGroups
                ? 'bg-purple-600/30 border-[#7135B5] text-[#D8B4FE]'
                : 'bg-slate-800/50 border-slate-700 text-slate-400'
            }`}
            title="Ubah Mode Multi-Accordion"
          >
            {accordionSettings.allowMultipleOpenGroups ? (
              <ToggleRight className="w-6 h-6 text-emerald-400" />
            ) : (
              <ToggleLeft className="w-6 h-6 text-slate-400" />
            )}
          </button>
        </div>
      </div>

      {/* ================================================================ */}
      {/* NAVIGATION MANAGEMENT TABS                                       */}
      {/* 1. Kategori (Accordion) | 2. Menu Mandiri | 3. Submenu Items     */}
      {/* ================================================================ */}
      <div className="flex border-b border-[#35105E] gap-2">
        <button
          type="button"
          onClick={() => setActiveConfigTab('categories')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer ${
            activeConfigTab === 'categories'
              ? 'border-[#D8B4FE] text-[#D8B4FE] bg-[#261547]/60 rounded-t-lg'
              : 'border-transparent text-purple-300 hover:text-white'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>1. Kategori Accordion ({sortedCategories.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveConfigTab('standalone')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer ${
            activeConfigTab === 'standalone'
              ? 'border-[#D8B4FE] text-[#D8B4FE] bg-[#261547]/60 rounded-t-lg'
              : 'border-transparent text-purple-300 hover:text-white'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>2. Menu Mandiri ({sortedStandaloneMenus.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveConfigTab('submenus')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer ${
            activeConfigTab === 'submenus'
              ? 'border-[#D8B4FE] text-[#D8B4FE] bg-[#261547]/60 rounded-t-lg'
              : 'border-transparent text-purple-300 hover:text-white'
          }`}
        >
          <ListOrdered className="w-4 h-4" />
          <span>3. Submenu Items ({(submenuItems || []).length})</span>
        </button>
      </div>

      {/* ================================================================ */}
      {/* TAB 1: PENGATURAN KATEGORI (ACCORDION SUBMENU)                   */}
      {/* ================================================================ */}
      {activeConfigTab === 'categories' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#1C1133] p-4 rounded-xl border border-[#35105E]">
            <div>
              <h2 className="text-sm font-bold text-white">Daftar Kategori Utama</h2>
              <p className="text-xs text-purple-300">
                Kategori utama menggunakan sistem Accordion Collapse. Dapat dibuka/tutup secara independen, digeser urutannya, atau diatur modenya.
              </p>
            </div>
            {isSuperadmin && (
              <button
                type="button"
                onClick={() => setShowAddCategoryModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#7135B5] hover:bg-[#8B4BC1] text-white transition-colors cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Kategori</span>
              </button>
            )}
          </div>

          {/* Categories List with Drag & Drop + Up/Down */}
          <div className="space-y-2.5">
            {sortedCategories.map((cat, index) => {
              const CatIcon = getIconComp(cat.icon);
              const submenusInCat = submenusByCategory.get(cat.id) || [];
              const isEditing = editingCategoryId === cat.id;

              return (
                <div
                  key={cat.id}
                  draggable={isSuperadmin}
                  onDragStart={() => handleDragStart('category', cat.id)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => handleDropCategory(index)}
                  className={`bg-[#160D29] border rounded-xl p-3.5 md:p-4 transition-all duration-200 ${
                    cat.isActive === false
                      ? 'border-slate-800 opacity-60'
                      : 'border-[#35105E] hover:border-[#7135B5]/60'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Left: Drag Handle, Icon, Name, Mode */}
                    <div className="flex items-center gap-3">
                      {isSuperadmin && (
                        <div
                          className="cursor-grab text-purple-400 hover:text-white p-1"
                          title="Tahan & geser untuk mengubah urutan"
                        >
                          <GripVertical className="w-4 h-4" />
                        </div>
                      )}

                      <div className="p-2 rounded-lg bg-[#261547] text-[#D8B4FE] border border-[#7135B5]/30">
                        <CatIcon className="w-4 h-4" />
                      </div>

                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={categoryDraftName}
                            onChange={e => setCategoryDraftName(e.target.value)}
                            className="px-2.5 py-1 text-xs bg-[#100921] border border-[#7135B5] text-white rounded-lg focus:outline-hidden"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (categoryDraftName.trim()) {
                                updateCategory(cat.id, {
                                  name: categoryDraftName.trim(),
                                  icon: categoryDraftIcon
                                });
                                setEditingCategoryId(null);
                                toast.success('Nama kategori diperbarui.');
                              }
                            }}
                            className="p-1 text-emerald-400 hover:bg-emerald-950/40 rounded cursor-pointer"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingCategoryId(null)}
                            className="p-1 text-rose-400 hover:bg-rose-950/40 rounded cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-white tracking-wide">
                              {cat.name}
                            </h3>
                            <span className="text-[10px] text-purple-400 font-mono">
                              ({cat.id})
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-wider ${
                                cat.mode === 'static'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-purple-500/20 text-[#D8B4FE] border border-purple-500/30'
                              }`}
                            >
                              {cat.mode === 'static' ? 'Static Mode' : 'Accordion Mode'}
                            </span>
                          </div>
                          <p className="text-[11px] text-purple-300">
                            {submenusInCat.length} Submenu terdaftar • Urutan #{cat.order}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Right: Controls (Mode, Active, Up/Down, Edit, Delete) */}
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {/* Accordion / Static toggle */}
                      {isSuperadmin && (
                        <button
                          type="button"
                          onClick={() =>
                            setCategoryAccordionMode(
                              cat.id,
                              cat.mode === 'static' ? 'accordion' : 'static'
                            )
                          }
                          className="px-2.5 py-1 text-[11px] font-semibold bg-[#261547] hover:bg-[#35105E] text-purple-200 rounded-lg border border-[#7135B5]/30 cursor-pointer"
                          title="Ganti Mode Accordion / Static"
                        >
                          Mode: {cat.mode === 'static' ? 'Statis' : 'Accordion'}
                        </button>
                      )}

                      {/* Active toggle */}
                      {isSuperadmin && (
                        <button
                          type="button"
                          onClick={() => toggleCategoryActive(cat.id)}
                          className={`p-1.5 rounded-lg border cursor-pointer ${
                            cat.isActive !== false
                              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                              : 'bg-slate-800 border-slate-700 text-slate-500'
                          }`}
                          title={cat.isActive !== false ? 'Kategori Aktif' : 'Kategori Nonaktif'}
                        >
                          {cat.isActive !== false ? (
                            <ToggleRight className="w-4 h-4" />
                          ) : (
                            <ToggleLeft className="w-4 h-4" />
                          )}
                        </button>
                      )}

                      {/* Move Up / Down Buttons (Fallback touch/drag) */}
                      {isSuperadmin && (
                        <div className="flex items-center gap-0.5 bg-[#100921] rounded-lg p-0.5 border border-[#35105E]">
                          <button
                            type="button"
                            onClick={() => moveCategoryItem(cat.id, 'up')}
                            disabled={index === 0}
                            className="p-1 text-purple-300 hover:text-white disabled:opacity-30 cursor-pointer"
                            title="Pindah ke Atas"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveCategoryItem(cat.id, 'down')}
                            disabled={index === sortedCategories.length - 1}
                            className="p-1 text-purple-300 hover:text-white disabled:opacity-30 cursor-pointer"
                            title="Pindah ke Bawah"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Edit Button */}
                      {isSuperadmin && !isEditing && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCategoryId(cat.id);
                            setCategoryDraftName(cat.name);
                            setCategoryDraftIcon(cat.icon || 'Building2');
                          }}
                          className="p-1.5 text-purple-300 hover:text-white hover:bg-[#35105E] rounded-lg cursor-pointer"
                          title="Edit Kategori"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Delete Button (with safe submenu migration modal) */}
                      {isSuperadmin && (
                        <button
                          type="button"
                          onClick={() => setDeletingCategory(cat)}
                          className="p-1.5 text-rose-400 hover:text-rose-200 hover:bg-rose-950/40 rounded-lg cursor-pointer"
                          title="Hapus Kategori"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB 2: PENGATURAN MENU MANDIRI (STANDALONE MENU)                 */}
      {/* 7 Menu Utama: Dashboard, Tickets, Report, Import, Contact, Schedule, Users */}
      {/* ================================================================ */}
      {activeConfigTab === 'standalone' && (
        <div className="space-y-4">
          <div className="bg-[#1C1133] p-4 rounded-xl border border-[#35105E]">
            <h2 className="text-sm font-bold text-white">7 Menu Utama Mandiri</h2>
            <p className="text-xs text-purple-300 mt-0.5">
              Menu ini tampil langsung pada navigasi utama paling atas tanpa parent category dan tanpa accordion. Nama label, ikon, urutan, dan visibilitas dapat dikonfigurasi.
            </p>
          </div>

          <div className="space-y-2.5">
            {sortedStandaloneMenus.map((menu, index) => {
              const MenuIcon = getIconComp(menu.icon);
              const isEditing = editingStandaloneId === menu.id;

              return (
                <div
                  key={menu.id}
                  draggable={isSuperadmin}
                  onDragStart={() => handleDragStart('standalone', menu.id)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => handleDropStandalone(index)}
                  className={`bg-[#160D29] border rounded-xl p-3.5 md:p-4 transition-all duration-200 ${
                    menu.visible === false
                      ? 'border-slate-800 opacity-60'
                      : 'border-[#35105E] hover:border-[#7135B5]/60'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Left: Drag Handle, Icon, Label */}
                    <div className="flex items-center gap-3">
                      {isSuperadmin && (
                        <div
                          className="cursor-grab text-purple-400 hover:text-white p-1"
                          title="Tahan & geser untuk mengubah urutan"
                        >
                          <GripVertical className="w-4 h-4" />
                        </div>
                      )}

                      <div className="p-2 rounded-lg bg-[#261547] text-[#D8B4FE] border border-[#7135B5]/30">
                        <MenuIcon className="w-4 h-4" />
                      </div>

                      {isEditing ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={standaloneDraftLabel}
                            onChange={e => setStandaloneDraftLabel(e.target.value)}
                            className="px-2.5 py-1 text-xs bg-[#100921] border border-[#7135B5] text-white rounded-lg focus:outline-hidden"
                            autoFocus
                          />
                          <select
                            value={standaloneDraftIcon}
                            onChange={e => setStandaloneDraftIcon(e.target.value)}
                            className="px-2 py-1 text-xs bg-[#100921] border border-[#7135B5] text-purple-200 rounded-lg focus:outline-hidden"
                          >
                            {AVAILABLE_ICONS.map(i => (
                              <option key={i.name} value={i.name}>
                                {i.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              if (standaloneDraftLabel.trim()) {
                                updateStandaloneMenu(menu.id, {
                                  label: standaloneDraftLabel.trim(),
                                  icon: standaloneDraftIcon
                                });
                                setEditingStandaloneId(null);
                                toast.success('Menu mandiri diperbarui.');
                              }
                            }}
                            className="p-1 text-emerald-400 hover:bg-emerald-950/40 rounded cursor-pointer"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingStandaloneId(null)}
                            className="p-1 text-rose-400 hover:bg-rose-950/40 rounded cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-white tracking-wide">
                              {menu.label}
                            </h3>
                            <span className="text-[10px] text-purple-400 font-mono">
                              ({menu.id})
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[11px] text-purple-300">
                              Urutan #{menu.order}
                            </span>
                            <span className="text-purple-600">•</span>
                            <span className="text-[10.5px] text-purple-400">
                              Hak Akses: {menu.roles?.join(', ')}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right: Controls (Active, Up/Down, Edit) */}
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {/* Active toggle */}
                      {isSuperadmin && (
                        <button
                          type="button"
                          onClick={() => toggleStandaloneMenuActive(menu.id)}
                          className={`p-1.5 rounded-lg border cursor-pointer ${
                            menu.visible !== false
                              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                              : 'bg-slate-800 border-slate-700 text-slate-500'
                          }`}
                          title={menu.visible !== false ? 'Menu Aktif' : 'Menu Disembunyikan'}
                        >
                          {menu.visible !== false ? (
                            <ToggleRight className="w-4 h-4" />
                          ) : (
                            <ToggleLeft className="w-4 h-4" />
                          )}
                        </button>
                      )}

                      {/* Up/Down buttons */}
                      {isSuperadmin && (
                        <div className="flex items-center gap-0.5 bg-[#100921] rounded-lg p-0.5 border border-[#35105E]">
                          <button
                            type="button"
                            onClick={() => moveStandaloneMenu(menu.id, 'up')}
                            disabled={index === 0}
                            className="p-1 text-purple-300 hover:text-white disabled:opacity-30 cursor-pointer"
                            title="Pindah ke Atas"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveStandaloneMenu(menu.id, 'down')}
                            disabled={index === sortedStandaloneMenus.length - 1}
                            className="p-1 text-purple-300 hover:text-white disabled:opacity-30 cursor-pointer"
                            title="Pindah ke Bawah"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Edit Button */}
                      {isSuperadmin && !isEditing && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingStandaloneId(menu.id);
                            setStandaloneDraftLabel(menu.label);
                            setStandaloneDraftIcon(menu.icon || 'LayoutDashboard');
                          }}
                          className="p-1.5 text-purple-300 hover:text-white hover:bg-[#35105E] rounded-lg cursor-pointer"
                          title="Edit Label / Ikon"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB 3: PENGATURAN SUBMENU (SUBMENU ITEMS PER CATEGORY)           */}
      {/* ================================================================ */}
      {activeConfigTab === 'submenus' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#1C1133] p-4 rounded-xl border border-[#35105E]">
            <div>
              <h2 className="text-sm font-bold text-white">Submenu per Kategori</h2>
              <p className="text-xs text-purple-300">
                Pindahkan submenu antar-kategori dengan dropdown atau drag & drop, atur urutan, edit nama, serta tentukan role permission.
              </p>
            </div>
            {isSuperadmin && (
              <button
                type="button"
                onClick={() => setShowAddSubmenuModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#7135B5] hover:bg-[#8B4BC1] text-white transition-colors cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Submenu</span>
              </button>
            )}
          </div>

          {/* Render category sections */}
          {sortedCategories.map(cat => {
            const CatIcon = getIconComp(cat.icon);
            const submenusInCat = submenusByCategory.get(cat.id) || [];

            return (
              <div
                key={cat.id}
                onDragOver={e => e.preventDefault()}
                onDrop={() => handleDropSubmenu(cat.id, submenusInCat.length)}
                className="bg-[#160D29] border border-[#35105E] rounded-2xl p-4 md:p-5 space-y-3"
              >
                {/* Category Header Bar */}
                <div className="flex items-center justify-between pb-3 border-b border-[#35105E]/60">
                  <div className="flex items-center gap-2.5">
                    <CatIcon className="w-5 h-5 text-[#D8B4FE]" />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                      {cat.name}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#261547] text-purple-300 border border-[#7135B5]/40">
                      {submenusInCat.length} Items
                    </span>
                  </div>
                  <span className="text-xs text-purple-400">
                    Kategori ID: <code className="text-[#D8B4FE]">{cat.id}</code>
                  </span>
                </div>

                {/* Submenu List */}
                {submenusInCat.length === 0 ? (
                  <div className="py-6 text-center text-xs text-purple-400 border border-dashed border-[#35105E] rounded-xl bg-[#110A21]/50">
                    Belum ada submenu dalam kategori ini. Geser submenu ke sini atau gunakan dropdown pindahkan kategori.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {submenusInCat.map((sub, sIndex) => {
                      const SubIcon = getIconComp(sub.icon);
                      const isEditing = editingSubmenuId === sub.id;

                      return (
                        <div
                          key={sub.id}
                          draggable={isSuperadmin}
                          onDragStart={() => handleDragStart('submenu', sub.id, cat.id)}
                          onDragOver={e => e.preventDefault()}
                          onDrop={() => handleDropSubmenu(cat.id, sIndex)}
                          className={`bg-[#1C1133] border rounded-xl p-3 transition-all ${
                            sub.visible === false
                              ? 'border-slate-800 opacity-60'
                              : 'border-[#35105E] hover:border-[#7135B5]/50'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            {/* Left: Drag Handle, Icon, Label, Roles */}
                            <div className="flex items-center gap-3">
                              {isSuperadmin && (
                                <div className="cursor-grab text-purple-400 hover:text-white p-1">
                                  <GripVertical className="w-3.5 h-3.5" />
                                </div>
                              )}

                              <div className="p-1.5 rounded-lg bg-[#261547] text-[#D8B4FE]">
                                <SubIcon className="w-3.5 h-3.5" />
                              </div>

                              {isEditing ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <input
                                    type="text"
                                    value={submenuDraftLabel}
                                    onChange={e => setSubmenuDraftLabel(e.target.value)}
                                    className="px-2 py-1 text-xs bg-[#100921] border border-[#7135B5] text-white rounded focus:outline-hidden"
                                    autoFocus
                                  />
                                  <select
                                    value={submenuDraftIcon}
                                    onChange={e => setSubmenuDraftIcon(e.target.value)}
                                    className="px-2 py-1 text-xs bg-[#100921] border border-[#7135B5] text-purple-200 rounded focus:outline-hidden"
                                  >
                                    {AVAILABLE_ICONS.map(i => (
                                      <option key={i.name} value={i.name}>
                                        {i.label}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (submenuDraftLabel.trim()) {
                                        updateSubmenu(sub.id, {
                                          label: submenuDraftLabel.trim(),
                                          icon: submenuDraftIcon
                                        });
                                        setEditingSubmenuId(null);
                                        toast.success('Submenu diperbarui.');
                                      }
                                    }}
                                    className="p-1 text-emerald-400 hover:bg-emerald-950/40 rounded cursor-pointer"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingSubmenuId(null)}
                                    className="p-1 text-rose-400 hover:bg-rose-950/40 rounded cursor-pointer"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-white">
                                      {sub.label}
                                    </span>
                                    <span className="text-[10px] text-purple-400 font-mono">
                                      ({sub.id})
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-purple-300">
                                    Role: {sub.roles?.join(', ')}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Right: Category selector, Up/Down, Active, Edit, Delete */}
                            <div className="flex items-center gap-2 self-end sm:self-center">
                              {/* Move to another category dropdown */}
                              {isSuperadmin && (
                                <select
                                  value={sub.categoryId}
                                  onChange={e => {
                                    moveSubmenuToCategory(sub.id, e.target.value);
                                    toast.success(`Submenu dipindahkan ke kategori baru.`);
                                  }}
                                  className="px-2 py-1 text-[10.5px] bg-[#100921] border border-[#35105E] text-purple-200 rounded-lg focus:outline-hidden cursor-pointer"
                                  title="Pindahkan ke Kategori Lain"
                                >
                                  {sortedCategories.map(c => (
                                    <option key={c.id} value={c.id}>
                                      Pindah ke: {c.name}
                                    </option>
                                  ))}
                                </select>
                              )}

                              {/* Active toggle */}
                              {isSuperadmin && (
                                <button
                                  type="button"
                                  onClick={() => toggleSubmenuActive(sub.id)}
                                  className={`p-1.5 rounded-lg border cursor-pointer ${
                                    sub.visible !== false
                                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                                      : 'bg-slate-800 border-slate-700 text-slate-500'
                                  }`}
                                  title={sub.visible !== false ? 'Submenu Aktif' : 'Submenu Nonaktif'}
                                >
                                  {sub.visible !== false ? (
                                    <ToggleRight className="w-3.5 h-3.5" />
                                  ) : (
                                    <ToggleLeft className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}

                              {/* Up / Down */}
                              {isSuperadmin && (
                                <div className="flex items-center gap-0.5 bg-[#100921] rounded-lg p-0.5 border border-[#35105E]">
                                  <button
                                    type="button"
                                    onClick={() => moveSubmenu(sub.id, 'up')}
                                    disabled={sIndex === 0}
                                    className="p-1 text-purple-300 hover:text-white disabled:opacity-30 cursor-pointer"
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moveSubmenu(sub.id, 'down')}
                                    disabled={sIndex === submenusInCat.length - 1}
                                    className="p-1 text-purple-300 hover:text-white disabled:opacity-30 cursor-pointer"
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </button>
                                </div>
                              )}

                              {/* Edit */}
                              {isSuperadmin && !isEditing && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingSubmenuId(sub.id);
                                    setSubmenuDraftLabel(sub.label);
                                    setSubmenuDraftIcon(sub.icon || 'FileText');
                                  }}
                                  className="p-1.5 text-purple-300 hover:text-white hover:bg-[#35105E] rounded-lg cursor-pointer"
                                  title="Edit Submenu"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              )}

                              {/* Delete */}
                              {isSuperadmin && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm(`Hapus submenu "${sub.label}"?`)) {
                                      deleteSubmenu(sub.id);
                                      toast.info(`Submenu "${sub.label}" dihapus.`);
                                    }
                                  }}
                                  className="p-1.5 text-rose-400 hover:text-rose-200 hover:bg-rose-950/40 rounded-lg cursor-pointer"
                                  title="Hapus Submenu"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ================================================================ */}
      {/* MODAL: TAMBAH KATEGORI BARU                                      */}
      {/* ================================================================ */}
      {showAddCategoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#160D29] border border-[#35105E] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#35105E]">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#D8B4FE]" />
                Tambah Kategori Navigasi
              </h3>
              <button
                type="button"
                onClick={() => setShowAddCategoryModal(false)}
                className="text-purple-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-purple-200 block mb-1">
                  Nama Kategori
                </label>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  placeholder="Contoh: Operasional Khusus"
                  className="w-full px-3 py-2 text-xs bg-[#100921] border border-[#35105E] text-white rounded-xl focus:border-[#7135B5] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-purple-200 block mb-1">
                  Ikon Kategori
                </label>
                <select
                  value={newCategoryIcon}
                  onChange={e => setNewCategoryIcon(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#100921] border border-[#35105E] text-white rounded-xl focus:border-[#7135B5] focus:outline-hidden"
                >
                  {AVAILABLE_ICONS.map(i => (
                    <option key={i.name} value={i.name}>
                      {i.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-purple-200 block mb-1">
                  Mode Tampilan
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewCategoryMode('accordion')}
                    className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                      newCategoryMode === 'accordion'
                        ? 'bg-[#7135B5]/40 border-[#D8B4FE] text-white'
                        : 'bg-[#100921] border-[#35105E] text-purple-300'
                    }`}
                  >
                    Accordion (Collapsible)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCategoryMode('static')}
                    className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                      newCategoryMode === 'static'
                        ? 'bg-[#7135B5]/40 border-[#D8B4FE] text-white'
                        : 'bg-[#100921] border-[#35105E] text-purple-300'
                    }`}
                  >
                    Static (Selalu Terbuka)
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#35105E]">
              <button
                type="button"
                onClick={() => setShowAddCategoryModal(false)}
                className="px-4 py-2 text-xs font-semibold text-purple-300 hover:text-white rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!newCategoryName.trim()) {
                    toast.warning('Nama kategori tidak boleh kosong.');
                    return;
                  }
                  addCategory({
                    name: newCategoryName.trim(),
                    icon: newCategoryIcon,
                    mode: newCategoryMode,
                    allowMultipleOpen: true
                  });
                  toast.success(`Kategori "${newCategoryName.trim()}" ditambahkan.`);
                  setNewCategoryName('');
                  setShowAddCategoryModal(false);
                }}
                className="px-4 py-2 text-xs font-bold bg-[#7135B5] hover:bg-[#8B4BC1] text-white rounded-xl cursor-pointer"
              >
                Tambah Kategori
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* MODAL: HAPUS KATEGORI & OPSI SUBMENU                             */}
      {/* ================================================================ */}
      {deletingCategory && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#160D29] border border-rose-500/40 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <div>
                <h3 className="text-base font-bold text-white">
                  Hapus Kategori "{deletingCategory.name}"?
                </h3>
                <p className="text-xs text-purple-300">
                  Pilih penanganan untuk submenu yang berada di dalam kategori ini:
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#100921] border border-[#35105E] cursor-pointer">
                <input
                  type="radio"
                  name="delAction"
                  checked={deleteSubmenuAction === 'move'}
                  onChange={() => setDeleteSubmenuAction('move')}
                  className="mt-0.5 text-purple-500 focus:ring-0"
                />
                <div className="flex-1">
                  <span className="text-xs font-bold text-white block">
                    Pindahkan Submenu ke Kategori Lain
                  </span>
                  <select
                    value={deleteTargetCategoryId}
                    onChange={e => setDeleteTargetCategoryId(e.target.value)}
                    disabled={deleteSubmenuAction !== 'move'}
                    className="mt-2 w-full px-2.5 py-1.5 text-xs bg-[#160D29] border border-[#35105E] text-white rounded-lg focus:outline-hidden"
                  >
                    {sortedCategories
                      .filter(c => c.id !== deletingCategory.id)
                      .map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.id})
                        </option>
                      ))}
                  </select>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#100921] border border-[#35105E] cursor-pointer">
                <input
                  type="radio"
                  name="delAction"
                  checked={deleteSubmenuAction === 'disable'}
                  onChange={() => setDeleteSubmenuAction('disable')}
                  className="mt-0.5 text-purple-500 focus:ring-0"
                />
                <div>
                  <span className="text-xs font-bold text-white block">
                    Nonaktifkan Seluruh Submenu
                  </span>
                  <span className="text-[11px] text-purple-300">
                    Submenu akan disembunyikan dari navigasi tanpa menghapus fungsi atau halaman aslinya.
                  </span>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#35105E]">
              <button
                type="button"
                onClick={() => setDeletingCategory(null)}
                className="px-4 py-2 text-xs font-semibold text-purple-300 hover:text-white"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteCategory(deletingCategory.id, deleteSubmenuAction, deleteTargetCategoryId);
                  toast.success(`Kategori "${deletingCategory.name}" telah dihapus.`);
                  setDeletingCategory(null);
                }}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl cursor-pointer"
              >
                Hapus Kategori
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* MODAL: TAMBAH SUBMENU BARU                                       */}
      {/* ================================================================ */}
      {showAddSubmenuModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#160D29] border border-[#35105E] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#35105E]">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#D8B4FE]" />
                Tambah Submenu Baru
              </h3>
              <button
                type="button"
                onClick={() => setShowAddSubmenuModal(false)}
                className="text-purple-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-purple-200 block mb-1">
                  Label Submenu
                </label>
                <input
                  type="text"
                  value={newSubmenuLabel}
                  onChange={e => setNewSubmenuLabel(e.target.value)}
                  placeholder="Contoh: Laporan Mingguan"
                  className="w-full px-3 py-2 text-xs bg-[#100921] border border-[#35105E] text-white rounded-xl focus:border-[#7135B5] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-purple-200 block mb-1">
                  Kategori Induk (Parent Category)
                </label>
                <select
                  value={newSubmenuCategoryId}
                  onChange={e => setNewSubmenuCategoryId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#100921] border border-[#35105E] text-white rounded-xl focus:border-[#7135B5] focus:outline-hidden"
                >
                  {sortedCategories.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-purple-200 block mb-1">
                  Ikon Submenu
                </label>
                <select
                  value={newSubmenuIcon}
                  onChange={e => setNewSubmenuIcon(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#100921] border border-[#35105E] text-white rounded-xl focus:border-[#7135B5] focus:outline-hidden"
                >
                  {AVAILABLE_ICONS.map(i => (
                    <option key={i.name} value={i.name}>
                      {i.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-purple-200 block mb-1">
                  Hak Akses Role
                </label>
                <div className="flex flex-wrap gap-2">
                  {['super_admin', 'dispatch', 'leader', 'management_data', 'it_support'].map(r => (
                    <label key={r} className="flex items-center gap-1.5 text-xs text-purple-300">
                      <input
                        type="checkbox"
                        checked={newSubmenuRoles.includes(r)}
                        onChange={e => {
                          if (e.target.checked) {
                            setNewSubmenuRoles(prev => [...prev, r]);
                          } else {
                            setNewSubmenuRoles(prev => prev.filter(x => x !== r));
                          }
                        }}
                        className="rounded border-[#35105E] text-purple-600 focus:ring-0"
                      />
                      <span className="capitalize">{r.replace('_', ' ')}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#35105E]">
              <button
                type="button"
                onClick={() => setShowAddSubmenuModal(false)}
                className="px-4 py-2 text-xs font-semibold text-purple-300 hover:text-white rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!newSubmenuLabel.trim()) {
                    toast.warning('Label submenu tidak boleh kosong.');
                    return;
                  }
                  addSubmenu({
                    label: newSubmenuLabel.trim(),
                    icon: newSubmenuIcon,
                    categoryId: newSubmenuCategoryId,
                    roles: newSubmenuRoles
                  });
                  toast.success(`Submenu "${newSubmenuLabel.trim()}" ditambahkan.`);
                  setNewSubmenuLabel('');
                  setShowAddSubmenuModal(false);
                }}
                className="px-4 py-2 text-xs font-bold bg-[#7135B5] hover:bg-[#8B4BC1] text-white rounded-xl cursor-pointer"
              >
                Tambah Submenu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* MODAL: RESET DEFAULT CONFIRMATION                                */}
      {/* ================================================================ */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#160D29] border border-rose-500/40 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <div>
                <h3 className="text-base font-bold text-white">
                  Reset ke Default Navigasi?
                </h3>
                <p className="text-xs text-purple-300">
                  Tindakan ini akan mengembalikan susunan 7 Menu Mandiri dan 3 Kategori Accordion (Contractor & Area, Installer, Menu Tambahan) ke konfigurasi standar.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#35105E]">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 text-xs font-semibold text-purple-300 hover:text-white"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                disabled={isSaving}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl cursor-pointer"
              >
                Reset Default
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* MODAL: LIVE PREVIEW SIDEBAR & WHITE THEME BOTTOM NAV              */}
      {/* ================================================================ */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#100A21] border border-[#35105E] rounded-2xl max-w-4xl w-full p-5 space-y-4 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#35105E] shrink-0">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Eye className="w-5 h-5 text-[#D8B4FE]" />
                  Pratinjau Navigasi MoraJaws
                </h3>
                <p className="text-xs text-purple-300">
                  Pratinjau tampilan navigasi Sidebar dan Bottom Navigation Bright Theme dengan berbagai peran user.
                </p>
              </div>

              {/* Role selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-purple-300 font-semibold">Simulasikan Role:</span>
                <select
                  value={previewRole}
                  onChange={e => setPreviewRole(e.target.value as any)}
                  className="px-2.5 py-1.5 text-xs bg-[#160D29] border border-[#7135B5] text-white rounded-lg focus:outline-hidden"
                >
                  <option value="super_admin">Super Admin</option>
                  <option value="dispatch">Dispatch</option>
                  <option value="leader">Leader / Korlap</option>
                  <option value="installer">Teknisi / Installer</option>
                </select>
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="text-purple-400 hover:text-white ml-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Preview Grid: Sidebar vs Bottom Nav */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-y-auto p-1">
              {/* Preview 1: Sidebar Mockup */}
              <div className="bg-[#160D29] border border-[#35105E] rounded-xl p-3 flex flex-col">
                <div className="pb-2 border-b border-[#35105E] text-[11px] font-bold text-[#D8B4FE] uppercase">
                  Sidebar Navigation (Dark Purple Gloss)
                </div>

                <div className="flex-1 py-2 space-y-2 overflow-y-auto">
                  {/* Standalone items */}
                  <div className="space-y-1">
                    {previewRole === 'installer' ? (
                      <>
                        <div className="px-3 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-[#5B35B1] to-[#7135B5] text-white border-l-4 border-l-[#D8B4FE] flex items-center gap-2">
                          <LayoutDashboard className="w-4 h-4 text-[#D8B4FE]" />
                          <span>Dashboard Installer</span>
                        </div>
                        <div className="px-3 py-2 rounded-xl text-xs font-semibold text-purple-200 hover:bg-[#35105E]/50 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-purple-300" />
                          <span>Tugas Saya</span>
                        </div>
                      </>
                    ) : (
                      sortedStandaloneMenus
                        .filter(m => m.visible !== false && (!m.roles || m.roles.includes(previewRole)))
                        .map((m, idx) => {
                          const IconComp = getIconComp(m.icon);
                          return (
                            <div
                              key={m.id}
                              className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 ${
                                idx === 0
                                  ? 'bg-gradient-to-r from-[#5B35B1] to-[#7135B5] text-white border-l-4 border-l-[#D8B4FE]'
                                  : 'text-purple-200 hover:bg-[#35105E]/40'
                              }`}
                            >
                              <IconComp className="w-4 h-4 text-[#D8B4FE]" />
                              <span>{m.label}</span>
                            </div>
                          );
                        })
                    )}
                  </div>

                  {/* Accordion Categories for non-installer */}
                  {previewRole !== 'installer' && (
                    <div className="space-y-2 pt-2 border-t border-[#35105E]/60">
                      {sortedCategories
                        .filter(c => c.isActive !== false)
                        .map(c => {
                          const subs = (submenusByCategory.get(c.id) || []).filter(
                            s => s.visible !== false && (!s.roles || s.roles.includes(previewRole))
                          );
                          if (subs.length === 0) return null;

                          const isOpen = !!previewOpenGroups[c.id];
                          const CatIcon = getIconComp(c.icon);

                          return (
                            <div key={c.id} className="rounded-xl bg-[#1C1133]/60 border border-[#35105E]/40">
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewOpenGroups(prev => ({
                                    ...prev,
                                    [c.id]: !prev[c.id]
                                  }))
                                }
                                className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-purple-200"
                              >
                                <div className="flex items-center gap-2">
                                  <CatIcon className="w-3.5 h-3.5 text-[#D8B4FE]" />
                                  <span className="uppercase text-[11px]">{c.name}</span>
                                </div>
                                <ChevronDown
                                  className={`w-3.5 h-3.5 transition-transform ${
                                    isOpen ? 'rotate-180 text-[#D8B4FE]' : ''
                                  }`}
                                />
                              </button>

                              {isOpen && (
                                <div className="space-y-1 p-1.5 pt-0 border-t border-[#35105E]/30">
                                  {subs.map(s => {
                                    const SubIcon = getIconComp(s.icon);
                                    return (
                                      <div
                                        key={s.id}
                                        className="px-2.5 py-1.5 rounded-lg text-xs text-purple-200 flex items-center gap-2 hover:bg-[#35105E]/40"
                                      >
                                        <SubIcon className="w-3.5 h-3.5 text-purple-400" />
                                        <span>{s.label}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>

              {/* Preview 2: Mobile Bottom Navigation White Theme */}
              <div className="bg-slate-100 rounded-xl p-3 flex flex-col justify-between border border-slate-300">
                <div>
                  <div className="pb-2 border-b border-slate-300 text-[11px] font-bold text-purple-900 uppercase">
                    Bottom Navigation (Bright White Theme)
                  </div>
                  <p className="text-xs text-slate-600 mt-2">
                    Menggunakan background putih bersih (#FFFFFF), highlight aktif (#F3EDFA), teks/ikon aktif (#6F35A5), serta indicator (#8B4BC1).
                  </p>
                </div>

                {/* Mockup of White Theme Bottom Bar */}
                <div className="mt-8 bg-[#FFFFFF] border-t border-[#E9E1F0] rounded-xl shadow-lg p-2 flex items-center justify-around">
                  {previewRole === 'installer' ? (
                    <>
                      <div className="flex flex-col items-center py-1 px-3 rounded-xl bg-[#F3EDFA] text-[#6F35A5]">
                        <LayoutDashboard className="w-5 h-5 text-[#6F35A5]" />
                        <span className="text-[10px] font-bold mt-0.5">Beranda</span>
                      </div>
                      <div className="flex flex-col items-center py-1 px-3 text-[#8B8495]">
                        <CheckCircle2 className="w-5 h-5" />
                        <span className="text-[10px] font-medium mt-0.5">Tugas</span>
                      </div>
                      <div className="flex flex-col items-center py-1 px-3 text-[#8B8495]">
                        <FolderTree className="w-5 h-5" />
                        <span className="text-[10px] font-medium mt-0.5">Menu</span>
                      </div>
                    </>
                  ) : previewRole === 'leader' ? (
                    <>
                      <div className="flex flex-col items-center py-1 px-3 rounded-xl bg-[#F3EDFA] text-[#6F35A5]">
                        <BarChart3 className="w-5 h-5 text-[#6F35A5]" />
                        <span className="text-[10px] font-bold mt-0.5">Progress</span>
                      </div>
                      <div className="flex flex-col items-center py-1 px-3 text-[#8B8495]">
                        <UserCheck className="w-5 h-5" />
                        <span className="text-[10px] font-medium mt-0.5">Assign</span>
                      </div>
                      <div className="flex flex-col items-center py-1 px-3 text-[#8B8495]">
                        <UserPlus className="w-5 h-5" />
                        <span className="text-[10px] font-medium mt-0.5">Teknisi</span>
                      </div>
                      <div className="flex flex-col items-center py-1 px-3 text-[#8B8495]">
                        <FolderTree className="w-5 h-5" />
                        <span className="text-[10px] font-medium mt-0.5">Menu</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-col items-center py-1 px-3 rounded-xl bg-[#F3EDFA] text-[#6F35A5]">
                        <LayoutDashboard className="w-5 h-5 text-[#6F35A5]" />
                        <span className="text-[10px] font-bold mt-0.5">Monitoring</span>
                      </div>
                      <div className="flex flex-col items-center py-1 px-3 text-[#8B8495]">
                        <TicketIcon className="w-5 h-5" />
                        <span className="text-[10px] font-medium mt-0.5">Tiket</span>
                      </div>
                      <div className="flex flex-col items-center py-1 px-3 text-[#8B8495]">
                        <FileSpreadsheet className="w-5 h-5" />
                        <span className="text-[10px] font-medium mt-0.5">Laporan</span>
                      </div>
                      <div className="flex flex-col items-center py-1 px-3 text-[#8B8495]">
                        <FolderTree className="w-5 h-5" />
                        <span className="text-[10px] font-medium mt-0.5">Menu</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
