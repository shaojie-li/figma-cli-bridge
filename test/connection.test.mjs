import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createConnection} from '../plugin/connection.mjs';
function fixture(){
 const sockets=[],states=[],main=[],timers=new Map();let next=0;
 class Socket{
  constructor(url){this.url=url;this.readyState=0;this.sent=[];sockets.push(this);}
  send(value){this.sent.push(JSON.parse(value));}
  close(){this.readyState=3;this.onclose?.();}
  open(){this.readyState=1;this.onopen?.();}
  message(value){this.onmessage?.({data:JSON.stringify(value)});}
 }
 const connection=createConnection({WebSocket:Socket,status:s=>states.push(s),postMain:m=>main.push(m),setTimer:(fn,delay)=>{const id=++next;timers.set(id,{fn,delay});return id;},clearTimer:id=>timers.delete(id)});
 const tick=delay=>{const entry=[...timers].find(([,t])=>t.delay===delay);assert.ok(entry,'缺少 '+delay+' ms 定时器');timers.delete(entry[0]);entry[1].fn();};
 const start=()=>{connection.start('local-test-token');connection.receive({type:'identity',document:{id:'doc_test_123456',name:'CLI Bridge · Sandbox'}});return sockets.at(-1);};
 return {connection,sockets,states,main,timers,tick,start};
}
test('自动识别连接，收到可信绑定才显示已就绪',()=>{
 const f=fixture(),ws=f.start();ws.open();assert.equal(ws.sent[0].type,'hello');ws.message({type:'connected'});assert.equal(f.states.at(-1).state,'waiting');ws.message({type:'binding',reason:'ready',bound:true});assert.equal(f.states.at(-1).state,'ready');
});
test('离线按退避自动重连，不弹出需用户操作错误；暂停会取消重连',()=>{
 const f=fixture();f.start().close();assert.equal(f.states.at(-1).state,'connecting');f.tick(1000);f.sockets.at(-1).close();f.tick(2000);assert.equal(f.sockets.length,3);
 f.sockets.at(-1).close();f.connection.pause();assert.equal(f.timers.size,0);assert.equal(f.states.at(-1).state,'paused');
});
test('配对失败只提示一次并停止无效重试，更新配对后可继续',()=>{
 const f=fixture(),ws=f.start();ws.open();ws.message({type:'error',code:'pairing_required',error:'配对信息需要更新'});assert.equal(f.states.at(-1).state,'action');assert.equal(f.timers.size,0);
 f.connection.start('updated-local-token');f.connection.receive({type:'identity',document:{id:'doc_test_123456'}});f.sockets.at(-1).open();assert.equal(f.sockets.at(-1).sent[0].token,'updated-local-token');
});
test('重复握手不建立第二条连接，旧 socket 事件不干扰新连接',()=>{
 const f=fixture(),old=f.start();f.connection.receive({type:'identity',document:{id:'doc_test_123456'}});assert.equal(f.sockets.length,1);
 f.start();const before=f.states.length;old.message({type:'connected'});assert.equal(f.states.length,before);assert.equal(f.sockets.length,2);
});
test('无心跳的挂起连接自动重建，但结果未知任务不在 UI 自动重放',()=>{
 const f=fixture(),ws=f.start();ws.open();ws.message({type:'connected'});f.tick(40000);f.tick(1000);
 const next=f.sockets.at(-1);next.open();next.message({type:'binding',reason:'recovery',bound:true});assert.equal(f.states.at(-1).title,'等待任务恢复');assert.equal(f.main.filter(m=>m.type==='execute').length,0);
});
test('识别无响应先重试，确实无执行端才提示重新运行',()=>{
 const f=fixture();f.connection.start('local-test-token');f.tick(3000);assert.equal(f.main.length,2);f.tick(5000);assert.equal(f.states.at(-1).state,'action');
});
test('真实任务只转发一次，回执丢失交给 CLI 恢复',()=>{
 const f=fixture(),ws=f.start();ws.open();ws.message({type:'binding',reason:'ready'});ws.message({type:'execute',request:{id:'one'}});assert.equal(f.states.at(-1).state,'busy');assert.equal(f.main.filter(m=>m.type==='execute').length,1);
 ws.close();f.connection.receive({type:'result',id:'one',ok:true,result:{}});assert.equal(f.states.at(-1).title,'回执等待恢复');assert.equal(f.main.filter(m=>m.type==='execute').length,1);
});
