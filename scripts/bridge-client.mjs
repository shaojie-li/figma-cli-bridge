import fs from 'node:fs';
export async function api(route,body){
 const conn=JSON.parse(fs.readFileSync('.local/connection.json')),c=JSON.parse(fs.readFileSync('.local/credentials.json'));
 const r=await fetch(`http://127.0.0.1:${conn.port}${route}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${c.control}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5000)});
 const value=await r.json();if(!r.ok)throw Error(value.error);return value;
}
export async function bind(){const s=await api('/status');if(s.sessions.length!==1)throw Error('需要唯一已连接的 Sandbox');if(s.bound!==s.sessions[0].id)await api('/bind',{sessionId:s.sessions[0].id});return s.sessions[0];}
export async function job(id,action,args={}){await api('/jobs',{id,action,args});const end=Date.now()+45000;while(Date.now()<end){const j=await api('/jobs/'+id);if(['succeeded','failed','unknown'].includes(j.status))return j;await new Promise(r=>setTimeout(r,200));}throw Error('等待任务超时：'+id);}
