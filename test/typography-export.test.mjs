import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exportTypography} from '../src/typography-export.mjs';
import {policy} from '../src/design-policy.mjs';
import {syncTypography} from '../plugin/typography.mjs';

const profile=policy.profiles['luigi-default'];
function snapshot(){
  return {textStyles:Object.entries(profile.typography.roles).map(([name,[fontSize,value]])=>({
    name,fontName:{family:'Noto Sans SC',style:'Regular'},fontSize,lineHeight:{unit:'PIXELS',value}
  }))};
}

test('共享文字样式按角色导出，字号行高成对且符合 profile',()=>{
  const input=snapshot();
  for(const style of input.textStyles)assert.ok(profile.typeScale.some(([size,line])=>size===style.fontSize&&line===style.lineHeight.value));
  const output=exportTypography(input);
  assert.equal(output.unit,'logical-pixel');
  assert.deepEqual(output.modes.default.body.default,{fontFamily:'Noto Sans SC',fontStyle:'Regular',fontWeight:400,fontSize:16,lineHeight:24});
  assert.deepEqual(output,exportTypography({textStyles:input.textStyles.reverse()}));
});

test('拒绝缺失、重复、字体字重或行高不匹配的文字样式',()=>{
  for(const change of [
    styles=>styles.pop(),styles=>styles.push(styles[0]),styles=>styles[0].fontName.family='Other',
    styles=>styles[0].fontName.style='Bold',styles=>styles[0].fontName.variationSettings={wght:500},
    styles=>styles[0].fontSize=30,styles=>styles[0].lineHeight={unit:'AUTO'},styles=>styles[0].lineHeight.value=48
  ]){
    const input=snapshot();change(input.textStyles);assert.throws(()=>exportTypography(input));
  }
});

test('原有三个共享样式只补两档，重复同步保留全部 ID',async()=>{
  const styles=snapshot().textStyles.filter(style=>!['Caption/Default','Heading/Medium'].includes(style.name))
    .map((style,index)=>({...style,id:'existing-'+index}));
  const originals=structuredClone(styles);
  const figma={loadFontAsync:async()=>{},getLocalTextStylesAsync:async()=>styles,
    createTextStyle(){const style={id:'new-'+styles.length,setPluginData(){}};styles.push(style);return style;}};
  const preview=await syncTypography(figma,{});
  assert.deepEqual(preview.missing,['Heading/Medium','Caption/Default']);
  await assert.rejects(syncTypography(figma,{expected:'stale'}),/过期/);
  assert.deepEqual(styles,originals);
  await syncTypography(figma,{expected:preview.fingerprint});
  assert.deepEqual(styles.slice(0,3),originals);
  assert.equal(exportTypography({textStyles:styles}).modes.default.caption.default.lineHeight,16);
  assert.deepEqual((await syncTypography(figma,{})).missing,[]);
  assert.equal(styles.length,5);
});
