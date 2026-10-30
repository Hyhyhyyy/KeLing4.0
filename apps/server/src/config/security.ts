const MIN_JWT_SECRET_BYTES = 32;

export function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < MIN_JWT_SECRET_BYTES) {
    throw new Error(`JWT_SECRET must contain at least ${MIN_JWT_SECRET_BYTES} bytes`);
  }
  return secret;
}

export function allowedCorsOrigins(): string[] {
  const configured = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  if (process.env.NODE_ENV === 'production') {
    // Only platform-injected deployment names are trusted, never request Host
    // or Origin. This supports same-origin previews without a wildcard.
    if (process.env.VERCEL === '1') {
      for (const key of ['VERCEL_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_BRANCH_URL']) {
        const host = process.env[key];
        if (host && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host)) configured.push(`https://${host}`);
      }
    }
    if (!configured.length) throw new Error('CORS_ORIGINS is required in production');
    return [...new Set(configured)];
  }
  const origins = new Set(configured.length ? configured : ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:3000']);
  for (const origin of [...origins]) {
    try {
      const url = new URL(origin);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        url.hostname = url.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
        origins.add(url.origin);
      }
    } catch { /* Invalid configured origins do not create additional permissions. */ }
  }
  return [...origins];
}
