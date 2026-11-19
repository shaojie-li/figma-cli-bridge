import {auditDesign,policy} from '../src/design-policy.mjs';

export async function compose(figma,{request,digest},readDesign){
  const {args,id}=request;
  const page=figma.currentPage;
  if(page.id!==args.pageId)throw Error('目标页面与当前页面不同，请重新核对选区');
  await page.loadAsync();
  const receiptKey='compose-'+id;
  const receipt=JSON.parse(figma.root.getPluginData(receiptKey)||'null');
  if(receipt){
    if(receipt.digest!==digest)throw Error('请求内容已改变');
    if(!receipt.done)throw Error('上次画板写入中断，请按记录的节点 ID 回读 '+receipt.frameId);
    return {result:{frameId:receipt.frameId,replayed:true,...(receipt.fieldAssetsId?{fieldAssetsId:receipt.fieldAssetsId}:{})}};
  }
  const variables=new Map(),styles=new Map(),masters=new Map();
  const fieldStates=new Set(),fields=new Map();
  const assetName=args.root.name+'/InputSamples';
  const profile=policy.profiles[args.profile||policy.defaultProfile];
  async function prepareColor(key){
    if(key&&!variables.has(key)){
      const v=await figma.variables.getVariableByIdAsync(key);
      if(v?.resolvedType!=='COLOR')throw Error('无效颜色变量 '+key);
      variables.set(key,v);
    }
  }
  async function prepareStyle(key){
    if(!styles.has(key)){
      const style=await figma.getStyleByIdAsync(key);
      if(style?.type!=='TEXT')throw Error('缺少共享文本样式 '+key);
      await figma.loadFontAsync(style.fontName);
      styles.set(key,style);
    }
  }
  async function prepare(n){
    await prepareColor(n.color||n.background);
    await prepareColor(n.glass?.outline);
    for(const stop of n.backdrop||[])await prepareColor(stop.color);
    if(n.kind==='text')await prepareStyle(n.styleId);
    if(n.kind==='field')fieldStates.add(n.state);
    if(n.kind==='instance'){
      const master=await figma.getNodeByIdAsync(n.mainId);
      if(master?.type!=='COMPONENT')throw Error('需要可用的主组件 '+n.mainId);
      const definitions=(master.parent?.type==='COMPONENT_SET'?master.parent:master).componentPropertyDefinitions||{};
      for(const [name,value] of Object.entries(n.properties||{})){
        const definition=definitions[name];
        if(!definition||!['BOOLEAN','TEXT','VARIANT'].includes(definition.type))throw Error('不支持的实例属性 '+name);
        if(typeof value!==(definition.type==='BOOLEAN'?'boolean':'string'))throw Error('实例属性类型不符 '+name);
        if(definition.type==='VARIANT'&&!definition.variantOptions.includes(value))throw Error('未知变体选项 '+name);
      }
      masters.set(n.mainId,master);
    }
    for(const child of n.children||[])await prepare(child);
  }
  await prepare(args.root);
  if(fieldStates.size){
    const {styleId,...colors}=args.fieldAssets;
    await prepareStyle(styleId);
    for(const key of Object.values(colors))await prepareColor(key);
  }
  if(page.id!==figma.currentPage.id||page.children.some(n=>n.name===args.root.name||(fieldStates.size&&n.name===assetName)))throw Error('页面已切换或存在同名画板，请回读后定位');
  if(args.dryRun!==false)return {result:{dryRun:true,pageId:page.id,name:args.root.name,styles:[...styles.keys()],components:[...masters.keys()],fieldStates:[...fieldStates]}};
  const right=page.children.reduce((edge,n)=>Math.max(edge,n.x+n.width),0);
  const frame=figma.createFrame();
  let assets;
  const paint=(key,opacity)=>{
    const bound=figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:0,g:0,b:0}},'color',variables.get(key));
    return opacity===undefined?bound:{...bound,opacity};
  };
  const record=done=>figma.root.setPluginData(receiptKey,JSON.stringify({frameId:frame.id,fieldAssetsId:assets?.id,digest,done}));
  async function draw(n,parent,root=false,fill=false){
    const field=n.kind==='field'?fields.get(n.state):null;
    const layer=root?frame:n.kind==='stack'?figma.createFrame():n.kind==='text'?figma.createText():(field?.main||masters.get(n.mainId)).createInstance();
    if(!root)parent.appendChild(layer);
    layer.name=n.name;
    if(n.kind==='text'){
      layer.fontName=styles.get(n.styleId).fontName;
      layer.characters=n.text;
      await layer.setTextStyleIdAsync(n.styleId);
      layer.textAutoResize=parent.layoutMode==='VERTICAL'?'HEIGHT':'WIDTH_AND_HEIGHT';
      if(n.width!==undefined||n.fill)layer.textAutoResize='HEIGHT';
      if(n.textAlign)layer.textAlignHorizontal=n.textAlign;
    }else if(n.kind==='instance'||field){
      if(field)layer.setProperties({[field.property]:n.value});
      else if(n.properties)layer.setProperties(n.properties);
    }else{
      layer.layoutMode=n.direction;
      layer.clipsContent=false;
      layer.fills=[];
      layer.itemSpacing=n.gap;
      if(n.align)layer.counterAxisAlignItems=n.align;
      if(n.radius!==undefined)layer.cornerRadius=n.radius;
      for(const field of ['paddingTop','paddingBottom','paddingLeft','paddingRight'])layer[field]=n.padding;
      if(root)layer.resize(args.width,100);
    }
    if(n.width!==undefined){
      layer.resize(n.width,layer.height);
      layer.layoutSizingHorizontal='FIXED';
    }else if(!root&&(fill||n.fill||parent.layoutMode==='VERTICAL'))layer.layoutSizingHorizontal='FILL';
    if(n.kind==='stack'){
      for(const child of n.children)await draw(child,layer,false,n.equalColumns);
      if(n.height!==undefined){layer.resize(layer.width,n.height);layer.layoutSizingVertical='FIXED';}
      else layer.layoutSizingVertical='HUG';
      if(n.distribution)layer.primaryAxisAlignItems=n.distribution;
    }
    if(n.color||n.background)layer.fills=[paint(n.color||n.background,n.paintOpacity)];
    if(n.backdrop){
      const gradientStops=n.backdrop.map(({color,opacity},index)=>{
        const {r,g,b}=variables.get(color).resolveForConsumer(layer).value;
        return {position:index/2,color:{r,g,b,a:opacity}};
      });
      layer.fills=[...layer.fills,{type:'GRADIENT_LINEAR',gradientTransform:[[0.72,0.28,0],[-0.28,0.72,0.28]],gradientStops}];
    }
    if(n.glass){
      layer.strokes=[paint(n.glass.outline,0.8)];
      layer.strokeWeight=1;
      layer.strokeAlign='INSIDE';
      layer.effects=[{type:'BACKGROUND_BLUR',blurType:'NORMAL',radius:n.glass.blur,visible:true}];
    }
    return layer;
  }
  try{
    record(false);frame.x=right+64;frame.y=0;
    if(fieldStates.size){
      const {styleId,background,foreground,placeholder,border,error}=args.fieldAssets;
      assets=figma.createFrame();
      record(false);
      assets.name=assetName;assets.layoutMode='VERTICAL';assets.fills=[];assets.itemSpacing=12;
      assets.x=frame.x+args.width+64;assets.y=frame.y;
      for(const state of fieldStates){
        const main=figma.createComponent();
        assets.appendChild(main);
        main.name='Input/'+state;
        main.layoutMode='HORIZONTAL';main.counterAxisAlignItems='CENTER';
        main.resize(320,profile.defaultControlHeight);
        main.primaryAxisSizingMode='FIXED';main.counterAxisSizingMode='FIXED';
        main.paddingLeft=profile.defaultControlPadding;main.paddingRight=profile.defaultControlPadding;
        main.cornerRadius=profile.defaultControlRadius;main.fills=[paint(background)];
        main.strokes=[paint(state==='Invalid'?error:border)];main.strokeWeight=1;main.strokeAlign='INSIDE';
        const initial=state==='Placeholder'?'请输入':'示例内容';
        const value=await draw({kind:'text',name:'Value',text:initial,styleId,color:state==='Placeholder'?placeholder:foreground},main);
        const property=main.addComponentProperty('Value','TEXT',initial);
        value.componentPropertyReferences={characters:property};
        fields.set(state,{main,property});
      }
      assets.primaryAxisSizingMode='AUTO';assets.counterAxisSizingMode='AUTO';
    }
    await draw(args.root,null,true);
    const snapshot=await readDesign(figma,{nodeIds:assets?[frame.id,assets.id]:[frame.id],limit:1000});
    const audit=auditDesign(snapshot,{profile:args.profile});
    if(assets&&!audit.technicalPassed)throw Error('表单样本未通过规范审计：'+JSON.stringify(audit.issues.filter(issue=>issue.severity==='error')));
    const png=Array.from(await frame.exportAsync({format:'PNG'}));
    record(true);
    return {result:{frameId:frame.id,pageId:page.id,nodeCount:snapshot.nodes.length,audit,...(assets?{fieldAssetsId:assets.id}:{})},png};
  }catch(error){
    // Only this request's newly created subtree is owned by this operation.
    frame.remove();assets?.remove();figma.root.setPluginData(receiptKey,'');throw error;
  }
}
