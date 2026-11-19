import {nameIssue,policy,validDimension} from './design-policy.mjs';

// Restrict composition to editable design primitives and real component instances.
export function validateComposition(args){
  const allowed=(object,keys)=>{
    if(!object || typeof object!=='object' || Array.isArray(object) || Object.keys(object).some(k=>!keys.includes(k)))throw Error('画板计划包含未知字段');
  };
  allowed(args,['pageId','width','root','dryRun','profile','fieldAssets']);
  if(typeof args.pageId!=='string'||!args.pageId||!Number.isInteger(args.width)||args.width<160||args.width>2560)throw Error('需要 pageId 和 160–2560 px 的画板宽度');
  if(args.dryRun!==undefined&&typeof args.dryRun!=='boolean')throw Error('dryRun 需为布尔值');
  const profile=policy.profiles[args.profile??policy.defaultProfile];
  if(('profile' in args&&typeof args.profile!=='string')||!Object.hasOwn(policy.profiles,args.profile??policy.defaultProfile))throw Error('未登记设计风格');
  if(args.fieldAssets!==undefined){
    if(profile.status==='document')throw Error('文档主题请通过 mainId 复用当前文件的输入组件');
    const keys=['styleId','background','foreground','placeholder','border','error'];
    allowed(args.fieldAssets,keys);
    if(!keys.every(key=>typeof args.fieldAssets[key]==='string'&&args.fieldAssets[key]))throw Error('输入样本需要共享样式和颜色变量');
  }
  let count=0;
  const opacity=value=>typeof value==='number'&&value>=0&&value<=1;
  const reference=value=>typeof value==='string'&&value.length>0;
  function visit(node,depth){
    if(++count>240||depth>8)throw Error('画板计划过大');
    const fields={stack:['direction','padding','gap','background','children','radius','equalColumns','height','align','distribution','paintOpacity','glass','backdrop'],text:['text','styleId','color','textAlign'],instance:['mainId','properties'],field:['state','value']};
    if(!node||!Object.hasOwn(fields,node.kind))throw Error('未知图层类型');
    allowed(node,['kind','name','width','fill',...fields[node.kind]]);
    if(nameIssue('FRAME',node.name,{profile:args.profile??policy.defaultProfile}))throw Error('图层名称不符合规范');
    if(node.width!==undefined&&(!depth||!Number.isInteger(node.width)||node.width<1||node.width>args.width))throw Error('无效的固定宽度');
    if(node.fill!==undefined&&(!depth||node.fill!==true||node.width!==undefined))throw Error('固定宽度与填充布局不能并用');
    if(node.kind==='stack'){
      if(!['VERTICAL','HORIZONTAL'].includes(node.direction)||!validDimension(node.padding,profile.spacing)||!validDimension(node.gap,profile.spacing)||!Array.isArray(node.children)||(!node.children.length&&(!node.background||!node.height)))throw Error('检查 Auto Layout 方向、间距档位与子节点');
      if(node.background!==undefined&&typeof node.background!=='string')throw Error('背景需引用颜色变量');
      if(node.radius!==undefined&&!validDimension(node.radius,profile.radii))throw Error('圆角不符合 profile');
      if(node.equalColumns!==undefined&&(node.equalColumns!==true||node.direction!=='HORIZONTAL'||node.children.some(child=>child?.kind!=='stack'||child.width!==undefined)))throw Error('等宽列需要水平排列的容器');
      if(node.height!==undefined&&(!Number.isInteger(node.height)||node.height<1||node.height>2560))throw Error('无效的固定高度');
      if(node.align!==undefined&&!['MIN','CENTER','MAX'].includes(node.align))throw Error('无效的交叉轴对齐');
      if(node.distribution!==undefined&&!['MAX','SPACE_BETWEEN'].includes(node.distribution))throw Error('无效的主轴分布');
      if(node.paintOpacity!==undefined&&(!node.background||!opacity(node.paintOpacity)))throw Error('透明度需引用背景色且在 0–1 之间');
      if(node.glass!==undefined){
        allowed(node.glass,['outline','blur']);
        if(!depth||!node.background||!(node.paintOpacity>0&&node.paintOpacity<1)||!reference(node.glass.outline)||!Number.isInteger(node.glass.blur)||node.glass.blur<1||node.glass.blur>64)throw Error('毛玻璃需使用半透明填充、描边变量和 1–64 px 背景模糊');
      }
      if(node.backdrop!==undefined){
        if(depth||!Array.isArray(node.backdrop)||node.backdrop.length!==3)throw Error('环境渐变仅用于画板根节点，需三个色标');
        for(const stop of node.backdrop){
          allowed(stop,['color','opacity']);
          if(!reference(stop.color)||!opacity(stop.opacity))throw Error('渐变色标需要颜色变量及 0–1 透明度');
        }
      }
      node.children.forEach(child=>visit(child,depth+1));
    }else if(node.kind==='text'){
      if(![node.text,node.styleId,node.color].every(x=>typeof x==='string'&&x.length>0)||node.text.length>4000)throw Error('文本需要内容、共享样式和颜色变量');
      if(node.textAlign!==undefined&&node.textAlign!=='CENTER')throw Error('无效的文字对齐');
    }else if(node.kind==='field'){
      if(!args.fieldAssets||!['Default','Placeholder','Invalid'].includes(node.state)||typeof node.value!=='string'||!node.value.trim()||node.value.length>200)throw Error('输入样本需要合法状态和可编辑内容');
    }else if(typeof node.mainId!=='string'||!node.mainId||(node.properties!==undefined&&(!node.properties||typeof node.properties!=='object'||Array.isArray(node.properties)||Object.values(node.properties).some(v=>!['boolean','string'].includes(typeof v)))))throw Error('实例需提供主组件 ID 和有效属性');
  }
  if(args.root?.kind!=='stack'||!args.root.background)throw Error('画板根节点需要有背景变量的 stack');
  visit(args.root,0);
}
