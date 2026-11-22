import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/og', () => ({
  ImageResponse: class {
    constructor(public element: ReactNode) {}
  },
}));

const { default: OpenGraphImage, alt } = await import('./opengraph-image');

function textOf(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (node && typeof node === 'object' && 'props' in node)
    return textOf((node.props as { children?: ReactNode }).children);
  return '';
}

describe('opengraph image', () => {
  it('AC-L9 shows the hero line and describes it in the alt text', () => {
    const { element } = OpenGraphImage() as unknown as { element: ReactNode };
    expect(textOf(element)).toContain('Your morning tech scan in 5 minutes');
    expect(alt).toBe('DevBrief — Your morning tech scan in 5 minutes');
  });
});
