import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureTemplate} from '../plugin/template.mjs';
import {collectionThemes} from '../src/theme-collections.mjs';
import {exportLightColors} from '../src/color-export.mjs';

function blankFile() {
  const collections=[], variables=[], styles=[];
  let seq=0;
  const create=(items,props)=>{
    const item={...props,id:String(++seq),remove(){items.splice(items.indexOf(item),1);}};
    items.push(item);
    return item;
  };
  const figma={
    loadFontAsync:async()=>{},getLocalTextStylesAsync:async()=>styles,getStyleByIdAsync:async id=>styles.find(s=>s.id===id),
    createTextStyle:()=>create(styles,{setPluginData(){}}),
    variables:{
      getLocalVariablesAsync:async()=>variables,getLocalVariableCollectionsAsync:async()=>collections,
      createVariableCollection:name=>create(collections,{name,defaultModeId:'m',modes:[{modeId:'m',name:'Mode 1'}],
        renameMode(id,n){this.modes[0].name=n;}}),
      createVariable:(name,c,resolvedType)=>create(variables,{name,variableCollectionId:c.id,resolvedType,valuesByMode:{},
        setValueForMode(id,value){this.valuesByMode[id]=value;},setVariableCodeSyntax(){}})
    }
  };
  return {figma,collections,variables,styles};
}

test('New file installs four scoped palettes, layout and text styles once; custom colors survive',async()=>{
  const file=blankFile();
  assert.equal((await ensureTemplate(file.figma,{})).missingTextStyles.length,5);
  assert.equal(file.collections.length,0);
  await ensureTemplate(file.figma,{dryRun:false});
  assert.equal(file.styles.length,5);assert.equal(file.variables.length,72+29);
  const modes=collectionThemes(file.collections,file.variables);
  const warmDark=file.variables.find(v=>v.id===modes['Warm/Dark'].ids['color/primary']);
  warmDark.setValueForMode('m',{r:1,g:.5,b:0,a:1});
  const next=await ensureTemplate(file.figma,{dryRun:false});
  assert.ok(next.collections.every(c=>c.add===0));assert.equal(file.styles.length,5);
  assert.equal(file.collections.length,5);assert.equal(file.variables.length,101);
  const out=exportLightColors(file);
  assert.equal(out.themes.warm.dark.primary,'#ff8000');
  assert.equal(out.themes.normal.light.primary,out.modes.light.primary);
  assert.match(out.themes.normal.dark.gradient.start,/^#[0-9a-f]{8}$/);
});

test('An existing incompatible Layout prevents template writes',async()=>{
  const file=blankFile();file.figma.variables.createVariableCollection('Layout');
  await assert.rejects(ensureTemplate(file.figma,{dryRun:false}),/Layout/);
  assert.equal(file.collections.length,1);assert.equal(file.variables.length,0);
});
