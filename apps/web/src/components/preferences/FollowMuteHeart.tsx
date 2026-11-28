import { HeartIcon, HeartOffIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { PreferenceMode } from '@/lib/guest/preferences';
import { nextMode } from './heartMode';

// Three shapes (outline, filled, crossed), so the state never rests on colour alone.
const STATES = {
  none: {
    Icon: HeartIcon,
    iconClass: 'text-muted-foreground',
    status: 'not followed',
    action: 'follow',
  },
  follow: {
    Icon: HeartIcon,
    iconClass: 'fill-brand stroke-brand',
    status: 'following',
    action: 'mute',
  },
  mute: { Icon: HeartOffIcon, iconClass: 'text-foreground', status: 'muted', action: 'clear' },
} as const satisfies Record<PreferenceMode | 'none', object>;

type FollowMuteHeartProps = {
  /** The tag's or source's name, which the accessible name starts with. */
  label: string;
  mode: PreferenceMode | null;
  onChange: (mode: PreferenceMode | null) => void;
  disabled?: boolean;
};

/** The one control that follows or mutes a tag or a source: each click moves to the next state. */
export function FollowMuteHeart({ label, mode, onChange, disabled }: FollowMuteHeartProps) {
  const { Icon, iconClass, status, action } = STATES[mode ?? 'none'];

  function cycle() {
    onChange(nextMode(mode));
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-6"
      aria-label={`${label}: ${status}. Click to ${action}.`}
      disabled={disabled}
      onClick={cycle}
    >
      <Icon className={iconClass} aria-hidden="true" />
    </Button>
  );
}
