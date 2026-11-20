import { LegalPage } from '@/components/landing/LegalPage';

export const metadata = { title: 'Privacy (Datenschutz)', alternates: { canonical: '/privacy' } };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy (Datenschutzerklärung)">
      <h2>Controller</h2>
      <p>[OPERATOR NAME], [POSTAL ADDRESS], [CONTACT EMAIL]. See the Impressum.</p>
      <h2>Browsing as a guest</h2>
      <p>
        You can read the feed without an account. Your saved stories, hint dismissal and theme
        choice are stored in your browser&apos;s local storage and never sent to us. No analytics,
        advertising or tracking cookies are used, which is why there is no cookie banner.
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
      </ul>
      <h2>Server logs and IP addresses</h2>
      <p>
        For abuse protection, requests are rate-limited per client. The limiter stores only a salted
        hash of your IP address, rotated daily, never the address itself.
      </p>
      <h2>Your rights</h2>
      <p>
        You can request access, correction, deletion, restriction and export of your data, object to
        processing and complain to a supervisory authority. Contact: [CONTACT EMAIL].
      </p>
    </LegalPage>
  );
}
