import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { attachDatabasePool } from '@vercel/functions';
import { runtimeDatabaseUrl, postgresPoolConfig } from './config/database';
// Load local configuration before choosing SQLite or the PostgreSQL adapter.
// Platform-injected variables always win; tests use their isolated environment.
if (process.env.NODE_ENV !== 'test') dotenv.config({ quiet: true });
const url = runtimeDatabaseUrl();
function createClient() {
  if (url && /^postgres(?:ql)?:/.test(url)) {
    const pool = new Pool(postgresPoolConfig(url));
    pool.on('error', () => console.error('An idle PostgreSQL connection failed; the pool will reconnect'));
    if (process.env.VERCEL === '1') attachDatabasePool(pool);
    return new PrismaClient({ adapter: new PrismaPg(pool, { disposeExternalPool: true }) });
  }
  return new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
}
export const prisma = createClient();
