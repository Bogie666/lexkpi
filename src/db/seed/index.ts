/**
 * CLI entry point — runs the seed from local shell via `npm run db:seed`.
 * Heavy lifting lives in ./run.ts so /api/admin/db-setup can import it.
 */
import 'dotenv/config';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { runSeed } from './run';

runSeed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
