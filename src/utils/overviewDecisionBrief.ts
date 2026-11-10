/** Deterministic, source-exact excerpts from already approved STEP7 reports.
 * Overview does not run Gemini, infer market changes or invent procurement advice. */
export const BRIEF_SECTIONS=['오늘의 시장 판단','전일 대비 주요 변화','구매 기회','공급 위험','다음 판단을 바꿀 변수'];
type Fragment={commodity:string;field:string;excerpt:string;generatedAt:string};
type Input={id:string;generatedAt:string;name?:string;group?:string;[key:string]:any};
const firstSentence=(value:unknown)=>String(value||'').split(/(?<=다\.)\s+|\n+/u).map(v=>v.trim()).find(Boolean)||'';
const known=(a:Input)=>a?.id&&a?.generatedAt&&Number.isFinite(Date.parse(a.generatedAt));
const group=(a:Input)=>String(a.group||a.id);
const display=(a:Input)=>String(a.name||a.id);
function balanced<T extends Input>(items:T[],limit:number):T[]{
 const picked:T[]=[],groups=new Set<string>();
 for(const a of items){if(picked.length===limit)break;if(groups.has(group(a)))continue;groups.add(group(a));picked.push(a);}
 for(const a of items){if(picked.length===limit)break;if(!picked.includes(a))picked.push(a);}
 return picked;
}
export function decisionBrief(analyses:Input[]){
 const fragments:Fragment[]=[];
 const ranked=analyses.filter(known).sort((a,b)=>String(b.generatedAt).localeCompare(String(a.generatedAt))||a.id.localeCompare(b.id));
 const source=(a:Input,field:string,value:string)=>{
   fragments.push({commodity:a.id,field,excerpt:value,generatedAt:a.generatedAt});
   return `${display(a)}: ${value}`;
 };
 const available=(field:string)=>ranked.filter(a=>{
   const values=Array.isArray(a[field])?a[field]:[a[field]];
   return values.some(v=>firstSentence(v));
 });
 const market=balanced(available('executiveSummary'),4);
 const marketIds=new Set(market.map(a=>a.id));
 // With eight valid inputs, the two central sections include all eight crops.
 // With fewer inputs, reusing an approved recommendation is better than fabricating one.
 const remaining=available('deskRecommendation').filter(a=>!marketIds.has(a.id));
 const procurement=balanced(remaining,4);
 if(procurement.length<4){
   for(const a of balanced(available('deskRecommendation'),4)){
     if(procurement.length>=4)break;
     if(!procurement.includes(a))procurement.push(a);
   }
 }
 const risk=ranked.filter(a=>{
   const x=a.procurementRiskPreview;
   return ['주의','경계'].includes(x?.level)&&typeof x.summarySentenceKo==='string'&&!!x.summarySentenceKo.trim()&&
     Array.isArray(x.evidence)&&x.evidence.some((e:any)=>typeof e?.url==='string'&&e.url.startsWith('https://'));
 }).sort((a,b)=>Number(b.procurementRiskPreview.level==='경계')-Number(a.procurementRiskPreview.level==='경계')||b.generatedAt.localeCompare(a.generatedAt));
 const riskSelection=balanced(risk,3);
 const watch=balanced(available('watchItems'),3);
 const sections=[
   market.map(a=>source(a,'executiveSummary',firstSentence(a.executiveSummary))),
   ['전일 비교 데이터 없음'],
   procurement.map(a=>source(a,'deskRecommendation',firstSentence(a.deskRecommendation))),
   riskSelection.map(a=>source(a,'procurementRiskPreview.summarySentenceKo',a.procurementRiskPreview.summarySentenceKo.trim())),
   watch.map(a=>source(a,'watchItems',(Array.isArray(a.watchItems)?a.watchItems:[]).map(firstSentence).find(Boolean)||''))
 ];
 const text=BRIEF_SECTIONS.map((heading,i)=>`[${heading}] ${sections[i].length?sections[i].join('\n'):'공개된 근거에서 선정할 항목 없음'}`).join('\n\n');
 return {text,fragments};
}
