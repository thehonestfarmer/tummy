import { InputHTMLAttributes } from 'react';
import { tummyTheme as theme } from './theme';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export function Input({ className = '', error, ...props }: InputProps) {
  return (
    <div className="w-full">
      <input
        className={`w-full px-4 py-2 rounded border transition-colors focus:outline-none ${className}`}
        style={{
          backgroundColor: theme.colors.background.DEFAULT,
          borderColor: error ? theme.colors.error : theme.colors.primary.DEFAULT,
          color: theme.colors.background.foreground,
        }}
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm" style={{ color: theme.colors.error }}>
          {error}
        </p>
      )}
    </div>
  );
} 