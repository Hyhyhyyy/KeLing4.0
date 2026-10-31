import type { Request } from 'express';
import { isIP } from 'node:net';
import { ipKeyGenerator } from 'express-rate-limit';
import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';

export function clientRateLimitKey(req: Pick<Request, 'headers' | 'ip' | 'socket'>, env = process.env): string {
  let address = req.ip || req.socket?.remoteAddress;
  // Vercel overwrites this header at its edge. Outside Vercel, ignore it so
  // a client cannot choose its own bucket. IPv6 uses the library's subnet key.
  if (env.VERCEL === '1') {
    const forwarded = req.headers['x-vercel-forwarded-for'];
    if (typeof forwarded === 'string' && isIP(forwarded)) address = forwarded;
  }
  return address && isIP(address) ? ipKeyGenerator(address) : 'unresolved-client';
}

// A managed host may share one ingress address. Verified accounts must not
// consume each other's normal API budget; unauthenticated traffic keeps its IP budget.
export function accountRateLimitKey(req: Pick<Request, 'headers' | 'ip' | 'socket'>, env = process.env): string {
  if (env.MIAODA_APP_ID && env.JWT_SECRET && typeof req.headers.authorization === 'string') {
    const token = req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
    try {
      const claim = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'], issuer: 'keling-server', audience: 'keling-clients' });
      if (typeof claim === 'object' && typeof claim.userId === 'string' && claim.userId.length <= 128) return `account:${claim.userId}`;
    } catch { /* Forged tokens retain the source-address budget. */ }
  }
  return clientRateLimitKey(req, env);
}

export function authAttemptRateLimitKey(req: Pick<Request, 'headers' | 'ip' | 'socket' | 'body'>, env = process.env): string {
  const address = clientRateLimitKey(req, env);
  if (!env.MIAODA_APP_ID || typeof req.body?.email !== 'string') return address;
  const email = req.body.email.trim().toLowerCase().slice(0, 254);
  return `${address}:${createHash('sha256').update(email).digest('hex')}`;
}
