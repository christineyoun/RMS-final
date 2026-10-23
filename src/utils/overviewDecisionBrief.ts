/** Reviewed section selection. Each excerpt must still exist in the effective
 * published field. No inferred cross-commodity cause or generated forecast. */
import selections from '../data/overview_brief_selection.json';
export const BRIEF_SECTIONS=['오늘의 시장 판단','전일 대비 주요 변화','구매 기회','공급 위험','다음 판단을 바꿀 변수'];
export function decisionBrief(analyses:any[]){
 const fragments:any[]=[];
 const section=(key:string,limit:number)=>selections.entries.filter(e=>e.section===key).flatMap(e=>{
  const a=analyses.find(a=>a.id===e.commodity);const value=a?.[e.field];
  if(!a||a.deskRecommendation!==e.deskRecommendation||!(Array.isArray(value)?value.includes(e.excerpt):String(value||'').includes(e.excerpt)))return[];
  fragments.push({commodity:e.commodity,field:e.field,excerpt:e.excerpt,generatedAt:a.generatedAt});return[e.text];
 }).slice(0,limit);
 const conclusion=section('오늘의 시장 판단',2);
 // A new effective publication is visible immediately; its own opening is used
 // without assigning an unreviewed opportunity/risk interpretation.
 const unreviewed=analyses.find(a=>!selections.entries.some(e=>e.commodity===a.id&&e.field==='executiveSummary'&&e.deskRecommendation===a.deskRecommendation&&String(a.executiveSummary).includes(e.excerpt)));
 if(unreviewed){const text=String(unreviewed.executiveSummary).split(/(?<=다\.)\s+|\n+/u)[0];conclusion.unshift(text);conclusion.splice(2);fragments.push({commodity:unreviewed.id,field:'executiveSummary',excerpt:text,generatedAt:unreviewed.generatedAt});}
 const sections=[conclusion.join(' '),['전일 비교 데이터 없음'],section('구매 기회',2),section('공급 위험',2),section('다음 판단을 바꿀 변수',3)];
 return {text:BRIEF_SECTIONS.map((k,i)=>`[${k}] ${sections[i].length?Array.isArray(sections[i])?(sections[i] as string[]).join('\n'):sections[i]:'공개된 근거에서 선정할 항목 없음'}`).join('\n\n'),fragments};
}
