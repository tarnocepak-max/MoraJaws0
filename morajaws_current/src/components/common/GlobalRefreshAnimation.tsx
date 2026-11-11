import React from 'react';
import { MoraJawsLogo } from './MoraJawsLogo';
import { Sparkles } from 'lucide-react';

export interface GlobalRefreshAnimationProps {
  isVisible: boolean;
  message?: string;
  subMessage?: string;
}

export const GlobalRefreshAnimation: React.FC<GlobalRefreshAnimationProps> = ({
  isVisible,
  message = 'MEMPERBARUI DATA...',
  subMessage = 'Menyelaraskan data Work Order & Schedule'
}) => {
  if (!isVisible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[9997] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm pointer-events-none transition-opacity duration-300 animate-in fade-in"
    >
      <div className="flex flex-col items-center justify-center text-center p-6 sm:p-7 rounded-2xl mj-gloss-card border border-purple-400/40 shadow-2xl max-w-xs sm:max-w-sm w-full mx-auto select-none pointer-events-auto transform animate-in zoom-in-95 duration-200">
        {/* Pulsating Lilac Glow */}
        <div
          className="relative flex items-center justify-center my-2"
          style={{ animation: 'morajaws-pulse-lilac 2s infinite ease-in-out' }}
        >
          <MoraJawsLogo size="lg" isRotating={true} withGlow={true} />
        </div>

        {/* Brand Text */}
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-center gap-1.5 text-purple-300 text-[10.5px] font-mono tracking-widest uppercase font-bold">
            <Sparkles className="w-3 h-3 text-purple-300 animate-spin" />
            <span>MORAJAWS SYNC</span>
          </div>
          <h4 className="text-xs sm:text-sm font-black tracking-wider text-white uppercase">
            {message}
          </h4>
          <p className="text-[11px] text-purple-200/80 font-medium">
            {subMessage}
          </p>
        </div>

        {/* Shimmer Light Sweep Line */}
        <div className="w-full mt-4 h-1 bg-black/40 rounded-full overflow-hidden border border-purple-500/30">
          <div className="w-full h-full mj-shimmer bg-gradient-to-r from-purple-600 via-purple-300 to-indigo-600 rounded-full" />
        </div>
      </div>
    </div>
  );
};
