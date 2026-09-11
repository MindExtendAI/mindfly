import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
async function load(file) {
  const code = ts.transpileModule(
    fs.readFileSync(new URL('../lib/' + file, import.meta.url), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  return import(
    'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
  );
}
import { BpnCircuit } from './helpers.mjs';
const {
  advanceWalkingGate,
  initialWalkingGate,
  advanceBpnWalking,
  initialBpnWalking,
} = await load('bpn-walking.ts');
const data = JSON.parse(
  fs.readFileSync(new URL('../public/data/bpn-walking.json', import.meta.url)),
);
const lines = fs
  .readFileSync(
    new URL('fixtures/bpn-full-cns-10hz.csv', import.meta.url),
    'utf8',
  )
  .trim()
  .split('\n')
  .map((x) => x.split(','));
const header = lines.shift();
const reference = lines.map((x) =>
  Object.fromEntries(header.map((h, i) => [h, x[i]])),
);

test('interrupted input matches an independent full-CNS run, including rapid release and retrigger', () => {
  const rows = fs
    .readFileSync(
      new URL('fixtures/bpn-full-cns-interrupted.csv', import.meta.url),
      'utf8',
    )
    .trim()
    .split('\n')
    .slice(1);
  const c = new BpnCircuit(data);
  for (const line of rows) {
    const [time, phase, total, target, forward] = line.split(',');
    const out = c.advance(phase === '1');
    assert.equal(out.totalSpikes, +total, 'network spikes at ' + time);
    assert.equal(out.targetSpikes, +target, 'target spikes at ' + time);
    assert.ok(Math.abs(out.forward - +forward) < 1e-8, 'forward at ' + time);
  }
});

test('browser BPN subgraph matches every 50 ms bin of the full-CNS 45 s benchmark', () => {
  const c = new BpnCircuit(data);
  let total = 0,
    targets = 0;
  for (const r of reference) {
    const out = c.advance(r.phase === '1');
    assert.equal(out.totalSpikes, +r.total_spikes, 'total at ' + r.time_ms);
    assert.equal(out.targetSpikes, +r.target_spikes, 'targets at ' + r.time_ms);
    assert.ok(
      Math.abs(out.forward - +r.forward) < 1e-8,
      'forward at ' + r.time_ms + ': ' + out.forward + ' vs ' + r.forward,
    );
    total += out.totalSpikes;
    targets += out.targetSpikes;
  }
  assert.equal(total, 15750);
  assert.equal(targets, 7200);
  assert.equal(data.nodes.length, 54);
  assert.equal(data.inputs.length, 24);
  assert.equal(data.nodes.filter((x) => x.motor).length, 0);
});
test('disconnected BPN outputs remove downstream spikes and walking despite intact stimulation', () => {
  const inputs = new Set(data.inputs);
  const c = new BpnCircuit({
    ...data,
    edges: data.edges.filter(([a]) => !inputs.has(a)),
  });
  for (let i = 0; i < 600; i++) {
    const out = c.advance(true);
    assert.equal(out.forward, 0);
    assert.equal(out.totalSpikes, out.targetSpikes);
  }
});
test('focus gate stops on low, invalid or unusable EEG and caps stimulation at 300 pulses', () => {
  let gate = initialWalkingGate();
  const c = new BpnCircuit(data);
  let out;
  for (let i = 0; i < 800; i++) {
    gate = advanceWalkingGate(gate, 0.9, true);
    out = c.advance(gate.stimulating);
  }
  assert.equal(out.pulses, 300);
  assert.equal(gate.waitingRelease, true);
  for (const [focus, usable] of [
    [0.64, true],
    [NaN, true],
    [0.9, false],
  ]) {
    assert.equal(
      advanceWalkingGate(initialWalkingGate(), focus, usable).stimulating,
      false,
    );
  }
  gate = advanceWalkingGate(gate, 0.2, true);
  gate = advanceWalkingGate(gate, 0.9, true);
  assert.equal(gate.stimulating, true);
});
test('BPN walking preserves heading through the arena center, remains planar, and stops on lost input', () => {
  let nav = initialBpnWalking();
  const c = new BpnCircuit(data);
  for (let i = 0; i < 160; i++) {
    nav = advanceBpnWalking(nav, c.advance(true).forward, 0.05, true);
    assert.equal(nav.position[1], 0);
    assert.equal(nav.position[2], -4, 'no attraction toward a target');
    assert.equal(nav.heading, 0, 'no turning in the interior');
    if (nav.position[0] > 9) break;
  }
  assert.ok(nav.position[0] > 9, 'passes through center instead of landing');
  assert.deepEqual(
    advanceBpnWalking(nav, 0.1, 0.05, false).position,
    nav.position,
  );
  assert.deepEqual(
    advanceBpnWalking(nav, 0, 0.05, true).position,
    nav.position,
  );
  for (let i = 0; i < 2400; i++) {
    nav = advanceBpnWalking(nav, 0.095, 0.05, true);
    assert.ok(Math.hypot(nav.position[0], nav.position[2]) <= 20.80001);
    assert.ok(nav.velocity.every(Number.isFinite));
  }
});

test('per-neuron counts account for all network and targeted spikes', () => {
  const c = new BpnCircuit(data);
  let observedSpikes = 0;
  for (let i = 0; i < 100; i++) {
    const out = c.advance(i < 60);
    assert.equal(out.spikeCounts.length, data.nodes.length);
    assert.equal(
      out.spikeCounts.reduce((a, b) => a + b, 0),
      out.totalSpikes,
    );
    assert.equal(
      data.inputs.reduce((sum, index) => sum + out.spikeCounts[index], 0),
      out.targetSpikes,
    );
    observedSpikes += out.totalSpikes;
  }
  assert.ok(observedSpikes > 0);
  c.reset();
  assert.equal(
    c.advance(false).spikeCounts.reduce((a, b) => a + b, 0),
    0,
  );
});

test('visual spike event timestamps exactly account for model counts without changing dynamics', () => {
  const c = new BpnCircuit(data);
  for (let i = 0; i < 100; i++) {
    const out = c.advance(i < 60);
    const counts = new Uint32Array(data.nodes.length);
    let previous = -1;
    for (const event of out.spikeEvents) {
      assert.ok(event.offsetMs >= previous && event.offsetMs < 50);
      assert.equal(event.offsetMs % 0.5, 0);
      counts[event.neuron]++;
      previous = event.offsetMs;
    }
    assert.deepEqual(counts, out.spikeCounts);
    assert.equal(out.spikeEvents.length, out.totalSpikes);
  }
});
