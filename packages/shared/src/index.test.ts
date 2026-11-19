import { describe, expect, it } from 'vitest';
import * as shared from './index.js';

describe('@devbrief/shared', () => {
  it('loads its entry point', () => {
    expect(shared).toBeTypeOf('object');
  });
});
