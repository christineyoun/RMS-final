import assert from 'node:assert/strict';import fs from 'node:fs';import {execFileSync} from 'node:child_process';import ts from 'typescript';
import {COMMODITIES,MARKET_ISSUES} from '../../data/commoditiesData';
import {generateLiveAlerts} from '../../services/marketDataService';
import {serverMarketDataService} from '../marketDataService';
import {getLiveMarketData,calculateMacroRisk,updateSavedBaselinePrice} from '../geminiApi';
import {generateAiAnalysis,getLiveTradePolicyAlert} from '../aiAnalysisService';
import {jrcService} from '../jrcService';import {ttsaService} from '../ttsaService';
import {unavailableWasdeRecord} from '../../components/WasdeTerminal';
import {parseDatedDisplayFx,convertDisplayCurrency} from '../../utils/soybeanPriceSnapshot';
import {quoteFromResponse} from '../../services/commodityQuoteSource';
const files=execFileSync('git',['ls-files','src','scripts','server.ts'],{encoding:'utf8'}).trim().split('\n').filter(f=>/\.(ts|tsx|mjs|js)$/.test(f)&&!f.includes('/__tests__/'));
const errors:string[]=[];
// Approved annual raw-potato manual history has dates/source/coverage/Estimate labels.
const preservedHistory=new Set(['src/data/potatoProductionHistory.ts','src/data/wheatHistory.ts']);
const financial=/^(?:price|priceUsdMt|priceKrw|priceEur|priceMyr|usdPerMT|srwMt|hrwMt|hrsMt|cpoUsd|cpoUsdMt|cpoMyr|oleinUsd|currentPrice|usdKrw|eurKrw|brent|scfi|bdi|benchmarkQuote|exchangeRateToKRW|tempCurrent|tempMax|tempMin|precipSumMm|productionMMT|consumptionMMT|endingStocksMMT|yieldForecast|macroRiskScore)$/;
for(const file of files){if(preservedHistory.has(file))continue;const text=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const report=(node:ts.Node,why:string)=>errors.push(file+':'+(ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1)+' '+why);
 const visit=(n:ts.Node)=>{
  if(ts.isCallExpression(n)&&n.expression.getText(ast)==='Math.random')report(n,'random market data');
  if(ts.isPropertyAssignment(n)&&financial.test(n.name.getText(ast).replace(/["']/g,''))&&ts.isNumericLiteral(n.initializer)&&Number(n.initializer.text)>0)report(n,'literal financial observation');
  if(ts.isBinaryExpression(n)&&[ts.SyntaxKind.BarBarToken,ts.SyntaxKind.QuestionQuestionToken].includes(n.operatorToken.kind)&&(ts.isNumericLiteral(n.right)||ts.isStringLiteral(n.right)&&/^\d+(?:\.\d+)?$/.test(n.right.text))&&Number(n.right.text)>0&&/(?:price|usd|eur|krw|fx|yield|production|stocks|precip|temp)/i.test(n.left.getText(ast)))report(n,'numeric financial fallback');
  if(ts.isVariableDeclaration(n)&&/^(?:exchangeRate|convRate|priceEur|priceKrw|usdMyrRate|usdEur|eurUsd)$/.test(n.name.getText(ast))&&n.initializer){const literals:number[]=[];const scan=(x:ts.Node)=>{if(ts.isCallExpression(x)&&x.expression.getText(ast).endsWith('.toFixed')){scan(x.expression);return;}if(ts.isNumericLiteral(x))literals.push(Number(x.text));ts.forEachChild(x,scan);};scan(n.initializer);if(literals.some(v=>v!==0&&v!==1&&v!==10&&v!==100&&v!==1000))report(n,'hardcoded FX expression');}
  ts.forEachChild(n,visit);
 };visit(ast);
}
assert.deepEqual(errors,[],'Tracked runtime code cannot reintroduce quoted values/FX defaults/random alerts');
for(const c of COMMODITIES){assert.equal(c.price,0);assert.deepEqual(c.sparkline,[]);assert(!c.chartData);assert(!c.wasdeKpis);assert(!c.aiSynthesis);assert(!c.technicalSignals);}assert.deepEqual(MARKET_ISSUES,[]);assert.deepEqual(generateLiveAlerts(),[]);
assert.deepEqual(serverMarketDataService.getCurrentPayload().normalizedData,{});assert.deepEqual(serverMarketDataService.getFallbackGeminiCommodities('2030-01-01','now'),[]);
await assert.rejects(getLiveMarketData(),/retired/);assert.throws(()=>calculateMacroRisk(1,{},{}),/not configured/);assert.throws(()=>updateSavedBaselinePrice(1),/prohibited/);
await assert.rejects(generateAiAnalysis('not-a-commodity'),/Unknown/);await assert.rejects(getLiveTradePolicyAlert(),/unavailable/);await assert.rejects(jrcService.getLatestJrcMarsBulletin(),/unavailable/);await assert.rejects(ttsaService.getSupplyBalance(),/unavailable/);
assert(Number.isNaN(unavailableWasdeRecord('corn').productionMMT));
assert.equal(quoteFromResponse('wheat',{success:true,latestSourceType:'imported-baseline'}),null);
const fx=parseDatedDisplayFx({base:'USD',date:'2026-10-23',rates:{KRW:1324.45,EUR:.89342,MYR:4.0855}},'2026-10-26T00:00:00Z')!;
assert.equal(convertDisplayCurrency(229.64,'USD','EUR',fx),229.64*.89342);assert(Number.isNaN(convertDisplayCurrency(100,'USD','EUR',null)));assert(Number.isNaN(convertDisplayCurrency(100,'MYR','USD',null)));
assert.equal(parseDatedDisplayFx({base:'USD',date:'2026-02-30',rates:{KRW:1,EUR:1}},'2026-10-26T00:00:00Z'),null);
assert.equal(parseDatedDisplayFx({base:'USD',date:'2026-10-23',rates:{KRW:1,EUR:1}},'invalid'),null);
console.log('PASS repository-wide financial literal/fallback/FX/randomness guard, metadata-only startup, unavailable legacy adapters, source identity, strict FX validation and no missing-FX substitution.');
