import type {LiveMarketUpdate} from '../types';
export const getKSTTime = () => {
  return new Date().toLocaleTimeString('en-US', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }) + ' KST';
};

type Listener = (data: LiveMarketUpdate) => void;

class GeminiController {
  private static instance: GeminiController;
  private listeners: Listener[] = [];
  private currentData: LiveMarketUpdate | null = null;
  private isQuerying: boolean = false;
  private intervalId: any = null;

  private constructor() {
    // Initial fetch on browser load
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        this.fetchLiveMarketData();
      }, 500);

      // Stage 1: No automatic periodic Gemini refreshes.
      // An explicit weekday scheduler will replace this in Stage 2.
    }
  }

  public static getInstance(): GeminiController {
    if (!GeminiController.instance) {
      GeminiController.instance = new GeminiController();
    }
    return GeminiController.instance;
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    if (this.currentData) {
      listener(this.currentData);
    }
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public async fetchLiveMarketData(force: boolean = false): Promise<LiveMarketUpdate | null> {
    if (this.isQuerying) return this.currentData;
    this.isQuerying = true;

    try {
      const response=await fetch('/api/rms/saved-market-data',{cache:'no-store'});
      if(!response.ok)return this.currentData;
      const data=await response.json();
      if(!data||typeof data.updatedAt!=='string'||!Number.isFinite(Date.parse(data.updatedAt)))return this.currentData;
      const liveUpdate:LiveMarketUpdate=data;
      this.currentData = liveUpdate;

      // Inject the JSON response directly into matching HTML element IDs across all screens
      // React saved-source selectors alone own all rendered market observations.

      // Notify React subscribers
      this.listeners.forEach((listener) => listener(liveUpdate));

      return liveUpdate;
    } catch (err) {
      console.warn('Saved market publication unavailable:', err);
      return this.currentData;
    } finally {
      this.isQuerying = false;
    }
  }

  public destroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }
}

export const geminiController = GeminiController.getInstance();
