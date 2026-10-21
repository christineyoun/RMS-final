/** Compatibility entry point; only dated Olein observations may update Olein. */
import {refreshPublicHistory,publicBenchmarkMetrics,loadPublicHistory} from './publicPriceHistory.ts';
export async function syncAndRollPalmOleinData(){
  const before=JSON.stringify(loadPublicHistory('palm-oil').points.filter(p=>p.benchmark==='palm-olein'));
  const history=await refreshPublicHistory('palm-oil');
  const p=publicBenchmarkMetrics(history,'palm-olein').latest;
  return {updated:before!==JSON.stringify(history.points.filter(p=>p.benchmark==='palm-olein')),latestDate:p?.date,latestPrice:p?.value};
}
export async function scrapeInvestingOleinHistory(){return (await syncAndRollPalmOleinData()).updated;}
