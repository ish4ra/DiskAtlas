import { Worker } from 'node:worker_threads';
import path from 'node:path';
export class ScannerClient {
 private worker=new Worker(path.join(__dirname,'worker.cjs')); private next=0;
 private pending=new Map<number,{resolve:(v:unknown)=>void;reject:(e:Error)=>void}>();
 constructor(onProgress:(p:unknown)=>void,onFailure:(message:string)=>void){this.worker.on('message',m=>{if(m.event==='progress'){onProgress(m.data);return;}const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);if(m.error)p.reject(new Error(m.error));else p.resolve(m.data);});this.worker.on('error',e=>{for(const p of this.pending.values())p.reject(e);this.pending.clear();onFailure(e.message);});this.worker.on('exit',code=>{for(const p of this.pending.values())p.reject(new Error(`Scanner stopped (${code}). Restart DiskAtlas.`));this.pending.clear();});}
 call<T>(method:string,...args:unknown[]):Promise<T>{return new Promise((resolve,reject)=>{const id=++this.next;this.pending.set(id,{resolve:v=>resolve(v as T),reject});this.worker.postMessage({id,method,args});});}
 close(){void this.worker.terminate();}
}
