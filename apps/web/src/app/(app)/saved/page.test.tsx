import { isValidElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LazyCollectionsSidebar } from '@/components/collections/LazyCollectionsSidebar';
import SavedPage from './page';

const flag = vi.hoisted(() => ({ collections: false }));
vi.mock('@/config/features', () => ({ isFeatureEnabled: () => flag.collections }));
vi.mock('@/components/collections/LazyCollectionsSidebar', () => ({
  LazyCollectionsSidebar: () => null,
}));
vi.mock('@/components/saves/SavedList', () => ({ SavedList: () => null }));

function contains(node: ReactNode, type: unknown): boolean {
  if (Array.isArray(node)) return node.some((child) => contains(child, type));
  if (!isValidElement<{ children?: ReactNode }>(node)) return false;
  return node.type === type || contains(node.props.children, type);
}

describe('/saved', () => {
  it('AC-3.4.1 has no collections sidebar while the collections flag is off', () => {
    flag.collections = false;
    expect(contains(SavedPage(), LazyCollectionsSidebar)).toBe(false);
  });

  it('AC-3.4.1 has the collections sidebar while the flag is on', () => {
    flag.collections = true;
    expect(contains(SavedPage(), LazyCollectionsSidebar)).toBe(true);
  });
});
