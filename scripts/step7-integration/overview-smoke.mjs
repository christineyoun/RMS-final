#!/usr/bin/env node
/** Read-only saved Overview audit; no outside fetch, model or publication writes. */
process.env.RMS_STEP7_LOCAL_PREVIEW='1';
process.env.RMS_PUBLIC_READONLY='0';
process.env.NODE_ENV='development';
const {createStage3Gateway}=await import('../../src/server/stage3DailyUpdates.ts');
const {loadOverviewIntelligence,OVERVIEW_COMMODITIES}=await import('../../src/utils/overviewIntelligence.ts');
const gateway=createStage3Gateway();
const localFetch=async (input)=>{
  let status=200,body=null;
  gateway(
    {method:'GET',url:String(input),headers:{},socket:{remoteAddress:'127.0.0.1'}},
    {setHeader(){},set statusCode(v){status=v;},end(text){try{body=JSON.parse(String(text));}catch{body={success:false,error:'Invalid JSON response'};}}},
    ()=>{status=404;body={success:false,error:'No route'};}
  );
  return new Response(JSON.stringify(body||{success:false}),{status});
};
const result=await loadOverviewIntelligence(localFetch);
const core=new Set(result.fragments.filter(f=>['executiveSummary','deskRecommendation'].includes(f.field)).map(f=>f.commodity));
console.log('RMS OVERVIEW SAVED-DATA AUDIT');
console.log('AI analyses:',result.analyses.length,'/8');
console.log('MI input articles:',result.inputArticleCount);
console.log('Commodities represented across core brief:',core.size,'/8');
console.log('Brief source dates:',result.sourceDates);
console.log('Risk fragments from verified STEP7:',result.fragments.filter(f=>f.field==='procurementRiskPreview.summarySentenceKo').length);
console.log('Issues:',result.issues.length,'/4');
for(const [index,x]of result.issues.entries())
  console.log(JSON.stringify({rank:index+1,commodities:x.commodities,title:x.title,date:x.publishedAt,priority:x.priority,theme:x.theme,url:x.url}));
console.log('READ ONLY — No Gemini, external network calls, or writes.');
if(result.analyses.length===8&&core.size<8){console.error('FAIL: core brief omitted available commodity analysis');process.exitCode=1;}
if(result.issues.length>4){console.error('FAIL: more than four issues');process.exitCode=1;}
