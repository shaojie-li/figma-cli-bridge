import {validateTheme} from './theme-plan.mjs';
import {policy} from './design-policy.mjs';
import {validateComposition} from './compose-plan.mjs';
export const PROTOCOL = 1;
export const TARGET_NAME = 'CLI Bridge · Sandbox';
export const PORT = 38475;
export const REQUEST_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
function validateDesign(action,args){
  const allowed=action==='design.selection'?[]:action==='design.patch'?['target','field','value','expected','dryRun','profile']:['nodeIds','limit',...(action==='design.audit'?['profile','requireComponents','exceptions']:[])];
  if(Object.keys(args).some(k=>!allowed.includes(k)))throw Error('未知设计参数');
  if('profile'in args&&(typeof args.profile!=='string'||!Object.hasOwn(policy.profiles,args.profile)))throw Error('未知设计 profile');
  if('nodeIds'in args&&(!Array.isArray(args.nodeIds)||!args.nodeIds.length||args.nodeIds.length>30||args.nodeIds.some(id=>typeof id!=='string'||id.length>100)))throw Error('nodeIds 需为 1–30 个节点 ID');
  if('limit'in args&&(!Number.isInteger(args.limit)||args.limit<1||args.limit>1000))throw Error('limit 需在 1–1000');
  if('requireComponents'in args&&(!Array.isArray(args.requireComponents)||args.requireComponents.some(n=>typeof n!=='string')))throw Error('requireComponents 需为组件名数组');
  if('exceptions'in args&&!Array.isArray(args.exceptions))throw Error('exceptions 需为数组');
  if(action==='design.patch'){
    if(!object(args.target)||!['node','variable','collection'].includes(args.target.kind)||typeof args.target.id!=='string'||!args.target.id||Object.keys(args.target).some(k=>!['kind','id'].includes(k)))throw Error('target 非法');
    if(!['name','characters','value','visible','webColorSyntax','binding','fillOpacity','instanceProperties','itemSpacing','paddingTop','paddingBottom','paddingLeft','paddingRight','cornerRadius'].includes(args.field))throw Error('不支持的设计字段');
    if(typeof args.expected!=='string'||!args.expected||args.expected.length>80000)throw Error('写入需要回读 fingerprint');
    if(!Object.hasOwn(args,'value'))throw Error('缺少 value');
    if(args.field==='visible'&&(args.target.kind!=='node'||typeof args.value!=='boolean'))throw Error('图层可见性需要布尔值');
    if(args.field==='fillOpacity'&&(args.target.kind!=='node'||!Number.isFinite(args.value)||args.value<0||args.value>1))throw Error('填充透明度需在 0–1 之间');
    if('dryRun'in args&&typeof args.dryRun!=='boolean')throw Error('dryRun 需为布尔值');
    if(['value','binding','instanceProperties'].includes(args.field)&&!object(args.value))throw Error('此字段的 value 需为对象');
    if(args.field==='value'&&(typeof args.value.modeId!=='string'||!Object.hasOwn(args.value,'value')||Object.keys(args.value).some(k=>!['modeId','value'].includes(k))))throw Error('变量值需含 modeId 和 value');
    if(args.field==='binding'&&(typeof args.value.variableId!=='string'||typeof args.value.field!=='string'||Object.keys(args.value).some(k=>!['field','variableId'].includes(k))))throw Error('binding 需含 field 和 variableId');
  }
}
export function validateRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('请求必须是对象');
  const {id, action, args = {}} = input;
  if (!REQUEST_ID.test(id || '')) throw Error('requestId 非法');
  if (!['demo.ensure','demo.update','inspect','export','design.read','design.audit','design.patch','design.selection','design.compose','design.theme','design.template','design.page','design.collections','design.typography','design.export','button.complete','button.verify','button.export'].includes(action)) throw Error('不支持的 action');
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw Error('args 必须是对象');
  if(action.startsWith('button.')){
    if(Object.keys(input).some(k=>!['id','action','args'].includes(k)))throw Error('未知字段');
    if(action==='button.complete'){if(Object.keys(args).some(k=>!['expected','resumeFrom'].includes(k))||typeof args.expected!=='string'||('resumeFrom'in args&&typeof args.resumeFrom!=='string'))throw Error('Button 更新需要预检 seal');}
    else if(Object.keys(args).length)throw Error('此操作无需参数');
    return {id,action,args};
  }
  if(action.startsWith('design.')){
    if(Object.keys(input).some(k=>!['id','action','args'].includes(k)))throw Error('请求含未知字段');
    if(action==='design.compose')validateComposition(args);
    else if(action==='design.template'){
      if(Object.keys(args).some(k=>!['dryRun','retireOverviewPreview'].includes(k)||typeof args[k]!=='boolean'))throw Error('模板参数需为布尔值');
    }
    else if(action==='design.theme')validateTheme(args);
    else if(action==='design.collections'||action==='design.typography'){
      if(Object.keys(args).some(key=>key!=='expected')||('expected'in args&&(typeof args.expected!=='string'||!args.expected)))throw Error('集合迁移需要预检 fingerprint');
    }else if(action==='design.page'){
      const key=Object.keys(args)[0], value=args[key];
      if(Object.keys(args).length!==1||!['name','pageId'].includes(key)||typeof value!=='string'||!value||value.length>120||value.trim()!==value||/[\x00-\x1f\x7f]/.test(value))throw Error('指定新页面 name 或已有 pageId，且只能指定一项');
    }else if(action==='design.export'){
      if(Object.keys(args).length!==1||typeof args.nodeId!=='string'||!args.nodeId)throw Error('导出需要 nodeId');
    }else validateDesign(action,args);
    return {id,action,args};
  }
  const allowed = action === 'demo.ensure' ? ['label','primary'] : action === 'demo.update' ? ['label','primary','width','expectedRevision'] : [];
  if (Object.keys(args).some(k => !allowed.includes(k))) throw Error('未知参数');
  if ('label' in args && (typeof args.label !== 'string' || !args.label.trim() || args.label.length > 40)) throw Error('label 需为 1–40 个字符');
  if ('primary' in args && !/^#[0-9a-fA-F]{6}$/.test(args.primary)) throw Error('primary 必须为 #RRGGBB');
  if ('width' in args && (!Number.isInteger(args.width) || args.width < 160 || args.width > 640 || args.width % 4)) throw Error('width 需在 160–640 px 且为 4 的倍数');
  if (action === 'demo.update' && (!Number.isInteger(args.expectedRevision) || args.expectedRevision < 1)) throw Error('更新必须提供 expectedRevision');
  if (action === 'demo.update' && !['label','primary','width'].some(k => k in args)) throw Error('更新内容为空');
  if (Object.keys(input).some(k => !['id','action','args'].includes(k))) throw Error('请求含未知字段');
  return {id, action, args};
}
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
