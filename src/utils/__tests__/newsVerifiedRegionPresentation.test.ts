import assert from 'node:assert/strict';
import {marketNewsCardMetadata} from '../marketNewsPresentation.ts';
// The MI card must not guess a location from translated AI headlines/summaries.
assert.equal(marketNewsCardMetadata({title:'Thai tapioca market rises',summary:'Vietnam prices rose',sourceEvidenceOnly:true}).affectedRegion,'미확인');
assert.equal(marketNewsCardMetadata({title:'US market report',summary:'United States exports rose',sourceEvidenceOnly:true}).affectedRegion,'미확인');
assert.equal(marketNewsCardMetadata({title:'US market report',summary:'United States exports rose',affectedRegion:'미국',sourceEvidenceOnly:true}).affectedRegion,'미국');
assert.equal(marketNewsCardMetadata({title:'US market report',summary:'United States exports rose',affectedRegion:'글로벌',sourceEvidenceOnly:true}).affectedRegion,'글로벌','Existing approved global labels remain unchanged');
assert.equal(marketNewsCardMetadata({title:'US market report',summary:'United States exports rose',affectedRegion:'EU',sourceEvidenceOnly:true}).affectedRegion,'유럽연합');
// Other consumers of the legacy presentation helper retain their old semantics.
assert.equal(marketNewsCardMetadata({title:'Thai tapioca market rises',summary:'Vietnam prices rose'}).affectedRegion,'태국');
console.log('PASS: Market Intelligence region display trusts source-bound metadata, not AI summary geography.');
