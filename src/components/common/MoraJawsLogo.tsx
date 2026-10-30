import React from 'react';

export interface MoraJawsLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  showText?: boolean;
  textSubtitle?: string;
  isRotating?: boolean;
  animated?: boolean;
  withGlow?: boolean;
  className?: string;
}

export const MoraJawsLogo: React.FC<MoraJawsLogoProps> = ({
  size = 'md',
  showText = false,
  textSubtitle,
  isRotating = false,
  animated = false,
  withGlow = true,
  className = ''
}) => {
  const pixelSize = typeof size === 'number'
    ? size
    : size === 'xs'
    ? 22
    : size === 'sm'
    ? 30
    : size === 'md'
    ? 44
    : size === 'lg'
    ? 68
    : 96;

  const uniqueId = React.useId().replace(/:/g, '');

  return (
    <div className={`inline-flex flex-col items-center justify-center select-none ${className}`}>
      <div
        className="relative flex items-center justify-center"
        style={{ width: pixelSize, height: pixelSize }}
      >
        {/* Ambient Lilac Glow Background */}
        {withGlow && (
          <div
            className="absolute inset-0 rounded-full blur-md opacity-70 pointer-events-none transition-all duration-300"
            style={{
              background: 'radial-gradient(circle, rgba(168, 85, 247, 0.45) 0%, rgba(216, 180, 254, 0.25) 50%, transparent 75%)',
              transform: 'scale(1.25)'
            }}
          />
        )}

        <svg
          viewBox="0 0 100 100"
          width={pixelSize}
          height={pixelSize}
          className="relative z-10 overflow-visible"
        >
          <defs>
            {/* Dark Purple Gradient */}
            <linearGradient id={`bgGrad-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#160D29" />
              <stop offset="45%" stopColor="#35105E" />
              <stop offset="100%" stopColor="#160D29" />
            </linearGradient>

            {/* Glossy Purple to Lilac Gradient for 'M' */}
            <linearGradient id={`mGrad-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
              <stop offset="25%" stopColor="#E9D5FF" />
              <stop offset="60%" stopColor="#D8B4FE" />
              <stop offset="85%" stopColor="#A855F7" />
              <stop offset="100%" stopColor="#7135B5" />
            </linearGradient>

            {/* Circular Refresh Arrow Gradient */}
            <linearGradient id={`arrowGrad-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#D8B4FE" />
              <stop offset="50%" stopColor="#A855F7" />
              <stop offset="100%" stopColor="#7135B5" />
            </linearGradient>

            {/* Gloss Reflection Linear Gradient */}
            <linearGradient id={`glossShine-${uniqueId}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.6" />
              <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>

            {/* Soft Drop Shadow Filter for 3D depth */}
            <filter id={`shadow-${uniqueId}`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2.5" stdDeviation="3" floodColor="#160D29" floodOpacity="0.8" />
              <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#A855F7" floodOpacity="0.3" />
            </filter>
          </defs>

          {/* 3D Glossy Circle Backdrop */}
          <circle
            cx="50"
            cy="50"
            r="46"
            fill={`url(#bgGrad-${uniqueId})`}
            stroke="#D8B4FE"
            strokeWidth="1.5"
            strokeOpacity="0.5"
            filter={`url(#shadow-${uniqueId})`}
          />

          {/* Inner Glossy Glass Rim */}
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="#A855F7"
            strokeWidth="0.8"
            strokeOpacity="0.6"
          />

          {/* Top Half Gloss Light Reflection */}
          <path
            d="M 12 50 A 42 42 0 0 1 88 50 Z"
            fill={`url(#glossShine-${uniqueId})`}
            opacity="0.75"
          />

          {/* Outer Orbital Circular Refresh Arrows */}
          <g
            style={{
              transformOrigin: '50px 50px',
              animation: (isRotating || animated) ? 'morajaws-spin-clockwise 2.2s linear infinite' : undefined
            }}
          >
            {/* Top Arc with Arrowhead */}
            <path
              d="M 23 44 A 36 36 0 0 1 77 44"
              fill="none"
              stroke={`url(#arrowGrad-${uniqueId})`}
              strokeWidth="3.2"
              strokeLinecap="round"
            />
            <polygon
              points="78,39 84,47 75,48"
              fill="#D8B4FE"
              filter={`url(#shadow-${uniqueId})`}
            />

            {/* Bottom Arc with Arrowhead */}
            <path
              d="M 77 56 A 36 36 0 0 1 23 56"
              fill="none"
              stroke={`url(#arrowGrad-${uniqueId})`}
              strokeWidth="3.2"
              strokeLinecap="round"
            />
            <polygon
              points="22,61 16,53 25,52"
              fill="#D8B4FE"
              filter={`url(#shadow-${uniqueId})`}
            />
          </g>

          {/* Central 3D Glossy "M" Symbol */}
          <g filter={`url(#shadow-${uniqueId})`}>
            {/* 3D Shadow Layer for Depth */}
            <path
              d="M 27 68 L 27 34 L 39 52 L 50 38 L 61 52 L 73 34 L 73 68 L 64 68 L 64 48 L 54 62 L 46 62 L 36 48 L 36 68 Z"
              fill="#160D29"
              transform="translate(0, 1.8)"
              opacity="0.75"
            />

            {/* Main Glossy Facet of M */}
            <path
              d="M 27 67 L 27 33 L 39 51 L 50 37 L 61 51 L 73 33 L 73 67 L 64 67 L 64 47 L 54 61 L 46 61 L 36 47 L 36 67 Z"
              fill={`url(#mGrad-${uniqueId})`}
              stroke="#E9D5FF"
              strokeWidth="1"
              strokeLinejoin="round"
            />

            {/* Left Diagonal Highlight */}
            <path
              d="M 27 33 L 39 51 L 43 47 L 31 33 Z"
              fill="#FFFFFF"
              opacity="0.45"
            />

            {/* Center Peak Highlight */}
            <circle cx="50" cy="37" r="2.2" fill="#FFFFFF" opacity="0.8" />
          </g>
        </svg>
      </div>

      {/* Brand Text Typography */}
      {showText && (
        <div className="mt-2 text-center flex flex-col items-center">
          <span className="font-black tracking-[0.25em] text-xs sm:text-sm uppercase bg-gradient-to-r from-white via-purple-100 to-purple-300 bg-clip-text text-transparent drop-shadow-sm font-sans">
            MORAJAWS
          </span>
          {textSubtitle && (
            <span className="text-[9.5px] font-medium tracking-wider text-purple-300/80 uppercase mt-0.5">
              {textSubtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
