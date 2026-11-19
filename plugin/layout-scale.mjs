import {layoutScale as tokens} from '../src/layout-scale.mjs';
import {currentLayoutName} from '../src/layout-names.mjs';

export function missingLayoutTokens(collection,variables){
  if(collection.name!=='Layout'||collection.modes.length!==1||collection.modes[0].name!=='Default')throw Error('需要 Layout 集合及 Default 模式');
  const existing=new Map();
  for(const variable of variables.filter(item=>item.variableCollectionId===collection.id)){
    const name=currentLayoutName(variable.name);
    if(existing.has(name))throw Error('布局变量重名：'+name);
    existing.set(name,variable);
  }
  return tokens.filter(([name,value])=>{
    const variable=existing.get(name);
    if(!variable)return true;
    if(variable.resolvedType!=='FLOAT'||variable.valuesByMode[collection.defaultModeId]!==value)throw Error('已有布局变量与规范冲突：'+name);
    return false;
  });
}

export function addLayoutTokens(figma,collection,missing){
  const created=[];
  try{
    for(const [name,value,scope] of missing){
      const variable=figma.variables.createVariable(name,collection,'FLOAT');
      created.push(variable);
      variable.setValueForMode(collection.defaultModeId,value);
      variable.scopes=[scope];
      variable.setVariableCodeSyntax('WEB','var(--ui-'+name.replace('/','-')+')');
    }
  }catch(error){
    for(const variable of created.reverse())variable.remove();
    throw error;
  }
}
