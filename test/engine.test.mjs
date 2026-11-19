import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
import {TARGET_NAME} from '../src/protocol.mjs';
const output=await build({entryPoints:['plugin/engine.mjs'],bundle:true,write:false,format:'iife',globalName:'Engine',loader:{'.svg':'text'},target:'es2020'});
const context=vm.createContext({});vm.runInContext(output.outputFiles[0].text,context);const createExecutor=context.Engine.createExecutor;
// In-memory Plugin API contract double: these tests verify recovery behavior, not Figma rendering.
function fakeFigma(){
 let next=0;const nodes=new Map(),vars=new Map(),cols=new Map();let failExport=false;
 const primaryColor=paint=>paint?.boundVariables?.color?vars.get(paint.boundVariables.color.id).valuesByMode.mode:paint?.color;
 function node(type){
  const data={},n={id:'n'+(++next),type,name:type,children:[],width:100,height:100,_fills:[],strokes:[],
   getPluginData:k=>data[k]||'',setPluginData:(k,v)=>data[k]=v,
   appendChild(c){if(c.parent)c.parent.children=c.parent.children.filter(n=>n!==c);c.parent=this;this.children.push(c);},
   resize(w,h){this.width=w;this.height=h;},rescale(f){this.width*=f;this.height*=f;},
   setBoundVariable(){},findAll(fn){return this.children.flatMap(c=>[...(fn(c)?[c]:[]),...c.findAll(fn)]);},findOne(fn){return this.findAll(fn)[0];},
   async exportAsync(){if(failExport){failExport=false;throw Error('模拟导出时中断');}return new Uint8Array([137,80,78,71,13,10,26,10]);}
  };
  Object.defineProperty(n,'fills',{configurable:true,get(){return this._fills.map(p=>({...p,color:primaryColor(p)}));},set(v){this._fills=v;}});
  if(type==='COMPONENT')n.createInstance=()=>{
   const i=node('INSTANCE');i.getMainComponentAsync=async()=>n;i.findOne=fn=>n.findOne(fn);
   Object.defineProperty(i,'width',{get:()=>n.width});Object.defineProperty(i,'height',{get:()=>n.height});
   Object.defineProperty(i,'fills',{get:()=>n.fills,configurable:true});return i;
  };
  nodes.set(n.id,n);return n;
 }
 const root=node('DOCUMENT');root.name=TARGET_NAME;root.setPluginData('bridge-document-id','doc_test_123456');
 const figma={root,currentPage:null,viewport:{scrollAndZoomIntoView(){}},getNodeByIdAsync:async id=>nodes.get(id),loadFontAsync:async()=>{},setCurrentPageAsync:async p=>figma.currentPage=p,
  createPage:()=>node('PAGE'),createFrame:()=>node('FRAME'),createComponent:()=>node('COMPONENT'),createText:()=>node('TEXT'),createNodeFromSvg:()=>node('FRAME'),
  variables:{getLocalVariableCollectionsAsync:async()=>[...cols.values()],createVariableCollection(name){const c={id:'c'+(++next),name,defaultModeId:'mode',renameMode(id,mode){this.mode=mode;}};cols.set(c.id,c);return c;},getVariableCollectionByIdAsync:async id=>cols.get(id),
   createVariable(name,c,type){const v={id:'v'+(++next),name,variableCollectionId:c.id,type,valuesByMode:{},setValueForMode(k,val){this.valuesByMode[k]=val;},resolveForConsumer(){return {value:this.valuesByMode.mode};}};vars.set(v.id,v);return v;},getVariableByIdAsync:async id=>vars.get(id),setBoundVariableForPaint:(p,k,v)=>({...p,boundVariables:{[k]:{type:'VARIABLE_ALIAS',id:v.id}}})}
 };
 // Make the descriptor replaceable for inherited instance fills.
 return {figma,nodes,vars,cols,failNextExport(){failExport=true;}};
}
function message(id,action='demo.ensure',args={}){return {documentId:'doc_test_123456',request:{id,action,args},digest:JSON.stringify({id,action,args})};}
test('插件首次建立变量/主组件/实例，重放不新增对象',async()=>{
 const f=fakeFigma(),run=createExecutor(f.figma,'doc_test_123456');const m=message('create');const first=await run(m),count=f.nodes.size;
 assert.equal(first.result.revision,1);assert.equal(first.result.instance.mainId,first.result.ids.component);assert.equal(f.vars.size,5);
 const repeated=await createExecutor(f.figma,'doc_test_123456')(m);assert.equal(repeated.result.replayed,true);assert.equal(f.nodes.size,count);
});
test('画布写入后导出中断：新执行器恢复，不重复创建或递增 revision',async()=>{
 const f=fakeFigma(),m=message('partial');f.failNextExport();await assert.rejects(createExecutor(f.figma,'doc_test_123456')(m),/模拟导出/);const count=f.nodes.size;
 const done=await createExecutor(f.figma,'doc_test_123456')(m);assert.equal(done.result.revision,1);assert.equal(f.nodes.size,count);
 assert.deepEqual([...f.cols.values()].map(c=>[c.name,c.mode]),[['Color','Light'],['Layout','Default']]);
 for(const variable of f.vars.values())assert.equal(f.cols.get(variable.variableCollectionId).name,variable.type==='COLOR'?'Color':'Layout');
});
test('修改后丢失结果，再恢复只返回已完成回执',async()=>{
 const f=fakeFigma(),run=createExecutor(f.figma,'doc_test_123456');await run(message('start'));
 const m=message('update','demo.update',{expectedRevision:1,label:'恢复成功',primary:'#123456',width:360});
 const first=await run(m);assert.equal(first.result.revision,2);assert.equal(first.result.instance.width,360);assert.equal(first.result.instance.label,'恢复成功');
 const again=await createExecutor(f.figma,'doc_test_123456')(m);assert.equal(again.result.revision,2);assert.equal(again.result.replayed,true);
});
test('人工改动、错误目标、过期 revision 与非法输入不会被覆盖',async()=>{
 const f=fakeFigma(),run=createExecutor(f.figma,'doc_test_123456');const a=await run(message('start'));const label=f.nodes.get(a.result.ids.label);label.characters='人工编辑';
 await assert.rejects(run(message('conflict','demo.update',{expectedRevision:1,label:'覆盖'})),/人工改动/);assert.equal(label.characters,'人工编辑');
 await assert.rejects(run(message('stale','demo.update',{expectedRevision:0,label:'覆盖'})),/expectedRevision/);
 const size=f.nodes.size;await assert.rejects(run(message('invalid','demo.ensure',{primary:'red'})),/primary/);assert.equal(f.nodes.size,size);
 f.figma.root.name='现有 Demo';await assert.rejects(run(message('wrong')),/目标文档/);
});
