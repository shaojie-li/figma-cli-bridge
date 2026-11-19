import test from 'node:test';
import assert from 'node:assert/strict';
import {applyTheme} from '../plugin/theme.mjs';
import {validateRequest} from '../src/protocol.mjs';

function fixture(singleMode) {
  const collection = {
    id:'colors', defaultModeId:'light', modes:[{modeId:'light',name:'Light'}],
    addMode(name) {
      if(singleMode) throw Error('mode limit');
      this.modes.push({modeId:name,name}); return name;
    },
    removeMode(id) { this.modes=this.modes.filter(m=>m.modeId!==id); }
  };
  const vars=[];
  const variables = {
    getVariableCollectionByIdAsync:async()=>collection,
    getLocalVariablesAsync:async()=>vars,
    createVariable(name){
      const v={name,id:'v'+vars.length,variableCollectionId:'colors',valuesByMode:{},
        setValueForMode(id,value){this.valuesByMode[id]=value;},
        resolveForConsumer(node){return {value:this.valuesByMode[node.explicitVariableModes.colors||'light']};},
        remove(){vars.splice(vars.indexOf(this),1);}
      };
      vars.push(v); return v;
    },
    setBoundVariableForPaint(p,field,v){return {...p,boundVariables:{[field]:{type:'VARIABLE_ALIAS',id:v.id}}};}
  };
  const page={id:'p'};
  const canvas=variables.createVariable('color/canvas');
  canvas.setValueForMode('light',{r:1,g:1,b:1,a:1});
  const data=new Map();
  const frame={id:'f',type:'FRAME',parent:page,explicitVariableModes:{},
    setExplicitVariableModeForCollection(c,id){this.explicitVariableModes[c.id]=id;},
    clearExplicitVariableModeForCollection(c){delete this.explicitVariableModes[c.id];},
    fills:[{type:'SOLID',opacity:.54,boundVariables:{color:{id:canvas.id}}},
      {type:'GRADIENT_LINEAR',gradientStops:[{position:0,color:{r:1,g:1,b:1,a:1}}]}],
    findAll:()=>[],getPluginData:k=>data.get(k)||'',setPluginData:(k,v)=>data.set(k,v)};
  const figma={variables,currentPage:page,getNodeByIdAsync:async()=>frame,viewport:{scrollAndZoomIntoView(){}}};
  const setup={name:'sample',sourceCollectionId:'colors',gradientRoles:['gradient/start'],
    palettes:{Warm:{'color/canvas':'#F1EBE3','gradient/start':'#AABBCC44'},Dark:{'color/canvas':'#18221B','gradient/start':'#34567899'}}};
  const run=(args,id)=>applyTheme(figma,{request:validateRequest({id,action:'design.theme',args:{frameId:'f',pageId:'p',mode:'Warm',...args}}),digest:id});
  return {frame,collection,vars,run,setup};
}

for(const limited of [true,false]){
  test('Frame theme switches and retains Light: '+(limited?'single-mode':'native modes'),async()=>{
    const {frame,vars,run,setup}=fixture(limited);
    await run({setup},'dry'); assert.equal(vars.length,1);
    const warm=await run({setup,dryRun:false},'warm');
    assert.equal(warm.native,!limited);
    const dark=await run({mode:'Dark',dryRun:false},'dark');
    const stop=frame.fills[1].gradientStops[0].boundVariables.color.id;
    assert.equal(stop,dark.gradientIds[0]);
    assert.equal(vars.find(v=>v.id===stop).resolveForConsumer(frame).value.a,0x99/255);
    assert.equal(frame.fills[0].opacity,.54);
    assert.equal(vars[0].valuesByMode.light.r,1);
    assert.equal((await run({mode:'Dark',dryRun:false},'dark')).replayed,true);
    assert.equal((await run({dryRun:false},'back')).gradientIds[0],warm.gradientIds[0]);
  });
}
test('Unexpected mode errors roll back and do not create fallback variables',async()=>{
  const {collection,vars,run,setup}=fixture(false);
  const add=collection.addMode.bind(collection);
  collection.addMode=name=>{if(name==='Dark')throw Error('permission denied');return add(name);};
  await assert.rejects(run({setup,dryRun:false},'init'),/permission/);
  assert.equal(vars.length,1);assert.equal(collection.modes.length,1);
  await assert.rejects(run({pageId:'elsewhere',setup},'wrong'),/当前页/);
});
