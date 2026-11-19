const STRIPPED_PARAMS = new Set(['ref', 'fbclid', 'gclid']);

function isTrackingParam(name: string) {
  const lowerName = name.toLowerCase();
  return lowerName.startsWith('utm_') || STRIPPED_PARAMS.has(lowerName);
}

function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Returns the identity of a URL: tracking params, `www.`, trailing slash and fragment removed, host lowercased, query sorted. */
export function canonicalizeUrl(rawUrl: string) {
  const url = new URL(rawUrl.trim());

  const params = [...url.searchParams].filter(([name]) => !isTrackingParam(name));
  // Sorting by value too gives repeated keys (`a=2&a=1`) one fixed order.
  params.sort(
    ([nameA, valueA], [nameB, valueB]) => compare(nameA, nameB) || compare(valueA, valueB),
  );
  const query = new URLSearchParams(params).toString();

  const host = url.host.replace(/^www\./, '');
  const path = url.pathname.replace(/\/+$/, '');

  return `${url.protocol}//${host}${path}${query ? `?${query}` : ''}`;
}
