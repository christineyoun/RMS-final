/** Render only a sourced STEP7 Gemini-authored procurement risk in local RMS. */
import type {AiProcurementRisk,EvidenceSource} from './step7-core.ts';
const safePublisherOriginal=(raw:string|null|undefined)=>{
 if(!raw)return false;
 try {const u=new URL(raw),h=u.hostname.toLowerCase();return u.protocol==='https:'&&!u.username&&!u.password&&
   !u.port&&h.includes('.')&&!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h)&&
   !/(^|\.)(?:local|internal|test|example)$/.test(h)&&
   h!=='vertexaisearch.cloud.google.com'&&u.pathname!=='/';}catch{return false;}
};

export type PreviewAiRisk={
 commodityId:string;level:'안정'|'주의'|'경계'|'판정 보류';summarySentenceKo:string;
 evidence:Array<{text:string;date:string;url:string;source:string}>;
 unavailable:string;criteria:string;
};
export function assessStep7AiRisk(commodity:string,risk:AiProcurementRisk|undefined,
  sources:EvidenceSource[]):{risk:PreviewAiRisk|null;warning:string|null}{
 if(!risk)return {risk:null,warning:null}; // Old STEP7 saves are still valid.
 if(!['안정','주의','경계','판정 보류'].includes(risk.level)||
   typeof risk.summary!=='string'||![...risk.summary.trim()].length||
   [...risk.summary.trim()].length>120||!Array.isArray(risk.sourceIds)||
   !risk.sourceIds.every(id=>typeof id==='string'))return {risk:null,warning:'AI 조달 리스크 필드 형식 오류'};
 const ids=[...new Set(risk.sourceIds)];
 const known=new Map(sources.map(x=>[x.id,x]));
 if(ids.some(id=>!known.has(id)||known.get(id)?.grade==='EXCLUDED'))
   return {risk:null,warning:'AI 조달 리스크의 출처 ID 불일치'};
 const supported=ids.map(id=>known.get(id)!).filter(s=>s.grade==='A'&&
   safePublisherOriginal(s.url)&&Array.isArray(s.excerpts)&&s.excerpts.length>0);
 // No level upgrade from unverified B-only citations or price movement alone.
 if(risk.level!=='판정 보류'&&!supported.length)
   return {risk:null,warning:'AI 조달 리스크를 뒷받침할 열람 가능한 A등급 원문 없음'};
 if(risk.level==='판정 보류'&&!ids.length){
   return {risk:{commodityId:commodity,level:risk.level,summarySentenceKo:risk.summary.trim(),
     evidence:[],unavailable:'확인되지 않은 공급 데이터',criteria:'STEP7 동일 호출에서 생성된 공급 리스크 의견. 근거 부족으로 판정 보류.'},warning:null};
 }
 const evidence=supported.map(s=>({text:s.excerpts[0]?.text||'',date:s.date||'발행일 미확인',
   url:s.url!,source:s.title||new URL(s.url!).hostname}));
 return {risk:{commodityId:commodity,level:risk.level,summarySentenceKo:risk.summary.trim(),
   evidence,unavailable:'완제품 가용량·납기 등 미확인 자료',
   criteria:'STEP7 Gemini의 공급 리스크 판단. 원문 열람 가능 자료 연결을 확인했으며 기존 상위 SCM 경계를 덮어쓰지 않습니다.'},warning:null};
}
