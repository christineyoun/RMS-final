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
 const named=regions.filter(([,r])=>r.test(text)).map(([name])=>name);
 const affectedRegion=saved||(named.length>0&&named.length<=2?named.join('·'):
  /(?:글로벌|전 세계|국제\s*시장|worldwide|global\s+market)/i.test(text)?'글로벌':'미확인');
 return {category,affectedRegion};
}
