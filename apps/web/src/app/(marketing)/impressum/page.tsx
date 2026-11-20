import { LegalPage } from '@/components/landing/LegalPage';

export const metadata = { title: 'Impressum', alternates: { canonical: '/impressum' } };

export default function ImpressumPage() {
  return (
    <LegalPage title="Impressum">
      <h2>Information according to § 5 DDG</h2>
      <p>
        [OPERATOR NAME]
        <br />
        [POSTAL ADDRESS]
      </p>
      <h2>Contact</h2>
      <p>Email: [CONTACT EMAIL]</p>
      <h2>Responsible for content according to § 18 (2) MStV</h2>
      <p>[OPERATOR NAME], [POSTAL ADDRESS]</p>
      <h2>Disclaimer</h2>
      <p>
        DevBrief links to articles on third-party sites and shows their titles and short excerpts.
        The linked content is the responsibility of its publishers.
      </p>
    </LegalPage>
  );
}
