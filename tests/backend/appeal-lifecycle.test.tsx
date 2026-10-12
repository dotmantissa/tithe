// @vitest-environment jsdom
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {act,cleanup,render,screen} from '@testing-library/react';
import {Suspense} from 'react';
const auth=vi.hoisted(()=>({user:{id:'email-user'},authenticated:true,ready:true,getAccessToken:async()=> 'test-session'}));
vi.mock('@privy-io/react-auth',()=>({usePrivy:()=>auth}));
vi.mock('next/navigation',()=>({usePathname:()=>'/docket/'+ 'a'.repeat(64)}));
import ClaimDetail from '../../src/app/docket/[id]/page';
const id='a'.repeat(64),opid='12345678-1234-4234-8234-123456789012',address='0x'+'1'.repeat(40);
let polls=0,reads=0;
beforeEach(()=>{vi.useFakeTimers();polls=0;reads=0;localStorage.clear();localStorage.setItem('tithe:operation:v2:email-user:/docket/'+id,JSON.stringify({id:opid,key:'persisted-appeal-request'}));
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>{
  let result:unknown;
  if(input.startsWith('/api/operations/')){polls++;result={id:opid,kind:'appeal',status:polls>=3?'FINALIZED':polls===1?'PENDING':'ACCEPTED',tx_hash:'0x'+'2'.repeat(64),created_at:'2026-01-01'};}
  else if(input.startsWith('/api/docket/')){reads++;result={claim_id:id,work_id:'b'.repeat(64),claimant:address,respondent:'0x'+'3'.repeat(40),output_url:'https://example.org/output',output_hash:'c'.repeat(64),used_at:1000,terms_version:1,status:polls>=3?'RULED':'REVIEW_PENDING',filed_at:1000,response_deadline:9999999999,hearing_deadline:9999999999,bond_atto:'100',time_agreed:true,policy_url:'',licence_id:'',settle_after:9999999999,ruling:{decision:polls>=3?'DERIVATIVE_WITHIN_TERMS':'USE',clause:'C1',terms_version:1,terms_basis:'USE_TERMS',reason:polls>=3?'The reviewed use follows the terms.':'Earlier outcome.',damages_band:polls>=3?'NONE':'HIGH',distance_ppm:10,policy_hash:''},appeals:[]};}
  else if(input==='/api/clock')result={unix_seconds:2000};
  else result={address,balance_atto:'10000',credit_atto:'0',court_credit_atto:'0',bond_atto:'100',works:[],licences:[],claims:[],operations:[]};
  return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
 }));
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
it('restores the saved appeal, polls its hash through finality, refreshes chain state and exits the review screen',async()=>{
 const params=Promise.resolve({id});await act(async()=>{render(<Suspense fallback={<p>Opening record</p>}><ClaimDetail params={params}/></Suspense>);await params;});
 expect(screen.getByRole('heading',{level:1}).textContent).toContain('Review in progress');expect(polls).toBe(1);
 await act(async()=>{await vi.advanceTimersByTimeAsync(12000);});expect(polls).toBe(2);expect(reads).toBeGreaterThanOrEqual(2);
 await act(async()=>{await vi.advanceTimersByTimeAsync(15000);});
 expect(polls).toBe(3);expect(reads).toBeGreaterThanOrEqual(3);
 expect(screen.getByRole('heading',{level:1}).textContent).toContain('Use within the terms');
 expect(screen.queryByRole('button',{name:'Request the fresh hearing'})).toBeNull();expect(screen.getByText('The reviewed use follows the terms.')).toBeTruthy();
 expect(localStorage.getItem('tithe:operation:v2:email-user:/docket/'+id)).toBeNull();
 const calls=vi.mocked(fetch).mock.calls.map(c=>String(c[0]));expect(calls.filter(p=>p==='/api/operations/'+opid).length).toBe(3);expect(calls).not.toContain('/api/actions');
});
it('continues recovery polling after a saved uncertain broadcast without submitting a new action',async()=>{
 vi.mocked(fetch).mockImplementation(async(input)=>new Response(JSON.stringify(String(input).includes('/operations/')?{id:opid,kind:'appeal',status:'SUBMISSION_UNCERTAIN',tx_hash:'0x'+'2'.repeat(64),created_at:'2026-01-01'}:{unix_seconds:2000}),{headers:{'Content-Type':'application/json'}}));
 // Test the production hook directly so a malformed record fixture cannot hide the recovery path.
 const {useAction}=await import('../../src/components/ui');function Recovery(){const action=useAction();return <p>{action.operation?.status||'Opening'}</p>;}
 await act(async()=>{render(<Recovery/>);});await act(async()=>{await vi.advanceTimersByTimeAsync(12000);});
 expect(vi.mocked(fetch).mock.calls.some(([url,init])=>String(url)==='/api/operations/'+opid+'/resume'&&init?.method==='POST')).toBe(true);
 expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url)==='/api/actions')).toBe(false);
});
