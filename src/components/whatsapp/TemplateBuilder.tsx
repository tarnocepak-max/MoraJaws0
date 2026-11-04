import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { WhatsAppTemplate } from '../../types';
import { renderWhatsAppMessage } from '../../services/whatsappService';
import { useOfflineSync } from '../../context/OfflineSyncContext';
import { useMoraJawsSound } from '../../context/SoundContext';
import {
  MessageSquare,
  Plus,
  Copy,
  Trash2,
  Check,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ExternalLink,
  Save,
  CheckCircle2,
  AlertCircle,
  WifiOff,
  Clock,
  RefreshCw,
  Edit2
} from 'lucide-react';

type AutoSaveStatus = 'IDLE' | 'EDITING' | 'SAVING' | 'SAVED' | 'ERROR' | 'OFFLINE';

export const TemplateBuilder: React.FC = () => {
  const {
    templates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    tickets,
    currentUser,
    firestoreStatus
  } = useApp();
  const { isOnline } = useOfflineSync();
  const { playReportSavedSound, playErrorSound } = useMoraJawsSound();

  const [activeTemplateId, setActiveTemplateId] = useState<string>(templates[0]?.id || '');
  const [selectedTicketId, setSelectedTicketId] = useState<string>(tickets[0]?.id || '');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Requirement 5: Access Control Guard - Superadmin & Dispatch Only
  const isAuthorized = currentUser.role === 'super_admin' || currentUser.role === 'dispatch';
  if (!isAuthorized) {
    return (
      <div className="p-8 text-center bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-rose-300 dark:border-rose-900 shadow-md max-w-lg mx-auto my-12 space-y-3">
        <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto font-bold text-lg">
          ✕
        </div>
        <h3 className="font-bold text-slate-900 dark:text-white text-base">
          Akses Ditolak: Khusus Superadmin & Dispatch
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Sesuai aturan keamanan Role Access Control MoraJaws, modul Template WhatsApp hanya dapat dikelola oleh Superadmin dan Dispatch. Role Anda (<strong>{currentUser.role}</strong>) tidak memiliki izin.
        </p>
      </div>
    );
  }

  // New template form modal state
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newTemplateData, setNewTemplateData] = useState({
    name: '',
    category: 'Konfirmasi Jadwal Kunjungan',
    description: '',
    messageBody: 'Halo Bapak/Ibu {{customer_name}},\n\nWork Order Anda {{wo_number}} dijadwalkan pada {{slot_time}}.\n\nTerima kasih.'
  });

  const activeTemplate = templates.find(t => t.id === activeTemplateId) || templates[0];
  const sampleTicket = tickets.find(t => t.id === selectedTicketId) || tickets[0];

  // Auto-Save local draft state
  const [draftName, setDraftName] = useState(activeTemplate?.name || '');
  const [draftCategory, setDraftCategory] = useState(activeTemplate?.category || 'Konfirmasi Jadwal Kunjungan');
  const [draftDescription, setDraftDescription] = useState(activeTemplate?.description || '');
  const [draftBody, setDraftBody] = useState(activeTemplate?.messageBody || '');

  const [saveStatus, setSaveStatus] = useState<AutoSaveStatus>('SAVED');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(new Date());
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);

  // Sync draft whenever activeTemplateId changes
  useEffect(() => {
    if (activeTemplate) {
      setDraftName(activeTemplate.name);
      setDraftCategory(activeTemplate.category);
      setDraftDescription(activeTemplate.description || '');
      setDraftBody(activeTemplate.messageBody);
      setSaveStatus('SAVED');
      setLastSavedAt(new Date());
      isInitialLoadRef.current = true;
    }
  }, [activeTemplate?.id]);

  const availableVariables = [
    { key: 'customer_name', desc: 'Nama Pelanggan' },
    { key: 'customer_id', desc: 'Nomor ID Pelanggan' },
    { key: 'customer_phone', desc: 'Nomor HP Pelanggan' },
    { key: 'wo_number', desc: 'Nomor Work Order' },
    { key: 'slot_time', desc: 'Jadwal / Jam Kunjungan' },
    { key: 'street_name', desc: 'Alamat Pelanggan' },
    { key: 'street_alternatif', desc: 'Patokan / Alamat Cadangan' },
    { key: 'cluster_name', desc: 'Nama Cluster' },
    { key: 'area', desc: 'Area / Regional' },
    { key: 'installer_name', desc: 'Nama Teknisi' },
    { key: 'installer_phone', desc: 'Nomor WA Teknisi' },
    { key: 'leader_name', desc: 'Nama Leader / Korlap' },
    { key: 'contractor_name', desc: 'Nama Kontraktor' },
    { key: 'ticket_category', desc: 'Kategori Tiket' },
    { key: 'date', desc: 'Tanggal WO' },
    { key: 'appointment_date', desc: 'Tanggal Janji Temu' },
    { key: 'fdt_code', desc: 'Kode FDT' },
    { key: 'fat_code', desc: 'Kode FAT' }
  ];

  // Debounced Auto-Save trigger (1000ms delay: between 800ms - 1200ms)
  const triggerDebouncedAutoSave = useCallback(
    (updatedFields: { name?: string; category?: string; description?: string; messageBody?: string }) => {
      if (!activeTemplate) return;

      if (!isOnline) {
        setSaveStatus('OFFLINE');
      } else {
        setSaveStatus('EDITING');
      }

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(async () => {
        if (!isOnline) {
          setSaveStatus('OFFLINE');
          // Still write to local store
          updateTemplate(activeTemplate.id, {
            ...updatedFields,
            updatedBy: currentUser.name
          });
          return;
        }

        setSaveStatus('SAVING');
        try {
          updateTemplate(activeTemplate.id, {
            ...updatedFields,
            updatedBy: currentUser.name
          });
          setSaveStatus('SAVED');
          setLastSavedAt(new Date());
        } catch (err) {
          console.error('[WhatsApp Auto-Save] Error:', err);
          setSaveStatus('ERROR');
          playErrorSound();
        }
      }, 1000);
    },
    [activeTemplate, isOnline, currentUser.name, updateTemplate, playErrorSound]
  );

  const handleBodyChange = (value: string) => {
    setDraftBody(value);
    triggerDebouncedAutoSave({ messageBody: value });
  };

  const handleNameChange = (value: string) => {
    setDraftName(value);
    triggerDebouncedAutoSave({ name: value });
  };

  const handleCategoryChange = (value: string) => {
    setDraftCategory(value);
    triggerDebouncedAutoSave({ category: value });
  };

  const handleDescriptionChange = (value: string) => {
    setDraftDescription(value);
    triggerDebouncedAutoSave({ description: value });
  };

  const handleInsertVariable = (varKey: string) => {
    if (!activeTemplate) return;
    const placeholder = `{{${varKey}}}`;
    const newBody = draftBody + ' ' + placeholder;
    setDraftBody(newBody);
    triggerDebouncedAutoSave({ messageBody: newBody });
  };

  const handleInsertVariableNew = (varKey: string) => {
    const placeholder = `{{${varKey}}}`;
    setNewTemplateData(prev => ({
      ...prev,
      messageBody: prev.messageBody + ' ' + placeholder
    }));
  };

  const handleDuplicateTemplate = (tpl: WhatsAppTemplate) => {
    const duplicated = createTemplate({
      name: `${tpl.name} (Copy)`,
      description: tpl.description,
      category: tpl.category,
      messageBody: tpl.messageBody,
      availableVariables: tpl.availableVariables,
      isDefault: false,
      active: true,
      editableByRole: tpl.editableByRole,
      createdBy: currentUser.name,
      updatedBy: currentUser.name
    });
    playReportSavedSound();
    setActiveTemplateId(duplicated.id);
    setStatusMsg('Template berhasil diduplikat.');
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handleSaveNewTemplate = () => {
    if (!newTemplateData.name.trim()) {
      alert('Nama template wajib diisi.');
      return;
    }
    const created = createTemplate({
      name: newTemplateData.name,
      description: newTemplateData.description || 'Custom template',
      category: newTemplateData.category,
      messageBody: newTemplateData.messageBody,
      availableVariables: availableVariables.map(v => v.key),
      isDefault: false,
      active: true,
      editableByRole: ['super_admin', 'dispatch'],
      createdBy: currentUser.name,
      updatedBy: currentUser.name
    });
    playReportSavedSound();
    setIsCreatingNew(false);
    setActiveTemplateId(created.id);
    setStatusMsg('Template baru berhasil dibuat dan disimpan ke Cloud Firestore.');
    setTimeout(() => setStatusMsg(null), 3000);
  };

  // Preview Result
  const previewResult = activeTemplate && sampleTicket
    ? renderWhatsAppMessage(draftBody || activeTemplate.messageBody, sampleTicket)
    : { renderedText: '', missingVariables: [] };

  // Status Badge Component
  const renderAutoSaveBadge = () => {
    switch (saveStatus) {
      case 'EDITING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-400/30 animate-pulse">
            <Edit2 className="w-3 h-3" />
            <span>EDITING...</span>
          </span>
        );
      case 'SAVING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-300 border border-blue-400/30">
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span>SAVING KE FIRESTORE...</span>
          </span>
        );
      case 'SAVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-400/30">
            <CheckCircle2 className="w-3 h-3" />
            <span>SAVED (Firestore Sync)</span>
          </span>
        );
      case 'OFFLINE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-500/20 text-slate-300 border border-slate-400/30">
            <WifiOff className="w-3 h-3 text-amber-400" />
            <span>OFFLINE (Saved Locally)</span>
          </span>
        );
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-400/30">
            <AlertCircle className="w-3 h-3" />
            <span>ERROR SAVING</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar: Selector & Template Actions with Dark Purple & Lilac Styling */}
      <div className="bg-[#160D29] rounded-2xl border border-[#D8B4FE]/30 p-5 shadow-[0_4px_24px_rgba(22,13,41,0.6)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#D8B4FE]/50 to-transparent" />
        
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7135B5] to-[#35105E] border border-[#D8B4FE]/50 text-white flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(113,53,181,0.4)]">
            <MessageSquare className="w-5 h-5 text-[#E9D5FF]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight">
                WhatsApp Template Builder & Real-time Auto-Save
              </h3>
              {renderAutoSaveBadge()}
            </div>
            <p className="text-xs text-[#D8B4FE]/80 mt-0.5">
              Kelola template pesan konfirmasi pelanggan. Perubahan otomatis tersimpan ke Firestore dengan debounce 1000ms.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsCreatingNew(true)}
            className="px-3.5 py-2 text-xs font-bold text-white bg-gradient-to-r from-[#7135B5] to-[#A855F7] hover:from-[#7E3CC7] hover:to-[#B666FE] rounded-xl flex items-center gap-1.5 shadow-[0_0_15px_rgba(168,85,247,0.4)] border border-[#E9D5FF]/30 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create New Template</span>
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 rounded-xl text-xs flex items-center gap-2 animate-in fade-in">
          <Check className="w-4 h-4 shrink-0 text-emerald-400" />
          <span className="font-medium">{statusMsg}</span>
        </div>
      )}

      {/* New Template Form Modal / Collapse */}
      {isCreatingNew && (
        <div className="bg-[#160D29] rounded-2xl border border-[#D8B4FE]/50 p-6 shadow-xl space-y-4 animate-in zoom-in-95">
          <div className="flex items-center justify-between pb-3 border-b border-[#D8B4FE]/20">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#D8B4FE]" />
              <h4 className="font-extrabold text-white text-sm">Buat Template Baru (Auto-Save ke Firestore)</h4>
            </div>
            <button
              onClick={() => setIsCreatingNew(false)}
              className="text-xs text-[#D8B4FE]/70 hover:text-white transition-colors cursor-pointer"
            >
              Batal
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-[#E9D5FF] mb-1">Nama Template *</label>
              <input
                type="text"
                placeholder="misal: Konfirmasi Kunjungan Hari H"
                value={newTemplateData.name}
                onChange={e => setNewTemplateData({ ...newTemplateData, name: e.target.value })}
                className="w-full px-3.5 py-2 bg-[#35105E]/40 border border-[#D8B4FE]/30 rounded-xl text-white placeholder-[#D8B4FE]/40 focus:border-[#A855F7] focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#E9D5FF] mb-1">Kategori</label>
              <select
                value={newTemplateData.category}
                onChange={e => setNewTemplateData({ ...newTemplateData, category: e.target.value })}
                className="w-full px-3.5 py-2 bg-[#35105E] border border-[#D8B4FE]/30 rounded-xl text-white focus:border-[#A855F7] focus:outline-none"
              >
                <option value="Konfirmasi Jadwal Kunjungan">Konfirmasi Jadwal Kunjungan</option>
                <option value="Teknisi Menuju Lokasi">Teknisi Menuju Lokasi</option>
                <option value="Perubahan Jadwal">Perubahan Jadwal</option>
                <option value="Pengingat Kunjungan">Pengingat Kunjungan</option>
                <option value="Konfirmasi Penyelesaian">Konfirmasi Penyelesaian</option>
              </select>
            </div>
            <div className="col-span-full">
              <label className="block font-semibold text-[#E9D5FF] mb-1">Deskripsi</label>
              <input
                type="text"
                placeholder="Penjelasan kapan template ini digunakan"
                value={newTemplateData.description}
                onChange={e => setNewTemplateData({ ...newTemplateData, description: e.target.value })}
                className="w-full px-3.5 py-2 bg-[#35105E]/40 border border-[#D8B4FE]/30 rounded-xl text-white placeholder-[#D8B4FE]/40 focus:border-[#A855F7] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block font-semibold text-[#E9D5FF] text-xs">
                Isi Template Pesan (Placeholder Dinamis)
              </label>
              <span className="text-[11px] text-[#D8B4FE]/70">Klik variabel di bawah untuk menyisipkan</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {availableVariables.map(v => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => handleInsertVariableNew(v.key)}
                  className="px-2 py-0.5 text-[11px] font-mono bg-[#35105E]/60 hover:bg-[#7135B5] text-[#E9D5FF] rounded-lg border border-[#D8B4FE]/30 transition-colors cursor-pointer"
                >
                  +{`{{${v.key}}}`}
                </button>
              ))}
            </div>
            <textarea
              rows={6}
              value={newTemplateData.messageBody}
              onChange={e => setNewTemplateData({ ...newTemplateData, messageBody: e.target.value })}
              className="w-full p-3 font-mono text-xs bg-[#160D29] border border-[#D8B4FE]/30 rounded-xl text-[#E9D5FF] focus:border-[#A855F7] focus:outline-none leading-relaxed"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              onClick={() => setIsCreatingNew(false)}
              className="px-4 py-2 text-xs font-semibold text-[#D8B4FE] hover:bg-[#35105E]/60 rounded-xl transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              onClick={handleSaveNewTemplate}
              className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-[#7135B5] to-[#A855F7] hover:from-[#7E3CC7] hover:to-[#B666FE] rounded-xl shadow-md border border-[#E9D5FF]/30 cursor-pointer"
            >
              Simpan Template ke Firestore
            </button>
          </div>
        </div>
      )}

      {/* Two-Panel Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (6 cols): Template List & Active Editor */}
        <div className="lg:col-span-6 space-y-4">
          {/* Template Select Tabs */}
          <div className="bg-[#160D29] rounded-2xl border border-[#D8B4FE]/25 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2.5">
              <label className="block text-[11px] font-bold text-[#D8B4FE] uppercase tracking-wider">
                Daftar Template Aktif ({templates.length})
              </label>
              <span className="text-[10px] text-[#D8B4FE]/60">Auto-save aktif pada setiap perubahan</span>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {templates.map(tpl => {
                const isSelected = tpl.id === activeTemplate?.id;
                return (
                  <div
                    key={tpl.id}
                    onClick={() => setActiveTemplateId(tpl.id)}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-[#35105E]/80 border-[#A855F7] text-white shadow-[0_0_15px_rgba(168,85,247,0.3)]'
                        : 'bg-[#1E1138]/60 border-[#D8B4FE]/15 text-[#D8B4FE]/80 hover:bg-[#35105E]/40 hover:text-white'
                    }`}
                  >
                    <div>
                      <div className="font-bold flex items-center gap-1.5">
                        <span>{tpl.name}</span>
                        {tpl.isDefault && (
                          <span className="text-[9.5px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 rounded-full font-bold">
                            Default
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#D8B4FE]/60 mt-0.5">
                        {tpl.category} · v{tpl.version}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleDuplicateTemplate(tpl);
                        }}
                        className="p-1.5 text-[#D8B4FE]/60 hover:text-white rounded-lg hover:bg-[#7135B5]/40 transition-colors cursor-pointer"
                        title="Duplikat Template"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {templates.length > 1 && !tpl.isDefault && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            if (confirm(`Hapus template "${tpl.name}"?`)) {
                              deleteTemplate(tpl.id);
                              playReportSavedSound();
                            }
                          }}
                          className="p-1.5 text-rose-400 hover:text-rose-300 rounded-lg hover:bg-rose-950/40 transition-colors cursor-pointer"
                          title="Hapus Template"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Template Editor */}
          {activeTemplate && (
            <div className="bg-[#160D29] rounded-2xl border border-[#D8B4FE]/30 p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#D8B4FE]/20 gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-extrabold text-white text-sm">
                      Editor Template
                    </h4>
                    {renderAutoSaveBadge()}
                  </div>
                  <p className="text-[11px] text-[#D8B4FE]/70 mt-0.5">
                    {lastSavedAt ? `Terakhir disimpan: ${lastSavedAt.toLocaleTimeString('id-ID')}` : 'Siap disimpan'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-[#E9D5FF] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activeTemplate.isDefault}
                      onChange={e => {
                        templates.forEach(t => {
                          updateTemplate(t.id, { isDefault: t.id === activeTemplate.id ? e.target.checked : false });
                        });
                      }}
                      className="rounded border-[#D8B4FE]/40 text-[#A855F7] focus:ring-[#A855F7]"
                    />
                    <span>Set as Default</span>
                  </label>
                </div>
              </div>

              {/* Editable Name & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#D8B4FE] mb-1">Nama Template</label>
                  <input
                    type="text"
                    value={draftName}
                    onChange={e => handleNameChange(e.target.value)}
                    className="w-full px-3 py-1.5 bg-[#35105E]/40 border border-[#D8B4FE]/30 rounded-xl text-white text-xs focus:border-[#A855F7] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#D8B4FE] mb-1">Kategori</label>
                  <select
                    value={draftCategory}
                    onChange={e => handleCategoryChange(e.target.value)}
                    className="w-full px-3 py-1.5 bg-[#35105E] border border-[#D8B4FE]/30 rounded-xl text-white text-xs focus:border-[#A855F7] focus:outline-none"
                  >
                    <option value="Konfirmasi Jadwal Kunjungan">Konfirmasi Jadwal Kunjungan</option>
                    <option value="Teknisi Menuju Lokasi">Teknisi Menuju Lokasi</option>
                    <option value="Perubahan Jadwal">Perubahan Jadwal</option>
                    <option value="Pengingat Kunjungan">Pengingat Kunjungan</option>
                    <option value="Konfirmasi Penyelesaian">Konfirmasi Penyelesaian</option>
                  </select>
                </div>
              </div>

              {/* Clickable Placeholders */}
              <div>
                <span className="text-[11px] font-bold text-[#D8B4FE] block mb-1.5">
                  Klik untuk Sisipkan Placeholder:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {availableVariables.map(v => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => handleInsertVariable(v.key)}
                      className="px-2 py-0.5 text-[10.5px] font-mono bg-[#35105E]/70 hover:bg-[#7135B5] text-[#E9D5FF] rounded-lg border border-[#D8B4FE]/30 transition-colors cursor-pointer"
                      title={v.desc}
                    >
                      +{`{{${v.key}}}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Textarea Body */}
              <div>
                <textarea
                  rows={9}
                  value={draftBody}
                  onChange={e => handleBodyChange(e.target.value)}
                  className="w-full p-3 font-mono text-xs bg-[#1E1138] border border-[#D8B4FE]/30 rounded-xl text-[#E9D5FF] leading-relaxed focus:border-[#A855F7] focus:outline-none"
                  placeholder="Ketik teks pesan template WhatsApp..."
                />
              </div>

              {/* Footer Indicator */}
              <div className="flex items-center justify-between text-[11px] text-[#D8B4FE]/70 pt-2 border-t border-[#D8B4FE]/15">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-[#D8B4FE]" />
                  <span>Auto-save debounce 1.000 ms</span>
                </span>
                <span className="font-semibold text-[#E9D5FF]">
                  {draftBody.length} karakter
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right Column (6 cols): Live Preview Panel */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-[#160D29] rounded-2xl border border-[#D8B4FE]/30 p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#D8B4FE]/20">
              <div>
                <h4 className="font-extrabold text-white text-sm">
                  Live Preview WhatsApp Chat
                </h4>
                <p className="text-[11px] text-[#D8B4FE]/70">
                  Simulasi tampilan pesan pada layar pelanggan seketika
                </p>
              </div>

              {/* Sample Ticket Switcher */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-[#D8B4FE]/70 text-[11px]">Uji Tiket:</span>
                <select
                  value={selectedTicketId}
                  onChange={e => setSelectedTicketId(e.target.value)}
                  className="px-2.5 py-1 text-xs bg-[#35105E] border border-[#D8B4FE]/30 text-white rounded-xl focus:outline-none"
                >
                  {tickets.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.woNumber} - {t.customerName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Warnings if any missing variables */}
            {previewResult.missingVariables.length > 0 && (
              <div className="p-3 bg-amber-950/50 border border-amber-500/40 rounded-xl text-amber-200 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <div>
                  <p className="font-bold">Placeholder Kosong pada Tiket Contoh Ini:</p>
                  <p className="text-[11px] mt-0.5 font-mono text-amber-300">
                    {previewResult.missingVariables.map(v => `{{${v}}}`).join(', ')}
                  </p>
                </div>
              </div>
            )}

            {/* Simulated WhatsApp Chat Bubble */}
            <div className="bg-[#efeae2] dark:bg-[#0c1317] p-4 sm:p-5 rounded-2xl border border-slate-300 dark:border-slate-800 min-h-[360px] flex flex-col justify-end relative shadow-inner">
              <div className="max-w-[88%] self-end bg-white dark:bg-[#005c4b] text-slate-800 dark:text-slate-100 p-3.5 rounded-2xl rounded-tr-none shadow-md text-xs leading-relaxed font-sans whitespace-pre-wrap select-text border border-emerald-900/10">
                {previewResult.renderedText || (
                  <span className="text-slate-400 italic">Pesan kosong. Ketik isi template di panel kiri.</span>
                )}
                <div className="text-[10px] text-slate-400 dark:text-emerald-200/80 text-right mt-2 flex items-center justify-end gap-1">
                  <span>10:30 WIB</span>
                  <Check className="w-3 h-3 text-sky-500 dark:text-sky-300" />
                </div>
              </div>
            </div>

            <div className="text-[11px] text-[#D8B4FE]/70 text-center">
              Pesan diformat dan dikirimkan langsung ke nomor WhatsApp pelanggan saat tombol WhatsApp ditekan.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
