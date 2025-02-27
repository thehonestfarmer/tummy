'use client';

import { tummyTheme as theme } from './theme';

interface TummyStatsProps {
  items: Array<{
    label: string;
    value: number;
    unit?: string;
    color: string;
    backgroundColor?: string;
  }>;
}

export function TummyStats({ items }: TummyStatsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {items.map((item, index) => (
        <div
          key={index}
          className="p-4 rounded-lg"
          style={{ 
            backgroundColor: item.backgroundColor || `${item.color}15`,
            border: `1px solid ${item.color}30`
          }}
        >
          <div 
            className="text-sm mb-1 font-medium"
            style={{ color: item.color }}
          >
            {item.label}
          </div>
          <div className="text-2xl font-bold font-mono">
            {item.value.toLocaleString()}{item.unit}
          </div>
        </div>
      ))}
    </div>
  );
}

TummyStats.displayName = 'TummyStats'; 