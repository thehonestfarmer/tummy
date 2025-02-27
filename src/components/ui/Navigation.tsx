'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { HomeIcon, ScanIcon, ClockIcon } from 'lucide-react';
import { tummyTheme as theme } from './theme';

export function Navigation() {
  const pathname = usePathname();
  
  // Hide navigation on scan route
  if (pathname === '/scan') {
    return null;
  }

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 h-16 border-t border-cyan-500/30"
      style={{ 
        backgroundColor: 'rgba(17, 17, 23, 0.85)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 -4px 20px rgba(6, 182, 212, 0.15)',
      }}
    >
      <div className="max-w-lg mx-auto h-full flex justify-around items-center">
        <Link 
          href="/" 
          className="p-3 rounded transition-all hover:bg-cyan-500/10 relative group"
        >
          <div className="absolute inset-0 bg-cyan-500 opacity-0 group-hover:opacity-10 rounded transition-opacity" />
          <HomeIcon 
            className="w-6 h-6 transition-colors" 
            style={{ 
              color: theme.colors.primary.DEFAULT,
              filter: 'drop-shadow(0 0 4px rgba(6, 182, 212, 0.4))'
            }}
          />
        </Link>
        <Link 
          href="/scan" 
          className="p-3 rounded transition-all hover:bg-cyan-500/10 relative group"
        >
          <div className="absolute inset-0 bg-cyan-500 opacity-0 group-hover:opacity-10 rounded transition-opacity" />
          <ScanIcon 
            className="w-6 h-6 transition-colors" 
            style={{ 
              color: theme.colors.accent.DEFAULT,
              filter: 'drop-shadow(0 0 4px rgba(6, 182, 212, 0.4))'
            }}
          />
        </Link>
        <Link 
          href="/history" 
          className="p-3 rounded transition-all hover:bg-cyan-500/10 relative group"
        >
          <div className="absolute inset-0 bg-cyan-500 opacity-0 group-hover:opacity-10 rounded transition-opacity" />
          <ClockIcon 
            className="w-6 h-6 transition-colors" 
            style={{ 
              color: theme.colors.secondary.DEFAULT,
              filter: 'drop-shadow(0 0 4px rgba(6, 182, 212, 0.4))'
            }}
          />
        </Link>
      </div>
    </nav>
  );
} 