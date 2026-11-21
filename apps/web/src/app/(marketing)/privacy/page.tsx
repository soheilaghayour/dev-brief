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
        You can read the feed without an account. Your saved stories, hint dismissal and theme
        choice are stored in your browser&apos;s local storage, not on our server. If you sign in,
        your saved stories are copied to your account. No analytics, advertising or tracking cookies
        are used, which is why there is no cookie banner.
      </p>
      <h2>Signing in</h2>
      <p>
        If you sign in with GitHub or Google, we receive your name, verified email address and
        profile picture from that provider. We store them together with your saved stories until you
        delete your account in the settings, which removes all of it. We store no passwords.
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
          Functional Software, Inc. (Sentry) receives error reports. Personal data such as IP
          addresses, cookies and authorization headers is removed before sending.
        </li>
        <li>
          GitHub, Inc. and Google LLC handle the sign-in if you choose them. Their own privacy
          policies apply to that step.
        </li>
        <li data-recipient="anthropic">
          <p>
            Anthropic provides the AI model behind DevBrief&apos;s AI features. Each of these
            features is switched on separately, and DevBrief sends Anthropic nothing for a feature
            that is off.
          </p>
          <p>What Anthropic receives, and why:</p>
          <ul>
            <li>
              <strong>Summaries and clustering.</strong> To write a story&apos;s summary, Anthropic
              receives the story&apos;s title, its Dev.to article text or excerpt, and public
              comments from Hacker News and Dev.to, without the commenters&apos; names. To decide
              whether two stories report the same event, it receives their titles, excerpts,
              websites and publication dates.
            </li>
            <li>
              <strong>Copilot.</strong> To answer a reader&apos;s question, Anthropic receives the
              question as typed, plus the titles, excerpts and summaries of the stories DevBrief
              retrieved for it, with public details such as their website, date, tags, and vote and
              comment counts.
            </li>
          </ul>
          <p>
            Anthropic never receives your account data (name, email), your IP address or your device
            id. The identifiers DevBrief uses to count daily usage limits stay on DevBrief&apos;s
            server.
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
              one-way hash instead of the IP address or device id.
            </li>
            <li>
              A usage record of each AI request is kept for 400 days to track spending. It holds the
              feature, token counts and cost, and for a signed-in reader&apos;s request the account
              id. It contains no text.
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
      <h2>Server logs and IP addresses</h2>
      <p>
        For abuse protection, requests are rate-limited per client. Per-minute limits keep their
        counters in the server&apos;s memory only. DevBrief&apos;s database never stores your IP
        address itself: the daily limits for AI features store only a salted hash of it, and the
        salt changes every day. A guest&apos;s daily counters also hold the random device id that
        the browser creates and sends with AI requests. Daily counters are deleted after 7 days.
      </p>
      <h2>Your rights</h2>
      <p>
        You can request access, correction, deletion, restriction and export of your data, object to
        processing and complain to a supervisory authority. Contact: [CONTACT EMAIL].
      </p>
    </LegalPage>
  );
}
