import {validateRequest,canonical,TARGET_NAME} from '../src/protocol.mjs';
import checkSvg from '../assets/check.svg';
import {executeButton} from './button-engine.mjs';
import {createDesignExecutor} from './design-engine.mjs';
const KEY='bridge-state-v1';
const FONT={family:'Noto Sans SC',style:'Regular'};
const rgb=hex=>({r:parseInt(hex.slice(1,3),16)/255,g:parseInt(hex.slice(3,5),16)/255,b:parseInt(hex.slice(5,7),16)/255});
export function createExecutor(figma,documentId) {
  const load=()=>JSON.parse(figma.root.getPluginData(KEY)||'{"revision":0,"assets":{},"receipts":{}}');
  const save=s=>figma.root.setPluginData(KEY,JSON.stringify(s));
  const guard=()=>{if(figma.root.name!==TARGET_NAME||figma.root.getPluginData('bridge-document-id')!==documentId)throw Error('目标文档身份已改变，拒绝执行');};
  async function node(id,type){const n=id?await figma.getNodeByIdAsync(id):null;if(!n||n.type!==type)throw Error('资产缺失或类型改变：'+type);if(n.getPluginData('bridge-owner')!==documentId)throw Error('资产归属不匹配');return n;}
  async function snapshot(s){
    const a=s.assets;if(!a.component)return {revision:s.revision,ready:false};
    const page=await node(a.page,'PAGE'),frame=await node(a.frame,'FRAME'),component=await node(a.component,'COMPONENT'),label=await node(a.label,'TEXT'),icon=await node(a.icon,'FRAME'),instance=await node(a.instance,'INSTANCE');
    const primary=await figma.variables.getVariableByIdAsync(a.primary),col=await figma.variables.getVariableCollectionByIdAsync(a.collection);
    if(!primary||!col||primary.variableCollectionId!==col.id)throw Error('变量或集合缺失');
    const instText=instance.findOne(n=>n.type==='TEXT'),main=await instance.getMainComponentAsync();
    if(component.parent!==page||frame.parent!==page||label.parent!==component||icon.parent!==component||instance.parent!==frame)throw Error('资产父子关系改变');
    return {revision:s.revision,ready:true,ids:{...a},label:label.characters,primary:primary.valuesByMode[col.defaultModeId],variableBinding:component.fills[0]?.boundVariables?.color,component:{width:component.width,height:component.height,layout:component.layoutMode,padding:[component.paddingTop,component.paddingRight,component.paddingBottom,component.paddingLeft],gap:component.itemSpacing,radius:component.cornerRadius,font:label.fontName,fontSize:label.fontSize,lineHeight:label.lineHeight,icon:[icon.width,icon.height]},instance:{mainId:main?.id,label:instText?.characters,width:instance.width,height:instance.height,fill:instance.fills[0]?.color},frame:{width:frame.width,height:frame.height,layout:frame.layoutMode},pageId:page.id};
  }
  async function exportPng(s){const f=await node(s.assets.frame,'FRAME');return Array.from(await f.exportAsync({format:'PNG',constraint:{type:'SCALE',value:1}}));}
  async function own(s,key,type,create){
    if(s.assets[key])return node(s.assets[key],type);
    const n=create();n.setPluginData('bridge-owner',documentId);n.setPluginData('bridge-key',key);s.assets[key]=n.id;save(s);return n;
  }
  function paint(n,variable){const c=variable.resolveForConsumer(n).value;n.fills=[figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:c.r,g:c.g,b:c.b}},'color',variable)];}
  function check(snapshot){
    const c=snapshot.component,i=snapshot.instance;
    if(c.height!==44||c.gap!==8||c.radius!==8||c.font.family!==FONT.family||c.fontSize!==16||c.lineHeight.value!==24||i.mainId!==snapshot.ids.component||i.label!==snapshot.label||snapshot.variableBinding?.id!==snapshot.ids.primary)throw Error('组件规范或引用验收失败');
    for(const k of ['r','g','b'])if(Math.abs(snapshot.primary[k]-i.fill[k])>1e-6)throw Error('变量未传播到实例');
  }
  async function ensureAssets(s,args){
    const page=await own(s,'page','PAGE',()=>figma.createPage());page.name='90 · Sandbox';await figma.setCurrentPageAsync(page);
    for(const [key,name,mode] of [['collection','Color','Light'],['layoutCollection','Layout','Default']]){
      if(s.assets[key])continue;
      if((await figma.variables.getLocalVariableCollectionsAsync()).some(collection=>collection.name===name))throw Error('同名集合已存在，请先核对 '+name);
      const collection=figma.variables.createVariableCollection(name);
      collection.renameMode(collection.defaultModeId,mode);
      s.assets[key]=collection.id;save(s);
    }
    const col=await figma.variables.getVariableCollectionByIdAsync(s.assets.collection);if(!col)throw Error('变量集合丢失');
    for(const [key,name,type,value] of [['primary','color/primary','COLOR',rgb(args.primary||'#3659C9')],['gap','space/8','FLOAT',8],['radius','radius/control','FLOAT',8],['height','control-height/md','FLOAT',44],['padding','space/16','FLOAT',16]]){
      if(!s.assets[key]){
        const target=type==='COLOR'?col:await figma.variables.getVariableCollectionByIdAsync(s.assets.layoutCollection);
        const variable=figma.variables.createVariable(name,target,type);
        variable.setValueForMode(target.defaultModeId,value);s.assets[key]=variable.id;save(s);
      }
    }
    const frame=await own(s,'frame','FRAME',()=>figma.createFrame());page.appendChild(frame);frame.name='BridgeProof/Desktop/Default';frame.x=0;frame.y=0;frame.layoutMode='VERTICAL';frame.primaryAxisSizingMode='AUTO';frame.counterAxisSizingMode='FIXED';frame.resize(480,260);frame.paddingTop=32;frame.paddingBottom=32;frame.paddingLeft=32;frame.paddingRight=32;frame.itemSpacing=24;frame.fills=[{type:'SOLID',color:{r:1,g:1,b:1}}];
    for(const [key,value,size,line] of [['title','本地 CLI ↔ Figma',32,44],['caption','变量 → 主组件 → 实例',14,20]]){
      const t=await own(s,key,'TEXT',()=>figma.createText());frame.appendChild(t);t.name=key==='title'?'Title':'Description';t.fontName=FONT;t.fontSize=size;t.lineHeight={unit:'PIXELS',value:line};t.characters=value;t.fills=[{type:'SOLID',color:{r:0.12,g:0.15,b:0.2}}];t.textAutoResize='WIDTH_AND_HEIGHT';
    }
    const component=await own(s,'component','COMPONENT',()=>figma.createComponent());page.appendChild(component);component.name='Actions/Button';component.x=-400;component.y=0;component.layoutMode='HORIZONTAL';component.primaryAxisAlignItems='CENTER';component.counterAxisAlignItems='CENTER';component.primaryAxisSizingMode='FIXED';component.counterAxisSizingMode='FIXED';component.resize(320,44);component.paddingTop=0;component.paddingBottom=0;component.paddingLeft=16;component.paddingRight=16;component.itemSpacing=8;component.cornerRadius=8;
    for(const [field,key] of [['height','height'],['itemSpacing','gap'],['paddingLeft','padding'],['paddingRight','padding'],['topLeftRadius','radius'],['topRightRadius','radius'],['bottomLeftRadius','radius'],['bottomRightRadius','radius']])component.setBoundVariable(field,await figma.variables.getVariableByIdAsync(s.assets[key]));
    paint(component,await figma.variables.getVariableByIdAsync(s.assets.primary));
    const icon=await own(s,'icon','FRAME',()=>figma.createNodeFromSvg(checkSvg));component.appendChild(icon);icon.name='Icon/Phosphor/Check/Regular';icon.rescale(16/icon.width);icon.resize(16,16);let pathIndex=0;for(const n of icon.findAll(n=>n.type==='VECTOR')){n.name='Path'+(++pathIndex);if(n.fills.length)n.fills=[{type:'SOLID',color:{r:1,g:1,b:1}}];if(n.strokes.length)n.strokes=[{type:'SOLID',color:{r:1,g:1,b:1}}];}
    const label=await own(s,'label','TEXT',()=>figma.createText());component.appendChild(label);label.name='Label';label.fontName=FONT;label.fontSize=16;label.lineHeight={unit:'PIXELS',value:24};label.characters=args.label||'保存更改';label.fills=[{type:'SOLID',color:{r:1,g:1,b:1}}];label.textAutoResize='WIDTH_AND_HEIGHT';
    const instance=await own(s,'instance','INSTANCE',()=>component.createInstance());frame.appendChild(instance);instance.name='SubmitAction';
    const footer=await own(s,'footer','TEXT',()=>figma.createText());frame.appendChild(footer);footer.name='Caption';footer.fontName=FONT;footer.fontSize=14;footer.lineHeight={unit:'PIXELS',value:20};footer.characters='44 px 控件 · 8 px 圆角 / 间距 · Phosphor';footer.fills=[{type:'SOLID',color:{r:0.35,g:0.4,b:0.48}}];
  }
  return async message=>{
    guard();const request=validateRequest(message.request),{id,action,args}=request;
    if(action.startsWith('button.'))return executeButton(figma,documentId,{...message,request});
    if(action.startsWith('design.'))return createDesignExecutor(figma,documentId)({...message,request});
    if(message.documentId!==documentId)throw Error('请求目标不匹配');
    if(figma.root.getPluginData('bridge-button-v1')){const previous=load().receipts[id];if(previous?.status==='done'&&previous.digest===message.digest)return {result:{...previous.result,replayed:true,exportOmitted:'样本已迁入 Button 组件集，返回历史记录'}};throw Error('样本已升级，请使用 button.verify / button.export / design.read');}
    let s=load(),receipt=Object.prototype.hasOwnProperty.call(s.receipts,id)?s.receipts[id]:null;
    if(receipt){
      if(receipt.digest!==message.digest)throw Error('插件记录中相同 ID 内容冲突');
      if(receipt.status==='done'){
        const current=await snapshot(s),unchanged=canonical(current)===receipt.fingerprint;
        return {result:{...receipt.result,replayed:true,...(!unchanged?{exportOmitted:'文档已改变，返回历史回执，不修改画布'}:{})},png:unchanged&&current.ready?await exportPng(s):undefined};
      }
      if(receipt.status==='failed')throw Error(receipt.error);
      if(receipt.checkpoint&&canonical(await snapshot(s))!==receipt.checkpoint)throw Error('中断后画布已被修改，拒绝覆盖');
    }
    const mutating=action.startsWith('demo.');
    if(mutating&&Object.values(JSON.parse(figma.root.getPluginData('bridge-design-journal-v1')||'{"receipts":{}}').receipts).some(r=>r.status==='prepared'))throw Error('有未完成设计任务，请先恢复');
    const other=Object.entries(s.receipts).find(([k,v])=>k!==id&&v.status==='running');
    if(mutating&&other)throw Error('有未完成任务 '+other[0]+'，请先恢复');
    if(!receipt){
      if(Object.keys(s.receipts).length>=100)throw Error('试点日志达到 100 条上限，请归档后扩展；不自动删除恢复记录');
      if(action==='demo.update'){
        if(s.revision!==args.expectedRevision)throw Error('revision 冲突');
        if(!s.expected||canonical(await snapshot(s))!==s.expected)throw Error('画布与已确认状态不一致，保留人工改动');
      }
      if(action==='demo.ensure'&&s.revision>0)throw Error('样本已经存在，请复用原 requestId 或使用 demo.update');
      if(mutating)await figma.loadFontAsync(FONT); // preflight before writing a task or nodes
      guard();receipt={digest:message.digest,status:'running',baseRevision:s.revision};s.receipts[id]=receipt;save(s);
    }
    if(mutating)await figma.loadFontAsync(FONT); // also required after a plugin restart
    try {
      if(action==='demo.ensure'&&s.revision===0)await ensureAssets(s,args);
      if(action==='demo.update'&&s.revision===receipt.baseRevision){
        const component=await node(s.assets.component,'COMPONENT'),label=await node(s.assets.label,'TEXT');await figma.loadFontAsync(label.fontName);guard();
        if(args.label!==undefined)label.characters=args.label;
        if(args.width!==undefined)component.resize(args.width,44);
        if(args.primary!==undefined){const v=await figma.variables.getVariableByIdAsync(s.assets.primary),c=await figma.variables.getVariableCollectionByIdAsync(s.assets.collection);v.setValueForMode(c.defaultModeId,rgb(args.primary));}
      }
      guard();
      if(mutating&&s.revision===receipt.baseRevision)s.revision++;
      // Persist the actual post-write checkpoint before export (which can be interrupted).
      let actual=await snapshot(s);receipt.checkpoint=canonical(actual);save(s);
      const png=actual.ready?await exportPng(s):undefined;
      actual=await snapshot(s);if(actual.ready)check(actual);
      const result={...actual,requestId:id,validated:actual.ready,replayed:false};
      if(mutating)s.expected=canonical(actual);
      receipt.status='done';receipt.result=result;receipt.fingerprint=canonical(actual);save(s);
      if(actual.ready){const frame=await node(s.assets.frame,'FRAME');figma.currentPage.selection=[frame];figma.viewport.scrollAndZoomIntoView([frame]);}
      return {result,png};
    }catch(error){
      // Keep partial writes recoverable. Never label a partially-applied write as rolled back.
      receipt.error=error.message;save(s);error.uncertain=true;throw error;
    }
  };
}
