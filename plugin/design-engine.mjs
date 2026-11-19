import {ensureTemplate,retireOverviewPreview} from './template.mjs';
import {applyTheme,selectedTheme} from './theme.mjs';
import {openDesignPage} from './page.mjs';
import {compose} from './compose.mjs';
import {migrateCollections} from './collection-migration.mjs';
import {syncTypography} from './typography.mjs';
import {canonical,TARGET_NAME} from '../src/protocol.mjs';
import {auditDesign,nameIssue,policy,validDimension} from '../src/design-policy.mjs';
const KEY='bridge-design-journal-v1';
const PENDING_KEY='bridge-design-pending-v2';
const plain=value=>JSON.parse(JSON.stringify(value,(_k,v)=>typeof v==='symbol'?'MIXED':v));
const fields=['x','y','clipsContent','strokeWeight','strokeAlign','constraints','id','type','name','width','height','layoutMode','primaryAxisSizingMode','counterAxisSizingMode','primaryAxisAlignItems','counterAxisAlignItems','layoutSizingHorizontal','layoutSizingVertical','itemSpacing','paddingTop','paddingBottom','paddingLeft','paddingRight','cornerRadius','visible','opacity','characters','fontName','fontSize','lineHeight','textStyleId','fills','strokes','boundVariables','componentProperties','componentPropertyDefinitions','componentPropertyReferences','variantProperties'];
function nodeRecord(n){
  const result={parentId:n.parent?.id||null};
  for(const k of fields){
    // Figma exposes the getter on variants, but throws when it is read there.
    if(k==='componentPropertyDefinitions'&&n.type==='COMPONENT'&&n.parent?.type==='COMPONENT_SET')continue;
    if(k in n&&n[k]!==undefined)result[k]=plain(n[k]);
  }
  if('children'in n)result.children=n.children.map(n=>n.id);
  return result;
}
function variableRecord(v){return plain({id:v.id,name:v.name,description:v.description,resolvedType:v.resolvedType,variableCollectionId:v.variableCollectionId,valuesByMode:v.valuesByMode,remote:v.remote,scopes:v.scopes,codeSyntax:v.codeSyntax});}
function collectionRecord(v){return plain({id:v.id,name:v.name,modes:v.modes,defaultModeId:v.defaultModeId,variableIds:v.variableIds,remote:v.remote});}
export async function readDesign(figma,args={}){
  const limit=args.limit||500,nodes=[],seen=new Set(),nodeFingerprints={};
  const visit=async n=>{
    if(seen.has(n.id))return;seen.add(n.id);
    if(nodes.length>=limit)throw Error('读取超过节点上限，请缩小 nodeIds 范围；不返回截断快照');
    if(n.type==='PAGE'&&n.loadAsync)await n.loadAsync();
    const record=nodeRecord(n);
    nodeFingerprints[n.id]=canonical(record);
    if('effects'in n&&Array.isArray(n.effects)&&n.effects.length)record.effects=plain(n.effects);
    if(n.type==='INSTANCE'&&n.getMainComponentAsync)record.mainComponentId=(await n.getMainComponentAsync())?.id??null;
    nodes.push(record);
    if('children'in n)for(const c of n.children)await visit(c);
  };
  const roots=args.nodeIds?.length?await Promise.all(args.nodeIds.map(id=>figma.getNodeByIdAsync(id))):[figma.currentPage];
  if(roots.some(n=>!n||n.type==='DOCUMENT'))throw Error('节点不存在或范围过大，请指定页面/组件 ID');
  for(const root of roots)await visit(root);
  const variables=await figma.variables.getLocalVariablesAsync(),collections=await figma.variables.getLocalVariableCollectionsAsync();
  if(variables.length>2000)throw Error('当前版本最多读取 2000 个本地变量');
  const styles=await figma.getLocalTextStylesAsync();
  return {schemaVersion:1,scope:{rootIds:roots.map(n=>n.id),complete:true,variables:'local-only'},document:{id:figma.root.getPluginData('bridge-document-id'),name:figma.root.name},pages:figma.root.children.map(p=>({id:p.id,name:p.name})),nodes,variables:variables.map(variableRecord),collections:collections.map(collectionRecord),textStyles:styles.map(s=>plain({id:s.id,name:s.name,fontName:s.fontName,fontSize:s.fontSize,lineHeight:s.lineHeight})),fingerprints:{nodes:nodeFingerprints,variables:Object.fromEntries(variables.map(v=>[v.id,canonical(variableRecord(v))])),collections:Object.fromEntries(collections.map(v=>[v.id,canonical(collectionRecord(v))]))}};
}
async function preparePatch(figma,args){
  const {target,field,value}=args;let obj,record;
  if(target.kind==='node'){obj=await figma.getNodeByIdAsync(target.id);record=nodeRecord;}
  if(target.kind==='variable'){obj=await figma.variables.getVariableByIdAsync(target.id);record=variableRecord;}
  if(target.kind==='collection'){obj=await figma.variables.getVariableCollectionByIdAsync(target.id);record=collectionRecord;}
  if(!obj||obj.remote||obj.type==='DOCUMENT')throw Error('目标不存在、为远程资源或不支持修改文件根节点');
  if(obj.type){let parent=obj;while(parent.parent)parent=parent.parent;if(parent!==figma.root)throw Error('节点不属于当前文件');}
  const before=record(obj);let write;
  if(field==='name'){
    const issue=nameIssue(target.kind==='variable'?'VARIABLE':target.kind==='collection'?'COLLECTION':obj.type,value,{profile:args.profile??policy.defaultProfile,variant:obj.type==='COMPONENT'&&obj.parent?.type==='COMPONENT_SET'});
    if(issue)throw Error(issue);
    if(target.kind==='variable'){
      const all=await figma.variables.getLocalVariablesAsync();if(all.some(v=>v.id!==obj.id&&v.variableCollectionId===obj.variableCollectionId&&v.name===value))throw Error('变量同名冲突');
    }else if(target.kind==='collection'){
      if((await figma.variables.getLocalVariableCollectionsAsync()).some(c=>c.id!==obj.id&&c.name===value))throw Error('集合同名冲突');
    }else if(obj.parent?.children.some(n=>n!==obj&&n.name===value))throw Error('同级名称冲突，请增加语义角色');
    write=()=>{obj.name=value;};
  }else if(field==='webColorSyntax'&&target.kind==='variable'&&obj.resolvedType==='COLOR'){
    if(!/^var\(--[a-z][a-z0-9-]*\)$/.test(value))throw Error('需要 CSS 自定义颜色变量引用');
    write=()=>obj.setVariableCodeSyntax('WEB',value);
  }else if(field==='value'&&target.kind==='variable'){
    const col=await figma.variables.getVariableCollectionByIdAsync(obj.variableCollectionId);
    if(!col.modes.some(m=>m.modeId===value.modeId))throw Error('mode 不存在；不自动创建或绕过套餐限制');
    const val=value.value,alias=val&&typeof val==='object'&&val.type==='VARIABLE_ALIAS';
    if(alias){
      const walk=async(id,seen)=>{
        if(id===obj.id||seen.has(id))throw Error('变量别名循环');
        const v=await figma.variables.getVariableByIdAsync(id);if(!v||v.resolvedType!==obj.resolvedType)throw Error('别名缺失或类型不匹配');
        for(const x of Object.values(v.valuesByMode))if(x?.type==='VARIABLE_ALIAS')await walk(x.id,new Set([...seen,id]));
      };await walk(val.id,new Set());
    }else{
      const valid=obj.resolvedType==='FLOAT'?typeof val==='number'&&Number.isFinite(val):obj.resolvedType==='STRING'?typeof val==='string':obj.resolvedType==='BOOLEAN'?typeof val==='boolean':obj.resolvedType==='COLOR'?val&&typeof val==='object'&&Object.keys(val).every(k=>['r','g','b','a'].includes(k))&&['r','g','b',...('a'in val?['a']:[])].every(k=>typeof val[k]==='number'&&val[k]>=0&&val[k]<=1):false;
      if(!valid)throw Error('变量值类型不匹配');
    }
    write=()=>obj.setValueForMode(value.modeId,val);
  }else if(field==='characters'&&obj.type==='TEXT'){
    if(typeof value!=='string'||value.length>2000)throw Error('文本需为不超过 2000 字符的字符串');
    if(obj.fontName===figma.mixed)throw Error('混合字体文本需分段编辑，本版本不自动覆盖');
    await figma.loadFontAsync(obj.fontName);write=()=>{obj.characters=value;};
  }else if(field==='instanceProperties'&&obj.type==='INSTANCE'){
    if(!value||typeof value!=='object'||Array.isArray(value)||!Object.keys(value).length)throw Error('实例属性不能为空');
    for(const [key,val] of Object.entries(value)){
      const p=obj.componentProperties[key];if(!p)throw Error('属性不存在，必须保留 Figma 返回的 #ID：'+key);
      if(p.type==='BOOLEAN'?typeof val!=='boolean':typeof val!=='string')throw Error('实例属性类型不匹配');
      if(!['BOOLEAN','TEXT','VARIANT','INSTANCE_SWAP'].includes(p.type))throw Error('暂不支持此组件属性');
    }
    write=()=>obj.setProperties(value);
  }else if(field==='visible'&&target.kind==='node'&&typeof obj.visible==='boolean'){
    if(obj.boundVariables?.visible||obj.componentPropertyReferences?.visible)throw Error('可见性已绑定，请通过对应属性或变量修改');
    write=()=>{obj.visible=value;};
  }else if(field==='fillOpacity'&&obj.type==='FRAME'){
    if(!Array.isArray(obj.fills)||obj.fills.length!==1||obj.fills[0].type!=='SOLID'||!obj.fills[0].boundVariables?.color)throw Error('填充透明度仅支持单个已绑定变量的 SOLID 填充');
    write=()=>{obj.fills=[{...obj.fills[0],opacity:value}];};
  }else if(field==='binding'&&target.kind==='node'){
    const variable=await figma.variables.getVariableByIdAsync(value.variableId);
    if(!variable)throw Error('绑定变量不存在');
    if(value.field==='fill'){
      if(variable.resolvedType!=='COLOR'||!Array.isArray(obj.fills)||obj.fills.length!==1||obj.fills[0].type!=='SOLID')throw Error('fill 绑定仅支持单个 SOLID 填充和 COLOR 变量');
      write=()=>{obj.fills=[figma.variables.setBoundVariableForPaint(obj.fills[0],'color',variable)];};
    }else{
      if(!['itemSpacing','paddingTop','paddingBottom','paddingLeft','paddingRight','height','width','topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius'].includes(value.field)||variable.resolvedType!=='FLOAT'||typeof obj.setBoundVariable!=='function')throw Error('不支持此绑定字段或变量类型');
      const resolved=variable.resolveForConsumer(obj).value,style=policy.profiles[args.profile||policy.defaultProfile];
      if(!Number.isFinite(resolved)||resolved<0)throw Error('尺寸变量必须解析为非负数');
      if(/padding|Spacing/.test(value.field)&&!validDimension(resolved,style.spacing))throw Error('变量值不在 spacing 档位');
      if(/Radius/.test(value.field)&&!validDimension(resolved,style.radii))throw Error('变量值不在 radius 档位');
      write=()=>obj.setBoundVariable(value.field,variable);
    }
  }else if(target.kind==='node'&&['itemSpacing','paddingTop','paddingBottom','paddingLeft','paddingRight','cornerRadius'].includes(field)&&field in obj){
    const style=policy.profiles[args.profile||policy.defaultProfile],allowed=field==='cornerRadius'?style.radii:style.spacing;
    if(!validDimension(value,allowed))throw Error('数值不在当前风格档位');
    if(obj.boundVariables?.[field]||(field==='cornerRadius'&&['topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius'].some(k=>obj.boundVariables?.[k])))throw Error('字段已绑定变量，请修改变量，不解除绑定');
    write=()=>{obj[field]=value;};
  }else throw Error('不支持此目标/字段组合');
  return {obj,record,before,write};
}
export function createDesignExecutor(figma,documentId){
  const receiptKey=id=>'bridge-design-receipt-v2-'+id;
  const load=key=>JSON.parse(figma.root.getPluginData(key)||'null');
  const save=(key,value)=>figma.root.setPluginData(key,value===null?'':JSON.stringify(value));
  const guard=()=>{if(figma.root.name!==TARGET_NAME||figma.root.getPluginData('bridge-document-id')!==documentId)throw Error('目标文档身份已改变');};
  return async message=>{
    guard();if(message.documentId!==documentId)throw Error('请求目标不匹配');
    const {id,action,args}=message.request;
    if(action==='design.selection')return {result:{pageId:figma.currentPage.id,pages:figma.root.children.map(p=>({id:p.id,name:p.name})),...(selectedTheme(figma)?{theme:selectedTheme(figma)}:{}),selection:(figma.currentPage.selection||[]).map(n=>({id:n.id,name:n.name,type:n.type})),readOnly:true}};
    if(action==='design.export'){
      const node=await figma.getNodeByIdAsync(args.nodeId);
      if(!node||!['FRAME','INSTANCE','COMPONENT','COMPONENT_SET'].includes(node.type))throw Error('请选择可导出的画板或组件');
      return {result:{nodeId:node.id,name:node.name},png:Array.from(await node.exportAsync({format:'PNG'}))};
    }
    if(action==='design.read')return {result:await readDesign(figma,args)};
    if(action==='design.audit'){const snapshot=await readDesign(figma,args);return {result:auditDesign(snapshot,args)};}
    const state=load(KEY)||{receipts:{}};
    const pending=load(PENDING_KEY);
    const receipt=load(receiptKey(id))||(pending?.id===id?pending:null)||state.receipts[id];
    if(receipt){
      if(receipt.digest!==message.digest)throw Error('相同 ID 内容冲突');
      if(receipt.status==='done')return {result:{...receipt.result,replayed:true,historical:true}};
    }
    if((pending&&pending.id!==id&&!load(receiptKey(pending.id)))||Object.entries(state.receipts).some(([key,r])=>key!==id&&r.status==='prepared'&&!load(receiptKey(key))))throw Error('有未确认设计写入，请先恢复原请求');
    const legacy=JSON.parse(figma.root.getPluginData('bridge-state-v1')||'{"receipts":{}}');
    if(Object.values(legacy.receipts).some(r=>r.status==='running'))throw Error('先恢复未完成的样本任务');
    if(action==='design.page')return openDesignPage(figma,message);
    if(action==='design.collections')return migrateCollections(figma,args);
    if(action==='design.typography')return {result:await syncTypography(figma,args)};
    if(action==='design.template')return {result:args.retireOverviewPreview?await retireOverviewPreview(figma,args):await ensureTemplate(figma,args)};
    if(action==='design.theme')return {result:await applyTheme(figma,message)};
    if(action==='design.compose')return compose(figma,message,readDesign);
    const patch=await preparePatch(figma,args);
    const before=JSON.parse(args.expected);
    const current=patch.before;
    const confirmed=message.recover&&receipt?.status==='prepared'&&args.field==='fillOpacity'&&
      Math.abs(current.fills[0].opacity-args.value)<0.000001&&
      canonical({...current,fills:[{...current.fills[0],opacity:before.fills?.[0]?.opacity}]})===args.expected;
    if(!confirmed&&canonical(current)!==args.expected)throw Error(receipt?'中断期间可能已写入或发生人工编辑；无法安全重放，请回读核对，不覆盖':'对象已改变，请重新读取并生成 diff');
    if(args.dryRun!==false)return {result:{dryRun:true,target:args.target,field:args.field,before:patch.before,value:args.value,policyVersion:policy.version}};
    guard();if(canonical(patch.record(patch.obj))!==canonical(current))throw Error('预检后对象已改变');
    save(PENDING_KEY,{id,digest:message.digest,status:'prepared'});
    try{
      if(!confirmed)patch.write();
      const after=patch.record(patch.obj);
      const result={target:args.target,field:args.field,before,after,fingerprint:canonical(after),replayed:!!confirmed,policyVersion:policy.version};
      save(receiptKey(id),{digest:message.digest,status:'done',result});
      save(PENDING_KEY,null);
      return {result};
    }catch(error){error.uncertain=true;throw error;}
  };
}
