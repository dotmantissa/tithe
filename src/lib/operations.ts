import {validateSignedAction} from './signed-action';
import {consentSeal,verifyConsent} from './consent';
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

type StoredOperation=Operation&{consent_seal:string;action_json:Action;phase:'FUNDING'|'ACTION';fund_hash:string|null;fund_atto:string;action_args:CalldataEncodable[];subject:string;idempotency_key:string;request_hash:string;contract_name:ContractName;contract_address:string;function_name:string;target_id:string|null;outbox_ciphertext:string|null;outbox_nonce:string|null;lease_token:string|null;lease_until:string|null;attempts:number;next_retry_at:string;indexed:boolean};

export function publicOperation(row:StoredOperation):Operation{
  return {id:row.id,kind:row.kind,status:row.phase==='FUNDING'&&['ACCEPTED','FINALIZED','PENDING'].includes(row.status)?'FUNDING':row.status,tx_hash:row.tx_hash,error:row.error,created_at:row.created_at,...(row.result?{result:row.result}:{})};
}
export async function abortExpiredUnsent(subject?:string){
  const sql=database();
  await sql`UPDATE tithe_operations SET status='ABORTED',error=CASE WHEN fund_hash IS NOT NULL THEN 'The action signing deadline passed. Its payment remains withdrawable credit.' ELSE 'The signing deadline passed before a transaction was saved. Nothing was sent.' END,lease_token=NULL,updated_at=now() WHERE (${subject||''}='' OR subject=${subject||''}) AND status='SUBMITTING' AND tx_hash IS NULL AND outbox_ciphertext IS NULL AND COALESCE(lease_until,created_at+interval '2 minutes') < now()`;
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
  if(value>0n && await chain.getBalance({address:accountFor(subject).address})+BigInt((await read<{credit_atto:string}>(contract,'get_account',[accountFor(subject).address],true)).credit_atto)<value) throw new AppError('You need more Studio credits for this fee or bond. Add credits in your account.',402);
  const credit=value>0n?BigInt((await read<{credit_atto:string}>(contract,'get_account',[accountFor(subject).address],true)).credit_atto):0n;
  const funding=value>credit?value-credit:0n;
  const phase=funding>0n?'FUNDING':'ACTION';
  const approval=consentSeal({subject,id,contract_name:contract,contract_address:addresses[contract],function_name:method,target_id:target,action_args:args,action_json:action,fund_atto:funding.toString()});
  const token=randomUUID();
  const rows=await sql`INSERT INTO tithe_operations(id,subject,idempotency_key,request_hash,kind,status,action_json,contract_name,contract_address,function_name,target_id,lease_token,lease_until,phase,fund_atto,action_args,consent_seal) VALUES(${id},${subject},${idempotency},${requestHash},${action.kind},'SUBMITTING',${JSON.stringify(action)}::jsonb,${contract},${addresses[contract]},${method},${target},${token},now()+interval '2 minutes',${phase},${funding.toString()},${JSON.stringify(args)}::jsonb,${approval}) ON CONFLICT(subject,idempotency_key) DO NOTHING RETURNING *`.catch(error=>{
    if(error.code==='23505') throw new AppError('Your earlier signed request is being recovered. Open its activity record before submitting another payment.',409);
    throw error;
  });
  if(!rows[0]){
    const winner=await sql`SELECT * FROM tithe_operations WHERE subject=${subject} AND idempotency_key=${idempotency}`;
    if(winner[0].request_hash!==requestHash)throw new AppError('Request key conflict.',409);
    return publicOperation(winner[0] as StoredOperation);
  }
  await signOperation(subject,rows[0] as StoredOperation,token);
  const saved=await sql`SELECT * FROM tithe_operations WHERE id=${id} AND subject=${subject}`;
  return publicOperation(saved[0] as StoredOperation);
}

class SavedForBroadcast extends Error {}
async function signOperation(subject:string,op:StoredOperation,token:string){
 const sql=database(),id=op.id;let signedRaw:`0x${string}`|undefined;
 try{
  verifyConsent({subject,id,contract_name:op.contract_name,contract_address:op.contract_address,function_name:op.function_name,target_id:op.target_id,action_args:op.action_args,action_json:op.action_json,fund_atto:op.fund_atto},op.consent_seal);
  const client=signer(subject,async raw=>{
   const nonce=String(parseTransaction(raw).nonce),hash=keccak256(raw);
   validateSignedAction(raw,accountFor(subject).address,op.contract_address,op.phase==='FUNDING'?'fund_credit':op.function_name,op.phase==='FUNDING'?[]:op.action_args,op.phase==='FUNDING'?BigInt(op.fund_atto):0n);
   await validateSavedTransaction(raw,hash,accountFor(subject).address,nonce);
   const persisted=await sql`UPDATE tithe_operations SET tx_hash=${hash},outbox_ciphertext=${sealTransaction(raw,subject,id+':'+op.phase)},outbox_nonce=${nonce},status='SIGNED',updated_at=now() WHERE id=${id} AND subject=${subject} AND lease_token=${token} AND lease_until>now() AND tx_hash IS NULL AND status='SUBMITTING' RETURNING id`;
   if(!persisted[0])throw new AppError('The signing lease ended before broadcast.',409);
   signedRaw=raw;throw new SavedForBroadcast();
  });
  try{await client.writeContract({address:op.contract_address as `0x${string}`,functionName:op.phase==='FUNDING'?'fund_credit':op.function_name,args:op.phase==='FUNDING'?[]:op.action_args,value:op.phase==='FUNDING'?BigInt(op.fund_atto):0n});}catch(error){if(!(error instanceof SavedForBroadcast))throw error;}
  if(!signedRaw)throw new AppError('No signed request was saved.',503);
  const hash=keccak256(signedRaw);await chain.sendRawTransaction({serializedTransaction:signedRaw});
  await sql`UPDATE tithe_operations SET tx_hash=${hash},status='PENDING',lease_token=NULL,lease_until=NULL,next_retry_at=now(),updated_at=now() WHERE id=${id} AND subject=${subject} AND lease_token=${token}`;
 }catch{
  await sql`UPDATE tithe_operations SET status=CASE WHEN tx_hash IS NULL THEN 'ABORTED' ELSE 'SUBMISSION_UNCERTAIN' END,error=CASE WHEN tx_hash IS NOT NULL THEN 'The original signed request is saved for recovery.' WHEN fund_hash IS NOT NULL THEN 'The action was not sent. Its payment remains available as withdrawable credit.' ELSE 'Nothing was sent. You can approve a new request.' END,lease_token=NULL,lease_until=NULL,next_retry_at=now(),updated_at=now() WHERE id=${id} AND subject=${subject} AND lease_token=${token}`;
 }
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
    const raw=openTransaction(op.outbox_ciphertext,subject,id+':'+(op.phase||'ACTION'));
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
  if(op.phase==='FUNDING'){
   if(state==='FINALIZED'&&success){
    const token=randomUUID();
    const transition=await sql`UPDATE tithe_operations SET phase='ACTION',fund_hash=tx_hash,tx_hash=NULL,outbox_ciphertext=NULL,outbox_nonce=NULL,status='SUBMITTING',lease_token=${token},lease_until=now()+interval '2 minutes',updated_at=now() WHERE id=${id} AND subject=${subject} AND phase='FUNDING' AND tx_hash=${op.tx_hash} RETURNING *`;
    if(transition[0])await signOperation(subject,transition[0] as StoredOperation,token);
    const current=await sql`SELECT * FROM tithe_operations WHERE id=${id} AND subject=${subject}`;return publicOperation(current[0] as StoredOperation);
   }
   await sql`UPDATE tithe_operations SET status=${state},next_retry_at=now()+interval '20 seconds',updated_at=now() WHERE id=${id} AND subject=${subject} AND phase='FUNDING'`;
   return publicOperation({...op,status:state});
  }
  const error=state==='FAILED'?'The network did not apply this action. Any funded amount remains withdrawable credit.':null;
  const result=success&&decided?{record_id:op.target_id,contract:op.contract_name,method:op.function_name}:null;
  const changed=op.status!==state||!op.indexed;
  let indexed=op.indexed;
  if(success&&decided&&changed){try{if(op.target_id)await reconcileTarget(op.contract_name,op.target_id);indexed=true;}catch{indexed=false;}}
  if(['FAILED','CANCELED'].includes(state)&&op.target_id&&['licence','claim'].includes(op.kind)){await sql`DELETE FROM tithe_records WHERE id=${op.target_id} AND deployment=${op.contract_address}`;indexed=true;}
  await sql`UPDATE tithe_operations SET status=${state},error=${error},result=${result?JSON.stringify(result):null}::jsonb,indexed=${indexed},next_retry_at=now()+interval '20 seconds',updated_at=now(),lease_token=CASE WHEN ${decided||state==='FAILED'||state==='CANCELED'} THEN NULL ELSE lease_token END WHERE id=${id} AND subject=${subject}`;
  return publicOperation(normalize({...op,status:state,error,result:result||undefined,indexed}));
}

export async function cancelOperation(subject:string,id:string){
 const sql=database(),rows=await sql`SELECT * FROM tithe_operations WHERE id=${id} AND subject=${subject}`;
 const op=rows[0] as StoredOperation|undefined;if(!op)throw new AppError('Operation not found.',404);
 if(op.phase!=='ACTION'||!op.tx_hash)throw new AppError('A funding transfer must finish safely before it can be withdrawn. Its signed request remains saved.',409);
 const tx=await chain.getTransaction({hash:op.tx_hash as Hash});
 if(!['PENDING','PROPOSING','COMMITTING','REVEALING','UNDETERMINED'].includes(operationState(tx)))throw new AppError('This request is already recorded. Read its result instead.',409);
 if(!op.outbox_ciphertext)throw new AppError('This earlier request needs operator recovery.',409);
 const raw=openTransaction(op.outbox_ciphertext,subject,id+':ACTION');if((parseTransaction(raw).value||0n)!==0n)throw new AppError('Native funding remains protected until it is credited.',409);await validateSavedTransaction(raw,op.tx_hash,accountFor(subject).address,op.outbox_nonce!);
 await signer(subject).cancelTransaction({hash:op.tx_hash as Hash});
 return refreshOperation(subject,id);
}
