import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const load = async (name) =>
  import(
    'data:text/javascript;base64,' +
      Buffer.from(
        ts.transpileModule(
          fs.readFileSync(
            new URL('../lib/' + name + '.ts', import.meta.url),
            'utf8',
          ),
          { compilerOptions: { module: ts.ModuleKind.ESNext } },
        ).outputText,
      ).toString('base64')
  );
const { resolveFocusControl } = await load('focus-control');
const base = {
  connected: true,
  usable: true,
  measuredFocus: 0.9,
  demo: false,
  demoFocus: 0.7,
};
test('poor, stale or calibrating EEG uses enabled zero-focus fallback and recovers', () => {
  assert.deepEqual(resolveFocusControl({ ...base, usable: false }), {
    enabled: true,
    focus: 0,
    fallback: true,
  });
  assert.deepEqual(resolveFocusControl({ ...base, measuredFocus: NaN }), {
    enabled: true,
    focus: 0,
    fallback: true,
  });
  assert.deepEqual(resolveFocusControl(base), {
    enabled: true,
    focus: 0.9,
    fallback: false,
  });
});
test('a connected headset takes priority over demo; full disconnection remains stopped', () => {
  assert.deepEqual(
    resolveFocusControl({ ...base, usable: false, demo: true }),
    { enabled: true, focus: 0, fallback: true },
  );
  assert.deepEqual(resolveFocusControl({ ...base, connected: false }), {
    enabled: false,
    focus: 0,
    fallback: false,
  });
  assert.deepEqual(
    resolveFocusControl({ ...base, connected: false, demo: true }),
    { enabled: true, focus: 0.7, fallback: false },
  );
});
