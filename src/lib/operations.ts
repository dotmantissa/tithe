import { randomUUID } from 'node:crypto';
import { keccak256,parseTransaction } from 'viem';
import {sealTransaction,openTransaction,validateSavedTransaction,retryDelay} from './outbox';
import type { CalldataEncodable, Hash } from 'genlayer-js/types';
import { accountFor, addresses, chain, executionSucceeded, operationState, normalize, read, signer, type ContractName } from './chain';
import { database } from './db';
import { AppError } from './errors';
import { digest, limit } from './security';
import { inspectArtifact } from './artifacts';
import { reconcileTarget } from './indexer';
import type { Action } from './schemas';
import type { Work, Operation, Claim } from './types';

type StoredOperation=Operation&{subject:string;idempotency_key:string;request_hash:string;contract_name:ContractName;contract_address:string;function_name:string;target_id:string|null;outbox_ciphertext:string|null;outbox_nonce:string|null;lease_token:string|null;lease_until:string|null;attempts:number;next_retry_at:string;indexed:boolean};

export function publicOperation(row:StoredOperation):Operation{
  return {id:row.id,kind:row.kind,status:row.status,tx_hash:row.tx_hash,error:row.error,created_at:row.created_at,...(row.result?{result:row.result}:{})};
}
export async function abortExpiredUnsent(subject?:string){
  const sql=database();
  await sql`UPDATE tithe_operations SET status='ABORTED',error='The signing deadline passed before a transaction was saved. Nothing was sent.',lease_token=NULL,updated_at=now() WHERE (${subject||''}='' OR subject=${subject||''}) AND status='SUBMITTING' AND tx_hash IS NULL AND outbox_ciphertext IS NULL AND COALESCE(lease_until,created_at+interval '2 minutes') < now()`;
}

export async function submit(subject: string, action: Action, idempotency: string): Promise<Operation> {
  if (!/^[a-zA-Z0-9:_-]{16,100}$/.test(idempotency)) throw new AppError('Provide an Idempotency-Key of 16 to 100 characters.');
  const sql=database();
  await abortExpiredUnsent(subject);
  const requestHash=digest(JSON.stringify(action));
  const existing=await sql`SELECT * FROM tithe_operations WHERE subject=${subject} AND idempotency_key=${idempotency}`;
  if(existing[0]) {
    if(existing[0].request_hash!==requestHash) throw new AppError('That request key already belongs to a different action.',409);
    return publicOperation(existing[0] as StoredOperation);
  }
  await limit(subject,12);
  const id=randomUUID();
  let target:string|null=null;
  let contract: ContractName='registry', method='', args: CalldataEncodable[]=[], value=0n;
  switch(action.kind) {
    case 'register': {
      const artifact=await inspectArtifact(action.url);
      if(artifact.content_hash!==action.content_hash) throw new AppError('The work changed after preview. Fetch it again before registering.');
      target=digest(accountFor(subject).address+':'+action.content_hash+':'+action.url);
      method='register_work';args=[action.url,action.content_hash,action.terms_text,JSON.stringify(action.prices),action.licence_class,action.title];break;
    }
    case 'terms': target=action.work_id;method='update_terms';args=[action.work_id,action.terms_text,JSON.stringify(action.prices),action.licence_class];break;
    case 'licence': {
      const work=await read<Work>('registry','get_work',[action.work_id]);
      const price=work.terms.price_schedule_atto[action.use_class];
      if(price===undefined) throw new AppError('The creator has not priced that use.');
      if(work.version!==action.expected_terms_version||price!==action.expected_fee_atto) throw new AppError('The terms or price changed. Read the latest terms and agree to the current fee before trying again.',409);
      target=digest(accountFor(subject).address+':request:'+id);
      value=BigInt(action.expected_fee_atto);contract='desk';method='request_licence';args=[action.work_id,action.intended_use_text,action.use_class,action.expected_terms_version,action.expected_fee_atto,id];break;
    }
    case 'claim': {
      const artifact=await inspectArtifact(action.output_url);
      if(artifact.content_hash!==action.output_hash) throw new AppError('The output changed after preview. Fetch it again.');
      target=digest(action.work_id+':request:'+id);contract='court';method='file_claim';args=[action.work_id,action.output_url,action.output_hash,action.respondent,action.used_at,action.terms_version,id];
      if((await read<{bond_atto:string}>('court','get_account',[accountFor(subject).address])).bond_atto!==action.expected_bond_atto)throw new AppError('The bond changed. Read the record and agree to the current amount.',409);
      value=BigInt(action.expected_bond_atto);break;
    }
    case 'respond':target=action.claim_id;contract='court';method='respond';args=[action.claim_id,action.policy_url,action.licence_id,action.accepted_used_at,action.accepted_terms_version,action.policy_hash];if((await read<{bond_atto:string}>('court','get_account',[accountFor(subject).address])).bond_atto!==action.expected_bond_atto)throw new AppError('The bond changed. Read the record and agree to the current amount.',409);
      value=BigInt(action.expected_bond_atto);break;
    case 'propose_time':case 'accept_time':target=action.claim_id;contract='court';method=action.kind==='propose_time'?'propose_use_time':'accept_use_time';args=[action.claim_id,action.used_at,action.terms_version];break;
    case 'rule':case 'settle':case 'cancel':case 'recover':target=action.claim_id;contract='court';method=action.kind==='cancel'?'cancel_unanswered':action.kind==='recover'?'recover_hearing':action.kind;args=[action.claim_id];break;
    case 'release':target=action.licence_id;contract='desk';method='release_fee';args=[action.licence_id];break;
    case 'withdraw':contract=action.contract;method='withdraw';break;
    case 'appeal': {
      const claim=await read<Claim>('court','get_claim',[action.claim_id]);
      if(claim.status!=='RULED') throw new AppError('This claim is not awaiting an appeal.');
      target=action.claim_id;contract='court';method='appeal_claim';args=[action.claim_id];
      const round=(claim.appeals?.length||0)+1,bond=BigInt(claim.bond_atto)*2n**BigInt(round);
      if(action.expected_round!==round||action.expected_bond_atto!==bond.toString())throw new AppError('The review round or bond changed. Read the record before approving another review.',409);
      value=BigInt(action.expected_bond_atto);break;
    }
  }
  if(value>0n && await chain.getBalance({address:accountFor(subject).address})<value) throw new AppError('You need more Studio credits for this fee or bond. Add credits in your account.',402);
  const token=randomUUID();
  const rows=await sql`INSERT INTO tithe_operations(id,subject,idempotency_key,request_hash,kind,status,action_json,contract_name,contract_address,function_name,target_id,lease_token,lease_until) VALUES(${id},${subject},${idempotency},${requestHash},${action.kind},'SUBMITTING',${JSON.stringify(action)}::jsonb,${contract},${addresses[contract]},${method},${target},${token},now()+interval '2 minutes') ON CONFLICT(subject,idempotency_key) DO NOTHING RETURNING *`.catch(error=>{
    if(error.code==='23505') throw new AppError('Your earlier signed request is being recovered. Open its activity record before submitting another payment.',409);
    throw error;
  });
  if(!rows[0]){
    const winner=await sql`SELECT * FROM tithe_operations WHERE subject=${subject} AND idempotency_key=${idempotency}`;
    if(winner[0].request_hash!==requestHash)throw new AppError('Request key conflict.',409);
    return publicOperation(winner[0] as StoredOperation);
  }
  try{
    const client=signer(subject,async raw=>{
      const nonce=String(parseTransaction(raw).nonce),hash=keccak256(raw);
      const persisted=await sql`UPDATE tithe_operations SET tx_hash=${hash},outbox_ciphertext=${sealTransaction(raw,subject,id)},outbox_nonce=${nonce},status='SIGNED',updated_at=now() WHERE id=${id} AND subject=${subject} AND lease_token=${token} AND lease_until>now() AND tx_hash IS NULL AND status='SUBMITTING' RETURNING id`;
      if(!persisted[0])throw new AppError('This signing lease ended. No replacement transaction was broadcast.',409);
    });
    const hash=await client.writeContract({address:addresses[contract] as `0x${string}`,functionName:method,args,value});
    await sql`UPDATE tithe_operations SET tx_hash=${hash},status='PENDING',lease_token=NULL,lease_until=NULL,next_retry_at=now(),updated_at=now() WHERE id=${id} AND subject=${subject} AND lease_token=${token}`;
  }catch{
    await sql`UPDATE tithe_operations SET status=CASE WHEN tx_hash IS NULL THEN 'ABORTED' ELSE 'SUBMISSION_UNCERTAIN' END,error=CASE WHEN tx_hash IS NULL THEN 'Nothing was sent. You can approve a new request.' ELSE 'The signed request is saved and will be recovered without a second payment.' END,lease_token=NULL,lease_until=NULL,next_retry_at=now(),updated_at=now() WHERE id=${id} AND subject=${subject} AND lease_token=${token}`;
  }
  const saved=await sql`SELECT * FROM tithe_operations WHERE id=${id} AND subject=${subject}`;
  return publicOperation(saved[0] as StoredOperation);
}

export async function resumeOperation(subject:string,id:string){
  const sql=database();await abortExpiredUnsent(subject);
  const rows=await sql`SELECT * FROM tithe_operations WHERE id=${id} AND subject=${subject}`;
  const op=rows[0] as StoredOperation|undefined;
  if(!op)throw new AppError('Operation not found.',404);
  if(!op.tx_hash||!op.outbox_ciphertext||!['SIGNED','SUBMISSION_UNCERTAIN','RECOVERING'].includes(op.status))return refreshOperation(subject,id);
  const token=randomUUID();
  const leased=await sql`UPDATE tithe_operations SET lease_token=${token},lease_until=now()+interval '90 seconds',status='RECOVERING',updated_at=now() WHERE id=${id} AND subject=${subject} AND status IN ('SIGNED','SUBMISSION_UNCERTAIN','RECOVERING') AND (lease_until IS NULL OR lease_until<now()) AND next_retry_at<=now() RETURNING *`;
  if(!leased[0])return publicOperation(op);
  try{
    const raw=openTransaction(op.outbox_ciphertext,subject,id);
    await validateSavedTransaction(raw,op.tx_hash,accountFor(subject).address,op.outbox_nonce!);
    let known=false;
    try{await chain.getTransaction({hash:op.tx_hash as Hash});known=true;}catch{/* Only identical signed bytes can be replayed. */}
    if(!known){
      try{await chain.sendRawTransaction({serializedTransaction:raw});}
      catch{await chain.getTransaction({hash:op.tx_hash as Hash});}
    }
    await sql`UPDATE tithe_operations SET status='PENDING',error=NULL,lease_token=NULL,lease_until=NULL,next_retry_at=now(),updated_at=now() WHERE id=${id} AND subject=${subject} AND lease_token=${token}`;
  }catch{
    const delay=retryDelay(op.attempts+1);
    await sql`UPDATE tithe_operations SET status='SUBMISSION_UNCERTAIN',attempts=attempts+1,next_retry_at=now()+${delay}*interval '1 second',lease_token=NULL,lease_until=NULL,error='The original signed request is waiting for the network. Its payment will not be duplicated.',updated_at=now() WHERE id=${id} AND subject=${subject} AND lease_token=${token}`;
  }
  return refreshOperation(subject,id);
}

export async function refreshOperation(subject: string, id: string) {
  const sql=database();await abortExpiredUnsent(subject);
  const rows=await sql`SELECT * FROM tithe_operations WHERE id=${id} AND subject=${subject}`;
  const op=rows[0] as StoredOperation|undefined;
  if(!op)throw new AppError('Operation not found.',404);
  if(!op.tx_hash)return publicOperation(op);
  let tx;
  try{tx=await chain.getTransaction({hash:op.tx_hash as Hash});}
  catch{await sql`UPDATE tithe_operations SET next_retry_at=now()+interval '1 minute',updated_at=now() WHERE id=${id} AND subject=${subject}`;return publicOperation(op);}
  const state=operationState(tx),success=executionSucceeded(tx),decided=['ACCEPTED','FINALIZED'].includes(state);
  const error=state==='FAILED'?'The current network result did not apply this request.':null;
  const result=success&&decided?{record_id:op.target_id,contract:op.contract_name,method:op.function_name}:null;
  const changed=op.status!==state||!op.indexed;
  let indexed=op.indexed;
  if(success&&decided&&changed){try{if(op.target_id)await reconcileTarget(op.contract_name,op.target_id);indexed=true;}catch{indexed=false;}}
  await sql`UPDATE tithe_operations SET status=${state},error=${error},result=${result?JSON.stringify(result):null}::jsonb,indexed=${indexed},next_retry_at=now()+interval '20 seconds',updated_at=now(),lease_token=CASE WHEN ${decided||state==='FAILED'||state==='CANCELED'} THEN NULL ELSE lease_token END WHERE id=${id} AND subject=${subject}`;
  return publicOperation(normalize({...op,status:state,error,result:result||undefined,indexed}));
}
