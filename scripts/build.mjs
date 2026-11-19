import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';

const community = process.argv.includes('--community');
const output = community ? 'release/community-plugin' : 'dist';
const id = community ? process.env.FIGMA_PLUGIN_ID : 'luigi-local-cli-bridge';
if (community && !/^[1-9][0-9]*$/.test(id ?? '')) {
  throw Error('Set FIGMA_PLUGIN_ID to the plugin ID assigned by Figma.');
}

let token = '';
if (!community && fs.existsSync('.local/credentials.json')) {
  const credentials = JSON.parse(fs.readFileSync('.local/credentials.json', 'utf8'));
  if (credentials.expiresAt > Date.now()) token = credentials.plugin;
}
fs.mkdirSync(output, {recursive:true});
const options = {bundle:true, format:'iife', target:'es2020'};
const iconLicense = fs.readFileSync('assets/PHOSPHOR-LICENSE', 'utf8');
await build({...options, banner:{js:'/*!\n' + iconLicense + '\n*/'}, entryPoints:['plugin/main.mjs'], outfile:path.join(output, 'code.js'), loader:{'.svg':'text'}});
const ui = await build({...options, entryPoints:['plugin/ui-client.mjs'], write:false, define:{__LOCAL_PAIRING__:JSON.stringify(token)}});
const html = fs.readFileSync('plugin/ui.html', 'utf8')
  .replace('__UI_SCRIPT__', () => ui.outputFiles[0].text.replaceAll('</script', '<\\/script'));
fs.writeFileSync(path.join(output, 'ui.html'), html, {mode:0o600});
const networkAccess = {
  allowedDomains:['ws://localhost:38475'],
  reasoning:'Send design requests and results between this plugin and the paired CLI on this computer.',
};
if (!community) networkAccess.devAllowedDomains = ['http://localhost:38475', 'ws://localhost:38475'];
const manifest = {name:'CLI Bridge', id, api:'1.0.0', editorType:['figma'], main:'code.js', ui:'ui.html', documentAccess:'dynamic-page', networkAccess};
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Built ' + path.join(output, 'manifest.json'));
