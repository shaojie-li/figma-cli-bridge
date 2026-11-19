// Transport lifecycle is independent of the compact UI, so reconnect paths are testable.
export function createConnection({WebSocket,postMain,status,clientInfo=()=>undefined,setTimer=setTimeout,clearTimer=clearTimeout}){
 let socket,identity,token='',paused=true,attempt=0,retryTimer,watchdog,identifyTimer,epoch=0,binding='untrusted';
 const clear=()=>{clearTimer(retryTimer);clearTimer(watchdog);clearTimer(identifyTimer);};
 const show=(state,title,detail)=>status({state,title,detail});
 const bindingStatus=()=>{
  if(binding==='ready')show('ready','已就绪','Figma CLI Bridge · 可把 Figma 留在后台');
  else if(binding==='recovery')show('waiting','等待任务恢复','Codex 会核对回执，避免重复修改');
  else if(binding==='ambiguous')show('waiting','等待 Codex 选择文件','检测到多个会话，不自动切换目标');
  else show('waiting','等待 Codex 绑定','首次使用由 Codex 选择目标，无须手动连接');
 };
 function armWatchdog(ws){clearTimer(watchdog);watchdog=setTimer(()=>{if(ws===socket&&!paused)ws.close();},40000);}
 function connect(){
  if(paused||!identity)return;
  const ws=new WebSocket('ws://localhost:38475/plugin');socket=ws;
  show('connecting',attempt?'正在自动重连':'正在连接','等待本机服务，无须重复点击');
  armWatchdog(ws);
  ws.onopen=()=>{if(ws!==socket||paused)return;ws.send(JSON.stringify({type:'hello',protocol:1,token,document:identity,client:clientInfo()}));};
  ws.onmessage=e=>{
   if(ws!==socket||paused)return;
   try{
    const m=JSON.parse(e.data);armWatchdog(ws);
    if(m.type==='connected'){attempt=0;binding='untrusted';bindingStatus();}
    else if(m.type==='binding'){binding=m.reason;bindingStatus();}
    else if(m.type==='ping')ws.send(JSON.stringify({type:'pong'}));
    else if(m.type==='execute'){show('busy','正在处理设计','可以在 Codex 查看进度');postMain(m);}
    else if(m.type==='error'){
     paused=true;clear();ws.close();
     show('action',m.code==='pairing_required'?'配对信息需更新':m.code==='wrong_document'?'需要切换文件':'连接已暂停',m.error);
    }
   }catch(error){paused=true;clear();ws.close();show('action','消息处理失败',error.message);}
  };
  ws.onerror=()=>{}; // close handles temporary service/network failure without flashing an alert.
  ws.onclose=()=>{
   if(ws!==socket||paused)return;clearTimer(watchdog);
   const delay=Math.min(1000*2**Math.min(attempt++,4),15000);
   show('connecting','正在自动重连','等待本机服务，无须重复点击');
   retryTimer=setTimer(connect,delay);
  };
 }
 function start(value){
  paused=true;epoch++;clear();if(socket){socket.onclose=null;socket.close();socket=null;}
  token=value.trim();identity=null;attempt=0;binding='untrusted';
  if(!token){show('action','等待配对信息','在 bridge 目录运行 node src/cli.mjs pair，将配对码填入设置。');return;}
  paused=false;const generation=epoch;show('connecting','正在识别文件','Figma CLI Bridge · 本地连接');postMain({type:'identify'});
  identifyTimer=setTimer(()=>{
   if(generation!==epoch||paused||identity)return;postMain({type:'identify'});
   identifyTimer=setTimer(()=>{if(generation===epoch&&!paused&&!identity){paused=true;show('action','插件暂未响应','请关闭插件后重新运行一次');}},5000);
  },3000);
 }
 function receive(m){
  if(!m||!['identity','result','error'].includes(m.type))return;
  if(m.type==='identity'){
   if(paused||identity)return;identity=m.document;clearTimer(identifyTimer);connect();
  }else if(m.type==='result'){
   if(!paused&&socket?.readyState===1){
    const outgoing={...m};
    if(m.png){let binary='';for(let i=0;i<m.png.length;i+=8192)binary+=String.fromCharCode(...m.png.slice(i,i+8192));outgoing.png=btoa(binary);}
    socket.send(JSON.stringify(outgoing));
    if(m.ok)bindingStatus();else show('waiting','任务未完成','Codex 将检查：'+m.error);
   }else if(!paused)show('waiting','回执等待恢复','连接恢复后由 Codex 查询，不重复执行');
  }else{paused=true;clear();if(socket)socket.close();show('action','需要处理',m.error);}
 }
 function pause(){paused=true;epoch++;clear();if(socket)socket.close();show('paused','已暂停','点击继续即可恢复连接');}
 function policyBlocked(detail){pause();show('action','网络权限受限',detail);}
 return {start,receive,pause,policyBlocked};
}
