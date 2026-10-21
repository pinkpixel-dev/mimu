export interface GithubConfig {
  clientId: string;
  clientSecret: string;
}

export interface GithubUser {
  id: string;
  login: string;
}

/** No scopes: Mimu only needs the user's numeric id and login, which every OAuth token can read. */
export function githubAuthorizeUrl(config: GithubConfig, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    state,
    allow_signup: "true",
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

/** Swap the callback's `code` for the GitHub user it belongs to. The access token is used once and dropped. */
export async function fetchGithubUser(config: GithubConfig, code: string, redirectUri: string): Promise<GithubUser> {
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const token = (await tokenResponse.json()) as { access_token?: string; error?: string };
  if (!token.access_token) throw new Error(`GitHub token exchange failed: ${token.error ?? tokenResponse.status}`);

  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "mimu",
    },
  });
  if (!userResponse.ok) throw new Error(`GitHub user lookup failed: ${userResponse.status}`);
  const user = (await userResponse.json()) as { id: number; login: string };
  return { id: String(user.id), login: user.login };
}
