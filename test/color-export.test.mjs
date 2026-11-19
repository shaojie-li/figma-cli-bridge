import {test} from 'node:test';
import assert from 'node:assert/strict';
import roles from '../design/color-roles.json' with {type:'json'};
import {exportLightColors} from '../src/color-export.mjs';

function snapshot(){
  const source={id:'raw',name:'source/ink',resolvedType:'COLOR',variableCollectionId:'palette',valuesByMode:{light:{r:0,g:0.5,b:1,a:0.25}}};
  const aliases=Object.keys(roles).map(role=>({...source,id:role,name:'color/'+role,valuesByMode:{light:{type:'VARIABLE_ALIAS',id:'raw'}}}));
  return {variables:[source,...aliases],collections:[{id:'palette',modes:[{name:'Light',modeId:'light'}]}]};
}

test('颜色导出仅公开已登记角色，解析别名并保留透明度',()=>{
  const colors=exportLightColors(snapshot()).modes.light;
  assert.deepEqual(Object.keys(colors),Object.keys(roles));
  assert.equal(colors.primary,'#0080ff40');
});

test('遇到缺失、重名、旧命名或循环时拒绝导出',()=>{
  const missing=snapshot();missing.variables.pop();
  assert.throws(()=>exportLightColors(missing),/缺少颜色角色/);
  const duplicate=snapshot();duplicate.variables.push({...duplicate.variables[1],id:'other'});
  assert.throws(()=>exportLightColors(duplicate),/重复/);
  const legacy=snapshot();legacy.variables[1].name='color/button/canvas';
  assert.throws(()=>exportLightColors(legacy),/登记/);
  const cycle=snapshot();cycle.variables[0].valuesByMode.light={type:'VARIABLE_ALIAS',id:'primary'};
  assert.throws(()=>exportLightColors(cycle),/循环/);
});
