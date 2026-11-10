import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';

const args=process.argv.slice(2);
const check=args.length===1&&args[0]==='--check';
const run=args.length===1&&args[0]==='--run-paid';

if(!check&&!run){
  console.error('Usage: --check or --run-paid');
  process.exit(2);
}

const root=process.cwd();
const ids=[
  'wheat','corn','soybean','soybean-oil',
  'palm-oil','sugar','potato-starch','tapioca-starch'
];

const required=[
  'package.json',
  'src/server/scheduledAi.ts',
  'src/server/marketIntelligenceService.ts',
  'src/server/newsProcurementSelection.ts',
  'src/server/newsFreshnessPolicy.ts',
  'src/server/scheduledContent.ts',
  'scripts/cloud/weekday-ai-policy.approved.json'
];

for(const file of required){
  if(!fs.existsSync(path.join(root,file))){
    throw Error('Missing required file: '+file);
  }
}

if(
  process.env.CLOUD_RUN_JOB||
  process.env.K_SERVICE||
  process.env.NODE_ENV==='production'
){
  throw Error('This runner is local-only.');
}

const policy=JSON.parse(
  fs.readFileSync(path.join(root,required.at(-1)),'utf8')
);

if(
  policy.version!=='weekday-ai-prepaid-v3'||
  policy.enabled!==true||
  !policy.newsModel
){
  throw Error('Approved scheduled policy unavailable.');
}

const fmt=Object.fromEntries(
  new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Seoul',
    weekday:'short',
    year:'numeric',
    month:'2-digit',
    day:'2-digit',
    hour:'2-digit',
    hourCycle:'h23'
  }).formatToParts(new Date()).map(p=>[p.type,p.value])
);

const day=`${fmt.year}-${fmt.month}-${fmt.day}`;

const preview=path.join(
  os.homedir(),
  'Downloads',
  `RMS_MI_EIGHT_ISOLATED_${day}`
);

const journalFile=path.join(preview,'.rms-stage3','isolated-paid-journal.json');
// RMS_MI_PREVIEW_SAFETY_V2
const MAX_PREVIEW_RESERVATIONS_USD=4;
const MAX_PREVIEW_REQUESTS=16;

const leaseSource=fs.readFileSync(
  path.join(root,'src/server/paidJobLease.ts'),'utf8'
);
const scheduledSource=fs.readFileSync(
  path.join(root,'src/server/scheduledAi.ts'),'utf8'
);
const budgetSource=fs.readFileSync(
  path.join(root,'src/server/geminiKrwBudget.ts'),'utf8'
);

if(!leaseSource.includes('process.env.RMS_STAGE3_RUNTIME_ROOT')||
   !scheduledSource.includes('publishScheduledContent(u,r,root)')||
   !budgetSource.includes('free-fx.json')){
  throw Error('Runtime isolation contract changed. No paid run allowed.');
}

console.log('RMS EIGHT-COMMODITY ISOLATED NEWS PREVIEW');
console.log('KST:',day,fmt.weekday,fmt.hour+':00');
console.log('Commodities:',ids.join(', '));
console.log('Model:',policy.newsModel);
console.log('Preview:',preview);
console.log('Expected news phases:',ids.length);
console.log('Maximum requests:',MAX_PREVIEW_REQUESTS);
console.log('Estimated USD reservation ceiling:',MAX_PREVIEW_RESERVATIONS_USD);
console.log('Main RMS publication: protected');
console.log('STEP 1–7-2: not executed');
console.log('Cloud Run: not modified');

if(check){
  console.log('CHECK ONLY: no provider calls or file writes.');
  if(fs.existsSync(preview)){
    console.log(
      'WARNING: Preview folder already exists.',
      'Paid execution will refuse to overwrite it.'
    );
  }
  process.exit(0);
}

if(
  ['Sat','Sun'].includes(fmt.weekday)||
  Number(fmt.hour)<9
){
  throw Error('Paid news run requires weekday after 09:00 KST.');
}

if(fs.existsSync(preview)){
  throw Error('Preview already exists. Refusing to reuse journal.');
}

for(const lock of [
  'paid-request.lock',
  'paid-analysis-job.lock'
]){
  if(fs.existsSync(path.join(root,'.rms-stage3',lock))){
    throw Error('Another paid operation may be active: '+lock);
  }
}

if(fs.existsSync(path.join(root,'.env'))){
  const dotenv=await import('dotenv');
  dotenv.config({
    path:path.join(root,'.env'),
    override:false,
    quiet:true
  });
}

if(!process.env.GEMINI_API_KEY){
  throw Error('GEMINI_API_KEY missing.');
}

const fileUrl=file=>
  pathToFileURL(path.join(root,file)).href;

const [
  {
    runScheduledAi,
    validateScheduledPolicy,
    scheduledPhasePlan
  },
  {readScheduledContent},
  {recentMarketArticles}
]=await Promise.all([
  import(fileUrl('src/server/scheduledAi.ts')),
  import(fileUrl('src/server/scheduledContent.ts')),
  import(fileUrl('src/server/newsFreshnessPolicy.ts'))
]);

validateScheduledPolicy(policy);

const plan=scheduledPhasePlan(day);

if(
  plan.length!==8||
  plan.some(p=>p.kind!=='news'||!ids.includes(p.id))||
  new Set(plan.map(p=>p.id)).size!==8
){
  throw Error('Scheduled plan does not contain exactly 8 news phases.');
}

const priorNews={};

for(const id of ids){
  const articles=readScheduledContent(
    'news-'+id,root
  )?.payload?.articles||[];

  priorNews[id]=recentMarketArticles(articles,30);
}

fs.mkdirSync(path.dirname(journalFile),{recursive:true});

const mainFx=path.join(root,'.rms-stage3','free-fx.json');
if(fs.existsSync(mainFx)){
  fs.copyFileSync(
    mainFx,
    path.join(path.dirname(journalFile),'free-fx.json'),
    fs.constants.COPYFILE_EXCL
  );
}

process.env.RMS_STAGE3_RUNTIME_ROOT=preview;
process.env.RMS_DISABLE_SCHEDULERS='1';
process.chdir(preview);

const store={
  async read(){
    return fs.existsSync(journalFile)
      ?JSON.parse(fs.readFileSync(journalFile,'utf8'))
      :null;
  },
  async save(value){
    const entries=Array.isArray(value.requests)?value.requests:[];
    const previous=fs.existsSync(journalFile)
      ?JSON.parse(fs.readFileSync(journalFile,'utf8'))
      :null;

    if(entries.length>MAX_PREVIEW_REQUESTS){
      throw Error('Preview request-count ceiling exceeded.');
    }

    if(entries.length>(previous?.requests?.length||0)){
      const total=entries.reduce((sum,r)=>
        sum+(Number.isFinite(r.reservedUsd)&&r.reservedUsd>0
          ?r.reservedUsd:Infinity),0);

      if(total>MAX_PREVIEW_RESERVATIONS_USD+1e-9){
        throw Error('Preview reservation ceiling reached before Gemini request.');
      }
    }

    const tmp=journalFile+'.tmp';
    fs.writeFileSync(
      tmp,JSON.stringify(value,null,2),{mode:0o600}
    );
    fs.renameSync(tmp,journalFile);
  }
};

console.log('Executing 8 isolated paid news phases.');

const result=await runScheduledAi(policy,store,{
  root:preview,
  priorNews,
  now:()=>new Date()
});

const rows=[];

for(const id of ids){
  const articles=readScheduledContent(
    'news-'+id,preview
  )?.payload?.articles||[];

  rows.push({
    commodity:id,
    phase:result.phases?.['news-'+id]?.status||'missing',
    articles:articles.length,
    within7d:recentMarketArticles(articles,7).length,
    within30d:recentMarketArticles(articles,30).length,
    titles:articles
      .map(a=>`${a.publishedAt} ${a.title}`)
      .slice(0,4)
  });
}

console.table(
  rows.map(({titles,...rest})=>rest)
);

for(const row of rows){
  console.log('\n'+row.commodity.toUpperCase());
  for(const title of row.titles){
    console.log('  '+title);
  }
}

console.log(
  '\nRecorded requests:',result.attempts,
  'Estimated USD:',result.estimatedUsd
);
console.log('Preview location:',preview);
console.log('Main RMS publications remain unchanged.');
