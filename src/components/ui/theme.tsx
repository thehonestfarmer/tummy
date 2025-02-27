export const tummyTheme = {
  colors: {
    primary: {
      DEFAULT: '#7C3AED',
      foreground: '#FFFFFF',
    },
    secondary: {
      DEFAULT: '#EC4899',
      foreground: '#FFFFFF',
    },
    background: {
      DEFAULT: '#1F2937',
      foreground: '#FFFFFF',
    },
    muted: {
      DEFAULT: '#374151',
      foreground: '#9CA3AF',
    },
    accent: {
      DEFAULT: '#10B981',
      foreground: '#FFFFFF',
    },
    error: '#EF4444',
  },
  fonts: {
    sans: '"Rajdhani", sans-serif',
    mono: '"Share Tech Mono", monospace',
  },
  // Custom properties for our theme
  effects: {
    glowPrimary: '0 0 10px #00f5d4, 0 0 20px #00f5d4, 0 0 30px #00f5d4',
    glowSecondary: '0 0 10px #ff2a6d, 0 0 20px #ff2a6d, 0 0 30px #ff2a6d',
    scanline: 'linear-gradient(transparent 50%, rgba(0, 0, 0, .5) 50%)',
    grid: 'radial-gradient(#01c8ef 1px, transparent 1px)',
  },
} as const; 