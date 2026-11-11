import React, { useState } from 'react';
import { useUIConfig } from '../../context/UIConfigContext';
import { ColumnConfig, SectionDetailConfig, ToolbarButtonConfig, TablePreset } from '../../types/index.ts';
import {
  Sliders,
  Columns3,
  Palette,
  LayoutTemplate,
  Layers,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Save,
  Check,
  Eye,
  EyeOff,
  Download,
  Upload,
  Plus,
  Trash2,
  Sparkles,
  Smartphone,
  Monitor,
  CheckCircle2,
  Phone,
  MessageSquare,
  Maximize2,
  FolderTree,
  Menu,
  Edit2,
  Database,
  Cloud,
  CloudUpload,
  CloudDownload,
  RefreshCw,
  AlertCircle,
  HardDrive,
  ShieldCheck,
  FileJson
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const UIConfigurationBuilder: React.FC = () => {
  const {
    config,
    draftConfig,
    isDrafting,
    startDrafting,
    updateDraft,
    saveDraft,
    cancelDraft,
    resetToDefaults,
    setGlobalTheme,
    setDeviceMode,
    updateAndroidSettings,
    updatePCSettings,
    applyDevicePreset,
    setColumnVisibility,
    setColumnOrder,
    updateColumnConfig,
    applyPreset,
    saveCurrentAsPreset,
    deletePreset,
    updateToolbarButton,
    toggleToolbarOption,
    toggleDetailSection,
    reorderDetailSections,
    updateDetailField,
    setShowEmptyFields,
    navigationItems,
    menuCategories,
    updateNavigationItem,
    moveNavigationItem,
    setMenuCategories,
    resetNavigationMenu,
    exportConfigJson,
    importConfigJson,
    saveConfigToFirestore,
    loadConfigFromFirestore,
    isCloudSyncing,
    lastCloudSyncTime,
    cloudSyncStatus
  } = useUIConfig();

  const { currentUser } = useApp();

  const [activeTab, setActiveTab] = useState<'firestore_config' | 'device_layout' | 'menu_layout' | 'table_columns' | 'toolbar' | 'detail_sections' | 'global_theme' | 'presets' | 'json'>('device_layout');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');

  // New preset modal state
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetDesc, setNewPresetDesc] = useState('');
  const [showPresetModal, setShowPresetModal] = useState(false);

  // JSON import state
  const [jsonInput, setJsonInput] = useState('');

  const triggerNotice = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3500);
  };

  const handleMoveColumn = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= config.ticketsTable.columns.length) return;
    setColumnOrder(index, targetIndex);
    triggerNotice('Urutan kolom diperbarui.');
  };

  const handleMoveSection = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= config.ticketDetail.sections.length) return;
    reorderDetailSections(index, targetIndex);
    triggerNotice('Urutan section detail diperbarui.');
  };

  const handleSavePreset = () => {
    if (!newPresetName.trim()) {
      triggerNotice('Nama preset wajib diisi.');
      return;
    }
    saveCurrentAsPreset(newPresetName.trim(), newPresetDesc.trim() || 'Custom view preset');
    setNewPresetName('');
    setNewPresetDesc('');
    setShowPresetModal(false);
    triggerNotice('Preset tampilan baru berhasil disimpan!');
  };

  const handleExport = () => {
    const jsonStr = exportConfigJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Dispatch_UI_Config_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    triggerNotice('Konfigurasi UI berhasil diekspor.');
  };

  const handleImport = () => {
    if (!jsonInput.trim()) return;
    const ok = importConfigJson(jsonInput);
    if (ok) {
      setJsonInput('');
      triggerNotice('Konfigurasi UI berhasil diimpor & diterapkan!');
    } else {
      alert('Format JSON konfigurasi tidak valid.');
    }
  };

  const handleUploadToFirestore = async () => {
    try {
      const res = await saveConfigToFirestore(currentUser?.name || 'Super Admin');
      if (res.success) {
        triggerNotice(
          `Konfigurasi UI berhasil di-upload ke Cloud Firestore sebagai Database Configuration App! (${res.updatedAt ? new Date(res.updatedAt).toLocaleTimeString('id-ID') : ''})`
        );
      } else {
        alert('Gagal mengupload konfigurasi ke Firestore: ' + (res.error || 'Terjadi kesalahan'));
      }
    } catch (e: any) {
      alert('Gagal mengupload: ' + e?.message);
    }
  };

  const handlePullFromFirestore = async () => {
    if (!confirm('Tarik konfigurasi master dari Cloud Firestore dan terapkan pada tampilan Anda?')) return;
    try {
      const res = await loadConfigFromFirestore();
      if (res.success) {
        triggerNotice('Konfigurasi UI berhasil ditarik dan disinkronkan dari Cloud Firestore!');
      } else {
        alert('Gagal memuat konfigurasi dari Firestore: ' + (res.error || 'Data belum tersedia'));
      }
    } catch (e: any) {
      alert('Gagal memuat: ' + e?.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Dynamic UI & Layout Configuration Builder
              </h3>
              {/* Cloud Firestore Sync Status Badge */}
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                {isCloudSyncing ? (
                  <>
                    <RefreshCw className="w-3 h-3 text-indigo-500 animate-spin" />
                    <span className="text-indigo-600 dark:text-indigo-400">Sinkronisasi Cloud...</span>
                  </>
                ) : cloudSyncStatus === 'synced' ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    <span className="text-emerald-700 dark:text-emerald-300 font-semibold">
                      Database Config: Firestore
                      {lastCloudSyncTime ? ` (${new Date(lastCloudSyncTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })})` : ''}
                    </span>
                  </>
                ) : cloudSyncStatus === 'error' ? (
                  <>
                    <AlertCircle className="w-3 h-3 text-rose-500" />
                    <span className="text-rose-600 dark:text-rose-400 font-semibold">Gagal Sinkron Cloud</span>
                  </>
                ) : (
                  <>
                    <Database className="w-3 h-3 text-amber-500" />
                    <span className="text-amber-700 dark:text-amber-300">Lokal (Belum Upload)</span>
                  </>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Ubah seluruh layout aplikasi, visibilitas kolom tabel, susunan menu, dan simpan sebagai Database Configuration App di Cloud Firestore.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Firestore Save / Upload Primary Button */}
          <button
            onClick={handleUploadToFirestore}
            disabled={isCloudSyncing}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-60 rounded-md flex items-center gap-1.5 shadow-sm transition-all"
            title="Upload dan jadikan konfigurasi ini sebagai Database Configuration App di Cloud Firestore"
          >
            {isCloudSyncing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CloudUpload className="w-3.5 h-3.5" />
            )}
            <span>Simpan & Upload ke Firestore</span>
          </button>

          {/* Firestore Pull / Sync Button */}
          <button
            onClick={handlePullFromFirestore}
            disabled={isCloudSyncing}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-md flex items-center gap-1.5 transition-colors"
            title="Tarik konfigurasi master dari Cloud Firestore"
          >
            <CloudDownload className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Tarik dari Firestore</span>
          </button>

          <button
            onClick={() => {
              if (confirm('Kembalikan seluruh layout dan pengaturan UI ke standar sistem (Default)?')) {
                resetToDefaults();
                triggerNotice('Konfigurasi berhasil direset ke standar sistem.');
              }
            }}
            className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Reset</span>
          </button>

          <button
            onClick={handleExport}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-md flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded text-xs flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Tabs Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 text-xs font-medium overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('firestore_config')}
          className={`px-3 py-2 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'firestore_config'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50/50 dark:bg-indigo-950/30 rounded-t'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Database className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>☁️ Database Config App</span>
        </button>
        <button
          onClick={() => setActiveTab('device_layout')}
          className={`px-3 py-2 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'device_layout'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50/50 dark:bg-indigo-950/30 rounded-t'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>📱 Android & 💻 PC Settings</span>
        </button>

        <button
          onClick={() => setActiveTab('menu_layout')}
          className={`px-3 py-2 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'menu_layout'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50/50 dark:bg-indigo-950/30 rounded-t'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <FolderTree className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>🗂️ Susunan Menu & Kategori</span>
        </button>

        <button
          onClick={() => setActiveTab('table_columns')}
          className={`px-3 py-2 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'table_columns'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Columns3 className="w-4 h-4" />
          <span>Table Columns & Visibility</span>
        </button>

        <button
          onClick={() => setActiveTab('toolbar')}
          className={`px-3 py-2 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'toolbar'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <LayoutTemplate className="w-4 h-4" />
          <span>Toolbar & Actions</span>
        </button>

        <button
          onClick={() => setActiveTab('detail_sections')}
          className={`px-3 py-2 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'detail_sections'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Ticket Detail & Empty Fields</span>
        </button>

        <button
          onClick={() => setActiveTab('global_theme')}
          className={`px-3 py-2 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'global_theme'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Palette className="w-4 h-4" />
          <span>Theme, Branding & Density</span>
        </button>

        <button
          onClick={() => setActiveTab('presets')}
          className={`px-3 py-2 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'presets'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Table Presets ({config.ticketsTable.presets.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('json')}
          className={`px-3 py-2 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'json'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Upload className="w-4 h-4" />
          <span>Import / Backup</span>
        </button>
      </div>

      {/* Tab: Database Configuration App (Cloud Firestore Master Storage) */}
      {activeTab === 'firestore_config' && (
        <div className="space-y-6">
          {/* Hero Banner */}
          <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 text-white rounded-2xl p-6 sm:p-7 shadow-lg border border-indigo-800/50 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2 max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                    <Cloud className="w-3 h-3 text-emerald-400" />
                    Cloud Firestore Real-Time Config
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    appSettings/ui_configuration
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2.5">
                  <Database className="w-6 h-6 text-indigo-400" />
                  Database Configuration App
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  Jadikan tata letak UI, susunan menu, visibilitas kolom tabel, dan preferensi perangkat sebagai <strong>Database Configuration App</strong> terpusat di Cloud Firestore. Seluruh pengguna dan perangkat (Android & PC) akan otomatis menggunakan konfigurasi baku ini secara real-time.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
                <button
                  onClick={handleUploadToFirestore}
                  disabled={isCloudSyncing}
                  className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                >
                  {isCloudSyncing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CloudUpload className="w-4 h-4" />
                  )}
                  <span>Upload ke Firestore Sekarang</span>
                </button>

                <button
                  onClick={handlePullFromFirestore}
                  disabled={isCloudSyncing}
                  className="px-4 py-2.5 bg-white/10 hover:bg-white/20 active:scale-95 text-white border border-white/20 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                >
                  <CloudDownload className="w-4 h-4 text-indigo-300" />
                  <span>Tarik dari Cloud</span>
                </button>
              </div>
            </div>

            {/* Status Information Bar */}
            <div className="mt-6 pt-4 border-t border-indigo-800/40 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <p className="text-slate-400 text-[11px]">Status Sinkronisasi:</p>
                <p className="font-semibold text-emerald-400 flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  {cloudSyncStatus === 'synced' ? 'Tersimpan & Aktif di Firestore' : cloudSyncStatus === 'syncing' ? 'Sedang Sinkronisasi...' : cloudSyncStatus === 'error' ? 'Gagal Terhubung' : 'Konfigurasi Lokal'}
                </p>
              </div>

              <div>
                <p className="text-slate-400 text-[11px]">Terakhir Di-upload:</p>
                <p className="font-semibold text-slate-200 mt-0.5">
                  {lastCloudSyncTime ? new Date(lastCloudSyncTime).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : 'Belum di-upload'}
                </p>
              </div>

              <div>
                <p className="text-slate-400 text-[11px]">Pengunggah Terakhir:</p>
                <p className="font-semibold text-slate-200 mt-0.5">
                  {currentUser?.name || 'Super Admin'} ({currentUser?.role || 'Admin'})
                </p>
              </div>

              <div>
                <p className="text-slate-400 text-[11px]">Firestore Collection:</p>
                <p className="font-mono text-indigo-300 text-[11px] mt-0.5 truncate">
                  appSettings / ui_configuration
                </p>
              </div>
            </div>
          </div>

          {/* Component Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Kolom Tabel WO</span>
                <Columns3 className="w-4 h-4 text-indigo-600" />
              </div>
              <p className="text-xl font-black text-slate-900 dark:text-white mt-2">
                {config.ticketsTable.columns.filter(c => c.visible).length} <span className="text-xs font-normal text-slate-500">/ {config.ticketsTable.columns.length} Aktif</span>
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Tersimpan di properti `ticketsTable.columns`
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Susunan Menu Navigasi</span>
                <FolderTree className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-xl font-black text-slate-900 dark:text-white mt-2">
                {navigationItems.filter(i => i.visible).length} <span className="text-xs font-normal text-slate-500">Menu ({menuCategories.length} Kategori)</span>
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Tersimpan di properti `navigationItems`
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Mode Perangkat</span>
                <Smartphone className="w-4 h-4 text-teal-600" />
              </div>
              <p className="text-xl font-black text-slate-900 dark:text-white mt-2 capitalize">
                {config.device?.mode || 'Auto'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Android: {config.device?.android?.layoutType === 'cards' ? 'Card View' : 'Table'}, PC: Compact
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Preset & Tema Global</span>
                <Palette className="w-4 h-4 text-purple-600" />
              </div>
              <p className="text-xl font-black text-slate-900 dark:text-white mt-2">
                {config.ticketsTable.presets.length} Preset <span className="text-xs font-normal text-slate-500 capitalize">({config.global.themeMode})</span>
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Densitas: {config.global.density}, Skala Font: {config.global.fontScale}
              </p>
            </div>
          </div>

          {/* Detailed Action Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Action 1: Upload Card */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <CloudUpload className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                    Simpan & Upload ke Firestore
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Jadikan konfigurasi lokal saat ini sebagai database configuration app baku.
                  </p>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-xs text-slate-600 dark:text-slate-300 space-y-1.5 leading-relaxed">
                <p className="font-medium text-slate-800 dark:text-slate-200">Yang akan disimpan ke Cloud Firestore:</p>
                <ul className="list-disc list-inside space-y-1 text-slate-500 dark:text-slate-400 text-[11px]">
                  <li>Visibilitas, urutan, dan pengaturan {config.ticketsTable.columns.length} kolom tabel Work Order</li>
                  <li>Susunan dan urutan {navigationItems.length} menu navigasi di {menuCategories.length} kategori</li>
                  <li>Pengaturan khusus layar sentuh Android (Navigasi bawah, kartu responsif)</li>
                  <li>Pengaturan efisiensi layar PC Desktop (Sticky column, scroll kompak)</li>
                  <li>Seluruh preset tampilan kolom yang tersimpan ({config.ticketsTable.presets.length} preset)</li>
                  <li>Pengaturan tema global ({config.global.themeMode}, {config.global.density})</li>
                </ul>
              </div>

              <button
                onClick={handleUploadToFirestore}
                disabled={isCloudSyncing}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-60 text-white font-bold text-xs rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all"
              >
                {isCloudSyncing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <CloudUpload className="w-4 h-4" />
                )}
                <span>Simpan Sekarang ke Cloud Firestore</span>
              </button>
            </div>

            {/* Action 2: Pull / Sync Card */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <CloudDownload className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                    Tarik Konfigurasi dari Firestore
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Muat konfigurasi master yang tersimpan di cloud database ke sesi Anda.
                  </p>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-xs text-slate-600 dark:text-slate-300 space-y-1.5 leading-relaxed">
                <p className="font-medium text-slate-800 dark:text-slate-200">Manfaat Sinkronisasi dari Cloud:</p>
                <ul className="list-disc list-inside space-y-1 text-slate-500 dark:text-slate-400 text-[11px]">
                  <li>Menerapkan perubahan layout yang dibuat oleh Super Admin dari perangkat lain</li>
                  <li>Mengembalikan tampilan ke konfigurasi baku cloud jika pengaturan lokal berubah</li>
                  <li>Memastikan kolom dan urutan menu selaras dengan tim operasional pusat</li>
                  <li>Bekerja secara real-time tanpa perlu me-reload atau menghapus cache browser</li>
                </ul>
              </div>

              <button
                onClick={handlePullFromFirestore}
                disabled={isCloudSyncing}
                className="w-full py-2.5 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 disabled:opacity-60 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl border border-slate-300 dark:border-slate-700 flex items-center justify-center gap-2 transition-all"
              >
                {isCloudSyncing ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-500" />
                ) : (
                  <CloudDownload className="w-4 h-4 text-emerald-600" />
                )}
                <span>Tarik & Terapkan dari Firestore</span>
              </button>
            </div>
          </div>

          {/* Document Preview & JSON Schema */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileJson className="w-4 h-4 text-indigo-600" />
                <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                  Pratinjau Dokumen Firestore (appSettings/ui_configuration)
                </h4>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                Document Schema: AppSetting
              </span>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl overflow-x-auto text-[11px] font-mono text-emerald-400 max-h-72 border border-slate-800">
              <pre>{JSON.stringify({
                id: 'ui_configuration',
                app: 'MoraJaws',
                type: 'database_configuration_app',
                updatedAt: lastCloudSyncTime || new Date().toISOString(),
                updatedBy: currentUser?.name || 'Super Admin',
                configSummary: {
                  theme: config.global.themeMode,
                  density: config.global.density,
                  deviceMode: config.device?.mode,
                  activeColumnsCount: config.ticketsTable.columns.filter(c => c.visible).length,
                  totalColumnsCount: config.ticketsTable.columns.length,
                  navigationItemsCount: navigationItems.length,
                  menuCategoriesCount: menuCategories.length,
                  presetsCount: config.ticketsTable.presets.length
                },
                navigationCategories: menuCategories
              }, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Tab 0: Android & PC Specific Settings (Fitur Setting UI Khusus Android dan PC) */}
      {activeTab === 'device_layout' && (
        <div className="space-y-6">
          {/* Quick Preset Actions */}
          <div className="bg-gradient-to-r from-indigo-50 to-emerald-50 dark:from-slate-900 dark:to-slate-800/90 rounded-xl border border-indigo-100 dark:border-slate-800 p-5 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span>Preset Ergonomis Siap Pakai (1-Klik)</span>
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  Terapkan tata letak instan yang disesuaikan untuk kenyamanan penggunaan Android (Layar Sentuh) atau PC (Monitor Lebar).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  onClick={() => {
                    applyDevicePreset('comfortable_android');
                    triggerNotice('Profil kenyamanan Android (Kartu sentuh & navigasi bawah) berhasil diterapkan!');
                  }}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-xs transition-colors"
                >
                  <Smartphone className="w-4 h-4" />
                  <span>Terapkan Preset Android / HP</span>
                </button>

                <button
                  onClick={() => {
                    applyDevicePreset('high_productivity_pc');
                    triggerNotice('Profil produktivitas PC (Tabel grid kompak & kolom sticky) berhasil diterapkan!');
                  }}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-xs transition-colors"
                >
                  <Monitor className="w-4 h-4" />
                  <span>Terapkan Preset PC / Desktop</span>
                </button>

                <button
                  onClick={() => {
                    applyDevicePreset('auto');
                    triggerNotice('Mode adaptif otomatis diaktifkan.');
                  }}
                  className="px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium transition-colors"
                >
                  <span>Reset ke Auto</span>
                </button>
              </div>
            </div>
          </div>

          {/* Active Mode Switcher */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-3">
            <h5 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider text-slate-500">
              Pilihan Mode Perangkat Utama
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                  config.device?.mode === 'auto'
                    ? 'border-indigo-600 ring-2 ring-indigo-500/20 bg-indigo-50/40 dark:bg-indigo-950/30'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="device_mode"
                  checked={config.device?.mode === 'auto'}
                  onChange={() => setDeviceMode('auto')}
                  className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Otomatis (Adaptif)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Menyesuaikan tampilan secara otomatis sesuai lebar layar perangkat saat dibuka (HP = Kartu, PC = Tabel).
                  </p>
                </div>
              </label>

              <label
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                  config.device?.mode === 'android'
                    ? 'border-emerald-600 ring-2 ring-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-950/30'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="device_mode"
                  checked={config.device?.mode === 'android'}
                  onChange={() => setDeviceMode('android')}
                  className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Paksa Mode Android / HP</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Mengaktifkan tata letak sentuh jempol, kartu tiket besar, dan navigasi bawah bahkan saat dibuka di PC.
                  </p>
                </div>
              </label>

              <label
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                  config.device?.mode === 'pc'
                    ? 'border-blue-600 ring-2 ring-blue-500/20 bg-blue-50/40 dark:bg-blue-950/30'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="device_mode"
                  checked={config.device?.mode === 'pc'}
                  onChange={() => setDeviceMode('pc')}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                    <Monitor className="w-3.5 h-3.5 text-blue-600" />
                    <span>Paksa Mode PC / Desktop</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Mengunci tampilan ke mode tabel data intensif, multi-kolom, dan tombol toolbar desktop lengkap.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Section A: Android Specific Settings */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold">
                📱
              </div>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                  Pengaturan Ergonomis Android / HP (Layar Sentuh)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Optimalkan pengalaman pengoperasian dengan jempol satu tangan, visibilitas di lapangan, dan tombol sentuh nyaman.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Option 1: Layout Type on Mobile */}
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <label className="font-semibold text-slate-800 dark:text-slate-200 block">
                  Tipe Tampilan Tiket di Android
                </label>
                <p className="text-[11px] text-slate-500 leading-normal mb-2">
                  Format kartu memuat seluruh ringkasan tanpa perlu scroll menyamping (sangat nyaman di smartphone).
                </p>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="android_layoutType"
                      checked={config.device?.android?.layoutType === 'cards'}
                      onChange={() => updateAndroidSettings({ layoutType: 'cards' })}
                      className="text-emerald-600"
                    />
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      Kartu Responsif (Sangat Direkomendasikan)
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="android_layoutType"
                      checked={config.device?.android?.layoutType === 'compact_table'}
                      onChange={() => updateAndroidSettings({ layoutType: 'compact_table' })}
                      className="text-emerald-600"
                    />
                    <span className="text-slate-700 dark:text-slate-300">
                      Tabel Grid Kompak (Scroll Horizontal)
                    </span>
                  </label>
                </div>
              </div>

              {/* Option 2: Touch Target Padding */}
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <label className="font-semibold text-slate-800 dark:text-slate-200 block">
                  Ukuran Target Sentuh Tombol (Touch Target Size)
                </label>
                <p className="text-[11px] text-slate-500 leading-normal mb-2">
                  Atur ketinggian tombol aksi agar mudah disentuh jempol saat berjalan atau memakai sarung tangan.
                </p>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="android_touchTargetSize"
                      checked={config.device?.android?.touchTargetSize === 'comfortable'}
                      onChange={() => updateAndroidSettings({ touchTargetSize: 'comfortable' })}
                      className="text-emerald-600"
                    />
                    <span>Standar Nyaman (48px - Standar Android Material)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="android_touchTargetSize"
                      checked={config.device?.android?.touchTargetSize === 'large'}
                      onChange={() => updateAndroidSettings({ touchTargetSize: 'large' })}
                      className="text-emerald-600"
                    />
                    <span>Ekstra Besar (54px - Sangat Mudah Ditekan di Lapangan)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="android_touchTargetSize"
                      checked={config.device?.android?.touchTargetSize === 'compact'}
                      onChange={() => updateAndroidSettings({ touchTargetSize: 'compact' })}
                      className="text-emerald-600"
                    />
                    <span>Ringkas (40px)</span>
                  </label>
                </div>
              </div>

              {/* Option 3: Bottom Navigation Bar */}
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-800 dark:text-slate-200">
                    Bilah Navigasi Bawah (Bottom Navigation Dock)
                  </label>
                  <input
                    type="checkbox"
                    checked={config.device?.android?.showBottomNavigation !== false}
                    onChange={e => updateAndroidSettings({ showBottomNavigation: e.target.checked })}
                    className="rounded text-emerald-600 w-4 h-4"
                  />
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Menampilkan menu navigasi permanen di bagian bawah layar Android dalam jangkauan jempol (Dashboard, Tiket, Import WO, WhatsApp, Menu).
                </p>
              </div>

              {/* Option 4: Quick Action Buttons on Cards */}
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <label className="font-semibold text-slate-800 dark:text-slate-200 block">
                  Tombol Cepat di Kartu Tiket
                </label>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.device?.android?.showQuickWhatsApp !== false}
                      onChange={e => updateAndroidSettings({ showQuickWhatsApp: e.target.checked })}
                      className="rounded text-emerald-600"
                    />
                    <span>Tombol WhatsApp URL Langsung (1-Sentuhan)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.device?.android?.showQuickCall !== false}
                      onChange={e => updateAndroidSettings({ showQuickCall: e.target.checked })}
                      className="rounded text-emerald-600"
                    />
                    <span>Tombol Panggil Telepon Langsung (tel:)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.device?.android?.showQuickDetail !== false}
                      onChange={e => updateAndroidSettings({ showQuickDetail: e.target.checked })}
                      className="rounded text-emerald-600"
                    />
                    <span>Tombol Buka Detail & Penugasan</span>
                  </label>
                </div>
              </div>

              {/* Option 5: Outdoor Visibility */}
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-800 dark:text-slate-200">
                    Badge Kontras Tinggi (High Contrast)
                  </label>
                  <input
                    type="checkbox"
                    checked={config.device?.android?.highContrastBadges !== false}
                    onChange={e => updateAndroidSettings({ highContrastBadges: e.target.checked })}
                    className="rounded text-emerald-600 w-4 h-4"
                  />
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Menguatkan warna dan kontras status agar tetap terbaca jelas di bawah sinar matahari saat di luar ruangan.
                </p>
              </div>

              {/* Option 6: Auto-close sidebar on mobile navigation */}
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-800 dark:text-slate-200">
                    Otomatis Tutup Menu Saat Memilih Halaman
                  </label>
                  <input
                    type="checkbox"
                    checked={config.device?.android?.autoCloseSidebarOnNavigate !== false}
                    onChange={e => updateAndroidSettings({ autoCloseSidebarOnNavigate: e.target.checked })}
                    className="rounded text-emerald-600 w-4 h-4"
                  />
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Secara otomatis menyembunyikan drawer menu setelah pengguna mengklik tab menu untuk memaksimalkan ruang baca konten.
                </p>
              </div>
            </div>
          </div>

          {/* Section B: PC Specific Settings */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold">
                💻
              </div>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                  Pengaturan Produktivitas PC / Desktop (Monitor Lebar)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Maksimalkan efisiensi multitasking dengan grid kepadatan tinggi, pin kolom, dan pemanfaatan layar hingga 1600px+.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Option 1: PC Table Row Density */}
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <label className="font-semibold text-slate-800 dark:text-slate-200 block">
                  Kerapatan Baris Grid PC
                </label>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="pc_tableDensity"
                      checked={config.device?.pc?.tableDensity === 'compact'}
                      onChange={() => updatePCSettings({ tableDensity: 'compact' })}
                      className="text-blue-600"
                    />
                    <span>Ringkas / Compact (24px - Menampilkan data maksimal per halaman)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="pc_tableDensity"
                      checked={config.device?.pc?.tableDensity === 'comfortable'}
                      onChange={() => updatePCSettings({ tableDensity: 'comfortable' })}
                      className="text-blue-600"
                    />
                    <span>Standar Seimbang (36px)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="pc_tableDensity"
                      checked={config.device?.pc?.tableDensity === 'spacious'}
                      onChange={() => updatePCSettings({ tableDensity: 'spacious' })}
                      className="text-blue-600"
                    />
                    <span>Luas (48px)</span>
                  </label>
                </div>
              </div>

              {/* Option 2: Sticky Columns */}
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-800 dark:text-slate-200">
                    Kunci Kolom Tabel (Sticky Columns)
                  </label>
                  <input
                    type="checkbox"
                    checked={config.device?.pc?.stickyColumns !== false}
                    onChange={e => updatePCSettings({ stickyColumns: e.target.checked })}
                    className="rounded text-blue-600 w-4 h-4"
                  />
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Kunci kolom checkbox dan Nomor WO di sisi kiri, serta kolom Aksi di sisi kanan agar tetap terlihat saat tabel digeser ke samping.
                </p>
              </div>

              {/* Option 3: Wide Screen Full Width */}
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-800 dark:text-slate-200">
                    Optimasi Layar Lebar Penuh (100% Full-Width)
                  </label>
                  <input
                    type="checkbox"
                    checked={config.device?.pc?.wideScreenFullWidth !== false}
                    onChange={e => {
                      updatePCSettings({ wideScreenFullWidth: e.target.checked });
                      setGlobalTheme({ contentWidth: e.target.checked ? 'full' : 'contained' });
                    }}
                    className="rounded text-blue-600 w-4 h-4"
                  />
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Memanfaatkan seluruh lebar monitor monitor besar (1440px - 1600px+) tanpa batas container sempit.
                </p>
              </div>

              {/* Option 4: Bulk Selection Toolbar */}
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-800 dark:text-slate-200">
                    Bilah Penugasan Massal (Bulk Assign Bar)
                  </label>
                  <input
                    type="checkbox"
                    checked={config.device?.pc?.showBulkToolbar !== false}
                    onChange={e => updatePCSettings({ showBulkToolbar: e.target.checked })}
                    className="rounded text-blue-600 w-4 h-4"
                  />
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Memunculkan toolbar floating cepat untuk menugaskan banyak tiket sekaligus ke teknisi yang dipilih.
                </p>
              </div>

              {/* Option 5: Inline Filters */}
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-800 dark:text-slate-200">
                    Filter Inline Langsung di Toolbar
                  </label>
                  <input
                    type="checkbox"
                    checked={config.device?.pc?.showInlineFilters !== false}
                    onChange={e => updatePCSettings({ showInlineFilters: e.target.checked })}
                    className="rounded text-blue-600 w-4 h-4"
                  />
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Tampilkan dropdown filter Area, Status Agent, Status Installer, dan WhatsApp langsung tanpa harus klik modal.
                </p>
              </div>

              {/* Option 6: Multi-column detail view */}
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-800 dark:text-slate-200">
                    Form Detail Tiket Multi-Kolom (Split View)
                  </label>
                  <input
                    type="checkbox"
                    checked={config.device?.pc?.multiColumnDetail !== false}
                    onChange={e => updatePCSettings({ multiColumnDetail: e.target.checked })}
                    className="rounded text-blue-600 w-4 h-4"
                  />
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Menampilkan bagian informasi pelanggan dan data teknis dalam 2 kolom berdampingan pada layar desktop.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 1: Table Columns Configuration */}
      {activeTab === 'table_columns' && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                Ticket Information: Column Manager
              </h4>
              <p className="text-[11px] text-slate-500">
                Atur visibilitas, urutan naik/turun, label header kustom, lebar kolom (px), alignment, dan kolom sticky.
              </p>
            </div>
            <button
              onClick={() => setShowPresetModal(true)}
              className="px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 rounded border border-indigo-200 dark:border-indigo-800 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Simpan Kolom Saat Ini Sebagai Preset</span>
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-md">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase">
                <tr>
                  <th className="py-2 px-3 w-12 text-center">Urutan</th>
                  <th className="py-2 px-3 w-16 text-center">Tampil</th>
                  <th className="py-2 px-3">Field Key</th>
                  <th className="py-2 px-3">Label Header Kustom</th>
                  <th className="py-2 px-3 w-28">Lebar (px)</th>
                  <th className="py-2 px-3 w-28">Alignment</th>
                  <th className="py-2 px-3 w-28">Sticky</th>
                  <th className="py-2 px-3 w-24 text-center">Wrap Teks</th>
                  <th className="py-2 px-3 w-24 text-center">Reorder</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {config.ticketsTable.columns.map((col, idx) => (
                  <tr key={col.key} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2 px-3 text-center font-mono text-slate-400">{idx + 1}</td>

                    <td className="py-2 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={col.visible}
                        onChange={e => setColumnVisibility(col.key, e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </td>

                    <td className="py-2 px-3 font-mono font-medium text-slate-700 dark:text-slate-300">
                      {col.key}
                    </td>

                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={col.label}
                        onChange={e => updateColumnConfig(col.key, { label: e.target.value })}
                        className="w-full px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-800 dark:text-slate-200"
                      />
                    </td>

                    <td className="py-2 px-3">
                      <input
                        type="number"
                        value={col.width || 120}
                        onChange={e => updateColumnConfig(col.key, { width: parseInt(e.target.value) || 100 })}
                        className="w-20 px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-800 dark:text-slate-200 font-mono"
                      />
                    </td>

                    <td className="py-2 px-3">
                      <select
                        value={col.align || 'left'}
                        onChange={e => updateColumnConfig(col.key, { align: e.target.value as any })}
                        className="w-full px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                      >
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                      </select>
                    </td>

                    <td className="py-2 px-3">
                      <select
                        value={col.sticky || 'none'}
                        onChange={e => updateColumnConfig(col.key, { sticky: e.target.value as any })}
                        className="w-full px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                      >
                        <option value="none">None</option>
                        <option value="left">Sticky Left</option>
                        <option value="right">Sticky Right</option>
                      </select>
                    </td>

                    <td className="py-2 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={Boolean(col.wrapText)}
                        onChange={e => updateColumnConfig(col.key, { wrapText: e.target.checked })}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </td>

                    <td className="py-2 px-3 text-center whitespace-nowrap">
                      <button
                        onClick={() => handleMoveColumn(idx, 'up')}
                        disabled={idx === 0}
                        className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-20"
                        title="Pindah ke Atas"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleMoveColumn(idx, 'down')}
                        disabled={idx === config.ticketsTable.columns.length - 1}
                        className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-20"
                        title="Pindah ke Bawah"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Toolbar & Actions */}
      {activeTab === 'toolbar' && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-6 text-xs">
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">
              Pengaturan Toolbar & Tombol Aksi
            </h4>
            <p className="text-[11px] text-slate-500">
              Konfigurasi kontrol yang tampil pada toolbar tiket utama, termasuk posisi dan pengelompokan aksi.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-md border border-slate-200 dark:border-slate-700">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.toolbar.showSearch}
                onChange={e => toggleToolbarOption('showSearch', e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="font-medium text-slate-700 dark:text-slate-300">Tampilkan Kotak Pencarian</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.toolbar.showFilters}
                onChange={e => toggleToolbarOption('showFilters', e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="font-medium text-slate-700 dark:text-slate-300">Tampilkan Baris Filter Area/Status</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.toolbar.showExport}
                onChange={e => toggleToolbarOption('showExport', e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="font-medium text-slate-700 dark:text-slate-300">Tampilkan Tombol Export CSV</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.toolbar.showArchiveToggle}
                onChange={e => toggleToolbarOption('showArchiveToggle', e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="font-medium text-slate-700 dark:text-slate-300">Tampilkan Tombol Filter Arsip</span>
            </label>
          </div>

          <div>
            <h5 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Tombol Aksi Toolbar:</h5>
            <div className="space-y-2">
              {config.toolbar.buttons.map(btn => (
                <div
                  key={btn.id}
                  className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={btn.visible}
                      onChange={e => updateToolbarButton(btn.id, { visible: e.target.checked })}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{btn.label}</span>
                      <span className="text-[11px] text-slate-400 block font-mono">id: {btn.id}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <select
                      value={btn.group}
                      onChange={e => updateToolbarButton(btn.id, { group: e.target.value as any })}
                      className="px-2 py-1 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-xs"
                    >
                      <option value="primary">Primary Action</option>
                      <option value="secondary">Secondary Action</option>
                      <option value="more_menu">Inside 'More' Menu</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Detail Sections & Empty Fields */}
      {activeTab === 'detail_sections' && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-6 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                Ticket Detail Layout & Section Architecture
              </h4>
              <p className="text-[11px] text-slate-500">
                Atur urutan section, visibilitas section, dan perilaku tampilan field kosong sesuai standar aplikasi.
              </p>
            </div>

            {/* Global Show Empty Fields toggle */}
            <div className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
              <span className="text-slate-600 dark:text-slate-300 font-medium">Show Empty Fields:</span>
              <button
                onClick={() => setShowEmptyFields(!config.ticketDetail.showEmptyFields)}
                className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                  config.ticketDetail.showEmptyFields
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                {config.ticketDetail.showEmptyFields ? 'Aktif (Ditampilkan)' : 'Nonaktif (Disembunyikan)'}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {config.ticketDetail.sections.map((section, secIdx) => (
              <div
                key={section.id}
                className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={section.visible}
                      onChange={e => toggleDetailSection(section.id, e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">{section.title}</span>
                    <span className="text-[11px] text-slate-400">({section.fields.length} fields)</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleMoveSection(secIdx, 'up')}
                      disabled={secIdx === 0}
                      className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-20"
                      title="Pindah Section ke Atas"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleMoveSection(secIdx, 'down')}
                      disabled={secIdx === config.ticketDetail.sections.length - 1}
                      className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-20"
                      title="Pindah Section ke Bawah"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Fields inside section */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                  {section.fields.map(field => (
                    <div
                      key={field.key}
                      className="p-2 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <input
                          type="checkbox"
                          checked={field.visible}
                          onChange={e => updateDetailField(section.id, field.key, { visible: e.target.checked })}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="truncate text-slate-700 dark:text-slate-300">{field.label}</span>
                      </div>
                      <select
                        value={field.width}
                        onChange={e => updateDetailField(section.id, field.key, { width: e.target.value as any })}
                        className="text-[11px] px-1 py-0.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded"
                      >
                        <option value="third">1/3</option>
                        <option value="half">1/2</option>
                        <option value="full">Full</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Global Theme, Branding & Density */}
      {activeTab === 'global_theme' && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-6 text-xs">
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">
              Pengaturan Tampilan Global & Branding
            </h4>
            <p className="text-[11px] text-slate-500">
              Konfigurasi tema warna, mode gelap/terang, kepadatan tabel, font scale, dan batas layout aplikasi.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Nama Aplikasi</label>
              <input
                type="text"
                value={config.global.appName}
                onChange={e => setGlobalTheme({ appName: e.target.value })}
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Tema Mode</label>
              <select
                value={config.global.themeMode}
                onChange={e => setGlobalTheme({ themeMode: e.target.value as any })}
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded"
              >
                <option value="light">Light Mode</option>
                <option value="dark">Dark Mode</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Kepadatan Grid / Tabel (Density)</label>
              <select
                value={config.ticketsTable.density}
                onChange={e => {
                  updateDraft(prev => ({
                    ...prev,
                    ticketsTable: { ...prev.ticketsTable, density: e.target.value as any }
                  }));
                  // also update direct
                  config.ticketsTable.density = e.target.value as any;
                }}
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded"
              >
                <option value="compact">Compact (Maksimal data)</option>
                <option value="comfortable">Comfortable (Standar)</option>
                <option value="spacious">Spacious (Longgar)</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Jumlah Baris per Halaman</label>
              <select
                value={config.ticketsTable.rowsPerPage}
                onChange={e => {
                  const val = parseInt(e.target.value);
                  config.ticketsTable.rowsPerPage = val;
                  triggerNotice(`Baris per halaman diset ke ${val}`);
                }}
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded"
              >
                <option value={5}>5 baris</option>
                <option value={10}>10 baris</option>
                <option value={15}>15 baris</option>
                <option value={20}>20 baris</option>
                <option value={50}>50 baris</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Status Menu Sidebar (Default)</label>
              <select
                value={config.global.sidebarState || 'expanded'}
                onChange={e => {
                  const state = e.target.value as any;
                  setGlobalTheme({
                    sidebarState: state,
                    sidebarCollapsed: state === 'minimized'
                  });
                  triggerNotice(`Status Menu Sidebar diubah ke ${state}`);
                }}
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded"
              >
                <option value="expanded">Expanded (Terbuka Penuh - Lebar)</option>
                <option value="minimized">Minimized (Di-minimize - Hanya Ikon)</option>
                <option value="closed">Closed (Ditutup Penuh - Layar Penuh)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Presets Manager */}
      {activeTab === 'presets' && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-4 text-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                Daftar Preset Tampilan Tabel
              </h4>
              <p className="text-[11px] text-slate-500">
                Pilih atau kelola preset layout tabel yang tersimpan untuk beralih perspektif kerja dalam 1-klik.
              </p>
            </div>
            <button
              onClick={() => setShowPresetModal(true)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded shadow-sm flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Simpan Konfigurasi Saat Ini Sebagai Preset</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {config.ticketsTable.presets.map(p => {
              const isActive = config.ticketsTable.activePresetId === p.id;
              const visibleColsCount = p.columns.filter(c => c.visible).length;
              return (
                <div
                  key={p.id}
                  className={`p-4 rounded-lg border transition-all ${
                    isActive
                      ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/30'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <h5 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-2">
                      <span>{p.name}</span>
                      {isActive && (
                        <span className="px-1.5 py-0.2 bg-indigo-600 text-white rounded text-[10px]">
                          Aktif
                        </span>
                      )}
                    </h5>

                    <div className="flex items-center gap-1">
                      {!isActive && (
                        <button
                          onClick={() => {
                            applyPreset(p.id);
                            triggerNotice(`Preset "${p.name}" diterapkan.`);
                          }}
                          className="px-2.5 py-1 bg-indigo-600 text-white rounded text-[11px] font-medium"
                        >
                          Terapkan
                        </button>
                      )}
                      {config.ticketsTable.presets.length > 1 && !p.id.startsWith('preset_default') && (
                        <button
                          onClick={() => deletePreset(p.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                          title="Hapus Preset"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-slate-500 text-[11px] mb-2">{p.description}</p>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {visibleColsCount} Kolom Aktif · Kepadatan: {p.density} · {p.rowsPerPage} rows/hal
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 6: JSON Import / Export */}
      {activeTab === 'json' && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-4 text-xs">
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">
              Backup, Pulihkan & Migrasi Konfigurasi
            </h4>
            <p className="text-[11px] text-slate-500">
              Paste JSON konfigurasi untuk memulihkan seluruh layout, visibilitas kolom, dan pengaturan toolbar.
            </p>
          </div>

          <textarea
            rows={10}
            placeholder="Paste string JSON konfigurasi UI di sini..."
            value={jsonInput}
            onChange={e => setJsonInput(e.target.value)}
            className="w-full p-3 font-mono text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-200"
          />

          <div className="flex items-center justify-between">
            <button
              onClick={handleExport}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border rounded"
            >
              Unduh Konfigurasi Saat Ini (JSON)
            </button>
            <button
              onClick={handleImport}
              disabled={!jsonInput.trim()}
              className="px-4 py-2 font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded shadow-sm"
            >
              Terapkan JSON Konfigurasi
            </button>
          </div>
        </div>
      )}

      {/* Tab: Menu & Kategori Navigasi */}
      {activeTab === 'menu_layout' && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-6 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-indigo-600" />
                Pengaturan Susunan Menu & Kategori Navigasi
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Atur urutan menu, ubah kategori induk menu, sembunyikan/tampilkan menu tertentu, atau tambahkan kategori menu baru.
              </p>
            </div>
            <button
              onClick={() => {
                if (confirm('Kembalikan susunan menu dan kategori ke standar bawaan?')) {
                  resetNavigationMenu();
                  triggerNotice('Susunan menu berhasil dikembalikan ke standar bawaan.');
                }
              }}
              className="px-3 py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded flex items-center gap-1.5 shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Susunan Menu</span>
            </button>
          </div>

          {/* Add Category Section */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tambah Kategori Menu Baru
              </label>
              <input
                type="text"
                placeholder="misal: Operasional Khusus, Laporan & Statistik..."
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
              />
            </div>
            <button
              onClick={() => {
                if (!newCategoryName.trim()) {
                  triggerNotice('Nama kategori tidak boleh kosong.');
                  return;
                }
                if (menuCategories.includes(newCategoryName.trim())) {
                  triggerNotice('Kategori sudah ada.');
                  return;
                }
                setMenuCategories([...menuCategories, newCategoryName.trim()]);
                setNewCategoryName('');
                triggerNotice(`Kategori "${newCategoryName.trim()}" berhasil ditambahkan.`);
              }}
              className="self-end sm:self-auto mt-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded shadow-xs flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Kategori</span>
            </button>
          </div>

          {/* List Categories and Items */}
          <div className="space-y-5">
            {menuCategories.map((category, catIndex) => {
              const itemsInCategory = [...navigationItems]
                .filter(item => item.category === category)
                .sort((a, b) => a.order - b.order);

              const handleMoveCategory = (direction: 'up' | 'down') => {
                const targetIdx = direction === 'up' ? catIndex - 1 : catIndex + 1;
                if (targetIdx < 0 || targetIdx >= menuCategories.length) return;
                const newCats = [...menuCategories];
                const temp = newCats[catIndex];
                newCats[catIndex] = newCats[targetIdx];
                newCats[targetIdx] = temp;
                setMenuCategories(newCats);
                triggerNotice(`Urutan kategori diperbarui.`);
              };

              const handleDeleteCategory = () => {
                if (itemsInCategory.length > 0) {
                  alert(`Kategori "${category}" masih memiliki ${itemsInCategory.length} menu. Pindahkan item menu ke kategori lain terlebih dahulu sebelum menghapus.`);
                  return;
                }
                setMenuCategories(menuCategories.filter(c => c !== category));
                triggerNotice(`Kategori "${category}" dihapus.`);
              };

              return (
                <div
                  key={category}
                  className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-950/50"
                >
                  {/* Category Header */}
                  <div className="bg-slate-100 dark:bg-slate-800/80 px-4 py-2.5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-500" />
                      <span className="font-bold text-slate-800 dark:text-slate-100 text-xs uppercase tracking-wide">
                        {category}
                      </span>
                      <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full font-semibold">
                        {itemsInCategory.length} menu
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleMoveCategory('up')}
                        disabled={catIndex === 0}
                        title="Geser Kategori Naik"
                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 disabled:opacity-30"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleMoveCategory('down')}
                        disabled={catIndex === menuCategories.length - 1}
                        title="Geser Kategori Turun"
                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 disabled:opacity-30"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      {itemsInCategory.length === 0 && (
                        <button
                          onClick={handleDeleteCategory}
                          title="Hapus Kategori Kosong"
                          className="p-1 hover:bg-rose-100 text-rose-500 rounded ml-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Items in Category */}
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {itemsInCategory.length === 0 ? (
                      <div className="p-4 text-center text-slate-400 italic text-[11px]">
                        Tidak ada menu di kategori ini. Anda dapat memindahkan menu dari kategori lain ke sini.
                      </div>
                    ) : (
                      itemsInCategory.map((item, itemIdx) => {
                        return (
                          <div
                            key={item.id}
                            className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-900/60 transition-colors ${
                              !item.visible ? 'opacity-50 bg-slate-50/40 dark:bg-slate-900/40' : ''
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="w-5 text-[10px] font-mono text-slate-400 text-center">
                                #{item.order}
                              </span>
                              <div>
                                <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                  <span>{item.label}</span>
                                  {!item.visible && (
                                    <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.2 rounded font-normal">
                                      Disembunyikan
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  ID: {item.id}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-auto">
                              {/* Change Category Select */}
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-slate-400">Pindah ke:</span>
                                <select
                                  value={item.category}
                                  onChange={e => {
                                    updateNavigationItem(item.id, { category: e.target.value });
                                    triggerNotice(`Menu "${item.label}" dipindahkan ke "${e.target.value}".`);
                                  }}
                                  className="text-xs px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-slate-700 dark:text-slate-200"
                                >
                                  {menuCategories.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Move Up / Down */}
                              <button
                                onClick={() => {
                                  moveNavigationItem(item.id, 'up');
                                  triggerNotice(`Urutan menu "${item.label}" dinaikkan.`);
                                }}
                                disabled={itemIdx === 0}
                                title="Pindah Naik"
                                className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300 disabled:opacity-30 border border-slate-200 dark:border-slate-700"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => {
                                  moveNavigationItem(item.id, 'down');
                                  triggerNotice(`Urutan menu "${item.label}" diturunkan.`);
                                }}
                                disabled={itemIdx === itemsInCategory.length - 1}
                                title="Pindah Turun"
                                className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300 disabled:opacity-30 border border-slate-200 dark:border-slate-700"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>

                              {/* Toggle Visibility */}
                              <button
                                onClick={() => {
                                  updateNavigationItem(item.id, { visible: !item.visible });
                                  triggerNotice(
                                    item.visible
                                      ? `Menu "${item.label}" disembunyikan dari sidebar.`
                                      : `Menu "${item.label}" ditampilkan di sidebar.`
                                  );
                                }}
                                title={item.visible ? 'Sembunyikan Menu' : 'Tampilkan Menu'}
                                className={`p-1.5 rounded border ${
                                  item.visible
                                    ? 'border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40'
                                    : 'border-slate-300 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                              >
                                {item.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
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
        </div>
      )}

      {/* Save Preset Dialog */}
      {showPresetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-800 p-6 w-full max-w-md space-y-4 text-xs">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm">
              Simpan Preset Tampilan Kolom
            </h4>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 mb-1 font-medium">Nama Preset</label>
              <input
                type="text"
                placeholder="misal: Tampilan Fokus SLA & WA"
                value={newPresetName}
                onChange={e => setNewPresetName(e.target.value)}
                className="w-full px-3 py-1.5 border rounded bg-slate-50 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 mb-1 font-medium">Deskripsi Singkat</label>
              <input
                type="text"
                placeholder="Penjelasan layout ini"
                value={newPresetDesc}
                onChange={e => setNewPresetDesc(e.target.value)}
                className="w-full px-3 py-1.5 border rounded bg-slate-50 dark:bg-slate-800"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowPresetModal(false)}
                className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded"
              >
                Batal
              </button>
              <button
                onClick={handleSavePreset}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded shadow-sm"
              >
                Simpan Preset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
