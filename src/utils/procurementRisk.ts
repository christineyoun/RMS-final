import type {AnalysisFact} from '../server/analysisEvidence';

export type ProcurementRisk = {
  commodityId: string;
  level: '안정' | '주의' | '경계' | '판정 보류';
  summarySentenceKo: string;
  evidence: Array<{text:string;date:string;url:string;source:string}>;
  unavailable: string;
  criteria: string;
};

// Commodity-specific qualitative screens, not a score or a purchasing stance.
// Inputs have already passed the existing saved-source readers.
const rules = {
  wheat: {name:'밀', primary:/오데사.*(?:차질|불확실)|항만.*차질/, adverse:/흑해.*(?:차질|불확실)|오데사.*물류.*불확실|물류.*차질|운송 차질/, relief:/풍부한.*공급|충분한.*물량|생산.*상향/, scope:'수출 경로·지역별 가용량', missing:'산지별 실제 선적 지연과 목적지 도착원가'},
  corn: {name:'옥수수', primary:/(?:EU|유럽).*(?:부족|최저|감소|줄|종전보다.*적|수입 의존)/, adverse:/EU.*생산.*(?:최저|줄|감소)|(?:수출|운송|선적).*(?:차질|제약)/, relief:/미국.*(?:공급|생산).*(?:상향|증가)|생산.*전망.*상향/, scope:'EU 지역 공급·수입 의존', missing:'EU 부족분의 실제 대체 조달과 목적지별 납기'},
  soybean: {name:'대두', primary:/건조 우려|수확 지연/, adverse:/건조 우려|수확 지연|현물 공급 제약/, relief:/미국.*생산.*(?:상향|늘)|생산량.*상향/, scope:'수확·파종 지역의 현물 공급', missing:'건조 지역의 확정 수량 손실과 실제 선적 지연'},
  'soybean-oil': {name:'대두유', primary:/총공급.*(?:하향|낮)/, adverse:/재고.*(?:감소|줄)|총공급.*(?:하향|낮)|공급.*축소/, relief:/재고.*(?:증가|반등)|총공급.*상향/, scope:'미국 대두유 재고·공급 전망', missing:'NOPA 비회원사 재고와 정제유 공급사의 확정 가용량'},
  'palm-oil': {name:'팜유', primary:/인도네시아.*생산.*(?:낮|하향)/, adverse:/인도네시아.*생산.*(?:낮|하향)|팜유 공급.*(?:축소|감소)|말레이시아.*(?:재고|생산).*감소|수출.*(?:중단|제한)/, relief:/(?:MPOB|말레이시아).*재고.*(?:증가|늘)/, scope:'유지류 수출 가용량', missing:'부분월 수출의 최종 월간 실적과 2027년 업계 전망의 실현 여부'},
  sugar: {name:'설탕', primary:/태국.*생산.*(?:감소|줄)/, adverse:/태국.*생산.*(?:감소|줄)|압착량.*적|회수율.*(?:낮|하락)|생산.*전망.*(?:감소|하향)/, relief:/가용량.*늘|공급.*늘|재고.*증가|이월재고.*완충/, scope:'산지 생산·당 회수율', missing:'인도 후속 배분과 남은 압착기의 최종 생산·수출 실적'},
  'potato-starch': {name:'감자전분', primary:/단수.*하향/, adverse:/단수.*하향|원료감자.*(?:제약|확보)|전분.*수량.*감소/, relief:/감자전분 가격.*안정|완제품.*가격.*안정/, scope:'원료감자·전분 수율', missing:'전분용 감자의 최종 입고·전분 함량과 완제품 공장 재고'},
  'tapioca-starch': {name:'타피오카전분', primary:/가동률.*(?:미만|낮|하락)/, adverse:/가동률.*(?:미만|낮|하락)|원료.*(?:높|부담|부족)|공급.*제약/, relief:/기준가격.*(?:낮|하락)|달러.*낮|원료.*유입.*늘/, scope:'원료 유입·전분공장 가동', missing:'공장별 실제 출하량·완제품 재고와 납기별 확정 오퍼'},
} as const;

export function assessProcurementRisk(id:string, articles:any[], facts:AnalysisFact[]=[], now=new Date()):ProcurementRisk {
  id=id.trim().toLowerCase().replace(/_/g,'-');
  const rule=rules[id as keyof typeof rules];
  if(!rule)throw new Error(`Unknown procurement-risk commodity: ${id}`);
  const unavailable=rule?.missing || '해당 품목의 검증된 공급 근거';
  const criteria='검증된 품목별 공급·가공·물류 근거로 평가. 선물 주간 등락이나 세계 재고율 단독으로 위험 색상을 결정하지 않으며 Desk 권고와 독립적입니다.';
  // Reuse the evidence adapter's 45-day verification window; retain source dates
  // visibly. Older monthly reports never become new daily observations.
  const current=articles.filter(a=>a.linkStatus==='verified'&&!a.unavailable&&a.originalUrl&&a.summary&&
    Date.parse(a.publishedAt)<=+now&&+now-Date.parse(a.retrievedAt||a.verifiedAt||a.publishedAt)<45*86400000)
    .sort((a,b)=>Number(b.sourceType==='official')-Number(a.sourceType==='official')||b.publishedAt.localeCompare(a.publishedAt));
  const sentences=current.flatMap(a=>String(a.summary).split(/(?<=[.!?])\s+/u).map(text=>({text,date:a.publishedAt,url:a.originalUrl,source:a.sourceName})));
  const contextual=(e:ProcurementRisk['evidence'][number])=>{const first=sentences.find(s=>s.url===e.url);return first&&first!==e&&/^(직전|인용된|일부|기초)/.test(e.text)?{...e,text:first.text+' '+e.text}:e;};
  const result=(level:ProcurementRisk['level'],explanation:string,evidence:ProcurementRisk['evidence'])=>({commodityId:id,level,summarySentenceKo:explanation+(evidence.length?' '+evidence.map(contextual).map(e=>`${e.text} (${e.date})`).join(' '):''),evidence:evidence.map(contextual),unavailable,criteria});
  // Require an explicit enacted interruption. Forecasts, proposals, negation,
  // and upstream crop damage cannot alone establish finished-product disruption.
  const interruption=sentences.find(s=>/(?:수출 금지|수출 중단|선적 중단|출하 중단|가동 중단)/.test(s.text)&&
    /시행|발효|중단됐|중단했|금지했|중단되었습니다/.test(s.text)&&
    !/전망|예상|가능|검토|예정|해제|완화|아니|않/.test(s.text)&&
    (!['soybean-oil','potato-starch','tapioca-starch'].includes(id)||/대두유|정제유|전분/.test(s.text)));
  if(interruption)return result('경계',`${rule.name}의 명시된 공급·출하 중단 범위에 경계.`,[interruption]);
  const resolved=/(?:우려|차질|위험|부족|제약|지연|피해|손실)(?:가|이|은|는)?\s*(?:해소|완화|없)|부족.*아니|(?:하향|감소)\s*(?:전망|우려)?(?:이|가)?\s*철회/;
  const adverse=sentences.find(s=>rule.primary.test(s.text)&&!resolved.test(s.text))||sentences.find(s=>rule.adverse.test(s.text)&&!resolved.test(s.text));
  const relief=sentences.find(s=>rule.relief.test(s.text)&&s!==adverse);
  // A localized weather watch is not equivalent to a current procurement
  // constraint. For soybeans, require the saved crop outlook, normal planting
  // progress and physical export references together before treating it as
  // buffered. New disruption or confirmed crop damage still takes precedence.
  if(id==='soybean'&&adverse&&relief){
    const planting=sentences.find(s=>/전체 파종.*(?:일정대로|정상)|파종.*평균.*앞/.test(s.text));
    const exportOffers=sentences.find(s=>/FOB/.test(s.text)&&/미국|뉴올리언스/.test(s.text)&&/브라질|산투스/.test(s.text));
    const production=facts.find(f=>f.measure?.metric==='생산'&&f.measure.scope.startsWith('world:'));
    const use=facts.find(f=>f.measure?.metric==='소비'&&f.measure.scope===production?.measure?.scope&&f.observedAt===production?.observedAt);
    const supplyCoversUse=production&&use&&production.measure!.value>=use.measure!.value;
    const broaderConstraint=sentences.some(s=>/실제.*(?:수량 손실|작황 피해)|확인된.*(?:수량 손실|작황 피해)|수확 지연|현물 공급 제약|선적 차질|수출 제한/.test(s.text)&&!resolved.test(s.text));
    const pricePressure=facts.find(f=>f.id.includes('wow')&&f.comparison&&f.comparison.pct>4);
    const sourceEvidence=(f:AnalysisFact)=>({text:f.text,date:f.observedAt,url:f.sourceUrl,source:f.sourceTitle});
    if(planting&&exportOffers&&production&&use&&!supplyCoversUse)
      return result('주의','세계 생산이 소비를 밑도는 전망으로 공급 완충 축소에 주의합니다.',[sourceEvidence(production),sourceEvidence(use)]);
    if(planting&&exportOffers&&supplyCoversUse&&pricePressure)
      return result('주의','생산 완충에도 주간 가격 상승에 따른 원가 변동성에 주의합니다.',[sourceEvidence(pricePressure),relief]);
    if(planting&&exportOffers&&supplyCoversUse&&!broaderConstraint&&!pricePressure)
      return result('안정','생산 확대·정상 파종과 수출 참고 오퍼가 국지적 건조 우려를 완충합니다.',[relief,adverse]);
  }
  if(adverse){
    const second=id==='soybean-oil'?sentences.find(s=>s.url!==adverse.url&&rule.adverse.test(s.text)):relief;
    const qualification=id==='potato-starch'?' 완제품 공급 부족 확정과 구분합니다.':id==='tapioca-starch'?' 가격 하락만으로 공급 정상화를 판단하지 않습니다.':'';
    return result('주의',`${rule.scope} 위험에 주의.${qualification}`,[adverse,...second?[second]:[]]);
  }
  const value=(metric:string)=>facts.find(f=>f.measure?.metric===metric&&f.measure.valueKind==='forecast'&&f.measure.scope.startsWith('world:'));
  const production=value('생산'),use=value('소비'),begin=value('기초재고'),end=value('기말재고');
  const comparable=production&&use&&begin&&end&&[use,begin,end].every(f=>f.measure!.scope===production.measure!.scope&&f.observedAt===production.observedAt);
  if(comparable){
    const deficit=production.measure!.value<use.measure!.value&&end.measure!.value<begin.measure!.value;
    const evidence=[production,use,end].map(f=>({text:f.text,date:f.observedAt,url:f.sourceUrl,source:f.sourceTitle}));
    if(deficit)return result('주의','연간 생산·소비 수지와 재고 완충 축소 전망에 주의하며 확정 부족과 구분합니다.',evidence);
    if(production.measure!.value>=use.measure!.value&&end.measure!.value>=begin.measure!.value)return result('안정','검증된 연간 수급 전망의 공급 완충 범위에서 평가합니다.',evidence);
  }
  if(relief&&!['soybean-oil','potato-starch','tapioca-starch'].includes(id))return result('안정',`${rule.name}의 확인된 공급 완충 근거상 조달 노출은 제한적입니다.`,[relief]);
  return result('판정 보류',`${rule.name}의 ${rule.scope}을 분류할 검증된 공급 근거가 불충분합니다. 미확인: ${unavailable}.`,sentences.slice(0,1));
}
