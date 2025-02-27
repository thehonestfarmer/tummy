import Tesseract from 'tesseract.js';

const DEBUG_MODE = process.env.NODE_ENV === 'development';

function debugLog(message: string, data?: unknown): void {
  if (DEBUG_MODE) {
    if (data !== undefined) {
      console.log(`[Tesseract] ${message}:`, data);
    } else {
      console.log(`[Tesseract] ${message}`);
    }
  }
}

export async function createTesseractWorker(onProgress?: (progress: string) => void) {
  debugLog('Starting Tesseract initialization');

  return {
    recognize: async (image: string) => {
      try {
        debugLog('Starting recognition');
        const result = await Tesseract.recognize(
          image,
          'tha',
          {
            logger: m => {
              debugLog('Progress update', m);
              if (m.status === 'recognizing text') {
                onProgress?.(`Processing: ${Math.round((m.progress || 0) * 100)}%`);
              } else {
                onProgress?.(m.status);
              }
            }
          }
        );
        debugLog('Recognition completed');
        return result;
      } catch (error) {
        debugLog('Recognition error', error);
        throw error;
      }
    },
    terminate: async () => {
      // No need to terminate when using recognize directly
      debugLog('Cleanup completed');
    }
  };
} 