import { Output } from 'ai';
import { describe, expect, it } from 'vitest';
import { StorySummaryLlmSchema } from '../llm/prompts/storySummary.v2.js';
import { noQuotationSchema, summaryRequest } from './summaryRequest.js';

const COPIED = 'the macro trick is clever but it breaks as soon as a member needs a default';
const SOURCES = [`Intro. ${COPIED}. Outro.`, 'A different comment about something else entirely.'];

const clean = {
  tldr: [
    'Designated initializers let C callers name their arguments.',
    'A macro wraps a struct literal, so omitted fields default to zero.',
    'Commenters weigh clearer call sites against default-value limits.',
  ],
  consensus: { verdict: 'mixed', pros: ['Clear call sites.'], cons: ['Only zero defaults.'] },
};

describe('noQuotationSchema', () => {
  const schema = noQuotationSchema(SOURCES);

  it('AC-2.3.10 accepts a paraphrase', () => {
    expect(schema.safeParse(clean).success).toBe(true);
    expect(schema.safeParse({ ...clean, consensus: null }).success).toBe(true);
  });

  it('AC-2.3.10 fails a TL;DR point, a pro or a con that repeats 8 or more consecutive words of a source', () => {
    const eight = COPIED.split(' ').slice(0, 8).join(' ');
    const seven = COPIED.split(' ').slice(0, 7).join(' ');
    const quoted = (words: string) => `Commenters say ${words}, apparently.`;
    const withTldr = { ...clean, tldr: [quoted(eight), ...clean.tldr.slice(1)] };
    const withPro = { ...clean, consensus: { ...clean.consensus, pros: [quoted(eight)] } };
    const withCon = { ...clean, consensus: { ...clean.consensus, cons: [quoted(eight)] } };

    for (const output of [withTldr, withPro, withCon]) {
      expect(schema.safeParse(output).success).toBe(false);
    }
    const sevenWords = { ...clean, tldr: [quoted(seven), ...clean.tldr.slice(1)] };
    expect(schema.safeParse(sevenWords).success).toBe(true);
  });

  it('AC-2.3.10 sends the provider the same JSON schema as without the check', async () => {
    const sent = (candidate: typeof schema | typeof StorySummaryLlmSchema) =>
      Output.object({ schema: candidate }).responseFormat;

    expect(await sent(schema)).toEqual(await sent(StorySummaryLlmSchema));
  });
});

describe('summaryRequest', () => {
  const thread = [{ text: 'a comment that is a few words and more', children: [] }];

  it('AC-2.3.10 compares a TL;DR point with the text and the comments, but not the title', () => {
    const title = 'a very long title that a first point may restate word for word here';
    const request = summaryRequest({
      title,
      text: 'the article body says something quite different from the rest',
      threads: [thread],
    });
    const restatesTitle = { ...clean, tldr: [title, ...clean.tldr.slice(1)] };
    const restatesText = {
      ...clean,
      tldr: [
        'the article body says something quite different from the rest',
        ...clean.tldr.slice(1),
      ],
    };
    const restatesComment = {
      ...clean,
      tldr: [...clean.tldr.slice(0, 2), 'a comment that is a few words and more, as one put it'],
    };

    expect(request.schema.safeParse(restatesTitle).success).toBe(true);
    expect(request.schema.safeParse(restatesText).success).toBe(false);
    expect(request.schema.safeParse(restatesComment).success).toBe(false);
  });

  it('AC-2.3.10 compares against the text the prompt carries, not its unseen tail', () => {
    const tailOnly = 'tail words one two three four five six seven eight';
    const text = `${'filler '.repeat(8_000)}${tailOnly}`;
    const request = summaryRequest({ title: 'Title', text, threads: [] });
    const copiesTail = { ...clean, tldr: [`They wrote ${tailOnly} again`, ...clean.tldr.slice(1)] };
    const head = 'filler '.repeat(8);
    const copiesHead = { ...clean, tldr: [`They wrote ${head}again`, ...clean.tldr.slice(1)] };

    expect(request.prompt).not.toContain('tail words');
    expect(request.schema.safeParse(copiesTail).success).toBe(true);
    expect(request.schema.safeParse(copiesHead).success).toBe(false);
  });

  it('AC-2.3.10 allows a first point that restates the title the text begins with', () => {
    const title = 'Designated initializers give C callers named arguments without new syntax';
    const request = summaryRequest({ title, text: `${title}. More follows.`, threads: [] });

    const restated = { ...clean, tldr: [title, ...clean.tldr.slice(1)] };

    expect(request.schema.safeParse(restated).success).toBe(true);
  });

  it('AC-2.3.10 keeps sources separate: a run never spans the text and a comment', () => {
    const request = summaryRequest({
      title: 'T',
      text: 'alpha beta gamma delta',
      threads: [[{ text: 'epsilon zeta eta theta', children: [] }]],
    });
    const spanning = {
      ...clean,
      tldr: ['alpha beta gamma delta epsilon zeta eta theta', ...clean.tldr.slice(1)],
    };

    expect(request.schema.safeParse(spanning).success).toBe(true);
  });

  it('AC-2.3.10 checks a 2 MB text in well under 50 ms', () => {
    const text = 'lorem ipsum dolor sit amet '.repeat(80_000);
    const started = performance.now();
    summaryRequest({ title: 'T', text, threads: [] }).schema.safeParse(clean);

    expect(performance.now() - started).toBeLessThan(50);
  });
});
