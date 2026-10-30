import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useUIConfig } from '../../context/UIConfigContext';
import { RootCauseCategory, Contractor, CoverageArea } from '../../types/index.ts';
import {
  Settings,
  Plus,
  Check,
  Edit2,
  Save,
  Building2,
  MapPin,
  Wrench,
  Layers,
  FileSpreadsheet,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Palette,
  Clock,
  KeyRound
} from 'lucide-react';
import { ShieldAlert } from 'lucide-react';
import { getJakartaDateString } from '../../services/appointmentDateParser';

export const SystemSettings: React.FC = () => {
  const {
    headerMappings,
    updateHeaderMapping,
    contractors,
    addContractor,
    updateContractor,
    coverageAreas,
    addCoverageArea,
    updateCoverageArea,
    rootCauseCategories,
    updateRootCauseCategories,
    currentUser,
    operationalDate,
    setOperationalDate,
    setIsSessionModalOpen
  } = useApp();

  const { config, setGlobalTheme } = useUIConfig();

  const [activeTab, setActiveTab] = useState<'contractors' | 'coverage' | 'root_causes' | 'header_mapping' | 'branding' | 'system_session'>('contractors');
  const [operationalDateInput, setOperationalDateInput] = useState(operationalDate);
  const [notice, setNotice] = useState<string | null>(null);

  // Contractor Form State
  const [showAddContractor, setShowAddContractor] = useState(false);
  const [newCName, setNewCName] = useState('');
  const [newCCode, setNewCCode] = useState('');
  const [newCAreas, setNewCAreas] = useState('');
  const [newCPhone, setNewCPhone] = useState('');
  const [newCEmail, setNewCEmail] = useState('');

  // Coverage Area Form State
  const [showAddArea, setShowAddArea] = useState(false);
  const [newAreaName, setNewAreaName] = useState('');
  const [newAreaClusters, setNewAreaClusters] = useState('');

  // Root Cause State
  const [selectedCategoryIndex, setSelectedCategoryIndex] = useState(0);
  const [newRootCauseItem, setNewRootCauseItem] = useState('');

  // Header Mapping Edit
  const [editingField, setEditingField] = useState<string | null>(null);
  const [aliasInput, setAliasInput] = useState('');

  // Branding state
  const [appNameInput, setAppNameInput] = useState(config.global.appName || 'MoraJaws');
  const [appPrimaryColor, setAppPrimaryColor] = useState(config.global.primaryColor || 'indigo');

  if (currentUser.role !== 'super_admin') {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl p-8 border border-slate-200 dark:border-slate-800 text-center max-w-lg mx-auto space-y-4 shadow-sm my-8">
        <div className="w-12 h-12 bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 rounded-full flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h3 className="font-bold text-slate-900 dark:text-white text-base">
          Akses Ditolak: Otoritas Master Data Dibatasi
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Berdasarkan Master Konstitusi Keamanan MoraJaws, pengaturan master kontraktor, cakupan area, dan konfigurasi master field mapping dibatasi mutlak hanya untuk <strong>Super Admin</strong>.
        </p>
        <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs text-slate-600 dark:text-slate-300 font-medium">
          Akun Anda: <span className="font-bold capitalize">{currentUser.name} ({currentUser.role})</span>.
        </div>
      </div>
    );
  }

  const triggerNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3500);
  };

  // Handlers
  const handleCreateContractor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCName.trim() || !newCCode.trim()) {
      triggerNotice('Nama dan kode kontraktor wajib diisi.');
      return;
    }

    const areas = newCAreas.split(',').map(s => s.trim()).filter(Boolean);
    addContractor({
      name: newCName.trim(),
      code: newCCode.trim().toUpperCase(),
      coverageAreas: areas.length > 0 ? areas : ['Jabodetabek'],
      phone: newCPhone.trim(),
      email: newCEmail.trim(),
      active: true
    });

    setNewCName('');
    setNewCCode('');
    setNewCAreas('');
    setNewCPhone('');
    setNewCEmail('');
    setShowAddContractor(false);
    triggerNotice(`Kontraktor "${newCName}" berhasil ditambahkan.`);
  };

  const handleCreateArea = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAreaName.trim()) {
      triggerNotice('Nama coverage area wajib diisi.');
      return;
    }

    const clusters = newAreaClusters.split(',').map(s => s.trim()).filter(Boolean);
    addCoverageArea({
      name: newAreaName.trim(),
      clusters,
      active: true
    });

    setNewAreaName('');
    setNewAreaClusters('');
    setShowAddArea(false);
    triggerNotice(`Coverage Area "${newAreaName}" berhasil ditambahkan.`);
  };

  const handleAddRootCause = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRootCauseItem.trim()) return;

    const currentCat = rootCauseCategories[selectedCategoryIndex];
    if (!currentCat) return;

    if (currentCat.items.includes(newRootCauseItem.trim())) {
      triggerNotice(`Item "${newRootCauseItem}" sudah ada dalam kategori.`);
      return;
    }

    const updatedCategories = rootCauseCategories.map((cat, idx) => {
      if (idx !== selectedCategoryIndex) return cat;
      return {
        ...cat,
        items: [...cat.items, newRootCauseItem.trim()]
      };
    });

    updateRootCauseCategories(updatedCategories);
    setNewRootCauseItem('');
    triggerNotice(`Root cause baru berhasil ditambahkan ke "${currentCat.name}".`);
  };

  const handleRemoveRootCause = (categoryIdx: number, itemToRemove: string) => {
    const updatedCategories = rootCauseCategories.map((cat, idx) => {
      if (idx !== categoryIdx) return cat;
      return {
        ...cat,
        items: cat.items.filter(it => it !== itemToRemove)
      };
    });
    updateRootCauseCategories(updatedCategories);
    triggerNotice(`Item "${itemToRemove}" dihapus.`);
  };

  const handleSaveAliases = (field: string) => {
    const splitted = aliasInput
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(s => s.length > 0);

    updateHeaderMapping(field, splitted);
    setEditingField(null);
    triggerNotice(`Alias untuk ${field} berhasil diperbarui.`);
  };

  const handleSaveBranding = (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalTheme({
      appName: appNameInput.trim() || 'MoraJaws',
      primaryColor: appPrimaryColor
    });
    triggerNotice('Pengaturan identitas aplikasi & branding berhasil disimpan.');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-5 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-slate-800 text-white flex items-center justify-center shrink-0">
            <Settings className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Konfigurasi Master Data & Pengaturan Aplikasi (MoraJaws)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Kelola master vendor kontraktor, cakupan coverage area, taksonomi kendala & root cause Wi-Fi teknisi, kamus alias header impor, dan branding aplikasi.
            </p>
          </div>
        </div>
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded text-xs flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('contractors')}
          className={`px-3 py-2 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
            activeTab === 'contractors'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Master Kontraktor ({contractors.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('coverage')}
          className={`px-3 py-2 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
            activeTab === 'coverage'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>Coverage Area & Cluster ({coverageAreas.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('root_causes')}
          className={`px-3 py-2 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
            activeTab === 'root_causes'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Wrench className="w-4 h-4" />
          <span>Kategori Root Cause Wi-Fi ({rootCauseCategories.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('header_mapping')}
          className={`px-3 py-2 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
            activeTab === 'header_mapping'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Kamus Alias Header Impor ({headerMappings.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('branding')}
          className={`px-3 py-2 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
            activeTab === 'branding'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Palette className="w-4 h-4" />
          <span>Branding & Logo MoraJaws</span>
        </button>

        <button
          onClick={() => setActiveTab('system_session')}
          className={`px-3 py-2 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
            activeTab === 'system_session'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <KeyRound className="w-4 h-4" />
          <span>Sesi Staf & Operasional WIB</span>
        </button>
      </div>

      {/* TAB 1: MASTER CONTRACTORS */}
      {activeTab === 'contractors' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-4 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                Daftar Vendor Kontraktor Resmi
              </h4>
              <p className="text-[11px] text-slate-500">
                Pendaftaran akun Leader wajib memilih kontraktor dari daftar master ini.
              </p>
            </div>

            <button
              onClick={() => setShowAddContractor(!showAddContractor)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold flex items-center gap-1.5 self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Kontraktor Baru</span>
            </button>
          </div>

          {showAddContractor && (
            <form onSubmit={handleCreateContractor} className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
              <h5 className="font-bold text-slate-900 dark:text-white text-xs">Form Kontraktor Baru</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Nama Kontraktor *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: PT Fiber Optik Mandiri"
                    value={newCName}
                    onChange={e => setNewCName(e.target.value)}
                    className="w-full px-2.5 py-1.5 border rounded bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Kode Singkatan *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: FOM"
                    value={newCCode}
                    onChange={e => setNewCCode(e.target.value)}
                    className="w-full px-2.5 py-1.5 border rounded bg-white dark:bg-slate-900 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Coverage Area (Pisahkan Koma)</label>
                  <input
                    type="text"
                    placeholder="Contoh: Jakarta Selatan, Depok"
                    value={newCAreas}
                    onChange={e => setNewCAreas(e.target.value)}
                    className="w-full px-2.5 py-1.5 border rounded bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">No. Kontak / Hotline</label>
                  <input
                    type="text"
                    placeholder="0812xxxxxxxx"
                    value={newCPhone}
                    onChange={e => setNewCPhone(e.target.value)}
                    className="w-full px-2.5 py-1.5 border rounded bg-white dark:bg-slate-900 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Email Operasional</label>
                  <input
                    type="email"
                    placeholder="ops@fibermandiri.co.id"
                    value={newCEmail}
                    onChange={e => setNewCEmail(e.target.value)}
                    className="w-full px-2.5 py-1.5 border rounded bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddContractor(false)}
                  className="px-3 py-1.5 border rounded text-slate-600 dark:text-slate-400"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold"
                >
                  Simpan Kontraktor
                </button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase">
                <tr>
                  <th className="py-2.5 px-3">Nama Vendor</th>
                  <th className="py-2.5 px-3">Kode</th>
                  <th className="py-2.5 px-3">Leader / Korlap</th>
                  <th className="py-2.5 px-3">Coverage Area</th>
                  <th className="py-2.5 px-3">Kontak</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {contractors.map((c, cIdx) => (
                  <tr key={`settings-contractor-row-${c.id || c.name}-${cIdx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                      {c.name}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-indigo-600 font-bold">
                      {c.code}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200">
                      {c.leaderName || <span className="text-slate-400 italic">Belum ada leader</span>}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap gap-1">
                        {c.coverageAreas.map(a => (
                          <span key={a} className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-700 dark:text-slate-300">
                            {a}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">
                      <div>{c.phone || '-'}</div>
                      <div className="text-[11px] text-slate-400">{c.email || ''}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        {c.active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: COVERAGE AREA & CLUSTER */}
      {activeTab === 'coverage' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-4 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                Wilayah Cakupan & Cluster Layanan
              </h4>
              <p className="text-[11px] text-slate-500">
                Data master area untuk alokasi otomatis penugasan kontraktor dan pemetaan beban kerja.
              </p>
            </div>

            <button
              onClick={() => setShowAddArea(!showAddArea)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold flex items-center gap-1.5 self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Coverage Area Baru</span>
            </button>
          </div>

          {showAddArea && (
            <form onSubmit={handleCreateArea} className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
              <h5 className="font-bold text-slate-900 dark:text-white text-xs">Form Area Baru</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Nama Area / Kota *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Bogor Kota"
                    value={newAreaName}
                    onChange={e => setNewAreaName(e.target.value)}
                    className="w-full px-2.5 py-1.5 border rounded bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Daftar Cluster (Pisahkan Koma)</label>
                  <input
                    type="text"
                    placeholder="Contoh: Baranangsiang Indah, Pajajaran Hills, Cimahpar Permai"
                    value={newAreaClusters}
                    onChange={e => setNewAreaClusters(e.target.value)}
                    className="w-full px-2.5 py-1.5 border rounded bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddArea(false)}
                  className="px-3 py-1.5 border rounded text-slate-600 dark:text-slate-400"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold"
                >
                  Simpan Area
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {coverageAreas.map(area => (
              <div
                key={area.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-indigo-600" />
                    <span>{area.name}</span>
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    {area.clusters.length} Cluster
                  </span>
                </div>

                <div className="pt-1">
                  <span className="text-[10.5px] text-slate-400 uppercase font-semibold block mb-1">Cluster Terdaftar:</span>
                  <div className="flex flex-wrap gap-1">
                    {area.clusters.map(cluster => (
                      <span key={cluster} className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border text-[11px] text-slate-700 dark:text-slate-300">
                        {cluster}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: ROOT CAUSE TAXONOMY */}
      {activeTab === 'root_causes' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-4 text-xs">
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white text-xs">
              Kamus Taksonomi Root Cause & Kendala Teknisi Wi-Fi
            </h4>
            <p className="text-[11px] text-slate-500">
              Kategori ini menjadi pilihan standar teknisi saat mengisi laporan penutupan tiket atau eskalasi gangguan.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Category Selector */}
            <div className="space-y-1.5">
              <span className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Pilih Kategori Utama:</span>
              {rootCauseCategories.map((cat, idx) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategoryIndex(idx)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedCategoryIndex === idx
                      ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 font-bold'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="text-xs">{cat.name}</div>
                  <div className="text-[10px] text-slate-400 font-normal mt-0.5">{cat.items.length} Penyebab Masalah</div>
                </button>
              ))}
            </div>

            {/* Root Causes List in Category */}
            <div className="lg:col-span-2 space-y-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <h5 className="font-bold text-slate-900 dark:text-white text-xs">
                    Daftar Root Cause: {rootCauseCategories[selectedCategoryIndex]?.name}
                  </h5>
                  <span className="text-[11px] text-slate-500">
                    {rootCauseCategories[selectedCategoryIndex]?.items.length} item aktif
                  </span>
                </div>

                {rootCauseCategories[selectedCategoryIndex]?.description && (
                  <p className="text-[11px] text-slate-500 italic">
                    {rootCauseCategories[selectedCategoryIndex].description}
                  </p>
                )}

                {/* Add new item input */}
                <form onSubmit={handleAddRootCause} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Tambah penyebab masalah baru..."
                    value={newRootCauseItem}
                    onChange={e => setNewRootCauseItem(e.target.value)}
                    className="flex-1 px-3 py-1.5 border rounded-lg bg-white dark:bg-slate-900 text-xs"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold flex items-center gap-1 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah</span>
                  </button>
                </form>

                {/* Items chips */}
                <div className="space-y-1.5 pt-2">
                  {rootCauseCategories[selectedCategoryIndex]?.items.map(item => (
                    <div
                      key={item}
                      className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                    >
                      <span className="font-medium text-slate-800 dark:text-slate-200">{item}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveRootCause(selectedCategoryIndex, item)}
                        className="text-slate-400 hover:text-rose-600 p-1"
                        title="Hapus root cause"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: HEADER MAPPING */}
      {activeTab === 'header_mapping' && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-4 text-xs">
          <h4 className="font-bold text-slate-900 dark:text-white text-xs">
            Kamus Alias Header Terdaftar ({headerMappings.length} Fields)
          </h4>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-md">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase">
                <tr>
                  <th className="py-2.5 px-3">Standard Field</th>
                  <th className="py-2.5 px-3">Label</th>
                  <th className="py-2.5 px-3">Kategori</th>
                  <th className="py-2.5 px-3">Wajib</th>
                  <th className="py-2.5 px-3">Daftar Alias (Dipisahkan Koma)</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {headerMappings.map(mapping => {
                  const isEditing = editingField === mapping.standardField;
                  return (
                    <tr key={mapping.standardField} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {mapping.standardField}
                      </td>
                      <td className="py-2.5 px-3 font-medium whitespace-nowrap">
                        {mapping.label}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 uppercase whitespace-nowrap">
                        {mapping.category}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {mapping.required ? (
                          <span className="text-rose-600 font-semibold">Yes</span>
                        ) : (
                          <span className="text-slate-400">Optional</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={aliasInput}
                            onChange={e => setAliasInput(e.target.value)}
                            className="w-full p-1.5 border rounded bg-white dark:bg-slate-800 text-xs"
                          />
                        ) : (
                          <span className="text-slate-600 dark:text-slate-300">
                            {mapping.aliases.join(', ')}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {isEditing ? (
                          <button
                            onClick={() => handleSaveAliases(mapping.standardField)}
                            className="px-2 py-1 bg-emerald-600 text-white rounded text-xs font-semibold"
                          >
                            Simpan
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingField(mapping.standardField);
                              setAliasInput(mapping.aliases.join(', '));
                            }}
                            className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded border text-xs"
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: BRANDING & LOGO */}
      {activeTab === 'branding' && (
        <form onSubmit={handleSaveBranding} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-4 text-xs max-w-xl">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold">
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                Kustomisasi Branding Aplikasi (MoraJaws)
              </h4>
              <p className="text-[11px] text-slate-500">
                Atur nama aplikasi dan warna tema utama yang tampil di seluruh navbar dan header.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Nama Aplikasi
              </label>
              <input
                type="text"
                value={appNameInput}
                onChange={e => setAppNameInput(e.target.value)}
                placeholder="MoraJaws"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-lg font-bold text-slate-900 dark:text-white text-sm"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Aksen Warna Utama (Brand Color)
              </label>
              <select
                value={appPrimaryColor}
                onChange={e => setAppPrimaryColor(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-lg font-medium"
              >
                <option value="indigo">Indigo Modern (MoraJaws Default)</option>
                <option value="blue">Deep Ocean Blue</option>
                <option value="emerald">Emerald Field Operations</option>
                <option value="slate">Monochrome Slate Enterprise</option>
                <option value="violet">Electric Violet</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end pt-2">
            <button
              type="submit"
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>Simpan Konfigurasi Branding</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 6: SESI STAF & OPERASIONAL WIB */}
      {activeTab === 'system_session' && (
        <div className="space-y-5">
          {/* Operational Date WIB Card */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Tanggal & Zona Waktu Operasional (Asia/Jakarta — WIB)
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Filter jadwal Appointment Date (Hari Ini, Kemarin, Besok) dihitung presisi berdasarkan zona waktu Indonesia Barat tanpa pergeseran UTC. Sistem otomatis berjalan dinamis sesuai kalender nyata.
                </p>
              </div>
            </div>

            <div className="p-4 bg-purple-50 dark:bg-purple-950/30 rounded-xl border border-purple-200 dark:border-purple-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-xs text-purple-800 dark:text-purple-300 font-semibold">
                  Tanggal Operasional Aktif Sistem
                </div>
                <div className="text-xl font-extrabold text-[#3B1D78] dark:text-[#E9E1FF] font-mono mt-0.5">
                  {operationalDate} <span className="text-xs font-normal text-purple-600 dark:text-purple-400">(WIB)</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={operationalDateInput}
                  onChange={e => setOperationalDateInput(e.target.value)}
                  className="px-3 py-2 bg-white dark:bg-slate-800 border border-purple-300 dark:border-purple-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    setOperationalDate(operationalDateInput);
                    triggerNotice(`Tanggal operasional sistem diperbarui ke ${operationalDateInput} (WIB)`);
                  }}
                  className="px-4 py-2 bg-[#5B35B1] hover:bg-[#3B1D78] text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
                >
                  Terapkan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const realDate = getJakartaDateString(0);
                    setOperationalDateInput(realDate);
                    setOperationalDate(realDate);
                    triggerNotice(`Tanggal operasional di-reset ke tanggal hari ini (WIB): ${realDate}`);
                  }}
                  className="px-3 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                >
                  Reset Hari Ini (Aktual WIB)
                </button>
              </div>
            </div>
          </div>

          {/* Session Management Card */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0">
                <KeyRound className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Manajemen Sesi Staf (Dispatch, Leader, Installer) & Idle Timeout
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Pantau sesi staf yang aktif, revokasi akses perangkat yang mencurigakan, dan atur batas waktu inaktivitas (idle timeout) serta batas sesi bersamaan.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Autentikasi role server-side tanpa token rahasia di client</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span>Sesi otomatis kedaluwarsa setelah idle timeout tercapai</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsSessionModalOpen(true)}
                className="px-5 py-2.5 bg-[#5B35B1] hover:bg-[#3B1D78] text-white font-bold text-xs rounded-xl shadow-md transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                <span>Buka Panel Manajemen Sesi Staf</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
