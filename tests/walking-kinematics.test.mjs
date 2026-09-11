import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  walkingTiming,
  walkingFoot,
} from '../lib/xenova/walking-kinematics.js';
import { Gait } from '../lib/xenova/gait.js';

test('higher speed shortens stance while swing remains 40 ms', () => {
  let last = Infinity;
  for (const v of [2, 4, 8, 12]) {
    const t = walkingTiming(v);
    assert.ok(t.duty / t.frequency < last);
    last = t.duty / t.frequency;
    assert.ok(Math.abs((1 - t.duty) / t.frequency - 0.04) < 1e-10);
  }
  assert.equal(walkingTiming(0).frequency, 0);
});
test('stance foot speed cancels body translation, contralateral swings do not overlap', () => {
  for (const v of [2.85, 6, 10]) {
    const t = walkingTiming(v),
      dt = 0.0001;
    for (let phase = 0; phase < Math.PI * 2; phase += 0.01) {
      for (let leg = 0; leg < 6; leg++) {
        const a = walkingFoot(phase, v, leg),
          b = walkingFoot(phase + t.frequency * Math.PI * 2 * dt, v, leg);
        if (!a.swinging && !b.swinging && Math.abs(b.x - a.x) < 0.1)
          assert.ok(Math.abs((b.x - a.x) / dt + v) < 1e-8);
        if (leg < 3)
          assert.ok(!(a.swinging && walkingFoot(phase, v, leg + 3).swinging));
      }
    }
  }
});
test('articulated legs track walking feet without invalid matrices or joint limit violations', () => {
  const model = JSON.parse(
    fs.readFileSync(new URL('../public/fly/model.json', import.meta.url)),
  );
  const gait = new Gait(model);
  let phase = 0,
    maxError = 0;
  for (let i = 0; i < 180; i++) {
    const v = 2.85,
      dt = 1 / 60;
    phase += walkingTiming(v).frequency * Math.PI * 2 * dt;
    const tr = gait.update({
      time: i * dt,
      phase,
      velocity: v,
      studyWalking: true,
    });
    for (const matrix of Object.values(tr))
      assert.ok(matrix.every(Number.isFinite));
    if (i > 30) maxError = Math.max(maxError, ...gait.errors);
    for (const d of model.dofs)
      if (d.limitDeg && gait.pose[d.name] !== undefined) {
        assert.ok(gait.pose[d.name] >= (d.limitDeg[0] * Math.PI) / 180 - 1e-6);
        assert.ok(gait.pose[d.name] <= (d.limitDeg[1] * Math.PI) / 180 + 1e-6);
      }
  }
  assert.ok(maxError < 0.1, `maximum foot IK error ${maxError} mm`);
});
