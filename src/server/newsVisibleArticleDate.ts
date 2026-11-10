
const MONTHS=['january','february','march','april','may','june','july','august','september','october','november','december'];

function dateIso(y:number,m:number,d:number):string {
  if(y<2000||y>2100||m<1||m>12||d<1||d>31)return '';
  const x=new Date(Date.UTC(y,m-1,d,12));
  return x.getUTCFullYear()===y&&x.getUTCMonth()===m-1&&x.getUTCDate()===d
    ?[y,String(m).padStart(2,'0'),String(d).padStart(2,'0')].join('-'):'';
}

export function visibleHeadlineArticleDate(input:{
  headline:string;
  pageText:string;
  provisionalIndexDate?:string
}):string {
  const text=String(input.pageText||'').normalize('NFKC').replace(/\s+/g,' ').trim().slice(0,150000);
  const title=String(input.headline||'').normalize('NFKC').replace(/\s+/g,' ').trim();
  if(title.length<18)return '';

  let at=-1,foundTitle='';
  for(const s of [title,title.split(/\s+[|—–]\s+/)[0]]){
    if(s.length<18)continue;
    at=text.toLowerCase().indexOf(s.toLowerCase());
    if(at>=0){foundTitle=s;break;}
  }
  if(at<0)return '';

  const nearby=text.slice(at+foundTitle.length,at+foundTitle.length+120);
  const results=[] as string[];
  const add=(s:string)=>{if(s)results.push(s);};
  const mon='(January|February|March|April|May|June|July|August|September|October|November|December)';

  for(const m of nearby.matchAll(new RegExp('\\b'+mon+'\\s+([0-3]?\\d)(?:st|nd|rd|th)?[,]?\\s+(20\\d{2})\\b','gi')))
    add(dateIso(+m[3],MONTHS.indexOf(m[1].toLowerCase())+1,+m[2]));

  for(const m of nearby.matchAll(new RegExp('\\b([0-3]?\\d)(?:st|nd|rd|th)?\\s+'+mon+'[,]?\\s+(20\\d{2})\\b','gi')))
    add(dateIso(+m[3],MONTHS.indexOf(m[2].toLowerCase())+1,+m[1]));

  for(const m of nearby.matchAll(/\b(20\d{2})[-/.]([01]?\d)[-/.]([0-3]?\d)\b/g))
    add(dateIso(+m[1],+m[2],+m[3]));

  const indexDay=/^20\d{2}-\d{2}-\d{2}$/.test(String(input.provisionalIndexDate||'').slice(0,10))
    ?String(input.provisionalIndexDate).slice(0,10):'';

  for(const m of nearby.matchAll(/\b([0-3]?\d)[/.]([0-3]?\d)[/.](20\d{2})\b/g)){
    const options=[...new Set([
      dateIso(+m[3],+m[2],+m[1]),
      dateIso(+m[3],+m[1],+m[2])
    ].filter(Boolean))];
    if(options.length===1)add(options[0]);
    else if(options.includes(indexDay))add(indexDay);
  }

  const unique=[...new Set(results)];
  return unique.length===1?unique[0]:'';
}
