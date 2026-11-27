import { ImageResponse } from 'next/og';

export const alt = 'DevBrief — Your morning tech scan in 5 minutes';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// These mirror the light tokens in globals.css; Satori can't read CSS variables.
const BACKGROUND = '#faf8f5';
const FOREGROUND = '#1c1917';
const MUTED_FOREGROUND = '#57534e';
const BRAND = '#d94e1f';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 80,
        background: BACKGROUND,
        color: FOREGROUND,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 36, color: BRAND }}>
        <div style={{ width: 28, height: 28, background: BRAND, transform: 'rotate(45deg)' }} />
        <span style={{ color: FOREGROUND, fontWeight: 600 }}>DevBrief</span>
      </div>
      <div
        style={{
          fontSize: 88,
          fontWeight: 700,
          lineHeight: 1.05,
          marginTop: 40,
          letterSpacing: -2,
        }}
      >
        Your morning tech scan in 5 minutes
      </div>
      <div style={{ fontSize: 34, marginTop: 36, color: MUTED_FOREGROUND }}>
        Hacker News, Dev.to and GitHub. One fair ranking.
      </div>
    </div>,
    size,
  );
}
