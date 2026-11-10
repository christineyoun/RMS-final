import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractGrounding} from './grounding.ts';

test('extracts only actual provider metadata, with query and citation count',()=>{
  const r=extractGrounding({
    text:'Model invented URL https://fake.example.org/anywhere',
    candidates:[{groundingMetadata:{
      webSearchQueries:['soybean USDA 2026'],
      groundingChunks:[{web:{uri:'https://www.usda.gov/specific-report',title:'USDA report'}},{web:{uri:'https://vertexaisearch.cloud.google.com/grounding-api-redirect/xyz',title:'Reuters'}}],
      groundingSupports:[{segment:{text:'source-backed text'},groundingChunkIndices:[0]}],
    }}],
  });
  assert.equal(r.hasGoogleCitations,true);
  assert.equal(r.sources.length,2);
  assert.equal(r.webSearchQueries.length,1);
  assert.equal(r.groundingSupportCount,1);
  assert.equal(r.sources[1].needsRedirectResolution,true);
});

test('returns no citations when model merely writes plausible URLs',()=>{
  const r=extractGrounding({text:'https://www.usda.gov/article',candidates:[{content:{parts:[{text:'https://www.usda.gov/article'}]}}]});
  assert.equal(r.metadataPresent,false);
  assert.equal(r.hasGoogleCitations,false);
  assert.equal(r.sources.length,0);
});

test('excludes unsafe URLs and duplicates',()=>{
  const r=extractGrounding({candidates:[{groundingMetadata:{groundingChunks:[
    {web:{uri:'file:///etc/passwd'}},{web:{uri:'http://example.com/news'}},
    {web:{uri:'https://usda.gov/report',title:'USDA'}},{web:{uri:'https://usda.gov/report',title:'again'}},
  ]}}]});
  assert.deepEqual(r.sources.map(s=>s.uri),['https://usda.gov/report']);
});
