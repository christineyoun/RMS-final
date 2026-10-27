export interface AiDisplaySource {
  title:string;
  url:string;
  /** Only server-verified publisher metadata may override a hostname label. */
  publisher?:string;
  publisherVerified?:boolean;
  provenance?:{kind:string};
}
const publishers:Record<string,string>={
  'helenaagri.com':'Helena',
  'cihedging.com':'CIH',
  'farms.com':'Farms.com',
  'foodingredientsasia.com':'Food Ingredients Asia',
  'modifiedfoodstarch.com':'Modified Food Starch',
  'thaitapiocastarch.org':'TTSA',
  'chemanalyst.com':'ChemAnalyst',
  'kmcagro.dk':'KMC Agro',
  'gsxcom.com':'GSX',
  'finance.yahoo.com':'Yahoo Finance',
  'investing.com':'Investing',
  'theedgemalaysia.com':'The Edge',
  'sunsirs.com':'SunSirs',
  'briefs.co':'Briefs',
  'fastmarkets.com':'Fastmarkets',
  'ukragroconsult.com':'UkrAgroConsult',
  'soygrowers.com':'American Soybean Association',
  'biomassmagazine.com':'Biomass Magazine',
  'global-agriculture.com':'Global Agriculture',
  'agrolatam.com':'AgroLatam',
  'commodity-board.com':'Commodity Board',
  'dtnpf.com':'DTN',
  'usda.gov':'USDA',
  'reuters.com':'Reuters',
  'world-grain.com':'World Grain',
  'tradingeconomics.com':'Trading Economics',
};
/** Footer presentation only: original source records remain available internally. */
export function isDirectAiFooterSource(source:AiDisplaySource):boolean {
  try {
    const u=new URL(source.url),host=u.hostname.replace(/^www\./,'');
    return ['http:','https:'].includes(u.protocol) && !/^(?:vertexaisearch\.cloud\.google\.com|news\.google\.com|google\.com)$/.test(host) &&
      // Authenticated PSD transport endpoints remain internal evidence identities,
      // never a public-reader citation or a guessed replacement report URL.
      host!=='api.fas.usda.gov' && host!=='query1.finance.yahoo.com' &&
      u.pathname!=='/' && !/\/(?:hoi-vien|members?|directory)(?:\/|$)/i.test(u.pathname) &&
      !(host==='apps.fas.usda.gov' && /\/psdonline\/app\/index\.html/.test(u.pathname)) &&
      !(host==='fas.usda.gov' && /^\/data\/commodities\//.test(u.pathname));
  } catch {return false;}
}
export function aiPublisherLabel(source:AiDisplaySource):string {
  const u=new URL(source.url),host=u.hostname.toLowerCase().replace(/^www\./,'');
  // A grounding relay is not proof of the publisher named in a model title.
  if(host==='vertexaisearch.cloud.google.com')return host;
  if(source.publisherVerified&&source.publisher?.trim())return source.publisher.trim();
  if(host==='agriculture.gov.au'&&/^\/abares(?:\/|$)/.test(u.pathname)||host==='abares.gov.au')return 'ABARES';
  for(const [domain,name]of Object.entries(publishers))if(host===domain||host.endsWith('.'+domain))return name;
  return host;
}
export function aiSourceTooltip(source:AiDisplaySource):string {
  const title=source.title?.trim();
  const relay=new URL(source.url).hostname==='vertexaisearch.cloud.google.com'?'Google 중계 링크 (원문 미확인)\n':'';
  const verified=source.provenance?.kind==='verified-retained-original'?'보관 원문 독립 검증 · Gemini 검색 링크와 별도\n':source.provenance?.kind==='verified-retained-republication'?'보관 재게시문 검증 · 독립 원보도/Gemini 검색 링크 아님\n':'';
  const resolved=source.provenance?.kind==='resolved-gemini-grounding-original'?'보관 Gemini 검색 링크의 원문 목적지 확인\n':'';
  return relay+verified+resolved+(title?title+'\n':'')+source.url;
}
