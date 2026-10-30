/** Presentation contract, applied AFTER evidence validation too. No fact approval. */
export const ANALYSIS_BRIEF_STYLE='procurement-brief-v1';
export const BRIEF_LAYOUT={recommendationMax:40,factorMax:70,firstParagraph:[300,540],secondParagraph:[80,180]} as const;
const length=(value:string)=>Array.from(value.trim()).length;
export function briefPresentationIssues(data:any):string[]{
 const issues:string[]=[];
 if(typeof data?.deskRecommendation!=='string'||!data.deskRecommendation.trim()||length(data.deskRecommendation)>40)issues.push('brief-desk-recommendation:1-40-characters');
 const paragraphs=typeof data?.executiveSummary==='string'?data.executiveSummary.trim().split(/\n\s*\n/):[];
 if(paragraphs.length!==2)issues.push('brief-market-outlook:exactly-two-paragraphs');
 else for(const [i,[min,max]]of [BRIEF_LAYOUT.firstParagraph,BRIEF_LAYOUT.secondParagraph].entries()){
  if(length(paragraphs[i])<min||length(paragraphs[i])>max)issues.push('brief-paragraph-'+(i+1)+':'+min+'-'+max+'-characters');
  if(/\n/.test(paragraphs[i]))issues.push('brief-artificial-line-breaks');
 }
 for(const name of ['bullishFactors','bearishFactors','watchItems']){
  const list=data?.[name];
  if(!Array.isArray(list)||list.length<1||list.length>3||list.some((s:any)=>typeof s!=='string'||!s.trim()||length(s)>70||/요인\s*없음|해당\s*없음|자료\s*없음|N\/A|placeholder/i.test(s)))issues.push('brief-'+name+':1-3-supported-items-max-70');
 }
 const prose=[data?.deskRecommendation,data?.executiveSummary,...['bullishFactors','bearishFactors','watchItems'].flatMap(k=>Array.isArray(data?.[k])?data[k]:[])].filter(s=>typeof s==='string').join(' ');
 if(/원문 인용:|https?:\/\/|publisher-[a-f0-9]|recordSha256|evidenceIds|\b(?:USDA|Reuters|Fastmarkets|ChemAnalyst)\b/i.test(prose))issues.push('brief-visible-evidence-metadata');
 if(/20\d{2}[-년/]\s*\d{1,2}|[\d.,]+\s*(?:USD|MYR|달러|톤|%)/i.test(data?.deskRecommendation||''))issues.push('brief-desk-metadata');
 if(paragraphs.some(p=>(p.match(/[가-힣]/g)||[]).length<length(p)*0.35))issues.push('brief-outlook-must-be-korean');
 if((paragraphs[0]?.match(/연간 전망치입니다/g)||[]).length>1)issues.push('brief-repetitive-classification-filler');
 if((paragraphs[0]?.match(/향후[^.!?]*(?:경우|되면|된다면)[^.!?]*선물[^.!?]*압력/g)||[]).length>2)issues.push('brief-repetitive-scenario-filler');
 return [...new Set(issues)];
}
