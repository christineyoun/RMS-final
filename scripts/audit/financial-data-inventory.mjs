/** Read-only inventory of literal financial observations at a reviewed Git baseline.
 * Usage: node scripts/audit/financial-data-inventory.mjs /path/to/baseline-checkout
 * This inventories candidates; the companion report supplies provenance judgments. */
import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';import {execFileSync} from 'node:child_process';
const baseline=process.argv[2];if(!baseline)throw Error('Provide an extracted reviewed baseline checkout');
const files=execFileSync('git',['ls-files','src'],{encoding:'utf8'}).trim().split('\n');
const findings=[];
const financiallyNamed=/(?:price|usd|eur|krw|myr|brent|scfi|bdi|benchmark|production|consumption|stocks|yield|forecast|precip|tempCurrent|tempMax|tempMin|ma20|ma50|ma200|rsi|macd|cashPrice|confidenceScore)/i;
for(const file of files.filter(f=>/\.(ts|tsx|mjs)$/.test(f)&&!f.includes('/__tests__/'))){const original=path.join(baseline,file);if(!fs.existsSync(original))continue;const text=fs.readFileSync(original,'utf8'),current=fs.readFileSync(file,'utf8');const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS),seen=new Set();
 const record=(n,kind)=>{const line=ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1,key=n.getStart(ast)+':'+kind;if(seen.has(key))return;seen.add(key);const snippet=n.getText(ast).replace(/\s+/g,' ').slice(0,250);let disposition;
 if(file==='src/data/wheatHistory.ts'||file==='src/data/potatoProductionHistory.ts'||file==='src/server/soybeanOilEvidenceService.ts')disposition='preserved dated historical observation; see provenance exceptions';
 else if(current!==text&&!current.includes(n.getText(ast)))disposition='removed, centralized or retired; see file-specific correction';
 else disposition='reviewed retained constant/source parsing/configuration; see exceptions';
 findings.push({file,line,kind,snippet,disposition});};
 function visit(n){
  if(ts.isPropertyAssignment(n)&&financiallyNamed.test(n.name.getText(ast))&&(ts.isNumericLiteral(n.initializer)||ts.isStringLiteral(n.initializer)&&/\d/.test(n.initializer.text)))record(n,'named financial literal');
  if(ts.isVariableDeclaration(n)&&financiallyNamed.test(n.name.getText(ast))&&n.initializer&&ts.isNumericLiteral(n.initializer))record(n,'named financial constant');
  if(ts.isBinaryExpression(n)&&[ts.SyntaxKind.BarBarToken,ts.SyntaxKind.QuestionQuestionToken].includes(n.operatorToken.kind)&&financiallyNamed.test(n.left.getText(ast))&&(ts.isNumericLiteral(n.right)||ts.isStringLiteral(n.right)&&/\d/.test(n.right.text)))record(n,'financial fallback');
  if(ts.isBinaryExpression(n)&&[ts.SyntaxKind.SlashToken,ts.SyntaxKind.AsteriskToken].includes(n.operatorToken.kind)&&ts.isNumericLiteral(n.right)&&![0,1,10,100,1000,1000000].includes(Number(n.right.text))&&financiallyNamed.test(n.left.getText(ast)))record(n,'financial arithmetic candidate');
  if((ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)||ts.isTemplateExpression(n))&&/\d[\d,.]*\s*(?:USD|EUR|KRW|MYR|MMT|M MT|USd|USc|원|부셸|톤|%)/.test(n.getText(ast)))record(n,'embedded financial narrative');
  ts.forEachChild(n,visit);
 }visit(ast);
}
console.log(JSON.stringify({baseline:'93c91f8e50e9476232699fea62329cc812a4ab30',scope:'All tracked src TypeScript/TSX/MJS except tests; stored JSON records and source/config exceptions documented separately',findings},null,2));
