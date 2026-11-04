import React from 'react';
import { useMoraJawsSound } from '../../context/SoundContext';
import {
  Volume2,
  VolumeX,
  Play,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Radio,
  Sliders,
  ShieldCheck,
  Smartphone
} from 'lucide-react';

export const SoundSettingsView: React.FC = () => {
  const {
    soundSettings,
    updateSoundSettings,
    playLoadingSound,
    playReadySound,
    playReportSavedSound,
    playErrorSound,
    playSyncSound
  } = useMoraJawsSound();

  const soundList = [
    {
      id: 'soundLoading' as const,
      name: '1. Loading Sound',
      desc: 'Nada sintetis pembuka saat aplikasi atau modul memuat data.',
      action: playLoadingSound,
      color: 'from-purple-500 to-indigo-600'
    },
    {
      id: 'soundReady' as const,
      name: '2. Ready Sound',
      desc: 'Chime kesiapan sistem saat inisialisasi atau login selesai.',
      action: playReadySound,
      color: 'from-emerald-500 to-teal-600'
    },
    {
      id: 'soundReportSaved' as const,
      name: '3. Report Saved Sound',
      desc: 'Nada selebrasi sukses saat teknisi menyimpan laporan WO.',
      action: playReportSavedSound,
      color: 'from-amber-400 to-orange-500'
    },
    {
      id: 'soundError' as const,
      name: '4. Error Alert Sound',
      desc: 'Peringatan nada ganda saat terjadi kesalahan atau validasi gagal.',
      action: playErrorSound,
      color: 'from-rose-500 to-red-600'
    },
    {
      id: 'soundSync' as const,
      name: '5. Sync Data Sound',
      desc: 'Efek akustik saat sinkronisasi database Firestore atau refresh ditekan.',
      action: playSyncSound,
      color: 'from-cyan-500 to-blue-600'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#160D29] rounded-2xl border border-[#D8B4FE]/30 p-5 shadow-[0_4px_24px_rgba(22,13,41,0.6)] relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#D8B4FE]/60 to-transparent" />

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7135B5] to-[#35105E] border border-[#D8B4FE]/50 text-white flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(113,53,181,0.4)]">
            <Volume2 className="w-5 h-5 text-[#E9D5FF]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold text-white tracking-tight">
                MoraJaws Audio & Sound Notifications
              </h3>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-[#35105E] text-[#D8B4FE] border border-[#D8B4FE]/30">
                <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span>Web Audio Synthesizer</span>
              </span>
            </div>
            <p className="text-xs text-[#D8B4FE]/80 mt-0.5">
              Sistem umpan balik suara interaktif untuk proses loading, penyimpanan laporan teknisi, sinkronisasi, dan error.
            </p>
          </div>
        </div>

        {/* Master Sound Switch */}
        <div className="flex items-center gap-3 bg-[#35105E]/60 border border-[#D8B4FE]/30 px-3.5 py-2 rounded-xl">
          <span className="text-xs font-bold text-white">Master Sound:</span>
          <button
            type="button"
            onClick={() => updateSoundSettings({ enabled: !soundSettings.enabled })}
            className={`px-3 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
              soundSettings.enabled
                ? 'bg-gradient-to-r from-[#7135B5] to-[#A855F7] text-white shadow-[0_0_12px_rgba(168,85,247,0.5)] border border-[#E9D5FF]/40'
                : 'bg-rose-950/60 text-rose-300 border border-rose-500/40'
            }`}
          >
            {soundSettings.enabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>{soundSettings.enabled ? 'AKTIF' : 'SENYAP'}</span>
          </button>
        </div>
      </div>

      {/* Volume Slider Card */}
      <div className="bg-[#160D29] rounded-2xl border border-[#D8B4FE]/25 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#D8B4FE]/15">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#D8B4FE]" />
            <h4 className="font-extrabold text-white text-sm">
              Volume Output Audio
            </h4>
          </div>
          <span className="text-xs font-mono font-bold text-[#D8B4FE] bg-[#35105E] px-2.5 py-0.5 rounded-lg border border-[#D8B4FE]/30">
            {soundSettings.volume}%
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <VolumeX className="w-4 h-4 text-[#D8B4FE]/50" />
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={soundSettings.volume}
              onChange={e => updateSoundSettings({ volume: parseInt(e.target.value, 10) })}
              className="w-full h-2 bg-[#35105E] rounded-lg appearance-none cursor-pointer accent-[#A855F7]"
            />
            <Volume2 className="w-5 h-5 text-[#A855F7]" />
          </div>
          <div className="flex justify-between text-[10.5px] text-[#D8B4FE]/60">
            <span>Senyap (0%)</span>
            <span>Standar Nyaman (50% - 75%)</span>
            <span>Maksimum (100%)</span>
          </div>
        </div>
      </div>

      {/* Sound Chimes Preview & Individual Toggles */}
      <div className="bg-[#160D29] rounded-2xl border border-[#D8B4FE]/25 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#D8B4FE]/15">
          <div>
            <h4 className="font-extrabold text-white text-sm">
              Pratinjau Chime & Konfigurasi Notifikasi
            </h4>
            <p className="text-[11px] text-[#D8B4FE]/70 mt-0.5">
              Klik tombol uji untuk mendengarkan nada harmonik sintetis pada browser ini.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {soundList.map(item => {
            const isItemEnabled = soundSettings[item.id];
            return (
              <div
                key={item.id}
                className="p-4 rounded-xl bg-[#1E1138]/70 border border-[#D8B4FE]/20 hover:border-[#A855F7]/50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-white text-xs sm:text-sm">
                      {item.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateSoundSettings({ [item.id]: !isItemEnabled })}
                      className={`text-[10px] px-2 py-0.2 rounded-full font-bold border transition-colors cursor-pointer ${
                        isItemEnabled
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                          : 'bg-rose-500/20 text-rose-300 border-rose-400/30'
                      }`}
                    >
                      {isItemEnabled ? 'Aktif' : 'Nonaktif'}
                    </button>
                  </div>
                  <p className="text-[11px] text-[#D8B4FE]/70">
                    {item.desc}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={item.action}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7135B5] to-[#A855F7] hover:from-[#7E3CC7] hover:to-[#B666FE] shadow-[0_0_12px_rgba(168,85,247,0.4)] border border-[#E9D5FF]/30 flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shrink-0 self-end sm:self-center"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Uji Suara</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Android & Mobile Compatibility Info Box */}
      <div className="p-4 rounded-2xl bg-[#35105E]/40 border border-[#D8B4FE]/25 flex items-start gap-3 text-xs text-[#D8B4FE]">
        <Smartphone className="w-5 h-5 text-[#A855F7] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-white">
            Optimasi Audio Layar Sentuh Android & Desktop
          </p>
          <p className="text-[11px] leading-relaxed text-[#E9D5FF]/85">
            Sistem audio MoraJaws secara otomatis membuka kunci Web Audio Context pada ketukan atau klik pertama pengguna di perangkat mobile/Android, sehingga notifikasi suara berbunyi jernih tanpa memerlukan unduhan aset audio eksternal.
          </p>
        </div>
      </div>
    </div>
  );
};
