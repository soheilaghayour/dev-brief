import { TAXONOMY, type TagDefinition, type TagSlug } from './taxonomy.js';

const MAX_TAGS = 5;

interface TagStoryInput {
  title: string;
  url: string;
  sourceTags: readonly string[];
  categories: readonly string[];
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// `.` counts as a word character inside a token ("node.js") but not at its end ("I like js.").
const WORD_START = '(?<![a-zA-Z0-9_]|[a-zA-Z0-9_]\\.)';
const WORD_END = '(?![a-zA-Z0-9_]|\\.[a-zA-Z0-9_])';

const matcherCache = new Map<string, RegExp>();

/** Whole-word matcher, compiled once per alias; a boundary is added only on a side where the alias starts or ends with a word character, so "Go 1." matches "Go 1.24". */
function wordMatcher(alias: string) {
  let matcher = matcherCache.get(alias);
  if (!matcher) {
    const start = /^\w/.test(alias) ? WORD_START : '';
    const end = /\w$/.test(alias) ? WORD_END : '';
    // URL slugs join words with "-" or "_": "rust-belt" is the phrase "rust belt".
    const phrase = escapeRegExp(alias).replace(/[ -]/g, '[\\s_-]');
    matcher = new RegExp(`${start}${phrase}${end}`);
    matcherCache.set(alias, matcher);
  }
  return matcher;
}

// Dev.to tags carry no separators ("reactnative"), so separators are dropped on both sides.
function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function urlTokens(rawUrl: string) {
  if (!URL.canParse(rawUrl)) return '';
  const { hostname, pathname } = new URL(rawUrl);
  return [hostname.replace(/^www\./, ''), ...pathname.split('/')].join(' ');
}

function matchesInText(definition: TagDefinition, title: string, text: string) {
  const hasWord = (alias: string) => wordMatcher(alias).test(text);
  return (
    definition.aliases.some(hasWord) ||
    (definition.caseSensitiveAliases ?? []).some((alias) => wordMatcher(alias).test(title)) ||
    (definition.conditionalAliases ?? []).some(
      ({ alias, requiresAny }) => hasWord(alias) && requiresAny.some(hasWord),
    ) ||
    (definition.patterns ?? []).some((pattern) => new RegExp(pattern).test(text))
  );
}

function matchesSourceTag(definition: TagDefinition, sourceTagSlugs: ReadonlySet<string>) {
  const slugs = [
    ...definition.aliases,
    ...(definition.caseSensitiveAliases ?? []),
    ...(definition.sourceTagOnlyAliases ?? []),
  ].map(slugify);
  return slugs.some((slug) => sourceTagSlugs.has(slug));
}

function isExcluded(definition: TagDefinition, text: string) {
  return (definition.exclude ?? []).some((phrase) => wordMatcher(phrase).test(text));
}

/** Returns the taxonomy tags for a story: deduplicated, in taxonomy order, at most 5. */
export function tagStory(input: TagStoryInput): TagSlug[] {
  const title = input.title.replace(/\s+/g, ' ');
  const text = `${title} ${urlTokens(input.url)}`.toLowerCase();
  const sourceTagSlugs = new Set([...input.sourceTags, ...input.categories].map(slugify));

  return TAXONOMY.filter(
    (definition) =>
      !isExcluded(definition, text) &&
      (matchesInText(definition, title, text) || matchesSourceTag(definition, sourceTagSlugs)),
  )
    .map((definition) => definition.slug)
    .slice(0, MAX_TAGS);
}
