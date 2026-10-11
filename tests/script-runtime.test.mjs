import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScriptWorkerSource, prepareSceneObjects } from '../script-runtime.js';

test('buildScriptWorkerSource exposes creation and deletion helpers for scripts', () => {
  const source = buildScriptWorkerSource();
  assert.match(source, /create\s*:\s*\(/);
  assert.match(source, /delete\s*:\s*\(/);
  assert.match(source, /select\s*:\s*\(/);
});

test('prepareSceneObjects includes blocks and imported assets with stable ids', () => {
  const objects = prepareSceneObjects(
    [
      { key: '0,0,0', x: 0, y: 0, z: 0, type: 'block', color: '#587c62' },
      { key: '1,0,0', x: 1, y: 0, z: 0, type: 'coin', color: '#f3c960' }
    ],
    new Map([
      ['asset-1', { id: 'asset-1', name: 'Arme', object: { position: { toArray: () => [1, 2, 3] }, rotation: { toArray: () => [0, 0.5, 0] }, scale: { toArray: () => [1, 1, 1] } } }]
    ])
  );

  assert.equal(objects.length, 3);
  assert.equal(objects[0].id, 'block:0,0,0');
  assert.equal(objects[2].id, 'asset:asset-1');
  assert.ok(objects.some((item) => item.name === 'Arme'));
});
