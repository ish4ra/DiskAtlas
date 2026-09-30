import { statfs } from 'node:fs/promises';
import type { Drive } from '../src/shared/types';
export async function drives():Promise<Drive[]> {
 const targets=process.platform==='win32'?Array.from({length:26},(_,i)=>`${String.fromCharCode(65+i)}:\\`):['/'];
 const results=await Promise.all(targets.map(async p=>{try{const s=await statfs(p);return {path:p,label:process.platform==='win32'?`Local disk (${p.slice(0,2)})`:'Filesystem',total:s.blocks*s.bsize,free:s.bavail*s.bsize};}catch{return null;}}));
 return results.filter((d):d is Drive=>d!==null);
}
