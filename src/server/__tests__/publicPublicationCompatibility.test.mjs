import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertPublicCaptureCoverage,publicCaptureRoutes,publicRouteKey} from '../publicDeploymentRoutes.mjs';

test('an additive route can be absent when reading an older bundle, but not when publishing', () => {
  const responses = Object.fromEntries(
    publicCaptureRoutes().map(route => [publicRouteKey(route), {status:200,payload:null}])
  );
  assert.doesNotThrow(() => assertPublicCaptureCoverage(responses));
  delete responses['/api/starch/tapioca-supply'];
  assert.throws(() => assertPublicCaptureCoverage(responses), /tapioca-supply/);
  assert.doesNotThrow(() => assertPublicCaptureCoverage(responses,{includeAdditive:false}));
  delete responses['/api/starch/tapioca-quote'];
  assert.throws(() => assertPublicCaptureCoverage(responses,{includeAdditive:false}), /tapioca-quote/);
});
