/** Step 3: review A excerpts and B inventories without Gemini, network, or RMS writes. */
import fs from 'node:fs';
import path from 'node:path';
import {buildEvidenceReview,type ReviewSource} from './step3-evidence.ts';
import {commodityFromArgv,resultFolder,assertSnapshotCommodity,COMMODITY_KO} from './commodity-config.ts';
const commodity=commodityFromArgv();
const dir=resultFolder(commodity);
if(!fs.existsSync(dir))throw Error('STEP 2 result directory missing: '+dir);
const newest=fs.readdirSync(dir).filter(f=>/^step2-graded-.*\.json$/.test(f)).sort().at(-1);
if(!newest)throw new Error('STEP 2 result missing in '+dir+'. Run STEP 2 for the selected commodity.');
const src=JSON.parse(fs.readFileSync(path.join(dir,newest),'utf8')) as {commodity:string;stage:string;records:ReviewSource[]};
assertSnapshotCommodity(src,commodity,'2');
if(src.stage!=='source-resolution-and-grading'||!Array.isArray(src.records))throw Error('Unrecognized STEP2 input');
const items=buildEvidenceReview(src.records,commodity);
const totals={A:items.filter(i=>i.grade==='A').length,B:items.filter(i=>i.grade==='B').length,
  EXCLUDED:items.filter(i=>i.grade==='EXCLUDED').length, AExcerptCandidates:items.reduce((s,i)=>s+i.evidence.length,0),
  BPending:items.filter(i=>i.eligibility==='citation-only-needs-verification').length,
  BUnrelated:items.filter(i=>i.eligibility==='retained-not-usable-as-soybean-evidence').length,
  AWithNoExtractableSnippet:items.filter(i=>i.grade==='A'&&!i.evidence.length).length};
const current=new Date().toISOString().replace(/[:.]/g,'-');
const output={recordedAt:new Date().toISOString(),commodity,stage:'source-text-evidence-review-only',step2File:newest,totals,
  rule:'Excerpts are exact windows copied from A-grade publisher text. They are review candidates, NOT independently fact-checked numbers. B sources remain preserved but have no inferred factual excerpts.',
  items};
const jsonFile=path.join(dir,`step3-evidence-${current}.json`);
fs.writeFileSync(jsonFile,JSON.stringify(output,null,2),{mode:0o600});
const escape=(s:string)=>s.replace(/\|/g,'\\|').replace(/\r?\n/g,' ').trim();
const md=[
  `# ${COMMODITY_KO[commodity]} STEP 3 — 원문 발췌 후보 검토`,
  '',`입력: ${newest}`,'',
  `A ${totals.A}건 / B ${totals.B}건 / 제외 ${totals.EXCLUDED}건`,
  `A 원문 발췌 후보 ${totals.AExcerptCandidates}개 / B 원문 미확인 보관 ${totals.BPending}건 / B 관련성 불명확(활용 보류) ${totals.BUnrelated}건`,
  '', '**중요:** 아래 인용문은 원문 텍스트에서 기계적으로 발췌한 검토 후보입니다. 숫자·기준연도·단위 및 문맥은 아직 사실 검증되지 않았습니다.',
  '','## A등급: 원문 문맥 확인', ''
];
for(const i of items.filter(i=>i.grade==='A')){
  md.push(`### ${i.id} — ${escape(i.googleTitle)}`,`- 원문 URL: ${i.publisherUrl||'(없음)'}`,
    `- 문서 제목: ${i.documentType==='pdf'?'PDF':i.documentType||'불명'} / 발행일: ${i.publishedAt||'미확인'} / 추출 ${i.extractedCharacters}자`);
  for(const w of i.warnings)md.push(`- 주의: ${w}`);
  if(!i.evidence.length)md.push('- 현재 품목 관련 발췌 후보 없음. 직접 재검토 필요.');
  for(const ev of i.evidence)md.push(`- **${ev.id} [${ev.theme}]**: ${escape(ev.exactExcerpt)}`);
  md.push('');
}
md.push('## B등급: 삭제하지 않고 보관','', '| ID | 출처 | 이유 | 활용 상태 | Google 인용 URL |','|---|---|---|---|---|');
for(const i of items.filter(i=>i.grade==='B'))md.push(`| ${i.id} | ${escape(i.googleTitle)} | ${i.reason} | ${i.eligibility} | ${i.googleCitationUrl} |`);
md.push('','## 제외자료 (추적 목적으로만 기록)','');
for(const i of items.filter(i=>i.grade==='EXCLUDED'))md.push(`- ${i.id}: ${escape(i.googleTitle)} (${i.reason})`);
md.push('','## 다음 단계에서 확인할 항목','', '- 주요 생산/수급/수출/가격 숫자에 대한 원문 근거와 기준 시점 검증','- PDF 표 파싱으로 수치가 왜곡되지 않았는지 확인','- B등급은 인용 근거 제목·날짜만 사용하고 미확인 사실은 작성하지 않음','- 이 단계에서는 Gemini 분석·추가검색·RMS 게시를 수행하지 않음','');
const mdFile=path.join(dir,`step3-review-${current}.md`);
fs.writeFileSync(mdFile,md.join('\n'),{mode:0o600});
console.log('[STEP 3] No Gemini, network, or RMS publication.');
console.log('[STEP 3] Read STEP 2:',newest);
console.log('[STEP 3] Counts:',JSON.stringify(totals));
for(const i of items){console.log(`[${i.id}] ${i.grade} | ${i.reason} | ${i.publisherHost||i.googleTitle} | snippets ${i.evidence.length} | ${i.eligibility}`);}
console.log('[STEP 3] Saved JSON:',jsonFile);
console.log('[STEP 3] Saved review:',mdFile);
