import path from 'node:path';
import os from 'node:os';

import {
  readScheduledContent,
  acceptedScheduledNews,
  publishScheduledContent
} from './src/server/scheduledContent.ts';

import {selectProcurementNews} from './src/server/newsProcurementSelection.ts';
import {recentMarketArticles} from './src/server/newsFreshnessPolicy.ts';

const mode=process.argv[2];

if(!['--check','--publish'].includes(mode)){
  throw Error('Use --check or --publish');
}

const root=process.cwd();

const preview=path.join(
  os.homedir(),
  'Downloads',
  'RMS_MI_EIGHT_ISOLATED_2026-11-04'
);

const targets=['wheat','corn','soybean'];

const others=[
  'soybean-oil','palm-oil','sugar',
  'potato-starch','tapioca-starch'
];

const unchanged=Object.fromEntries(
  others.map(id=>[
    id,
    JSON.stringify(readScheduledContent('news-'+id,root))
  ])
);

const updates={};
const results=[];

for(const id of targets){
  const snapshot=readScheduledContent('news-'+id,preview);

  if(!snapshot?.payload?.articles?.length){
    throw Error(id+': approved preview missing');
  }

  const incoming=acceptedScheduledNews(
    id,snapshot.payload.articles
  );

  const recent=recentMarketArticles(incoming,7);

  if(incoming.length<2||recent.length<2){
    throw Error(id+': insufficient verified recent articles');
  }

  const previous=readScheduledContent(
    'news-'+id,root
  )?.payload?.articles||[];

  const previousUrls=new Set(
    previous.map(a=>a.originalUrl)
  );

  if(!incoming.some(a=>!previousUrls.has(a.originalUrl))){
    throw Error(id+': no newly approved article to publish');
  }

  const selected=selectProcurementNews(
    id,
    recentMarketArticles([...incoming,...previous],30)
  );

  const newUrls=new Set(
    incoming.map(a=>a.originalUrl)
  );

  if(!selected.some(a=>newUrls.has(a.originalUrl))){
    throw Error(id+': new articles failed final selection');
  }

  updates['news-'+id]={
    ...snapshot.payload,
    articles:incoming
  };

  results.push({
    commodity:id,
    previouslySaved:previous.length,
    newApproved:incoming.length,
    recent7d:recent.length,
    projected:selected.length
  });
}

console.table(results);

if(mode==='--check'){
  console.log('CHECK PASS: no files changed, no Gemini calls.');
  process.exit(0);
}

const outcome=publishScheduledContent(
  updates,
  'manual-reviewed-mi-2026-11-04',
  root
);

const publishedKeys=new Set(outcome.accepted||[]);

for(const id of targets){
  if(!publishedKeys.has('news-'+id)){
    throw Error(id+': publication not accepted');
  }

  const articles=readScheduledContent(
    'news-'+id,root
  )?.payload?.articles||[];

  const incomingUrls=new Set(
    updates['news-'+id].articles.map(a=>a.originalUrl)
  );

  if(!articles.some(a=>incomingUrls.has(a.originalUrl))){
    throw Error(id+': new article missing after publication');
  }

  console.log(
    id,
    'PUBLISHED',
    articles.length,
    'articles;',
    recentMarketArticles(articles,7).length,
    'within 7 days'
  );
}

for(const id of others){
  const after=JSON.stringify(
    readScheduledContent('news-'+id,root)
  );

  if(after!==unchanged[id]){
    throw Error(id+': non-target publication changed');
  }
}

console.log(
  'PASS: Wheat, Corn and Soybean updated.',
  'Other five publications unchanged.',
  'No Gemini calls.'
);
