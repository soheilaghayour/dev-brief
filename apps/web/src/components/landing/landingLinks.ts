export const REPO_URL = 'https://github.com/soheilaghayour/dev-brief';
export const PRD_URL = `${REPO_URL}/blob/main/docs/prd.md`;
export const RANKING_FORMULA_URL = `${PRD_URL}#appendix-b--ranking-formula`;
export const CHANGELOG_URL = `${REPO_URL}/blob/main/docs/changelog.md`;
export const API_DOCS_PATH = '/api/v1/docs';
/** The feed's sidebar shows every source's health. */
export const SOURCE_STATUS_PATH = '/feed#source-status';
export const SIGN_IN_PATH = `/sign-in?callbackURL=${encodeURIComponent('/feed')}`;

type NavLink = {
  label: string;
  href: string;
};

const NAV_LINKS: readonly NavLink[] = [
  { label: 'Feed', href: '/feed' },
  { label: 'Radar', href: '/radar' },
  { label: 'GitHub', href: REPO_URL },
];

export function getLandingNav() {
  return NAV_LINKS;
}
