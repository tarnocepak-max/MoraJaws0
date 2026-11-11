import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { BasecampLocation } from '../../types';
import {
  MapPin,
  Building2,
  Phone,
  User,
  Users2,
  Navigation,
  ExternalLink,
  Plus,
  CheckCircle2,
  Edit2
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

export const LocationBasecampView: React.FC = () => {
  const { contractors, currentUser, users } = useApp();
  const { toast } = useToast();

  const [basecamps, setBasecamps] = useState<BasecampLocation[]>([
    {
      id: 'bc-1',
      contractorId: 'c-mjs',
      contractorName: 'PT Mitra Jaringan Solusi',
      name: 'Basecamp Operasional Jakarta Selatan',
      area: 'Jakarta Selatan',
      address: 'Jl. Fatmawati Raya No. 42A, Cilandak Barat, Jakarta Selatan 12430',
      latitude: -6.2921,
      longitude: 106.7974,
      phone: '081288990011',
      leaderName: 'Hendra Gunawan (Leader MJS)',
      installerCount: 8,
      active: true
    },
    {
      id: 'bc-2',
      contractorId: 'c-kcs',
      contractorName: 'PT Kencana Solusindo',
      name: 'Basecamp Operasional Jakarta Barat',
      area: 'Jakarta Barat',
      address: 'Komplek Ruko Permata Taman Palem Blok B No. 15, Cengkareng, Jakarta Barat 11730',
      latitude: -6.1423,
      longitude: 106.7289,
      phone: '085711223344',
      leaderName: 'Dedi Kurniawan (Leader KCS)',
      installerCount: 6,
      active: true
    },
    {
      id: 'bc-3',
      contractorId: 'c-cfn',
      contractorName: 'PT Cipta Fiber Nusantara',
      name: 'Basecamp BSD & Tangerang Selatan',
      area: 'Tangerang Selatan',
      address: 'Ruko Golden Boulevard Blok W2 No. 8, BSD City, Serpong, Tangerang Selatan 15322',
      latitude: -6.3015,
      longitude: 106.6854,
      phone: '081822334455',
      leaderName: 'Ahmad Fauzi',
      installerCount: 5,
      active: true
    }
  ]);

  const [selectedBasecamp, setSelectedBasecamp] = useState<BasecampLocation>(basecamps[0]);

  // Open Google Maps
  const handleOpenMaps = (bc: BasecampLocation) => {
    let url = '';
    if (bc.latitude && bc.longitude) {
      url = `https://www.google.com/maps/search/?api=1&query=${bc.latitude},${bc.longitude}`;
    } else {
      url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(bc.address)}`;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#5B35B1] text-white flex items-center justify-center font-bold shadow-xs">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#3B1D78] dark:text-purple-200 flex items-center gap-2">
              <span>Location Basecamp & Hub Lapangan Mitra</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E9E1FF] text-[#3B1D78] dark:bg-purple-900/60 dark:text-purple-200">
                Pusat Armada & Material
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Direktori titik kumpul armada teknisi, gudang dropcore/modem, dan kontak koordinasi basecamp mitra kontraktor.
            </p>
          </div>
        </div>
      </div>

      {/* Grid of Basecamps */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {basecamps.map(bc => (
          <div
            key={bc.id}
            className="bg-white dark:bg-[#1A0E2E] rounded-2xl border-2 border-[#D8CCF3] dark:border-purple-900/60 p-5 shadow-xs space-y-4 flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2 border-b border-[#E9E1FF] dark:border-purple-900/40 pb-3">
                <div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E9E1FF] text-[#3B1D78] dark:bg-purple-950 dark:text-purple-300">
                    {bc.area}
                  </span>
                  <h3 className="font-bold text-sm text-[#21183A] dark:text-white mt-1">
                    {bc.name}
                  </h3>
                </div>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1 shrink-0" />
              </div>

              <div className="space-y-2 text-xs">
                <div className="text-slate-600 dark:text-slate-400">
                  <strong className="text-slate-900 dark:text-white block mb-0.5">Kontraktor:</strong>
                  {bc.contractorName}
                </div>

                <div className="text-slate-600 dark:text-slate-400">
                  <strong className="text-slate-900 dark:text-white block mb-0.5">Alamat Basecamp:</strong>
                  {bc.address}
                </div>

                <div className="flex items-center justify-between pt-1 text-[11px]">
                  <span className="text-slate-500">Leader / Korlap:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{bc.leaderName}</span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Hotline Basecamp:</span>
                  <span className="font-mono font-semibold text-emerald-600">{bc.phone}</span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Kekuatan Armada:</span>
                  <span className="font-bold text-[#5B35B1] dark:text-purple-300">{bc.installerCount} Teknisi Aktif</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[#E9E1FF] dark:border-purple-900/40 flex items-center gap-2">
              <a
                href={`tel:${bc.phone}`}
                className="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-center"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Hubungi</span>
              </a>
              <button
                type="button"
                onClick={() => handleOpenMaps(bc)}
                className="flex-1 py-2 px-3 rounded-xl bg-[#5B35B1] hover:bg-[#3B1D78] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>Rute Maps</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
