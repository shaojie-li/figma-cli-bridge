const previousNames=new Map([
  ['control/sm','control-height/sm'],
  ['control/md','control-height/md'],
  ['control/lg','control-height/lg'],
  ['radius/focus','radius/focus-ring'],
  ['size/icon','icon-size/md']
]);

export function currentLayoutName(name){
  return previousNames.get(name)??name;
}
