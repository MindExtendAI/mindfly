import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { load, prepareEeg } from './helpers.mjs';
await prepareEeg();
const { eegDisplay, demoEegSamples } = await load('neural-display');
const sine = (hz, offset = 0) =>
  Array.from(
    { length: 512 },
    (_, i) => offset + 20 * Math.sin((2 * Math.PI * hz * i) / 256),
  );

test('sensor-space alpha resolves independent 10 Hz and 20 Hz signals and removes DC offset', () => {
  const result = eegDisplay(
    [sine(10), sine(20), sine(10, 100), sine(6)],
    [true, true, true, true],
    'live',
  );
  assert.deepEqual(
    result.channels.map((c) => c.name),
    ['TP9', 'AF7', 'AF8', 'TP10'],
  );
  assert.ok(result.channels.every((c) => c.valid));
  assert.ok(result.channels[0].relativeAlpha > 0.99);
  assert.ok(result.channels[1].relativeAlpha < 0.01);
  assert.ok(
    Math.abs(
      result.channels[0].relativeAlpha - result.channels[2].relativeAlpha,
    ) < 1e-10,
  );
  assert.ok(result.channels[3].relativeAlpha < 0.01);
});
test('missing, short, stale, nonfinite and artifact signals are unavailable instead of zero alpha', () => {
  const nan = sine(10);
  nan[100] = NaN;
  const blink = sine(10);
  blink[100] = 900;
  for (const samples of [
    [],
    Array(512).fill(0),
    sine(10).slice(1),
    nan,
    blink,
  ]) {
    const result = eegDisplay([samples], [true], 'live');
    assert.ok(
      result.channels.every((c) => !c.valid && c.relativeAlpha === null),
    );
  }
  for (const [fresh, source] of [
    [false, 'live'],
    [true, 'none'],
  ]) {
    const result = eegDisplay([sine(10)], [fresh], source);
    assert.equal(result.channels[0].relativeAlpha, null);
  }
});
test('demo spectra come from the displayed synthetic sample windows', () => {
  const low = eegDisplay(
    demoEegSamples(10, 0),
    [true, true, true, true],
    'demo',
  );
  const high = eegDisplay(
    demoEegSamples(10, 1),
    [true, true, true, true],
    'demo',
  );
  assert.equal(high.source, 'demo');
  for (let i = 0; i < 4; i++) {
    assert.ok(high.channels[i].valid);
    assert.ok(
      high.channels[i].relativeAlpha > low.channels[i].relativeAlpha + 0.3,
    );
  }
});
