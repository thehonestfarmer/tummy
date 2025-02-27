'use client';

import { ReactNode } from 'react';
import { tummyTheme as theme } from './theme';

interface TummyCardProps {
  children: ReactNode;
  className?: string;
  glowing?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
}

const TummyCard = ({ 
  children, 
  className = '', 
  glowing = false,
  header,
  footer
}: TummyCardProps) => {
  return (
    <div 
      className={`
        relative overflow-hidden
        ${className}
      `}
      style={{
        backgroundColor: theme.colors.muted.DEFAULT,
        clipPath: 'polygon(15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%, 0 15px)',
        boxShadow: glowing ? `0 0 20px ${theme.colors.accent.DEFAULT}` : 'none',
      }}
    >
      {/* Border effect */}
      <div 
        className="absolute inset-0 z-0"
        style={{
          background: `linear-gradient(45deg, ${theme.colors.primary.DEFAULT}, ${theme.colors.accent.DEFAULT})`,
          opacity: 0.5,
        }}
      />

      {/* Content container */}
      <div 
        className="relative z-10 m-[1px] bg-muted"
        style={{
          backgroundColor: theme.colors.muted.DEFAULT,
          clipPath: 'polygon(15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%, 0 15px)',
        }}
      >
        {/* Header */}
        {header && (
          <div 
            className="p-4 border-b"
            style={{
              borderColor: `${theme.colors.accent.DEFAULT}33`, // 33 is 20% opacity in hex
            }}
          >
            {header}
          </div>
        )}

        {/* Main content */}
        <div className="p-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div 
            className="p-4 border-t"
            style={{
              borderColor: `${theme.colors.accent.DEFAULT}33`, // 33 is 20% opacity in hex
            }}
          >
            {footer}
          </div>
        )}
      </div>

      {/* Corner accents */}
      <div 
        className="absolute top-0 left-0 w-3 h-3"
        style={{
          background: theme.colors.primary.DEFAULT,
        }}
      />
      <div 
        className="absolute bottom-0 right-0 w-3 h-3"
        style={{
          background: theme.colors.accent.DEFAULT,
        }}
      />
    </div>
  );
};

TummyCard.displayName = 'TummyCard';

export { TummyCard }; 