import type express from 'express';
import crypto from 'node:crypto';
import { config } from './config';

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function reject(res: express.Response, message: string): void {
  res.status(401).json({
    ok: false,
    error: message
  });
}

function buildAddonSigningText(method: string, path: string, timestamp: string, body: string): string {
  return [
    String(method || '').trim().toUpperCase(),
    String(path || '').trim(),
    String(timestamp || '').trim(),
    body
  ].join('\n');
}

function computeAddonSignature(secret: string, method: string, path: string, timestamp: string, body: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(buildAddonSigningText(method, path, timestamp, body))
    .digest('hex');
}

function verifyAddonHmac(req: express.Request): boolean {
  const keyId = String(req.header('x-addon-key-id') || '').trim();
  const timestamp = String(req.header('x-addon-timestamp') || '').trim();
  const signature = String(req.header('x-addon-signature') || '').trim().toLowerCase();
  if (!keyId || !timestamp || !signature || !config.addonHmacSecret) {
    return false;
  }
  if (keyId !== config.addonHmacKeyId) {
    return false;
  }

  const requestTime = new Date(timestamp).getTime();
  if (!Number.isFinite(requestTime)) {
    return false;
  }
  const skewSec = Math.abs(Date.now() - requestTime) / 1000;
  if (skewSec > config.addonHmacMaxSkewSec) {
    return false;
  }

  const rawBody = JSON.stringify(req.body || {});
  const expected = computeAddonSignature(
    config.addonHmacSecret,
    req.method,
    req.path,
    timestamp,
    rawBody
  );
  return secureEqual(signature, expected);
}

export function requireAddonAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (config.addonAuthMode === 'none') {
    next();
    return;
  }

  if (config.addonAuthMode === 'shared-token') {
    const token = String(req.header('x-addon-token') || '').trim();
    if (!token || !config.addonSharedToken || !secureEqual(token, config.addonSharedToken)) {
      reject(res, 'Unauthorized addon request');
      return;
    }
    next();
    return;
  }

  if (config.addonAuthMode === 'hmac') {
    if (!verifyAddonHmac(req)) {
      reject(res, 'Unauthorized addon request');
      return;
    }
    next();
    return;
  }

  reject(res, 'Unsupported addon auth mode');
}

async function verifyOidcBearer(token: string): Promise<boolean> {
  if (!token || !config.taskOidcAudience || !config.taskOidcIssuer || !config.taskOidcJwksUrl) {
    return false;
  }

  const jose = await import('jose');
  const jwks = jose.createRemoteJWKSet(new URL(config.taskOidcJwksUrl));
  await jose.jwtVerify(token, jwks, {
    issuer: config.taskOidcIssuer,
    audience: config.taskOidcAudience
  });
  return true;
}

export function requireTaskAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (config.taskAuthMode === 'none') {
    next();
    return;
  }

  if (config.taskAuthMode === 'shared-token') {
    const token = String(req.header('x-task-token') || '').trim();
    if (!token || !config.internalTaskToken || !secureEqual(token, config.internalTaskToken)) {
      reject(res, 'Unauthorized task request');
      return;
    }
    next();
    return;
  }

  if (config.taskAuthMode === 'oidc') {
    const authHeader = String(req.header('authorization') || '').trim();
    const token = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.substring(7).trim()
      : '';
    verifyOidcBearer(token)
      .then(function(valid) {
        if (!valid) {
          reject(res, 'Unauthorized task request');
          return;
        }
        next();
      })
      .catch(function() {
        reject(res, 'Unauthorized task request');
      });
    return;
  }

  reject(res, 'Unsupported task auth mode');
}

export function buildAddonAuthHeaders(path: string, payload: object): Record<string, string> {
  if (config.addonAuthMode === 'shared-token') {
    return {
      'x-addon-token': config.addonSharedToken
    };
  }

  if (config.addonAuthMode === 'hmac') {
    const timestamp = new Date().toISOString();
    const signature = computeAddonSignature(
      config.addonHmacSecret,
      'POST',
      path,
      timestamp,
      JSON.stringify(payload || {})
    );
    return {
      'x-addon-key-id': config.addonHmacKeyId,
      'x-addon-timestamp': timestamp,
      'x-addon-signature': signature
    };
  }

  return {};
}
