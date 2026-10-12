import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn(),sql:vi.fn(),changed:false,count:0}));
vi.mock('../../src/lib/chain',()=>({addresses:{registry:'registry',desk:'desk',court:'court'},read:m.read}));
vi.mock('../../src/lib/db',()=>({database:()=>m.sql}));
import {syncIndex,reconcileTarget} from '../../src/lib/indexer';
beforeEach(()=>{
 vi.clearAllMocks();m.changed=false;m.count=0;
 m.sql.mockImplementation(async(s:TemplateStringsArray,...values:unknown[])=>{const q=s.join('');if(q.includes('RETURNING *'))return [{cursor:0,revision:null,generation:null}];if(q.includes('RETURNING deployment'))return [{deployment:'registry'}];if(q.includes('RETURNING id')){const docs=values.find(v=>typeof v==='string'&&v.startsWith('['));return docs?JSON.parse(String(docs)).map((v:{id:string})=>({id:v.id})):[];}return [];});
 let snaps=0;
 m.read.mockImplementation(async(_c:string,method:string,args:number[])=>{
  if(method==='get_snapshot'){snaps++;return {count:m.count,revision:m.changed&&snaps%2===0?2:1};}
  if(method.startsWith('list'))return Array.from({length:Math.min(args[1],m.count-args[0])},(_,i)=>({work_id:'work'+(args[0]+i),title:'Real record',kind:'text',creator:'creator',licence_id:'licence'+i,holder:'holder',claim_id:'claim'+i,claimant:'claimant'}));
  return {work_id:'one',creator:'creator',title:'Single',kind:'text'};
 });
});
it('completes empty append-only collections without inferring deletion',async()=>{
 const result=await syncIndex();expect(result.completed).toBe(3);expect(m.sql.mock.calls.filter(([s])=>s.join('').startsWith('DELETE')).length).toBe(0);
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

it('rejects a stale page writer after its lease was replaced',async()=>{m.count=50;m.sql.mockImplementation(async(s:TemplateStringsArray)=>{const q=s.join('');if(q.includes('RETURNING *'))return [{cursor:0,revision:null,generation:null}];if(q.includes('RETURNING deployment'))return [{deployment:'registry'}];return [];});await expect(syncIndex()).rejects.toThrow('Index lease lost before page commit');expect(m.sql.mock.calls.some(([s])=>s.join('').startsWith('DELETE'))).toBe(false);});

it('reaches all 201 records across invocations despite a revision change every time',async()=>{
 const state:Record<string,Record<string,unknown>>={};let revision=1,count=201;
 m.sql.mockImplementation(async(s:TemplateStringsArray,...v:unknown[])=>{
  const q=s.join('');
  if(q.includes('RETURNING *')){const deployment=String(v[1]);return [state[deployment]||{cursor:0,revision:null,record_count:null,generation:null}];}
  if(q.includes('SET cursor=')&&q.includes('generation=')){state[String(v[4])]={cursor:v[0],generation:v[1],revision:v[2],record_count:v[3]};return [];}
  if(q.includes('SET cursor=')&&!q.includes('cursor=0')){state[String(v[1])].cursor=v[0];return [];}
  if(q.includes('SET cursor=0')){state[String(v[0])].cursor=0;return [{deployment:v[0]}];}
  if(q.includes('RETURNING deployment'))return [{deployment:v[0]}];
  if(q.includes('RETURNING id')){const docs=v.find(x=>typeof x==='string'&&x.startsWith('['));return docs?JSON.parse(String(docs)).map((x:{id:string})=>({id:x.id})):[];}
  return [];
 });
 m.read.mockImplementation(async(c:string,method:string,args:number[])=>{
  if(method==='get_snapshot')return {count:c==='registry'?count:0,revision};
  return Array.from({length:Math.min(args[1],count-args[0])},(_,i)=>({work_id:'work'+(args[0]+i),title:'Chain work',creator:'creator',kind:'text'}));
 });
 await syncIndex();revision++;count=205;await syncIndex();revision++;count=209;const result=await syncIndex();
 const offsets=m.read.mock.calls.filter(([c,method])=>c==='registry'&&method==='list_works').map(([, ,args])=>args[0]);
 expect(offsets).toEqual([0,50,100,150,200]);expect(result.completed).toBe(3);expect(state.registry.cursor).toBe(0);
 revision++;await syncIndex();expect(m.read.mock.calls.at(-3)?.[1]).toBeDefined();
 expect(m.sql.mock.calls.some(([s])=>s.join('').startsWith('DELETE'))).toBe(false);
});
