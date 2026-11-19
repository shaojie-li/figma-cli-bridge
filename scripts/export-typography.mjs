import {exportTypography} from '../src/typography-export.mjs';
import {writeTokens} from './export-tokens.mjs';

await writeTokens('design/typography.json',exportTypography);
