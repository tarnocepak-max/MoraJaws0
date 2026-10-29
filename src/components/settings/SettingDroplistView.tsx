import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { DroplistItem } from '../../types';
import {
  ListFilter,
  Plus,
  Trash2,
  Check,
  Edit2,
  Save,
  Layers,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Sliders
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

export const SettingDroplistView: React.FC = () => {
  const { toast } = useToast();

  const [activeCategory, setActiveCategory] = useState<DroplistItem['category']>('status_installer');
  const [droplists, setDroplists] = useState<DroplistItem[]>([
    { id: 'd-1', category: 'status_installer', label: 'Unassigned', value: 'Unassigned', order: 1, active: true },
    { id: 'd-2', category: 'status_installer', label: 'Assigned', value: 'Assigned', order: 2, active: true },
    { id: 'd-3', category: 'status_installer', label: 'En Route', value: 'En Route', order: 3, active: true },
    { id: 'd-4', category: 'status_installer', label: 'On Site', value: 'On Site', order: 4, active: true },
    { id: 'd-5', category: 'status_installer', label: 'Installed', value: 'Installed', order: 5, active: true },
    { id: 'd-6', category: 'status_installer', label: 'Pending Technical', value: 'Pending Technical', order: 6, active: true },
    { id: 'd-7', category: 'status_installer', label: 'Failed / Cancelled', value: 'Failed / Cancelled', order: 7, active: true },
    { id: 'd-8', category: 'status_installer', label: 'Completed', value: 'Completed', order: 8, active: true },

    { id: 'd-9', category: 'status_agent', label: 'Pending', value: 'Pending', order: 1, active: true },
    { id: 'd-10', category: 'status_agent', label: 'Assigned', value: 'Assigned', order: 2, active: true },
    { id: 'd-11', category: 'status_agent', label: 'In Progress', value: 'In Progress', order: 3, active: true },
    { id: 'd-12', category: 'status_agent', label: 'Resolved', value: 'Resolved', order: 4, active: true },
    { id: 'd-13', category: 'status_agent', label: 'Cancelled', value: 'Cancelled', order: 5, active: true },
    { id: 'd-14', category: 'status_agent', label: 'Closed', value: 'Closed', order: 6, active: true },

    { id: 'd-15', category: 'slot_time', label: '09:00 - 11:00 WIB', value: '09:00 - 11:00 WIB', order: 1, active: true },
    { id: 'd-16', category: 'slot_time', label: '11:00 - 13:00 WIB', value: '11:00 - 13:00 WIB', order: 2, active: true },
    { id: 'd-17', category: 'slot_time', label: '13:00 - 15:00 WIB', value: '13:00 - 15:00 WIB', order: 3, active: true },
    { id: 'd-18', category: 'slot_time', label: '15:00 - 17:00 WIB', value: '15:00 - 17:00 WIB', order: 4, active: true },

    { id: 'd-19', category: 'ticket_category', label: 'New Installation FTTH', value: 'New Installation FTTH', order: 1, active: true },
    { id: 'd-20', category: 'ticket_category', label: 'Relocation ONT', value: 'Relocation ONT', order: 2, active: true },
    { id: 'd-21', category: 'ticket_category', label: 'Maintenance LOS Red Light', value: 'Maintenance LOS Red Light', order: 3, active: true },
    { id: 'd-22', category: 'ticket_category', label: 'Upgrade Bandwidth + Mesh', value: 'Upgrade Bandwidth + Mesh', order: 4, active: true },
    { id: 'd-23', category: 'ticket_category', label: 'Dismantle Perangkat', value: 'Dismantle Perangkat', order: 5, active: true }
  ]);

  const [newLabel, setNewLabel] = useState('');
  const [newValue, setNewValue] = useState('');

  const currentItems = droplists
    .filter(d => d.category === activeCategory)
    .sort((a, b) => a.order - b.order);

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim()) return;
    const val = newValue.trim() || newLabel.trim();
    const newItem: DroplistItem = {
      id: 'drop-' + Date.now(),
      category: activeCategory,
      label: newLabel.trim(),
      value: val,
      order: currentItems.length + 1,
      active: true
    };
    setDroplists(prev => [...prev, newItem]);
    setNewLabel('');
    setNewValue('');
    toast.success(`Item "${newItem.label}" berhasil ditambahkan ke droplist.`, 'Droplist Diperbarui');
  };

  const handleDeleteItem = (id: string) => {
    setDroplists(prev => prev.filter(d => d.id !== id));
    toast.info('Item droplist dihapus.', 'Dihapus');
  };

  const handleToggleActive = (id: string) => {
    setDroplists(prev => prev.map(d => d.id === id ? { ...d, active: !d.active } : d));
  };

  const categories: { key: DroplistItem['category']; label: string }[] = [
    { key: 'status_installer', label: 'Status WO Installer' },
    { key: 'status_agent', label: 'Status WO Agent' },
    { key: 'slot_time', label: 'Slot Waktu Kunjungan' },
    { key: 'ticket_category', label: 'Kategori Tiket WO' }
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#5B35B1] text-white flex items-center justify-center font-bold shadow-xs">
            <ListFilter className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#3B1D78] dark:text-purple-200 flex items-center gap-2">
              <span>Setting Droplist & Kamus Data Pilihan</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E9E1FF] text-[#3B1D78] dark:bg-purple-900/60 dark:text-purple-200">
                Tersimpan di Database
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Atur opsi pilihan dropdown yang tampil pada formulir WO, status penugasan, dan kategori laporan teknisi.
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Category Selector */}
        <div className="lg:col-span-4 bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 p-4 shadow-xs space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
            Pilih Kategori Droplist
          </span>
          <div className="space-y-1.5">
            {categories.map(c => {
              const isSelected = activeCategory === c.key;
              const count = droplists.filter(d => d.category === c.key).length;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setActiveCategory(c.key)}
                  className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                    isSelected
                      ? 'bg-[#5B35B1] text-white border-[#5B35B1] font-bold shadow-xs'
                      : 'bg-[#F5F1FF]/60 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-[#D8CCF3] dark:border-slate-700 hover:bg-[#E9E1FF]'
                  }`}
                >
                  <span className="text-xs">{c.label}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Items Editor */}
        <div className="lg:col-span-8 bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#E9E1FF] dark:border-purple-900/40">
            <div>
              <h3 className="font-bold text-sm text-[#3B1D78] dark:text-purple-200">
                Kelola Opsi: {categories.find(c => c.key === activeCategory)?.label}
              </h3>
              <p className="text-[11px] text-slate-500">
                Daftar pilihan aktif yang akan muncul di dropdown pengguna
              </p>
            </div>
          </div>

          {/* Add item form */}
          <form onSubmit={handleAddItem} className="flex gap-2 text-xs">
            <input
              type="text"
              required
              placeholder="Label opsi baru..."
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
            />
            <input
              type="text"
              placeholder="Nilai kode (opsional)..."
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              className="w-48 px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl font-mono"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-[#5B35B1] hover:bg-[#3B1D78] text-white rounded-xl font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah</span>
            </button>
          </form>

          {/* Items list */}
          <div className="divide-y border rounded-xl overflow-hidden text-xs">
            {currentItems.map((item, idx) => (
              <div
                key={item.id}
                className="p-3 bg-white dark:bg-slate-900 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-slate-400 text-[11px] w-6">{idx + 1}.</span>
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{item.label}</span>
                    <span className="text-[11px] text-slate-400 font-mono ml-2">[{item.value}]</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(item.id)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      item.active
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {item.active ? 'Aktif' : 'Nonaktif'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(item.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
