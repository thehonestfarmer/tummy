'use client';

import { useMemo } from 'react';
import { tummyTheme as theme } from './theme';
import { TummyCard } from './TummyCard';
import { TummyStats } from './TummyStats';
import type { ConsumptionRecord, FoodItem } from '../../lib/db';

interface TummyTimelineProps {
  consumptions: (ConsumptionRecord & { foodItem: FoodItem })[];
  timeRanges: {
    label: string;
    startTime: Date;
    endTime: Date;
  }[];
}

export function TummyTimeline({ consumptions, timeRanges }: TummyTimelineProps) {
  const stats = useMemo(() => {
    const totals = {
      calories: 0,
      protein: 0,
      carbohydrates: 0,
      fat: 0,
    };

    consumptions.forEach(({ foodItem, servingsConsumed }) => {
      totals.calories += foodItem.calories * servingsConsumed;
      totals.protein += foodItem.protein * servingsConsumed;
      totals.carbohydrates += foodItem.carbohydrates * servingsConsumed;
      totals.fat += foodItem.fat * servingsConsumed;
    });

    return [
      { label: 'Calories', value: Math.round(totals.calories), color: theme.colors.primary.DEFAULT },
      { label: 'Protein', value: Math.round(totals.protein), unit: 'g', color: theme.colors.secondary.DEFAULT },
      { label: 'Carbs', value: Math.round(totals.carbohydrates), unit: 'g', color: theme.colors.accent.DEFAULT },
      { label: 'Fat', value: Math.round(totals.fat), unit: 'g', color: '#ff6b6b' },
    ];
  }, [consumptions]);

  const timelineGroups = useMemo(() => {
    return timeRanges.map(range => ({
      ...range,
      items: consumptions.filter(
        consumption => 
          consumption.timestamp >= range.startTime && 
          consumption.timestamp <= range.endTime
      ),
    }));
  }, [consumptions, timeRanges]);

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: true,
    }).format(date);
  };

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <TummyStats items={stats} />

      {/* Timeline */}
      <div className="space-y-8">
        {timelineGroups.map((group, groupIndex) => (
          <div key={groupIndex}>
            <h3 
              className="text-sm font-mono uppercase mb-4"
              style={{ color: theme.colors.primary.DEFAULT }}
            >
              {group.label}
            </h3>

            <div className="space-y-4">
              {group.items.length > 0 ? (
                group.items.map((consumption, itemIndex) => (
                  <TummyCard
                    key={consumption.id}
                    className="relative"
                  >
                    {/* Time indicator */}
                    <div 
                      className="absolute -left-2 top-4 w-4 h-4 rounded-full"
                      style={{ 
                        backgroundColor: theme.colors.primary.DEFAULT,
                        boxShadow: theme.effects.glowPrimary,
                      }}
                    />

                    <div className="ml-4">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold">
                          {consumption.foodItem.name || 'Unnamed Product'}
                        </h4>
                        <span 
                          className="text-sm font-mono"
                          style={{ color: theme.colors.primary.DEFAULT }}
                        >
                          {formatTime(consumption.timestamp)}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="block opacity-70">Servings</span>
                          <span className="font-mono">{consumption.servingsConsumed}</span>
                        </div>
                        <div>
                          <span className="block opacity-70">Calories</span>
                          <span className="font-mono">
                            {Math.round(consumption.foodItem.calories * consumption.servingsConsumed)}
                          </span>
                        </div>
                        <div>
                          <span className="block opacity-70">Protein</span>
                          <span className="font-mono">
                            {Math.round(consumption.foodItem.protein * consumption.servingsConsumed)}g
                          </span>
                        </div>
                        <div>
                          <span className="block opacity-70">Carbs</span>
                          <span className="font-mono">
                            {Math.round(consumption.foodItem.carbohydrates * consumption.servingsConsumed)}g
                          </span>
                        </div>
                      </div>

                      {consumption.location && (
                        <div 
                          className="mt-2 text-xs"
                          style={{ color: theme.colors.muted.foreground }}
                        >
                          📍 {consumption.location.latitude.toFixed(6)}, {consumption.location.longitude.toFixed(6)}
                        </div>
                      )}
                    </div>
                  </TummyCard>
                ))
              ) : (
                <div 
                  className="text-center py-8 rounded"
                  style={{ 
                    backgroundColor: theme.colors.muted.DEFAULT,
                    color: theme.colors.muted.foreground,
                  }}
                >
                  No consumption records for this period
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 