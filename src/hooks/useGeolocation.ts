import { useState } from 'react';

interface Location {
  latitude: number;
  longitude: number;
}

export function useGeolocation() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getCurrentLocation = async (): Promise<Location | undefined> => {
    try {
      setIsLoading(true);
      setError(null);
      
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
      });

      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
    } catch (err) {
      console.warn('Could not get location:', err);
      setError('Failed to get location');
      return undefined;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    getCurrentLocation,
    isLoading,
    error
  };
} 