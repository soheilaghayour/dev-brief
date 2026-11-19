import { formatRelativeTime } from '@/lib/format/formatRelativeTime';

type RelativeTimeProps = { iso: string; style?: 'short' | 'long' };

export function RelativeTime({ iso, style = 'short' }: RelativeTimeProps) {
  return (
    // The server and the browser render seconds apart, so the text may differ at a unit boundary.
    <time dateTime={iso} title={new Date(iso).toUTCString()} suppressHydrationWarning>
      {formatRelativeTime(iso, new Date(), style)}
    </time>
  );
}
