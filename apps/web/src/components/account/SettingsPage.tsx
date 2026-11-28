'use client';

import { toast } from 'sonner';
import { FeedPreferencesSection } from '@/components/preferences/FeedPreferencesSection';
import { Button } from '@/components/ui/Button';
import { useMe } from '@/lib/auth/useMe';
import { clearGuestData } from '@/lib/guest/clear';
import { AccountSection } from './AccountSection';
import { AppearanceSection } from './AppearanceSection';

export function SettingsPage() {
  const { data: user, isPending } = useMe();

  function clearLocalData() {
    clearGuestData();
    toast.success('Local data cleared.');
  }

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
      <AppearanceSection />
      <FeedPreferencesSection />
      {isPending ? null : user ? (
        <AccountSection user={user} />
      ) : (
        <section aria-labelledby="local-data-heading" className="flex flex-col gap-3">
          <h2 id="local-data-heading" className="text-sm font-medium">
            Local data
          </h2>
          <p className="text-muted-foreground text-sm">
            As a guest, your saves and feed preferences stay on this device.
          </p>
          <div>
            <Button variant="outline" onClick={clearLocalData}>
              Clear local data
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
