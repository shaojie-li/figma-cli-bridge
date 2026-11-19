#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startServer} from './server.mjs';
import {readJson} from './store.mjs';
import {PORT,TARGET_NAME} from './protocol.mjs';
import {policy,components,auditDesign,requiredCases} from './design-policy.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=process.env.FIGMA_BRIDGE_STATE_DIR||path.join(root,'.local');
const [command,...args]=process.argv.slice(2);
const print=v=>process.stdout.write(JSON.stringify(v,null,2)+'\n');
async function api(route,body){
  const conn=readJson(path.join(dir,'connection.json'),null),c=readJson(path.join(dir,'credentials.json'),null);
  if(!conn||!c)throw Error('请先启动服务：npm start');
  const r=await fetch(`http://127.0.0.1:${conn.port}${route}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${c.control}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5000)});
  const v=await r.json();if(!r.ok)throw Error(`${r.status}: ${v.error}`);return v;
}
try {
  if(command==='policy')print({policy,components});
  else if(command==='component-cases'){
    const contract=components.contracts[args[0]];if(!contract)throw Error('未登记组件合同');
    print({component:args[0],cases:requiredCases(contract),properties:contract.properties,manual:contract.manual});
  }else if(command==='design-check'){
    const report=auditDesign(JSON.parse(fs.readFileSync(path.resolve(args[0]),'utf8')),{profile:args[1]||policy.defaultProfile,requireComponents:args[2]?args[2].split(','):[]});
    print(report);if(!report.technicalPassed)process.exitCode=1;
  }else if(command==='serve'){
    if(root.split(path.sep).some((part,index,parts)=>part.startsWith('zip-install-')&&parts[index-1]==='.local')){
      throw Error('ZIP 验收目录请使用主工程的 npm run test:zip');
    }
    const service=await startServer({dir,port:PORT,testFaults:args.includes('--test-faults')});
    print({listening:`127.0.0.1:${service.port}`,target:TARGET_NAME,testFaults:args.includes('--test-faults')});
    for(const sig of ['SIGINT','SIGTERM'])process.once(sig,async()=>{await service.close();process.exit(0);});
  }else if(command==='status') print(await api('/status'));
  else if(command==='bind'){
    let id=args[0];if(!id){const s=await api('/status');if(s.sessions.length!==1)throw Error('必须指定唯一 sessionId');id=s.sessions[0].id;}print(await api('/bind',{sessionId:id}));
  }else if(command==='pair'){
    const c=readJson(path.join(dir,'credentials.json'),null);if(!c||Date.now()>c.expiresAt)throw Error('服务未启动或凭据过期');
    // Explicit local display only; never print these in normal logs or verification reports.
    process.stdout.write(c.plugin+'\n');
  }else if(command==='submit') print(await api('/jobs',JSON.parse(fs.readFileSync(path.resolve(args[0]),'utf8'))));
  else if(command==='job') print(await api('/jobs/'+encodeURIComponent(args[0])));
  else if(command==='recover') print(await api('/jobs/'+encodeURIComponent(args[0])+'/recover',{}));
  else if(command==='fault') print(await api('/fault',{kind:args[0]}));
  else if(command==='wait'){
    const limit=Date.now()+Number(args[1]||35000);let job;
    while(Date.now()<limit){job=await api('/jobs/'+encodeURIComponent(args[0]));if(['succeeded','failed','unknown'].includes(job.status))break;await new Promise(r=>setTimeout(r,250));}
    print(job);if(job?.status!=='succeeded')process.exitCode=1;
  }else{
    process.stdout.write('serve [--test-faults] | status | pair | bind [sessionId] | submit request.json | job id | wait id [ms] | recover id | fault before-send|after-result | policy | component-cases Actions/Button | design-check snapshot.json [profile] [componentNamesCSV]\n');
    if(command)process.exitCode=1;
  }
}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
