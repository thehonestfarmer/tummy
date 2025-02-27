'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { tummyTheme as theme } from './theme';

interface TummyPhotoCaptureProps {
  onPhotosCapture: (photos: { photoData: string; timestamp: Date }[]) => void;
  maxPhotos?: number;
  minPhotos?: number;
  onCancel?: () => void;
  title?: string;
  subtitle?: string;
}

export function TummyPhotoCapture({ 
  onPhotosCapture, 
  maxPhotos = 3, 
  minPhotos = 1,
  onCancel,
  title = 'Take Photos',
  subtitle = 'Take clear photos of the front, back, and nutrition label'
}: TummyPhotoCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [photos, setPhotos] = useState<Array<{ 
    photoData: string; 
    timestamp: Date;
  }>>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      // Stop any existing stream first
      stopCamera();
      setIsLoading(true);
      setError(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          aspectRatio: { min: 1, max: 2 },
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 480, ideal: 720, max: 1080 }
        }
      }).catch(() => {
        // Fallback to any available camera if environment camera fails
        return navigator.mediaDevices.getUserMedia({
          video: {
            width: { min: 640, ideal: 1280, max: 1920 },
            height: { min: 480, ideal: 720, max: 1080 }
          }
        });
      });
      
      if (videoRef.current) {
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        
        // Wait for the video to be ready before playing
        await new Promise((resolve) => {
          if (!videoRef.current) return;
          videoRef.current.onloadedmetadata = () => resolve(undefined);
        });

        await videoRef.current.play();
        setIsStreaming(true);
        setError(null);
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Camera access denied. Please check your permissions.'
          : 'Failed to access camera. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [stopCamera]);

  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || photos.length >= maxPhotos) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const context = canvas.getContext('2d');
    
    if (!context) return;

    context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    const photoData = canvas.toDataURL('image/jpeg');
    const timestamp = new Date();

    setPhotos(prev => [...prev, { photoData, timestamp }]);
  }, [photos, maxPhotos]);

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleComplete = () => {
    if (photos.length >= minPhotos) {
      onPhotosCapture(photos);
    } else {
      setError(`Please capture at least ${minPhotos} photo${minPhotos > 1 ? 's' : ''}`);
    }
  };

  // Initialize camera when component mounts
  useEffect(() => {
    startCamera();
    // Cleanup when component unmounts
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  return (
    <div className="fixed inset-0 flex flex-col items-center bg-black">
      {/* Header */}
      <div className="w-full p-4 bg-black bg-opacity-75 flex items-center justify-between">
        <div className="text-white">
          <div className="text-lg font-medium">{title}</div>
          <div className="text-sm opacity-70">{subtitle}</div>
        </div>
        <button 
          onClick={onCancel}
          className="text-white opacity-80 hover:opacity-100 transition-opacity px-4 py-2"
        >
          Cancel
        </button>
      </div>

      {/* Camera View */}
      <div className="flex-1 flex items-center justify-center w-full">
        <div className="relative w-[300px] h-[300px]">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-white">Initializing camera...</div>
            </div>
          )}
          
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
          
          {/* Capture frame */}
          <div className="absolute inset-0 pointer-events-none">
            <div 
              className="w-full h-full border-2 rounded-lg transition-colors duration-300"
              style={{ borderColor: theme.colors.primary.DEFAULT }}
            />
          </div>
        </div>
      </div>

      {/* Photo Strip & Controls */}
      <div className="w-full bg-black bg-opacity-75 p-4">
        {/* Thumbnails */}
        {photos.length > 0 && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
            {photos.map((photo, index) => (
              <div 
                key={index} 
                className="relative flex-shrink-0 w-16 h-16 rounded overflow-hidden"
                style={{ backgroundColor: theme.colors.background.DEFAULT }}
              >
                <img 
                  src={photo.photoData} 
                  alt={`Captured ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => removePhoto(index)}
                  className="absolute top-0 right-0 w-6 h-6 flex items-center justify-center bg-black bg-opacity-50 text-white hover:bg-opacity-75"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="text-red-500 text-sm mb-4">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-between gap-4">
          <button
            onClick={capturePhoto}
            disabled={photos.length >= maxPhotos || !isStreaming}
            className="flex-1 py-2 text-white font-medium rounded transition-colors"
            style={{ 
              backgroundColor: theme.colors.accent.DEFAULT,
              opacity: (photos.length >= maxPhotos || !isStreaming) ? 0.5 : 1
            }}
          >
            Capture ({photos.length}/{maxPhotos})
          </button>
          <button
            onClick={handleComplete}
            disabled={photos.length < minPhotos}
            className="flex-1 py-2 text-white font-medium rounded transition-colors"
            style={{ 
              backgroundColor: theme.colors.primary.DEFAULT,
              opacity: photos.length < minPhotos ? 0.5 : 1
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
} 