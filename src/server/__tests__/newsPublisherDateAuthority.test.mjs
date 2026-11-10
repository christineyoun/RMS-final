import test from 'node:test';
import assert from 'node:assert/strict';
import {publisherVerifiedDate} from '../newsPublisherDateAuthority.ts';

test('publisher date prevails over a misleading index date without weakening the age gate',()=>{
 const now=new Date('2026-11-09T12:00:00Z');
 const actual=new Date('2026-11-05T12:00:00Z');
 assert.equal(publisherVerifiedDate(actual,'2026-10-29',now),'2026-11-05');
 assert.equal(publisherVerifiedDate(actual,'2026-11-05',now),'2026-11-05');
});
test('future, expired, and invalid publisher dates fail closed',()=>{
 const now=new Date('2026-11-09T12:00:00Z');
 for(const publisherDate of ['not-a-date','2026-12-01','2026-09-01']){
  assert.equal(publisherVerifiedDate(new Date(publisherDate),'2026-11-05',now),null);
 }
});
