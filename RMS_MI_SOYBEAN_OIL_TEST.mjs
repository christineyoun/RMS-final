import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';

const project = process.cwd();
const sandbox = path.join(
  os.homedir(), 'Downloads',
  'RMS_MI_SOYBEAN_OIL_TEST_20261103'
);
const state = path.join(sandbox, '.rms-stage3');
const journalFile = path.join(state, 'isolated-paid-journal.json');

if (!fs.existsSync(path.join(project, 'src/server/scheduledAi.ts')))
  throw Error('Run from RMS_final_main');

if (fs.existsSync(journalFile))
  throw Error('Previous test journal exists. Do not repeat paid requests.');

if (fs.existsSync(path.join(project, '.env')))
  process.loadEnvFile(path.join(project, '.env'));

if (!process.env.GEMINI_API_KEY)
  throw Error('GEMINI_API_KEY missing. No paid request made.');

fs.mkdirSync(state, {recursive:true});
process.env.RMS_STAGE3_RUNTIME_ROOT = sandbox;
process.chdir(sandbox);

const imp = file => import(
  pathToFileURL(path.join(project,file)).href
);

const [
  {runScheduledAi, scheduledPhasePlan, policyHash},
  {freeRefreshDay},
  {readScheduledContent}
] = await Promise.all([
  imp('src/server/scheduledAi.ts'),
  imp('src/server/freeSourceRefresh.ts'),
  imp('src/server/scheduledContent.ts')
]);

const {day,weekday,hour} = freeRefreshDay();
if (!weekday || hour < 9)
  throw Error('Test requires weekday after 09:00 KST');

const policy = {
  version:'weekday-ai-prepaid-v3',
  enabled:true,
  approvalId:'isolated-soybean-oil-mi-20261103',
  analysisModel:'gemini-3.8-flash',
  newsModel:'gemini-3.8-flash',
  monthlyOperatingBudgetKrw:100000,
  funding:'manual-prepaid',
  automaticTopUp:false,
  automaticPayment:false,
  fxFloorKrwPerUsd:1500,
  fxSafetyMarginPct:20
};

const initial = {
  version:2,
  day,
  policyHash:policyHash(policy),
  budget:{},
  phases:Object.fromEntries(
    scheduledPhasePlan(day)
      .filter(x=>x.id!=='soybean-oil')
      .map(x=>[
        'news-'+x.id,
        {status:'excluded-from-isolated-test'}
      ])
  ),
  requests:[]
};

fs.writeFileSync(
  journalFile,
  JSON.stringify(initial,null,2),
  {flag:'wx',mode:0o600}
);

const store = {
  read:async()=>JSON.parse(
    fs.readFileSync(journalFile,'utf8')
  ),
  save:async j=>{
    const tmp=journalFile+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify(j,null,2),{
      mode:0o600
    });
    fs.renameSync(tmp,journalFile);
  }
};

try {
  const result=await runScheduledAi(policy,store,{
    root:sandbox,
    priorNews:{'soybean-oil':[]}
  });

  const articles=readScheduledContent(
    'news-soybean-oil',sandbox
  )?.payload?.articles??[];

  console.log(JSON.stringify({
    phase:result.phases['news-soybean-oil'],
    paidRequestsRecorded:result.attempts,
    estimatedUsd:result.estimatedUsd,
    approvedArticles:articles.map(a=>({
      date:a.publishedAt,
      title:a.title,
      url:a.originalUrl
    })),
    journalFile
  },null,2));

} catch(error) {
  console.error('Isolated test failed:',
    error?.message||String(error));
  console.error(
    'Do not retry without reviewing:',journalFile
  );
  process.exitCode=1;
}
