import {randomUUID} from 'node:crypto';
import {read,addresses,type ContractName} from './chain';
import {database} from './db';
import type {Work,Licence,Claim} from './types';
const configs=[['registry','list_works','work'],['desk','list_licences','licence'],['court','list_claims','claim']] as const;
type Record=Work|Licence|Claim;
export async function storeRecords(contract:ContractName,records:Record[],generation:string,fence=''){
 const sql=database(),deployment=addresses[contract];
 if(contract==='registry'){
  const docs=records.map(r=>{const w=r as Work;return {id:w.work_id,creator:w.creator,title:w.title,kind:w.kind,document:w};});
  const written=await sql`INSERT INTO tithe_works(id,creator,title,kind,document,deployment,generation) SELECT x.id,x.creator,x.title,x.kind,x.document,${deployment},${generation} FROM jsonb_to_recordset(${JSON.stringify(docs)}::jsonb) AS x(id text,creator text,title text,kind text,document jsonb) WHERE ${fence}='' OR EXISTS(SELECT 1 FROM tithe_index_state WHERE deployment=${deployment} AND lease_token::text=${fence} AND lease_until>now()) ON CONFLICT(id) DO UPDATE SET creator=EXCLUDED.creator,title=EXCLUDED.title,kind=EXCLUDED.kind,document=EXCLUDED.document,deployment=EXCLUDED.deployment,generation=CASE WHEN EXCLUDED.generation LIKE 'target:%' AND tithe_works.deployment=EXCLUDED.deployment THEN tithe_works.generation ELSE EXCLUDED.generation END,indexed_at=now() RETURNING id`;
  if(fence&&written.length!==records.length)throw new Error('Index lease lost before page commit');
 }else{
  const docs=records.map(r=>contract==='desk'?{id:(r as Licence).licence_id,kind:'licence',account:(r as Licence).holder,document:r}:{id:(r as Claim).claim_id,kind:'claim',account:(r as Claim).claimant,document:r});
  const written=await sql`INSERT INTO tithe_records(id,kind,account,document,deployment,generation) SELECT x.id,x.kind,x.account,x.document,${deployment},${generation} FROM jsonb_to_recordset(${JSON.stringify(docs)}::jsonb) AS x(id text,kind text,account text,document jsonb) WHERE ${fence}='' OR EXISTS(SELECT 1 FROM tithe_index_state WHERE deployment=${deployment} AND lease_token::text=${fence} AND lease_until>now()) ON CONFLICT(id) DO UPDATE SET account=EXCLUDED.account,document=EXCLUDED.document,deployment=EXCLUDED.deployment,generation=CASE WHEN EXCLUDED.generation LIKE 'target:%' AND tithe_records.deployment=EXCLUDED.deployment THEN tithe_records.generation ELSE EXCLUDED.generation END,indexed_at=now() RETURNING id`;
  if(fence&&written.length!==records.length)throw new Error('Index lease lost before page commit');
 }
}
export async function reconcileTarget(contract:ContractName,id:string){
 const method=contract==='registry'?'get_work':contract==='desk'?'get_licence':'get_claim';
 // Errors cannot prove deletion. Only a stable complete snapshot may prune.
 const record=await read<Record>(contract,method,[id],true);
 await storeRecords(contract,[record],'target:'+randomUUID());return record;
}
export async function syncIndex(options:{deadline?:number;pages?:number}={}){
 const deadline=options.deadline||Date.now()+60000,sql=database();let remaining=options.pages??6,processed=0,completed=0;
 for(const [contract,method,kind] of configs){
  if(Date.now()>=deadline||remaining<=0)break;
  const deployment=addresses[contract],lease=randomUUID();
  await sql`INSERT INTO tithe_index_state(deployment,kind) VALUES(${deployment},${kind}) ON CONFLICT(deployment) DO NOTHING`;
  const owners=await sql`UPDATE tithe_index_state SET lease_token=${lease},lease_until=now()+interval '80 seconds' WHERE deployment=${deployment} AND (lease_until IS NULL OR lease_until<now()) AND (checked_at IS NULL OR checked_at<now()-interval '30 seconds' OR cursor>0) RETURNING *`;
  if(!owners[0])continue;
  try{
   const snapshot=await read<{count:number;revision:number}>(contract,'get_snapshot',[],true),old=owners[0];
   let cursor=Number(old.cursor),generation=String(old.generation||randomUUID());
   if(old.revision===null||Number(old.revision)!==snapshot.revision||Number(old.record_count)!==snapshot.count||cursor===0){cursor=0;generation=randomUUID();}
   await sql`UPDATE tithe_index_state SET cursor=${cursor},generation=${generation},revision=${snapshot.revision},record_count=${snapshot.count} WHERE deployment=${deployment} AND lease_token=${lease}`;
   let contractPages=0;
   while(cursor<snapshot.count&&contractPages<2&&remaining>0&&Date.now()<deadline){
    const renewed=await sql`UPDATE tithe_index_state SET lease_until=now()+interval '80 seconds' WHERE deployment=${deployment} AND lease_token=${lease} AND lease_until>now() RETURNING deployment`;
    if(!renewed[0])throw new Error('Index lease lost');
    const records=await read<Record[]>(contract,method,[cursor,Math.min(50,snapshot.count-cursor)],true);
    if(records.length!==Math.min(50,snapshot.count-cursor))throw new Error('Snapshot page changed');
    await storeRecords(contract,records,generation,lease);cursor+=records.length;remaining--;contractPages++;processed+=records.length;
    await sql`UPDATE tithe_index_state SET cursor=${cursor} WHERE deployment=${deployment} AND lease_token=${lease}`;
   }
   if(cursor===snapshot.count){
    const renewed=await sql`UPDATE tithe_index_state SET lease_until=now()+interval '80 seconds' WHERE deployment=${deployment} AND lease_token=${lease} AND lease_until>now() RETURNING deployment`;
    if(!renewed[0])throw new Error('Index lease lost before snapshot completion');
    const end=await read<{count:number;revision:number}>(contract,'get_snapshot',[],true);
    if(end.count===snapshot.count&&end.revision===snapshot.revision){
     // Check fencing in the same statement that deletes obsolete index entries.
     if(kind==='work')await sql`DELETE FROM tithe_works WHERE deployment=${deployment} AND generation<>${generation} AND EXISTS(SELECT 1 FROM tithe_index_state WHERE deployment=${deployment} AND lease_token=${lease} AND lease_until>now())`;
     else await sql`DELETE FROM tithe_records WHERE deployment=${deployment} AND generation<>${generation} AND EXISTS(SELECT 1 FROM tithe_index_state WHERE deployment=${deployment} AND lease_token=${lease} AND lease_until>now())`;
     const finished=await sql`UPDATE tithe_index_state SET cursor=0,checked_at=now() WHERE deployment=${deployment} AND lease_token=${lease} AND lease_until>now() RETURNING deployment`;if(!finished[0])throw new Error('Index lease lost before completion');completed++;
    }else await sql`UPDATE tithe_index_state SET cursor=0,revision=NULL WHERE deployment=${deployment} AND lease_token=${lease}`;
   }
  }finally{await sql`UPDATE tithe_index_state SET lease_token=NULL,lease_until=NULL WHERE deployment=${deployment} AND lease_token=${lease}`;}
 }
 return {processed,completed};
}
