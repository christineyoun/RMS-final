import {recordNewsDiscovery,recordNewsInputs,recordNewsSummary} from './newsDiagnostics.ts';
import {selectProcurementNews} from './newsProcurementSelection.ts';
import {getStage3RunContext} from './stage3Runtime.ts';
import {discoverAdditionalNews} from './additionalNewsDiscovery.ts';
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

import { GoogleGenAI, isPaidGeminiEnabled } from './paidGeminiGuard.ts';
import { verifyWheatNewsLinksReported } from './wheatArticleVerification.ts';
import { discoverWheatPublisherFeeds } from './wheatFeedDiscovery.ts';
import { discoverWheatPublicPages, wheatDiscoveryPriority } from './wheatPublicPageDiscovery.ts';
import { selectWheatVerifiedNews } from './wheatNewsRanking.ts';
import { wheatLabelsForSource, wheatSummaryRisk } from './wheatNewsQuality.ts';
import fs from 'node:fs';
import path from 'node:path';
import { WHEAT_NEWS_MODEL } from './wheatHybridModels.ts';
import { discoverCornFreeSources, verifyCornCandidates, selectCornNews, cornSelectedQuality, cornLabelsForSource, cornSummaryRisk } from './cornVerifiedNews.ts';
import { assessNewsSummary } from '../utils/newsSummaryQuality.ts';
import { reviewMarketSummary } from './newsEvidenceQuality.ts';
import { discoverSoybeanFreeSources, verifySoybeanCandidates, selectSoybeanNews } from './soybeanVerifiedNews.ts';
import { verifyOtherCommodityArticles } from './all8ArticleVerification.ts';

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
  linkStatus?: 'verified' | 'unverified';
  linkCheckedAt?: string;
  sourceHeadline?: string; // Original publisher headline used for independent link validation
  verifiedSourceEvidence?: {originalUrl:string;publishedAt:string;sourceHeadline:string;excerpt:string;verifiedAt:string};
  // Legacy compatibility fields for existing consumers
  source: string;
  title_kr: string;
  summary_kr: string;
  publication_date: string;
  original_url: string;
  affected_region: string;
}

/** Offline/live shared acceptance. A saved candidate alone is never approval. */
export function evaluateSavedNewsSummaries(key:string,verifiedLocked:RetrievedSourceMetadata[],responseText:string,verifiedOther:boolean=false){
 const sumMap = new Map<string, { title: string; summary: string; evidenceQuote: string }>();
 const sumMatch = responseText.match(/\[[\s\S]*\]/);
 if (sumMatch) {
   const parsedSums = JSON.parse(sumMatch[0]);
   if (Array.isArray(parsedSums)) {
     for (const s of parsedSums) {
       if (s && s.rawId) {
         sumMap.set(String(s.rawId), {
           title: String(s.title || '').trim(),
           summary: String(s.summary || '').trim(),
           evidenceQuote: String(s.evidenceQuote || '').trim()
         });
       }
     }
   }
 }

 const summaryRejections:Array<{url:string;reason:string}>=[];
 const groundedArticles: MarketArticle[] = verifiedLocked.flatMap((lockedMeta) => {
   const sumItem = sumMap.get(lockedMeta.rawId);
   // A scraped English excerpt is evidence for summarization, NOT a
   // substitute for the requested factual Korean article summary.
   if ((key === 'wheat' || key === 'corn' || key === 'soybean') && (!sumItem?.summary ||
     sumItem.summary.length < 30 || !/[가-힣]/.test(sumItem.summary) ||
     !sumItem.title || !/[가-힣]/.test(sumItem.title))) return [];
   // Fail closed on recognizable serious numerical attribution errors.
   // Missing an item is safer than publishing a misleading purchasing figure;
   // Failed factual claims are omitted; existing successful snapshots survive failed collections.
   if (key === 'wheat') {
     const risk = wheatSummaryRisk(sumItem!.summary, lockedMeta.rawSnippet);
     if (risk) {
       console.warn('[RMS Wheat] Rejected ungrounded summary:', risk,
         lockedMeta.originalUrl);
       return [];
     }
   }
   if(key==='corn') {
     const quote=String(sumItem!.evidenceQuote||'').replace(/\s+/g,' ').trim();
     const evidence=lockedMeta.rawSnippet.replace(/\s+/g,' ').trim();
     const quoteValid=quote.length>=35 && evidence.includes(quote);
     const risk=quoteValid?cornSummaryRisk(sumItem!.summary,lockedMeta.rawSnippet,sumItem!.title):'unverified-evidence-quote';
     if(risk){console.warn('[RMS Corn] Rejected summary:',risk,lockedMeta.originalUrl);return [];}
   }
   if(key==='soybean') {
     const quote=String(sumItem!.evidenceQuote||'').replace(/\s+/g,' ').trim();
     const evidence=lockedMeta.rawSnippet.replace(/\s+/g,' ').trim();
     const validQuote=quote.length>=35 && evidence.includes(quote);
     const qualityIssue=validQuote ? reviewMarketSummary(sumItem!.title,sumItem!.summary,lockedMeta.rawSnippet,'soybean') : 'unverified-evidence-quote';
     if(qualityIssue){console.warn('[RMS Soybean] Rejected summary:',qualityIssue,lockedMeta.originalUrl);return [];}
   }
   if(!['wheat','corn','soybean'].includes(key)) {
     const quote=String(sumItem?.evidenceQuote||'').replace(/\s+/g,' ').trim();
     const evidence=lockedMeta.rawSnippet.replace(/\s+/g,' ').trim();
     if(quote.length<35 || !evidence.includes(quote)){summaryRejections.push({url:lockedMeta.originalUrl,reason:quote.length<35?'evidence-quote-shorter-than-35-characters':'evidence-quote-not-found-in-publisher-text'});return [];}
     const issue=reviewMarketSummary(sumItem?.title||'',sumItem?.summary||'',lockedMeta.rawSnippet,key);
     if(issue){summaryRejections.push({url:lockedMeta.originalUrl,reason:issue});return [];}
   }
   // Shared eight-commodity quality gate: publisher verification alone
   // cannot turn a generic article introduction into useful intelligence.
   const quality = assessNewsSummary(sumItem?.summary, sumItem?.title, key);
   if (!quality.pass) {
     summaryRejections.push({url:lockedMeta.originalUrl,reason:String(quality.reason)});
     console.info('[RMS News] Rejected uninformative summary:', key, quality.reason, lockedMeta.originalUrl);
     return [];
   }
   const article = buildArticleFromLockedMetadata(
     lockedMeta,
     sumItem?.summary || lockedMeta.rawSnippet,
     sumItem?.title || lockedMeta.rawTitle
   );
   if (key === 'wheat') {
     // Source-driven pills, not Gemini's generic default metadata.
     const labels = wheatLabelsForSource(lockedMeta);
     article.category = labels.category;
     article.affectedRegion = labels.affectedRegion;
     article.affected_region = labels.affectedRegion;
     article.linkStatus = 'verified';
     article.linkCheckedAt = new Date().toISOString();
   }
   if(key==='soybean') {
     article.category='수급 전망'; article.affectedRegion='글로벌';article.affected_region='글로벌';
     article.linkStatus='verified';article.linkCheckedAt=new Date().toISOString();
   }
   if(key==='corn') {
     const labels=cornLabelsForSource(lockedMeta);
     article.category=labels.category;article.affectedRegion=labels.affectedRegion;
     article.affected_region=labels.affectedRegion;
     article.linkStatus='verified';article.linkCheckedAt=new Date().toISOString();
   }
   if(verifiedOther){article.linkStatus='verified';article.linkCheckedAt=new Date().toISOString();}
   if(article.linkStatus==='verified')article.verifiedSourceEvidence={originalUrl:lockedMeta.originalUrl,publishedAt:lockedMeta.publishedAt,sourceHeadline:lockedMeta.rawTitle,excerpt:lockedMeta.rawSnippet,verifiedAt:new Date().toISOString()};
   return [article];
 });


 return {articles:groundedArticles,rejections:summaryRejections};
}

interface CacheEntry {
  articles: MarketArticle[];
  expiresAt: number;
}

const intelligenceCache = new Map<string, CacheEntry>();
// Diagnostics contain only counts/rejection categories, never paid response text or credentials.
function writeNewsAudit(data:Record<string,unknown>, commodity:string='wheat') {
  const dir=path.join(process.cwd(),'.rms-stage3');
  fs.mkdirSync(dir,{recursive:true});
  const out=path.join(dir,`news-${commodity}-diagnostic.json`);
  const tmp=out+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify({recordedAt:new Date().toISOString(),...data},null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,out);
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h cache for weekday-ready architecture
let intelligenceCooldownUntil = 0;

// Search windows are calculated at request time in Asia/Seoul, never from a release date.
const kstDate = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

const DOMAIN_PUBLISHER_MAP: Record<string, { sourceName: string; sourceType: SourceType }> = {
  'agricensus.com': { sourceName: 'AgriCensus', sourceType: 'news' },
  'commodity-board.com': { sourceName: 'Commodity Board', sourceType: 'news' },
  'northernag.net': { sourceName: 'Northern Ag Network', sourceType: 'news' },
  'graincentral.com': { sourceName: 'Grain Central', sourceType: 'news' },
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
  const safeRetrievedAt = lockedMeta.retrievedAt || new Date().toISOString();
  const safeSummary = (summaryText || lockedMeta.rawSnippet || '').trim();

  return {
    title: finalTitle,
    sourceHeadline: lockedMeta.rawTitle,
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
   * Historical example stories are intentionally disabled for all commodities.
   * They were not proven to exist at the claimed article URLs and could be
   * confused with live news. A lack of verified articles must display as empty.
   */
  public getVerifiedBaseArticles(_commodityId: string): MarketArticle[] {
    return [];
  }

  /**
   * Retrieves aggregated market intelligence for a given commodity.
   * When called by a permitted Stage 3 refresh, uses a current KST date and
   * rolling publication windows rather than frozen launch-month search terms.
   */
  public async getCommodityIntelligence(commodityId: string, force = false): Promise<MarketArticle[]> {
    const key = (commodityId || 'wheat').toLowerCase().replace(/_/g, '-');
    const now = Date.now();
    const retrievedAt = new Date().toISOString();

    const apiKey = process.env.GEMINI_API_KEY;
    const hasValidKey = isPaidGeminiEnabled() && Boolean(apiKey && apiKey !== 'DEMO_KEY' && apiKey !== 'MY_GEMINI_API_KEY');

    // Reuse the whole 24-hour cache, whether a Gemini key is configured or not.
    // Avoid duplicate paid research when navigating between commodities or tabs.
    const cached = intelligenceCache.get(key);
    if (!force && cached && now < cached.expiresAt) {
      return cached.articles;
    }

    // Wheat pilot: never treat historical, manually authored example headlines as verified current news.
    const baseArticles: MarketArticle[] = []; // No simulated news for any commodity
    let finalArticles: MarketArticle[] = [...baseArticles];

    if (hasValidKey && now >= intelligenceCooldownUntil) {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });

        // STAGE 1: Retrieve raw search results and capture original source metadata BEFORE summarization
        const COMMODITY_QUERIES: Record<string, string> = {
          'wheat': 'wheat prices USDA IGC AHDB crop weather Black Sea freight trade restrictions fertilizer input costs latest',
          'corn': 'corn maize USDA CBOT export competition harvest weather ethanol biofuel policy freight latest',
          'soybean': 'soybean USDA China import tariffs Brazil planting drought crushing biofuel demand export offers latest',
          'soybean-oil': 'soybean oil CBOT NOPA stocks crush renewable diesel EPA biofuel policy competing palm oil energy freight latest',
          'palm-oil': 'palm oil MPOB USDA Indonesia Malaysia weather yields biodiesel mandate exports stocks energy latest',
          'sugar': 'ICE No.11 raw sugar Brazil UNICA cane crushing ethanol allocation India export policy Thailand drought stocks latest',
          'potato-starch': 'potato starch Europe JRC MARS potato yields industrial starch content processors supply prices energy exports latest',
          'tapioca-starch': 'tapioca starch TTSA Vietnam China import demand export prices cassava root processing weather mosaic disease supply latest'
        };
        const searchQuery = COMMODITY_QUERIES[key] || `commodity "${key}" latest`; 
        let collectedCandidates:RetrievedSourceMetadata[]=[];
        if(getStage3RunContext()?.scheduledPolicyHash)try{
          const saved=JSON.parse(fs.readFileSync(path.join(process.cwd(),'.rms-stage3','free-news-candidates-'+key+'.json'),'utf8'));
          if(Date.parse(saved.checkedAt)<=Date.now()&&Date.now()-Date.parse(saved.checkedAt)<86400000&&Array.isArray(saved.candidates))collectedCandidates=saved.candidates.slice(0,12);
        }catch{/* Existing bounded discovery remains available. */}
        const todayKST = kstDate();
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
        const retrievalPrompt = `Current date in Korea: ${todayKST}.
Search Google Search for up to ${key === 'wheat' ? '14' : '12'} ACTUAL original articles and official reports with a material procurement connection to ${key}. A direct commodity headline is not required when the source establishes a specific crop/region/season, trade, policy, energy, processing or logistics impact. Do not infer that every geopolitical or agricultural event affects this commodity.
For wheat, collect extra candidates BEFORE filtering so selection can favor useful distinct developments without filling a quota. Cover distinct themes when available: USDA supply and stocks, growing-region weather, export and logistics, futures and prices. Prioritize the newest original publisher HTML articles, not generic databases, homepages, commodity pages, or other crops.
Prioritize verified relevant publications since ${sevenDaysAgo} (past seven calendar days), expand to ${thirtyDaysAgo} when useful, and retain older authoritative reports only when still materially relevant. Procurement decision value precedes credibility, timeliness and distinct-event/publisher diversity. Never use a future date.
Search query: ${searchQuery}.
Use the original publisher's specific article/report page, not its homepage or a search results page.
Return the most procurement-useful verifiable candidates first. Prefer original official, industry and publisher sources; explore relevant World Grain, USDA FAS/ERS, IGC, AHDB, KREI and regional-language reporting. Keep secondary attribution explicit. Final selection is zero to four, never a mandatory quota. Reject unrelated technology awards, generic farming and promotional announcements. Never pad or invent links.
Do not invent article URLs, headline text, dates, publishers, numbers or reports.
Return ONLY a JSON array of original metadata:
[{"rawTitle":"verbatim publisher headline","rawSnippet":"factual excerpt", "sourceName":"publisher", "sourceType":"news|official|company", "publishedAt":"YYYY-MM-DD", "originalUrl":"direct publisher article URL", "category":"시장 동향", "affectedRegion":"region"}]
Never use Google News as sourceName.`;

        // First discover candidates directly from free original-publisher RSS feeds.
        // The RSS itself is NOT trusted: independently validate the publisher HTML.
        const [feedDiscovery, publicDiscovery] = key === 'wheat'
          ? await Promise.all([discoverWheatPublisherFeeds(retrievedAt), discoverWheatPublicPages(retrievedAt)])
          : [null, null];
        const cornDiscovery = key === 'corn' ? await discoverCornFreeSources(retrievedAt) : null;
        const soybeanDiscovery = key === 'soybean' ? await discoverSoybeanFreeSources(retrievedAt) : null;
        const additionalDiscovery = ['soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'].includes(key)?collectedCandidates.length?{candidates:collectedCandidates}:await discoverAdditionalNews(key):null;
        // Favor original, accessible public-page indexes before feeds whose article bodies
        // may be blocked. Max 8 candidates per host to avoid one publisher crowding out
        // USDA/FAO; remaining spots include other original-publisher RSS candidates.
        const publicPool = (publicDiscovery?.candidates || []).sort((a,b)=>
          wheatDiscoveryPriority(b.rawTitle)-wheatDiscoveryPriority(a.rawTitle));
        const hostCounts = new Map<string,number>();
        const candidateSeen = new Set<string>();
        const freeCandidates: RetrievedSourceMetadata[] = [];
        for(const candidate of [...collectedCandidates,...(cornDiscovery?.candidates || []), ...(soybeanDiscovery?.candidates || []), ...(additionalDiscovery?.candidates||[]), ...publicPool, ...(feedDiscovery?.candidates || [])]) {
          const urlKey=normalizeArticleUrl(candidate.originalUrl);
          if(!urlKey||candidateSeen.has(urlKey))continue;
          const host=new URL(candidate.originalUrl).hostname.replace(/^www\./,'');
          if((hostCounts.get(host)||0)>=8)continue;
          candidateSeen.add(urlKey);
          hostCounts.set(host,(hostCounts.get(host)||0)+1);
          freeCandidates.push(candidate);
          if(freeCandidates.length>=26)break;
        }
        const freeCheck = key === 'wheat'
          ? await verifyWheatNewsLinksReported(freeCandidates)
          : key === 'corn' ? await verifyCornCandidates(freeCandidates)
          : key === 'soybean' ? await verifySoybeanCandidates(freeCandidates) : null;
        // Four independently verified RSS articles need no paid Search/grounding call.
        // Corn is free-first, and fails closed if fewer than four publisher pages verify.
        // Do not pay Gemini Search to try to rescue a failing discovery batch.
        const scheduledSearch=!!getStage3RunContext()?.scheduledPolicyHash;
        const skipPaidDiscovery = ((key === 'corn' || key === 'soybean')&&(!scheduledSearch||(freeCheck?.accepted.length||0)>0)) || (key === 'wheat' && (freeCheck?.accepted.length || 0) >= 1);
        const retrievalResp = skipPaidDiscovery ? null : await ai.models.generateContent({
          model: getStage3RunContext()?.analysisModel || (key === 'wheat' ? WHEAT_NEWS_MODEL : 'gemini-3.8-flash'),
          contents: retrievalPrompt,
          config: { tools: [{ googleSearch: {} }] }
        });

        // Extract grounding chunks from Gemini Search metadata to verify original URLs & publishers
        const groundingChunks = retrievalResp?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        const groundedWebSources: Array<{ title: string; uri: string }> = [];
        for (const chunk of groundingChunks) {
          if (chunk?.web?.uri) {
            groundedWebSources.push({
              title: String(chunk.web.title || '').trim(),
              uri: String(chunk.web.uri).trim()
            });
          }
        }

        const lockedMetadataList: RetrievedSourceMetadata[] = [...(freeCheck?.accepted || []),...(additionalDiscovery?.candidates||[])];
        let retrievedJsonCandidates=0;
        if(retrievalResp)recordNewsDiscovery(key,retrievalResp);
        const rawText = retrievalResp?.text || '';
        const jsonMatch = rawText.match(/\[[\s\S]*\]/);

        if (jsonMatch) {
          let parsedRaw: unknown=[];
          try { parsedRaw=JSON.parse(jsonMatch[0]); } catch { /* Search grounding remains available. */ }
          if (Array.isArray(parsedRaw)) {
            retrievedJsonCandidates=parsedRaw.length;
            for (let i = 0; i < parsedRaw.length; i++) {
              const item = parsedRaw[i];
              if (!item || !item.rawTitle) continue;

              // Search grounding chunks are NOT index-aligned with JSON entries.
              // A random chunk is not reliable evidence for a specific headline.
              const candidateUrl = item.originalUrl && !isInvalidOrSearchUrl(item.originalUrl)
                ? String(item.originalUrl).trim() : '';

              const resolvedUrl = await resolveOriginalArticleUrl(candidateUrl);
              // A Wheat publisher label must come from the URL host, not Gemini's
              // potentially inaccurate sourceName string.
              const { cleanTitle, sourceName } = resolveOriginalPublisher(
                key === 'wheat' ? '' : item.sourceName,
                item.rawTitle,
                resolvedUrl
              );
              const lockedPublisher = key === 'wheat' && resolvedUrl && !sourceName
                ? new URL(resolvedUrl).hostname.replace(/^www\./,'') : sourceName;

              const normalizedPubDate = normalizeDateString(item.publishedAt);
              // Verify the publication date on the original publisher's page.
              // Do not discard candidates merely because Gemini guessed a date incorrectly.
              const candidateDate = normalizedPubDate && normalizedPubDate >= thirtyDaysAgo && normalizedPubDate <= todayKST
                ? normalizedPubDate : '';
              const explicitType =
                item.sourceType === 'official' || item.sourceType === 'company' || item.sourceType === 'news'
                  ? (item.sourceType as SourceType)
                  : classifySourceType(sourceName, resolvedUrl);

              const isVerified =
                Boolean(lockedPublisher) &&
                !isGoogleNewsSourceLabel(lockedPublisher) &&
                Boolean(resolvedUrl) && (key === 'wheat' || Boolean(candidateDate)) &&
                !isInvalidOrSearchUrl(resolvedUrl);

              // IMMEDIATELY lock source metadata BEFORE summarization
              lockedMetadataList.push({
                rawId: `live-${key}-${i}`,
                rawTitle: cleanTitle,
                rawSnippet: String(item.rawSnippet || '').trim(),
                sourceName: isVerified ? lockedPublisher : '출처 확인 불가 (Unavailable)',
                sourceType: explicitType,
                publishedAt: candidateDate,
                originalUrl: isVerified ? resolvedUrl : '',
                retrievedAt,
                category: String(item.category || '시장 동향').trim(),
                affectedRegion: String(item.affectedRegion || '글로벌').trim(),
                unavailable: !isVerified
              });
            }
          }
        }

        // Supplement JSON suggestions with original articles from the paid call's own
        // Google Search grounding. These are not index-aligned to JSON results;
        // each is verified independently against publisher title, date and article text.
        let groundingCandidates=0;
        if(key==='wheat') {
          const existing=new Set(lockedMetadataList.map(x=>normalizeArticleUrl(x.originalUrl)));
          for(const [index,chunk] of groundedWebSources.entries()) {
            const url=await resolveOriginalArticleUrl(chunk.uri);
            if(!url||isInvalidOrSearchUrl(url)||existing.has(normalizeArticleUrl(url)))continue;
            const resolved=resolveOriginalPublisher('',chunk.title,url);
            if(!resolved.cleanTitle||!/\bwheat\b|\bwasde\b|밀|소맥/i.test(resolved.cleanTitle+' '+url))continue;
            existing.add(normalizeArticleUrl(url));
            groundingCandidates++;
            lockedMetadataList.push({rawId:`grounded-${index}`,rawTitle:resolved.cleanTitle,
              rawSnippet:'',sourceName:resolved.sourceName||new URL(url).hostname,
              sourceType:classifySourceType(resolved.sourceName,url),
              publishedAt:'',originalUrl:url,retrievedAt,
              category:'시장 동향',affectedRegion:'글로벌'});
          }
        }
        // STAGE 2: independently check original URLs before any summarization expense.
        const report=key==='wheat'
          ? await verifyWheatNewsLinksReported(lockedMetadataList.filter(m=>!m.unavailable))
          : scheduledSearch&&key==='corn'?await verifyCornCandidates(lockedMetadataList.filter(m=>!m.unavailable))
          : scheduledSearch&&key==='soybean'?await verifySoybeanCandidates(lockedMetadataList.filter(m=>!m.unavailable)):null;
        // Corn items in lockedMetadataList are already independently verified by
        // verifyCornCandidates; no metadata-only items are accepted as evidence.
        const verifiedOther = ['soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch'].includes(key)
          ? await verifyOtherCommodityArticles(lockedMetadataList,key) : null;
        if(verifiedOther)writeNewsAudit({stage:verifiedOther.length?'sources-verified':'no-verified-source-content',
          candidates:lockedMetadataList.length,verified:verifiedOther.length,
          note:'Requires reachable original HTML, commodity-relevant publisher content, publication date, then quoted source evidence and substantive summary.'},key);
        const rankedVerified=(report?.accepted || verifiedOther || lockedMetadataList.filter(m=>!m.unavailable))
          .filter((a,i,all)=>all.findIndex(b=>normalizeArticleUrl(b.originalUrl)===normalizeArticleUrl(a.originalUrl))===i)
          .sort((a,b)=>key==='wheat'
            ? (wheatDiscoveryPriority(b.rawTitle)-wheatDiscoveryPriority(a.rawTitle) || b.publishedAt.localeCompare(a.publishedAt))
            : b.publishedAt.localeCompare(a.publishedAt));
        // Rank the original verified publisher text, not unverified metadata.
        // Prefer 0-14 day news, 3+ publishers and different market themes where available.
        const primaryCorn = key==='corn' ? selectCornNews(rankedVerified,4) : [];
        // One paid batch may include two verified backup candidates. If Gemini
        // returns filler or unsupported numbers for one article, reject it and
        // select up to four useful articles from the remaining grounded outputs WITHOUT another call.
        const verifiedLocked: RetrievedSourceMetadata[]=key==='wheat'
          ? selectWheatVerifiedNews(rankedVerified,6)
          : key==='corn' ? selectCornNews(rankedVerified,6)
          : key==='soybean' ? selectSoybeanNews(rankedVerified,6) : rankedVerified;
        if(key==='wheat')writeNewsAudit({stage:verifiedLocked.length>0?'ready-to-summarize':'insufficient-verified-articles',
          retrievedJsonCandidates,groundingChunks:groundedWebSources.length,groundingCandidates,
          feedDiscovery:feedDiscovery?.diagnostics || null, publicDiscovery:publicDiscovery?.diagnostics || null,
          freeCandidates:freeCandidates.length,feedVerified:freeCheck?.accepted.length || 0,skipPaidDiscovery,
          validMetadata:lockedMetadataList.filter(m=>!m.unavailable).length,
          verification:report?.summary,selectedForSummary:verifiedLocked.length,
          selectedPublishers:[...new Set(verifiedLocked.map(x=>x.sourceName))],
          selectedDates:verifiedLocked.map(x=>x.publishedAt),
          note:'Only verified substantive Korean summaries are eligible; four is a maximum.'});
        const cornQuality=key==='corn'?cornSelectedQuality(primaryCorn):null;
        if(key==='corn')writeNewsAudit({
          stage:verifiedLocked.length>0?'ready-to-summarize':'insufficient-verified-articles',
          discovery:cornDiscovery?.diagnostics||null, freeVerified:freeCheck?.summary||null,
          selectedForSummary:verifiedLocked.length,quality:cornQuality,
          selected:verifiedLocked.map(x=>({title:x.rawTitle,date:x.publishedAt,
            source:x.sourceName,url:x.originalUrl,chars:x.rawSnippet.length})),
          note:'No Search grounding; existing paid authorization still required; only verified originals are eligible.'
        },'corn');
        // No summarization without verified original publisher evidence.
        if(key==='soybean')writeNewsAudit({stage:verifiedLocked.length>=4?'ready-to-summarize':'insufficient-verified-articles',
          discovery:soybeanDiscovery?.diagnostics || null,verification:freeCheck?.summary || null,
          selected:verifiedLocked.map(m=>({source:m.sourceName,title:m.rawTitle,date:m.publishedAt,url:m.originalUrl})),
          distinctPublishers:new Set(verifiedLocked.map(m=>m.sourceName)).size,
          sourceDiversityNote:new Set(verifiedLocked.map(m=>m.sourceName)).size<2?'Limited publisher diversity; all links independently verified.':null},'soybean');
        if(!verifiedLocked.length)return [];
        if (verifiedLocked.length > 0) {
          recordNewsInputs(key,verifiedLocked);
          const summarizePrompt = `Translate and summarize the following retrieved commodity intelligence items into Korean for a procurement desk.
${!['wheat','corn','soybean'].includes(key) ? `The rawSnippet is verified original-publisher HTML article text for ${key}. Use ONLY that text, preserve the precise commodity and distinguish crude versus refined oil, raw sugar versus cane, and starch products versus harvested roots. Do not borrow facts from other commodities or years. If article-specific market developments are absent omit that item. Include an evidenceQuote copied directly from rawSnippet supporting the Korean summary. Return only a JSON array:` : key==='wheat' ? 'The rawSnippet field contains text scraped from the independently verified original publisher page for Wheat. Do not add statistics, crop regions, causal explanations, or claims not supported by that field. Carefully distinguish TOTAL GRAINS (wheat + coarse grains) from WHEAT-ONLY production, exports, trade, or stocks. Never attribute maize supply changes to wheat. If a number cannot be traced to its correct crop and metric in rawSnippet, OMIT that numerical claim. Preserve uncertainty and avoid generic boilerplate. Do NOT alter IDs or invent sources. Return ONLY a JSON array:' : key==='soybean' ? 'Every rawSnippet comes from an independently verified original publisher article specifically about SOYBEANS (not soybean oil alone). Use ONLY that exact source evidence. Never invent production, prices, crops, trade, weather or causal claims. Do not confuse whole soybean beans with processed soybean oil or soymeal; keep reporting years and units precise. Produce specific Korean procurement news, not generic report intros. For each article include an evidenceQuote field with one exact 35+ character English passage copied verbatim from the rawSnippet that directly supports the Korean summary. When evidence cannot support concrete soybean procurement intelligence, omit the article. Return ONLY a JSON array:' : 'The rawSnippet field contains text extracted from independently verified original publisher content for Corn. Treat it as the ONLY evidence. Never invent numbers or causes. Distinguish CORN/MAIZE from WHEAT, SOYBEANS, and total grains; do not move statistics between crops, seasons, geographies, or units. If a specific number cannot be traced to the correct crop and metric in rawSnippet, OMIT it. Preserve uncertainty, accurately report forecast revisions, and avoid generic boilerplate. Do NOT alter IDs or invent sources. For EACH Corn article, identify a specific event, price, production, stocks, demand, shipping, or sourcing change, not a report introduction or description. If the evidence lacks a concrete Corn/maize development, omit that article from the output. Prefer source-exact numbers and units; if unsure omit the number. Do not describe FOB Flat Price tables as an average or mean (평단가/평균) unless the report explicitly supplies an average. Add an evidenceQuote field containing one direct, verbatim English passage copied from rawSnippet (do not translate the quote). Return ONLY a JSON array:'}
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
    ${key !== 'wheat' ? '"evidenceQuote": "verbatim short English passage from rawSnippet relevant to the commodity market movement",' : ''}
    "title": "accurate, natural Korean headline",
    "summary": "complete, readable professional Korean explaining the source-verified development, important figures/units/periods, and defensible ${key} procurement implications; no fixed word, character or sentence limit; never truncate useful facts to equalize card heights; use only rawSnippet and preserve forecast uncertainty"
  }
]`;

          const sumResp = await ai.models.generateContent({
            model: getStage3RunContext()?.analysisModel || (key === 'wheat' ? WHEAT_NEWS_MODEL : 'gemini-3.8-flash'),
            contents: summarizePrompt
          });

          // Save the exact response before any acceptance/ranking can discard it.
          recordNewsSummary(key,verifiedLocked,sumResp);
          const {articles:groundedArticles,rejections:summaryRejections}=evaluateSavedNewsSummaries(key,verifiedLocked,sumResp.text||'',!!verifiedOther);
          if(verifiedOther)writeNewsAudit({stage:groundedArticles.length?'articles-ready':'all-summaries-rejected',
            verifiedSources:verifiedLocked.length,publishable:groundedArticles.length,rejections:summaryRejections,
            rejectionChecks:['evidenceQuote must match original text (35+ characters)','summary must pass commodity-specific informativeness gate']},key);
          // Apply the same four-card diversity/recency gate AFTER rejecting bad
          // summaries; a partial batch NEVER overwrites a valid Stage 3 snapshot.
          const cornGrounded = key==='corn'
            ? selectCornNews(groundedArticles.map(a=>({rawId:a.originalUrl,
                rawTitle:a.sourceHeadline||a.title,rawSnippet:verifiedLocked.find(v=>v.originalUrl===a.originalUrl)?.rawSnippet||'',
                sourceName:a.sourceName,sourceType:a.sourceType,publishedAt:a.publishedAt,
                originalUrl:a.originalUrl,retrievedAt:a.retrievedAt})),4)
            : [];
          const cornAllowedUrls=new Set(cornGrounded.map(x=>x.originalUrl));
          const wheatSelected=key==='wheat'
            ? selectWheatVerifiedNews(groundedArticles.map(a=>({
                rawId:a.originalUrl,rawTitle:a.sourceHeadline||a.title,
                rawSnippet:verifiedLocked.find(v=>v.originalUrl===a.originalUrl)?.rawSnippet||'',
                sourceName:a.sourceName,sourceType:a.sourceType,publishedAt:a.publishedAt,
                originalUrl:a.originalUrl,retrievedAt:a.retrievedAt
              })),4)
            : [];
          const wheatAllowedUrls=new Set(wheatSelected.map(x=>x.originalUrl));
          const soySelected=key==='soybean' ? selectSoybeanNews(groundedArticles.map(a=>({
            rawId:a.originalUrl,rawTitle:a.sourceHeadline||a.title,
            rawSnippet:verifiedLocked.find(v=>v.originalUrl===a.originalUrl)?.rawSnippet||'',
            sourceName:a.sourceName,sourceType:a.sourceType,publishedAt:a.publishedAt,
            originalUrl:a.originalUrl,retrievedAt:a.retrievedAt
          })),4) : [];
          const soyAllowedUrls=new Set(soySelected.map(a=>a.originalUrl));
          const publishable=key==='corn'
            ? (cornSelectedQuality(cornGrounded).readyForReview ? groundedArticles.filter(a=>cornAllowedUrls.has(a.originalUrl)) : [])
            : key==='wheat' ? groundedArticles.filter(a=>wheatAllowedUrls.has(a.originalUrl))
            : key==='soybean' ? ((soySelected.length===4||scheduledSearch&&soySelected.length>0) ? groundedArticles.filter(a=>soyAllowedUrls.has(a.originalUrl)):[])
            : groundedArticles;
          finalArticles = [...publishable, ...baseArticles];
          if(key==='soybean')writeNewsAudit({stage:publishable.length===4?'four-articles-ready':'summary-incomplete',
            selectedForSummary:verifiedLocked.length,goodKoreanSummaries:publishable.length,
            rejectedAfterSummary:verifiedLocked.length-groundedArticles.length},'soybean');
          if(key==='corn')writeNewsAudit({stage:publishable.length===4?'four-articles-ready':'summary-incomplete',
            selectedForSummary:verifiedLocked.length,goodKoreanSummaries:publishable.length,
            rejectedAfterSummary:verifiedLocked.length-groundedArticles.length,
            selectedPublishers:[...new Set(verifiedLocked.map(x=>x.sourceName))]},'corn');
          if(key==='wheat')writeNewsAudit({stage:publishable.length===4?'four-articles-ready':'summary-incomplete',
            retrievedJsonCandidates,groundingChunks:groundedWebSources.length,groundingCandidates,
            feedDiscovery:feedDiscovery?.diagnostics || null,publicDiscovery:publicDiscovery?.diagnostics || null,
          freeCandidates:freeCandidates.length,feedVerified:freeCheck?.accepted.length || 0,skipPaidDiscovery,
            verification:report?.summary,selectedForSummary:verifiedLocked.length,
          selectedPublishers:[...new Set(verifiedLocked.map(x=>x.sourceName))],
          selectedDates:verifiedLocked.map(x=>x.publishedAt),
            goodKoreanSummaries:groundedArticles.length});
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

        if (!['wheat','corn','soybean'].includes(key))writeNewsAudit({stage:'collector-error',reason:errStr.slice(0,500),kind:is429?'quota-or-rate-limit':'collection-error'},key);
        if (key==='wheat')writeNewsAudit({stage:'collector-error',kind:is429?'quota-or-rate-limit':'collection-error',
          note:'Check the server terminal for details. Existing snapshot was not overwritten.'});
        if (is429) {
          intelligenceCooldownUntil = Date.now() + 5 * 60 * 1000;
          console.info(`[MarketIntelligenceService] Search grounding quota active (cooldown 5m), serving verified pre-retrieved intelligence for ${key}.`);
        } else {
          console.info(`[MarketIntelligenceService] Notice for ${key}: serving verified pre-retrieved intelligence.`);
        }
      }
    }

    // Deduplicate by originalUrl first, then normalized title, limit to 4 items
    const deduplicated = selectProcurementNews(key,deduplicateArticles(finalArticles)
      .filter(a => assessNewsSummary(a.summary, a.title, key).pass)
      );

    // Cache a verified useful subset without requiring filler to reach four.
    // An empty failed collection does not displace an earlier successful cache.
    if (deduplicated.length > 0)
      intelligenceCache.set(key, { articles: deduplicated, expiresAt: now + CACHE_TTL_MS });
    return deduplicated;
  }
}

export const marketIntelligenceService = MarketIntelligenceService.getInstance();
