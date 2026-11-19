import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
import {auditDesign,components,requiredCases,nameIssue} from '../src/design-policy.mjs';
import {validateRequest,canonical,TARGET_NAME} from '../src/protocol.mjs';
const built=await build({entryPoints:['plugin/design-engine.mjs'],bundle:true,write:false,format:'iife',globalName:'Design',target:'es2020'});
const context=vm.createContext({});vm.runInContext(built.outputFiles[0].text,context);
function fake(){
  const data={},root={id:'root',name:TARGET_NAME,type:'DOCUMENT',children:[],getPluginData:k=>data[k]||'',setPluginData:(k,v)=>data[k]=v};data['bridge-document-id']='document_test_123';
  const page={id:'page',type:'PAGE',name:'90 · Sandbox',parent:root,children:[]};root.children.push(page);
  const label={id:'label',type:'TEXT',name:'Text',parent:page,characters:'保存',fontName:{family:'Noto Sans SC',style:'Regular'},fontSize:16,lineHeight:{unit:'PIXELS',value:24},textStyleId:'style',fills:[]};page.children.push(label);
  const nodes=new Map([['root',root],['page',page],['label',label]]),collections=[{id:'col',name:'Color/Light',modes:[{modeId:'mode',name:'Light'}],defaultModeId:'mode',variableIds:['a','b']}];
  const variables=['a','b'].map(id=>({id,name:id==='a'?'color/fg':'color/primary',resolvedType:'COLOR',variableCollectionId:'col',valuesByMode:{mode:{r:0,g:0,b:0}},setValueForMode(mode,value){this.valuesByMode[mode]=value;}}));
  const figma={root,currentPage:page,mixed:Symbol('mixed'),getNodeByIdAsync:async id=>nodes.get(id),loadFontAsync:async()=>{},getLocalTextStylesAsync:async()=>[],variables:{getLocalVariablesAsync:async()=>variables,getLocalVariableCollectionsAsync:async()=>collections,getVariableByIdAsync:async id=>variables.find(v=>v.id===id),getVariableCollectionByIdAsync:async id=>collections.find(c=>c.id===id)}};
  return {figma,label,variables,nodes,root,page};
}
const message=(id,action,args={})=>({documentId:'document_test_123',request:validateRequest({id,action,args}),digest:canonical({id,action,args})});
const read=f=>context.Design.readDesign(f.figma,{});
const run=f=>context.Design.createDesignExecutor(f.figma,'document_test_123');
test('命名允许语义路径和变体，拒绝自动名；文件三段式为本地约定',()=>{
  assert.equal(nameIssue('COMPONENT_SET','Actions/Button'),null);
  assert.equal(nameIssue('COMPONENT','State=Hover, Focus=False',{variant:true}),null);
  assert.ok(nameIssue('FRAME','Frame 42'));
  assert.ok(nameIssue('VARIABLE','Color/Primary'));
  for(const [previous,current] of [['control/sm','control-height/sm'],['control/md','control-height/md'],['control/lg','control-height/lg'],['radius/focus','radius/focus-ring'],['size/icon','icon-size/md']]){
    assert.ok(nameIssue('VARIABLE',previous)?.includes(current));
    assert.equal(nameIssue('VARIABLE',current),null);
  }
  for(const old of ['color/button/fg','color/action/primary','color/primary-blue'])assert.ok(nameIssue('VARIABLE',old));
  assert.equal(nameIssue('VARIABLE','color/primary-hover'),null);
  assert.equal(nameIssue('DOCUMENT','示例产品 · Product · Web'),null);
});
test('状态矩阵覆盖 loading+focus 和 danger，不生成全笛卡尔积',()=>{
  const c=components.contracts['Actions/Button'],cases=requiredCases(c);
  assert.ok(cases.some(v=>v.State==='Loading'&&v.Focus==='True'));
  assert.ok(cases.some(v=>v.Intent==='Danger'&&v.State==='Disabled'));
  assert.ok(cases.length<3*3*5*2);
  for(const contract of Object.values(components.contracts))for(const item of requiredCases(contract))assert.ok(!contract.forbidden.some(f=>Object.entries(f).every(([k,v])=>item[k]===v)));
});
test('审计拒绝只有名字的状态和未绑定属性，不将技术通过当成产品验收',async()=>{
  const f=fake(),snapshot=JSON.parse(JSON.stringify(await read(f)));
  const report=auditDesign(snapshot,{profile:'luigi-default',requireComponents:['Actions/Button']});
  assert.equal(report.technicalPassed,false);assert.equal(report.readyForProduct,false);
  assert.ok(report.issues.some(i=>i.rule==='component.set'));
  assert.ok(report.issues.some(i=>i.rule==='naming.semantic'));
  snapshot.nodes.find(n=>n.id==='label').name='Label';
  const clean=auditDesign(snapshot);assert.equal(clean.technicalPassed,true);assert.equal(clean.readyForProduct,false);
  const contract=components.contracts['Actions/Button'];
  snapshot.nodes.push({id:'set',type:'COMPONENT_SET',name:'Actions/Button',componentPropertyDefinitions:{'Label#1':{type:'TEXT'},'ShowLeadingIcon#2':{type:'BOOLEAN'}}});
  for(const [i,item] of requiredCases(contract).entries())snapshot.nodes.push({id:'v'+i,type:'COMPONENT',parentId:'set',name:Object.entries(item).map(([k,v])=>k+'='+v).join(', ')});
  const missingBinding=auditDesign(snapshot,{profile:'luigi-default',requireComponents:['Actions/Button']});
  assert.ok(!missingBinding.issues.some(i=>i.rule==='component.coverage'));
  assert.ok(missingBinding.issues.some(i=>i.rule==='component.propertyBinding'));
});
test('风格档位和精确例外可配置，陈旧例外与未知合同显性失败',async()=>{
  const snapshot=JSON.parse(JSON.stringify(await read(fake())));snapshot.nodes.find(n=>n.id==='label').name='Label';
  snapshot.nodes.push({id:'panel',type:'FRAME',name:'Content',layoutMode:'HORIZONTAL',itemSpacing:6,cornerRadius:16});
  const compact=auditDesign(snapshot,{profile:'luigi-compact'});assert.ok(compact.issues.some(i=>i.rule==='radius.scale'));
  const report=auditDesign(snapshot,{profile:'luigi-default',exceptions:[{id:'panel',rule:'spacing.scale',actual:{field:'itemSpacing',value:6},reason:'图标固有留白补偿，限本组件'}]});assert.equal(report.technicalPassed,true);
  assert.throws(()=>auditDesign(snapshot,{profile:'luigi-default',exceptions:[{id:'panel',rule:'spacing.scale',actual:8,reason:'过时'}]}),/失效/);
  assert.throws(()=>auditDesign(snapshot,{requireComponents:['Unknown']}),/未登记/);
});
test('范围读取不截断；实际 fingerprint 用于 dry-run、更新和人工变更冲突检查',async()=>{
  const f=fake(),snapshot=await read(f),execute=run(f);
  await assert.rejects(context.Design.readDesign(f.figma,{limit:1}),/超过/);
  const args={target:{kind:'node',id:'label'},field:'name',value:'Label',expected:snapshot.fingerprints.nodes.label};
  const preview=await execute(message('preview','design.patch',args));assert.equal(preview.result.dryRun,true);assert.equal(f.label.name,'Text');
  const request=message('rename','design.patch',{...args,dryRun:false});const applied=await execute(request);assert.equal(f.label.name,'Label');
  f.label.name='ManualLabel';const replayed=await run(f)(request);assert.equal(replayed.result.replayed,true);assert.equal(f.label.name,'ManualLabel');
  await assert.rejects(execute(message('stale','design.patch',{...args,value:'OtherLabel',dryRun:false})),/已改变/);
  assert.equal(applied.result.after.name,'Label');
});
test('变量修改支持合法别名，拒绝循环、错误类型、同名和不存在的 mode',async()=>{
  const f=fake(),execute=run(f),s=await read(f);
  const args={target:{kind:'variable',id:'a'},field:'value',expected:s.fingerprints.variables.a,dryRun:false,value:{modeId:'mode',value:{type:'VARIABLE_ALIAS',id:'b'}}};
  await execute(message('alias','design.patch',args));assert.equal(f.variables[0].valuesByMode.mode.id,'b');
  const after=await read(f);
  await assert.rejects(execute(message('cycle','design.patch',{...args,target:{kind:'variable',id:'b'},expected:after.fingerprints.variables.b,value:{modeId:'mode',value:{type:'VARIABLE_ALIAS',id:'a'}}})),/循环/);
  await assert.rejects(execute(message('badmode','design.patch',{...args,value:{modeId:'missing',value:{r:0,g:0,b:0}}})),/mode 不存在/);
  await assert.rejects(execute(message('badtype','design.patch',{...args,value:{modeId:'mode',value:42}})),/类型/);
  await assert.rejects(execute(message('duplicate','design.patch',{...args,field:'name',value:'color/primary'})),/同名/);
});
test('写入中断窗口不能盲目重放；未确认设计写入阻止后续操作',async()=>{
  const f=fake(),snapshot=await read(f),execute=run(f),original=f.root.setPluginData;
  f.root.setPluginData=(key,value)=>{if(key==='bridge-design-receipt-v2-interrupted')throw Error('模拟写入回执前中断');original(key,value);};
  const req=message('interrupted','design.patch',{target:{kind:'node',id:'label'},field:'name',value:'Label',expected:snapshot.fingerprints.nodes.label,dryRun:false});
  await assert.rejects(execute(req),/模拟/);assert.equal(f.label.name,'Label');
  f.root.setPluginData=original;
  await assert.rejects(run(f)(req),/无法安全重放/);
  const s=await read(f);await assert.rejects(run(f)(message('newwrite','design.patch',{target:{kind:'node',id:'label'},field:'name',value:'OtherLabel',expected:s.fingerprints.nodes.label,dryRun:false})),/未确认/);
});
test('新协议拒绝任意代码、未知字段、不带 fingerprint 的写入',()=>{
  assert.throws(()=>validateRequest({id:'x',action:'design.patch',args:{target:{kind:'node',id:'x'},field:'name',value:'Label'}}),/fingerprint/);
  assert.throws(()=>validateRequest({id:'x',action:'design.read',args:{code:'evil'}}),/未知/);
  assert.throws(()=>validateRequest({id:'x',action:'design.patch',args:{target:{kind:'node',id:'x'},field:'eval',expected:'{}',value:'evil'}}),/不支持/);
});
test('Figma 子变体暴露但禁止读取属性定义 getter，读快照时从组件集获取',async()=>{
 const f=fake(),set={id:'set',type:'COMPONENT_SET',name:'Actions/Button',parent:f.page,children:[],componentPropertyDefinitions:{'Label#1':{type:'TEXT',defaultValue:'保存'}}};
 const variant={id:'variant',type:'COMPONENT',name:'State=Rest',parent:set,children:[]};
 Object.defineProperty(variant,'componentPropertyDefinitions',{get(){throw Error('Can only get component property definitions of a component set or non-variant component');}});
 set.children.push(variant);f.page.children.push(set);f.nodes.set('set',set);f.nodes.set('variant',variant);
 const snapshot=await read(f);assert.ok(snapshot.nodes.find(n=>n.id==='set').componentPropertyDefinitions['Label#1']);assert.equal(snapshot.nodes.find(n=>n.id==='variant').componentPropertyDefinitions,undefined);
});
test('读取当前选择不修改画布，也不污染用于写入预检的快照',async()=>{
 const f=fake();f.figma.currentPage.selection=[f.label];const before=await read(f);
 const result=await run(f)(message('selected','design.selection'));
 assert.equal(result.result.selection[0].id,f.label.id);assert.equal(result.result.readOnly,true);assert.deepEqual(await read(f),before);
 assert.throws(()=>validateRequest({id:'x',action:'design.selection',args:{nodeIds:['label']}}),/未知/);
});

const screenPlan=()=>({profile:'luigi-default',pageId:'page',width:480,root:{
  kind:'stack',name:'Release/Review',direction:'VERTICAL',padding:16,gap:8,background:'a',
  children:[{kind:'text',name:'Title',text:'发布前检查',styleId:'body',color:'b'}]
}});
test('画板计划拒绝无效间距、缺失样式、意外字段和非布尔写入标志',()=>{
  for(const change of [
    p=>p.root.gap=7,p=>delete p.root.children[0].styleId,
    p=>p.root.code='invalid',p=>p.dryRun='false'
  ]){
    const p=screenPlan();change(p);assert.throws(()=>message('preview','design.compose',p));
  }
});
test('表单输入需引用预检资产，等宽列只接受水平容器',async()=>{
  const plan=screenPlan();
  const field={kind:'field',name:'EmailInput',state:'Invalid',value:'li.example.com'};
  plan.root.children.push(field);
  assert.throws(()=>message('no-assets','design.compose',plan),/输入样本/);
  plan.fieldAssets={styleId:'body',background:'a',foreground:'a',placeholder:'a',border:'a',error:'a'};
  assert.throws(()=>message('bad-columns','design.compose',{...plan,root:{...plan.root,equalColumns:true}}),/等宽列/);
  assert.throws(()=>message('bad-state','design.compose',{...plan,root:{...plan.root,children:[{...field,state:'Disabled'}]}}),/输入样本/);
  const f=fake();f.page.loadAsync=async()=>{};
  f.figma.getStyleByIdAsync=async()=>({type:'TEXT',fontName:f.label.fontName});
  const execute=run(f);
  const preview=await execute(message('fields-preview','design.compose',plan));
  assert.equal(preview.result.fieldStates.join(','),'Invalid');
  assert.equal(f.page.children.length,1);
  await assert.rejects(execute(message('bad-color','design.compose',{...plan,fieldAssets:{...plan.fieldAssets,error:'absent'}})),/无效颜色/);
});
test('毛玻璃组稿预检验证半透明材质、描边变量与背景色标',async()=>{
  const plan=screenPlan();
  plan.root.backdrop=Array.from({length:3},()=>({color:'a',opacity:0.4}));
  const panel={kind:'stack',name:'Panel',direction:'VERTICAL',padding:16,gap:8,background:'a',paintOpacity:0.6,glass:{blur:24,outline:'b'},children:plan.root.children};
  plan.root.children=[panel];
  const f=fake();f.page.loadAsync=async()=>{};
  f.figma.getStyleByIdAsync=async()=>({type:'TEXT',fontName:f.label.fontName});
  assert.equal((await run(f)(message('glass-preview','design.compose',plan))).result.dryRun,true);
  assert.equal(f.page.children.length,1);
  assert.throws(()=>message('opaque-glass','design.compose',{...plan,root:{...plan.root,children:[{...panel,paintOpacity:1}]}}),/毛玻璃/);
  assert.throws(()=>message('invalid-stop','design.compose',{...plan,root:{...plan.root,backdrop:[{color:'a',opacity:0.5}]}}),/色标/);
  await assert.rejects(run(f)(message('glass-missing','design.compose',{...plan,root:{...plan.root,children:[{...panel,glass:{blur:24,outline:'missing'}}]}})),/无效颜色/);
});
test('修改单个填充的透明度时保留变量绑定',async()=>{
  const f=fake(),execute=run(f),panel=f.page.children[0];
  panel.type='FRAME';
  panel.fills=[{type:'SOLID',opacity:1,boundVariables:{color:{id:'a'}}}];
  const snapshot=await read(f);
  const args={target:{kind:'node',id:panel.id},field:'fillOpacity',value:0.54,expected:snapshot.fingerprints.nodes[panel.id]};
  assert.throws(()=>message('bad-opacity','design.patch',{...args,value:1.01}),/透明度/);
  await execute(message('fill-opacity','design.patch',{...args,dryRun:false}));
  assert.equal(panel.fills[0].opacity,0.54);
  assert.equal(panel.fills[0].boundVariables.color.id,'a');
});
test('从旧日志确认已写入的透明度并按请求保存回执，不重复写入',async()=>{
  const f=fake(),panel=f.label;
  panel.type='FRAME';panel.fills=[{type:'SOLID',opacity:1,boundVariables:{color:{id:'a'}}}];
  const snapshot=await read(f);
  const args={target:{kind:'node',id:panel.id},field:'fillOpacity',value:0.54,expected:snapshot.fingerprints.nodes[panel.id],dryRun:false};
  const original=message('legacy-opacity','design.patch',args);
  f.root.setPluginData('bridge-design-journal-v1',JSON.stringify({receipts:{'legacy-opacity':{digest:original.digest,status:'prepared'}}}));
  panel.fills[0].opacity=0.54000002;
  const recovered=await run(f)({...original,recover:true});
  assert.equal(recovered.result.replayed,true);
  assert.equal(panel.fills[0].opacity,0.54000002);
  assert.ok(f.root.getPluginData('bridge-design-receipt-v2-legacy-opacity'));
  assert.equal((await run(f)(original)).result.historical,true);
});
test('组稿先只读预检，缺少基础资产或目标页面改变时不创建画板',async()=>{
  const f=fake();f.page.loadAsync=async()=>{};
  f.figma.getStyleByIdAsync=async()=>({type:'TEXT',fontName:f.label.fontName});
  const execute=run(f),plan=screenPlan();
  assert.equal((await execute(message('preview','design.compose',plan))).result.dryRun,true);
  assert.equal(f.page.children.length,1);
  await assert.rejects(execute(message('wrongpage','design.compose',{...plan,pageId:'other'})),/目标页面/);
  plan.root.background='missing';
  await assert.rejects(execute(message('missing','design.compose',plan)),/无效颜色/);
});
test('组稿回执可跨执行器重放；同名画板和未完成回执都不会重复写入',async()=>{
  const f=fake();f.page.loadAsync=async()=>{};
  f.figma.getStyleByIdAsync=async()=>({type:'TEXT',fontName:f.label.fontName});
  const plan={...screenPlan(),dryRun:false},msg=message('apply','design.compose',plan);
  f.root.setPluginData('compose-apply',JSON.stringify({done:false,digest:msg.digest,frameId:'frame'}));
  await assert.rejects(run(f)(msg),/frame/);
  f.root.setPluginData('compose-apply',JSON.stringify({done:true,digest:msg.digest,frameId:'frame'}));
  assert.equal((await run(f)(msg)).result.frameId,'frame');
  f.page.children.push({name:plan.root.name});
  await assert.rejects(run(f)(message('new','design.compose',plan)),/同名画板/);
});

test('任务页在切换中断后沿原请求恢复；后续按 ID 切页并保留人工改名', async()=>{
  const f=fake();
  f.figma.createPage=()=>{
    const page={id:'new',type:'PAGE',name:'Page',children:[],parent:f.root};
    f.root.children.push(page);
    return page;
  };
  const name='90 · Sandbox · 发布确认', request=message('newpage','design.page',{name});
  assert.equal(nameIssue('PAGE',name),null);
  f.figma.setCurrentPageAsync=async()=>{throw Error('切换中断')};
  await assert.rejects(run(f)(request),/切换中断/);
  f.figma.setCurrentPageAsync=async page=>{f.figma.currentPage=page};
  const resumed=await run(f)(request);
  assert.equal(resumed.result.pageId,'new');assert.equal(f.root.children.length,2);
  await assert.rejects(run(f)(message('other','design.page',{name})),/同名/);
  f.figma.currentPage.name='人工改名';
  await run(f)(message('existing','design.page',{pageId:f.page.id}));
  assert.equal(f.figma.currentPage.id,f.page.id);
  assert.equal((await run(f)(request)).result.name,'人工改名');
  assert.equal(f.root.children.length,2);
  await assert.rejects(run(f)(message('missing','design.page',{pageId:'deleted'})),/不存在/);
  assert.throws(()=>message('mixed','design.page',{name,pageId:f.page.id}),/一项/);
});
test('页面额度拒绝时原样返回错误，保留当前页和页面数',async()=>{
  const f=fake();f.figma.createPage=()=>{throw Error('page limit')};
  await assert.rejects(run(f)(message('quota','design.page',{name:'90 · Sandbox · 测试'})),/page limit/);
  assert.equal(f.root.children.length,1);assert.equal(f.figma.currentPage.id,f.page.id);
});

test('文档主题默认保留品牌名、字体和尺寸；显式 Luigi 仍校验其合同',async()=>{
  const plan=screenPlan();
  delete plan.profile;
  plan.root.name='品牌 / 活动页面';
  plan.root.gap=7.5;
  assert.doesNotThrow(()=>validateRequest({id:'brand',action:'design.compose',args:plan}));
  assert.throws(()=>validateRequest({id:'example',action:'design.compose',args:{...plan,profile:'luigi-default'}}));
  plan.root.padding=-1;
  assert.throws(()=>validateRequest({id:'invalid',action:'design.compose',args:plan}));
  const snapshot=JSON.parse(JSON.stringify(await read(fake())));
  snapshot.variables[0].name='color/brand-accent';
  const label=snapshot.nodes.find(n=>n.id==='label');
  Object.assign(label,{name:'刊头 / 大字',fontName:{family:'Inter',style:'Medium'},fontSize:27,lineHeight:{unit:'PIXELS',value:33}});
  snapshot.nodes.push({id:'mark',type:'INSTANCE',mainComponentId:'brand-master',name:'Icon/山茶',fills:[]});
  assert.equal(auditDesign(snapshot).technicalPassed,true);
  assert.equal(auditDesign(snapshot,{profile:'luigi-default'}).technicalPassed,false);
  label.textStyleId='';
  assert.ok(auditDesign(snapshot).issues.some(i=>i.rule==='type.style'));
});
