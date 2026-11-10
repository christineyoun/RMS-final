import test from 'node:test';
import assert from 'node:assert/strict';
import {materialEditorialHeadline,editorialPublisherKey,recurringNewsSeriesKey,hasPotatoStarchLink} from '../newsEditorialPolicy.ts';
test('personnel announcements do not masquerade as procurement news',()=>{
 assert.equal(materialEditorialHeadline('VAVI Appoints New Chairman to Lead Potato Processing Industry'),false);
 assert.equal(materialEditorialHeadline('EU potato starch prices remain firm amid low yields'),true);
});
test('weekly tapioca reports share a series key, distinct developments do not',()=>{
 const a={title:'Thailand Cassava and Tapioca Starch Prices, Week of 28 October 2026',sourceName:'TQ Industry Starch',originalUrl:'https://tqindustry.com/a'};
 const b={...a,title:'Thailand Cassava and Tapioca Starch Prices, Week of 21 October 2026'};
 assert.equal(recurringNewsSeriesKey(a),recurringNewsSeriesKey(b));
 assert.notEqual(recurringNewsSeriesKey(a),'');
 assert.equal(editorialPublisherKey(a),'tqindustry.com');
 assert.equal(recurringNewsSeriesKey({...a,title:'Thai cassava exports decline after port restrictions'}),'');
});
test('starch requires an original-source feedstock link, not a generated summary only',()=>{
 const generic={sourceHeadline:'German table potato prices rise',title:'독일 감자전분 시장',summary:'감자전분 가격 상승'};
 assert.equal(hasPotatoStarchLink(generic),false);
 assert.equal(hasPotatoStarchLink({...generic,verifiedSourceEvidence:{excerpt:'German table potato prices rise; French growers warn about weather.'}}),false);
 assert.equal(hasPotatoStarchLink({...generic,verifiedSourceEvidence:{excerpt:'Industrial potatoes for starch processing face rising raw material prices after the low yield harvest.'}}),true);
 assert.equal(hasPotatoStarchLink({sourceHeadline:'Avebe raises starch potato contract prices'}),true);
});
