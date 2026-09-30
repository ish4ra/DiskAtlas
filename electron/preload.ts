import { contextBridge, ipcRenderer } from 'electron';
import type { Api } from '../src/shared/types';
const listen=<T>(channel:string,fn:(data:T)=>void)=>{const listener=(_event:Electron.IpcRendererEvent,data:T)=>fn(data);ipcRenderer.on(channel,listener);return()=>ipcRenderer.removeListener(channel,listener);};
const api:Api={drives:()=>ipcRenderer.invoke('drives'),choose:()=>ipcRenderer.invoke('choose'),start:p=>ipcRenderer.invoke('start',p),cancel:()=>ipcRenderer.invoke('cancel'),summary:()=>ipcRenderer.invoke('summary'),files:q=>ipcRenderer.invoke('files',q),folder:id=>ipcRenderer.invoke('folder',id),action:(id,a)=>ipcRenderer.invoke('action',id,a),export:(f,q)=>ipcRenderer.invoke('export',f,q),settings:()=>ipcRenderer.invoke('settings'),saveSettings:s=>ipcRenderer.invoke('settings:save',s),onProgress:fn=>listen('scan:progress',fn),onDone:fn=>listen('scan:done',fn),onError:fn=>listen('scan:error',fn)};
contextBridge.exposeInMainWorld('diskatlas',api);
