/**
 * Free, official USDA WASDE Corn Origin Radar.
 * Parses the published World Corn Supply and Use table directly; no Gemini, PSD
 * demonstration baselines, article inference, or embedded numerical forecasts.
 */
import type { OriginItemDetail, OriginRadarResponse } from './originRadarService.ts';

const WASDE_BASE = 'https://www.usda.gov/oce/commodity/wasde';
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_MS = 86400000;

const ORIGINS = [
  // Growing-area names refer to representative WEATHER sample regions.
  // The WASDE supply data remains national; no port conditions are asserted.
  { key:'usa', name:'United States', label:'미국 (Corn Belt)' },
  { key:'brazil', name:'Brazil', label:'브라질 (Mato Grosso/Paraná)' },
  { key:'argentina', name:'Argentina', label:'아르헨티나 (Córdoba/Santa Fe)' },
  { key:'ukraine', name:'Ukraine', label:'우크라이나 (Poltava/Vinnytsia)' },
] as const;

export interface WasdeCornOriginObservation {
  marketYear: string;
  sourceReportDate: string; // YYYY-MM; do not fabricate a release day
  sourceUrl: string;
  countries: Record<'usa'|'brazil'|'argentina'|'ukraine', {
    productionMMT: number; exportsMMT: number; endingStocksMMT: number;
    priorMonthExportsMMT?: number; priorMonth?: string;
  }>;
}

/** Strictly use the 2026/27 projection's CURRENT reporting-month row, not prior years or Sep comparison. */
export function parseCornWasdeText(text: string, sourceUrl: string): WasdeCornOriginObservation | null {
  if (!/^https:\/\/www\.usda\.gov\/oce\/commodity\/wasde\/wasde\d{4}\.txt$/.test(sourceUrl)) return null;
  const report = text.replace(/\r\n?/g,'\n');
  // Publication header is repeated on every report page. Require an actual published WASDE issue.
  const header = report.match(/WASDE\s*-\s*\d+\s*-\s*\d+\s+([A-Za-z]+)\s+(20\d{2})/);
  if (!header) return null;
  const monthIndex = MONTH_NAMES.findIndex(m=>m.toLowerCase()===header[1].toLowerCase());
  if (monthIndex < 0) return null;
  const year = Number(header[2]);
  if (sourceUrl.match(/wasde(\d{2})(\d{2})\.txt$/)?.slice(1).join('-') !==
      `${String(monthIndex+1).padStart(2,'0')}-${String(year%100).padStart(2,'0')}`) return null;

  // Require the continuation page: this is the table containing current-year country rows.
  const contd = /World Corn Supply and Use\s+1\/\s*\(Contd\.\)/i.exec(report);
  if (!contd || contd.index === undefined) return null;
  const reportTail = report.slice(contd.index);
  const sectionEnd = reportTail.search(/\n\s*World Rice Supply and Use\b/i);
  const cornSection = sectionEnd >= 0 ? reportTail.slice(0,sectionEnd) : reportTail.slice(0,15000);
  const yearBlocks = [...cornSection.matchAll(/\n\s*(20\d{2})\/(\d{2})\s+Proj\.\s*\n/g)];
  if (!yearBlocks.length) return null;
  const current = yearBlocks[yearBlocks.length-1];
  const marketYear = `${current[1]}/${current[2]}`;
  const scope = cornSection.slice(current.index! + current[0].length);
  const targetMonth = MONTH_SHORT[monthIndex];

  const countries = {} as WasdeCornOriginObservation['countries'];
  for (const origin of ORIGINS) {
    // Country heading is on its own line; following lines contain Sep/Oct estimates.
    const lines = scope.split('\n');
    const headingIndex = lines.findIndex(line => line.trim() === origin.name);
    if (headingIndex < 0) return null;
    let values: number[] | null = null;
    let previousMonthValues: number[] | null = null;
    const previousMonth = MONTH_SHORT[(monthIndex+11)%12];
    // WASDE lists one country/group heading followed by its monthly rows.
    // STOP at the first non-month row, including headings such as "Total Foreign",
    // "Russia", or "Major Importers". Never let the following group's Sep row
    // overwrite this country's Sep data (a prior production bug).
    // A missing or duplicate monthly row is not grounds to infer a comparison.
    let sawMonthlyRow = false;
    let ambiguousRows = false;
    for (let i=headingIndex+1; i<lines.length; i++) {
      const line=lines[i].trim();
      if (!line) {
        if (sawMonthlyRow) break;
        continue;
      }
      const m=line.match(/^([A-Za-z]{3})\s+((?:\d+(?:\.\d+)?\s+){6}\d+(?:\.\d+)?)\s*$/);
      if (!m) break;
      const nums=m[2].trim().split(/\s+/).map(Number);
      if (nums.length!==7 || !nums.every(Number.isFinite)) break;
      sawMonthlyRow=true;
      if (m[1]===targetMonth) {
        if (values) { ambiguousRows=true; break; }
        values=nums;
      } else if (m[1]===previousMonth) {
        if (previousMonthValues) { ambiguousRows=true; break; }
        previousMonthValues=nums;
      } else {
        // Unexpected table format: cannot safely attribute monthly rows.
        ambiguousRows=true; break;
      }
      if (values && previousMonthValues) break;
    }
    if (ambiguousRows) return null;
    if(!values || values[1]<=0 || values[5]<0 || values[6]<0) return null;
    countries[origin.key] = { productionMMT:values[1], exportsMMT:values[5], endingStocksMMT:values[6],
      ...(previousMonthValues ? {priorMonthExportsMMT:previousMonthValues[5],priorMonth:`${monthIndex===0?year-1:year}-${String(monthIndex===0?12:monthIndex).padStart(2,'0')}`} : {})
    };
  }
  return { marketYear, sourceReportDate:`${year}-${String(monthIndex+1).padStart(2,'0')}`, sourceUrl, countries };
}

/** Compact, evidence-backed WASDE comparison; the current value is shown only once. */
export function formatCornExportInline(current: number, previous?: number, previousMonth?: string): string {
  const display = (value: number): string => Math.abs(value * 10 - Math.round(value * 10)) < 1e-7
    ? value.toFixed(1) : value.toFixed(2);
  const latest = display(current);
  if (previous === undefined || !Number.isFinite(previous) || !/^20\d{2}-\d{2}$/.test(previousMonth || '')) {
    return `${latest}M MT (전월 비교 자료 없음)`;
  }
  const delta = current - previous;
  const change = Math.abs(delta) < 0.005
    ? '변동 없음'
    : `${delta > 0 ? '+' : '-'}${Math.abs(delta).toFixed(2)}M MT`;
  return `${latest}M MT (전월 ${display(previous)}M MT · ${change})`;
}

const blankOrigin=(origin:typeof ORIGINS[number]):OriginItemDetail=>({
  originKey: origin.key as OriginItemDetail['originKey'],
  region:origin.label, production:'', productionNumericMMT:null, unit:'MMT',marketYear:'',
  exports:'', endingStocks:'', riskAssessment:'USDA 공식 자료를 확인할 수 없어 수치를 표시하지 않습니다.',
  status:'자료 부족', statusColor:'gray', primarySource:'USDA WASDE',
  sourceName:'USDA WASDE', sourceOrg:'',sourceReportDate:'',
  sourceUrl:'https://www.usda.gov/oce/commodity/wasde',retrievedAt:new Date().toISOString(),
  isLive:false,dataFreshness:'unavailable'
});

export function renderCornWasdeRadar(observation: WasdeCornOriginObservation|null, status:'live'|'cached'|'unavailable'):OriginRadarResponse {
  const lastUpdated=new Date().toISOString();
  const origins:OriginItemDetail[]=ORIGINS.map(o=>{
    if (!observation) return blankOrigin(o);
    const d=observation.countries[o.key];
    return {
      ...blankOrigin(o),
      production:`${d.productionMMT.toFixed(1)}M MT`,productionNumericMMT:d.productionMMT,
      exports:`수출 ${formatCornExportInline(d.exportsMMT, d.priorMonthExportsMMT, d.priorMonth)}`,endingStocks:`기말재고 ${d.endingStocksMMT.toFixed(1)}M MT`,
      marketYear:observation.marketYear,
      riskAssessment:'USDA 월간 수급 전망',
      status:'자료 확인',statusColor:'gray',
      sourceOrg:'USDA',sourceReportDate:observation.sourceReportDate,sourceUrl:observation.sourceUrl,
      retrievedAt:lastUpdated,isLive:status==='live',dataFreshness:status
    };
  });
  return {
    success:true,statusCode:200,lastUpdated,origins,
    sourcesUsed:origins.map(o=>({origin:o.region,primarySource:o.primarySource,
      sourceOrg:o.sourceOrg,sourceReportDate:o.sourceReportDate,sourceUrl:o.sourceUrl,status:o.dataFreshness})),
    sourceFooterText: observation ? `USDA WASDE · ${observation.sourceReportDate} (${observation.marketYear} 전망)` : 'USDA WASDE · 자료 확인 필요'
  };
}

export class CornWasdeOriginService {
  private verified:WasdeCornOriginObservation|null=null;
  private checkedAt=0;
  private lastVerifiedAt=0;
  private pending:Promise<OriginRadarResponse>|null=null;

  async getCornOriginRadar(force=false):Promise<OriginRadarResponse> {
    const now=Date.now();
    if(!force && this.checkedAt && now-this.checkedAt<(this.verified?6*60*60*1000:15*60*1000)) {
      return renderCornWasdeRadar(this.verified, this.verified ? 'cached' : 'unavailable');
    }
    if(this.pending) return this.pending;
    this.pending=this.load();
    try {return await this.pending;} finally {this.pending=null;}
  }

  private async load():Promise<OriginRadarResponse> {
    const now=Date.now();
    this.checkedAt=now;
    const kstParts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const get=(t:string)=>Number(kstParts.find(x=>x.type===t)?.value);
    const currentYear=get('year'),currentMonth=get('month');
    for(let monthsAgo=0;monthsAgo<3;monthsAgo++) {
      const d=new Date(Date.UTC(currentYear,currentMonth-1-monthsAgo,15));
      const month=d.getUTCMonth()+1,year=d.getUTCFullYear();
      const url=`${WASDE_BASE}/wasde${String(month).padStart(2,'0')}${String(year%100).padStart(2,'0')}.txt`;
      try {
        const res=await fetch(url,{headers:{Accept:'text/plain'},signal:AbortSignal.timeout(12000)});
        if(res.status===404)continue; // new month's report may not have been published yet
        if(!res.ok)break;
        const body=await res.text();
        if(body.length<15000 || body.length>2_000_000)break;
        const parsed=parseCornWasdeText(body,url);
        if(!parsed)break; // never silently prefer an old month after a changed current report format
        // Do not mislabel reports more than 75 days old as current.
        const reportEnd=Date.UTC(year,month,0);
        if(now-reportEnd>75*DAY_MS)break;
        this.verified=parsed;
        this.lastVerifiedAt=now;
        return renderCornWasdeRadar(parsed,'live');
      } catch {break;}
    }
    // Last genuine downloaded observation may be reused with clear cached status and vintage.
    if(this.verified) {
      const [y,m]=this.verified.sourceReportDate.split('-').map(Number);
      if(now-Date.UTC(y,m,0)<=75*DAY_MS) return renderCornWasdeRadar(this.verified,'cached');
    }
    this.verified=null;
    return renderCornWasdeRadar(null,'unavailable');
  }
}

export const cornWasdeOriginService = new CornWasdeOriginService();
