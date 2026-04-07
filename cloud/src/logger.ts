import crypto from 'node:crypto';
import type express from 'express';

export interface RequestContext {
  requestId: string;
}

function getRequestContext(req: express.Request): RequestContext {
  return (req as express.Request & { requestContext?: RequestContext }).requestContext || {
    requestId: 'unknown'
  };
}

export function attachRequestContext(req: express.Request, _res: express.Response, next: express.NextFunction): void {
  const existing = String(req.header('x-request-id') || '').trim();
  const requestId = existing || crypto.randomUUID();
  (req as express.Request & { requestContext?: RequestContext }).requestContext = {
    requestId: requestId
  };
  next();
}

export function logInfo(req: express.Request | null, message: string, fields?: Record<string, unknown>): void {
  const payload = Object.assign({
    level: 'info',
    message: message,
    request_id: req ? getRequestContext(req).requestId : ''
  }, fields || {});
  console.log(JSON.stringify(payload));
}

export function logError(req: express.Request | null, message: string, fields?: Record<string, unknown>): void {
  const payload = Object.assign({
    level: 'error',
    message: message,
    request_id: req ? getRequestContext(req).requestId : ''
  }, fields || {});
  console.error(JSON.stringify(payload));
}

export function getRequestId(req: express.Request): string {
  return getRequestContext(req).requestId;
}
