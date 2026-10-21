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
  { label: '상하이 컨테이너 운임 지수 (SCFI)', ticker: 'SCFI', category: 'Logistics', type: 'macro', targetId: 'driver-freight' },
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
                  className="group w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#DF0029] transition-colors" />
                    <span className="font-semibold text-slate-800 group-hover:text-[#DF0029] transition-colors">{item.label}</span>
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

// Stage 3 provides an inexpensive, read-only status endpoint. It does NOT call Gemini.
interface Stage3RefreshStatus {
  running?: boolean;
  lastAttempt?: {
    status?: string;
    completed?: string[];
    finishedAt?: string;
  } | null;
  snapshots?: Array<{ key: string; updatedAt: string | null }>;
}

type DailyUpdateState =
  | { status: 'loading' | 'none' | 'unavailable' }
  | { status: 'ready'; completedAt: string; partial: boolean };

function formatDailyUpdateKST(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '업데이트 시간 확인 불가';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(parsed);
  const value = (key: string) => parts.find(part => part.type === key)?.value || '';
  return `${value('year')}.${value('month')}.${value('day')} ${value('hour')}:${value('minute')} KST`;
}

interface HeaderProps {
  commodities: Commodity[];
  currency: Currency;
  onToggleCurrency: (curr: Currency) => void;
  onNavigate: (view: string, hash?: string) => void;
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
  const [dailyUpdate, setDailyUpdate] = useState<DailyUpdateState>({ status: 'loading' });
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const loadDailyStatus = async () => {
      try {
        const res = await fetch('/api/rms/refresh-status', { cache: 'no-store' });
        if (!res.ok) throw new Error(`Refresh status HTTP ${res.status}`);
        const data = await res.json() as Stage3RefreshStatus;
        if (!active) return;

        // Only a finished job with saved outputs is allowed to move the timestamp.
        // This avoids displaying a new time merely because the page opened or another
        // market feed updated. During a running job, preserve the prior display.
        const last = data.lastAttempt;
        if (data.running) return;
        if (last?.finishedAt && (last.completed?.length ?? 0) > 0 &&
            (last.status === 'completed' || last.status === 'partial')) {
          setDailyUpdate({ status: 'ready', completedAt: last.finishedAt, partial: last.status === 'partial' });
          return;
        }

        // Fall back to an actual saved snapshot after a process restart if needed.
        const latest = (data.snapshots ?? [])
          .filter(item => item.updatedAt && !Number.isNaN(Date.parse(item.updatedAt)))
          .sort((a, b) => Date.parse(b.updatedAt!) - Date.parse(a.updatedAt!))[0];
        if (latest?.updatedAt) {
          setDailyUpdate({ status: 'ready', completedAt: latest.updatedAt, partial: true });
        } else {
          setDailyUpdate({ status: 'none' });
        }
      } catch {
        if (active) setDailyUpdate(prev => prev.status === 'ready' ? prev : { status: 'unavailable' });
      }
    };
    void loadDailyStatus();
    // This polls metadata only (no Gemini requests). The displayed time stays
    // constant until another paid refresh is explicitly completed.
    const poll = window.setInterval(() => { void loadDailyStatus(); }, 60_000);
    const onFocus = () => { void loadDailyStatus(); };
    window.addEventListener('focus', onFocus);
    return () => { active = false; window.clearInterval(poll); window.removeEventListener('focus', onFocus); };
  }, []);

  useEffect(() => {
    // Continue receiving existing alerts; their timestamps do not affect the daily AI badge.
    const unsubscribe = clientMarketDataService.subscribe((payload: any) => {
      if (payload.alerts && payload.alerts.length > 0) setAlerts(payload.alerts);
    });
    return unsubscribe;
  }, []);

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

        {/* System record time, never a claim that every saved AI was generated then. */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-xs font-medium shadow-2xs"
          aria-live="polite"
          title="완료된 작업 또는 저장 기록의 시각입니다. 개별 AI 분석의 생성 시각이나 모든 데이터의 최신성을 의미하지 않습니다."
        >
          <span className="h-2 w-2 rounded-full shrink-0 bg-blue-500" />
          <span className="font-sans">시스템 기록</span>
          {dailyUpdate.status === 'ready' ? (
            <>
              <span className="text-slate-300">·</span>
              <span className="font-mono font-semibold">{formatDailyUpdateKST(dailyUpdate.completedAt)}</span>
            </>
          ) : (
            <span className="font-sans text-slate-500">
              {dailyUpdate.status === 'loading' ? '확인 중' : dailyUpdate.status === 'none' ? '기록 없음' : '상태 확인 불가'}
            </span>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
