/** Saved-only adapters for the existing scheduled evidence packet. No collection. */
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {load} from 'cheerio';
import {validateSavedCornHistory} from './savedGraphHistory.ts';import {isValidPricePoint} from './wheatPriceHistoryStore.ts';
import {readVerifiedWheatNews} from './wheatSavedVerifiedNews.ts';import {readVerifiedCornNews} from './cornSavedVerifiedNews.ts';
import type {AnalysisEvidence} from './analysisEvidence.ts';import {validAnalysisFact} from './analysisEvidence.ts';
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
export function savedCerealEvidence(id:string,root:string,now:Date):AnalysisEvidence{
 const evidence:AnalysisEvidence={commodity:id,facts:[],failures:[]};if(!['wheat','corn'].includes(id))return evidence;
 try{
  if(id==='wheat'){
   const saved=JSON.parse(fs.readFileSync(path.join(root,'.rms-price-history/wheat.json'),'utf8'));
   const points=saved.points.filter((p:any)=>p.provenance==='source-verified'&&isValidPricePoint(p)&&p.sourceUrl?.endsWith('/PR-'+p.date.slice(2).replaceAll('-','')+'.pdf')&&/^https:\/\/uswheat\.org\/wp-content\/uploads\/20\d{2}\/\d{2}\/PR-\d{6}\.pdf$/.test(p.sourceUrl||'')).slice(-2);
   for(const p of points)evidence.facts.push({id:'wheat-srw-'+p.date,commodity:id,topic:'소맥 SRW',text:`U.S. Wheat Associates ${p.date} 가격 보고서: SRW ${p.contractMonth} 선물 관측 ${p.srwMt} USD/MT. HRW/HRS 및 한국 도착가와 구분합니다.`,sourceUrl:p.sourceUrl,sourceTitle:'U.S. Wheat Associates · SRW',observedAt:p.date,verifiedAt:saved.lastVerifiedAt,verification:'original-record',recordSha256:sha(JSON.stringify(p)),measure:{metric:'price',scope:'USW-weekly-SRW-contract:'+p.contractMonth,benchmark:'USW:SRW',unit:'USD/MT',value:p.srwMt,valueKind:'actual'}});
  }else{
   const saved=validateSavedCornHistory(JSON.parse(fs.readFileSync(path.join(root,'.rms-price-history/corn.json'),'utf8')).payload);
   for(const p of saved.data.slice(-2))evidence.facts.push({id:'corn-zc-'+p.date,commodity:id,topic:'옥수수',text:`Yahoo Finance ${p.date} CBOT ZC=F 옥수수 일봉 ${p.quoteValue??p.centsPerBushel} US¢/bu, ${p.usdPerMT} USD/MT. ${p.isProvisional?'잠정 일봉':'일봉 관측'}이며 공식 정산·롤오버·실제 현물 도착 원가를 입증하지 않습니다.`,sourceUrl:'https://query1.finance.yahoo.com/v8/finance/chart/ZC%3DF?interval=1d&range=5y',sourceTitle:'Yahoo Finance · CBOT ZC=F',observedAt:p.date,verifiedAt:saved.fetchedAt,verification:'original-record',recordSha256:sha(JSON.stringify(p)),measure:{metric:'price',scope:'Yahoo-generic-futures-daily-bar-not-verified-settlement',benchmark:'CBOT:ZC=F',unit:'USD/MT',value:p.usdPerMT,valueKind:'actual'}});
  }
 }catch{evidence.failures.push('Verified saved cereal price unavailable');}
 // Reviewed Korean wording is bound to original HTML AND the immutable review
 // hash. Arbitrary model prose cannot become canonical evidence through this path.
 const retained=id==='wheat'?readVerifiedWheatNews(root):readVerifiedCornNews(root);
 let reviews:any[]=[];try{reviews=JSON.parse(fs.readFileSync(path.join(root,'src/data/news_procurement_reviews.json'),'utf8')).reviews?.[id]||[];}catch{}
 for(const a of retained){
  const review=reviews.find(r=>r.url===a.originalUrl&&r.publishedAt===a.publishedAt&&r.decision==='retain'&&r.sourceSummarySha256===sha(a.summary));if(!review)continue;
  try{const receipt=JSON.parse(fs.readFileSync(path.join(root,a.receipt),'utf8'));const $=load(receipt.html);$('script,style,nav,footer,header').remove();const quote=$('body').text().replace(/\s+/g,' ').trim();
   evidence.facts.push({id:'article-'+id+'-'+sha(a.originalUrl).slice(0,12),commodity:id,topic:id==='wheat'?'소맥':'옥수수',text:`${a.publishedAt} ${a.sourceName} 원문 검증 보도: ${review.summary||a.summary}`,sourceUrl:a.originalUrl,sourceTitle:a.sourceHeadline,observedAt:a.publishedAt,verifiedAt:receipt.verifiedAt,verification:'original-record',recordSha256:sha(JSON.stringify({receipt:a.receiptSha256,review,summary:a.summary})),referenceContext:{receiptSha256:a.receiptSha256,quote}});
  }catch{evidence.failures.push('Missing reviewed article original receipt');}
 }
 evidence.facts=evidence.facts.filter(f=>validAnalysisFact(f,id,now));return evidence;
}
