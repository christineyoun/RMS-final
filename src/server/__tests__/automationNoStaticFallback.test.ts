import assert from 'node:assert/strict';
import test from 'node:test';
import {decisionBrief} from '../../utils/overviewDecisionBrief.ts';
import {loadOverviewIntelligence} from '../../utils/overviewIntelligence.ts';

test('Overview brief derives every section from effective fields, not dated manual selections',()=>{
 const a={id:'sugar',generatedAt:'2030-03-04T09:00:00Z',executiveSummary:'검증된 최신 공급 동향입니다.',deskRecommendation:'신규 확인 후 판단',bearishFactors:['물량 부족 우려'],watchItems:['다음 보고서 확인']};
 const r=decisionBrief([a]);
 assert.match(r.text,/검증된 최신 공급 동향/);
 assert.match(r.text,/신규 확인 후 판단/);
 assert.match(r.text,/\[공급 위험\] 공개된 근거에서 선정할 항목 없음/);
 assert.match(r.text,/다음 보고서 확인/);
 assert.equal(r.fragments.length,3);
 for(const f of r.fragments){assert.equal(f.commodity,a.id);assert(String((a as any)[f.field]).includes(f.excerpt));}
});

test('Unavailable live analysis cannot silently resurrect free bundle historical analysis',async()=>{
 const oldDate='2025-09-01';
 const urls:string[]=[];
 const fetcher=async(input:RequestInfo|URL)=>{
  const url=String(input);urls.push(url);
  const value=url==='/api/rms/free-publication'?{version:1,data:{inputs:[{id:'wheat',analysis:{generatedAt:oldDate,executiveSummary:'OLD SAVED ANALYSIS',deskRecommendation:'OLD BUY NOW'},articles:[]}]}}:
   url.startsWith('/api/market-intelligence')?{success:false}:
   url.startsWith('/api/ai-analysis/')?{success:false}:
   {message:'전일 비교 데이터 없음'};
  return new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
 };
 const overview=await loadOverviewIntelligence(fetcher as typeof fetch);
 assert.equal(overview.analyses.length,0);
 assert.equal(overview.directives.length,0);
 assert(!overview.brief.includes('OLD BUY NOW'));
 assert(!urls.includes('/api/rms/free-publication'));
});
