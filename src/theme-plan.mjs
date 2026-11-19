const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const name = value => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 100;
const fields = (value, allowed) => record(value) && Object.keys(value).every(key => allowed.includes(key));

export function validateTheme(args) {
  if (!fields(args, ['frameId', 'pageId', 'mode', 'setup', 'dryRun']) ||
      ![args.frameId, args.pageId, args.mode].every(name) ||
      ('dryRun' in args && typeof args.dryRun !== 'boolean')) throw Error('主题需要页面、画板和模式');
  if (!('setup' in args)) return;
  const s = args.setup;
  if (!fields(s, ['name', 'sourceCollectionId', 'palettes', 'gradientRoles', 'glassRole']) ||
      !name(s.name) || !name(s.sourceCollectionId) || !record(s.palettes)) throw Error('无效主题配置');
  const modes = Object.keys(s.palettes);
  if (!modes.includes(args.mode) || modes.length < 2 || modes.length > 8 || !modes.every(name)) throw Error('无效主题模式');
  const first = s.palettes[modes[0]];
  if (!record(first)) throw Error('缺少主题角色');
  const roles = Object.keys(first);
  if (!roles.length || roles.length > 128 || !roles.every(r => /^[a-z][a-z0-9-]*(\/[a-z0-9-]+)*$/.test(r))) throw Error('无效颜色角色');
  for (const colors of Object.values(s.palettes)) {
    if (!record(colors) || Object.keys(colors).length !== roles.length ||
        !roles.every(r => Object.hasOwn(colors,r) && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(colors[r]))) throw Error('每个模式需要相同的颜色角色和十六进制色值');
  }
  if (!Array.isArray(s.gradientRoles) || !s.gradientRoles.every(r => roles.includes(r)) ||
      (s.glassRole && !roles.includes(s.glassRole))) throw Error('渐变或玻璃角色未定义');
}
