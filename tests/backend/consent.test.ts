import {beforeEach,it,expect,vi} from 'vitest';
import {consentSeal,verifyConsent} from '../../src/lib/consent';
beforeEach(()=>vi.stubEnv('ACCOUNT_DERIVATION_SECRET','b'.repeat(64)));
it('survives database object key ordering without changing consent',()=>{const a={subject:'owner',args:[{price:'100',version:1}],destination:'desk'};expect(()=>verifyConsent({destination:'desk',args:[{version:1,price:'100'}],subject:'owner'},consentSeal(a))).not.toThrow();});
it('binds the account, destination, amount and immutable action arguments',()=>{const a={subject:'owner',fund_atto:'100',action_args:['work',1,'100'],contract_address:'desk'};for(const changed of [{...a,subject:'other'},{...a,fund_atto:'1000'},{...a,action_args:['work',2,'100']},{...a,contract_address:'court'}])expect(()=>verifyConsent(changed,consentSeal(a))).toThrow('No new transaction');});
