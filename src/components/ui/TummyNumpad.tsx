'use client';

import { motion } from 'framer-motion';
import { tummyTheme as theme } from './theme';

interface TummyNumpadProps {
  value: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  label: string;
  unit?: string;
  maxLength?: number;
}

export function TummyNumpad({
  value,
  onChange,
  onConfirm,
  label,
  unit,
  maxLength = 5
}: TummyNumpadProps) {
  const handleNumberClick = (num: string) => {
    if (value.length >= maxLength) return;
    onChange(value + num);
  };

  const handleBackspace = () => {
    onChange(value.slice(0, -1));
  };

  const handleClear = () => {
    onChange('');
  };

  return (
    <motion.div 
      className="w-full max-w-sm mx-auto"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
    >
      {/* Display */}
      <div className="mb-4">
        <motion.label 
          className="block text-sm font-medium opacity-70 mb-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
        >
          {label}
        </motion.label>
        <motion.div 
          className="text-3xl font-mono p-4 rounded-lg text-center"
          style={{ 
            backgroundColor: theme.colors.background.DEFAULT,
            color: theme.colors.background.foreground,
          }}
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          whileTap={{ scale: 0.98 }}
        >
          {value || '0'}
          {unit && <span className="text-lg ml-2 opacity-70">{unit}</span>}
        </motion.div>
      </div>

      {/* Numpad Grid */}
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <motion.button
            key={num}
            onClick={() => handleNumberClick(num.toString())}
            className="p-6 text-2xl font-mono rounded-lg"
            style={{
              backgroundColor: theme.colors.background.DEFAULT,
              color: theme.colors.background.foreground,
            }}
            whileTap={{ scale: 0.95 }}
          >
            {num}
          </motion.button>
        ))}
        <motion.button
          onClick={handleClear}
          className="p-6 text-xl font-mono rounded-lg"
          style={{
            backgroundColor: theme.colors.background.DEFAULT,
            color: theme.colors.secondary.DEFAULT,
          }}
          whileTap={{ scale: 0.95 }}
        >
          C
        </motion.button>
        <motion.button
          onClick={() => handleNumberClick('0')}
          className="p-6 text-2xl font-mono rounded-lg"
          style={{
            backgroundColor: theme.colors.background.DEFAULT,
            color: theme.colors.background.foreground,
          }}
          whileTap={{ scale: 0.95 }}
        >
          0
        </motion.button>
        <motion.button
          onClick={handleBackspace}
          className="p-6 text-xl font-mono rounded-lg"
          style={{
            backgroundColor: theme.colors.background.DEFAULT,
            color: theme.colors.secondary.DEFAULT,
          }}
          whileTap={{ scale: 0.95 }}
        >
          ←
        </motion.button>
      </div>

      {/* Confirm Button */}
      <motion.button
        onClick={onConfirm}
        className="w-full mt-4 p-4 text-lg font-mono rounded-lg"
        style={{
          backgroundColor: theme.colors.accent.DEFAULT,
          color: theme.colors.accent.foreground,
        }}
        whileTap={{ scale: 0.98 }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        Confirm
      </motion.button>
    </motion.div>
  );
} 