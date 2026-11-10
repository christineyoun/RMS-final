'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');
const source=fs.readFileSync(path.join(process.cwd(),'src/components/OverviewTerminal.tsx'),'utf8');
test('Palm Oil Overview retains benchmark but not redundant secondary MDEX caption',()=>{
 assert.match(source,/MDEX: FCPO BENCHMARK/);
 assert.doesNotMatch(source,/MDEX \(FCPO\)\s*·/);
 assert.doesNotMatch(source,/\{item\.id === 'palm-oil' && \(\s*<p className="text-\[10px\] text-slate-400 font-mono/);
 assert.match(source,/id=\{\x60el-\$\{item\.id\}-price\x60\}/);
 assert.match(source,/\{commodityBenchmarkDisplay\(item,currency\)\.value\}/);
 assert.match(source,/\{commodityComparisonDisplay\(item,'wow','WoW'\)\}/);
 assert.match(source,/\{commodityComparisonDisplay\(item,'mom'\)\}/);
});
