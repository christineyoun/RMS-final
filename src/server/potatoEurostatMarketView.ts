/**
 * RMS Step 19 — source-synchronized Potato Starch procurement market view.
 * IMPORTANT: Eurostat apro_cpnh1 is ALL harvested potatoes (incl. seed),
 * not starch-only potato output or finished food-grade potato starch.
 * This is a rules-based source-grounded market view, not a verified price forecast.
 */
import type { OfficialPotatoEurostatResponse } from './officialPotatoEurostatService.ts';

type PotatoMarketView = {
  confidenceScore: number;
  deskRecommendation: string;
  executiveSummary: string;
  bullishFactors: string[];
  bearishFactors: string[];
  watchItems: string[];
};

const GUIDANCE = '실물 오퍼·품질 검증 후 분할 구매 검토';

export function buildPotatoEurostatMarketView(source: OfficialPotatoEurostatResponse): PotatoMarketView {
  const d = source.data;
  const valid = source.success === true &&
    (source.dataStatus === 'live-verified' || source.dataStatus === 'last-verified') &&
    !!d && /^20\d{2}$/.test(d.harvestYear) &&
    d.coverage?.length === 4 && ['DE', 'FR', 'NL', 'DK'].every(country => d.coverage.includes(country)) &&
    Number.isFinite(d.productionMMT) && d.productionMMT > 0 &&
    Number.isFinite(d.area1000HA) && d.area1000HA > 0 &&
    Number.isFinite(d.weightedYieldMTHA) && d.weightedYieldMTHA > 0;

  if (!valid || !d) {
    return {
      confidenceScore: 45,
      deskRecommendation: GUIDANCE,
      executiveSummary: 'Eurostat 독일·프랑스·네덜란드·덴마크 4개국의 동일 수확연도 감자 생산·면적 자료를 현재 검증할 수 없습니다. 종전 RMS 2026/27 감산 추정치와 연도별 증감률은 공식 실적으로 확인되지 않아 구매 판단 근거에서 제외합니다. 감자전분 실물 가격·식품용 규격·공급 가능 물량은 승인된 공급사 견적과 실제 한국 도착원가로 별도 확인한 뒤 분할 구매를 검토해야 합니다.',
      bullishFactors: [
        '원료감자의 전분 가공용 배정 비중과 실제 제분·추출 수율 미확인에 따른 공급 타이트화 가능성',
        '식품용 점도·수분·순도 등 승인 규격 충족 물량이 제한될 경우 프리미엄 상승 가능성',
        '유럽 가공사 에너지 비용과 한국향 선적·환율이 도착원가를 높일 가능성'
      ],
      bearishFactors: [
        '수입사별 승인 공급사의 실물 오퍼 경쟁이 늘면 매입 단가 완화 가능성',
        '실물 물량과 납기 확보 시 스팟·선도 혼합 구매로 가격 변동 위험 분산 가능',
        '제품 사양 적합성 검증을 전제로 대체 전분 검토 시 구매 선택지 확대 가능'
      ],
      watchItems: [
        'Eurostat apro_cpnh1 4개국 공통 수확연도 공식 생산량·수확면적·단수의 재검증',
        'Eurostat Comext 감자전분 CN 1108 13 실물 무역통계 및 대상 기간·제품 범위 확인',
        'KMC·Avebe 등 승인 공급사 식품용 오퍼, 한국 도착원가, EUR/KRW, 납기·규격 확인'
      ]
    };
  }

  const year = d.harvestYear;
  const production = d.productionMMT.toFixed(2);
  const area = d.area1000HA.toLocaleString('en-US', { maximumFractionDigits: 1 });
  const yieldValue = d.weightedYieldMTHA.toFixed(2);
  const freshness = source.dataStatus === 'last-verified'
    ? '최근 확보한 검증 자료이며 이번 요청에서 신규 자료 확인은 완료되지 않았습니다.'
    : '최신 확인 가능한 동일 연도 Eurostat 4개국 합계입니다.';
  const provisional = d.isEstimateOrProvisional ? ' 일부 원자료에는 잠정치 또는 추정치가 포함됩니다.' : '';

  return {
    confidenceScore: source.dataStatus === 'live-verified' ? 85 : 74,
    deskRecommendation: GUIDANCE,
    executiveSummary: `Eurostat ${d.dataset} ${year}년 독일·프랑스·네덜란드·덴마크 4개국 전체 감자(종자용 포함) 수확량은 ${production} MMT, 수확면적은 ${area} kHA, 생산량/면적으로 계산한 가중 단수는 ${yieldValue} MT/HA입니다. ${freshness}${provisional} 이 수치는 전분용 원료감자나 완제품 감자전분 생산량이 아니며, 전년 동기 대비 감산 여부·전분 추출률·가공사 재고는 확인되지 않았으므로 구형 RMS의 2026/27 감산률을 그대로 적용하면 안 됩니다. 농심 조달에서는 승인 공급사별 식품용 오퍼와 유럽 출발 선적조건, 운임, EUR/KRW 및 한국 도착원가를 비교해 분할 구매 시점을 결정하는 것이 적절합니다.`,
    bullishFactors: [
      '전체 감자 생산량과 전분용 가공 원료 할당량은 다르므로, 전분 가공용 수급 제약이 확인되면 승인 물량의 구매 단가가 상승할 위험',
      'KMC·Avebe 등 공급사별 전분 함량·추출 수율·식품용 점도 규격 차이로 실질 납품 가능 물량이 제한될 가능성',
      '유럽 가공용 전력·가스비, 항만 선적 운임, EUR/KRW 상승 시 한국 도착원가 압박 가능성'
    ],
    bearishFactors: [
      `Eurostat ${year}년 4개국 전체 감자 생산 ${production} MMT 확인: 추가 가공용 배정·공급사 오퍼 확보 시 가격 상단 완화 가능성`,
      '복수 승인 공급사로부터 동일 식품용 규격의 현물·선도 견적을 확보하면 구매 경쟁력 개선 가능성',
      '품질 승인 범위 내 대체 전분 검토와 선적 분할로 단일 공급처 집중 및 고점 추격 매입 위험 완화 가능성'
    ],
    watchItems: [
      `Eurostat ${d.dataset} ${year}년 4국 동일 수확연도 생산 ${production} MMT / 면적 ${area} kHA / 단수 ${yieldValue} MT/HA의 후속 수정 발표와 연도별 비교 가능 여부`,
      'Eurostat Comext CN 1108 13 감자전분 수출입(국가·기간·제품 정의) 및 공급사 실물 배정량 확인',
      'KMC·Avebe·Roquette 승인 식품용 규격, EXW/FOB/CIF 부산 오퍼, 해상운임·리드타임·EUR/KRW 환율 모니터링'
    ]
  };
}
