import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scan } from '../electron/scanner';
import { queryFiles, summarize, csvCell } from '../electron/analysis';

test('real traversal aggregates sizes, ignores extensions and does not follow loops', async () => {
 const root=await mkdtemp(path.join(tmpdir(),'diskatlas-'));
 try {
 await mkdir(path.join(root,'nested')); await writeFile(path.join(root,'a.mp4'),Buffer.alloc(120)); await writeFile(path.join(root,'nested','b.ts'),Buffer.alloc(30)); await writeFile(path.join(root,'skip.tmp'),'ignored');
 try { await symlink(root,path.join(root,'nested','loop'),'junction'); } catch { /* Windows may restrict links */ }
 const updates: number[]=[];
 const result=await scan(root,{ignoredFolders:[],ignoredExtensions:['.tmp'],maxEntries:500000},()=>false,p=>updates.push(p.files));
 assert.equal(result.nodes[0].size,150); assert.equal(result.files,2); assert.equal(result.folders,2); assert.ok(updates.length>0);
 assert.equal(queryFiles(result,{search:'.ts',limit:100}).rows[0].name,'b.ts');
 assert.equal(summarize(result).types.find(t=>t.category==='Video')?.size,120);
 assert.equal(queryFiles(result,{sort:'size',direction:'desc',limit:100}).rows[0].name,'a.mp4');
 } finally { await rm(root,{recursive:true,force:true}); }
});
test('cancellation and entry cap produce clearly partial results',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'diskatlas-'));
 try { for(let i=0;i<10;i++) await writeFile(path.join(root,`${i}.txt`),'123');
 const cancelled=await scan(root,{ignoredFolders:[],ignoredExtensions:[],maxEntries:100},()=>true,()=>{}); assert.equal(cancelled.status,'cancelled');
 const limited=await scan(root,{ignoredFolders:[],ignoredExtensions:[],maxEntries:3},()=>false,()=>{}); assert.equal(limited.status,'limited'); assert.equal(limited.nodes.length,3);
 } finally {await rm(root,{recursive:true,force:true});}
});
test('unavailable root rejects cleanly',async()=>{await assert.rejects(scan(path.join(tmpdir(),'not-here-diskatlas-xyz'),{ignoredFolders:[],ignoredExtensions:[],maxEntries:100},()=>false,()=>{}));});
test('CSV escapes quotes and spreadsheet formulas',()=>{assert.equal(csvCell('=1+1'),'"\'=1+1"');assert.equal(csvCell('a"b'),'"a""b"');});
