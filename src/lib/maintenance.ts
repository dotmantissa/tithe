import {database} from './db';
import {refreshOperation,resumeOperation,abortExpiredUnsent} from './operations';
import {syncIndex} from './indexer';
export async function maintain(){
 const sql=database(),deadline=Date.now()+180000;await abortExpiredUnsent();
 const pending=await sql`SELECT id,subject,status FROM tithe_operations WHERE tx_hash IS NOT NULL AND status NOT IN ('FAILED','CANCELED','ABORTED') AND (status<>'FINALIZED' OR indexed=false) AND next_retry_at<=now() ORDER BY next_retry_at,created_at LIMIT 12`;
 let checked=0,interrupted=0;
 for(const row of pending){
  if(Date.now()>deadline-30000)break;
  try{if(['SIGNED','SUBMISSION_UNCERTAIN','RECOVERING'].includes(String(row.status)))await resumeOperation(String(row.subject),String(row.id));else await refreshOperation(String(row.subject),String(row.id));checked++;}
  catch{interrupted++;await sql`UPDATE tithe_operations SET next_retry_at=now()+interval '5 minutes' WHERE id=${row.id}`;}
 }
 const index=Date.now()<deadline-30000?await syncIndex({deadline,pages:6}):{processed:0,completed:0};
 await sql`DELETE FROM tithe_limits WHERE created_at<now()-interval '2 days'`;
 await sql`DELETE FROM tithe_rpc_cache WHERE expires_at<now()-interval '1 day'`;
 return {checked,interrupted,deferred:pending.length-checked-interrupted,index};
}
