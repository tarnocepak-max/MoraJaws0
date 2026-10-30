import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Zap,
  CheckCircle2,
  AlertTriangle,
  User,
  Phone,
  MapPin,
  Clock,
  Building2,
  Calendar,
  Radio,
  FileText
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { getJakartaDateString } from '../../services/appointmentDateParser';

export const FormSamedayView: React.FC = () => {
  const { createTicket, contractors, coverageAreas, currentUser } = useApp();
  const { toast } = useToast();

  const todayStr = getJakartaDateString(0);
  const [woNumber, setWoNumber] = useState(`WO${Date.now().toString().slice(-8)}`);
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [area, setArea] = useState(currentUser.area || coverageAreas[0]?.name || 'Jakarta Selatan');
  const [clusterName, setClusterName] = useState('');
  const [streetName, setStreetName] = useState('');
  const [streetAlternatif, setStreetAlternatif] = useState('');
  const [contractorName, setContractorName] = useState(currentUser.contractor || contractors[0]?.name || 'PT Mitra Jaringan Solusi');
  const [slotTime, setSlotTime] = useState('13:00 - 15:00 WIB');
  const [ticketCategory, setTicketCategory] = useState('New Installation FTTH (Sameday)');
  const [fdtCode, setFdtCode] = useState('FDT-JS-015');
  const [fatCode, setFatCode] = useState('FAT-JS-015-02');
  const [remarks, setRemarks] = useState('Sameday Urgent Dispatch');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!woNumber.trim() || !customerId.trim() || !customerName.trim() || !customerPhone.trim()) {
      toast.error('Mohon lengkapi field wajib (WO Number, Customer ID, Nama, No. HP).', 'Validasi Gagal');
      return;
    }

    if (!/^[0-9]{7}$/.test(customerId.trim())) {
      toast.error('Customer ID wajib tepat 7 digit angka murni (^[0-9]{7}$).', 'Format ID Tidak Valid');
      return;
    }

    setIsSubmitting(true);
    try {
      const newTicket = createTicket({
        woNumber: woNumber.trim().toUpperCase(),
        workOrderNumber: woNumber.trim().toUpperCase(),
        idCustomer: customerId.trim(),
        customerId: customerId.trim(),
        customerName: customerName.trim(),
        endUserName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        area: area.trim(),
        clusterName: clusterName.trim(),
        streetName: streetName.trim(),
        streetAlternatif: streetAlternatif.trim(),
        contactorName: contractorName.trim(),
        contractorName: contractorName.trim(),
        appointmentDate: todayStr,
        date: todayStr,
        slotTime: slotTime.trim(),
        ticketCategory: ticketCategory.trim(),
        fdtCode: fdtCode.trim(),
        fatCode: fatCode.trim(),
        remarksAgent: remarks.trim(),
        statusWOAgent: 'Assigned',
        statusWOInstaller: 'Unassigned',
        statusWhatsApp: 'ready',
        dateUpload: `${todayStr} ${new Date().toLocaleTimeString('id-ID').slice(0, 5)}`
      });

      toast.success(`Work Order Sameday ${newTicket.woNumber} berhasil dibuat dan diprioritaskan!`, 'Sameday Created');
      // Reset form
      setWoNumber(`WO${Date.now().toString().slice(-8)}`);
      setCustomerId('');
      setCustomerName('');
      setCustomerPhone('');
      setStreetName('');
      setStreetAlternatif('');
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menyimpan tiket sameday.', 'Error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // WO Same Day is strictly exclusive to Dispatch role
  if (currentUser.role !== 'dispatch') {
    return (
      <div className="p-8 text-center bg-white dark:bg-[#1a0f30] rounded-2xl border border-red-200 dark:border-red-900/50 max-w-lg mx-auto shadow-sm my-8 space-y-3">
        <div className="w-12 h-12 bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-900 dark:text-white">Akses Khusus Dispatcher</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Fitur pendaftaran WO Same Day khusus diperuntukkan bagi role Dispatch. Peran Anda saat ini ({currentUser.role}) tidak memiliki izin akses.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Banner */}
      <div className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 p-4 sm:p-5 shadow-xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-xs">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#3B1D78] dark:text-purple-200 flex items-center gap-2">
              <span>Formulir Pendaftaran WO Sameday (Hari Ini)</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                Prioritas Tinggi (Express)
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pendaftaran tiket urgent dengan target pengerjaan di hari yang sama ({todayStr}).
            </p>
          </div>
        </div>
      </div>

      {/* Main Form Card */}
      <form onSubmit={handleSubmit} className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 p-6 shadow-xs space-y-5 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Nomor Work Order (WO Number) *
            </label>
            <input
              type="text"
              required
              value={woNumber}
              onChange={e => setWoNumber(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 bg-[#F5F1FF] dark:bg-slate-800 border rounded-xl font-mono font-bold text-[#5B35B1]"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Customer ID (7 Digit Angka) *
            </label>
            <input
              type="text"
              required
              maxLength={7}
              placeholder="Contoh: 7399501"
              value={customerId}
              onChange={e => setCustomerId(e.target.value.replace(/\D/g, ''))}
              className="w-full px-3 py-2 bg-[#F5F1FF] dark:bg-slate-800 border rounded-xl font-mono font-semibold"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Nama Lengkap Pelanggan *
            </label>
            <input
              type="text"
              required
              placeholder="Nama customer"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl font-medium"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Nomor Telepon / WhatsApp Pelanggan *
            </label>
            <input
              type="tel"
              required
              placeholder="Contoh: 081299887766"
              value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl font-mono"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Mitra Kontraktor Pelaksana *
            </label>
            <select
              value={contractorName}
              onChange={e => setContractorName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
            >
              {contractors.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Slot Waktu Pengerjaan *
            </label>
            <select
              value={slotTime}
              onChange={e => setSlotTime(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl font-medium"
            >
              <option value="09:00 - 11:00 WIB">09:00 - 11:00 WIB (Pagi)</option>
              <option value="11:00 - 13:00 WIB">11:00 - 13:00 WIB (Siang)</option>
              <option value="13:00 - 15:00 WIB">13:00 - 15:00 WIB (Sore 1)</option>
              <option value="15:00 - 17:00 WIB">15:00 - 17:00 WIB (Sore 2)</option>
            </select>
          </div>
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Area / Wilayah *
            </label>
            <select
              value={area}
              onChange={e => setArea(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
            >
              {coverageAreas.map(a => (
                <option key={a.id} value={a.name}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Cluster / Komplek
            </label>
            <input
              type="text"
              placeholder="Nama cluster"
              value={clusterName}
              onChange={e => setClusterName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Kategori Tiket
            </label>
            <input
              type="text"
              value={ticketCategory}
              onChange={e => setTicketCategory(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
            />
          </div>
        </div>

        <div>
          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
            Alamat Lengkap Pemasangan *
          </label>
          <input
            type="text"
            required
            placeholder="Jalan, nomor rumah, RT/RW"
            value={streetName}
            onChange={e => setStreetName(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Patokan / Landmark
            </label>
            <input
              type="text"
              placeholder="Dekat masjid / seberang ruko..."
              value={streetAlternatif}
              onChange={e => setStreetAlternatif(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Kode FDT
            </label>
            <input
              type="text"
              value={fdtCode}
              onChange={e => setFdtCode(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl font-mono"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Kode FAT
            </label>
            <input
              type="text"
              value={fatCode}
              onChange={e => setFatCode(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl font-mono"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-2"
          >
            <Zap className="w-4 h-4" />
            <span>{isSubmitting ? 'Mendaftarkan...' : 'Kirim & Terbitkan WO Sameday'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
