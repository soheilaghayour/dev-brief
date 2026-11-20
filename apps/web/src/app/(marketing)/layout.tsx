import type { ReactNode } from 'react';
import { LazyToaster } from '@/components/layout/LazyToaster';
import { SiteFooter } from '@/components/landing/SiteFooter';
import { SiteHeader } from '@/components/landing/SiteHeader';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col text-base">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter year={new Date().getFullYear()} />
      {/* Deleting an account toasts, then navigates here. */}
      <LazyToaster />
    </div>
  );
}
