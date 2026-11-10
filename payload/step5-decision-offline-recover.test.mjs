import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {normalizeAndValidate,auditReferences,inspectSaved,applyReviewed} from './step5-decision-offline-recover.mjs';
const source={decision:'stop',reason:'핵심 자료 충분',covered:[{topic:'전분 수급',assessment:'주요 자료',sourceIds:['G100']}],remainingGaps:[{topic:'재고',whyImportant:'차기 공급',searchQuestion:'언제?'}],cautions:[{'short caveat':'추정치입니다'}]};
function fake(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'step5-recover-'));
  const dir=path.join(root,'.rms-research','potato-starch');fs.mkdirSync(dir,{recursive:true});
  const inputs={step4:'step4-analysis-2026-10-31T09-00-00-000Z.json',step5Graded:'step5-round1-graded-2026-10-31T09-30-00-000Z.json'};
  const saved={stage:'round1-evidence-sufficiency-decision',recordedAt:'2026-10-31',commodity:'potato-starch',
    status:'model-json-invalid',model:'gemini-3.8-flash',inputFiles:inputs,decision:null,referenceAudit:null,
    rawText:JSON.stringify(source),usageMetadata:{},protected:{oldFilesOverwritten:false}};
  const filename='step5-round1-decision-2026-10-31T09-42-36-101Z.json';
  fs.writeFileSync(path.join(dir,filename),JSON.stringify(saved));
  fs.writeFileSync(path.join(dir,inputs.step4),JSON.stringify({commodity:'potato-starch',analysis:{originalInventory:[{id:'G001',grade:'A'}],candidateAssessments:[{id:'G001-E1'}]}}));
  fs.writeFileSync(path.join(dir,inputs.step5Graded),JSON.stringify({commodity:'potato-starch',round:1,stage:'additional-google-original-verification-round1',review:[{id:'G100',grade:'A'}]}));
  return {root,dir,filename,inputs};
}
test('object-style short caveat is normalized without altering decision',()=>{const p=normalizeAndValidate(JSON.stringify(source));assert.equal(p.ok,true);assert.equal(p.decision.decision,'stop');assert.deepEqual(p.decision.cautions,['추정치입니다']);assert.equal(p.corrected,1);});
test('standard valid response is not rewritten',()=>assert.equal(normalizeAndValidate(JSON.stringify({...source,cautions:['ok']})).ok,false));
test('truncated or syntactically invalid raw response is never guessed',()=>assert.match(normalizeAndValidate('{"decision":"stop"').reason,/RAW JSON invalid/));
test('a different caution text key is preserved as a labeled string',()=>{const p=normalizeAndValidate(JSON.stringify({...source,cautions:[{other:'bad'}]}));assert.equal(p.ok,true);assert.deepEqual(p.decision.cautions,['other: bad']);});
test('multi-field text caution retains all content',()=>{const p=normalizeAndValidate(JSON.stringify({...source,cautions:[{risk:'자료 잠정',note:'최종 공표 미확인'}]}));assert.equal(p.ok,true);assert.deepEqual(p.decision.cautions,['risk: 자료 잠정; note: 최종 공표 미확인']);});
test('nontext, empty, or nested object cautions remain refused',()=>{for(const v of [{risk:12},{note:null},{note:''},{nested:{detail:'x'}},[],null,99])assert.equal(normalizeAndValidate(JSON.stringify({...source,cautions:[v]})).ok,false);});
test('too many cautions refused',()=>assert.equal(normalizeAndValidate(JSON.stringify({...source,cautions:Array(4).fill('a')})).ok,false));
test('wrong decision value refused',()=>assert.equal(normalizeAndValidate(JSON.stringify({...source,decision:'maybe'})).ok,false));
test('invalid covered IDs refused',()=>{const a=normalizeAndValidate(JSON.stringify({...source,covered:[{topic:'hi',assessment:'hi',sourceIds:['G999']}]}));assert.equal(a.ok,true);assert.deepEqual(auditReferences(a.decision,{analysis:{originalInventory:[{id:'G001',grade:'A'}]}},{review:[{id:'G100',grade:'B'}]}).invalidIds,['G999']);});
test('inspect is read-only and validates source citations',()=>{const x=fake();const before=fs.readdirSync(x.dir);const a=inspectSaved(x.root,'potato-starch');assert.equal(a.check.ok,true);assert.equal(a.audit.invalidIds.length,0);assert.deepEqual(fs.readdirSync(x.dir),before);fs.rmSync(x.root,{recursive:true,force:true});});
test('explicit apply creates new checkpoint, never mutates previous data',()=>{const x=fake();const original=fs.readFileSync(path.join(x.dir,x.filename),'utf8');const result=applyReviewed(inspectSaved(x.root,'potato-starch'));const newdata=JSON.parse(fs.readFileSync(result.outJson,'utf8'));assert.equal(newdata.status,'decision-recorded');assert.equal(newdata.decision.decision,'stop');assert.equal(newdata.formatRecovery.sourceFile,x.filename);assert.equal(fs.readFileSync(path.join(x.dir,x.filename),'utf8'),original);fs.rmSync(x.root,{recursive:true,force:true});});
test('reject missing commodity and cross-commodity input',()=>{const x=fake();assert.throws(()=>inspectSaved(x.root,'banana'));assert.throws(()=>inspectSaved(x.root,'soybean'));fs.rmSync(x.root,{recursive:true,force:true});});
test('reject invalid refs before any apply',()=>{const x=fake();const full=path.join(x.dir,x.filename);const saved=JSON.parse(fs.readFileSync(full));saved.rawText=JSON.stringify({...source,covered:[{topic:'a',assessment:'b',sourceIds:['G999']}]});fs.writeFileSync(full,JSON.stringify(saved));const a=inspectSaved(x.root,'potato-starch');assert.equal(a.check.ok,false);assert.throws(()=>applyReviewed(a));fs.rmSync(x.root,{recursive:true,force:true});});
test('rejects decision that is already valid',()=>{const x=fake();const full=path.join(x.dir,x.filename);const saved=JSON.parse(fs.readFileSync(full));saved.status='decision-recorded';fs.writeFileSync(full,JSON.stringify(saved));assert.throws(()=>inspectSaved(x.root,'potato-starch'));fs.rmSync(x.root,{recursive:true,force:true});});
