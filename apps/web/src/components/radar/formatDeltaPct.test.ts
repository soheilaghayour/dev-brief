import { describe, expect, it } from 'vitest';
import { formatDeltaPct } from './formatDeltaPct';

describe('formatDeltaPct', () => {
  it('shows a rise as ▲ with a plus and a fall as ▼ with a real minus sign', () => {
    expect(formatDeltaPct(12)).toEqual({ icon: '▲', text: '+12%' });
    expect(formatDeltaPct(-7.4)).toEqual({ icon: '▼', text: '−7%' });
  });

  it('rounds before choosing the direction, so -0.3 and 0 both read 0% with no arrow', () => {
    expect(formatDeltaPct(-0.3)).toEqual({ icon: '', text: '0%' });
    expect(formatDeltaPct(0)).toEqual({ icon: '', text: '0%' });
  });
});
