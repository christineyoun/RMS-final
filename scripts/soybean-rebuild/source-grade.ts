/** Deterministic A/B grading utilities for isolated soybean rebuild step 2. */
import {isIP} from 'node:net';
import {type Commodity} from './commodity-config.ts';
import {classifyCommodityText,type Tier} from './commodity-aliases.ts';

export type Grade = 'A'|'B'|'EXCLUDED';
export type Reason = 'verified-html'|'verified-pdf'|'publisher-http-error'|'publisher-unreachable'|'publisher-content-unreadable'|'publisher-unrelated'|'publisher-redirect-unresolved'|'publisher-redirect-unsafe'|'publisher-redirect-limit'|'non-primary-background'|'unsupported-content-type'|'publisher-body-too-large'|'publisher-body-empty'|'publisher-challenge-page'|'unsafe-google-citation';
export type GradeRecord = {
  grade:Grade; reason:Reason; googleCitation:{index:number;title:string;uri:string};
  publisherUrl:string|null; publisherHost:string|null; httpStatus:number|null;
  documentType:'html'|'pdf'|null; title:string|null; publishedAt:string|null;
  relevance?:Tier;
  extractedText:string|null; extractedCharacters:number; notes:string;
};
export type SourceCandidate = {index:number;title:string;uri:string};

export const MAX_DOCUMENT_BYTES=10_000_000;
export const TIMEOUT_MS=12000;
const backgroundHosts=/^(?:[a-z0-9-]+\.)*(?:wikipedia\.org|wikidata\.org|wikimedia\.org)$/i;
export function isGoogleRedirect(url:URL):boolean {return url.hostname==='vertexaisearch.cloud.google.com'&&url.pathname.startsWith('/grounding-api-redirect/');}
export function safeExternalUrl(input:string):URL|null {
  try {
    const u=new URL(input);const h=u.hostname.toLowerCase().replace(/\.$/,'');
    if(u.protocol!=='https:'||u.username||u.password||u.port||!h||isIP(h)||h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h.endsWith('.internal')||h.endsWith('.test')||h.endsWith('.example')||h.includes('..'))return null;
    u.hash='';return u;
  }catch{return null;}
}
function publicIPv4(ip:string):boolean {const x=ip.split('.').map(Number);return x.length===4&&x.every(n=>Number.isInteger(n)&&n>=0&&n<256)&&!([0,10,127].includes(x[0])||(x[0]===169&&x[1]===254)||(x[0]===172&&x[1]>=16&&x[1]<=31)||(x[0]===192&&x[1]===168)||(x[0]===100&&x[1]>=64&&x[1]<=127)||x[0]>=224);}
export function isPublicIp(ip:string):boolean {
  if(isIP(ip)===4)return publicIPv4(ip);
  if(isIP(ip)!==6)return false;
  const normalized=ip.toLowerCase();
  if(normalized==='::'||normalized==='::1'||normalized.startsWith('fc')||normalized.startsWith('fd')||normalized.startsWith('fe8')||normalized.startsWith('fe9')||normalized.startsWith('fea')||normalized.startsWith('feb')||normalized.startsWith('2001:db8:'))return false;
  const mapped=normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped?publicIPv4(mapped[1]):true;
}
export function documentHasCommodityEvidence(text:string,commodity:Commodity):boolean {return classifyCommodityText(text,commodity)!=='none';}
/** Original API retained for existing STEP2 tests and soybean compatibility. */
export function documentHasSoybeanEvidence(text:string):boolean{return documentHasCommodityEvidence(text,'soybean');}
export function isChallenge(text:string):boolean {return /enable javascript and cookies|verify you are human|checking your browser before accessing|captcha verification|access denied.*(?:cloudflare|security)/i.test(text.slice(0,6000));}
export function chooseGrade(verified:{citation:boolean;publisherUrl?:string|null;status?:number|null;type?:'html'|'pdf'|null;text?:string;error?:Reason|null},commodity:Commodity='soybean'):{grade:Grade;reason:Reason}{
  if(!verified.citation)return {grade:'EXCLUDED',reason:'unsafe-google-citation'};
  const u=verified.publisherUrl?safeExternalUrl(verified.publisherUrl):null;
  if(u&&backgroundHosts.test(u.hostname))return {grade:'EXCLUDED',reason:'non-primary-background'};
  const e=verified.error;
  if(e)return {grade:'B',reason:e};
  if(!u)return {grade:'B',reason:'publisher-redirect-unresolved'};
  if(verified.status!==200)return {grade:'B',reason:'publisher-http-error'};
  if(!verified.type)return {grade:'B',reason:'unsupported-content-type'};
  const t=verified.text||'';
  if(isChallenge(t))return {grade:'B',reason:'publisher-challenge-page'};
  if(t.length<250)return {grade:'B',reason:'publisher-content-unreadable'};
  if(!documentHasCommodityEvidence(t,commodity))return {grade:'B',reason:'publisher-unrelated'};
  return {grade:'A',reason:verified.type==='pdf'?'verified-pdf':'verified-html'};
}
export function simpleDate(v:string|null|undefined):string|null {
  const s=(v||'').trim();if(!s)return null;
  const m=s.match(/^20\d\d-\d\d-\d\d/);if(!m)return null;
  const d=new Date(m[0]);return !Number.isNaN(+d)&&d.toISOString().slice(0,10)===m[0]?m[0]:null;
}
