import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { classifyClientAsset } from '../scripts/shell-assets.mjs';

void test('exercise art never blocks the offline shell install', () => {
  assert.equal(classifyClientAsset('/exercise-icons-v2/squat.webp'), 'art');
  assert.equal(classifyClientAsset('/exercise-icons-v2/squat.png'), 'ignore');
  assert.equal(classifyClientAsset('/exercise-icons/squat.webp'), 'ignore');
  assert.equal(classifyClientAsset('/assets/app.js'), 'critical');
  assert.equal(classifyClientAsset('/assets/app.css'), 'critical');
  assert.equal(classifyClientAsset('/manifest.webmanifest'), 'critical');
  assert.equal(classifyClientAsset('/sw.js'), 'ignore');
  assert.equal(classifyClientAsset('/brand/repwise-mark.png'), 'optional');
  assert.equal(classifyClientAsset('/icons/icon-512.png'), 'optional');
});
