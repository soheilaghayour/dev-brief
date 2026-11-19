const DEFAULT_CALLBACK_URL = '/feed';

/** Returns the callbackURL when it is a same-origin relative path, else `/feed`, so sign-in cannot redirect off-site. */
export function safeCallbackUrl(callbackUrl: string | null | undefined) {
  if (!callbackUrl) return DEFAULT_CALLBACK_URL;
  // `//host` and `/\host` are protocol-relative URLs to browsers; control characters can hide a scheme.
  const isRelativePath =
    callbackUrl.startsWith('/') &&
    !callbackUrl.startsWith('//') &&
    !callbackUrl.startsWith('/\\') &&
    // eslint-disable-next-line no-control-regex
    !/[\u0000-\u001f\u007f]/.test(callbackUrl);
  return isRelativePath ? callbackUrl : DEFAULT_CALLBACK_URL;
}
