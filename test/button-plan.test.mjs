import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buttonCases,buttonColors,appearance,contrast,variantName} from '../src/button-plan.mjs';
import {components,policy,requiredCases} from '../src/design-policy.mjs';
import {validateRequest} from '../src/protocol.mjs';
test('Button 生成计划精确覆盖合同、使用合法尺寸和字号',()=>{
 assert.deepEqual(buttonCases,requiredCases(components.contracts['Actions/Button']));assert.equal(buttonCases.length,13);
 assert.equal(new Set(buttonCases.map(variantName)).size,13);
 for(const c of buttonCases){const a=appearance(c);assert.ok(policy.profiles['luigi-default'].controlHeights.includes(a.height));assert.ok(buttonColors[a.foreground]&&buttonColors[a.background]);assert.equal(a.focus,c.Focus==='True');assert.equal(a.loading,c.State==='Loading');}
});
test('所有非禁用组合文字和焦点边界对比度达到门槛',()=>{
 for(const c of buttonCases){const a=appearance(c);if(c.State!=='Disabled')assert.ok(contrast(buttonColors[a.foreground],buttonColors[a.background])>=4.5,variantName(c));}
 assert.ok(contrast(buttonColors.primary,buttonColors.canvas)>=3);
 assert.ok(contrast(buttonColors.secondaryBorder,buttonColors.canvas)>=3);
});
test('状态用权威色库衍生，Loading 不修改尺寸或字体',()=>{
 const rest=appearance(buttonCases[0]),loading=appearance(buttonCases.find(c=>c.State==='Loading'));
 assert.equal(rest.height,loading.height);assert.equal(rest.style,loading.style);assert.equal(rest.background,loading.background);
 assert.equal(buttonColors.primary.r,0x36/255);assert.notDeepEqual(buttonColors.primary,buttonColors.primaryHover);assert.notDeepEqual(buttonColors.primaryHover,buttonColors.primaryPressed);
});
test('Button 构建必须带预检 seal，不能附带任意代码',()=>{
 assert.throws(()=>validateRequest({id:'x',action:'button.complete',args:{}}),/seal/);
 assert.throws(()=>validateRequest({id:'x',action:'button.complete',args:{expected:'x',code:'evil'}}),/seal/);
 assert.equal(validateRequest({id:'x',action:'button.complete',args:{expected:'123:123:123'}}).action,'button.complete');
});
test('展示画板即使允许溢出也必须包住内容，resize 后固定高度不能冒充 Hug',async()=>{
 const {contentBounds}=await import('../src/button-plan.mjs');
 const frame={width:960,height:100,paddingLeft:32,paddingRight:32,paddingTop:32,paddingBottom:32,primaryAxisSizingMode:'AUTO',children:[{id:'row',name:'StateRow',visible:true,x:32,y:148,width:896,height:76}]};
 assert.equal(contentBounds(frame).passed,false);assert.equal(contentBounds(frame).overflow[0].id,'row');
 frame.height=256;assert.equal(contentBounds(frame).passed,true);
 frame.primaryAxisSizingMode='FIXED';assert.equal(contentBounds(frame).passed,false);
});
