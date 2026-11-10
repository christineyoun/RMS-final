/** Free and local. Shows exact fields the existing RMS card will render; does not publish. */
import fs from 'node:fs';
import path from 'node:path';
import {commodityFromArgv,resultFolder} from './commodity-config.ts';
import {buildFinalData} from './step7-core.ts';
import {adaptStep7ToRms,type Step7Saved} from './step7-rms-adapter.ts';
const cwd=process.cwd(),commodity=commodityFromArgv(),dir=resultFolder(commodity,cwd);
if(!fs.existsSync(dir))throw Error('No saved research directory for '+commodity);
const finals=fs.readdirSync(dir).filter(x=>/^step7-final-.*\.json$/.test(x)).sort();
if(!finals.length)throw Error('STEP7 saved JSON missing. The Markdown report cannot supply citation receipts.');
const explicit=process.argv.find(x=>x.startsWith('--file='))?.slice('--file='.length);
const name=explicit||finals.at(-1)!;
if(!/^step7-final-[\w.-]+\.json$/.test(name))throw Error('Only STEP7 JSON from the local evidence directory is allowed');
const saved=JSON.parse(fs.readFileSync(path.join(dir,name),'utf8')) as Step7Saved;
const evidence=buildFinalData(dir);
if(evidence.commodity!==saved.commodity || saved.commodity!==commodity)throw Error('Evidence inventory commodity mismatch');
const preview=adaptStep7ToRms(saved,evidence.sources);
const previewFilename=`step7-rms-preview-${saved.commodity}.json`;
const previewPath=path.join(dir,previewFilename);
const receipt={stage:'step7-local-ui-preview',approvedForPublication:false,
  sourceResultFile:name,commodity:saved.commodity,createdAt:new Date().toISOString(),
  data:preview.data,warnings:preview.warnings,referencedSourceIds:preview.references,
  sourceCounts:evidence.counts};
fs.writeFileSync(previewPath,JSON.stringify(receipt,null,2),{mode:0o600});
console.log('[STEP7 RMS PREVIEW] No Gemini calls / No production writes.');
console.log('[STEP7 RMS PREVIEW] Commodity:',saved.commodity,'/ original:',name);
console.log('[STEP7 RMS PREVIEW] File:',previewPath);
console.log('[STEP7 RMS PREVIEW] Visible footer links:',preview.data.sources.length);
console.log('[STEP7 RMS PREVIEW] Publication approval: NO (local-only)');
console.log('[STEP7 RMS PREVIEW] Gemini SCM procurement risk:',preview.data.procurementRiskPreview
  ? preview.data.procurementRiskPreview.level+' / '+preview.data.procurementRiskPreview.summarySentenceKo
  : 'No validated Gemini risk in selected STEP7 JSON; existing SCM remains.');
if(preview.warnings.length)console.log('[STEP7 RMS PREVIEW] REVIEW WARNINGS:\n - '+preview.warnings.join('\n - '));
console.log('\n=== RMS CARD CONTENT ===');
console.log('데스크 권고:',preview.data.deskRecommendation);
console.log('\n시장전망:\n'+preview.data.executiveSummary);
console.log('\n구매전략:\n'+preview.data.purchaseActions.join('\n'));
for(const [label,key] of [['상승 요인','bullishFactors'],['하락 요인','bearishFactors'],['모니터링','watchItems']] as const)
  console.log('\n'+label+':\n'+preview.data[key].map(s=>' - '+s).join('\n'));
console.log('\n실제 출처 URL:\n'+preview.data.sources.map(s=>' - '+s.url).join('\n'));
console.log('\n[STEP7 RMS PREVIEW] Save-only. Set RMS_STEP7_LOCAL_PREVIEW=1 on a LOCAL DEV server to display it in existing RMS card.');
