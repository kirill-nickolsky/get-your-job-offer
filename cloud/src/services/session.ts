import crypto from 'node:crypto';
import { config } from '../config';
import { botUsersCollection } from '../firestore';

interface SessionPayload {
  telegram_user_id: string;
  username: string;
  first_name: string;
  last_name: string;
  exp: number;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(value: string): string {
  return crypto.createHmac('sha256', config.miniAppSessionSecret).update(value).digest('hex');
}

export function createSessionToken(payload: Omit<SessionPayload, 'exp'>): string {
  const exp = Math.floor(Date.now() / 1000) + config.miniAppSessionTtlSec;
  const body = JSON.stringify(Object.assign({}, payload, { exp: exp }));
  const encoded = base64UrlEncode(body);
  return encoded + '.' + sign(encoded);
}

export function verifySessionToken(token: string): SessionPayload {
  const raw = String(token || '').trim();
  const parts = raw.split('.');
  if (parts.length !== 2) {
    throw new Error('Invalid session token');
  }
  const encoded = parts[0];
  const signature = parts[1];
  if (sign(encoded) !== signature) {
    throw new Error('Invalid session token');
  }
  const payload = JSON.parse(base64UrlDecode(encoded)) as SessionPayload;
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Session expired');
  }
  return payload;
}

export async function createFakeTelegramSession(input: {
  user_id: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}): Promise<{ session_token: string; user: { telegram_user_id: string; username: string; first_name: string } }> {
  if (!config.allowFakeTelegramSession) {
    throw new Error('Fake telegram session is disabled');
  }
  const telegramUserId = String(input.user_id || '').trim();
  if (!telegramUserId) {
    throw new Error('user_id is required');
  }
  const username = String(input.username || '').trim();
  const firstName = String(input.first_name || 'Local').trim();
  const lastName = String(input.last_name || 'User').trim();
  const nowIso = new Date().toISOString();
  await botUsersCollection().doc(telegramUserId).set({
    telegram_user_id: telegramUserId,
    username: username,
    first_name: firstName,
    last_name: lastName,
    is_active: true,
    notify_min_rate: 4,
    created_at: nowIso,
    last_seen_at: nowIso
  }, { merge: true });

  return {
    session_token: createSessionToken({
      telegram_user_id: telegramUserId,
      username: username,
      first_name: firstName,
      last_name: lastName
    }),
    user: {
      telegram_user_id: telegramUserId,
      username: username,
      first_name: firstName
    }
  };
}
