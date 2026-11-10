/**
 * RMS soybean-oil STEP 5 decision recovery, checkpoint 2026-11-02.
 * Default / --check-only: read-only, no Gemini requests.
 * --retry-once --approve-paid: reserve ONE new attempt, then run the existing
 * step5-decision-run.ts exactly once. Never deletes or changes the first marker.
 * Only place this file in the RMS_final_main project root.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const commodity = 'soybean-oil';
const day = '2026-11-02';
const researchDir = path.join(root, '.rms-research', commodity, 'daily', day);
const markerDir = path.join(root, '.rms-research-runner', commodity, 'daily', day);
const originalMarker = path.join(markerDir, 'paid-step5decision.json');
const retryMarker = path.join(markerDir, 'paid-step5decision-retry1.json');
const retryDiagnostic = path.join(markerDir, 'step5decision-retry1-diagnostic.json');
const existingRunner = path.join(root, 'scripts', 'soybean-rebuild', 'step5-decision-run.ts');
const args = process.argv.slice(2);
const isCheck = args.length === 0 || (args.length === 1 && args[0] === '--check-only');
const isRetry = args.length === 2 && args.includes('--retry-once') && args.includes('--approve-paid');
const out = (m) => console.log('[STEP5 DECISION RECOVERY] ' + m);
const refuse = (m) => { console.error('[STEP5 DECISION RECOVERY] REFUSED: ' + m); process.exitCode = 2; };

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function scan(pattern) {
  return fs.readdirSync(researchDir).filter(n => pattern.test(n)).sort();
}
function preflight() {
  if (!fs.existsSync(path.join(root, 'package.json')) || !fs.existsSync(existingRunner))
    throw Error('Open the RMS_final_main project root, with package.json and scripts/soybean-rebuild.');
  if (!fs.existsSync(researchDir) || !fs.existsSync(markerDir))
    throw Error('Required November 2 research/runner directories are missing.');
  const step4 = scan(/^step4-analysis-.*\.json$/);
  const step5search = scan(/^step5-round1-search-.*\.json$/);
  const step5graded = scan(/^step5-round1-graded-.*\.json$/);
  const existingDecision = scan(/^step5-round1-decision-.*\.json$/);
  if (!step4.length || !step5search.length || !step5graded.length)
    throw Error('Existing STEP4, STEP5 search, or STEP5 graded output is missing; refusing paid call.');
  if (existingDecision.length)
    throw Error('A STEP5 decision JSON already exists; inspect it instead of retrying.');
  if (!fs.existsSync(originalMarker))
    throw Error('Original paid-step5decision.json is missing. Refusing to bypass reservation history.');
  const marker = loadJson(originalMarker);
  if (marker.stage !== 'step5decision' || marker.commodity !== commodity || marker.status !== 'reserved-before-call')
    throw Error('Original marker status/scope differs from expected; manual audit required.');
  if (fs.existsSync(retryMarker) || fs.existsSync(retryDiagnostic))
    throw Error('Retry marker/diagnostic already exists; no second attempt allowed.');
  const graded = loadJson(path.join(researchDir, step5graded.at(-1)));
  if (graded.commodity !== commodity || graded.stage !== 'additional-google-original-verification-round1'
    || graded.round !== 1 || !Array.isArray(graded.review))
    throw Error('Latest STEP5 graded file failed scope/structure checks.');
  if (!fs.existsSync(path.join(root, 'node_modules', 'tsx')))
    throw Error('Local tsx is missing. Run npm ci before retry.');
  out('STEP4/STEP5 outputs: present; no decision output exists');
  out('Original paid reservation: preserved; retry reservation: absent');
  out('Input: ' + step5graded.at(-1));
  out('Research date fixed to ' + day + ' (KST)');
}

if (!isCheck && !isRetry) {
  refuse('Use --check-only, or --retry-once --approve-paid (one potentially billable call).');
} else {
  try {
    preflight();
    if (isCheck) {
      out('CHECK ONLY: zero file writes and zero Gemini calls.');
    } else {
      // Unique, write-once marker created BEFORE the subprocess. Original untouched.
      fs.writeFileSync(retryMarker, JSON.stringify({
        stage: 'step5decision', commodity, day, status: 'reserved-before-call',
        createdAt: new Date().toISOString(), originalMarker: path.basename(originalMarker),
        purpose: 'explicitly approved one-time recovery after previous fetch failed',
        note: 'Never repeat this retry automatically; a failure may still have incurred billing.'
      }, null, 2), {flag: 'wx', mode: 0o600});
      out('ONE-TIME paid attempt reserved. Starting the existing STEP5 decision script.');
      const start = Date.now();
      const child = spawnSync(process.execPath,
        ['--import', 'tsx', existingRunner, '--commodity', commodity],
        {cwd: root, env: {...process.env, RMS_RESEARCH_RUN_DAY: day},
         stdio: 'inherit', shell: false});
      const outputs = scan(/^step5-round1-decision-.*\.json$/);
      const result = {
        stage: 'step5decision', commodity, day, finishedAt: new Date().toISOString(),
        exitCode: child.status, signal: child.signal ?? null,
        spawnError: child.error ? {name: child.error.name, code: child.error.code ?? null, message: child.error.message} : null,
        elapsedSeconds: Math.round((Date.now() - start) / 1000),
        decisionFiles: outputs, originalMarkerPreserved: fs.existsSync(originalMarker),
        noAutomaticPaidRetry: true
      };
      fs.writeFileSync(retryDiagnostic, JSON.stringify(result, null, 2), {flag: 'wx', mode: 0o600});
      out('Diagnostic written: ' + path.relative(root, retryDiagnostic));
      out('Saved decision files: ' + (outputs.join(', ') || 'NONE'));
      if (child.error || child.status !== 0 || !outputs.length)
        refuse('Retry did not complete successfully. Do NOT run it again. Inspect the output/diagnostic.');
      else out('Decision request exited successfully. Verify saved decision with runner --preview (read-only).');
    }
  } catch (e) {
    refuse(e instanceof Error ? e.message : String(e));
  }
}
