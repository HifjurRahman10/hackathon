import type { Config } from 'drizzle-kit';

export default {
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  connectionString: process.env.POSTGRES_URL!,
} satisfies Config;
