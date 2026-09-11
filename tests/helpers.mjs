import fs from 'node:fs';
import ts from 'typescript';
const urls=new Map();
export function moduleUrl(name){
 name=name.replace(/\.ts$/,'');if(urls.has(name))return urls.get(name);
 let code=ts.transpileModule(fs.readFileSync(new URL('../lib/'+name+'.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 code=code.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,dep)=>`from '${moduleUrl(dep)}'`);
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');urls.set(name,url);return url;
}
export const load=name=>import(moduleUrl(name));
export const neuralModule=await WebAssembly.compile(fs.readFileSync(new URL('../public/wasm/neural-engine.wasm',import.meta.url)));
export const eegBytes=fs.readFileSync(new URL('../public/wasm/eeg-engine.wasm',import.meta.url));
const {WasmBpnCircuit}=await load('wasm-bpn');
export class BpnCircuit extends WasmBpnCircuit{constructor(data){super(data,new WebAssembly.Instance(neuralModule,{}));}}
export async function prepareEeg(){const api=await load('eeg-wasm');const old=globalThis.fetch;globalThis.fetch=async()=>new Response(eegBytes);try{await api.prepareEegWasm();}finally{globalThis.fetch=old;}return api;}
