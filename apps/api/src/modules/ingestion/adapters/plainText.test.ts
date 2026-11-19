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

  it('decodes named HTML entities beyond the XML five', () => {
    expect(toPlainText('<p>It&rsquo;s &hellip; &mdash; done</p>')).toBe('It’s … — done');
  });

  it('keeps an unknown entity as written and replaces an out-of-range one', () => {
    expect(toPlainText('&bogus; &#1114112;')).toBe('&bogus; �');
  });

  it('keeps text that only looks like markup', () => {
    expect(toPlainText('Why a < b and c > d matters')).toBe('Why a < b and c > d matters');
    expect(toPlainText('x<5 and y>3')).toBe('x<5 and y>3');
  });

  it('drops the body of an unclosed script and keeps words apart', () => {
    expect(toPlainText('before<script>never closed <b>x</b> rest')).toBe('before');
    expect(toPlainText('<p>one</p><p>two</p>')).toBe('one two');
  });

  it('cuts to the limit with an ellipsis inside it', () => {
    const text = toPlainText('a'.repeat(900), EXCERPT_MAX_LENGTH);
    expect([...text]).toHaveLength(EXCERPT_MAX_LENGTH);
    expect(text.endsWith('…')).toBe(true);
    expect(toPlainText('short', EXCERPT_MAX_LENGTH)).toBe('short');
  });
});
