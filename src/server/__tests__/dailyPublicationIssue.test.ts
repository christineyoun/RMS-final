import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dailyPublicationIssue } from '../../utils/dailyPublicationIssue.ts';

const saved = (publishedAt: string, status = 'completed') => ({ revision: 'saved-run', publishedAt, status, data: {} });
assert.equal(dailyPublicationIssue(saved('2026-10-25T14:59:59Z')), '20261025');
assert.equal(dailyPublicationIssue(saved('2026-10-25T15:00:00Z', 'partial')), '20261026');
assert.equal(dailyPublicationIssue({ ...saved('2026-10-25T14:00:00Z'), lastCheckedAt: '2026-10-28T10:00:00Z' } as any), '20261025');
assert.equal(dailyPublicationIssue(null), null);
assert.equal(dailyPublicationIssue({ publishedAt: '2026-10-26T10:00:00Z' }), null);
assert.equal(dailyPublicationIssue(saved('invalid')), null);
const source = fs.readFileSync('src/components/Header.tsx', 'utf8');
assert(source.includes('loadDailyPublicationIssue()'));
assert(fs.readFileSync('src/utils/dailyPublicationIssue.ts','utf8').includes("fetch('/api/rms/free-publication'"));
assert(!/데이터 확인|부분 갱신|이전값 유지|formatDailyUpdateKST/.test(source));
console.log('PASS saved publication only, KST date boundary, partial publication, failed checks and missing metadata.');
