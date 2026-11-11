import assert from 'node:assert/strict';
import {verifiedAffectedRegion,withVerifiedAffectedRegion} from '../../utils/verifiedAffectedRegion.ts';
const u='https://example.org/article/verified-publisher-report';
const d='2026-11-02';
const make=(excerpt:string)=>({
  originalUrl:u,publishedAt:d,linkStatus:'verified' as const,
  affectedRegion: undefined as string | undefined, affected_region:'',
  verifiedSourceEvidence:{originalUrl:u,publishedAt:d,sourceHeadline:'Verified publisher report',excerpt,verifiedAt:'2026-11-03T09:00:00Z'},
  title:'Korean edited title',summary:'AI-generated Korean summary not used'
});
const text='The United States market is revising its crop demand outlook. U.S. domestic consumption increased, according to figures in the published agency report.';
const bare=make(text);
assert.equal(verifiedAffectedRegion(bare),'미국');
const normalized=withVerifiedAffectedRegion(bare);
assert.equal(normalized.affectedRegion,'미국');
assert.equal(normalized.affected_region,'미국');
assert.equal(bare.affected_region,'','No mutation of accepted source records');
assert.equal(withVerifiedAffectedRegion(normalized),normalized,'Idempotence');
assert.equal(verifiedAffectedRegion({...bare,affected_region:'글로벌'}),'글로벌','Approved MI labels must win');
assert.equal(verifiedAffectedRegion({...bare,affectedRegion:'유럽·흑해'}),'유럽·흑해');
assert.equal(verifiedAffectedRegion({...bare,linkStatus:'unverified'}),'');
assert.equal(verifiedAffectedRegion({...bare,unavailable:true}),'');
assert.equal(verifiedAffectedRegion({...bare,verifiedSourceEvidence:{...bare.verifiedSourceEvidence,originalUrl:'https://example.org/other'}}),'');
assert.equal(verifiedAffectedRegion({...bare,verifiedSourceEvidence:{...bare.verifiedSourceEvidence,publishedAt:'2026-11-01'}}),'');
assert.equal(verifiedAffectedRegion({...bare,verifiedSourceEvidence:{...bare.verifiedSourceEvidence,excerpt:'US was mentioned only in a summary but the publisher did not name a country.'}}),'');
assert.equal(verifiedAffectedRegion({...bare,verifiedSourceEvidence:{...bare.verifiedSourceEvidence,excerpt:'United States purchases were reported by local media. Thailand production forecasts were also discussed in the same publication about regional commodity flows.'}}),'','Ambiguous multi-country reports not assigned');
const noReceiptWithMisleadingSummary={...bare,verifiedSourceEvidence:undefined,summary:'U.S. U.S. United States; not original evidence'};
assert.equal(verifiedAffectedRegion(noReceiptWithMisleadingSummary),'','No inference from summaries');
const {affectedRegion: _omitted, ...withoutRegionProperty}=bare;
assert.equal(verifiedAffectedRegion(withoutRegionProperty),'미국','Region key may be absent, not merely undefined');
assert.equal(verifiedAffectedRegion({...bare,verifiedSourceEvidence:{...bare.verifiedSourceEvidence,excerpt:'Ukraine Ukraine and U.S. wheat market link was discussed with no focused geography.'}}),'','Multiple country references reject single region');
assert.equal(verifiedAffectedRegion({...bare,verifiedSourceEvidence:{...bare.verifiedSourceEvidence,excerpt:"Indonesia is a major producer and Indonesia has published the country's export estimate for the next growing season."}}),'인도네시아','No India substring confusion');
console.log('PASS: shared verified MI region inference from exact publisher evidence only; preserved labels, no guesses, no mutations, rejects missing/ambiguous/mismatched receipts.');
