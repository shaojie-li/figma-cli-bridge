import {canonical} from './protocol.mjs';
import source from '../assets/luigi-colors.json' with {type:'json'};
import {components,requiredCases,nameIssue} from './design-policy.mjs';
export const buttonCases=requiredCases(components.contracts['Actions/Button']);
export const variantName=v=>Object.entries(v).map(([k,v])=>k+'='+v).join(', ');
export const rgba=hex=>({r:parseInt(hex.slice(1,3),16)/255,g:parseInt(hex.slice(3,5),16)/255,b:parseInt(hex.slice(5,7),16)/255,a:1});
export const mix=(a,b,weight)=>({r:a.r*weight+b.r*(1-weight),g:a.g*weight+b.g*(1-weight),b:a.b*weight+b.b*(1-weight),a:1});
export function contrast(a,b){const lum=c=>[c.r,c.g,c.b].map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((v,x,i)=>v+x*[.2126,.7152,.0722][i],0);const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
const base=Object.fromEntries(Object.entries(source.modes.light).filter(([,v])=>v.length===7).map(([k,v])=>[k,rgba(v)]));
export const buttonColors={
 canvas:base.canvas,surface:base.surface,fg:base.fg,muted:base['fg-muted'],onSolid:base['on-solid'],
 primary:base['palette-primary'],primaryHover:mix(base['palette-primary'],base['state-mix'],.88),primaryPressed:mix(base['palette-primary'],base['state-mix'],.76),
 danger:base['palette-danger'],dangerHover:mix(base['palette-danger'],base['state-mix'],.88),
 secondary:mix(base['palette-neutral'],base.canvas,.10),secondaryFg:base['palette-neutral'],secondaryBorder:mix(base['palette-neutral'],base.canvas,.80),
 disabled:mix(base.fg,base.canvas,.10),disabledFg:mix(base.fg,base.canvas,.45)
};
export function sharedColorKey(slug){
  const role=slug==='muted'?'fg-muted':slug;
  const issue=nameIssue('VARIABLE','color/'+role);
  if(issue)throw Error(role+'：'+issue);
  return role;
}
export function appearance(c){return {height:{Sm:36,Md:44,Lg:48}[c.Size],style:c.Size==='Sm'?'Label/Small':'Body/Default',background:c.State==='Disabled'?'disabled':c.Intent==='Secondary'?'secondary':c.Intent==='Danger'?(c.State==='Hover'?'dangerHover':'danger'):(c.State==='Hover'?'primaryHover':c.State==='Pressed'?'primaryPressed':'primary'),foreground:c.State==='Disabled'?'disabledFg':c.Intent==='Secondary'?'secondaryFg':'onSolid',focus:c.Focus==='True',loading:c.State==='Loading'};}

export function seal(snapshot){const text=canonical(snapshot);let a=2166136261,b=5381;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}return `${text.length}:${a>>>0}:${b>>>0}`;}
export function contentBounds(n){
 const children=n.children.filter(c=>c.visible&&c.layoutPositioning!=='ABSOLUTE');
 const overflow=children.filter(c=>c.x<n.paddingLeft-.5||c.y<n.paddingTop-.5||c.x+c.width>n.width-n.paddingRight+.5||c.y+c.height>n.height-n.paddingBottom+.5).map(c=>({id:c.id,name:c.name,x:c.x,y:c.y,width:c.width,height:c.height}));
 return {passed:n.primaryAxisSizingMode==='AUTO'&&overflow.length===0,height:n.height,overflow};
}
