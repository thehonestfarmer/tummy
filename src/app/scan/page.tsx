'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import BarcodeScanner from '../../components/BarcodeScanner';
import NutritionWizard from '../../components/NutritionWizard';
import { TummyButton } from '../../components/ui/TummyButton';
import { TummyCard } from '../../components/ui/TummyCard';
import { TummyPhotoCapture } from '../../components/ui/TummyPhotoCapture';
import { db, type FoodItem } from '../../lib/db';
import type { NutritionMatch } from '../../lib/nutritionParser';
import { tummyTheme as theme } from '../../components/ui/theme';
import { PermissionRequest } from '../../components/PermissionRequest';

type ScanningState = 'barcode' | 'photos' | 'nutrition' | 'consumption';

interface CapturedPhoto {
  photoData: string;
  timestamp: Date;
  location?: {
    latitude: number;
    longitude: number;
  };
}

const DEBUG_MODE = process.env.NODE_ENV === 'development';

function debugLog(message: string, data?: any) {
  if (DEBUG_MODE) {
    if (data) {
      console.log(`[BarcodeScanner] ${message}:`, data);
    } else {
      console.log(`[BarcodeScanner] ${message}`);
    }
  }
}

export default function ScanPage() {
  const router = useRouter();
  const [scanningState, setScanningState] = useState<ScanningState>('barcode');
  const [currentBarcode, setCurrentBarcode] = useState<string | null>(null);
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [nutritionInfo, setNutritionInfo] = useState<FoodItem | null>(null);
  const [isNewItem, setIsNewItem] = useState(false);
  const [isCheckingBarcode, setIsCheckingBarcode] = useState(false);

  const handleBarcodeDetected = async (code: string) => {
    debugLog('Barcode detected:', code);
    setCurrentBarcode(code);
    setIsCheckingBarcode(true);

    try {
      // Check if we already have this product in the database
      const existingProduct = await db.findFoodByBarcode(code);
      
      if (existingProduct) {
        debugLog('Found existing product:', existingProduct);
        // If product exists, go straight to consumption
        setNutritionInfo(existingProduct);
        setIsNewItem(false);
        setScanningState('consumption');
      } else {
        debugLog('No existing product found, starting photo capture');
        // If product doesn't exist, start the photo capture flow
        setIsNewItem(true);
        setScanningState('photos');
      }
    } catch (error) {
      console.error('Error checking barcode:', error);
      alert('Failed to check barcode. Please try scanning again.');
      setScanningState('barcode');
    } finally {
      setIsCheckingBarcode(false);
    }
  };

  const handlePhotoCapture = (capturedPhotos: CapturedPhoto[]) => {
    setPhotos(capturedPhotos);
    setScanningState('nutrition');
  };

  const handleNutritionSave = async (data: Omit<FoodItem, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      debugLog('Attempting to save food item:', data);

      // Check if the item already exists
      const existingItem = await db.findFoodByBarcode(data.barcode);
      if (existingItem) {
        debugLog('Food item already exists:', existingItem);
        setNutritionInfo(existingItem);
        setScanningState('consumption');
        return;
      }
      
      // Save the food item first
      const savedInfo = await db.saveFoodItem(data);
      debugLog('Food item saved successfully:', savedInfo);
      
      // Then save all photos
      await Promise.all(photos.map(async (photo, index) => {
        debugLog(`Saving photo ${index + 1}/${photos.length}`);
        return db.savePhoto({
          foodItemId: savedInfo.id,
          photoData: photo.photoData,
          timestamp: photo.timestamp,
          location: photo.location
        });
      }));
      debugLog('All photos saved successfully');
      
      setNutritionInfo(savedInfo);
      setScanningState('consumption');
    } catch (error) {
      console.error('Failed to save nutrition info:', error);
      if (error instanceof Error) {
        if (error.message.includes('barcode already exists')) {
          // If the item exists, try to fetch it and continue
          try {
            const existingItem = await db.findFoodByBarcode(data.barcode);
            if (existingItem) {
              setNutritionInfo(existingItem);
              setScanningState('consumption');
              return;
            }
          } catch (fetchError) {
            console.error('Failed to fetch existing item:', fetchError);
          }
        }
        alert(`Failed to save nutrition info: ${error.message}`);
      } else {
        alert('Failed to save nutrition info. Please try again.');
      }
    }
  };

  const handleConsumptionLog = async (servings: number) => {
    if (!nutritionInfo) return;
    
    try {
      await db.logConsumption({
        foodItemId: nutritionInfo.id,
        servingsConsumed: servings,
        timestamp: new Date(),
        location: undefined
      });
      
      router.push('/');
    } catch (error) {
      console.error('Failed to log consumption:', error);
    }
  };

  const handleCancel = () => {
    setCurrentBarcode(null);
    setPhotos([]);
    setNutritionInfo(null);
    router.push('/');
  };

  const getStepNumber = () => {
    switch (scanningState) {
      case 'barcode': return 1;
      case 'photos': return 2;
      case 'nutrition': return 3;
      case 'consumption': return 4;
    }
  };

  return (
    <div className="p-4">
      {/* Simple Step Indicator */}
      <div className="text-center mb-4">
        <span className="text-sm">Step {getStepNumber()} of 4</span>
      </div>

      {/* Title */}
      <div className="text-center mb-4">
        <h1 className="text-xl mb-2">
          {scanningState === 'barcode' && 'Scan Barcode'}
          {scanningState === 'photos' && (
            <span className="flex items-center justify-center gap-2">
              Take Photos
              {isNewItem && (
                <span className="text-sm bg-blue-500 text-white px-2 py-0.5 rounded-full">
                  New Item
                </span>
              )}
            </span>
          )}
          {scanningState === 'nutrition' && (
            <span className="flex items-center justify-center gap-2">
              Enter Nutrition Info
              {isNewItem && (
                <span className="text-sm bg-blue-500 text-white px-2 py-0.5 rounded-full">
                  New Item
                </span>
              )}
            </span>
          )}
          {scanningState === 'consumption' && (
            <span className="flex items-center justify-center gap-2">
              Log Consumption
              {!isNewItem && (
                <span className="text-sm bg-green-500 text-white px-2 py-0.5 rounded-full">
                  Existing Item
                </span>
              )}
            </span>
          )}
        </h1>
        <p className="text-sm text-gray-600">
          {scanningState === 'barcode' && (isCheckingBarcode ? 'Checking database...' : 'Position the barcode within the frame')}
          {scanningState === 'photos' && 'Take clear photos of the front, back, and nutrition label'}
          {scanningState === 'nutrition' && 'Enter the nutrition information'}
          {scanningState === 'consumption' && (
            isNewItem ? 'New item added! Enter the number of servings consumed' : 'Enter the number of servings consumed'
          )}
        </p>
      </div>

      {/* Main Content */}
      {scanningState === 'barcode' && (
        <BarcodeScanner 
          onDetected={handleBarcodeDetected} 
          onCancel={handleCancel}
        />
      )}

      {scanningState === 'photos' && (
        <TummyPhotoCapture
          onPhotosCapture={handlePhotoCapture}
          maxPhotos={3}
          minPhotos={1}
          onCancel={handleCancel}
          title={isNewItem ? 'New Item Photos' : 'Update Photos'}
          subtitle={
            isNewItem 
              ? 'Take clear photos of the front, back, and nutrition label'
              : 'Add or update photos for this item'
          }
        />
      )}

      {scanningState === 'nutrition' && currentBarcode && (
        <div>
          <div className="bg-black text-white p-2 mb-4">
            <p className="text-center">Barcode: {currentBarcode}</p>
          </div>
          
          <NutritionWizard
            barcode={currentBarcode}
            photos={photos}
            onSave={handleNutritionSave}
            onComplete={() => setScanningState('consumption')}
            onCancel={handleCancel}
          />
        </div>
      )}

      {scanningState === 'consumption' && nutritionInfo && (
        <div>
          <TummyCard className="mb-4">
            <div className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-bold font-mono">{nutritionInfo.name || 'Product Information'}</h2>
                {isNewItem && (
                  <span 
                    className="text-sm px-2 py-0.5 rounded-full"
                    style={{ 
                      backgroundColor: theme.colors.primary.DEFAULT,
                      color: theme.colors.primary.foreground
                    }}
                  >
                    New Item
                  </span>
                )}
              </div>

              {/* Photos Grid */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                {photos.map((photo, index) => (
                  <div
                    key={index}
                    className="aspect-square rounded-lg overflow-hidden"
                    style={{ backgroundColor: theme.colors.background.DEFAULT }}
                  >
                    <img
                      src={photo.photoData}
                      alt={`Photo ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>

              {/* Nutrition Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="block opacity-70">Serving Size</span>
                  <span className="font-mono">{nutritionInfo.servingSize}</span>
                </div>
                <div>
                  <span className="block opacity-70">Servings Per Container</span>
                  <span className="font-mono">{nutritionInfo.servingsPerContainer}</span>
                </div>
                <div>
                  <span className="block opacity-70">Calories</span>
                  <span className="font-mono">{nutritionInfo.calories}</span>
                </div>
                <div>
                  <span className="block opacity-70">Protein</span>
                  <span className="font-mono">{nutritionInfo.protein}g</span>
                </div>
                <div>
                  <span className="block opacity-70">Carbohydrates</span>
                  <span className="font-mono">{nutritionInfo.carbohydrates}g</span>
                </div>
                <div>
                  <span className="block opacity-70">Fat</span>
                  <span className="font-mono">{nutritionInfo.fat}g</span>
                </div>
                <div>
                  <span className="block opacity-70">Sugar</span>
                  <span className="font-mono">{nutritionInfo.sugar}g</span>
                </div>
                <div>
                  <span className="block opacity-70">Fiber</span>
                  <span className="font-mono">{nutritionInfo.fiber}g</span>
                </div>
                <div>
                  <span className="block opacity-70">Sodium</span>
                  <span className="font-mono">{nutritionInfo.sodium}mg</span>
                </div>
              </div>
            </div>
          </TummyCard>

          <div className="space-y-2">
            <TummyButton
              variant="accent"
              className="w-full"
              onClick={() => handleConsumptionLog(1)}
            >
              Log 1 Serving
            </TummyButton>
            
            <div className="grid grid-cols-3 gap-2">
              {[0.5, 1.5, 2].map((servings) => (
                <TummyButton
                  key={servings}
                  variant="secondary"
                  onClick={() => handleConsumptionLog(servings)}
                >
                  {servings} Serving{servings !== 1 ? 's' : ''}
                </TummyButton>
              ))}
            </div>

            <TummyButton
              variant="primary"
              className="w-full"
              onClick={handleCancel}
            >
              Cancel
            </TummyButton>
          </div>
        </div>
      )}
    </div>
  );
} 