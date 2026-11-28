import type { ReactNode } from 'react';
import { NavLinks } from './NavLinks';

/** The sidebar body, shown in the desktop column and inside the mobile sheet. */
export function SidebarContent({ filters }: { filters?: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col gap-4 p-3">
      <NavLinks />
      <div className="flex-1">{filters}</div>
    </div>
  );
}
