/**
 * RMS soybean-oil STEP 5 recovery — November 2, 2026 checkpoint only.
 *
 * --check-only: strictly read-only; no network, no billing, no file writes.
 * --retry-once --approve-paid: one explicit, potentially billable Gemini attempt.
 *
 * Does not edit any existing checkpoint/marker, RMS code, MI, or publication.
 * A new retry reservation prevents duplicate attempts if the process crashes.
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const ROOT = process.cwd();
const COMMODITY = 'soybean-oil';
const DAY = '2026-11-02';
const research = path.join(ROOT, '.rms-research', COMMODITY, 'daily', DAY);
const records = path.join(ROOT, '.rms-research-runner', COMMODITY, 'daily', DAY);
const oldReservation = path.join(records, 'paid-step5search.json');
const retryReservation = path.join(records, 'paid-step5search-retry1.json');
const retryDiagnostic = path.join(records, 'step5search-retry1-diagnostic.json');
const tsx = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const source = path.join(ROOT, 'scripts', 'soybean-rebuild', 'step5-search.ts');
const args = process.argv.slice(2);
const mode = args.length === 1 && args[0] === '--check-only' ? 'check'
  : args.length === 2 && args.includes('--retry-once') && args.includes('--approve-paid') ? 'paid'
  : null;
if (!mode) {
  console.error('Usage: node RMS_SOYBEAN_OIL_STEP5_RECOVERY.mjs --check-only');
  console.error('Paid retry only after review: node RMS_SOYBEAN_OIL_STEP5_RECOVERY.mjs --retry-once --approve-paid');
  process.exit(2);
}
function readJson(file) {
  try {return JSON.parse(fs.readFileSync(file, 'utf8'));}
  catch (err) {throw Error(`Cannot read valid JSON: ${path.relative(ROOT, file)}: ${err.message}`);}
}
function latest(re) {
  if (!fs.existsSync(research)) return null;
  return fs.readdirSync(research).filter(n=>re.test(n)).sort().at(-1) || null;
}
function keyConfigured() {
  if (process.env.GEMINI_API_KEY?.trim()) return 'shell environment';
  const envFile = path.join(ROOT, '.env');
  if (!fs.existsSync(envFile)) return null;
  const line = fs.readFileSync(envFile, 'utf8').split(/\r?\n/)
    .find(s=>/^\s*(?:export\s+)?GEMINI_API_KEY\s*=/.test(s));
  const value = line?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
  return value && !value.startsWith('#') ? '.env' : null;
}
function check() {
  if (!fs.existsSync(path.join(ROOT, 'package.json')) || !fs.existsSync(source))
    throw Error('Open the actual RMS_final_main project root; required source files are missing.');
  if (!fs.existsSync(research) || !fs.existsSync(records))
    throw Error('Saved November 2 research/runner checkpoint directories are missing.');
  const stages = [
    ['STEP 1', /^step1-google-.*\.json$/],
    ['STEP 2', /^step2-graded-.*\.json$/],
    ['STEP 3', /^step3-evidence-.*\.json$/],
    ['STEP 4', /^step4-analysis-.*\.json$/],
  ];
  const data = [];
  for (const [name, re] of stages) {
    const file = latest(re);
    if (!file) throw Error(`${name} saved output missing: do not retry STEP 5.`);
    const json = readJson(path.join(research, file));
    if (json.commodity !== COMMODITY) throw Error(`${name} has wrong commodity.`);
    data.push({name, file, json});
  }
  const [s1,s2,s3,s4] = data;
  if (s1.json.status !== 'google-citations-found' ||
      !Array.isArray(s1.json.grounding?.sources) || !s1.json.grounding.sources.length ||
      s2.json.inputFile !== s1.file || s3.json.step2File !== s2.file ||
      s4.json.step3File !== s3.file || s4.json.status !== 'review-generated')
    throw Error('STEP 1–4 saved checkpoint linkage/status is inconsistent. Do not retry.');
  if (!Array.isArray(s4.json.analysis?.originalInventory) ||
      !Array.isArray(s4.json.analysis?.findings) ||
      !Array.isArray(s4.json.analysis?.researchGaps))
    throw Error('STEP 4 analysis context is incomplete. Do not retry.');
  const existing = fs.existsSync(research) ? fs.readdirSync(research)
    .filter(n=>/^step5-round1-(?:search|google)-.*\.json$/.test(n)) : [];
  if (!fs.existsSync(oldReservation)) throw Error('Original STEP 5 reservation missing. Do not retry.');
  const reservation = readJson(oldReservation);
  if (reservation.stage !== 'step5search' || reservation.commodity !== COMMODITY ||
      reservation.status !== 'reserved-before-call')
    throw Error('Unexpected original STEP 5 reservation. Do not retry.');
  const retryExists = fs.existsSync(retryReservation);
  const diagnosticExists = fs.existsSync(retryDiagnostic);
  console.log('[STEP 5 RECOVERY] Scope: soybean-oil / 2026-11-02 only');
  console.log('[STEP 5 RECOVERY] STEP 1–4: all saved, linked, and structurally valid');
  console.log('[STEP 5 RECOVERY] STEP 4:', s4.file);
  console.log('[STEP 5 RECOVERY] STEP 4 evidence:',s4.json.analysis.findings.length,'findings,',s4.json.analysis.researchGaps.length,'research gaps');
  console.log('[STEP 5 RECOVERY] Existing STEP 5 search outputs:',existing.length);
  console.log('[STEP 5 RECOVERY] Original paid reservation: PRESENT (will not change)');
  console.log('[STEP 5 RECOVERY] Retry reservation:',retryExists?'PRESENT':'absent');
  console.log('[STEP 5 RECOVERY] Retry diagnostic:',diagnosticExists?'PRESENT':'absent');
  console.log('[STEP 5 RECOVERY] Local tsx dependency:',fs.existsSync(tsx)?'available':'MISSING — install project dependencies using npm ci');
  console.log('[STEP 5 RECOVERY] Gemini key:',keyConfigured()?'configured ('+keyConfigured()+')':'NOT DETECTED — configure securely before paid call');
  console.log('[STEP 5 RECOVERY] Model comes from RMS_SOYBEAN_SEARCH_MODEL or source default; no model calls made.');
  console.log('[STEP 5 RECOVERY] WARNING: Step 5 prompt uses the CURRENT KST date, even when restoring the 2026-11-02 checkpoint.');
  if (existing.length || retryExists) throw Error('A STEP 5 output or retry reservation already exists; no duplicate paid retry allowed.');
  console.log('[STEP 5 RECOVERY] Eligible for a manually authorized ONE-TIME retry, after prerequisites are met.');
  return {key:!!keyConfigured(), installed:fs.existsSync(tsx)};
}
try {
  const status = check();
  if (mode === 'check') {
    console.log('[STEP 5 RECOVERY] CHECK ONLY: zero file writes, zero API calls.');
    process.exit(0);
  }
  if (!status.installed) throw Error('Install dependencies first using npm ci. No reservation created.');
  if (!status.key) throw Error('Gemini API key not configured. No reservation created.');
  if (fs.existsSync(retryDiagnostic)) throw Error('Previous retry diagnostic exists; manual inspection required.');
  // Exclusive creation: repeated invocation cannot trigger an additional billable call.
  fs.writeFileSync(retryReservation, JSON.stringify({
    stage:'step5search', commodity:COMMODITY, day:DAY,
    createdAt:new Date().toISOString(), status:'reserved-before-call',
    purpose:'explicit-one-time-manual-recovery',
    originalReservation:'paid-step5search.json',
    note:'Do not delete or repeat even if the process stops or shows a network error.'
  },null,2), {flag:'wx',mode:0o600});
  console.log('[STEP 5 RECOVERY] One-time retry reserved. Starting the existing STEP 5 source script.');
  const started = new Date().toISOString();
  const run = spawnSync(process.execPath,[tsx,source,'--commodity',COMMODITY], {
    cwd:ROOT, shell:false, encoding:'utf8', timeout:300000, maxBuffer:10*1024*1024,
    env:{...process.env,RMS_RESEARCH_RUN_DAY:DAY,RMS_RESEARCH_COMMODITY:COMMODITY},
    stdio:['ignore','pipe','pipe']
  });
  const stdout = run.stdout || '';
  const stderr = run.stderr || '';
  // Avoid printing untrusted provider output in bulk; output stays local.
  const clean = s => s.replaceAll(process.env.GEMINI_API_KEY || '__UNSET_GEMINI_KEY__','[REDACTED]')
    .slice(-7000);
  if (stdout) console.log(clean(stdout));
  if (stderr) console.error(clean(stderr));
  const saved = latest(/^step5-round1-search-.*\.json$/);
  let accepted = false;
  if (saved) {
    const found = readJson(path.join(research,saved));
    accepted = found.commodity===COMMODITY && found.status==='google-citations-found' &&
      found.step4InputFile===latest(/^step4-analysis-.*\.json$/) &&
      Array.isArray(found.grounding?.sources) && found.grounding.sources.length>0;
  }
  fs.writeFileSync(retryDiagnostic,JSON.stringify({
    stage:'step5search',commodity:COMMODITY,day:DAY,startedAt:started,completedAt:new Date().toISOString(),
    exitCode:run.status,signal:run.signal,error:run.error?.message||null,
    outputFile:saved||null,accepted,stdoutTail:clean(stdout),stderrTail:clean(stderr),
    note:'One-time retry already reserved. Do not retry automatically or delete markers.'
  },null,2),{flag:'wx',mode:0o600});
  console.log('[STEP 5 RECOVERY] Output:',saved||'none', '| valid grounded search:',accepted);
  console.log('[STEP 5 RECOVERY] Diagnostic:',path.relative(ROOT,retryDiagnostic));
  console.log('[STEP 5 RECOVERY] Do not repeat a paid attempt, even if it failed.');
  if (!accepted || run.status !== 0) process.exitCode=2;
} catch (e) {
  console.error('[STEP 5 RECOVERY] STOP:',e instanceof Error?e.message:String(e));
  process.exitCode=2;
}
