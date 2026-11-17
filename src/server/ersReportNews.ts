import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import type { RetrievedSourceMetadata } from './marketIntelligenceService.ts';

const MAX_BYTES = 2_000_000;
const clean = (v:string) => v.replace(/\s+/g, ' ').trim();
const ersHost = /^(?:www\.)?ers\.usda\.gov$/i;
const releasePath = /^\/publications\/\d{4,}\/?$/;
const documentPath = /^\/media\/\d+\/([a-z]+-\d+[a-z0-9-]*)\.pdf$/i;

function publisherUrl(raw:string, base?:string|URL) {
  try {
    const u = new URL(raw, base);
    return u.protocol === 'https:' && ersHost.test(u.hostname) &&
      !u.username && !u.password && !u.port ? u : null;
  } catch { return null; }
}
export function isErsPublication(url:URL) {
  return !!publisherUrl(url.href) && releasePath.test(url.pathname);
}
function publisherDay(raw:string) {
  const m = /\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/.exec(raw);
  if (!m) return '';
  const iso = [m[3], m[1].padStart(2, '0'), m[2].padStart(2, '0')].join('-');
  const date = new Date(iso + 'T00:00:00Z');
  return Number.isFinite(+date) && date.toISOString().slice(0,10) === iso ? iso : '';
}
export function readErsRelease(html:string, url:URL) {
  if (!isErsPublication(url)) return null;
  const $ = load(html);
  const canonical = $('link[rel="canonical"]').first().attr('href');
  if (canonical) {
    // Compare the publisher's canonical metadata without fetching its HTTP URL.
    const declared = new URL(canonical, url);
    if (declared.protocol === 'http:') declared.protocol = 'https:';
    const c = publisherUrl(declared.href);
    if (!c || c.pathname.replace(/\/$/,'') !== url.pathname.replace(/\/$/,'')) return null;
  }
  const heading = $('main h1').first().length ? $('main h1').first() : $('h1').first();
  const title = clean(heading.text());
  const main = $('main').first().length ? $('main').first() : $('body');
  const text = clean(load((main.html() || '').replace(/></g,'> <')).root().text());
  const at = text.indexOf(title);
  if (!title || at < 0) return null;
  const header = text.slice(at + title.length, at + title.length + 680)
    .split(/\b(?:Overview|Full Report|Download|Releases)\b/i)[0];
  const date = publisherDay(header);
  if (!date) return null;
  const docs = new Map<string,{document:URL;issue:string}>();
  for (const el of main.find('a[href]').toArray()) {
    const document = publisherUrl($(el).attr('href') || '', url);
    const issue = document && documentPath.exec(document.pathname)?.[1];
    if (!document || !issue) continue;
    const token = issue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp('\\b' + token + '\\b', 'i').test(header)) continue;
    docs.set(document.pathname.toLowerCase(), {document,issue});
  }
  if (docs.size !== 1) return null;
  return {title,date,...[...docs.values()][0]};
}

async function bytes(url:URL, fetcher:typeof fetch, media:string) {
  const r = await fetcher(url.href, {
    redirect:'error', signal:AbortSignal.timeout(9000), headers:{Accept:media}
  });
  const finalUrl = r.url ? publisherUrl(r.url) : url;
  if (!r.ok || !finalUrl || finalUrl.pathname !== url.pathname ||
      !r.headers.get('content-type')?.toLowerCase().includes(media) ||
      Number(r.headers.get('content-length') || 0) > MAX_BYTES || !r.body) {
    throw Error('Official report source unavailable or unexpected response');
  }
  const reader = r.body.getReader();
  const chunks:Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw Error('Official report exceeds response limit');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}

export async function discoverErsReportSeries(index:string, fetcher:typeof fetch=fetch, now=new Date()) {
  const hub = publisherUrl(index);
  const series = hub?.searchParams.get('series');
  if (!hub || hub.pathname !== '/api/publications/v1.0' || !series ||
      !/^[A-Z0-9-]{1,20}$/.test(series)) throw Error('Not an official ERS series request');

  const data = JSON.parse((await bytes(hub,fetcher,'application/json')).toString());
  if (!Array.isArray(data?.rows)) throw Error('ERS series response has no release rows');

  const urls = new Map<string,{url:URL; title:string; date:string; issue:string}>();
  for (const row of data.rows) {
    if (row?.series?.code !== series || typeof row.url !== 'string' ||
        typeof row.title !== 'string' || typeof row.releaseDate !== 'string' ||
        typeof row.reportNumber !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.releaseDate)) continue;
    const url = publisherUrl(row.url,hub);
    if (!url || !isErsPublication(url) ||
        url.pathname.split('/').filter(Boolean).at(-1) !== String(row.id)) continue;
    const timestamp = Date.parse(row.releaseDate+'T00:00:00Z');
    if (!Number.isFinite(timestamp) ||
        new Date(timestamp).toISOString().slice(0,10) !== row.releaseDate ||
        timestamp > +now || +now-timestamp > 30*86400000) continue;
    url.hash = '';
    url.search = '';
    urls.set(url.pathname.replace(/\/$/,''),{
      url,title:clean(row.title),date:row.releaseDate,issue:clean(row.reportNumber)
    });
  }

  const newest = [...urls.values()].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6);
  const results = await Promise.allSettled(newest.map(async ({url,title,date,issue}) => {
    const release = readErsRelease((await bytes(url,fetcher,'text/html')).toString(),url);
    if (!release || release.title !== title || release.date !== date ||
        release.issue.toLowerCase() !== issue.toLowerCase()) return null;
    const age = +now - Date.parse(release.date+'T00:00:00Z');
    if (age < 0 || age > 30*86400000) return null;
    return {
      rawId:'ers-release-' + url.pathname.split('/').filter(Boolean).at(-1),
      rawTitle:release.title,rawSnippet:'',sourceName:'USDA ERS',sourceType:'official',
      originalUrl:url.href,publishedAt:release.date,retrievedAt:now.toISOString()
    } satisfies RetrievedSourceMetadata;
  }));
  const candidates:RetrievedSourceMetadata[] = [], errors:string[] = [];
  for (const item of results) {
    if (item.status === 'rejected') errors.push('ERS release fetch failed: '+String(item.reason));
    else if (item.value) candidates.push(item.value);
  }
  return {candidates:candidates.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)),errors};
}

async function pdfText(input:Uint8Array) {
  const {PDFParse} = await import('pdf-parse');
  const parser = new PDFParse({data:input.slice()});
  try { return (await parser.getText()).text; }
  finally { await parser.destroy(); }
}

export async function inspectErsReport(
  html:string, url:URL, topic:RegExp, fetcher:typeof fetch=fetch,
  extract:(bytes:Uint8Array)=>Promise<string> = pdfText
) {
  const release = readErsRelease(html,url);
  if (!release) return null;
  const data = await bytes(release.document,fetcher,'application/pdf');
  if (data.subarray(0,5).toString() !== '%PDF-') return null;
  const text = clean(await extract(new Uint8Array(data)));
  const front = text.slice(0,3000).toLowerCase();
  const formattedDay = new Date(release.date+'T12:00:00Z').toLocaleDateString('en-US',{
    timeZone:'UTC',month:'long',day:'numeric',year:'numeric'
  });
  if (!front.includes(release.issue.toLowerCase()) ||
      (!front.includes(formattedDay.toLowerCase()) && publisherDay(front) !== release.date)) return null;

  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z0-9])/u);
  const passages = sentences.filter(s => s.length >= 70 && s.length <= 1400 && topic.test(s)
    && /\b(?:forecasts?|project\w*|\bproduction|consumption|stocks|exports?|imports?|prices?|demand|suppl\w*|crush)\b/i.test(s));
  if (!passages.length) return null;
  const snippet = [...new Set(passages)].slice(0,8).join(' ').slice(0,5000);
  return {text,snippet,passages,publishedAt:release.date,documentUrl:release.document.href,
    documentSha256:createHash('sha256').update(data).digest('hex')};
}
