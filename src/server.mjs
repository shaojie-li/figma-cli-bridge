import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes, randomUUID, createHash, timingSafeEqual} from 'node:crypto';
import {WebSocketServer, WebSocket} from 'ws';
import {atomicJson, readJson} from './store.mjs';
import {validateRequest, canonical, REQUEST_ID, TARGET_NAME, PORT, PROTOCOL} from './protocol.mjs';
const equal = (a,b) => typeof a==='string' && typeof b==='string' && Buffer.byteLength(a)===Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));
const failure = (status,message) => Object.assign(Error(message),{status});
export async function startServer({dir,port=PORT,testFaults=false,timeoutMs=30000}={}) {
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  let credentials=readJson(path.join(dir,'credentials.json'),null);
  if (!credentials || credentials.expiresAt<Date.now()) credentials={control:randomBytes(32).toString('hex'),plugin:randomBytes(32).toString('hex'),expiresAt:Date.now()+4*60*60*1000};
  const state=readJson(path.join(dir,'jobs.json'),{});
  for(const job of Object.values(state)) if(job.status==='running') {job.status='unknown';job.reason='服务重启：执行结果未确认';}
  const persist=()=>atomicJson(path.join(dir,'jobs.json'),state);
  let bound=null,nextFault=null,closing=false;
  let trusted=readJson(path.join(dir,'binding.json'),null);
  const ambiguousDocuments=new Set();
  const sessions=new Map(),timers=new Map();
  const publicSession=s=>({id:s.id,document:s.document,connected:s.ws.readyState===WebSocket.OPEN,busy:s.busy,client:s.client});
  const target=()=>{const s=sessions.get(bound);if(!s||s.ws.readyState!==WebSocket.OPEN)throw failure(503,'插件未连接或未绑定；请启动插件并重新 bind');return s;};
  const markUnknown=(job,reason)=>{if(job?.status==='running'){job.status='unknown';job.reason=reason;job.updatedAt=new Date().toISOString();persist();}clearTimeout(timers.get(job?.request.id));timers.delete(job?.request.id);};
  const pump=()=>{
    if(closing)return;const s=sessions.get(bound);if(!s||s.busy||s.ws.readyState!==WebSocket.OPEN)return;
    const job=Object.values(state).find(j=>j.status==='queued'&&j.documentId===s.document.id);
    if(!job||Object.values(state).some(j=>j.documentId===s.document.id&&j.status==='unknown'))return;
    s.busy=job.request.id;job.status='running';job.sessionId=s.id;job.updatedAt=new Date().toISOString();persist();
    if(nextFault==='before-send') {nextFault=null;markUnknown(job,'故障注入：发送前断线，尚未交给插件');s.ws.close(4001,'test before send');return;}
    job.dropResult=nextFault==='after-result';nextFault=null;persist();
    s.ws.send(JSON.stringify({type:'execute',protocol:PROTOCOL,documentId:job.documentId,request:job.request,digest:job.digest,recover:!!job.recover}));
    timers.set(job.request.id,setTimeout(()=>{markUnknown(job,'执行超时：先查询恢复，不自动重试');s.ws.close(4002,'execution timeout');},timeoutMs));
  };
  const publishBinding=()=>{
    for(const s of sessions.values()){
      const recovery=Object.values(state).some(j=>j.documentId===s.document.id&&j.status==='unknown');
      const reason=s.id===bound?(recovery?'recovery':'ready'):(sessions.size>1||ambiguousDocuments.has(s.document.id)?'ambiguous':'untrusted');
      if(s.ws.readyState===WebSocket.OPEN)s.ws.send(JSON.stringify({type:'binding',bound:s.id===bound,reason}));
    }
  };
  const reconnectBinding=()=>{
    if(!bound&&sessions.size===1){
      const s=[...sessions.values()][0];
      if(s.document.id===trusted?.documentId&&s.document.name===trusted.documentName&&!ambiguousDocuments.has(s.document.id))bound=s.id;
    }
    publishBinding();pump();
  };
  const renewActivePairing=()=>{
    // Sliding expiry only for an already authenticated, still-valid local connection.
    if(credentials.expiresAt>Date.now()&&credentials.expiresAt-Date.now()<60*60*1000){
      credentials.expiresAt=Date.now()+4*60*60*1000;
      atomicJson(path.join(dir,'credentials.json'),credentials);
      atomicJson(path.join(dir,'connection.json'),{port,pid:process.pid,expiresAt:credentials.expiresAt});
    }
  };
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  const server=http.createServer(async(req,res)=>{
    try {
      if(req.headers.host!==`127.0.0.1:${port}`&&req.headers.host!==`localhost:${port}`)throw failure(403,'非法 Host');
      if(!equal(req.headers.authorization,`Bearer ${credentials.control}`))throw failure(401,'认证失败');
      const url=new URL(req.url,'http://127.0.0.1');
      let body={};if(req.method==='POST') {let text='';for await(const chunk of req){text+=chunk;if(text.length>100000)throw failure(413,'请求过大');}body=text?JSON.parse(text):{};}
      if(req.method==='GET'&&url.pathname==='/status')return json(res,200,{protocol:PROTOCOL,features:['design.compose','design.page','design.export','theme.document'],bound,trustedDocument:trusted,sessions:[...sessions.values()].map(publicSession),testFaults,jobs:Object.values(state).map(j=>({id:j.request.id,status:j.status,reason:j.reason,documentId:j.documentId}))});
      if(req.method==='POST'&&url.pathname==='/bind') {
        const s=sessions.get(body.sessionId);if(!s||s.ws.readyState!==WebSocket.OPEN)throw failure(404,'会话不存在');
        if([...sessions.values()].some(s=>s.busy))throw failure(409,'仍有执行中的任务，不能切换会话');
        bound=s.id;trusted={documentId:s.document.id,documentName:s.document.name};atomicJson(path.join(dir,'binding.json'),trusted);
        if(sessions.size===1)ambiguousDocuments.delete(s.document.id);
        json(res,200,publicSession(s));publishBinding();pump();return;
      }
      if(req.method==='POST'&&url.pathname==='/jobs') {
        const request=validateRequest(body),digest=createHash('sha256').update(canonical(request)).digest('hex');
        const existing=Object.prototype.hasOwnProperty.call(state,request.id)?state[request.id]:null;if(existing){if(existing.digest!==digest)throw failure(409,'同 requestId 对应不同内容');return json(res,200,existing);}
        const s=target();
        if(Object.values(state).some(j=>j.documentId===s.document.id&&j.status==='unknown'))throw failure(409,'存在结果未知任务，请先 recover');
        const job={request,digest,documentId:s.document.id,documentName:s.document.name,status:'queued',createdAt:new Date().toISOString()};state[request.id]=job;persist();json(res,202,job);pump();return;
      }
      const match=url.pathname.match(/^\/jobs\/([a-zA-Z0-9_-]+)(\/recover)?$/);
      if(match&&REQUEST_ID.test(match[1])) {
        const job=Object.prototype.hasOwnProperty.call(state,match[1])?state[match[1]]:null;if(!job)throw failure(404,'任务不存在');
        if(req.method==='GET'&&!match[2])return json(res,200,job);
        if(req.method==='POST'&&match[2]) {
          if(job.status==='succeeded'||job.status==='failed')return json(res,200,job);
          if(job.status==='running')throw failure(409,'任务仍在执行，请等待或先断开连接');
          const s=target();if(s.document.id!==job.documentId)throw failure(409,'恢复目标文档不匹配');
          job.status='queued';job.recover=true;delete job.reason;persist();json(res,202,job);pump();return;
        }
      }
      if(req.method==='POST'&&url.pathname==='/fault') {
        if(!testFaults)throw failure(403,'故障注入未开启');
        if(!['before-send','after-result'].includes(body.kind))throw failure(400,'未知故障');
        nextFault=body.kind;return json(res,200,{nextFault});
      }
      throw failure(404,'未知接口');
    }catch(error){json(res,error.status||400,{error:error.message});}
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:12*1024*1024});
  server.on('upgrade',(req,socket,head)=>{
    if(req.url!=='/plugin'||![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)){socket.destroy();return;}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));
  });
  wss.on('connection',ws=>{
    let session=null;
    const authTimer=setTimeout(()=>ws.close(4003,'authentication timeout'),5000);
    ws.on('error',()=>{}); // close handler marks in-flight work unknown; no fake success.
    ws.on('message',raw=>{
      try {
        const m=JSON.parse(raw.toString());
        if(!session){
          if(m.type!=='hello'||m.protocol!==PROTOCOL||!equal(m.token,credentials.plugin)||Date.now()>credentials.expiresAt)throw Object.assign(Error('请检查本机服务，在 bridge 目录运行 node src/cli.mjs pair，在插件设置中更新配对码'),{code:'pairing_required'});
          if(m.document?.name!==TARGET_NAME||typeof m.document.id!=='string'||!/^[a-zA-Z0-9_-]{12,100}$/.test(m.document.id))throw Object.assign(Error('请在 CLI Bridge · Sandbox 中运行插件'),{code:'wrong_document'});
          if([...sessions.values()].some(s=>s.document.id===m.document.id))ambiguousDocuments.add(m.document.id);
          const client=m.client&&typeof m.client.version==='string'&&m.client.version.length<30&&Number.isInteger(m.client.width)&&Number.isInteger(m.client.height)?{version:m.client.version,width:m.client.width,height:m.client.height}:undefined;
          session={id:randomUUID(),document:{id:m.document.id,name:m.document.name},client,ws,busy:null};sessions.set(session.id,session);clearTimeout(authTimer);renewActivePairing();ws.send(JSON.stringify({type:'connected',sessionId:session.id,expiresAt:credentials.expiresAt}));reconnectBinding();return;
        }
        if(Date.now()>credentials.expiresAt)throw Error('配对凭据已过期');
        if(m.type==='pong'){renewActivePairing();return;}
        if(m.type!=='result'||!REQUEST_ID.test(m.id||''))throw Error('无效插件消息');
        const job=state[m.id];
        if(!job||job.sessionId!==session.id||job.digest!==m.digest||job.documentId!==session.document.id||session.busy!==m.id||job.status!=='running')throw Error('回执与任务不匹配');
        clearTimeout(timers.get(m.id));timers.delete(m.id);
        if(job.dropResult){job.dropResult=false;markUnknown(job,'故障注入：插件已返回，服务故意丢弃回执');ws.close(4004,'test after result');return;}
        if(m.ok!==true){job.status=m.uncertain?'unknown':'failed';job.reason=String(m.error||'插件执行失败');}
        else {
          if(!m.result||typeof m.result!=='object')throw Error('结果缺失');
          const result={...m.result};
          if(m.png){
            if(typeof m.png!=='string'||m.png.length>8*1024*1024)throw Error('PNG 过大');
            const png=Buffer.from(m.png,'base64');if(!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('导出不是 PNG');
            fs.mkdirSync(path.join(dir,'exports'),{recursive:true});const file=path.join(dir,'exports',m.id+'.png');fs.writeFileSync(file,png);result.pngPath=file;
          }
          job.result=result;job.status='succeeded';delete job.reason;
        }
        job.updatedAt=new Date().toISOString();persist();session.busy=null;publishBinding();pump();
      }catch(error){ws.send(JSON.stringify({type:'error',error:error.message,code:error.code||'protocol_error'}));if(session?.busy)markUnknown(state[session.busy],error.message);ws.close(4005,'protocol error');}
    });
    ws.on('close',()=>{clearTimeout(authTimer);if(session){if(session.busy)markUnknown(state[session.busy],'连接中断：执行结果未知');sessions.delete(session.id);if(bound===session.id)bound=null;if(!closing)reconnectBinding();}});
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  port=server.address().port;
  persist(); // Only touch the journal after successfully owning the listening port.
  atomicJson(path.join(dir,'credentials.json'),credentials);
  atomicJson(path.join(dir,'connection.json'),{port,pid:process.pid,expiresAt:credentials.expiresAt});
  const heartbeat=setInterval(()=>{for(const s of sessions.values()){if(Date.now()>credentials.expiresAt)s.ws.close(4006,'credentials expired');else s.ws.send(JSON.stringify({type:'ping'}));}},15000);
  return {port,credentials,state,async close(){closing=true;clearInterval(heartbeat);for(const timer of timers.values())clearTimeout(timer);for(const ws of wss.clients)ws.terminate();await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve));}};
}
