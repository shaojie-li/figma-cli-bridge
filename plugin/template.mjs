import {syncTypography} from './typography.mjs';
import tokens from '../design/theme-defaults.json' with {type:'json'};
import {themeNames} from '../src/theme-collections.mjs';
import {addLayoutTokens,missingLayoutTokens} from './layout-scale.mjs';

function asColor(hex) {
  const [r,g,b,a=255]=hex.slice(1).match(/../g).map(v=>parseInt(v,16));
  return {r:r/255,g:g/255,b:b/255,a:a/255};
}

export async function ensureTemplate(figma,{dryRun=true}) {
  const api=figma.variables;
  const collections=await api.getLocalVariableCollectionsAsync();
  const variables=await api.getLocalVariablesAsync();
  function unique(name) {
    const matches=collections.filter(c=>c.name===name);
    if(matches.length>1 || matches[0]?.remote)throw Error('无法唯一定位本地集合 '+name);
    return matches[0];
  }
  const old=unique('Color');
  if(old && (old.modes.length!==1 || unique('Color/Normal/Light')))throw Error('旧 Color 与模板冲突，请核对集合');
  const layout=unique('Layout');
  if(layout)missingLayoutTokens(layout,variables);
  const plans=themeNames.map(theme=>{
    const [family,scheme]=theme.toLowerCase().split('/');
    const name='Color/'+theme;
    const collection=unique(name)||(theme==='Normal/Light'?old:null);
    if(collection && collection.modes.length!==1)throw Error('集合已有多个模式 '+name);
    const {gradient,...colors}=tokens[family][scheme];
    const defaults=[...Object.entries(colors).map(([k,v])=>['color/'+k,v]),...Object.entries(gradient).map(([k,v])=>['gradient/'+k,v])];
    const missing=[];
    for(const [role,hex] of defaults){
      const hits=collection?variables.filter(v=>v.variableCollectionId===collection.id&&v.name===role):[];
      if(hits.length>1||hits.some(v=>v.resolvedType!=='COLOR'))throw Error('模板角色冲突 '+name+'/'+role);
      if(hits.length)continue;
      const oldName='preview/overview/'+(scheme==='dark'?'Dark':'Warm')+'/'+role;
      const previous=family==='warm'&&old?variables.find(v=>v.variableCollectionId===old.id&&v.name===oldName):null;
      missing.push([role,previous?.valuesByMode[old.defaultModeId]??asColor(hex)]);
    }
    return {name,collection,missing};
  });
  if(old && variables.some(v=>v.variableCollectionId===old.id&&!/^(color\/|preview\/overview\/(Warm|Dark)\/)/.test(v.name)))throw Error('旧 Color 含非模板资源，请先指定用途');
  const summary=plans.map(p=>({name:p.name,add:p.missing.length}));
  const typography=await syncTypography(figma,{});
  if(dryRun)return {dryRun:true,collections:summary,missingTextStyles:typography.missing};
  const undo=[];
  try{
    if(old){old.name='Color/Normal/Light';undo.push(()=>{old.name='Color';});}
    for(const plan of plans){
      const c=plan.collection||api.createVariableCollection(plan.name);
      if(!plan.collection){undo.push(()=>c.remove());c.renameMode(c.defaultModeId,plan.name.split('/')[2]);}
      for(const [role,value] of plan.missing){
        const v=api.createVariable(role,c,'COLOR');undo.push(()=>v.remove());
        v.setValueForMode(c.defaultModeId,value);
        v.scopes=['ALL_FILLS','STROKE_COLOR'];
        v.setVariableCodeSyntax('WEB','var(--ui-'+role.replace(/^color\//,'').replace('/','-')+')');
      }
    }
    if(typography.missing.length){
      const styles=await syncTypography(figma,{expected:typography.fingerprint});
      for(const {id} of styles.created || []){
        const style=await figma.getStyleByIdAsync(id);
        if(style)undo.push(()=>style.remove());
      }
    }
    const dimensions=layout||api.createVariableCollection('Layout');
    if(!layout){undo.push(()=>dimensions.remove());dimensions.renameMode(dimensions.defaultModeId,'Default');}
    addLayoutTokens(figma,dimensions,missingLayoutTokens(dimensions,variables));
    return {collections:summary,layoutId:dimensions.id};
  }catch(error){for(const restore of undo.reverse())restore();throw error;}
}

// Retire only the old overview fixture. A file with other consumers keeps those variables.
export async function retireOverviewPreview(figma,{dryRun=true}) {
  const api=figma.variables;
  const collections=await api.getLocalVariableCollectionsAsync();
  const source=collections.find(c=>c.name==='Color/Normal/Light');
  if(!source)throw Error('请先初始化四个主题集合');
  const vars=await api.getLocalVariablesAsync();
  const candidates=vars.filter(v=>v.variableCollectionId===source.id && /^preview\/overview\/(Warm|Dark)\/(gradient|color)\//.test(v.name));
  if(!candidates.length)return {removed:0};
  const ids=new Set(candidates.map(v=>v.id));
  for(const v of candidates){
    const [, ,mode,...segments]=v.name.split('/');
    const dest=collections.find(c=>c.name==='Color/Warm/'+(mode==='Warm'?'Light':'Dark'));
    const next=vars.find(item=>item.variableCollectionId===dest?.id && item.name===segments.join('/'));
    if(!next || JSON.stringify(next.valuesByMode[dest.defaultModeId])!==JSON.stringify(v.valuesByMode[source.defaultModeId]))throw Error('目标集合缺少相同色值 '+v.name);
  }
  function referenced(value){
    if(value===null||typeof value!=='object')return ids.has(value);
    return Object.values(value).some(referenced);
  }
  if(vars.some(v=>referenced(v.valuesByMode)))throw Error('旧预览变量仍有别名引用');
  const fields=['boundVariables','fills','strokes','effects','layoutGrids','paints'];
  function check(node){
    if(fields.some(k=>k in node && referenced(node[k])))throw Error('旧预览变量仍被使用 '+node.id);
    if(node.type==='TEXT' && node.fills===figma.mixed && referenced(node.getStyledTextSegments(['fills'])))throw Error('混合文本引用旧预览变量 '+node.id);
    if(node.type==='FRAME' && referenced(JSON.parse(node.getPluginData('bridge-frame-theme-v1')||'null')))throw Error('请先迁移画板主题 '+node.id);
  }
  await figma.loadAllPagesAsync();
  for(const page of figma.root.children){check(page);for(const n of page.findAll())check(n);}
  for(const method of ['getLocalPaintStylesAsync','getLocalEffectStylesAsync','getLocalTextStylesAsync','getLocalGridStylesAsync']){
    for(const style of await figma[method]())check(style);
  }
  if(dryRun)return {dryRun:true,unused:candidates.length};
  for(const v of candidates)v.remove();
  return {removed:candidates.length};
}
