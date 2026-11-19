import {exportLayout} from '../src/layout-export.mjs';
import {writeTokens} from './export-tokens.mjs';

await writeTokens('design/layout.json',exportLayout);
