import { database } from '../src/lib/db';
const sql = database();
await sql.query(`CREATE TABLE IF NOT EXISTS tithe_works (
  id text PRIMARY KEY, creator text NOT NULL, title text NOT NULL, kind text NOT NULL,
  document jsonb NOT NULL, indexed_at timestamptz NOT NULL DEFAULT now()
)`);
await sql.query(`CREATE INDEX IF NOT EXISTS tithe_works_search ON tithe_works USING gin(to_tsvector('english',title || ' ' || (document->'terms'->>'terms_text')))`);
await sql.query(`CREATE TABLE IF NOT EXISTS tithe_records (
  id text PRIMARY KEY, kind text NOT NULL, account text NOT NULL, document jsonb NOT NULL,
  indexed_at timestamptz NOT NULL DEFAULT now()
)`);
await sql.query(`CREATE TABLE IF NOT EXISTS tithe_operations (
  id uuid PRIMARY KEY, subject text NOT NULL, idempotency_key text NOT NULL,
  request_hash text NOT NULL, kind text NOT NULL, status text NOT NULL,
  tx_hash text, error text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(subject,idempotency_key)
)`);
await sql.query(`CREATE TABLE IF NOT EXISTS tithe_keys (
  id uuid PRIMARY KEY, subject text NOT NULL, name text NOT NULL, digest text UNIQUE NOT NULL,
  prefix text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
)`);
await sql.query(`CREATE TABLE IF NOT EXISTS tithe_limits (
  scope text NOT NULL, bucket bigint NOT NULL, count integer NOT NULL DEFAULT 1,
  PRIMARY KEY(scope,bucket)
)`);
await sql.query(`ALTER TABLE tithe_limits ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()`);
await sql.query(`ALTER TABLE tithe_operations ADD COLUMN IF NOT EXISTS indexed boolean NOT NULL DEFAULT false`);
await sql.query(`CREATE UNIQUE INDEX IF NOT EXISTS tithe_one_submission ON tithe_operations(subject) WHERE status IN ('SUBMITTING','SIGNED')`);
console.log('Neon schema is ready. No sample data inserted.');
