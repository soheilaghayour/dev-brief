import type { ReactNode } from 'react';
import { PendingToast } from '@/components/landing/PendingToast';
import { SiteFooter } from '@/components/landing/SiteFooter';
import { SiteHeader } from '@/components/landing/SiteHeader';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col text-base">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter year={new Date().getFullYear()} />
      {/* Deleting an account navigates here with its toast pending. */}
      <PendingToast />
    </div>
  );
}
