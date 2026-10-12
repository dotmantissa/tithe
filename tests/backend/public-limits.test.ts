import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({sql:vi.fn(),calls:[] as unknown[][]}));
vi.mock('../../src/lib/db',()=>({database:()=>m.sql}));
import {limitPublic} from '../../src/lib/security';
import {rpcClass,withRpcClass} from '../../src/lib/rpc-context';
import {rpcReservationQuery} from '../../src/lib/rpc-reservation';
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('VERCEL','');vi.stubEnv('TRUSTED_CLIENT_IP_HEADER','');m.sql.mockResolvedValue([{count:1}]);});
it('does not trust caller-supplied forwarding headers on a self-hosted server',async()=>{
 await limitPublic(new Request('https://tithe.example/api/stats',{headers:{'x-forwarded-for':'8.8.8.8'}}));const first=m.sql.mock.calls[0][1];m.sql.mockClear();await limitPublic(new Request('https://tithe.example/api/stats',{headers:{'x-forwarded-for':'1.1.1.1'}}));expect(m.sql.mock.calls[0][1]).toBe(first);
});
it('limits callers using the platform-overwritten IP header',async()=>{
 vi.stubEnv('VERCEL','1');await limitPublic(new Request('https://tithe.example/api/stats',{headers:{'x-vercel-forwarded-for':'8.8.8.8'}}));const first=m.sql.mock.calls[0][1];m.sql.mockClear();await limitPublic(new Request('https://tithe.example/api/stats',{headers:{'x-vercel-forwarded-for':'1.1.1.1'}}));expect(m.sql.mock.calls[0][1]).not.toBe(first);
});
it('rejects excessive public requests before doing useful work',async()=>{
 m.sql.mockResolvedValue([{count:21}]);await expect(limitPublic(new Request('https://tithe.example/api/licences/anything'))).rejects.toMatchObject({status:429});
});
it('isolates concurrent public and recovery contexts',async()=>{
 const result=await Promise.all([withRpcClass('public',async()=>{await Promise.resolve();return rpcClass();}),withRpcClass('recovery',async()=>{await Promise.resolve();return rpcClass();})]);expect(result).toEqual(['public','recovery']);
});
it('uses the production reservation query for rolling class and total caps',()=>{
 const result=rpcReservationQuery('public');expect(result.params).toEqual(['public',false]);expect(result.query).toContain('<80');expect(result.query).toContain('<10');expect(result.query).toContain('<300');expect(result.query).toContain('<25');expect(result.query).toContain('<400');expect(result.query).toContain('<35');expect(rpcReservationQuery('recovery').params).toEqual(['recovery',true]);expect(()=>rpcReservationQuery('public','untrusted;drop table')).toThrow();
});
