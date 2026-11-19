import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import WebSocket from 'ws';
import {startServer} from '../src/server.mjs';
import {TARGET_NAME,validateRequest} from '../src/protocol.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<100;i++){const v=await fn();if(v)return v;await pause(15);}throw Error('等待超时');}
async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'figma-bridge-test-'));let server=await startServer({dir,port:0,testFaults:true,timeoutMs:1000});
 t.after(async()=>{await server.close();fs.rmSync(dir,{recursive:true,force:true});});
 const api=async(route,body,authorized=true)=>{
  const r=await fetch(`http://127.0.0.1:${server.port}${route}`,{method:body?'POST':'GET',headers:{Authorization:authorized?`Bearer ${server.credentials.control}`:'Bearer wrong','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};
 };
 const document={id:'doc_integration_12345',name:TARGET_NAME};const receipts=new Map();let mutations=0;
 async function connect({token,doc=document,hold=false}={}){
  const ws=new WebSocket(`ws://127.0.0.1:${server.port}/plugin`);await once(ws,'open');
  const answer=new Promise(resolve=>ws.once('message',raw=>resolve(JSON.parse(raw))));
  ws.send(JSON.stringify({type:'hello',protocol:1,token:token||server.credentials.plugin,document:doc}));
  const hello=await answer;
  ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type!=='execute'||hold)return;
   let result=receipts.get(m.request.id);const replayed=!!result;
   if(!result){mutations++;result={revision:mutations,ids:{component:'component-1'},validated:true};receipts.set(m.request.id,result);}
   ws.send(JSON.stringify({type:'result',id:m.request.id,digest:m.digest,ok:true,result:{...result,replayed}}));
  });
  return {ws,hello};
 }
 async function bind(client){assert.equal((await api('/bind',{sessionId:client.hello.sessionId})).status,200);}
 async function job(id,status){return until(async()=>{const j=(await api('/jobs/'+id)).body;return j.status===status?j:false;});}
 return {api,connect,bind,job,receipts,get dir(){return dir;},get port(){return server.port;},get mutations(){return mutations;},async restart(){await server.close();server=await startServer({dir,port:0,testFaults:true,timeoutMs:1000});}};
}
const req=id=>({id,action:'demo.ensure',args:{label:'保存更改',primary:'#3659C9'}});
test('拒绝非法参数、错误会话和未认证请求',async t=>{
 const f=await fixture(t);assert.equal((await f.api('/status',null,false)).status,401);
 assert.equal((await f.api('/jobs',req('offline'))).status,503);
 assert.equal((await f.api('/jobs',{...req('bad'),args:{primary:'red'}})).status,400);
 const bad=await f.connect({token:'invalid'});assert.equal(bad.hello.type,'error');bad.ws.close();
 const wrong=await f.connect({doc:{id:'doc_other_123456',name:'现有 Demo'}});assert.equal(wrong.hello.type,'error');wrong.ws.close();
 assert.throws(()=>validateRequest({id:'../oops',action:'inspect'}));
 assert.throws(()=>validateRequest({id:'x',action:'demo.update',args:{expectedRevision:1,width:163}}));
});
test('同 ID 去重、不同内容拒绝、串行执行并保留完成回执',async t=>{
 const f=await fixture(t),c=await f.connect();await f.bind(c);
 assert.equal((await f.api('/jobs',req('one'))).status,202);await f.job('one','succeeded');
 assert.equal((await f.api('/jobs',req('one'))).status,200);assert.equal(f.mutations,1);
 assert.equal((await f.api('/jobs',{...req('one'),args:{label:'different'}})).status,409);
 assert.equal((await f.api('/jobs/one/recover',{})).body.status,'succeeded');assert.equal(f.mutations,1);
});
test('发送前断线：不自动重试，重新绑定后恢复一次',async t=>{
 const f=await fixture(t);await f.bind(await f.connect());await f.api('/fault',{kind:'before-send'});await f.api('/jobs',req('before'));await f.job('before','unknown');assert.equal(f.mutations,0);
 await until(async()=>!(await f.api('/status')).body.bound);
 assert.equal((await f.api('/jobs/before/recover',{})).status,503);
 await f.bind(await f.connect());await f.api('/jobs/before/recover',{});const j=await f.job('before','succeeded');assert.equal(j.result.replayed,false);assert.equal(f.mutations,1);
});
test('执行后丢回执：插件回执查询恢复，不二次修改',async t=>{
 const f=await fixture(t);await f.bind(await f.connect());await f.api('/fault',{kind:'after-result'});await f.api('/jobs',req('after'));await f.job('after','unknown');assert.equal(f.mutations,1);
 await until(async()=>!(await f.api('/status')).body.bound);await f.bind(await f.connect());
 assert.equal((await f.api('/jobs',req('blocked'))).status,409);
 await f.api('/jobs/after/recover',{});const j=await f.job('after','succeeded');assert.equal(j.result.replayed,true);assert.equal(f.mutations,1);
});
test('服务重启保留 unknown，错误文档拒绝恢复',async t=>{
 const f=await fixture(t);await f.bind(await f.connect({hold:true}));await f.api('/jobs',req('restart'));await f.job('restart','running');await f.restart();assert.equal((await f.api('/jobs/restart')).body.status,'unknown');
 await f.bind(await f.connect({doc:{id:'doc_different_123456',name:TARGET_NAME}}));assert.equal((await f.api('/jobs/restart/recover',{})).status,409);
 await f.bind(await f.connect());await f.api('/jobs/restart/recover',{});await f.job('restart','succeeded');assert.equal(f.mutations,1);
});
test('未知任务阻止队列推进；超时显式 unknown',async t=>{
 const f=await fixture(t);await f.bind(await f.connect({hold:true}));await f.api('/jobs',req('slow'));await f.api('/jobs',req('queued'));await f.job('slow','unknown');
 await until(async()=>!(await f.api('/status')).body.bound);await f.bind(await f.connect());await pause(50);assert.equal((await f.api('/jobs/queued')).body.status,'queued');assert.equal(f.mutations,0);
 await f.api('/jobs/slow/recover',{});await f.job('slow','succeeded');await f.job('queued','succeeded');assert.equal(f.mutations,2);
});

test('重复启动被占用端口时，不改写活跃服务的日志',async t=>{
 const f=await fixture(t);await f.bind(await f.connect({hold:true}));await f.api('/jobs',req('active'));await f.job('active','running');
 await assert.rejects(startServer({dir:f.dir,port:f.port}),/EADDRINUSE/);
 const state=JSON.parse(fs.readFileSync(path.join(f.dir,'jobs.json')));assert.equal(state.active.status,'running');
});

test('只自动恢复明确绑定的文档，首次连接和同名其他文档不自动获准',async t=>{
 const f=await fixture(t),first=await f.connect();assert.equal((await f.api('/status')).body.bound,null);await f.bind(first);
 first.ws.close();await until(async()=>!(await f.api('/status')).body.sessions.length);
 const other=await f.connect({doc:{id:'doc_other_same_name',name:TARGET_NAME}});assert.equal((await f.api('/status')).body.bound,null);other.ws.close();await until(async()=>!(await f.api('/status')).body.sessions.length);
 const again=await f.connect();await until(async()=>(await f.api('/status')).body.bound===again.hello.sessionId);
 assert.equal((await f.api('/jobs',req('auto'))).status,202);await f.job('auto','succeeded');assert.equal(f.mutations,1);
});
test('服务重启自动恢复可信绑定，但 unknown 不会自动执行',async t=>{
 const f=await fixture(t);await f.bind(await f.connect({hold:true}));await f.api('/jobs',req('unfinished'));await f.job('unfinished','running');await f.restart();
 const again=await f.connect();await until(async()=>(await f.api('/status')).body.bound===again.hello.sessionId);await pause(40);
 assert.equal((await f.api('/jobs/unfinished')).body.status,'unknown');assert.equal(f.mutations,0);
 await f.api('/jobs/unfinished/recover',{});await f.job('unfinished','succeeded');assert.equal(f.mutations,1);
});
test('复制文档身份或多个会话存在歧义时，不自动切换到剩余会话',async t=>{
 const f=await fixture(t),a=await f.connect();await f.bind(a);const duplicate=await f.connect();a.ws.close();
 await until(async()=>(await f.api('/status')).body.sessions.length===1);
 assert.equal((await f.api('/status')).body.bound,null);
 assert.equal((await f.api('/jobs',req('ambiguous'))).status,503);
 await f.bind(duplicate);assert.equal((await f.api('/jobs',req('chosen'))).status,202);await f.job('chosen','succeeded');
});
test('有效且活跃的配对临近到期时自动续期，不改变认证密钥',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'figma-renew-'));
 let server=await startServer({dir,port:0});await server.close();
 const credentials=JSON.parse(fs.readFileSync(path.join(dir,'credentials.json')));credentials.expiresAt=Date.now()+30000;fs.writeFileSync(path.join(dir,'credentials.json'),JSON.stringify(credentials));
 server=await startServer({dir,port:0});t.after(async()=>{await server.close();fs.rmSync(dir,{recursive:true,force:true});});
 const ws=new WebSocket(`ws://127.0.0.1:${server.port}/plugin`);await once(ws,'open');const hello=once(ws,'message');
 ws.send(JSON.stringify({type:'hello',protocol:1,token:credentials.plugin,document:{id:'doc_renew_1234567',name:TARGET_NAME}}));const response=JSON.parse((await hello)[0]);assert.equal(response.type,'connected');
 const next=JSON.parse(fs.readFileSync(path.join(dir,'credentials.json')));assert.ok(next.expiresAt>Date.now()+3*60*60*1000);assert.equal(next.plugin,credentials.plugin);ws.close();
});
