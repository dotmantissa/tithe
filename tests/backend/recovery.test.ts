import {beforeEach,it,expect,vi} from 'vitest';
import {privateKeyToAccount} from 'viem/accounts';
import {keccak256} from 'viem';
const m=vi.hoisted(()=>({sql:vi.fn(),get:vi.fn(),send:vi.fn(),address:'',row:{} as Record<string,unknown>}));
vi.mock('../../src/lib/db',()=>({database:()=>m.sql}));
vi.mock('../../src/lib/chain',()=>({accountFor:()=>({address:m.address}),chain:{getTransaction:m.get,sendRawTransaction:m.send},executionSucceeded:()=>true,operationState:()=> 'FINALIZED',normalize:(v:unknown)=>v,addresses:{}}));
vi.mock('../../src/lib/indexer',()=>({reconcileTarget:async()=>{}}));
import {resumeOperation,refreshOperation,publicOperation,abortExpiredUnsent} from '../../src/lib/operations';
import {sealTransaction} from '../../src/lib/outbox';
const account=privateKeyToAccount(('0x'+'1'.repeat(64)) as `0x${string}`);
beforeEach(async()=>{
 vi.clearAllMocks();vi.stubEnv('ACCOUNT_DERIVATION_SECRET','b'.repeat(64));m.address=account.address;
 const raw=await account.signTransaction({chainId:61999,type:'legacy',nonce:7,to:account.address,value:100n,gas:21000n,gasPrice:0n});
 m.row={id:'operation',subject:'owner',kind:'licence',status:'SIGNED',tx_hash:keccak256(raw),outbox_ciphertext:sealTransaction(raw,'owner','operation'),outbox_nonce:'7',attempts:0,indexed:true,contract_name:'desk',target_id:'record',function_name:'request_licence',created_at:'today'};
 m.sql.mockImplementation(async(strings:TemplateStringsArray,...values:unknown[])=>{
  const query=strings.join('?');
  if(query.startsWith('SELECT'))return values.includes('owner')?[{...m.row}]:[];
  if(query.includes("status='RECOVERING'")){if(m.row.lease_token)return [];m.row.lease_token=values[0];return [{...m.row}];}
  if(query.includes("status='PENDING'")){m.row.status='PENDING';m.row.lease_token=null;}
  if(query.includes('attempts=attempts+1')){m.row.attempts=Number(m.row.attempts)+1;m.row.status='SUBMISSION_UNCERTAIN';m.row.lease_token=null;}
  return [];
 });
 m.get.mockResolvedValue({status:'FINALIZED'});m.send.mockResolvedValue(m.row.tx_hash);
});
it('recovers a lost broadcast using exactly the saved bytes and no new signature',async()=>{
 m.get.mockRejectedValueOnce(new Error('unknown'));
 await resumeOperation('owner','operation');
 expect(m.send).toHaveBeenCalledOnce();
 expect(keccak256(m.send.mock.calls[0][0].serializedTransaction)).toBe(m.row.tx_hash);
});
it('does not rebroadcast after the network accepted a request but the response was lost',async()=>{
 const op=await resumeOperation('owner','operation');expect(m.send).not.toHaveBeenCalled();expect(op.result?.record_id).toBe('record');
});
it('only the lease winner can recover a signed payment',async()=>{
 await Promise.all([resumeOperation('owner','operation'),resumeOperation('owner','operation')]);
 expect(m.get.mock.calls.length).toBeLessThanOrEqual(3);expect(m.send).not.toHaveBeenCalled();
});
it('keeps a failed broadcast recoverable instead of replacing or abandoning the payment',async()=>{
 m.get.mockRejectedValue(new Error('offline'));m.send.mockRejectedValue(new Error('offline'));
 const op=await resumeOperation('owner','operation');expect(op.status).toBe('SUBMISSION_UNCERTAIN');expect(m.row.attempts).toBe(1);
 expect(m.sql.mock.calls.some(([s])=>s.join('').includes('next_retry_at=now()+'))).toBe(true);
});
it('refuses operation recovery by another subject',async()=>{await expect(resumeOperation('stranger','operation')).rejects.toMatchObject({status:404});expect(m.send).not.toHaveBeenCalled();});
it('does not broadcast a damaged encrypted outbox',async()=>{m.row.outbox_ciphertext='broken';await resumeOperation('owner','operation');expect(m.send).not.toHaveBeenCalled();expect(m.row.status).toBe('SUBMISSION_UNCERTAIN');});
it('returns only the public projection even for an unsigned or inaccessible network request',async()=>{
 m.get.mockRejectedValue(new Error('offline'));
 const op=await refreshOperation('owner','operation');expect(Object.keys(op).sort()).toEqual(['created_at','error','id','kind','status','tx_hash']);
 expect(JSON.stringify(publicOperation(m.row as never))).not.toContain('outbox');
});
it('aborts only unsigned expired leases and never clears a saved payment',async()=>{
 await abortExpiredUnsent('owner');const query=m.sql.mock.calls[0][0].join('');
 expect(query).toContain('tx_hash IS NULL');expect(query).toContain('outbox_ciphertext IS NULL');expect(query).toContain('lease_until');
});

it('does not expose funding confirmation as a completed licence',()=>{
 const op=publicOperation({...m.row,phase:'FUNDING',status:'FINALIZED'} as never);expect(op.status).toBe('FUNDING');expect(op.result).toBeUndefined();
});
