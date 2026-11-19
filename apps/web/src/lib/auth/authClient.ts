import { createAuthClient } from 'better-auth/client';

// No baseURL: the browser calls /api/auth on the app's own origin, which the proxy routes to the API.
export const authClient = createAuthClient();
