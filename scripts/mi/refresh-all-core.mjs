import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const COMMODITIES = Object.freeze(['wheat','corn','soybean','soybean-oil','palm-oil','sugar','potato-starch','tapioca-starch']);
export const kstDay = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export function businessDaysElapsed(earlier, later) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(earlier) || !/^\d{4}-\d{2}-\d{2}$/.test(later)) return Infinity;
  const from = new Date(earlier+'T12:00:00Z'), to = new Date(later+'T12:00:00Z');
  if (!Number.isFinite(from.valueOf()) || !Number.isFinite(to.valueOf()) || from>to || (to-from)>365*86400000) return Infinity;
  let count=0;
  for (let t=new Date(from.getTime()+86400000);t<=to;t=new Date(t.getTime()+86400000)) {
    if(t.getUTCDay()!==0 && t.getUTCDay()!==6) count++;
  }
  return count;
}
export function inspectNews(articles, day=kstDay()) {
  const data=Array.isArray(articles)?articles:[];
  const lengths=data.map(a=>[...(typeof a?.summary==='string'?a.summary:'')].length).filter(Boolean);
  const dates=data.map(a=>a?.publishedAt).filter(d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
  const latest=dates[0]??null;
  const reasons=[];
  if(data.length<4)reasons.push('fewer-than-four-approved');
  if(data.length>4)reasons.push('more-than-four-published');
  if(!latest || businessDaysElapsed(latest,day)>1)reasons.push('no-recent-approved-article');
  if(lengths.some(len=>len>320))reasons.push('summary-overlong');
  if(lengths.some(len=>len<170))reasons.push('summary-underdeveloped');
  if(lengths.length>=2 && Math.max(...lengths)-Math.min(...lengths)>150)reasons.push('summary-length-imbalance');
  if(data.some(a=>a?.publishedAt>day))reasons.push('future-dated-publication');
  const urls=data.map(a=>a?.originalUrl).filter(Boolean);
  if(new Set(urls).size !== urls.length)reasons.push('duplicate-published-url');
  return {count:data.length,latest,summaryLengths:lengths,sourceCount:new Set(data.map(a=>a?.sourceName).filter(Boolean)).size,
    reasons,needsRefresh:reasons.length>0};
}
export function readPublication(root,commodity,day=kstDay()){
  const state=path.join(root,'.rms-stage3');
  const manifestFile=path.join(state,'scheduled-content-current.json');
  if(!fs.existsSync(manifestFile))return {...inspectNews([],day),integrity:'missing-manifest'};
  try{
    const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
    const sha=manifest?.entries?.['news-'+commodity]?.sha256;
    if(!sha)return {...inspectNews([],day),integrity:'no-publication-entry'};
    if(!/^[a-f0-9]{64}$/i.test(sha))return {...inspectNews([],day),integrity:'bad-manifest-digest'};
    const filename=path.join(state,'snapshots','scheduled-content',sha+'.json');
    const raw=fs.readFileSync(filename);
    const actual=createHash('sha256').update(raw).digest('hex');
    if(actual!==sha)return {...inspectNews([],day),integrity:'snapshot-digest-mismatch'};
    const doc=JSON.parse(raw.toString('utf8'));
    if(!Array.isArray(doc?.payload?.articles))return {...inspectNews([],day),integrity:'invalid-article-payload'};
    return {...inspectNews(doc.payload.articles,day),integrity:'ok'};
  }catch(e){return {...inspectNews([],day),integrity:'unreadable-publication',issue:String(e?.code||e?.message||e).slice(0,100)};}
}
export function inspectJournal(root,commodity,day=kstDay()){
  const filename=path.join(root,'.rms-stage3','manual-news-paid',day,commodity+'.json');
  if(!fs.existsSync(filename))return {exists:false};
  try{
    const data=JSON.parse(fs.readFileSync(filename,'utf8'));
    return {exists:true,status:data.status||'unknown',estimatedUsd:Number.isFinite(data.estimatedUsd)?data.estimatedUsd:0,apiCallAttempts:data.apiCallAttempts??null,reason:data.reason??null,runId:data.runId??null};
  }catch{return {exists:true,status:'unreadable',estimatedUsd:null};}
}
export function makePlan(root,day=kstDay(),selected=COMMODITIES){
  return selected.map(commodity=>{
    const publication=readPublication(root,commodity,day);
    const journal=inspectJournal(root,commodity,day);
    let decision='RUN';
    if(!['ok','no-publication-entry','missing-manifest'].includes(publication.integrity))decision='BLOCK-INTEGRITY';
    else if(journal.exists)decision='SKIP-ALREADY-ATTEMPTED';
    else if(!publication.needsRefresh && publication.integrity==='ok')decision='SKIP-RECENT-HEALTHY';
    return {commodity,publication,journal,decision};
  });
}

/** A retained publication is safe to continue past ONLY when no new verified
 * editorial content qualified. Other retained statuses can hide actual failures. */
export function classifyRefreshOutcome(exitCode,journal){
 if(!journal?.exists || journal.status==='unreadable')return 'STOP';
 if(journal.status==='published' && exitCode===0)return 'CONTINUE';
 if(journal.status==='retained-previous' &&
    journal.reason==='no-new-or-updated-verified-content' && exitCode===1)return 'CONTINUE-RETAINED';
 return 'STOP';
}
