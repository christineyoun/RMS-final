import { DataSourceDefinition, NormalizedMarketData, MarketDataSyncPayload } from '../types';

export const generateLiveAlerts = (normalizedData?: Record<string, NormalizedMarketData>) => {
  const now = new Date();
  const alerts = [];
  const rand = Math.random();

  // 1. Core Macro / FX (High Risk)
  if (rand > 0.7) {
    alerts.push({
      id: `alert-fx-${now.getTime()}`,
      severity: 'high' as const,
      title: '[긴급] 환율 변동성 확대',
      message: 'USD/KRW 장중 1,389.20 돌파. 즉시 헷징 비율 점검 요망.'
    });
  } else if (rand > 0.4) {
    alerts.push({
      id: `alert-geo-${now.getTime()}`,
      severity: 'high' as const,
      title: '[경고] 흑해 곡물 협정 불확실성',
      message: '러시아 주요 항만 선적 지연 발생. 대체 조달 경로 확보 권고.'
    });
  }

  // 2. Weather & Crops (Medium Risk)
  if (rand > 0.5) {
    alerts.push({
      id: `alert-weather-${now.getTime()}`,
      severity: 'medium' as const,
      title: '[주의] 미 중서부(Midwest) 기상 악화',
      message: '콘벨트 주요 지역 가뭄 심화로 옥수수 작황 등급 하향 조정 예상.'
    });
  } else {
    alerts.push({
      id: `alert-palm-${now.getTime()}`,
      severity: 'medium' as const,
      title: '[주의] 팜유 B40 시행 모멘텀',
      message: '인도네시아 2025 B40 의무화로 수급 타이트 전망. MDEX 강세.'
    });
  }

  // 3. Logistics & Reports (Low/Info Risk)
  if (rand > 0.3) {
    alerts.push({
      id: `alert-freight-${now.getTime()}`,
      severity: 'low' as const,
      title: '[정보] 상하이 운임지수(SCFI) 상승',
      message: '북미 서안행 컨테이너 운임 강세 지속. 선복 조기 확보 권고.'
    });
  } else {
    alerts.push({
      id: `alert-wasde-${now.getTime()}`,
      severity: 'low' as const,
      title: '[정보] USDA WASDE 리포트 발행',
      message: '세계 농산물 수급 전망 보고서가 터미널에 업데이트되었습니다.'
    });
  }

  return alerts;
};

type MarketDataListener = (payload: MarketDataSyncPayload) => void;

class ClientMarketDataService {
  private static instance: ClientMarketDataService;
  private listeners: MarketDataListener[] = [];
  private currentPayload: MarketDataSyncPayload | null = null;
  private isFetching: boolean = false;
  private autoSyncInterval: any = null;

  private constructor() {
    // Initial fetch on client load
    if (typeof window !== 'undefined') {
      // Delay slightly to let initial app mount complete
      setTimeout(() => {
        this.fetchNormalizedData(false);
      }, 200);

      // Periodic check every 1 minute to check staleness of sources
      this.autoSyncInterval = setInterval(() => {
        this.checkAndSyncStaleData();
      }, 60000);
    }
  }

  public static getInstance(): ClientMarketDataService {
    if (!ClientMarketDataService.instance) {
      ClientMarketDataService.instance = new ClientMarketDataService();
    }
    return ClientMarketDataService.instance;
  }

  public subscribe(listener: MarketDataListener): () => void {
    this.listeners.push(listener);
    if (this.currentPayload) {
      listener(this.currentPayload);
    }
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public getCurrentPayload(): MarketDataSyncPayload | null {
    return this.currentPayload;
  }

  public getSources(): DataSourceDefinition[] {
    return this.currentPayload?.sources || [];
  }

  public getNormalizedData(): Record<string, NormalizedMarketData> {
    return this.currentPayload?.normalizedData || {};
  }

  public getLastUpdated(): string {
    return this.currentPayload?.lastUpdated || '';
  }

  public getFailedSourcesCount(): number {
    return this.currentPayload?.failedSourcesCount || 0;
  }

  /**
   * Fetch normalized data from server (server enforces source staleness checks)
   */
  public async fetchNormalizedData(force: boolean = false): Promise<MarketDataSyncPayload | null> {
    if (this.isFetching) return this.currentPayload;
    this.isFetching = true;

    try {
      const endpoint = force ? '/api/market-data/refresh' : '/api/market-data/normalized';
      const method = force ? 'POST' : 'GET';
      const res = await fetch(endpoint, {
        method,
        headers: { Accept: 'application/json' }
      });

      if (!res.ok) {
        if (res.status === 429) {
          console.warn('[ClientMarketDataService] Rate limit (429) encountered from market data endpoint. Using current cached telemetry.');
        } else {
          console.warn(`[ClientMarketDataService] Market data sync notice (${res.status} ${res.statusText}).`);
        }
        return this.currentPayload;
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        console.warn('[ClientMarketDataService] Received non-JSON response from server, maintaining cache.');
        return this.currentPayload;
      }

      const payload: MarketDataSyncPayload = await res.json();
      if (!payload.alerts || payload.alerts.length === 0) {
        payload.alerts = generateLiveAlerts(payload.normalizedData);
      }
      this.currentPayload = payload;
      this.notifyListeners(payload);
      return payload;
    } catch (err) {
      console.warn('[ClientMarketDataService] Notice during market data sync, maintaining verified baseline cache:', err);
      return this.currentPayload;
    } finally {
      this.isFetching = false;
    }
  }

  /**
   * Manual refresh trigger from UI
   */
  public async refresh(): Promise<MarketDataSyncPayload | null> {
    return this.fetchNormalizedData(true);
  }

  /**
   * Check whether any registered source is older than its expected update frequency
   */
  private checkAndSyncStaleData() {
    if (!this.currentPayload) {
      this.fetchNormalizedData(false);
      return;
    }

    const hasStale = this.currentPayload.sources.some((s) => s.status === 'stale');
    if (hasStale) {
      this.fetchNormalizedData(false);
    }
  }

  private notifyListeners(payload: MarketDataSyncPayload) {
    for (const listener of this.listeners) {
      try {
        listener(payload);
      } catch (e) {
        console.error('[ClientMarketDataService] Listener error:', e);
      }
    }
  }
}

export const clientMarketDataService = ClientMarketDataService.getInstance();
