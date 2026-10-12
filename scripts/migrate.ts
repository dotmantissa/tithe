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
await sql.query(`ALTER TABLE tithe_operations
  ADD COLUMN IF NOT EXISTS action_json jsonb,
  ADD COLUMN IF NOT EXISTS contract_name text,
  ADD COLUMN IF NOT EXISTS contract_address text,
  ADD COLUMN IF NOT EXISTS function_name text,
  ADD COLUMN IF NOT EXISTS target_id text,
  ADD COLUMN IF NOT EXISTS result jsonb,
  ADD COLUMN IF NOT EXISTS outbox_ciphertext text,
  ADD COLUMN IF NOT EXISTS outbox_nonce text,
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`);
await sql.query(`UPDATE tithe_operations SET lease_until=created_at + interval '2 minutes' WHERE lease_until IS NULL AND status IN ('SUBMITTING','SIGNED','SUBMISSION_UNCERTAIN')`);
await sql.query(`CREATE UNIQUE INDEX IF NOT EXISTS tithe_active_submission ON tithe_operations(subject) WHERE status IN ('SUBMITTING','SIGNED','SUBMISSION_UNCERTAIN','RECOVERING')`);
await sql.query(`CREATE INDEX IF NOT EXISTS tithe_recovery_due ON tithe_operations(next_retry_at,created_at) WHERE status NOT IN ('FINALIZED','FAILED','ABORTED','CANCELED')`);

await sql.query(`DROP INDEX IF EXISTS tithe_one_submission`);
await sql.query(`ALTER TABLE tithe_works ADD COLUMN IF NOT EXISTS deployment text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS generation text NOT NULL DEFAULT ''`);
await sql.query(`ALTER TABLE tithe_records ADD COLUMN IF NOT EXISTS deployment text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS generation text NOT NULL DEFAULT ''`);
await sql.query(`CREATE TABLE IF NOT EXISTS tithe_index_state (deployment text PRIMARY KEY,kind text NOT NULL,revision bigint,record_count bigint,cursor bigint NOT NULL DEFAULT 0,generation text,lease_token uuid,lease_until timestamptz,checked_at timestamptz)`);
await sql.query(`ALTER TABLE tithe_operations ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'ACTION', ADD COLUMN IF NOT EXISTS fund_hash text, ADD COLUMN IF NOT EXISTS fund_atto text NOT NULL DEFAULT '0', ADD COLUMN IF NOT EXISTS action_args jsonb, ADD COLUMN IF NOT EXISTS consent_seal text`);
await sql.query(`CREATE UNIQUE INDEX IF NOT EXISTS tithe_serial_submission ON tithe_operations(subject) WHERE status IN ('SUBMITTING','SIGNED','SUBMISSION_UNCERTAIN','RECOVERING') OR (phase='FUNDING' AND status NOT IN ('FAILED','CANCELED','ABORTED'))`);
await sql.query(`CREATE TABLE IF NOT EXISTS tithe_rpc_events(id bigserial PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now())`);
await sql.query(`CREATE INDEX IF NOT EXISTS tithe_rpc_events_time ON tithe_rpc_events(created_at)`);
await sql.query(`CREATE TABLE IF NOT EXISTS tithe_rpc_cache (id text PRIMARY KEY,value jsonb,expires_at timestamptz NOT NULL DEFAULT now())`);
await sql.query(`INSERT INTO tithe_rpc_events(created_at) SELECT created_at FROM tithe_limits CROSS JOIN LATERAL generate_series(1,LEAST(count,420)) WHERE scope='studio:hour' AND created_at>now()-interval '1 hour' AND NOT EXISTS(SELECT 1 FROM tithe_rpc_events)`);
console.log('Neon schema is ready. No sample data inserted.');
