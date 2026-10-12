import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {database} from '../src/lib/db';
import {abortExpiredUnsent} from '../src/lib/operations';
const sql=database(),subject='tithe:outbox:test:'+randomUUID(),id=randomUUID(),old=randomUUID(),fresh=randomUUID();
try{
 await sql`INSERT INTO tithe_operations(id,subject,idempotency_key,request_hash,kind,status,lease_token,lease_until) VALUES(${id},${subject},${id},'test','licence','SUBMITTING',${old},now()-interval '1 second')`;
 await abortExpiredUnsent(subject);
 assert.equal((await sql`SELECT status FROM tithe_operations WHERE id=${id}`)[0].status,'ABORTED');
 await sql`UPDATE tithe_operations SET status='SIGNED',tx_hash='testhash',outbox_ciphertext='encrypted fixture',lease_token=NULL,lease_until=NULL WHERE id=${id}`;
 await abortExpiredUnsent(subject);
 assert.equal((await sql`SELECT status FROM tithe_operations WHERE id=${id}`)[0].status,'SIGNED');
 const leases=await Promise.all(Array.from({length:8},()=>sql`UPDATE tithe_operations SET status='RECOVERING',lease_token=${fresh},lease_until=now()+interval '90 seconds' WHERE id=${id} AND (lease_until IS NULL OR lease_until<now()) RETURNING id`));
 assert.equal(leases.filter(r=>r.length===1).length,1);
 assert.equal((await sql`UPDATE tithe_operations SET tx_hash='replacement' WHERE id=${id} AND lease_token=${old} RETURNING id`).length,0);
 let blocked=false;
 try{await sql`INSERT INTO tithe_operations(id,subject,idempotency_key,request_hash,kind,status) VALUES(${randomUUID()},${subject},${randomUUID()},'test','licence','SUBMITTING')`;}catch{blocked=true;}
 assert.ok(blocked);
 console.log('Real Neon recovery checks passed: unsigned expiry, signed retention, one lease winner, stale fencing and payment serialization.');
}finally{await sql`DELETE FROM tithe_operations WHERE subject=${subject}`;}
