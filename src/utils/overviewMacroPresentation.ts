/** Presentation of an already selected, verified record. No keyword classifier or new evidence rules. */
export function policyRecordPresentation(record:any) {
 const kinds:Record<string,string>={'industry-outlook':'업계 전망',proposed:'제안 단계',enacted:'공포된 조치',effective:'시행 중',announcement:'공식 발표'};
 const recordKind=Object.hasOwn(kinds,record?.recordKind)?record.recordKind:'announcement';
 // A directional interpretation must be supplied with the selected record's supported implication.
 const statusType=record?.procurementImplication&&['favorable','warning'].includes(record.statusType)?record.statusType:'neutral';
 const classificationLabel=statusType==='favorable'?'우호적':statusType==='warning'?'주의':'중립적';
 const qualifier=recordKind==='industry-outlook'?'확정된 정부 조치가 아닌 업계 전망입니다.':recordKind==='proposed'?'제안 단계이며 확정·시행된 조치가 아닙니다.':recordKind==='enacted'?'공포된 조치이며 실제 시행 조건과 시행일은 별도 확인이 필요합니다.':recordKind==='effective'?'원문에 명시된 시행 범위와 조건에 한정해 해석합니다.':'발표 사실과 실제 시행·조달 영향을 구분해 확인합니다.';
 const summary=[record?.summary||record?.title||'새 공식 발표가 확인되지 않았습니다.',record?.procurementImplication||'구체적인 조달 영향은 확인되지 않았습니다.',qualifier].join(' ');
 return {...record,recordKind,title:record?.displayTitle||record?.title||'통상 정책',summary,statusType,classificationLabel,statusTag:record?.procurementStatus||record?.statusTag||classificationLabel,recordKindLabel:kinds[recordKind]};
}

/** Potential energy/freight cost pressure from the verified quote comparison, not realized landed cost. */
export function brentCostSignal(change:unknown):{status:string;badgeType:'orange'|'green'|'amber'} {
 if(typeof change!=='number'||!Number.isFinite(change))return {status:'전일 비교 미제공',badgeType:'amber'};
 if(change>0)return {status:'원가 부담 주의',badgeType:'orange'};
 if(change<0)return {status:'원가 부담 완화 가능',badgeType:'green'};
 return {status:'유가 보합',badgeType:'amber'};
}
