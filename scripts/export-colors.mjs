import {exportLightColors} from '../src/color-export.mjs';
import {writeTokens} from './export-tokens.mjs';

await writeTokens('design/colors.json',exportLightColors);
