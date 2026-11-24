import { createHash, randomBytes } from 'node:crypto';

const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret, GOOGLE_REDIRECT_URI: redirectUri } = process.env;
const authorizationEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
const tokenEndpoint = 'https://oauth2.googleapis.com/token';
const userEndpoint = 'https://openidconnect.googleapis.com/v1/userinfo';

export const googleEnabled = Boolean(clientId || clientSecret || redirectUri);
if (googleEnabled && (!clientId || !clientSecret || !redirectUri)) {
  throw new Error('Do logowania Google potrzebne są GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET i GOOGLE_REDIRECT_URI.');
}
if (googleEnabled) {
  const callback = new URL(redirectUri);
  const localhost = ['localhost', '127.0.0.1', '[::1]'].includes(callback.hostname);
  if ((callback.protocol !== 'https:' && !(localhost && callback.protocol === 'http:'))
      || callback.pathname !== '/google/callback' || callback.username || callback.password || callback.search || callback.hash) {
    throw new Error('GOOGLE_REDIRECT_URI musi wskazywać adres aplikacji zakończony na /google/callback.');
  }
}

export function beginGoogleAuth() {
  const state = randomBytes(32).toString('hex');
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return { state, verifier, url: `${authorizationEndpoint}?${params}` };
}

export async function googleIdentity(code, verifier) {
  const signal = AbortSignal.timeout(12_000);
  const token = await fetch(tokenEndpoint, {
    method: 'POST',
    redirect: 'error',
    signal,
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
    }),
  });
  if (!token.ok) {
    await token.body?.cancel();
    return null;
  }
  const { access_token: accessToken } = await token.json();
  if (!accessToken) return null;

  const profile = await fetch(userEndpoint, {
    redirect: 'error',
    signal,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profile.ok) {
    await profile.body?.cancel();
    return null;
  }
  const { sub, email, email_verified: verified, given_name: givenName, name } = await profile.json();
  if (typeof sub !== 'string' || !sub || typeof email !== 'string' || !email || verified !== true) return null;

  return {
    subject: sub,
    email: email.toLowerCase(),
    name: String(givenName || name || email.split('@')[0]).slice(0, 70),
  };
}
