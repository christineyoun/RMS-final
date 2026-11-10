/** SECOND Google follow-up: mirror STEP5 publisher grading, without Gemini. */
import fs from 'node:fs';
import path from 'node:path';
import {loadStep6Context} from './step6-core.ts';
import {readNewSource} from './step5-originals.ts';
import {reconcilePublishers} from './step5-round1-merge.ts';
import {buildEvidenceReview} from './step3-evidence.ts';
import type {SourceCandidate,GradeRecord} from './source-grade.ts';
import {commodityFromArgv,assertSnapshotCommodity} from './commodity-config.ts';
const c=loadStep6Context();
if(c.route==='step7-final')console.log('[STEP 6 VERIFY] SKIPPED: STEP5 decision STOP → STEP7, no request.');
else if(c.route!=='step6-search')throw Error('STEP5 decision is not SEARCH. Do not verify a nonexistent round 2.');
else{
  const names=fs.readdirSync(c.dir).filter(f=>/^step6-round2-search-.*\.json$/.test(f)).sort();
  const name=names.at(-1);if(!name)throw Error('No successful STEP6 search JSON; cannot verify originals.');
  if(fs.readdirSync(c.dir).some(f=>/^step6-round2-graded-.*\.json$/.test(f))&&!process.argv.includes('--force-new'))
    throw Error('STEP6 original verification already completed. Do not repeat accidentally.');
  const source=JSON.parse(fs.readFileSync(path.join(c.dir,name),'utf8'));
  assertSnapshotCommodity(source,commodityFromArgv(),'6-search');
  if(source.stage!=='additional-google-discovery-round2'||source.round!==2||source.status!=='google-citations-found'
    ||source.decisionFile!==c.decisionFile||!Array.isArray(source.grounding?.sources)||!source.grounding.sources.length)
    throw Error('Round-2 file is not a valid Google-cited result for this decision.');
  const candidates:SourceCandidate[]=source.grounding.sources.map((x:any,i:number)=>({index:200+i,title:x.title,uri:x.uri}));
  const records:GradeRecord[]=[];
  console.log(`[STEP 6 VERIFY] ${candidates.length} Google-cited sources; 0 Gemini calls.`);
  for(let i=0;i<candidates.length;i++){
    const x=await readNewSource(candidates[i],undefined,undefined,commodityFromArgv());records.push(x);
    console.log(`[${i+1}/${candidates.length}] ${x.grade} — ${x.reason} — ${x.publisherHost||candidates[i].title} ${x.httpStatus||''}`);
  }
  const duplicates=reconcilePublishers(c.priorInventory!,records),review=buildEvidenceReview(records,commodityFromArgv());
  const newExcerpts=review.reduce((n,x)=>n+x.evidence.length,0);
  const now=new Date().toISOString(),stamp=now.replace(/[:.]/g,'-');
  const output={recordedAt:now,stage:'additional-google-original-verification-round2',round:2,
    commodity:c.context!.commodity,sourceFile:name,decisionFile:c.decisionFile,
    inputFiles:c.inputFiles,priorSourceCount:c.priorInventory!.length,
    summary:{...duplicates.summary,newAExcerptCandidates:newExcerpts},records,
    duplicateAssessments:duplicates.records,review,
    protection:{previousFilesOverwritten:false,allPreviousSourcesPreserved:true,
      BRetained:true,geminiApiCalls:0,noThirdSearch:true,rmsAndCloudRunUntouched:true}};
  const json=path.join(c.dir,`step6-round2-graded-${stamp}.json`);
  const md=path.join(c.dir,`step6-round2-review-${stamp}.md`);
  fs.writeFileSync(json,JSON.stringify(output,null,2),{flag:'wx',mode:0o600});
  const lines=['# STEP 6 — 2차 추가 검색 원문 검증','',
    `대상 품목: ${output.commodity} / 검색 결과: ${name}`,
    `이전 출처: ${c.priorInventory!.length}건 보존 / 신규 인용: ${records.length}건`,
    `신규 A ${output.summary.A} / B ${output.summary.B} / 제외 ${output.summary.EXCLUDED}`,
    `신규 발췌 후보: ${newExcerpts}개 (수치 독립 검증 아님)`,
    `기존 원문 중복: ${output.summary.oldPublisherMatches}건 / 신규 내 중복: ${output.summary.repeatedNewPublisherPages}건`,
    '', '| ID | 등급 | 원문 주소 | 중복 여부 |','|---|---|---|---|'];
  for(let i=0;i<review.length;i++)lines.push(`| ${review[i].id} | ${review[i].grade} | ${review[i].publisherUrl||'미확인'} | ${duplicates.records[i].overlap} |`);
  lines.push('','## A등급 원문 발췌 (검증 후보)','');
  for(const x of review.filter(x=>x.grade==='A')){
    lines.push(`### ${x.id} — ${x.googleTitle}`);
    for(const e of x.evidence)lines.push(`- ${e.id} [${e.theme}] ${e.exactExcerpt.slice(0,250).replace(/\n/g,' ')}`);
    lines.push('');
  }
  lines.push('## B등급 보존','');
  for(const x of review.filter(x=>x.grade==='B'))lines.push(`- ${x.id}: ${x.reason} — ${x.googleCitationUrl}`);
  lines.push('','다음 단계는 STEP 7 최종 시장전망·구매전략이며, 3차 추가 검색은 수행하지 않습니다.');
  fs.writeFileSync(md,lines.join('\n'),{flag:'wx',mode:0o600});
  console.log('[STEP 6 VERIFY] Counts:',JSON.stringify(output.summary));
  console.log('[STEP 6 VERIFY] Saved JSON:',json);
  console.log('[STEP 6 VERIFY] Saved review:',md);
}
