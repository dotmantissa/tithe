import { randomUUID } from 'node:crypto';
import { keccak256 } from 'viem';
import type { CalldataEncodable, Hash } from 'genlayer-js/types';
import { accountFor, addresses, chain, executionSucceeded, operationState, normalize, read, signer, type ContractName } from './chain';
import { database } from './db';
import { AppError } from './errors';
import { digest, limit } from './security';
import { inspectArtifact } from './artifacts';
import { syncIndex } from './indexer';
import type { Action } from './schemas';
import type { Work, Operation, Claim } from './types';

export async function submit(subject: string, action: Action, idempotency: string): Promise<Operation> {
  if (!/^[a-zA-Z0-9:_-]{16,100}$/.test(idempotency)) throw new AppError('Provide an Idempotency-Key of 16 to 100 characters.');
  const sql=database();
  const requestHash=digest(JSON.stringify(action));
  const existing=await sql`SELECT * FROM tithe_operations WHERE subject=${subject} AND idempotency_key=${idempotency}`;
  if(existing[0]) {
    if(existing[0].request_hash!==requestHash) throw new AppError('That request key already belongs to a different action.',409);
    return existing[0] as Operation;
  }
  await limit(subject,12);
  let contract: ContractName='registry', method='', args: CalldataEncodable[]=[], value=0n;
  switch(action.kind) {
    case 'register': {
      const artifact=await inspectArtifact(action.url);
      if(artifact.content_hash!==action.content_hash) throw new AppError('The work changed after preview. Fetch it again before registering.');
      method='register_work';args=[action.url,action.content_hash,action.terms_text,JSON.stringify(action.prices),action.licence_class,action.title];break;
    }
    case 'terms': method='update_terms';args=[action.work_id,action.terms_text,JSON.stringify(action.prices),action.licence_class];break;
    case 'licence': {
      const work=await read<Work>('registry','get_work',[action.work_id]);
      const price=work.terms.price_schedule_atto[action.use_class];
      if(price===undefined) throw new AppError('The creator has not priced that use.');
      if(work.version!==action.expected_terms_version||price!==action.expected_fee_atto) throw new AppError('The terms or price changed. Read the latest terms and agree to the current fee before trying again.',409);
      value=BigInt(action.expected_fee_atto);contract='desk';method='request_licence';args=[action.work_id,action.intended_use_text,action.use_class,action.expected_terms_version,action.expected_fee_atto];break;
    }
    case 'claim': {
      const artifact=await inspectArtifact(action.output_url);
      if(artifact.content_hash!==action.output_hash) throw new AppError('The output changed after preview. Fetch it again.');
      contract='court';method='file_claim';args=[action.work_id,action.output_url,action.output_hash,action.respondent,action.used_at,action.terms_version];
      value=BigInt((await read<{bond_atto:string}>('court','get_account',[accountFor(subject).address])).bond_atto);break;
    }
    case 'respond': contract='court';method='respond';args=[action.claim_id,action.policy_url,action.licence_id,action.accepted_used_at,action.accepted_terms_version,action.policy_hash];value=BigInt((await read<{bond_atto:string}>('court','get_account',[accountFor(subject).address])).bond_atto);break;
    case 'propose_time':case 'accept_time':contract='court';method=action.kind==='propose_time'?'propose_use_time':'accept_use_time';args=[action.claim_id,action.used_at,action.terms_version];break;
    case 'rule':case 'settle':case 'cancel':case 'recover': contract='court';method=action.kind==='cancel'?'cancel_unanswered':action.kind==='recover'?'recover_hearing':action.kind;args=[action.claim_id];break;
    case 'release':contract='desk';method='release_fee';args=[action.licence_id];break;
    case 'withdraw':contract=action.contract;method='withdraw';break;
    case 'appeal': {
      const claim=await read<Claim>('court','get_claim',[action.claim_id]);
      if(claim.status!=='RULED') throw new AppError('This claim is not awaiting an appeal.');
      contract='court';method='appeal_claim';args=[action.claim_id];
      value=BigInt(claim.bond_atto)*2n**BigInt((claim.appeals?.length||0)+1);break;
    }
  }
  if(value>0n && await chain.getBalance({address:accountFor(subject).address})<value) throw new AppError('You need more Studio credits for this fee or bond. Add credits in your account.',402);
  const id=randomUUID();
  const rows=await sql`INSERT INTO tithe_operations(id,subject,idempotency_key,request_hash,kind,status) VALUES(${id},${subject},${idempotency},${requestHash},${action.kind},'SUBMITTING') ON CONFLICT(subject,idempotency_key) DO NOTHING RETURNING *`.catch(error=>{
    if(error.code==='23505') throw new AppError('Your previous request is still submitting. Check your desk before sending another.',409);
    throw error;
  });
  if(!rows[0]) {
    const winner=await sql`SELECT * FROM tithe_operations WHERE subject=${subject} AND idempotency_key=${idempotency}`;
    if(winner[0].request_hash!==requestHash) throw new AppError('Request key conflict.',409);
    return winner[0] as Operation;
  }
  try {
    const client=signer(subject,async raw=>{
      // Persist the Studio transaction hash before broadcasting. A dropped
      // response can then be reconciled without submitting a second payment.
      await sql`UPDATE tithe_operations SET tx_hash=${keccak256(raw)},status='SIGNED' WHERE id=${id}`;
    });
    const hash=await client.writeContract({address:addresses[contract] as `0x${string}`,functionName:method,args,value});
    await sql`UPDATE tithe_operations SET tx_hash=${hash},status='PENDING' WHERE id=${id}`;
    return {...rows[0],tx_hash:hash,status:'PENDING'} as Operation;
  } catch(error) {
    const message=error instanceof AppError?error.message:'The network did not confirm submission. Check this operation before trying again.';
    await sql`UPDATE tithe_operations SET status='SUBMISSION_UNCERTAIN',error=${message} WHERE id=${id}`;
    throw new AppError(message,503);
  }
}

export async function refreshOperation(subject: string, id: string) {
  const sql=database();
  const rows=await sql`SELECT * FROM tithe_operations WHERE id=${id} AND subject=${subject}`;
  const op=rows[0] as (Operation & {indexed:boolean}) | undefined;
  if(!op) throw new AppError('Operation not found.',404);
  if(!op.tx_hash) return op;
  const tx=await chain.getTransaction({hash:op.tx_hash as Hash});
  const state=operationState(tx);
  const decided=['ACCEPTED','FINALIZED'].includes(state);
  const success=executionSucceeded(tx);
  const error=state==='FAILED'?'The panel could not complete this request. No confirmed state change was applied.':null;
  let indexed=op.indexed;
  if(success && decided && !indexed) {
    try{await syncIndex();indexed=true;}catch{/* Chain status remains available while the index catches up. */}
  }
  await sql`UPDATE tithe_operations SET status=${state},error=${error},indexed=${indexed} WHERE id=${id}`;
  return normalize({...op,status:state,error});
}
