import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { HierarchicalStatus, HierarchicalReason, HierarchicalRemark, DroplistItem } from '../../types';
import {
  Layers,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Search,
  MoveRight,
  AlertTriangle,
  FolderTree,
  Tag,
  CheckCircle2,
  CornerDownRight,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Database,
  RefreshCw,
  Eye,
  EyeOff,
  Sliders,
  ShieldCheck,
  FileCheck,
  CheckCheck
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { saveHierarchicalDroplistsToFirestore, subscribeToGeneralDroplists, saveGeneralDroplistsToFirestore } from '../../services/firestoreDb';

export const DroplistManagementView: React.FC = () => {
  const {
    hierarchicalStatuses,
    addHierarchicalStatus,
    updateHierarchicalStatus,
    deleteHierarchicalStatus,
    addHierarchicalReason,
    updateHierarchicalReason,
    deleteHierarchicalReason,
    moveHierarchicalReason,
    addHierarchicalRemark,
    updateHierarchicalRemark,
    deleteHierarchicalRemark,
    reconcileDroplistsNow,
    reportDropdownCategories
  } = useApp();
  const { toast } = useToast();

  const [activeMainTab, setActiveMainTab] = useState<'hierarchy' | 'static_droplists'>('hierarchy');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActiveState, setFilterActiveState] = useState<'all' | 'active_only' | 'inactive_only'>('all');
  const [isReconciling, setIsReconciling] = useState(false);

  // Expand / Collapse state for Level 1 (Status) & Level 2 (Reason)
  const [expandedStatusIds, setExpandedStatusIds] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    (hierarchicalStatuses || []).forEach(s => {
      init[s.id] = true;
    });
    return init;
  });
  const [expandedReasonIds, setExpandedReasonIds] = useState<Record<string, boolean>>({});

  // Modals state
  const [isAddStatusOpen, setIsAddStatusOpen] = useState(false);
  const [newStatusName, setNewStatusName] = useState('');
  const [newStatusCode, setNewStatusCode] = useState('');
  const [newStatusColor, setNewStatusColor] = useState('#7135B5');

  // Reason Modal
  const [targetStatusIdForReason, setTargetStatusIdForReason] = useState<string | null>(null);
  const [newReasonName, setNewReasonName] = useState('');
  const [newReasonCode, setNewReasonCode] = useState('');

  // Remark Modal
  const [targetReasonIdForRemark, setTargetReasonIdForRemark] = useState<{ statusId: string; reasonId: string } | null>(null);
  const [newRemarkText, setNewRemarkText] = useState('');

  // Move Reason Modal
  const [movingReason, setMovingReason] = useState<{ reason: HierarchicalReason; fromStatusId: string } | null>(null);
  const [targetMoveStatusId, setTargetMoveStatusId] = useState<string>('');

  // Edit in place / Edit Modal
  const [editingItem, setEditingItem] = useState<{
    type: 'status' | 'reason' | 'remark';
    id: string;
    parentStatusId?: string;
    parentReasonId?: string;
    name: string;
    code?: string;
    color?: string;
  } | null>(null);

  // General Static Droplists state (Slot Waktu, Kategori Tiket, Status Agent)
  const [activeGeneralCategory, setActiveGeneralCategory] = useState<DroplistItem['category']>('slot_time');
  const [generalDroplists, setGeneralDroplists] = useState<DroplistItem[]>([
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
  const [newGeneralLabel, setNewGeneralLabel] = useState('');
  const [newGeneralValue, setNewGeneralValue] = useState('');

  // Subscribe to real-time Cloud Firestore updates for general droplists
  React.useEffect(() => {
    const unsub = subscribeToGeneralDroplists(
      items => {
        if (items && items.length > 0) {
          setGeneralDroplists(items);
        }
      },
      err => {
        console.warn('[Firestore] Error subscribing to general droplists:', err);
      }
    );
    return () => unsub();
  }, []);

  // Compute Total Metrics across the entire hierarchy
  const metrics = useMemo(() => {
    let totalStatuses = 0;
    let activeStatuses = 0;
    let totalReasons = 0;
    let activeReasons = 0;
    let totalRemarks = 0;
    let activeRemarks = 0;

    (hierarchicalStatuses || []).forEach(s => {
      totalStatuses++;
      if (s.active !== false && (s as any).isActive !== false) activeStatuses++;

      (s.reasons || []).forEach(r => {
        totalReasons++;
        if (r.active !== false && (r as any).isActive !== false) activeReasons++;

        (r.remarks || []).forEach(rm => {
          totalRemarks++;
          if (rm.active !== false && (rm as any).isActive !== false) activeRemarks++;
        });
      });
    });

    return {
      totalStatuses,
      activeStatuses,
      totalReasons,
      activeReasons,
      totalRemarks,
      activeRemarks
    };
  }, [hierarchicalStatuses]);

  // Expand / Collapse toggles
  const toggleStatusExpand = (id: string) => {
    setExpandedStatusIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleReasonExpand = (id: string) => {
    setExpandedReasonIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleExpandAll = () => {
    const sMap: Record<string, boolean> = {};
    const rMap: Record<string, boolean> = {};
    hierarchicalStatuses.forEach(s => {
      sMap[s.id] = true;
      (s.reasons || []).forEach(r => {
        rMap[r.id] = true;
      });
    });
    setExpandedStatusIds(sMap);
    setExpandedReasonIds(rMap);
  };

  const handleCollapseAll = () => {
    setExpandedStatusIds({});
    setExpandedReasonIds({});
  };

  // Reorder Handlers with immediate Firestore persistence
  const handleMoveStatusOrder = (statusId: string, direction: 'up' | 'down') => {
    const idx = hierarchicalStatuses.findIndex(s => s.id === statusId);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= hierarchicalStatuses.length) return;
    const copy = [...hierarchicalStatuses];
    const temp = copy[idx];
    copy[idx] = copy[targetIdx];
    copy[targetIdx] = temp;
    copy.forEach((s, i) => { s.order = i + 1; });
    saveHierarchicalDroplistsToFirestore(copy)
      .then(() => toast.success('Urutan Status WO berhasil diselaraskan ke Cloud Firestore.'))
      .catch(() => toast.error('Gagal memperbarui urutan di Firestore.'));
  };

  const handleMoveReasonOrder = (statusId: string, reasonId: string, direction: 'up' | 'down') => {
    const status = hierarchicalStatuses.find(s => s.id === statusId);
    if (!status) return;
    const idx = status.reasons.findIndex(r => r.id === reasonId);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= status.reasons.length) return;
    const updated = hierarchicalStatuses.map(s => {
      if (s.id !== statusId) return s;
      const reasonsCopy = [...s.reasons];
      const temp = reasonsCopy[idx];
      reasonsCopy[idx] = reasonsCopy[targetIdx];
      reasonsCopy[targetIdx] = temp;
      reasonsCopy.forEach((r, i) => { r.order = i + 1; });
      return { ...s, reasons: reasonsCopy };
    });
    saveHierarchicalDroplistsToFirestore(updated)
      .then(() => toast.success('Urutan Reason WO berhasil diselaraskan ke Cloud Firestore.'))
      .catch(() => toast.error('Gagal memperbarui urutan di Firestore.'));
  };

  const handleMoveRemarkOrder = (statusId: string, reasonId: string, remarkId: string, direction: 'up' | 'down') => {
    const updated = hierarchicalStatuses.map(s => {
      if (s.id !== statusId) return s;
      return {
        ...s,
        reasons: s.reasons.map(r => {
          if (r.id !== reasonId) return r;
          const idx = r.remarks.findIndex(rm => rm.id === remarkId);
          if (idx === -1) return r;
          const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
          if (targetIdx < 0 || targetIdx >= r.remarks.length) return r;
          const remarksCopy = [...r.remarks];
          const temp = remarksCopy[idx];
          remarksCopy[idx] = remarksCopy[targetIdx];
          remarksCopy[targetIdx] = temp;
          remarksCopy.forEach((rm, i) => { rm.order = i + 1; });
          return { ...r, remarks: remarksCopy };
        })
      };
    });
    saveHierarchicalDroplistsToFirestore(updated)
      .then(() => toast.success('Urutan Remarks berhasil diselaraskan ke Cloud Firestore.'))
      .catch(() => toast.error('Gagal memperbarui urutan di Firestore.'));
  };

  // Reconcile Data Action
  const handleTriggerReconcile = async () => {
    setIsReconciling(true);
    try {
      await reconcileDroplistsNow();
    } finally {
      setIsReconciling(false);
    }
  };

  // Search & Active Filter
  const filteredStatuses = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return hierarchicalStatuses
      .filter(s => {
        const isAct = s.active !== false && (s as any).isActive !== false;
        if (filterActiveState === 'active_only') return isAct;
        if (filterActiveState === 'inactive_only') return !isAct;
        return true;
      })
      .map(status => {
        if (!q) return status;

        const statusMatch = status.name.toLowerCase().includes(q) || (status.code && status.code.toLowerCase().includes(q));
        const matchingReasons = (status.reasons || [])
          .map(reason => {
            const reasonMatch = reason.name.toLowerCase().includes(q) || (reason.code && reason.code.toLowerCase().includes(q));
            const matchingRemarks = (reason.remarks || []).filter(rem =>
              (rem.text || rem.name).toLowerCase().includes(q)
            );
            if (reasonMatch || matchingRemarks.length > 0) {
              return {
                ...reason,
                remarks: reasonMatch ? reason.remarks : matchingRemarks
              };
            }
            return null;
          })
          .filter(Boolean) as HierarchicalReason[];

        if (statusMatch || matchingReasons.length > 0) {
          return {
            ...status,
            reasons: statusMatch ? status.reasons : matchingReasons
          };
        }
        return null;
      })
      .filter(Boolean) as HierarchicalStatus[];
  }, [hierarchicalStatuses, searchQuery, filterActiveState]);

  // General Droplists Add & Delete Handlers
  const currentGeneralItems = generalDroplists
    .filter(d => d.category === activeGeneralCategory)
    .sort((a, b) => a.order - b.order);

  const handleAddGeneralItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGeneralLabel.trim()) return;
    const val = newGeneralValue.trim() || newGeneralLabel.trim();
    const newItem: DroplistItem = {
      id: 'drop-' + Date.now(),
      category: activeGeneralCategory,
      label: newGeneralLabel.trim(),
      value: val,
      order: currentGeneralItems.length + 1,
      active: true
    };
    const updated = [...generalDroplists, newItem];
    setGeneralDroplists(updated);
    setNewGeneralLabel('');
    setNewGeneralValue('');
    saveGeneralDroplistsToFirestore(updated)
      .then(() => toast.success(`Item "${newItem.label}" berhasil disimpan.`))
      .catch(err => toast.error('Gagal menyimpan: ' + (err?.message || err)));
  };

  const handleDeleteGeneralItem = (id: string) => {
    const updated = generalDroplists.filter(d => d.id !== id);
    setGeneralDroplists(updated);
    saveGeneralDroplistsToFirestore(updated)
      .then(() => toast.info('Item berhasil dihapus.'))
      .catch(err => toast.error('Gagal menghapus: ' + (err?.message || err)));
  };

  const handleToggleGeneralActive = (id: string) => {
    const updated = generalDroplists.map(d => d.id === id ? { ...d, active: !d.active } : d);
    setGeneralDroplists(updated);
    saveGeneralDroplistsToFirestore(updated).catch(() => {});
  };

  return (
    <div className="space-y-5">
      {/* ============================================================ */}
      {/* TOP HEADER BANNER (MoraJaws Dark Purple Gloss + Lilac)        */}
      {/* ============================================================ */}
      <div className="bg-[#160D29] rounded-2xl border border-[#D8B4FE]/30 p-5 shadow-[0_4px_24px_rgba(22,13,41,0.6)] relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#D8B4FE]/60 to-transparent" />

        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#7135B5] to-[#35105E] border border-[#D8B4FE]/50 text-white flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(113,53,181,0.4)]">
            <Layers className="w-5 h-5 text-[#E9D5FF]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-extrabold text-white tracking-tight">
                DROPLIST MANAGEMENT
              </h2>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-[#35105E] text-[#D8B4FE] border border-[#D8B4FE]/30">
                <Database className="w-3 h-3 text-[#A855F7]" />
                <span>Single Source of Truth • Cloud Firestore</span>
              </span>
            </div>
            <p className="text-xs text-[#D8B4FE]/80 mt-0.5">
              Satu sistem konfigurasi terpadu 3-tingkat: <strong>Status WO (Level 1)</strong> → <strong>Reason WO (Level 2)</strong> → <strong>Remarks (Level 3)</strong>.
            </p>
          </div>
        </div>

        {/* Top Header Buttons */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={handleTriggerReconcile}
            disabled={isReconciling}
            className="px-3 py-1.5 text-xs font-semibold text-[#D8B4FE] hover:text-white bg-[#35105E]/70 hover:bg-[#35105E] border border-[#D8B4FE]/30 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            title="Sinkronisasikan dan verifikasi rekonsiliasi data lama ke hierarki utama"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#A855F7] ${isReconciling ? 'animate-spin' : ''}`} />
            <span>{isReconciling ? 'Menyelaraskan...' : 'Rekonsiliasi Data'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setNewStatusName('');
              setNewStatusCode('');
              setNewStatusColor('#7135B5');
              setIsAddStatusOpen(true);
            }}
            className="px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-[#7135B5] to-[#A855F7] hover:from-[#7E3CC7] hover:to-[#B666FE] rounded-xl flex items-center justify-center gap-1.5 shadow-[0_0_18px_rgba(168,85,247,0.4)] border border-[#E9D5FF]/30 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Tambah Status WO (Level 1)</span>
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 3-LEVEL ARCHITECTURE METRICS SUMMARY CARDS                   */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Level 1: Status WO */}
        <div className="bg-[#160D29]/80 rounded-2xl border border-[#D8B4FE]/20 p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold tracking-wider uppercase text-[#D8B4FE]/60 block">
              Level 1 (Parent)
            </span>
            <div className="text-sm font-extrabold text-white mt-0.5">
              Status WO
            </div>
            <div className="text-[11px] text-emerald-300 font-mono mt-0.5">
              {metrics.activeStatuses} Aktif <span className="text-[#D8B4FE]/40">/ {metrics.totalStatuses} Total</span>
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-[#35105E]/80 border border-[#A855F7]/40 flex items-center justify-center text-white font-bold text-sm">
            {metrics.totalStatuses}
          </div>
        </div>

        {/* Level 2: Reason WO */}
        <div className="bg-[#160D29]/80 rounded-2xl border border-[#D8B4FE]/20 p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold tracking-wider uppercase text-[#D8B4FE]/60 block">
              Level 2 (Child)
            </span>
            <div className="text-sm font-extrabold text-white mt-0.5">
              Reason WO
            </div>
            <div className="text-[11px] text-emerald-300 font-mono mt-0.5">
              {metrics.activeReasons} Aktif <span className="text-[#D8B4FE]/40">/ {metrics.totalReasons} Total</span>
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-[#35105E]/80 border border-[#A855F7]/40 flex items-center justify-center text-white font-bold text-sm">
            {metrics.totalReasons}
          </div>
        </div>

        {/* Level 3: Remarks */}
        <div className="bg-[#160D29]/80 rounded-2xl border border-[#D8B4FE]/20 p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold tracking-wider uppercase text-[#D8B4FE]/60 block">
              Level 3 (Sub-child / Rootcause)
            </span>
            <div className="text-sm font-extrabold text-white mt-0.5">
              Remarks
            </div>
            <div className="text-[11px] text-emerald-300 font-mono mt-0.5">
              {metrics.activeRemarks} Aktif <span className="text-[#D8B4FE]/40">/ {metrics.totalRemarks} Total</span>
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-[#35105E]/80 border border-[#A855F7]/40 flex items-center justify-center text-white font-bold text-sm">
            {metrics.totalRemarks}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* NAVIGATION TABS: HIERARCHICAL TREE VS STATIC DROPLISTS       */}
      {/* ============================================================ */}
      <div className="flex items-center gap-2 border-b border-[#D8B4FE]/20 pb-1 text-xs overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveMainTab('hierarchy')}
          className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
            activeMainTab === 'hierarchy'
              ? 'bg-[#7135B5] text-white shadow-[0_0_15px_rgba(113,53,181,0.4)] border border-[#E9D5FF]/40'
              : 'bg-[#1E1138]/40 text-[#D8B4FE]/80 hover:bg-[#35105E]/40 hover:text-white border border-[#D8B4FE]/20'
          }`}
        >
          <FolderTree className="w-3.5 h-3.5 text-[#E9D5FF]" />
          <span>Hierarchical Tree (Status → Reason → Remarks)</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 text-white font-mono">
            {metrics.totalStatuses}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMainTab('static_droplists')}
          className={`px-4 py-2 rounded-xl font-semibold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
            activeMainTab === 'static_droplists'
              ? 'bg-[#7135B5] text-white shadow-[0_0_15px_rgba(113,53,181,0.4)] border border-[#E9D5FF]/40'
              : 'bg-[#1E1138]/40 text-[#D8B4FE]/80 hover:bg-[#35105E]/40 hover:text-white border border-[#D8B4FE]/20'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Droplist Statis & Slot Waktu ({generalDroplists.length})</span>
        </button>
      </div>

      {/* ============================================================ */}
      {/* TAB 1: HIERARCHICAL TREE VIEW                                */}
      {/* ============================================================ */}
      {activeMainTab === 'hierarchy' && (
        <div className="space-y-4">
          {/* Controls: Search, Expand All, Active Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#160D29]/70 rounded-2xl border border-[#D8B4FE]/20 p-3.5">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-[#D8B4FE]/60 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari status, reason, atau remarks di seluruh hirarki..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-[#35105E]/30 border border-[#D8B4FE]/25 rounded-xl text-xs text-white placeholder-[#D8B4FE]/40 focus:border-[#A855F7] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Filter Active / Inactive */}
              <select
                value={filterActiveState}
                onChange={e => setFilterActiveState(e.target.value as any)}
                className="px-3 py-1.5 bg-[#35105E]/40 border border-[#D8B4FE]/25 rounded-xl text-xs text-white focus:border-[#A855F7] focus:outline-none cursor-pointer"
              >
                <option value="all">Semua Status (Aktif & Nonaktif)</option>
                <option value="active_only">Hanya Status Aktif</option>
                <option value="inactive_only">Hanya Status Nonaktif</option>
              </select>

              <button
                type="button"
                onClick={handleExpandAll}
                className="px-2.5 py-1.5 text-xs font-semibold text-[#D8B4FE] hover:text-white bg-[#35105E]/40 hover:bg-[#35105E]/70 rounded-xl border border-[#D8B4FE]/25 cursor-pointer"
              >
                Expand All
              </button>
              <button
                type="button"
                onClick={handleCollapseAll}
                className="px-2.5 py-1.5 text-xs font-semibold text-[#D8B4FE] hover:text-white bg-[#35105E]/40 hover:bg-[#35105E]/70 rounded-xl border border-[#D8B4FE]/25 cursor-pointer"
              >
                Collapse All
              </button>
            </div>
          </div>

          {/* Hierarchical Tree Container */}
          <div className="space-y-3">
            {filteredStatuses.length === 0 ? (
              <div className="p-10 text-center text-xs text-[#D8B4FE]/70 bg-[#160D29]/60 rounded-2xl border border-[#D8B4FE]/20 space-y-2">
                <AlertTriangle className="w-8 h-8 text-[#D8B4FE]/50 mx-auto" />
                <p className="font-semibold text-white">Tidak ada data status yang cocok dengan filter atau pencarian.</p>
                <p className="text-[11px]">Coba reset kata kunci atau klik "+ Tambah Status WO (Level 1)".</p>
              </div>
            ) : (
              filteredStatuses.map(status => {
                const isExpanded = Boolean(expandedStatusIds[status.id]);
                const statusReasons = status.reasons || [];
                const totalStatusReasons = statusReasons.length;
                const totalStatusRemarks = statusReasons.reduce((acc, r) => acc + (r.remarks?.length || 0), 0);
                const isStatusActive = status.active !== false && (status as any).isActive !== false;

                return (
                  <div
                    key={status.id}
                    className={`rounded-2xl border transition-all overflow-hidden ${
                      isStatusActive
                        ? 'bg-[#160D29] border-[#D8B4FE]/30 shadow-md'
                        : 'bg-[#160D29]/60 border-white/10 opacity-75'
                    }`}
                  >
                    {/* LEVEL 1: STATUS HEADER BAR */}
                    <div className="p-3.5 sm:p-4 bg-gradient-to-r from-[#1E0F3D] to-[#160D29] border-b border-[#D8B4FE]/20 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={() => toggleStatusExpand(status.id)}
                          className="p-1 rounded-lg text-[#D8B4FE] hover:bg-[#35105E] cursor-pointer transition-colors"
                          title={isExpanded ? 'Tutup Detail' : 'Buka Detail'}
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-[#A855F7]" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-[#D8B4FE]/60" />
                          )}
                        </button>

                        <span
                          className="w-3.5 h-3.5 rounded-full shadow-[0_0_8px_currentColor] shrink-0"
                          style={{ backgroundColor: status.color || '#7135B5', color: status.color || '#7135B5' }}
                        />

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-xs sm:text-sm text-white">
                              {status.name}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#35105E] text-[#D8B4FE] border border-[#D8B4FE]/30 font-bold">
                              Level 1 • {status.code || status.name.toUpperCase()}
                            </span>

                            {/* Active / Inactive Status Toggle Badge */}
                            <button
                              type="button"
                              onClick={() => {
                                const nextState = !isStatusActive;
                                updateHierarchicalStatus(status.id, { active: nextState, isActive: nextState });
                                toast.info(`Status "${status.name}" ${nextState ? 'diaktifkan' : 'dinonaktifkan'}.`);
                              }}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition-colors flex items-center gap-1 ${
                                isStatusActive
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 hover:bg-emerald-500/30'
                                  : 'bg-slate-700/50 text-slate-300 border border-slate-600/40 hover:bg-slate-700'
                              }`}
                              title="Klik untuk ubah aktif / nonaktif"
                            >
                              {isStatusActive ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
                              <span>{isStatusActive ? 'Aktif' : 'Nonaktif'}</span>
                            </button>
                          </div>

                          <div className="text-[11px] text-[#D8B4FE]/70 mt-0.5">
                            {totalStatusReasons} Reason WO • {totalStatusRemarks} Remarks
                          </div>
                        </div>
                      </div>

                      {/* Level 1 Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Order Reorder */}
                        <div className="flex items-center border border-[#D8B4FE]/25 rounded-lg overflow-hidden bg-[#35105E]/40">
                          <button
                            type="button"
                            onClick={() => handleMoveStatusOrder(status.id, 'up')}
                            className="p-1 hover:bg-[#35105E] text-[#D8B4FE]/70 hover:text-white cursor-pointer"
                            title="Geser Urutan Status ke Atas"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveStatusOrder(status.id, 'down')}
                            className="p-1 hover:bg-[#35105E] text-[#D8B4FE]/70 hover:text-white cursor-pointer border-l border-[#D8B4FE]/25"
                            title="Geser Urutan Status ke Bawah"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Add Reason */}
                        <button
                          type="button"
                          onClick={() => {
                            setTargetStatusIdForReason(status.id);
                            setNewReasonName('');
                            setNewReasonCode('');
                          }}
                          className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/35 text-emerald-300 rounded-lg text-[11px] font-bold flex items-center gap-1 border border-emerald-400/30 cursor-pointer transition-colors"
                          title="Tambah Reason (Level 2) di bawah status ini"
                        >
                          <Plus className="w-3 h-3" />
                          <span>+ Reason</span>
                        </button>

                        {/* Edit Status */}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingItem({
                              type: 'status',
                              id: status.id,
                              name: status.name,
                              code: status.code,
                              color: status.color
                            });
                          }}
                          className="p-1.5 text-[#D8B4FE]/70 hover:text-white hover:bg-[#35105E] rounded-lg cursor-pointer border border-[#D8B4FE]/20"
                          title="Edit Status WO"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete Status */}
                        <button
                          type="button"
                          onClick={() => {
                            if (totalStatusReasons > 0) {
                              const confirmDel = window.confirm(
                                `Status WO "${status.name}" memiliki ${totalStatusReasons} child reasons dan ${totalStatusRemarks} remarks.\n\nMenghapus status ini akan menghapus seluruh cabang di bawahnya. Lanjutkan?`
                              );
                              if (!confirmDel) return;
                            }
                            deleteHierarchicalStatus(status.id);
                          }}
                          className="p-1.5 text-rose-400 hover:text-rose-200 hover:bg-rose-950/50 rounded-lg cursor-pointer border border-rose-500/30"
                          title="Hapus Status WO"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* LEVEL 2: REASONS LIST */}
                    {isExpanded && (
                      <div className="p-3 sm:p-4 space-y-3 bg-[#110920]/60">
                        {statusReasons.length === 0 ? (
                          <div className="p-4 text-center text-xs text-[#D8B4FE]/50 italic">
                            Belum ada Reason WO (Level 2) di bawah status ini. Klik "+ Reason" di atas untuk menambahkan.
                          </div>
                        ) : (
                          statusReasons.map(reason => {
                            const isReasonExpanded = Boolean(expandedReasonIds[reason.id]);
                            const isReasonActive = reason.active !== false && (reason as any).isActive !== false;
                            const reasonRemarks = reason.remarks || [];

                            return (
                              <div
                                key={reason.id}
                                className={`rounded-xl border transition-all overflow-hidden ml-2 sm:ml-4 ${
                                  isReasonActive
                                    ? 'bg-[#1A0E2E] border-[#D8B4FE]/20'
                                    : 'bg-[#140827] border-white/5 opacity-70'
                                }`}
                              >
                                {/* Reason Header */}
                                <div className="p-3 bg-[#1F1138]/60 flex flex-wrap items-center justify-between gap-2 border-b border-[#D8B4FE]/15">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <button
                                      type="button"
                                      onClick={() => toggleReasonExpand(reason.id)}
                                      className="p-0.5 rounded text-[#D8B4FE]/70 hover:text-white cursor-pointer"
                                      title={isReasonExpanded ? 'Tutup Remarks' : 'Buka Remarks'}
                                    >
                                      {isReasonExpanded ? (
                                        <ChevronDown className="w-3.5 h-3.5 text-[#A855F7]" />
                                      ) : (
                                        <ChevronRight className="w-3.5 h-3.5" />
                                      )}
                                    </button>

                                    <CornerDownRight className="w-3.5 h-3.5 text-[#A855F7] shrink-0" />

                                    <span className="font-bold text-xs text-white">
                                      {reason.name}
                                    </span>

                                    <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded bg-[#35105E]/80 text-[#E9D5FF] border border-[#D8B4FE]/20">
                                      Level 2 {reason.code ? `• ${reason.code}` : ''}
                                    </span>

                                    {/* Active / Inactive Reason Toggle */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const nextState = !isReasonActive;
                                        updateHierarchicalReason(status.id, reason.id, { active: nextState, isActive: nextState });
                                        toast.info(`Reason "${reason.name}" ${nextState ? 'diaktifkan' : 'dinonaktifkan'}.`);
                                      }}
                                      className={`px-1.5 py-0.2 rounded-full text-[9px] font-bold cursor-pointer transition-colors ${
                                        isReasonActive
                                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                                          : 'bg-slate-700/50 text-slate-300 border border-slate-600/40'
                                      }`}
                                    >
                                      {isReasonActive ? 'Aktif' : 'Nonaktif'}
                                    </button>

                                    <span className="text-[10px] text-[#D8B4FE]/60 font-mono">
                                      ({reasonRemarks.length} Remarks)
                                    </span>
                                  </div>

                                  {/* Reason Actions */}
                                  <div className="flex items-center gap-1 shrink-0">
                                    {/* Reorder Reason */}
                                    <div className="flex items-center border border-[#D8B4FE]/20 rounded overflow-hidden bg-[#35105E]/40">
                                      <button
                                        type="button"
                                        onClick={() => handleMoveReasonOrder(status.id, reason.id, 'up')}
                                        className="p-1 hover:bg-[#35105E] text-[#D8B4FE]/70 hover:text-white cursor-pointer"
                                        title="Geser Reason ke Atas"
                                      >
                                        <ArrowUp className="w-2.5 h-2.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleMoveReasonOrder(status.id, reason.id, 'down')}
                                        className="p-1 hover:bg-[#35105E] text-[#D8B4FE]/70 hover:text-white cursor-pointer border-l border-[#D8B4FE]/20"
                                        title="Geser Reason ke Bawah"
                                      >
                                        <ArrowDown className="w-2.5 h-2.5" />
                                      </button>
                                    </div>

                                    {/* Add Remark */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setTargetReasonIdForRemark({
                                          statusId: status.id,
                                          reasonId: reason.id
                                        });
                                        setNewRemarkText('');
                                      }}
                                      className="px-2 py-0.5 bg-[#7135B5]/30 hover:bg-[#7135B5]/60 text-[#E9D5FF] rounded text-[10.5px] font-semibold flex items-center gap-1 border border-[#D8B4FE]/20 cursor-pointer"
                                      title="Tambah Remark (Level 3)"
                                    >
                                      <Plus className="w-3 h-3" />
                                      <span>+ Remark</span>
                                    </button>

                                    {/* Move to another status */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setMovingReason({
                                          reason,
                                          fromStatusId: status.id
                                        });
                                        setTargetMoveStatusId(status.id);
                                      }}
                                      className="p-1 text-[#D8B4FE]/70 hover:text-amber-300 rounded cursor-pointer"
                                      title="Pindahkan Reason ke Status WO lain"
                                    >
                                      <MoveRight className="w-3.5 h-3.5" />
                                    </button>

                                    {/* Edit Reason */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingItem({
                                          type: 'reason',
                                          id: reason.id,
                                          parentStatusId: status.id,
                                          name: reason.name,
                                          code: reason.code
                                        });
                                      }}
                                      className="p-1 text-[#D8B4FE]/70 hover:text-white rounded cursor-pointer"
                                      title="Edit Reason WO"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>

                                    {/* Delete Reason */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        deleteHierarchicalReason(status.id, reason.id);
                                      }}
                                      className="p-1 text-rose-400 hover:text-rose-200 rounded cursor-pointer"
                                      title="Hapus Reason WO"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>

                                {/* LEVEL 3: REMARKS LIST */}
                                {isReasonExpanded && (
                                  <div className="p-2.5 sm:p-3 bg-[#140827]/80 space-y-1.5 ml-3 sm:ml-6 border-l-2 border-[#A855F7]/40">
                                    {reasonRemarks.length === 0 ? (
                                      <div className="p-2 text-center text-[11px] text-[#D8B4FE]/50 italic">
                                        Belum ada remarks/rootcause untuk reason ini. Klik "+ Remark" di atas.
                                      </div>
                                    ) : (
                                      reasonRemarks.map(rem => {
                                        const isRemActive = rem.active !== false && (rem as any).isActive !== false;
                                        return (
                                          <div
                                            key={rem.id}
                                            className={`p-2 rounded-lg border flex items-center justify-between gap-2 transition-colors ${
                                              isRemActive
                                                ? 'bg-[#1E1138]/60 border-[#D8B4FE]/20 hover:border-[#A855F7]/40'
                                                : 'bg-[#120822] border-white/5 opacity-60'
                                            }`}
                                          >
                                            <div className="flex items-center gap-2 min-w-0">
                                              <Tag className="w-3 h-3 text-[#A855F7] shrink-0" />
                                              <span className="text-xs text-white font-medium truncate">
                                                {rem.text || rem.name}
                                              </span>
                                              <span className="text-[9px] font-mono px-1 rounded bg-[#35105E]/60 text-[#D8B4FE]/80">
                                                Level 3
                                              </span>

                                              {/* Toggle Active Remark */}
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const nextState = !isRemActive;
                                                  updateHierarchicalRemark(status.id, reason.id, rem.id, { active: nextState, isActive: nextState });
                                                  toast.info(`Remark "${rem.name || rem.text}" ${nextState ? 'diaktifkan' : 'dinonaktifkan'}.`);
                                                }}
                                                className={`px-1.5 py-0.2 rounded-full text-[8.5px] font-bold cursor-pointer transition-colors ${
                                                  isRemActive
                                                    ? 'bg-emerald-500/20 text-emerald-300'
                                                    : 'bg-slate-700/50 text-slate-400'
                                                }`}
                                              >
                                                {isRemActive ? 'Aktif' : 'Nonaktif'}
                                              </button>
                                            </div>

                                            <div className="flex items-center gap-1 shrink-0">
                                              {/* Reorder Remark */}
                                              <div className="flex items-center border border-[#D8B4FE]/20 rounded overflow-hidden bg-[#35105E]/30">
                                                <button
                                                  type="button"
                                                  onClick={() => handleMoveRemarkOrder(status.id, reason.id, rem.id, 'up')}
                                                  className="p-1 hover:bg-[#35105E] text-[#D8B4FE]/60 hover:text-white cursor-pointer"
                                                  title="Geser Remark ke Atas"
                                                >
                                                  <ArrowUp className="w-2.5 h-2.5" />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => handleMoveRemarkOrder(status.id, reason.id, rem.id, 'down')}
                                                  className="p-1 hover:bg-[#35105E] text-[#D8B4FE]/60 hover:text-white cursor-pointer border-l border-[#D8B4FE]/20"
                                                  title="Geser Remark ke Bawah"
                                                >
                                                  <ArrowDown className="w-2.5 h-2.5" />
                                                </button>
                                              </div>

                                              {/* Edit Remark */}
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setEditingItem({
                                                    type: 'remark',
                                                    id: rem.id,
                                                    parentStatusId: status.id,
                                                    parentReasonId: reason.id,
                                                    name: rem.text || rem.name
                                                  });
                                                }}
                                                className="p-1 text-[#D8B4FE]/60 hover:text-white rounded cursor-pointer"
                                                title="Edit Remark"
                                              >
                                                <Edit2 className="w-3 h-3" />
                                              </button>

                                              {/* Delete Remark */}
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  deleteHierarchicalRemark(status.id, reason.id, rem.id);
                                                }}
                                                className="p-1 text-rose-400 hover:text-rose-200 rounded cursor-pointer"
                                                title="Hapus Remark"
                                              >
                                                <Trash2 className="w-3 h-3" />
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 2: GENERAL STATIC DROPLISTS (Slot Waktu, Kategori Tiket) */}
      {/* ============================================================ */}
      {activeMainTab === 'static_droplists' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Category Selector */}
          <div className="lg:col-span-4 bg-[#160D29] rounded-2xl border border-[#D8B4FE]/25 p-4 shadow-sm space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#D8B4FE]/60 block mb-2">
              Kategori Droplist Tambahan
            </span>
            <div className="space-y-1.5">
              {[
                { key: 'slot_time', label: 'Slot Waktu Kunjungan' },
                { key: 'ticket_category', label: 'Kategori Tiket WO' },
                { key: 'status_agent', label: 'Status WO Agent (Dispatch)' }
              ].map(c => {
                const isSelected = activeGeneralCategory === c.key;
                const count = generalDroplists.filter(d => d.category === c.key).length;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setActiveGeneralCategory(c.key as any)}
                    className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-[#7135B5] text-white border-[#A855F7] font-bold shadow-[0_0_15px_rgba(113,53,181,0.4)]'
                        : 'bg-[#1E1138]/40 text-[#D8B4FE]/80 border-[#D8B4FE]/20 hover:bg-[#35105E]/40 hover:text-white'
                    }`}
                  >
                    <span className="text-xs">{c.label}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-[#35105E]/70 text-[#D8B4FE]'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Items Editor */}
          <div className="lg:col-span-8 bg-[#160D29] rounded-2xl border border-[#D8B4FE]/25 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#D8B4FE]/15">
              <div>
                <h3 className="font-extrabold text-white text-sm">
                  Kelola Opsi: {activeGeneralCategory === 'slot_time' ? 'Slot Waktu Kunjungan' : activeGeneralCategory === 'ticket_category' ? 'Kategori Tiket WO' : 'Status WO Agent'}
                </h3>
                <p className="text-[11px] text-[#D8B4FE]/70 mt-0.5">
                  Daftar opsi statis tersimpan permanen di Cloud Firestore.
                </p>
              </div>
            </div>

            {/* Add item form */}
            <form onSubmit={handleAddGeneralItem} className="flex gap-2 text-xs">
              <input
                type="text"
                required
                placeholder="Label opsi baru..."
                value={newGeneralLabel}
                onChange={e => setNewGeneralLabel(e.target.value)}
                className="flex-1 px-3 py-2 bg-[#35105E]/30 border border-[#D8B4FE]/30 rounded-xl text-white placeholder-[#D8B4FE]/40 focus:border-[#A855F7] focus:outline-none"
              />
              <input
                type="text"
                placeholder="Nilai kode (opsional)..."
                value={newGeneralValue}
                onChange={e => setNewGeneralValue(e.target.value)}
                className="w-48 px-3 py-2 bg-[#35105E]/30 border border-[#D8B4FE]/30 rounded-xl text-white placeholder-[#D8B4FE]/40 focus:border-[#A855F7] focus:outline-none font-mono"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-[#7135B5] hover:bg-[#8542D1] text-white rounded-xl font-bold flex items-center gap-1.5 shadow-md border border-[#E9D5FF]/30 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah</span>
              </button>
            </form>

            {/* Items list */}
            <div className="divide-y divide-[#D8B4FE]/15 border border-[#D8B4FE]/20 rounded-xl overflow-hidden text-xs">
              {currentGeneralItems.length === 0 ? (
                <div className="p-4 text-center text-[#D8B4FE]/50 italic">
                  Belum ada opsi dalam kategori ini.
                </div>
              ) : (
                currentGeneralItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className="p-3 bg-[#1A0E2E]/60 flex items-center justify-between hover:bg-[#1E1138]/80 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[#D8B4FE]/50 text-[11px] w-6">{idx + 1}.</span>
                      <div>
                        <span className="font-bold text-white">{item.label}</span>
                        <span className="text-[11px] text-[#D8B4FE]/60 font-mono ml-2">[{item.value}]</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleGeneralActive(item.id)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                          item.active
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                            : 'bg-slate-700/50 text-slate-300 border border-slate-600/40'
                        }`}
                      >
                        {item.active ? 'Aktif' : 'Nonaktif'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteGeneralItem(item.id)}
                        className="p-1 text-rose-400 hover:text-rose-200 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: ADD LEVEL 1 STATUS WO                                 */}
      {/* ============================================================ */}
      {isAddStatusOpen && (
        <div className="fixed inset-0 z-70 bg-[#160D29]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#160D29] border border-[#D8B4FE]/50 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 relative overflow-hidden animate-in zoom-in-95">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#D8B4FE] to-transparent" />
            <h4 className="font-black text-sm text-white">
              Tambah Status Work Order Baru (Level 1)
            </h4>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block text-[#E9D5FF] mb-1">Nama Status <span className="text-rose-400">*</span></label>
                <input
                  type="text"
                  placeholder="Contoh: Installed, Pending Technical..."
                  value={newStatusName}
                  onChange={e => setNewStatusName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#35105E]/40 border border-[#D8B4FE]/30 rounded-xl text-white placeholder-[#D8B4FE]/40 focus:border-[#A855F7] focus:outline-none"
                />
              </div>
              <div>
                <label className="font-semibold block text-[#E9D5FF] mb-1">Kode Status (Identifier)</label>
                <input
                  type="text"
                  placeholder="Contoh: INSTALLED, PENDING_TECH..."
                  value={newStatusCode}
                  onChange={e => setNewStatusCode(e.target.value)}
                  className="w-full px-3 py-2 bg-[#35105E]/40 border border-[#D8B4FE]/30 rounded-xl text-white placeholder-[#D8B4FE]/40 focus:border-[#A855F7] focus:outline-none font-mono uppercase"
                />
              </div>
              <div>
                <label className="font-semibold block text-[#E9D5FF] mb-1">Warna Label</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={newStatusColor}
                    onChange={e => setNewStatusColor(e.target.value)}
                    className="w-8 h-8 rounded border border-[#D8B4FE]/30 cursor-pointer"
                  />
                  <span className="font-mono text-xs text-white">{newStatusColor}</span>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[#D8B4FE]/15">
              <button
                type="button"
                onClick={() => setIsAddStatusOpen(false)}
                className="px-4 py-2 rounded-xl text-xs text-[#D8B4FE] hover:bg-[#35105E]/40"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!newStatusName.trim()) {
                    toast.error('Nama status tidak boleh kosong');
                    return;
                  }
                  addHierarchicalStatus({
                    name: newStatusName.trim(),
                    code: newStatusCode.trim() || newStatusName.trim().toUpperCase().replace(/\s+/g, '_'),
                    color: newStatusColor,
                    order: hierarchicalStatuses.length + 1,
                    active: true,
                    isActive: true
                  });
                  setIsAddStatusOpen(false);
                }}
                className="px-5 py-2 bg-[#7135B5] hover:bg-[#8542D1] text-white rounded-xl text-xs font-bold border border-[#E9D5FF]/30"
              >
                Simpan Status
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: ADD LEVEL 2 REASON WO                                 */}
      {/* ============================================================ */}
      {targetStatusIdForReason && (
        <div className="fixed inset-0 z-70 bg-[#160D29]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#160D29] border border-[#D8B4FE]/50 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 relative overflow-hidden animate-in zoom-in-95">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#D8B4FE] to-transparent" />
            <h4 className="font-black text-sm text-white">
              Tambah Reason WO Baru (Level 2)
            </h4>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block text-[#E9D5FF] mb-1">Nama Reason / Alasan <span className="text-rose-400">*</span></label>
                <input
                  type="text"
                  placeholder="Contoh: Redaman OPM Normal (-18dBm)..."
                  value={newReasonName}
                  onChange={e => setNewReasonName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#35105E]/40 border border-[#D8B4FE]/30 rounded-xl text-white placeholder-[#D8B4FE]/40 focus:border-[#A855F7] focus:outline-none"
                />
              </div>
              <div>
                <label className="font-semibold block text-[#E9D5FF] mb-1">Kode Reason (Opsional)</label>
                <input
                  type="text"
                  placeholder="Contoh: RSN_COMP_NORMAL..."
                  value={newReasonCode}
                  onChange={e => setNewReasonCode(e.target.value)}
                  className="w-full px-3 py-2 bg-[#35105E]/40 border border-[#D8B4FE]/30 rounded-xl text-white placeholder-[#D8B4FE]/40 focus:border-[#A855F7] focus:outline-none font-mono uppercase"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[#D8B4FE]/15">
              <button
                type="button"
                onClick={() => setTargetStatusIdForReason(null)}
                className="px-4 py-2 rounded-xl text-xs text-[#D8B4FE] hover:bg-[#35105E]/40"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!newReasonName.trim()) {
                    toast.error('Nama reason tidak boleh kosong');
                    return;
                  }
                  const parentStatus = hierarchicalStatuses.find(s => s.id === targetStatusIdForReason);
                  const reasonCount = parentStatus?.reasons?.length || 0;
                  addHierarchicalReason(targetStatusIdForReason, {
                    name: newReasonName.trim(),
                    code: newReasonCode.trim() || newReasonName.trim().toUpperCase().replace(/\s+/g, '_'),
                    order: reasonCount + 1,
                    active: true,
                    isActive: true
                  });
                  setTargetStatusIdForReason(null);
                }}
                className="px-5 py-2 bg-[#7135B5] hover:bg-[#8542D1] text-white rounded-xl text-xs font-bold border border-[#E9D5FF]/30"
              >
                Simpan Reason
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: ADD LEVEL 3 REMARK                                    */}
      {/* ============================================================ */}
      {targetReasonIdForRemark && (
        <div className="fixed inset-0 z-70 bg-[#160D29]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#160D29] border border-[#D8B4FE]/50 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 relative overflow-hidden animate-in zoom-in-95">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#D8B4FE] to-transparent" />
            <h4 className="font-black text-sm text-white">
              Tambah Remarks / Rootcause Baru (Level 3)
            </h4>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block text-[#E9D5FF] mb-1">Teks Catatan / Rootcause <span className="text-rose-400">*</span></label>
                <textarea
                  rows={3}
                  placeholder="Contoh: Instalasi selesai sesuai standar SOP MoraJaws. Redaman terukur -18.2 dBm..."
                  value={newRemarkText}
                  onChange={e => setNewRemarkText(e.target.value)}
                  className="w-full px-3 py-2 bg-[#35105E]/40 border border-[#D8B4FE]/30 rounded-xl text-white placeholder-[#D8B4FE]/40 focus:border-[#A855F7] focus:outline-none text-xs"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[#D8B4FE]/15">
              <button
                type="button"
                onClick={() => setTargetReasonIdForRemark(null)}
                className="px-4 py-2 rounded-xl text-xs text-[#D8B4FE] hover:bg-[#35105E]/40"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!newRemarkText.trim()) {
                    toast.error('Teks remark tidak boleh kosong');
                    return;
                  }
                  const pStatus = hierarchicalStatuses.find(s => s.id === targetReasonIdForRemark.statusId);
                  const pReason = pStatus?.reasons?.find(r => r.id === targetReasonIdForRemark.reasonId);
                  const remCount = pReason?.remarks?.length || 0;
                  addHierarchicalRemark(
                    targetReasonIdForRemark.statusId,
                    targetReasonIdForRemark.reasonId,
                    {
                      name: newRemarkText.trim(),
                      text: newRemarkText.trim(),
                      order: remCount + 1,
                      active: true,
                      isActive: true
                    }
                  );
                  setTargetReasonIdForRemark(null);
                }}
                className="px-5 py-2 bg-[#7135B5] hover:bg-[#8542D1] text-white rounded-xl text-xs font-bold border border-[#E9D5FF]/30"
              >
                Simpan Remark
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: MOVE REASON TO ANOTHER STATUS WO                      */}
      {/* ============================================================ */}
      {movingReason && (
        <div className="fixed inset-0 z-70 bg-[#160D29]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#160D29] border border-[#D8B4FE]/50 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 relative overflow-hidden animate-in zoom-in-95">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#D8B4FE] to-transparent" />
            <h4 className="font-black text-sm text-white flex items-center gap-2">
              <MoveRight className="w-4 h-4 text-amber-400" />
              <span>Pindahkan Reason ke Status Lain</span>
            </h4>
            <p className="text-xs text-[#D8B4FE]/80">
              Pindahkan reason <strong className="text-white">"{movingReason.reason.name}"</strong> beserta seluruh ({movingReason.reason.remarks?.length || 0}) remarks-nya ke Status WO tujuan.
            </p>
            <div className="space-y-2 text-xs">
              <label className="font-semibold block text-[#E9D5FF]">Pilih Status Tujuan (Level 1):</label>
              <select
                value={targetMoveStatusId}
                onChange={e => setTargetMoveStatusId(e.target.value)}
                className="w-full px-3 py-2 bg-[#35105E]/40 border border-[#D8B4FE]/30 rounded-xl text-white focus:border-[#A855F7] focus:outline-none"
              >
                {hierarchicalStatuses.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code || s.name}) {s.id === movingReason.fromStatusId ? '(Status Saat Ini)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[#D8B4FE]/15">
              <button
                type="button"
                onClick={() => setMovingReason(null)}
                className="px-4 py-2 rounded-xl text-xs text-[#D8B4FE] hover:bg-[#35105E]/40"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (targetMoveStatusId === movingReason.fromStatusId) {
                    toast.info('Status tujuan sama dengan status saat ini.');
                    setMovingReason(null);
                    return;
                  }
                  moveHierarchicalReason(movingReason.fromStatusId, targetMoveStatusId, movingReason.reason.id);
                  setMovingReason(null);
                }}
                className="px-5 py-2 bg-[#7135B5] hover:bg-[#8542D1] text-white rounded-xl text-xs font-bold border border-[#E9D5FF]/30"
              >
                Pindahkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: EDIT ITEM (STATUS, REASON, OR REMARK)                 */}
      {/* ============================================================ */}
      {editingItem && (
        <div className="fixed inset-0 z-70 bg-[#160D29]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#160D29] border border-[#D8B4FE]/50 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 relative overflow-hidden animate-in zoom-in-95">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#D8B4FE] to-transparent" />
            <h4 className="font-black text-sm text-white">
              Edit {editingItem.type === 'status' ? 'Status WO (Level 1)' : editingItem.type === 'reason' ? 'Reason WO (Level 2)' : 'Remark (Level 3)'}
            </h4>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block text-[#E9D5FF] mb-1">Nama / Teks <span className="text-rose-400">*</span></label>
                <input
                  type="text"
                  value={editingItem.name}
                  onChange={e => setEditingItem({ ...editingItem, name: e.target.value })}
                  className="w-full px-3 py-2 bg-[#35105E]/40 border border-[#D8B4FE]/30 rounded-xl text-white focus:border-[#A855F7] focus:outline-none"
                />
              </div>

              {editingItem.type !== 'remark' && (
                <div>
                  <label className="font-semibold block text-[#E9D5FF] mb-1">Kode Identifier</label>
                  <input
                    type="text"
                    value={editingItem.code || ''}
                    onChange={e => setEditingItem({ ...editingItem, code: e.target.value })}
                    className="w-full px-3 py-2 bg-[#35105E]/40 border border-[#D8B4FE]/30 rounded-xl text-white focus:border-[#A855F7] focus:outline-none font-mono uppercase"
                  />
                </div>
              )}

              {editingItem.type === 'status' && (
                <div>
                  <label className="font-semibold block text-[#E9D5FF] mb-1">Warna Label</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={editingItem.color || '#7135B5'}
                      onChange={e => setEditingItem({ ...editingItem, color: e.target.value })}
                      className="w-8 h-8 rounded border border-[#D8B4FE]/30 cursor-pointer"
                    />
                    <span className="font-mono text-xs text-white">{editingItem.color || '#7135B5'}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[#D8B4FE]/15">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 rounded-xl text-xs text-[#D8B4FE] hover:bg-[#35105E]/40"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!editingItem.name.trim()) {
                    toast.error('Nama tidak boleh kosong');
                    return;
                  }
                  if (editingItem.type === 'status') {
                    updateHierarchicalStatus(editingItem.id, {
                      name: editingItem.name.trim(),
                      code: editingItem.code?.trim() || editingItem.name.trim().toUpperCase().replace(/\s+/g, '_'),
                      color: editingItem.color
                    });
                  } else if (editingItem.type === 'reason' && editingItem.parentStatusId) {
                    updateHierarchicalReason(editingItem.parentStatusId, editingItem.id, {
                      name: editingItem.name.trim(),
                      code: editingItem.code?.trim() || editingItem.name.trim().toUpperCase().replace(/\s+/g, '_')
                    });
                  } else if (editingItem.type === 'remark' && editingItem.parentStatusId && editingItem.parentReasonId) {
                    updateHierarchicalRemark(editingItem.parentStatusId, editingItem.parentReasonId, editingItem.id, {
                      name: editingItem.name.trim(),
                      text: editingItem.name.trim()
                    });
                  }
                  setEditingItem(null);
                }}
                className="px-5 py-2 bg-[#7135B5] hover:bg-[#8542D1] text-white rounded-xl text-xs font-bold border border-[#E9D5FF]/30"
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
