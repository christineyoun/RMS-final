import test from 'node:test';
import assert from 'node:assert/strict';
import {materialMarketHeadline,potatoStarchMarketSubject} from '../newsCandidateQuality.ts';

test('reject personnel announcements even when potato processing is mentioned',()=>{
 assert.equal(materialMarketHeadline('VAVI Appoints Aviko’s Dick Zelhorst as Chairman to Lead Dutch Potato Processing Industry'),false);
 assert.equal(materialMarketHeadline('Sugar company appoints new CEO'),false);
 assert.equal(materialMarketHeadline('Avebe starch potato supply tightens after smaller harvest'),true);
});
test('require a potato-starch or starch-feedstock link plus a market driver',()=>{
 assert.equal(potatoStarchMarketSubject('VAVI industry appointment','Dutch potato processing industry'),false);
 assert.equal(potatoStarchMarketSubject('Avebe raises starch potato contract prices','European growers report higher input costs'),true);
 assert.equal(potatoStarchMarketSubject('Potato processing output grows','French potatoes for fries'),false);
 assert.equal(potatoStarchMarketSubject('Potato starch exports rise','Output reduced by poor yields'),true);
});
