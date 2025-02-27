'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';
import { tummyTheme as theme } from './theme';

interface TummyButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  glowing?: boolean;
}

const TummyButton = forwardRef<HTMLButtonElement, TummyButtonProps>(
  ({ children, variant = 'primary', size = 'md', glowing = false, className = '', ...props }, ref) => {
    const getVariantStyles = () => {
      const variants = {
        primary: {
          bg: theme.colors.primary.DEFAULT,
          text: theme.colors.primary.foreground,
          glow: theme.effects.glowPrimary,
        },
        secondary: {
          bg: theme.colors.secondary.DEFAULT,
          text: theme.colors.secondary.foreground,
          glow: theme.effects.glowSecondary,
        },
        accent: {
          bg: theme.colors.accent.DEFAULT,
          text: theme.colors.accent.foreground,
          glow: `0 0 10px ${theme.colors.accent.DEFAULT}`,
        },
      };
      return variants[variant];
    };

    const getSizeStyles = () => {
      const sizes = {
        sm: 'px-3 py-1 text-sm',
        md: 'px-4 py-2 text-base',
        lg: 'px-6 py-3 text-lg',
      };
      return sizes[size];
    };

    const variantStyles = getVariantStyles();

    return (
      <button
        ref={ref}
        className={`
          relative overflow-hidden
          font-mono uppercase tracking-wider
          transition-all duration-200
          ${getSizeStyles()}
          ${className}
        `}
        style={{
          backgroundColor: variantStyles.bg,
          color: variantStyles.text,
          boxShadow: glowing ? variantStyles.glow : 'none',
          clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
        }}
        {...props}
      >
        {/* Hover overlay */}
        <div
          className="absolute inset-0 opacity-0 hover:opacity-20 transition-opacity duration-200"
          style={{
            backgroundImage: theme.effects.scanline,
            backgroundSize: '100% 4px',
          }}
        />
        
        {/* Button content */}
        <div className="relative z-10">
          {children}
        </div>
      </button>
    );
  }
);

TummyButton.displayName = 'TummyButton';

export { TummyButton }; 