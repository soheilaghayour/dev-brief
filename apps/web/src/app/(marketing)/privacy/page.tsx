import { LegalPage } from '@/components/landing/LegalPage';

const ANTHROPIC_COMMERCIAL_TERMS_URL = 'https://www.anthropic.com/legal/commercial-terms';
const ANTHROPIC_PRIVACY_POLICY_URL = 'https://www.anthropic.com/legal/privacy';

export const metadata = { title: 'Privacy (Datenschutz)', alternates: { canonical: '/privacy' } };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy (Datenschutzerklärung)">
      <h2>Controller</h2>
      <p>[OPERATOR NAME], [POSTAL ADDRESS], [CONTACT EMAIL]. See the Impressum.</p>
      <h2>Browsing as a guest</h2>
      <p>
        You can read the feed without an account. Your saved stories, collections, notes, the tags
        and sources you follow or mute, hint dismissal and theme choice are stored in your
        browser&apos;s local storage, not on DevBrief&apos;s server. When you sign in, your saved
        stories, collections, notes, follows and mutes are moved to your account and removed from
        the browser. Your browser also keeps a random device id, which it sends only with AI
        requests (see below). No analytics, advertising or tracking cookies are used, which is why
        there is no cookie banner.
      </p>
      <h2>Signing in</h2>
      <p>
        If you sign in with GitHub or Google, we receive your name, verified email address and
        profile picture from that provider. We store them together with your saved stories,
        collections, notes, follows and mutes until you delete your account in the settings, which
        removes all of it. We store no passwords.
      </p>
      <h2>Cookies</h2>
      <p>
        After sign-in, one essential session cookie keeps you signed in. It is needed to provide the
        service and is deleted when you sign out or the session expires.
      </p>
      <h2>Processors and recipients</h2>
      <ul>
        <li>Hetzner Online GmbH hosts the servers and the database.</li>
        <li>
          Functional Software, Inc. (Sentry) receives error reports. IP addresses, cookies,
          authorization headers and the contents of the failed request are removed before sending.
        </li>
        <li>
          GitHub, Inc. and Google LLC handle the sign-in if you choose them. Their own privacy
          policies apply to that step.
        </li>
        <li data-recipient="anthropic">
          <p>
            Anthropic provides the AI model behind DevBrief&apos;s AI features. Each of these
            features is switched on separately. DevBrief sends Anthropic nothing for an AI feature
            that is switched off.
          </p>
          <p>What Anthropic receives, and why:</p>
          <ul>
            <li>
              <strong>Summaries and grouping of related stories.</strong> To write a story&apos;s
              summary, Anthropic receives the story&apos;s title, its Dev.to article text or
              excerpt, and public comments from Hacker News and Dev.to, without the commenters&apos;
              names. To decide whether two stories report the same event, it receives their titles,
              excerpts, websites and publication dates.
            </li>
            <li>
              DevBrief does not store the Dev.to article text or the comments it sends; it fetches
              them only to write the summary.
            </li>
            <li>
              <strong>Copilot.</strong> To answer a reader&apos;s question, Anthropic receives the
              question as typed, plus the titles, excerpts and summaries of the stories DevBrief
              retrieved for it, with public details such as their website, date, tags, and vote and
              comment counts.
            </li>
          </ul>
          <p>
            DevBrief does not send Anthropic your name, email address, account id, IP address or
            device id. The ids DevBrief uses to count daily usage limits stay on DevBrief&apos;s
            server. Your copilot question is sent exactly as you typed it, so don&apos;t put
            personal details in it.
          </p>
          <p>How long DevBrief keeps this data:</p>
          <ul>
            <li>
              Summaries and clustering results are kept with their story. A story is deleted 90 days
              after publication unless someone has saved it to their account.
            </li>
            <li>
              Copilot questions and answers are deleted after 30 days, or earlier when the signed-in
              reader who asked deletes their account. A guest&apos;s question is stored with a
              scrambled code (a hash) made from the IP address and device id, not with the address
              or id itself.
            </li>
            <li>
              DevBrief keeps a usage record of each AI request for 400 days, to track spending. It
              holds the date, the feature, the model, the amount of text processed (token counts),
              the cost, the id of the story or copilot question it was for, and, for a signed-in
              reader&apos;s request, the account id. It contains none of the text that was sent.
              Deleting your account removes the account id from these records.
            </li>
          </ul>
          <p>
            This page does not describe what Anthropic does with the data it receives. Anthropic
            publishes its{' '}
            <a href={ANTHROPIC_COMMERCIAL_TERMS_URL} className="underline">
              Commercial Terms of Service
            </a>{' '}
            and its{' '}
            <a href={ANTHROPIC_PRIVACY_POLICY_URL} className="underline">
              Privacy Policy
            </a>
            .
          </p>
        </li>
      </ul>
      <h2>IP addresses and usage limits</h2>
      <p>
        For abuse protection, requests are limited per IP address. Per-minute limits count requests
        in the server&apos;s memory only and are never written to the database. DevBrief&apos;s
        database never stores your IP address: the daily limits for AI features store only a
        scrambled code (a hash) made from it with a key that changes every day, so the same address
        gives a different code each day. The daily counters also hold your account id if you are
        signed in, or the device id if you are a guest. They are deleted after 7 days.
      </p>
      <h2>Your rights</h2>
      <p>
        You can request access, correction, deletion, restriction and export of your data, object to
        processing and complain to a supervisory authority. Contact: [CONTACT EMAIL].
      </p>
    </LegalPage>
  );
}
