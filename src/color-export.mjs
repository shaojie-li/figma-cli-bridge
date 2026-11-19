import {collectionThemes,themeNames,gradientNames} from './theme-collections.mjs';
import roles from '../design/color-roles.json' with {type:'json'};
import {nameIssue} from './design-policy.mjs';

export function exportLightColors(snapshot){
  const variables=new Map(snapshot.variables.map(variable=>[variable.id,variable]));
  const collections=new Map(snapshot.collections.map(collection=>[collection.id,collection]));
  const colors={};

  function resolve(variable,seen=new Set()){
    if(!variable||variable.resolvedType!=='COLOR')throw Error('颜色别名缺失或类型不符');
    if(seen.has(variable.id))throw Error('颜色别名循环：'+variable.name);
    seen.add(variable.id);
    const collection=collections.get(variable.variableCollectionId);
    const mode=collection?.modes.find(mode=>mode.name==='Light');
    const legacy=collection?.name==='Bridge/Light'&&collection.modes.length===1;
    const modeId=mode?.modeId||((legacy||collection?.modes.length===1)&&collection.defaultModeId);
    const value=variable.valuesByMode[modeId];
    if(!value)throw Error('缺少 Light 模式颜色：'+variable.name);
    if(value.type==='VARIABLE_ALIAS')return resolve(variables.get(value.id),seen);
    const channels=[value.r,value.g,value.b,value.a??1];
    if(!channels.every(channel=>Number.isFinite(channel)&&channel>=0&&channel<=1))throw Error('无效 sRGB 颜色：'+variable.name);
    const hex=channels.map(channel=>Math.round(channel*255).toString(16).padStart(2,'0')).join('');
    return '#'+(hex.endsWith('ff')?hex.slice(0,6):hex);
  }

  if(snapshot.collections.some(c=>themeNames.some(theme=>c.name==='Color/'+theme))){
    const mappings=collectionThemes(snapshot.collections,snapshot.variables);
    const themes={normal:{},warm:{}};
    for(const [theme,{ids}] of Object.entries(mappings)){
      const [family,scheme]=theme.toLowerCase().split('/');
      const color=role=>resolve(variables.get(ids[role]));
      const palette=Object.fromEntries(Object.keys(roles).map(role=>[role,color('color/'+role)]));
      palette.gradient=Object.fromEntries(gradientNames.map(role=>[role.slice(9),color(role)]));
      themes[family][scheme]=palette;
    }
    const {gradient,...light}=themes.normal.light;
    return {version:1,colorSpace:'srgb',modes:{light},themes};
  }
  for(const variable of variables.values()){
    if(!variable.name.startsWith('color/'))continue;
    const issue=nameIssue('VARIABLE',variable.name);
    if(issue)throw Error(variable.name+'：'+issue);
    const role=variable.name.slice(6);
    if(Object.hasOwn(colors,role))throw Error('重复的颜色角色：'+role);
    colors[role]=resolve(variable);
  }
  const missing=Object.keys(roles).filter(role=>!Object.hasOwn(colors,role));
  if(missing.length)throw Error('缺少颜色角色：'+missing.join(', '));
  return {version:1,colorSpace:'srgb',modes:{light:Object.fromEntries(Object.keys(roles).map(role=>[role,colors[role]]))}};
}
