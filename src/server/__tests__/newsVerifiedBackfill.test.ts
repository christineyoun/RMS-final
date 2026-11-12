import assert from 'node:assert/strict';
import {test} from 'node:test';
import {verifyWithBoundedBackfill} from '../newsVerifiedBackfill.ts';

type Candidate = {originalUrl: string; sourceName: string; verified?: boolean};
const item = (host: string, n: number, verified = true): Candidate => ({
  originalUrl: `https://${host}/article/${n}`,
  sourceName: host,
  verified
});
const verify = async (candidate: Candidate): Promise<Candidate | null> =>
  candidate.verified ? {...candidate} : null;

test('continues into an available independent publisher wave after a single-publisher verification pool fills', async () => {
  const first = Array.from({length: 16}, (_, i) => item('publisher-a.test', i));
  const next = [item('publisher-b.test', 1), item('publisher-c.test', 1), ...Array.from({length: 6}, (_, i) => item('publisher-a.test', 100 + i))];
  const calls: string[] = [];
  const result = await verifyWithBoundedBackfill([...first, ...next], async candidate => {
    calls.push(candidate.originalUrl);
    return verify(candidate);
  });
  assert.equal(calls.length, 24);
  assert.equal(result.length, 8);
  assert.deepEqual(new Set(result.map(x => x.sourceName)), new Set(['publisher-a.test', 'publisher-b.test', 'publisher-c.test']));
  assert.equal(result[0].sourceName, 'publisher-a.test');
});

test('does not perform extra verification after sufficient independent publisher coverage', async () => {
  const first = Array.from({length: 16}, (_, i) => item(['publisher-a.test', 'publisher-b.test', 'publisher-c.test'][i % 3], i));
  const later = Array.from({length: 8}, (_, i) => item('publisher-d.test', i));
  let calls = 0;
  const result = await verifyWithBoundedBackfill([...first, ...later], async candidate => {
    calls++;
    return verify(candidate);
  });
  assert.equal(calls, 16);
  assert.equal(result.length, 8);
  assert.deepEqual(new Set(result.map(x => x.sourceName)).size, 3);
});

test('does not waste verification when all unexamined pages are from an already verified publisher', async () => {
  const candidates = Array.from({length: 32}, (_, i) => item('publisher-a.test', i));
  let calls = 0;
  const result = await verifyWithBoundedBackfill(candidates, async candidate => {
    calls++;
    return verify(candidate);
  });
  assert.equal(calls, 16);
  assert.equal(result.length, 8);
});

test('never treats an unverified publisher as an acceptable article', async () => {
  const candidates = [...Array.from({length: 16}, (_, i) => item('publisher-a.test', i)),
    item('publisher-b.test', 1, false), item('publisher-c.test', 1, false)];
  const result = await verifyWithBoundedBackfill(candidates, verify);
  assert.equal(result.length, 8);
  assert.equal(new Set(result.map(x => x.sourceName)).size, 1);
});

test('preserves short lists, original inputs and verification order within each publisher', async () => {
  const candidates = [item('publisher-a.test', 1), item('publisher-b.test', 2), item('publisher-a.test', 3)];
  const copy = structuredClone(candidates);
  const result = await verifyWithBoundedBackfill(candidates, verify, {firstWave: 2, maximum: 4, target: 3, limit: 3});
  assert.deepEqual(result.map(x => x.originalUrl), candidates.map(x => x.originalUrl));
  assert.deepEqual(candidates, copy);
});

test('preserves existing safety bounds, accepts no fabricated results and makes no provider calls', async () => {
  let calls = 0;
  assert.deepEqual(await verifyWithBoundedBackfill([item('publisher-a.test', 1)], async candidate => {
    calls++;
    return verify(candidate);
  }, {firstWave: 0}), []);
  assert.equal(calls, 0);
  const result = await verifyWithBoundedBackfill([item('publisher-a.test', 1)], async () => null);
  assert.deepEqual(result, []);
});

// Existing caller compatibility: this helper has always been generic and some
// offline fixtures use numbers rather than publisher-shaped article objects.
test('preserves legacy generic numeric verification inputs', async () => {
  const seen: number[] = [];
  const verified = await verifyWithBoundedBackfill(
    Array.from({length: 32}, (_, i) => i),
    async (candidate: number) => { seen.push(candidate); return candidate >= 20 ? candidate : null; }
  );
  assert.deepEqual(seen, Array.from({length: 32}, (_, i) => i));
  assert.deepEqual(verified, Array.from({length: 8}, (_, i) => i + 20));
  const short = await verifyWithBoundedBackfill([1, 2], async candidate => candidate, {maximum: 32});
  assert.deepEqual(short, [1, 2]);
});
