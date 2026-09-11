import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const code = ts.transpileModule(
  fs.readFileSync(new URL('../lib/neural-layers.ts', import.meta.url), 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const { layerNodeIndices, neuralLayerOpacity } = await import(
  'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
);
const atlas = JSON.parse(
  fs.readFileSync(
    new URL('../public/neural-layers/manifest.json', import.meta.url),
  ),
);
const nodes = JSON.parse(
  fs.readFileSync(new URL('../public/data/bpn-walking.json', import.meta.url)),
).nodes;
const state = { running: true, drive: 0.65, inputHz: 10 };
test('25 layers contain all 54 model IDs exactly once, including all 24 BPN candidates', () => {
  const groups = layerNodeIndices(atlas.groups, nodes);
  assert.equal(groups.length, 25);
  assert.equal(new Set(groups.flat()).size, 54);
  let inputs = 0;
  atlas.groups.forEach((g, i) =>
    groups[i].forEach((index) => {
      assert.equal(nodes[index].input, g.role === 'BPN candidate');
      inputs += nodes[index].input ? 1 : 0;
    }),
  );
  assert.equal(inputs, 24);
  assert.throws(() => layerNodeIndices(atlas.groups, nodes.slice(1)));
});
test('overlays are off below threshold, disconnected, for invalid focus', () => {
  for (const change of [{ drive: 0.649 }, { running: false }, { drive: NaN }])
    for (const input of [true, false])
      assert.equal(
        neuralLayerOpacity([0], [1], { ...state, ...change }, input),
        0,
      );
  assert.equal(neuralLayerOpacity([0], [1], { ...state, inputHz: 0 }, true), 0);
});
test('downstream requires model activity and group intensity follows mean afterglow', () => {
  assert.equal(neuralLayerOpacity([0, 1], [0, 0], state, false), 0);
  assert.equal(neuralLayerOpacity([0, 1], [1, 0], state, false), 0.425);
  assert.equal(neuralLayerOpacity([0, 1], [1, 1], state, false), 0.85);
  assert.equal(neuralLayerOpacity([0], [NaN], state, false), 0);
});
test('each layer uses a common registered canvas and preserves official soma coordinates', () => {
  for (const g of atlas.groups) {
    const bytes = fs.readFileSync(
      new URL('../public/neural-layers/' + g.layer, import.meta.url),
    );
    assert.equal(bytes.readUInt32BE(16), atlas.width);
    assert.equal(bytes.readUInt32BE(20), atlas.height);
    for (const c of g.cells) {
      assert.deepEqual(
        c.sourceSoma,
        nodes.find((n) => n.id === c.bodyId).position,
      );
      const [x, , z] = c.sourceSoma,
        p = atlas.projection;
      assert.ok(
        Math.abs(
          c.pixelCenter[0] -
            (atlas.width / 2 - (x - p.sourceCenter[0]) * p.pixelsPerVoxel),
        ) < 1e-5,
      );
      assert.ok(
        Math.abs(
          c.pixelCenter[1] -
            (atlas.height / 2 + (z - p.sourceCenter[1]) * p.pixelsPerVoxel),
        ) < 1e-5,
      );
    }
  }
});
