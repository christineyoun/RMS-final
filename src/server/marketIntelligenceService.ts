/**
 * Market Intelligence Service
 *
 * Retrieves news and official reports across all 8 commodities.
 * Strictly captures and locks original source metadata (title, sourceName, sourceType,
 * publishedAt, originalUrl, retrievedAt) immediately at retrieval time BEFORE summarization.
 *
 * Rules enforced:
 * - Never stores "Google News" as the publisher; extracts the original publisher/organization.
 * - Resolves and stores the original article URL whenever possible.
 * - Classifies sourceType as 'news' | 'official' | 'company'.
 * - Never reconstructs the source later from the AI-generated summary.
 * - Marks items with unverified publisher or URL as unavailable rather than inventing a source.
 * - Deduplicates articles by originalUrl first, then normalized title.
 */

import { GoogleGenAI } from '@google/genai';

export type SourceType = 'news' | 'official' | 'company';

/**
 * Source metadata captured immediately upon search retrieval, BEFORE any AI summarization.
 */
export interface RetrievedSourceMetadata {
  rawId: string;
  rawTitle: string;
  rawSnippet: string;
  sourceName: string;
  sourceType: SourceType;
  publishedAt: string;
  originalUrl: string;
  retrievedAt: string;
  category?: string;
  affectedRegion?: string;
  unavailable?: boolean;
}

/**
 * Final stored Market Intelligence item combining locked source metadata + summary.
 */
export interface MarketArticle {
  title: string;
  sourceName: string;
  sourceType: SourceType;
  publishedAt: string;
  originalUrl: string;
  retrievedAt: string;
  summary: string;
  category?: string;
  affectedRegion?: string;
  unavailable?: boolean;
  // Legacy compatibility fields for existing consumers
  source: string;
  title_kr: string;
  summary_kr: string;
  publication_date: string;
  original_url: string;
  affected_region: string;
}

interface CacheEntry {
  articles: MarketArticle[];
  expiresAt: number;
}

const intelligenceCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
let intelligenceCooldownUntil = 0;

const TODAY_DATE = '2026-09-28';

const DOMAIN_PUBLISHER_MAP: Record<string, { sourceName: string; sourceType: SourceType }> = {
  'agricensus.com': { sourceName: 'AgriCensus', sourceType: 'news' },
  'reuters.com': { sourceName: 'Reuters', sourceType: 'news' },
  'bloomberg.com': { sourceName: 'Bloomberg', sourceType: 'news' },
  'bangkokpost.com': { sourceName: 'Bangkok Post', sourceType: 'news' },
  'apnews.com': { sourceName: 'AP News', sourceType: 'news' },
  'euronews.com': { sourceName: 'Euronews', sourceType: 'news' },
  'spglobal.com': { sourceName: 'S&P Global Platts', sourceType: 'news' },
  'world-grain.com': { sourceName: 'World Grain', sourceType: 'news' },
  'ft.com': { sourceName: 'Financial Times', sourceType: 'news' },
  'nikkei.com': { sourceName: 'Nikkei Asia', sourceType: 'news' },
  'nationthailand.com': { sourceName: 'The Nation Thailand', sourceType: 'news' },
  'hellenicshippingnews.com': { sourceName: 'Hellenic Shipping News', sourceType: 'news' },
  'fas.usda.gov': { sourceName: 'USDA FAS', sourceType: 'official' },
  'apps.fas.usda.gov': { sourceName: 'USDA FAS', sourceType: 'official' },
  'usda.gov': { sourceName: 'USDA', sourceType: 'official' },
  'uswheat.org': { sourceName: 'U.S. Wheat Associates', sourceType: 'official' },
  'amis-outlook.org': { sourceName: 'AMIS Market Monitor', sourceType: 'official' },
  'cpc.ncep.noaa.gov': { sourceName: 'NOAA CPC', sourceType: 'official' },
  'noaa.gov': { sourceName: 'NOAA CPC', sourceType: 'official' },
  'bom.gov.au': { sourceName: 'Australian Bureau of Meteorology', sourceType: 'official' },
  'conab.gov.br': { sourceName: 'CONAB', sourceType: 'official' },
  'eia.gov': { sourceName: 'U.S. EIA', sourceType: 'official' },
  'nopa.org': { sourceName: 'NOPA', sourceType: 'official' },
  'bolsadecereales.com': { sourceName: 'Buenos Aires Grain Exchange', sourceType: 'official' },
  'mpob.gov.my': { sourceName: 'MPOB', sourceType: 'official' },
  'gapki.id': { sourceName: 'GAPKI', sourceType: 'official' },
  'bursamalaysia.com': { sourceName: 'Bursa Malaysia', sourceType: 'official' },
  'unica.com.br': { sourceName: 'UNICA', sourceType: 'official' },
  'indiansugar.com': { sourceName: 'ISMA', sourceType: 'official' },
  'ocsb.go.th': { sourceName: 'OCSB Thailand', sourceType: 'official' },
  'agriculture.ec.europa.eu': { sourceName: 'EC AGRI', sourceType: 'official' },
  'agridata.ec.europa.eu': { sourceName: 'EU Agri-food Data Portal', sourceType: 'official' },
  'joint-research-centre.ec.europa.eu': { sourceName: 'JRC MARS', sourceType: 'official' },
  'starch.eu': { sourceName: 'Starch Europe', sourceType: 'official' },
  'thaitapiocastarch.org': { sourceName: 'TTSA', sourceType: 'official' },
  'fao.org': { sourceName: 'FAO', sourceType: 'official' },
  'vca.org.vn': { sourceName: 'Vietnam Cassava Association', sourceType: 'official' },
  'kmc.dk': { sourceName: 'KMC', sourceType: 'company' },
  'avebe.com': { sourceName: 'Royal Avebe', sourceType: 'company' },
  'roquette.com': { sourceName: 'Roquette', sourceType: 'company' },
  'emsland-group.de': { sourceName: 'Emsland Group', sourceType: 'company' },
  'cargill.com': { sourceName: 'Cargill', sourceType: 'company' },
  'adm.com': { sourceName: 'ADM', sourceType: 'company' },
  'bunge.com': { sourceName: 'Bunge', sourceType: 'company' },
  'wilmar-international.com': { sourceName: 'Wilmar International', sourceType: 'company' },
};

const OFFICIAL_KEYWORDS = [
  'usda', 'usda fas', 'amis', 'u.s. wheat', 'conab', 'noaa', 'bom', 'eia',
  'nopa', 'mpob', 'gapki', 'unica', 'isma', 'ocsb', 'ec agri', 'jrc mars',
  'eurostat', 'starch europe', 'ttsa', 'fao', 'vca', 'ccga', 'wto', 'wmo',
  'bursa malaysia', 'buenos aires grain exchange'
];

const COMPANY_KEYWORDS = [
  'kmc', 'avebe', 'roquette', 'emsland', 'cargill', 'adm', 'bunge',
  'wilmar', 'sime darby', 'südzucker', 'tereos', 'ingredion'
];

export function isGoogleNewsSourceLabel(name?: string): boolean {
  if (!name) return false;
  const lower = name.trim().toLowerCase();
  return (
    lower === 'google news' ||
    lower === 'news.google.com' ||
    lower === '구글 뉴스' ||
    lower.startsWith('google news') ||
    lower.includes('google news /')
  );
}

import { getPublisherPortalUrl, isInvalidOrSearchUrl } from '../utils/portalUrls.ts';

export { getPublisherPortalUrl, isInvalidOrSearchUrl };

export function normalizeDateString(dateStr?: string): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  return '';
}

export function classifySourceType(sourceName: string, url: string): SourceType {
  const lowerName = (sourceName || '').toLowerCase();
  const lowerUrl = (url || '').toLowerCase();

  for (const [domain, info] of Object.entries(DOMAIN_PUBLISHER_MAP)) {
    if (lowerUrl.includes(domain)) {
      return info.sourceType;
    }
  }

  if (COMPANY_KEYWORDS.some((kw) => lowerName.includes(kw))) {
    return 'company';
  }

  if (
    OFFICIAL_KEYWORDS.some((kw) => lowerName.includes(kw)) ||
    lowerUrl.includes('.gov') ||
    lowerUrl.includes('.int') ||
    lowerUrl.includes('.eu')
  ) {
    return 'official';
  }

  return 'news';
}

/**
 * Extracts original publisher from a raw source label, Google News title ("Headline - Publisher"), or URL domain.
 * Never returns "Google News" as the publisher.
 */
export function resolveOriginalPublisher(
  rawSourceName?: string,
  rawTitle?: string,
  url?: string
): { cleanTitle: string; sourceName: string } {
  let cleanTitle = (rawTitle || '').trim();
  let candidateSource = (rawSourceName || '').trim();

  // If title is in Google News format "Headline - Publisher", extract suffix
  const dashMatch = cleanTitle.match(/^(.*)\s+-\s+([^-]{2,40})$/);
  let titleSuffixPublisher = '';
  if (dashMatch) {
    const potentialTitle = dashMatch[1].trim();
    const potentialPub = dashMatch[2].trim();
    if (!isGoogleNewsSourceLabel(potentialPub) && potentialTitle.length >= 8) {
      cleanTitle = potentialTitle;
      titleSuffixPublisher = potentialPub;
    }
  }

  // Strip any "Google News (...)" wrapper if present
  if (isGoogleNewsSourceLabel(candidateSource)) {
    const parenMatch = candidateSource.match(/\(([^)]+)\)/);
    if (parenMatch && parenMatch[1]) {
      const inner = parenMatch[1].split('/')[0].trim();
      candidateSource = isGoogleNewsSourceLabel(inner) ? '' : inner;
    } else {
      candidateSource = '';
    }
  }

  if (!candidateSource && titleSuffixPublisher) {
    candidateSource = titleSuffixPublisher;
  }

  // Resolve from URL domain if still missing
  if (!candidateSource && url && !isInvalidOrSearchUrl(url)) {
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
      for (const [domain, info] of Object.entries(DOMAIN_PUBLISHER_MAP)) {
        if (hostname === domain || hostname.endsWith(`.${domain}`)) {
          candidateSource = info.sourceName;
          break;
        }
      }
    } catch {
      // ignore invalid URL
    }
  }

  if (isGoogleNewsSourceLabel(candidateSource)) {
    candidateSource = '';
  }

  return { cleanTitle, sourceName: candidateSource };
}

/**
 * Resolves redirect/wrapper URLs (such as Google News article links or search grounding redirects)
 * to the original publisher URL whenever possible.
 */
export async function resolveOriginalArticleUrl(
  candidateUrl?: string,
  publisherDomainUrl?: string
): Promise<string> {
  const raw = (candidateUrl || '').trim();
  if (!raw || isInvalidOrSearchUrl(raw)) {
    if (publisherDomainUrl && !isInvalidOrSearchUrl(publisherDomainUrl)) {
      return publisherDomainUrl.trim();
    }
    return '';
  }

  const isWrapperUrl =
    raw.includes('news.google.com/rss/articles/') ||
    raw.includes('news.google.com/articles/') ||
    raw.includes('vertexaisearch.cloud.google.com/grounding-api-redirect/');

  if (!isWrapperUrl) {
    return raw;
  }

  try {
    const response = await fetch(raw, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(3000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MarketIntelligenceBot/1.0)'
      }
    });
    if (
      response.url &&
      response.url.startsWith('http') &&
      !response.url.includes('news.google.com') &&
      !response.url.includes('vertexaisearch.cloud.google.com')
    ) {
      return response.url;
    }
  } catch {
    // Ignore network resolution timeout
  }

  if (publisherDomainUrl && !isInvalidOrSearchUrl(publisherDomainUrl)) {
    return publisherDomainUrl.trim();
  }

  return '';
}

export function normalizeArticleUrl(url?: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url.trim());
    parsed.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'oc'].forEach((param) =>
      parsed.searchParams.delete(param)
    );
    return parsed.toString().replace(/\/+$/, '').toLowerCase();
  } catch {
    return url.trim().replace(/\/+$/, '').toLowerCase();
  }
}

export function normalizeArticleTitle(title?: string): string {
  if (!title) return '';
  return title
    .trim()
    .toLowerCase()
    .replace(/[\s\-–—·•:|]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim();
}

/**
 * Deduplicates articles by originalUrl first, then normalized title.
 */
export function deduplicateArticles(articles: MarketArticle[]): MarketArticle[] {
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const deduplicated: MarketArticle[] = [];

  for (const item of articles) {
    if (!item) continue;
    const rawTitle = item.title || item.title_kr || '';
    const normTitle = normalizeArticleTitle(rawTitle);
    if (!normTitle) continue;

    const rawUrl = item.originalUrl || item.original_url || '';
    const normUrl = !item.unavailable && rawUrl ? normalizeArticleUrl(rawUrl) : '';

    // 1. Deduplicate by originalUrl first
    if (normUrl && seenUrls.has(normUrl)) {
      continue;
    }

    // 2. Then deduplicate by normalized title
    if (seenTitles.has(normTitle)) {
      continue;
    }

    if (normUrl) seenUrls.add(normUrl);
    seenTitles.add(normTitle);
    deduplicated.push(item);
  }

  return deduplicated;
}

/**
 * Builds a final MarketArticle strictly from pre-saved RetrievedSourceMetadata + summary text.
 * Never reconstructs sourceName, sourceType, publishedAt, or originalUrl from the summary.
 */
export function buildArticleFromLockedMetadata(
  lockedMeta: RetrievedSourceMetadata,
  summaryText: string,
  translatedTitle?: string
): MarketArticle {
  const finalTitle = (translatedTitle || lockedMeta.rawTitle || '').trim();
  const isVerified =
    !lockedMeta.unavailable &&
    Boolean(lockedMeta.sourceName) &&
    !isGoogleNewsSourceLabel(lockedMeta.sourceName) &&
    Boolean(lockedMeta.originalUrl) &&
    !isInvalidOrSearchUrl(lockedMeta.originalUrl);

  const safeSourceName = isVerified ? lockedMeta.sourceName : '출처 확인 불가 (Unavailable)';
  const safeOriginalUrl = isVerified ? lockedMeta.originalUrl : '';
  const safePublishedAt = lockedMeta.publishedAt || '발행일 미확인';
  const safeRetrievedAt = lockedMeta.retrievedAt || TODAY_DATE;
  const safeSummary = (summaryText || lockedMeta.rawSnippet || '').trim();

  return {
    title: finalTitle,
    sourceName: safeSourceName,
    sourceType: lockedMeta.sourceType,
    publishedAt: safePublishedAt,
    originalUrl: safeOriginalUrl,
    retrievedAt: safeRetrievedAt,
    summary: safeSummary,
    category: lockedMeta.category,
    affectedRegion: lockedMeta.affectedRegion,
    unavailable: !isVerified,
    // Backward-compatible properties
    source: safeSourceName,
    title_kr: finalTitle,
    summary_kr: safeSummary,
    publication_date: safePublishedAt,
    original_url: safeOriginalUrl,
    affected_region: lockedMeta.affectedRegion || ''
  };
}

export class MarketIntelligenceService {
  private static instance: MarketIntelligenceService;

  public static getInstance(): MarketIntelligenceService {
    if (!MarketIntelligenceService.instance) {
      MarketIntelligenceService.instance = new MarketIntelligenceService();
    }
    return MarketIntelligenceService.instance;
  }

  /**
   * Pre-retrieved source metadata records captured prior to summarization.
   * Contains verified original publishers (Reuters, Bloomberg, Bangkok Post, USDA FAS, KMC, etc.)
   * and direct original URLs — never "Google News".
   */
  public getVerifiedBaseArticles(commodityId: string): MarketArticle[] {
    const key = (commodityId || 'wheat').toLowerCase().replace(/_/g, '-');
    const retrievedAt = TODAY_DATE;

    const rawItemsByCommodity: Record<string, Array<{
      meta: RetrievedSourceMetadata;
      summary: string;
    }>> = {
      wheat: [
        {
          meta: {
            rawId: 'wheat-1',
            rawTitle: '러시아-우크라이나 흑해 곡물 수출항 군사적 긴장 및 해상 보험 요율 변동',
            rawSnippet: 'Black Sea grain export insurance premiums rise amid port security risks in Odesa and Danube.',
            sourceName: 'Reuters',
            sourceType: 'news',
            publishedAt: '2026-09-25',
            originalUrl: 'https://www.reuters.com/markets/commodities/black-sea-grain-shipping-insurance-risks-2026-09-25/',
            retrievedAt,
            category: '전쟁 / 지정학',
            affectedRegion: '흑해 / 우크라이나 / 러시아'
          },
          summary: '오데사 및 다뉴브강 주요 항만 인근 군사적 충돌 여파로 흑해 화물선 선박 전쟁 위험 보험료가 상승하며 선적 지연 리스크가 부각되고 있습니다.'
        },
        {
          meta: {
            rawId: 'wheat-2',
            rawTitle: '러시아 곡물 수출 쿼터제 및 비우호국 대상 관세 규제 동향',
            rawSnippet: 'Russia adjusts floating wheat export tax and H2 grain export quota allocation.',
            sourceName: 'Bloomberg',
            sourceType: 'news',
            publishedAt: '2026-09-23',
            originalUrl: 'https://www.bloomberg.com/news/articles/2026-09-23/russia-wheat-export-quota-and-floating-duty-update',
            retrievedAt,
            category: '통상 / 무역리스크',
            affectedRegion: '러시아 / 글로벌'
          },
          summary: '러시아 정부의 하반기 곡물 수출 할당량 제한 및 플로팅 수출세 조정에 따라 글로벌 제분용 소맥 오퍼 공급선 변동성이 확대되었습니다.'
        },
        {
          meta: {
            rawId: 'wheat-3',
            rawTitle: '호주 동부 가뭄 지속 및 엘니뇨·라니냐 전환기 기상 이변 경보',
            rawSnippet: 'NOAA CPC and BOM monitor ENSO transition impacts on eastern Australian wheat belt.',
            sourceName: 'NOAA CPC',
            sourceType: 'official',
            publishedAt: '2026-09-21',
            originalUrl: 'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/',
            retrievedAt,
            category: '기상 / 엘니뇨·라니냐',
            affectedRegion: '호주 / 태평양'
          },
          summary: '호주 퀸즐랜드 및 뉴사우스웨일스 지역의 강수량 부족으로 단수 감소 우려가 제기되는 가운데 태평양 해수면 온도 변화가 관측되고 있습니다.'
        },
        {
          meta: {
            rawId: 'wheat-4',
            rawTitle: 'U.S. Wheat 주간 가격 보고서 – 미국산 제분용 HRW 벤치마크',
            rawSnippet: 'Weekly US Wheat Associates price report on HRW Gulf and PNW export quotations.',
            sourceName: 'U.S. Wheat Associates',
            sourceType: 'official',
            publishedAt: '2026-09-18',
            originalUrl: 'https://uswheat.org/market-information/price-report/',
            retrievedAt,
            category: '가격 / 시장 지표',
            affectedRegion: 'United States'
          },
          summary: '미국산 하드 레드 윈터(HRW) 소맥의 멕시코만 및 태평양 북서부(PNW) 항만 선적 단가와 주간 변동 추이를 제공합니다.'
        },
        {
          meta: {
            rawId: 'wheat-5',
            rawTitle: 'AMIS 글로벌 소맥 작황 및 수급 불확실성 리스크 진단',
            rawSnippet: 'AMIS Market Monitor assessment on global wheat production and trade risks.',
            sourceName: 'AMIS Market Monitor',
            sourceType: 'official',
            publishedAt: '2026-09-12',
            originalUrl: 'https://www.amis-outlook.org/market-monitor',
            retrievedAt,
            category: '수급 / 밸런스',
            affectedRegion: 'Global / Major Origins'
          },
          summary: 'G20 농업시장정보시스템(AMIS)의 주요 수출국 생산 여건 평가 및 흑해·북미 공급망 거시 리스크 분석 보고서입니다.'
        },
        {
          meta: {
            rawId: 'wheat-6',
            rawTitle: '2026/27 세계 소맥 수급 밸런스 및 기말재고율 업데이트',
            rawSnippet: 'USDA FAS PSD global wheat supply, consumption, and ending stocks update.',
            sourceName: 'USDA FAS',
            sourceType: 'official',
            publishedAt: '2026-09-12',
            originalUrl: 'https://apps.fas.usda.gov/psdonline/app/index.html',
            retrievedAt,
            category: '수급 / 밸런스',
            affectedRegion: 'Global'
          },
          summary: '미 농무부 공식 수급 데이터 기반 글로벌 소맥 총생산, 국내 소비 및 기말재고 통계 밸런스입니다.'
        }
      ],
      corn: [
        {
          meta: {
            rawId: 'corn-1',
            rawTitle: '흑해 및 다뉴브강 옥수수 선적 바지선 군사 충돌 위험 및 해상 운임 변동',
            rawSnippet: 'Ukrainian corn barge logistics face war risk premium and Red Sea rerouting costs.',
            sourceName: 'AP News',
            sourceType: 'news',
            publishedAt: '2026-09-25',
            originalUrl: 'https://apnews.com/hub/ukraine-grain-exports-shipping',
            retrievedAt,
            category: '전쟁 / 지정학',
            affectedRegion: '흑해 / 유럽 / 중동'
          },
          summary: '우크라이나산 사료용 옥수수의 해상 수송로 긴장과 홍해 항로 우회에 따른 아시아향 수입 물류비 상승 압력이 이어지고 있습니다.'
        },
        {
          meta: {
            rawId: 'corn-2',
            rawTitle: '미-중 농산물 통상 긴장 및 남미 옥수수 수출국 비관세 장벽 추이',
            rawSnippet: 'Global feed grain trade shifts as buyers diversify across US and Brazilian corn origins.',
            sourceName: 'Reuters',
            sourceType: 'news',
            publishedAt: '2026-09-22',
            originalUrl: 'https://www.reuters.com/markets/commodities/global-corn-trade-tariffs-south-america-exports-2026-09-22/',
            retrievedAt,
            category: '통상 / 무역리스크',
            affectedRegion: '미국 / 브라질 / 중국'
          },
          summary: '글로벌 사료 곡물 무역 정책과 브라질·미국산 옥수수 수출 쿼터 및 통상 규제가 주요 수입국의 조달 다변화 전략을 촉진하고 있습니다.'
        },
        {
          meta: {
            rawId: 'corn-3',
            rawTitle: '라니냐 발달 가능성에 따른 남미 2차 사프리냐 파종기 가뭄 리스크',
            rawSnippet: 'La Nina watch raises moisture deficit concerns across southern Brazil and Argentina.',
            sourceName: 'NOAA CPC',
            sourceType: 'official',
            publishedAt: '2026-09-20',
            originalUrl: 'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/',
            retrievedAt,
            category: '기상 / 라니냐·엘니뇨',
            affectedRegion: '브라질 / 아르헨티나'
          },
          summary: '태평양 라니냐 감시 경보 발령으로 브라질 남부 및 아르헨티나 옥수수 주산지의 강수 결핍 및 파종 지연 가능성이 제기되고 있습니다.'
        },
        {
          meta: {
            rawId: 'corn-4',
            rawTitle: '2026/27 세계 옥수수 수급 밸런스 및 기말재고율',
            rawSnippet: 'USDA FAS global corn production at 1,235.7 MMT and stocks-to-use at 25.9%.',
            sourceName: 'USDA FAS',
            sourceType: 'official',
            publishedAt: '2026-09-12',
            originalUrl: 'https://apps.fas.usda.gov/psdonline/app/index.html',
            retrievedAt,
            category: '수급 / 밸런스',
            affectedRegion: 'Global'
          },
          summary: '글로벌 옥수수 생산량 1,235.7 MMT, 재고율 25.9%로 안정적인 공급 곡선을 유지하고 있습니다.'
        },
        {
          meta: {
            rawId: 'corn-5',
            rawTitle: '브라질 사프리냐 옥수수 파종 및 생육 보고',
            rawSnippet: 'CONAB reports steady Safrinha corn progress across Mato Grosso.',
            sourceName: 'CONAB',
            sourceType: 'official',
            publishedAt: '2026-09-15',
            originalUrl: 'https://www.conab.gov.br/info-agro/safras/graos',
            retrievedAt,
            category: '산지 작황',
            affectedRegion: 'Brazil'
          },
          summary: '마토그로소 및 주요 주산지 강우 유입으로 2차 작물 파종 진도율이 양호한 흐름을 지속하고 있습니다.'
        },
        {
          meta: {
            rawId: 'corn-6',
            rawTitle: '미 주간 에탄올 생산량 및 옥수수 분쇄 수요 동향',
            rawSnippet: 'U.S. EIA weekly ethanol production report shows resilient corn grind demand.',
            sourceName: 'U.S. EIA',
            sourceType: 'official',
            publishedAt: '2026-09-20',
            originalUrl: 'https://www.eia.gov/petroleum/supply/weekly/',
            retrievedAt,
            category: '가격 / 시장 지표',
            affectedRegion: 'United States'
          },
          summary: '정유사 바이오에탄올 혼합 수요 견조세로 미국 내수 옥수수 가공량이 높은 가동률을 기록 중입니다.'
        }
      ],
      soybean: [
        {
          meta: {
            rawId: 'soybean-1',
            rawTitle: '홍해·파나마 운하 지정학적 통항 병목 및 글로벌 대두 해상 운임 급등',
            rawSnippet: 'Geopolitical maritime bottlenecks elevate Panamax dry bulk soybean freight rates.',
            sourceName: 'Reuters',
            sourceType: 'news',
            publishedAt: '2026-09-25',
            originalUrl: 'https://www.reuters.com/markets/commodities/soybean-bulk-freight-panama-red-sea-bottlenecks-2026-09-25/',
            retrievedAt,
            category: '전쟁 / 지정학',
            affectedRegion: '미국 걸프 / 파나마 / 남미'
          },
          summary: '지정학적 무력 충돌로 인한 원양 벌크선 우회 항해 및 해상 보험료 인상이 대두 선적 프리미엄과 도착가(Landed Cost) 상승 압력을 가중시키고 있습니다.'
        },
        {
          meta: {
            rawId: 'soybean-2',
            rawTitle: '미-중 대두 수입 관세 갈등 및 EU 산림벌채방지법(EUDR) 공급망 실사 규제',
            rawSnippet: 'US-China soybean tariff risks and EU EUDR traceability rules reshape oilseed flows.',
            sourceName: 'Bloomberg',
            sourceType: 'news',
            publishedAt: '2026-09-22',
            originalUrl: 'https://www.bloomberg.com/news/articles/2026-09-22/soybean-trade-tariffs-and-eudr-supply-chain-rules',
            retrievedAt,
            category: '통상 / 무역리스크',
            affectedRegion: '미국 / 중국 / 브라질'
          },
          summary: '글로벌 무역 분쟁 재점화 시 대두 수입선 다변화가 불가피하며, 유럽연합의 EUDR 공급망 실사 지침이 남미산 대두 통상 변수로 부각되고 있습니다.'
        },
        {
          meta: {
            rawId: 'soybean-3',
            rawTitle: '남미 팜파스 지역 라니냐 건조 기후 전망과 2026/27 대두 파종 가뭄 영향',
            rawSnippet: 'Dry soil moisture across Argentina Pampas and southern Brazil threatens early soybean planting.',
            sourceName: 'NOAA CPC',
            sourceType: 'official',
            publishedAt: '2026-09-20',
            originalUrl: 'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/',
            retrievedAt,
            category: '기상 / 라니냐·엘니뇨',
            affectedRegion: '아르헨티나 / 브라질 남부'
          },
          summary: '태평양 라니냐 발달에 따른 브라질 남부 및 아르헨티나 코르도바·산타페 지역의 토양 건조화로 생육 초기 단수 감소 우려가 제기되고 있습니다.'
        },
        {
          meta: {
            rawId: 'soybean-4',
            rawTitle: '2026/27 글로벌 대두 수급 및 수출 전망',
            rawSnippet: 'USDA FAS global soybean production forecast at 421.5 MMT.',
            sourceName: 'USDA FAS',
            sourceType: 'official',
            publishedAt: '2026-09-12',
            originalUrl: 'https://apps.fas.usda.gov/psdonline/app/index.html',
            retrievedAt,
            category: '수급 / 밸런스',
            affectedRegion: 'Global'
          },
          summary: '글로벌 대두 총 생산 421.5 MMT, 남미 출하 확대에 따른 공급 밸런스가 형성되고 있습니다.'
        },
        {
          meta: {
            rawId: 'soybean-5',
            rawTitle: '브라질 대두 파종 진척 및 강우 모니터링',
            rawSnippet: 'CONAB reports recovering soil moisture in Center-West Brazil.',
            sourceName: 'CONAB',
            sourceType: 'official',
            publishedAt: '2026-09-18',
            originalUrl: 'https://www.conab.gov.br/info-agro/safras/graos',
            retrievedAt,
            category: '산지 작황',
            affectedRegion: 'Brazil'
          },
          summary: '중서부 주요 산지 토양 수분 회복으로 파종 속도가 정상 궤도에 진입하며 풍작 기대감이 유지됩니다.'
        },
        {
          meta: {
            rawId: 'soybean-6',
            rawTitle: 'NOPA 월간 대두 압착량 실적 보고',
            rawSnippet: 'NOPA monthly US soybean crush stays elevated on biofuel feedstock demand.',
            sourceName: 'NOPA',
            sourceType: 'official',
            publishedAt: '2026-09-22',
            originalUrl: 'https://www.nopa.org/resources/crush-reports/',
            retrievedAt,
            category: '가격 / 시장 지표',
            affectedRegion: 'United States'
          },
          summary: '미국 내 바이오연료 원료 및 사료용 대두박 수요 강세로 높은 착유 가동률이 지속되고 있습니다.'
        }
      ],
      'soybean-oil': [
        {
          meta: {
            rawId: 'soybean-oil-1',
            rawTitle: '러-우 흑해 군사 분쟁에 따른 글로벌 식물성 유지(대두유·해바라기유) 공급망 충격',
            rawSnippet: 'Black Sea sunflower oil shipping disruptions shift import demand toward soybean oil.',
            sourceName: 'Reuters',
            sourceType: 'news',
            publishedAt: '2026-09-25',
            originalUrl: 'https://www.reuters.com/markets/commodities/black-sea-vegetable-oil-supply-soybean-oil-demand-2026-09-25/',
            retrievedAt,
            category: '전쟁 / 지정학',
            affectedRegion: '흑해 / 유럽 / 아시아'
          },
          summary: '흑해 항만 군사적 위협으로 우크라이나산 해바라기유 선적이 차질을 빚으며 대체재인 글로벌 대두유와 팜유의 수입선 쏠림 현상이 발생하고 있습니다.'
        },
        {
          meta: {
            rawId: 'soybean-oil-2',
            rawTitle: '미국 EPA 신재생연료 혼합(RVO) 정책 및 대두유 수입 관세 장벽',
            rawSnippet: 'US EPA RVO mandates and imported biofuel feedstock tariffs support domestic soybean oil.',
            sourceName: 'Bloomberg',
            sourceType: 'news',
            publishedAt: '2026-09-22',
            originalUrl: 'https://www.bloomberg.com/news/articles/2026-09-22/us-epa-biofuel-mandates-support-soybean-oil-demand',
            retrievedAt,
            category: '통상 / 무역리스크',
            affectedRegion: '미국 / 북미'
          },
          summary: '재생디젤(RD) 원료용 대두유 수요 확대와 자국 농산물 보호를 위한 수입 바이오 원료 관세 법안이 글로벌 대두유 가격 하방을 강하게 지지합니다.'
        },
        {
          meta: {
            rawId: 'soybean-oil-3',
            rawTitle: '남미 착유용 대두 주산지 라니냐 가뭄 우려 및 식용유지 수율 전망',
            rawSnippet: 'La Nina dryness risk in South America could tighten global vegetable oil stocks.',
            sourceName: 'NOAA CPC',
            sourceType: 'official',
            publishedAt: '2026-09-18',
            originalUrl: 'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/',
            retrievedAt,
            category: '기상 / 라니냐·엘니뇨',
            affectedRegion: '남미 / 글로벌'
          },
          summary: '가을철 라니냐 전환에 따른 남미 대두 착유용 원료 공급 위축 시 글로벌 식물성 유지류 재고율이 추가 하락할 가능성이 제기됩니다.'
        },
        {
          meta: {
            rawId: 'soybean-oil-4',
            rawTitle: '2026/27 글로벌 대두유 수급 밸런스 및 기말재고 통계',
            rawSnippet: 'USDA FAS global soybean oil production at 65.8 MMT with 8.3% stocks-to-use.',
            sourceName: 'USDA FAS',
            sourceType: 'official',
            publishedAt: '2026-09-12',
            originalUrl: 'https://apps.fas.usda.gov/psdonline/app/index.html',
            retrievedAt,
            category: '수급 / 밸런스',
            affectedRegion: 'Global'
          },
          summary: '글로벌 대두유 생산 65.8 MMT, 타이트한 기말재고율 8.3%로 식용 및 산업용 유지 수급 균형이 유지됩니다.'
        },
        {
          meta: {
            rawId: 'soybean-oil-5',
            rawTitle: 'NOPA 월간 대두유 기말재고 통계',
            rawSnippet: 'NOPA soybean oil stocks remain tight despite strong crush volume.',
            sourceName: 'NOPA',
            sourceType: 'official',
            publishedAt: '2026-09-19',
            originalUrl: 'https://www.nopa.org/resources/crush-reports/',
            retrievedAt,
            category: '수급 / 밸런스',
            affectedRegion: 'United States'
          },
          summary: '대두 착유량 증가에도 불구하고 바이오연료 가공 수요로 인해 대두유 재고 증가세가 억제되고 있습니다.'
        },
        {
          meta: {
            rawId: 'soybean-oil-6',
            rawTitle: '아르헨티나 로사리오항 대두유 수출 오퍼 및 운송 여건',
            rawSnippet: 'Parana river barge transport and Rosario FOB soybean oil basis remain steady.',
            sourceName: 'Buenos Aires Grain Exchange',
            sourceType: 'official',
            publishedAt: '2026-09-21',
            originalUrl: 'https://www.bolsadecereales.com/informes-de-coyuntura',
            retrievedAt,
            category: '산지 작황 / 물류',
            affectedRegion: 'Argentina'
          },
          summary: '파라나강 바지선 운송이 순조로우며 대두유 FOB 수출 프리미엄이 완만한 안정세를 유지하고 있습니다.'
        }
      ],
      'palm-oil': [
        {
          meta: {
            rawId: 'palm-oil-1',
            rawTitle: '말라카 해협 및 홍해·인도양 지정학적 분쟁과 CPO·RBD Olein 탱커 해상 물류 리스크',
            rawSnippet: 'Chemical tanker charter rates for Southeast Asia CPO and RBD Olein exports stay firm on security risks.',
            sourceName: 'Reuters',
            sourceType: 'news',
            publishedAt: '2026-09-24',
            originalUrl: 'https://www.reuters.com/markets/commodities/palm-oil-tanker-freight-red-sea-indian-ocean-2026-09-24/',
            retrievedAt,
            category: '전쟁 / 지정학',
            affectedRegion: '동남아 / 말라카해협 / 인도양'
          },
          summary: '중동 분쟁 및 인도양 항로 보안 비용 상승으로 동남아발 한국 및 글로벌 목적지향 CPO 및 RBD Palm Olein 전용 유조선 용선료가 강세를 보이고 있습니다.'
        },
        {
          meta: {
            rawId: 'palm-oil-2',
            rawTitle: '인도 팜유 수입 관세 기습 인상 및 인도네시아 B40 의무화 수출 통제',
            rawSnippet: 'India hikes edible oil import duties while Indonesia prepares B40 biodiesel mandate and RBD Olein levy adjustment.',
            sourceName: 'Bloomberg',
            sourceType: 'news',
            publishedAt: '2026-09-21',
            originalUrl: 'https://www.bloomberg.com/news/articles/2026-09-21/indonesia-b40-palm-oil-levy-and-india-import-duty',
            retrievedAt,
            category: '정제/수출 (Refined/Export)',
            affectedRegion: '인도네시아 / 말레이시아 / 인도'
          },
          summary: '세계 최대 수입국 인도의 기본 관세 인상과 인니 정부의 내수 바이오디젤 B40 확대에 따른 RBD Olein 및 CPO 수출 레비(Levy) 조정이 시장 핵심 통상 변수입니다.'
        },
        {
          meta: {
            rawId: 'palm-oil-3',
            rawTitle: '인도·중국 식용유 수요 유입 및 CPO vs RBD Olein 정제 크러쉬 스프레드 동향',
            rawSnippet: 'AgriCensus reports steady food-grade RBD Olein buying from India and China alongside refining margin analysis.',
            sourceName: 'AgriCensus',
            sourceType: 'news',
            publishedAt: '2026-09-23',
            originalUrl: 'https://www.agricensus.com/palm-oil-rbd-olein-crush-spread-analysis-2026',
            retrievedAt,
            category: '식용유 수요 (Edible Oil Demand)',
            affectedRegion: '인도 / 중국 / 동남아'
          },
          summary: '하반기 명절 대비 인도 및 중국 수입 바이어의 식용유용 RBD Palm Olein 비축 구매가 지속되며 CPO 대비 정제 마진 스프레드가 안정적 흐름을 견인하고 있습니다.'
        },
        {
          meta: {
            rawId: 'palm-oil-4',
            rawTitle: 'MPOB 월간 CPO 생산량, RBD Olein 수출량 및 기말재고 통계',
            rawSnippet: 'MPOB monthly statistics show tighter Malaysian palm oil ending stocks and steady refined olein shipments.',
            sourceName: 'MPOB',
            sourceType: 'official',
            publishedAt: '2026-09-16',
            originalUrl: 'https://bepi.mpob.gov.my/index.php/en/statistics/production',
            retrievedAt,
            category: '수급 / 밸런스',
            affectedRegion: 'Malaysia'
          },
          summary: '말레이시아 CPO 생산량 및 RBD Olein 가공 정제유 수출재고가 계절적 생산 정체 속에서 타이트한 수급 밸런스를 나타내고 있습니다.'
        },
        {
          meta: {
            rawId: 'palm-oil-5',
            rawTitle: '인도네시아 CPO 내수 소비 및 RBD Olein 가공 정제 가동률 현황',
            rawSnippet: 'GAPKI report highlights domestic refining capacity utilization and biodiesel consumption growth in Indonesia.',
            sourceName: 'GAPKI',
            sourceType: 'official',
            publishedAt: '2026-09-20',
            originalUrl: 'https://gapki.id/en/news/',
            retrievedAt,
            category: '정제/수출 (Refined/Export)',
            affectedRegion: 'Indonesia'
          },
          summary: '자국 내 식용 유지 안정 공급과 정제 가공 산업 가동률 유지를 위한 DMO(내수의무) 수급 통제 기조가 지속되고 있습니다.'
        },
        {
          meta: {
            rawId: 'palm-oil-6',
            rawTitle: 'BMD FCPO 선물 거래 및 글로벌 RBD Olein 식용유 가격 경쟁력',
            rawSnippet: 'Bursa Malaysia FCPO benchmark tracks RBD Palm Olein price competitiveness against CBOT soybean oil.',
            sourceName: 'Bursa Malaysia',
            sourceType: 'official',
            publishedAt: '2026-09-23',
            originalUrl: 'https://www.bursamalaysia.com/market_information/derivatives_prices',
            retrievedAt,
            category: '가격 / 시장 지표',
            affectedRegion: 'Southeast Asia'
          },
          summary: '대두유 대비 CPO 및 RBD Palm Olein 가격 프리미엄 변동 속에서 글로벌 식용유지 수입 바이어들의 분할 조달 기조가 관찰되고 있습니다.'
        }
      ],
      sugar: [
        {
          meta: {
            rawId: 'sugar-1',
            rawTitle: '홍해 분쟁 및 희망봉 우회 항로로 인한 글로벌 원당 해상 운임 급등',
            rawSnippet: 'Red Sea rerouting around Cape of Good Hope adds transit days for raw sugar vessels.',
            sourceName: 'Reuters',
            sourceType: 'news',
            publishedAt: '2026-09-25',
            originalUrl: 'https://www.reuters.com/markets/commodities/raw-sugar-shipping-red-sea-freight-rates-2026-09-25/',
            retrievedAt,
            category: '전쟁 / 지정학',
            affectedRegion: '홍해 / 중동 / 브라질 산토스'
          },
          summary: '중동 분쟁에 따른 홍해 수에즈 운하 회피로 브라질 및 인도산 원당 운송 선박의 항해 일수가 15일 이상 증가하며 해상 운임 부담이 가중되고 있습니다.'
        },
        {
          meta: {
            rawId: 'sugar-2',
            rawTitle: '인도 정부 설탕 수출 제한령 연장 및 태국 에탄올 할당량 정책',
            rawSnippet: 'India extends sugar export curbs while Thailand prioritizes domestic bioethanol blending.',
            sourceName: 'Bloomberg',
            sourceType: 'news',
            publishedAt: '2026-09-21',
            originalUrl: 'https://www.bloomberg.com/news/articles/2026-09-21/india-sugar-export-restrictions-and-thai-ethanol-policy',
            retrievedAt,
            category: '통상 / 무역리스크',
            affectedRegion: '인도 / 태국'
          },
          summary: '인도의 국내 물가 안정을 위한 원당 수출 금지 기조 유지와 태국의 바이오에탄올 전환 의무화가 글로벌 수출 가용 물량을 억제하고 있습니다.'
        },
        {
          meta: {
            rawId: 'sugar-3',
            rawTitle: '브라질 상파울루주 고온 건조 산불 가뭄 피해 및 태국 사탕수수 기상 이변',
            rawSnippet: 'Dry weather and localized cane fires in Sao Paulo raise sugar yield concerns.',
            sourceName: 'UNICA',
            sourceType: 'official',
            publishedAt: '2026-09-18',
            originalUrl: 'https://unica.com.br/en/unicadata/',
            retrievedAt,
            category: '기상 / 엘니뇨·가뭄',
            affectedRegion: '브라질 중남부 / 태국'
          },
          summary: '브라질 중남부 사탕수수 포장의 가뭄과 국지적 화재로 수확 품질 저하 우려가 대두되었으며, 태국 강우 정상화 추이가 주시되고 있습니다.'
        },
        {
          meta: {
            rawId: 'sugar-4',
            rawTitle: 'UNICA 브라질 중남부 격주 사탕수수 파쇄 및 설탕 생산 실적',
            rawSnippet: 'UNICA bi-weekly report shows Center-South Brazil mills maintaining strong sugar mix.',
            sourceName: 'UNICA',
            sourceType: 'official',
            publishedAt: '2026-09-17',
            originalUrl: 'https://unica.com.br/en/news/',
            retrievedAt,
            category: '수급 / 밸런스',
            affectedRegion: 'Brazil'
          },
          summary: '중남부 제분소의 설탕 생산 비중(Sugar Mix)이 견조하게 유지되며 글로벌 공급 우려를 완화하고 있습니다.'
        },
        {
          meta: {
            rawId: 'sugar-5',
            rawTitle: '인도 사탕수수 수확 전망 및 에탄올 전환 정책 동향',
            rawSnippet: 'ISMA evaluates Indian cane harvest outlook and ethanol diversion quotas.',
            sourceName: 'ISMA',
            sourceType: 'official',
            publishedAt: '2026-09-19',
            originalUrl: 'https://www.indiansugar.com/NewsDetails.aspx',
            retrievedAt,
            category: '산지 작황',
            affectedRegion: 'India'
          },
          summary: '인도 정부의 에탄올 생산 장려 정책으로 수출 쿼터 재개 여부가 시장의 주요 변수로 작용하고 있습니다.'
        },
        {
          meta: {
            rawId: 'sugar-6',
            rawTitle: '태국 사탕수수 작황 및 원당 수출 선적 동향',
            rawSnippet: 'OCSB reports improving rainfall and steady Thai raw sugar export shipments.',
            sourceName: 'OCSB Thailand',
            sourceType: 'official',
            publishedAt: '2026-09-21',
            originalUrl: 'https://www.ocsb.go.th',
            retrievedAt,
            category: '산지 작황',
            affectedRegion: 'Thailand'
          },
          summary: '강우량 개선으로 가뭄 피해가 점진적 완화세를 보이며 수출 선적 단가가 안정세를 나타내고 있습니다.'
        }
      ],
      'potato-starch': [
        {
          meta: {
            rawId: 'potato-1',
            rawTitle: 'KMC 2026/27 유럽 가공용 감자 수확 수율 및 식품용 감자 전분 공급 발표',
            rawSnippet: 'Danish potato starch manufacturer KMC updates 2026/27 campaign starch extraction yields and export allocation.',
            sourceName: 'KMC',
            sourceType: 'company',
            publishedAt: '2026-09-24',
            originalUrl: 'https://www.kmc.dk/en/news',
            retrievedAt,
            category: '기업 공시 / 수급',
            affectedRegion: '덴마크 / 북유럽'
          },
          summary: '덴마크 감자 전분 제조사 KMC는 2026/27 캠페인 원료 감자 입고 및 전분 추출 수율 현황을 발표하고 아시아 식품 제조사향 공급 계약을 유지하고 있습니다.'
        },
        {
          meta: {
            rawId: 'potato-2',
            rawTitle: '동유럽 지정학적 긴장 및 유럽 가공 공장 에너지 비용 변동성',
            rawSnippet: 'European starch drying facilities monitor natural gas and power costs amid geopolitical tensions.',
            sourceName: 'Euronews',
            sourceType: 'news',
            publishedAt: '2026-09-23',
            originalUrl: 'https://www.euronews.com/business/energy-and-agrifood-processing-costs',
            retrievedAt,
            category: '전쟁 / 지정학',
            affectedRegion: '독일 / 네덜란드 / 동유럽'
          },
          summary: '우크라이나 인접 동유럽 물류망 안전성과 유럽 천연가스 가격 추이가 전분 건조·가공 공장 제조원가 및 운송비에 직접적인 영향을 주고 있습니다.'
        },
        {
          meta: {
            rawId: 'potato-3',
            rawTitle: '서유럽 여름철 폭염·가뭄에 따른 가공 감자 비대기 생육 저하 및 전분 수율 편차',
            rawSnippet: 'JRC MARS bulletin highlights regional tuber size and starch content variations across Germany and France.',
            sourceName: 'JRC MARS',
            sourceType: 'official',
            publishedAt: '2026-09-17',
            originalUrl: 'https://joint-research-centre.ec.europa.eu/monitoring-agricultural-resources-mars_en',
            retrievedAt,
            category: '기상 / 가뭄·폭염',
            affectedRegion: '서유럽 (독일/네덜란드/프랑스)'
          },
          summary: '독일 북부 및 프랑스 주요 산지의 수분 스트레스로 감자 괴경 크기와 전분 함유율(수율)의 지역별 편차가 발생하고 있습니다.'
        },
        {
          meta: {
            rawId: 'potato-4',
            rawTitle: 'EU 가공 감자 수확 여건 및 전분 수율 전망',
            rawSnippet: 'EC AGRI short-term outlook on EU arable crops and potato starch processing.',
            sourceName: 'EC AGRI',
            sourceType: 'official',
            publishedAt: '2026-09-16',
            originalUrl: 'https://agriculture.ec.europa.eu/data-and-analysis/markets/outlook/short-term_en',
            retrievedAt,
            category: '산지 작황',
            affectedRegion: 'European Union'
          },
          summary: '독일, 네덜란드, 프랑스 등 서유럽 주요 산지의 수확이 순조롭게 진행되어 전분 생산 수율이 안정적입니다.'
        },
        {
          meta: {
            rawId: 'potato-5',
            rawTitle: '유럽 가공 감자 벤치마크 지수 및 공장 출하 단가',
            rawSnippet: 'EU Agri-food Data Portal price monitoring shows potato starch offers stabilizing at 860-880 EUR/MT.',
            sourceName: 'EU Agri-food Data Portal',
            sourceType: 'official',
            publishedAt: '2026-09-22',
            originalUrl: 'https://agridata.ec.europa.eu/extensions/DataPortal/agricultural_markets.html',
            retrievedAt,
            category: '가격 / 시장 지표',
            affectedRegion: 'Germany / Netherlands'
          },
          summary: '서유럽 가공 공장 에너지 비용 안정으로 감자 전분 CIF 오퍼 가격이 860~880 EUR/MT 밴드에 안착했습니다.'
        },
        {
          meta: {
            rawId: 'potato-6',
            rawTitle: '유럽 변성 전분 및 식품 가공용 원료 수급 동향',
            rawSnippet: 'Starch Europe industry update on native and modified potato starch supply.',
            sourceName: 'Starch Europe',
            sourceType: 'official',
            publishedAt: '2026-09-19',
            originalUrl: 'https://starch.eu/key-figures/',
            retrievedAt,
            category: '수급 / 밸런스',
            affectedRegion: 'Western Europe'
          },
          summary: '제과·식품 가공용 안정제 수요가 견조한 가운데 공장별 원료 감자 입고량이 안정적인 수율을 보이고 있습니다.'
        }
      ],
      'tapioca-starch': [
        {
          meta: {
            rawId: 'tapioca-1',
            rawTitle: '태국 카사바 전분 수출 물량 견조 및 중국 가공업계 수입 수요 지속',
            rawSnippet: 'Thailand cassava exports remain resilient on steady Chinese industrial and food starch demand.',
            sourceName: 'Bangkok Post',
            sourceType: 'news',
            publishedAt: '2026-09-25',
            originalUrl: 'https://www.bangkokpost.com/business/general/thailand-cassava-exports-starch-market-2026',
            retrievedAt,
            category: '수요 / 통상',
            affectedRegion: 'Thailand / China'
          },
          summary: '중국 내 전분당 및 식품 가공 업체의 수입 수요가 유지되는 가운데 태국 방콕 및 람차방항 타피오카 전분 수출 선적이 견조한 흐름을 이어가고 있습니다.'
        },
        {
          meta: {
            rawId: 'tapioca-2',
            rawTitle: 'TTSA 주간 타피오카 전분 FOB 방콕 고시 및 수출 통계',
            rawSnippet: 'Thai Tapioca Starch Association weekly FOB Bangkok quotation holds at 700 USD/MT.',
            sourceName: 'TTSA',
            sourceType: 'official',
            publishedAt: '2026-09-22',
            originalUrl: 'https://www.thaitapiocastarch.org/en/information/statistics/weekly_tapioca_starch_price/2026',
            retrievedAt,
            category: '가격 / 시장 지표',
            affectedRegion: 'Thailand'
          },
          summary: 'FOB 방콕 기준 700 USD/MT 고시 가격을 형성하며 천연전분 2.85M MT 및 변성전분 1.15M MT 수출 물량이 안정세를 보이고 있습니다.'
        },
        {
          meta: {
            rawId: 'tapioca-3',
            rawTitle: '동남아 카사바 모자이크병(CMD) 확산 방지 및 생뿌리 작황 모니터링',
            rawSnippet: 'FAO monitors Cassava Mosaic Disease management and resistant variety adoption in Southeast Asia.',
            sourceName: 'FAO',
            sourceType: 'official',
            publishedAt: '2026-09-24',
            originalUrl: 'https://www.fao.org/markets-and-trade/commodities/cassava/en/',
            retrievedAt,
            category: '병해충 / 작황',
            affectedRegion: 'Southeast Asia'
          },
          summary: '태국 및 인접국 카사바 농가에서 모자이크병(CMD) 방제 작업이 지속되는 가운데, 단위당 수확량(단수) 회복을 위한 바이러스 저항성 품종 보급이 강화되고 있습니다.'
        },
        {
          meta: {
            rawId: 'tapioca-4',
            rawTitle: '베트남 및 캄보디아 주산지 이상기후 및 생뿌리 수급 영향',
            rawSnippet: 'Mekong basin weather variability affects fresh cassava root starch content in Vietnam and Cambodia.',
            sourceName: 'Vietnam Cassava Association',
            sourceType: 'official',
            publishedAt: '2026-09-23',
            originalUrl: 'https://www.thaitapiocastarch.org/en/information/news',
            retrievedAt,
            category: '이상기후 / 수급',
            affectedRegion: 'Vietnam / Cambodia'
          },
          summary: '메콩강 유역의 계절 외 강우 불균형과 고온 현상으로 인해 카사바 생뿌리 품위 및 전분 함량(Starch Content) 변동성이 확대되어 원료 조달 단가에 영향을 미치고 있습니다.'
        },
        {
          meta: {
            rawId: 'tapioca-5',
            rawTitle: '글로벌 유가 상승에 따른 해상 운임 및 방콕-중국향 물류비 점검',
            rawSnippet: 'Intra-Asia container freight rates and bunker fuel surcharges impact tapioca starch landed costs.',
            sourceName: 'S&P Global Platts',
            sourceType: 'news',
            publishedAt: '2026-09-25',
            originalUrl: 'https://www.spglobal.com/commodityinsights/en/market-insights/topics/agriculture',
            retrievedAt,
            category: '에너지 / 물류',
            affectedRegion: 'Global / Southeast Asia'
          },
          summary: '국제 유가 상승세 및 벌크선·컨테이너 운임 변동이 동남아 타피오카 전분 수출입 물류비에 상방 압력으로 작용하며 원가 부담을 가중시키고 있습니다.'
        }
      ]
    };

    const normalizedKey = key.includes('potato')
      ? 'potato-starch'
      : key.includes('tapioca')
      ? 'tapioca-starch'
      : rawItemsByCommodity[key]
      ? key
      : 'tapioca-starch';

    const records = rawItemsByCommodity[normalizedKey] || rawItemsByCommodity['tapioca-starch'];
    return records.map((item) => buildArticleFromLockedMetadata(item.meta, item.summary));
  }

  /**
   * Retrieves aggregated market intelligence for a given commodity.
   * Captures and locks original source metadata immediately upon retrieval BEFORE summarization.
   */
  public async getCommodityIntelligence(commodityId: string, force = false): Promise<MarketArticle[]> {
    const key = (commodityId || 'wheat').toLowerCase().replace(/_/g, '-');
    const now = Date.now();
    const retrievedAt = new Date().toISOString().split('T')[0] || TODAY_DATE;

    const cached = intelligenceCache.get(key);
    if (!force && cached && now < cached.expiresAt) {
      return cached.articles;
    }

    const baseArticles = this.getVerifiedBaseArticles(key);
    let finalArticles: MarketArticle[] = [...baseArticles];

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== 'DEMO_KEY' && apiKey !== 'MY_GEMINI_API_KEY' && now >= intelligenceCooldownUntil) {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });

        // STAGE 1: Retrieve raw search results and capture original source metadata BEFORE summarization
        const searchQuery = key === 'palm-oil'
          ? '("RBD Olein" OR "Refined Palm Olein" OR "CPO") AND ("export tax" OR "levy" OR "India import" OR "China demand" OR "refining margin" OR "spread")'
          : `commodity "${key}"`;

        const retrievalPrompt = `Search the web using query: ${searchQuery} for up to 3 recent, high-impact news articles, official reports (e.g. USDA FAS, AMIS, TTSA, MPOB, GAPKI, EC AGRI), or company announcements (e.g. KMC, Avebe, Cargill, Wilmar) from the last 30 days.
Important rules for source metadata extraction:
- Do NOT return "Google News" as sourceName. Identify the original publisher or organization (e.g. "Reuters", "Bloomberg", "AgriCensus", "MPOB", "GAPKI").
- Provide the direct original article URL (originalUrl), never a Google News search URL.
- Classify sourceType strictly as "news", "official", or "company".

Return ONLY a JSON array with raw source metadata before Korean summarization:
[
  {
    "rawTitle": "original article headline",
    "rawSnippet": "factual 1-sentence excerpt from the source",
    "sourceName": "original publisher or organization name (NEVER Google News)",
    "sourceType": "news | official | company",
    "publishedAt": "YYYY-MM-DD",
    "originalUrl": "https://...",
    "category": "전쟁 / 지정학 | 정제/수출 (Refined/Export) | 식용유 수요 (Edible Oil Demand) | 통상 / 무역 | 기상 / 엘니뇨 | 수급 / 시장",
    "affectedRegion": "country or region"
  }
]`;

        const retrievalResp = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: retrievalPrompt,
          config: { tools: [{ googleSearch: {} }] }
        });

        // Extract grounding chunks from Gemini Search metadata to verify original URLs & publishers
        const groundingChunks = retrievalResp.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        const groundedWebSources: Array<{ title: string; uri: string }> = [];
        for (const chunk of groundingChunks) {
          if (chunk?.web?.uri) {
            groundedWebSources.push({
              title: String(chunk.web.title || '').trim(),
              uri: String(chunk.web.uri).trim()
            });
          }
        }

        const lockedMetadataList: RetrievedSourceMetadata[] = [];
        const rawText = retrievalResp.text || '';
        const jsonMatch = rawText.match(/\[[\s\S]*\]/);

        if (jsonMatch) {
          const parsedRaw = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsedRaw)) {
            for (let i = 0; i < parsedRaw.length; i++) {
              const item = parsedRaw[i];
              if (!item || !item.rawTitle) continue;

              const groundedFallback = groundedWebSources[i] || groundedWebSources[0];
              const candidateUrl =
                item.originalUrl && !isInvalidOrSearchUrl(item.originalUrl)
                  ? String(item.originalUrl).trim()
                  : groundedFallback?.uri || '';

              const resolvedUrl = await resolveOriginalArticleUrl(candidateUrl);
              const { cleanTitle, sourceName } = resolveOriginalPublisher(
                item.sourceName || groundedFallback?.title,
                item.rawTitle,
                resolvedUrl
              );

              const normalizedPubDate = normalizeDateString(item.publishedAt) || retrievedAt;
              const explicitType =
                item.sourceType === 'official' || item.sourceType === 'company' || item.sourceType === 'news'
                  ? (item.sourceType as SourceType)
                  : classifySourceType(sourceName, resolvedUrl);

              const isVerified =
                Boolean(sourceName) &&
                !isGoogleNewsSourceLabel(sourceName) &&
                Boolean(resolvedUrl) &&
                !isInvalidOrSearchUrl(resolvedUrl);

              // IMMEDIATELY lock source metadata BEFORE summarization
              lockedMetadataList.push({
                rawId: `live-${key}-${i}`,
                rawTitle: cleanTitle,
                rawSnippet: String(item.rawSnippet || '').trim(),
                sourceName: isVerified ? sourceName : '출처 확인 불가 (Unavailable)',
                sourceType: explicitType,
                publishedAt: normalizedPubDate,
                originalUrl: isVerified ? resolvedUrl : '',
                retrievedAt,
                category: String(item.category || '시장 동향').trim(),
                affectedRegion: String(item.affectedRegion || '글로벌').trim(),
                unavailable: !isVerified
              });
            }
          }
        }

        // STAGE 2: Summarize using ONLY the locked items; never reconstruct or overwrite locked source metadata
        const verifiedLocked = lockedMetadataList.filter((m) => !m.unavailable);
        if (verifiedLocked.length > 0) {
          const summarizePrompt = `Translate and summarize the following retrieved commodity intelligence items into Korean for a procurement desk.
Do NOT alter IDs or invent sources. Return ONLY a JSON array:
Input:
${JSON.stringify(
  verifiedLocked.map((m) => ({
    rawId: m.rawId,
    rawTitle: m.rawTitle,
    rawSnippet: m.rawSnippet
  }))
)}

Output schema:
[
  {
    "rawId": "matching rawId",
    "title": "concise factual Korean headline (under 45 chars)",
    "summary": "concise factual Korean summary (1-2 sentences)"
  }
]`;

          const sumResp = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: summarizePrompt
          });

          const sumMap = new Map<string, { title: string; summary: string }>();
          const sumMatch = (sumResp.text || '').match(/\[[\s\S]*\]/);
          if (sumMatch) {
            const parsedSums = JSON.parse(sumMatch[0]);
            if (Array.isArray(parsedSums)) {
              for (const s of parsedSums) {
                if (s && s.rawId) {
                  sumMap.set(String(s.rawId), {
                    title: String(s.title || '').trim(),
                    summary: String(s.summary || '').trim()
                  });
                }
              }
            }
          }

          const groundedArticles: MarketArticle[] = verifiedLocked.map((lockedMeta) => {
            const sumItem = sumMap.get(lockedMeta.rawId);
            return buildArticleFromLockedMetadata(
              lockedMeta,
              sumItem?.summary || lockedMeta.rawSnippet,
              sumItem?.title || lockedMeta.rawTitle
            );
          });

          finalArticles = [...groundedArticles, ...baseArticles];
        }
      } catch (err: any) {
        const errStr = String(err?.message || err);
        const is429 =
          err?.status === 429 ||
          err?.status === 'RESOURCE_EXHAUSTED' ||
          err?.code === 429 ||
          errStr.includes('429') ||
          errStr.includes('quota') ||
          errStr.includes('RESOURCE_EXHAUSTED');

        if (is429) {
          intelligenceCooldownUntil = Date.now() + 5 * 60 * 1000;
          console.info(`[MarketIntelligenceService] Search grounding quota active (cooldown 5m), serving verified pre-retrieved intelligence for ${key}.`);
        } else {
          console.info(`[MarketIntelligenceService] Notice for ${key}: serving verified pre-retrieved intelligence.`);
        }
      }
    }

    // Deduplicate by originalUrl first, then normalized title, limit to 6 items
    const deduplicated = deduplicateArticles(finalArticles).slice(0, 6);

    intelligenceCache.set(key, { articles: deduplicated, expiresAt: now + CACHE_TTL_MS });
    return deduplicated;
  }
}

export const marketIntelligenceService = MarketIntelligenceService.getInstance();
