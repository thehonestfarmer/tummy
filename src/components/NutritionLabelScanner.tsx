'use client';

import { useRef, useState, useEffect } from 'react';
import { createTesseractWorker } from '../lib/tesseract';
import { parseNutritionText } from '../lib/nutritionParser';
import { translateText } from '../lib/translate';
import type { NutritionMatch } from '../lib/nutritionParser';

interface NutritionLabelScannerProps {
  onScanComplete: (data: string, parsedData?: NutritionMatch) => void;
  onCancel: () => void;
}

// Debug flag - we'll enable this for development
const DEBUG_MODE = process.env.NODE_ENV === 'development';

export default function NutritionLabelScanner({ onScanComplete, onCancel }: NutritionLabelScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState<string>('');

  const addDebugLog = (message: string, data?: unknown): void => {
    const timestamp = new Date().toISOString();
    const logMessage = data !== undefined 
      ? `${message}: ${JSON.stringify(data, null, 2)}` 
      : message;
    setDebugLogs(prev => [...prev, `[${timestamp}] ${logMessage}`]);
  };

  useEffect(() => {
    startCamera();
    return () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      addDebugLog('Starting camera initialization');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 2048 },
          height: { ideal: 1536 }
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        addDebugLog('Camera initialized successfully');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      addDebugLog(`Camera initialization failed: ${errorMessage}`);
      setError('Failed to access camera');
      console.error('Camera error:', err);
    }
  };

  const preprocessImage = (context: CanvasRenderingContext2D, width: number, height: number) => {
    addDebugLog('Starting image preprocessing');
    // Get the image data
    const imageData = context.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Convert to grayscale and increase contrast
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Convert to grayscale
      let gray = 0.299 * r + 0.587 * g + 0.114 * b;
      
      // Increase contrast
      gray = gray < 128 ? gray * 0.8 : Math.min(255, gray * 1.2);
      
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }

    // Put the modified image data back
    context.putImageData(imageData, 0, 0);
    addDebugLog('Image preprocessing complete');
  };

  const captureImage = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setIsScanning(true);
    setError(null);
    addDebugLog('Starting image capture');
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) {
      addDebugLog('Failed to get canvas context');
      return;
    }

    try {
      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      addDebugLog(`Canvas dimensions set to: ${canvas.width}x${canvas.height}`);
      
      // Draw the current video frame
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      addDebugLog('Video frame captured to canvas');
      
      // Preprocess the image
      preprocessImage(context, canvas.width, canvas.height);

      // Convert to image data
      const imageData = canvas.toDataURL('image/png');
      addDebugLog('Image converted to data URL');
      
      // Initialize worker with progress updates
      addDebugLog('Initializing Tesseract worker');
      const worker = await createTesseractWorker((message) => {
        setProgress(message);
        addDebugLog(`Tesseract progress: ${message}`);
      });
      
      addDebugLog('Starting OCR recognition');
      const result = await worker.recognize(imageData);
      addDebugLog('OCR recognition completed');
      addDebugLog('Raw OCR text:', result.data.text);
      
      await worker.terminate();
      addDebugLog('Tesseract worker terminated');

      // Translate the text
      addDebugLog('Starting translation');
      const translatedText = await translateText(result.data.text);
      addDebugLog('Translated text:', translatedText);

      // Parse the recognized text
      addDebugLog('Parsing nutrition information');
      const parsedData = parseNutritionText(result.data.text);
      addDebugLog('Parsed nutrition data:', parsedData);
      
      onScanComplete(result.data.text, parsedData);
      
      // Stop the camera stream
      const stream = video.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      addDebugLog('Camera stream stopped');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      addDebugLog(`Error during OCR: ${errorMessage}`);
      setError('Failed to process image. Please try again.');
      console.error('OCR error:', err);
    } finally {
      setIsScanning(false);
      setProgress('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-lg overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold">Scan Nutrition Label</h3>
          <p className="text-sm text-gray-500">Make sure the text is clear and well-lit</p>
        </div>

        <div className="relative aspect-[3/4] bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />
          
          {/* Overlay guide */}
          <div className="absolute inset-8 border-2 border-white border-opacity-50 rounded-lg">
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-white text-opacity-75 text-center text-sm">
                Position the nutrition label within the frame
              </p>
            </div>
          </div>
        </div>

        {(error || progress) && (
          <div className={`p-4 ${error ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-600'} text-sm`}>
            {error || progress}
          </div>
        )}

        {DEBUG_MODE && debugLogs.length > 0 && (
          <div className="max-h-40 overflow-y-auto p-4 bg-gray-50 text-xs font-mono">
            {debugLogs.map((log, index) => (
              <div key={index} className="whitespace-pre-wrap text-gray-900">{log}</div>
            ))}
          </div>
        )}

        <div className="p-4 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={captureImage}
            disabled={isScanning}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {isScanning ? 'Processing...' : 'Capture'}
          </button>
        </div>
      </div>
    </div>
  );
} 