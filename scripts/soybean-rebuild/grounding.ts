/**
 * Stage 1 only: extract GOOGLE-PROVIDED search citations from Gemini.
 * Never promote URLs written in the model's answer to citations.
 */
export type GroundedSource = {
  index: number;
  title: string;
  uri: string;
  publisherHostname: string;
  needsRedirectResolution: boolean;
};

export type GroundingResult = {
  metadataPresent: boolean;
  webSearchQueries: string[];
  sources: GroundedSource[];
  groundingSupportCount: number;
  hasGoogleCitations: boolean;
};

function safeHttpsUrl(value: unknown): URL | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function plainText(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : '';
}

/** Works with the Gemini SDK's generateContent result shape. */
export function extractGrounding(response: any): GroundingResult {
  const metadata = response?.candidates?.[0]?.groundingMetadata;
  const chunks = Array.isArray(metadata?.groundingChunks) ? metadata.groundingChunks : [];
  const queries = Array.isArray(metadata?.webSearchQueries) ? metadata.webSearchQueries : [];
  const supports = Array.isArray(metadata?.groundingSupports) ? metadata.groundingSupports : [];
  const sources: GroundedSource[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < chunks.length; i++) {
    const web = chunks[i]?.web;
    const url = safeHttpsUrl(web?.uri);
    if (!url || seen.has(url.href)) continue;
    seen.add(url.href);
    sources.push({
      index: i,
      uri: url.href,
      title: plainText(web?.title, 240) || url.hostname,
      publisherHostname: url.hostname,
      needsRedirectResolution: /(^|\.)vertexaisearch\.cloud\.google\.com$/i.test(url.hostname) || /google\.com\/grounding-api-redirect/i.test(url.href),
    });
  }

  return {
    metadataPresent: Boolean(metadata),
    webSearchQueries: queries.map((q: unknown) => plainText(q, 180)).filter(Boolean),
    sources,
    groundingSupportCount: supports.length,
    hasGoogleCitations: sources.length > 0,
  };
}
