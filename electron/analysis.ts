import type { Entry, FilePage, FileQuery, FolderPage, ScanResult, Summary, TypeStat } from '../src/shared/types';
export function queryFiles(r:ScanResult,q:FileQuery):FilePage {
 const search=(q.search??'').toLowerCase(); const scope=q.scope===undefined?null:r.nodes[q.scope];
 let rows=r.nodes.filter(n=>!n.directory&&(!search||n.path.toLowerCase().includes(search))&&(!q.category||n.category===q.category)&&(!q.extension||n.extension===q.extension)&&n.size>=(q.min??0)&&n.size<=(q.max??Infinity)&&(!scope||n.path.startsWith(scope.path.endsWith('/')||scope.path.endsWith('\\')?scope.path:scope.path+(scope.path.includes('\\')?'\\':'/'))));
 const key=q.sort??'size';const direction=q.direction==='asc'?1:-1;
 rows.sort((a,b)=>direction*(typeof a[key]==='number'?(a[key] as number)-(b[key] as number):String(a[key]).localeCompare(String(b[key])))||a.id-b.id);
 const total=rows.length;rows=rows.slice(q.offset??0,(q.offset??0)+(q.limit??100));return {rows,total};
}
export function summarize(r:ScanResult):Summary {
 const groups=new Map<string,TypeStat>();let largestFile:Entry|null=null;let largestFolder:Entry|null=null;
 for(const n of r.nodes){if(n.directory){if(n.id&&(!largestFolder||n.size>largestFolder.size))largestFolder=n;continue;}if(!largestFile||n.size>largestFile.size)largestFile=n;
 const key=n.extension;const g=groups.get(key)??{category:n.category,extension:key,size:0,count:0};g.size+=n.size;g.count++;groups.set(key,g);}
 const {nodes:_,...rest}=r; void _; return {...rest,types:[...groups.values()].sort((a,b)=>b.size-a.size),largestFile,largestFolder};
}
export function folder(r:ScanResult,id:number):FolderPage {
 const entry=r.nodes[id];if(!entry?.directory)throw new Error('Folder is not available in this scan.');
 const all=entry.children.map(i=>r.nodes[i]).sort((a,b)=>b.size-a.size||a.name.localeCompare(b.name));
 const breadcrumbs:Entry[]=[];let n:Entry|undefined=entry;while(n){breadcrumbs.unshift({...n,children:[]});n=n.parent===null?undefined:r.nodes[n.parent];}
 return {entry:{...entry,children:[]},children:all.slice(0,1500).map(n=>({...n,children:n.directory?[-n.children.length]:[]})),omitted:Math.max(0,all.length-1500),omittedSize:all.slice(1500).reduce((s,n)=>s+n.size,0),breadcrumbs};
}
export function csvCell(value:unknown):string {let s=String(value);if(/^[=+\-@\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
