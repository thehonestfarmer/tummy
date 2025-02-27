'use client';

import { useEffect, useState, useMemo } from 'react';
import { TummyCard } from '../../components/ui/TummyCard';
import { TummyButton } from '../../components/ui/TummyButton';
import { TummyStats } from '../../components/ui/TummyStats';
import { db, type ConsumptionRecord, type FoodItem } from '../../lib/db';
import { tummyTheme as theme } from '../../components/ui/theme';

type TimeRange = '24h' | '7d' | '30d' | 'all';

interface ConsumptionWithFood extends ConsumptionRecord {
  foodItem: FoodItem;
}

export default function HistoryPage() {
  const [consumptions, setConsumptions] = useState<ConsumptionWithFood[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState<TimeRange>('7d');

  const loadConsumptions = async (range: TimeRange) => {
    setIsLoading(true);
    try {
      const endTime = new Date();
      let startTime: Date;

      switch (range) {
        case '24h':
          startTime = new Date(endTime.getTime() - (24 * 60 * 60 * 1000));
          break;
        case '7d':
          startTime = new Date(endTime.getTime() - (7 * 24 * 60 * 60 * 1000));
          break;
        case '30d':
          startTime = new Date(endTime.getTime() - (30 * 24 * 60 * 60 * 1000));
          break;
        case 'all':
          startTime = new Date(0); // Beginning of time
          break;
      }

      const records = await db.getConsumptionsByTimeRange(startTime, endTime);
      
      // Load food items for each consumption
      const consumptionsWithFood = await Promise.all(
        records.map(async (consumption) => {
          const foodItem = await db.findFoodById(consumption.foodItemId);
          return {
            ...consumption,
            foodItem: foodItem!,
          };
        })
      );

      setConsumptions(consumptionsWithFood);
    } catch (error) {
      console.error('Failed to load consumptions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadConsumptions(selectedRange);
  }, [selectedRange]);

  const stats = useMemo(() => [
    {
      label: 'Total Calories',
      value: consumptions.reduce(
        (total, { foodItem, servingsConsumed }) => 
          total + (foodItem.calories * servingsConsumed), 
        0
      ),
      color: theme.colors.primary.DEFAULT,
    },
    {
      label: 'Total Protein',
      value: consumptions.reduce(
        (total, { foodItem, servingsConsumed }) => 
          total + (foodItem.protein * servingsConsumed), 
        0
      ),
      unit: 'g',
      color: theme.colors.secondary.DEFAULT,
    },
    {
      label: 'Items Logged',
      value: consumptions.length,
      color: theme.colors.accent.DEFAULT,
    },
  ], [consumptions]);

  const timeRanges: { value: TimeRange; label: string }[] = [
    { value: '24h', label: 'Last 24 Hours' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: 'all', label: 'All Time' },
  ];

  return (
    <div className="p-4 max-w-lg mx-auto space-y-6">
      <header className="text-center mb-8">
        <h1 
          className="text-4xl font-bold mb-2 font-mono"
          style={{ color: theme.colors.primary.DEFAULT }}
        >
          History
        </h1>
        <p className="text-sm opacity-70">Your Consumption Timeline</p>
      </header>

      {/* Time Range Selector */}
      <TummyCard>
        <div className="grid grid-cols-4 gap-2">
          {timeRanges.map(({ value, label }) => (
            <TummyButton
              key={value}
              variant={selectedRange === value ? 'accent' : 'secondary'}
              onClick={() => setSelectedRange(value)}
              className="w-full text-sm"
            >
              {label}
            </TummyButton>
          ))}
        </div>
      </TummyCard>

      {/* Stats Overview */}
      <TummyStats items={stats} />

      {/* Consumption Timeline */}
      <TummyCard
        header={
          <h2 className="text-lg font-semibold font-mono">Consumption Timeline</h2>
        }
      >
        {isLoading ? (
          <div className="text-center py-8 opacity-70">Loading...</div>
        ) : consumptions.length > 0 ? (
          <div className="space-y-4">
            {consumptions.map((consumption) => (
              <div 
                key={consumption.id}
                className="p-3 rounded"
                style={{ backgroundColor: theme.colors.background.DEFAULT }}
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold">
                    {consumption.foodItem.name || 'Unnamed Product'}
                  </h3>
                  <span 
                    className="text-sm font-mono"
                    style={{ color: theme.colors.primary.DEFAULT }}
                  >
                    {new Date(consumption.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
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
                </div>
                {consumption.location && (
                  <div className="mt-2 text-xs opacity-70">
                    📍 {consumption.location.latitude.toFixed(4)}, {consumption.location.longitude.toFixed(4)}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 opacity-70">
            No consumption records found for this time period.
          </div>
        )}
      </TummyCard>
    </div>
  );
} 