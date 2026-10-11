import { database } from './db';
import { refreshOperation } from './operations';
import { syncIndex } from './indexer';

export async function maintain(){
  const sql=database(),deadline=Date.now()+220000;
  const pending=await sql`SELECT id,subject FROM tithe_operations WHERE tx_hash IS NOT NULL AND status NOT IN ('FAILED','CANCELED') AND (status <> 'FINALIZED' OR indexed=false) ORDER BY created_at LIMIT 25`;
  let checked=0,interrupted=0;
  for(const row of pending){
    if(Date.now()>deadline)break;
    try{await refreshOperation(row.subject as string,row.id as string);checked++;}
    catch{interrupted++;}
  }
  await syncIndex();
  await sql`DELETE FROM tithe_limits WHERE created_at < now() - interval '2 days'`;
  return {checked,interrupted,deferred:pending.length-checked-interrupted,indexed:true};
}
