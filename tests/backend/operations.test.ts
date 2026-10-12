import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({read:vi.fn(),sign:vi.fn(),sql:vi.fn(),write:vi.fn()}));
vi.mock('../../src/lib/chain',()=>({read:mocks.read,signer:mocks.sign,accountFor:()=>({address:'0x'+'a'.repeat(40)}),addresses:{registry:'0x'+'1'.repeat(40),desk:'0x'+'2'.repeat(40),court:'0x'+'3'.repeat(40)},chain:{getBalance:async()=>100000n},executionSucceeded:()=>true,operationState:()=> 'FINALIZED',normalize:(v:unknown)=>v}));
vi.mock('../../src/lib/db',()=>({database:()=>mocks.sql}));
vi.mock('../../src/lib/security',()=>({digest:()=> 'hash',limit:async()=>{}}));
vi.mock('../../src/lib/indexer',()=>({reconcileTarget:async()=>{}}));
import {submit} from '../../src/lib/operations';
beforeEach(()=>{vi.clearAllMocks();mocks.sql.mockResolvedValue([]);mocks.read.mockResolvedValue({version:2,terms:{price_schedule_atto:{commercial:'1000'}}});});
const request={kind:'licence' as const,work_id:'b'.repeat(64),intended_use_text:'Use the passage with attribution.',use_class:'commercial' as const,expected_terms_version:1,expected_fee_atto:'10'};
it('does not sign or reserve a stale price and version',async()=>{
  await expect(submit('subject',request,'an-explicit-request-key')).rejects.toMatchObject({status:409});
  expect(mocks.sign).not.toHaveBeenCalled();
  expect(mocks.sql.mock.calls.every(([s])=>!(s as string[]).join('').includes('INSERT'))).toBe(true);
});
it('does not sign a changed fee even with the expected version',async()=>{
  await expect(submit('subject',{...request,expected_terms_version:2},'another-explicit-request-key')).rejects.toMatchObject({status:409});
  expect(mocks.sign).not.toHaveBeenCalled();
});
