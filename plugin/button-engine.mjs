import {canonical,TARGET_NAME} from '../src/protocol.mjs';
import {readDesign} from './design-engine.mjs';
import {addLayoutTokens,missingLayoutTokens} from './layout-scale.mjs';
import {auditDesign,policy} from '../src/design-policy.mjs';
import {buttonCases,buttonColors,sharedColorKey,appearance,variantName,contrast,seal,contentBounds} from '../src/button-plan.mjs';
import checkSvg from '../assets/check.svg';
import spinnerSvg from '../assets/circle-notch.svg';
const typography=policy.profiles['luigi-default'].typography;
const KEY='bridge-button-v1',FONT={family:typography.fontFamily,style:typography.fontStyle};
export async function executeButton(figma,documentId,message){
 const {id,action,args}=message.request;
 const guard=()=>{if(figma.root.name!==TARGET_NAME||figma.root.getPluginData('bridge-document-id')!==documentId||message.documentId!==documentId)throw Error('目标文档身份已改变');};guard();
 let s=JSON.parse(figma.root.getPluginData(KEY)||'{"assets":{},"vars":{},"styles":{},"cols":{}}');
 const save=()=>figma.root.setPluginData(KEY,JSON.stringify(s));
 const legacy=JSON.parse(figma.root.getPluginData('bridge-state-v1')||'{}');
 if(!legacy.assets?.component)throw Error('缺少原有 Button 样本');
 const page=await figma.getNodeByIdAsync(legacy.assets.page);if(!page||page.type!=='PAGE')throw Error('原页面缺失');
 await page.loadAsync();
 const snapshot=()=>readDesign(figma,{nodeIds:[page.id],limit:1000});
 if(action==='button.export'){
  if(!s.done)throw Error('Button 尚未完成');const frame=await figma.getNodeByIdAsync(s.assets.review);return {result:{frameId:frame.id,width:frame.width,height:frame.height},png:Array.from(await frame.exportAsync({format:'PNG',constraint:{type:'SCALE',value:1}}))};
 }
 if(action==='button.verify')return {result:await verify()};
 if(s.done&&args.resumeFrom!==s.requestId){if(s.requestId===id&&s.digest!==message.digest)throw Error('同 ID 内容不一致');return {result:{...await verify(),replayed:true}};}
 if(s.requestId===id&&s.digest!==message.digest)throw Error('同 ID 内容不一致');
 if(s.requestId&&s.requestId!==id&&args.resumeFrom!==s.requestId)throw Error('先恢复原 Button 任务 '+s.requestId);
 for(const key of ['bridge-state-v1','bridge-design-journal-v1'])if(Object.values(JSON.parse(figma.root.getPluginData(key)||'{"receipts":{}}').receipts||{}).some(r=>['running','prepared'].includes(r.status)))throw Error('先恢复尚未完成的写入');
 const currentSeal=seal(await snapshot());
 if(s.seal&&s.seal!==currentSeal)throw Error('中断后画布发生变化，停止覆盖');
 if(!s.requestId&&args.expected!==currentSeal)throw Error('画布已改变，请重新读取');
 if(s.requestId!==id&&args.resumeFrom){
  if(args.expected!==currentSeal)throw Error('恢复预检已过期');
  s.previousAttempts=[...(s.previousAttempts||[]),{id:s.requestId,digest:s.digest,error:s.error||s.readError||'检查结果中断'}];
 }
 await figma.loadFontAsync(FONT);guard();
 s.requestId=id;s.digest=message.digest;s.done=false;s.originalLabel??=(await figma.getNodeByIdAsync(legacy.assets.label)).characters;save();
 try{
  await figma.setCurrentPageAsync(page);
  await foundations();
  await build();
  const report=await verify();if(!report.audit.technicalPassed||!report.checks.every(c=>c.passed))throw Error('Button 验收失败：'+JSON.stringify({issues:report.audit.issues,checks:report.checks.filter(c=>!c.passed)}));
  s.done=true;s.seal=seal(await snapshot());save();
  figma.currentPage.selection=[await figma.getNodeByIdAsync(s.assets.review)];figma.viewport.scrollAndZoomIntoView(figma.currentPage.selection);
  return {result:report};
 }catch(error){
  error.uncertain=true;s.error=error.message;
  try{s.seal=seal(await snapshot());}catch(readError){s.readError=readError.message;}
  save();throw error;
 }
 async function own(key,create){
  if(s.assets[key]){const n=await figma.getNodeByIdAsync(s.assets[key]);if(!n||n.getPluginData('button-owner')!==documentId)throw Error('资产缺失或归属改变：'+key);return n;}
  const n=create();n.setPluginData('button-owner',documentId);n.setPluginData('button-key',key);s.assets[key]=n.id;save();return n;
 }
 async function variable(key,name,type,value,col,scopes,syntax){
  let v=s.vars[key]?await figma.variables.getVariableByIdAsync(s.vars[key]):null;
  if(!v){const all=await figma.variables.getLocalVariablesAsync();if(all.some(v=>v.name===name&&v.variableCollectionId===col.id))throw Error('发现未登记变量 '+name);v=figma.variables.createVariable(name,col,type);s.vars[key]=v.id;save();}
  v.name=name;v.scopes=scopes;v.description='Button Light；来源 luigi-ui colors.json / design/policy.json；计算值按 sRGB color-mix 展开。';v.setValueForMode(col.defaultModeId,value);v.setVariableCodeSyntax('WEB',`var(--${syntax})`);return v;
 }
 async function foundations(){
  const colors=await figma.variables.getVariableCollectionByIdAsync(legacy.assets.collection);
  const dim=legacy.assets.layoutCollection&&await figma.variables.getVariableCollectionByIdAsync(legacy.assets.layoutCollection);
  if(!['Color','Color/Normal/Light'].includes(colors?.name)||dim?.name!=='Layout')throw Error('请先迁移旧变量集合到 Color 和 Layout');
  s.cols={colors:colors.id,dimensions:dim.id};save();
  for(const [key,value] of Object.entries(buttonColors)){
   const slug=key.replace(/[A-Z]/g,x=>'-'+x.toLowerCase());
   const role=sharedColorKey(slug);
   if(key==='primary'&&!s.vars.primary){s.vars.primary=legacy.assets.primary;save();}
   await variable(key,'color/'+role,'COLOR',value,colors,['FRAME_FILL','SHAPE_FILL','TEXT_FILL','STROKE_COLOR'],`ui-${role}`);
  }
  const numbers={zero:0,gap:8,padding:16,radius:8,sm:36,md:44,lg:48,space24:24,space32:32,ringRadius:12,icon:16};
  for(const [key,value] of Object.entries(numbers)){
   const old={gap:'gap',padding:'padding',radius:'radius',md:'height'}[key];if(old&&!s.vars[key]){s.vars[key]=legacy.assets[old];save();}
   const col=s.vars[key]?await figma.variables.getVariableCollectionByIdAsync((await figma.variables.getVariableByIdAsync(s.vars[key])).variableCollectionId):dim;
   await variable(key,key==='radius'?'radius/control':key==='ringRadius'?'radius/focus-ring':['sm','md','lg'].includes(key)?'control-height/'+key:key==='icon'?'icon-size/md':'space/'+value,'FLOAT',value,col,key==='radius'||key==='ringRadius'?['CORNER_RADIUS']:['GAP','WIDTH_HEIGHT'],`button-${key}`);
  }
  addLayoutTokens(figma,dim,missingLayoutTokens(dim,await figma.variables.getLocalVariablesAsync()));
  for(const [name,[size,line]] of Object.entries(typography.roles)){
   let style=s.styles[name]?await figma.getStyleByIdAsync(s.styles[name]):null;
   if(!style){
     const same=(await figma.getLocalTextStylesAsync()).filter(item=>item.name===name);
     if(same.length&&(same.length!==1||same[0].getPluginData('bridge-typography-role')!==name))throw Error('发现未登记文本样式：'+name);
     style=same[0]??figma.createTextStyle();s.styles[name]=style.id;save();
   }
   style.name=name;style.fontName=FONT;style.fontSize=size;style.lineHeight={unit:'PIXELS',value:line};style.letterSpacing={unit:'PIXELS',value:0};style.description='Noto Sans SC / Regular；luigi-default';
  }
 }
 async function paint(n,key,field='fills'){
  const v=await figma.variables.getVariableByIdAsync(s.vars[key]),value=v.resolveForConsumer(n).value;
  n[field]=[figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:value.r,g:value.g,b:value.b}},'color',v)];
 }
 async function bind(n,field,key){n.setBoundVariable(field,await figma.variables.getVariableByIdAsync(s.vars[key]));}
 async function layout(n,direction='VERTICAL',padding='zero',gap='gap'){
  n.layoutMode=direction;n.primaryAxisSizingMode='AUTO';n.counterAxisSizingMode='FIXED';n.clipsContent=false;n.fills=[];n.strokes=[];
  for(const field of ['paddingTop','paddingRight','paddingBottom','paddingLeft'])await bind(n,field,padding);await bind(n,'itemSpacing',gap);
 }
 async function text(key,parent,name,content,style='Label/Small',color='fg'){
  const t=await own(key,()=>figma.createText());parent.appendChild(t);t.name=name;t.fontName=FONT;t.characters=content;await t.setTextStyleIdAsync(s.styles[style]);t.textAutoResize='WIDTH_AND_HEIGHT';await paint(t,color);return t;
 }
 async function icon(key,name,svg){
  const main=await own('icon-'+key,()=>figma.createComponent());page.appendChild(main);main.name=name;await layout(main,'HORIZONTAL');main.resize(16,16);main.primaryAxisSizingMode='FIXED';main.counterAxisSizingMode='FIXED';main.primaryAxisAlignItems='CENTER';main.counterAxisAlignItems='CENTER';await bind(main,'width','icon');await bind(main,'height','icon');
  const glyph=await own('glyph-'+key,()=>figma.createNodeFromSvg(svg));main.appendChild(glyph);glyph.name='Glyph';glyph.rescale(16/glyph.width);glyph.resize(16,16);glyph.fills=[];glyph.strokes=[];let i=0;
  for(const v of glyph.findAll(n=>n.type==='VECTOR')){v.name='Path'+(++i);await paint(v,'onSolid');v.strokes=[];}
  main.x=-800;main.y=key==='check'?0:80;return main;
 }
 async function build(){
  const check=await icon('check','Icon/Phosphor/Check/Regular',checkSvg),spinner=await icon('spinner','Icon/Phosphor/CircleNotch/Regular',spinnerSvg);
  if(!s.assets.base){const original=await figma.getNodeByIdAsync(legacy.assets.component);if(!original||original.type!=='COMPONENT')throw Error('原 Button 缺失');original.setPluginData('button-owner',documentId);s.assets.base=original.id;s.assets['variant-0']=original.id;save();}
  const variants=[];
  for(let i=0;i<buttonCases.length;i++){const c=await own('variant-'+i,()=>figma.createComponent());if(!s.assets.set)page.appendChild(c);c.name=variantName(buttonCases[i]);variants.push(c);}
  const set=await own('set',()=>figma.combineAsVariants(variants,page));set.name='Actions/Button';await layout(set,'VERTICAL','space24','padding');set.cornerRadius=0;set.resize(300,100);set.x=-450;set.y=0;
  const property=(name,type,value)=>{const key=Object.keys(set.componentPropertyDefinitions).find(k=>k.split('#')[0]===name);return key||set.addComponentProperty(name,type,value);};
  s.labelProperty=property('Label','TEXT','保存更改');s.iconProperty=property('ShowLeadingIcon','BOOLEAN',true);save();
  for(let i=0;i<variants.length;i++){
   const c=variants[i],spec=buttonCases[i],a=appearance(spec);set.appendChild(c);await layout(c,'HORIZONTAL');c.primaryAxisSizingMode='FIXED';c.resize(220,a.height);c.primaryAxisAlignItems='CENTER';c.counterAxisAlignItems='CENTER';await bind(c,'height',spec.Size.toLowerCase());await bind(c,'paddingLeft','padding');await bind(c,'paddingRight','padding');
   for(const f of ['topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius'])await bind(c,f,'radius');await paint(c,a.background);
   if(spec.Intent==='Secondary'){await paint(c,'secondaryBorder','strokes');c.strokeWeight=1;c.strokeAlign='INSIDE';}
   if(i===0&&!s.oldIconRemoved){const old=await figma.getNodeByIdAsync(legacy.assets.icon);if(old){if(old.getPluginData('bridge-owner')!==documentId)throw Error('旧图标归属改变');old.remove();}s.oldIconRemoved=true;save();}
   const leading=await own('leading-'+i,()=>check.createInstance());c.appendChild(leading);leading.name='LeadingIcon';leading.componentPropertyReferences={visible:s.iconProperty};leading.layoutPositioning=a.loading?'ABSOLUTE':'AUTO';leading.opacity=a.loading?0:1;
   const progress=await own('spinner-'+i,()=>spinner.createInstance());c.appendChild(progress);progress.name='Spinner';progress.visible=a.loading;
   for(const glyph of [leading,progress])for(const v of glyph.findAll(n=>n.type==='VECTOR'))await paint(v,a.foreground);
   if(i===0&&!s.assets['label-0']){const old=await figma.getNodeByIdAsync(legacy.assets.label);old.setPluginData('button-owner',documentId);s.assets['label-0']=old.id;save();}
   const label=await text('label-'+i,c,'Label','保存更改',a.style,a.foreground);label.componentPropertyReferences={characters:s.labelProperty};
   const ring=await own('ring-'+i,()=>figma.createFrame());c.appendChild(ring);ring.name='FocusRing';ring.fills=[];ring.layoutPositioning='ABSOLUTE';ring.x=-4;ring.y=-4;ring.resize(228,a.height+8);ring.constraints={horizontal:'STRETCH',vertical:'STRETCH'};ring.visible=a.focus;ring.clipsContent=false;ring.strokeWeight=2;ring.strokeAlign='INSIDE';for(const f of ['topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius'])await bind(ring,f,'ringRadius');await paint(ring,spec.Intent==='Danger'?'danger':'primary','strokes');
  }
  // Keep the original review frame and instance; replace only their missing foundations.
  const oldFrame=await figma.getNodeByIdAsync(legacy.assets.frame);await paint(oldFrame,'canvas');oldFrame.clipsContent=false;
  for(const f of ['paddingTop','paddingBottom','paddingLeft','paddingRight'])await bind(oldFrame,f,'space32');await bind(oldFrame,'itemSpacing','space24');
  for(const [key,style,color] of [['title','Heading/Large','fg'],['caption','Label/Small','muted'],['footer','Label/Small','muted']]){const t=await figma.getNodeByIdAsync(legacy.assets[key]);await t.setTextStyleIdAsync(s.styles[style]);await paint(t,color);}
  const oldInstance=await figma.getNodeByIdAsync(legacy.assets.instance);oldInstance.setProperties({[s.labelProperty]:s.originalLabel});oldInstance.resize(360,44);
  const review=await own('review',()=>figma.createFrame());page.appendChild(review);review.name='Button/Desktop/Review';await layout(review,'VERTICAL','space32','space24');review.resize(960,100);review.x=600;review.y=0;await paint(review,'canvas');
  await text('review-title',review,'Title','Button','Heading/Large');await text('review-subtitle',review,'Description','Light · Phosphor · 13 个合同必验组合','Body/Default','muted');
  for(let i=0;i<variants.length;i++){
   const row=await own('row-'+i,()=>figma.createFrame());review.appendChild(row);row.name='StateRow'+(i+1);await layout(row,'HORIZONTAL','padding','space24');row.resize(896,76);row.counterAxisAlignItems='CENTER';await paint(row,i%2?'canvas':'surface');
   const spec=buttonCases[i],caption=[spec.Intent,spec.Size,spec.State,spec.Focus==='True'?'Focus':''].filter(Boolean).join(' / ');
   const label=await text('row-label-'+i,row,'StateLabel',caption);label.textAutoResize='HEIGHT';label.resize(400,20);
   const instance=await own('sample-'+i,()=>variants[i].createInstance());row.appendChild(instance);instance.name='PreviewAction';if(spec.Intent==='Danger')instance.setProperties({[s.labelProperty]:'删除项目'});
  }
  await text('edge-title',review,'EdgeCaseTitle','内容与尺寸边界','Body/Default');
  const testRow=await own('tests',()=>figma.createFrame());review.appendChild(testRow);testRow.name='BoundaryCases';await layout(testRow,'VERTICAL','padding','padding');testRow.resize(896,100);await paint(testRow,'surface');
  await text('edge-caption',testRow,'Description','无图标 · Loading 隐藏可选图标 · 390 px 视口 / 32 px 边距');
  const noIcon=await own('no-icon',()=>variants[0].createInstance());testRow.appendChild(noIcon);noIcon.name='TextOnlyAction';noIcon.setProperties({[s.iconProperty]:false,[s.labelProperty]:'保存更改'});
  const loadingIndex=buttonCases.findIndex(c=>c.State==='Loading'&&c.Focus==='False');
  const loadingNoIcon=await own('loading-no-icon',()=>variants[loadingIndex].createInstance());testRow.appendChild(loadingNoIcon);loadingNoIcon.name='LoadingTextOnlyAction';loadingNoIcon.setProperties({[s.iconProperty]:false});
  const long=await own('long-label',()=>variants[0].createInstance());testRow.appendChild(long);long.name='LongLabelAction';long.setProperties({[s.labelProperty]:'确认保存这次编辑的全部更改'});long.resize(326,44);
  // Verify instance overrides through a real variant swap, then restore the final review.
  noIcon.setProperties({State:'Hover'});if(noIcon.componentProperties[s.iconProperty].value!==false||noIcon.componentProperties[s.labelProperty].value!=='保存更改')throw Error('切换变体丢失覆盖');noIcon.setProperties({State:'Rest'});
  // resize() changes sizing modes in the real editor: establish Hug after sizing/content.
  for(const frame of [set,oldFrame,review,testRow])frame.primaryAxisSizingMode='AUTO';
  for(let i=0;i<variants.length;i++)(await figma.getNodeByIdAsync(s.assets['row-'+i])).counterAxisSizingMode='AUTO';
  s.overrideProbePassed=true;save();
 }
 async function verify(){
  const actual=await snapshot(),audit=auditDesign(actual,{profile:'luigi-default',requireComponents:['Actions/Button']}),checks=[];
  const add=(name,passed,details)=>checks.push({name,passed,details});
  if(!s.assets.set){add('componentExists',false);return {audit,checks};}
  const variants=await Promise.all(buttonCases.map((_,i)=>figma.getNodeByIdAsync(s.assets['variant-'+i])));
  const label=await figma.getNodeByIdAsync(legacy.assets.label);add('originalIdentity',variants[0]?.id===legacy.assets.component&&label?.id===legacy.assets.label,{mainId:variants[0]?.id,labelId:label?.id,instanceId:legacy.assets.instance});
  for(let i=0;i<variants.length;i++){
   const c=variants[i],spec=buttonCases[i],a=appearance(spec),l=c.findOne(n=>n.name==='Label'),ring=c.findOne(n=>n.name==='FocusRing');
   add('geometry-'+i,c.width===220&&c.height===a.height&&c.itemSpacing===8&&c.paddingLeft===16&&c.paddingRight===16&&c.cornerRadius===8,{name:c.name,width:c.width,height:c.height});
   add('label-'+i,l?.textStyleId===s.styles[a.style]&&l.width+24+32<=c.width,{width:l?.width,style:l?.textStyleId});
   add('focus-'+i,ring.visible===a.focus&&c.clipsContent===false&&ring.x===-4&&ring.y===-4&&ring.width===c.width+8,{visible:ring.visible,width:ring.width});
   const foreground=l.fills[0].color,background=c.fills[0].color;
   const ratio=contrast(foreground,background);add('contrast-'+i,spec.State==='Disabled'||ratio>=4.5,{ratio,disabledExemption:spec.State==='Disabled'});
   add('palette-'+i,['r','g','b'].every(k=>Math.abs(foreground[k]-buttonColors[a.foreground][k])<1e-6&&Math.abs(background[k]-buttonColors[a.background][k])<1e-6));
   for(const child of c.children.filter(n=>n.name==='LeadingIcon'||n.name==='Spinner')){
    const main=child.type==='INSTANCE'?await child.getMainComponentAsync():null;
    add('icon-instance-'+i+'-'+child.name,main?.id===s.assets[child.name==='LeadingIcon'?'icon-check':'icon-spinner']&&(child.name==='LeadingIcon'||child.visible===a.loading),{mainId:main?.id});
   }
  }
  const vars=await figma.variables.getLocalVariablesAsync();add('scopesAndSyntax',vars.every(v=>!v.scopes.includes('ALL_SCOPES')&&/^var\(--.+\)$/.test(v.codeSyntax.WEB||'')),{count:vars.length});
  const focusContrast=contrast(buttonColors.primary,buttonColors.canvas);add('focusContrast',focusContrast>=3,{ratio:focusContrast});
  const secondaryContrast=contrast(buttonColors.secondaryBorder,buttonColors.canvas);add('secondaryBoundaryContrast',secondaryContrast>=3,{ratio:secondaryContrast});
  if(s.assets['long-label']){const n=await figma.getNodeByIdAsync(s.assets['long-label']),t=n.findOne(n=>n.type==='TEXT');add('longLabelFits390',n.width===326&&t.width+24+32<=326&&t.height===24,{buttonWidth:n.width,labelWidth:t.width});}
  if(s.assets['loading-no-icon']){const n=await figma.getNodeByIdAsync(s.assets['loading-no-icon']);add('loadingVisibleWithoutOptionalIcon',n.findOne(n=>n.name==='Spinner').visible===true&&n.findOne(n=>n.name==='LeadingIcon').visible===false);}
  add('variantOverridePreserved',s.overrideProbePassed===true);
  for(const key of ['review','tests','set']){
   const n=await figma.getNodeByIdAsync(s.assets[key]);
   const bounds=contentBounds(n);add('contentBounds-'+key,bounds.passed,bounds);
  }
  return {audit,checks,scope:'Button / Light / luigi-default',variants:buttonCases.length,assets:s.assets,variables:s.vars,styles:s.styles,collections:s.cols,remainingManual:['PNG 光学/裁切检查','真实代码的键盘/读屏/防重复提交/动态效果不属于静态 Figma 验收'],readyForProduct:false};
 }
}
