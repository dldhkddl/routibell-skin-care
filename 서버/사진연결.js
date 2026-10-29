import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const defaultPath=fileURLToPath(new URL('../.계정자료/사진연결.json',import.meta.url));
const validPort=port=>Number.isInteger(port)&&port>=1024&&port<=65535;

export function readPhotoConnection(path=defaultPath){
  try{
    const connection=JSON.parse(readFileSync(path,'utf8'));
    if(!validPort(connection.port)||typeof connection.instance!=='string')throw Error('INVALID_CONNECTION');
    return {port:connection.port};
  }catch(issue){
    if(issue.code==='ENOENT')return {port:4174};
    throw Error('사진 분석 연결을 확인하지 못했어요. 잠시 후 다시 확인해 주세요.');
  }
}

export function registerPhotoConnection(server,path=defaultPath){
  const port=server.address()?.port;
  if(!validPort(port))throw Error('사진 분석 연결 주소를 확인하지 못했어요.');
  const instance=randomUUID(),temporary=`${path}.${instance}.tmp`;
  mkdirSync(dirname(path),{recursive:true,mode:0o700});
  try{writeFileSync(temporary,JSON.stringify({port,instance}),{flag:'wx',mode:0o600});renameSync(temporary,path);}
  catch(issue){try{unlinkSync(temporary);}catch{}throw issue;}
  server.once('close',()=>{
    try{if(JSON.parse(readFileSync(path,'utf8')).instance===instance)unlinkSync(path);}catch{}
  });
}
