'use client';

import { useEffect, useRef, useState } from 'react';
import type { QuaggaStatic, QuaggaResult } from 'quagga';

let Quagga: QuaggaStatic | null = null;

interface BarcodeScannerProps {
  onDetected: (code: string) => void;
  onCancel: () => void;
}

export default function BarcodeScanner({ onDetected, onCancel }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLDivElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [lastResult, setLastResult] = useState<QuaggaResult | null>(null);

  const requestCameraPermission = async () => {
    try {
      // Check if mediaDevices is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API is not supported in your browser');
      }

      // Directly try to get the camera stream with fallback options
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 480, ideal: 720, max: 1080 }
        }
      }).catch(() => {
        // If environment camera fails, try with any camera
        return navigator.mediaDevices.getUserMedia({
          video: true
        });
      });

      // If we got here, we have permission
      setHasPermission(true);
      
      // Release the stream - Quagga will request it again
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (err) {
      console.error('Camera permission error:', err);
      setHasPermission(false);
      
      if (err instanceof DOMException) {
        switch (err.name) {
          case 'NotAllowedError':
          case 'PermissionDeniedError':
            setError('Please allow camera access when prompted and refresh the page.');
            break;
          case 'NotFoundError':
          case 'DevicesNotFoundError':
            setError('No camera found on your device.');
            break;
          case 'NotReadableError':
          case 'TrackStartError':
            setError('Your camera may be in use by another application.');
            break;
          case 'OverconstrainedError':
          case 'ConstraintNotSatisfiedError':
            setError('No suitable camera found. Please try another device.');
            break;
          default:
            setError('Failed to access camera. Please check your browser settings and refresh.');
        }
      } else {
        setError('Failed to access camera. Please make sure your browser supports camera access.');
      }
      return false;
    }
  };

  useEffect(() => {
    async function initializeScanner() {
      try {
        const permissionGranted = await requestCameraPermission();
        if (!permissionGranted) return;

        // Dynamically import Quagga
        const QuaggaModule = await import('quagga');
        Quagga = QuaggaModule.default;
        
        // Initialize Quagga
        await initQuagga();
      } catch (err) {
        console.error('Scanner initialization error:', err);
        setError('Failed to initialize camera');
      }
    }

    initializeScanner();

    return () => {
      if (Quagga) {
        Quagga.stop();
      }
    };
  }, []);

  // Draw detection results on canvas
  const drawResult = (result: QuaggaResult) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || !Quagga) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get video element for scaling
    const video = videoRef.current?.querySelector('video');
    if (!video) return;

    // Scale canvas to match video dimensions
    const scaleX = canvas.width / video.videoWidth;
    const scaleY = canvas.height / video.videoHeight;

    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all detection boxes in yellow
    if (result.boxes) {
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.8)'; // More visible yellow
      ctx.lineWidth = 3;
      result.boxes.forEach(box => {
        ctx.beginPath();
        ctx.rect(
          box.x * scaleX,
          box.y * scaleY,
          box.width * scaleX,
          box.height * scaleY
        );
        ctx.stroke();
      });
    }

    // Draw successful detection box in green
    if (result.box) {
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)'; // More visible green
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.rect(
        result.box.x * scaleX,
        result.box.y * scaleY,
        result.box.width * scaleX,
        result.box.height * scaleY
      );
      ctx.stroke();
    }
  };

  const initQuagga = () => {
    if (!videoRef.current || !Quagga) return;

    return new Promise<void>((resolve, reject) => {
      if (!Quagga) {
        reject(new Error('Quagga not initialized'));
        return;
      }

      Quagga.init({
        inputStream: {
          name: "Live",
          type: "LiveStream",
          target: videoRef.current!,
          constraints: {
            facingMode: "environment",
            aspectRatio: { min: 1, max: 2 },
            width: { min: 640, ideal: 1280, max: 1920 },
            height: { min: 480, ideal: 720, max: 1080 }
          },
        },
        decoder: {
          readers: [
            "ean_reader",      // EAN-13
            "upc_reader",      // UPC
            "upc_e_reader",    // UPC-E
          ],
          multiple: false
        },
        locate: true,
        locator: {
          patchSize: "medium",
          halfSample: true
        },
        frequency: 10
      }, (err) => {
        if (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown initialization error';
          setError(`Failed to initialize scanner: ${errorMessage}`);
          reject(err);
          return;
        }
        
        if (!Quagga) {
          reject(new Error('Quagga instance was lost during initialization'));
          return;
        }
        
        try {
          Quagga.start();

          // Set initial canvas dimensions after video is ready
          const video = videoRef.current?.querySelector('video');
          if (video && overlayCanvasRef.current) {
            video.addEventListener('loadedmetadata', () => {
              if (overlayCanvasRef.current) {
                overlayCanvasRef.current.width = video.videoWidth;
                overlayCanvasRef.current.height = video.videoHeight;
              }
            });
          }

          // Process frames
          Quagga.onProcessed((result) => {
            const canvas = overlayCanvasRef.current;
            if (!canvas) return;

            // Adjust canvas size to match video
            const video = videoRef.current?.querySelector('video');
            if (video) {
              canvas.width = video.offsetWidth;
              canvas.height = video.offsetHeight;
            }

            if (result) {
              drawResult(result);
              if (result.codeResult && result.codeResult.code) {
                setLastResult(result);
              }
            }
          });
          
          // Handle successful detection
          Quagga.onDetected((result) => {
            const code = result.codeResult.code;
            const format = result.codeResult.format;
            
            // Validate EAN-13 format
            if (format === 'ean_13' && !/^\d{13}$/.test(code)) {
              return;
            }
            
            console.log(`Detected ${format}: ${code}`);
            setIsScanning(true);
            setLastResult(result);
            onDetected(code);
            
            // Stop scanning after successful detection
            if (Quagga) {
              Quagga.stop();
            }
          });
          
          resolve();
        } catch (startError) {
          const errorMessage = startError instanceof Error ? startError.message : 'Unknown error starting scanner';
          setError(`Failed to start scanner: ${errorMessage}`);
          reject(startError);
        }
      });
    });
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 bg-red-50 text-red-500 rounded-lg">
        {error}
      </div>
    );
  }

  if (hasPermission === false) {
    return (
      <div className="flex items-center justify-center h-64 bg-yellow-50 text-yellow-600 rounded-lg">
        Please enable camera access to use the barcode scanner
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center bg-black">
      {/* Header */}
      <div className="w-full p-4 bg-black bg-opacity-75 flex items-center justify-between">
        <div className="text-white text-lg font-medium">
          Scan Barcode
        </div>
        <button 
          onClick={onCancel}
          className="text-white opacity-80 hover:opacity-100 transition-opacity px-4 py-2"
        >
          Cancel
        </button>
      </div>

      {/* Scanner */}
      <div className="flex-1 flex items-center justify-center w-full">
        <div className="relative w-[300px] h-[300px]">
          <div 
            ref={videoRef} 
            className="absolute inset-0 overflow-hidden [&>video]:w-full [&>video]:h-full [&>video]:object-cover"
          />
          
          <canvas
            ref={overlayCanvasRef}
            className="absolute inset-0 pointer-events-none"
          />
          
          {/* Simplified scanning frame - just the border */}
          <div className="absolute inset-0 pointer-events-none">
            <div 
              className={`w-full h-full border-2 rounded-lg transition-colors duration-300 ${
                isScanning ? 'border-green-500 border-opacity-100' : 
                'border-gray-400 border-opacity-50'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Status Indicator */}
      <div className="w-full p-4 bg-black bg-opacity-75">
        <div className="text-white text-sm text-center font-medium">
          {isScanning ? (
            'Barcode detected!'
          ) : lastResult ? (
            `Scanning... Last format: ${lastResult.codeResult.format}`
          ) : (
            'Position barcode within frame'
          )}
        </div>
      </div>
    </div>
  );
} 