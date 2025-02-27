import { v4 as uuidv4 } from 'uuid';

export interface FoodItem {
  id: string; // UUID
  barcode: string;
  name?: string;
  servingSize: string;
  servingsPerContainer: string;
  calories: number;
  protein: number;
  carbohydrates: number;
  sugar: number;
  fiber: number;
  fat: number;
  sodium: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConsumptionRecord {
  id: string; // UUID
  foodItemId: string;
  servingsConsumed: number;
  timestamp: Date;
  location?: {
    latitude: number;
    longitude: number;
  };
}

export interface FoodPhoto {
  id: string; // UUID
  foodItemId: string;
  photoData: string; // Base64 encoded
  timestamp: Date;
  location?: {
    latitude: number;
    longitude: number;
  };
}

class DatabaseService {
  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'tummyDB';
  private readonly VERSION = 1;
  
  private readonly STORES = {
    FOOD_ITEMS: 'foodItems',
    CONSUMPTION_RECORDS: 'consumptionRecords',
    PHOTOS: 'photos'
  };

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.VERSION);

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Food Items Store
        if (!db.objectStoreNames.contains(this.STORES.FOOD_ITEMS)) {
          const foodItemsStore = db.createObjectStore(this.STORES.FOOD_ITEMS, {
            keyPath: 'id'
          });
          foodItemsStore.createIndex('barcode', 'barcode', { unique: true });
          foodItemsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // Consumption Records Store
        if (!db.objectStoreNames.contains(this.STORES.CONSUMPTION_RECORDS)) {
          const consumptionStore = db.createObjectStore(this.STORES.CONSUMPTION_RECORDS, {
            keyPath: 'id'
          });
          consumptionStore.createIndex('foodItemId', 'foodItemId', { unique: false });
          consumptionStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Photos Store
        if (!db.objectStoreNames.contains(this.STORES.PHOTOS)) {
          const photosStore = db.createObjectStore(this.STORES.PHOTOS, {
            keyPath: 'id'
          });
          photosStore.createIndex('foodItemId', 'foodItemId', { unique: false });
          photosStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  // Food Items Methods
  async findFoodById(id: string): Promise<FoodItem | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.STORES.FOOD_ITEMS, 'readonly');
      const store = transaction.objectStore(this.STORES.FOOD_ITEMS);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async findFoodByBarcode(barcode: string): Promise<FoodItem | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.STORES.FOOD_ITEMS, 'readonly');
      const store = transaction.objectStore(this.STORES.FOOD_ITEMS);
      const barcodeIndex = store.index('barcode');
      const request = barcodeIndex.get(barcode);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async saveFoodItem(foodItem: Omit<FoodItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<FoodItem> {
    if (!this.db) await this.init();

    // Validate barcode
    if (!foodItem.barcode || foodItem.barcode.trim() === '') {
      throw new Error('Barcode is required');
    }

    // Check if barcode already exists
    const existingItem = await this.findFoodByBarcode(foodItem.barcode);
    if (existingItem) {
      throw new Error('A food item with this barcode already exists');
    }

    const now = new Date();
    const data: FoodItem = {
      id: uuidv4(),
      ...foodItem,
      barcode: foodItem.barcode.trim(), // Ensure no whitespace
      createdAt: now,
      updatedAt: now,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.STORES.FOOD_ITEMS, 'readwrite');
      const store = transaction.objectStore(this.STORES.FOOD_ITEMS);
      const request = store.add(data);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(data);
    });
  }

  // Consumption Records Methods
  async logConsumption(record: Omit<ConsumptionRecord, 'id'>): Promise<ConsumptionRecord> {
    if (!this.db) await this.init();

    const data: ConsumptionRecord = {
      id: uuidv4(),
      ...record
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.STORES.CONSUMPTION_RECORDS, 'readwrite');
      const store = transaction.objectStore(this.STORES.CONSUMPTION_RECORDS);
      const request = store.add(data);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(data);
    });
  }

  async getConsumptionsByTimeRange(startTime: Date, endTime: Date): Promise<ConsumptionRecord[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.STORES.CONSUMPTION_RECORDS, 'readonly');
      const store = transaction.objectStore(this.STORES.CONSUMPTION_RECORDS);
      const index = store.index('timestamp');
      const range = IDBKeyRange.bound(startTime, endTime);
      const request = index.getAll(range);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  // Photos Methods
  async savePhoto(photo: Omit<FoodPhoto, 'id'>): Promise<FoodPhoto> {
    if (!this.db) await this.init();

    const data: FoodPhoto = {
      id: uuidv4(),
      ...photo
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.STORES.PHOTOS, 'readwrite');
      const store = transaction.objectStore(this.STORES.PHOTOS);
      const request = store.add(data);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(data);
    });
  }

  async getPhotosByFoodId(foodItemId: string): Promise<FoodPhoto[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.STORES.PHOTOS, 'readonly');
      const store = transaction.objectStore(this.STORES.PHOTOS);
      const index = store.index('foodItemId');
      const request = index.getAll(foodItemId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  // Admin Methods
  async getAllFoodItems(): Promise<FoodItem[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.STORES.FOOD_ITEMS, 'readonly');
      const store = transaction.objectStore(this.STORES.FOOD_ITEMS);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async getAllConsumptions(): Promise<ConsumptionRecord[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.STORES.CONSUMPTION_RECORDS, 'readonly');
      const store = transaction.objectStore(this.STORES.CONSUMPTION_RECORDS);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async getAllPhotos(): Promise<FoodPhoto[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.STORES.PHOTOS, 'readonly');
      const store = transaction.objectStore(this.STORES.PHOTOS);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async clearAllTables(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [this.STORES.FOOD_ITEMS, this.STORES.CONSUMPTION_RECORDS, this.STORES.PHOTOS],
        'readwrite'
      );

      let completed = 0;
      const total = Object.keys(this.STORES).length;

      Object.values(this.STORES).forEach(storeName => {
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          completed++;
          if (completed === total) {
            resolve();
          }
        };
      });

      transaction.onerror = () => reject(transaction.error);
    });
  }
}

export const db = new DatabaseService(); 