import type {PotatoChartPoint,PotatoChartRegion} from './potatoProductionChart';

/** Annual production range only; estimates never define its historical bounds. */
export function potatoProductionRange(points:PotatoChartPoint[],region:PotatoChartRegion,estimateYear=2026){
 const actuals=[...new Map(points.filter(p=>p.region===region&&p.status==='Actual'&&Number.isFinite(p.productionMMT)&&p.productionMMT>=0).map(p=>[p.year,p])).values()].sort((a,b)=>a.year-b.year).slice(-5);
 const estimate=points.find(p=>p.region===region&&p.year===estimateYear&&['Derived Estimate','Official Estimate'].includes(p.status)&&Number.isFinite(p.productionMMT)&&p.productionMMT>=0);
 const low=actuals.length?Math.min(...actuals.map(p=>p.productionMMT)):null,high=actuals.length?Math.max(...actuals.map(p=>p.productionMMT)):null;
 const value=estimate?.productionMMT??null;
 const position=low!==null&&high!==null&&high>low&&value!==null?(value-low)/(high-low)*100:null;
 const status=value===null||low===null||high===null?'—':value<low?'과거 최저 하회':value>high?'과거 최고 상회':high===low?'과거 범위 일치':`밴드 ${position!.toFixed(0)}% 위치`;
 const bar=position!==null?Math.max(0,Math.min(100,position)):value!==null&&high!==null&&value>high?100:0;
 const runs:number[][]=[];for(const point of actuals){const last=runs.at(-1);if(last&&last.at(-1)===point.year-1)last.push(point.year);else runs.push([point.year]);}
 const period=runs.map(run=>run.length>1?`${run[0]}–${run.at(-1)}`:String(run[0])).join(', ');
 return {actuals,estimate,low,high,value,position,status,bar,period};
}
