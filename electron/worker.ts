import { parentPort } from 'node:worker_threads';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { scan } from './scanner';
import { folder, queryFiles, summarize, csvCell } from './analysis';
import type { FileQuery, ScanOptions, ScanResult } from '../src/shared/types';
let result:ScanResult|null=null;let stopped=false;let busy=false;
parentPort!.on('message',async({id,method,args}:{id:number;method:string;args:unknown[]})=>{
 try {let data:unknown;
 if(method==='cancel'){stopped=true;}
 else if(method==='scan'){if(busy)throw new Error('A scan is already running.');busy=true;stopped=false;result=null;try{result=await scan(args[0] as string,args[1] as ScanOptions,()=>stopped,p=>parentPort!.postMessage({event:'progress',data:p}));data=summarize(result);}finally{busy=false;}}
 else if(method==='summary'){data=result?summarize(result):null;}
 else {if(!result)throw new Error('Scan a folder first.');
 if(method==='files')data=queryFiles(result,args[0] as FileQuery);
 else if(method==='folder')data=folder(result,args[0] as number);
 else if(method==='entry')data=result.nodes[args[0] as number];
 else if(method==='export'){
 const [destination,format,q]=args as [string,string,FileQuery];const stream=createWriteStream(destination,{encoding:'utf8'});let failure:Error|undefined;stream.on('error',e=>{failure=e;});
 const write=async(s:string)=>{if(failure)throw failure;if(!stream.write(s))await once(stream,'drain');};
 try{if(format==='json'){await write('{"summary":'+JSON.stringify(summarize(result))+',"entries":[\n');for(let i=0;i<result.nodes.length;i++)await write((i?',\n':'')+JSON.stringify(result.nodes[i]));await write('\n]}');}
 else {await write('Name,Path,Type,Size,Modified\r\n');for(const n of queryFiles(result,{...q,offset:0,limit:result.nodes.length}).rows)await write([n.name,n.path,n.extension,n.size,new Date(n.modified).toISOString()].map(csvCell).join(',')+'\r\n');}
 stream.end();await once(stream,'finish');}catch(e){stream.destroy();throw e;}data=destination;
 }else throw new Error('Unsupported request.');}
 parentPort!.postMessage({id,data});
 }catch(error){parentPort!.postMessage({id,error:error instanceof Error?error.message:String(error)});}
});
