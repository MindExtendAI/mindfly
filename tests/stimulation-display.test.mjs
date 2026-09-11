import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const code = ts.transpileModule(
  fs.readFileSync(
    new URL('../lib/stimulation-display.ts', import.meta.url),
    'utf8',
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const { StimulationDisplay, conduitFeedback } = await import(
  'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
);

test('focus fills the conduit proportionally and only an open 65% gate reaches the fly', () => {
  assert.deepEqual(conduitFeedback(0, true, false), {
    fill: 0,
    reachesFly: false,
  });
  assert.equal(conduitFeedback(0.3, true, false).fill, 0.3 / 0.65);
  assert.ok(conduitFeedback(0.649, true, false).fill < 1);
  assert.deepEqual(conduitFeedback(0.65, true, true), {
    fill: 1,
    reachesFly: true,
  });
  assert.deepEqual(conduitFeedback(0.9, true, true), {
    fill: 1,
    reachesFly: true,
  });
  assert.deepEqual(conduitFeedback(0.9, true, false), {
    fill: 0.99,
    reachesFly: false,
  });
  for (const focus of [0.3, 0.9, NaN])
    assert.deepEqual(conduitFeedback(focus, false, true), {
      fill: 0,
      reachesFly: false,
    });
});

test('emits every 100 ms regardless of render cadence, with bounded travel', () => {
  const slow = new StimulationDisplay(),
    fast = new StimulationDisplay();
  slow.sample(0, true, 0);
  fast.sample(0, true, 0);
  for (let t = 16; t < 1000; t += 16) fast.sample(t, true, 0);
  const pulses = slow.sample(1000, true, 0);
  assert.deepEqual(pulses, fast.sample(1000, true, 0));
  assert.equal(pulses.length, 8);
  assert.deepEqual(
    pulses.map((p) => p.born),
    [1000, 900, 800, 700, 600, 500, 400, 300],
  );
  assert.ok(pulses.every((p) => p.progress >= 0 && p.progress < 1));
  assert.equal(slow.sample(1000000, true, 0).length, 8);
});

test('gate closure clears pulses and reopening or reset starts a fresh train', () => {
  const display = new StimulationDisplay();
  assert.deepEqual(display.sample(0, false, 0), []);
  display.sample(100, true, 0);
  assert.equal(display.sample(300, true, 0).length, 3);
  assert.deepEqual(display.sample(350, false, 0), []);
  assert.deepEqual(display.sample(10000, true, 0), [
    { born: 10000, progress: 0 },
  ]);
  assert.deepEqual(display.sample(10300, true, 1), [
    { born: 10300, progress: 0 },
  ]);
});
