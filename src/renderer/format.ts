import type {Settings} from '../shared/types';
export function bytes(n:number,units:Settings['units']='binary'):string{const base=units==='binary'?1024:1000;const labels=units==='binary'?['B','KiB','MiB','GiB','TiB','PiB']:['B','kB','MB','GB','TB','PB'];let i=0;while(n>=base&&i<labels.length-1){n/=base;i++;}return `${n.toLocaleString(undefined,{maximumFractionDigits:i?1:0})} ${labels[i]}`;}
export const count=(n:number)=>n.toLocaleString();
export const duration=(ms:number)=>ms<1000?`${Math.round(ms)} ms`:`${(ms/1000).toFixed(1)} s`;
