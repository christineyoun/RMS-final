/** STEP5 round1: verify NEW Google-grounded publisher URLs, grade A/B and mark canonical duplicates.
 * Existing STEP1–4 sources, findings, and originals remain untouched. NO Gemini API requests.
 */
import fs from 'node:fs';
import path from 'node:path';
import {readNewSource} from './step5-originals.ts';
import {buildEvidenceReview} from './step3-evidence.ts';
import {reconcilePublishers,validateStep5Round1} from './step5-round1-merge.ts';
import type {SourceCandidate,GradeRecord} from './source-grade.ts';
import {commodityFromArgv,resultFolder,assertSnapshotCommodity} from './commodity-config.ts';

const commodity=commodityFromArgv();
const dir=resultFolder(commodity);
if(!fs.existsSync(dir))throw Error('No .rms-soybean-rebuild directory.');
const files=fs.readdirSync(dir);
const sourceFile=files.filter(s=>/^step5-round1-search-.*\.json$/.test(s)).sort().at(-1);
if(!sourceFile)throw Error('No STEP5 round-1 search file (step5-round1-search-*.json).');
const oldResults=files.filter(s=>/^step5-round1-graded-.*\.json$/.test(s));
if(oldResults.length&&!process.argv.includes('--force-new'))throw Error('STEP5 source verification already performed. Existing result preserved; do not repeat accidentally.');
const raw=JSON.parse(fs.readFileSync(path.join(dir,sourceFile),'utf8'));
validateStep5Round1(raw,commodity);
assertSnapshotCommodity(raw,commodity,'5-search');
const oldSources=raw.priorSnapshot.originalInventory; // Immutable snapshot saved by step5-search.
const candidates:SourceCandidate[]=raw.grounding.sources.map((s:any,i:number)=>({index:100+i,title:s.title,uri:s.uri}));
console.log(`[STEP5 verify] ${candidates.length} Google-cited links; original publisher verification. Gemini API calls: 0.`);
console.log('[STEP5 verify] Input:',sourceFile);
console.log('[STEP5 verify] Prior source records preserved:',oldSources.length);
const records:GradeRecord[]=[];
for(let i=0;i<candidates.length;i++){
  const record=await readNewSource(candidates[i],undefined,undefined,commodity);
  records.push(record);
  console.log(`[${i+1}/${candidates.length}] ${record.grade} — ${record.reason} — ${record.publisherHost||candidates[i].title} ${record.httpStatus??''}`);
}
const reconciliation=reconcilePublishers(oldSources,records);
const review=buildEvidenceReview(records,commodity);
const newExcerpts=review.reduce((sum,x)=>sum+x.evidence.length,0);
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const jsonName=`step5-round1-graded-${stamp}.json`;
const mdName=`step5-round1-review-${stamp}.md`;
const output={recordedAt:new Date().toISOString(),commodity,stage:'additional-google-original-verification-round1',round:1,
  inputSearchFile:sourceFile,priorSourceCount:oldSources.length,priorInventory:structuredClone(oldSources),
  summary:{...reconciliation.summary,newAExcerptCandidates:newExcerpts},records,duplicateAssessments:reconciliation.records,review,
  safeguards:{geminiApiCalls:0,priorOriginalsOverwritten:false,priorBArchived:true,secondRoundRun:false,marketForecastGenerated:false,
    duplicateEntriesDeleted:false},
  note:'New A means readable commodity-related original, not complete independent validation of numerical claims. B retained. Similar domains alone do not prove duplicate pages.'};
const md:string[]=[
  `# ${commodity} STEP 5 — 1차 추가 검색 원문 확인`,'',
  `입력: ${sourceFile}`,
  `기존 출처 ${oldSources.length}건 보존 / 신규 Google 인용 ${records.length}건`,
  `신규 등급: A ${reconciliation.summary.A}건 / B ${reconciliation.summary.B}건 / 제외 ${reconciliation.summary.EXCLUDED}건`,
  `발행사 원문 기준 새로운 문서 ${reconciliation.summary.newPublisherDistinct}건 / 기존 문서와 중복 ${reconciliation.summary.oldPublisherMatches}건 / 이번 검색 내부 중복 ${reconciliation.summary.repeatedNewPublisherPages}건 / 원문 URL 미확인 ${reconciliation.summary.unresolvedPublisherRecords}건`,
  `A 원문 발췌 후보 ${newExcerpts}개 (내용·수치 검증 전)`,
  '', '**주의:** Google 인용 14개가 새로운 독립 자료 14개라는 뜻은 아닙니다. 원문을 확인할 수 없거나 서로 같은 페이지인 자료도 기록과 인용 근거를 보존합니다.',
  '', '## 원문 확인 및 중복 점검','',
  '| ID | A/B | 기관·출처 | 원문 날짜 | 중복 판정 | 발행사 원문 URL |','|---|---|---|---|---|---|',
];
const safe=(v:unknown)=>String(v??'').replace(/\|/g,'\\|').replace(/[\r\n]+/g,' ').slice(0,200);
for(let i=0;i<review.length;i++){
  const r=review[i],d=reconciliation.records[i];
  md.push(`| ${r.id} | ${r.grade} (${r.reason}) | ${safe(r.googleTitle)} | ${r.publishedAt||'미확인'} | ${d.overlap}${d.duplicateOf?' ('+d.duplicateOf+')':''} | ${r.publisherUrl||'미확인'} |`);
}
md.push('','## A등급 신규 원문 발췌 후보','');
for(let i=0;i<review.length;i++){
  const r=review[i],d=reconciliation.records[i];
  if(r.grade!=='A')continue;
  md.push(`### ${r.id} — ${safe(r.googleTitle)} (${d.overlap})`);
  if(r.warnings.length)md.push(...r.warnings.map(x=>`- 주의: ${x}`));
  if(!r.evidence.length)md.push('- 원문 발췌 없음: 내용 재확인 필요');
  else for(const e of r.evidence)md.push(`- **${e.id} [${e.theme}]** ${safe(e.exactExcerpt).slice(0,200)}`);
  md.push('');
}
md.push('## B등급 자료 보존','');
for(const r of review.filter(x=>x.grade==='B'))md.push(`- ${r.id} — ${safe(r.googleTitle)}: ${r.reason}, ${r.eligibility} / ${r.googleCitationUrl}`);
md.push('','## 다음 검토','',
  '- 새 자료가 기존 조사 공백(수급·가격·무역·기상 등)을 실제로 보완하는지 확인.',
  '- 원문이 없는 B는 Google 인용 범위를 넘어 수치나 사실을 확정하지 않음.',
  '- 기존 STEP1~4 자료와 B등급 기록 유지. 두 번째 Google 검색과 Gemini 분석은 아직 실행하지 않음.','');
// Write new files only; never change old search or earlier results.
fs.writeFileSync(path.join(dir,jsonName),JSON.stringify(output,null,2),{mode:0o600,flag:'wx'});
fs.writeFileSync(path.join(dir,mdName),md.join('\n'),{mode:0o600,flag:'wx'});
console.log('[STEP5 verify] Counts:',JSON.stringify(output.summary));
console.log('[STEP5 verify] JSON:',path.join(dir,jsonName));
console.log('[STEP5 verify] Review:',path.join(dir,mdName));
console.log('[STEP5 verify] Original STEP1–4 files unchanged.');
