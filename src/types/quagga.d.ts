declare module 'quagga' {
  export interface QuaggaConfig {
    inputStream: {
      name?: string;
      type: string;
      target: HTMLElement;
      constraints: {
        facingMode?: string;
        width?: { min?: number; max?: number; ideal?: number };
        height?: { min?: number; max?: number; ideal?: number };
        aspectRatio?: { min?: number; max?: number };
      };
    };
    decoder: {
      readers: string[];
      multiple?: boolean;
    };
    locate?: boolean;
    locator?: {
      patchSize?: string;
      halfSample?: boolean;
    };
    frequency?: number;
  }

  export interface QuaggaResult {
    codeResult: {
      code: string;
      format: string;
    };
    box?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    boxes?: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
  }

  export interface QuaggaStatic {
    init: (config: QuaggaConfig, callback?: (err: Error | null) => void) => Promise<void>;
    start: () => void;
    stop: () => void;
    onDetected: (callback: (result: QuaggaResult) => void) => void;
    onProcessed: (callback: (result: QuaggaResult | null) => void) => void;
    offDetected: (callback: (result: QuaggaResult) => void) => void;
    offProcessed: (callback: (result: QuaggaResult | null) => void) => void;
  }

  const Quagga: QuaggaStatic;
  export default Quagga;
} 