import {policy} from './design-policy.mjs';

const profile=policy.profiles['luigi-default'];
export const layoutScale=[
  ...profile.spacing.map(value=>['space/'+value,value,'GAP']),
  ...['xs','sm','md','lg','xl'].map((size,index)=>['control-height/'+size,profile.controlHeights[index],'WIDTH_HEIGHT']),
  ...Object.entries(profile.iconSizes).map(([size,value])=>['icon-size/'+size,value,'WIDTH_HEIGHT']),
  ...Object.entries({none:0,badge:4,control:8,'focus-ring':12,card:16,panel:24}).map(([role,value])=>['radius/'+role,value,'CORNER_RADIUS'])
];
