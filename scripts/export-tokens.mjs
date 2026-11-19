import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {job} from './bridge-client.mjs';

async function read(action,args={}){
  const result=await job(randomUUID(),action,args);
  if(result.status!=='succeeded')throw Error(result.reason||result.status);
  return result.result;
}
async function liveSnapshot(){
  const {selection,pageId}=await read('design.selection');
  return read('design.read',{nodeIds:[selection[0]?.id||pageId],limit:1000});
}
export async function writeTokens(path,convert){
  const snapshot=process.argv[2]?JSON.parse(readFileSync(process.argv[2],'utf8')):await liveSnapshot();
  const tokens=convert(snapshot);
  const temporary=path+'.'+randomUUID()+'.tmp';
  writeFileSync(temporary,JSON.stringify(tokens,null,2)+'\n');
  renameSync(temporary,path);
  console.log(path);
}
