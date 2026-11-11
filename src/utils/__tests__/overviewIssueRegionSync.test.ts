import assert from 'node:assert/strict';
import {applyCommodityMiRegions,syncOverviewIssueRegions} from '../overviewIssueRegionSync.ts';

const url = 'https://publisher.example.org/report/alpha';
const item = (region?: string) => ({originalUrl:url,linkStatus:'verified',summary:'verified',...(region?{affectedRegion:region}:{})});
const issue = () => ({url, commodities:['wheat'],title:'Unchanged', summary:'Unchanged', source:'Unchanged', publishedAt:'2026-11-01', category:'시장 동향'} as {
  url:string;commodities:string[];title:string;summary:string;source:string;publishedAt:string;category:string;affectedRegion?:string
});

async function main() {
// Exact URL, original region only; never title/summary-derived.
{
  const a=issue();
  assert.equal(applyCommodityMiRegions([a],[{id:'wheat',articles:[item('유럽·흑해')]}]),1);
  assert.equal(a.affectedRegion,'유럽·흑해');
  assert.equal(a.title,'Unchanged');
  assert.equal(a.summary,'Unchanged');
}
// Missing region cannot be filled just because a headline mentions a country.
{
  const a=issue(); a.title='United States exports rise';
  assert.equal(applyCommodityMiRegions([a],[{id:'wheat',articles:[item()]}]),0);
  assert.equal(a.affectedRegion,undefined);
}
// Must not borrow a different commodity's article or an unverified record.
{
  const a=issue();
  assert.equal(applyCommodityMiRegions([a],[{id:'corn',articles:[item('미국')]}]),0);
  assert.equal(applyCommodityMiRegions([a],[{id:'wheat',articles:[{...item('미국'),linkStatus:'unverified'}]}]),0);
  assert.equal(applyCommodityMiRegions([a],[{id:'wheat',articles:[{...item('미국'),originalUrl:url+'/different'}]}]),0);
}
// Publisher pages reused on a different date must not be treated as the same article.
{
  const a=issue();
  assert.equal(applyCommodityMiRegions([a],[{id:'wheat',articles:[{...item('미국'),publishedAt:'2026-11-02'}]}]),0);
  assert.equal(a.affectedRegion,undefined);
}
// Conflicting labels among verified same-URL articles must not be invented/resolved arbitrarily.
{
  const a=issue();
  assert.equal(applyCommodityMiRegions([a],[{id:'wheat',articles:[item('미국'),item('글로벌')]}]),0);
  assert.equal(a.affectedRegion,undefined);
}
// Existing region survives an API outage, no writes, no new selection.
{
  const a=issue();a.affectedRegion='글로벌';let calls=0;
  await syncOverviewIssueRegions([a],[{id:'wheat',articles:[]}],(async()=>{calls++;throw Error('offline');}) as typeof fetch);
  assert.equal(calls,0);assert.equal(a.affectedRegion,'글로벌');
}
// Missing snapshot region is hydrated via saved commodity MI endpoint only.
{
  const a=issue();const calls:string[]=[];
  const mock = async (urlInput: string | URL | Request) => {
    calls.push(String(urlInput));
    return {ok:true,json:async()=>({success:true,articles:[item('미국')]})};
  };
  await syncOverviewIssueRegions([a],[{id:'wheat',articles:[item()]}],mock as unknown as typeof fetch);
  assert.equal(a.affectedRegion,'미국');
  assert.deepEqual(calls,['/api/market-intelligence?commodity=wheat']);
}
// All selected issues are treated uniformly; a missing region remains absent.
{
  const a=issue(), b={...issue(),url:'https://publisher.example.org/report/beta',commodities:['corn']};
  applyCommodityMiRegions([a,b],[{id:'wheat',articles:[item('글로벌')]},{id:'corn',articles:[{originalUrl:b.url,linkStatus:'verified'}]}]);
  assert.equal(a.affectedRegion,'글로벌');
  assert.equal((b as {affectedRegion?:string}).affectedRegion,undefined);
}
console.log('PASS: exact original Market Intelligence region source, all issue cards, no inference or article edits, conflict/outage protection.');
}
void main().catch(error => {console.error(error); process.exitCode=1;});
