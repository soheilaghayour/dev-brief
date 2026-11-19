import { Header } from '@nestjs/common';

/** Public reads: cacheable by browsers and the proxy. */
export const PublicCache = () =>
  Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');

/** Authenticated and personal responses: never stored. */
export const PrivateNoStore = () => Header('Cache-Control', 'private, no-store');
