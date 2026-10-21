import assert from 'node:assert/strict';
import {layoutEndpointLabels} from '../../utils/chartEndpointLabels.ts';
const overlaps=(a:any,b:any)=>a.left<b.left+b.width&&b.left<a.left+a.width&&a.top<b.top+b.height&&b.top<a.top+a.height;
for(const height of [160,192,208,320])for(const values of [[100,100],[100,100.01],[10,145],[0,0],[150,150],[75,75,75],[0,1,150]]){
  const boxes=values.map((v,i)=>({id:String(i),anchorX:600,anchorY:v/150*height,width:90+i*10,height:22.5}));
  const result=layoutEndpointLabels(boxes,{width:600,height});
  assert.equal(result.length,boxes.length);
  for(const box of result){
    assert.ok(box.top>=1&&box.top+box.height<=height-1,JSON.stringify({height,values,result}));
    assert.equal(box.left+box.width,600,'right edge stays at the endpoint; no separate label column');
    for(const dot of boxes)assert.ok(box.top+box.height<=dot.anchorY-6+.001||box.top>=dot.anchorY+6-.001,'endpoint dots stay visible');
  }
  for(let i=0;i<result.length;i++)for(let j=i+1;j<result.length;j++)assert.equal(overlaps(result[i],result[j]),false);
  assert.deepEqual(layoutEndpointLabels(boxes,{width:600,height}),result);
}
const separate=layoutEndpointLabels([{id:'a',anchorY:60,width:100,height:20},{id:'b',anchorY:170,width:100,height:20}],{width:500,height:200});
assert.equal(separate[0].top,26);assert.equal(separate[1].top,136,'well-separated badges retain the original -170% offset');
const disjoint=layoutEndpointLabels([{id:'a',anchorX:120,anchorY:100,width:100,height:20},{id:'b',anchorX:500,anchorY:100,width:100,height:20}],{width:500,height:200});
assert.ok(disjoint.every(b=>b.top===66),'horizontally separate badges need no vertical adjustment');
const pair=layoutEndpointLabels([{id:'cpo',anchorY:100,width:100,height:20},{id:'olein',anchorY:100,width:100,height:20}],{width:500,height:200});
assert.ok(pair.every(b=>Math.abs(b.top-66)<=22),'equal-price pair stays close to its endpoints');
const wheat=layoutEndpointLabels([{id:'hrw',anchorY:105,width:100,height:20.5},{id:'hrs',anchorY:118,width:100,height:20.5},{id:'srw',anchorY:126,width:100,height:20.5}],{width:500,height:208});
assert.ok(wheat.every(b=>b.top+b.height<b.anchorY),'multi-series badges stay above their points when room exists');
assert.ok(wheat.every(b=>b.anchorY-b.top-b.height<65),'a boundary-constrained stack does not unnecessarily move the last badge far away');
console.log('PASS: compact right-edge badges; original above-point offset when clear; equal/near prices; visible endpoint dots; bounds; no column or changed plot dimensions.');
