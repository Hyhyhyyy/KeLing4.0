import type { PoolConfig } from 'pg';

export function runtimeDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.VERCEL !== '1') return env.DATABASE_URL;
  let url: URL;
  try { url = new URL(env.DATABASE_URL || ''); }
  catch { throw new Error('A PostgreSQL DATABASE_URL is required on Vercel'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Vercel requires persistent PostgreSQL storage');
  if (!['require', 'verify-ca', 'verify-full'].includes(url.searchParams.get('sslmode') || '')) {
    throw new Error('Vercel DATABASE_URL must require TLS');
  }
  // A warm instance reuses its client. Start with a small per-instance pool;
  // Neon DATABASE_URL should use its -pooler host, not the migration URL.
  for (const [key, value] of Object.entries({ connection_limit: '1', pool_timeout: '20', connect_timeout: '15' })) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  return url.toString();
}

export function postgresPoolConfig(connection: string): PoolConfig {
  const url = new URL(connection);
  const positive = (key: string, fallback: number, maximum: number) => {
    const raw = url.searchParams.get(key);
    if (raw === null) return fallback;
    if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > maximum) throw new Error(`Invalid database ${key}`);
    return Number(raw);
  };
  const max = positive('connection_limit', 2, 10);
  const connectionTimeoutMillis = positive('connect_timeout', 15, 60) * 1000;
  // node-postgres 8 treats 'require' as certificate verification. Make that
  // explicit so a future driver version cannot silently weaken TLS semantics.
  if (url.searchParams.get('sslmode') === 'require') url.searchParams.set('sslmode', 'verify-full');
  for (const key of ['connection_limit', 'connect_timeout', 'pool_timeout']) url.searchParams.delete(key);
  return { connectionString: url.toString(), max, connectionTimeoutMillis, idleTimeoutMillis: 5000 };
}
