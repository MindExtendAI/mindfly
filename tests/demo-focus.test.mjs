import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const code = ts.transpileModule(
  fs.readFileSync(new URL('../lib/demo-focus.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext } },
).outputText;
const { demoFocusAt } = await import(
  'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
);
test('automatic demo smoothly rises from 30 to 90 percent and returns in 40 seconds', () => {
  assert.equal(demoFocusAt(0), 0.3);
  assert.ok(Math.abs(demoFocusAt(20) - 0.9) < 1e-12);
  assert.equal(demoFocusAt(40), 0.3);
  for (let t = 0.1; t <= 80; t += 0.1) {
    const v = demoFocusAt(t),
      last = demoFocusAt(t - 0.1);
    assert.ok(v >= 0.3 && v <= 0.9);
    assert.ok(Math.abs(v - last) < 0.006);
    if (t < 20) assert.ok(v >= last);
    if (t > 20.1 && t < 40) assert.ok(v <= last);
  }
  assert.ok(Math.abs(demoFocusAt(40.001) - demoFocusAt(39.999)) < 1e-10);
  assert.equal(demoFocusAt(NaN), 0.3);
});
