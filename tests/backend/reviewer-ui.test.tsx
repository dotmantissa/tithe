// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {act,cleanup,render,screen} from '@testing-library/react';
import {Suspense} from 'react';
const m=vi.hoisted(()=>({version:128,claim:{} as Record<string,unknown>,act:vi.fn()}));
vi.mock('@/components/ui',()=>({
 AuthGate:({children}:{children:React.ReactNode})=>children,
 useResource:(path:string)=>({loading:false,error:'',reload:vi.fn(),data:path==='account'?{address:'0x'+'1'.repeat(40),bond_atto:'100'}:path.startsWith('docket/')?m.claim:{work_id:'b'.repeat(64),creator:'0x'+'1'.repeat(40),title:'My registered work',version:m.version,terms_version_limit:128,terms:{terms_text:'Research is permitted.',licence_class:'research',price_schedule_atto:{research:'0'}}}}),
 useAction:()=>({act:m.act,busy:false}),useApi:()=>vi.fn(),useClock:()=>2000,
 Loading:()=>null,LoadError:()=>null,Notice:({children}:{children:React.ReactNode})=>children,
 OperationNotice:()=>null,CopyButton:()=>null,TermsAtUse:()=>null,date:()=> 'date',amount:(v:string)=>v,atto:(v:string)=>v,
}));
import TermsPage from '../../src/app/terms/[id]/page';
import ClaimDetail from '../../src/app/docket/[id]/page';
import FileClaim from '../../src/app/claim/[id]/page';
afterEach(()=>cleanup());
async function mount(Component:typeof TermsPage){const params=Promise.resolve({id:'a'.repeat(64)});await act(async()=>{render(<Suspense><Component params={params}/></Suspense>);await params;});}
it('stops offering version129 and explains the exhausted lifetime limit',async()=>{
 m.version=128;await mount(TermsPage);expect(screen.getByRole('heading',{name:'All 128 terms versions have been published.'})).toBeTruthy();expect(screen.queryByRole('button',{name:'Publish this terms version'})).toBeNull();expect(screen.queryByText(/version 129/)).toBeNull();
});
it('discloses the remaining final update before the limit is reached',async()=>{
 m.version=127;await mount(TermsPage);expect(screen.getByText(/version 128 of 128.*1 more terms updates/)).toBeTruthy();
});
it('requires all six usage-evidence fields from the claimant',async()=>{
 await mount(FileClaim);const fields=screen.getAllByRole('textbox').filter(e=>e.tagName==='TEXTAREA');expect(fields).toHaveLength(6);for(const field of fields)expect((field as HTMLTextAreaElement).required).toBe(true);expect(screen.getByText(/Unsupported or disputed material facts/)).toBeTruthy();
});
it('labels insufficient evidence separately from permission and shows factual reasoning',async()=>{
 m.claim={claim_id:'a'.repeat(64),work_id:'b'.repeat(64),claimant:'0x'+'1'.repeat(40),respondent:'0x'+'2'.repeat(40),status:'RULED',used_at:1000,filed_at:1000,bond_atto:'100',settle_after:3000,appeals:[],ruling:{decision:'INSUFFICIENT_EVIDENCE',reason:'Neither party established the external commercial context.',damages_reason:'No damages without an established prohibited use.',facts:{reproduction:'COPYING',commercial_activity:'UNRESOLVED'},evidence_refs:['CLAIMANT','RESPONDENT'],distance_ppm:0,clause:'C1',terms_version:1,terms_basis:'USE_TERMS',damages_band:'NONE'}};
 await mount(ClaimDetail);expect(screen.getByRole('heading',{level:1}).textContent).toBe('Insufficient evidence.');expect(screen.getByText('No damages without an established prohibited use.')).toBeTruthy();expect(screen.getByText(/Finalized chain record.*Case still open/)).toBeTruthy();expect(screen.getByText('Facts established by the panel')).toBeTruthy();
});
it('provides review grounds and opposing-response controls before a hearing',async()=>{
 m.claim={...m.claim,status:'REVIEW_PENDING',hearing_deadline:5000,appeals:[{appealer:'0x'+'2'.repeat(40),bond_atto:'200',grounds:'The commercial evidence is missing.',additional_evidence:'A product excerpt.',response_deadline:3000,response_at:0,previous_ruling:m.claim.ruling}]};
 await mount(ClaimDetail);expect(screen.getByRole('textbox',{name:'Answer the review grounds and evidence'})).toBeTruthy();expect((screen.getByRole('button',{name:'Request the fresh hearing'}) as HTMLButtonElement).disabled).toBe(true);expect(screen.getByText('The commercial evidence is missing.')).toBeTruthy();
});
