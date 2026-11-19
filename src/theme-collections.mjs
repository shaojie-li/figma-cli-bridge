import roles from '../design/color-roles.json' with {type:'json'};
export const themeNames = ['Normal/Light','Normal/Dark','Warm/Light','Warm/Dark'];
export const gradientNames = ['gradient/start','gradient/middle','gradient/end'];

export function collectionThemes(collections,variables) {
  const modes = {};
  for (const theme of themeNames) {
    const matches = collections.filter(c => c.name === 'Color/'+theme);
    if (matches.length !== 1 || matches[0].modes.length !== 1) throw Error('需要唯一的单模式集合 Color/'+theme);
    const collection = matches[0];
    const ids = {};
    for (const v of variables.filter(v => v.variableCollectionId === collection.id && /^(color|gradient)\//.test(v.name))) {
      if (v.resolvedType !== 'COLOR' || Object.hasOwn(ids,v.name)) throw Error('无效或重复角色 '+v.name);
      ids[v.name] = v.id;
    }
    for(const role of [...Object.keys(roles).map(k=>'color/'+k),...gradientNames]){
      if(!ids[role])throw Error('集合缺少角色 Color/'+theme+'/'+role);
    }
    modes[theme] = {collectionId:collection.id,modeId:collection.defaultModeId,ids};
  }
  return modes;
}
