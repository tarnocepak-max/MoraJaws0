import React, { useState } from 'react';
import { useNavigation } from '../../context/NavigationContext';
import { useApp } from '../../context/AppContext';
import { NavigationIcon, AVAILABLE_ICON_NAMES } from '../common/NavigationIcon';
import {
  NavigationCategory,
  NavigationStandaloneMenu,
  NavigationSubmenuItem
} from '../../types/navigation';
import {
  Save,
  RotateCcw,
  Plus,
  Trash2,
  Edit2,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  GripVertical,
  Check,
  X,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  FolderTree,
  FolderPlus,
  Layers,
  Sparkles,
  Cloud,
  ChevronRight,
  ChevronDown,
  Search,
  LayoutDashboard,
  ShieldAlert
} from 'lucide-react';

export const NavigationManagementView: React.FC = () => {
  const { currentUser } = useApp();
  const {
    draftConfig,
    isDraftDirty,
    isSaving,
    isCloudSyncing,
    cloudSyncStatus,
    lastSyncTime,

    updateCategoryInDraft,
    addCategoryToDraft,
    deleteCategoryFromDraft,
    moveCategoryInDraft,
    reorderCategoriesInDraft,

    updateStandaloneMenuInDraft,
    moveStandaloneMenuInDraft,
    deleteStandaloneMenuFromDraft,
    reorderStandaloneMenusInDraft,

    updateSubmenuInDraft,
    addSubmenuToDraft,
    deleteSubmenuFromDraft,
    moveSubmenuInDraft,
    moveSubmenuToCategoryInDraft,
    reorderSubmenuInCategoryInDraft,

    updateAccordionSettingsInDraft,

    saveChangesToFirestore,
    cancelChanges,
    resetToDefaultConfig
  } = useNavigation();

  // Active section inside the manager
  const [activeSection, setActiveSection] = useState<'standalone' | 'categories' | 'submenus' | 'settings'>('standalone');

  // Modals & form state
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('FolderTree');
  const [newCatMode, setNewCatMode] = useState<'accordion' | 'static'>('accordion');

  const [showAddSubmenuModal, setShowAddSubmenuModal] = useState(false);
  const [newSubName, setNewSubName] = useState('');
  const [newSubId, setNewSubId] = useState('');
  const [newSubCatId, setNewSubCatId] = useState('');
  const [newSubIcon, setNewSubIcon] = useState('FileSpreadsheet');

  // Delete Category confirmation modal
  const [categoryToDelete, setCategoryToDelete] = useState<NavigationCategory | null>(null);
  const [submenusActionOnDelete, setSubmenusActionOnDelete] = useState<'move_to_tambahan' | 'disable'>('move_to_tambahan');

  // Icon picker state
  const [iconPickerTarget, setIconPickerTarget] = useState<{
    type: 'category' | 'standalone' | 'submenu';
    id: string;
  } | null>(null);
  const [iconSearchQuery, setIconSearchQuery] = useState('');

  // Drag and Drop state
  const [draggedItem, setDraggedItem] = useState<{
    type: 'category' | 'standalone' | 'submenu';
    id: string;
    index: number;
    categoryId?: string;
  } | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);

  // Security check: Only Super Admin and authorized IT Support can modify navigation
  if (currentUser.role !== 'super_admin' && currentUser.role !== 'it_support') {
    return (
      <div className="bg-[#160D29] border border-[#35105E] rounded-2xl p-8 text-center max-w-lg mx-auto space-y-4 my-8 shadow-xl">
        <div className="w-12 h-12 bg-rose-950/60 text-rose-400 rounded-full flex items-center justify-center mx-auto border border-rose-500/30">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h3 className="font-bold text-white text-base">
          Akses Dibatasi: Otoritas Navigation Management
        </h3>
        <p className="text-xs text-[#D8B4FE]/80 leading-relaxed">
          Pengaturan susunan menu, accordion kategori, dan menu mandiri dilindungi dan hanya dapat dikonfigurasi oleh <strong>Super Admin</strong>.
        </p>
      </div>
    );
  }

  // Handle Save
  const handleSave = async () => {
    await saveChangesToFirestore(currentUser.name || 'Super Admin');
  };

  // Handle Reset Default
  const handleReset = async () => {
    if (confirm('Kembalikan konfigurasi seluruh navigasi MoraJaws (3 Kategori Accordion & 7 Menu Mandiri) ke standar awal? Pengaturan di Firebase Cloud Firestore akan diperbarui.')) {
      await resetToDefaultConfig(currentUser.name || 'Super Admin');
    }
  };

  // Drag and Drop Handlers for Standalone Menus
  const handleStandaloneDragStart = (e: React.DragEvent, id: string, index: number) => {
    e.dataTransfer.setData('text/plain', id);
    setDraggedItem({ type: 'standalone', id, index });
  };

  const handleStandaloneDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleStandaloneDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedItem && draggedItem.type === 'standalone' && draggedItem.index !== dropIndex) {
      reorderStandaloneMenusInDraft(draggedItem.index, dropIndex);
    }
    setDraggedItem(null);
    setDragOverIndex(null);
  };

  // Drag and Drop Handlers for Categories
  const handleCategoryDragStart = (e: React.DragEvent, id: string, index: number) => {
    e.dataTransfer.setData('text/plain', id);
    setDraggedItem({ type: 'category', id, index });
  };

  const handleCategoryDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleCategoryDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedItem && draggedItem.type === 'category' && draggedItem.index !== dropIndex) {
      reorderCategoriesInDraft(draggedItem.index, dropIndex);
    }
    setDraggedItem(null);
    setDragOverIndex(null);
  };

  // Drag and Drop Handlers for Submenus
  const handleSubmenuDragStart = (e: React.DragEvent, id: string, index: number, categoryId: string) => {
    e.dataTransfer.setData('text/plain', id);
    setDraggedItem({ type: 'submenu', id, index, categoryId });
  };

  const handleSubmenuDragOver = (e: React.DragEvent, index: number, categoryId: string) => {
    e.preventDefault();
    setDragOverIndex(index);
    setDragOverCategory(categoryId);
  };

  const handleSubmenuDrop = (e: React.DragEvent, dropIndex: number, targetCategoryId: string) => {
    e.preventDefault();
    if (draggedItem && draggedItem.type === 'submenu') {
      if (draggedItem.categoryId === targetCategoryId) {
        // Reordering within the same category
        if (draggedItem.index !== dropIndex) {
          reorderSubmenuInCategoryInDraft(targetCategoryId, draggedItem.index, dropIndex);
        }
      } else {
        // Moving across categories via drag & drop!
        moveSubmenuToCategoryInDraft(draggedItem.id, targetCategoryId);
      }
    }
    setDraggedItem(null);
    setDragOverIndex(null);
    setDragOverCategory(null);
  };

  // Handle Add Category
  const handleAddCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = addCategoryToDraft(newCatName, newCatIcon, newCatMode);
    if (res.success) {
      setNewCatName('');
      setShowAddCategoryModal(false);
    } else {
      alert(res.error);
    }
  };

  // Handle Add Submenu
  const handleAddSubmenuSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const targetCat = newSubCatId || draftConfig.categories[0]?.id;
    if (!targetCat) {
      alert('Buat kategori terlebih dahulu.');
      return;
    }
    const res = addSubmenuToDraft(newSubName, targetCat, newSubId, newSubIcon);
    if (res.success) {
      setNewSubName('');
      setNewSubId('');
      setShowAddSubmenuModal(false);
    } else {
      alert(res.error);
    }
  };

  // Handle Delete Category execution
  const executeDeleteCategory = () => {
    if (!categoryToDelete) return;
    deleteCategoryFromDraft(categoryToDelete.id, submenusActionOnDelete);
    setCategoryToDelete(null);
  };

  // Icon selection helper
  const handleSelectIcon = (iconName: string) => {
    if (!iconPickerTarget) return;
    if (iconPickerTarget.type === 'category') {
      updateCategoryInDraft(iconPickerTarget.id, { icon: iconName });
    } else if (iconPickerTarget.type === 'standalone') {
      updateStandaloneMenuInDraft(iconPickerTarget.id, { icon: iconName });
    } else if (iconPickerTarget.type === 'submenu') {
      updateSubmenuInDraft(iconPickerTarget.id, { icon: iconName });
    }
    setIconPickerTarget(null);
  };

  const filteredIcons = AVAILABLE_ICON_NAMES.filter(name =>
    String(name || '').toLowerCase().includes(String(iconSearchQuery || '').toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Banner: Dark Purple Gloss + Lilac Header with Firestore status */}
      <div className="bg-gradient-to-r from-[#160D29] via-[#2D124D] to-[#160D29] border border-[#35105E] rounded-2xl p-5 shadow-xl relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-[#A855F7]/15 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#7135B5] to-[#A855F7] text-white flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(168,85,247,0.5)] border border-[#E9D5FF]/30">
              <FolderTree className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base font-extrabold text-white tracking-wide">
                  Navigation Management
                </h2>
                {/* Cloud Firestore Status Badge */}
                <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-semibold border bg-[#160D29]/80 border-[#35105E]">
                  {isCloudSyncing ? (
                    <>
                      <RefreshCw className="w-3 h-3 text-[#A855F7] animate-spin" />
                      <span className="text-[#D8B4FE]">Sinkronisasi Cloud...</span>
                    </>
                  ) : cloudSyncStatus === 'synced' ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-300 font-bold">
                        Cloud Firestore (appSettings/navigation)
                        {lastSyncTime ? ` · ${new Date(lastSyncTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : ''}
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3 h-3 text-rose-400" />
                      <span className="text-rose-300">Gagal Sinkronisasi</span>
                    </>
                  )}
                </div>

                {isDraftDirty && (
                  <span className="px-2.5 py-0.5 text-[10px] font-extrabold bg-amber-400/20 text-amber-300 border border-amber-400/30 rounded-full animate-pulse">
                    Ada Perubahan Belum Disimpan
                  </span>
                )}
              </div>
              <p className="text-xs text-[#D8B4FE]/80 mt-1">
                Kelola 3 Kategori Accordion, 7 Menu Mandiri, susunan submenu, mode accordion, serta drag &amp; drop reordering. Seluruh konfigurasi tersimpan permanen di Firebase Cloud Firestore.
              </p>
            </div>
          </div>

          {/* Action Buttons: Simpan, Batalkan, Reset Default */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-gradient-to-r from-[#7135B5] to-[#A855F7] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 text-white font-extrabold text-xs rounded-[14px] shadow-[0_0_20px_rgba(168,85,247,0.55)] border border-[#E9D5FF]/40 flex items-center gap-2 cursor-pointer transition-all"
              title="Simpan konfigurasi navigasi ke Firestore"
            >
              {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Simpan Perubahan</span>
            </button>

            {isDraftDirty && (
              <button
                onClick={cancelChanges}
                className="px-3.5 py-2 bg-[#160D29] hover:bg-[#35105E] text-[#D8B4FE] font-bold text-xs rounded-[14px] border border-[#35105E] flex items-center gap-1.5 cursor-pointer transition-all"
                title="Batalkan perubahan yang belum disimpan"
              >
                <X className="w-3.5 h-3.5" />
                <span>Batalkan</span>
              </button>
            )}

            <button
              onClick={handleReset}
              className="px-3.5 py-2 bg-[#160D29] hover:bg-rose-950/40 text-rose-300 hover:text-rose-200 font-bold text-xs rounded-[14px] border border-rose-500/30 flex items-center gap-1.5 cursor-pointer transition-all"
              title="Kembalikan susunan menu ke default bawaan sistem"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Default</span>
            </button>
          </div>
        </div>
      </div>

      {/* Nav Tabs for Section Switcher */}
      <div className="flex items-center gap-2 border-b border-[#35105E] overflow-x-auto pb-1 text-xs font-bold">
        <button
          onClick={() => setActiveSection('standalone')}
          className={`px-4 py-2.5 rounded-t-xl flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeSection === 'standalone'
              ? 'bg-[#35105E] text-white border-t-2 border-[#A855F7] shadow-inner'
              : 'text-[#D8B4FE]/70 hover:text-white hover:bg-[#35105E]/40'
          }`}
        >
          <LayoutDashboard className="w-4 h-4 text-[#A855F7]" />
          <span>Menu Mandiri (7 Menu)</span>
          <span className="px-1.5 py-0.2 rounded-full bg-[#160D29] text-[10px] text-[#D8B4FE]">
            {draftConfig.standaloneMenus.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSection('categories')}
          className={`px-4 py-2.5 rounded-t-xl flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeSection === 'categories'
              ? 'bg-[#35105E] text-white border-t-2 border-[#A855F7] shadow-inner'
              : 'text-[#D8B4FE]/70 hover:text-white hover:bg-[#35105E]/40'
          }`}
        >
          <Layers className="w-4 h-4 text-[#A855F7]" />
          <span>Kategori Accordion (3 Kategori)</span>
          <span className="px-1.5 py-0.2 rounded-full bg-[#160D29] text-[10px] text-[#D8B4FE]">
            {draftConfig.categories.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSection('submenus')}
          className={`px-4 py-2.5 rounded-t-xl flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeSection === 'submenus'
              ? 'bg-[#35105E] text-white border-t-2 border-[#A855F7] shadow-inner'
              : 'text-[#D8B4FE]/70 hover:text-white hover:bg-[#35105E]/40'
          }`}
        >
          <FolderTree className="w-4 h-4 text-[#A855F7]" />
          <span>Pengaturan Submenu</span>
          <span className="px-1.5 py-0.2 rounded-full bg-[#160D29] text-[10px] text-[#D8B4FE]">
            {draftConfig.submenuItems.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSection('settings')}
          className={`px-4 py-2.5 rounded-t-xl flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeSection === 'settings'
              ? 'bg-[#35105E] text-white border-t-2 border-[#A855F7] shadow-inner'
              : 'text-[#D8B4FE]/70 hover:text-white hover:bg-[#35105E]/40'
          }`}
        >
          <Sparkles className="w-4 h-4 text-[#A855F7]" />
          <span>Pengaturan Accordion &amp; Animasi</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* SECTION 1: STANDALONE MENUS CONFIGURATION */}
      {/* ======================================================== */}
      {activeSection === 'standalone' && (
        <div className="bg-[#160D29] border border-[#35105E] rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#35105E]">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Pengaturan Menu Mandiri (Standalone Menu)</span>
              </h3>
              <p className="text-xs text-[#D8B4FE]/70 mt-0.5">
                7 menu utama yang berdiri sendiri, tampil sejajar di navigasi tanpa parent category dan tanpa accordion. Anda dapat mengubah nama, ikon, urutan, serta visibilitasnya.
              </p>
            </div>
            <div className="text-[11px] text-[#D8B4FE]/80 font-mono bg-[#35105E]/60 px-3 py-1 rounded-lg">
              Total: {draftConfig.standaloneMenus.length} Menu Mandiri
            </div>
          </div>

          <div className="space-y-2">
            {[...draftConfig.standaloneMenus]
              .sort((a, b) => a.order - b.order)
              .map((menu, index) => {
                const isOver = dragOverIndex === index;

                return (
                  <div
                    key={menu.id}
                    draggable
                    onDragStart={(e) => handleStandaloneDragStart(e, menu.id, index)}
                    onDragOver={(e) => handleStandaloneDragOver(e, index)}
                    onDrop={(e) => handleStandaloneDrop(e, index)}
                    className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border transition-all ${
                      isOver
                        ? 'border-[#A855F7] bg-[#7135B5]/30'
                        : menu.visible
                        ? 'border-[#35105E] bg-[#24133F]/70 hover:bg-[#35105E]/50'
                        : 'border-[#35105E]/40 bg-[#160D29]/60 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Drag Handle */}
                      <div
                        className="cursor-grab active:cursor-grabbing p-1 text-[#D8B4FE]/60 hover:text-white"
                        title="Tahan & geser untuk mengubah urutan (Drag & Drop)"
                      >
                        <GripVertical className="w-4 h-4" />
                      </div>

                      {/* Order Badge */}
                      <span className="w-6 text-[11px] font-mono text-[#D8B4FE]/60 text-center">
                        #{menu.order}
                      </span>

                      {/* Icon Button */}
                      <button
                        type="button"
                        onClick={() => setIconPickerTarget({ type: 'standalone', id: menu.id })}
                        className="w-8 h-8 rounded-lg bg-[#35105E] hover:bg-[#7135B5]/60 text-[#D8B4FE] hover:text-white flex items-center justify-center border border-[#7135B5]/40 transition-colors cursor-pointer shrink-0"
                        title="Klik untuk memilih ikon baru"
                      >
                        <NavigationIcon name={menu.icon} className="w-4 h-4" />
                      </button>

                      {/* Editable Name & ID */}
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={menu.name || (menu as any).label || ''}
                          onChange={(e) => updateStandaloneMenuInDraft(menu.id, { name: e.target.value })}
                          className="w-full max-w-sm px-2.5 py-1 text-xs font-bold text-white bg-[#160D29] border border-[#35105E] rounded-lg focus:border-[#A855F7] focus:ring-1 focus:ring-[#A855F7]"
                        />
                        <div className="text-[10px] text-[#D8B4FE]/60 font-mono mt-0.5">
                          ID: <span className="text-[#A855F7]">{menu.id}</span>
                          {menu.roles && ` · Roles: ${menu.roles.join(', ')}`}
                        </div>
                      </div>
                    </div>

                    {/* Controls: Up, Down, Visibility, Delete */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => moveStandaloneMenuInDraft(menu.id, 'up')}
                        disabled={index === 0}
                        className="p-1.5 rounded-lg border border-[#35105E] text-[#D8B4FE] hover:bg-[#35105E] disabled:opacity-20 cursor-pointer"
                        title="Geser Naik"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => moveStandaloneMenuInDraft(menu.id, 'down')}
                        disabled={index === draftConfig.standaloneMenus.length - 1}
                        className="p-1.5 rounded-lg border border-[#35105E] text-[#D8B4FE] hover:bg-[#35105E] disabled:opacity-20 cursor-pointer"
                        title="Geser Turun"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => updateStandaloneMenuInDraft(menu.id, { visible: !menu.visible })}
                        className={`p-1.5 rounded-lg border cursor-pointer ${
                          menu.visible
                            ? 'border-emerald-500/40 text-emerald-400 bg-emerald-950/30'
                            : 'border-slate-700 text-slate-500 bg-slate-900/40'
                        }`}
                        title={menu.visible ? 'Sembunyikan menu dari navigasi' : 'Tampilkan menu di navigasi'}
                      >
                        {menu.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        onClick={() => {
                          if (confirm(`Hapus menu mandiri "${menu.name}" dari konfigurasi navigasi? Halaman dan fungsinya tetap aman di sistem.`)) {
                            deleteStandaloneMenuFromDraft(menu.id);
                          }
                        }}
                        className="p-1.5 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-950/40 cursor-pointer"
                        title="Hapus dari konfigurasi"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION 2: ACCORDION CATEGORIES CONFIGURATION */}
      {/* ======================================================== */}
      {activeSection === 'categories' && (
        <div className="bg-[#160D29] border border-[#35105E] rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#35105E]">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Pengaturan Kategori Accordion (3 Kategori Utama)</span>
              </h3>
              <p className="text-xs text-[#D8B4FE]/70 mt-0.5">
                Kategori utama: Contractor &amp; Area, Installer, dan Menu Tambahan. Setiap kategori menggunakan accordion collapse independen.
              </p>
            </div>
            <button
              onClick={() => setShowAddCategoryModal(true)}
              className="px-3.5 py-1.5 bg-[#7135B5] hover:bg-[#A855F7] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md transition-all self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Kategori</span>
            </button>
          </div>

          <div className="space-y-3">
            {[...draftConfig.categories]
              .sort((a, b) => a.order - b.order)
              .map((cat, index) => {
                const submenusCount = draftConfig.submenuItems.filter(s => s.categoryId === cat.id).length;
                const isOver = dragOverIndex === index;

                return (
                  <div
                    key={cat.id}
                    draggable
                    onDragStart={(e) => handleCategoryDragStart(e, cat.id, index)}
                    onDragOver={(e) => handleCategoryDragOver(e, index)}
                    onDrop={(e) => handleCategoryDrop(e, index)}
                    className={`p-4 rounded-xl border transition-all ${
                      isOver
                        ? 'border-[#A855F7] bg-[#7135B5]/30'
                        : cat.visible
                        ? 'border-[#35105E] bg-[#24133F]/70'
                        : 'border-[#35105E]/40 bg-[#160D29]/60 opacity-60'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {/* Drag Handle */}
                        <div
                          className="cursor-grab active:cursor-grabbing p-1 text-[#D8B4FE]/60 hover:text-white"
                          title="Tahan & geser untuk mengubah urutan kategori"
                        >
                          <GripVertical className="w-4 h-4" />
                        </div>

                        {/* Order Badge */}
                        <span className="w-6 text-[11px] font-mono text-[#D8B4FE]/60 text-center">
                          #{cat.order}
                        </span>

                        {/* Category Icon */}
                        <button
                          type="button"
                          onClick={() => setIconPickerTarget({ type: 'category', id: cat.id })}
                          className="w-9 h-9 rounded-lg bg-[#35105E] hover:bg-[#7135B5]/60 text-[#D8B4FE] hover:text-white flex items-center justify-center border border-[#7135B5]/40 transition-colors cursor-pointer shrink-0"
                          title="Ganti Ikon Kategori"
                        >
                          <NavigationIcon name={cat.icon} className="w-4 h-4" />
                        </button>

                        {/* Name input */}
                        <div className="flex-1 min-w-0">
                          <input
                            type="text"
                            value={cat.name || cat.title || (cat as any).label || ''}
                            onChange={(e) => updateCategoryInDraft(cat.id, { name: e.target.value })}
                            className="w-full max-w-sm px-2.5 py-1 text-xs font-bold text-white bg-[#160D29] border border-[#35105E] rounded-lg focus:border-[#A855F7]"
                          />
                          <div className="text-[10px] text-[#D8B4FE]/60 font-mono mt-0.5">
                            ID: <span className="text-[#A855F7]">{cat.id}</span> · Memiliki {submenusCount} submenu
                          </div>
                        </div>
                      </div>

                      {/* Category Options: Mode (Accordion/Static), Up/Down, Visibility, Delete */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Mode Select */}
                        <select
                          value={cat.mode}
                          onChange={(e) => updateCategoryInDraft(cat.id, { mode: e.target.value as any })}
                          className="px-2.5 py-1 text-xs bg-[#160D29] text-[#D8B4FE] border border-[#35105E] rounded-lg cursor-pointer font-semibold"
                        >
                          <option value="accordion">Accordion (Collapse)</option>
                          <option value="static">Static (Selalu Buka)</option>
                        </select>

                        {/* Up/Down buttons */}
                        <button
                          onClick={() => moveCategoryInDraft(cat.id, 'up')}
                          disabled={index === 0}
                          className="p-1.5 rounded-lg border border-[#35105E] text-[#D8B4FE] hover:bg-[#35105E] disabled:opacity-20 cursor-pointer"
                          title="Geser Naik"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => moveCategoryInDraft(cat.id, 'down')}
                          disabled={index === draftConfig.categories.length - 1}
                          className="p-1.5 rounded-lg border border-[#35105E] text-[#D8B4FE] hover:bg-[#35105E] disabled:opacity-20 cursor-pointer"
                          title="Geser Turun"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>

                        {/* Visibility Toggle */}
                        <button
                          onClick={() => updateCategoryInDraft(cat.id, { visible: !cat.visible })}
                          className={`p-1.5 rounded-lg border cursor-pointer ${
                            cat.visible
                              ? 'border-emerald-500/40 text-emerald-400 bg-emerald-950/30'
                              : 'border-slate-700 text-slate-500 bg-slate-900/40'
                          }`}
                          title={cat.visible ? 'Sembunyikan kategori' : 'Tampilkan kategori'}
                        >
                          {cat.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>

                        {/* Delete Category */}
                        <button
                          onClick={() => setCategoryToDelete(cat)}
                          className="p-1.5 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-950/40 cursor-pointer"
                          title="Hapus Kategori"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION 3: SUBMENUS CONFIGURATION */}
      {/* ======================================================== */}
      {activeSection === 'submenus' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#160D29] border border-[#35105E] rounded-2xl p-5 shadow-xl">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Pengaturan Submenu Per Kategori</span>
              </h3>
              <p className="text-xs text-[#D8B4FE]/70 mt-0.5">
                Atur urutan submenu dalam kategori, pindahkan submenu ke kategori lain (dropdown / drag &amp; drop), ubah nama &amp; ikon submenu.
              </p>
            </div>
            <button
              onClick={() => setShowAddSubmenuModal(true)}
              className="px-3.5 py-1.5 bg-[#7135B5] hover:bg-[#A855F7] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md transition-all self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Submenu</span>
            </button>
          </div>

          {/* Grouped by Parent Category */}
          {draftConfig.categories.map((category) => {
            const submenus = draftConfig.submenuItems
              .filter(s => {
                const sCat = String(s.categoryId || (s as any).parentCategoryId || '').toLowerCase();
                const cId = String(category.id || '').toLowerCase();
                return sCat === cId ||
                  (cId.includes('contractor') && sCat.includes('contractor')) ||
                  (cId.includes('installer') && sCat.includes('installer')) ||
                  ((cId.includes('tambahan') || cId.includes('extra')) &&
                   (sCat.includes('tambahan') || sCat.includes('extra')));
              })
              .sort((a, b) => a.order - b.order);

            return (
              <div
                key={category.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverCategory(category.id);
                }}
                className={`bg-[#160D29] border rounded-2xl overflow-hidden shadow-xl transition-all ${
                  dragOverCategory === category.id && draggedItem?.type === 'submenu' && draggedItem.categoryId !== category.id
                    ? 'border-[#A855F7] ring-2 ring-[#A855F7]/30'
                    : 'border-[#35105E]'
                }`}
              >
                {/* Category Group Header */}
                <div className="bg-gradient-to-r from-[#24133F] to-[#160D29] px-5 py-3 border-b border-[#35105E] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <NavigationIcon name={category.icon} className="w-4 h-4 text-[#A855F7]" />
                    <span className="font-extrabold text-white text-xs uppercase tracking-wider">
                      {category.name}
                    </span>
                    <span className="text-[10px] bg-[#35105E] text-[#D8B4FE] px-2 py-0.5 rounded-full font-bold">
                      {submenus.length} submenu
                    </span>
                  </div>
                  <span className="text-[11px] text-[#D8B4FE]/60 font-mono">
                    Mode: {category.mode === 'accordion' ? 'Accordion' : 'Static'}
                  </span>
                </div>

                {/* Submenus List */}
                <div className="divide-y divide-[#35105E]/50">
                  {submenus.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[#D8B4FE]/50 italic">
                      Belum ada submenu di kategori ini. Anda dapat menggeser (drag &amp; drop) submenu dari kategori lain ke sini.
                    </div>
                  ) : (
                    submenus.map((sub, subIndex) => {
                      const isOver = dragOverIndex === subIndex && dragOverCategory === category.id;

                      return (
                        <div
                          key={sub.id}
                          draggable
                          onDragStart={(e) => handleSubmenuDragStart(e, sub.id, subIndex, category.id)}
                          onDragOver={(e) => handleSubmenuDragOver(e, subIndex, category.id)}
                          onDrop={(e) => handleSubmenuDrop(e, subIndex, category.id)}
                          className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                            isOver
                              ? 'bg-[#7135B5]/25 border-t border-[#A855F7]'
                              : sub.visible
                              ? 'hover:bg-[#35105E]/30'
                              : 'opacity-50 bg-[#160D29]/40'
                          }`}
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {/* Drag Handle */}
                            <div
                              className="cursor-grab active:cursor-grabbing p-1 text-[#D8B4FE]/60 hover:text-white"
                              title="Tahan & geser untuk memindahkan atau mengubah urutan"
                            >
                              <GripVertical className="w-4 h-4" />
                            </div>

                            {/* Order */}
                            <span className="w-6 text-[11px] font-mono text-[#D8B4FE]/60 text-center">
                              #{sub.order}
                            </span>

                            {/* Submenu Icon */}
                            <button
                              type="button"
                              onClick={() => setIconPickerTarget({ type: 'submenu', id: sub.id })}
                              className="w-8 h-8 rounded-lg bg-[#35105E] hover:bg-[#7135B5]/60 text-[#D8B4FE] hover:text-white flex items-center justify-center border border-[#7135B5]/40 transition-colors cursor-pointer shrink-0"
                              title="Ganti Ikon Submenu"
                            >
                              <NavigationIcon name={sub.icon} className="w-3.5 h-3.5" />
                            </button>

                            {/* Editable Name & ID */}
                            <div className="flex-1 min-w-0">
                              <input
                                type="text"
                                value={sub.name || (sub as any).label || ''}
                                onChange={(e) => updateSubmenuInDraft(sub.id, { name: e.target.value })}
                                className="w-full max-w-sm px-2.5 py-1 text-xs font-semibold text-white bg-[#160D29] border border-[#35105E] rounded-lg focus:border-[#A855F7]"
                              />
                              <div className="text-[10px] text-[#D8B4FE]/60 font-mono mt-0.5">
                                ID: <span className="text-[#A855F7]">{sub.id}</span>
                                {sub.roles && ` · Roles: ${sub.roles.join(', ')}`}
                              </div>
                            </div>
                          </div>

                          {/* Controls: Move Category, Up, Down, Visibility, Delete */}
                          <div className="flex items-center gap-2 flex-wrap self-end sm:self-auto">
                            {/* Target Category Selector */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-[#D8B4FE]/60">Kategori:</span>
                              <select
                                value={sub.categoryId}
                                onChange={(e) => moveSubmenuToCategoryInDraft(sub.id, e.target.value)}
                                className="text-xs px-2 py-1 bg-[#160D29] border border-[#35105E] rounded-lg text-[#D8B4FE] font-medium cursor-pointer"
                              >
                                {draftConfig.categories.map(c => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                            </div>

                            {/* Up / Down */}
                            <button
                              onClick={() => moveSubmenuInDraft(sub.id, 'up')}
                              disabled={subIndex === 0}
                              className="p-1.5 rounded-lg border border-[#35105E] text-[#D8B4FE] hover:bg-[#35105E] disabled:opacity-20 cursor-pointer"
                              title="Geser Naik"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => moveSubmenuInDraft(sub.id, 'down')}
                              disabled={subIndex === submenus.length - 1}
                              className="p-1.5 rounded-lg border border-[#35105E] text-[#D8B4FE] hover:bg-[#35105E] disabled:opacity-20 cursor-pointer"
                              title="Geser Turun"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>

                            {/* Visibility */}
                            <button
                              onClick={() => updateSubmenuInDraft(sub.id, { visible: !sub.visible })}
                              className={`p-1.5 rounded-lg border cursor-pointer ${
                                sub.visible
                                  ? 'border-emerald-500/40 text-emerald-400 bg-emerald-950/30'
                                  : 'border-slate-700 text-slate-500 bg-slate-900/40'
                              }`}
                              title={sub.visible ? 'Sembunyikan submenu' : 'Tampilkan submenu'}
                            >
                              {sub.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                            </button>

                            {/* Delete */}
                            <button
                              onClick={() => {
                                if (confirm(`Hapus submenu "${sub.name}" dari konfigurasi navigasi?`)) {
                                  deleteSubmenuFromDraft(sub.id);
                                }
                              }}
                              className="p-1.5 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-950/40 cursor-pointer"
                              title="Hapus Submenu"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION 4: ACCORDION & ANIMATION SETTINGS */}
      {/* ======================================================== */}
      {activeSection === 'settings' && (
        <div className="bg-[#160D29] border border-[#35105E] rounded-2xl p-6 shadow-xl space-y-6">
          <div className="pb-3 border-b border-[#35105E]">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Pengaturan Perilaku Accordion &amp; Animasi</span>
            </h3>
            <p className="text-xs text-[#D8B4FE]/70 mt-0.5">
              Atur apakah beberapa kategori accordion dapat dibuka bersamaan secara independen, serta animasi transisi expand/collapse.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Setting 1: Allow Multiple Open */}
            <div className="p-4 rounded-xl border border-[#35105E] bg-[#24133F]/50 space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-bold text-xs text-white">
                  Multi-Submenu Collapse (Buka Bersamaan)
                </label>
                <input
                  type="checkbox"
                  checked={draftConfig.accordionSettings?.allowMultipleOpen ?? true}
                  onChange={(e) => updateAccordionSettingsInDraft({ allowMultipleOpen: e.target.checked })}
                  className="rounded text-[#A855F7] w-4 h-4 cursor-pointer focus:ring-[#A855F7]"
                />
              </div>
              <p className="text-[11px] text-[#D8B4FE]/70 leading-relaxed">
                Ketika aktif, pengguna dapat membuka beberapa kategori secara independen tanpa otomatis menutup kategori lain yang sedang terbuka.
              </p>
            </div>

            {/* Setting 2: Smooth Animation */}
            <div className="p-4 rounded-xl border border-[#35105E] bg-[#24133F]/50 space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-bold text-xs text-white">
                  Animasi Halus Expand / Collapse
                </label>
                <input
                  type="checkbox"
                  checked={draftConfig.accordionSettings?.smoothAnimation ?? true}
                  onChange={(e) => updateAccordionSettingsInDraft({ smoothAnimation: e.target.checked })}
                  className="rounded text-[#A855F7] w-4 h-4 cursor-pointer focus:ring-[#A855F7]"
                />
              </div>
              <p className="text-[11px] text-[#D8B4FE]/70 leading-relaxed">
                Mengaktifkan transisi CSS halus untuk chevron dan rotasi panah indikator saat kategori dibuka atau ditutup.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 1: ADD CATEGORY */}
      {/* ======================================================== */}
      {showAddCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <form
            onSubmit={handleAddCategorySubmit}
            className="bg-[#160D29] border border-[#35105E] rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4 text-xs text-white"
          >
            <h4 className="font-extrabold text-sm text-white flex items-center gap-2">
              <FolderPlus className="w-4 h-4 text-[#A855F7]" />
              <span>Tambah Kategori Navigasi Baru</span>
            </h4>

            <div>
              <label className="block text-[#D8B4FE] font-bold mb-1">Nama Kategori</label>
              <input
                type="text"
                placeholder="misal: Operasional Khusus"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="w-full px-3 py-2 bg-[#24133F] border border-[#35105E] rounded-xl text-white focus:border-[#A855F7]"
                required
              />
            </div>

            <div>
              <label className="block text-[#D8B4FE] font-bold mb-1">Ikon Kategori</label>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-[#24133F] border border-[#35105E] flex items-center justify-center text-[#A855F7]">
                  <NavigationIcon name={newCatIcon} className="w-4 h-4" />
                </div>
                <select
                  value={newCatIcon}
                  onChange={(e) => setNewCatIcon(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[#24133F] border border-[#35105E] rounded-xl text-white font-medium"
                >
                  {AVAILABLE_ICON_NAMES.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[#D8B4FE] font-bold mb-1">Mode Kategori</label>
              <select
                value={newCatMode}
                onChange={(e) => setNewCatMode(e.target.value as any)}
                className="w-full px-3 py-2 bg-[#24133F] border border-[#35105E] rounded-xl text-white font-medium"
              >
                <option value="accordion">Accordion (Dapat di-collapse)</option>
                <option value="static">Static (Selalu terbuka)</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#35105E]">
              <button
                type="button"
                onClick={() => setShowAddCategoryModal(false)}
                className="px-4 py-2 bg-[#24133F] hover:bg-[#35105E] text-[#D8B4FE] font-bold rounded-xl cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-gradient-to-r from-[#7135B5] to-[#A855F7] hover:scale-105 text-white font-extrabold rounded-xl shadow-md cursor-pointer"
              >
                Tambah Kategori
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: ADD SUBMENU */}
      {/* ======================================================== */}
      {showAddSubmenuModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <form
            onSubmit={handleAddSubmenuSubmit}
            className="bg-[#160D29] border border-[#35105E] rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4 text-xs text-white"
          >
            <h4 className="font-extrabold text-sm text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#A855F7]" />
              <span>Tambah Submenu Baru</span>
            </h4>

            <div>
              <label className="block text-[#D8B4FE] font-bold mb-1">Nama Submenu</label>
              <input
                type="text"
                placeholder="misal: Laporan Tambahan"
                value={newSubName}
                onChange={(e) => {
                  setNewSubName(e.target.value);
                  if (!newSubId) {
                    setNewSubId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
                  }
                }}
                className="w-full px-3 py-2 bg-[#24133F] border border-[#35105E] rounded-xl text-white focus:border-[#A855F7]"
                required
              />
            </div>

            <div>
              <label className="block text-[#D8B4FE] font-bold mb-1">ID Submenu (Route/Key)</label>
              <input
                type="text"
                placeholder="misal: extra_reports"
                value={newSubId}
                onChange={(e) => setNewSubId(e.target.value)}
                className="w-full px-3 py-2 bg-[#24133F] border border-[#35105E] rounded-xl text-white font-mono focus:border-[#A855F7]"
                required
              />
              <p className="text-[10px] text-[#D8B4FE]/60 mt-0.5">
                Gunakan ID yang unik, tidak boleh bertabrakan dengan ID menu lain.
              </p>
            </div>

            <div>
              <label className="block text-[#D8B4FE] font-bold mb-1">Parent Category</label>
              <select
                value={newSubCatId || draftConfig.categories[0]?.id}
                onChange={(e) => setNewSubCatId(e.target.value)}
                className="w-full px-3 py-2 bg-[#24133F] border border-[#35105E] rounded-xl text-white font-medium"
              >
                {draftConfig.categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[#D8B4FE] font-bold mb-1">Ikon</label>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-[#24133F] border border-[#35105E] flex items-center justify-center text-[#A855F7]">
                  <NavigationIcon name={newSubIcon} className="w-4 h-4" />
                </div>
                <select
                  value={newSubIcon}
                  onChange={(e) => setNewSubIcon(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[#24133F] border border-[#35105E] rounded-xl text-white font-medium"
                >
                  {AVAILABLE_ICON_NAMES.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#35105E]">
              <button
                type="button"
                onClick={() => setShowAddSubmenuModal(false)}
                className="px-4 py-2 bg-[#24133F] hover:bg-[#35105E] text-[#D8B4FE] font-bold rounded-xl cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-gradient-to-r from-[#7135B5] to-[#A855F7] hover:scale-105 text-white font-extrabold rounded-xl shadow-md cursor-pointer"
              >
                Simpan Submenu
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: DELETE CATEGORY CONFIRMATION */}
      {/* ======================================================== */}
      {categoryToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-[#160D29] border border-rose-500/40 rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4 text-xs text-white">
            <h4 className="font-extrabold text-sm text-rose-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>Konfirmasi Hapus Kategori "{categoryToDelete.name}"</span>
            </h4>

            <p className="text-xs text-[#D8B4FE]/80 leading-relaxed">
              Kategori ini mungkin memiliki beberapa submenu. Apa yang ingin Anda lakukan terhadap submenu di dalam kategori ini?
            </p>

            <div className="space-y-2">
              <label className="flex items-center gap-2.5 p-2.5 bg-[#24133F] rounded-xl border border-[#35105E] cursor-pointer">
                <input
                  type="radio"
                  name="del_action"
                  checked={submenusActionOnDelete === 'move_to_tambahan'}
                  onChange={() => setSubmenusActionOnDelete('move_to_tambahan')}
                  className="text-[#A855F7]"
                />
                <span className="font-semibold text-white">Pindahkan submenu ke "Menu Tambahan"</span>
              </label>

              <label className="flex items-center gap-2.5 p-2.5 bg-[#24133F] rounded-xl border border-[#35105E] cursor-pointer">
                <input
                  type="radio"
                  name="del_action"
                  checked={submenusActionOnDelete === 'disable'}
                  onChange={() => setSubmenusActionOnDelete('disable')}
                  className="text-[#A855F7]"
                />
                <span className="font-semibold text-white">Nonaktifkan (sembunyikan) semua submenu</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#35105E]">
              <button
                type="button"
                onClick={() => setCategoryToDelete(null)}
                className="px-4 py-2 bg-[#24133F] hover:bg-[#35105E] text-[#D8B4FE] font-bold rounded-xl cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={executeDeleteCategory}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl shadow-md cursor-pointer"
              >
                Hapus Kategori
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 4: ICON PICKER MODAL */}
      {/* ======================================================== */}
      {iconPickerTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-[#160D29] border border-[#35105E] rounded-2xl shadow-2xl p-6 w-full max-w-lg space-y-4 text-xs text-white max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-[#35105E]">
              <h4 className="font-extrabold text-sm text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#A855F7]" />
                <span>Pilih Ikon Lucide</span>
              </h4>
              <button
                onClick={() => setIconPickerTarget(null)}
                className="p-1 text-[#D8B4FE]/60 hover:text-white rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-[#D8B4FE]/60 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Cari nama ikon..."
                value={iconSearchQuery}
                onChange={(e) => setIconSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-[#24133F] border border-[#35105E] rounded-xl text-white focus:border-[#A855F7]"
                autoFocus
              />
            </div>

            {/* Icons Grid */}
            <div className="flex-1 overflow-y-auto grid grid-cols-4 sm:grid-cols-6 gap-2.5 p-1 scrollbar-thin scrollbar-thumb-[#35105E]">
              {filteredIcons.map(iconName => (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => handleSelectIcon(iconName)}
                  className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl bg-[#24133F]/70 hover:bg-[#7135B5]/50 border border-[#35105E] hover:border-[#A855F7] transition-all cursor-pointer group"
                >
                  <NavigationIcon name={iconName} className="w-5 h-5 text-[#D8B4FE] group-hover:text-white group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] text-[#D8B4FE]/70 truncate max-w-full text-center group-hover:text-white font-mono">
                    {iconName}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-[#35105E]">
              <button
                type="button"
                onClick={() => setIconPickerTarget(null)}
                className="px-4 py-2 bg-[#24133F] hover:bg-[#35105E] text-[#D8B4FE] font-bold rounded-xl cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
