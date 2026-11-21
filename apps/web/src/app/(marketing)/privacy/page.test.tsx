// @vitest-environment jsdom
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as privacyModule from './page';

const PrivacyPage = privacyModule.default;

// Legal claims the owner can't back: no DPA, certification, transfer mechanism or legal conclusion.
const FORBIDDEN_CLAIMS = [
  /\bDPA\b/i,
  /data processing/i,
  /Auftragsverarbeit/i,
  /\bAVV\b/,
  /Data Privacy Framework/i,
  /standard contractual clauses/i,
  /\bSCCs?\b/i,
  /transfer mechanism/i,
  /complian(t|ce)/i,
  /certif(ied|ication)/i,
  /\blawful/i,
  /legal basis/i,
  /Art\.\s*\d/i,
];

function renderPage() {
  const page = document.createElement('div');
  page.innerHTML = renderToStaticMarkup(<PrivacyPage />);
  return page;
}

function anthropicEntry(page = renderPage()) {
  const entry = page.querySelector('li[data-recipient="anthropic"]');
  if (!entry) throw new Error('No Anthropic entry in the recipient list');
  return entry;
}

describe('PrivacyPage', () => {
  it('AC-L11 lists Anthropic as a recipient with what it receives for summaries, clustering and the copilot', () => {
    const page = renderPage();
    const recipients = page.querySelector('h2 + ul');
    expect(recipients?.previousElementSibling?.textContent).toBe('Processors and recipients');
    const entry = anthropicEntry(page);
    expect(entry.parentElement).toBe(recipients);

    const text = entry.textContent ?? '';
    expect(text).toContain('Anthropic provides the AI model');
    expect(text).toMatch(
      /Summaries and clustering\..*title, its Dev\.to article text or excerpt, and public comments from Hacker News and Dev\.to/,
    );
    expect(text).toMatch(
      /Copilot\..*the question as typed, plus the titles, excerpts and summaries/,
    );
  });

  it('AC-L11 says that no account data, IP address or device id is sent', () => {
    expect(anthropicEntry().textContent).toContain(
      'Anthropic never receives your account data (name, email), your IP address or your device id.',
    );
  });

  it('AC-L11 states how long DevBrief keeps summaries, copilot questions and the usage record', () => {
    const text = anthropicEntry().textContent ?? '';
    expect(text).toMatch(/Summaries .* kept with their story\. A story is deleted 90 days/);
    expect(text).toContain('Copilot questions and answers are deleted after 30 days');
    expect(text).toMatch(/usage record .* kept for 400 days.* It contains no text\./);
  });

  it("AC-L11 links to Anthropic's Commercial Terms and Privacy Policy on anthropic.com", () => {
    const links = [...anthropicEntry().querySelectorAll('a')].map((link) => ({
      name: link.textContent,
      host: new URL(link.href).host,
    }));
    expect(links).toEqual([
      { name: 'Commercial Terms of Service', host: 'www.anthropic.com' },
      { name: 'Privacy Policy', host: 'www.anthropic.com' },
    ]);
  });

  it('AC-L11 makes no claim about a DPA, certifications or transfer mechanisms, and draws no legal conclusion', () => {
    const pageText = renderPage().textContent ?? '';
    for (const claim of FORBIDDEN_CLAIMS) expect(pageText).not.toMatch(claim);
    // "Processor" is a legal classification that assumes a DPA; the heading above the list may keep it.
    expect(anthropicEntry().textContent).not.toMatch(/processor/i);
  });

  it('AC-L8 stays statically rendered: a synchronous page with no dynamic route config', () => {
    expect(isValidElement(PrivacyPage())).toBe(true);
    expect(privacyModule).not.toHaveProperty('dynamic');
    expect(privacyModule).not.toHaveProperty('revalidate');
  });
});
