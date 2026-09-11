import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {load,BpnCircuit} from './helpers.mjs';
const {createBpnEngine}=await load('bpn-engine');
const {WasmBpnCircuit}=await load('wasm-bpn');
const data=JSON.parse(fs.readFileSync(new URL('../public/data/bpn-walking.json',import.meta.url)));
test('WASM is the default and loader failures reject without a JavaScript fallback',async()=>{
 const statuses=[];let called=0;const e=await createBpnEngine(data,new AbortController().signal,s=>statuses.push(s),async()=>{called++;return new BpnCircuit(data);});
 assert.equal(called,1);assert.deepEqual(statuses,['Loading Rust/WASM','Rust/WASM']);e.dispose();
 const failed=[];await assert.rejects(createBpnEngine(data,new AbortController().signal,s=>failed.push(s),async()=>{throw Error('missing wasm')}),/missing wasm/);assert.deepEqual(failed,['Loading Rust/WASM','WASM unavailable']);
});
test('cancelled creation frees the instance and cannot enable control',async()=>{const c=new AbortController();let freed=false;await assert.rejects(createBpnEngine(data,c.signal,()=>{},async()=>{c.abort();return{dispose(){freed=true}}}),/Aborted/);assert.equal(freed,true);});
test('independent WASM instances and reset reproduce the same spike sequence',()=>{const a=new BpnCircuit(data),b=new BpnCircuit(data);let seed=123;try{for(let i=0;i<2500;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;if(i===1100){a.reset();b.reset();}assert.deepEqual(a.advance(seed%10>2),b.advance(seed%10>2));}}finally{a.dispose();b.dispose();}assert.throws(()=>a.advance(true),/disposed/);a.dispose();});
test('invalid graph indices and invalid modules are rejected',()=>{assert.throws(()=>new BpnCircuit({...data,inputs:[999]}),/Invalid/);assert.throws(()=>new BpnCircuit({...data,edges:[[0,999,1,1]]}),/Invalid/);assert.throws(()=>new WasmBpnCircuit(data,{exports:{}}),/Invalid/);});
