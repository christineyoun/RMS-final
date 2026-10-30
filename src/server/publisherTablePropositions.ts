/** Dated original price-table rows, not open-ended translation or inference.
 * The table must survive original HTML/receipt verification upstream. Unknown
 * products, headers, terms, currencies and quantities produce no proposition. */
import type {AnalysisFact} from './analysisEvidence.ts';
import type {SourceProposition} from './analysisSourcePropositions.ts';
const products:Record<string,Record<string,string>>={corn:{'Corn':'옥수수','Corn, yellow':'황색 옥수수','Corn, feed grade, moisture 14% max':'사료용 옥수수(수분 최대 14%)','Corn, feed grade, moisture 14% max, 98% purity':'사료용 옥수수(수분 최대 14%, 순도 98%)'},wheat:{'Wheat':'밀'},soybean:{'Soybeans':'대두'},'soybean-oil':{'Soybean oil':'대두유'},'palm-oil':{'Palm oil':'팜유'},sugar:{'Sugar':'설탕'},'potato-starch':{'Potato starch':'감자전분'},'tapioca-starch':{'Tapioca starch':'타피오카전분'}};
const origins:Record<string,string>={'Germany (DE)':'독일','Ukraine (UA)':'우크라이나','France (FR)':'프랑스','India (IN)':'인도'};
export function publisherTablePropositions(f:AnalysisFact):SourceProposition[]{
 const c=f.referenceContext;
 if(!f.id.startsWith('live-article-')||f.verification!=='original-record'||!c||c.receiptSha256!==f.recordSha256||!/^20\d{2}-\d{2}-\d{2}$/.test(f.observedAt))return [];
 const quote=c.quote.replace(/[‐‑–—]/g,'-').replace(/\s+/g,' ');
 const table=/Origin Specification Delivery term Latest price \((EUR\/kg|USD\/MT)\) Last update (.+?) Find the full table/.exec(quote);
 const out:SourceProposition[]=[];
 // A bounded whole-sentence quotation grammar also handles new prose without
 // a per-article URL/phrase entry. Preserve attribution and reported stability;
 // never infer a directional driver or action from a spot-price statement.
 const names:Record<string,string>={French:'프랑스',German:'독일',Ukrainian:'우크라이나',Indian:'인도'};
 for(const sentence of quote.split(/(?<=[.!?])\s+(?=[A-Z])/)){
  const m=/^(French|German|Ukrainian|Indian) (yellow corn|corn|wheat|soybean oil|palm oil|potato starch|tapioca starch|sugar) (FOB Paris|FOB Odesa|CPT Odesa|EXW Drentwede|FOB New Delhi) is steady at ([0-9]+(?:\.[0-9]+)?) (EUR\/kg|USD\/MT)\.$/.exec(sentence);
  if(!m)continue;
  const vocabulary:Record<string,[string,string]>={'yellow corn':['corn','황색 옥수수'],corn:['corn','옥수수'],wheat:['wheat','밀'],'soybean oil':['soybean-oil','대두유'],'palm oil':['palm-oil','팜유'],'potato starch':['potato-starch','감자전분'],'tapioca starch':['tapioca-starch','타피오카전분'],sugar:['sugar','설탕']};
  if(vocabulary[m[2]][0]!==f.commodity||!Number.isFinite(Number(m[4]))||Number(m[4])<=0)continue;
  out.push({role:'fact',text:`${f.observedAt} 원문은 ${names[m[1]]} ${vocabulary[m[2]][1]} ${m[3]} 참고호가가 ${m[4]} ${m[5]}에서 안정적이라고 보도했습니다.`});
 }
 if(!table)return out;
 const unit=table[1];
 // Parse complete rows between known country boundaries. Do not borrow an
 // adjacent row's date, product or unit; starch is not whole grain corn.
 const rows=table[2].match(/(?:Germany \(DE\)|Ukraine \(UA\)|France \(FR\)|India \(IN\)) .+?(?= (?:Germany \(DE\)|Ukraine \(UA\)|France \(FR\)|India \(IN\)) |$)/g)||[];
 for(const row of rows){
  const m=/^(Germany \(DE\)|Ukraine \(UA\)|France \(FR\)|India \(IN\)) (.+?) (EXW Drentwede|FOB Odesa|CPT Odesa|FOB Paris|FOB New Delhi) ([0-9]+(?:\.[0-9]+)?) (20\d{2}-\d{2}-\d{2})$/.exec(row);
  if(!m)continue;
  const product=products[f.commodity]?.[m[2]],amount=Number(m[4]),date=m[5];
  if(!product||!Number.isFinite(amount)||amount<=0||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>f.observedAt)continue;
  out.push({role:'fact',text:`${f.observedAt} 원문 가격표에서 ${date} 기준 ${origins[m[1]]} ${product} ${m[3]} 참고호가는 ${m[4]} ${unit}로 제시됐습니다.`});
 }
 return out;
}
