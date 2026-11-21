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
});
