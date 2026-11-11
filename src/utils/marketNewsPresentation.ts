/** Shared Market Intelligence PRESENTATION hints, not evidence approval.
 * Previously validated metadata takes priority. Never infer a country from a publisher URL. */
const regions:ReadonlyArray<[string,RegExp]>=[
 ['말레이시아',/(?:말레이시아|Malaysia|Malaysian)/i],
 ['인도네시아',/(?:인도네시아|Indonesia|Indonesian)/i],
 ['태국',/(?:태국|Thailand|Thai\b)/i],
 ['베트남',/(?:베트남|Vietnam|Vietnamese)/i],
 ['중국',/(?:중국|China|Chinese)/i],
 ['인도',/(?:인도(?!네시아)|India|Indian\b)/i],
 ['미국',/(?:미국|United States|\bU\.S\.|\bUSA\b|USDA|미 농무부)/i],
 ['브라질',/(?:브라질|Brazil|Brazilian)/i],
 ['아르헨티나',/(?:아르헨티나|Argentina|Argentine)/i],
 ['유럽',/(?:유럽|European Union|\bEU\b|Europe)/i],
 ['영국',/(?:영국|Britain|British|\bUK\b)/i],
 ['호주',/(?:호주|Australia|Australian)/i],
 ['캐나다',/(?:캐나다|Canada|Canadian)/i],
 ['우크라이나',/(?:우크라이나|Ukraine|Ukrainian)/i],
 ['러시아',/(?:러시아|Russia|Russian)/i],
];

// Display-only localization of verified region metadata. Original articles and
// stored affectedRegion strings are deliberately left unchanged.
const officialCountryNamesKo = (() => {
  const english = new Intl.DisplayNames(['en'], {type:'region'});
  const korean = new Intl.DisplayNames(['ko'], {type:'region'});
  const names = new Map<string,string>();
  for (let i=65;i<=90;i++) for(let j=65;j<=90;j++) {
    const code=String.fromCharCode(i,j);
    const en=english.of(code), ko=korean.of(code);
    if(en && ko && en!==code && ko!==code) names.set(en.toLowerCase(),ko);
  }
  return names;
})();
const commonGeographiesKo:Readonly<Record<string,string>> = {
  'global':'글로벌', 'worldwide':'글로벌', 'world':'글로벌',
  'black sea':'흑해', 'europe':'유럽', 'european union':'유럽연합',
  'eu':'유럽연합', 'asia':'아시아', 'southeast asia':'동남아시아',
  'north america':'북미', 'south america':'남미', 'middle east':'중동',
  'usa':'미국', 'u.s.':'미국', 'us':'미국', 'uk':'영국',
  'south korea':'한국', 'republic of korea':'한국'
};
export function koreanAffectedRegionLabel(value:string):string {
  const label=String(value||'').trim();
  if(!label)return '';
  // Exact place names only: do not reinterpret detailed or unfamiliar regions.
  return label.split(/\s*(?:·|,|;|\/|\|)\s*|\s+(?:and|&)\s+/i).map(part=>{
    const term=part.trim();
    const key=term.toLowerCase().replace(/\s+/g,' ');
    return commonGeographiesKo[key] || officialCountryNamesKo.get(key) || term;
  }).join('·');
}


// RMS_MI_EVIDENCE_COUNTRY_FALLBACK_V1
// All inference is from the approved article's TITLE/SUMMARY, never its URL,
// publisher, a static article registry, or a previously unverified source.
const missingRegion=(v:string)=>!v||/^(?:미확인|확인 불가|불명|unknown|not specified|n\/?a|null|none|—|-)$/i.test(v.trim());
const hasUsefulRegion=(v:string)=>!missingRegion(String(v||'').trim());
const countryMentionsKo=(()=>{
 const en=new Intl.DisplayNames(['en'],{type:'region'});
 const ko=new Intl.DisplayNames(['ko'],{type:'region'});
 const result=new Map<string,{english:string;korean:string}[]>();
 const add=(name:string,english:string,korean:string)=>{
   const list=result.get(korean)||[];
   if(!list.some(v=>v.english===english))list.push({english,korean});
   result.set(korean,list);
 };
 for(let i=65;i<=90;i++)for(let j=65;j<=90;j++){
   const code=String.fromCharCode(i,j),english=en.of(code),korean=ko.of(code);
   if(!english||!korean||english===code||korean===code||english.length<4)continue;
   add(english,english,korean);
 }
 // Alternate Korean shorthand for the same official ISO country name.
 const us=result.get('미국'); if(us)add('United States','United States','미국');
 return [...result.values()].map(list=>list[0]);
})();
const escaped=(value:string)=>value.replace(/[\x5c^$.*+?()[\]{}|]/g,'\\const categoryRules:ReadonlyArray<[string,RegExp]>=');
function explicitlyNamedCountries(text:string):string[]{
 const spans:{start:number;end:number;korean:string}[]=[];
 for(const {english,korean} of countryMentionsKo){
   // English names require boundaries; Korean names may have grammatical suffixes.
   const englishMatch=new RegExp('(^|[^A-Za-z])('+escaped(english)+')(?=$|[^A-Za-z])','gi');
   for(const match of text.matchAll(englishMatch)){
     const start=(match.index||0)+(match[1]||'').length;
     spans.push({start,end:start+match[2].length,korean});
   }
   let start=0;
   while((start=text.indexOf(korean,start))!==-1){
     spans.push({start,end:start+korean.length,korean});start+=korean.length;
   }
 }
 // A country inside another's name is NOT a separate affected country:
 // '인도네시아' must not also resolve as '인도'. Longer spans take priority.
 spans.sort((a,b)=>(b.end-b.start)-(a.end-a.start)||a.start-b.start);
 const selected:typeof spans=[];
 for(const candidate of spans){
   if(selected.some(p=>candidate.start<p.end&&p.start<candidate.end))continue;
   selected.push(candidate);
 }
 return [...new Set(selected.sort((a,b)=>a.start-b.start).map(p=>p.korean))];
}
function singleExplicitRegion(text:string):string|null {
 const countries=explicitlyNamedCountries(text);
 if(countries.length===1)return countries[0];
 if(countries.length>1)return null; // Ambiguous: no made-up single location.
 const broad=regions.filter(([,re])=>re.test(text)).map(([label])=>label);
 return broad.length===1?broad[0]:null;
}
export function inferredAffectedRegion(title:string,summary:string):string {
 const headline=String(title||''),body=String(summary||'');
 // A single explicit location in the title is stronger than country mentions
 // in background context. If title names several countries, never choose one.
 const titleCountries=explicitlyNamedCountries(headline);
 if(titleCountries.length===1)return titleCountries[0];
 if(titleCountries.length>1)return '미확인';
 const titleBroad=singleExplicitRegion(headline);
 if(titleBroad)return titleBroad;
 const summaryCountries=explicitlyNamedCountries(body);
 if(summaryCountries.length===1)return summaryCountries[0];
 if(summaryCountries.length>1)return '미확인';
 const summaryBroad=singleExplicitRegion(body);
 if(summaryBroad)return summaryBroad;
 return /(?:글로벌|전 세계|국제\s*시장|worldwide|global\s+market)/i.test(headline+' '+body)?'글로벌':'미확인';
}

const categoryRules:ReadonlyArray<[string,RegExp]>=[
 ['물류·수출입',/(?:물류|운임|항만|선적|수출|수입|export|import|freight|shipping)/i],
 ['가격·시장 동향',/(?:가격|시세|선물|호가|FOB|price|futures?)/i],
 ['수급 전망',/(?:수급|공급|재고|생산|작황|수확|수요|shortage|stocks?|supply|demand|harvest)/i],
 ['정책 동향',/(?:관세|무역 정책|수출세|quota|tariff|policy)/i],
];
export function marketNewsCardMetadata(a:{title?:string;summary?:string;category?:string;affectedRegion?:string}):{category:string;affectedRegion:string}{
 const text=String(a.title||'')+' '+String(a.summary||'');
 const category=String(a.category||'').trim()||categoryRules.find(([,r])=>r.test(text))?.[0]||'시장 동향';
 const saved=String(a.affectedRegion||'').trim();
 const affectedRegion=hasUsefulRegion(saved)
  ? koreanAffectedRegionLabel(saved)
  : inferredAffectedRegion(a.title||'',a.summary||'');
 return {category,affectedRegion};
}
