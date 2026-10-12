import {database} from '../src/lib/db';
import {randomUUID,randomInt} from 'node:crypto';
import assert from 'node:assert/strict';
const sql=database(),table='tithe_rpc_test_'+randomUUID().replaceAll('-',''),lock=randomInt(100000000,200000000);
assert.match(table,/^[a-z_0-9]+$/);
try{
 await sql.query(`CREATE TABLE ${table}(id bigserial PRIMARY KEY,created_at timestamptz NOT NULL)`);
 await sql.query(`INSERT INTO ${table}(created_at) SELECT now()-interval '30 minutes' FROM generate_series(1,399)`);
 const reserve=()=>sql.transaction([sql.query(`SELECT pg_advisory_xact_lock(${lock})`),sql.query(`INSERT INTO ${table}(created_at) SELECT now() WHERE (SELECT count(*) FROM ${table} WHERE created_at>now()-interval '1 hour')<400 AND (SELECT count(*) FROM ${table} WHERE created_at>now()-interval '1 minute')<35 RETURNING id`)]);
 const race=await Promise.all(Array.from({length:8},reserve));assert.equal(race.filter(r=>r[1].length===1).length,1);
 await sql.query(`TRUNCATE ${table}`);await sql.query(`INSERT INTO ${table}(created_at) SELECT now()-interval '10 seconds' FROM generate_series(1,35)`);assert.equal((await reserve())[1].length,0);
 await sql.query(`UPDATE ${table} SET created_at=now()-interval '61 minutes'`);assert.equal((await reserve())[1].length,1);
 console.log('Real Neon rolling RPC budget passed: one concurrent hourly reservation, minute ceiling, and actual elapsed window expiry.');
}finally{await sql.query(`DROP TABLE IF EXISTS ${table}`);}
