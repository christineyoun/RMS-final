import assert from 'node:assert/strict';
import {verifiedAffectedRegion,withVerifiedAffectedRegion,withFreshVerifiedAffectedRegion} from '../../utils/verifiedAffectedRegion.ts';
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
// New editorial records may carry unverified model/heuristic default geography.
// Derive from original publisher receipt instead, without changing saved records.
const usSource=make('United States buyers revised soybean purchases. U.S. domestic demand remains elevated and United States processors reported a change.');
assert.equal(withFreshVerifiedAffectedRegion({...usSource,affectedRegion:'글로벌',affected_region:'글로벌'}).affectedRegion,'미국');
assert.equal(withVerifiedAffectedRegion({...usSource,affectedRegion:'글로벌'}).affectedRegion,'글로벌','Previously approved labels must remain unchanged');
assert.equal(withFreshVerifiedAffectedRegion({...usSource,linkStatus:'unverified',affectedRegion:'글로벌'}).affectedRegion,'','Cannot turn a model hint into approval');
const eu=make('European Union potato yields declined across the EU-4 processing region while France and Belgium reported varying crop conditions. Germany also reported reduced production.');
assert.equal(verifiedAffectedRegion({...eu,sourceHeadline:'EU potato crop outlook',verifiedSourceEvidence:{...eu.verifiedSourceEvidence,sourceHeadline:'EU potato crop outlook'}}),'유럽');
const belgium=make('Belgian potato availability tightened while French processing demand stabilized. Belgium faces lower starch potato supply while France reports balanced contracts.');
assert.equal(verifiedAffectedRegion({...belgium,sourceHeadline:'Belgian shortage and French demand',verifiedSourceEvidence:{...belgium.verifiedSourceEvidence,sourceHeadline:'Belgian shortage and French demand'}}),'벨기에·프랑스');
assert.equal(verifiedAffectedRegion({...belgium,sourceHeadline:'Belgian shortage and French demand',verifiedSourceEvidence:{...belgium.verifiedSourceEvidence,sourceHeadline:'Unrelated report'}}),'','Mismatched publisher headline must not be trusted');
const sri=make('Sri Lankan potato growers face procurement delays in Badulla. Sri Lanka producers report weaker demand than last season.');
assert.equal(verifiedAffectedRegion({...sri,sourceHeadline:'Sri Lanka grower report',verifiedSourceEvidence:{...sri.verifiedSourceEvidence,sourceHeadline:'Sri Lanka grower report'}}),'스리랑카');
const ambiguous=withFreshVerifiedAffectedRegion({...make('US purchases and Chinese demand were compared in this report. The United States and China both discussed new trade volumes.'),affectedRegion:'글로벌'});
assert.equal(ambiguous.affectedRegion,'','Do not infer a country from ambiguous multi-country original evidence');
assert.equal(withFreshVerifiedAffectedRegion({...usSource,verifiedSourceEvidence:{...usSource.verifiedSourceEvidence,originalUrl:'https://example.org/other'}}).affectedRegion,'','No inference from mismatched receipt');
console.log('PASS: shared verified MI region inference from exact publisher evidence only; preserved labels, no guesses, no mutations, rejects missing/ambiguous/mismatched receipts.');
