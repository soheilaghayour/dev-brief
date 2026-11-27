import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'globals.css'), 'utf8');

function tokensOf(selector: string) {
  const block = css.slice(css.indexOf(`${selector} {`)).split('}')[0] ?? '';
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value?.trim()]),
  );
}

const light = tokensOf(':root');
const dark = tokensOf('.dark');

function luminance(hex: string) {
  const [red, green, blue] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

function contrast(foreground: string, background: string) {
  const [a, b] = [luminance(foreground), luminance(background)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const themes = { light, dark };

// [text token, surface token]: every pair a text colour appears on.
const textPairs = [
  ['foreground', 'background'],
  ['foreground', 'card'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['secondary-foreground', 'secondary'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'muted'],
  ['primary', 'background'],
  ['primary', 'card'],
  ['primary-foreground', 'primary'],
  ['primary', 'accent'],
  ['muted-foreground', 'accent'],
  ['accent-foreground', 'accent'],
  ['destructive-foreground', 'destructive'],
  ['destructive', 'background'],
  ['destructive', 'card'],
] as const;

describe('theme tokens', () => {
  it('AC-1.6.4 writes every colour token as hex', () => {
    for (const tokens of [light, dark]) {
      for (const [name, value] of Object.entries(tokens)) {
        expect(value, name).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/);
      }
    }
  });

  for (const [theme, tokens] of Object.entries(themes)) {
    for (const [text, surface] of textPairs) {
      it(`AC-1.6.4 ${theme}: ${text} on ${surface} reaches 4.5:1`, () => {
        expect(contrast(tokens[text]!, tokens[surface]!)).toBeGreaterThanOrEqual(4.5);
      });
    }

    it(`AC-1.6.4 ${theme}: no chart token equals primary or brand`, () => {
      for (let n = 1; n <= 5; n++) {
        expect(tokens[`chart-${n}`]).not.toBe(tokens.primary);
        expect(tokens[`chart-${n}`]).not.toBe(tokens.brand);
      }
    });

    it(`AC-1.6.4 ${theme}: chart lines reach 3:1 on the background and on cards`, () => {
      for (let n = 1; n <= 5; n++) {
        expect(contrast(tokens[`chart-${n}`]!, tokens.background!)).toBeGreaterThanOrEqual(3);
        expect(contrast(tokens[`chart-${n}`]!, tokens.card!)).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it('AC-1.6.4 light accent is not darker than the surface', () => {
    expect(luminance(light.accent!)).toBeGreaterThanOrEqual(luminance(light.card!));
  });

  it('AC-1.6.4 brand reaches 3:1 for large text in both themes', () => {
    expect(contrast(light.brand!, light.background!)).toBeGreaterThanOrEqual(3);
    expect(contrast(dark.brand!, dark.background!)).toBeGreaterThanOrEqual(3);
  });

  it('AC-1.6.4 uses the PRD §7.1 palette values', () => {
    expect(light).toMatchObject({
      background: '#faf8f5',
      card: '#f3efea',
      popover: '#f3efea',
      secondary: '#f3efea',
      muted: '#f3efea',
      foreground: '#1c1917',
      'card-foreground': '#1c1917',
      primary: '#c2410c',
      ring: '#c2410c',
      'primary-foreground': '#ffffff',
      brand: '#d94e1f',
    });
    expect(dark).toMatchObject({
      background: '#161514',
      card: '#1e1c1a',
      popover: '#1e1c1a',
      secondary: '#1e1c1a',
      muted: '#1e1c1a',
      foreground: '#eae6df',
      'card-foreground': '#eae6df',
      primary: '#f0643b',
      ring: '#f0643b',
      'primary-foreground': '#161514',
      brand: '#f0643b',
    });
  });

  it('AC-1.6.4 maps brand to a Tailwind colour', () => {
    expect(css).toContain('--color-brand: var(--brand);');
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const LARGE_TEXT = /(^|[\s"'`])text-(2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b/;
const TEXT_BRAND = /(^|[\s"'`:])text-brand\b/;

describe('brand colour use', () => {
  it('AC-1.6.4 text-brand appears only in class lists with text-2xl or larger', () => {
    const offenders = sourceFiles(join(__dirname, '..')).filter((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .some((line) => TEXT_BRAND.test(line) && !LARGE_TEXT.test(line)),
    );
    expect(offenders).toEqual([]);
  });

  it('AC-1.6.4 icon.svg uses the palette and no indigo', () => {
    const icon = readFileSync(join(__dirname, 'icon.svg'), 'utf8');
    expect(icon).toContain('#faf8f5');
    expect(icon).toContain(light.brand);
    expect(icon).not.toMatch(/#6366f1|#8b93ff/i);
  });
});
