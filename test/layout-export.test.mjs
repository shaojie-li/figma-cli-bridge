import assert from 'node:assert/strict';
import {test} from 'node:test';
import {exportLayout} from '../src/layout-export.mjs';
import {layoutScale} from '../src/layout-scale.mjs';

function snapshot(){
  return {
    collections:[{name:'Layout',id:'layout',defaultModeId:'mode',modes:[{name:'Default',modeId:'mode'}]}],
    variables:layoutScale.map(([name,value])=>({name,variableCollectionId:'layout',resolvedType:'FLOAT',valuesByMode:{mode:value}}))
  };
}

test('导出 Default 的完整四组数字，保留零值与 Figma 路径',()=>{
  const input=snapshot();
  input.variables.push({...input.variables[0],variableCollectionId:'other'});
  const result=exportLayout(input);
  assert.equal(result.unit,'logical-pixel');
  const groups=result.modes.default;
  assert.equal(Object.values(groups).flatMap(Object.values).length,29);
  for(const [name,value] of layoutScale){
    const [group,key]=name.split('/');
    assert.equal(groups[group][key],value);
  }
  assert.deepEqual(exportLayout({...input,variables:input.variables.reverse()}),result);
});

test('拒绝不完整、重名、类型或数值不符以及未登记的变量',()=>{
  for(const change of [
    input=>input.variables.pop(),input=>input.variables.push(input.variables[0]),
    input=>input.variables[0].resolvedType='STRING',input=>input.variables[0].valuesByMode.mode=999,
    input=>input.variables.push({...input.variables[0],name:'space/999'}),
    input=>input.collections[0].modes[0].name='Other'
  ]){
    const input=snapshot();change(input);assert.throws(()=>exportLayout(input));
  }
});
