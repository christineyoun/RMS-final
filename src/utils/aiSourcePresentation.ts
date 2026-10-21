export interface AiDisplaySource {
  title:string;
  url:string;
  /** Only server-verified publisher metadata may override a hostname label. */
  publisher?:string;
  publisherVerified?:boolean;
}
const publishers:Record<string,string>={
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
  return relay+(title?title+'\n':'')+source.url;
}
