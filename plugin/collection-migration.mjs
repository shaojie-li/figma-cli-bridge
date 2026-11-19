import {exportLightColors} from '../src/color-export.mjs';
import {addLayoutTokens,missingLayoutTokens} from './layout-scale.mjs';
import {currentLayoutName} from '../src/layout-names.mjs';
import {canonical} from '../src/protocol.mjs';
import {seal} from '../src/button-plan.mjs';

export async function migrateCollections(figma,args){
  await figma.loadAllPagesAsync();
  const collections=await figma.variables.getLocalVariableCollectionsAsync();
  const all=await figma.variables.getLocalVariablesAsync();
  const colors=exportLightColors({collections,variables:all});
  if(collections.length===2&&['Color','Layout'].every(name=>collections.some(item=>item.name===name))){
    const layout=collections.find(item=>item.name==='Layout');
    const dimensions=all.filter(item=>item.variableCollectionId===layout.id);
    const changes=dimensions.filter(item=>currentLayoutName(item.name)!==item.name);
    const missing=missingLayoutTokens(layout,dimensions);
    if(changes.length||missing.length){
      if(new Set(dimensions.map(item=>currentLayoutName(item.name))).size!==dimensions.length)throw Error('布局变量重名');
      const fingerprint=seal([layout.id,dimensions.map(item=>[item.id,item.name,item.valuesByMode]),missing]);
      if(!args.expected)return {result:{fingerprint,renames:changes.length,additions:missing.map(([name])=>name)}};
      if(args.expected!==fingerprint)throw Error('迁移预检已过期');
      for(const item of changes)item.name=currentLayoutName(item.name);
      addLayoutTokens(figma,layout,missing);
      return {result:{renamed:changes.length,added:missing.length,colors}};
    }
    return {result:{alreadyMigrated:true,colors}};
  }
  const byName=new Map(collections.map(item=>[item.name,item]));
  const bridge=byName.get('Bridge/Light'),color=byName.get('Color/Light'),layout=byName.get('Dimension/Default'),source=byName.get('Primitive/Light');
  if(collections.length!==4||![bridge,color,layout,source].every(item=>item?.modes.length===1))throw Error('旧集合或模式与迁移范围不符');
  const old=all.filter(item=>item.variableCollectionId===bridge.id);
  const primitives=all.filter(item=>item.variableCollectionId===source.id);
  const semantic=all.filter(item=>item.resolvedType==='COLOR'&&!primitives.includes(item));
  const ids=new Map(all.map(item=>[item.id,item]));
  const targets=new Map();
  const values=new Map();
  for(const variable of semantic){
    const collection=variable.variableCollectionId===bridge.id?bridge:color;
    const raw=ids.get(variable.valuesByMode[collection.defaultModeId]?.id);
    if(!raw||!primitives.includes(raw)||targets.has(raw.id))throw Error('来源色别名不符合预期 '+variable.name);
    values.set(variable.id,raw.valuesByMode[source.defaultModeId]);targets.set(raw.id,variable);
  }
  if(old.length!==5||primitives.length!==15||targets.size!==15||semantic.length!==15||all.length!==41)throw Error('旧变量范围不符');
  for(const variable of old){
    if(!['color/primary','space/8','space/16','radius/control','control/md'].includes(variable.name)||all.some(other=>other!==variable&&other.name===variable.name))throw Error('旧集合有未知或重名变量');
    targets.set(variable.id,variable);
  }
  const button=JSON.parse(figma.root.getPluginData('bridge-button-v1')||'null');
  const legacy=JSON.parse(figma.root.getPluginData('bridge-state-v1')||'null');
  if(!button?.done||legacy?.assets.collection!==bridge.id||button.cols.colors!==color.id||button.cols.dimensions!==layout.id||button.cols.primitives!==source.id)throw Error('集合归属不符');
  const pages=figma.root.children;
  const nodes=pages.flatMap(page=>[page,...page.findAll(()=>true)]);
  const styles=(await Promise.all([figma.getLocalPaintStylesAsync(),figma.getLocalTextStylesAsync(),figma.getLocalEffectStylesAsync(),figma.getLocalGridStylesAsync()])).flat();
  const relevant=value=>Array.isArray(value)?value.some(relevant):value?.type==='VARIABLE_ALIAS'&&targets.has(value.id);
  function bindings(){
    const changes=[];
    for(const node of [...nodes,...styles]){
      if(node.explicitVariableModes?.[bridge.id]||node.explicitVariableModes?.[source.id])throw Error('发现显式旧模式，请先核对 '+node.id);
      for(const [field,binding] of Object.entries(node.boundVariables||{})){
        if(!relevant(binding))continue;
        if((field==='fills'||field==='strokes')&&Array.isArray(node[field])&&node[field].some(paint=>relevant(paint.boundVariables?.color))){
          changes.push({node,field,paint:true});
        }else if(binding.type==='VARIABLE_ALIAS'&&typeof node.setBoundVariable==='function'){
          changes.push({node,field,id:binding.id});
        }else throw Error('需要单独迁移的绑定 '+node.id+' '+field);
      }
    }
    return changes;
  }
  const changes=bindings();
  const fingerprint=seal({vars:all.map(item=>[item.id,item.name,item.valuesByMode,item.variableCollectionId]).sort(),bindings:changes.map(({node,field})=>[node.id,field,node.boundVariables[field]]),pages:pages.map(page=>page.id)});
  const report={fingerprint,variables:semantic.length,layoutVariables:all.length-primitives.length-semantic.length,bindingFields:changes.length};
  if(!args.expected)return {result:report};
  if(fingerprint!==args.expected)throw Error('迁移预检已过期');
  const frames=pages.flatMap(page=>page.children.filter(node=>node.type==='FRAME'));
  const render=async()=>{const images=[];for(const frame of frames)images.push(await frame.exportAsync({format:'PNG'}));return images;};
  const before=await render();
  const translucent=[];
  for(const node of nodes){
    for(const field of ['fills','strokes']){
      const paints=node[field];
      if(Array.isArray(paints)&&paints.some(paint=>paint.boundVariables?.color&&paint.opacity<1)){
        translucent.push({node,field,opacities:paints.map(paint=>paint.opacity)});
      }
    }
  }
  function restoreOpacity(){
    for(const {node,field,opacities} of translucent){
      const paints=node[field];
      if(paints.some((paint,index)=>paint.opacity!==opacities[index])){
        node[field]=paints.map((paint,index)=>({...paint,opacity:opacities[index]}));
      }
    }
  }
  const geometry=node=>[node.x,node.y,node.width,node.height,node.layoutSizingHorizontal,node.layoutSizingVertical,node.itemSpacing,node.paddingLeft,node.paddingTop];
  const originalGeometry=nodes.map(geometry);
  const undo=[];
  try{
    for(const variable of old){
      const dest=variable.resolvedType==='COLOR'?color:layout;
      const replacement=figma.variables.createVariable(currentLayoutName(variable.name),dest,variable.resolvedType);
      undo.push(()=>replacement.remove());
      replacement.scopes=variable.scopes;replacement.description=variable.description;
      for(const [platform,syntax] of Object.entries(variable.codeSyntax))replacement.setVariableCodeSyntax(platform,syntax);
      replacement.setValueForMode(dest.defaultModeId,values.get(variable.id)??variable.valuesByMode[bridge.defaultModeId]);
      targets.set(variable.id,replacement);
    }
    for(const variable of semantic.filter(item=>!old.includes(item))){
      const prior=variable.valuesByMode[color.defaultModeId];
      undo.push(()=>variable.setValueForMode(color.defaultModeId,prior));
      variable.setValueForMode(color.defaultModeId,values.get(variable.id));
    }
    const replacement=id=>{const target=targets.get(id);return targets.get(target.id)||target;};
    for(const {node,field,paint,id} of changes){
      if(paint){
        const previous=node[field];
        if(!previous.some(item=>relevant(item.boundVariables?.color)))continue;
        undo.push(()=>{node[field]=previous;});
        node[field]=previous.map(item=>relevant(item.boundVariables?.color)?{...figma.variables.setBoundVariableForPaint(item,'color',replacement(item.boundVariables.color.id)),opacity:item.opacity}:item);
      }else if(node.boundVariables[field]?.id===id){
        undo.push(()=>node.setBoundVariable(field,ids.get(id)));
        node.setBoundVariable(field,replacement(id));
      }
    }
    if(bindings().length)throw Error('仍存在旧变量绑定');
    restoreOpacity();
    const keep=all.filter(item=>!old.includes(item)&&!primitives.includes(item)).concat(old.map(item=>targets.get(item.id)));
    if(canonical(exportLightColors({variables:keep,collections:[color,layout]}))!==canonical(colors))throw Error('迁移前后颜色不同');
    const after=await render();
    const different=frames.filter((frame,index)=>before[index].length!==after[index].length||before[index].some((byte,offset)=>byte!==after[index][offset]));
    if(different.length){
      const changed=nodes.flatMap((node,index)=>canonical(geometry(node))===canonical(originalGeometry[index])?[]:[{id:node.id,before:originalGeometry[index],after:geometry(node)}]);
      throw Error('原生画板 PNG 不同：'+different.map(frame=>frame.id+' '+frame.name).join(', ')+'；布局差异 '+JSON.stringify(changed.slice(0,4)));
    }
  }catch(error){
    for(const restore of undo.reverse())restore();
    restoreOpacity();
    throw error;
  }
  for(const [key,id] of Object.entries(button.vars)){
    if(key.startsWith('raw-'))delete button.vars[key];
    else if(targets.has(id))button.vars[key]=targets.get(id).id;
  }
  for(const [key,id] of Object.entries(legacy.assets))if(targets.has(id))legacy.assets[key]=targets.get(id).id;
  legacy.assets.collection=color.id;legacy.assets.layoutCollection=layout.id;
  button.cols={colors:color.id,dimensions:layout.id};
  for(const item of all.filter(variable=>variable.variableCollectionId===layout.id))item.name=currentLayoutName(item.name);
  color.name='Color';layout.name='Layout';layout.renameMode(layout.defaultModeId,'Default');
  figma.root.setPluginData('bridge-button-v1',JSON.stringify(button));
  figma.root.setPluginData('bridge-state-v1',JSON.stringify(legacy));
  bridge.remove();source.remove();
  return {result:{...report,colors,verifiedFrames:frames.map(frame=>frame.id)}};
}
