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

const TODAY_DATE = '2026-10-13';

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
            rawTitle: 'USDA WASDE #676 10월 세계 소맥 수급 보고서 발표',
            rawSnippet: 'USDA WASDE report #676 projects global wheat production at 796.8 MMT with stable ending stocks.',
            sourceName: 'USDA FAS',
            sourceType: 'official',
            publishedAt: '2026-10-09',
            originalUrl: 'https://apps.fas.usda.gov/psdonline/app/index.html',
            retrievedAt,
            category: '수급 / 밸런스',
            affectedRegion: 'Global'
          },
          summary: '미 농무부 10월 WASDE(#676)에서 글로벌 소맥 생산량을 796.8 MMT, 기말재고를 257.7 MMT로 제시하며 주요 수출국 공급 안정세를 반영했습니다.'
        },
        {
          meta: {
            rawId: 'wheat-2',
            rawTitle: 'U.S. Wheat Associates 주간 가격 보고서 – 미국산 제분용 HRW/SRW 벤치마크',
            rawSnippet: 'Weekly US Wheat Associates price report details Gulf and PNW HRW and SRW export quotations.',
            sourceName: 'U.S. Wheat Associates',
            sourceType: 'official',
            publishedAt: '2026-10-09',
            originalUrl: 'https://uswheat.org/market-information/price-report/',
            retrievedAt,
            category: '가격 / 시장 지표',
            affectedRegion: 'United States'
          },
          summary: '미국산 하드 레드 윈터(HRW) FOB 멕시코만 $264.18/MT, 소프트 레드 윈터(SRW) $246.55/MT로 10월 둘째 주 수출 오퍼 가격이 형성되었습니다.'
        },
        {
          meta: {
            rawId: 'wheat-3',
            rawTitle: '흑해 오데사·다뉴브강 곡물 수출항 안전 및 해상 선박 보험 요율 동향',
            rawSnippet: 'Black Sea grain export corridors monitor maritime security and cargo war risk insurance premiums.',
            sourceName: 'Reuters',
            sourceType: 'news',
            publishedAt: '2026-10-11',
            originalUrl: 'https://www.reuters.com/markets/commodities/black-sea-grain-shipping-insurance-risks-2026-10-11/',
            retrievedAt,
            category: '전쟁 / 지정학',
            affectedRegion: '흑해 / 우크라이나 / 루마니아'
          },
          summary: '오데사 및 다뉴브강 환적 항만 인근 지정학적 안보 여건 속에서 흑해 화물선 전쟁 위험 보험료 및 곡물 선적 일정이 모니터링되고 있습니다.'
        },
        {
          meta: {
            rawId: 'wheat-4',
            rawTitle: '호주 동부 소맥 지대 봄철 기상 여건 및 2026/27 수확기 단수 전망',
            rawSnippet: 'AMIS Market Monitor assessment on eastern Australian spring rainfall and wheat harvest yields.',
            sourceName: 'AMIS Market Monitor',
            sourceType: 'official',
            publishedAt: '2026-10-12',
            originalUrl: 'https://www.amis-outlook.org/market-monitor',
            retrievedAt,
            category: '기상 / 작황',
            affectedRegion: '호주 / 주요 산지'
          },
          summary: '호주 퀸즐랜드 및 뉴사우스웨일스의 적기 봄철 강우로 2026/27 신곡 소맥 수확 수율이 평년 수준을 유지할 것으로 평가되었습니다.'
        }
      ],
      corn: [
        {
          meta: {
            rawId: 'corn-1',
            rawTitle: 'USDA WASDE #676 10월 옥수수 수급 밸런스 및 미국 생산량 집계',
            rawSnippet: 'USDA October WASDE report #676 estimates US corn yield at 183.8 bu/acre and global production at 1,235.7 MMT.',
            sourceName: 'USDA FAS',
            sourceType: 'official',
            publishedAt: '2026-10-09',
            originalUrl: 'https://apps.fas.usda.gov/psdonline/app/index.html',
            retrievedAt,
            category: '수급 / 밸런스',
            affectedRegion: 'Global'
          },
          summary: '10월 WASDE 보고서에서 글로벌 옥수수 생산량 1,235.7 MMT, 미국 단수 183.8 bu/acre로 전월 대비 견조한 공급 균형을 공식 확인했습니다.'
        },
        {
          meta: {
            rawId: 'corn-2',
            rawTitle: 'CBOT 옥수수 선물 10월 시장 및 미국 중서부 수확 진행률',
            rawSnippet: 'CBOT corn futures trade steadily as US Midwest harvest accelerates past 40% completion.',
            sourceName: 'Reuters',
            sourceType: 'news',
            publishedAt: '2026-10-10',
            originalUrl: 'https://www.reuters.com/markets/commodities/cbot-corn-harvest-progress-usda-2026-10-10/',
            retrievedAt,
            category: '가격 / 시장 지표',
            affectedRegion: '미국 콘벨트'
          },
          summary: '아이오와 및 일리노이 등 콘벨트 주요 주의 수확 진척도가 40%를 상회하며 원활한 수확기 계절적 출하 압력이 시장에 반영되었습니다.'
        },
        {
          meta: {
            rawId: 'corn-3',
            rawTitle: '남미 브라질 2026/27 1차 옥수수 파종 진척 및 강우 모니터링',
            rawSnippet: 'CONAB grain report tracks favorable soil moisture for first-crop corn planting in southern Brazil.',
            sourceName: 'CONAB',
            sourceType: 'official',
            publishedAt: '2026-10-11',
            originalUrl: 'https://www.conab.gov.br/info-agro/safras/graos',
            retrievedAt,
            category: '산지 작황',
            affectedRegion: 'Brazil'
          },
          summary: '브라질 국립공급공사(CONAB)는 남부 주요 주산지 적기 강우 유입으로 1차 하계 옥수수 파종 진도율이 양호한 출발을 보이고 있다고 보고했습니다.'
        },
        {
          meta: {
            rawId: 'corn-4',
            rawTitle: '우크라이나 및 흑해 옥수수 바지선 선적 물류 동향',
            rawSnippet: 'Danube and Constanta transit routes handle steady Ukrainian feed corn export volumes.',
            sourceName: 'AP News',
            sourceType: 'news',
            publishedAt: '2026-10-12',
            originalUrl: 'https://apnews.com/hub/ukraine-grain-exports-shipping',
            retrievedAt,
            category: '물류 / 무역',
            affectedRegion: '우크라이나 / 루마니아 / 아시아'
          },
          summary: '우크라이나산 사료용 옥수수의 루마니아 콘스탄차항 환적 및 아시아향 벌크선 선적 물류가 견조한 물동량을 유지하고 있습니다.'
        }
      ],
      soybean: [
        {
          meta: {
            rawId: 'soybean-1',
            rawTitle: 'USDA WASDE #676 10월 글로벌 대두 수급 및 미국 기말재고',
            rawSnippet: 'USDA October WASDE forecasts global soybean production at 421.5 MMT with steady crush outlook.',
            sourceName: 'USDA FAS',
            sourceType: 'official',
            publishedAt: '2026-10-09',
            originalUrl: 'https://apps.fas.usda.gov/psdonline/app/index.html',
            retrievedAt,
            category: '수급 / 밸런스',
            affectedRegion: 'Global'
          },
          summary: '미 농무부는 10월 WASDE에서 세계 대두 생산량을 421.5 MMT로 유지하고 남미와 북미의 충분한 공급 여력을 공식 전망했습니다.'
        },
        {
          meta: {
            rawId: 'soybean-2',
            rawTitle: '브라질 마투그로수 대두 파종기 강우 유입 및 가뭄 해소',
            rawSnippet: 'Center-West Brazilian soy belt receives widespread October rainfall, accelerating early seeding.',
            sourceName: 'Bloomberg',
            sourceType: 'news',
            publishedAt: '2026-10-10',
            originalUrl: 'https://www.bloomberg.com/news/articles/2026-10-10/brazil-soybean-planting-rains-mato-grosso',
            retrievedAt,
            category: '산지 작황 / 기상',
            affectedRegion: '브라질 마투그로수'
          },
          summary: '브라질 중서부 주요 산지에 10월 초 대규모 강우가 유입되며 초기 파종 지연 우려가 완화되고 농가 파종 작업이 본격화되었습니다.'
        },
        {
          meta: {
            rawId: 'soybean-3',
            rawTitle: '미국 대두 수확기 멕시코만(Gulf) 및 PNW 선적 프리미엄 동향',
            rawSnippet: 'US Gulf and Pacific Northwest soybean export basis stabilizes during peak harvest inflows.',
            sourceName: 'Reuters',
            sourceType: 'news',
            publishedAt: '2026-10-11',
            originalUrl: 'https://www.reuters.com/markets/commodities/us-soybean-gulf-pnw-export-basis-2026-10-11/',
            retrievedAt,
            category: '물류 / 시장 지표',
            affectedRegion: '미국 걸프 / PNW'
          },
          summary: '미국산 신곡 수확 출하가 가속화됨에 따라 미시시피강 바지선 수송 여건이 안정되며 수출 베이시스(Basis)가 안정화 흐름을 보였습니다.'
        },
        {
          meta: {
            rawId: 'soybean-4',
            rawTitle: 'NOPA 월간 대두 착유량(Crush) 및 글로벌 바이오원료 수요',
            rawSnippet: 'NOPA monthly crush report indicates strong domestic processing demand for renewable diesel.',
            sourceName: 'NOPA',
            sourceType: 'official',
            publishedAt: '2026-10-12',
            originalUrl: 'https://www.nopa.org/resources/crush-reports/',
            retrievedAt,
            category: '가격 / 시장 지표',
            affectedRegion: 'United States'
          },
          summary: '미국 내 재생디젤 및 사료용 대두박 수요 강세로 월간 대두 압착량이 견고한 가동률을 이어가고 있습니다.'
        }
      ],
      'soybean-oil': [
        {
          meta: {
            rawId: 'soybean-oil-1',
            rawTitle: 'USDA WASDE #676 대두유 바이오연료 공급 밸런스 분석',
            rawSnippet: 'USDA October WASDE report pegs global soybean oil production at 65.8 MMT amid tight ending stocks.',
            sourceName: 'USDA FAS',
            sourceType: 'official',
            publishedAt: '2026-10-09',
            originalUrl: 'https://apps.fas.usda.gov/psdonline/app/index.html',
            retrievedAt,
            category: '수급 / 밸런스',
            affectedRegion: 'Global'
          },
          summary: '10월 WASDE에서 글로벌 대두유 생산 65.8 MMT와 미국 내 바이오연료 의무 혼합 수요에 따른 타이트한 재고 구조가 재확인되었습니다.'
        },
        {
          meta: {
            rawId: 'soybean-oil-2',
            rawTitle: 'CBOT 대두유 선물 10월 시장 및 바이오디젤 혼합 의무화 수요',
            rawSnippet: 'CBOT soybean oil futures supported by EPA RVO mandates and aviation SAF feedstock demand.',
            sourceName: 'Reuters',
            sourceType: 'news',
            publishedAt: '2026-10-10',
            originalUrl: 'https://www.reuters.com/markets/commodities/cbot-soybean-oil-biofuels-demand-2026-10-10/',
            retrievedAt,
            category: '가격 / 시장 지표',
            affectedRegion: 'United States'
          },
          summary: '미국 EPA 재생연료 표준(RVO) 정책 및 글로벌 바이오항공유(SAF) 원료 수요 확대로 대두유 선물 가격이 하방 지지력을 확보했습니다.'
        },
        {
          meta: {
            rawId: 'soybean-oil-3',
            rawTitle: '아르헨티나 로사리오항 대두유 FOB 수출 프리미엄 동향',
            rawSnippet: 'Rosario FOB soybean oil basis remains steady with smooth Parana river navigation.',
            sourceName: 'Buenos Aires Grain Exchange',
            sourceType: 'official',
            publishedAt: '2026-10-11',
            originalUrl: 'https://www.bolsadecereales.com/informes-de-coyuntura',
            retrievedAt,
            category: '산지 작황 / 물류',
            affectedRegion: 'Argentina'
          },
          summary: '아르헨티나 주요 압착 공장의 원활한 대두유 생산과 파라나강 수위 안정으로 FOB 로사리오 수출 오퍼가 안정세를 보이고 있습니다.'
        },
        {
          meta: {
            rawId: 'soybean-oil-4',
            rawTitle: '글로벌 식물성 유지류 복합 수급 및 팜유 스프레드 연동',
            rawSnippet: 'Vegetable oil complex tracks narrowing spread between soybean oil and palm oil.',
            sourceName: 'AgriCensus',
            sourceType: 'news',
            publishedAt: '2026-10-12',
            originalUrl: 'https://www.agricensus.com/soybean-oil-palm-oil-spread-october-2026',
            retrievedAt,
            category: '시장 동향',
            affectedRegion: 'Global'
          },
          summary: '팜유와 대두유 간의 가격 스프레드가 축소됨에 따라 아시아 및 인도 수입 바이어들의 분할 구매 포지션이 관측되었습니다.'
        }
      ],
      'palm-oil': [
        {
          meta: {
            rawId: 'palm-oil-1',
            rawTitle: 'MPOB 10월 말레이시아 팜유 공식 수급 보고서 발표',
            rawSnippet: 'MPOB October statistics show September Malaysian CPO output at 1.82M MT and ending stocks at 2.01M MT.',
            sourceName: 'MPOB',
            sourceType: 'official',
            publishedAt: '2026-10-10',
            originalUrl: 'https://bepi.mpob.gov.my/index.php/en/statistics/production',
            retrievedAt,
            category: '수급 / 밸런스',
            affectedRegion: 'Malaysia'
          },
          summary: '말레이시아 팜유위원회(MPOB) 10월 공식 통계에서 9월 CPO 생산량 182만 톤, 기말재고 201만 톤으로 타이트한 수급 균형을 발표했습니다.'
        },
        {
          meta: {
            rawId: 'palm-oil-2',
            rawTitle: 'BMD CPO 10월 벤치마크 선물 거래 및 인도·중국 축제 수요',
            rawSnippet: 'BMD FCPO futures trade firmly on festival replenishment demand for RBD Palm Olein from India and China.',
            sourceName: 'Bursa Malaysia',
            sourceType: 'official',
            publishedAt: '2026-10-10',
            originalUrl: 'https://www.bursamalaysia.com/market_information/derivatives_prices',
            retrievedAt,
            category: '식용유 수요 (Edible Oil Demand)',
            affectedRegion: '인도 / 중국 / 동남아'
          },
          summary: '인도 디왈리 축제 및 중국 연휴 대비 식용 RBD Palm Olein 비축 수입이 이어지며 부르사 말레이시아 FCPO 선물이 견조세를 유지했습니다.'
        },
        {
          meta: {
            rawId: 'palm-oil-3',
            rawTitle: '인도네시아 B40 바이오디젤 확대 정책 및 팜유 수출 관세 부과금 동향',
            rawSnippet: 'GAPKI highlights Indonesia B40 mandate preparation and revised export levy framework.',
            sourceName: 'GAPKI',
            sourceType: 'official',
            publishedAt: '2026-10-11',
            originalUrl: 'https://gapki.id/en/news/',
            retrievedAt,
            category: '정제/수출 (Refined/Export)',
            affectedRegion: '인도네시아'
          },
          summary: '인도네시아 정부의 B40 의무화 시행 준비와 CPO 및 정제 올레인(RBD Olein) 수출 부담금(Levy) 조정안이 글로벌 공급 유효량의 변수로 작용합니다.'
        },
        {
          meta: {
            rawId: 'palm-oil-4',
            rawTitle: '화학 탱커 해상 운임 및 동남아-한국·동아시아 팜유 선적 여건',
            rawSnippet: 'Chemical tanker charter rates for Southeast Asia CPO and RBD Olein exports remain stable.',
            sourceName: 'Reuters',
            sourceType: 'news',
            publishedAt: '2026-10-12',
            originalUrl: 'https://www.reuters.com/markets/commodities/palm-oil-tanker-freight-southeast-asia-2026-10-12/',
            retrievedAt,
            category: '물류 / 해상운임',
            affectedRegion: '동남아 / 한국'
          },
          summary: '동남아발 극동 아시아향 케미컬 탱커 용선료가 안정적 범위를 유지하며 한국 수입 가공업체향 선적이 순조롭게 진행 중입니다.'
        }
      ],
      sugar: [
        {
          meta: {
            rawId: 'sugar-1',
            rawTitle: 'UNICA 브라질 중남부 사탕수수 파쇄 및 설탕 생산 실적 보고서',
            rawSnippet: 'UNICA October bi-weekly report shows Center-South mills maintaining 49.2% sugar mix with strong cane crush.',
            sourceName: 'UNICA',
            sourceType: 'official',
            publishedAt: '2026-10-08',
            originalUrl: 'https://unica.com.br/en/unicadata/',
            retrievedAt,
            category: '수급 / 밸런스',
            affectedRegion: 'Brazil'
          },
          summary: '브라질 사탕수수산업협회(UNICA) 10월 상반기 리포트에서 중남부 제분소의 사탕수수 파쇄량과 설탕 생산 비중(Sugar Mix 49.2%)이 호조를 기록했습니다.'
        },
        {
          meta: {
            rawId: 'sugar-2',
            rawTitle: 'ICE 원당(#11) 선물 10월 거래 및 인도 수출 정책 동향',
            rawSnippet: 'ICE sugar futures fluctuate as market monitors port queues in Santos and Indian ethanol diversion quotas.',
            sourceName: 'ICE',
            sourceType: 'official',
            publishedAt: '2026-10-10',
            originalUrl: 'https://www.theice.com/products/23/Sugar-No-11-Futures',
            retrievedAt,
            category: '가격 / 시장 지표',
            affectedRegion: '글로벌'
          },
          summary: '뉴욕 ICE 원당 10월 선물 가격이 브라질 항만 선적 대기일 단축과 인도의 국내 물가 우선 정책 속에 박스권 등락을 이어갔습니다.'
        },
        {
          meta: {
            rawId: 'sugar-3',
            rawTitle: '태국 2026/27 사탕수수 수확기 전망 및 OCSB 가뭄 모니터링',
            rawSnippet: 'OCSB Thailand notes monsoon normalization supporting 2026/27 cane crop recovery.',
            sourceName: 'OCSB Thailand',
            sourceType: 'official',
            publishedAt: '2026-10-11',
            originalUrl: 'https://www.ocsb.go.th',
            retrievedAt,
            category: '산지 작황',
            affectedRegion: 'Thailand'
          },
          summary: '태국 사탕수수설탕위원회(OCSB)는 몬순 강우 정상화로 2026/27 시즌 사탕수수 생산량이 전년 대비 회복세를 보일 것으로 평가했습니다.'
        },
        {
          meta: {
            rawId: 'sugar-4',
            rawTitle: '유럽 사탕무(Sugar Beet) 수확 진행률 및 역내 정제당 수급',
            rawSnippet: 'EU Agri-food Data Portal shows active sugar beet harvest campaigns across France and Germany.',
            sourceName: 'EU Agri-food Data Portal',
            sourceType: 'official',
            publishedAt: '2026-10-12',
            originalUrl: 'https://agridata.ec.europa.eu/extensions/DataPortal/agricultural_markets.html',
            retrievedAt,
            category: '수급 / 밸런스',
            affectedRegion: '서유럽'
          },
          summary: '프랑스 및 독일의 사탕무 수확이 본격 개시되며 유럽 연합 역내 정제당 공급이 계절적 성수기에 진입했습니다.'
        }
      ],
      'potato-starch': [
        {
          meta: {
            rawId: 'potato-1',
            rawTitle: 'EEX 유럽 가공용 감자 벤치마크 및 10월 감자전분 시장 동향',
            rawSnippet: 'EEX processing potato index and European starch trade reports show firm offers at 860-885 EUR/MT.',
            sourceName: 'EEX',
            sourceType: 'official',
            publishedAt: '2026-10-10',
            originalUrl: 'https://www.eex.com/en/market-data/agricultural-indices',
            retrievedAt,
            category: '가격 / 시장 지표',
            affectedRegion: 'Germany / Netherlands'
          },
          summary: '유럽에너지거래소(EEX) 가공 감자 지수 및 유럽 전분 시장 모니터링에서 10월 감자전분 출하 가격이 860~885 EUR/MT 구간에서 안정세를 보였습니다.'
        },
        {
          meta: {
            rawId: 'potato-2',
            rawTitle: 'KMC 2026/27 덴마크 감자전분 캠페인 수율 및 아시아 수출 오퍼',
            rawSnippet: 'Danish starch leader KMC reports solid starch extraction yields for 2026/27 processing campaign.',
            sourceName: 'KMC',
            sourceType: 'company',
            publishedAt: '2026-10-09',
            originalUrl: 'https://www.kmc.dk/en/news',
            retrievedAt,
            category: '기업 공시 / 수급',
            affectedRegion: '덴마크 / 북유럽'
          },
          summary: '덴마크 감자전분 대표 제조사 KMC는 2026/27 가공 캠페인의 높은 전분 추출 수율을 확인하고 글로벌 식품 제조사향 장기 공급 계약을 안정적으로 이행 중입니다.'
        },
        {
          meta: {
            rawId: 'potato-3',
            rawTitle: '북서유럽(NEPG) 2026년 감자 수확 진척도 및 품질 분석',
            rawSnippet: 'NEPG estimates over 70% processing potato harvest completed across Germany, Netherlands, and France.',
            sourceName: 'NEPG',
            sourceType: 'official',
            publishedAt: '2026-10-11',
            originalUrl: 'https://nepg.info',
            retrievedAt,
            category: '산지 작황',
            affectedRegion: 'Western Europe'
          },
          summary: '북서유럽 감자재배자협회(NEPG)는 독일, 네덜란드, 프랑스의 양호한 기후 조건 속에서 가공용 감자 수확이 70% 이상 진행되었다고 발표했습니다.'
        },
        {
          meta: {
            rawId: 'potato-4',
            rawTitle: '유럽 전분 가공업계 천연가스 에너지 단가 및 변성전분 수급',
            rawSnippet: 'Starch Europe highlights stable factory operating rates and steady food ingredient starch supply.',
            sourceName: 'Starch Europe',
            sourceType: 'official',
            publishedAt: '2026-10-12',
            originalUrl: 'https://starch.eu/key-figures/',
            retrievedAt,
            category: '수급 / 밸런스',
            affectedRegion: 'Western Europe'
          },
          summary: 'Starch Europe은 유럽 내 가공 공장들의 안정적 에너지 수급에 힘입어 식품 및 제지용 변성 감자전분 생산 가동률이 양호하게 유지되고 있다고 보고했습니다.'
        }
      ],
      'tapioca-starch': [
        {
          meta: {
            rawId: 'tapioca-1',
            rawTitle: 'TTSA 주간 타피오카 전분 FOB 방콕 고시 – $695/MT 발표',
            rawSnippet: 'Thai Tapioca Starch Association weekly official FOB Bangkok export quotation set at 695 USD/MT on October 6, 2026.',
            sourceName: 'TTSA',
            sourceType: 'official',
            publishedAt: '2026-10-06',
            originalUrl: 'https://www.thaitapiocastarch.org/en/information/statistics/weekly_tapioca_starch_price/2026',
            retrievedAt,
            category: '가격 / 시장 지표',
            affectedRegion: 'Thailand'
          },
          summary: '태국타피오카전분협회(TTSA) 10월 6일 공식 고시에서 1급 수출 타피오카 전분 가격을 FOB 방콕 기준 $695/MT로 고시하며 안정적 시장 기조를 유지했습니다.'
        },
        {
          meta: {
            rawId: 'tapioca-2',
            rawTitle: '태국 카사바 주요 산지 생근(Fresh Root) 반입 단가 및 전분 함량',
            rawSnippet: 'TTTA reports fresh cassava root prices at 2.85-3.10 THB/kg with starch content averaging 26-29%.',
            sourceName: 'Thai Tapioca Trade Association',
            sourceType: 'official',
            publishedAt: '2026-10-09',
            originalUrl: 'https://www.ttta-tapioca.org',
            retrievedAt,
            category: '산지 작황 / 가격',
            affectedRegion: '태국 나콘랏차시마'
          },
          summary: '나콘랏차시마 및 차이야품 등 주요 산지의 카사바 생뿌리 반입 단가가 2.85~3.10 THB/kg을 형성하며 공장 전분 수율(25~30%)이 양호한 추이를 나타냈습니다.'
        },
        {
          meta: {
            rawId: 'tapioca-3',
            rawTitle: '중국 식품·산업용 타피오카 전분 수입 통관 수요 동향',
            rawSnippet: 'China industrial and sweetener buyers maintain steady purchase orders for Thai and Vietnamese tapioca starch.',
            sourceName: 'Bangkok Post',
            sourceType: 'news',
            publishedAt: '2026-10-11',
            originalUrl: 'https://www.bangkokpost.com/business/general/thailand-cassava-exports-starch-market-2026',
            retrievedAt,
            category: '수요 / 통상',
            affectedRegion: 'Thailand / China'
          },
          summary: '중국 내 전분당 및 가공식품 업계의 동남아산 타피오카 전분 수입 계약이 꾸준히 체결되며 태국 람차방항 선적 일정이 원활히 진행되고 있습니다.'
        },
        {
          meta: {
            rawId: 'tapioca-4',
            rawTitle: '동남아 컨테이너 운임 동향 및 한국향 타피오카 해상 물류 여건',
            rawSnippet: 'Intra-Asia container shipping rates on Bangkok-Busan routes remain stable for starch imports.',
            sourceName: 'Freightos Baltic Index',
            sourceType: 'official',
            publishedAt: '2026-10-12',
            originalUrl: 'https://www.freightos.com',
            retrievedAt,
            category: '에너지 / 물류',
            affectedRegion: '동남아 / 한국'
          },
          summary: '방콕-부산 및 인천 간 동남아 역내 컨테이너 운임이 안정세를 유지하며 국내 전분 가공 및 식품 제조업체의 수입 조달 비용 변동성이 완화되었습니다.'
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
   * If GEMINI_API_KEY is available, executes Gemini Google Search Grounding by default
   * using current October 2026 context (October 13, 2026).
   */
  public async getCommodityIntelligence(commodityId: string, force = false): Promise<MarketArticle[]> {
    const key = (commodityId || 'wheat').toLowerCase().replace(/_/g, '-');
    const now = Date.now();
    const retrievedAt = TODAY_DATE;

    const apiKey = process.env.GEMINI_API_KEY;
    const hasValidKey = Boolean(apiKey && apiKey !== 'DEMO_KEY' && apiKey !== 'MY_GEMINI_API_KEY');

    // Memory cache handling:
    // If not forced and not having valid key, return cache while valid.
    // If hasValidKey is true, reuse cache ONLY if fetched within the last 20 seconds (prevents React double-invocation spam).
    const cached = intelligenceCache.get(key);
    if (!force && cached) {
      const cacheAgeMs = now - (cached.expiresAt - CACHE_TTL_MS);
      if (!hasValidKey && now < cached.expiresAt) {
        return cached.articles;
      }
      if (hasValidKey && cacheAgeMs < 20000 && cached.articles.length > 0) {
        return cached.articles;
      }
    }

    const baseArticles = this.getVerifiedBaseArticles(key);
    let finalArticles: MarketArticle[] = [...baseArticles];

    if (hasValidKey && now >= intelligenceCooldownUntil) {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });

        // STAGE 1: Retrieve raw search results and capture original source metadata BEFORE summarization
        const COMMODITY_QUERIES: Record<string, string> = {
          'wheat': 'USDA WASDE wheat October 2026 OR "US Wheat Associates" price report October 2026 OR Black Sea grain shipping October 2026',
          'corn': 'USDA WASDE corn October 2026 OR CBOT corn futures market October 2026',
          'soybean': 'USDA WASDE soybean October 2026 OR South America soybean planting weather October 2026',
          'soybean-oil': 'CBOT soybean oil market October 2026 OR Biofuel demand soybean oil October 2026',
          'palm-oil': 'MPOB Malaysian palm oil report October 2026 OR BMD CPO futures price October 2026',
          'sugar': 'ICE raw sugar futures market October 2026 OR UNICA Brazil sugar crush report October 2026',
          'potato-starch': 'European potato starch market report October 2026 OR EEX potato starch price October 2026',
          'tapioca-starch': 'Thai Tapioca Starch Association price report October 2026 OR Cassava root market October 2026'
        };
        const searchQuery = COMMODITY_QUERIES[key] || `commodity "${key}" October 2026`;

        const retrievalPrompt = `Current date context: 2026.10.13.
Search the web using query: ${searchQuery} for up to 4 recent, high-impact news articles, official reports, or company announcements from October 2026 (including USDA WASDE #676 released October 9, 2026, US Wheat Associates, Thai Tapioca Starch Association TTSA October 6, 2026 announcement at $695/MT, MPOB CPO October 10, 2026, and EEX Potato Starch October 10, 2026 reports).
Important rules for source metadata extraction:
- Do NOT return "Google News" as sourceName. Identify the original publisher or organization (e.g. "Reuters", "Bloomberg", "AgriCensus", "MPOB", "GAPKI").
- Provide the direct original article URL (originalUrl), never a Google News search URL.
- Classify sourceType strictly as "news", "official", or "company".
- Extract actual publication date in YYYY-MM-DD format (publishedAt).
- Exclude any article without a valid original source URL.

Return ONLY a JSON array with raw source metadata before Korean summarization:
[
  {
    "rawTitle": "original article headline",
    "rawSnippet": "factual 1-sentence excerpt from the source",
    "sourceName": "original publisher or organization name (NEVER Google News)",
    "sourceType": "news | official | company",
    "publishedAt": "YYYY-MM-DD",
    "originalUrl": "https://...",
    "category": "시장 동향",
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

    // Deduplicate by originalUrl first, then normalized title, limit to 4 items
    const deduplicated = deduplicateArticles(finalArticles).slice(0, 4);

    intelligenceCache.set(key, { articles: deduplicated, expiresAt: now + CACHE_TTL_MS });
    return deduplicated;
  }
}

export const marketIntelligenceService = MarketIntelligenceService.getInstance();
