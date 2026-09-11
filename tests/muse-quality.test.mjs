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
          {
            compilerOptions: {
              module: ts.ModuleKind.ESNext,
              target: ts.ScriptTarget.ES2022,
            },
          },
        ).outputText,
      ).toString('base64')
  );
const { assessMuseQuality } = await load('muse-quality');
test('native contact permits a weak forehead or one poor posterior, including recalibration', () => {
  const fresh = [9900, 9900, 9900, 9900];
  for (const q of [
    [1, 0, 0, 1],
    [0.5, 0.5, 0, 0.5],
    [0, 1, 1, 1],
  ]) {
    const a = assessMuseQuality(fresh, 10000, true, true, q);
    assert.equal(a.usable, true);
    assert.equal(a.level, 'fair');
  }
  assert.equal(
    assessMuseQuality(fresh, 10000, true, false, [1, 1, 1, 1]).level,
    'good',
  );
  assert.equal(
    assessMuseQuality(fresh, 10000, true, false, [0, 1, 1, 0]).usable,
    false,
  );
  assert.equal(
    assessMuseQuality(
      [9900, 9900, 9900, 7000],
      10000,
      true,
      false,
      [1, 1, 1, 1],
    ).usable,
    false,
  );
  assert.equal(
    assessMuseQuality(fresh, 10000, false, true, [1, 1, 1, 1]).usable,
    false,
  );
});
