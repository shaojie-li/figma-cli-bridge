import {policy} from '../src/design-policy.mjs';
import {exportTypography} from '../src/typography-export.mjs';
import {seal} from '../src/button-plan.mjs';

const contract=policy.profiles['luigi-default'].typography;
export async function syncTypography(figma,{expected}){
  const fontName={family:contract.fontFamily,style:contract.fontStyle};
  await figma.loadFontAsync(fontName);
  const styles=await figma.getLocalTextStylesAsync();
  const plan=Object.entries(contract.roles).map(([name,[fontSize,lineHeight]])=>({
    name,fontSize,fontName,lineHeight:{unit:'PIXELS',value:lineHeight}
  }));
  const missing=plan.filter(role=>!styles.some(style=>style.name===role.name));
  exportTypography({textStyles:[...styles,...missing]});
  const fingerprint=seal(plan.map(role=>[role,styles.find(style=>style.name===role.name)?.id??null]));
  if(!expected||!missing.length)return {fingerprint,missing:missing.map(role=>role.name)};
  if(expected!==fingerprint)throw Error('文字样式预检已过期');
  const created=[];
  try{
    for(const role of missing){
      const style=figma.createTextStyle();
      created.push(style);
      style.fontName=role.fontName;
      style.fontSize=role.fontSize;
      style.lineHeight=role.lineHeight;
      style.letterSpacing={unit:'PIXELS',value:0};
      style.name=role.name;
      style.setPluginData('bridge-typography-role',role.name);
    }
    exportTypography({textStyles:await figma.getLocalTextStylesAsync()});
    return {created:created.map(style=>({id:style.id,name:style.name}))};
  }catch(error){
    for(const style of created.reverse())style.remove();
    throw error;
  }
}
