/** Same RMS component used by the complete dashboard. Extract actual displayed
 * fields so editorial/formatting changes cannot escape source validation. */
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {load} from 'cheerio';
import AiRecommendation from '../components/AiRecommendation.tsx';
import {validateComposedRenderedText,composeEvidenceFirstReport} from './evidenceFirstReport.ts';
export function renderedEvidenceReport(composed:Extract<ReturnType<typeof composeEvidenceFirstReport>,{status:'composed'}>){
 const r=composed.report,id=(r.evidenceAudit.facts as any[])[0].commodity;
 const html=renderToStaticMarkup(<AiRecommendation commodityId={id} recommendedCoverage={r.deskRecommendation} executiveSummary={r.executiveSummary} bullishFactors={r.bullishFactors} bearishFactors={r.bearishFactors} watchItems={r.watchItems} researchSources={r.sources} researchStatus="cached" researchGeneratedAt={r.generatedAt} researchEvidenceDates={(r.evidenceAudit.facts as any[]).map(f=>f.observedAt)}/>);
 const $=load(html),items=(label:string)=>$('h3').filter((_i,e)=>$(e).text().includes(label)).parent().parent().find('li').map((_i,e)=>$(e).text().trim()).get();
 const displayed={deskRecommendation:$('span').filter((_i,e)=>$(e).text()==='데스크 권고:').next().text(),executiveSummary:$('p.whitespace-pre-line').text(),bullishFactors:items('상승 요인'),bearishFactors:items('하락 요인'),watchItems:items('모니터링 항목')};
 validateComposedRenderedText(composed,displayed);return displayed;
}
