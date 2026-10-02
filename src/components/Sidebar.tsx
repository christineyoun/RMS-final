import React from 'react';
import { CommodityId } from '../types';

interface SidebarProps {
  activeView: string;
  onNavigate: (view: string, hash?: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeView, onNavigate }) => {
  const commoditiesList: Array<{ id: CommodityId; path: string; name: string }> = [
    { id: 'wheat', path: 'commodity-wheat', name: '소맥 (Wheat)' },
    { id: 'corn', path: 'commodity-corn', name: '옥수수 (Corn - CBOT)' },
    { id: 'soybean', path: 'commodity-soybean', name: '대두 (Soybean - CBOT)' },
    { id: 'soybean-oil', path: 'commodity-soybean-oil', name: '대두유 (Soybean Oil)' },
    { id: 'palm-oil', path: 'commodity-palm-oil', name: '팜유 (Palm Oil)' },
    { id: 'sugar', path: 'commodity-sugar', name: '원당 (Sugar - ICE #11)' },
    { id: 'potato-starch', path: 'commodity-potato-starch', name: '감자 전분 (Potato Starch)' },
    { id: 'tapioca-starch', path: 'commodity-tapioca-starch', name: '타피오카 전분 (Tapioca Starch)' }
  ];

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-white z-50 flex flex-col justify-between border-r border-[#e5e7eb] print:hidden">
      <div className="flex flex-col">
        {/* Top Branding */}
        <div className="h-14 px-4 flex items-center justify-start border-b border-[#e5e7eb] bg-[#f9fafb]">
          <div className="flex items-center gap-3 shrink-0">
            {/* Compact RMS Logo Box */}
            <div className="flex items-center justify-center bg-[#DF0029] text-white font-bold text-sm px-1.5 py-0.5 rounded tracking-wide shrink-0">
              RMS
            </div>
            
            {/* Main App Title & Subtitle */}
            <div className="flex flex-col justify-center">
              <h1 className="text-sm font-bold text-slate-900 leading-tight">
                원자재 모니터링
              </h1>
              <span className="text-[11px] text-slate-500 mt-0.5 leading-none">
                농심 구매팀
              </span>
            </div>
          </div>
        </div>

        {/* Scrollable Navigation */}
        <div className="p-2 overflow-y-auto max-h-[calc(100vh-140px)]">
          <nav className="flex flex-col gap-1">
            {/* Top Item: 종합 터미널 */}
            <div className="px-1.5 mb-1">
              <button
                type="button"
                onClick={() => onNavigate('main-dashboard')}
                className="flex items-center w-full py-1 text-xs font-bold text-slate-900 hover:text-[#DF0029] transition-colors whitespace-nowrap"
              >
                <span>종합 터미널</span>
                <span className="text-xs font-sans font-medium text-black tracking-tight ml-1">
                  (Overview Terminal)
                </span>
                {activeView === 'main-dashboard' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#DF0029] ml-auto"></span>
                )}
              </button>
            </div>

            {/* Section 1 Header: 원자재 모니터링 */}
            <div className="flex items-center justify-between w-full px-1.5 mt-3 mb-1">
              <div className="flex items-baseline whitespace-nowrap">
                <h3 className="text-xs font-bold text-slate-900">
                  원자재 모니터링
                </h3>
                <span className="text-xs font-sans font-medium text-black tracking-tight ml-1">
                  (Commodities)
                </span>
              </div>
              <span className="inline-flex items-center justify-center text-[10px] font-sans font-medium text-slate-500 bg-slate-100/90 border border-slate-200/80 px-2 h-5 rounded-full shrink-0 whitespace-nowrap leading-none tracking-tight">
                8종 실시간
              </span>
            </div>

            {/* Commodity Navigation Links Container */}
            <div className="pl-2 space-y-0.5 border-l border-slate-100 ml-2.5">
              {commoditiesList.map((item) => {
                const isActive = activeView === item.path;
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => onNavigate(item.path)}
                    className={`w-full text-left flex items-center justify-between px-3 py-1.5 rounded transition-colors text-xs ${
                      isActive
                        ? 'bg-[#f1f3f5] text-[#111827] font-bold border-l-[3px] border-[#DF0029]'
                        : 'text-[#4b5563] hover:bg-[#f9fafb] hover:text-[#111827]'
                    }`}
                  >
                    <span>{item.name}</span>
                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#DF0029]"></span>}
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      </div>
    </aside>
  );
};
