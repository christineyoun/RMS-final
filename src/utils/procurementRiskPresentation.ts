import type {ProcurementRisk} from './procurementRisk';

// Display-only editing of selected evidence. Dates, full excerpts and provenance
// stay in the assessment; no classification or source selection is performed.
const sentences=(text:string)=>text.trim().split(/(?<=[.!?])\s+/u).filter(Boolean);
const clean=(text:string)=>text
  .replace(/\s*\(\s*\d{4}-\d{2}-\d{2}\s*\)/g,'')
  .replace(/^USDA ERS의 \d+월(?:\s*\d+일)?\s*(?:업데이트는|보고서는|전망은)\s*/,'USDA ERS는 ')
  .replace(/^Fastmarkets가 인용한\s*/,'')
  .replace(/^The Edge가 인용한 MPOB 발표에서\s*/,'')
  .replace(/^iGrain India는 USDA FAS 방콕 사무소 전망을 인용해\s*/,'')
  .replace(/^인용된\s*/,'')
  .replace(/의 \d+월 \d+일 자료상\s*/,' 자료상 ')
  .replace(/^ChemAnalyst는\s*/,'')
  .replace(/감소할 것으로 보도했습니다\.$/,'감소할 것으로 전망됐습니다.')
  .replace(/변수라고 평가했습니다\.$/,'변수라는 평가입니다.')
  .trim();

export function procurementRiskDisplayText(risk:ProcurementRisk):string {
  if(risk.level==='판정 보류'||!risk.evidence.length)return clean(risk.summarySentenceKo);
  const excerpts=risk.evidence.slice(0,2).map((e,index)=>{
    const parts=sentences(e.text);
    let selected=parts[0];
    if(risk.level==='경계')return clean(parts.find(s=>/수출 금지|수출 중단|선적 중단|출하 중단|가동 중단/.test(s))||selected);
    // Context adapters sometimes retain an opening sentence before the actual
    // regional constraint. Keep the constraint rather than a repeated headline.
    if(index===0&&risk.commodityId==='corn')selected=parts.find(s=>/(?:EU|유럽).*생산/.test(s))||selected;
    if(risk.commodityId==='soybean'){
      const local=parts.find(s=>/^일부 북부/.test(s));
      if(local){const region=/브라질\s+([^\s]+)의/.exec(e.text);selected=region?`브라질 ${region[1]}에서는 ${local}`:parts.join(' ');}
    }
    if(index===0&&risk.commodityId==='tapioca-starch')selected=parts.find(s=>/공장.*가동률/.test(s))||selected;
    if(index===1&&risk.commodityId==='tapioca-starch'&&parts.length>1&&/^직전 공표일/.test(parts[1]))
      selected=parts[0].replace(/입니다\.$/,'이며, ')+parts[1];
    return clean(selected);
  });
  return excerpts.join(' ');
}
