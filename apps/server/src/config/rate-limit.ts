import type { Request } from 'express';
import { isIP } from 'node:net';
import { ipKeyGenerator } from 'express-rate-limit';

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
