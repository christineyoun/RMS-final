/** Bounded translations of independently collected original passages. Each
 * rule requires its entire source sentence, commodity and publisher identity.
 * Presence of an evidence ID, price level or unrelated page words is not proof. */
import type {AnalysisFact} from './analysisEvidence.ts';
import type {SourceProposition} from './analysisSourcePropositions.ts';
export function livePublisherPropositions(f:AnalysisFact):SourceProposition[]{
 const c=f.referenceContext;if(!f.id.startsWith('live-article-')||!c||c.receiptSha256!==f.recordSha256||f.verification!=='original-record'||!/^20\d{2}-\d{2}-\d{2}$/.test(f.observedAt))return [];
 const q=c.quote.replace(/[‐‑–—]/g,'-').replace(/\s+/g,' '),out:SourceProposition[]=[],date=f.observedAt;
 // A reviewed translation may contain several distinct source statements.
 // Expose each as an atomic, independently bound proposition; the compiler
 // continues to validate every displayed sentence separately.
 const add=(role:SourceProposition['role'],anchor:string,text:string)=>{if(q.includes(anchor))for(const sentence of role==='fact'?text.split(/(?<=[.!?])\s+(?=[가-힣A-Z0-9])/):[text])out.push({role,text:sentence});};
 if(f.commodity==='soybean'&&new URL(f.sourceUrl).hostname==='commodity-board.com'){
  const offer=/As of ([A-Za-z]+) (\d{1,2}), US soybeans for ([A-Za-z]+) shipment were quoted at ([\d.]+) US-dollars per tonne FOB New Orleans, compared with ([\d.]+) US-dollars per tonne FOB Santos for Brazilian beans\./.exec(q);
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  if(offer&&months.includes(offer[1])&&months.includes(offer[3])&&Number(offer[2])>=1&&Number(offer[2])<=31&&Number(offer[4])>0&&Number(offer[5])>0){
   add('fact',offer[0],`${date} 대두 보도는 ${months.indexOf(offer[1])+1}월 ${Number(offer[2])}일 기준 ${months.indexOf(offer[3])+1}월 선적 미국 뉴올리언스 FOB 오퍼를 톤당 ${offer[4]}달러, 브라질 산투스 FOB 오퍼를 ${offer[5]}달러로 제시했습니다.`);
   add('fact',offer[0],'이는 원산지별 선적 참고 오퍼이며 운임·관세·실행 환율을 반영한 한국 도착원가나 확정 거래가격과 구분해야 합니다.');
  }
  const planting=/Mato Grosso planting is reported at around ([\d.]+)% complete, ahead of its five-year average near ([\d.]+)%, though some northern areas complain about dryness\./.exec(q);
  if(planting&&Number(planting[1])>Number(planting[2])&&Number(planting[1])<=100&&Number(planting[2])>=0){
   add('fact',planting[0],`${date} 대두 보도는 브라질 마토그로소의 파종률을 약 ${planting[1]}%로 제시해 5년 평균 약 ${planting[2]}%보다 빠르다고 전했습니다.`);
   add('fact',planting[0],'다만 북부 일부 지역에서는 건조 우려가 함께 보고됐습니다. 지역 파종 진행과 건조 우려만으로 브라질 전체 생산량이나 가격 방향을 확정할 수는 없습니다.');
  }
 }
 if(f.commodity==='wheat'&&new URL(f.sourceUrl).hostname==='commodity-board.com'){
  const area='EU soft wheat area for the 2027 harvest is now expected to shrink by around 2%, led by rising input costs and a slight downgrading of planted area estimates.';
  add('fact',area,`${date} 유럽 연질밀 보도는 투입비 상승과 파종면적 추정 하향을 배경으로 다음 수확기의 재배면적 축소를 전망했습니다.`);
  add('bullish',area,'해당 유럽 보도의 차기 연질밀 재배면적 축소 전망');
  add('fact','Higher operating costs are discouraging marginal hectares, particularly in lower-yielding or riskier regions.','높아진 영농비용이 저수량·고위험 지역의 한계 경작을 억제한다는 평가이며, 이후 실제 파종과 수확 결과로 확인해야 하는 전망입니다.');
  add('fact','At the same time, current spot quotations in Ukraine and Germany show only modest day-to-day moves, signalling comfortable nearby availability but growing sensitivity to weather and yield risks for 2027.','당시 우크라이나와 독일 현물 호가는 소폭 변동에 그쳤지만, 차기 작황의 기상과 단수 위험에는 민감해질 수 있다고 설명했습니다.');
  add('fact','Ukrainian wheat continues to trade at a wide discount to both U.S. and French origins, keeping Black Sea supplies competitive but capping any short-term rebound.',`${date} 우크라이나 밀 보도는 미국·프랑스산 대비 할인된 흑해산 가격이 경쟁력을 유지하면서도 단기 반등을 제한한다고 평가했습니다.`);
  add('bearish','Ukrainian wheat continues to trade at a wide discount to both U.S. and French origins, keeping Black Sea supplies competitive but capping any short-term rebound.','당시 흑해산 밀의 경쟁적인 할인 가격에 따른 단기 반등 제한');
  add('action',area,'밀 파종 전망·규격별 오퍼 비교');
  add('action',area,'유럽의 후속 파종면적 전망과 실제 작황을 확인한 뒤 구매 규격별 공급사 오퍼와 선적 조건을 비교하십시오.');
  add('action','Ukrainian wheat continues to trade at a wide discount to both U.S. and French origins, keeping Black Sea supplies competitive but capping any short-term rebound.','흑해산과 미국·프랑스산의 가격은 단백질 규격과 인도 조건을 맞춘 뒤 비교하고 실제 납기와 운임을 확인하십시오.');
  add('action',area,'유럽의 실제 파종 진행과 후속 재배면적 전망을 확인하십시오.');
 }
 if(f.commodity==='corn'&&new URL(f.sourceUrl).hostname==='commodity-board.com'){
  add('fact','Corn markets remain under downward pressure, with futures on both sides of the Atlantic near recent lows as the U.S. harvest advances and Argentina’s crop outlook improves.',`${date} Commodity Board는 미국 수확 진척과 아르헨티나 작황 전망 개선으로 옥수수 선물이 하방 압력을 받고 있다고 보도했습니다.`);
  add('bearish','The combination of another large U.S. crop and improving export competition from South America is contributing to expectations of higher U.S. ending stocks in 2026/27.','미국 대규모 수확과 남미 수출 경쟁에 따른 미국 옥수수 재고 증가 전망');
  add('fact','However, fresh Ukrainian volumes into the EU have slowed markedly in the latest week, underlining ongoing risks around Black Sea and Danube logistics.','같은 보도에서 최근 주간 우크라이나산의 EU 유입은 크게 둔화됐으며, 흑해와 다뉴브 물류 위험이 남아 있다고 설명했습니다.');
  add('bullish','However, fresh Ukrainian volumes into the EU have slowed markedly in the latest week, underlining ongoing risks around Black Sea and Danube logistics.','우크라이나산 EU 유입 둔화와 흑해·다뉴브 물류 위험');
  add('fact','For European feed users, current prices offer attractive coverage opportunities, while producers face a challenging margin environment.','유럽 사료 구매자의 가격 커버 기회에 관한 평가이며, 이를 한국 식품용 옥수수의 즉시 매입 신호로 확대해서는 안 됩니다.');
  add('fact','The corn market is being reshaped less by crop volume than by the timing and quality of exportable Ukrainian supplies.',`${date} 별도 우크라이나 보도는 총생산량보다 수출 가능한 옥수수의 공급 시점과 품질이 중요해졌다고 평가했습니다.`);
  add('fact','At the same time, drier southern fields have largely been harvested, creating a two-speed crop with uneven quality.','건조한 우크라이나 남부는 수확이 상당 부분 진행됐지만 지역별 품질 편차가 남아 있어, 산지 전체를 동일한 품질의 공급으로 볼 수는 없습니다.');
  add('action','The corn market is being reshaped less by crop volume than by the timing and quality of exportable Ukrainian supplies.','옥수수 품질·선적 가능 일정 비교');
  add('action','The corn market is being reshaped less by crop volume than by the timing and quality of exportable Ukrainian supplies.','우크라이나산 오퍼는 실제 품질 규격과 선적 가능 일정을 먼저 확인한 뒤 다른 산지 조건과 비교하십시오.');
  add('action','At the same time, drier southern fields have largely been harvested, creating a two-speed crop with uneven quality.','산지별 수확·건조 상태와 납품 규격의 차이를 점검하고 공급사가 제시한 물량의 인도 조건을 확인하십시오.');
  add('action','However, fresh Ukrainian volumes into the EU have slowed markedly in the latest week, underlining ongoing risks around Black Sea and Danube logistics.','흑해·다뉴브의 실제 선적 진행과 공급사 납기 변경 여부를 확인하십시오.');
 }
 if(f.commodity==='potato-starch'&&f.sourceUrl==='https://www.chemanalyst.com/NewsAndDeals/NewsDetails/tightening-feedstock-availability-supports-european-potato-starch-44823'){
  const raw='Germany and Poland are facing smaller potato crops because of reduced acreage, drought, heat, and weather-related quality issues, limiting the feedstock pool available for Potato starch production.';
  add('fact',raw,`${date} 유럽 시장평가는 독일·폴란드의 재배면적 축소와 가뭄·고온, 품질 문제로 전분용 감자 원료 확보 여건이 제약됐다고 설명했습니다.`);
  add('bullish',raw,'해당 유럽 시장평가의 전분용 원료감자 가용량 제약');
  const stable='Despite tighter raw material conditions, finished Potato starch prices remained largely stable by late September, reflecting adequate processor coverage and controlled downstream procurement.';
  add('fact',stable,'다만 9월 말 완제품 감자전분 가격은 가공사의 확보 물량과 하류 구매 조절을 배경으로 대체로 안정적이었다고 평가했습니다. 원료 부담과 완제품 가격을 동일시해서는 안 됩니다.');
  add('bearish',stable,'당시 가공사 확보 물량과 하류 구매 조절에 따른 완제품 가격 안정');
  const risk='Storage and quality risks could become increasingly important as the new season progresses, particularly if additional losses reduce the volume of potatoes suitable for starch processing.';
  add('fact',risk,'추가 저장 손실로 가공에 적합한 감자가 줄어들 경우 품질·저장 위험의 중요성이 높아질 수 있다는 조건부 평가이며, 현재 완제품 공급 부족을 확정한 내용은 아닙니다.');
  add('action',stable,'감자전분 원료 품질·납기와 오퍼 비교');
  add('action',stable,'원료 제약만으로 완제품 가격 상승을 단정하지 말고 공급사의 실제 제품 오퍼와 확보 물량, 납기 조건을 비교하십시오.');
  add('action',risk,'전분용 감자의 저장 품질과 가공 적합성 변화를 확인한 뒤 실제 납품 일정에 맞춰 공급사 조건을 점검하십시오.');
  add('action',risk,'감자 저장 품질과 가공용 원료 확보·납기 변화를 확인하십시오.');
 }
 if(f.commodity==='sugar'&&f.sourceUrl==='https://www.igrain.in/posts/sugar-production-in-thailand-expected-to-decline-by'){
  const production='The Bangkok-based office of the U.S. Department of Agriculture’s (USDA) Foreign Agricultural Service (FAS) has projected that sugar production in Thailand will fall by 2.5 million tonnes-from 12 million tonnes in the 2025-26 season to 9.5 million tonnes in the 2026-27 season.';
  add('fact',production,`${date} 태국 설탕 보도는 미국 농무부 방콕 사무소를 인용해 2026/27 시즌 생산량이 1,200만 톤에서 950만 톤으로 줄어들 것으로 전망했습니다.`);
  add('bullish',production,'태국의 2026/27 시즌 설탕 생산 감소 전망에 따른 수출 공급 위험');
  const stocks='However, given the substantial existing carryover stocks, the overall supply and availability of sugar are expected to remain favorable despite this decline in production.';
  add('fact',stocks,'다만 상당한 이월재고가 생산 감소를 완충해 공급 가용량은 양호할 것으로 예상했습니다. 생산 감소 전망을 당장의 설탕 부족이나 확정 가격 상승으로 해석해서는 안 됩니다.');
  add('bearish',stocks,'해당 태국 전망의 상당한 이월재고에 따른 생산 감소 완충');
  add('fact','The USDA office estimates that Thailand’s total sugar exports for the 2026-27 marketing season will reach 7 million tonnes, comprising 3 million tonnes of raw sugar and 4 million tonnes of refined sugar.','같은 보도의 수출 전망은 원당과 정제당을 합친 물량입니다. 원당 선물 지표와 정제 백설탕의 실제 공급사 오퍼는 제품 규격과 인도 조건을 나눠 비교해야 합니다.');
  add('action',production,'원당·정제당 규격별 오퍼와 작황 비교');
  add('action',production,'태국의 후속 생산 전망과 실제 압착·회수율을 확인한 뒤 구매 제품 규격에 맞는 공급사 오퍼와 납기를 비교하십시오.');
  add('action',stocks,'이월재고가 실제 출하를 얼마나 완충하는지 점검하고 원당 선물과 정제당의 계약 조건을 구분해 확인하십시오.');
  add('action',stocks,'태국 이월재고와 실제 출하, 후속 생산 전망을 함께 점검하십시오.');
 }
 if(f.commodity==='sugar'&&new URL(f.sourceUrl).hostname==='www.chinimandi.com'){
  const policy='As per the tender document, the government has issued directions that sugar diversion for ethanol be reduced to zero for ESY 2026-27.';
  add('fact',policy,`${date} 인도 입찰 보도는 정부가 해당 에탄올 공급연도의 설탕 전용을 없애도록 지시했다고 전했습니다.`);
  add('bearish',policy,'인도 에탄올 입찰의 설탕 전용 제외에 따른 설탕 가용량 확대 가능성');
  add('action',policy,'인도 입찰 지침·실제 생산과 오퍼 비교');
 }
 if(f.commodity==='palm-oil'&&f.sourceUrl==='https://www.sunsirs.com/commodity-news/petail-36906.html'){
  const survey='According to cargo surveyors, Malaysia’s palm oil exports for the first half of October increased by 43.2% to 58.3% compared to the previous period.';
  add('fact',survey,`${date} 보도에서 화물 조사기관들은 말레이시아 10월 상반월 팜유 수출이 비교 기간보다 43.2~58.3% 늘었다고 추정했습니다.`);
  add('bullish',survey,'화물 조사기관의 말레이시아 상반월 팜유 수출 증가 추정');
  add('fact','This has significantly strengthened expectations for a reduction in palm oil inventories, providing solid support for spot prices.','해당 보도는 수출 증가가 재고 감소 기대와 현물가격 지지를 강화했다고 평가했지만, 월말 확정 재고가 이미 줄었다는 뜻은 아닙니다.');
  add('action',survey,'팜유 수출 추정·확정 재고와 오퍼 비교');
  add('action',survey,'상반월 수출 추정치를 후속 월간 확정 실적과 비교하고 실제 정제유 공급사의 납기와 견적을 확인하십시오.');
  add('action',survey,'말레이시아 후속 수출 조사와 월간 확정 재고를 비교하십시오.');
 }
 if(f.commodity==='palm-oil'&&f.sourceUrl==='https://theedgemalaysia.com/node/821487'){
  const stocks='Malaysia’s total palm oil stocks rose by 691,835 tonnes, or 24.54%, to 3.51 million tonnes in September this year from 2.8 million tonnes a month earlier, according to the Malaysian Palm Oil Board (MPOB).';
  add('fact',stocks,`${date} 말레이시아 보도에 인용된 MPOB 집계에서 9월 팜유 재고는 전월보다 24.54% 늘어난 351만 톤이었습니다.`);
  add('bearish',stocks,'MPOB 집계의 말레이시아 9월 팜유 재고 증가');
  add('fact','On production, MPOB said CPO output rose 16.48%, or 299,451 tonnes, to 2.11 million tonnes in September.','같은 집계에서 9월 조팜유 생산도 전월보다 늘었습니다. 조팜유 생산과 전체 팜유 재고는 제품 범위가 다르므로 동일한 물량으로 해석해서는 안 됩니다.');
  add('action',stocks,'월말 재고의 후속 변화를 확인한 뒤 조팜유와 정제유의 제품 규격 및 인도 조건을 맞춰 공급사 오퍼를 비교하십시오.');
 }
 if(f.commodity==='tapioca-starch'&&f.sourceUrl==='https://vietbacagroimex.com/en/posts/cassava-market-reference-bulletin-october-19-2026'){
  const demand='According to Mysteel’s reports dated October 9-10, 2026, China’s tapioca starch market remained at elevated price levels but lacked a clear direction. Input costs supported prices, while limited buying interest restrained further increases.';
  add('fact',demand,`${date} 베트남 시장자료가 재인용한 10월 9~10일 중국 평가에서는 원료비가 타피오카전분 가격을 지지했지만 제한적인 매수 관심이 추가 상승을 억제했습니다.`);
  add('bullish',demand,'해당 중국 시장평가에서 제시된 원료비의 타피오카전분 가격 지지');
  add('bearish',demand,'해당 중국 시장평가의 제한적인 매수 관심과 추가 상승 억제');
  const terms='Product grade, packaging, and delivery terms should be checked before making direct comparisons with Vietnamese quotations.';
  add('fact',terms,'베트남산과 태국산 참고 호가를 비교할 때에는 전분의 제품 규격과 포장, 인도 조건을 먼저 맞춰야 한다고 설명했습니다.');
  add('fact','These are prices within the Chinese market, with delivery and tax conditions that differ from FOB or DAF quotations. Differences between these price levels should not be used directly to determine export profit margins.','중국 내수 가격은 운송·세금 조건이 FOB 및 DAF 수출 호가와 다르므로, 그 가격 차이를 수출 마진으로 직접 사용할 수 없습니다.');
  add('fact','The reference data above does not yet provide a clear basis for anticipating a broad-based price increase.','해당 자료는 전반적인 가격 상승을 예상할 명확한 근거가 아직 없다고 평가했습니다. 참고 호가는 당일의 확정 거래가격이나 공급사의 실행 가능한 오퍼와 구분해야 합니다.');
  add('action',terms,'타피오카전분 규격·납기와 오퍼 비교');
  add('action',terms,'타피오카전분 공급사의 견적은 제품 규격과 포장·인도 조건을 맞춘 뒤 비교하고 실제 납품 일정을 확인하십시오.');
  const monitor='Businesses should closely monitor Chinese buying activity, early-season raw material prices, and transportation costs to develop suitable delivery plans.';
  add('action',monitor,'중국의 후속 매수 동향과 원료 가격, 운송비를 점검한 뒤 실제 발주 일정에 맞춰 조달 조건을 검토하십시오.');
  add('action',monitor,'중국 매수 동향과 카사바 원료 가격·운송비를 확인하십시오.');
 }
 if(f.commodity==='soybean-oil'&&new URL(f.sourceUrl).hostname==='www.fastmarkets.com'){
  const stocks='Data released by the National Oilseed Processors Association (NOPA) on October 15 showed that soybean oil stocks among members were down by 12.3% on the month to 1.05 billion pounds in September, from 1.20 billion pounds in August.';
  add('fact',stocks,`${date} 시장 보도에 따르면 NOPA 회원사의 9월 대두유 재고가 전월보다 12.3% 감소한 10억5,000만 파운드라고 보도했습니다.`);
  add('bullish',stocks,'NOPA 회원사 9월 대두유 재고 감소에 따른 재고 완충력 축소');
  const slowdown='Still, in the last month or so, biofuel sector demand for soybean oil and other feedstocks slowed, market sources said, with several biofuel production plants reportedly offline for planned and unplanned maintenance at the US Gulf Coast and in the Midwest.';
  add('fact',slowdown,'다만 시장 관계자들은 최근 바이오연료용 대두유 등 원료 수요가 둔화했으며, 미국 걸프와 중서부 일부 설비가 정비로 가동을 멈췄다고 전했습니다.');
  add('bearish',slowdown,'시장 관계자가 전한 미국 일부 바이오연료 설비 정비와 원료 수요 둔화');
  add('fact','The latest NOPA data also showed that as US soybean oil stocks continued to decrease, soybean crush also extended lower in September, slipping to a 13-month low at 196.3 million bushels.','같은 NOPA 자료의 9월 회원사 대두 착유량도 감소했습니다. 회원사 재고와 착유 실적은 미국 정제유 전체의 공급 부족을 확정하는 지표와 구분해야 합니다.');
  add('action',stocks,'대두유 재고·가동과 실제 오퍼 비교');
  add('action',stocks,'NOPA 후속 재고와 착유 실적을 확인하고, 실제 정제유 공급사의 견적과 납기 조건을 대조하십시오.');
  add('action',slowdown,'바이오연료 설비의 정비 종료와 원료 수요 회복 여부를 확인한 뒤 공급사 오퍼의 변화를 비교하십시오.');
  add('action',slowdown,'미국 바이오연료 설비 재가동과 후속 원료 수요를 점검하십시오.');
 }
 return out;
}
