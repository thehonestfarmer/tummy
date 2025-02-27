'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TummyCard } from '../../components/ui/TummyCard';
import { TummyButton } from '../../components/ui/TummyButton';
import { db, type FoodItem } from '../../lib/db';
import { tummyTheme as theme } from '../../components/ui/theme';

interface FoodItemWithPhotos extends FoodItem {
  photos: { photoData: string }[];
}

export default function AdminPage() {
  const [foodItems, setFoodItems] = useState<FoodItemWithPhotos[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadFoodItems = async () => {
      setIsLoading(true);
      try {
        const items = await db.getAllFoodItems();
        
        // Load photos for each food item
        const itemsWithPhotos = await Promise.all(
          items.map(async (item) => {
            const photos = await db.getPhotosByFoodId(item.id);
            return {
              ...item,
              photos,
            };
          })
        );

        // Sort by most recently created
        itemsWithPhotos.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        setFoodItems(itemsWithPhotos);
      } catch (error) {
        console.error('Failed to load food items:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadFoodItems();
  }, []);

  const handleClearDatabase = async () => {
    if (window.confirm('Are you sure you want to clear all data? This cannot be undone.')) {
      try {
        await db.clearAllTables();
        setFoodItems([]);
      } catch (error) {
        console.error('Failed to clear database:', error);
        alert('Failed to clear database. Please try again.');
      }
    }
  };

  return (
    <div className="p-4 pb-24 max-w-3xl mx-auto space-y-6">
      <header className="text-center mb-8">
        <h1 
          className="text-2xl font-bold mb-2 font-mono"
          style={{ color: theme.colors.primary.DEFAULT }}
        >
          Admin Dashboard
        </h1>
        <p className="text-sm opacity-70">Manage Food Database</p>
      </header>

      <TummyCard
        header={
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold font-mono">Food Items ({foodItems.length})</h2>
            <TummyButton
              variant="secondary"
              onClick={handleClearDatabase}
            >
              Clear Database
            </TummyButton>
          </div>
        }
      >
        {isLoading ? (
          <div className="text-center py-8 opacity-70">Loading...</div>
        ) : foodItems.length > 0 ? (
          <div className="space-y-4">
            <AnimatePresence>
              {foodItems.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="p-4 rounded"
                  style={{ backgroundColor: theme.colors.background.DEFAULT }}
                >
                  {/* Header with timestamp and barcode */}
                  <div className="flex justify-between items-start mb-4">
                    <div className="space-y-1">
                      <span className="text-sm font-mono opacity-70">
                        Created: {new Date(item.createdAt).toLocaleString()}
                      </span>
                      <div className="text-sm font-mono opacity-70">
                        Barcode: {item.barcode}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-mono" style={{ color: theme.colors.primary.DEFAULT }}>
                        ID: {item.id.slice(0, 8)}
                      </div>
                    </div>
                  </div>

                  {/* Photos Grid */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {item.photos.map((photo, index) => (
                      <div
                        key={index}
                        className="aspect-square rounded overflow-hidden"
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

                  {/* Nutrition Info Grid */}
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="block opacity-70">Serving Size</span>
                      <span className="font-mono">{item.servingSize}</span>
                    </div>
                    <div>
                      <span className="block opacity-70">Per Container</span>
                      <span className="font-mono">{item.servingsPerContainer}</span>
                    </div>
                    <div>
                      <span className="block opacity-70">Calories</span>
                      <span className="font-mono">{item.calories}</span>
                    </div>
                    <div>
                      <span className="block opacity-70">Protein</span>
                      <span className="font-mono">{item.protein}g</span>
                    </div>
                    <div>
                      <span className="block opacity-70">Carbs</span>
                      <span className="font-mono">{item.carbohydrates}g</span>
                    </div>
                    <div>
                      <span className="block opacity-70">Sugar</span>
                      <span className="font-mono">{item.sugar}g</span>
                    </div>
                    <div>
                      <span className="block opacity-70">Fiber</span>
                      <span className="font-mono">{item.fiber}g</span>
                    </div>
                    <div>
                      <span className="block opacity-70">Fat</span>
                      <span className="font-mono">{item.fat}g</span>
                    </div>
                    <div>
                      <span className="block opacity-70">Sodium</span>
                      <span className="font-mono">{item.sodium}mg</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="text-center py-8 opacity-70">
            No food items in database.
          </div>
        )}
      </TummyCard>
    </div>
  );
} 