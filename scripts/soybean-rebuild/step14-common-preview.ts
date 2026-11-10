/** Free review of STEP 1-4 shared configuration. No Gemini calls, source fetching or file writes. */
import {COMMODITIES,COMMODITY_NAMES,commodityFromArgv,resultFolder} from './commodity-config.ts';
import {COMMODITY_ALIASES,classifyCommodityText} from './commodity-aliases.ts';
import {buildPrompt} from './step4-pipeline.ts';
const selected=commodityFromArgv();
console.log('[STEP1-4 COMMON PREVIEW] NO API calls, NO fetch, NO writes, NO RMS publication.');
console.log('Selected:',selected,'/ research subject:',COMMODITY_NAMES[selected]);
console.log('Folder:',resultFolder(selected));
console.log('Aliases:',COMMODITY_ALIASES[selected]);
for(const c of COMMODITIES)console.log('Configured:',c,'strong',COMMODITY_ALIASES[c].strong.length,'related',COMMODITY_ALIASES[c].related.length);
const prompt=buildPrompt([],{},'2026-10-31',selected);
console.log('STEP4 first line:',prompt.split('\n')[0]);
console.log('Sample classification:',classifyCommodityText(COMMODITY_ALIASES[selected].strong[0],selected));
console.log('IMPORTANT: Existing soybean STEP1-7 files are untouched. Other commodities use separate folders.');
