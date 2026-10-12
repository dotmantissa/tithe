import {beforeEach,it,expect,vi} from 'vitest';
import {TransactionHashVariant} from 'genlayer-js/types';
const m=vi.hoisted(()=>({read:vi.fn(),sql:vi.fn(),cache:new Map<string,unknown>()}));
vi.mock('genlayer-js',()=>({createClient:()=>({readContract:m.read}),createAccount:vi.fn()}));
vi.mock('../../src/lib/db',()=>({database:()=>m.sql}));
import {read} from '../../src/lib/chain';
beforeEach(()=>{
 vi.clearAllMocks();m.cache.clear();vi.stubEnv('DATABASE_URL','test');
 m.sql.mockImplementation(async(s:TemplateStringsArray,...v:unknown[])=>{
  if(s.join('').startsWith('SELECT'))return m.cache.has(String(v[0]))?[{value:m.cache.get(String(v[0]))}]:[];
  m.cache.set(String(v[0]),JSON.parse(String(v[1])));return [];
 });
 m.read.mockResolvedValue({found:true,record:{decision:'APPROVE'}});
});
it('explicitly reads finalized state for shared receipts',async()=>{
 await read('desk','get_licence',['record']);expect(m.read).toHaveBeenCalledWith(expect.objectContaining({transactionHashVariant:TransactionHashVariant.LATEST_FINAL,functionName:'lookup_licence'}));
});
it('keeps final and nonfinal cache keys distinct',async()=>{
 await read('desk','get_licence',['record']);m.read.mockResolvedValue({found:true,record:{decision:'REFUSE'}});
 expect(await read('desk','get_licence',['record'],false,TransactionHashVariant.LATEST_NONFINAL)).toEqual({decision:'REFUSE'});
 expect(await read('desk','get_licence',['record'])).toEqual({decision:'APPROVE'});expect(m.read).toHaveBeenCalledTimes(2);
});
it('caches only explicitly confirmed missing membership',async()=>{
 m.read.mockResolvedValue({found:false});await expect(read('court','get_claim',['absent'])).rejects.toMatchObject({status:404});
 await expect(read('court','get_claim',['absent'])).rejects.toMatchObject({status:404});expect(m.read).toHaveBeenCalledOnce();
});
it('does not cache network errors or infer absence from them',async()=>{
 m.read.mockRejectedValue(new Error('offline'));await expect(read('desk','get_licence',['retry'])).rejects.toThrow('offline');await expect(read('desk','get_licence',['retry'])).rejects.toThrow('offline');expect(m.read).toHaveBeenCalledTimes(2);expect(m.cache.size).toBe(0);
});
it('coalesces concurrent misses without duplicating chain requests',async()=>{
 await Promise.all(Array.from({length:8},()=>read('desk','get_licence',['same'])));expect(m.read).toHaveBeenCalledOnce();
});
it('a fresh finalized refresh bypasses a cached absence',async()=>{
 m.read.mockResolvedValue({found:false});await expect(read('desk','get_licence',['new'])).rejects.toMatchObject({status:404});m.read.mockResolvedValue({found:true,record:{decision:'APPROVE'}});expect(await read('desk','get_licence',['new'],true)).toEqual({decision:'APPROVE'});
});
