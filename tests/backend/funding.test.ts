import {beforeEach,it,expect,vi} from 'vitest';
import {privateKeyToAccount} from 'viem/accounts';
import {keccak256} from 'viem';
const m=vi.hoisted(()=>({sql:vi.fn(),signer:vi.fn(),write:vi.fn(),get:vi.fn(),row:{} as Record<string,unknown>,signed:vi.fn(),claimed:false}));
vi.mock('../../src/lib/db',()=>({database:()=>m.sql}));
vi.mock('../../src/lib/chain',()=>({addresses:{desk:'0x'+'2'.repeat(40)},accountFor:()=>({address:'0x'+'1'.repeat(40)}),chain:{getTransaction:m.get},signer:m.signer,operationState:(v:{state:string})=>v.state,executionSucceeded:(v:{success:boolean})=>v.success,normalize:(v:unknown)=>v}));
vi.mock('../../src/lib/indexer',()=>({reconcileTarget:async()=>{}}));
import {refreshOperation} from '../../src/lib/operations';
const account=privateKeyToAccount(('0x'+'1'.repeat(64)) as `0x${string}`);
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('ACCOUNT_DERIVATION_SECRET','b'.repeat(64));m.claimed=false;
 m.row={id:'operation',subject:'owner',kind:'licence',phase:'FUNDING',status:'PENDING',tx_hash:'0x'+'a'.repeat(64),fund_atto:'100',contract_address:'0x'+'2'.repeat(40),contract_name:'desk',function_name:'request_licence',action_args:['work','approved description','commercial',1,'100','operation'],created_at:'today',target_id:'licence'};
 m.get.mockResolvedValue({state:'FINALIZED',success:true});
 m.sql.mockImplementation(async(s:TemplateStringsArray,...values:unknown[])=>{
  const q=s.join('?');if(q.startsWith('SELECT'))return [{...m.row}];
  if(q.includes("phase='ACTION',fund_hash")){
   if(m.claimed)return [];m.claimed=true;m.row={...m.row,phase:'ACTION',fund_hash:m.row.tx_hash,tx_hash:null,status:'SUBMITTING',lease_token:values[0]};return [{...m.row}];
  }
  if(q.includes('outbox_ciphertext=')&&!q.includes('outbox_ciphertext=NULL')){m.row.tx_hash=values[0];m.row.status='SIGNED';return [{id:'operation'}];}
  if(q.includes("status='PENDING'")){m.row.status='PENDING';return [];}
  if(q.includes('status=CASE')){m.row.status=m.row.tx_hash?'SUBMISSION_UNCERTAIN':'ABORTED';return [];}
  return [];
 });
 m.signer.mockImplementation((_subject:string,callback:(raw:`0x${string}`)=>Promise<void>)=>({writeContract:m.write.mockImplementation(async(params:{value:bigint})=>{const raw=await account.signTransaction({chainId:61999,type:'legacy',nonce:8,to:account.address,value:params.value,gas:21000n,gasPrice:0n});m.signed(raw);await callback(raw);return keccak256(raw);})}));
});
it('waits for actual funding finality and sends no approval action after acceptance alone',async()=>{
 m.get.mockResolvedValue({state:'ACCEPTED',success:true});const op=await refreshOperation('owner','operation');expect(op.status).toBe('FUNDING');expect(op.result).toBeUndefined();expect(m.signer).not.toHaveBeenCalled();
});
it('retains the funding hash and signs only the original consented action with zero native value',async()=>{
 const before=m.row.tx_hash;await refreshOperation('owner','operation');expect(m.row.fund_hash).toBe(before);expect(m.write).toHaveBeenCalledWith({address:'0x'+'2'.repeat(40),functionName:'request_licence',args:['work','approved description','commercial',1,'100','operation'],value:0n});expect(m.signed).toHaveBeenCalledOnce();
});
it('fences concurrent funding-to-action transitions so only one zero-value action is signed',async()=>{
 await Promise.all([refreshOperation('owner','operation'),refreshOperation('owner','operation')]);expect(m.signer).toHaveBeenCalledOnce();
});
it('keeps payment recovery separate from a crash before the second signature',async()=>{
 m.signer.mockImplementation(()=>{throw new Error('process interrupted');});const op=await refreshOperation('owner','operation');expect(op.status).toBe('ABORTED');expect(m.row.fund_hash).toBe('0x'+'a'.repeat(64));expect(m.row.tx_hash).toBeNull();expect(m.signed).not.toHaveBeenCalled();
});
it('never signs the action if funding itself finalized without successful execution',async()=>{
 m.get.mockResolvedValue({state:'FAILED',success:false});const op=await refreshOperation('owner','operation');expect(op.status).toBe('FAILED');expect(m.signer).not.toHaveBeenCalled();
});
