import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electron from 'electron';
import './build.mjs';
const server=await createServer({server:{port:5173,strictPort:true}});await server.listen();
const child=spawn(electron,['.'],{stdio:'inherit',env:{...process.env,VITE_DEV_SERVER_URL:'http://localhost:5173/'}});child.on('exit',()=>{void server.close();process.exit();});
