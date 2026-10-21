import React, { useState, useEffect } from 'react';
import { Newspaper } from 'lucide-react';
import { isInvalidOrSearchUrl } from '../utils/portalUrls';
import { assessNewsSummary } from '../utils/newsSummaryQuality';

export interface NewsItem {
  id: string;
  title: string;
  sourceName: string;
  sourceType: 'news' | 'official' | 'company';
  publishedAt: string;
  originalUrl: string;
  retrievedAt: string;
  summary: string;
  category?: string;
  affectedRegion?: string;
  unavailable?: boolean;
  linkStatus?: 'verified' | 'unverified';
}

// Display-only attribution aliases. Unknown publishers retain their saved label.
// Reuters attribution is restricted to the independently verified MPOB reprint.
export const marketIntelligenceSourceLabel = (name: string, originalUrl: string): string => {
  try {
    const url = new URL(originalUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (name.trim().toLowerCase().replace(/^www\./, '') !== host) return name;
    if (host === 'prestasisawit.mpob.gov.my') {
      return url.pathname.replace(/\/$/, '') === '/ms/palmnews/news/40027' ? 'MPOB · Reuters' : 'MPOB';
    }
    const publishers: Record<string, string> = {
      'briefs.co': 'Briefs',
      'sunsirs.com': 'SunSirs',
      'theedgemalaysia.com': 'The Edge Malaysia',
      'commodity-board.com': 'Commodity Board',
      'world-grain.com': 'World Grain',
      'ers.usda.gov': 'USDA ERS',
      'igc.int': 'International Grains Council',
      'ahdb.org.uk': 'AHDB',
      'grains.org': 'U.S. Grains & BioProducts Council',
    };
    return publishers[host] || name;
  } catch {
    return name;
  }
};

const formatPublicationDate = (value?: string) => {
  if (!value) return '발행일 미확인';
  const normalized = value.trim();
  if (/^\d{4}-\d{2}$/.test(normalized)) return normalized.replace('-', '.');
  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}.${m}.${d}`;
  }
  return normalized;
};

const isGoogleNewsLabel = (label?: string): boolean => {
  if (!label) return false;
  const lower = label.trim().toLowerCase();
  return (
    lower === 'google news' ||
    lower === 'news.google.com' ||
    lower === '구글 뉴스' ||
    lower.startsWith('google news')
  );
};

const isVerifiableOriginalUrl = (url?: string): boolean => {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;
  if (
    trimmed.includes('news.google.com/search') ||
    trimmed.includes('google.com/search') ||
    trimmed.includes('google.com/url?')
  ) {
    return false;
  }
  return true;
};

const normalizeUrlKey = (url?: string): string => {
  if (!url) return '';
  try {
    const parsed = new URL(url.trim());
    parsed.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'oc'].forEach((p) =>
      parsed.searchParams.delete(p)
    );
    return parsed.toString().replace(/\/+$/, '').toLowerCase();
  } catch {
    return url.trim().replace(/\/+$/, '').toLowerCase();
  }
};

const normalizeTitleKey = (title?: string): string => {
  if (!title) return '';
  return title
    .trim()
    .toLowerCase()
    .replace(/[\s\-–—·•:|]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim();
};

export const CommodityNews: React.FC<{ commodityId: string; isSyncing?: boolean }> = ({ commodityId, isSyncing }) => {
  const [articles, setArticles] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    const fetchMarketIntelligence = async () => {
      setIsLoading(true);
      if (isMounted) setArticles([]);

      try {
        // Never bypass the server's daily news cache during normal page navigation.
        const res = await fetch(`/api/market-intelligence?commodity=${commodityId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        if (json.success && Array.isArray(json.articles)) {
          const seenUrls = new Set<string>();
          const seenTitles = new Set<string>();
          const todayIso = new Date().toISOString().split('T')[0];

          const mapped: NewsItem[] = json.articles
            .filter((art: any) => art && (art.title || art.title_kr) &&
              assessNewsSummary(art.summary ?? art.summary_kr,
                art.title ?? art.title_kr, commodityId).pass)
            .map((art: any, idx: number) => {
              const savedSourceName = String(art.sourceName ?? art.source ?? '').trim();
              const savedOriginalUrl = String(art.originalUrl ?? art.original_url ?? art.articleUrl ?? '').trim();
              const savedPublishedAt = String(art.publishedAt ?? art.publication_date ?? '').trim();
              const savedRetrievedAt = String(art.retrievedAt ?? todayIso).trim();
              const savedSourceType: 'news' | 'official' | 'company' =
                art.sourceType === 'official' || art.sourceType === 'company' || art.sourceType === 'news'
                  ? art.sourceType
                  : 'news';

              const isVerified =
                !art.unavailable &&
                (commodityId !== 'wheat' || art.linkStatus === 'verified') &&
                Boolean(savedSourceName) &&
                !isGoogleNewsLabel(savedSourceName) &&
                isVerifiableOriginalUrl(savedOriginalUrl);

              return {
                id: `mi-${commodityId}-${idx}`,
                title: String(art.title ?? art.title_kr ?? '').trim(),
                sourceName: isVerified ? savedSourceName : '출처 확인 불가 (Unavailable)',
                sourceType: savedSourceType,
                publishedAt: formatPublicationDate(savedPublishedAt),
                originalUrl: isVerified ? savedOriginalUrl : '',
                retrievedAt: savedRetrievedAt,
                summary: String(art.summary ?? art.summary_kr ?? '').trim(),
                category: art.category,
                affectedRegion: art.affectedRegion ?? art.affected_region,
                unavailable: !isVerified,
                linkStatus: art.linkStatus,
              };
            })
            .filter((art: NewsItem) => {
              if (art.unavailable || !art.originalUrl) return false;
              const normUrl = normalizeUrlKey(art.originalUrl);
              const normTitle = normalizeTitleKey(art.title);
              if (!normTitle) return false;

              // Deduplicate by originalUrl first, then normalized title
              if (normUrl && seenUrls.has(normUrl)) return false;
              if (seenTitles.has(normTitle)) return false;

              if (normUrl) seenUrls.add(normUrl);
              seenTitles.add(normTitle);
              return true;
            })
            .slice(0, 4);

          if (isMounted) setArticles(mapped);
        }
      } catch (err) {
        console.warn('[CommodityNews] Live market intelligence fetch notice:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchMarketIntelligence();
    return () => {
      isMounted = false;
    };
  }, [commodityId, isSyncing]);

  return (
    <div className="mt-6 bg-white rounded-xl border border-slate-200 p-5 shadow-sm pdf-section-card min-h-[220px] print:mt-8 print:pt-4 break-inside-avoid print:break-inside-avoid">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Newspaper className="w-5 h-5 text-slate-700 shrink-0" />
          <h3 className="text-base font-bold text-slate-900 break-keep">
            주요 이슈 및 시장 동향 (Market Intelligence)
          </h3>
        </div>
        {isLoading && (
          <span className="text-xs text-[#2563EB] font-medium animate-pulse shrink-0">
            불러오는 중...
          </span>
        )}
      </div>

      {articles.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {articles.map((item) => {
            // Click only an independently verified direct article; never fall back to a portal homepage.
            const targetUrl = !item.unavailable && item.originalUrl && !isInvalidOrSearchUrl(item.originalUrl)
              ? item.originalUrl : '';

            return (
              <a
                key={item.id}
                href={targetUrl || undefined}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={targetUrl ? `${item.title} 원문 새 탭에서 열기` : undefined}
                className="news-card-item group p-4 bg-white border border-slate-200 rounded-lg hover:border-[#DF0029] hover:shadow-md transition-all flex flex-col justify-between min-w-0 cursor-pointer no-underline text-inherit"
              >
                <div>
                  {/* Top Bar: Category (Left) & Explicit Affected Region Label (Right) */}
                  <div className="flex items-center justify-between mb-2.5 gap-2">
                    <div>
                      {item.category && (
                        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-medium rounded border border-blue-100">
                          {item.category}
                        </span>
                      )}
                    </div>
                    {item.affectedRegion && (
                      <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                        <span className="material-symbols-outlined text-[11px] text-slate-400">location_on</span>
                        <span>영향 지역: {item.affectedRegion}</span>
                      </span>
                    )}
                  </div>

                  {/* Title & Summary */}
                  <h4 className="text-sm font-bold text-slate-900 group-hover:text-[#DF0029] transition-colors leading-snug break-keep mb-1.5">
                    {item.title}
                  </h4>
                  {item.summary && (
                    <p className="text-xs text-slate-600 leading-relaxed mb-3 whitespace-normal break-words">
                      {item.summary}
                    </p>
                  )}

                </div>

                {/* Footer Divider & Bottom Bar: Date (Left) & Source (Right) */}
                <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                  <span className="text-[11px] font-medium text-slate-400">{formatPublicationDate(item.publishedAt)}</span>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[11px] font-medium rounded border border-slate-200">
                    {marketIntelligenceSourceLabel(item.sourceName, item.originalUrl)}
                  </span>
                </div>
              </a>
            );
          })}

        </div>
      ) : (
        <div className="min-h-[120px] flex items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 text-center">
          <p className="text-xs text-slate-500">
            {isLoading ? '검증된 최신 이슈를 불러오는 중입니다.' : '저장된 시장 소식이 없습니다.'}
          </p>
        </div>
      )}
    </div>
  );
};
