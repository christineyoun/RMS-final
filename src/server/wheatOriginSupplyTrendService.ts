/**
 * Wheat-only sourcing context from published USDA FAS PSD forecasts.
 * Compares official wheat export forecasts for adjacent marketing years.
 * Uses the most recently revised preceding marketing-year forecast when that
 * year was not revised in the current publication (within 2 months only).
 * Mixed-vintage comparisons are clearly labeled and retain provenance.
 * No fabricated freight, port or trade-policy assertions. No Gemini requests.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { OriginRadarResponse, OriginItemDetail } from './originRadarService.ts';
import { parseOfficialWheatPsd } from './wheatVerifiedOriginService.ts';

type Key = OriginItemDetail['originKey'];
type Prior = Partial<Record<Key, { exportsMMT: number; reportMonth: string }>>;
type Saved = { version: 1; year: number; checkedDay: string; prior: Prior };
const DIR = process.env.RMS_ORIGIN_CACHE_DIR || path.join(process.cwd(), '.rms-origin-verified');
const FILE = path.join(DIR, 'wheat-prior-export-v1.json');
const API = 'https://api.fas.usda.gov/api/psd';
const validKeys = new Set(['usa','australia','canada','eu','russia']);
function todayKst(): string {
  const pieces = new Intl.DateTimeFormat('en-US', { timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date());
  const value = (t:string) => pieces.find(p=>p.type===t)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}
function isWeekday(day: string): boolean {
  const date = new Date(`${day}T03:00:00Z`).getUTCDay();
  return date >= 1 && date <= 5;
}
function load(): Saved|null {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE,'utf8'));
    return parsed?.version===1 && Number.isInteger(parsed?.year) && typeof parsed.checkedDay==='string' &&
      parsed.prior && typeof parsed.prior==='object' ? parsed as Saved : null;
  } catch { return null; }
}
function save(data: Saved) {
  try {
    fs.mkdirSync(DIR, {recursive:true, mode:0o700});
    const tmp = `${FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data,null,2), {mode:0o600});
    fs.renameSync(tmp,FILE);
  } catch(err) { console.warn('[Wheat Sourcing] Failed saving prior export forecasts:',String(err)); }
}
const parseCurrentExports = (text:string):number|null => {
  const match=/^(?:수출\s*)?([0-9]+(?:\.[0-9]+)?)M MT$/.exec(text.trim());
  if(!match) return null;
  const n=Number(match[1]);
  return Number.isFinite(n) && n >= 0 && n <= 200 ? n : null;
};
// USDA PSD publishes each marketing year with the month it was last revised.
// An unchanged prior year can legitimately retain its August/September record
// while the current-year estimate has an October revision. In that case we may
// compare with the latest official prior-year value, provided it is <=2 months
// old, and explicitly identify that prior vintage in the visible text.
// This is not a claim that both estimates were issued in the same month.
function verifiedRevisionGap(currentMonth:string, priorMonth:string):number|null {
  const parse=(s:string):number|null=>{
    const match=/^(\d{4})-(\d{2})$/.exec(s);
    if(!match) return null;
    const yr=Number(match[1]),mon=Number(match[2]);
    return yr>=2020 && yr<=2100 && mon>=1 && mon<=12 ? yr*12+mon : null;
  };
  const current=parse(currentMonth), prior=parse(priorMonth);
  if(current===null || prior===null) return null;
  const gap=current-prior;
  return gap>=0 && gap<=2 ? gap : null;
}
export type VerifiedWheatExportTrend = {
  text: string;
  pct: number;
  display: string;
  basis: string;
};
export function verifiedExportTrend(current:OriginItemDetail, previous?:{exportsMMT:number;reportMonth:string}):VerifiedWheatExportTrend|null {
  if(current.dataFreshness==='unavailable' || !previous) return null;
  if(!/^\d{4}\/\d{2}$/.test(current.marketYear)) return null;
  const monthGap=verifiedRevisionGap(current.sourceReportDate,previous.reportMonth);
  if(monthGap===null) return null;
  const currentYear=Number(current.marketYear.slice(0,4));
  if(!Number.isInteger(currentYear)||currentYear<2020||currentYear>2100) return null;
  const now=parseCurrentExports(current.exports);
  const prev=previous.exportsMMT;
  if(now===null || !Number.isFinite(prev) || prev<=0 || prev>200) return null;
  const delta=(now/prev-1)*100;
  if(!Number.isFinite(delta) || Math.abs(delta)>150) return null;
  const rounded=Math.round(Math.abs(delta));
  const comparable=monthGap===0;
  // Show the previous-year revision month only when it differs; do not repeat
  // the same October date or pretend the two releases were simultaneous.
  const priorVintage= comparable ? '' : ` (전년값 ${Number(previous.reportMonth.slice(5))}월)`;
  const target=comparable ? '수출 전망 전년 대비 ' : '수출 전망 전년 공식 최신치 대비 ';
  const text=rounded<5
    ? `수급 동향: 수출 전망 전년 수준${priorVintage}`
    : `수급 동향: ${target}${delta>0?'약 '+rounded+'% 증가':'약 '+rounded+'% 감소'}${priorVintage}`;
  // Compare adjacent MARKETING YEARS, not adjacent publication months.
  // Keep numeric source values unmodified for the upstream risk screening rules.
  const priorLabel=prev.toFixed(2).replace(/0$/, '');
  const direction=delta>0 ? '+' : '-';
  const movement=now===prev
    ? '변동 없음'
    : Math.abs(delta)<0.05
      ? `${direction}0.1% 미만`
      : `${direction}${Math.abs(delta).toFixed(1)}%`;
  const display=`전년 ${priorLabel}M MT · ${movement}`;
  const priorYear=currentYear-1;
  const basis=`${current.marketYear} 전망 ${current.sourceReportDate} · ${priorYear}/${String(currentYear).slice(-2)} 전망 ${previous.reportMonth}`;
  return {text,pct:delta,display,basis};
}
export function exportTrendText(current:OriginItemDetail, previous?:{exportsMMT:number;reportMonth:string}):string {
  return verifiedExportTrend(current,previous)?.text||'';
}

export class WheatOriginSupplyTrendService {
  private latest: Saved|null=null;
  private pending:Promise<Saved|null>|null=null;
  private async previousForYear(year:number):Promise<Saved|null> {
    const today=todayKst();
    if(this.latest?.year===year && this.latest.checkedDay===today) return this.latest;
    const stored=load();
    if(stored?.year===year && (stored.checkedDay===today || !isWeekday(today))) {
      this.latest=stored;
      return stored;
    }
    if(!isWeekday(today)) return stored?.year===year ? stored : null;
    if(this.pending) return this.pending;
    this.pending=(async()=>{
      const key=(process.env.USDA_FAS_API_KEY || process.env.USDA_API_KEY || '').trim();
      if(!key) return stored?.year===year ? stored : null;
      const get=async (endpoint:string):Promise<unknown>=>{
        const response=await fetch(`${API}${endpoint}`,{
          headers:{Accept:'application/json','API_KEY':key,'x-api-key':key},signal:AbortSignal.timeout(10000),
        });
        if(!response.ok) throw new Error(`PSD HTTP ${response.status}`);
        return response.json();
      };
      try {
        const [countries, rows]=await Promise.all([
          get('/countries'), get(`/commodity/0410000/country/all/year/${year-1}`)
        ]);
        const official=parseOfficialWheatPsd(countries,rows,year-1);
        const prior:Prior={};
        for(const row of official){
          if(validKeys.has(row.key) && row.exportsMMT!==null && row.exportsMMT>0 && row.exportsMMT<=200){
            prior[row.key]={exportsMMT:row.exportsMMT,reportMonth:row.reportMonth};
          }
        }
        const record:Saved={version:1, year, checkedDay:today, prior};
        save(record);
        this.latest=record;
        return record;
      } catch(error) {
        console.warn('[Wheat Sourcing] Prior-year PSD unavailable:',String(error).slice(0,140));
        // Cache the daily failed attempt to prevent repeated paid-provider requests (USDA itself is not Gemini).
        const record:Saved={version:1,year,checkedDay:today,prior:stored?.year===year?stored.prior:{}};
        save(record);
        this.latest=record;
        return record;
      }
    })();
    try { return await this.pending; } finally { this.pending=null; }
  }
  async enrich(input:OriginRadarResponse):Promise<OriginRadarResponse> {
    const year=Number(input.origins.find(o=>/^\d{4}\/\d{2}$/.test(o.marketYear))?.marketYear.slice(0,4));
    if(!Number.isInteger(year) || year<2020 || year>2100) return input;
    const previous=await this.previousForYear(year);
    if(!previous) return input;
    return {
      ...input,
      origins:input.origins.map(origin=>{
        const trend=verifiedExportTrend(origin,previous.prior[origin.originKey]);
        return {...origin,
          sourcingInsight:trend?.text||'',
          // Inline Wheat-only label. Never rewrite the verified `exports` field,
          // which the risk classifier parses as a numeric official forecast.
          exportComparison:trend?.display,
          exportComparisonBasis:trend?.basis,
          exportYoYPct:trend?.pct,
        };
      }),
    };
  }
}
export const wheatOriginSupplyTrendService = new WheatOriginSupplyTrendService();
