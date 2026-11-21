import type { CopilotQuota } from '@devbrief/shared';

/** How many questions are left today; nothing until the quota is known. */
export function QuotaBadge({ quota }: { quota: CopilotQuota | null }) {
  if (!quota) return null;
  return (
    <span className="text-muted-foreground text-xs tabular-nums">
      {quota.remaining}/{quota.limit} left
    </span>
  );
}
