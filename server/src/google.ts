import { OAuth2Client } from 'google-auth-library';

export type GooglePayload = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
};

export function googleEnabled(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function client(): OAuth2Client {
  if (!googleEnabled()) throw new Error('google_oauth_disabled');
  return new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    redirectUri: process.env.GOOGLE_REDIRECT_URI!,
  });
}

export async function verifyIdToken(idToken: string): Promise<GooglePayload> {
  if (!idToken) throw new Error('id_token_invalid');
  const c = client();
  let ticket;
  try {
    ticket = await c.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
  } catch {
    throw new Error('id_token_invalid');
  }
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) throw new Error('id_token_invalid');
  return {
    sub: payload.sub,
    email: payload.email,
    email_verified: payload.email_verified === true,
    name: payload.name,
    picture: payload.picture,
  };
}

export async function exchangeCode(code: string): Promise<{ id_token: string }> {
  try {
    const c = client();
    const { tokens } = await c.getToken(code);
    if (!tokens.id_token) throw new Error('oauth_failed');
    return { id_token: tokens.id_token };
  } catch (e) {
    if ((e as Error).message === 'google_oauth_disabled') throw e;
    throw new Error('oauth_failed');
  }
}

export function buildAuthUrl(state: string): string {
  const c = client();
  return c.generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    state,
    prompt: 'select_account',
  });
}
