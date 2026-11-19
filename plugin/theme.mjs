import {themeNames,gradientNames,collectionThemes} from '../src/theme-collections.mjs';
import {bindStop} from './gradient.mjs';

const KEY = 'bridge-frame-theme-v1';
const rgba = hex => {
  const [r,g,b,a = 255] = hex.slice(1).match(/../g).map(pair => parseInt(pair,16));
  return {r:r/255,g:g/255,b:b/255,a:a/255};
};

export function frameTheme(frame) {
  const state = JSON.parse(frame?.getPluginData(KEY) || 'null');
  return state && state.frameId === frame.id ? state : null;
}

export function selectedTheme(figma) {
  const nodes=figma.currentPage.selection || [];
  const frame=nodes.length===1 && nodes[0].type==='FRAME' ? nodes[0] : null;
  const state=frame && frameTheme(frame);
  if(!state || frame.parent?.id!==figma.currentPage.id)return null;
  const modes=Object.keys(state.modes);
  const active=state.native ? modes.find(m=>state.modes[m].modeId===frame.resolvedVariableModes[state.collectionId]) : state.active;
  return {frameId:frame.id,active,modes,next:modes[(modes.indexOf(active)+1)%modes.length]};
}

function createPalette(figma, collection, variables, setup, frame, undo) {
  const names = Object.keys(setup.palettes);
  const roles = Object.keys(setup.palettes[names[0]]);
  const existing = new Map(variables.map(v => [v.name,v]));
  const prefix = 'preview/' + setup.name + '/';
  if (variables.some(v => v.name.startsWith(prefix)) || collection.modes.some(m => names.includes(m.name))) {
    throw Error('已有同名主题，请复用已配置画板或更换预览名称');
  }
  const addedModes = [];
  try {
    for (const name of names) addedModes.push(collection.addMode(name));
  } catch (error) {
    for (const id of addedModes.splice(0).reverse()) collection.removeMode(id);
    if (!/limit|maximum|at most|only.*mode|plan|upgrade/i.test(String(error))) throw error;
  }
  for (const id of addedModes) undo.push(() => collection.removeMode(id));
  const variablesAPI = figma.variables;
  function create(name) {
    if (existing.has(name)) throw Error('颜色变量已存在：'+name);
    const v = variablesAPI.createVariable(name,collection,'COLOR');
    undo.push(() => v.remove());
    v.scopes = ['ALL_FILLS','STROKE_COLOR'];
    return v;
  }
  const modes = {};
  const native = addedModes.length === names.length;
  const gradient = frame.fills.find(p => p.type === 'GRADIENT_LINEAR');
  for (const [index,mode] of names.entries()) {
    const modeId = native ? addedModes[index] : collection.defaultModeId;
    const ids = {};
    for (const role of roles) {
      const varName = native ? role : prefix+mode+'/'+role;
      let v = existing.get(varName);
      if (!v) {
        v = create(varName);
        existing.set(varName,v);
        if (native) {
          const stopIndex = setup.gradientRoles.indexOf(role);
          const base = gradient?.gradientStops[stopIndex]?.color || rgba(setup.palettes[mode][role]);
          for (const m of collection.modes.filter(m => !addedModes.includes(m.modeId))) v.setValueForMode(m.modeId,base);
        }
      }
      v.setValueForMode(modeId,rgba(setup.palettes[mode][role]));
      ids[role] = v.id;
    }
    modes[mode] = {modeId,ids};
  }
  return {frameId:frame.id,collectionId:collection.id,native,modes,gradientRoles:setup.gradientRoles,glassRole:setup.glassRole};
}

export async function applyTheme(figma,{request,digest}) {
  const {args,id} = request;
  const frame = await figma.getNodeByIdAsync(args.frameId);
  const page = figma.currentPage;
  if (frame?.type !== 'FRAME' || frame.parent?.id !== args.pageId || page.id !== args.pageId) throw Error('请选择当前页直属画板');
  const receipt = frame.getPluginData('theme-'+id);
  if (receipt) {
    const saved = JSON.parse(receipt);
    if (saved.digest !== digest) throw Error('相同请求 ID 内容已变化');
    return {...saved.result,replayed:true};
  }
  let state = frameTheme(frame);
  const previous = state;
  const template = !args.setup && themeNames.includes(args.mode);
  const variables = await figma.variables.getLocalVariablesAsync('COLOR');
  if (template) {
    const modes = collectionThemes(await figma.variables.getLocalVariableCollectionsAsync(),variables);
    const linear = frame.fills.filter(p => p.type === 'GRADIENT_LINEAR');
    const gradientRoles = linear.length === 1 && linear[0].gradientStops.length === 3 ? gradientNames : [];
    state = {frameId:frame.id,collectionId:modes[args.mode].collectionId,modes,native:false,template:true,gradientRoles,glassRole:'color/surface'};
  } else if (Boolean(args.setup) === Boolean(state)) throw Error(state?'画板已配置主题，请直接切换模式':'请先配置画板主题');
  if (state && !Object.hasOwn(state.modes,args.mode)) throw Error('未知主题模式');
  const collectionId = state?.collectionId || args.setup.sourceCollectionId;
  const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
  if (!collection || collection.remote) throw Error('需要可编辑的本地颜色集合');
  const vars = variables.filter(v => v.variableCollectionId === collectionId);
  const roles = new Map(vars.map(v => [v.id,v.name]));
  for (const source of [previous,state]) if(source) for (const m of Object.values(source.modes)) for (const [role,vid] of Object.entries(m.ids)) roles.set(vid,role);
  const gradientRoles = state?.gradientRoles || args.setup.gradientRoles;
  const gradient = frame.fills.filter(p => p.type === 'GRADIENT_LINEAR');
  if (gradientRoles.length && (gradient.length !== 1 || gradient[0].gradientStops.length !== gradientRoles.length)) throw Error('根画板渐变与色标角色数量不符');
  if (args.setup && vars.some(v => !Object.hasOwn(args.setup.palettes[args.mode],v.name) && !v.name.startsWith('preview/'))) throw Error('调色板缺少来源集合中的角色');
  if (args.dryRun !== false) return {dryRun:true,frameId:frame.id,mode:args.mode};
  const undo = [];
  try {
    const installing = !state;
    if (installing) state = createPalette(figma,collection,vars,args.setup,frame,undo);
    const selected = state.modes[args.mode];
    const targets = new Map();
    for (const v of await figma.variables.getLocalVariablesAsync('COLOR')) targets.set(v.id,v);
    for (const vid of Object.values(selected.ids)) if (!targets.has(vid)) throw Error('主题变量丢失：'+vid);
    if (frame.parent?.id !== args.pageId || figma.currentPage.id !== page.id) throw Error('页面已改变');
    if (state.native) {
      const old = frame.explicitVariableModes[collection.id];
      undo.push(() => old ? frame.setExplicitVariableModeForCollection(collection,old) : frame.clearExplicitVariableModeForCollection(collection));
      frame.setExplicitVariableModeForCollection(collection,selected.modeId);
    }
    if (installing || !state.native) {
      const nodes = [frame,...frame.findAll()];
      for (const node of nodes) {
        for (const field of ['fills','strokes']) {
          if (!(field in node) || !Array.isArray(node[field])) continue;
          const before = node[field];
          let changed = false;
          const paints = before.map(p => {
            if (node === frame && field === 'fills' && gradientRoles.length && p.type === 'GRADIENT_LINEAR') {
              changed = true;
              return {...p,gradientStops:p.gradientStops.map((s,i) => bindStop(s,targets.get(selected.ids[gradientRoles[i]]),node))};
            }
            if (template && p.gradientStops) {
              const stops=p.gradientStops.map(stop=>{
                const role=roles.get(stop.boundVariables?.color?.id);
                if(!role || !selected.ids[role])return stop;
                changed=true;
                return bindStop(stop,targets.get(selected.ids[role]),node);
              });
              return {...p,gradientStops:stops};
            }
            if (p.type !== 'SOLID') return p;
            const oldId = p.boundVariables?.color?.id;
            let role = roles.get(oldId);
            if (!role || !Object.hasOwn(selected.ids,role)) return p;
            if (field === 'fills' && state.glassRole && node.effects?.some(e => e.type === 'BACKGROUND_BLUR')) role = state.glassRole;
            if (oldId === selected.ids[role]) return p;
            changed = true;
            return {...figma.variables.setBoundVariableForPaint(p,'color',targets.get(selected.ids[role])),opacity:p.opacity};
          });
          if (!changed) continue;
          undo.push(() => { node[field] = before; });
          node[field] = paints;
          // Some editor builds normalize paint opacity when changing the alias.
          if (node[field].some((p,i) => p.type === 'SOLID' && p.opacity !== before[i].opacity)) {
            node[field] = node[field].map((p,i) => p.type === 'SOLID' ? {...p,opacity:before[i].opacity} : p);
          }
        }
      }
    }
    const oldState = frame.getPluginData(KEY);
    undo.push(() => frame.setPluginData(KEY,oldState));
    state.active = args.mode;
    frame.setPluginData(KEY,JSON.stringify(state));
    const result = {frameId:frame.id,collectionId:collection.id,mode:args.mode,native:state.native,modes:Object.keys(state.modes),gradientIds:gradientRoles.map(k => selected.ids[k])};
    frame.setPluginData('theme-'+id,JSON.stringify({digest,result}));
    page.selection = [frame];
    figma.viewport.scrollAndZoomIntoView([frame]);
    return result;
  } catch (error) {
    const failures = [];
    for (const restore of undo.reverse()) {
      try { restore(); } catch (rollbackError) { failures.push(String(rollbackError)); }
    }
    if (failures.length) throw Error(String(error)+'；回滚需检查：'+failures.join(', '));
    throw error;
  }
}
