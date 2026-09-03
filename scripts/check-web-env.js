#!/usr/bin/env node
/**
 * Fail a web build that has no Supabase credentials, before it produces a
 * bundle that cannot work.
 *
 * `expo export --platform web` exits 0 with these unset: `app.config.ts` puts
 * `undefined` into `expo.extra`, Metro never executes app code, and the export
 * succeeds. The throw in `src/data/supabase.ts` then fires in the visitor's
 * browser instead — a green deployment serving a white screen, which is a far
 * worse failure than a red build.
 *
 * Deliberately wired only into the Vercel build command, not into
 * `app.config.ts`: running it there would change `expo start`, `run:android`
 * and every other local command, and this is a deployment concern.
 */

require('dotenv/config');

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];

const missing = REQUIRED.filter((name) => !process.env[name]?.trim());

if (missing.length > 0) {
  console.error('');
  console.error('  Web build aborted: missing environment variables');
  console.error('');
  for (const name of missing) console.error(`    ${name}`);
  console.error('');
  console.error('  These are read at BUILD time by app.config.ts and compiled');
  console.error('  into the bundle, so they must be set before the build runs.');
  console.error('');
  console.error('  On Vercel: Project Settings -> Environment Variables, for the');
  console.error('  Production and Preview environments, then redeploy.');
  console.error('  Locally:   copy .env.example to .env and fill it in.');
  console.error('');
  process.exit(1);
}

// The anon key is public by design and safe to ship; the service_role key
// bypasses every RLS policy and must never reach a browser bundle.
const anonKey = process.env.SUPABASE_ANON_KEY ?? '';

try {
  const [, payload] = anonKey.split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  if (claims.role && claims.role !== 'anon') {
    console.error('');
    console.error(`  Web build aborted: SUPABASE_ANON_KEY carries role "${claims.role}".`);
    console.error('  Only the anon key may be compiled into a browser bundle.');
    console.error('');
    process.exit(1);
  }
} catch {
  // Not a JWT, or a newer publishable-key format. Nothing to assert — the
  // presence check above has already done the part that is always true.
}

console.log('Supabase environment variables present — starting web export.');
