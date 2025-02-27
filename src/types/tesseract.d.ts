declare module 'tesseract.js' {
  interface LoggerMessage {
    status: string;
    progress?: number;
  }

  interface WorkerOptions {
    workerPath?: string;
    corePath?: string;
    langPath?: string;
    logger?: (log: LoggerMessage) => void;
  }

  interface Worker {
    loadLanguage(lang: string): Promise<void>;
    initialize(lang: string): Promise<void>;
    setParameters(params: WorkerParameters): Promise<void>;
    recognize(image: string): Promise<{
      data: {
        text: string;
      };
    }>;
    terminate(): Promise<void>;
  }

  interface WorkerParameters {
    tessedit_char_whitelist?: string;
    preserve_interword_spaces?: string;
    [key: string]: string | undefined;
  }

  interface TesseractStatic {
    createWorker(options?: WorkerOptions): Promise<Worker>;
    recognize(image: string, lang: string, options?: WorkerOptions): Promise<{
      data: {
        text: string;
      };
    }>;
  }

  const Tesseract: TesseractStatic;
  export default Tesseract;
} 