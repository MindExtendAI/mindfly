import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const code = ts.transpileModule(fs.readFileSync(new URL('../lib/malecns-space.ts', import.meta.url), 'utf8'), {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
const {maleCnsToScene, MALECNS_VOXELS_PER_SCENE_UNIT: scale} = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const neurons = JSON.parse(fs.readFileSync(new URL('../public/data/bpn-walking.json', import.meta.url))).nodes;
const evidence = JSON.parse(fs.readFileSync(new URL('../research/malecns-coordinate-audit/result.json', import.meta.url))).neurons;
test('all 54 displayed somata retain official body-ID coordinates', () => {
  assert.equal(neurons.length, 54);
  for (const n of neurons) assert.deepEqual(n.position, evidence.find(r => String(r.bodyId) === n.id).somaLocation);
});
test('display preserves relative distances for every modeled soma pair', () => {
  for (let i=0; i<neurons.length; i++) for (let j=i+1; j<neurons.length; j++) {
    const a=neurons[i].position,b=neurons[j].position;
    const x=maleCnsToScene(a),y=maleCnsToScene(b);
    const raw=Math.hypot(...a.map((v,k)=>v-b[k]));
    const display=Math.hypot(...x.map((v,k)=>v-y[k]));
    assert.ok(Math.abs(display * scale - raw) < 1e-8);
  }
});
test('missing or invalid soma coordinates are rejected rather than placed at a default location', () => {
  for (const p of [[null,0,0],[1,NaN,3],[1,2,Infinity],[]]) assert.throws(()=>maleCnsToScene(p));
});
