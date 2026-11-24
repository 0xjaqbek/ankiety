import { createHash, randomBytes } from 'node:crypto';

const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
const authorizationEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
const tokenEndpoint = 'https://oauth2.googleapis.com/token';
const userEndpoint = 'https://openidconnect.googleapis.com/v1/userinfo';

export const googleEnabled = Boolean(clientId || clientSecret || redirectUri);

function configurationError() {
  if (!googleEnabled) return null;

  const missing = Object.entries({
    GOOGLE_CLIENT_ID: clientId,
    GOOGLE_CLIENT_SECRET: clientSecret,
    GOOGLE_REDIRECT_URI: redirectUri,
  }).filter(([, value]) => !value).map(([key]) => key);

  if (missing.length) {
    return `Uzupełnij ustawienia logowania przez Google. Brakuje ${missing.join(', ')}.`;
  }

  const callback = URL.parse(redirectUri);
  const localhost = callback && ['localhost', '127.0.0.1', '[::1]'].includes(callback.hostname);
  if (!callback || (callback.protocol !== 'https:' && !(localhost && callback.protocol === 'http:'))
      || callback.pathname !== '/google/callback' || callback.username || callback.password || callback.search || callback.hash) {
    return 'GOOGLE_REDIRECT_URI musi wskazywać adres aplikacji zakończony na /google/callback.';
  }

  return null;
}

export const googleConfigurationError = configurationError();

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
