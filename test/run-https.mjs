import {createServer} from 'node:https';
import {readFile} from 'node:fs/promises';
import {appFor,settings} from '../server.mjs';
const key=await readFile(process.env.SANTA_TLS_KEY),cert=await readFile(process.env.SANTA_TLS_CERT);
const {app}=await appFor(settings());
createServer({key,cert},app).listen(Number(process.env.PORT??8443),'127.0.0.1',()=>console.log('HTTPS locale pronto'));
