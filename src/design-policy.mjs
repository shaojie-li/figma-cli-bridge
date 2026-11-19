import policy from '../design/policy.json' with {type:'json'};
import components from '../design/components.json' with {type:'json'};
import colorRoles from '../design/color-roles.json' with {type:'json'};
import {currentLayoutName} from './layout-names.mjs';
export {policy,components};
const segment='[A-Z][A-Za-z0-9]*';
const pathName=new RegExp('^'+segment+'(?:/'+segment+')*$');
export function parseVariant(name) {
  const values={};
  for(const part of name.split(', ')){
    const m=part.match(/^([A-Z][A-Za-z0-9]*)=([A-Z][A-Za-z0-9]*)$/);
    if(!m||Object.hasOwn(values,m[1]))return null;
    values[m[1]]=m[2];
  }
  return values;
}
export function validDimension(value,scale) {
  return Number.isFinite(value)&&value>=0&&(!scale||scale.includes(value));
}
export function nameIssue(kind,name,{variant=false,profile='luigi-default'}={}) {
  if(profile==='document')return typeof name==='string'&&name.trim()&&!/[\x00-\x1f\x7f]/.test(name)?null:'名称需为可读文字';
  if(typeof name!=='string'||!name||name.length>120)return '名称需为 1–120 个字符';
  if(kind==='DOCUMENT')return /^[^·/\n]+ · (DesignSystem|Product|Sandbox|UIKitReview) · (Web|iOS|Android|CrossPlatform)$/.test(name)?null:'文件名应为 产品 · 用途 · 平台';
  if(kind==='PAGE'){
    const topic=name.slice(policy.taskPagePrefix.length);
    const taskPage=name.startsWith(policy.taskPagePrefix)&&topic.length>0&&topic.trim()===topic&&!/[\x00-\x1f\x7f]/.test(topic);
    return policy.pages.includes(name)||taskPage?null:'使用规范目录名或 Sandbox 任务页名称';
  }
  if(kind==='VARIABLE'&&name.startsWith('color/')){
    return /^color\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)&&Object.prototype.hasOwnProperty.call(colorRoles,name.slice(6))?null:'共享颜色需登记在 design/color-roles.json，例如 color/primary';
  }
  if(kind==='VARIABLE'&&currentLayoutName(name)!==name)return '布局变量请使用 '+currentLayoutName(name);
  if(kind==='VARIABLE')return /^[a-z][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)+$/.test(name)?null:'变量用小写 slash 路径，例如 color/primary';
  if(variant)return parseVariant(name)?null:'变体名必须为 Axis=Value, Axis=Value';
  if(/^(Frame|Group|Rectangle|Vector|Text|Component|Instance|Copy)(\s*\d+)?$/i.test(name)||/copy|final|副本|最终/i.test(name))return '禁止自动生成或版本后缀名称';
  return pathName.test(name)?null:'结构层使用 PascalCase 语义名称；分组用 /，不含空格';
}
export function requiredCases(contract) {
  const cases=[contract.defaults];
  for(const axis of contract.coverEach)for(const value of contract.axes[axis])cases.push({...contract.defaults,[axis]:value});
  for(const pair of contract.requiredPairs)cases.push({...contract.defaults,...pair});
  const key=v=>Object.keys(v).sort().map(k=>k+'='+v[k]).join(', ');
  return [...new Map(cases.map(v=>[key(v),v])).values()];
}
export function auditDesign(snapshot,{profile=policy.defaultProfile,requireComponents=[],exceptions=[]}={}) {
  const style=policy.profiles[profile];if(!Object.hasOwn(policy.profiles,profile))throw Error('未知设计 profile');
  const issues=[];
  const add=(rule,id,actual,expected,severity='error')=>issues.push({rule,id,actual,expected,severity});
  for(const e of exceptions){
    if(!e||!e.id||!e.rule||!e.reason||e.actual===undefined)throw Error('例外必须含 id、rule、actual 和原因');
    if(!['spacing.scale','radius.scale','type.scale','naming.semantic'].includes(e.rule))throw Error('此规则不可通过视觉例外豁免');
  }
  if(!snapshot||!Array.isArray(snapshot.nodes)||!Array.isArray(snapshot.variables)||!snapshot.document)throw Error('不是完整设计快照');
  const nodes=new Map(snapshot.nodes.map(n=>[n.id,n]));
  function belongsToInstance(node){
    const seen=new Set();
    while(node&&!seen.has(node.id)){
      if(node.type==='INSTANCE')return true;
      seen.add(node.id);
      node=nodes.get(node.parentId);
    }
    return false;
  }
  for(const n of snapshot.nodes){
    // Reused masters own their internal typography, artwork and layout.
    if(profile==='document'&&belongsToInstance(n)){
      if(n.type==='INSTANCE'&&!n.mainComponentId)add('instance.master',n.id,n.mainComponentId,'可解析的主组件');
      continue;
    }
    const variant=n.type==='COMPONENT'&&nodes.get(n.parentId)?.type==='COMPONENT_SET';
    const issue=nameIssue(n.type,n.name,{variant,profile});if(issue)add('naming.semantic',n.id,n.name,issue);
    if(n.type==='TEXT'){
      if(!n.textStyleId)add('type.style',n.id,n.textStyleId,'共享文本样式');
      if(style.fontFamilies&&!style.fontFamilies.includes(n.fontName?.family))add('type.family',n.id,n.fontName,style.fontFamilies);
      if(style.typeScale&&!style.typeScale.some(([size,line])=>size===n.fontSize&&n.lineHeight?.unit==='PIXELS'&&n.lineHeight.value===line))add('type.scale',n.id,[n.fontSize,n.lineHeight],style.typeScale);
    }
    if(style.spacing&&n.layoutMode&&n.layoutMode!=='NONE')for(const field of ['itemSpacing','paddingTop','paddingBottom','paddingLeft','paddingRight']){
      if(typeof n[field]==='number'&&!style.spacing.includes(n[field]))add('spacing.scale',n.id,{field,value:n[field]},style.spacing);
    }
    if(style.radii&&typeof n.cornerRadius==='number'&&!style.radii.includes(n.cornerRadius))add('radius.scale',n.id,n.cornerRadius,style.radii);
    if(profile!=='document'&&['COMPONENT','COMPONENT_SET'].includes(n.type)&&n.layoutMode==='NONE')add('layout.auto',n.id,n.layoutMode,'Auto Layout；绝对布局需单独设计说明');
    for(const field of ['fills','strokes'])if(Array.isArray(n[field]))for(const [index,p] of n[field].entries()){
      if(p.visible!==false&&p.type==='SOLID'&&!p.boundVariables?.color)add('color.binding',n.id,{field,index},'语义颜色变量绑定');
    }
    if(profile!=='document'&&n.name?.startsWith('Icon/')&&!n.name.startsWith('Icon/Phosphor/'))add('icon.library',n.id,n.name,'Icon/Phosphor/Name/Weight');
  }
  const fileIssue=nameIssue('DOCUMENT',snapshot.document.name,{profile});
  if(fileIssue)add('naming.file',snapshot.document.id,snapshot.document.name,fileIssue,policy.legacyFiles.includes(snapshot.document.name)?'warning':'error');
  const vars=new Map(snapshot.variables.map(v=>[v.id,v])),names=new Set();
  for(const v of snapshot.variables){
    const ni=nameIssue('VARIABLE',v.name,{profile});if(ni)add('naming.variable',v.id,v.name,ni);
    const key=v.variableCollectionId+'/'+v.name;if(names.has(key))add('variable.duplicate',v.id,v.name,'集合内唯一');names.add(key);
    const walk=(id,seen)=>{
      if(seen.has(id)){add('variable.cycle',v.id,id,'无循环别名');return;}
      const target=vars.get(id);if(!target){add('variable.missing',v.id,id,'别名目标在快照中');return;}
      if(target.resolvedType!==v.resolvedType)add('variable.type',v.id,target.resolvedType,v.resolvedType);
      for(const value of Object.values(target.valuesByMode||{}))if(value?.type==='VARIABLE_ALIAS')walk(value.id,new Set([...seen,id]));
    };walk(v.id,new Set());
  }
  for(const name of requireComponents){
    const contract=components.contracts[name];if(!contract)throw Error('未登记组件合同：'+name);
    const sets=snapshot.nodes.filter(n=>n.type==='COMPONENT_SET'&&n.name===name);
    if(sets.length!==1){add('component.set',name,sets.length,'唯一组件集');continue;}
    const set=sets[0],variants=snapshot.nodes.filter(n=>n.type==='COMPONENT'&&n.parentId===set.id);
    const parsed=variants.map(n=>({id:n.id,values:parseVariant(n.name)})),signatures=new Set();
    for(const {id,values} of parsed){
      if(!values||Object.keys(values).length!==Object.keys(contract.axes).length||Object.entries(contract.axes).some(([key,options])=>!options.includes(values[key]))){add('component.axes',id,values,contract.axes);continue;}
      const sig=JSON.stringify(Object.keys(values).sort().map(k=>[k,values[k]]));if(signatures.has(sig))add('component.duplicate',id,values,'唯一状态组合');signatures.add(sig);
      for(const forbidden of contract.forbidden)if(Object.entries(forbidden).every(([k,v])=>values[k]===v))add('component.forbidden',id,values,forbidden);
    }
    for(const needed of requiredCases(contract))if(!parsed.some(({values})=>values&&Object.entries(needed).every(([k,v])=>values[k]===v)))add('component.coverage',set.id,needed,'缺少必验状态样本');
    const defs=Object.fromEntries(Object.entries(set.componentPropertyDefinitions||{}).map(([k,v])=>[k.split('#')[0],v.type]));
    for(const [name,type] of Object.entries(contract.properties))if(defs[name]!==type)add('component.property',set.id,{name,type:defs[name]},type);
    // A visible label alone is not an exposed component property: require an actual layer reference in every variant.
    for(const [name,type] of Object.entries(contract.properties))for(const variant of variants){
      const prop=Object.keys(set.componentPropertyDefinitions||{}).find(k=>k.split('#')[0]===name);
      const descendants=snapshot.nodes.filter(n=>{let p=n.parentId;const visited=new Set();while(p&&!visited.has(p)){if(p===variant.id)return true;visited.add(p);p=nodes.get(p)?.parentId;}return false;});
      if(prop&&!descendants.some(n=>Object.values(n.componentPropertyReferences||{}).includes(prop)))add('component.propertyBinding',variant.id,{name,type},'属性需绑定实际图层');
    }
  }
  const accepted=[];
  for(const e of exceptions){const index=issues.findIndex(i=>i.rule===e.rule&&i.id===e.id&&JSON.stringify(i.actual)===JSON.stringify(e.actual));if(index<0)throw Error('例外已失效或未匹配实际值：'+e.rule);accepted.push({...issues.splice(index,1)[0],reason:e.reason});}
  return {policyVersion:policy.version,profile,scope:snapshot.scope,technicalPassed:!issues.some(i=>i.severity==='error'),readyForProduct:false,issues,exceptions:accepted,manualReviewRequired:['产品方向与辨识度','真实 PNG 的层级、留白、光学对齐、中文排版','长内容、目标宽度、完整状态','对比度与真实交互/键盘/读屏验证；当前审计未自动计算对比度'],profileStatus:style.status};
}
