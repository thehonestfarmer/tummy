'use client';

import { useState, useEffect } from 'react';
import type { FoodItem } from '../lib/db';
import type { NutritionMatch } from '../lib/nutritionParser';
import { tummyTheme as theme } from './ui/theme';
import { TummyCard } from './ui/TummyCard';
import { TummyButton } from './ui/TummyButton';

interface NutritionFormProps {
  barcode: string;
  initialData?: string;
  parsedData?: NutritionMatch | null;
  onSave: (data: Omit<FoodItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}

export default function NutritionForm({ barcode, initialData, parsedData, onSave, onCancel }: NutritionFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    servingSize: '',
    servingsPerContainer: '',
    calories: '',
    protein: '',
    carbohydrates: '',
    sugar: '',
    fiber: '',
    fat: '',
    sodium: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Update form when parsed data changes
  useEffect(() => {
    if (parsedData) {
      setFormData({
        name: parsedData.name || '',
        servingSize: parsedData.servingSize || '',
        servingsPerContainer: parsedData.servingsPerContainer || '',
        calories: parsedData.calories?.toString() || '',
        protein: parsedData.protein?.toString() || '',
        carbohydrates: parsedData.carbohydrates?.toString() || '',
        sugar: parsedData.sugar?.toString() || '',
        fiber: parsedData.fiber?.toString() || '',
        fat: parsedData.fat?.toString() || '',
        sodium: parsedData.sodium?.toString() || '',
      });
    }
  }, [parsedData]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    // Required fields
    if (!formData.servingSize) {
      newErrors.servingSize = 'Serving size is required';
    }
    if (!formData.servingsPerContainer) {
      newErrors.servingsPerContainer = 'Servings per container is required';
    }
    if (!formData.calories || Number(formData.calories) <= 0) {
      newErrors.calories = 'Valid calories are required';
    }
    if (!formData.protein || Number(formData.protein) < 0) {
      newErrors.protein = 'Valid protein amount is required';
    }
    if (!formData.carbohydrates || Number(formData.carbohydrates) < 0) {
      newErrors.carbohydrates = 'Valid carbohydrates amount is required';
    }
    if (!formData.sugar || Number(formData.sugar) < 0) {
      newErrors.sugar = 'Valid sugar amount is required';
    }
    if (!formData.fiber || Number(formData.fiber) < 0) {
      newErrors.fiber = 'Valid fiber amount is required';
    }
    if (!formData.fat || Number(formData.fat) < 0) {
      newErrors.fat = 'Valid fat amount is required';
    }
    if (!formData.sodium || Number(formData.sodium) < 0) {
      newErrors.sodium = 'Valid sodium amount is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    onSave({
      barcode,
      name: formData.name,
      servingSize: formData.servingSize,
      servingsPerContainer: formData.servingsPerContainer,
      calories: Number(formData.calories) || 0,
      protein: Number(formData.protein) || 0,
      carbohydrates: Number(formData.carbohydrates) || 0,
      sugar: Number(formData.sugar) || 0,
      fiber: Number(formData.fiber) || 0,
      fat: Number(formData.fat) || 0,
      sodium: Number(formData.sodium) || 0,
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error when field is modified
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4">
      <TummyCard className="w-full max-w-lg">
        <div className="p-4 border-b" style={{ borderColor: `${theme.colors.accent.DEFAULT}33` }}>
          <h3 className="text-lg font-semibold font-mono">Enter Nutrition Information</h3>
          <p className="text-sm opacity-70">Barcode: {barcode}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium opacity-70">
                Product Name (Optional)
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-0 bg-muted p-2 font-mono"
                style={{ 
                  backgroundColor: theme.colors.background.DEFAULT,
                  color: theme.colors.background.foreground,
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium opacity-70">
                  Serving Size*
                </label>
                <input
                  type="text"
                  name="servingSize"
                  value={formData.servingSize}
                  onChange={handleChange}
                  className={`mt-1 block w-full rounded-md border-0 bg-muted p-2 font-mono ${errors.servingSize ? 'ring-2 ring-red-500' : ''}`}
                  style={{ 
                    backgroundColor: theme.colors.background.DEFAULT,
                    color: theme.colors.background.foreground,
                  }}
                />
                {errors.servingSize && (
                  <p className="text-xs mt-1" style={{ color: theme.colors.secondary.DEFAULT }}>{errors.servingSize}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium opacity-70">
                  Servings Per Container*
                </label>
                <input
                  type="text"
                  name="servingsPerContainer"
                  value={formData.servingsPerContainer}
                  onChange={handleChange}
                  className={`mt-1 block w-full rounded-md border-0 bg-muted p-2 font-mono ${errors.servingsPerContainer ? 'ring-2 ring-red-500' : ''}`}
                  style={{ 
                    backgroundColor: theme.colors.background.DEFAULT,
                    color: theme.colors.background.foreground,
                  }}
                />
                {errors.servingsPerContainer && (
                  <p className="text-xs mt-1" style={{ color: theme.colors.secondary.DEFAULT }}>{errors.servingsPerContainer}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium opacity-70">
                  Calories*
                </label>
                <input
                  type="number"
                  name="calories"
                  value={formData.calories}
                  onChange={handleChange}
                  min="0"
                  className={`mt-1 block w-full rounded-md border-0 bg-muted p-2 font-mono ${errors.calories ? 'ring-2 ring-red-500' : ''}`}
                  style={{ 
                    backgroundColor: theme.colors.background.DEFAULT,
                    color: theme.colors.background.foreground,
                  }}
                />
                {errors.calories && (
                  <p className="text-xs mt-1" style={{ color: theme.colors.secondary.DEFAULT }}>{errors.calories}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium opacity-70">
                  Protein (g)*
                </label>
                <input
                  type="number"
                  name="protein"
                  value={formData.protein}
                  onChange={handleChange}
                  min="0"
                  className={`mt-1 block w-full rounded-md border-0 bg-muted p-2 font-mono ${errors.protein ? 'ring-2 ring-red-500' : ''}`}
                  style={{ 
                    backgroundColor: theme.colors.background.DEFAULT,
                    color: theme.colors.background.foreground,
                  }}
                />
                {errors.protein && (
                  <p className="text-xs mt-1" style={{ color: theme.colors.secondary.DEFAULT }}>{errors.protein}</p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium opacity-70">
                  Carbohydrates (g)*
                </label>
                <input
                  type="number"
                  name="carbohydrates"
                  value={formData.carbohydrates}
                  onChange={handleChange}
                  min="0"
                  className={`mt-1 block w-full rounded-md border-0 bg-muted p-2 font-mono ${errors.carbohydrates ? 'ring-2 ring-red-500' : ''}`}
                  style={{ 
                    backgroundColor: theme.colors.background.DEFAULT,
                    color: theme.colors.background.foreground,
                  }}
                />
                {errors.carbohydrates && (
                  <p className="text-xs mt-1" style={{ color: theme.colors.secondary.DEFAULT }}>{errors.carbohydrates}</p>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4 pl-4 border-l-2" style={{ borderColor: `${theme.colors.accent.DEFAULT}33` }}>
                <div>
                  <label className="block text-sm font-medium opacity-70">
                    Sugar (g)*
                  </label>
                  <input
                    type="number"
                    name="sugar"
                    value={formData.sugar}
                    onChange={handleChange}
                    min="0"
                    className={`mt-1 block w-full rounded-md border-0 bg-muted p-2 font-mono ${errors.sugar ? 'ring-2 ring-red-500' : ''}`}
                    style={{ 
                      backgroundColor: theme.colors.background.DEFAULT,
                      color: theme.colors.background.foreground,
                    }}
                  />
                  {errors.sugar && (
                    <p className="text-xs mt-1" style={{ color: theme.colors.secondary.DEFAULT }}>{errors.sugar}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium opacity-70">
                    Fiber (g)*
                  </label>
                  <input
                    type="number"
                    name="fiber"
                    value={formData.fiber}
                    onChange={handleChange}
                    min="0"
                    className={`mt-1 block w-full rounded-md border-0 bg-muted p-2 font-mono ${errors.fiber ? 'ring-2 ring-red-500' : ''}`}
                    style={{ 
                      backgroundColor: theme.colors.background.DEFAULT,
                      color: theme.colors.background.foreground,
                    }}
                  />
                  {errors.fiber && (
                    <p className="text-xs mt-1" style={{ color: theme.colors.secondary.DEFAULT }}>{errors.fiber}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium opacity-70">
                  Fat (g)*
                </label>
                <input
                  type="number"
                  name="fat"
                  value={formData.fat}
                  onChange={handleChange}
                  min="0"
                  className={`mt-1 block w-full rounded-md border-0 bg-muted p-2 font-mono ${errors.fat ? 'ring-2 ring-red-500' : ''}`}
                  style={{ 
                    backgroundColor: theme.colors.background.DEFAULT,
                    color: theme.colors.background.foreground,
                  }}
                />
                {errors.fat && (
                  <p className="text-xs mt-1" style={{ color: theme.colors.secondary.DEFAULT }}>{errors.fat}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium opacity-70">
                  Sodium (mg)*
                </label>
                <input
                  type="number"
                  name="sodium"
                  value={formData.sodium}
                  onChange={handleChange}
                  min="0"
                  className={`mt-1 block w-full rounded-md border-0 bg-muted p-2 font-mono ${errors.sodium ? 'ring-2 ring-red-500' : ''}`}
                  style={{ 
                    backgroundColor: theme.colors.background.DEFAULT,
                    color: theme.colors.background.foreground,
                  }}
                />
                {errors.sodium && (
                  <p className="text-xs mt-1" style={{ color: theme.colors.secondary.DEFAULT }}>{errors.sodium}</p>
                )}
              </div>
            </div>
          </div>

          {initialData && (
            <div className="mt-4 p-4 rounded-lg" style={{ backgroundColor: theme.colors.background.DEFAULT }}>
              <h4 className="text-sm font-medium opacity-70 mb-2">Extracted Text</h4>
              <pre className="text-xs whitespace-pre-wrap opacity-70 font-mono">{initialData}</pre>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <TummyButton
              variant="secondary"
              onClick={onCancel}
            >
              Cancel
            </TummyButton>
            <TummyButton
              variant="accent"
              type="submit"
            >
              Save
            </TummyButton>
          </div>
        </form>
      </TummyCard>
    </div>
  );
} 