'use client';

import { useEffect, useState } from 'react';
import { TummyCard } from '../components/ui/TummyCard';
import { TummyStats } from '../components/ui/TummyStats';
import { TummyButton } from '../components/ui/TummyButton';
import { db, type ConsumptionRecord, type FoodItem } from '../lib/db';
import { tummyTheme as theme } from '../components/ui/theme';
import Link from 'next/link';
import { motion } from 'framer-motion';

type TimeFilter = '4h' | '12h' | '24h';

export default function Home() {
  const [recentConsumptions, setRecentConsumptions] = useState<(ConsumptionRecord & { 
    foodItem: FoodItem;
    photos: { photoData: string }[];
  })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newItemsCount, setNewItemsCount] = useState(0);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('24h');

  const loadRecentData = async (filter: TimeFilter) => {
    setIsLoading(true);
    try {
      // Get consumptions based on time filter
      const endTime = new Date();
      const hours = filter === '4h' ? 4 : filter === '12h' ? 12 : 24;
      const startTime = new Date(endTime.getTime() - (hours * 60 * 60 * 1000));
      const consumptions = await db.getConsumptionsByTimeRange(startTime, endTime);
      
      // Load food items and photos for each consumption
      const consumptionsWithFood = await Promise.all(
        consumptions.map(async (consumption) => {
          const foodItem = await db.findFoodById(consumption.foodItemId);
          const photos = await db.getPhotosByFoodId(consumption.foodItemId);
          return {
            ...consumption,
            foodItem: foodItem!,
            photos,
          };
        })
      );

      // Get all food items created in the last 24 hours (this stays at 24h)
      const allFoodItems = await db.getAllFoodItems();
      const newItems = allFoodItems.filter(item => 
        new Date(item.createdAt).getTime() > startTime.getTime()
      );

      setRecentConsumptions(consumptionsWithFood);
      setNewItemsCount(newItems.length);
    } catch (error) {
      console.error('Failed to load recent consumptions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRecentData(timeFilter);
  }, [timeFilter]);

  // Get start and end of current calendar day
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  // Format date as M/D/YYYY
  const formattedDate = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;

  // Calculate totals for current calendar day only
  const todaysConsumptions = recentConsumptions.filter(consumption => {
    const consumptionDate = new Date(consumption.timestamp);
    return consumptionDate >= startOfDay && consumptionDate <= endOfDay;
  });

  const stats = [
    {
      label: 'Calories',
      value: todaysConsumptions.reduce(
        (total, { foodItem = { calories: 0 }, servingsConsumed }) => 
          total + ((foodItem?.calories ?? 0) * servingsConsumed), 
        0
      ),
      color: theme.colors.primary.DEFAULT,
      backgroundColor: `${theme.colors.primary.DEFAULT}15`,
    },
    {
      label: 'Protein',
      value: todaysConsumptions.reduce(
        (total, { foodItem = { protein: 0 }, servingsConsumed }) => 
          total + ((foodItem?.protein ?? 0) * servingsConsumed), 
        0
      ),
      unit: 'g',
      color: theme.colors.secondary.DEFAULT,
      backgroundColor: `${theme.colors.secondary.DEFAULT}15`,
    }
  ];

  return (
    <div className="p-4 pb-24 max-w-lg mx-auto space-y-6">
      <header className="text-center mb-8">
        <h1 
          className="text-4xl font-bold mb-2 font-mono"
          style={{ 
            color: theme.colors.primary.DEFAULT,
            textShadow: '0 0 10px rgba(124, 58, 237, 0.2)'
          }}
        >
          TUMMY
        </h1>
        <p className="text-sm font-mono" style={{ color: theme.colors.secondary.DEFAULT }}>
          {formattedDate}
        </p>
      </header>

      {/* Stats Overview */}
      <TummyStats items={stats} />

      {/* Quick Actions */}
      <TummyCard
        header={
          <h2 className="text-lg font-semibold font-mono">Quick Actions</h2>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Link href="/scan" className="block">
            <TummyButton variant="accent" className="w-full" glowing>
              Scan Item
            </TummyButton>
          </Link>
          <Link href="/add" className="block">
            <TummyButton variant="secondary" className="w-full">
              Add Item
            </TummyButton>
          </Link>
        </div>
      </TummyCard>

      {/* Recent Activity */}
      <TummyCard
        header={
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold font-mono">Recent Activity</h2>
            <div className="flex gap-2">
              {(['4h', '12h', '24h'] as TimeFilter[]).map((filter) => (
                <motion.button
                  key={filter}
                  onClick={() => setTimeFilter(filter)}
                  className="px-2 py-1 rounded text-sm font-mono"
                  style={{
                    backgroundColor: timeFilter === filter 
                      ? theme.colors.primary.DEFAULT 
                      : theme.colors.background.DEFAULT,
                    color: timeFilter === filter
                      ? theme.colors.primary.foreground
                      : theme.colors.background.foreground,
                  }}
                  whileTap={{ scale: 0.95 }}
                >
                  {filter}
                </motion.button>
              ))}
            </div>
          </div>
        }
      >
        {isLoading ? (
          <div className="text-center py-8 opacity-70">Loading...</div>
        ) : recentConsumptions.length > 0 ? (
          <div className="space-y-4">
            {recentConsumptions.slice(0, 3).map((consumption) => (
              <div 
                key={consumption.id}
                className="p-3 rounded"
                style={{ backgroundColor: theme.colors.background.DEFAULT }}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex gap-2">
                    {consumption.photos.map((photo, index) => (
                      <div 
                        key={index}
                        className="w-12 h-12 rounded overflow-hidden"
                        style={{ backgroundColor: `${theme.colors.primary.DEFAULT}22` }}
                      >
                        <img
                          src={photo.photoData}
                          alt={`Product photo ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                  <span 
                    className="text-sm font-mono"
                    style={{ color: theme.colors.primary.DEFAULT }}
                  >
                    {new Date(consumption.timestamp).toLocaleTimeString()}
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
                      {Math.round((consumption.foodItem?.calories ?? 0) * consumption.servingsConsumed)}
                    </span>
                  </div>
                  <div>
                    <span className="block opacity-70">Protein</span>
                    <span className="font-mono">
                      {Math.round((consumption.foodItem?.protein ?? 0) * consumption.servingsConsumed)}g
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 opacity-70">
            No activity in the last {timeFilter === '4h' ? '4 hours' : timeFilter === '12h' ? '12 hours' : '24 hours'}.
            {timeFilter !== '24h' && ' Try a longer time range.'}
          </div>
        )}
      </TummyCard>
    </div>
  );
}
