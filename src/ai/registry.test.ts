import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { STANDARD_CATEGORY_IDS } from '../categorise';
import { toLiteRt, toolSpecs } from './registry';

// The tools the model sees must be the lab's, byte for byte: the JSON LiteRT-LM
// built from tools.py (round 8) for a budget with the nine standard categories.

const lab = JSON.parse(new TextDecoder().decode(readFileSync('src/test-fixtures/aiLabTools.json')));

describe('toLiteRt', () => {
  it('is the lab\'s tool JSON for the standard categories', () => {
    expect(toolSpecs(STANDARD_CATEGORY_IDS.map(id => ({ id }))).map(toLiteRt)).toEqual(lab);
  });
});
