import {beforeEach,it,expect,vi} from 'vitest';
import {rpcClass} from '../../src/lib/rpc-context';
import {AppError} from '../../src/lib/errors';
const m=vi.hoisted(()=>({limit:vi.fn(),read:vi.fn(),auth:vi.fn(),sql:vi.fn(),order:[] as string[]}));
vi.mock('../../src/lib/chain',()=>({addresses:{registry:'registry',desk:'desk',court:'court'},read:m.read,chain:{},accountFor:vi.fn()}));
vi.mock('../../src/lib/security',()=>({authenticate:m.auth,checkOrigin:vi.fn(),digest:vi.fn(),limit:vi.fn(),limitPublic:m.limit,readJSON:vi.fn()}));
vi.mock('../../src/lib/db',()=>({database:()=>m.sql}));
vi.mock('../../src/lib/operations',()=>({submit:vi.fn(),refreshOperation:vi.fn(),resumeOperation:vi.fn(),publicOperation:vi.fn(),cancelOperation:vi.fn()}));
vi.mock('../../src/lib/indexer',()=>({syncIndex:vi.fn()}));
import {handle} from '../../src/lib/api';
beforeEach(()=>{vi.clearAllMocks();m.order=[];m.limit.mockImplementation(async()=>{m.order.push('limit');});m.read.mockImplementation(async()=>{m.order.push('read');expect(rpcClass()).toBe('public');return {decision:'APPROVE',work_id:'a'.repeat(64),content_hash:'b'.repeat(64),kind:'text'};});});
it.each([['licences','a'.repeat(64)],['docket','a'.repeat(64)],['works','a'.repeat(64)],['works','a'.repeat(64),'terms-at']])('limits public %s access before any chain request',async(...segments)=>{
 const response=await handle(new Request('https://tithe.example/api/'+segments.join('/')+'?used_at=1000'),segments);expect(response.status).toBe(200);expect(m.order[0]).toBe('limit');expect(m.auth).not.toHaveBeenCalled();expect((await response.json()).finality).toEqual({status:'FINALIZED',state_variant:'latest-final'});
});
it('prevents exhausted callers from consuming any RPC capacity',async()=>{
 m.limit.mockRejectedValue(new AppError('Caller limit reached.',429));const response=await handle(new Request('https://tithe.example/api/licences/'+'a'.repeat(64)),['licences','a'.repeat(64)]);expect(response.status).toBe(429);expect(m.read).not.toHaveBeenCalled();
});
it('serves preserved bytes with integrity and attachment protections',async()=>{
 const {createHash}=await import('node:crypto');const bytes=Buffer.from('Committed document');m.read.mockResolvedValueOnce({work_id:'a'.repeat(64),content_hash:createHash('sha256').update(bytes).digest('hex'),kind:'text'}).mockResolvedValueOnce(bytes.toString('base64'));
 const response=await handle(new Request('https://tithe.example/api/works/'+'a'.repeat(64)+'/evidence'),['works','a'.repeat(64),'evidence']);expect(response.status).toBe(200);expect(await response.text()).toBe('Committed document');expect(response.headers.get('X-Tithe-State-Variant')).toBe('latest-final');expect(response.headers.get('Content-Disposition')).toContain('attachment');expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
});
