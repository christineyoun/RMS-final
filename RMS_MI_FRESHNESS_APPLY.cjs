const fs=require('node:fs'),path=require('node:path');

const files=[
 'src/server/marketIntelligenceService.ts',
 'src/server/scheduledAi.ts',
 'src/server/scheduledContent.ts',
 'src/server/stage3DailyUpdates.ts',
 'src/components/CommodityNews.tsx'
];

const helper='src/server/newsFreshnessPolicy.ts';
const test='src/server/__tests__/newsFreshnessPolicy.test.ts';
const edits={};

function replaceOnce(src,old,next,label){
 const count=src.split(old).length-1;
 if(count!==1)throw Error(`${label}: expected 1 match, found ${count}. No changes made.`);
 return src.replace(old,next);
}
function addImport(src,old,imp,label){
 return replaceOnce(src,old,old+'\n'+imp,label);
}

for(const f of files)edits[f]=fs.readFileSync(f,'utf8');
if(fs.existsSync(helper)||fs.existsSync(test))
 throw Error('Freshness policy files already exist. No changes made.');

// 1. Search for additional articles when fewer than 4 recent sources qualify.
let s=edits[files[0]];
s=addImport(s,
 "import {selectProcurementNews} from './newsProcurementSelection.ts';",
 "import {recentMarketArticles} from './newsFreshnessPolicy.ts';",
 'Market Intelligence import');

const matches=[...s.matchAll(/^[ \t]*const skipPaidDiscovery\s*=.*;$/gm)];
if(matches.length!==1||
   !matches[0][0].includes('verifiedSoybeanOilFree.length')||
   !matches[0][0].includes("key === 'wheat'"))
 throw Error('Discovery code differs. No changes made.');

const space=matches[0][0].match(/^\s*/)[0];
s=s.replace(matches[0][0],[
 `${space}const recentFreeCount=recentMarketArticles(freeCheck?.accepted||[],7).length;`,
 `${space}const recentSoybeanOilCount=recentMarketArticles(verifiedSoybeanOilFree,7).length;`,
 `${space}const skipPaidDiscovery =`,
 `${space}  ((key==='corn'||key==='soybean')&&!scheduledSearch)`,
 `${space}  || (['wheat','corn','soybean'].includes(key)&&recentFreeCount>=4)`,
 `${space}  || (key==='soybean-oil'&&recentSoybeanOilCount>=4);`
].join('\n'));
edits[files[0]]=s;

// 2. Only consider the past 30 days for a successful new publication.
s=edits[files[1]];
s=addImport(s,
 "import {selectProcurementNews} from './newsProcurementSelection.ts';",
 "import {recentMarketArticles} from './newsFreshnessPolicy.ts';",
 'Scheduled AI import');
s=replaceOnce(s,
 'const accepted=acceptedScheduledNews(id,payload.articles||[]);',
 'const accepted=acceptedScheduledNews(id,recentMarketArticles(payload.articles||[],30,now()));',
 'Scheduled acceptance');
s=replaceOnce(s,
 'const ranked=selectProcurementNews(id,[...accepted,...prior]);',
 'const ranked=selectProcurementNews(id,recentMarketArticles([...accepted,...prior],30,now()));',
 'Scheduled selection');
edits[files[1]]=s;

// 3. Do not republish articles older than 30 days as current news.
s=edits[files[2]];
s=addImport(s,
 "import {selectProcurementNews} from './newsProcurementSelection.ts';",
 "import {recentMarketArticles} from './newsFreshnessPolicy.ts';",
 'Publication import');
s=replaceOnce(s,
 'const incoming=acceptedScheduledNews(key.slice(5),payload.articles||[]),saved=readScheduledContent(key,root);',
 'const incoming=acceptedScheduledNews(key.slice(5),recentMarketArticles(payload.articles||[])),saved=readScheduledContent(key,root);',
 'Publication candidates');
s=replaceOnce(s,
 'const articles=acceptedScheduledNews(key.slice(5),[...incoming,...(saved?.payload?.articles||[])]);',
 'const articles=acceptedScheduledNews(key.slice(5),recentMarketArticles([...incoming,...(saved?.payload?.articles||[])]));',
 'Publication merge');
edits[files[2]]=s;

// 4. The viewer must not refill current news with stale saved articles.
s=edits[files[3]];
s=addImport(s,
 "import {selectProcurementNews} from './newsProcurementSelection.ts';",
 "import {recentMarketArticles} from './newsFreshnessPolicy.ts';",
 'Gateway import');

const oldGateway="if(scheduled)return respond(res,200,key.startsWith('news-')?savedNewsResponse(key.slice(5),[...scheduled.payload.articles,...savedVerifiedCommodityNews(key.slice(5))]):{...scheduled.payload,data:{...scheduled.payload.data,status:'cached'}});";

const newGateway=`if(scheduled){
      if(key.startsWith('news-')){
        const id=key.slice(5);
        const all=[...scheduled.payload.articles,...savedVerifiedCommodityNews(id)];
        const current=recentMarketArticles(all);
        const response=savedNewsResponse(id,current.length?current:all);
        return respond(res,200,{
          ...response,
          sourceStatus:current.length?'verified-current-selection':'verified-retained-stale'
        });
      }
      return respond(res,200,{
        ...scheduled.payload,
        data:{...scheduled.payload.data,status:'cached'}
      });
    }`;

s=replaceOnce(s,oldGateway,newGateway,'Gateway selection');
edits[files[3]]=s;

// 5. Show a warning when only stale articles remain.
s=edits[files[4]];
s=replaceOnce(s,
 'const [isLoading, setIsLoading] = useState<boolean>(false);',
 `const [isLoading, setIsLoading] = useState<boolean>(false);
  const [staleNews,setStaleNews]=useState(false);`,
 'UI state');
s=replaceOnce(s,
 'if (isMounted) setArticles([]);',
 'if (isMounted) {setArticles([]);setStaleNews(false);}',
 'UI loading');
s=replaceOnce(s,
 'if (isMounted) setArticles(mapped);',
 `if(isMounted){
            setArticles(mapped);
            const recent=json.articles.some((a:any)=>{
              const date=Date.parse(String(a.publishedAt||''));
              return Number.isFinite(date)&&date<=Date.now()&&
                Date.now()-date<=30*86400000;
            });
            setStaleNews(mapped.length>0&&
              (!recent||json.sourceStatus==='verified-retained-stale'));
          }`,
 'UI freshness status');
s=replaceOnce(s,
 '      {articles.length > 0 ? (',
 `      {staleNews && (
        <p className="mb-3 text-xs text-slate-600">
          최근 30일 내 검증된 기사가 없어 이전 기사를 참고용으로 표시합니다.
        </p>
      )}
      {articles.length > 0 ? (`,
 'UI stale notice');
edits[files[4]]=s;

// Shared KST calendar-day freshness check.
const helperText=`export function recentMarketArticles<T extends {publishedAt?:string}>(
 items:readonly T[],maxAgeDays=30,now=new Date()
):T[]{
 const parts=new Intl.DateTimeFormat('en-US',{
  timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(now);
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 const today=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day));
 return items.filter(a=>{
  const m=/^(20\\d{2})-(\\d{2})-(\\d{2})(?:$|T)/.exec(String(a.publishedAt||''));
  if(!m)return false;
  const date=Date.UTC(+m[1],+m[2]-1,+m[3]);
  if(!Number.isFinite(date)||
     new Date(date).toISOString().slice(0,10)!==m[1]+'-'+m[2]+'-'+m[3])
    return false;
  const age=Math.round((today-date)/86400000);
  return age>=0&&age<=maxAgeDays;
 });
}
`;

const testText=`import test from 'node:test';
import assert from 'node:assert/strict';
import {recentMarketArticles} from '../newsFreshnessPolicy.ts';

test('MI 7-day and 30-day limits',()=>{
 const now=new Date('2026-11-03T08:00:00Z');
 const items=['2026-10-27','2026-10-04','2026-10-03','2026-11-04']
   .map(publishedAt=>({publishedAt}));
 assert.deepEqual(
  recentMarketArticles(items,7,now).map(x=>x.publishedAt),
  ['2026-10-27']
 );
 assert.deepEqual(
  recentMarketArticles(items,30,now).map(x=>x.publishedAt),
  ['2026-10-27','2026-10-04']
 );
});
`;

// All source checks happen before files are modified.
const backup=path.resolve('..','RMS_MI_FRESHNESS_BACKUP_20261103');
if(fs.existsSync(backup))
 throw Error('Backup directory already exists. No changes made.');

fs.mkdirSync(backup,{recursive:true});
for(const f of files){
 const target=path.join(backup,f);
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.copyFileSync(f,target,fs.constants.COPYFILE_EXCL);
}
for(const f of files)fs.writeFileSync(f,edits[f]);
fs.writeFileSync(helper,helperText,{flag:'wx'});
fs.writeFileSync(test,testText,{flag:'wx'});

console.log('PASS: Shared Market Intelligence freshness policy applied.');
console.log('Source backup:',backup);
