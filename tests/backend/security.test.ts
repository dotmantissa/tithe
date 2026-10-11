import { describe,it,expect } from 'vitest';
import { artifactURL,isPublicAddress } from '../../src/lib/artifacts';
import { actionSchema } from '../../src/lib/schemas';
import { checkOrigin,authenticate,digest } from '../../src/lib/security';
import { executionSucceeded,normalize } from '../../src/lib/chain';
import { failure,AppError } from '../../src/lib/errors';

describe('artifact fetch boundary',()=>{
  it.each(['127.0.0.1','10.2.3.4','172.16.0.1','172.31.4.2','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','224.1.1.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1','2001:db8::1'])('rejects private or reserved %s',ip=>expect(isPublicAddress(ip)).toBe(false));
  it.each(['8.8.8.8','1.1.1.1','172.32.0.1','2606:4700:4700::1111'])('allows public %s',ip=>expect(isPublicAddress(ip)).toBe(true));
  it.each(['http://example.org/a','https://user:password@example.org/a','https://example.org:8443/a','https://example.org/a#fragment','not a url'])('rejects unsafe URL %s',url=>expect(()=>artifactURL(url)).toThrow());
  it('retains the canonical URL',()=>expect(artifactURL('https://example.org/work.txt').href).toBe('https://example.org/work.txt'));
});
describe('authorization and origin',()=>{
  it('requires authentication before account actions',async()=>await expect(authenticate(new Request('https://tithe.example/api/account'))).rejects.toMatchObject({status:401}));
  it('rejects browser calls from another site',()=>expect(()=>checkOrigin(new Request('https://tithe.example/api/actions',{headers:{Origin:'https://intruder.example'}}))).toThrow());
  it('accepts the application origin and an agent request without Origin',()=>{
    expect(()=>checkOrigin(new Request('https://tithe.example/api/actions',{headers:{Origin:'https://tithe.example'}}))).not.toThrow();
    expect(()=>checkOrigin(new Request('https://tithe.example/api/actions'))).not.toThrow();
  });
  it('stores only a fixed digest for API keys',()=>{expect(digest('tithe_example')).toMatch(/^[a-f0-9]{64}$/);expect(digest('tithe_example')).not.toContain('example');});
});
describe('request validation',()=>{
  const register={kind:'register',title:'An actual work',url:'https://example.org/work.txt',content_hash:'a'.repeat(64),terms_text:'Research is permitted with attribution.',prices:{research:'0'},licence_class:'research'};
  it('allows a partial schedule and a free licence',()=>expect(actionSchema.parse(register)).toEqual(register));
  it.each([{prices:{research:-1}},{prices:{research:'-1'}},{prices:{research:'1.5'}},{prices:{research:(2n**128n).toString()}},{prices:{}}])('rejects invalid escrow prices %o',override=>expect(()=>actionSchema.parse({...register,...override})).toThrow());
  it('refuses a claim without a named respondent and timestamp',()=>expect(()=>actionSchema.parse({kind:'claim',work_id:'a'.repeat(64),output_url:'https://example.org/a',output_hash:'b'.repeat(64)})).toThrow());
  it('limits appeal requests to a concrete claim',()=>expect(()=>actionSchema.parse({kind:'appeal',operation_id:'invented'})).toThrow());
});
describe('chain results and error privacy',()=>{
  it('never treats finalization alone as execution success',()=>expect(executionSucceeded({statusName:'FINALIZED'} as Parameters<typeof executionSucceeded>[0])).toBe(false));
  it('checks actual execution',()=>expect(executionSucceeded({txExecutionResultName:'FINISHED_WITH_RETURN'} as Parameters<typeof executionSucceeded>[0])).toBe(true));
  it('converts chain maps without losing monetary precision',()=>expect(normalize(new Map([['fee',1000000000000000001n]]))).toEqual({fee:'1000000000000000001'}));
  it('does not expose a provider exception',async()=>{
    const response=failure(new Error('postgresql://private:secret@example.org/database'));
    expect(response.status).toBe(503);expect(JSON.stringify(await response.json())).not.toContain('secret');
  });
  it('returns a useful business error',async()=>expect(await failure(new AppError('Your session expired.',401)).json()).toEqual({error:'Your session expired.'}));
});
