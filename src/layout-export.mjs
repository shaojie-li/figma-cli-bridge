import {layoutScale} from './layout-scale.mjs';

export function exportLayout(snapshot){
  const collections=snapshot.collections.filter(item=>item.name==='Layout');
  if(collections.length!==1)throw Error('需要唯一的 Layout 集合');
  const [collection]=collections;
  const [mode]=collection.modes;
  if(collection.modes.length!==1||mode.name!=='Default'||mode.modeId!==collection.defaultModeId)throw Error('需要 Layout 的 Default 模式');
  const variables=new Map();
  for(const variable of snapshot.variables.filter(item=>item.variableCollectionId===collection.id)){
    if(variables.has(variable.name))throw Error('重复的布局变量：'+variable.name);
    variables.set(variable.name,variable);
  }
  const groups={};
  for(const [name,expected] of layoutScale){
    const variable=variables.get(name);
    if(!variable)throw Error('缺少布局变量：'+name);
    const value=variable.valuesByMode[mode.modeId];
    if(variable.resolvedType!=='FLOAT'||value!==expected)throw Error('布局变量与尺寸规范冲突：'+name);
    const [group,key]=name.split('/');
    (groups[group]??={})[key]=value;
    variables.delete(name);
  }
  if(variables.size)throw Error('未登记的布局变量：'+[...variables.keys()].join(', '));
  return {version:1,unit:'logical-pixel',modes:{default:groups}};
}
