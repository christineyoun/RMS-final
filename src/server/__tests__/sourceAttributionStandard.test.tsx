import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SourceAttribution} from '../../components/SourceAttribution';

const html=renderToStaticMarkup(createElement(SourceAttribution,{entries:[
 {label:'USDA',url:'https://www.ers.usda.gov/publications/115627'},
 {label:'USDA',url:'https://www.usda.gov/oce/commodity/wasde/wasde1026.pdf'},
 {label:'Duplicate reference',url:'https://www.ers.usda.gov/publications/115627'},
 {label:'Open-Meteo'},
]}));
assert.equal((html.match(/<a /g)||[]).length,2,'distinct publications remain, exact duplicate URL omitted');
assert.equal((html.match(/↗/g)||[]).length,2,'only actual links receive an arrow');
assert(html.includes('<span>Open-Meteo</span>'));
assert(html.includes('rms-source-entry"><span>출처: </span><a'));
assert(!html.includes('title='));
console.log('PASS shared source grouping, unlinked attribution, exact-URL deduplication and distinct same-publisher references.');
