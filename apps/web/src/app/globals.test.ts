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

function blend(foreground: string, background: string, opacity: number) {
  const channels = [1, 3, 5].map((start) => {
    const top = parseInt(foreground.slice(start, start + 2), 16);
    const bottom = parseInt(background.slice(start, start + 2), 16);
    return Math.round(top * opacity + bottom * (1 - opacity));
  });
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
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

  for (const [theme, tokens] of Object.entries(themes)) {
    it(`AC-1.6.4 ${theme}: brand reaches 3:1 as large text and as a fill under a label`, () => {
      expect(contrast(tokens.brand!, tokens.background!)).toBeGreaterThanOrEqual(3);
      expect(contrast(tokens.brand!, tokens.card!)).toBeGreaterThanOrEqual(3);
      expect(contrast(tokens['primary-foreground']!, tokens.brand!)).toBeGreaterThanOrEqual(3);
    });
  }

  for (const file of ['ui/Button.tsx', 'ui/BareButton.tsx']) {
    const source = readFileSync(join(__dirname, '../components', file), 'utf8');
    const opacity = Number(/hover:bg-primary\/(\d+)/.exec(source)?.[1]) / 100;

    for (const [theme, tokens] of Object.entries(themes)) {
      it(`AC-1.6.4 ${theme}: ${file} hover keeps primary-foreground at 4.5:1`, () => {
        expect(opacity).toBeGreaterThan(0);
        for (const surface of ['background', 'card']) {
          const hovered = blend(tokens.primary!, tokens[surface]!, opacity);
          expect(contrast(tokens['primary-foreground']!, hovered)).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }

  it('AC-1.6.4 uses the PRD §7.1 palette values', () => {
    expect(light).toMatchObject({
      background: '#faf8f5',
      card: '#f3efea',
      popover: '#f3efea',
      secondary: '#f3efea',
      muted: '#f3efea',
      foreground: '#1c1917',
      'card-foreground': '#1c1917',
      'popover-foreground': '#1c1917',
      'secondary-foreground': '#1c1917',
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
      'popover-foreground': '#eae6df',
      'secondary-foreground': '#eae6df',
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

const CLASS_LIST = /"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g;
const TEXT_BRAND = /^(\w+:)*text-brand$/;
const LARGE_TEXT = /^text-(2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)$/;
const SMALL_TEXT = /^(\w+:)*text-(xs|sm|base|lg|xl)$/;

// Each quoted string is one class list; a cn() call that splits the lists is judged per string.
function brandTextOffenders(source: string) {
  return [...source.matchAll(CLASS_LIST)]
    .map(([, double, single, template]) => (double ?? single ?? template ?? '').split(/\s+/))
    .filter((tokens) => tokens.some((token) => TEXT_BRAND.test(token)))
    .filter(
      (tokens) =>
        !tokens.some((token) => LARGE_TEXT.test(token)) ||
        tokens.some((token) => SMALL_TEXT.test(token)),
    )
    .map((tokens) => tokens.join(' '));
}

describe('brand colour use', () => {
  it('AC-1.6.4 the text-brand scan fails small text and passes large text', () => {
    expect(
      brandTextOffenders('<h2 className="text-2xl"><span className="text-brand text-xs">'),
    ).toHaveLength(1);
    expect(brandTextOffenders('<p className="text-brand">')).toHaveLength(1);
    expect(brandTextOffenders('cn("text-brand text-2xl md:text-sm")')).toHaveLength(1);
    expect(brandTextOffenders('<p className="text-2xl text-brand">')).toEqual([]);
    expect(
      brandTextOffenders("cn(\n  'text-3xl font-bold',\n  `text-brand md:text-4xl text-2xl`,\n)"),
    ).toEqual([]);
  });

  it('AC-1.6.4 text-brand appears only in class lists with text-2xl or larger', () => {
    const offenders = sourceFiles(join(__dirname, '..')).filter(
      (file) => brandTextOffenders(readFileSync(file, 'utf8')).length > 0,
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

describe('pointer cursor', () => {
  const rule = /(:is\([^{}]*\)):not\(([^{}]*)\)\s*\{\s*cursor:\s*pointer;\s*\}/.exec(css);

  it('a base-layer rule gives every kind of enabled control the pointer', () => {
    expect(rule, 'no `cursor: pointer` rule').not.toBeNull();
    for (const control of [
      'button',
      'summary',
      "[type='checkbox']",
      "[type='radio']",
      'label:has(',
      "[role='button']",
      "[role='tab']",
      "[role='radio']",
      "[role='switch']",
      "[role='menuitem']",
      "[role='menuitemcheckbox']",
      "[role='menuitemradio']",
      "[role='option']",
    ]) {
      expect(rule![1], control).toContain(control);
    }
  });

  it('the rule leaves disabled controls and text inputs alone', () => {
    expect(rule![2]).toContain(':disabled');
    expect(rule![2]).toContain("[aria-disabled='true']");
    expect(rule![2]).toContain('[data-disabled]');
    expect(rule![1]).not.toMatch(/\binput[,)\s]|textarea|\[type='text'\]/);
  });

  it('no component sets a cursor class the rule already provides', () => {
    const offenders = sourceFiles(join(__dirname, '..')).filter((file) =>
      /\bcursor-(pointer|default)\b/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
