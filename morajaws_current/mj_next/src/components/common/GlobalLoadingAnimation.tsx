import React from 'react';
import { MoraJawsLogo } from './MoraJawsLogo';

export interface GlobalLoadingAnimationProps {
  fullScreen?: boolean;
  title?: string;
  subtitle?: string;
  progressPercent?: number; // Optional 0-100
  className?: string;
}

export const GlobalLoadingAnimation: React.FC<GlobalLoadingAnimationProps> = ({
  fullScreen = false,
  title = 'LOADING APPLICATION...',
  subtitle = 'Synchronizing your workspace',
  progressPercent,
  className = ''
}) => {
  const content = (
    <div
      role="status"
      aria-live="polite"
      className={`relative z-10 flex flex-col items-center justify-center text-center p-6 sm:p-8 rounded-2xl mj-gloss-card border border-purple-400/40 shadow-2xl max-w-sm sm:max-w-md w-full mx-4 overflow-hidden select-none animate-in fade-in zoom-in-95 duration-200 ${className}`}
    >
      {/* Background Soft Glow & Delicate Micro-particles */}
      <div className="absolute -top-12 -right-12 w-40 h-40 bg-purple-600/25 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-indigo-600/25 rounded-full blur-2xl pointer-events-none" />

      {/* Micro-Particles */}
      <div
        className="absolute top-6 left-8 w-1.5 h-1.5 rounded-full bg-purple-300 pointer-events-none"
        style={{ animation: 'morajaws-float 3s ease-in-out infinite' }}
      />
      <div
        className="absolute bottom-8 right-10 w-2 h-2 rounded-full bg-purple-400/60 pointer-events-none"
        style={{ animation: 'morajaws-float 2.5s ease-in-out infinite 0.8s' }}
      />
      <div
        className="absolute top-1/2 right-6 w-1 h-1 rounded-full bg-white pointer-events-none"
        style={{ animation: 'morajaws-float 3.5s ease-in-out infinite 1.4s' }}
      />

      {/* Central Rotating 3D Glossy MoraJaws Logo with Orbital Progress Ring */}
      <div className="relative flex items-center justify-center my-3">
        {/* Pulsating Lilac Glow Halo */}
        <div
          className="absolute inset-0 rounded-full blur-md opacity-80 pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(168, 85, 247, 0.5) 0%, rgba(216, 180, 254, 0.25) 50%, transparent 70%)',
            transform: 'scale(1.35)',
            animation: 'morajaws-pulse-lilac 2.8s infinite ease-in-out'
          }}
        />

        {/* Circular SVG Progress Ring */}
        <svg
          className="absolute w-24 h-24 -inset-2 pointer-events-none"
          viewBox="0 0 100 100"
          style={{ animation: 'morajaws-spin-clockwise 3.6s linear infinite' }}
        >
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="rgba(216, 180, 254, 0.15)"
            strokeWidth="3"
          />
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="url(#loadingRingGrad)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray="75 200"
          />
          <defs>
            <linearGradient id="loadingRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="40%" stopColor="#D8B4FE" />
              <stop offset="100%" stopColor="#7135B5" />
            </linearGradient>
          </defs>
        </svg>

        {/* Glossy Logo Symbol */}
        <MoraJawsLogo size="lg" isRotating={true} withGlow={false} />
      </div>

      {/* Brand Header */}
      <div className="mt-4 space-y-1">
        <span className="font-black text-sm tracking-[0.3em] uppercase bg-gradient-to-r from-white via-purple-100 to-purple-300 bg-clip-text text-transparent block">
          MORAJAWS
        </span>
        <h4 className="text-xs sm:text-sm font-bold tracking-wider text-purple-200 uppercase">
          {title}
        </h4>
        <p className="text-[11px] text-purple-300/80 font-medium tracking-wide">
          {subtitle}
        </p>
      </div>

      {/* Progress Bar (Indeterminate Shimmer or Determinate Percentage) */}
      <div className="w-full mt-5">
        <div className="h-1.5 w-full bg-black/50 rounded-full overflow-hidden border border-purple-500/25 relative">
          {progressPercent !== undefined ? (
            <div
              className="h-full bg-gradient-to-r from-purple-500 via-purple-300 to-white transition-all duration-300 rounded-full"
              style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            />
          ) : (
            <div className="absolute inset-0 w-full h-full mj-shimmer bg-gradient-to-r from-purple-700 via-purple-400 to-indigo-600 rounded-full" />
          )}
        </div>

        {progressPercent !== undefined && (
          <span className="text-[10px] font-mono text-purple-300/80 mt-1 block font-semibold">
            {Math.round(progressPercent)}%
          </span>
        )}
      </div>
    </div>
  );

  if (fullScreen) {
    return (
      <div
        className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
        aria-busy="true"
      >
        {content}
      </div>
    );
  }

  return content;
};
