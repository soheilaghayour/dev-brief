import { describe, expect, it } from 'vitest';
import { EXCERPT_MAX_LENGTH, toPlainText } from './plainText.js';

describe('toPlainText', () => {
  it('strips tags, scripts and comments and collapses whitespace', () => {
    expect(
      toPlainText(
        '<p>Hello <b>big</b>\n\n world</p><script>alert(1)</script><!-- x --><style>p{}</style>',
      ),
    ).toBe('Hello big world');
  });

  it('decodes entities once and strips markup they reveal', () => {
    expect(toPlainText('Tom &amp; Jerry &#8217;s &#x41; &nbsp;done')).toBe('Tom & Jerry ’s A done');
    expect(toPlainText('&lt;img src=x onerror=alert(1)&gt;text')).toBe('text');
    expect(toPlainText('&amp;lt;')).toBe('&lt;');
  });

  it('keeps an unknown or out-of-range entity as written', () => {
    expect(toPlainText('&bogus; &#1114112;')).toBe('&bogus; &#1114112;');
  });

  it('cuts to the limit with an ellipsis inside it', () => {
    const text = toPlainText('a'.repeat(900), EXCERPT_MAX_LENGTH);
    expect([...text]).toHaveLength(EXCERPT_MAX_LENGTH);
    expect(text.endsWith('…')).toBe(true);
    expect(toPlainText('short', EXCERPT_MAX_LENGTH)).toBe('short');
  });
});
