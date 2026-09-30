import React, { useState, useEffect, useRef } from 'react';
import { Search, TrendingUp, X } from 'lucide-react';
import { Commodity, Currency } from '../types';
import { formatCleanModelName } from '../utils/formatters';
import { clientMarketDataService } from '../services/marketDataService';

export interface AlertItem {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  message: string;
}

export const getKSTTime = (dateInput?: Date | string) => {
  const now = dateInput instanceof Date ? dateInput : new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  if (typeof dateInput === 'string' && dateInput.trim()) {
    if (/^\d{4}\.\d{2}\.\d{2}/.test(dateInput)) {
      return dateInput;
    }
    const cleanTime = dateInput.replace(/\s*KST$/i, '').trim();
    return `${year}.${month}.${day} ${cleanTime} KST`;
  }

  const timeStr = now.toLocaleTimeString('en-US', { hour12: true });
  return `${year}.${month}.${day} ${timeStr} KST`;
};

// Searchable Assets Dataset
export const ASSET_ITEMS = [
  { label: '소맥 / 밀 (Wheat)', ticker: 'W_CBOT', category: 'Grains', type: 'commodity', path: 'commodity-wheat', id: 'wheat' },
  { label: '옥수수 (Corn)', ticker: 'C_CBOT', category: 'Grains', type: 'commodity', path: 'commodity-corn', id: 'corn' },
  { label: '대두 (Soybean)', ticker: 'S_CBOT', category: 'Grains', type: 'commodity', path: 'commodity-soybean', id: 'soybean' },
  { label: '대두유 (Soybean Oil)', ticker: 'BO_CBOT', category: 'Oils', type: 'commodity', path: 'commodity-soybean-oil', id: 'soybean-oil' },
  { label: '팜유 (Palm Oil)', ticker: 'FCPO', category: 'Oils', type: 'commodity', path: 'commodity-palm-oil', id: 'palm-oil' },
  { label: '원당 (Sugar)', ticker: 'SB_NYMEX', category: 'Softs', type: 'commodity', path: 'commodity-sugar', id: 'sugar' },
  { label: '감자 전분 (Potato Starch)', ticker: 'PS_EUR', category: 'Starches', type: 'commodity', path: 'commodity-potato-starch', id: 'potato-starch' },
  { label: '타피오카 전분 (Tapioca Starch)', ticker: 'TS_USD', category: 'Starches', type: 'commodity', path: 'commodity-tapioca-starch', id: 'tapioca-starch' },
  { label: '원/달러 환율 (USD/KRW)', ticker: 'FX_USDKRW', category: 'Macro', type: 'macro', targetId: 'driver-fx' },
  { label: '국제 유가 (Brent Crude)', ticker: 'BRENT', category: 'Macro', type: 'macro', targetId: 'driver-energy' },
  { label: '발틱 건화물 운임 지수 (BDI)', ticker: 'BDI', category: 'Logistics', type: 'macro', targetId: 'driver-freight' },
  { label: '상하이 컨테이너 운임 지수 (SCFI)', ticker: 'SCFI', category: 'Logistics', type: 'macro', targetId: 'external-pipeline-section' },
];

export const HeaderSearch = ({ onSelectAsset }: { onSelectAsset?: (asset: any) => void }) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = ASSET_ITEMS.filter(item =>
    item.label.toLowerCase().includes(query.toLowerCase()) ||
    item.ticker.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (item: typeof ASSET_ITEMS[0]) => {
    setQuery('');
    setIsOpen(false);
    if (onSelectAsset) onSelectAsset(item);
  };

  return (
    <div ref={containerRef} className="relative w-80">
      <div className="relative flex items-center">
        <Search className="absolute left-3 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && filtered.length > 0) {
              handleSelect(filtered[0]);
            }
            if (e.key === 'Escape') setIsOpen(false);
          }}
          placeholder="티커 또는 원자재 검색 (예: W_CBOT, 팜유, 대두)..."
          className="w-full pl-9 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 focus:bg-white transition-all"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-2.5 p-0.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Auto-suggest Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-50">
          {filtered.length > 0 ? (
            <div className="py-1">
              <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                추천 검색결과
              </div>
              {filtered.map((item) => (
                <button
                  key={item.ticker}
                  onClick={() => handleSelect(item)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-semibold text-slate-800">{item.label}</span>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                    {item.ticker}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-3 py-3 text-xs text-slate-400 text-center">
              일치하는 원자재 또는 티커가 없습니다.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface HeaderProps {
  commodities: Commodity[];
  currency: Currency;
  onToggleCurrency: (curr: Currency) => void;
  onNavigate: (view: string) => void;
  onOpenExportModal?: () => void;
  onRefreshGemini: () => void;
  isSyncing: boolean;
  lastSyncTime: string;
  modelVersion?: string;
}

export const Header: React.FC<HeaderProps> = ({
  commodities,
  currency,
  onToggleCurrency,
  onNavigate,
  onOpenExportModal,
  onRefreshGemini,
  isSyncing,
  lastSyncTime,
  modelVersion
}) => {
  const [alerts, setAlerts] = useState<AlertItem[]>([
    { id: 'a1', severity: 'high', title: '[긴급] 환율 변동성 확대', message: 'USD/KRW 1,388.50원 돌파, 원가상승 주의보 발령' },
    { id: 'a2', severity: 'medium', title: '[주시] 팜유 B40 시행 모멘텀', message: '인도네시아 2025 B40 의무화로 4,180 MYR 돌파' }
  ]);

  const highRiskCount = alerts.filter(a => a.severity === 'high').length;
  const [syncTimestamp, setSyncTimestamp] = useState<string>(getKSTTime());
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [failedSourcesCount, setFailedSourcesCount] = useState<number>(0);
  const formattedSyncTime = getKSTTime(syncTimestamp || lastSyncTime);

  useEffect(() => {
    if (lastSyncTime && lastSyncTime !== '실시간 LIVE' && lastSyncTime !== '30초 주기') {
      setSyncTimestamp(lastSyncTime);
    }
  }, [lastSyncTime]);

  useEffect(() => {
    const unsubscribe = clientMarketDataService.subscribe((payload: any) => {
      if (payload.lastUpdated) {
        setSyncTimestamp(payload.lastUpdated);
      }
      setFailedSourcesCount(payload.failedSourcesCount || 0);

      // Inject real alerts from the live telemetry payload if they exist
      if (payload.alerts && payload.alerts.length > 0) {
        setAlerts(payload.alerts);
      }
    });
    return unsubscribe;
  }, []);

  const handleAiRefresh = async () => {
    setSyncTimestamp(getKSTTime());
    try {
      await Promise.allSettled([
        onRefreshGemini ? onRefreshGemini() : Promise.resolve(),
        clientMarketDataService.refresh()
      ]);
    } catch (e) {
      console.error('Market data manual refresh error:', e);
    }
  };

  const handleSelectAsset = (item: any) => {
    if (item.type === 'macro') {
      onNavigate('main-dashboard', item.targetId);
      setTimeout(() => {
        const el = document.getElementById(item.targetId || 'macro-drivers-section') || document.getElementById('external-pipeline-section');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    } else if (item.path) {
      onNavigate(item.path);
    } else if (item.id) {
      const match = commodities.find((c) => c.id === item.id);
      if (match) onNavigate(match.path);
    } else if (item.ticker) {
      const match = commodities.find((c) => c.ticker.toLowerCase() === item.ticker.toLowerCase());
      if (match) {
        onNavigate(match.path);
      }
    }
  };

  return (
    <header className="fixed top-0 left-64 right-0 h-14 bg-white z-40 border-b border-[#e5e7eb] flex items-center justify-between px-4 print:hidden">
      {/* Search Input Component */}
      <HeaderSearch onSelectAsset={handleSelectAsset} />

      {/* Right controls: Currency toggle, Notification, Live Sync */}
      <div className="flex items-center gap-3">
        {/* Currency Toggle */}
        <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
          <button
            onClick={() => onToggleCurrency('KRW')}
            className={`px-2.5 py-0.5 text-[10px] font-bold rounded transition-colors ${
              currency === 'KRW'
                ? 'bg-white text-[#DF0029] shadow-xs'
                : 'text-[#6b7280] hover:text-[#111827]'
            }`}
            type="button"
          >
            KRW (₩)
          </button>
          <button
            onClick={() => onToggleCurrency('USD')}
            className={`px-2.5 py-0.5 text-[10px] font-bold rounded transition-colors ${
              currency === 'USD'
                ? 'bg-white text-[#DF0029] shadow-xs'
                : 'text-[#6b7280] hover:text-[#111827]'
            }`}
            type="button"
          >
            USD ($)
          </button>
          <button
            onClick={() => onToggleCurrency('EUR')}
            className={`px-2.5 py-0.5 text-[10px] font-bold rounded transition-colors ${
              currency === 'EUR'
                ? 'bg-white text-[#DF0029] shadow-xs'
                : 'text-[#6b7280] hover:text-[#111827]'
            }`}
            type="button"
          >
            EUR (€)
          </button>
        </div>

        {/* Single Live Sync Timestamp Badge */}
        <button
          onClick={handleAiRefresh}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
            isSyncing
              ? 'bg-blue-50 border-blue-200 text-blue-700'
              : failedSourcesCount > 0
              ? 'bg-rose-50 border-rose-200 text-[#DF0029] hover:bg-rose-100'
              : 'border-blue-200 bg-blue-50/50 text-blue-700 hover:bg-blue-100'
          }`}
          title={
            failedSourcesCount > 0
              ? `${failedSourcesCount}개 소스 갱신 실패 (이전 성공 데이터 유지 중, 클릭 시 재시도)`
              : '클릭 시 중앙 소스 레지스트리 및 실시간 시장 데이터 즉시 갱신'
          }
        >
          {isSyncing ? (
            <span className="flex items-center gap-1.5 font-sans">
              <span className="w-2 h-2 rounded-full inline-block bg-blue-600 animate-spin"></span>
              <span className="font-semibold text-blue-700">데이터 갱신 중...</span>
            </span>
          ) : failedSourcesCount > 0 ? (
            <span className="flex items-center gap-1.5 font-sans">
              <span className="w-2 h-2 rounded-full inline-block bg-[#DF0029]"></span>
              <span>일부 소스 갱신 실패</span>
              <span>·</span>
              <span className="font-mono text-rose-600 font-semibold">{formattedSyncTime}</span>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
              <span className="font-sans">실시간 동기화 (Live Sync)</span>
              <span>·</span>
              <span className="font-mono text-blue-700 font-semibold">{formattedSyncTime}</span>
            </span>
          )}
        </button>
      </div>
    </header>
  );
};

export default Header;
