import {rpcReservationQuery} from '../src/lib/rpc-reservation';
import type {RpcClass} from '../src/lib/rpc-context';
import {database} from '../src/lib/db';
import {randomUUID,randomInt} from 'node:crypto';
import assert from 'node:assert/strict';
const sql=database(),table='tithe_rpc_test_'+randomUUID().replaceAll('-',''),lock=randomInt(100000000,200000000);
assert.match(table,/^[a-z_0-9]+$/);
try{
 await sql.query(`CREATE TABLE ${table}(id bigserial PRIMARY KEY,created_at timestamptz NOT NULL,traffic_class text NOT NULL DEFAULT 'recovery')`);
 await sql.query(`INSERT INTO ${table}(created_at) SELECT now()-interval '30 minutes' FROM generate_series(1,399)`);
 const reserve=(kind:RpcClass='recovery')=>{const query=rpcReservationQuery(kind,table);return sql.transaction([sql.query(`SELECT pg_advisory_xact_lock(${lock})`),sql.query(query.query,query.params)]);};
 const race=await Promise.all(Array.from({length:8},reserve));assert.equal(race.filter(r=>r[1].length===1).length,1);
 await sql.query(`TRUNCATE ${table}`);await sql.query(`INSERT INTO ${table}(created_at) SELECT now()-interval '10 seconds' FROM generate_series(1,35)`);assert.equal((await reserve())[1].length,0);
 await sql.query(`UPDATE ${table} SET created_at=now()-interval '61 minutes'`);assert.equal((await reserve())[1].length,1);
 await sql.query(`TRUNCATE ${table}`);await sql.query(`INSERT INTO ${table}(created_at,traffic_class) SELECT now()-interval '30 minutes','public' FROM generate_series(1,80)`);
 assert.equal((await reserve('public'))[1].length,0);assert.equal((await reserve('authenticated'))[1].length,1);assert.equal((await reserve('recovery'))[1].length,1);
 await sql.query(`TRUNCATE ${table}`);await sql.query(`INSERT INTO ${table}(created_at,traffic_class) SELECT now()-interval '30 minutes','authenticated' FROM generate_series(1,300)`);
 assert.equal((await reserve('authenticated'))[1].length,0);assert.equal((await reserve('public'))[1].length,0);assert.equal((await reserve('recovery'))[1].length,1);
 await sql.query(`TRUNCATE ${table}`);await sql.query(`INSERT INTO ${table}(created_at,traffic_class) SELECT now()-interval '10 seconds','public' FROM generate_series(1,10)`);
 assert.equal((await reserve('public'))[1].length,0);assert.equal((await reserve('recovery'))[1].length,1);
 await sql.query(`TRUNCATE ${table}`);await sql.query(`INSERT INTO ${table}(created_at,traffic_class) SELECT now()-interval '10 seconds','authenticated' FROM generate_series(1,25)`);
 assert.equal((await reserve('authenticated'))[1].length,0);const protectedRace=await Promise.all(Array.from({length:12},()=>reserve('recovery')));assert.equal(protectedRace.filter(r=>r[1].length===1).length,10);
 console.log('Real Neon rolling RPC budget passed: one concurrent hourly reservation, minute ceiling, elapsed expiry, public exhaustion isolation and 10 reserved concurrent recovery slots.');
}finally{await sql.query(`DROP TABLE IF EXISTS ${table}`);}
