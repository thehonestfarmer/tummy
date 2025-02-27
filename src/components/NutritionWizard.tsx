'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { tummyTheme as theme } from './ui/theme';
import { TummyCard } from './ui/TummyCard';
import { TummyButton } from './ui/TummyButton';
import { TummyNumpad } from './ui/TummyNumpad';
import type { FoodItem } from '../lib/db';
import { db } from '../lib/db';

interface NutritionWizardProps {
  barcode: string;
  photos: { photoData: string }[];
  onSave: (data: Omit<FoodItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onComplete: () => void;
  onCancel: () => void;
}

type ServingUnit = 'piece' | 'package' | 'grams';

interface FormData {
  servingSize: string;
  servingUnit: ServingUnit;
  servingsPerContainer: string;
  calories: string;
  protein: string;
  carbohydrates: string;
  sugar: string;
  fiber: string;
  fat: string;
  sodium: string;
}

type StepField = keyof FormData;

const STEPS = [
  {
    id: 1,
    title: 'Serving Information',
    fields: ['servingSize', 'servingUnit', 'servingsPerContainer'] as StepField[]
  },
  {
    id: 2,
    title: 'Calories',
    fields: ['calories'] as StepField[]
  },
  {
    id: 3,
    title: 'Protein',
    fields: ['protein'] as StepField[]
  },
  {
    id: 4,
    title: 'Carbohydrates',
    fields: ['carbohydrates', 'sugar', 'fiber'] as StepField[]
  },
  {
    id: 5,
    title: 'Fat & Sodium',
    fields: ['fat', 'sodium'] as StepField[]
  },
  {
    id: 6,
    title: 'Confirm Product',
    fields: [] as StepField[]
  },
  {
    id: 7,
    title: 'Success',
    fields: [] as StepField[]
  }
];

const SERVING_UNITS: { value: ServingUnit; label: string }[] = [
  { value: 'package', label: 'Package' },
  { value: 'piece', label: 'Piece' },
  { value: 'grams', label: 'Grams' }
];

export default function NutritionWizard({ barcode, photos, onSave, onComplete, onCancel }: NutritionWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    servingSize: '',
    servingUnit: 'package',
    servingsPerContainer: '',
    calories: '',
    protein: '',
    carbohydrates: '',
    sugar: '',
    fiber: '',
    fat: '',
    sodium: '',
  });
  const [activeField, setActiveField] = useState<keyof FormData>('servingSize');
  const [newItemsCount, setNewItemsCount] = useState(0);

  useEffect(() => {
    const loadNewItemsCount = async () => {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - (24 * 60 * 60 * 1000));
      const allFoodItems = await db.getAllFoodItems();
      const newItems = allFoodItems.filter(item => 
        new Date(item.createdAt).getTime() > startTime.getTime()
      );
      setNewItemsCount(newItems.length);
    };

    if (currentStep === 7) {
      loadNewItemsCount();
    }
  }, [currentStep]);

  const handleValueChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleConfirm = () => {
    const currentStepData = STEPS.find(step => step.id === currentStep);
    if (!currentStepData) return;

    const currentFields = currentStepData.fields;
    const currentFieldIndex = currentFields.findIndex(field => field === activeField);
    
    if (currentFieldIndex < currentFields.length - 1) {
      // Move to next field in current step
      setActiveField(currentFields[currentFieldIndex + 1]);
    } else if (currentStep < STEPS.length - 1) {
      // Move to next step
      setCurrentStep(currentStep + 1);
      if (currentStep < 5) {
        const nextStep = STEPS[currentStep];
        if (nextStep && nextStep.fields.length > 0) {
          setActiveField(nextStep.fields[0]);
        }
      }
    }
  };

  const handleStepClick = (stepId: number) => {
    const step = STEPS[stepId - 1];
    if (step && step.fields.length > 0) {
      setCurrentStep(stepId);
      setActiveField(step.fields[0]);
    }
  };

  const getFieldLabel = (field: keyof FormData): string => {
    switch (field) {
      case 'servingSize':
        return 'Serving Size';
      case 'servingUnit':
        return 'Unit';
      case 'servingsPerContainer':
        return 'Servings Per Container';
      case 'calories':
        return 'Calories';
      case 'protein':
        return 'Protein';
      case 'carbohydrates':
        return 'Total';
      case 'sugar':
        return 'Sugar';
      case 'fiber':
        return 'Fiber';
      case 'fat':
        return 'Fat';
      case 'sodium':
        return 'Sodium';
      default:
        return field;
    }
  };

  const getFieldUnit = (field: keyof FormData): string | undefined => {
    switch (field) {
      case 'protein':
      case 'carbohydrates':
      case 'sugar':
      case 'fiber':
      case 'fat':
        return 'g';
      case 'sodium':
        return 'mg';
      default:
        return undefined;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4">
      <TummyCard className="w-full max-w-lg">
        {(currentStep === 6 || currentStep === 7) && (
          <div className="p-4 border-b" style={{ borderColor: `${theme.colors.accent.DEFAULT}33` }}>
            <h3 className="text-lg font-semibold font-mono">Enter Nutrition Information</h3>
            <p className="text-sm opacity-70">Barcode: {barcode}</p>
          </div>
        )}

        {/* Progress Dots */}
        <div className="flex justify-center gap-2 p-4">
          {STEPS.slice(0, -1).map(step => (
            <motion.button
              key={step.id}
              onClick={() => handleStepClick(step.id)}
              className="w-3 h-3 rounded-full"
              style={{
                backgroundColor: step.id === currentStep 
                  ? theme.colors.primary.DEFAULT 
                  : theme.colors.muted.DEFAULT,
                opacity: step.id === currentStep ? 1 : 0.5,
              }}
              whileTap={{ scale: 0.9 }}
              animate={{
                scale: step.id === currentStep ? 1.2 : 1,
              }}
            />
          ))}
        </div>

        {/* Step Content */}
        <div className="p-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {currentStep === 7 ? (
                <div className="text-center space-y-6">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", duration: 0.5 }}
                    className="w-20 h-20 mx-auto rounded-full flex items-center justify-center"
                    style={{ backgroundColor: theme.colors.primary.DEFAULT }}
                  >
                    <span className="text-3xl">✓</span>
                  </motion.div>

                  <div className="space-y-2">
                    <h4 className="text-2xl font-mono" style={{ color: theme.colors.primary.DEFAULT }}>
                      Item Added Successfully!
                    </h4>
                    <p className="opacity-70">
                      You&apos;ve logged {newItemsCount} new item{newItemsCount !== 1 ? 's' : ''} in the last 24 hours
                    </p>
                  </div>

                  <TummyButton
                    variant="accent"
                    className="w-full"
                    onClick={onComplete}
                  >
                    Continue to Log Consumption
                  </TummyButton>
                </div>
              ) : currentStep === 6 ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-2">
                    {photos.map((photo, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="aspect-square rounded-lg overflow-hidden"
                        style={{ backgroundColor: theme.colors.background.DEFAULT }}
                      >
                        <img
                          src={photo.photoData}
                          alt={`Photo ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </motion.div>
                    ))}
                  </div>

                  <div className="space-y-4 p-4 rounded-lg" style={{ backgroundColor: theme.colors.background.DEFAULT }}>
                    <div className="text-sm opacity-70">
                      Barcode: {barcode}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="block opacity-70">Serving Size</span>
                        <span className="font-mono">{formData.servingSize} {formData.servingUnit}</span>
                      </div>
                      <div>
                        <span className="block opacity-70">Servings Per Container</span>
                        <span className="font-mono">{formData.servingsPerContainer}</span>
                      </div>
                      <div>
                        <span className="block opacity-70">Calories</span>
                        <span className="font-mono">{formData.calories}</span>
                      </div>
                      <div>
                        <span className="block opacity-70">Protein</span>
                        <span className="font-mono">{formData.protein}g</span>
                      </div>
                      <div>
                        <span className="block opacity-70">Carbohydrates</span>
                        <span className="font-mono">{formData.carbohydrates}g</span>
                      </div>
                      <div>
                        <span className="block opacity-70">Sugar</span>
                        <span className="font-mono">{formData.sugar}g</span>
                      </div>
                      <div>
                        <span className="block opacity-70">Fiber</span>
                        <span className="font-mono">{formData.fiber}g</span>
                      </div>
                      <div>
                        <span className="block opacity-70">Fat</span>
                        <span className="font-mono">{formData.fat}g</span>
                      </div>
                      <div>
                        <span className="block opacity-70">Sodium</span>
                        <span className="font-mono">{formData.sodium}mg</span>
                      </div>
                    </div>
                  </div>

                  <TummyButton
                    variant="accent"
                    className="w-full"
                    onClick={async () => {
                      try {
                        if (!barcode || barcode.trim() === '') {
                          console.error('Invalid barcode:', barcode);
                          alert('A valid barcode is required. Please scan the barcode again.');
                          return;
                        }

                        const foodItemData = {
                          barcode,
                          name: `Product ${barcode}`,
                          servingSize: `${formData.servingSize} ${formData.servingUnit}`,
                          servingsPerContainer: formData.servingsPerContainer,
                          calories: Number(formData.calories),
                          protein: Number(formData.protein),
                          carbohydrates: Number(formData.carbohydrates),
                          sugar: Number(formData.sugar),
                          fiber: Number(formData.fiber),
                          fat: Number(formData.fat),
                          sodium: Number(formData.sodium),
                        };

                        // Just pass the data back to parent
                        onSave(foodItemData);
                        
                        // Move to success screen
                        setCurrentStep(7);
                      } catch (error) {
                        console.error('Failed to prepare product data:', error);
                        alert('Failed to prepare product data. Please check all fields and try again.');
                      }
                    }}
                  >
                    Confirm & Save Product
                  </TummyButton>
                </div>
              ) : (
                <>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentStep}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                    >
                      <h4 className="text-xl font-mono mb-6" style={{ color: theme.colors.primary.DEFAULT }}>
                        {STEPS[currentStep - 1].title}
                      </h4>
                    </motion.div>
                  </AnimatePresence>

                  {currentStep === 1 ? (
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={activeField}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="space-y-4">
                          {activeField === 'servingSize' && (
                            <TummyNumpad
                              label="Serving Size"
                              value={formData.servingSize}
                              onChange={value => handleValueChange('servingSize', value)}
                              onConfirm={handleConfirm}
                            />
                          )}
                          {activeField === 'servingUnit' && (
                            <div className="space-y-4">
                              {SERVING_UNITS.map(unit => (
                                <motion.button
                                  key={unit.value}
                                  onClick={() => {
                                    handleValueChange('servingUnit', unit.value);
                                    handleConfirm();
                                  }}
                                  className="w-full p-4 rounded-lg text-lg font-mono"
                                  style={{
                                    backgroundColor: theme.colors.background.DEFAULT,
                                    color: formData.servingUnit === unit.value
                                      ? theme.colors.primary.DEFAULT
                                      : theme.colors.background.foreground,
                                  }}
                                  whileTap={{ scale: 0.98 }}
                                >
                                  {unit.label}
                                </motion.button>
                              ))}
                            </div>
                          )}
                          {activeField === 'servingsPerContainer' && (
                            <TummyNumpad
                              label="Servings Per Container"
                              value={formData.servingsPerContainer}
                              onChange={value => handleValueChange('servingsPerContainer', value)}
                              onConfirm={handleConfirm}
                            />
                          )}
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  ) : currentStep === 4 ? (
                    <div className="space-y-4">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key="carb-buttons"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ duration: 0.2 }}
                          className="grid grid-cols-3 gap-2 mb-4"
                        >
                          {['carbohydrates', 'sugar', 'fiber'].map((field) => (
                            <motion.button
                              key={field}
                              onClick={() => setActiveField(field as keyof FormData)}
                              className="py-1 px-2 rounded-lg text-center h-[40px] flex flex-col justify-center"
                              style={{
                                backgroundColor: theme.colors.background.DEFAULT,
                                color: activeField === field
                                  ? theme.colors.primary.DEFAULT
                                  : theme.colors.background.foreground,
                                opacity: activeField === field ? 1 : 0.7,
                              }}
                              whileTap={{ scale: 0.95 }}
                            >
                              <div className="text-xs leading-tight">{getFieldLabel(field as keyof FormData)}</div>
                              <div className="font-mono text-sm leading-tight">
                                {formData[field as keyof FormData] || '0'}g
                              </div>
                            </motion.button>
                          ))}
                        </motion.div>
                      </AnimatePresence>
                      <TummyNumpad
                        label={getFieldLabel(activeField)}
                        value={formData[activeField]}
                        unit={getFieldUnit(activeField)}
                        onChange={value => handleValueChange(activeField, value)}
                        onConfirm={handleConfirm}
                      />
                    </div>
                  ) : currentStep === 5 ? (
                    <div className="space-y-4">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key="fat-sodium-buttons"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ duration: 0.2 }}
                          className="grid grid-cols-2 gap-2 mb-4"
                        >
                          {['fat', 'sodium'].map((field) => (
                            <motion.button
                              key={field}
                              onClick={() => setActiveField(field as keyof FormData)}
                              className="py-1 px-2 rounded-lg text-center h-[40px] flex flex-col justify-center"
                              style={{
                                backgroundColor: theme.colors.background.DEFAULT,
                                color: activeField === field
                                  ? theme.colors.primary.DEFAULT
                                  : theme.colors.background.foreground,
                                opacity: activeField === field ? 1 : 0.7,
                              }}
                              whileTap={{ scale: 0.95 }}
                            >
                              <div className="text-xs leading-tight">{getFieldLabel(field as keyof FormData)}</div>
                              <div className="font-mono text-sm leading-tight">
                                {formData[field as keyof FormData] || '0'}
                                {getFieldUnit(field as keyof FormData)}
                              </div>
                            </motion.button>
                          ))}
                        </motion.div>
                      </AnimatePresence>
                      <TummyNumpad
                        label={getFieldLabel(activeField)}
                        value={formData[activeField]}
                        unit={getFieldUnit(activeField)}
                        onChange={value => handleValueChange(activeField, value)}
                        onConfirm={handleConfirm}
                      />
                    </div>
                  ) : (
                    <TummyNumpad
                      label={getFieldLabel(activeField)}
                      value={formData[activeField]}
                      unit={getFieldUnit(activeField)}
                      onChange={value => handleValueChange(activeField, value)}
                      onConfirm={handleConfirm}
                    />
                  )}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="p-4 border-t" style={{ borderColor: `${theme.colors.accent.DEFAULT}33` }}>
          <div className="flex justify-between gap-3">
            <TummyButton
              variant="secondary"
              onClick={() => {
                if (currentStep > 1) {
                  setCurrentStep(currentStep - 1);
                  setActiveField(STEPS[currentStep - 2].fields[0]);
                } else {
                  onCancel();
                }
              }}
            >
              {currentStep > 1 ? 'Back' : 'Cancel'}
            </TummyButton>
          </div>
        </div>
      </TummyCard>
    </div>
  );
} 