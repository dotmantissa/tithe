import { database } from '../src/lib/db';
import { refreshOperation } from '../src/lib/operations';
const sql=database();
const pending=await sql`SELECT id,subject FROM tithe_operations WHERE tx_hash IS NOT NULL AND status NOT IN ('FAILED','CANCELED') AND (status <> 'FINALIZED' OR indexed=false) ORDER BY created_at LIMIT 100`;
let checked=0,interrupted=0;
for(const row of pending){try{await refreshOperation(row.subject as string,row.id as string);checked++;}catch{interrupted++;}}
await sql`DELETE FROM tithe_limits WHERE created_at < now() - interval '2 days'`;
console.log(`Reconciliation complete: ${checked} checked, ${interrupted} temporarily unavailable. No transactions resubmitted.`);
if(interrupted)process.exitCode=1;
