import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { WhatsAppTemplate } from '../../types';
import { renderWhatsAppMessage } from '../../services/whatsappService';
import {
  MessageSquare,
  Plus,
  Copy,
  Trash2,
  Check,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ExternalLink
} from 'lucide-react';

export const TemplateBuilder: React.FC = () => {
  const { templates, createTemplate, updateTemplate, deleteTemplate, tickets, currentUser } = useApp();

  const [activeTemplateId, setActiveTemplateId] = useState<string>(templates[0]?.id || '');
  const [selectedTicketId, setSelectedTicketId] = useState<string>(tickets[0]?.id || '');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // New template form state
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newTemplateData, setNewTemplateData] = useState({
    name: '',
    category: 'Konfirmasi Jadwal Kunjungan',
    description: '',
    messageBody: 'Halo Bapak/Ibu {{customer_name}},\n\nWork Order Anda {{wo_number}} dijadwalkan pada {{slot_time}}.\n\nTerima kasih.'
  });

  const activeTemplate = templates.find(t => t.id === activeTemplateId) || templates[0];
  const sampleTicket = tickets.find(t => t.id === selectedTicketId) || tickets[0];

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

  const previewResult = activeTemplate && sampleTicket
    ? renderWhatsAppMessage(activeTemplate.messageBody, sampleTicket)
    : { renderedText: '', missingVariables: [] };

  const handleInsertVariable = (varKey: string) => {
    if (!activeTemplate) return;
    const placeholder = `{{${varKey}}}`;
    const updatedBody = activeTemplate.messageBody + ' ' + placeholder;
    updateTemplate(activeTemplate.id, { messageBody: updatedBody });
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
    setIsCreatingNew(false);
    setActiveTemplateId(created.id);
    setStatusMsg('Template baru berhasil dibuat.');
    setTimeout(() => setStatusMsg(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Top Bar: Selector & Template Actions */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              WhatsApp Template Builder & Simulator
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Desain template pesan konfirmasi pelanggan dengan placeholder dinamis dan preview seketika.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCreatingNew(true)}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create New Template</span>
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded text-xs flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* New Template Form Modal / Collapse */}
      {isCreatingNew && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-indigo-200 dark:border-indigo-900 p-6 shadow-md space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm">Buat Template Baru</h4>
            <button onClick={() => setIsCreatingNew(false)} className="text-xs text-slate-400 hover:text-slate-600">
              Batal
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Nama Template</label>
              <input
                type="text"
                placeholder="misal: Konfirmasi Kunjungan Weekend"
                value={newTemplateData.name}
                onChange={e => setNewTemplateData({ ...newTemplateData, name: e.target.value })}
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Kategori</label>
              <select
                value={newTemplateData.category}
                onChange={e => setNewTemplateData({ ...newTemplateData, category: e.target.value })}
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded"
              >
                <option value="Konfirmasi Jadwal Kunjungan">Konfirmasi Jadwal Kunjungan</option>
                <option value="Teknisi Menuju Lokasi">Teknisi Menuju Lokasi</option>
                <option value="Perubahan Jadwal">Perubahan Jadwal</option>
                <option value="Pengingat Kunjungan">Pengingat Kunjungan</option>
                <option value="Konfirmasi Penyelesaian">Konfirmasi Penyelesaian</option>
              </select>
            </div>
            <div className="col-span-full">
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Deskripsi</label>
              <input
                type="text"
                placeholder="Penjelasan kapan template ini digunakan"
                value={newTemplateData.description}
                onChange={e => setNewTemplateData({ ...newTemplateData, description: e.target.value })}
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block font-medium text-slate-700 dark:text-slate-300 text-xs">
                Isi Template Pesan (Placeholder Dinamis)
              </label>
              <span className="text-[11px] text-slate-400">Klik variabel di bawah untuk menyisipkan</span>
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              {availableVariables.map(v => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => handleInsertVariableNew(v.key)}
                  className="px-2 py-0.5 text-[11px] font-mono bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 rounded border border-slate-200 transition-colors"
                >
                  +{`{{${v.key}}}`}
                </button>
              ))}
            </div>
            <textarea
              rows={6}
              value={newTemplateData.messageBody}
              onChange={e => setNewTemplateData({ ...newTemplateData, messageBody: e.target.value })}
              className="w-full p-3 font-mono text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-200"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setIsCreatingNew(false)}
              className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded"
            >
              Batal
            </button>
            <button
              onClick={handleSaveNewTemplate}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded shadow-sm"
            >
              Simpan Template
            </button>
          </div>
        </div>
      )}

      {/* Two-Panel Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (5 cols): Template List & Active Editor */}
        <div className="lg:col-span-6 space-y-4">
          {/* Template Select Tabs */}
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-3 shadow-2xs">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Daftar Template Aktif
            </label>
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {templates.map(tpl => {
                const isSelected = tpl.id === activeTemplate?.id;
                return (
                  <div
                    key={tpl.id}
                    onClick={() => setActiveTemplateId(tpl.id)}
                    className={`p-2.5 rounded-md border text-xs cursor-pointer transition-colors flex items-center justify-between ${
                      isSelected
                        ? 'bg-indigo-50/70 border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200'
                        : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <div>
                      <div className="font-semibold flex items-center gap-1.5">
                        <span>{tpl.name}</span>
                        {tpl.isDefault && (
                          <span className="text-[10px] px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded font-normal">
                            Default
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {tpl.category} · v{tpl.version}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleDuplicateTemplate(tpl);
                        }}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded"
                        title="Duplikat Template"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {templates.length > 1 && !tpl.isDefault && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            if (confirm(`Hapus template "${tpl.name}"?`)) deleteTemplate(tpl.id);
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
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
            <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                    Editor: {activeTemplate.name}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Kategori: {activeTemplate.category}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activeTemplate.isDefault}
                      onChange={e => {
                        templates.forEach(t => {
                          updateTemplate(t.id, { isDefault: t.id === activeTemplate.id ? e.target.checked : false });
                        });
                      }}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Set as Default</span>
                  </label>
                </div>
              </div>

              {/* Clickable Placeholders */}
              <div>
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 block mb-1.5">
                  Klik untuk Sisipkan Placeholder:
                </span>
                <div className="flex flex-wrap gap-1">
                  {availableVariables.map(v => (
                    <button
                      key={v.key}
                      onClick={() => handleInsertVariable(v.key)}
                      className="px-2 py-0.5 text-[11px] font-mono bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:text-indigo-600 dark:hover:text-indigo-400 rounded border border-slate-200 dark:border-slate-700 transition-colors"
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
                  rows={10}
                  value={activeTemplate.messageBody}
                  onChange={e => updateTemplate(activeTemplate.id, { messageBody: e.target.value })}
                  className="w-full p-3 font-mono text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-200 leading-relaxed focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Right Column (6 cols): Live Preview Panel */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                  Live Preview WhatsApp Chat
                </h4>
                <p className="text-[11px] text-slate-500">
                  Simulasi tampilan pesan pada layar pelanggan
                </p>
              </div>

              {/* Sample Ticket Switcher */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500 text-[11px]">Test dengan Tiket:</span>
                <select
                  value={selectedTicketId}
                  onChange={e => setSelectedTicketId(e.target.value)}
                  className="px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                >
                  {tickets.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.woNumber} - {t.customerName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Warnings if any */}
            {previewResult.missingVariables.length > 0 && (
              <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Placeholder Kosong pada Tiket Contoh Ini:</p>
                  <p className="text-[11px] mt-0.5 font-mono">
                    {previewResult.missingVariables.map(v => `{{${v}}}`).join(', ')}
                  </p>
                </div>
              </div>
            )}

            {/* Simulated WhatsApp Chat Bubble */}
            <div className="bg-[#efeae2] dark:bg-slate-950 p-4 rounded-lg border border-slate-300 dark:border-slate-800 min-h-[340px] flex flex-col justify-end">
              <div className="max-w-[85%] self-end bg-white dark:bg-[#005c4b] dark:text-slate-100 p-3.5 rounded-lg rounded-tr-none shadow-sm text-xs leading-relaxed font-sans whitespace-pre-wrap select-text">
                {previewResult.renderedText || (
                  <span className="text-slate-400 italic">Pesan kosong. Ketik isi template di panel kiri.</span>
                )}
                <div className="text-[10px] text-slate-400 dark:text-slate-300 text-right mt-2 flex items-center justify-end gap-1">
                  <span>10:30 WIB</span>
                  <Check className="w-3 h-3 text-sky-500" />
                </div>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 text-center">
              Pesan dienkripsi dan diformat otomatis saat tombol Open WhatsApp diklik di detail tiket.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
