# Operations

Deploy, OAuth app setup, backups and the restore runbook. Nothing is deployed yet.

## OAuth apps

Sign-in uses a GitHub OAuth app and a Google OAuth client. Create one of each for local development and one of each for production; the callback URLs are `${APP_URL}/api/auth/callback/github` and `${APP_URL}/api/auth/callback/google`. The production domain is still a placeholder ([PRD §3.4 O2](prd.md#34-open-items)), so register the production apps once it is bought.

| Environment | `APP_URL`                                       | GitHub callback                                  | Google callback                                  |
| :---------- | :---------------------------------------------- | :----------------------------------------------- | :----------------------------------------------- |
| Local       | `http://localhost:3000`                         | `http://localhost:3000/api/auth/callback/github` | `http://localhost:3000/api/auth/callback/google` |
| Production  | `https://devbrief.dev` (placeholder, see above) | `https://devbrief.dev/api/auth/callback/github`  | `https://devbrief.dev/api/auth/callback/google`  |

### GitHub OAuth app

1. Open GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.
2. Set the homepage URL to `APP_URL` and the authorization callback URL to the GitHub callback above.
3. Generate a client secret. Copy the client ID and secret to `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.
4. The app requests only the `user:email` scope, which needs no setting on GitHub's side.

### Google OAuth client

1. Open Google Cloud Console → APIs & Services → OAuth consent screen, and configure an external app with the scopes `openid`, `email` and `profile`.
2. Under Credentials, create an OAuth client ID of type Web application.
3. Add `APP_URL` as an authorized JavaScript origin and the Google callback above as an authorized redirect URI.
4. Copy the client ID and secret to `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

### Other auth variables

- `BETTER_AUTH_SECRET`: 32+ random characters; generate with `openssl rand -base64 32`. Changing it signs every user out.
- `AUTH_TEST_MODE`: leave `false`. It exists for the Playwright run, and the API refuses to start with `true` in production or when `APP_URL` is not `localhost`, `127.0.0.1` or `::1`.
- `API_PROXY_URL`: leave unset for production builds. It bakes a dev `/api/*` rewrite into the web build; in production Traefik routes `/api`.

### Manual check with real credentials

With both apps registered and the variables set, run `pnpm dev` and check:

1. `/sign-in` → Continue with GitHub: GitHub's consent screen asks only for email addresses (`user:email`); after it you return to `/feed` signed in; the session cookie is `HttpOnly`, `Secure`, `SameSite=Lax` and has no `Domain`.
2. Sign out, then Continue with Google using an account with the same verified email: `/settings` shows both GitHub and Google as linked providers for one user.
3. A GitHub account whose primary email is unverified on GitHub is refused: `/sign-in` says to verify the email first, and no user or linked account is created.
