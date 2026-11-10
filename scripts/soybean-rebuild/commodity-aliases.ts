/** Two-tier multilingual source matching (not a Google Search keyword restriction).
 * Strong = named commodity; Related = its raw materials, coproducts or directly related products.
 * Aliases NEVER decide publication or deletion. A/B measures readability of publisher evidence.
 */
import {type Commodity,COMMODITIES} from './commodity-config.ts';
export type Tier='strong'|'related'|'none';
export type AliasDictionary={strong:readonly string[];related:readonly string[]};
export const COMMODITY_ALIASES:Record<Commodity,AliasDictionary>={
  wheat:{strong:['wheat','durum wheat','soft wheat','밀','소맥','小麦','小麥','trigo','пшеница','пшениця'],
    related:['wheat flour','밀가루','milling','제분']},
  corn:{strong:['corn','maize','옥수수','玉米','milho','maíz','кукурудза'],
    related:['corn ethanol','corn feed','사료용 옥수수']},
  soybean:{strong:['soybean','soybeans','soyabean','soyabeans','soya bean','soya beans','대두','大豆','soja'],
    related:['soybean meal','soybean oil','soy oil','大豆油','oilseed','oilseeds','crush']},
  'soybean-oil':{strong:['soybean oil','soy oil','soyabean oil','crude soybean oil','refined soybean oil','대두유','콩기름','大豆油','óleo de soja','aceite de soja'],
    related:['soybean','soybean meal','biodiesel','HVO']},
  'palm-oil':{strong:['palm oil','crude palm oil','CPO','RBD palm oil','palm olein','palm stearin','팜유','조팜유','정제팜유','棕榈油','minyak sawit'],
    related:['oil palm','palm kernel oil','FFB','biodiesel']},
  sugar:{strong:['sugar','raw sugar','white sugar','refined sugar','설탕','원당','정제당','食糖','açúcar','चीनी','น้ำตาลทราย'],
    related:['sugarcane','sugar beet','ethanol']},
  'potato-starch':{strong:['potato starch','native potato starch','modified potato starch','감자전분','천연감자전분','변성감자전분','马铃薯淀粉','土豆淀粉','kartoffelstärke','aardappelzetmeel','kartoffelstivelse','fécule de pomme de terre'],
    related:['potato','starch potato','감자']},
  'tapioca-starch':{strong:['tapioca starch','cassava starch','native tapioca starch','modified tapioca starch','타피오카전분','카사바전분','변성타피오카전분','木薯淀粉','แป้งมันสำปะหลัง','tinh bột sắn'],
    related:['cassava','tapioca root','cassava chips','카사바']},
};
export type AliasHit={alias:string;tier:Exclude<Tier,'none'>;start:number;end:number};
function escapeRegex(value:string):string {return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function isWordScript(alias:string):boolean {
  return /^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Devanagari}0-9 _-]+$/u.test(alias);
}
function findOccurrences(text:string,alias:string):Array<{start:number;end:number}>{
  // Do not normalize original text: offsets must remain valid for exact excerpts.
  const term=escapeRegex(alias).replace(/ /g,'\\s+');
  const matcher=isWordScript(alias)?new RegExp(`(?<![\\p{L}\\p{N}])${term}(?![\\p{L}\\p{N}])`,'giu'):
    new RegExp(term,'giu');
  return [...text.matchAll(matcher)].map(m=>({start:m.index!,end:m.index!+m[0].length}));
}
export function findCommodityHits(text:string,commodity:Commodity):AliasHit[]{
  const hits:AliasHit[]=[];
  for(const tier of ['strong','related'] as const){
    for(const alias of COMMODITY_ALIASES[commodity][tier]){
      for(const span of findOccurrences(text,alias))hits.push({...span,alias,tier});
    }
  }
  // A longer related expression takes priority over a shorter strong alias inside it:
  // e.g. "Soybean Oil" is related to soybean, not evidence of soybean *crop* output.
  // A longer other-commodity specific name similarly prevents mistaken direct classification.
  const masks=[...hits.filter(h=>h.tier==='related'),...COMMODITIES.filter(k=>k!==commodity)
    .flatMap(k=>COMMODITY_ALIASES[k].strong.flatMap(alias=>findOccurrences(text,alias).map(span=>({...span,alias,tier:'related' as const}))))];
  const result=hits.filter(h=>h.tier==='related'||!masks.some(m=>
    m.start<=h.start&&m.end>=h.end&&(m.end-m.start)>(h.end-h.start)));
  // De-duplicate overlapping names for the same starting location; prefer longer spans.
  return result.sort((a,b)=>a.start-b.start||(b.end-b.start)-(a.end-a.start))
    .filter((x,i,arr)=>i===0||x.start!==arr[i-1].start||x.tier!==arr[i-1].tier);
}
export function classifyCommodityText(text:string,commodity:Commodity):Tier {
  const hits=findCommodityHits(text,commodity);
  return hits.some(h=>h.tier==='strong')?'strong':hits.length?'related':'none';
}
