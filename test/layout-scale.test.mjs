import assert from 'node:assert/strict';
import {test} from 'node:test';
import {missingLayoutTokens} from '../plugin/layout-scale.mjs';
import {policy} from '../src/design-policy.mjs';

test('Layout 档位完整、名称唯一，已有同值变量重复同步为空',()=>{
  const collection={name:'Layout',id:'layout',modes:[{name:'Default'}],defaultModeId:'default'};
  const tokens=missingLayoutTokens(collection,[]);
  assert.equal(tokens.length,29);
  assert.equal(new Set(tokens.map(([name])=>name)).size,tokens.length);
  const radii=tokens.filter(([name])=>name.startsWith('radius/')).map(([,value])=>value);
  assert.deepEqual(radii,policy.profiles['luigi-default'].radii);
  const variables=tokens.map(([name,value])=>({name,variableCollectionId:collection.id,resolvedType:'FLOAT',valuesByMode:{default:value}}));
  assert.deepEqual(missingLayoutTokens(collection,variables),[]);
  variables[0].valuesByMode.default=999;
  assert.throws(()=>missingLayoutTokens(collection,variables),/冲突/);
});
