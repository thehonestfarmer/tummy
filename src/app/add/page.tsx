'use client';

import { useEffect, useState } from 'react';
import { TummyCard } from '../../components/ui/TummyCard';
import { db, type FoodItem } from '../../lib/db';
import { tummyTheme as theme } from '../../components/ui/theme';
import { Input } from '../../components/ui/Input';
import { motion } from 'framer-motion';

export default function AddItemPage() {
  const [frequentItems, setFrequentItems] = useState<(FoodItem & { photos: { photoData: string }[] })[]>([]);
  const [allItems, setAllItems] = useState<(FoodItem & { photos: { photoData: string }[] })[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // Get all food items with their consumption counts
        const items = await db.getAllFoodItems();
        const itemsWithPhotos = await Promise.all(
          items.map(async (item) => {
            const photos = await db.getPhotosByFoodId(item.id);
            return { ...item, photos };
          })
        );

        // Get consumption records to determine frequency
        const consumptions = await db.getAllConsumptions();
        const itemFrequency = consumptions.reduce((acc, curr) => {
          acc[curr.foodItemId] = (acc[curr.foodItemId] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        // Sort items by frequency
        const sortedItems = [...itemsWithPhotos].sort(
          (a, b) => (itemFrequency[b.id] || 0) - (itemFrequency[a.id] || 0)
        );

        setFrequentItems(sortedItems.slice(0, 10)); // Top 10 most frequent items
        setAllItems(itemsWithPhotos);
      } catch (error) {
        console.error('Failed to load food items:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const filteredItems = allItems.filter(item =>
    (item.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-4 pb-24 max-w-lg mx-auto space-y-6">
      <header className="text-center mb-8">
        <h1 
          className="text-2xl font-bold mb-2 font-mono"
          style={{ color: theme.colors.primary.DEFAULT }}
        >
          Add Item
        </h1>
      </header>

      {/* Frequent Items */}
      <TummyCard
        header={
          <h2 className="text-lg font-semibold font-mono">Frequently Used</h2>
        }
      >
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4" style={{ minWidth: 'min-content' }}>
            {frequentItems.map((item) => (
              <div
                key={item.id}
                className="flex-shrink-0 w-32 p-2 rounded cursor-pointer transition-transform hover:scale-105"
                style={{ backgroundColor: theme.colors.background.DEFAULT }}
              >
                <div 
                  className="w-full h-32 rounded mb-2 overflow-hidden"
                  style={{ backgroundColor: `${theme.colors.primary.DEFAULT}22` }}
                >
                  {item.photos[0] && (
                    <img
                      src={item.photos[0].photoData}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="text-sm">
                  <div className="font-semibold truncate">{item.name}</div>
                  <div className="opacity-70">{item.calories} cal/serving</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </TummyCard>

      {/* Search and All Items */}
      <TummyCard
        header={
          <div className="space-y-4">
            <h2 className="text-lg font-semibold font-mono">All Items</h2>
            <Input
              type="search"
              placeholder="Search items..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            />
          </div>
        }
      >
        {isLoading ? (
          <div className="text-center py-8 opacity-70">Loading...</div>
        ) : filteredItems.length > 0 ? (
          <div className="space-y-4">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="flex gap-4 p-3 rounded cursor-pointer"
                style={{ backgroundColor: theme.colors.background.DEFAULT }}
              >
                <div 
                  className="w-16 h-16 rounded overflow-hidden flex-shrink-0"
                  style={{ backgroundColor: `${theme.colors.primary.DEFAULT}22` }}
                >
                  {item.photos[0] && (
                    <img
                      src={item.photos[0].photoData}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="flex-grow">
                  <div className="font-semibold">{item.name}</div>
                  <div className="text-sm opacity-70">
                    {item.calories} calories per serving
                  </div>
                  {item.protein > 0 && (
                    <div className="text-sm opacity-70">
                      {item.protein}g protein per serving
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 opacity-70">
            No items found matching your search.
          </div>
        )}
      </TummyCard>
    </div>
  );
} 