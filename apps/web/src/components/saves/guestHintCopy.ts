import { isFeatureEnabled, type Features } from '@/config/features';

/** What follows "Sign in" in the guest hint; Phase 3 adds what else syncs (PRD §2.2). */
export function guestHintSyncText(features?: Features) {
  return isFeatureEnabled('collections', features)
    ? 'to sync anywhere, including collections and notes.'
    : 'to sync anywhere.';
}
