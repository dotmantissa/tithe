import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn(),sql:vi.fn(),changed:false,count:0}));
vi.mock('../../src/lib/chain',()=>({addresses:{registry:'registry',desk:'desk',court:'court'},read:m.read}));
vi.mock('../../src/lib/db',()=>({database:()=>m.sql}));
import {syncIndex,reconcileTarget} from '../../src/lib/indexer';
beforeEach(()=>{
 vi.clearAllMocks();m.changed=false;m.count=0;
 m.sql.mockImplementation(async(s:TemplateStringsArray)=>s.join('').includes('RETURNING *')?[{cursor:0,revision:null,generation:null}]:[]);
 let snaps=0;
 m.read.mockImplementation(async(_c:string,method:string,args:number[])=>{
  if(method==='get_snapshot'){snaps++;return {count:m.count,revision:m.changed&&snaps%2===0?2:1};}
  if(method.startsWith('list'))return Array.from({length:Math.min(args[1],m.count-args[0])},(_,i)=>({work_id:'work'+(args[0]+i),title:'Real record',kind:'text',creator:'creator',licence_id:'licence'+i,holder:'holder',claim_id:'claim'+i,claimant:'claimant'}));
  return {work_id:'one',creator:'creator',title:'Single',kind:'text'};
 });
});
it('prunes removed records after an independently checked stable snapshot',async()=>{
 const result=await syncIndex();expect(result.completed).toBe(3);expect(m.sql.mock.calls.filter(([s])=>s.join('').startsWith('DELETE')).length).toBe(3);
});
it('never deletes records when the snapshot changes mid scan',async()=>{
 m.changed=true;await syncIndex();expect(m.sql.mock.calls.some(([s])=>s.join('').startsWith('DELETE'))).toBe(false);
});
it('bounds large scans and gives each contract progress instead of starving later collections',async()=>{
 m.count=1000;await syncIndex({pages:6});
 expect(m.read.mock.calls.filter(([,method])=>method.startsWith('list')).map(([c])=>c)).toEqual(['registry','registry','desk','desk','court','court']);
 expect(m.sql.mock.calls.some(([s])=>s.join('').startsWith('DELETE'))).toBe(false);
});
it('stops work at the global deadline',async()=>{await syncIndex({deadline:Date.now()-1});expect(m.read).not.toHaveBeenCalled();});
it('refreshes an operation target without scanning global collections',async()=>{
 await reconcileTarget('registry','one');expect(m.read).toHaveBeenCalledWith('registry','get_work',['one'],true);expect(m.read).toHaveBeenCalledOnce();
});
it('does not interpret provider failure as authoritative removal',async()=>{
 m.read.mockRejectedValue(new Error('offline'));await expect(syncIndex()).rejects.toThrow('offline');expect(m.sql.mock.calls.some(([s])=>s.join('').startsWith('DELETE'))).toBe(false);
});
