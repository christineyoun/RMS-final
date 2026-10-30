import {publisherTablePropositions} from './publisherTablePropositions.ts';
import {livePublisherPropositions} from './livePublisherPropositions.ts';
/** Source-scoped qualitative extraction, not an ID whitelist or free entailment.
 * Every phrase below names an explicit original passage and retains its period,
 * qualification and scope. Unknown words, conclusions and suffixes fail closed. */
import type {AnalysisFact} from './analysisEvidence.ts';
export type SourceProposition={text:string;role:'fact'|'bullish'|'bearish'|'action'};
const entry=(role:SourceProposition['role'],...text:string[])=>text.map(text=>({role,text}));
export function sourcePropositions(f:AnalysisFact):SourceProposition[]{
 if(f.verification!=='original-record'||!/^[a-f0-9]{64}$/.test(f.recordSha256))return [];
 const live=[...livePublisherPropositions(f),...publisherTablePropositions(f)];if(live.length)return live;
 const t=f.text;
 const m=f.measure;
 if(m?.valueKind==='forecast'&&/^world:20\d{2}\/20\d{2}$/.test(m.scope)&&['생산','소비','수출','기초재고','기말재고'].includes(m.metric)&&Number.isFinite(m.value)&&t.includes('전망 '+m.value+' '+m.unit)&&t.includes(m.scope.slice(6,10)+'/'+m.scope.slice(-2))){
  const calculated=m.metric==='소비'&&t.includes('= 총분배(178) - 수출(88) - 기말재고(176)')&&t.includes('계산한 전망');
  return entry('fact',
   calculated?`세계 ${f.topic}의 계산된 연간 국내사용 전망은 ${m.value} ${m.unit}입니다.`:`세계 ${f.topic} ${m.metric} 전망은 ${m.value} ${m.unit}입니다.`,
   `세계 ${f.topic}의 연간 ${m.metric} 전망은 월간 실적과 구분해야 합니다.`,
   `세계 ${f.topic} ${m.metric} 전망만으로 현재의 현물 공급 여유나 구매 원가를 판단할 수는 없습니다.`);
 }
 if(m?.metric==='price'&&m.valueKind==='actual'&&/^(?:CBOT:|USW:|palm-|ICE:|Yahoo:)/.test(m.benchmark))return entry('fact',
  `${f.topic}의 해당 가격 관측은 실제 공급사 확정 오퍼나 한국 도착원가를 뜻하지 않습니다.`,
  `${f.topic}의 가격 지표와 실제 매입 조건은 통화와 규격 및 인도 조건을 구분해 비교해야 합니다.`);
 if(f.commodity==='tapioca-starch'&&m?.benchmark==='TTSA:TS'&&m.metric==='price'&&m.unit==='USD/MT'&&m.scope==='FOB Bangkok'&&m.valueKind==='actual'&&f.sourceUrl==='https://www.thaitapiocastarch.org/en/information/statistics/weekly_tapioca_starch_price'&&t.endsWith('한국 도착가 또는 원료 카사바 생산량이 아닙니다.'))return entry('fact',
  '해당 수치는 FOB 방콕 기준의 가공 전분 가격이며, 한국 도착도 가격이나 원료 카사바 뿌리의 생산량 지표와는 구별됩니다.');
 if(f.commodity==='potato-starch'&&f.sourceUrl==='https://www.chemanalyst.com/NewsAndDeals/NewsDetails/tightening-feedstock-availability-supports-european-potato-starch-44823'&&f.observedAt==='2026-10-05'&&
  /^ChemAnalyst 2026-10-05 독자 시장평가: 유럽 원료감자 가용량 제약 우려에도 9월 말 완제품 감자전분 가격은 대체로 안정적이었다고 보도\. 가공사 커버리지와 하류 구매 조절을 배경으로 제시하며 향후 원료 품질·저장 손실을 조건부 위험으로 평가\. 공개 원문에는 정확한 가격이 가려져 있어 수치·현물 오퍼·전국 생산량이나 실제 공급 부족으로 사용하지 않습니다\.$/.test(t))return [
  ...entry('fact','보관된 유럽 시장평가에서는 원료감자 가용량 제약 우려에도 완제품 감자전분 가격이 대체로 안정적이었습니다.',
   '가공사의 커버리지와 하류 구매 조절이 당시 가격 안정의 배경으로 제시됐습니다.',
   '원료 품질 저하와 저장 손실은 후속 공급 여건에서 살펴야 할 조건부 위험으로 제시됐습니다.',
   '해당 시장평가만으로 정확한 현물 오퍼나 실제 완제품 공급 부족을 판단할 수는 없습니다.'),
  ...entry('bullish','당시 유럽 시장평가의 원료감자 가용량 제약 우려','보관된 시장평가의 원료 품질·저장 손실 위험'),
  ...entry('bearish','당시 가공사 커버리지와 하류 구매 조절에 따른 가격 안정'),
  ...entry('action','감자전분 실물 오퍼와 원료 품질 비교',
   '감자전분 공급사 오퍼와 원료 저장 품질을 비교하고 실제 납품 조건을 확인하십시오.',
   '완제품 가격의 후속 평가와 공급사의 원료 확보 범위를 함께 점검한 뒤 조달 일정을 검토하십시오.',
   '감자전분 후속 오퍼·원료 확보 범위·저장 품질 점검'),
 ];
 if(f.commodity==='potato-starch'&&f.sourceUrl==='https://ec.europa.eu/eurostat/databrowser/view/apro_cpnh1/default/table?lang=en'&&f.observedAt==='2025-12-31'&&f.measure?.metric==='raw-potato-production'&&f.measure.valueKind==='proxy'&&f.measure.scope==='DE,FR,NL,DK:all-potatoes:2025'&&f.measure.benchmark==='Eurostat:apro_cpnh1'&&t.includes('전체 감자(종자용 포함) 생산 ')&&t.endsWith('전분용 감자·완제품 감자전분 생산량·2026년 감산률·전분 함량·가공사 재고가 아닙니다.'))return entry('fact',
  '독일·프랑스·네덜란드·덴마크의 전체 감자 생산은 종자용을 포함한 원료 지표로 완제품 감자전분 생산량과 구분해야 합니다.');
 if(f.commodity==='potato-starch'&&f.sourceUrl==='https://ec.europa.eu/eurostat/databrowser/view/DS-045409/default/table?lang=en'&&f.observedAt==='2026-08'&&f.measure?.benchmark==='Eurostat:Comext:11081300'&&f.measure.scope==='EU27:extra-EU:CN11081300:2025-09~2026-08'&&t.includes('역내 교역 제외, 100kg 원단위를 MT로 변환한 물량이며 가격·단가·소비·생산·재고·공급사 확정 오퍼가 아닙니다.'))return entry('fact',
  '역외 감자전분 교역은 완제품의 흐름을 보여주지만 역내 거래와 소비·재고·가격을 직접 나타내지는 않습니다.');
 const c=f.referenceContext;
 if(f.commodity==='tapioca-starch'&&f.sourceUrl==='https://vietbacagroimex.com/en/posts/cassava-market-reference-bulletin-october-19-2026'&&f.observedAt==='2026-10-19'&&c?.receiptSha256===f.recordSha256&&c.quote.length>=80&&t.endsWith('원문 인용: “'+c.quote+'”')){
  const q=c.quote,out:SourceProposition[]=[];
  if(q.includes('The cassava and tapioca starch markets enter the new week with mixed export offers.'))out.push(...entry('fact','보관된 베트남 시장자료에서는 카사바와 타피오카전분 수출 오퍼가 혼재되어 있었습니다.'));
  if(q.includes('According to Mysteel’s reports dated October 9–10, 2026, China’s tapioca starch market remained at elevated price levels but lacked a clear direction. Input costs supported prices, while limited buying interest restrained further increases.'))out.push(
   ...entry('fact','해당 자료가 인용한 중국 시장평가에서는 원료비가 가격을 지지했지만 제한적인 매수 관심이 추가 상승을 억제했습니다.'),
   ...entry('bullish','보관된 중국 시장평가에서 제시된 원료비의 가격 지지'),
   ...entry('bearish','당시 중국의 제한적인 매수 관심에 따른 추가 상승 억제'));
  if(q.includes('Prices vary depending on quality, specifications, and destination market.')&&q.includes('does not represent a confirmed transaction price for October 19 or an official quotation from Viet Bac.'))out.push(...entry('fact','베트남 수출 참고가격은 품질과 규격 및 목적지에 따라 달라지며 실제 확정 거래가격과 구분해야 합니다.'));
  if(q.includes('These are prices within the Chinese market, with delivery and tax conditions that differ from FOB or DAF quotations. Differences between these price levels should not be used directly to determine export profit margins.'))out.push(...entry('fact','중국 내수 가격과 FOB·DAF 수출 호가는 운송 및 세금 조건이 달라 직접적인 수출 마진으로 비교할 수 없습니다.'));
  if(q.includes('Product grade, packaging, and delivery terms should be checked before making direct comparisons with Vietnamese quotations.'))out.push(
   ...entry('fact','서로 다른 제품의 가격을 비교할 때는 제품 규격과 포장·인도 조건을 함께 확인해야 합니다.'),
   ...entry('action','타피오카전분 오퍼의 규격·납기 비교',
    '타피오카전분 공급사 견적은 제품 규격과 포장·인도 조건을 먼저 맞춘 뒤 비교하십시오.',
    '타피오카전분 오퍼와 품질·포장·인도 조건 비교'));
  if(q.includes('Businesses should closely monitor Chinese buying activity, early-season raw material prices, and transportation costs to develop suitable delivery plans.'))out.push(...entry('action','중국의 후속 매수 동향과 원료 가격을 확인하고 실제 납품 일정에 맞춰 조달 조건을 검토하십시오.'));
  if(q.includes('The reference data above does not yet provide a clear basis for anticipating a broad-based price increase.'))out.push(...entry('fact','보관된 베트남 시장자료에는 전반적인 가격 상승을 예상할 명확한 근거가 제시되지 않았습니다.'));
  return out;
 }
 return [];
}
const normalized=(s:string)=>s.normalize('NFC').replace(/\s+/g,' ').trim();
export function sourcePropositionSupport(text:string,refs:AnalysisFact[],role?:SourceProposition['role']):string[]|null{
 const match=refs.find(f=>sourcePropositions(f).some(p=>(role?p.role===role:p.role!=='action')&&normalized(p.text)===normalized(text)));
 return match?[match.id]:null;
}
