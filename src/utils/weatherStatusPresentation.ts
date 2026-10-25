/** Visibility only. Screening, expiry and diagnostics remain owned by the weather assessment. */
export function isVisibleWeatherStatus(label:string):boolean {
 return ['양호','고온 주의','저온 주의','강수 부족 주의','강수 과다 주의'].includes(label);
}
export function visibleWeatherLabels(status:string):string[] {
 return [...new Set(status.split(' · ').map(label=>label==='강수 집중'?'강수 과다 주의':label).filter(isVisibleWeatherStatus))];
}
