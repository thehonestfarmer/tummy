'use client';

import { ReactNode } from 'react';
import { tummyTheme as theme } from './theme';

interface TummyLayoutProps {
  children: ReactNode;
  className?: string;
}

export function TummyLayout({ children, className = '' }: TummyLayoutProps) {
  return (
    <div 
      className={`min-h-screen bg-background text-background-foreground relative ${className}`}
      style={{ 
        backgroundColor: theme.colors.background.DEFAULT,
        color: theme.colors.background.foreground,
        fontFamily: theme.fonts.sans,
      }}
    >
      {/* Grid background */}
      <div 
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: theme.effects.grid,
          backgroundSize: '30px 30px',
          opacity: 0.1,
        }}
      />

      {/* Scanline effect */}
      <div 
        className="absolute inset-0 z-10 pointer-events-none"
        style={{
          backgroundImage: theme.effects.scanline,
          backgroundSize: '100% 4px',
          animation: 'scanline 10s linear infinite',
          opacity: 0.1,
        }}
      />

      {/* Content */}
      <div className="relative z-20">
        {children}
      </div>

      {/* Global styles */}
      <style jsx global>{`
        @keyframes scanline {
          0% {
            transform: translateY(0);
          }
          100% {
            transform: translateY(100%);
          }
        }

        /* Custom scrollbar */
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        ::-webkit-scrollbar-track {
          background: ${theme.colors.muted.DEFAULT};
        }

        ::-webkit-scrollbar-thumb {
          background: ${theme.colors.primary.DEFAULT};
          border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: ${theme.colors.accent.DEFAULT};
        }

        /* Selection */
        ::selection {
          background: ${theme.colors.primary.DEFAULT};
          color: ${theme.colors.primary.foreground};
        }
      `}</style>
    </div>
  );
} 