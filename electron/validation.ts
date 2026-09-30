import path from 'node:path';
import type { FileQuery, Settings } from '../src/shared/types';
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Invalid request.');return v as Record<string,unknown>;}
function strings(v:unknown):string[]{if(!Array.isArray(v)||v.length>100||v.some(x=>typeof x!=='string'||x.length>1024||x.includes('\0')))throw new Error('Invalid ignore list.');return v;}
export function validateTarget(v:unknown):string {if(typeof v!=='string'||!path.isAbsolute(v)||v.includes('\0')||v.length>32767)throw new Error('Choose an absolute folder path.');return path.resolve(v);}
export function validateSettings(v:unknown):Settings {const s=object(v);if(!['dark','light','system'].includes(String(s.theme))||!['binary','decimal'].includes(String(s.units))||typeof s.confirmOpen!=='boolean'||!Number.isInteger(s.resultCount)||Number(s.resultCount)<25||Number(s.resultCount)>1000||typeof s.defaultTarget!=='string')throw new Error('Invalid settings.');if(s.defaultTarget)validateTarget(s.defaultTarget);return {theme:s.theme as Settings['theme'],units:s.units as Settings['units'],confirmOpen:s.confirmOpen,defaultTarget:s.defaultTarget,resultCount:Number(s.resultCount),ignoredFolders:strings(s.ignoredFolders),ignoredExtensions:strings(s.ignoredExtensions)};}
export function validateQuery(v:unknown):FileQuery {const q=object(v);const out:Record<string,unknown>={};for(const [key,value]of Object.entries(q)){if(value===undefined)continue;if(['search','category','extension'].includes(key)){if(typeof value!=='string'||value.length>1024)throw new Error('Invalid filter.');}
 else if(key==='sort'){if(!['name','path','extension','size','modified'].includes(String(value)))throw new Error('Invalid sort.');}
 else if(key==='direction'){if(!['asc','desc'].includes(String(value)))throw new Error('Invalid direction.');}
 else if(['min','max','scope','offset','limit'].includes(key)){if(typeof value!=='number'||!Number.isFinite(value)||value<0||(['scope','offset','limit'].includes(key)&&!Number.isInteger(value))||(key==='limit'&&value>1000))throw new Error('Invalid query range.');}
 else throw new Error('Unknown query field.');out[key]=value;}return out as FileQuery;}
export function entryId(v:unknown):number{if(typeof v!=='number'||!Number.isInteger(v)||v<0||v>500000)throw new Error('Invalid entry.');return v;}
