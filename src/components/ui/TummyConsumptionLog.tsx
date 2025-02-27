'use client';

import { useState } from 'react';
import { tummyTheme as theme } from './theme';
import { TummyCard } from './TummyCard';
import { TummyButton } from './TummyButton';
import { TummyNumpad } from './TummyNumpad';
import type { FoodItem } from '../../lib/db';

interface TummyConsumptionLogProps {
  foodItem: FoodItem;
  onLog: (servings: number) => void;
  onCancel: () => void;
}

export function TummyConsumptionLog({
  foodItem,
  onLog,
  onCancel
}: TummyConsumptionLogProps) {
  const [servings, setServings] = useState('');
  const [showNumpad, setShowNumpad] = useState(true);

  const handleComplete = () => {
    const servingsNum = parseFloat(servings);
    if (servingsNum > 0) {
      onLog(servingsNum);
    }
  };

  return (
    <div className="fixed inset-0 bg-background bg-opacity-90 flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-4">
        {/* Food Item Info */}
        <TummyCard
          header={
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold font-mono">Log Consumption</h3>
              <span 
                className="text-sm"
                style={{ color: theme.colors.primary.DEFAULT }}
              >
                {foodItem.barcode}
              </span>
            </div>
          }
        >
          <div className="space-y-2">
            <h4 className="text-xl font-bold">{foodItem.name || 'Unnamed Product'}</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="block opacity-70">Serving Size</span>
                <span className="font-mono">{foodItem.servingSize}</span>
              </div>
              <div>
                <span className="block opacity-70">Per Container</span>
                <span className="font-mono">{foodItem.servingsPerContainer}</span>
              </div>
            </div>

            <div 
              className="mt-4 p-3 rounded"
              style={{ backgroundColor: theme.colors.background.DEFAULT }}
            >
              <div className="grid grid-cols-4 gap-3 text-center">
                <div>
                  <span className="block text-sm opacity-70">Calories</span>
                  <span className="font-mono">{foodItem.calories}</span>
                </div>
                <div>
                  <span className="block text-sm opacity-70">Protein</span>
                  <span className="font-mono">{foodItem.protein}g</span>
                </div>
                <div>
                  <span className="block text-sm opacity-70">Carbs</span>
                  <span className="font-mono">{foodItem.carbohydrates}g</span>
                </div>
                <div>
                  <span className="block text-sm opacity-70">Fat</span>
                  <span className="font-mono">{foodItem.fat}g</span>
                </div>
              </div>
            </div>
          </div>
        </TummyCard>

        {/* Servings Input */}
        {showNumpad ? (
          <TummyNumpad
            label="Number of Servings"
            value={servings}
            onChange={setServings}
            onComplete={handleComplete}
            unit="servings"
            maxLength={4}
            allowDecimal={true}
          />
        ) : (
          <TummyCard>
            <div className="flex justify-between items-center">
              <div>
                <span className="block text-sm opacity-70">Servings</span>
                <span className="text-2xl font-mono">{servings || '0'}</span>
              </div>
              <TummyButton
                variant="accent"
                onClick={() => setShowNumpad(true)}
              >
                Edit
              </TummyButton>
            </div>
          </TummyCard>
        )}

        {/* Actions */}
        <div className="flex justify-between">
          <TummyButton
            variant="secondary"
            onClick={onCancel}
          >
            Cancel
          </TummyButton>
          <TummyButton
            variant="primary"
            onClick={handleComplete}
            disabled={!servings || parseFloat(servings) <= 0}
            glowing={!!servings && parseFloat(servings) > 0}
          >
            Log Consumption
          </TummyButton>
        </div>
      </div>
    </div>
  );
} 