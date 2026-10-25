import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createHash} from 'node:crypto';

// Scan all UI sources, including shared renderers used after saved-record updates.
const violations:string[]=[];
function scan(dir:string){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const file=dir+'/'+entry.name;
  if(entry.isDirectory()){if(entry.name!=='server')scan(file);continue;}
  if(!/\.[jt]sx?$/.test(file))continue;
  const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  function visit(node:ts.Node){
   if(ts.isJsxAttribute(node)&&node.name.getText(source)==='title')violations.push(file+': native title attribute');
   if((ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node))&&node.tagName.getText(source)==='title')violations.push(file+': SVG title element');
   ts.forEachChild(node,visit);
  }
  visit(source);
 }
}
scan('src');assert.deepEqual(violations,[]);
const backup='.rms-backups/policy-tooltip-program-2026-10-25/';
const ui=fs.readFileSync('src/components/OverviewTerminal.tsx','utf8');
const policy=ui.slice(ui.indexOf('{/* Card 4: Trade Policy */}'),ui.indexOf('{/* Footer Source */}'));
assert.equal((policy.match(/macro-market-status/g)||[]).length,1);
assert(policy.includes('policyData.status')&&policy.includes("policyData.badgeType==='green'")&&policy.includes("policyData.badgeType==='red'"));
assert(policy.includes('bg-[#fff7ed] border-[#fed7aa] text-[#EC870C]'));
assert(!policy.includes('policyData.classificationLabel'));
// Every changed non-policy renderer differs only in native vs accessible descriptions.
for(const file of ['Header','PotatoPriceChanges','WasdeTerminal','CommodityWasdeCard','CommodityDetail']){
 const p='src/components/'+file+'.tsx';
 assert.equal(fs.readFileSync(p,'utf8'),fs.readFileSync(backup+p,'utf8').replace(/\btitle=/g,file==='Header'?'aria-label=':'aria-description='));
}
// Native SVG descriptions move to accessible labels; chart handlers, values and popups survive unchanged.
const p='src/components/PotatoProductionChart.tsx';
const old=fs.readFileSync(backup+p,'utf8').replace(/\btitle=/g,'aria-description=');
const expected=old.replace(/onBlur=\{closeHover\}><title>\{([^\n]+?)\}<\/title><\/circle>/,'onBlur={closeHover} aria-label={$1}/>');
assert.equal(fs.readFileSync(p,'utf8'),expected);
const permitted=new Set(['src/components/OverviewTerminal.tsx',...['Header','PotatoPriceChanges','PotatoProductionChart','WasdeTerminal','CommodityWasdeCard','CommodityDetail'].map(n=>'src/components/'+n+'.tsx'),'src/server/__tests__/macroTooltipFinal.test.tsx','src/server/__tests__/brentBasisCorrection.test.tsx']);
const baseline=JSON.parse(fs.readFileSync('.rms-research/policy-tooltip-program-2026-10-25/baseline.json','utf8'));
for(const [file,hash]of Object.entries(baseline))if(!permitted.has(file))assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash,'preserve '+file);
console.log('PASS all UI renderers reject native titles; one dynamic policy pill; chart functionality, verified data, collectors, scheduler and other source files preserved.');
