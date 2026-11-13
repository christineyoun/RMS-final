import {formalAiText} from '../utils/aiReportPresentation';
import React from 'react';
import {TrendingUp, TriangleAlert, Clock3} from 'lucide-react';
import {BRIEF_SECTIONS}from'../utils/overviewDecisionBrief';
interface AiMarketBriefProps {aiBriefText?:string;}
const hiddenSection = '전일 대비 주요 변화';
export const DEFAULT_BRIEF=BRIEF_SECTIONS.filter(label=>label!==hiddenSection)
 .map(label=>`[${label}] 공개된 분석을 불러오는 중입니다.`).join('\n\n');
export const renderBriefText=(text:string)=>BRIEF_SECTIONS.map((label,index)=>{
 if(label===hiddenSection)return null;
 const key='['+label+']',start=text.indexOf(key);if(start<0)return null;
 // Still treat the hidden heading as a boundary in previously saved briefs.
 const next=BRIEF_SECTIONS.slice(index+1).map(heading=>text.indexOf('['+heading+']',start+key.length))
  .filter(offset=>offset>=0).sort((a,b)=>a-b)[0]??-1;
 const lines=text.slice(start+key.length,next<0?text.length:next).trim().split('\n').filter(Boolean);
 const Icon=[null,null,TrendingUp,TriangleAlert,Clock3][index];
 return <section key={key} data-brief-section={label} className={'min-w-0 '+(index>0?'border-t border-[#E2E8F0] pt-3':'col-span-full')}>
  <h3 className={'flex items-center gap-1.5 text-[#0F172A] mb-1 '+(index===0?'text-sm font-bold':'text-[13px] font-semibold')}>
   {Icon&&<Icon size={13} strokeWidth={2.25} aria-hidden="true" className="shrink-0 text-[#0F172A]"/>}{label}
  </h3>
  <div className="space-y-1.5">{lines.map((line,i)=>{
   const commodity=line.match(/^(타피오카전분|감자전분|대두유|옥수수|팜유|대두|원당|설탕|밀)(?::\s*|(?:은|는)\s+)/);
   return <p key={i} className={'text-[12.5px] leading-[1.6] break-keep font-normal '+(['공개된 분석을 불러오는 중입니다.','공개된 근거에서 선정할 항목 없음'].includes(line)?'text-slate-500':index>=2?'text-[#0F172A]':'')}>
    {commodity?<><span className="font-semibold">{commodity[1]==='설탕'?'원당':commodity[1]}:</span>{' '}<span className="font-normal">{formalAiText(line.slice(commodity[0].length))}</span></>:formalAiText(line)}
   </p>;
  })}</div>
 </section>;
});
export default function AiMarketBrief({aiBriefText}:AiMarketBriefProps){return <div className="flex flex-col gap-3 min-h-[140px] pdf-section-card break-inside-avoid print:break-inside-avoid">
 <div className="flex items-center gap-1.5 min-w-0"><span className="material-symbols-outlined text-[20px] text-[#DF0029] shrink-0">auto_awesome</span><h2 className="text-sm text-[#111827] font-bold break-keep">AI 시장 브리프 (AI Market Brief)</h2></div>
 <div id="ai-synthesis-text" className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 my-2 space-y-3 text-sm text-[#334155] leading-relaxed">{renderBriefText(aiBriefText||DEFAULT_BRIEF)}</div>
 </div>;}
