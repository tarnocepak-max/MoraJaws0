import React, { useState } from 'react';
import { Ticket, TechnicalReport } from '../../types/index.ts';
import { useApp } from '../../context/AppContext';
import { useMoraJawsSound } from '../../context/SoundContext';
import { getSafePreviewUrl } from '../../services/storageCompatibility';
import {
  Wrench,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Camera,
  X,
  FileText,
  ShieldCheck,
  Clock,
  Sparkles,
  Maximize2
} from 'lucide-react';

interface TechnicalReportFormProps {
  ticket: Ticket;
  onSuccess?: () => void;
}

export const TechnicalReportForm: React.FC<TechnicalReportFormProps> = ({ ticket, onSuccess }) => {
  const {
    currentUser,
    rootCauseCategories,
    workResultsList,
    saveTechnicalReport,
    verifyTechnicalReport
  } = useApp();
  const { playReportSavedSound, playErrorSound } = useMoraJawsSound();

  const existingReport = ticket.technicalReport;

  const [isEditing, setIsEditing] = useState(!existingReport);
  const [mainCategory, setMainCategory] = useState(
    existingReport?.mainCategory || rootCauseCategories[0]?.name || 'Gangguan Fiber Optic dan Jaringan'
  );
  const [rootCause, setRootCause] = useState(
    existingReport?.rootCause || rootCauseCategories[0]?.items[0] || 'Fiber Optic Putus'
  );
  const [workResult, setWorkResult] = useState(
    existingReport?.workResult || workResultsList[0] || 'Berhasil Diperbaiki'
  );
  const [technicalDescription, setTechnicalDescription] = useState(
    existingReport?.technicalDescription || ''
  );
  const [correctiveAction, setCorrectiveAction] = useState(
    existingReport?.correctiveAction || ''
  );
  const [opticalPowerDbm, setOpticalPowerDbm] = useState(
    existingReport?.opticalPowerDbm || '-18.5 dBm'
  );
  const [deviceSerialNumber, setDeviceSerialNumber] = useState(
    existingReport?.deviceSerialNumber || ''
  );
  const [usedMaterials, setUsedMaterials] = useState(
    existingReport?.usedMaterials || ''
  );
  const [photoBeforeUrl, setPhotoBeforeUrl] = useState(
    existingReport?.photoBeforeUrl || ''
  );
  const [photoAfterUrl, setPhotoAfterUrl] = useState(
    existingReport?.photoAfterUrl || ''
  );
  const [additionalNotes, setAdditionalNotes] = useState(
    existingReport?.additionalNotes || ''
  );

  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Available root causes based on chosen mainCategory
  const currentCategoryObj = rootCauseCategories.find(c => c.name === mainCategory);
  const availableRootCauses = currentCategoryObj?.items || [];

  const handleMainCategoryChange = (newCat: string) => {
    setMainCategory(newCat);
    const catObj = rootCauseCategories.find(c => c.name === newCat);
    if (catObj && catObj.items.length > 0) {
      setRootCause(catObj.items[0]);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'before' | 'after') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setNotice({ type: 'error', text: 'Ukuran foto maksimal 5MB.' });
      setTimeout(() => setNotice(null), 3000);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      if (target === 'before') setPhotoBeforeUrl(url);
      else setPhotoAfterUrl(url);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!technicalDescription.trim()) {
      setNotice({ type: 'error', text: 'Deskripsi teknis kendala wajib diisi.' });
      setTimeout(() => setNotice(null), 3000);
      return;
    }

    if (!correctiveAction.trim()) {
      setNotice({ type: 'error', text: 'Tindakan perbaikan wajib diisi.' });
      setTimeout(() => setNotice(null), 3000);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await saveTechnicalReport(ticket.id, {
        mainCategory,
        rootCause,
        workResult,
        technicalDescription: technicalDescription.trim(),
        correctiveAction: correctiveAction.trim(),
        opticalPowerDbm: opticalPowerDbm.trim(),
        deviceSerialNumber: deviceSerialNumber.trim(),
        usedMaterials: usedMaterials.trim(),
        photoBeforeUrl,
        photoAfterUrl,
        additionalNotes: additionalNotes.trim()
      });

      if (result.success) {
        playReportSavedSound();
        setIsEditing(false);
        setNotice({ type: 'success', text: 'Laporan teknis pekerjaan & root cause berhasil disimpan!' });
        setTimeout(() => setNotice(null), 3500);
        onSuccess?.();
      } else {
        playErrorSound();
        setNotice({ type: 'error', text: result.error || 'Gagal menyimpan laporan.' });
        setTimeout(() => setNotice(null), 4000);
      }
    } catch (err: any) {
      playErrorSound();
      setNotice({ type: 'error', text: err?.message || 'Terjadi kesalahan saat menyimpan laporan.' });
      setTimeout(() => setNotice(null), 4000);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 text-xs">
      {notice && (
        <div
          className={`p-3 rounded-lg border flex items-center gap-2 ${
            notice.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
          }`}
        >
          {notice.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span className="font-medium">{notice.text}</span>
        </div>
      )}

      {/* Submitted Report Summary Card if exists and not editing */}
      {existingReport && !isEditing && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  {existingReport.workResult}
                </span>
                {existingReport.verifiedByDispatch && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                    <ShieldCheck className="w-3 h-3 text-indigo-600" /> Terverifikasi Dispatch
                  </span>
                )}
              </div>
              <div className="text-slate-400 text-[11px] mt-1">
                Diserahkan oleh: <span className="font-semibold text-slate-700 dark:text-slate-300">{existingReport.submittedBy}</span> pada {new Date(existingReport.submittedAt).toLocaleString()}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {(currentUser.role === 'dispatch' || currentUser.role === 'super_admin') && !existingReport.verifiedByDispatch && (
                <button
                  type="button"
                  onClick={() => verifyTechnicalReport(ticket.id)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Verifikasi Laporan</span>
                </button>
              )}

              {(currentUser.role === 'installer' || currentUser.role === 'super_admin') && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium"
                >
                  Edit Laporan
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-400 uppercase font-mono block">Kategori Utama</span>
              <span className="font-bold text-slate-900 dark:text-white text-xs">{existingReport.mainCategory}</span>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-400 uppercase font-mono block">Penyebab Utama (Root Cause)</span>
              <span className="font-bold text-rose-600 dark:text-rose-400 text-xs">{existingReport.rootCause}</span>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-400 uppercase font-mono block">Optical Power (Redaman OPM)</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400 text-xs">
                {existingReport.opticalPowerDbm || '-'}
              </span>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-400 uppercase font-mono block">SN ONT / Perangkat</span>
              <span className="font-mono text-slate-800 dark:text-slate-200 text-xs">
                {existingReport.deviceSerialNumber || '-'}
              </span>
            </div>

            <div className="md:col-span-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-400 uppercase font-mono block">Deskripsi Teknis Kendala</span>
              <p className="text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">{existingReport.technicalDescription}</p>
            </div>

            <div className="md:col-span-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800 space-y-1">
              <span className="text-[11px] text-slate-400 uppercase font-mono block">Tindakan Perbaikan / Langkah Kerja</span>
              <p className="text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">{existingReport.correctiveAction}</p>
            </div>

            {existingReport.usedMaterials && (
              <div className="md:col-span-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="text-[11px] text-slate-400 uppercase font-mono block">Material & Spare Part Terpakai</span>
                <p className="text-slate-800 dark:text-slate-200">{existingReport.usedMaterials}</p>
              </div>
            )}
          </div>

          {/* Photos View */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <h5 className="font-semibold text-slate-800 dark:text-slate-200 text-xs mb-3">Foto Bukti Pengerjaan</h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="text-[11px] text-slate-500 mb-1 block">Foto Kondisi Awal (Sebelum Perbaikan):</span>
                {existingReport.photoBeforeUrl ? (
                  <div
                    onClick={() => setZoomImage(existingReport.photoBeforeUrl!)}
                    className="cursor-pointer group relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 h-40 bg-slate-100 dark:bg-slate-800"
                  >
                    <img src={getSafePreviewUrl(existingReport.photoBeforeUrl)} alt="Foto Sebelum" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                      <Maximize2 className="w-5 h-5" />
                    </div>
                  </div>
                ) : (
                  <div className="h-40 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-400 text-xs">
                    Tidak ada foto awal
                  </div>
                )}
              </div>

              <div>
                <span className="text-[11px] text-slate-500 mb-1 block">Foto Kondisi Akhir (Sesudah Perbaikan & OPM):</span>
                {existingReport.photoAfterUrl ? (
                  <div
                    onClick={() => setZoomImage(existingReport.photoAfterUrl!)}
                    className="cursor-pointer group relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 h-40 bg-slate-100 dark:bg-slate-800"
                  >
                    <img src={getSafePreviewUrl(existingReport.photoAfterUrl)} alt="Foto Sesudah" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                      <Maximize2 className="w-5 h-5" />
                    </div>
                  </div>
                ) : (
                  <div className="h-40 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-400 text-xs">
                    Tidak ada foto akhir
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Editing / New Form */}
      {isEditing && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 flex items-center justify-center">
                <Wrench className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                  Formulir Laporan Lapangan & Root Cause Teknisi Wi-Fi
                </h4>
                <p className="text-[11px] text-slate-500">
                  Wajib diisi oleh teknisi lapangan sebelum tiket dapat diselesaikan dan ditutup oleh Dispatch.
                </p>
              </div>
            </div>

            {existingReport && (
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-2.5 py-1 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-xs"
              >
                Batal
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Main Category */}
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Kategori Utama Gangguan <span className="text-rose-500">*</span>
              </label>
              <select
                value={mainCategory}
                onChange={e => handleMainCategoryChange(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 font-medium"
              >
                {rootCauseCategories.map(cat => (
                  <option key={cat.id} value={cat.name}>{cat.name}</option>
                ))}
              </select>
            </div>

            {/* Root Cause Selection */}
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Penyebab Masalah (Root Cause) <span className="text-rose-500">*</span>
              </label>
              <select
                value={rootCause}
                onChange={e => setRootCause(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 font-medium"
              >
                {availableRootCauses.map(rc => (
                  <option key={rc} value={rc}>{rc}</option>
                ))}
                <option value="Lainnya">Lainnya (Jelaskan di deskripsi teknis)</option>
              </select>
            </div>

            {/* Work Result */}
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Hasil Pengerjaan Lapangan <span className="text-rose-500">*</span>
              </label>
              <select
                value={workResult}
                onChange={e => setWorkResult(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 font-medium"
              >
                {workResultsList.map(res => (
                  <option key={res} value={res}>{res}</option>
                ))}
              </select>
            </div>

            {/* Optical Power */}
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Redaman Fiber Optik (OPM dBm)
              </label>
              <input
                type="text"
                placeholder="Contoh: -18.5 dBm"
                value={opticalPowerDbm}
                onChange={e => setOpticalPowerDbm(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
              />
            </div>

            {/* Device SN */}
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Serial Number Perangkat (ONT / Router)
              </label>
              <input
                type="text"
                placeholder="Contoh: HWTC12345678"
                value={deviceSerialNumber}
                onChange={e => setDeviceSerialNumber(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
              />
            </div>

            {/* Used Materials */}
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Material / Spare Part yang Digunakan
              </label>
              <input
                type="text"
                placeholder="Contoh: Dropcore 120m, Fast Connector 2 pcs, Roset 1 port"
                value={usedMaterials}
                onChange={e => setUsedMaterials(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
              />
            </div>

            {/* Technical Description */}
            <div className="md:col-span-2">
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Deskripsi Teknis Kendala / Kondisi Lapangan <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={2}
                placeholder="Jelaskan kondisi sebelum diperbaiki, posisi kabel, titik redaman tinggi, atau kendala akses..."
                value={technicalDescription}
                onChange={e => setTechnicalDescription(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
              />
            </div>

            {/* Corrective Action */}
            <div className="md:col-span-2">
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                Tindakan Perbaikan / Langkah Solusi <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={2}
                placeholder="Jelaskan tindakan yang dilakukan: penarikan ulang kabel, pembersihan konektor, splicing ulang, atau penggantian ONT..."
                value={correctiveAction}
                onChange={e => setCorrectiveAction(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
              />
            </div>

            {/* Photo Before */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
              <label className="font-semibold text-slate-800 dark:text-slate-200 block">
                Foto Sebelum Perbaikan
              </label>
              {photoBeforeUrl ? (
                <div className="relative group rounded-lg overflow-hidden border border-slate-300 dark:border-slate-600 h-32">
                  <img src={getSafePreviewUrl(photoBeforeUrl)} alt="Foto Sebelum" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotoBeforeUrl('')}
                    className="absolute top-1 right-1 p-1 bg-black/70 text-white rounded-full hover:bg-rose-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <label className="h-32 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <Camera className="w-6 h-6 text-slate-400 mb-1" />
                  <span className="text-[11px] text-slate-500">Klik untuk upload foto awal</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => handlePhotoUpload(e, 'before')}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            {/* Photo After */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
              <label className="font-semibold text-slate-800 dark:text-slate-200 block">
                Foto Sesudah Perbaikan / Redaman OPM
              </label>
              {photoAfterUrl ? (
                <div className="relative group rounded-lg overflow-hidden border border-slate-300 dark:border-slate-600 h-32">
                  <img src={getSafePreviewUrl(photoAfterUrl)} alt="Foto Sesudah" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotoAfterUrl('')}
                    className="absolute top-1 right-1 p-1 bg-black/70 text-white rounded-full hover:bg-rose-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <label className="h-32 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <Camera className="w-6 h-6 text-slate-400 mb-1" />
                  <span className="text-[11px] text-slate-500">Klik untuk upload foto hasil & OPM</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => handlePhotoUpload(e, 'after')}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="submit"
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-xs transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Simpan Laporan & Selesaikan Tugas Lapangan</span>
            </button>
          </div>
        </form>
      )}

      {/* Lightbox */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-70 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setZoomImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setZoomImage(null)}
              className="absolute top-3 right-3 p-2 bg-black/60 text-white rounded-full hover:bg-rose-600 transition-colors z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <img src={getSafePreviewUrl(zoomImage)} alt="Bukti Foto Zoom" className="max-w-full max-h-[85vh] object-contain rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
};
