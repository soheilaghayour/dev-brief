/** The sign-in link that brings the user back to the page they are on. */
export function signInHref(path: string) {
  return `/sign-in?callbackURL=${encodeURIComponent(path)}`;
}
