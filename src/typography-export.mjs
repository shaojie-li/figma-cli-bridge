import {policy} from './design-policy.mjs';

const profile=policy.profiles['luigi-default'];
const contract=profile.typography;

export function exportTypography(snapshot){
  if(!Array.isArray(snapshot?.textStyles))throw Error('需要含 textStyles 的 design.read 快照');
  const groups={};
  for(const [name,[size,height]] of Object.entries(contract.roles)){
    const matches=snapshot.textStyles.filter(style=>style.name===name);
    if(matches.length!==1)throw Error('需要唯一的共享文字样式：'+name);
    const [{fontName,fontSize,lineHeight}]=matches;
    if(fontName?.family!==contract.fontFamily||fontName.style!==contract.fontStyle)throw Error('字体与规范不符：'+name);
    const weight=fontName.variationSettings?.wght??contract.fontWeight;
    if(weight!==contract.fontWeight)throw Error('字重与规范不符：'+name);
    if(fontSize!==size||lineHeight?.unit!=='PIXELS'||lineHeight.value!==height)throw Error('字号或行高与规范不符：'+name);
    const [group,variant]=name.toLowerCase().split('/');
    (groups[group]??={})[variant]={fontFamily:fontName.family,fontStyle:fontName.style,fontWeight:weight,fontSize,lineHeight:lineHeight.value};
  }
  return {version:1,unit:'logical-pixel',modes:{default:groups}};
}
