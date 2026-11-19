import {createConnection} from './connection.mjs';
const get=id=>document.getElementById(id),postMain=message=>parent.postMessage({pluginMessage:message},'*');
let expanded=false,userPaused=false,showDetail=false;
const resize=()=>postMain({type:'resize',expanded,details:showDetail});
const client=createConnection({WebSocket,postMain,clientInfo:()=>({version:'0.7.4',width:innerWidth,height:innerHeight}),status:({state,title,detail})=>{
 get('title').textContent=title;showDetail=['action','waiting'].includes(state);get('detail').textContent=showDetail?detail:'';get('detail').hidden=!showDetail;document.body.dataset.state=state;resize();
 if(state==='action'){userPaused=true;get('toggle').textContent='重试';}else if(state==='paused'){userPaused=true;get('toggle').textContent='继续';}else{userPaused=false;get('toggle').textContent='暂停';}
}});
get('settings').onclick=()=>{expanded=!expanded;get('panel').hidden=!expanded;get('settings').setAttribute('aria-expanded',String(expanded));resize();};
get('toggle').onclick=()=>{if(userPaused)client.start(get('token').value);else client.pause();};
get('connect').onclick=()=>client.start(get('token').value);
const theme=get('theme');
const themeLabels={'Normal/Light':'标准 · 亮色','Normal/Dark':'标准 · 暗色','Warm/Light':'暖色 · 亮色','Warm/Dark':'暖色 · 暗色'};
theme.onchange=()=>{
  theme.disabled=true;
  postMain({type:'select-theme',frameId:theme.dataset.frameId,mode:theme.value});
};
onmessage=e=>{
 const message=e.data?.pluginMessage;
 if(message?.type==='theme-option'){
   const selection=message.selection;
   get('theme-picker').hidden=!selection;
   theme.replaceChildren();
   if(selection){
     for(const mode of selection.modes)theme.add(new Option(Object.hasOwn(themeLabels,mode)?themeLabels[mode]:mode,mode));
     theme.value=selection.active??'';
     theme.dataset.frameId=selection.frameId;
     theme.title='画板主题 · '+(selection.active??'请选择');
     theme.disabled=false;
   }
 }else client.receive(message);
};
window.addEventListener('securitypolicyviolation',e=>client.policyBlocked('本机连接被拦截，请让 Codex 检查插件权限'));
window.addEventListener('error',e=>client.policyBlocked('插件界面错误：'+e.message));
get('token').value=__LOCAL_PAIRING__;
client.start(get('token').value);
