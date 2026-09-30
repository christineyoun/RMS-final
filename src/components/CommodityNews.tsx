import React, { useState, useEffect } from 'react';
import { Newspaper } from 'lucide-react';
import { getPublisherPortalUrl, isInvalidOrSearchUrl } from '../utils/portalUrls';

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
}

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

export const CommodityNews: React.FC<{ commodityId: string }> = ({ commodityId }) => {
  const [articles, setArticles] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    const fetchMarketIntelligence = async () => {
      setIsLoading(true);
      if (isMounted) setArticles([]);

      try {
        const res = await fetch(`/api/market-intelligence?commodity=${commodityId}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        if (json.success && Array.isArray(json.articles)) {
          const seenUrls = new Set<string>();
          const seenTitles = new Set<string>();
          const todayIso = new Date().toISOString().split('T')[0];

          const mapped: NewsItem[] = json.articles
            .filter((art: any) => art && (art.title || art.title_kr))
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
              };
            })
            .filter((art: NewsItem) => {
              const normUrl = !art.unavailable && art.originalUrl ? normalizeUrlKey(art.originalUrl) : '';
              const normTitle = normalizeTitleKey(art.title);
              if (!normTitle) return false;

              // Deduplicate by originalUrl first, then normalized title
              if (normUrl && seenUrls.has(normUrl)) return false;
              if (seenTitles.has(normTitle)) return false;

              if (normUrl) seenUrls.add(normUrl);
              seenTitles.add(normTitle);
              return true;
            })
            .slice(0, 6);

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
  }, [commodityId]);

  const headerPortalUrl = getPublisherPortalUrl(commodityId);

  return (
    <div className="mt-6 bg-white rounded-xl border border-slate-200 p-5 shadow-sm pdf-section-card min-h-[220px] print:mt-8 print:pt-4 break-inside-avoid print:break-inside-avoid">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Newspaper className="w-5 h-5 text-slate-700 shrink-0" />
          <h3 className="text-base font-bold text-slate-900 break-keep">
            주요 이슈 및 시장 동향 (Market Intelligence)
          </h3>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {isLoading && (
            <span className="text-xs text-indigo-600 font-medium animate-pulse shrink-0">
              최신 공식자료 검색 중...
            </span>
          )}
          <a
            href={headerPortalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-500 hover:text-indigo-600 flex items-center gap-1 font-medium transition-colors"
          >
            <span>발행기관 공식 허브</span>
            <span aria-hidden="true" className="text-[10px]">↗</span>
          </a>
        </div>
      </div>

      {articles.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {articles.map((item) => {
            const targetUrl = !item.unavailable && item.originalUrl && !isInvalidOrSearchUrl(item.originalUrl)
              ? item.originalUrl
              : getPublisherPortalUrl(item.sourceName, item.originalUrl);

            return (
              <article
                key={item.id}
                className="news-card-item p-4 bg-white border border-slate-200 rounded-lg hover:border-slate-300 hover:shadow-sm transition-all flex flex-col justify-between min-w-0"
              >
                <div>
                  {/* Top Row: Pill Badges */}
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[11px] font-sans font-medium rounded border border-slate-200">
                        {item.sourceName}
                      </span>
                      {item.category && (
                        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-medium rounded border border-blue-100">
                          {item.category}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Title Link */}
                  <h4 className="text-sm font-bold text-slate-900 hover:text-blue-600 hover:underline leading-snug break-keep cursor-pointer transition-colors mb-1.5">
                    {targetUrl ? (
                      <a
                        href={targetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="block w-full"
                      >
                        {item.title}
                      </a>
                    ) : (
                      <span className="block w-full text-slate-900">
                        {item.title}
                      </span>
                    )}
                  </h4>

                  {/* Summary Paragraph */}
                  {item.summary && (
                    <p className="text-xs text-slate-600 leading-relaxed mt-1.5 break-keep line-clamp-2">
                      {item.summary}
                    </p>
                  )}
                </div>

                {/* Unified Footer Row: Date + Region (No duplicate source name) */}
                <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400 flex-wrap">
                    <span>{item.publishedAt}</span>
                    {item.affectedRegion && (
                      <>
                        <span>·</span>
                        <span className="font-sans text-slate-500 text-[11px]">
                          {item.affectedRegion}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="min-h-[120px] flex items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 text-center">
          <p className="text-xs text-slate-500">
            {isLoading ? '검증된 최신 이슈를 불러오는 중입니다.' : '현재 표시할 수 있는 검증된 최신 이슈가 없습니다.'}
          </p>
        </div>
      )}
    </div>
  );
};
